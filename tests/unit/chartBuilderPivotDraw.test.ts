// @vitest-environment jsdom
// 065-chart-builder: what the pivot table draws for its cell colours, bars and trend column.
import { describe, expect, it } from 'vitest'
import { aggregate } from '@/charts/builder/compile'
import { buildPivot, type MeasureInput, type PivotInput } from '@/charts/builder/pivot'
import { renderPivots } from '@/charts/builder/pivotDraw'
import { TABLE_DEFAULTS, type TableOpts } from '@/charts/builder/spec'

const sum: MeasureInput = { label: 'Sum of trips', field: 'trips', agg: 'sum', show: 'value', dec: undefined, pre: '', suf: '' }
const years = ['2020', '2030', '2040', '2050']
// two modes over four years: Car rises, Bus falls
const raw = years.flatMap((year, i) => [{ mode: 'Car', year, trips: 100 + i * 50 }, { mode: 'Bus', year, trips: 80 - i * 10 }])
const draw = (opts: Partial<TableOpts>, rows = raw): HTMLElement => {
  const input: PivotInput = { title: '', rowFields: ['mode'], colFields: ['year'], rowLabels: ['mode'], colLabels: ['year'], measures: [sum], rows, aggregate, sort: 'natural', opts: { ...TABLE_DEFAULTS, ...opts }, exact: String }
  return renderPivots([buildPivot(input)], {})
}
const cells = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('tbody tr')].map((tr) => [...tr.querySelectorAll<HTMLElement>('td.pvt-cell')].filter((td) => !td.classList.contains('pvt-subcol')))

describe('pivot cell colours', () => {
  it('shades against the whole table by default and against each column when asked', () => {
    const tint = (el: HTMLElement) => cells(el).map((r) => r.map((td) => td.style.background))
    const table = tint(draw({ cells: 'shade' }))
    const column = tint(draw({ cells: 'shade', scale: 'column' }))
    // against the table, the smallest value is the palest; against its column every column has a palest and a darkest cell
    expect(new Set(table.flat()).size).toBeGreaterThan(2)
    expect(column[0][0]).not.toBe(column[1][0])
    expect(column[0].every((c, i) => c !== column[1][i])).toBe(true)
  })

  it('draws a bar to the left of zero for a negative value', () => {
    const rows = years.flatMap((year, i) => [{ mode: 'Up', year, trips: 20 + i * 10 }, { mode: 'Down', year, trips: -20 - i * 10 }])
    const [up, down] = cells(draw({ cells: 'bars' }, rows)).map((r) => r[0].style.background)
    expect(down).not.toBe(up)
    // the positive bar starts at the zero line (50%), the negative one ends there
    expect(up).toContain('50%')
    expect(down).toContain('50%')
  })
})

describe('pivot trend column', () => {
  it('adds a small line before the totals when asked, and only with enough columns', () => {
    const off = draw({})
    expect(off.querySelector('.pvt-spark')).toBeNull()
    const on = draw({ spark: true })
    expect(on.querySelectorAll('tbody td.pvt-spark svg path')).toHaveLength(2)
    expect(on.querySelector('thead .pvt-trendhead')?.textContent).toBe('Trend')
    const few = draw({ spark: true }, raw.filter((r) => r.year < '2040'))
    expect(few.querySelector('.pvt-spark')).toBeNull()
  })
})
