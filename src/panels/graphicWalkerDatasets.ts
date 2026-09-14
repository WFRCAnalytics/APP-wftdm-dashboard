// 028-graphic-walker-dataset-picker — pure, DOM-free derivation of the
// dataset names a viewer-facing picker may offer. Split out of
// GraphicWalkerPanel.tsx for the same reason every other pure-logic module
// in this directory is (plotlyTraces.ts, flowmapData.ts, tableLogic.ts,
// graphicWalkerFields.ts, ...) — easy Vitest coverage with no DOM/React
// renderer needed.
//
// See specs/028-graphic-walker-dataset-picker/research.md §2/§3 for the
// original reasoning, and specs/056-lazy-tab-scoped-loading/contracts/
// graphic-walker-dataset-catalog.md for this function's own real,
// confirmed input-source change:
//
// - Under 014/028's original eager-boot design, `services/duckdb.ts`'s
//   `listViews()` (every REGISTERED view) was a safe proxy for "every
//   real dataset a scenario publishes," since eager boot guaranteed
//   every real metric was already registered before any panel rendered.
//   056-lazy-tab-scoped-loading loads metrics on demand per tab, so
//   `listViews()` would shrink to only whatever tabs happen to have been
//   visited so far — a real, confirmed regression against this picker's
//   own whole purpose (research.md §3/§4a). The input is now each active
//   scenario's real metric CATALOG (state/appState.ts's
//   `availableMetrics`, known independent of load state), not the live
//   view registry — no non-metric-view contamination risk to guard
//   against here either (a scenario's own catalog never contains a
//   non-metric entry like `zonemap-geom__*` in the first place, unlike
//   `listViews()`, which mixes every view family together).
// - A dataset is only offered if it exists for EVERY name in
//   `scenarioNames` (intersection, not union) — sqlExpander.ts's existing,
//   unmodified expandScenario() unconditionally UNIONs one clause per
//   active scenario, so a metric missing from even one would make the
//   resulting query fail outright. Filtering here is what makes every
//   listed choice guaranteed to load (FR-005), with zero change to
//   sqlExpander.ts.

/**
 * Every metric name published by EVERY name in `scenarioNames` (set
 * intersection across scenarios' own real catalogs), sorted alphabetically
 * for a deterministic result regardless of Map/Set iteration order
 * (FR-011).
 *
 * @param availableMetricsByScenario scenario name -> that scenario's real
 *   metric catalog (state/appState.ts `Scenario.availableMetrics`) — known
 *   independent of whether any of it has actually loaded yet
 *   (056-lazy-tab-scoped-loading).
 * @param scenarioNames the scenario name(s) to intersect against — either
 *   useActiveScenarios()'s full result, or a single pinned
 *   `[config.scenario]` (research.md §5)
 * @returns bare metric names, sorted alphabetically; `[]` if
 *   `scenarioNames` is empty
 */
export function listSelectableDatasets(
  availableMetricsByScenario: ReadonlyMap<string, readonly string[]>,
  scenarioNames: readonly string[],
): string[] {
  if (scenarioNames.length === 0) return []

  let intersection: Set<string> | undefined
  for (const scenarioName of scenarioNames) {
    const metricsForScenario = new Set(availableMetricsByScenario.get(scenarioName) ?? [])
    intersection =
      intersection === undefined
        ? metricsForScenario
        : new Set([...intersection].filter((m) => metricsForScenario.has(m)))
    // Short-circuit — an empty intersection can never grow back.
    if (intersection.size === 0) break
  }

  return [...(intersection ?? [])].sort((a, b) => a.localeCompare(b))
}

/**
 * Narrows `candidates` (each already known, via listSelectableDatasets, to
 * have a `{scenario}__{metric}` view for every name in `scenarioNames`) to
 * those whose column signature is IDENTICAL across every one of those
 * scenarios.
 *
 * A real, confirmed gap found during this feature's own implementation,
 * not merely anticipated: services/sqlExpander.ts's existing, unmodified
 * expandScenario() UNIONs each active scenario's own `SELECT *`
 * positionally — DuckDB requires every branch of a UNION ALL to have the
 * SAME NUMBER of result columns, confirmed directly (a live
 * `UNION ALL` against two tables with differing column counts throws
 * "Set operations can only apply to expressions with the same number of
 * result columns"). listSelectableDatasets()'s own view-EXISTENCE check
 * cannot catch this — a view can exist for every scenario while its real
 * columns still differ between them. Confirmed reachable in this
 * project's own fixture data: tests/fixtures/generate.py's
 * `vmt_by_home_taz` has 2 columns under `observed`
 * (VMT_BY_HOME_TAZ_OBSERVED_COLUMNS) but 3 under `good_scenario`
 * (VMT_BY_HOME_TAZ_COLUMNS, a deliberate departure documented there for
 * 013-zonemap-panel's own unrelated testing needs) — a metric name that
 * legitimately exists in both, yet would fail the moment a viewer
 * actually selected it from an unpinned (union-mode) picker, exactly the
 * predictable failure FR-005/SC-002 exist to prevent.
 *
 * In real, non-fixture production data this should never trigger — one
 * `summarize.yaml` metric definition is applied identically to every
 * scenario's own raw data by the SAME post-processor run, so a metric's
 * real output schema is the same across scenarios by construction. This
 * check exists anyway, rather than assuming that invariant always holds.
 *
 * When `scenarioNames.length <= 1` (a single pinned scenario — no UNION
 * is ever built for that case, research.md §5), every candidate is
 * already safe and is returned unchanged — no schema comparison needed.
 *
 * @param columnsByScenario  scenarioName -> (metric name -> a
 *   deterministic column-name signature string for that scenario's own
 *   `{scenario}__{metric}` view, e.g. sorted column names joined by a
 *   separator) — the caller is responsible for fetching this (a DuckDB
 *   query), keeping this function itself pure and DOM/DB-free like every
 *   other export in this module.
 */
export function filterSchemaConsistent(
  candidates: readonly string[],
  scenarioNames: readonly string[],
  columnsByScenario: ReadonlyMap<string, ReadonlyMap<string, string>>,
): string[] {
  if (scenarioNames.length <= 1) return [...candidates]
  return candidates.filter((metric) => {
    const signatures = scenarioNames.map((s) => columnsByScenario.get(s)?.get(metric))
    return signatures.every((sig) => sig !== undefined && sig === signatures[0])
  })
}
