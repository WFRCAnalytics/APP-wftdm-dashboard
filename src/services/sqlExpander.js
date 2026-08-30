// Expands summarize.yaml-shaped placeholders into literal SQL text via
// string substitution only — never eval()/Function() (constitution
// Principle III). See specs/001-data-state-layer/contracts/sql-expander.md.

const PLACEHOLDER_RE = /\$(mappings|bins|sql|filters|scenario)\.([A-Za-z0-9_]+)/g

/**
 * @param {string} sqlTemplate
 * @param {{ raw: any }} config a loaded DashboardConfig (see data-model.md)
 * @param {{ get(id: string): any }} filterState
 * @param {string[]} activeScenarios resolved active scenario names (caller
 *   is responsible for including 'observed' if it's active)
 * @returns {string} literal SQL text with every placeholder resolved
 */
export function expand(sqlTemplate, config, filterState, activeScenarios) {
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

  text = text.replace(PLACEHOLDER_RE, (fullMatch, kind, name) => {
    switch (kind) {
      case 'mappings':
        return expandMappings(config, name, fullMatch)
      case 'bins':
        return expandBins(config, name, fullMatch)
      case 'sql':
        return expandSqlFragment(config, name, fullMatch)
      case 'filters':
        return expandFilter(filterState, name, fullMatch)
      case 'scenario':
        return expandScenario(activeScenarios, name)
      default:
        return fullMatch
    }
  })

  return text
}

function missing(reference) {
  throw new Error(`sqlExpander.expand: unresolved placeholder "${reference}"`)
}

function expandMappings(config, name, fullMatch) {
  const mapping = config.raw?.mappings?.[name]
  if (!mapping) missing(`mappings.${name}`)
  return Object.entries(mapping)
    .map(([source, target]) => `WHEN '${source}' THEN '${target}'`)
    .join('\n    ')
}

function expandBins(config, name, fullMatch) {
  const bin = config.raw?.bins?.[name]
  if (!bin) missing(`bins.${name}`)

  switch (bin.type) {
    case 'manual_breaks': {
      const { column, breaks, labels } = bin
      const clauses = []
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
      missing(`bins.${name} (unknown type "${bin.type}")`)
  }
}

function expandSqlFragment(config, name) {
  const fragment = config.raw?.sql_fragments?.[name]
  if (fragment === undefined) missing(`sql.${name}`)
  return fragment
}

function expandFilter(filterState, id) {
  const value = filterState.get(id)
  if (value === undefined) missing(`filters.${id}`)
  // 'all' is handled at the line-removal pass above; a real (non-'all')
  // value substitutes literally — the template supplies any needed quoting.
  return String(value)
}

function expandScenario(activeScenarios, metric) {
  // Intentional, not a defensive placeholder: per contracts/app-state.md,
  // 'observed' is pinned and this slice has no scenarioManager.js yet to
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
