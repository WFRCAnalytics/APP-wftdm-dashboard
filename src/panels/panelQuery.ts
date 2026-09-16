// Turns a panel config into a bare SQL template — $scenario.<metric> and
// $filters.<id> placeholders only, per project-docs/GRAMMAR.md's SQL placeholder
// reference table (panel queries never use $mappings/$bins/$sql — those
// are summarize.yaml-only, already baked into the Parquet by the offline
// post-processor). Does NOT expand placeholders itself — hand the result
// to services/sqlExpander.ts's expand(). See contracts/panel-query.md.
import type { DashboardConfig } from '@/services/yamlLoader'
import type { FilterId, FilterValue } from '@/state/filterState'
import * as filterState from '@/state/filterState'
import * as sqlExpander from '@/services/sqlExpander'
import type { ResolvedColumn } from '@/panels/tableLogic'
import type {
  ComparisonCapablePanelConfig,
  ComparisonDiff,
  DataBoundPanelConfigBase,
  GraphicWalkerPanelConfig,
  ValueBoxSparklineConfig,
} from '@/layout/types'

const FILTERS_REF_RE = /^\$filters\.([A-Za-z0-9_]+)$/
const INPUTS_REF_RE = /^\$inputs\.([A-Za-z0-9_]+)$/

/**
 * True when `placeholder` is an `$inputs.<id>` reference AND that id is
 * declared `type: multiselect` on `config.inputs` (007-observable-plot-panel).
 * A `select`/`range` input, or any `$filters.<id>` reference, always
 * returns false here — their WHERE-clause shape is unchanged (see
 * buildPanelQuery below). `config.inputs` only exists on
 * ObservablePlotPanelConfig, not the shared DataBoundPanelConfigBase — the
 * same `'inputs' in config` narrowing idiom this file already uses for
 * `'column' in config`.
 */
function isMultiselectInputPlaceholder(
  placeholder: string,
  config: DataBoundPanelConfigBase,
): boolean {
  const match = placeholder.match(INPUTS_REF_RE)
  if (!match) return false
  if (!('inputs' in config)) return false
  const inputs = (config as { inputs?: Array<{ id: string; type: string }> }).inputs
  return inputs?.some((input) => input.id === match[1] && input.type === 'multiselect') ?? false
}

/**
 * Normalizes config.filter (either documented shape — project-docs/GRAMMAR.md's
 * common-keys table: "filter: <inline | $ref>") into a list of
 * [column, placeholderString] pairs, ready to become one
 * `AND "<column>" = '<placeholder>'` line each.
 *
 * - undefined -> [] (no WHERE clause)
 * - a string matching ^\$filters\.<id>$ -> [[id, filter]] (today's exact
 *   behavior for valuebox/plotly/table — column assumed equal to id, per
 *   the SQL placeholder reference table's own literal example)
 * - any other string (a literal, non-placeholder value) -> [] (unchanged —
 *   never produces a WHERE clause)
 * - a Record<string, string> -> Object.entries(...) verbatim — the map's
 *   own key is the bound column, independent of whatever id the value's
 *   placeholder references (007-observable-plot-panel, research.md §1;
 *   e.g. `income_category: $inputs.income_filter` binds column
 *   "income_category" against input id "income_filter" — deliberately
 *   different strings)
 *
 * Never inspects *which* placeholder kind (`$filters.`/`$inputs.`) a
 * value is — that dispatch belongs to sqlExpander.ts, not here. This
 * function only decides which columns get bound at all.
 */
function normalizeFilterEntries(
  filter: DataBoundPanelConfigBase['filter'],
): Array<[string, string]> {
  if (!filter) return []
  if (typeof filter === 'string') {
    const match = filter.match(FILTERS_REF_RE)
    return match ? [[match[1], filter]] : []
  }
  return Object.entries(filter)
}

/**
 * Builds a bare SQL template for a panel.
 *
 * config is typed as DataBoundPanelConfigBase, not the full PanelConfig
 * union — this function reads config.metric/scenario/scenarios/filter
 * unconditionally, which only a *data-bound* panel type has
 * (006-markdown-panel, research.md §1). MarkdownPanel.tsx never calls
 * this at all (FR-001/FR-007); the compiler now catches, rather than
 * runtime-`undefined`s, a hypothetical future misuse routing a
 * non-data-bound config through here.
 */
