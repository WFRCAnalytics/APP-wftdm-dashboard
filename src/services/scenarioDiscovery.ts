// Registers public/observed/ and public/scenarios/* at startup, and (step 3,
// added by User Story 3) applies ?s= URL params. See
// specs/001-data-state-layer/contracts/scenario-discovery.md.
// 026-activitysim-demo-content: also registers public/demo-scenarios/* —
// the new, git-tracked real-content root, additive alongside (not a
// replacement for) the paths above. See
// specs/026-activitysim-demo-content/contracts/discovery.md.
//
// 056-lazy-tab-scoped-loading: this file no longer eagerly REGISTERS any
// scenario's Parquet files at boot — it fetches and RETAINS each
// scenario's real metric catalog (data-model.md entity 3,
// appState.setAvailableMetrics()) only. A scenario reaches
// status: 'ready'/active: true once its catalog (summary/index.json) is
// confirmed fetchable, not once every file is registered — actual file
// registration is now deferred to services/tabDataLoader.ts#
// ensureRegistered(), called lazily by whichever tab/panel first needs a
// given scenario+metric. services/duckdbLoaderPool.ts (052) and
// services/duckdb.ts#createLoaderInstance() are REMOVED entirely by this
// feature — a real, measured sweep (specs/056-lazy-tab-scoped-loading/
// research.md §4) confirmed the single shared DuckDB-WASM instance is
// faster than the pool at every batch size this app's real tabs produce,
// and this rewrite removes the ~105-file eager-boot event the pool was
// built for in the first place, so nothing calls it anymore either way.
import { loadManifest } from './yamlLoader.ts'
import { manifestFromObject, type ParsedManifest } from '../scenario/manifestReader.ts'
import * as appState from '../state/appState.ts'

