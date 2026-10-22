/** A round dial maximum with about a quarter of headroom above the largest of `values` (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 times a power of ten); a percent dial never goes past 100. */
export function niceRingMax(values: readonly number[], percent = false): number {
  const top = Math.max(0, ...values.filter((v) => Number.isFinite(v))) * 1.25
  if (top <= 0) return percent ? 100 : 1
  const p = 10 ** Math.floor(Math.log10(top))
  const max = ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((k) => k * p >= top - 1e-9) ?? 10) * p
  return percent ? Math.min(100, max) : max
}
