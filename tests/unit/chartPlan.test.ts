import { describe, expect, it } from 'vitest'

import { buildChartPlan, runsToLoad, type PlanInput } from '../../src/charts/plan.ts'
import { buildChartTheme } from '../../src/charts/theme.ts'
import { kindName } from '../../src/charts/kinds/index.ts'
import type { ChartPanelConfig } from '../../src/layout/types.ts'
import type { ResolvedView } from '../../src/services/viewContext.ts'

const view = (over: Partial<ResolvedView> = {}): ResolvedView => ({
  compare: true,
  focus: 'frequent-transit',
  focusRun: 'frequent-transit-2036',
  active: ['baseline-2036', 'frequent-transit-2036', 'infill-density-2036'],
  missing: [],
  reference: 'baseline',
  referenceKind: 'scenario',
  referenceRun: 'baseline-2036',
  display: 'val',
  year: 2036,
  baseYear: 2023,
  isBaseYear: false,
  ...over,
})

const input = (config: Partial<ChartPanelConfig> = {}, v: Partial<ResolvedView> = {}): PlanInput => ({
  config: { type: 'chart', kind: 'mode-bars', title: 'Mode share', ...config } as ChartPanelConfig,
  view: view(v),
  active: view(v).active,
  referenceLabel: 'Baseline',
  years: [{ year: 2023 }, { year: 2036, label: 'End of RTP Phase I' }],
  label: (r) => r.toUpperCase(),
  color: () => '#123456',
  alternativeOf: (r) => r.replace(/-\d{4}$/, ''),
  runFor: (alt, year) => (year === 2023 ? alt : `${alt}-${year}`),
})

describe('buildChartPlan', () => {
  it('draws every compared run, marking the focus', () => {
    const p = buildChartPlan(input())
    expect(p.scenarios.map((s) => s.run)).toEqual(['baseline-2036', 'frequent-transit-2036', 'infill-density-2036'])
    expect(p.focus?.run).toBe('frequent-transit-2036')
    expect(p.display).toBe('val')
    expect(p.years[1]).toEqual({ year: 2036, label: 'End of RTP Phase I' })
  })
  it('draws only the focus with Compare off', () => {
    const p = buildChartPlan(input({}, { compare: false }))
    expect(p.scenarios.map((s) => s.run)).toEqual(['frequent-transit-2036'])
  })
  it('pins to one run and forces values (a cell of a side-by-side grid)', () => {
    const p = buildChartPlan(input({ scenario: 'infill-density-2036' }, { display: 'abs' }))
    expect(p.scenarios.map((s) => s.run)).toEqual(['infill-density-2036'])
    expect(p.pinned).toBe(true)
    expect(p.display).toBe('val')
    expect(p.focus?.run).toBe('infill-density-2036')
  })
  it('keeps the Change display when not pinned', () => {
    expect(buildChartPlan(input({}, { display: 'pct' })).display).toBe('pct')
  })
  it('resolves the reference run, or each run\'s own base-year run for self-base-year', () => {
    const p = buildChartPlan(input())
    expect(p.refRunFor('frequent-transit-2036')).toBe('baseline-2036')
    const self = buildChartPlan(input({}, { referenceKind: 'self-base-year', referenceRun: undefined }))
    expect(self.reference.run).toBeUndefined()
    expect(self.refRunFor('frequent-transit-2036')).toBe('frequent-transit')
  })
  it('uses the configured group, else the kind default, else scenario', () => {
    expect(buildChartPlan(input({ group: 'purpose' })).group).toBe('purpose')
    expect(buildChartPlan({ ...input(), defaultGroup: 'mode' }).group).toBe('mode')
    expect(buildChartPlan(input()).group).toBe('scn')
  })
})

describe('runsToLoad', () => {
  it('loads compared runs, references and extras once each', () => {
    const p = buildChartPlan(input())
    expect(runsToLoad(p, ['x', 'baseline-2036']).sort()).toEqual(['baseline-2036', 'frequent-transit-2036', 'infill-density-2036', 'x'])
  })
})

describe('kindName', () => {
  it('turns file names into kebab-case kind names', () => {
    expect(kindName('./modeBars.ts')).toBe('mode-bars')
    expect(kindName('./zoneDiffMap.ts')).toBe('zone-diff-map')
    expect(kindName('./sankey.ts')).toBe('sankey')
  })
})

describe('buildChartTheme', () => {
  const tokens = { surface: '#ffffff', ink: '#000000', c1: '#2fa598', c2: '#c28940', c3: '#a781eb', dark: false }
  const theme = buildChartTheme(tokens, { mute: '#666', line: '#ddd', grid: '#eee', font: 'sans', fs: 11.5, r: 5 })
  it('colours transit with the first user colour and the car modes with neutrals', () => {
    expect(theme.mode('Transit')).toBe('#2fa598')
    expect(theme.mode('Drive alone')).not.toBe(theme.mode('Shared ride'))
  })
  it('chooses readable text for a fill', () => {
    expect(theme.onColor('#ffffff')).toBe('#0c1118')
    expect(theme.onColor('#101010')).toBe('#ffffff')
  })
  it('diverges through a neutral midpoint', () => {
    expect(theme.diverge(0)).toBe(theme.mix('#ffffff', '#000000', 0.16))
    expect(theme.diverge(1)).toBe('#2fa598')
    expect(theme.diverge(-1)).toBe('#c28940')
  })
})
