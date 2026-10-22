import { describe, expect, it } from 'vitest'

import { largestRemainder, waffleCells, waffleLayout, waffleSlot } from '../../src/charts/lib/waffle'
import { RIDGE_MAX_MILES, ridgePoints, ridgeRows, ridgeSeries, showMeanMarkers } from '../../src/charts/lib/ridge'
import { AGE_BANDS, pyramidDifference, pyramidRows, pyramidTick } from '../../src/charts/lib/pyramid'
import { boardingsRows, connector, DUMBBELL, fmtDiff, fmtValue, householdRows, zeroCarShare } from '../../src/charts/lib/dumbbell'
import { formatObservedFooter, parseObservedMeta } from '../../src/charts/lib/observedMeta'

describe('waffle', () => {
  it('largest remainder always sums to exactly 100', () => {
    for (const s of [[27, 46, 21, 5, 1], [33.3, 33.3, 33.4, 0, 0], [20.5, 20.5, 20.5, 20.5, 18], [0.4, 0.4, 0.4, 0.4, 98.4], [19.99, 20.01, 20, 20, 20]]) {
      const c = largestRemainder(s)
      expect(c.reduce((a, b) => a + b, 0)).toBe(100)
      expect(c.every((n) => Number.isInteger(n) && n >= 0)).toBe(true)
    }
  })
  it('gives the extra squares to the largest fractions', () => {
    expect(largestRemainder([40.7, 30.2, 29.1])).toEqual([41, 30, 29])
  })
  it('rescales shares that do not add to 100 and survives empty input', () => {
    expect(largestRemainder([50, 25, 24]).reduce((a, b) => a + b, 0)).toBe(100)
    expect(largestRemainder([0, 0, 0])).toEqual([0, 0, 0])
  })
  it('fills bottom-up in category order', () => {
    const cells = waffleCells([12, 88])
    expect(cells).toHaveLength(100)
    expect(cells.slice(0, 12).every((c) => c === 0)).toBe(true)
    expect(waffleSlot(0)).toEqual({ col: 0, row: 9 })
    expect(waffleSlot(99)).toEqual({ col: 9, row: 0 })
    expect(waffleSlot(10)).toEqual({ col: 0, row: 8 })
  })
  it('shows the legend list only when the body is wider than 380px', () => {
    expect(waffleLayout(380, 400).legend).toBe(false)
    expect(waffleLayout(381, 400).legend).toBe(true)
    const narrow = waffleLayout(300, 400)
    expect(narrow.size).toBe(296)
    expect(narrow.ox).toBe(2)
    expect(waffleLayout(800, 300).size).toBe(292)
  })
})

