// Turns a panel config into a bare SQL template — $scenario.<metric> and
// $filters.<id> placeholders only, per project-docs/GRAMMAR.md's SQL placeholder
// reference table (panel queries never use $mappings/$bins/$sql — those
// are summarize.yaml-only, already baked into the Parquet by the offline
// post-processor). Does NOT expand placeholders itself — hand the result
// to services/sqlExpander.ts's expand(). See contracts/panel-query.md.
import type { DashboardConfig } from '@/services/yamlLoader'
import type { FilterId, FilterValue } from '@/state/filterState'
import type {
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
 * Resolves which scenario names a panel's $scenario.<metric> placeholder
 * should union over. config.scenarios (an explicit override list) wins if
 * set; otherwise globallyActive passes through unchanged. If
 * config.scenario (singular) is also set, buildPanelQuery already
 * bypasses the $scenario.x placeholder entirely for that panel — this
 * function's output is simply never consulted in that case.
 */
export function resolveActiveScenarios(
  config: DataBoundPanelConfigBase,
  globallyActive: string[],
): string[] {
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
