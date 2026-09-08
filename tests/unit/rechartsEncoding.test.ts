import { describe, it, expect } from 'vitest'
import { encodeRechartsData } from '../../src/panels/rechartsEncoding.ts'

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
