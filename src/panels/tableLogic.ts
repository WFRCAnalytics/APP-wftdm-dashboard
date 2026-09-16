// Pure column-resolution/sort/filter/color-scale logic for TablePanel.tsx —
// split out for the same reason 003's plotlyTraces.ts was: independently
// Vitest-testable without a DOM. See specs/005-table-panel/contracts/
// table-logic.md and research.md §3/§4.
import { formatValue } from '@/panels/formatValue'
import { NO_DATA_COLOR, tokenDerivedColor } from '@/panels/colorScale'
import type { TableColumnConfig, TablePanelConfig } from '@/layout/types'

// 068-column-type-indicators — matches gropaul/dash-ui's own real,
// confirmed convention (fetched directly, src/components/relation/
// common/value-icon.tsx): a per-column type glyph read from the query
// result itself, not authored in dashboard-*.yaml. Deliberately narrower
// than dash-ui's own type vocabulary (which also covers List/Struct/Map,
// via apache-arrow's DataType predicates against a live Arrow schema) —
// this app's TablePanel.tsx queries via services/duckdb.ts's query(), not
// queryArrow(), so no Arrow schema is available at all; every real column
// this app's own SQL layer can ever produce is a flat scalar (this
// project's DuckDB queries never return a nested/list/struct value), so
// there is no real List/Struct/Map case to cover. 'date' is deliberately
// NOT one of the cases either — confirmed live (not assumed) that a real
// DuckDB DATE/TIMESTAMP column arrives through query()'s own
// Arrow-row-to-JSON conversion as a plain epoch-millisecond `number`,
// indistinguishable via typeof from a genuine numeric metric — and a
// direct survey of every real column across every published demo metric
// (public/demo-scenarios/activitysim-baseline/summary/*.parquet, via the
// duckdb CLI) found exactly three real column types today: BIGINT (90),
// VARCHAR (43), DOUBLE (40) — zero DATE/TIMESTAMP, zero BOOLEAN. Boolean
// is kept anyway (a real, unambiguous `typeof 'boolean'` needs no
// heuristic, at negligible cost) even though no real content exercises
// it yet; a genuine date-column type is not, since there is no reliable
// signal to build it on without misclassifying real numeric data.
export type ColumnValueType = 'number' | 'string' | 'boolean' | 'unknown'

/**
 * Infers one column's real value type from the already-fetched rows —
 * this app's own established convention (sortRows()'s numeric-vs-locale
 * branch, formatValue()'s `typeof value !== 'number'` guard) already
 * treats "column type" as a value-derived concept, not a schema one;
 * this follows the same pattern rather than introducing a second one.
 * Scans for the first non-null/non-undefined value (real columns in this
 * app are never genuinely mixed-type — one metric, one SQL type per
 * column); an all-null column (e.g. a $baseline diff with no valid rows)
 * has no real type to report and is 'unknown', matching NO_DATA_COLOR's/
 * formatValue()'s own "N/A, not a guess" treatment of the same case.
 * `bigint` is folded into 'number' defensively — 031-all-panel-demo-
 * content's own real, confirmed finding was that a DuckDB `COUNT(*)`
 * result CAN arrive as a JS `bigint` over a different code path
 * (queryArrow()'s raw Arrow row access); query()'s own `.toJSON()`
 * conversion was directly confirmed (live, this session) to already
 * coerce it to a plain `number` for every case tested, but this costs
 * nothing to guard anyway.
 */
export function inferColumnValueType(
  rows: Record<string, unknown>[],
  field: string,
): ColumnValueType {
  for (const row of rows) {
    const value = row[field]
    if (value === null || value === undefined) continue
    const t = typeof value
    if (t === 'number' || t === 'bigint') return 'number'
    if (t === 'string' || t === 'boolean') return t
    return 'unknown'
  }
  return 'unknown'
}