const base = import.meta.env.BASE_URL

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetchJSON: ${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * 035-scenario-label-color: a REAL, confirmed, pre-existing gap found
 * while wiring up FR-007 (manifest color as each scenario's real default)
 * — this whole file never read manifest.yaml at all, for ANY of its three
 * registration paths, despite every one of those real directories
 * (public/observed/, public/scenarios/{name}/, public/demo-scenarios/{name}/)
 * genuinely having a manifest.yaml with a real `color` (confirmed directly
 * against tests/fixtures/observed/manifest.yaml and .../good_scenario/
 * manifest.yaml). Only scenario/scenarioManager.ts's own SEPARATE,
 * local-folder-loading path ever read `manifest?.color` into
 * appState.register() — so `Scenario.color` has been populated for local
 * folders only, never for any of the three discovery paths this file
 * owns, since 025-python-postprocessor first introduced the field.
 * services/yamlLoader.ts's own loadManifest() already existed for exactly
 * this (a fetch-based manifest.yaml reader) with zero callers until now.
 * Fail-soft, matching every other registration step in this file — a
 * missing/malformed manifest.yaml yields an empty ParsedManifest, never a
 * thrown error or a blocked registration (color/runDate/notes simply stay
 * undefined, the same as before this fix for every scenario that has no
 * manifest.yaml color at all).
 */
async function fetchScenarioManifest(manifestUrl: string): Promise<Partial<ParsedManifest>> {
  try {
    const { raw } = await loadManifest(manifestUrl)
    if (typeof raw !== 'object' || raw === null) return {}
    return manifestFromObject(raw as Record<string, unknown>)
  } catch {
    return {}
  }
}

/**
 * Fetches `{folderUrl}/index.json` — the real metric catalog for one
 * scenario, known independent of whether any of it is actually loaded
 * yet (056-lazy-tab-scoped-loading, data-model.md entity 3). Cheap: one
 * small JSON request, no registration work at all. Returns bare file
 * stems (e.g. "summary_kpis"), matching `appState.availableMetrics`'s
 * own documented convention.
 */
async function fetchScenarioMetricCatalog(folderUrl: string): Promise<string[]> {
  const filenames = await fetchJSON<string[]>(`${folderUrl}/index.json`)
  return filenames.map((fileName) => fileName.replace(/\.parquet$/, ''))
}

/**
 * Fetches a scenario's real metric catalog and marks it ready/active the
 * moment that catalog is confirmed fetchable — or failed if the fetch
 * itself fails. No Parquet file is ever registered here; that is
 * deferred entirely to services/tabDataLoader.ts#ensureRegistered(),
 * called lazily by whichever tab/panel first references this scenario's
 * data (056-lazy-tab-scoped-loading). This REPLACES the old eager
 * "register every one of a scenario's ~35 files at boot" step — the
 * loader pool that step used to need (services/duckdbLoaderPool.ts, 052)
 * is removed entirely by this feature (research.md §4: a real, measured
 * sweep confirmed it was never faster than the single shared instance at
 * any batch size this app's real tabs produce).
 *
 * 038-all-loaded-scenarios: a scenario participates in the dynamic
 * `$scenario` union iff its own data is genuinely present — redefined
 * here as "its real catalog is confirmed to exist," not "every one of
 * its files is already registered" (the file-count distinction this
 * function's own predecessor cared about no longer applies, since no
 * file is registered at discovery time at all now).
 */
async function registerOneScenario(name: string, folderUrl: string, warnLabel: string): Promise<void> {
  try {
    const metrics = await fetchScenarioMetricCatalog(folderUrl)
    appState.setAvailableMetrics(name, metrics)
    appState.setStatus(name, 'ready')
    appState.setActive(name, true)
  } catch (err) {
    console.warn(`scenarioDiscovery: failed to fetch metric catalog for ${warnLabel} "${name}"`, err)
    appState.setStatus(name, 'failed')
  }
}

async function registerObserved(): Promise<void> {
  const folderUrl = `${base}observed/summary`
  // 035-scenario-label-color: manifest.yaml sits at the scenario ROOT
  // (public/observed/manifest.yaml), one level up from `folderUrl` (its
  // own summary/ subdirectory) — fetched before register() so `color` is
  // present from this scenario's very first appState entry, not applied
  // as a later patch.
  const manifest = await fetchScenarioManifest(`${base}observed/manifest.yaml`)
  // 020-settings-modal: `path` is the real folder URL this scenario's
  // data is fetched from (research.md §5) — already computed above as
  // `folderUrl`.
  appState.register('observed', {
    pinned: true,
    source: 'url',
    path: folderUrl,
    color: manifest.color,
    runDate: manifest.runDate,
    notes: manifest.notes,
  })
  await registerOneScenario('observed', folderUrl, 'observed dataset')
}

/**
 * Shared by `registerPublishedScenarios()`/`registerDemoScenarios()`
 * below (056-lazy-tab-scoped-loading). TWO-PHASE, preserving the real
 * ordering dependency `042-boot-performance-fix` first confirmed:
 * `appState.register()`'s `order: nextOrder++` field and
 * `getBaseline()`'s automatic-default fallback both depend on
 * `register()` calls happening strictly in `names`' own listed
 * (index.json) order — Phase 1 stays sequential to guarantee that.
 * Phase 2 (each scenario's own catalog fetch) is now cheap enough (one
 * small JSON request each, not ~35 Parquet registrations) that
 * parallelizing it is a modest, low-risk win rather than the dominant
 * cost this file used to restructure around — kept concurrent anyway
 * since `registerOneScenario()` for one scenario never reads or depends
 * on another's state, the same safety argument that justified
 * parallelizing the old, much more expensive Phase 2.
 */
async function registerScenarioGroup(
  names: string[],
  folderUrlFor: (name: string) => string,
  manifestUrlFor: (name: string) => string,
  warnLabel: string,
): Promise<void> {
  // Phase 1: establish every scenario's appState entry (and its `order`)
  // synchronously, in listed order.
  const folderUrls = new Map<string, string>()
  for (const name of names) {
    const folderUrl = folderUrlFor(name)
    folderUrls.set(name, folderUrl)
    const manifest = await fetchScenarioManifest(manifestUrlFor(name))
    appState.register(name, {
      source: 'url',
      path: folderUrl,
      color: manifest.color,
      runDate: manifest.runDate,
      notes: manifest.notes,
    })
  }

  // Phase 2: fetch every scenario's own real metric catalog concurrently
  // and mark it ready/active — no file registration happens here at all.
  await Promise.all(names.map((name) => registerOneScenario(name, folderUrls.get(name)!, warnLabel)))
}

async function registerPublishedScenarios(): Promise<void> {
  let names: string[]
  try {
    names = await fetchJSON<string[]>(`${base}scenarios/index.json`)
  } catch {
    // No public/scenarios/index.json at all — nothing published yet. Not a
    // failure of discoverScenarios() as a whole (mirrors loadDashboards()'s
    // empty-index handling in yamlLoader.ts).
    return
  }
  await registerScenarioGroup(
    names,
    (name) => `${base}scenarios/${name}/summary`,
    // 035-scenario-label-color: manifest.yaml sits at
    // `{base}scenarios/{name}/manifest.yaml`, one level up from the
    // scenario's own summary/ folder.
    (name) => `${base}scenarios/${name}/manifest.yaml`,
    'scenario',
  )
}

/**
 * 026-activitysim-demo-content: registers every scenario listed in
 * public/demo-scenarios/index.json — structurally identical to
 * registerPublishedScenarios() above (same fail-soft-per-scenario and
 * fail-soft-on-missing-index.json behavior), pointed at the new,
 * git-tracked demo-scenarios/ content root instead. A deliberate sibling
 * function rather than a parameterized registerPublishedScenarios(), so
 * that function's own existing behavior/tests stay completely untouched
 * (spec.md FR-010).
 */
async function registerDemoScenarios(): Promise<void> {
  let names: string[]
  try {
    names = await fetchJSON<string[]>(`${base}demo-scenarios/index.json`)
  } catch {
    // No public/demo-scenarios/index.json — this feature's content hasn't
    // been generated/published yet. Not a failure of discoverScenarios()
    // as a whole, mirroring registerPublishedScenarios()'s own handling.
    return
  }
  await registerScenarioGroup(
    names,
    (name) => `${base}demo-scenarios/${name}/summary`,
    // 035-scenario-label-color: manifest.yaml sits at
    // `{base}demo-scenarios/{name}/manifest.yaml`, same reasoning as the
    // published-scenario path above.
    (name) => `${base}demo-scenarios/${name}/manifest.yaml`,
    'demo scenario',
  )
}

/**
 * Reads repeated `s` params from the page URL (`?s=observed&s=abm_2026`) and
 * marks each matching, already-registered scenario active. Any value
 * matching nothing is ignored, never thrown. Duplicate values collapse to a
 * single activation (Set semantics).
 */
function applyURLParams(): void {
  const params = new URLSearchParams(location.search)
  const requested = new Set(params.getAll('s'))
  for (const name of requested) {
    if (appState.get(name)) {
      appState.setActive(name, true)
    }
  }
}

/**
 * Run once during boot, after initDuckDB() resolves. Registers observed/
 * and every published scenario (fail-soft per scenario, FR-012), then
 * applies ?s= URL params (FR-011).
 *
 * 042-boot-performance-fix: the three group calls below are DELIBERATELY
 * still sequential (`await` each, not Promise.all) — a real ordering
 * dependency was confirmed here: appState.register()'s `order` field is
 * assigned purely by call sequence, and getBaseline()'s automatic-default
 * fallback resolves to "the earliest-REGISTERED scenario with pinned ===
 * false && status === 'ready'" — both rely on observed registering before
 * any published/demo scenario, and published scenarios registering
 * before demo scenarios, exactly as this app's own documented history
 * records (state/appState.ts's getBaseline() comment). Running all three
 * groups' register() calls concurrently would make that relative order a
 * genuine network-timing race, silently non-deterministic across page
 * loads.
 *
 * 056-lazy-tab-scoped-loading: each group's own Phase 2 now fetches only
 * a small metric-catalog JSON per scenario, not ~35 Parquet
 * registrations each — this whole function completes in roughly the
 * time of a handful of small JSON requests, not the ~2.4-2.6s of
 * serialized Parquet registration `042-boot-performance-fix` originally
 * measured and restructured around.
 */
export async function discoverScenarios(): Promise<void> {
  await registerObserved()
  await registerPublishedScenarios()
  await registerDemoScenarios()
  applyURLParams()
}
