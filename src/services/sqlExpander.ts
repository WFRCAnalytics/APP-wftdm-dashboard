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

const PLACEHOLDER_RE = /\$(mappings|bins|sql|filters|scenario)\.([A-Za-z0-9_]+)/g

/**
 * @param sqlTemplate literal SQL text containing zero or more placeholders
 * @param config a loaded DashboardConfig (see data-model.md)
 * @param filterState anything with a get(id) method
 * @param activeScenarios resolved active scenario names (caller is
 *   responsible for including 'observed' if it's active)
 * @returns literal SQL text with every placeholder resolved
 */
export function expand(
  sqlTemplate: string,
  config: DashboardConfig,
  filterState: FilterStateLike,
  activeScenarios: string[],
): string {
  // $filters.<id> with an 'all' value: drop the entire line it appears on
  // (per contract — the template is written so this is syntactically valid,
  // e.g. a standalone "AND column = '$filters.x'" line).
  let text = sqlTemplate
    .split('\n')
    .filter((line) => {
      const match = line.match(/\$filters\.([A-Za-z0-9_]+)/)
      if (!match) return true
      const value = filterState.get(match[1])
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
      default:
        return fullMatch
    }
  })

  return text
}

function missing(reference: string): never {
  throw new Error(`sqlExpander.expand: unresolved placeholder "${reference}"`)
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
  // value substitutes literally — the template supplies any needed quoting.
  return String(value)
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