export interface ResolvedColumn {
  field: string
  label: string
  format?: string
  colorScale?: 'sequential' | 'diverging'
  domain?: [number, number]
  valueType: ColumnValueType
}

/**
 * config.columns present -> map 1:1 (label defaults to field).
 * config.columns absent  -> derive one column per key of rows[0], in
 * Object.keys() order (JS's own documented insertion-order guarantee for
 * string keys) — "in the order returned" (FR-004).
 */
export function resolveColumns(
  config: TablePanelConfig,
  rows: Record<string, unknown>[],
): ResolvedColumn[] {
  if (config.columns && config.columns.length > 0) {
    return config.columns.map((column: TableColumnConfig) => ({
      field: column.field,
      label: column.label ?? column.field,
      format: column.format,
      colorScale: column.color_scale,
      domain: column.domain,
      valueType: inferColumnValueType(rows, column.field),
    }))
  }
  const first = rows[0]
  if (!first) return []
  return Object.keys(first).map((field) => ({
    field,
    label: field,
    valueType: inferColumnValueType(rows, field),
  }))
}

/**
 * Case-insensitive substring match against each row's *rendered* value
 * per column (running format through formatValue first — spec.md's
 * Assumption: "search what you can see"). Evaluated against every row
 * passed in — no built-in pagination assumption; TablePanel.tsx applies
 * this to the full fetched `rows` array, before sorting/paginating.
 */
export function filterRows<T extends Record<string, unknown>>(
  rows: T[],
  columns: ResolvedColumn[],
  searchTerm: string,
): T[] {
  const needle = searchTerm.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((row) =>
    columns.some((column) => {
      const raw = row[column.field]
      const rendered = column.format ? formatValue(raw, column.format) : String(raw)
      return rendered.toLowerCase().includes(needle)
    }),
  )
}

/**
 * Numeric comparison when both values are `typeof 'number'`, else
 * locale-aware string comparison (spec.md's Edge Case: a numeric column
 * must not sort lexicographically). Never mutates `rows`.
 */
export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  column: string,
  direction: 'asc' | 'desc',
): T[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[column]
    const bv = b[column]
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * sign
    }
    return String(av).localeCompare(String(bv)) * sign
  })
}

/**
 * Returns a color-mix() CSS color string for a cell's background, or
 * undefined when colorScale/domain aren't both present (or value isn't
 * numeric — a color scale needs a number to place on it). The actual
 * color-mix() formula — diverging scales anchor their midpoint at
 * literal 0, not the domain's geometric center (verified with an
 * asymmetric domain in tableLogic.test.ts, not only the symmetric
 * domains project-docs/GRAMMAR.md happens to show); values outside domain
 * clamp to the nearest extreme's color — lives in panels/colorScale.ts's
 * tokenDerivedColor(), shared with panels/zonemapColor.ts's own
 * choropleth-fill resolution (060-codebase-cleanup-audit, Finding 4 —
 * see that module's own header comment for why this is a deliberately
 * revisited, not silently reversed, decision).
 */
export function cellColor(
  value: unknown,
  colorScale: 'sequential' | 'diverging' | undefined,
  domain: [number, number] | undefined,
): string | undefined {
  // Checked BEFORE the colorScale/domain guard below, deliberately: a
  // null diff_value must read as visibly distinct even on a column with
  // no color_scale configured at all — matching formatValue.ts's own
  // null branch, which likewise applies regardless of format string.
  //
  // 019-baseline-diff-consumption: NO_DATA_COLOR is the same dedicated,
  // visibly-distinct "not computable" color panels/zonemapColor.ts's own
  // choropleth-fill resolution uses for a missing/undefined value (never
  // the scale's zero/minimum color, never silently no color at all) —
  // now the SAME imported constant, not an independently-derived copy.
  if (value === null) return NO_DATA_COLOR
  if (!colorScale || !domain || typeof value !== 'number') return undefined
  return tokenDerivedColor(value, colorScale, domain)
}
