// 056-lazy-tab-scoped-loading — the lazy, tab-scoped data-loading
// dispatcher. See specs/056-lazy-tab-scoped-loading/data-model.md
// (entities 1/2/4) and contracts/tab-data-loader.md for the full design
// record this module implements.
//
// computeTabDataRequirement() is a pure function (no I/O) — the
// distinct, deduplicated set of {scenario, metric} pairs a tab's own
// panels actually reference, for whichever scenarios are currently
// active. ensureRegistered() lazily registers exactly those pairs (and
// only those), reusing already-loaded/in-flight work across callers.
//
// Always routes through services/duckdb.ts#registerFileURL() directly
// against the single shared AsyncDuckDB instance — no dispatch, no pool.
// A real, measured sweep (research.md §4: warm- and cold-cache passes,
// real batch sizes 3/6/13/39 files) confirmed the single shared instance
// is faster than services/duckdbLoaderPool.ts's old multi-instance pool
// at every size this app's real tabs produce, by 43-99% — the pool and
// its only caller (services/duckdb.ts#createLoaderInstance()) are
// removed entirely by this feature, not conditionally kept.
import { hasView, registerFileURL } from './duckdb.ts'
import * as appState from '../state/appState.ts'
import { isComparisonDiff, resolveComparisonScenarioName } from '../panels/panelQuery.ts'
import type { DashboardTabConfig, PanelConfig } from '../layout/types.ts'

export interface MetricPair {
  scenario: string
  metric: string
}

function pairKey(pair: MetricPair): string {
  return `${pair.scenario}__${pair.metric}`
}

/**
 * Resolves the scenario name(s) a data-bound panel's own `metric`
 * (or, for graphic-walker, `dataset`) reference is scoped to — mirrors
 * `panelQuery.ts#buildPanelQuery()`'s own `config.scenario`/
 * `config.scenarios`/active-union resolution exactly (data-model.md
 * entity 1), so a pair this function derives always matches the real
 * view name a panel's own query will actually reference.
 */
function resolveScenarioNames(
  config: { scenario?: string; scenarios?: string[] },
  activeScenarios: readonly string[],
): string[] {
  if (config.scenario) return [config.scenario]
  if (config.scenarios) return config.scenarios
  return [...activeScenarios]
}

/**
 * Pure — the distinct, deduplicated `{scenario, metric}` pairs one tab's
 * real panels reference, for the given active-scenario set
 * (data-model.md entity 1). Deterministic: same inputs always produce
 * the same pairs, sorted by `{scenario}__{metric}` for stable output.
 * Never validates that a pair actually resolves to a real file —
 * `ensureRegistered()` is where a nonexistent metric/scenario surfaces
 * as a failure, matching `buildPanelQuery()`'s own no-upfront-validation
 * convention.
 */
export function computeTabDataRequirement(
  tab: DashboardTabConfig,
  activeScenarios: readonly string[],
): MetricPair[] {
  const baseline = appState.getBaseline()
  const seen = new Map<string, MetricPair>()

  function add(scenario: string | undefined, metric: string | undefined): void {
    if (!scenario || !metric) return
    const pair = { scenario, metric }
    seen.set(pairKey(pair), pair)
  }

  function addForPanel(config: PanelConfig): void {
    // Markdown and an ordinary (non-picker) graphic-walker's own picker
    // list are handled elsewhere — this function only derives what a
    // panel's OWN configured reference needs, never speculative catalog
    // entries a viewer hasn't picked yet (data-model.md entity 1's
    // dataset_picker note; the Dataset Catalog, entity 3, is a separate
    // concept consulted directly by panels/graphicWalkerDatasets.ts).
    if (config.type === 'markdown') return

    if (config.type === 'graphic-walker') {
      // UnknownPanelConfig's own `type: string` overlaps the literal
      // 'graphic-walker' in the PanelConfig union, so TS can't narrow
      // past this check alone — same structural-typing limitation
      // layout/dashboardRenderer.tsx's withTabDefaultBasemap() already
      // documents and casts past, not a real type-safety gap.
      const gw = config as import('../layout/types.ts').GraphicWalkerPanelConfig
      const names = resolveScenarioNames(gw, activeScenarios)
      for (const scenario of names) add(scenario, gw.dataset)
      return
    }

    if (!('metric' in config)) return
    const dataBound = config as unknown as {
      metric: string
      scenario?: string
      scenarios?: string[]
      comparison?: 'side_by_side' | { type: 'diff'; a: string; b: string; expr: string }
      sparkline?: { metric: string }
      baseline_trend?: { expr: string }
    }

    if (isComparisonDiff(dataBound.comparison)) {
      const a = resolveComparisonScenarioName(dataBound.comparison.a, baseline)
      const b = resolveComparisonScenarioName(dataBound.comparison.b, baseline)
      add(a, dataBound.metric)
      add(b, dataBound.metric)
    } else {
      const names = resolveScenarioNames(dataBound, activeScenarios)
      for (const scenario of names) add(scenario, dataBound.metric)
    }

    // valuebox.baseline_trend compares config.scenario ("current",
    // already added above via the normal resolution path since
    // baseline_trend requires config.scenario to be set — research.md
    // §3/panels/ValueBoxPanel.tsx) against the resolved '$baseline'
    // scenario, for the SAME metric — a second pair the normal
    // resolution above never adds on its own.
    if (dataBound.baseline_trend && dataBound.scenario) {
      const resolvedBaseline = resolveComparisonScenarioName('$baseline', baseline)
      add(resolvedBaseline, dataBound.metric)
    }

    // valuebox.sparkline references a second, already-grouped metric,
    // resolved against the same scenario source as the panel's own
    // primary metric (data-model.md entity 1).
    if (dataBound.sparkline) {
      const names = resolveScenarioNames(dataBound, activeScenarios)
      for (const scenario of names) add(scenario, dataBound.sparkline.metric)
    }
  }

  for (const panels of Object.values(tab.layout)) {
    for (const panel of panels) addForPanel(panel)
  }

  return [...seen.values()].sort((x, y) => pairKey(x).localeCompare(pairKey(y)))
}

