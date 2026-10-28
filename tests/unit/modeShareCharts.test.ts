import { describe, expect, it } from 'vitest'

import {
  buildSeries,
  crossTab,
  fmtMillions,
  gapAxisLabel,
  gapLimit,
  gapRows,
  gapStatus,
  labelFits,
  moeByMode,
  rankModes,
  refRowLabel,
  segmentLabel,
  segments,
  sharesBy,
  slopeRows,
  slopeY,
  stackSpec,
  tableCell,
  visibleNames,
  type ModeShareEnv,
} from '../../src/charts/lib/modeShare.ts'
import { provenanceFooter, provenanceFrom } from '../../src/charts/lib/observedSource.ts'
import { buildChartTheme } from '../../src/charts/theme.ts'
import { MODES } from '../../src/charts/vocab.ts'

const theme = buildChartTheme(
  { surface: '#ffffff', ink: '#101820', c1: '#2255cc', c2: '#cc7722', c3: '#228855' },
  { mute: '#586376', line: '#dbe1e9', grid: '#e8ecf1', font: 'sans-serif', fs: 11.5, r: 4 },
)

const mshare = (vals: number[], moe?: number[]) =>
  MODES.map((m, i) => ({ major_trip_mode: m, trips: Math.round(vals[i] * 1e5), share: vals[i] / 100, ...(moe ? { moe: moe[i] / 100 } : {}) }))

const TABLES: Record<string, Record<string, Record<string, unknown>[]>> = {
  obs: { trip_mode_share: mshare([63.8, 22.1, 3.1, 8.4, 1.2, 1.4], [1.4, 1.1, 0.5, 0.9, 0.3, 0.4]) },
  base: { trip_mode_share: mshare([64.9, 21.5, 2.8, 8.0, 1.0, 1.8]) },
  alt: {
    trip_mode_share: mshare([61.2, 21.0, 6.0, 8.6, 1.3, 1.9]),
    trip_mode_share_by_income: [
      { income_group: 'Under $35k', major_trip_mode: 'Drive alone', trips: 50, share: 0.5 },
      { income_group: 'Under $35k', major_trip_mode: 'Transit', trips: 50, share: 0.5 },
    ],
    trip_mode_share_by_purpose: [
      { primary_purpose: 'Work', major_trip_mode: 'Drive alone', trips: 80, share: 0.8 },
      { primary_purpose: 'Work', major_trip_mode: 'Walk', trips: 20, share: 0.2 },
    ],
    auto_ownership_summary: [
      { auto_ownership: '0 cars', income_group: 'Under $35k', households: 10 },
      { auto_ownership: '2 cars', income_group: 'Under $35k', households: 30 },
      { auto_ownership: '1 car', income_group: 'Over $125k', households: 5 },
    ],
  },
}

const envOf = (over: Partial<ModeShareEnv> & { group?: string } = {}): ModeShareEnv => ({
  scenarios: [
    { run: 'base', scenarioGroup: 'baseline', label: 'Baseline', color: '#111111', isFocus: false },
    { run: 'alt', scenarioGroup: 'alt', label: 'Alt', color: '#222222', isFocus: true },
  ],
  focus: { run: 'alt', scenarioGroup: 'alt', label: 'Alt', color: '#222222', isFocus: true },
  reference: { kind: 'observed', run: 'obs', label: 'Observed', isObserved: true },
  refRunFor: () => 'obs',
  data: { rows: (run, table) => TABLES[run]?.[table] ?? [], has: (run, table) => Boolean(TABLES[run]?.[table]) },
  group: 'scn',
  theme,
  observedRun: 'obs',
  ...over,
})