export function buildPanelQuery(
  config: DataBoundPanelConfigBase,
  _filters: Record<FilterId, FilterValue>,
): string {
  const source = config.scenario
    ? `"${config.scenario}__${config.metric}"`
    : `($scenario.${config.metric})`

  // 'column' in config (not config.type === 'valuebox') narrows correctly
  // against the union — a plain-object 'in' check still works against
  // DataBoundPanelConfigBase the same way it did against PanelConfig.
  //
  // 013-zonemap-panel: a real, confirmed bug found via Playwright, not
  // caught by typecheck or any unit test — ZoneMapPanelConfig ALSO has a
  // top-level `column` field (project-docs/GRAMMAR.md's own real grammar names
  // it exactly that, the choropleth's fill column), which this check
  // originally couldn't distinguish from ValueBoxPanelConfig's `column`
  // (a single scalar to display). The single-column SELECT this branch
  // produces is correct for valuebox (which needs nothing else) but
  // silently drops zonemap's own `metric_id` (zone-id join key) column
  // from the result entirely — every zone lookup then misses, rendering
  // every zone as "no data" with no error of any kind (confirmed live:
  // all 8 fixture zones showed no-data instead of 7). ZoneMapPanelConfig
  // uniquely also carries `metric_id` (no other panel type with a
  // `column` field does) — excluding that case restores `SELECT *` for
  // zonemap, unchanged for every other panel type.
  const selectClause = 'column' in config && !('metric_id' in config) ? `SELECT "${config.column}"` : 'SELECT *'

  const entries = normalizeFilterEntries(config.filter)
  if (entries.length === 0) {
    return `${selectClause} FROM ${source}`
  }

  // Each placeholder must sit alone on its own line (project-docs/GRAMMAR.md) for
  // sqlExpander.ts's `all`-sentinel line-omission to work correctly.
  //
  // A multiselect-type $inputs.<id> reference gets an IN (...) shape
  // instead of the usual = '...' equality — "any of the selected values"
  // (spec.md US2) cannot be expressed as a single-value equality
  // comparison. sqlExpander.ts's expandInputs formats a multiselect's
  // array value as a comma-joined, individually-quoted list to fill that
  // unquoted IN (...) slot; every other case (a plain string $inputs.<id>,
  // or any $filters.<id>) keeps today's exact = '<placeholder>' shape —
  // this branch only ever fires for the one new case that needs it.
  return [
    `${selectClause} FROM ${source} t`,
    'WHERE 1=1',
    ...entries.map(([column, placeholder]) =>
      isMultiselectInputPlaceholder(placeholder, config)
        ? `  AND "${column}" IN (${placeholder})`
        : `  AND "${column}" = '${placeholder}'`,
    ),
  ].join('\n')
}

/**
 * Extracts every $filters.<id> referenced by config.filter, in either
 * documented shape. $inputs.<id> entries are deliberately excluded — those
 * are panel-local (007-observable-plot-panel, research.md §3) and must
 * never be subscribed to via useFilterState, which would make them
 * globally visible/reactive in exactly the way that feature's FR-005
 * forbids.
 *
 * Originally sketched as an observable-plot-only helper (only that panel
 * type's grammar ever produces a Record<string,string> filter with more
 * than one entry) — but widening DataBoundPanelConfigBase.filter's type
 * (research.md §1) means every existing data-bound panel's own
 * single-id extraction (previously an inline
 * `config.filter.replace(/^\$filters\./, '')`) no longer typechecks
 * against the widened union either, since `.replace` isn't callable on a
 * Record. Reused here by ValueBoxPanel.tsx/PlotlyPanel.tsx/TablePanel.tsx
 * too, replacing three near-identical inline snippets with one — not
 * scope creep, a direct, necessary consequence of the filter: type
 * widening every data-bound panel type shares.
 */
