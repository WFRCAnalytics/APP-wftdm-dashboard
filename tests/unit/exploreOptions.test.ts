import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildChart, relabel, type ChartModel, type Col, type Row } from '../../src/charts/builder/compile.ts'
import { MARKS, defaultSpec } from '../../src/charts/builder/spec.ts'
import {
  columnLabel, defaultOptions, formatValue, getExploreOptions, resetExploreOptionsForTests, resolveExploreOptions, setExploreOptions, tableAllowed,
} from '../../src/explore/options.ts'
import { maxJoins } from '../../src/explore/sql/queryModel.ts'
import { getExplore, resetExploreForTests, setExplore, undoCharts, updateChart } from '../../src/state/exploreState.ts'
import type { ChartTheme } from '../../src/charts/types.ts'

afterEach(() => { resetExploreOptionsForTests(); resetExploreForTests() })

describe('resolving the panel settings', () => {
  it('gives today\'s behaviour when nothing is set', () => {
    const o = resolveExploreOptions(undefined)
    expect(o).toEqual(defaultOptions())
    expect(o.limits).toEqual({ csvRows: 100_000, pageSize: null, undoSteps: 60, maxJoins: 4, chartRows: 50_000, scatterSample: 5_000, histogramBins: 12, legendSeries: 15, distinctValues: 200, pivotRows: 500 })
    expect(Object.values(o.features).every(Boolean)).toBe(true)
    expect(o.charts.allow).toEqual([...MARKS])
    expect(o.charts.default).toBe('bar')
    expect(o.warnings).toEqual([])
  })

  it('reads limits, features, charts, tables, columns and presets', () => {
    const o = resolveExploreOptions({
      limits: { csv_rows: 500, page_size: 25, undo_steps: 10, max_joins: 2 },
      features: { sql_tab: false, csv: false, copy_sql: false, import_export: false, my_tables: false, undo: false },
      charts: { allow: ['line', 'bar'], default: 'line' },
      tables: { include: ['trips_*'], exclude: ['trips_raw'] },
      columns: { trips: { label: 'Trips', unit: 'trips', format: '#,##0' } },
      presets: [{ version: 1 }],
    })
    expect(o.warnings).toEqual([])
    expect(o.limits).toEqual({ csvRows: 500, pageSize: 25, undoSteps: 10, maxJoins: 2, chartRows: 50_000, scatterSample: 5_000, histogramBins: 12, legendSeries: 15, distinctValues: 200, pivotRows: 500 })
    expect(o.features).toEqual({ sqlTab: false, csv: false, copySql: false, importExport: false, myTables: false, undo: false })
    // allowed charts keep the grid order, not the order written
    expect(o.charts.allow).toEqual(['bar', 'line'])
    expect(o.charts.default).toBe('line')
    expect(o.tables).toEqual({ include: ['trips_*'], exclude: ['trips_raw'] })
    expect(o.columns.trips).toEqual({ label: 'Trips', unit: 'trips', format: '#,##0' })
    expect(o.presets).toHaveLength(1)
  })

  it('keeps the default for a wrong value and says so', () => {
    const o = resolveExploreOptions({ limits: { csv_rows: 'many', bogus: 1 }, features: { csv: 'yes' }, charts: { allow: ['bar', 'spiral'], default: 'pie' }, tables: { include: 'trips' } })
    expect(o.limits.csvRows).toBe(100_000)
    expect(o.features.csv).toBe(true)
    expect(o.charts.allow).toEqual(['bar'])
    expect(o.charts.default).toBe('bar')
    expect(o.tables.include).toEqual([])
    expect(o.warnings.join(' ')).toMatch(/limits\.csv_rows: expected a number/)
    expect(o.warnings.join(' ')).toMatch(/limits\.bogus: not a known setting/)
    expect(o.warnings.join(' ')).toMatch(/features\.csv: expected true or false/)
    expect(o.warnings.join(' ')).toMatch(/charts\.allow: unknown chart "spiral"/)
    expect(o.warnings.join(' ')).toMatch(/charts\.default: "pie" is not one of the allowed charts/)
    expect(o.warnings.join(' ')).toMatch(/tables\.include: expected a list/)
  })

  it('pulls a limit outside its range to the nearest end', () => {
    const o = resolveExploreOptions({ limits: { page_size: 1, max_joins: 99 } })
    expect(o.limits.pageSize).toBe(5)
    expect(o.limits.maxJoins).toBe(8)
    expect(o.warnings).toHaveLength(2)
  })

  it('never lets the default chart fall outside the allowed ones', () => {
    expect(resolveExploreOptions({ charts: { allow: ['line'] } }).charts.default).toBe('line')
    expect(resolveExploreOptions({ charts: { allow: ['nonsense'] } }).charts.allow).toEqual([...MARKS])
  })
})