describe('sharesBy / series', () => {
  it('reads percent per mode in vocabulary order, missing modes 0', () => {
    const m = sharesBy([{ major_trip_mode: 'Walk', share: 0.1 }, { major_trip_mode: 'Drive alone', share: 0.9 }])
    expect(m.get('')).toEqual([90, 0, 0, 10, 0, 0])
  })

  it('moe in points, null when absent', () => {
    expect(moeByMode(envOf(), 'obs')?.get('Drive alone')).toBeCloseTo(1.4)
    expect(moeByMode(envOf(), 'base')).toBeNull()
  })

  it('scenario series use each run its reference', () => {
    const s = buildSeries(envOf())
    expect(s.names).toEqual(['base', 'alt'])
    expect(s.val('alt', 2)).toBeCloseTo(6)
    expect(s.ref('alt', 0)).toBeCloseTo(63.8)
    expect(s.self).toBe(true)
  })

  it('purpose/income series come from the focus run, reference is its overall share', () => {
    const s = buildSeries(envOf({ group: 'purpose' }))
    expect(s.names[0]).toBe('Work')
    expect(s.val('Work', 0)).toBeCloseTo(80)
    expect(s.ref('Work', 0)).toBeCloseTo(61.2)
    expect(s.refName).toBe('Overall Alt')
    const i = buildSeries(envOf({ group: 'income' }))
    expect(i.val('Under $35k', 2)).toBeCloseTo(50)
    expect(i.self).toBe(false)
  })

  it('drops the reference scenario in Change modes only', () => {
    const s = buildSeries(envOf())
    expect(visibleNames(s, 'val', 'base')).toEqual(['base', 'alt'])
    expect(visibleNames(s, 'abs', 'base')).toEqual(['alt'])
    expect(visibleNames(s, 'pct', undefined)).toEqual(['base', 'alt'])
  })

  it('labels the reference row', () => {
    expect(refRowLabel('Observed')).toBe('Observed')
    expect(refRowLabel('Baseline')).toBe('Reference · Baseline')
  })
})

describe('gap dots', () => {
  const s = buildSeries(envOf())
  it('rounds gaps to one decimal and uses the reference', () => {
    const rows = gapRows(['alt'], s, 'abs')
    expect(rows).toHaveLength(6)
    expect(rows.find((r) => r.mode === 'Transit')?.gap).toBe(2.9)
    expect(rows.find((r) => r.mode === 'Drive alone')?.gap).toBe(-2.6)
  })
  it('percent change is null against a zero reference', () => {
    const z = { ...s, ref: () => 0 }
    expect(gapRows(['alt'], z, 'pct').every((r) => r.gap === null)).toBe(true)
  })
  it('limit is max(4, ceil(maxAbs/2)*2)', () => {
    expect(gapLimit([{ mode: 'a', s: 'x', gap: 1.2 }])).toBe(4)
    expect(gapLimit([{ mode: 'a', s: 'x', gap: -4.1 }])).toBe(6)
    expect(gapLimit([{ mode: 'a', s: 'x', gap: 7.9 }])).toBe(8)
    expect(gapLimit([{ mode: 'a', s: 'x', gap: null }])).toBe(4)
  })
  it('axis title', () => {
    expect(gapAxisLabel('abs', 'Observed')).toBe('Percentage points vs Observed')
    expect(gapAxisLabel('pct', 'Frequent transit')).toBe('Percent change vs Frequent transit')
  })
  it('status thresholds', () => {
    expect(gapStatus(0.9)).toBe('ok')
    expect(gapStatus(-1)).toBe('ok')
    expect(gapStatus(2.5)).toBe('warn')
    expect(gapStatus(-2.6)).toBe('fail')
  })
})

