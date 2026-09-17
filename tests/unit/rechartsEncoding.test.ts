import { describe, it, expect } from 'vitest'
import { encodeRechartsData, encodeComboRechartsData } from '../../src/panels/rechartsEncoding.ts'
import type { ScenarioDisplayMap } from '../../src/panels/scenarioDisplay.ts'

// 029-shadcn-chart-panel — see
// specs/029-shadcn-chart-panel/data-model.md §2/§3 and
// specs/029-shadcn-chart-panel/contracts/recharts-panel.md
describe('rechartsEncoding.encodeRechartsData', () => {
  it('single-series (no `series` configured): one synthetic key, chart-1', () => {
    const rows = [
      { purpose: 'HBW', share: 0.62 },
      { purpose: 'HBO', share: 0.31 },
    ]
    const result = encodeRechartsData(rows, { x: 'purpose', y: 'share' })
    expect(result.seriesKeys).toEqual(['share'])
    expect(result.data).toEqual([
      { purpose: 'HBW', share: 0.62 },
      { purpose: 'HBO', share: 0.31 },
    ])
    expect(result.chartConfig).toEqual({ share: { label: 'share', color: 'var(--chart-1)' } })
  })

  it('multi-series: pivots tidy rows into one wide row per distinct x value', () => {
    const rows = [
      { purpose: 'HBW', mode: 'SOV', share: 0.62 },
      { purpose: 'HBW', mode: 'HOV', share: 0.18 },
      { purpose: 'HBO', mode: 'SOV', share: 0.5 },
      { purpose: 'HBO', mode: 'HOV', share: 0.3 },
    ]
    const result = encodeRechartsData(rows, { x: 'purpose', y: 'share', series: 'mode' })
    expect(result.seriesKeys).toEqual(['SOV', 'HOV'])
    expect(result.data).toEqual([
      { purpose: 'HBW', SOV: 0.62, HOV: 0.18 },
      { purpose: 'HBO', SOV: 0.5, HOV: 0.3 },
    ])
  })

  it('a missing x/series combination is left undefined, never coerced to 0', () => {
    const rows = [
      { purpose: 'HBW', mode: 'SOV', share: 0.62 },
      { purpose: 'HBO', mode: 'HOV', share: 0.3 }, // HBO has no SOV row, HBW has no HOV row
    ]
    const result = encodeRechartsData(rows, { x: 'purpose', y: 'share', series: 'mode' })
    const hbw = result.data.find((r) => r.purpose === 'HBW')!
    const hbo = result.data.find((r) => r.purpose === 'HBO')!
    expect(hbw.HOV).toBeUndefined()
    expect(hbo.SOV).toBeUndefined()
    expect(hbw.SOV).toBe(0.62)
    expect(hbo.HOV).toBe(0.3)
  })

  it('color-cycling wraps back to chart-1 after the fifth distinct series value', () => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F'].map((mode, i) => ({
      purpose: 'HBW',
      mode,
      share: i,
    }))
    const result = encodeRechartsData(rows, { x: 'purpose', y: 'share', series: 'mode' })
    expect(result.chartConfig.A.color).toBe('var(--chart-1)')
    expect(result.chartConfig.E.color).toBe('var(--chart-5)')
    expect(result.chartConfig.F.color).toBe('var(--chart-1)') // wraps
  })

  it('seriesKeys ordering is deterministic first-seen, not re-sorted', () => {
    const rows = [
      { purpose: 'HBW', mode: 'Transit', share: 0.1 },
      { purpose: 'HBW', mode: 'SOV', share: 0.6 },
      { purpose: 'HBW', mode: 'HOV', share: 0.3 },
    ]
    const result = encodeRechartsData(rows, { x: 'purpose', y: 'share', series: 'mode' })
    expect(result.seriesKeys).toEqual(['Transit', 'SOV', 'HOV']) // not alphabetical
  })
})

