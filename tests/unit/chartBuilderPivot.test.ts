// 065-chart-builder: the pivot table behind the text table. Subtotals and totals come from the data's own aggregate (DuckDB grouping
// sets, or the same prefixes aggregated here), shares divide by the right total, and the format is one per measure.
import { describe, expect, it } from 'vitest'
import { aggregate } from '@/charts/builder/compile'
import { buildPivot, numberFormat, type MeasureInput, type PivotInput } from '@/charts/builder/pivot'
import { TABLE_DEFAULTS } from '@/charts/builder/spec'

const sum: MeasureInput = { label: 'Sum of trips', field: 'trips', agg: 'sum', show: 'value', dec: undefined, pre: '', suf: '' }
const raw = [
  { region: 'North', mode: 'Car', purpose: 'Work', trips: 100 }, { region: 'North', mode: 'Car', purpose: 'Work', trips: 50 },
  { region: 'North', mode: 'Car', purpose: 'Shop', trips: 30 }, { region: 'North', mode: 'Bus', purpose: 'Work', trips: 20 },
  { region: 'South', mode: 'Car', purpose: 'Work', trips: 40 }, { region: 'South', mode: 'Walk', purpose: 'Shop', trips: 10 },
]
const base = (over: Partial<PivotInput> = {}): PivotInput => ({
  title: '', rowFields: ['region', 'mode'], colFields: ['purpose'], rowLabels: ['region', 'mode'], colLabels: ['purpose'], measures: [sum], rows: raw, aggregate,
  sort: 'natural', opts: { ...TABLE_DEFAULTS }, exact: String, ...over,
})
const byMode = { rowFields: ['mode'], rowLabels: ['mode'] }

describe('buildPivot from raw rows', () => {
  it('nests row groups and answers every subtotal and total', () => {
    const t = buildPivot(base())
    expect(t.rowTree.map((n) => n.name)).toEqual(['North', 'South'])
    expect(t.rowTree[0].children.map((n) => n.name)).toEqual(['Bus', 'Car'])
    expect(t.colTree.map((n) => n.name)).toEqual(['Shop', 'Work'])
    expect(t.val(0, ['North', 'Car'], ['Work'])).toBe(150) // a cell
    expect(t.val(0, ['North'], ['Work'])).toBe(170) // a group's subtotal
    expect(t.val(0, ['North'], [])).toBe(200) // a group across all columns
    expect(t.val(0, [], ['Shop'])).toBe(40) // a column across all rows
    expect(t.val(0, [], [])).toBe(250) // the grand total
    expect(t.val(0, ['South', 'Bus'], ['Work'])).toBeNull()
  })
  it('nests column groups the same way', () => {
    const t = buildPivot(base({ rowFields: ['region'], rowLabels: ['region'], colFields: ['purpose', 'mode'], colLabels: ['purpose', 'mode'] }))
    expect(t.colTree[1].children.map((n) => n.name)).toEqual(['Bus', 'Car'])
    expect(t.val(0, ['North'], ['Work', 'Car'])).toBe(150)
    expect(t.val(0, ['North'], ['Work'])).toBe(170)
  })
  it('totals a mean over the underlying rows, not as a mean of means', () => {
    const t = buildPivot(base({ ...byMode, measures: [{ ...sum, agg: 'mean' }] }))
    expect(t.val(0, ['Car'], ['Work'])).toBeCloseTo((100 + 50 + 40) / 3)
    expect(t.val(0, ['Car'], [])).toBeCloseTo((100 + 50 + 30 + 40) / 4)
  })
  it('counts rows', () => {
    const t = buildPivot(base({ ...byMode, measures: [{ ...sum, agg: 'count' }] }))
    expect(t.val(0, ['Car'], [])).toBe(4)
    expect(t.val(0, [], [])).toBe(6)
  })
  it('puts several measures side by side', () => {
    const t = buildPivot(base({ ...byMode, measures: [sum, { ...sum, label: 'Max of trips', agg: 'max' }] }))
    expect(t.val(0, ['Car'], [])).toBe(220)
    expect(t.val(1, ['Car'], [])).toBe(100)
  })
  it('shows a share of the row, the column or the table, and only for sums and counts', () => {
    const f = (show: 'row' | 'col' | 'total') => buildPivot(base({ ...byMode, measures: [{ ...sum, show }] }))
    expect(f('row').shown(0, ['Car'], ['Work'])).toBeCloseTo(190 / 220)
    expect(f('col').shown(0, ['Car'], ['Work'])).toBeCloseTo(190 / 210)
    expect(f('total').shown(0, ['Car'], ['Work'])).toBeCloseTo(190 / 250)
    expect(f('row').shown(0, ['Car'], [])).toBe(1)
    const mean = buildPivot(base({ ...byMode, measures: [{ ...sum, agg: 'mean', show: 'row' }] }))
    expect(mean.measures[0].pct).toBe(false)
    expect(mean.shown(0, ['Car'], [])).toBeCloseTo(55)
  })
  it('swaps rows and columns', () => {
    const t = buildPivot(base({ ...byMode, opts: { ...TABLE_DEFAULTS, transpose: true } }))
    expect(t.rowLabels).toEqual(['purpose'])
    expect(t.rowTree.map((n) => n.name)).toEqual(['Shop', 'Work'])
    expect(t.colTree.map((n) => n.name)).toEqual(['Bus', 'Car', 'Walk'])
    expect(t.val(0, ['Work'], ['Car'])).toBe(190)
  })
  it('sorts rows by the first measure total, or reverses them', () => {
    const one = base(byMode)
    expect(buildPivot({ ...one, sort: 'high' }).rowTree.map((n) => n.name)).toEqual(['Car', 'Bus', 'Walk'])
    expect(buildPivot({ ...one, sort: 'low' }).rowTree.map((n) => n.name)).toEqual(['Walk', 'Bus', 'Car'])
    expect(buildPivot({ ...one, sort: 'reverse' }).rowTree.map((n) => n.name)).toEqual(['Walk', 'Car', 'Bus'])
  })
})

