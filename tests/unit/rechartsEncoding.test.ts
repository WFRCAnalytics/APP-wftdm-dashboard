import { describe, it, expect } from 'vitest'
import { encodeRechartsData } from '../../src/panels/rechartsEncoding.ts'
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
