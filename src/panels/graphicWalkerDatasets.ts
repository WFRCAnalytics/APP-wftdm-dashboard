// 028-graphic-walker-dataset-picker — pure, DOM-free derivation of the
// dataset names a viewer-facing picker may offer. Split out of
// GraphicWalkerPanel.tsx for the same reason every other pure-logic module
// in this directory is (plotlyTraces.ts, flowmapData.ts, tableLogic.ts,
// graphicWalkerFields.ts, ...) — easy Vitest coverage with no DOM/React
// renderer needed.
//
// See specs/028-graphic-walker-dataset-picker/research.md §2/§3 for the
// full reasoning this implements:
//
// - services/duckdb.ts's listViews() is a closed registry — every view it
//   can ever return was created by registerScenario()/registerFileURL(),
//   so the only real contamination risk is a NON-metric view family
//   (confirmed: panels/zoneGeometry.ts's own "zonemap-geom__{boundaries}"
//   views). A view only counts as a selectable dataset if its name starts
//   with one of `scenarioNames` followed by "__" — "zonemap-geom" can
//   never itself be a registered scenario name, so this excludes that
//   family by construction, with no guessed regex.
// - A dataset is only offered if it exists for EVERY name in
//   `scenarioNames` (intersection, not union) — sqlExpander.ts's existing,
//   unmodified expandScenario() unconditionally UNIONs one clause per
//   active scenario, so a metric missing from even one would make the
//   resulting query fail outright. Filtering here is what makes every
//   listed choice guaranteed to load (FR-005), with zero change to
//   sqlExpander.ts.

/**
 * Every metric name backed by a real `{scenario}__{metric}` view for
 * EVERY name in `scenarioNames` (set intersection across scenarios' own
 * metric-name sets), sorted alphabetically for a deterministic result
 * regardless of `viewNames`'/`Set` iteration order (FR-011).
 *
 * @param viewNames services/duckdb.ts's listViews() output (or an
 *   equivalent snapshot of it)
 * @param scenarioNames the scenario name(s) to intersect against — either
 *   useActiveScenarios()'s full result, or a single pinned
 *   `[config.scenario]` (research.md §5)
 * @returns bare metric names, sorted alphabetically; `[]` if
 *   `scenarioNames` is empty
 */
export function listSelectableDatasets(
  viewNames: readonly string[],
  scenarioNames: readonly string[],
): string[] {
  if (scenarioNames.length === 0) return []

  let intersection: Set<string> | undefined
  for (const scenarioName of scenarioNames) {
    const prefix = `${scenarioName}__`
    const metricsForScenario = new Set(
      viewNames.filter((v) => v.startsWith(prefix)).map((v) => v.slice(prefix.length)),
    )
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