describe('stacked bars', () => {
  it('segments are percent of the row, tiny ones skipped but advancing', () => {
    const seg = segments([50, 0.1, 49.9])
    expect(seg.map((x) => x.j)).toEqual([0, 2])
    expect(seg[0].from).toBe(0)
    expect(seg[1].from).toBeCloseTo(50.1)
    expect(seg.reduce((a, b) => a + b.pc, 0)).toBeCloseTo(99.9)
    expect(segments([0, 0])).toEqual([])
  })
  it('label rule: whole percent from 10, one decimal below, only when wider than 38px', () => {
    expect(segmentLabel(48.6)).toBe('49%')
    expect(segmentLabel(9.96)).toBe('10.0%')
    expect(segmentLabel(4.25)).toBe('4.3%')
    expect(labelFits(38)).toBe(false)
    expect(labelFits(38.1)).toBe(true)
  })
  it('crossTab fills categories in order, missing 0', () => {
    expect(crossTab([{ a: 'y', b: 'q', v: 3 }], 'a', 'b', 'v', ['x', 'y'], ['p', 'q'])).toEqual([[0, 0], [0, 3]])
  })
  it('variants: trips, income, auto, scenario', () => {
    const e = envOf()
    const trips = stackSpec(e, 'trips')
    expect(trips.rows.map((r) => r.label)).toEqual(['Work', 'School', 'Shopping', 'Other', 'Non-home'])
    expect(trips.rows[0].vals).toEqual([80, 0, 0, 20, 0, 0])
    expect(trips.ml).toBe(86)
    expect(trips.isMode).toBe(true)
    const inc = stackSpec(e, 'income')
    expect(inc.rows[0].vals[2]).toBe(50)
    expect(inc.ml).toBe(104)
    const auto = stackSpec(e, 'auto')
    expect(auto.keys).toEqual(['0 cars', '1 car', '2 cars', '3 cars', '4+ cars'])
    expect(auto.rows[0].vals).toEqual([10, 0, 30, 0, 0])
    expect(auto.rows[3].vals).toEqual([0, 5, 0, 0, 0])
    expect(auto.colors).toHaveLength(5)
    expect(auto.isMode).toBe(false)
    const scn = stackSpec(e, 'scenario')
    expect(scn.rows.map((r) => r.label)).toEqual(['Observed', 'Baseline', 'Alt'])
    expect(scn.ml).toBe(124)
  })
  it('scenario variant does not repeat the reference scenario', () => {
    const e = envOf({ reference: { kind: 'scenario', run: 'base', label: 'Baseline', isObserved: false }, refRunFor: () => 'base' })
    expect(stackSpec(e, 'scenario').rows.map((r) => r.label)).toEqual(['Baseline', 'Alt'])
  })
})

describe('donut, slope, table', () => {
  it('ranks modes by share, ties by order', () => {
    expect(rankModes([10, 30, 30, 5, 20, 5])).toEqual([1, 2, 4, 0, 3, 5])
  })
  it('million format', () => {
    expect(fmtMillions(9_810_000)).toBe('9.81M')
  })
  it('slope rows pair columns per mode and clamp for the log scale', () => {
    const r = slopeRows([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 0])
    expect(r).toHaveLength(12)
    expect(r[0]).toEqual({ col: 'a', mode: 'Drive alone', v: 1 })
    expect(r[1].col).toBe('b')
    expect(slopeY(0)).toBe(0.8)
    expect(slopeY(61.2)).toBe(61.2)
  })
  it('table cells: value, change and percent change', () => {
    expect(tableCell(61.2, 63.8, 'val')).toMatchObject({ main: 61.2 })
    expect(tableCell(61.2, 63.8, 'val').gap).toBeCloseTo(-2.6)
    expect(tableCell(61.2, 63.8, 'abs').main).toBeCloseTo(-2.6)
    expect(tableCell(66, 60, 'pct').main).toBeCloseTo(10)
    expect(tableCell(5, 0, 'pct').main).toBeNull()
    expect(tableCell(5, null, 'abs')).toEqual({ val: 5, main: 5, gap: null })
  })
})

describe('observed provenance', () => {
  const manifest = {
    observed: {
      source: 'survey',
      sample: 'n = 1',
      metrics: { trip_mode_share: { source: '2023 household travel survey', sample: 'n = 14,820 households' } },
    },
  }
  it('per-metric first, then the manifest-wide source', () => {
    expect(provenanceFooter(provenanceFrom(manifest, 'trip_mode_share'))).toBe('Observed: 2023 household travel survey, n = 14,820 households')
    expect(provenanceFooter(provenanceFrom(manifest, 'other'))).toBe('Observed: survey, n = 1')
  })
  it('nothing without provenance', () => {
    expect(provenanceFrom({}, 'x')).toBeNull()
    expect(provenanceFooter(null)).toBe('')
    expect(provenanceFooter({ source: 'only' })).toBe('Observed: only')
  })
})
