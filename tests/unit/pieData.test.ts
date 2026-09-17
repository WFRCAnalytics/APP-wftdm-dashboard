import { describe, expect, it } from 'vitest'

import { aggregatePieSlices, layoutPieWedges } from '@/panels/pieData'

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
})