describe('buildPivot from DuckDB grouping-set rows', () => {
  // GROUP BY GROUPING SETS: a field a row rolls up is NULL
  const rows = [
    { mode: 'Car', purpose: 'Work', __m0: 150 }, { mode: 'Car', purpose: 'Shop', __m0: 30 }, { mode: 'Bus', purpose: 'Work', __m0: 20 },
    { mode: 'Car', purpose: null, __m0: 180 }, { mode: 'Bus', purpose: null, __m0: 20 },
    { mode: null, purpose: 'Work', __m0: 170 }, { mode: null, purpose: 'Shop', __m0: 30 }, { mode: null, purpose: null, __m0: 200 },
  ]
  it('reads each row as the prefix it keeps, so totals come straight from the database', () => {
    const t = buildPivot(base({ ...byMode, rows }))
    expect(t.val(0, ['Car'], ['Work'])).toBe(150)
    expect(t.val(0, ['Car'], [])).toBe(180)
    expect(t.val(0, [], ['Work'])).toBe(170)
    expect(t.val(0, [], [])).toBe(200)
    expect(t.rowTree.map((n) => n.name)).toEqual(['Bus', 'Car'])
  })
})

describe('measure formats', () => {
  const f = (m: Partial<MeasureInput>, v: number) => buildPivot(base({ ...byMode, measures: [{ ...sum, ...m }] })).measures[0].fmt(v)
  it('adds a prefix and a suffix', () => expect(f({ pre: '$', suf: ' k' }, 1234)).toBe('$1,234 k'))
  it('fixes the decimals when asked', () => expect(f({ dec: 2 }, 1234)).toBe('1,234.00'))
  it('writes a share as a percent with one decimal', () => expect(f({ show: 'total' }, 0.1234)).toBe('12.3%'))
})

describe('numberFormat', () => {
  it('keeps whole numbers whole with thousands separators', () => expect(numberFormat([12480, 3, 900])(12480)).toBe('12,480'))
  it('uses decimals by the size of the largest number, the same for every cell', () => {
    const f = numberFormat([0.052, 0.4])
    expect([f(0.052), f(0.4)]).toEqual(['0.052', '0.400'])
    expect(numberFormat([3.456, 12.1])(3.456)).toBe('3.46')
  })
  it('shortens very large numbers', () => expect(numberFormat([2.5e9, 3])(2.5e9)).toBe('2.5B'))
})
