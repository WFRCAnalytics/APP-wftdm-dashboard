import { beforeAll, describe, expect, it } from 'vitest'

import { buildChartTheme } from '../../src/charts/theme'
import { configureVocab } from '../../src/charts/vocab'
import { buildSankey, districtMatrix, districtTotals, fmtFlowCell, showNodeLabel, withoutIntra } from '../../src/charts/lib/flows'
import {
  buildGroups,
  changeFraction,
  changeToDiverge,
  fmtHouseholds,
  fmtPctChange,
  fmtTrips,
  fmtVmt,
  groupTotal,
  hierSpec,
  hierTable,
  leafValues,
  shareOfGroup,
  showArcLabel,
  showGroupName,
  showGroupTotal,
  showLeafLabel,
} from '../../src/charts/lib/hierarchy'

const tokens = { ink: '#101820', surface: '#ffffff', c1: '#1f6feb', c2: '#d9822b', c3: '#2fa598', dark: false } as never
const theme = buildChartTheme(tokens, { mute: '#666', line: '#ddd', grid: '#eee', font: 'sans-serif', fs: 11.5, r: 4 })

const flow = [
  { primary_purpose: 'Work', major_trip_mode: 'Drive alone', trips: 1_400_000 },
  { primary_purpose: 'Work', major_trip_mode: 'Transit', trips: 80_000 },
  { primary_purpose: 'Work', major_trip_mode: 'Bike', trips: 500 }, // under 1k: dropped
  { primary_purpose: 'School', major_trip_mode: 'School bus', trips: 400_000 },
  { primary_purpose: 'School', major_trip_mode: 'Walk', trips: 100_000 },
]

// no district is assumed: a deployment names them (`vocab.districts`)
beforeAll(() => configureVocab({ districts: ['Weber', 'Davis', 'Salt Lake', 'Utah', 'Tooele'].map((label) => ({ label })) }))

describe('hierarchy nesting', () => {
  it('nests purpose > mode in vocabulary order and scales to thousands', () => {
    const g = buildGroups('trips', 'pm', flow)
    expect(g.map((x) => x.name)).toEqual(['Work', 'School'])
    expect(g[0].children.map((c) => c.name)).toEqual(['Drive alone', 'Transit'])
    expect(g[0].children[0].v).toBe(1400)
    expect(groupTotal(g[1])).toBe(500)
  })
  it('nests mode > purpose for mp, keeping vocabulary order (School bus after Walk)', () => {
    const g = buildGroups('trips', 'mp', flow)
    expect(g.map((x) => x.name)).toEqual(['Drive alone', 'Transit', 'Walk', 'School bus'])
    expect(g[0].children).toEqual([{ name: 'Work', v: 1400 }])
  })
  it('nests income > mode', () => {
    const g = buildGroups('trips', 'im', [
      { income_group: 'Over $125k', major_trip_mode: 'Walk', trips: 5000 },
      { income_group: 'Under $35k', major_trip_mode: 'Drive alone', trips: 8000 },
    ])
    expect(g.map((x) => x.name)).toEqual(['Under $35k', 'Over $125k'])
    expect(g[0].idx).toBe(0)
    expect(g[1].idx).toBe(3)
  })
  it('nests income x vehicles (households, thousands) and drops leaves under 0.5k', () => {
    const g = buildGroups('hh', '', [
      { auto_ownership: '2 cars', income_group: 'Under $35k', households: 34440 },
      { auto_ownership: '0 cars', income_group: 'Under $35k', households: 300 },
      { auto_ownership: '1 car', income_group: 'Under $35k', households: 75440 },
    ])
    expect(g[0].children.map((c) => c.name)).toEqual(['1 car', '2 cars'])
    expect(g[0].children[1].v).toBeCloseTo(34.44)
  })
  it('nests county x road type in millions of miles', () => {
    const g = buildGroups('vmt', '', [
      { county: 'Utah', facility_type: 'Local', vmt: 2_000_000 },
      { county: 'Salt Lake', facility_type: 'Freeway', vmt: 15_212_448 },
    ])
    expect(g.map((x) => x.name)).toEqual(['Salt Lake', 'Utah'])
    expect(g[0].children[0].v).toBeCloseTo(15.212448)
  })
  it('reads the right table per variant and group', () => {
    expect(hierTable('trips', 'pm')).toBe('purpose_mode_flow')
    expect(hierTable('trips', 'im')).toBe('trip_mode_share_by_income')
    expect(hierTable('hh', 'pm')).toBe('auto_ownership_summary')
    expect(hierTable('vmt', '')).toBe('vmt_county_facility')
  })
  it('indexes leaves by group|leaf', () => {
    const m = leafValues(buildGroups('trips', 'pm', flow))
    expect(m.get('Work|Transit')).toBe(80)
  })
})