describe('table patterns', () => {
  const t = (include: string[], exclude: string[]) => ({ include, exclude })
  it('offers everything when no include list is given', () => expect(tableAllowed('trips', t([], []))).toBe(true))
  it('matches * as a wildcard, ignoring case', () => {
    expect(tableAllowed('Trips_by_mode', t(['trips_*'], []))).toBe(true)
    expect(tableAllowed('persons', t(['trips_*'], []))).toBe(false)
  })
  it('lets exclude win over include', () => expect(tableAllowed('trips_raw', t(['trips_*'], ['*_raw']))).toBe(false))
  it('treats other characters literally', () => expect(tableAllowed('tripsXa', t(['trips.a'], []))).toBe(false))
})

describe('column labels and formats', () => {
  it('uses the label, else the name', () => {
    const o = resolveExploreOptions({ columns: { trips: { label: 'Trips' } } })
    expect(columnLabel(o, 'trips')).toBe('Trips')
    expect(columnLabel(o, 'mode')).toBe('mode')
  })
  it('formats numbers with a small pattern', () => {
    expect(formatValue(1234567, '#,##0')).toBe('1,234,567')
    expect(formatValue(12.345, '0.0')).toBe('12.3')
    expect(formatValue(0.256, '0%')).toBe('26%')
    expect(formatValue(0.256, '0.0%')).toBe('25.6%')
    expect(formatValue(1500, '$#,##0')).toBe('$1,500')
  })
  it('leaves text, nulls and unknown patterns alone', () => {
    expect(formatValue('Bus', '#,##0')).toBe('Bus')
    expect(formatValue(null, '#,##0')).toBe('')
    expect(formatValue(5, undefined)).toBe('5')
    expect(formatValue(5, '(((')).toBe('5')
  })
})

describe('limits at work', () => {
  const tab = (id: string) => ({ id, name: id, source: 't:x', spec: defaultSpec() })
  it('keeps as many undo steps as the deployer allows', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    try {
      setExploreOptions(resolveExploreOptions({ limits: { undo_steps: 2 } }))
      setExplore({ charts: [tab('c1')] })
      for (const n of ['A', 'B', 'C', 'D']) { vi.advanceTimersByTime(2000); updateChart('c1', (x) => ({ ...x, name: n })) }
      expect(getExplore().undoDepth).toBe(2)
      undoCharts(); undoCharts(); undoCharts()
      // only two steps were kept, so the third undo does nothing and the oldest kept state (B) stays
      expect(getExplore().charts[0].name).toBe('B')
      expect(getExplore().redoDepth).toBe(2)
    } finally { vi.useRealTimers() }
  })
  it('limits the joins', () => {
    expect(maxJoins()).toBe(4)
    setExploreOptions(resolveExploreOptions({ limits: { max_joins: 2 } }))
    expect(maxJoins()).toBe(2)
    expect(getExploreOptions().limits.maxJoins).toBe(2)
  })
})

