// The one place chart numbers become text, so the same value never reads two ways on one page. Pure; no DOM.
// Minus is always U+2212. A change shows a sign only when its rounded figure is not zero (never "+0.0").

/** Compact count of raw units: 950, 1.2k, 12k, 1.2M, 12M. */
export function compact(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (a >= 1e4) return `${Math.round(v / 1e3)}k`
  if (a >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10)
}

/** A value given in thousands: 812.4 -> "812k", 9810 -> "9.81M". */
export const compactThousands = (thousands: number): string => (thousands >= 1000 ? `${(thousands / 1000).toFixed(2)}M` : `${Math.round(thousands)}k`)

export interface SignedOptions {
  /** Drop trailing zeros ("+3" rather than "+3.0"): axis ticks. */
  trim?: boolean
}

/** A change with its sign: signed(3.24) "+3.2", signed(-0.04) "0.0", signed(-12, 0, "k") "−12k". */
export function signed(v: number, decimals = 1, suffix = '', opts: SignedOptions = {}): string {
  const r = Number(Math.abs(v).toFixed(decimals))
  const sign = r === 0 ? '' : v > 0 ? '+' : '−'
  return `${sign}${opts.trim ? String(r) : r.toFixed(decimals)}${suffix}`
}