describe('hierarchy colour', () => {
  it('colours trips by mode (pm, im) and by purpose (mp)', () => {
    const groups = buildGroups('trips', 'pm', flow)
    const pm = hierSpec('trips', 'pm', groups, theme)
    expect(pm.isMode).toBe(true)
    expect(pm.leaf('Transit', 'Work')).toBe(theme.mode('Transit'))
    const mp = hierSpec('trips', 'mp', groups, theme)
    expect(mp.isMode).toBe(false)
    expect(mp.leaf('School', 'Walk')).toBe(theme.cat(1))
  })
  it('colours vehicles and road types with a ramp', () => {
    const hh = hierSpec('hh', '', [], theme)
    expect(hh.leaf('0 cars', 'x')).not.toBe(hh.leaf('4+ cars', 'x'))
    expect(hh.leaf('4+ cars', 'x')).toBe(theme.ramp(theme.tokens.c2, 5, 0.8)[4])
    const vmt = hierSpec('vmt', '', [], theme)
    expect(vmt.leaf('Freeway', 'Utah')).toBe(theme.ramp(theme.tokens.c1, 4, 0.75)[0])
  })
  it('clamps percent change at 25%', () => {
    expect(changeToDiverge(0.5)).toBe(1)
    expect(changeToDiverge(-0.5)).toBe(-1)
    expect(changeToDiverge(0.125)).toBeCloseTo(0.5)
    expect(changeFraction(110, 100)).toBeCloseTo(0.1)
    expect(changeFraction(5, 0)).toBe(0)
    expect(changeFraction(5, undefined)).toBe(0)
  })
  it('maps zero change to the neutral midpoint and the extremes to the palette colours', () => {
    expect(theme.diverge(changeToDiverge(0))).toBe(theme.mix(theme.surface, theme.ink, 0.16))
    expect(theme.diverge(changeToDiverge(0.3)).toLowerCase()).toBe('#1f6feb')
    expect(theme.diverge(changeToDiverge(-0.3)).toLowerCase()).toBe('#d9822b')
  })
})

describe('hierarchy formats and label rules', () => {
  it('formats', () => {
    expect(fmtTrips(9810)).toBe('9.81M')
    expect(fmtTrips(812.4)).toBe('812k')
    expect(fmtHouseholds(912.4)).toBe('912k')
    expect(fmtVmt(26.84)).toBe('26.8M')
    expect(fmtPctChange(0.032)).toBe('+3.2%')
    expect(fmtPctChange(-0.1)).toBe('−10.0%')
    expect(fmtPctChange(0)).toBe('0.0%')
  })
  it('applies the visibility thresholds', () => {
    expect(showGroupName(45)).toBe(false)
    expect(showGroupName(46)).toBe(true)
    expect(showGroupTotal(109)).toBe(false)
    expect(showGroupTotal(110)).toBe(true)
    expect(showLeafLabel(66, 50)).toBe(false)
    expect(showLeafLabel(67, 41)).toBe(true)
    expect(showLeafLabel(100, 40)).toBe(false)
    expect(showArcLabel(0.32)).toBe(false)
    expect(showArcLabel(0.33)).toBe(true)
  })
  it('share of group', () => {
    expect(shareOfGroup(25, 100)).toBe(25)
    expect(shareOfGroup(1, 0)).toBe(0)
  })
})