describe('labels on a drawn chart', () => {
  const theme = {
    ink: '#111111', mute: '#666666', line: '#cccccc', grid: '#eeeeee', surface: '#ffffff', font: 'sans-serif', fs: 11, r: 5, dark: false,
    tokens: { c1: '#2fa598' }, mode: (n: string) => `mode:${n}`, cat: (i: number) => `cat:${i}`, ramp: () => [], neutral: () => '#888888',
    diverge: () => '#888888', mix: (a: string) => a, onColor: () => '#000000',
  } as unknown as ChartTheme
  const cols: Col[] = [{ name: 'mode', type: 'category' }, { name: 'purpose', type: 'category' }, { name: 'trips', type: 'integer' }]
  const rows: Row[] = [{ mode: 'Bus', purpose: 'Work', trips: 3 }, { mode: 'Car', purpose: 'Work', trips: 9 }, { mode: 'Bus', purpose: 'Home', trips: 4 }]
  const built = buildChart({ spec: defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' }, color: { f: 'purpose' } } }), cols, rows, theme, width: 700, height: 400, hot: null }) as ChartModel

  it('renames legend titles and tooltip keys', () => {
    const out = relabel(built, { purpose: 'Trip purpose', trips: 'Trips made' })
    if (out.problem !== undefined || built.problem !== undefined) throw new Error('chart did not draw')
    expect(out.legend.map((g) => g.title)).toContain('Trip purpose')
    expect(built.legend.map((g) => g.title)).toContain('purpose')
    const tips = out.panels.flatMap((p) => [...p.rects, ...p.paths]).map((r) => r.tip).filter(Boolean).join(' ')
    expect(tips).not.toMatch(/(^|~)trips=/)
  })
  it('returns the same chart when there are no labels', () => expect(relabel(built, {})).toBe(built))
})

describe('site defaults under the panel (cascade)', () => {
  const site = {
    explore: {
      limits: { csv_rows: 500, page_size: 25 },
      features: { sql_tab: false },
      charts: { allow: ['bar', 'line'] },
      tables: { include: ['trips_*'], exclude: ['raw_*'] },
    },
  }

  it('applies the site defaults when the panel sets nothing', () => {
    const o = resolveExploreOptions({ type: 'explore-builder' }, site)
    expect(o.limits.csvRows).toBe(500)
    expect(o.limits.pageSize).toBe(25)
    expect(o.features.sqlTab).toBe(false)
    expect(o.charts.allow).toEqual(['bar', 'line'])
    expect(o.warnings).toEqual([])
  })

  it('merges maps per key, replaces the chart list and concatenates the exclude list', () => {
    const o = resolveExploreOptions({ limits: { csv_rows: 900 }, charts: { allow: ['pie'] }, tables: { exclude: ['tmp_*'] } }, site)
    expect(o.limits.csvRows).toBe(900)
    expect(o.limits.pageSize).toBe(25)
    expect(o.charts.allow).toEqual(['pie'])
    expect(o.tables.include).toEqual(['trips_*'])
    expect(o.tables.exclude).toEqual(['raw_*', 'tmp_*'])
  })

  it('still reports a wrong panel value and keeps checking keys the schema does not cascade', () => {
    const o = resolveExploreOptions({ limits: { csv_rows: 'many' }, charts: { default: 'nope' } }, site)
    expect(o.warnings.join(' ')).toMatch(/limits\.csv_rows/)
    expect(o.warnings.join(' ')).toMatch(/charts\.default/)
  })
})

describe('the chart limits', () => {
  it('reads each new limit and clamps it into its range with a warning', () => {
    const o = resolveExploreOptions({ limits: { chart_rows: 2000, scatter_sample: 50, histogram_bins: 500, legend_series: 6, distinct_values: 80, pivot_rows: 100 } })
    expect(o.limits).toMatchObject({ chartRows: 2000, scatterSample: 100, histogramBins: 100, legendSeries: 6, distinctValues: 80, pivotRows: 100 })
    expect(o.warnings.join(' ')).toMatch(/limits\.scatter_sample: 50 is outside 100 to 100000/)
    expect(o.warnings.join(' ')).toMatch(/limits\.histogram_bins: 500 is outside 2 to 100/)
  })

  it('takes the site value per key and lets the panel win', () => {
    const site = { explore: { limits: { chart_rows: 300, legend_series: 4 } } }
    expect(resolveExploreOptions({}, site).limits).toMatchObject({ chartRows: 300, legendSeries: 4, pivotRows: 500 })
    expect(resolveExploreOptions({ limits: { chart_rows: 900 } }, site).limits).toMatchObject({ chartRows: 900, legendSeries: 4 })
  })
})
