// 060-codebase-cleanup-audit (Finding 4) — deliberately REVISITING
// 013-zonemap-panel's own original decision (research.md §6/§8) to keep
// tableLogic.ts's cellColor() and zonemapColor.ts's tokenDerivedColor()
// as two independently-maintained copies of the identical token-derived,
// capped color-mix() sequential/diverging formula (plus the identical
// "no data"/"not computable" sentinel color string) — a deliberate
// duplication at the time ("two independent panel types each owning
// their own color convention, not a shared library either has a reason
// to factor out yet"). See specs/013-zonemap-panel/research.md's own
// addendum for the full record of why that original call is being
// revisited now (a direct, deliberate user decision this session), not
// silently reversed. Both call sites' own existing tests
// (tableLogic.test.ts/zonemapColor.test.ts) already prove this extraction
// produces byte-for-byte identical output to the two prior independent
// copies — nothing about either panel type's rendered color changes.

// Capped so text stays legible at every point on the scale — a
// color-mix() blend toward --muted, the same technique tokens.css
// already uses for its own dark-mode shadow tinting, at up to this
// maximum strength rather than 100%.
const MAX_COLOR_STRENGTH = 40

/** Clamps to [0,1], treating NaN as 0 (an out-of-domain or degenerate
 * span never produces a color-mix() percentage outside this range). */
export function clamp01(t: number): number {
  if (Number.isNaN(t)) return 0
  return Math.min(1, Math.max(0, t))
}

// Distinct from every color tokenDerivedColor() itself can ever produce
// (including its own sequential-minimum/diverging-zero colors) — a
// missing/undefined value must read as visibly different from "the
// lowest real value on the scale," never a same-looking color-mix()
// string with 0% strength.
export const NO_DATA_COLOR = 'color-mix(in srgb, var(--muted-foreground) 25%, var(--muted))'

/**
 * The token-derived, MAX_COLOR_STRENGTH-capped color-mix() string for a
 * definite (non-null) numeric value on a sequential/diverging scale.
 * Diverging scales anchor their midpoint at literal 0, not the domain's
 * geometric center — verified with an asymmetric domain in both callers'
 * own tests. Values outside the domain clamp to the nearest extreme's
 * color (clamp01 above).
 *
 * Token reuse is deliberately caller-scoped, not globally consistent:
 * --primary means "high magnitude" in a sequential scale and "below-zero
 * deviation" in a diverging one — an accepted tradeoff, never actually
 * ambiguous since a reader only ever interprets one column/choropleth
 * against its own scale.
 */
export function tokenDerivedColor(
  value: number,
  colorScale: 'sequential' | 'diverging',
  domain: [number, number],
): string {
  const [domainMin, domainMax] = domain

  if (colorScale === 'sequential') {
    const span = domainMax - domainMin
    const t = span === 0 ? 0 : clamp01((value - domainMin) / span)
    const strength = t * MAX_COLOR_STRENGTH
    return `color-mix(in srgb, var(--primary) ${strength}%, var(--muted))`
  }

  // diverging — midpoint fixed at literal 0, not (domainMin + domainMax) / 2.
  if (value >= 0) {
    const t = domainMax === 0 ? (value > 0 ? 1 : 0) : clamp01(value / domainMax)
    const strength = t * MAX_COLOR_STRENGTH
    return `color-mix(in srgb, var(--destructive) ${strength}%, var(--muted))`
  }
  const t = domainMin === 0 ? (value < 0 ? 1 : 0) : clamp01(value / domainMin)
  const strength = t * MAX_COLOR_STRENGTH
  return `color-mix(in srgb, var(--primary) ${strength}%, var(--muted))`
}
