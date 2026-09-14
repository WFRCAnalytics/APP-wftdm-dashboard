// 056-lazy-tab-scoped-loading, T009: computeTabDataRequirement() coverage
// (contracts/tab-data-loader.md's own testing note — pure, no DOM/network,
// same shape as dashboardLayout.test.ts). The comparison:diff/$baseline
// cases need real appState state (getBaseline()'s resolution), so this
// file follows appState.test.ts's own real-register()-then-unregister()
// convention rather than mocking the module.
import { afterEach, describe, expect, it } from 'vitest'

import { computeTabDataRequirement } from '@/services/tabDataLoader'
import * as appState from '@/state/appState'
import type {
  DashboardTabConfig,
  PanelConfig,
  PlotlyPanelConfig,
  ValueBoxPanelConfig,
} from '@/layout/types'

const TEST_SCENARIOS = ['t009_scn_a', 't009_scn_b']

afterEach(() => {
  for (const name of TEST_SCENARIOS) appState.unregister(name)
})

function tab(layout: Record<string, PanelConfig[]>): DashboardTabConfig {
  return { header: { tab: 'Test', title: 'Test Tab' }, filters: [], layout }
}

const plotly = (metric: string, extra: Partial<PlotlyPanelConfig> = {}): PlotlyPanelConfig => ({
  type: 'plotly',
  title: 'A Chart',
  metric,
  traces: [],
  ...extra,
})

const valueBox = (metric: string, extra: Partial<ValueBoxPanelConfig> = {}): ValueBoxPanelConfig => ({
  type: 'valuebox',
  title: 'A Value',
  metric,
  column: 'x',
  format: '{:,.0f}',
  ...extra,
})

describe('computeTabDataRequirement', () => {
  it('returns nothing for a tab with only markdown panels', () => {
    const t = tab({ row: [{ type: 'markdown', title: 'Text' }] })
    expect(computeTabDataRequirement(t, ['a'])).toEqual([])
  })

  it('defaults to the active-scenario union when neither scenario nor scenarios is set', () => {
    const t = tab({ row: [plotly('trip_mode_share')] })
    expect(computeTabDataRequirement(t, ['a', 'b'])).toEqual([
      { scenario: 'a', metric: 'trip_mode_share' },
      { scenario: 'b', metric: 'trip_mode_share' },
    ])
  })

  it('a pinned scenario: field bypasses the active-scenario union entirely', () => {
    const t = tab({ row: [plotly('trip_mode_share', { scenario: 'pinned_one' })] })
    expect(computeTabDataRequirement(t, ['a', 'b'])).toEqual([
      { scenario: 'pinned_one', metric: 'trip_mode_share' },
    ])
  })

  it('an explicit scenarios: list overrides the active-scenario union', () => {
    const t = tab({ row: [plotly('trip_mode_share', { scenarios: ['x', 'y'] })] })
    expect(computeTabDataRequirement(t, ['a', 'b'])).toEqual([
      { scenario: 'x', metric: 'trip_mode_share' },
      { scenario: 'y', metric: 'trip_mode_share' },
    ])
  })

  it('deduplicates two panels on the same tab referencing the same scenario+metric — the real, confirmed Network-tab od_flows case', () => {
    const t = tab({
      row: [plotly('od_flows', { scenario: 'baseline' }), plotly('od_flows', { scenario: 'baseline' })],
    })
    expect(computeTabDataRequirement(t, [])).toEqual([{ scenario: 'baseline', metric: 'od_flows' }])
  })

  it('a valuebox with a sparkline adds a second pair for the sparkline metric', () => {
    const t = tab({
      row: [
        valueBox('summary_kpis', {
          scenario: 'baseline',
          sparkline: { metric: 'trip_mode_share', x: 'purpose', y: 'trips' },
        }),
      ],
    })
    expect(computeTabDataRequirement(t, [])).toEqual([
      { scenario: 'baseline', metric: 'summary_kpis' },
      { scenario: 'baseline', metric: 'trip_mode_share' },
    ])
  })

  it('a graphic-walker panel resolves its dataset the same way a metric resolves', () => {
    const t = tab({
      row: [{ type: 'graphic-walker', title: 'Explore', dataset: 'trip_mode_share', scenario: 'baseline' }],
    })
    expect(computeTabDataRequirement(t, [])).toEqual([{ scenario: 'baseline', metric: 'trip_mode_share' }])
  })

  it('comparison: diff resolves both named scenarios for the one metric, ignoring the active-scenario union', () => {
    const t = tab({
      row: [
        plotly('vmt_by_home_taz', {
          comparison: { type: 'diff', a: 't009_scn_a', b: 't009_scn_b', expr: 'a.value - b.value' },
        }),
      ],
    })
    expect(computeTabDataRequirement(t, ['unrelated'])).toEqual([
      { scenario: 't009_scn_a', metric: 'vmt_by_home_taz' },
      { scenario: 't009_scn_b', metric: 'vmt_by_home_taz' },
    ])
  })

  it('comparison: diff resolves the "$baseline" sentinel via the real, unmodified appState.getBaseline()', () => {
    appState.register('t009_scn_a', { source: 'url', path: '/x', pinned: false })
    appState.setStatus('t009_scn_a', 'ready')
    appState.setBaseline('t009_scn_a')

    const t = tab({
      row: [
        plotly('vmt_by_home_taz', {
          comparison: { type: 'diff', a: '$baseline', b: 't009_scn_b', expr: 'a.value - b.value' },
        }),
      ],
    })
    expect(computeTabDataRequirement(t, [])).toEqual([
      { scenario: 't009_scn_a', metric: 'vmt_by_home_taz' },
      { scenario: 't009_scn_b', metric: 'vmt_by_home_taz' },
    ])
  })

  it('a valuebox with baseline_trend adds a pair for the resolved $baseline scenario, same metric', () => {
    appState.register('t009_scn_a', { source: 'url', path: '/x', pinned: false })
    appState.setStatus('t009_scn_a', 'ready')
    appState.setBaseline('t009_scn_a')

    const t = tab({
      row: [
        valueBox('summary_kpis', {
          scenario: 't009_scn_b',
          baseline_trend: { expr: 'a.value - b.value' },
        }),
      ],
    })
    expect(computeTabDataRequirement(t, [])).toEqual([
      { scenario: 't009_scn_a', metric: 'summary_kpis' },
      { scenario: 't009_scn_b', metric: 'summary_kpis' },
    ])
  })

  it('is deterministic — sorted by scenario__metric regardless of panel/row order', () => {
    const t = tab({
      row: [plotly('trip_mode_share', { scenario: 'z' }), plotly('trip_mode_share', { scenario: 'a' })],
    })
    expect(computeTabDataRequirement(t, [])).toEqual([
      { scenario: 'a', metric: 'trip_mode_share' },
      { scenario: 'z', metric: 'trip_mode_share' },
    ])
  })
})
