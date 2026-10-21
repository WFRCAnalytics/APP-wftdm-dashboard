// The Values / Change / % change arithmetic and its formatting (project-docs/redesign/03-state-and-compare.md section
// 5.1). Pure: no React, no stores.
import type { DisplayMode } from '../state/compareState.ts'

const MINUS = '−'

/**
 * `a` is a scenario's value, `r` the reference's value for the same quantity.
 *   val : a            abs : a - r            pct : (a / r - 1) * 100
 * Returns null when there is nothing to show: a missing value, or % change against a zero or missing reference
 * (the item is drawn as "n/a", never as an infinity or a bar).
 */
export function deltaValue(a: number | null | undefined, r: number | null | undefined, mode: DisplayMode): number | null {
  if (a === null || a === undefined || !Number.isFinite(a)) return null
  if (mode === 'val') return a
  if (r === null || r === undefined || !Number.isFinite(r)) return null
  if (mode === 'abs') return a - r
  return r === 0 ? null : (a / r - 1) * 100
}

export interface FormatDeltaOptions {
  /** One decimal by default; trips 2, share 1, VMT 1, boardings 0, trip length 1. */
  decimals?: number
  /** A share metric: Change reads "+1.2 pts" instead of a bare number. */
  share?: boolean
}

/**
 * Sign `+` for positive, U+2212 for negative, none for zero (|v| < 0.005); `%` suffix for % change; ` pts` suffix for
 * a share's Change; "n/a" for null. Values mode formats the plain number.
 */
export function formatDelta(v: number | null, mode: DisplayMode, opts: FormatDeltaOptions = {}): string {
  if (v === null || !Number.isFinite(v)) return 'n/a'
  const decimals = opts.decimals ?? 1
  if (mode === 'val') return v.toFixed(decimals)
  const zero = Math.abs(v) < 0.005
  const sign = zero ? '' : v > 0 ? '+' : MINUS
  const body = (zero ? 0 : Math.abs(v)).toFixed(decimals)
  if (mode === 'pct') return `${sign}${body}%`
  return `${sign}${body}${opts.share ? ' pts' : ''}`
}

/** Metrics stored as fractions (0 to 1) that read as percentage points in Change mode. */
export function isShareColumn(column: string): boolean {
  return column === 'share' || column.endsWith('_share')
}

/**
 * The SQL expression (`a` = reference, `b` = the shown scenario) for a diff query on `column`. Plain string building,
 * evaluated by DuckDB, never in JS. A share's Change is scaled to percentage points.
 */
export function diffExpression(column: string, mode: Exclude<DisplayMode, 'val'>): string {
  const c = `"${column.replace(/"/g, '""')}"`
  if (mode === 'pct') return `(b.${c} - a.${c}) / NULLIF(a.${c}, 0) * 100`
  return isShareColumn(column) ? `(b.${c} - a.${c}) * 100` : `b.${c} - a.${c}`
}