// 035-scenario-label-color
describe('rechartsEncoding.encodeRechartsData — scenario label/color resolution (Part A/Part B)', () => {
  const rows = [
    { purpose: 'HBW', share: 0.62, scenario: 'observed' },
    { purpose: 'HBW', share: 0.58, scenario: 'good_scenario' },
  ]

  it('a labeled scenario entry resolves chartConfig[key].label to the label', () => {
    const display: ScenarioDisplayMap = new Map([['good_scenario', { label: 'Preferred Alternative' }]])
    const result = encodeRechartsData(rows, { x: 'purpose', y: 'share', series: 'scenario' }, display)
    expect(result.chartConfig.good_scenario.label).toBe('Preferred Alternative')
    expect(result.chartConfig.observed.label).toBe('observed') // unlabeled, unchanged
    // The pivoted-row column key itself is unchanged (real name) — Recharts'
    // own dataKey must match it.
    expect(result.seriesKeys).toEqual(['observed', 'good_scenario'])
  })

  it('series: "mode" (non-scenario) is unaffected by a populated scenarioDisplay map', () => {
    const modeRows = [
      { purpose: 'HBW', mode: 'SOV', share: 0.62 },
      { purpose: 'HBW', mode: 'HOV', share: 0.18 },
    ]
    const display: ScenarioDisplayMap = new Map([['SOV', { label: 'Should Not Apply', color: '#ff0000' }]])
    const result = encodeRechartsData(modeRows, { x: 'purpose', y: 'share', series: 'mode' }, display)
    expect(result.chartConfig.SOV.label).toBe('SOV')
    expect(result.chartConfig.SOV.color).toBe('var(--chart-1)')
  })

  it('no 3rd argument at all behaves identically to today (backward-compat)', () => {
    const result = encodeRechartsData(rows, { x: 'purpose', y: 'share', series: 'scenario' })
    expect(result.chartConfig.good_scenario.label).toBe('good_scenario')
    expect(result.chartConfig.good_scenario.color).toBe('var(--chart-2)')
  })

  it('a resolved color is used in chartConfig[key].color', () => {
    const display: ScenarioDisplayMap = new Map([['good_scenario', { color: '#4e79a7' }]])
    const result = encodeRechartsData(rows, { x: 'purpose', y: 'share', series: 'scenario' }, display)
    expect(result.chartConfig.good_scenario.color).toBe('#4e79a7')
  })

  it('a scenario with no resolved color falls back to the existing token-cycling default', () => {
    const display: ScenarioDisplayMap = new Map([['good_scenario', { label: 'Preferred Alternative' }]])
    const result = encodeRechartsData(rows, { x: 'purpose', y: 'share', series: 'scenario' }, display)
    expect(result.chartConfig.observed.color).toBe('var(--chart-1)')
  })
})

// chart_type: combo — deliberately NOT a variant of the multi-series pivot
// above: buildPanelQuery() already SELECT *s every column, so a row
// already carries every layer's own y value side by side; this is a
// simple x + per-layer-y pick, never a groupBy/pivot.
describe('rechartsEncoding.encodeComboRechartsData', () => {
  const rows = [
    { primary_purpose: 'HBW', trips: 8626, avg_distance_miles: 12.4 },
    { primary_purpose: 'HBO', trips: 4200, avg_distance_miles: 5.1 },
  ]

  it('picks x plus every layer\'s own y column into one wide row per query row — no pivot/grouping', () => {
    const result = encodeComboRechartsData(
      rows,
      [{ y: 'trips' }, { y: 'avg_distance_miles' }],
      'primary_purpose',
    )
    expect(result.data).toEqual([
      { primary_purpose: 'HBW', trips: 8626, avg_distance_miles: 12.4 },
      { primary_purpose: 'HBO', trips: 4200, avg_distance_miles: 5.1 },
    ])
  })

  it('assigns --chart-1..N tokens in layer order, keyed by each layer\'s own y column', () => {
    const result = encodeComboRechartsData(
      rows,
      [{ y: 'trips' }, { y: 'avg_distance_miles' }],
      'primary_purpose',
    )
    expect(result.chartConfig).toEqual({
      trips: { label: 'trips', color: 'var(--chart-1)' },
      avg_distance_miles: { label: 'avg_distance_miles', color: 'var(--chart-2)' },
    })
  })

  it('uses an explicit label over the bare column name when provided', () => {
    const result = encodeComboRechartsData(
      rows,
      [{ y: 'trips', label: 'Trip Volume' }, { y: 'avg_distance_miles', label: 'Avg. Distance (mi)' }],
      'primary_purpose',
    )
    expect(result.chartConfig.trips.label).toBe('Trip Volume')
    expect(result.chartConfig.avg_distance_miles.label).toBe('Avg. Distance (mi)')
  })

  it('cycles back to --chart-1 for a 6th layer', () => {
    const layers = ['a', 'b', 'c', 'd', 'e', 'f'].map((y) => ({ y }))
    const result = encodeComboRechartsData([{ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }], layers, 'x')
    expect(result.chartConfig.f.color).toBe('var(--chart-1)')
  })

  it('leaves a missing value undefined, never coerced to 0 — matches encodeRechartsData\'s own contract', () => {
    const sparseRows = [{ primary_purpose: 'HBW', trips: 8626 }] // no avg_distance_miles at all
    const result = encodeComboRechartsData(sparseRows, [{ y: 'trips' }, { y: 'avg_distance_miles' }], 'primary_purpose')
    expect(result.data[0].avg_distance_miles).toBeUndefined()
  })
})
