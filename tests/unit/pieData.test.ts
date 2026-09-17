import { describe, expect, it } from 'vitest'

import { aggregatePieSlices, layoutPieWedges, DEFAULT_DONUT_INNER_RADIUS_RATIO } from '@/panels/pieData'

const CONFIG = { category: 'primary_purpose', value: 'share' }

describe('aggregatePieSlices', () => {
  it('sums duplicate categories', () => {
    const result = aggregatePieSlices(CONFIG, [
      { primary_purpose: 'work', share: 0.3 },
      { primary_purpose: 'shop', share: 0.2 },
      { primary_purpose: 'work', share: 0.1 },
    ])
    expect(result.slices).toEqual([
      { category: 'work', value: 0.4 },
      { category: 'shop', value: 0.2 },
    ])
    expect(result.excludedCount).toBe(0)
  })

  it('excludes a negative value, counting it, without corrupting other slices', () => {
    const result = aggregatePieSlices(CONFIG, [
      { primary_purpose: 'work', share: 0.5 },
      { primary_purpose: 'broken', share: -0.2 },
    ])
    expect(result.slices).toEqual([{ category: 'work', value: 0.5 }])
    expect(result.excludedCount).toBe(1)
  })

  it('excludes a non-finite value', () => {
    const result = aggregatePieSlices(CONFIG, [{ primary_purpose: 'work', share: Number.NaN }])
    expect(result.slices).toEqual([])
    expect(result.excludedCount).toBe(1)
  })

  it('keeps a genuine zero-value category as a real slice — never dropped (FR-013)', () => {
    const result = aggregatePieSlices(CONFIG, [
      { primary_purpose: 'work', share: 0.8 },
      { primary_purpose: 'empty_purpose', share: 0 },
    ])
    expect(result.slices).toEqual([
      { category: 'work', value: 0.8 },
      { category: 'empty_purpose', value: 0 },
    ])
    expect(result.excludedCount).toBe(0)
  })
})

describe('layoutPieWedges', () => {
  it('wedge angles sum to a full circle for a known input', () => {
    const wedges = layoutPieWedges(
      [
        { category: 'a', value: 1 },
        { category: 'b', value: 1 },
        { category: 'c', value: 2 },
      ],
      100,
    )
    expect(wedges).toHaveLength(3)
    for (const wedge of wedges) {
      expect(wedge.path.length).toBeGreaterThan(0)
    }
  })

  it('computes a correct percentage relative to the total', () => {
    const wedges = layoutPieWedges(
      [
        { category: 'a', value: 25 },
        { category: 'b', value: 75 },
      ],
      100,
    )
    const a = wedges.find((w) => w.category === 'a')!
    const b = wedges.find((w) => w.category === 'b')!
    expect(a.percentage).toBeCloseTo(0.25)
    expect(b.percentage).toBeCloseTo(0.75)
  })

  it('produces a valid, non-crashing degenerate arc for a zero-value slice', () => {
    const wedges = layoutPieWedges(
      [
        { category: 'a', value: 10 },
        { category: 'empty_purpose', value: 0 },
      ],
      100,
    )
    const zeroSlice = wedges.find((w) => w.category === 'empty_purpose')!
    expect(zeroSlice).toBeDefined()
    expect(zeroSlice.percentage).toBe(0)
    expect(typeof zeroSlice.path).toBe('string')
  })

  it('returns percentage 0 for every slice when every value is 0 (no NaN)', () => {
    const wedges = layoutPieWedges(
      [
        { category: 'a', value: 0 },
        { category: 'b', value: 0 },
      ],
      100,
    )
    expect(wedges.every((w) => w.percentage === 0)).toBe(true)
  })

  it('preserves input (first-seen) order, not a descending-by-value sort', () => {
    const wedges = layoutPieWedges(
      [
        { category: 'small', value: 1 },
        { category: 'big', value: 100 },
      ],
      100,
    )
    expect(wedges.map((w) => w.category)).toEqual(['small', 'big'])
  })

  describe('donut mode (innerRadiusRatio)', () => {
    const slices = [
      { category: 'a', value: 1 },
      { category: 'b', value: 1 },
    ]

    it('defaults to a solid pie (innerRadius 0) when no ratio is passed — unchanged from before donut support', () => {
      const solid = layoutPieWedges(slices, 100)
      const explicitZero = layoutPieWedges(slices, 100, 0)
      expect(solid.map((w) => w.path)).toEqual(explicitZero.map((w) => w.path))
    })

    it('produces a real, distinct (non-solid-pie) path when given a positive innerRadiusRatio', () => {
      const solid = layoutPieWedges(slices, 100, 0)
      const donut = layoutPieWedges(slices, 100, DEFAULT_DONUT_INNER_RADIUS_RATIO)
      expect(donut[0].path).not.toBe(solid[0].path)
      // A d3.arc() donut path draws two concentric arcs (outer + inner)
      // joined by straight edges — real evidence the inner radius was
      // actually applied, not just a coincidentally-different string.
      expect(donut[0].path.match(/A/g)?.length).toBe(2)
      expect(solid[0].path.match(/A/g)?.length).toBe(1)
    })

    it('still sums percentages/angles correctly in donut mode — geometry-only change, same aggregation', () => {
      const donut = layoutPieWedges(
        [
          { category: 'a', value: 25 },
          { category: 'b', value: 75 },
        ],
        100,
        DEFAULT_DONUT_INNER_RADIUS_RATIO,
      )
      expect(donut.find((w) => w.category === 'a')!.percentage).toBeCloseTo(0.25)
      expect(donut.find((w) => w.category === 'b')!.percentage).toBeCloseTo(0.75)
    })
  })
})