export function extractGlobalFilterIds(filter: DataBoundPanelConfigBase['filter']): FilterId[] {
  if (!filter) return []
  if (typeof filter === 'string') {
    const match = filter.match(FILTERS_REF_RE)
    return match ? [match[1]] : []
  }
  return Object.values(filter)
    .map((value) => value.match(FILTERS_REF_RE)?.[1])
    .filter((id): id is string => id !== undefined)
}

/**
 * Resolves which scenario names a panel is actually bound to — used both
 * for `buildPanelQuery()`'s own `$scenario.<metric>` placeholder union
 * AND, since `resolveQueryAndPairs()`'s `pairs` field is derived from
 * this same function's return value, for deciding which scenarios'
 * copies of `config.metric` get registered before the query runs.
 *
 * 059-server-side-pagination — a real, confirmed, PRE-EXISTING bug found
 * and fixed here, unrelated to 059's own new code, while getting a real
 * `scenario:`-pinned test panel to load: this function's own original
 * docstring claimed "if config.scenario (singular) is also set,
 * buildPanelQuery already bypasses the placeholder — this function's
 * output is simply never consulted in that case" — true for
 * `buildPanelQuery()`'s own SQL text (it has its own, separate,
 * already-correct `config.scenario` check for the query `source`), but
 * FALSE for `resolveQueryAndPairs()`'s `pairs` field, which this
 * function's return value feeds UNCONDITIONALLY, singular pin or not.
 * A `scenario:`-pinned panel therefore had `ensureRegistered()` try to
 * register that metric under EVERY globally-active scenario, not just
 * the one it's actually pinned to — silently wasteful whenever a real
 * metric happens to exist under every active scenario (true for every
 * real, currently-published dashboard, which is why this was never
 * caught before), but a genuine, real registration FAILURE the moment
 * one doesn't (confirmed live: a real `scenario: activitysim-baseline`
 * panel referencing a metric that exists ONLY under that one scenario
 * threw `ensureRegistered: failed to load
 * activitysim-density-variant__..., activitysim-transit-variant__...` —
 * scenarios the panel's own real query never once referenced). Fixed by
 * checking `config.scenario` FIRST, matching
 * `services/tabDataLoader.ts`'s own sibling `resolveScenarioNames()`
 * helper, which already had this exact check and was never wrong.
 */
export function resolveActiveScenarios(
  config: DataBoundPanelConfigBase,
  globallyActive: string[],
): string[] {
  if (config.scenario) return [config.scenario]
  return config.scenarios ?? globallyActive
}

/**
 * True when `comparison` is the `diff` shape, not `'side_by_side'`/
 * undefined. 019-baseline-diff-consumption: moved here from its previous
 * ZoneMapPanel.tsx-local definition — all four comparison-capable panel
 * types need the identical check now (research.md §5), not just zonemap.
 */
export function isComparisonDiff(
  comparison: 'side_by_side' | ComparisonDiff | undefined,
): comparison is ComparisonDiff {
  return typeof comparison === 'object' && comparison !== null && comparison.type === 'diff'
}

const BASELINE_SENTINEL = '$baseline'

/**
 * Resolves one side of a `comparison: diff` (`diff.a`/`diff.b`):
 * `'$baseline'` (019-baseline-diff-consumption's own sentinel) resolves to
 * `baseline` (the caller's already-read `appState.getBaseline()`/
 * `useBaseline()` value); any other string passes through unchanged —
 * ordinary hardcoded scenario names behave exactly as they did before
 * this feature (013's own original convention, FR-005). Returns
 * `undefined` when the sentinel is used but `baseline` is itself
 * `undefined` (no scenario currently resolves as baseline) — the CALLER
 * checks for this and shows its existing error state BEFORE ever
 * building a query (FR-011), rather than letting a malformed view name
 * reach DuckDB and fail there. Deliberately pure — no direct appState
 * import, matching sqlExpander.ts's own "caller resolves, function stays
 * decoupled" convention (research.md §4).
 */
export function resolveComparisonScenarioName(
  name: string,
  baseline: string | undefined,
): string | undefined {
  return name === BASELINE_SENTINEL ? baseline : name
}

