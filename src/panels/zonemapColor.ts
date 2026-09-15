// 013-zonemap-panel, research.md §8/§10: pure, DOM-free color-scale
// resolution for the choropleth's own fill. Extends TWO existing
// precedents rather than literally reusing either (spec.md Grammar
// findings #7 corrected the request that triggered this feature, which
// pointed at 008-sankey-panel's sankeyColor.ts — a categorical
// named-palette convention, structurally unrelated to zonemap's
// continuous sequential/diverging + domain grammar):
//   - when color_ramp is omitted/unrecognized: 005-table-panel's
//     tableLogic.ts cellColor()'s exact token-derived, capped color-mix()
//     formula — since 060-codebase-cleanup-audit (Finding 4), a genuinely
//     SHARED import (panels/colorScale.ts) rather than a verbatim-reused
//     but independently-maintained copy; see that module's own header
//     comment for the full history of this deliberately revisited
//     decision (diverging midpoint anchored at literal zero, not domain's
//     geometric center; out-of-domain values clamp to the nearest
//     extreme)
//   - when color_ramp names a recognized value (e.g. 'YlOrRd', 'RdBu'):
//     sankeyColor.ts's own recognized-name-else-undefined shape, resolved
//     here to a real d3-scale-chromatic interpolator instead
import { interpolateRdBu, interpolateYlOrRd } from 'd3-scale-chromatic'
import { clamp01, NO_DATA_COLOR, tokenDerivedColor } from '@/panels/colorScale'

export type ColorScale = 'sequential' | 'diverging'

// project-docs/GRAMMAR.md's own type: zonemap worked examples name exactly these
// two ramps — a small, deliberately non-exhaustive lookup, same
// discipline sankeyColor.ts's own NAMED_SCHEMES already established
// (research.md §6 of 008-sankey-panel: "no enumerated allow-list beyond
// [the documented example]... a reasonable, low-risk superset").
const NAMED_RAMPS: Record<string, (t: number) => string> = {
  YlOrRd: interpolateYlOrRd,
  RdBu: interpolateRdBu,
}

/** Returns the matching d3-scale-chromatic interpolator for a recognized
 * color_ramp name, or undefined for an omitted/unrecognized one — the
 * caller falls back to the token-derived default in either case,
 * mirroring sankeyColor.ts's resolveNamedColorScheme(). */
export function resolveNamedColorRamp(colorRamp: string | undefined): ((t: number) => string) | undefined {
  if (!colorRamp) return undefined
  return NAMED_RAMPS[colorRamp]
}

/** Auto-computes [min, max] across non-null values (FR-007, used when
 * config.domain is omitted). [0, 0] for an empty/all-null input — the
 * caller then treats every zone as "no data" rather than crashing on a
 * degenerate domain. */
export function computeAutoDomain(values: (number | null)[]): [number, number] {
  const numeric = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (numeric.length === 0) return [0, 0]
  return [Math.min(...numeric), Math.max(...numeric)]
}

// 060-codebase-cleanup-audit (Finding 4): NO_DATA_COLOR, clamp01, and
// tokenDerivedColor() are now imported from panels/colorScale.ts, shared
// verbatim with tableLogic.ts's own cellColor() — see that module's own
// header comment. NO_DATA_COLOR remains distinct from both the
// sequential-minimum and diverging-zero colors tokenDerivedColor() can
// itself produce — a "no data" zone must be visibly different from "the
// lowest real value on the scale," not just a same-looking color-mix()
// string with 0% strength (spec.md Edge Cases: "not the color scale's
// zero/minimum color").

/** Maps `value` onto a recognized ramp's own [0,1] interpolator domain,
 * preserving the SAME zero-anchored-midpoint convention tokenDerivedColor
 * uses for 'diverging' (0.5 = literal zero, not domain's geometric
 * center) rather than the ramp's own natural linear [domainMin,domainMax]
 * mapping, so a named ramp and the token-derived fallback never disagree
 * about what "the midpoint" means for the same domain/value. */
function namedRampT(value: number, colorScale: ColorScale, domain: [number, number]): number {
  const [domainMin, domainMax] = domain
  if (colorScale === 'sequential') {
    const span = domainMax - domainMin
    return span === 0 ? 0 : clamp01((value - domainMin) / span)
  }
  if (value >= 0) {
    const half = domainMax === 0 ? (value > 0 ? 1 : 0) : clamp01(value / domainMax)
    return 0.5 + 0.5 * half
  }
  const half = domainMin === 0 ? (value < 0 ? 1 : 0) : clamp01(value / domainMin)
  return 0.5 - 0.5 * half
}

