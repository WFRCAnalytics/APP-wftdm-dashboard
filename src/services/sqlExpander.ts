// Expands summarize.yaml-shaped placeholders into literal SQL text via
// string substitution only — never eval()/Function() (constitution
// Principle III). See specs/001-data-state-layer/contracts/sql-expander.md.
import type { DashboardConfig } from './yamlLoader.ts'

/** Duck-typed on purpose — decoupled from the concrete filterState module
 * (see contracts/boot-sequence.md); any object with a matching get() works. */
export interface FilterStateLike {
  get(id: string): unknown
}

interface ManualBreaksBin {
  type: 'manual_breaks'
  column: string
  breaks: number[]
  labels: string[]
}

interface QuantilesBin {
  type: 'quantiles'
  column: string
  bins?: number
}

interface SpacedIntervalsBin {
  type: 'spaced_intervals'
  column: string
  interval: number
  lower?: number
}

interface EqualIntervalsBin {
  type: 'equal_intervals'
  column: string
  n?: number
  labels?: string[]
}

type BinConfig = ManualBreaksBin | QuantilesBin | SpacedIntervalsBin | EqualIntervalsBin

interface SummarizeConfigShape {
  mappings?: Record<string, Record<string, string>>
  bins?: Record<string, BinConfig>
  sql_fragments?: Record<string, string>
}

function raw(config: DashboardConfig): SummarizeConfigShape {
  return (config.raw ?? {}) as SummarizeConfigShape
}

const PLACEHOLDER_RE = /\$(mappings|bins|sql|filters|scenario|inputs|baseline)\.([A-Za-z0-9_]+)/g

/**
 * @param sqlTemplate literal SQL text containing zero or more placeholders
 * @param config a loaded DashboardConfig (see data-model.md)
 * @param filterState anything with a get(id) method
 * @param activeScenarios resolved active scenario names (caller is
 *   responsible for including 'observed' if it's active)
 * @param inputState anything with a get(id) method, resolving $inputs.<id>
 *   — panel-local reactive input values (007-observable-plot-panel,
 *   research.md §2). Reuses the same FilterStateLike duck type as
 *   filterState — deliberately a *separate* object, never merged into
 *   filterState itself, so an $inputs.<id> reference can never
 *   accidentally resolve against the global filter store (research.md §2's
 *   rejected alternative). Optional — every existing caller
 *   (ValueBoxPanel/PlotlyPanel/TablePanel) never emits an $inputs.
 *   placeholder and passes nothing here.
 * @param baselineScenario resolves $baseline.<metric> (018-baseline-
 *   scenario-designation) — the caller-resolved result of
 *   appState.getBaseline() at query time (this function stays a pure,
 *   appState-decoupled function, per its own file-header comment — same
 *   caller-resolves-first convention activeScenarios already uses).
 *   Optional, sixth/trailing — every existing caller keeps compiling and
 *   behaving identically unchanged (research.md §5), same evolution shape
 *   inputState itself already established. No panel type supplies this
 *   yet in this feature (FR-011) — proven correct here via direct tests
 *   of expand() itself, not through any real panel/chart.
 * @returns literal SQL text with every placeholder resolved
 */
export function expand(
  sqlTemplate: string,
  config: DashboardConfig,
  filterState: FilterStateLike,
  activeScenarios: string[],
  inputState?: FilterStateLike,
  baselineScenario?: string,
): string {
  // $filters.<id> or $inputs.<id> with an 'all' value: drop the entire line
  // it appears on (per contract — the template is written so this is
  // syntactically valid, e.g. a standalone "AND column = '$filters.x'"
  // line). Extended to $inputs. lines for consistency with $filters.'s own
  // treatment (research.md §2) — no current inputs: grammar declares an
  // all_option, but nothing about the mechanism requires one to.
  let text = sqlTemplate
    .split('\n')
    .filter((line) => {
      const match = line.match(/\$(filters|inputs)\.([A-Za-z0-9_]+)/)
      if (!match) return true
      const [, kind, name] = match
      const value = kind === 'inputs' ? inputState?.get(name) : filterState.get(name)
      return value !== 'all'
    })
    .join('\n')

  text = text.replace(PLACEHOLDER_RE, (fullMatch, kind: string, name: string) => {
    switch (kind) {
      case 'mappings':
        return expandMappings(config, name)
      case 'bins':
        return expandBins(config, name)
      case 'sql':
        return expandSqlFragment(config, name)
      case 'filters':
        return expandFilter(filterState, name)
      case 'scenario':
        return expandScenario(activeScenarios, name)
      case 'inputs':
        return expandInputs(inputState, name)
      case 'baseline':
        return expandBaseline(baselineScenario, name)
      default:
        return fullMatch
    }
  })

  return text
}

function missing(reference: string): never {
  throw new Error(`sqlExpander.expand: unresolved placeholder "${reference}"`)
}

/** SQL's standard single-quote escape — doubling each embedded `'` — so a
 * value containing one (e.g. "Driver's Ed") can't break out of the string
 * literal it's substituted into. A real, if latent, gap in both
 * expandFilter and expandInputs (pre-dates 007-observable-plot-panel;
 * fixed alongside it here since that feature's own tests exercise this
 * exact code path, the natural moment to close both rather than leaving
 * one fixed and one not). Still plain string manipulation, not SQL
 * parsing — Principle III's "string replacement only" holds. */
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

function expandMappings(config: DashboardConfig, name: string): string {
  const mapping = raw(config).mappings?.[name]
  if (!mapping) missing(`mappings.${name}`)
  return Object.entries(mapping)
    .map(([source, target]) => `WHEN '${source}' THEN '${target}'`)
    .join('\n    ')
}