/**
 * Builds the `comparison: diff` SQL — shared by all four comparison-
 * capable panel types as of 019-baseline-diff-consumption (FR-006),
 * generalized from 013-zonemap-panel's own original zonemap-only version
 * (contracts/zonemap-panel.md, research.md §7). Every input this function
 * needs is now a plain parameter, not a config object — `compareOn`
 * generalizes zonemap's own hardcoded `metric_id` (still that panel
 * type's own default when its `compare_on` is omitted, applied by the
 * CALLER, not here) to one or more join/select columns (research.md §2).
 * Produces byte-for-byte identical SQL to the pre-generalization version
 * when `compareOn` is a single-element array matching the old `metric_id`
 * argument — verified in tests/unit/panelQuery.test.ts.
 *
 * `aScenario`/`bScenario` are interpolated as literal view-name prefixes
 * — the SAME zero-validation convention `config.scenario` (singular,
 * above) already uses: no upfront check that either name is "active" or
 * even registered (research.md §7's own correction note — `
 * resolveActiveScenarios()` performs no such validation either). Callers
 * are expected to have already resolved any `'$baseline'` sentinel via
 * `resolveComparisonScenarioName()` above — an unresolvable ordinary name
 * still fails naturally when the query built here actually runs (DuckDB's
 * own "table does not exist" error), caught by the panel's existing query
 * `.catch()` — same PanelErrorState path as any other unresolvable
 * configuration, no new error-handling branch needed for that case.
 *
 * `expr` is copied verbatim into the generated SQL — plain string
 * substitution only, matching `$sql.x`'s own established convention;
 * DuckDB's own SQL engine evaluates the arithmetic. Never `eval()`,
 * never evaluated in JS (constitution Principle III).
 */
export function buildComparisonDiffQuery(
  metric: string,
  aScenario: string,
  bScenario: string,
  compareOn: string[],
  expr: string,
): string {
  const aView = `"${aScenario}__${metric}"`
  const bView = `"${bScenario}__${metric}"`
  const selectCols = compareOn.map((c) => `a."${c}" AS "${c}"`).join(', ')
  const joinCond = compareOn.map((c) => `a."${c}" = b."${c}"`).join(' AND ')
  return [
    `SELECT ${selectCols}, (${expr}) AS diff_value`,
    `FROM ${aView} a`,
    `JOIN ${bView} b ON ${joinCond}`,
  ].join('\n')
}

/**
 * Builds the bare SQL template for a graphic-walker panel's one-time
 * snapshot query (014-graphic-walker-panel, research.md §6,
 * contracts/graphic-walker-panel.md). GraphicWalkerPanelConfig does NOT
 * extend DataBoundPanelConfigBase (data-model.md §1 — its own
 * dataset-binding key is `dataset`, not `metric`), so this is a small,
 * separate builder rather than a buildPanelQuery() branch — but it
 * deliberately emits the SAME `$scenario.<x>` placeholder every other
 * panel type's own template already uses when config.scenario is unset,
 * so the caller can hand the result straight to the existing, UNMODIFIED
 * sqlExpander.expand() — literal reuse of that function's own
 * expandScenario() UNION-ALL construction, not a parallel
 * reimplementation. No $filters./$inputs. placeholder is ever emitted —
 * this panel type has no filter binding at all (spec.md FR-005).
 */
export function buildGraphicWalkerQuery(config: GraphicWalkerPanelConfig): string {
  const source = config.scenario
    ? `"${config.scenario}__${config.dataset}"`
    : `($scenario.${config.dataset})`
  return `SELECT * FROM ${source} LIMIT ${config.limit ?? 100000}`
}

/**
 * Intentionally empty, not a stub — sqlExpander.ts's expand() requires a
 * DashboardConfig argument for its $mappings/$bins/$sql cases, but a
 * panel-built template never contains those placeholder kinds (this
 * module never emits them). Exported from here — the one place that
 * constructs panel SQL templates — so ValueBoxPanel.tsx/PlotlyPanel.tsx
 * import it rather than each defining their own equivalent empty object.
 */
export const EMPTY_SUMMARIZE_CONFIG: DashboardConfig = { raw: {}, sourcePath: '' }

