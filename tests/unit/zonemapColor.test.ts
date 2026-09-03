// 013-zonemap-panel, research.md §8/§10: color-scale resolution for the
// choropleth's own fill. Extends TWO existing precedents rather than
// literally reusing either (spec.md Grammar findings #7 — the request
// that triggered this feature pointed at 008-sankey-panel's
// sankeyColor.ts, but that's a categorical named-palette convention;
// the actual matching precedent for zonemap's continuous
// sequential/diverging + domain grammar is 005-table-panel's
// tableLogic.ts cellColor()):
//   - when color_ramp is omitted/unrecognized: tableLogic.ts's exact
//     token-derived, MAX_COLOR_STRENGTH-capped color-mix() formula,
//     diverging midpoint anchored at literal zero (not domain's center)
//   - when color_ramp is a recognized name: sankeyColor.ts's
//     recognized-name-else-undefined shape, resolving to a real
//     d3-scale-chromatic interpolator
import { describe, expect, it } from 'vitest'

import {
  computeAutoDomain,
  resolveNamedColorRamp,
  resolveZoneFillColor,
} from '@/panels/zonemapColor'

describe('resolveNamedColorRamp', () => {
  it('resolves a recognized ramp name to its d3-scale-chromatic interpolator', () => {
    expect(resolveNamedColorRamp('YlOrRd')?.(0)).toBeTypeOf('string')
    expect(resolveNamedColorRamp('RdBu')?.(0)).toBeTypeOf('string')
  })

  it('returns undefined for an omitted or unrecognized name', () => {
    expect(resolveNamedColorRamp(undefined)).toBeUndefined()
    expect(resolveNamedColorRamp('NotARealRamp')).toBeUndefined()
  })
})

describe('computeAutoDomain', () => {
  it('returns [min, max] across non-null values', () => {
    expect(computeAutoDomain([5, -3, 10, 0])).toEqual([-3, 10])
  })

  it('ignores null entries', () => {
    expect(computeAutoDomain([5, null, -3, null, 10])).toEqual([-3, 10])
  })

  it('returns [0, 0] for an empty or all-null input', () => {
    expect(computeAutoDomain([])).toEqual([0, 0])
    expect(computeAutoDomain([null, null])).toEqual([0, 0])
  })
})

describe('resolveZoneFillColor', () => {
  it('value: null returns the dedicated "no data" color, never the scale minimum', () => {
    const noData = resolveZoneFillColor(null, 'sequential', undefined, [0, 10], undefined)
    const atMin = resolveZoneFillColor(0, 'sequential', undefined, [0, 10], undefined)
    expect(noData).not.toBe(atMin)
  })

  it('matches tableLogic.ts cellColor()\'s exact sequential formula when color_ramp is omitted', () => {
    // domain [0, 10], value 5 -> t = 0.5, strength = 0.5 * 40 = 20
    const color = resolveZoneFillColor(5, 'sequential', undefined, [0, 10], undefined)
    expect(color).toBe('color-mix(in srgb, var(--brand-wfrc-blue) 20%, var(--muted))')
  })

  it('matches tableLogic.ts cellColor()\'s exact diverging formula, zero-anchored, when color_ramp is omitted', () => {
    // domain [-10, 30] (013's own fixture domain) — midpoint at literal
    // 0, NOT the domain's geometric center (10).
    const atLiteralZero = resolveZoneFillColor(0, 'diverging', undefined, [-10, 30], undefined)
    expect(atLiteralZero).toBe('color-mix(in srgb, var(--destructive) 0%, var(--muted))')

    // The domain's non-zero geometric center (10) must NOT render as the
    // neutral/zero-strength color — the regression case spec.md's own
    // User Story 3 Acceptance Scenario 2 requires.
    const atGeometricCenter = resolveZoneFillColor(10, 'diverging', undefined, [-10, 30], undefined)
    expect(atGeometricCenter).not.toBe(atLiteralZero)
    // value 10 >= 0: t = 10/30, strength = (10/30)*40
    expect(atGeometricCenter).toBe(
      `color-mix(in srgb, var(--destructive) ${(10 / 30) * 40}%, var(--muted))`,
    )

    const negative = resolveZoneFillColor(-5, 'diverging', undefined, [-10, 30], undefined)
    // value -5 < 0: t = -5/-10 = 0.5, strength = 20
    expect(negative).toBe('color-mix(in srgb, var(--brand-wfrc-blue) 20%, var(--muted))')
  })

  it('clamps out-of-domain values to the nearest extreme, matching tableLogic.ts', () => {
    const belowMin = resolveZoneFillColor(-100, 'sequential', undefined, [0, 10], undefined)
    const atMin = resolveZoneFillColor(0, 'sequential', undefined, [0, 10], undefined)
    expect(belowMin).toBe(atMin)

    const aboveMax = resolveZoneFillColor(1000, 'sequential', undefined, [0, 10], undefined)
    const atMax = resolveZoneFillColor(10, 'sequential', undefined, [0, 10], undefined)
    expect(aboveMax).toBe(atMax)
  })

  it('a recognized color_ramp resolves to a real interpolator output, not the token-derived fallback', () => {
    const withRamp = resolveZoneFillColor(5, 'sequential', 'YlOrRd', [0, 10], undefined)
    const withoutRamp = resolveZoneFillColor(5, 'sequential', undefined, [0, 10], undefined)
    expect(withRamp).not.toBe(withoutRamp)
    expect(withRamp).not.toContain('color-mix')
  })

  it('an unrecognized color_ramp falls back to the token-derived default, same as omitted', () => {
    const unrecognized = resolveZoneFillColor(5, 'sequential', 'NotARealRamp', [0, 10], undefined)
    const omitted = resolveZoneFillColor(5, 'sequential', undefined, [0, 10], undefined)
    expect(unrecognized).toBe(omitted)
  })

  it('steps quantizes the token-derived fallback into that many discrete bands', () => {
    // domain [0, 100], 2 steps -> band 0 covers [0,50), band 1 covers
    // [50,100]. Two values landing in the SAME band must resolve to the
    // exact same color; values in different bands must differ.
    const low1 = resolveZoneFillColor(10, 'sequential', undefined, [0, 100], 2)
    const low2 = resolveZoneFillColor(40, 'sequential', undefined, [0, 100], 2)
    const high = resolveZoneFillColor(90, 'sequential', undefined, [0, 100], 2)
    expect(low1).toBe(low2)
    expect(low1).not.toBe(high)
  })

  it('steps quantizes a recognized color_ramp the same way', () => {
    const low1 = resolveZoneFillColor(10, 'sequential', 'YlOrRd', [0, 100], 2)
    const low2 = resolveZoneFillColor(40, 'sequential', 'YlOrRd', [0, 100], 2)
    const high = resolveZoneFillColor(90, 'sequential', 'YlOrRd', [0, 100], 2)
    expect(low1).toBe(low2)
    expect(low1).not.toBe(high)
  })

  it('omitting steps leaves the scale fully continuous (no quantization)', () => {
    const a = resolveZoneFillColor(10, 'sequential', undefined, [0, 100], undefined)
    const b = resolveZoneFillColor(40, 'sequential', undefined, [0, 100], undefined)
    expect(a).not.toBe(b)
  })
})