function expandBins(config: DashboardConfig, name: string): string {
  const bin = raw(config).bins?.[name]
  if (!bin) missing(`bins.${name}`)

  switch (bin.type) {
    case 'manual_breaks': {
      const { column, breaks, labels } = bin
      const clauses: string[] = []
      for (let i = 0; i < labels.length - 1; i++) {
        clauses.push(`WHEN "${column}" < ${breaks[i + 1]} THEN '${labels[i]}'`)
      }
      const lastLabel = labels[labels.length - 1]
      return `CASE\n    ${clauses.join('\n    ')}\n    ELSE '${lastLabel}'\n  END`
    }
    case 'quantiles': {
      // Field is `bins` (the quantile count), per docs/GRAMMAR.md's
      // documented syntax (`type: quantiles` / `bins: 5`) — not `n`.
      const { column, bins = 4 } = bin
      return `NTILE(${bins}) OVER (ORDER BY "${column}")`
    }
    case 'spaced_intervals': {
      const { column, interval, lower = 0 } = bin
      return `(FLOOR(("${column}" - ${lower}) / ${interval}) * ${interval} + ${lower})`
    }
    case 'equal_intervals': {
      // Equal-WIDTH buckets computed from the column's actual min/max at
      // query time (data-driven) — distinct from spaced_intervals, whose
      // `interval` is a fixed, config-supplied absolute width known ahead
      // of time. expand() is a pure function with no I/O (Principle III /
      // sql-expander.md's own non-goals), so the min/max computation is
      // pushed into the generated SQL itself (window functions), evaluated
      // by DuckDB when the query runs — not by this function.
      const { column, n = 4, labels } = bin
      const minExpr = `MIN("${column}") OVER ()`
      const maxExpr = `MAX("${column}") OVER ()`
      const bucketExpr =
        `LEAST(${n} - 1, FLOOR((("${column}" - ${minExpr}) / ` +
        `NULLIF(${maxExpr} - ${minExpr}, 0)) * ${n}))`
      if (!labels) return bucketExpr
      const clauses = labels.map((label, i) => `WHEN ${i} THEN '${label}'`).join('\n    ')
      return `CASE ${bucketExpr}\n    ${clauses}\n  END`
    }
    default:
      return missing(`bins.${name} (unknown type "${(bin as BinConfig).type}")`)
  }
}

function expandSqlFragment(config: DashboardConfig, name: string): string {
  const fragment = raw(config).sql_fragments?.[name]
  if (fragment === undefined) missing(`sql.${name}`)
  return fragment
}

function expandFilter(filterState: FilterStateLike, id: string): string {
  const value = filterState.get(id)
  if (value === undefined) missing(`filters.${id}`)
  // 'all' is handled at the line-removal pass above; a real (non-'all')
  // value substitutes literally — the template supplies the surrounding
  // quotes (`= '$filters.x'`), but the value itself still needs its own
  // internal quotes escaped first, or a value like "Driver's Ed" would
  // break out of that literal.
  return escapeSqlString(String(value))
}

function expandInputs(inputState: FilterStateLike | undefined, id: string): string {
  const value = inputState?.get(id)
  if (value === undefined) missing(`inputs.${id}`)
  // 'all' is handled at the line-removal pass above; a real (non-'all')
  // value substitutes literally. Mirrors expandFilter, with one addition:
  // a multiselect input's value is an array (007-observable-plot-panel) —
  // panelQuery.ts's buildPanelQuery emits an unquoted `IN (...)` shape
  // specifically for those, so expandInputs supplies each element's own
  // quotes here (comma-joined, 'SOV','HOV'), not the bare single value the
  // scalar case returns for the template's own `= '...'` quoting.
  if (Array.isArray(value)) {
    return value.map((v) => `'${escapeSqlString(String(v))}'`).join(',')
  }
  return escapeSqlString(String(value))
}

function expandScenario(activeScenarios: string[], metric: string): string {
  // Intentional, not a defensive placeholder: per contracts/app-state.md,
  // 'observed' is pinned and this slice has no scenarioManager.ts yet to
  // let a user deactivate it, so activeScenarios should never legitimately
  // be empty when this runs — hitting this branch means something upstream
  // (most likely discoverScenarios() not having completed yet) is broken,
  // not a normal "nothing selected" UI state. Revisit if/when a future
  // slice ever allows deactivating 'observed' itself. See
  // contracts/sql-expander.md's $scenario.<metric> row.
  if (!activeScenarios || activeScenarios.length === 0) {
    missing(`scenario.${metric} (no active scenarios)`)
  }
  return activeScenarios
    .map((name) => `SELECT *, '${name}' AS scenario FROM "${name}__${metric}"`)
    .join('\n  UNION ALL\n  ')
}

/**
 * 018-baseline-scenario-designation. Unlike expandScenario() above, this
 * resolves to exactly ONE scenario's view reference — a bare, double-
 * quoted "{scenario}__{metric}" table name, not a UNION ALL — matching
 * 013-zonemap-panel's own comparison: diff `a`/`b` expansion shape
 * (panelQuery.ts's buildComparisonDiffQuery(), the nearest existing
 * precedent for "reference one specific named scenario's view directly";
 * research.md §4). $baseline answers "which ONE scenario is baseline right
 * now" (spec FR-008), not "which scenarios are currently active" — a
 * structurally different question from $scenario.x's own.
 */
function expandBaseline(baselineScenario: string | undefined, metric: string): string {
  if (!baselineScenario) missing(`baseline.${metric} (no baseline scenario)`)
  return `"${baselineScenario}__${metric}"`
}
