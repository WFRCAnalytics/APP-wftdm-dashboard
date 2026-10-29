import { describe, expect, it } from 'vitest'

import { indexSchema, SETTINGS } from '../../src/config'

describe('config schema table', () => {
  it('has unique paths and a description on every row', () => {
    const paths = SETTINGS.map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const r of SETTINGS) expect(r.description.length, r.path).toBeGreaterThan(10)
  })

  it('gives every enum its allowed values', () => {
    for (const r of SETTINGS.filter((s) => s.type === 'enum')) expect(r.values?.length, r.path).toBeGreaterThan(1)
  })

  it('lets only the contract\'s keys cascade, and states a merge rule for each cascading list', () => {
    const cascading = SETTINGS.filter((r) => r.cascade).map((r) => r.path).sort()
    expect(cascading).toEqual(
      [
        'basemap.default',
        'explore.charts.allow',
        'explore.charts.default',
        'explore.columns',
        'explore.features',
        'explore.limits.chart_rows',
        'explore.limits.csv_rows',
        'explore.limits.distinct_values',
        'explore.limits.histogram_bins',
        'explore.limits.legend_series',
        'explore.limits.max_joins',
        'explore.limits.page_size',
        'explore.limits.pivot_rows',
        'explore.limits.scatter_sample',
        'explore.limits.undo_steps',
        'explore.presets',
        'explore.tables.exclude',
        'explore.tables.include',
        'export.footer',
        'layout.mode',
      ].sort(),
    )
    for (const r of SETTINGS.filter((s) => s.cascade && s.type === 'list')) {
      expect(typeof r.cascade === 'object' && ['replace', 'concat'].includes(r.cascade.merge), r.path).toBe(true)
    }
  })

  it('never lets a row path be both a leaf and a group', () => {
    const { byPath, groups } = indexSchema(SETTINGS)
    for (const g of groups) expect(byPath.has(g), g).toBe(false)
  })
})