/**
 * 034-metric-panel-redesign — builds the bare SQL template for a
 * value-box panel's optional sparkline mode (data-model.md §5,
 * research.md §2). Delegates to the EXISTING, unmodified
 * buildPanelQuery() with a synthetic DataBoundPanelConfigBase-shaped
 * object — `sparkline.metric` in place of the panel's own scalar
 * `metric`, sharing the SAME filter/scenario/scenarios the panel's own
 * primary value already resolves through (a global filter narrowing the
 * headline number must also narrow what the mini-chart shows). Carries
 * no `column` key, so buildPanelQuery()'s own existing `'column' in
 * config` branch falls through to `SELECT *` — the correct multi-row
 * shape a grouped breakdown needs, with ZERO change to that function.
 */
export function buildSparklineQuery(
  config: Pick<DataBoundPanelConfigBase, 'filter' | 'scenario' | 'scenarios'>,
  sparkline: ValueBoxSparklineConfig,
  filters: Record<FilterId, FilterValue>,
): string {
  return buildPanelQuery(
    {
      // `title` is required by DataBoundPanelConfigBase but never read by
      // buildPanelQuery() itself (confirmed by direct read) — a
      // placeholder value only, not a real title anything renders.
      title: sparkline.metric,
      metric: sparkline.metric,
      filter: config.filter,
      scenario: config.scenario,
      scenarios: config.scenarios,
    },
    filters,
  )
}

/**
 * 034-metric-panel-redesign — builds the bare SQL template for a
 * value-box panel's optional baseline_trend mode (data-model.md §5,
 * research.md §3). A real, deliberate SIBLING to buildComparisonDiffQuery()
 * above, not a modification to it or a call through it — that function's
 * own JOIN-on-compare_on shape has no equivalent for a scalar,
 * single-row-per-scenario metric (a value box's own typical data shape),
 * which has no per-row identity column to join on at all. Reuses the
 * SAME free-form `expr` convention (interpolated verbatim, never eval()'d
 * — constitution Principle III) and the same literal view-name-prefix
 * convention `config.scenario`/buildComparisonDiffQuery() already use —
 * only the JOIN itself differs, replaced by a plain comma cross join,
 * correct here specifically because both `currentScenario`/
 * `baselineScenario` sides are guaranteed exactly one row.
 */
export function buildValueBoxBaselineTrendQuery(
  metric: string,
  column: string,
  currentScenario: string,
  baselineScenario: string,
  expr: string,
): string {
  const aView = `"${currentScenario}__${metric}"`
  const bView = `"${baselineScenario}__${metric}"`
  return [
    `SELECT a."${column}" AS current_value, b."${column}" AS baseline_value, (${expr}) AS diff_value`,
    `FROM ${aView} a, ${bView} b`,
  ].join('\n')
}

export interface ResolvedPanelQuery {
  sql: string
  pairs: { scenario: string; metric: string }[]
}

/**
 * 060-codebase-cleanup-audit (Finding 1): the shared "resolve either a
 * comparison: diff query or an ordinary $scenario query, plus the
 * {scenario, metric} pairs tabDataLoader.ts's ensureRegistered() needs"
 * shape every comparison-capable panel type's own fetch effect
 * (PlotlyPanel.tsx/TablePanel.tsx/ObservablePlotPanel.tsx/
 * RechartsPanel.tsx/ZoneMapPanel.tsx) duplicated inline, verbatim, since
 * 019-baseline-diff-consumption first established it — PlotlyPanel.tsx's
 * own comment used to say so directly ("same ... shape ZoneMapPanel.tsx's
 * own reference migration establishes"), and each later panel type
 * copied the block forward again rather than sharing it.
 *
 * Unlike every other export in this file, this one DOES call
 * sqlExpander.expand() directly — the shared "build template, then expand
 * placeholders" step every caller already performed itself immediately
 * after calling buildPanelQuery()/buildComparisonDiffQuery(), not a new
 * responsibility invented here. This file's own header comment ("Does NOT
 * expand placeholders itself — hand the result to services/sqlExpander.ts's
 * expand()") describes every OTHER export in this file; this one is a
 * deliberate, narrowly-scoped exception for exactly the shape that was
 * duplicated five times over.
 *
 * `compareOn` is the CALLER's own already-resolved compare_on column list
 * — every panel type but ZoneMapPanel defaults to `[]` when
 * config.compare_on is omitted; ZoneMapPanel defaults to
 * `[config.metric_id]` (research.md §1/§3 of 019-baseline-diff-consumption).
 * Passing it in already-resolved keeps each panel type's own default
 * exactly where it already lived, rather than teaching this shared
 * function about ZoneMapPanelConfig's own metric_id field.
 *
 * `inputState` is optional and forwarded verbatim to sqlExpander.expand()'s
 * own optional 5th parameter — only ObservablePlotPanel.tsx ever supplies
 * it (007-observable-plot-panel); every other caller omits it, exactly as
 * each did before this extraction.
 *
 * Returns `{ error: true }` when a '$baseline' sentinel in
 * config.comparison doesn't currently resolve to any scenario
 * (resolveComparisonScenarioName() returning undefined for either side) —
 * the CALLER is responsible for its own setStatus('error')-and-return,
 * exactly as each panel already did inline (FR-011); this function never
 * touches React state itself.
 */