describe('sankey data', () => {
  const rows = [
    { primary_purpose: 'Work', major_trip_mode: 'Drive alone', distance_band: 'Under 2 mi', trips: 300_000 },
    { primary_purpose: 'Work', major_trip_mode: 'Drive alone', distance_band: 'Over 8 mi', trips: 500_000 },
    { primary_purpose: 'Work', major_trip_mode: 'Bike', distance_band: 'Under 2 mi', trips: 4_000 },
    { primary_purpose: 'School', major_trip_mode: 'Bike', distance_band: 'Under 2 mi', trips: 3_000 },
  ]
  it('sums into purpose > mode and mode > distance links and drops links of 5k or less', () => {
    const g = buildSankey(rows)
    const find = (s: string, t: string) => g.links.find((l) => l.source === s && l.target === t)
    expect(find('p:Work', 'm:Drive alone')?.value).toBe(800)
    expect(find('m:Drive alone', 'b:Over 8 mi')?.value).toBe(500)
    expect(find('p:Work', 'm:Bike')).toBeUndefined()
  })
  it('keeps a link above the threshold and reports true totals', () => {
    const g = buildSankey(rows)
    expect(g.links.find((l) => l.source === 'm:Bike')?.value).toBe(7)
    expect(g.totals.get('m:Bike')).toBe(7)
    expect(g.totals.get('p:Work')).toBe(804)
    expect(g.links.every((l) => l.value > 5)).toBe(true)
  })
  it('carries the mode on links and mode nodes only', () => {
    const g = buildSankey(rows)
    expect(g.nodes.filter((n) => n.mode).length).toBe(6)
    expect(g.links.every((l) => typeof l.mode === 'string')).toBe(true)
  })
  it('hides labels of nodes shorter than 9px', () => {
    expect(showNodeLabel(8.9)).toBe(false)
    expect(showNodeLabel(9)).toBe(true)
  })
})

describe('district flows', () => {
  const rows = [
    { orig_district: 'Weber', dest_district: 'Weber', trips: 820_000 },
    { orig_district: 'Weber', dest_district: 'Davis', trips: 120_000 },
    { orig_district: 'Davis', dest_district: 'Weber', trips: 118_000 },
    { orig_district: 'Salt Lake', dest_district: 'Utah', trips: 160_000 },
    { orig_district: 'Mars', dest_district: 'Utah', trips: 1 },
  ]
  it('builds the matrix in district order in thousands, ignoring unknown districts', () => {
    const m = districtMatrix(rows)
    expect(m[0][0]).toBe(820)
    expect(m[0][1]).toBe(120)
    expect(m[1][0]).toBe(118)
    expect(m[2][3]).toBe(160)
    expect(m.flat().reduce((a, b) => a + b, 0)).toBe(820 + 120 + 118 + 160)
  })
  it('leaves intra-district trips out of the chord', () => {
    const f = withoutIntra(districtMatrix(rows))
    expect(f[0][0]).toBe(0)
    expect(f[0][1]).toBe(120)
  })
  it('totals leaving and arriving trips without the diagonal', () => {
    const m = districtMatrix(rows)
    expect(districtTotals(m, 0)).toEqual({ out: 120, into: 118 })
  })
  it('formats table cells', () => {
    expect(fmtFlowCell(820)).toBe('820k')
    expect(fmtFlowCell(99.96)).toBe('100.0k')
    expect(fmtFlowCell(25)).toBe('25.0k')
    expect(fmtFlowCell(3100)).toBe('3100k')
  })
})