/** Quantizes a continuous [0,1] position into `steps` discrete bands,
 * returning the CENTER t of whichever band it falls in (research.md
 * §10) — a standard classed-choropleth technique: every value in one
 * band renders the exact same color, not a gradient within the band. */
function quantizeT(t: number, steps: number): number {
  if (steps <= 1) return 0.5
  const band = Math.min(steps - 1, Math.floor(clamp01(t) * steps))
  return (band + 0.5) / steps
}

/**
 * Normalizes `value` onto [0,1] using the SAME zero-anchored convention
 * tokenDerivedColor/namedRampT already use internally to compute color
 * intensity (linear across the domain for 'sequential'; magnitude-away-
 * from-literal-zero for 'diverging') — reused for the 3D toggle's
 * fill-extrusion-height so bar height and fill color always agree about
 * which zones carry the most magnitude, per this feature's own
 * requirement that extrusion height be driven by the same value already
 * driving color. `null` (a "no data" zone, matching resolveZoneFillColor's
 * own NO_DATA_COLOR treatment) returns 0 — a no-data zone gets no bar,
 * not a phantom one.
 */
export function resolveZoneHeightFraction(
  value: number | null,
  colorScale: ColorScale | undefined,
  domain: [number, number],
): number {
  if (value === null) return 0
  const scale: ColorScale = colorScale ?? 'sequential'
  const [domainMin, domainMax] = domain

  if (scale === 'sequential') {
    const span = domainMax - domainMin
    return span === 0 ? 0 : clamp01((value - domainMin) / span)
  }

  // diverging — magnitude away from zero, mirroring tokenDerivedColor's
  // own diverging branch exactly (same domainMax/domainMin halves).
  if (value >= 0) {
    return domainMax === 0 ? (value > 0 ? 1 : 0) : clamp01(value / domainMax)
  }
  return domainMin === 0 ? (value < 0 ? 1 : 0) : clamp01(value / domainMin)
}

/**
 * Resolves one zone's fill color (contracts/zonemap-panel.md). `domain`
 * is REQUIRED — the caller computes the effective domain (config.domain,
 * or computeAutoDomain()'s result per FR-007) before calling this.
 *
 * value === null (no matching metric row) returns the dedicated "no
 * data" color — never the scale's zero/minimum color (spec.md Edge
 * Cases, FR-012).
 */
export function resolveZoneFillColor(
  value: number | null,
  colorScale: ColorScale | undefined,
  colorRamp: string | undefined,
  domain: [number, number],
  steps: number | undefined,
): string {
  if (value === null) return NO_DATA_COLOR
  // No documented default in project-docs/GRAMMAR.md for an entirely omitted
  // color_scale — 'sequential' is this implementation's own reasonable
  // default (a choropleth needs SOME fill; every fixture/worked example
  // sets this key explicitly, so this branch is a defensive default, not
  // a documented, author-facing default value).
  const scale: ColorScale = colorScale ?? 'sequential'

  const ramp = resolveNamedColorRamp(colorRamp)
  if (ramp) {
    const t = namedRampT(value, scale, domain)
    return ramp(steps ? quantizeT(t, steps) : t)
  }

  if (!steps) return tokenDerivedColor(value, scale, domain)

  // Quantized token-derived path: reconstruct the representative value at
  // the matched band's center t, then run it back through
  // tokenDerivedColor so every value in one band produces the identical
  // color-mix() string.
  const [domainMin, domainMax] = domain
  const t = namedRampT(value, scale, domain)
  const bandT = quantizeT(t, steps)
  // Invert namedRampT's own mapping back to a representative `value` for
  // tokenDerivedColor to consume — sequential is a direct lerp;
  // diverging mirrors namedRampT's own 0.5-anchored halves.
  const representativeValue =
    scale === 'sequential'
      ? domainMin + bandT * (domainMax - domainMin)
      : bandT >= 0.5
        ? ((bandT - 0.5) / 0.5) * domainMax
        : -((0.5 - bandT) / 0.5) * domainMin
  return tokenDerivedColor(representativeValue, scale, domain)
}