export function resolveQueryAndPairs(
  config: DataBoundPanelConfigBase & ComparisonCapablePanelConfig,
  filters: Record<FilterId, FilterValue>,
  activeScenarioNames: string[],
  baseline: string | undefined,
  compareOn: string[],
  inputState?: sqlExpander.FilterStateLike,
): ResolvedPanelQuery | { error: true } {
  if (isComparisonDiff(config.comparison)) {
    const diff = config.comparison
    const resolvedA = resolveComparisonScenarioName(diff.a, baseline)
    const resolvedB = resolveComparisonScenarioName(diff.b, baseline)
    if (resolvedA === undefined || resolvedB === undefined) {
      return { error: true }
    }
    return {
      sql: buildComparisonDiffQuery(config.metric, resolvedA, resolvedB, compareOn, diff.expr),
      pairs: [
        { scenario: resolvedA, metric: config.metric },
        { scenario: resolvedB, metric: config.metric },
      ],
    }
  }
  const template = buildPanelQuery(config, filters)
  const activeScenarios = resolveActiveScenarios(config, activeScenarioNames)
  const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios, inputState)
  return {
    sql,
    pairs: activeScenarios.map((scenario) => ({ scenario, metric: config.metric })),
  }
}

// 059-server-side-pagination — TablePanel.tsx's own real-scale query
// path. See specs/059-server-side-pagination/{research.md,contracts/
// query-shapes.md} for the full record; every shape below was verified
// live against the real production DuckDB-WASM engine during that
// feature's own Phase 0/1 research before being written here.

/**
 * A real, measured, justified constant (research.md §1) — NOT author-
 * configurable (spec FR-001/FR-010): below this many rows, today's
 * fetch-everything-then-process-in-JS approach costs nothing perceptible
 * (confirmed: ~22–144ms total at 15k/50k/100k rows); at or above it, a
 * query-driven approach is measurably, sometimes dramatically, faster
 * (confirmed: ~40–90ms flat vs. 600ms–6.5s at 500k/2M rows). Every real
 * table-bound metric this app currently ships is under 10,000 rows — this
 * threshold leaves an enormous, deliberate safety margin so nothing real
 * crosses it needlessly.
 */
export const TABLE_QUERY_MODE_THRESHOLD = 100_000

export type TableQueryMode = 'client' | 'query-driven'

/**
 * Pure mode decision (spec FR-001) — a real row count below the
 * threshold stays on today's unmodified browser-handled path; at or
 * above it, TablePanel.tsx switches to the query-driven functions below.
 * Split out as its own one-line function (rather than an inline
 * comparison) so it has a single, direct, boundary-tested home —
 * matching this project's own "pure decision logic gets its own
 * Vitest-testable function" convention (tableLogic.ts's own
 * inferColumnValueType(), sankeyColor.ts, etc.).
 */
export function resolveTableQueryMode(rowCount: number): TableQueryMode {
  return rowCount < TABLE_QUERY_MODE_THRESHOLD ? 'client' : 'query-driven'
}

