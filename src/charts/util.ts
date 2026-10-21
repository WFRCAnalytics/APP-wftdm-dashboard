// Small helpers shared by the chart kinds.
import type { Row } from '@/charts/types'

export const num = (r: Row, column: string): number => Number(r[column])
export const str = (r: Row, column: string): string => String(r[column] ?? '')

export const sum = (values: Iterable<number>): number => {
  let s = 0
  for (const v of values) s += v
  return s
}

export const sgn = (v: number): string => (v > 0.0049 ? '+' : v < -0.0049 ? '−' : '')

/** 12-hour axis label: 0 -> 12a, 15 -> 3p. */
export const hourLabel = (h: number): string => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`

/** 1,234 -> 1.23M for values in thousands. */
export const fmtK = (thousands: number): string => (thousands >= 1000 ? `${(thousands / 1000).toFixed(2)}M` : `${Math.round(thousands)}k`)

export const f1 = (v: number): string => v.toFixed(1)

/** Replaces the chart region's content with a one-line note (no data, nothing to compare). */
export function emptyNote(el: HTMLElement, text: string): void {
  const p = document.createElement('p')
  p.textContent = text
  p.className = 'p-5 font-body text-sm text-[var(--mute)]'
  el.replaceChildren(p)
}

/** Share of `part` in `whole` as a percentage; 0 when whole is 0. */
export const pct = (part: number, whole: number): number => (whole ? (part / whole) * 100 : 0)

/** Rows of one run's table keyed by a column, summing a value column. */
export function sumBy(rows: readonly Row[], key: string, value: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) out.set(str(r, key), (out.get(str(r, key)) ?? 0) + num(r, value))
  return out
}
