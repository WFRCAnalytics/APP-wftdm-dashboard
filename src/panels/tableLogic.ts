// Pure column-resolution/sort/filter/color-scale logic for TablePanel.tsx —
// split out for the same reason 003's plotlyTraces.ts was: independently
// Vitest-testable without a DOM. See specs/005-table-panel/contracts/
// table-logic.md and research.md §3/§4.
import { formatValue } from '@/panels/formatValue'
import type { TableColumnConfig, TablePanelConfig } from '@/layout/types'

export interface ResolvedColumn {
  field: string
  label: string
  format?: string
  colorScale?: 'sequential' | 'diverging'
  domain?: [number, number]
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
    }))
  }
  const first = rows[0]
  if (!first) return []
  return Object.keys(first).map((field) => ({ field, label: field }))
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

// Capped so text stays legible at every point on the scale — a
// color-mix() blend toward --muted, the same technique tokens.css
// already uses for its own dark-mode shadow tinting, at up to this
// maximum strength rather than 100% (research.md §4).
const MAX_COLOR_STRENGTH = 40

function clamp01(t: number): number {
  if (Number.isNaN(t)) return 0
  return Math.min(1, Math.max(0, t))
}

/**
 * Returns a color-mix() CSS color string for a cell's background, or
 * undefined when colorScale/domain aren't both present (or value isn't
 * numeric — a color scale needs a number to place on it). Diverging
 * scales anchor their midpoint at literal 0, not the domain's geometric
 * center (research.md §4) — verified with an asymmetric domain in
 * tableLogic.test.ts, not only the symmetric domains docs/GRAMMAR.md
 * happens to show. Values outside domain clamp to the nearest extreme's
 * color (clamp01 below).
 *
 * Token reuse is deliberately column-scoped, not globally consistent:
 * --primary means "high magnitude" in a sequential column and
 * "below-zero deviation" in a diverging column — an accepted tradeoff
 * (research.md §4), never actually ambiguous since a reader only ever
 * interprets one column's cells against that column's own scale.
 * 033-shadcn-default-theme: previously anchored on the now-deleted WFRC
 * blue brand token directly (a real, in-scope brand-name reference,
 * FR-008) — now --primary, which the new default theme resolves to a real black/
 * near-white pair (light mode) or light-gray/dark pair (dark mode),
 * producing a genuine, meaningful sequential ramp in both themes with no
 * special-casing needed.
 */
// 019-baseline-diff-consumption: a dedicated, visibly-distinct color for
// a "not computable" value (e.g. a diff_value whose zero-baseline
// percent-diff formula produced SQL NULL, FR-013/FR-014) — token-driven,
// matching panels/zonemapColor.ts's own established NO_DATA_COLOR
// convention for exactly this situation (a missing/undefined value gets
// its own color, never the scale's zero/minimum color and never silently
// no color at all). Not imported from zonemapColor.ts — that constant is
// module-private by design, and both modules already independently
// derive their own tokens from the same underlying CSS variables
// (research.md §6).
const NOT_COMPUTABLE_COLOR = 'color-mix(in srgb, var(--muted-foreground) 25%, var(--muted))'

export function cellColor(
  value: unknown,
  colorScale: 'sequential' | 'diverging' | undefined,
  domain: [number, number] | undefined,
): string | undefined {
  // Checked BEFORE the colorScale/domain guard below, deliberately: a
  // null diff_value must read as visibly distinct even on a column with
  // no color_scale configured at all — matching formatValue.ts's own
  // null branch, which likewise applies regardless of format string.
  if (value === null) return NOT_COMPUTABLE_COLOR
  if (!colorScale || !domain || typeof value !== 'number') return undefined
  const [domainMin, domainMax] = domain

  if (colorScale === 'sequential') {
    const span = domainMax - domainMin
    const t = span === 0 ? 0 : clamp01((value - domainMin) / span)
    const strength = t * MAX_COLOR_STRENGTH
    return `color-mix(in srgb, var(--primary) ${strength}%, var(--muted))`
  }

  // diverging — midpoint fixed at 0, not (domainMin + domainMax) / 2.
  if (value >= 0) {
    const t = domainMax === 0 ? (value > 0 ? 1 : 0) : clamp01(value / domainMax)
    const strength = t * MAX_COLOR_STRENGTH
    return `color-mix(in srgb, var(--destructive) ${strength}%, var(--muted))`
  }
  const t = domainMin === 0 ? (value < 0 ? 1 : 0) : clamp01(value / domainMin)
  const strength = t * MAX_COLOR_STRENGTH
  return `color-mix(in srgb, var(--primary) ${strength}%, var(--muted))`
}