/**
 * Wraps any already-resolved query (resolveQueryAndPairs()'s own `sql`
 * output, unmodified — comparison-diff or ordinary, research.md §5) to
 * report its real row count — the mode decision input, and (reused
 * directly, no second query) the "Page X of Y"/"Showing X–Y of Z rows"
 * caption's own total once a table is in query-driven mode. Confirmed
 * live to cost 1–4ms at every scale tested (research.md §1) — never a
 * threat to the small-table case's own unchanged responsiveness.
 */
export function buildRowCountQuery(innerSql: string): string {
  // Aliased explicitly — confirmed live that a bare `COUNT(*)` returns an
  // unaliased, awkward-to-reference `count_star()` column name; `cnt` is
  // a stable, predictable key for the caller to read.
  return `SELECT COUNT(*) AS cnt FROM (${innerSql}) t`
}

/**
 * contracts/query-shapes.md §2/§3 — the one query-driven page-request
 * shape, with an optional search predicate. `ROW_NUMBER() OVER (ORDER BY
 * ...)` is a synthetic, query-scoped tie-breaker — confirmed live
 * (research.md §2) to be gap-free/duplicate-free/stable across separate
 * requests even over a genuinely non-unique sort column (every real
 * table-bound metric's own real shape, confirmed by a direct
 * summarize.yaml survey — there is no natural unique row key to rely on
 * instead), and to compose correctly over a `UNION ALL`-shaped inner
 * query ($scenario's own multi-scenario expansion) with no special
 * casing. `searchPredicate`, when supplied, sits INSIDE the same
 * subquery that computes `__rn` — confirmed live that a `WHERE` clause
 * at that nesting level is applied before the window function runs
 * (standard SQL evaluation order), so paginating a search result is
 * automatically, correctly scoped to the filtered set, not the whole
 * table.
 *
 * `sortColumn` is `null` only for the genuinely-no-sort-known-yet case
 * (no `config.sort` AND no viewer click yet AND — the real reason this
 * matters — `config.columns` is unset, so no column name is even
 * knowable before the first real row comes back). Verified live:
 * `ROW_NUMBER() OVER ()` (a fully empty `OVER` clause) is valid SQL,
 * producing the table's own natural/scan-order row numbers — the exact
 * same "no sort configured, no sort clicked" default this app's
 * existing client-mode path already has (`sortState ? sortRows(...) :
 * filtered`, i.e. unsorted, natural order, when `sortState` is `null`).
 * Once a real column name IS known (an author's `config.sort`, a
 * viewer's own header click, or simply because `resolveColumns()` had
 * something to derive from after the very first fetch), the caller
 * always passes it — a real, currently-sorted column never falls back
 * to this branch.
 */
export function buildTableDrivenPageQuery(params: {
  innerSql: string
  sortColumn: string | null
  direction: 'asc' | 'desc'
  page: number
  pageSize: number
  searchPredicate?: string | null
}): string {
  const { innerSql, sortColumn, direction, page, pageSize, searchPredicate } = params
  const dir = direction === 'desc' ? 'DESC' : 'ASC'
  const over = sortColumn ? `ORDER BY "${sortColumn}" ${dir}` : ''
  const whereClause = searchPredicate ? `\n  WHERE (${searchPredicate})` : ''
  return [
    'SELECT * FROM (',
    `  SELECT *, ROW_NUMBER() OVER (${over}) AS __rn`,
    `  FROM (${innerSql}) t${whereClause}`,
    ')',
    `WHERE __rn > ${page * pageSize}`,
    'ORDER BY __rn',
    `LIMIT ${pageSize}`,
  ].join('\n')
}

/**
 * contracts/query-shapes.md §4 — the row-count query for a search
 * result, needed for the "Showing X–Y of Z rows"/"Page X of Y" caption
 * once a search term narrows the table. Re-run only when the search
 * term itself changes (matching TablePanel.tsx's own existing
 * `handleSearchChange`-resets-`currentPage` behavior), never on every
 * page click.
 */
export function buildSearchRowCountQuery(innerSql: string, searchPredicate: string): string {
  return `SELECT COUNT(*) AS cnt FROM (${innerSql}) t WHERE (${searchPredicate})`
}