type LoadState = 'not-requested' | 'loading' | 'loaded' | 'failed'

const loadState = new Map<string, LoadState>()
const inFlight = new Map<string, Promise<void>>()

/** Read-only, synchronous — never triggers a load. */
export function getMetricLoadState(scenario: string, metric: string): LoadState {
  return loadState.get(pairKey({ scenario, metric })) ?? 'not-requested'
}

// A single retry, after a short backoff, for a genuinely transient failure
// (a real dropped connection, a real one-off 5xx from
// registerFileURLViaFullFetch()'s fallback fetch()) — NOT a fix for the
// DuckDB-WASM connection/worker corruption documented on registerFileURL()
// itself (services/duckdb.ts). That failure mode was confirmed, live and
// repeatedly, to NOT be recoverable by retrying at all — same view name,
// a brand-new view name, and a retry after a 5s drain all failed
// identically once triggered. Preventing that failure in the first place
// is registerFileURL()'s own MAX_CONCURRENT_FILE_REGISTRATIONS limiter;
// this retry exists only for whatever ordinary transient errors remain
// once that limiter keeps registrations from ever reaching the corrupting
// concurrency level.
const RETRY_DELAY_MS = 300

async function registerOnePair(pair: MetricPair): Promise<void> {
  const key = pairKey(pair)
  const scenarioEntry = appState.get(pair.scenario)
  if (!scenarioEntry) {
    // Names a scenario never discovered at all (e.g. a config typo) —
    // an immediate, non-retried failure, the same "fail fast, don't
    // block siblings" shape as a genuinely missing metric file
    // (contracts/tab-data-loader.md).
    loadState.set(key, 'failed')
    throw new Error(`tabDataLoader: scenario "${pair.scenario}" was never registered`)
  }
  // A locally-loaded folder scenario (scenario/scenarioManager.ts's own
  // registerScenario(), triggered by "Load Local Scenario") eagerly
  // registers EVERY file it finds in one pass, entirely outside this
  // module's own lazy per-pair tracking — its views already exist in
  // DuckDB the moment the scenario reaches 'ready', before any tab-scoped
  // call ever names one of its pairs. Without this check, registerFileURL()
  // below throws "File already registered" for every such pair (a real,
  // confirmed bug — DuckDB-WASM's own registerFileURL() has no idempotent
  // "already registered, fine" mode), which this module previously had no
  // way to distinguish from a genuine registration failure: it retried
  // once, still failed the same way, and surfaced a real error that broke
  // every unpinned panel referencing that scenario's metrics.
  if (hasView(key)) {
    loadState.set(key, 'loaded')
    return
  }
  loadState.set(key, 'loading')
  const url = `${scenarioEntry.path}/${pair.metric}.parquet`
  try {
    await registerFileURL(key, url)
    loadState.set(key, 'loaded')
  } catch (firstErr) {
    console.warn(`tabDataLoader: registerFileURL('${key}') failed, retrying once`, firstErr)
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    try {
      await registerFileURL(key, url)
      loadState.set(key, 'loaded')
    } catch (err) {
      loadState.set(key, 'failed')
      console.error(`tabDataLoader: registerFileURL('${key}') failed again after retry`, err)
      throw err
    }
  }
}

/**
 * Registers every named pair not already `loaded`, reusing an in-flight
 * promise for a pair another concurrent caller already started
 * (data-model.md entity 4 — safe for both `DashboardRenderer`'s own
 * tab-wide batch call and each individual panel's own narrower call to
 * name overlapping pairs). Resolves once every named pair has reached
 * `loaded` or `failed`; rejects (identifying which pair(s) failed) only
 * if at least one did — a failure in one pair never blocks a sibling
 * pair's own caller. A `failed` pair is retried (once) on the next call
 * that names it, mirroring this app's own established one-retry
 * convention (051-scope-option3-pool-design).
 */
export async function ensureRegistered(pairs: readonly MetricPair[]): Promise<void> {
  const results = await Promise.allSettled(
    pairs.map((pair) => {
      const key = pairKey(pair)
      if (loadState.get(key) === 'loaded') return Promise.resolve()
      const existing = inFlight.get(key)
      if (existing) return existing
      const promise = registerOnePair(pair).finally(() => {
        inFlight.delete(key)
      })
      inFlight.set(key, promise)
      return promise
    }),
  )

  const failed = pairs.filter((_, i) => results[i].status === 'rejected')
  if (failed.length > 0) {
    throw new Error(
      `tabDataLoader.ensureRegistered: failed to load ${failed.map((p) => pairKey(p)).join(', ')}`,
    )
  }
}