describe('ridgeline', () => {
  const rows = (counts: number[]) => counts.map((trips, bin) => ({ bin, trips }))
  it('computes mean from bin centres, share under 2 miles and normalised density', () => {
    const counts = new Array(30).fill(0)
    counts[0] = 100
    counts[1] = 100
    counts[9] = 200
    const s = ridgeSeries(rows(counts))
    expect(s.total).toBe(400)
    expect(s.mean).toBeCloseTo((0.5 * 100 + 1.5 * 100 + 9.5 * 200) / 400)
    expect(s.under2).toBe(50)
    expect(s.density.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
  it('handles an empty histogram', () => {
    const s = ridgeSeries([])
    expect(Number.isNaN(s.mean)).toBe(true)
    expect(s.under2).toBe(0)
  })
  it('anchors the curve at 0 and 30 miles', () => {
    const p = ridgePoints(new Array(30).fill(0.01))
    expect(p[0]).toEqual([0, 0])
    expect(p[1][0]).toBe(0.5)
    expect(p[p.length - 1][0]).toBe(RIDGE_MAX_MILES)
    expect(p).toHaveLength(32)
  })
  it('hides mean markers when rows are 46px or shorter', () => {
    expect(showMeanMarkers(46)).toBe(false)
    expect(showMeanMarkers(46.5)).toBe(true)
    const { rowH, base } = ridgeRows(400, 5)
    expect(rowH).toBeCloseTo((400 - 22 - 6) / 5)
    expect(base(4)).toBeCloseTo(6 + rowH * 5 - 2)
  })
})

describe('pyramid', () => {
  const model = [
    { age_band: '5-9', sex: 'Male', persons: 114005 },
    { age_band: '5-9', sex: 'Female', persons: 107597 },
    { age_band: '0-4', sex: 'Male', persons: 105346 },
  ]
  const obs = [
    { age_band: '0-4', sex: 'Male', persons: 109166, moe: 3275 },
    { age_band: '0-4', sex: 'Female', persons: 106577, moe: 3197 },
  ]
  const rows = pyramidRows(model, obs)
  it('has 17 bands x 2 sexes in age order, males negative, in thousands', () => {
    expect(rows).toHaveLength(AGE_BANDS.length * 2)
    expect(rows[0]).toMatchObject({ age: '0-4', sex: 'Male', v: -105.346, o: -109.166 })
    expect(rows[0].moe).toBeCloseTo(3.275)
    expect(rows[1]).toMatchObject({ age: '0-4', sex: 'Female', o: 106.577 })
    expect(rows[2].age).toBe('5-9')
    expect(rows[2].moe).toBeNull()
    expect(rows[rows.length - 1].age).toBe('80+')
    expect(rows[rows.length - 1].v).toBe(0)
  })
  it('formats ticks and differences', () => {
    expect([-100, -50, 0, 50].map(pyramidTick)).toEqual(['100k', '50k', '0k', '50k'])
    expect(pyramidDifference(-105.3, -109.2)).toBe('−4k')
    expect(pyramidDifference(110.4, 106.2)).toBe('+4k')
    expect(pyramidDifference(100.2, 100)).toBe('0k')
  })
})

describe('dumbbell', () => {
  it('builds boardings rows in thousands, observed first order', () => {
    const rows = boardingsRows(
      [{ line: 'Blue', boardings: 38200 }, { line: 'Red', boardings: 21400 }],
      new Map([['a', [{ line: 'Red', boardings: 22800 }, { line: 'Blue', boardings: 36900 }]]]),
    )
    expect(rows.map((r) => r.label)).toEqual(['Blue', 'Red'])
    expect(rows[0]).toEqual({ label: 'Blue', obs: 38.2, v: { a: 36.9 } })
  })
  it('has no observed value when there is no observed table', () => {
    const rows = boardingsRows([], new Map([['a', [{ line: 'Blue', boardings: 1000 }]]]))
    expect(rows[0].obs).toBeNull()
  })
  it('computes the share of households with zero cars per income group', () => {
    const t = [
      { auto_ownership: '0 cars', income_group: 'Under $35k', households: 25 },
      { auto_ownership: '1 car', income_group: 'Under $35k', households: 75 },
      { auto_ownership: '0 cars', income_group: 'Over $125k', households: 1 },
      { auto_ownership: '2 cars', income_group: 'Over $125k', households: 99 },
    ]
    expect(zeroCarShare(t, 'Under $35k')).toBe(25)
    expect(zeroCarShare(t, 'Over $125k')).toBe(1)
    expect(zeroCarShare(t, '$35k to $75k')).toBeNull()
    const rows = householdRows(t, new Map([['a', t]]))
    expect(rows.map((r) => r.label)).toEqual(['Under $35k', '$35k to $75k', '$75k to $125k', 'Over $125k'])
    expect(rows[0]).toMatchObject({ obs: 25, v: { a: 25 } })
    expect(rows[1].v.a).toBe(0)
  })
  it('spans the connector across observed and every run', () => {
    expect(connector({ label: 'x', obs: 5, v: { a: 7, b: 3 } })).toEqual({ a: 3, b: 7 })
    expect(connector({ label: 'x', obs: null, v: { a: 7 } })).toEqual({ a: 7, b: 7 })
  })
  it('formats values and differences from observed', () => {
    expect(fmtValue(12.34, DUMBBELL.hh)).toBe('12.3%')
    expect(fmtValue(36.9, DUMBBELL.boards)).toBe('37k')
    expect(fmtDiff(1.24, DUMBBELL.hh)).toBe('+1.2 pts')
    expect(fmtDiff(-3.4, DUMBBELL.boards)).toBe('−3k')
    expect(fmtDiff(0.01, DUMBBELL.hh)).toBe('0.0 pts')
  })
})

describe('observed footer', () => {
  const manifest = { observed: { source: 'survey', sample: 'n = 1', metrics: { transit_boardings: { source: 'APC', sample: '41,300 boardings' } } } }
  it('prefers the table note, falls back to the run note', () => {
    expect(formatObservedFooter(parseObservedMeta(manifest, 'transit_boardings'))).toBe('Observed: APC, 41,300 boardings')
    expect(formatObservedFooter(parseObservedMeta(manifest, 'other'))).toBe('Observed: survey, n = 1')
    expect(formatObservedFooter(parseObservedMeta({}, 'x'))).toBe('')
  })
})