/**
 * research.md §6 — the standard SQL string-literal escape (doubling an
 * embedded `'`), matching this app's own existing plain-string-
 * templating convention (services/sqlExpander.ts) rather than
 * introducing a parameterized-query code path found nowhere else in
 * this codebase (Constitution Principle III's own "string replacement
 * only" reading). This app has no real external-attacker security
 * boundary to defend here — DuckDB-WASM runs entirely inside the
 * viewer's own browser tab — so this is a correctness fix (a search term
 * containing a literal apostrophe must not break the query), verified
 * live against a real value ("O'Brien").
 */
export function escapeSqlLiteral(term: string): string {
  return term.replace(/'/g, "''")
}

// research.md §3's own confirmed regex — the exact same core-spec shape
// formatValue.ts already parses (post-067's bare/braced-form fix),
// reused here (not re-derived) so both layers agree on what counts as a
// real format spec. Captures: optional leading brace, optional sign
// flag, optional comma flag, required decimal-digit count, required
// kind (f/%), optional trailing brace.
const FORMAT_SPEC_RE = /(\{:)?([+-])?(,)?\.(\d+)(f|%)(\})?/

/**
 * Builds the real SQL expression for "this column's own rendered,
 * on-screen text" (contracts/query-shapes.md §3) — the search predicate
 * must match THIS, not the raw underlying value, to preserve
 * `005-table-panel`'s own original "search what you can see" behavior
 * (research.md §3, verified live: DuckDB's own `format()` scalar
 * function reproduces formatValue.ts's exact format-string vocabulary,
 * including percent's own `*100` step and the `+` sign-forcing flag).
 * A configured `format` string's own literal prefix/suffix text (e.g.
 * a unit suffix) is preserved via SQL string concatenation, mirroring
 * formatValue.ts's own splicing fix exactly — even though no real
 * `table` column uses one today (confirmed directly; only a `valuebox`
 * format string was ever found with one), so this stays correct if one
 * ever does.
 */
function buildRenderedValueExpr(field: string, format: string | undefined): string {
  const quoted = `"${field}"`
  if (!format) return `CAST(${quoted} AS VARCHAR)`
  const match = format.match(FORMAT_SPEC_RE)
  if (!match) return `CAST(${quoted} AS VARCHAR)`
  const [full, , sign, comma, digits, kind] = match
  const prefix = format.slice(0, match.index ?? 0)
  const suffix = format.slice((match.index ?? 0) + full.length) + (kind === '%' ? '%' : '')
  const spec = `{:${sign ?? ''}${comma ?? ''}.${digits}f}`
  const arg = kind === '%' ? `(CAST(${quoted} AS DOUBLE) * 100)` : `CAST(${quoted} AS DOUBLE)`
  const prefixLit = prefix ? `'${escapeSqlLiteral(prefix)}' || ` : ''
  const suffixLit = suffix ? ` || '${escapeSqlLiteral(suffix)}'` : ''
  return `${prefixLit}format('${spec}', ${arg})${suffixLit}`
}

/**
 * contracts/query-shapes.md §3 — one `OR`-joined predicate per visible
 * column, reproducing `tableLogic.ts#filterRows()`'s own "any visible
 * column's rendered value contains the search term" semantics exactly.
 * `columns` MUST already be the caller's `visibleColumns` (067's
 * column-visibility filter), not the full resolved list — a hidden
 * column contributing an invisible match would be a real, confirmed
 * surprise (the same reasoning `filterRows()` itself already applies
 * client-side). An `'unknown'`-typed column (an all-null result) is
 * skipped — it can never contain a real search match. Returns `null`
 * for an empty search term, matching `filterRows()`'s/TablePanel.tsx's
 * own existing `searchTerm ? ... : rows` short-circuit.
 */
export function buildSearchPredicate(columns: ResolvedColumn[], searchTerm: string): string | null {
  if (!searchTerm) return null
  const needle = escapeSqlLiteral(searchTerm)
  const predicates = columns
    .filter((column) => column.valueType !== 'unknown')
    .map((column) => {
      const expr =
        column.valueType === 'string'
          ? `"${column.field}"`
          : buildRenderedValueExpr(column.field, column.format)
      return `${expr} ILIKE '%${needle}%'`
    })
  if (predicates.length === 0) return null
  return predicates.join('\n    OR ')
}
