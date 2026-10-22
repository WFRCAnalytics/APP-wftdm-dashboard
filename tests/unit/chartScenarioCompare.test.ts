import { describe, expect, it } from 'vitest'

import {
  columnMax,
  kpiValue,
  METRICS,
  metricOf,
  nextSort,
  pctDistance,
  rankRows,
  shade,
  sortRows,
  withUnit,
} from '../../src/charts/lib/metrics'
import { buildTrendRows, hasTrend, snapYear, trendTick } from '../../src/charts/lib/trend'
import { axisAngle, errorsFrom, labelAnchor, polar, radarMax, ringValues, status, SUBMODELS } from '../../src/charts/lib/fingerprint'

const kpi = {
  total_trips: 9_860_000,
  total_vmt: 61_400_000,
  transit_boardings: 106_600,
  avg_trip_length_miles: 7.6,
  drive_share: 0.649,
  transit_share: 0.031,
  active_share: 0.096,
}

describe('metrics', () => {
  it('reads each metric in its display unit from a summary_kpis row', () => {
    const v = Object.fromEntries(METRICS.map((m) => [m.id, m.get(kpi)]))
    expect(v.trips).toBeCloseTo(9.86, 6)
    expect(v.drive).toBeCloseTo(64.9, 6)
    expect(v.transit).toBeCloseTo(3.1, 6)
    expect(v.active).toBeCloseTo(9.6, 6)
    expect(v.vmt).toBeCloseTo(61.4, 6)
    expect(v.boards).toBeCloseTo(106.6, 6)
    expect(v.len).toBe(7.6)
  })
  it('returns null for a missing column and for no rows', () => {
    expect(metricOf('trips').get({})).toBeNull()
    expect(kpiValue([], metricOf('trips'))).toBeNull()
    expect(kpiValue([kpi], metricOf('vmt'))).toBeCloseTo(61.4, 6)
  })
  it('falls back to transit share for an unknown id', () => {
    expect(metricOf(undefined).id).toBe('transit')
    expect(metricOf('nope').id).toBe('transit')
  })
  it('attaches a percent unit without a space', () => {
    expect(withUnit('3.1', '%')).toBe('3.1%')
    expect(withUnit('61.4', 'M mi')).toBe('61.4 M mi')
  })
})

describe('scorecard shading and sorting', () => {
  it('scales cell shading per column to at most 38 percent', () => {
    expect(shade(5, 5)).toEqual({ strength: 38, negative: false })
    expect(shade(-2.5, 5)).toEqual({ strength: 19, negative: true })
    expect(shade(40, 5).strength).toBe(38)
    expect(shade(null, 5).strength).toBe(0)
  })
  it('floors the column max at 0.5 and ignores nulls', () => {
    expect(columnMax([0.1, -0.2, null])).toBe(0.5)
    expect(columnMax([1, -4, null])).toBe(4)
    expect(columnMax([])).toBe(1)
  })
  it('distance is the percent change against the reference', () => {
    expect(pctDistance(110, 100)).toBeCloseTo(10, 9)
    expect(pctDistance(5, 0)).toBeNull()
  })
  it('sorts descending first, flips on the same column, keeps nulls last', () => {
    let s = nextSort({ key: null, dir: -1 }, 2)
    expect(s).toEqual({ key: 2, dir: -1 })
    s = nextSort(s, 2)
    expect(s).toEqual({ key: 2, dir: 1 })
    expect(nextSort(s, 1)).toEqual({ key: 1, dir: -1 })
    const rows = [{ v: 2 }, { v: null }, { v: 5 }, { v: 1 }]
    expect(sortRows(rows, { key: 0, dir: -1 }, (r) => r.v).map((r) => r.v)).toEqual([5, 2, 1, null])
    expect(sortRows(rows, { key: 0, dir: 1 }, (r) => r.v).map((r) => r.v)).toEqual([1, 2, 5, null])
    expect(sortRows(rows, { key: null, dir: -1 }, (r) => r.v)).toEqual(rows)
  })
  it('ranks descending with n/a rows last', () => {
    const r = rankRows([
      { key: 'a', v: 1, raw: 1, ref: 0 },
      { key: 'b', v: null, raw: 1, ref: 0 },
      { key: 'c', v: 3, raw: 3, ref: 0 },
      { key: 'd', v: -2, raw: -2, ref: 0 },
    ])
    expect(r.map((x) => x.key)).toEqual(['c', 'a', 'd', 'b'])
  })
})

describe('years trend', () => {
  const years = [2023, 2027, 2036]
  const val: Record<string, Record<number, number>> = {
    base: { 2023: 3, 2027: 3.2, 2036: 3.5 },
    alt: { 2023: 3, 2027: 3.6, 2036: 4.2 },
  }
  const base = {
    alternatives: ['base', 'alt'],
    years,
    value: (a: string, y: number) => val[a]?.[y] ?? null,
    refValue: (_a: string, y: number) => val.base[y],
  }
  it('Values plots the metric itself', () => {
    const rows = buildTrendRows({ ...base, display: 'val' })
    expect(rows).toHaveLength(6)
    expect(rows.find((r) => r.n === 'alt' && r.y === 2036)).toMatchObject({ v: 4.2, raw: 4.2, ref: null })
  })
  it('Change plots scenario minus the reference of the same year', () => {
    const rows = buildTrendRows({ ...base, alternatives: ['alt'], display: 'abs' })
    expect(rows.map((r) => +r.v.toFixed(6))).toEqual([0, 0.4, 0.7])
    expect(rows[2].ref).toBe(3.5)
  })
  it('% change plots (a / ref - 1) * 100 and drops a zero reference', () => {
    const rows = buildTrendRows({ ...base, alternatives: ['alt'], display: 'pct' })
    expect(rows[1].v).toBeCloseTo((3.6 / 3.2 - 1) * 100, 9)
    expect(buildTrendRows({ ...base, alternatives: ['alt'], display: 'pct', refValue: () => 0 })).toEqual([])
  })
  it('skips years without a value', () => {
    expect(buildTrendRows({ ...base, alternatives: ['ghost'], display: 'val' })).toEqual([])
  })
  it('snaps the pointer to the nearest milestone', () => {
    expect(snapYear(2024.4, years)).toBe(2023)
    expect(snapYear(2026, years)).toBe(2027)
    expect(snapYear(2050, years)).toBe(2036)
    expect(snapYear(2031.5, years)).toBe(2027)
  })
  it('only alternatives with several years of runs get a line (not rounds, not Observed)', () => {
    const runFor = (a: string, y: number) => (a === 'round-01' ? (y === 2023 ? 'round-01' : undefined) : `${a}-${y}`)
    expect(hasTrend('baseline', years, runFor)).toBe(true)
    expect(hasTrend('round-01', years, runFor)).toBe(false)
  })
  it('formats y ticks: plain, signed, with a percent in % change', () => {
    expect(trendTick(4, 'val')).toBe('4')
    expect(trendTick(0.5, 'abs')).toBe('+0.5')
    expect(trendTick(-2, 'abs')).toBe('−2')
    expect(trendTick(-1.25, 'pct')).toBe('−1.3%')
    expect(trendTick(0, 'abs')).toBe('0')
  })
})

describe('calibration fingerprint', () => {
  it('has eight submodels and the 3 / 5 percent status thresholds', () => {
    expect(SUBMODELS).toHaveLength(8)
    expect(status(3)).toBe('ok')
    expect(status(3.01)).toBe('warn')
    expect(status(5)).toBe('warn')
    expect(status(5.01)).toBe('fail')
  })
  it('radar max is max(6.5, ceil(maxError / 2) * 2 + 1)', () => {
    expect(radarMax([1, 2])).toBe(6.5)
    expect(radarMax([5.8])).toBe(7)
    expect(radarMax([12.66])).toBe(15)
    expect(radarMax([])).toBe(6.5)
    expect(ringValues(7)).toEqual([2, 5, 7])
    expect(ringValues(15)).toEqual([5, 10, 15])
  })
  it('reads errors in submodel order and zero-fills a missing submodel', () => {
    const rows = [
      { submodel: 'Trip mode', worst_segment_error_pct: 2.9 },
      { submodel: 'Auto ownership', worst_segment_error_pct: 1.4 },
    ]
    const e = errorsFrom(rows)!
    expect(e).toHaveLength(8)
    expect(e[0]).toBe(1.4)
    expect(e[7]).toBe(2.9)
    expect(e[3]).toBe(0)
    expect(errorsFrom([])).toBeNull()
  })
  it('puts axis 0 at 12 o clock, clockwise', () => {
    const [x, y] = polar(100, 100, 50, 10, 0, 8, 10)
    expect(x).toBeCloseTo(100, 6)
    expect(y).toBeCloseTo(50, 6)
    const [x2, y2] = polar(100, 100, 50, 10, 2, 8, 5)
    expect(x2).toBeCloseTo(125, 6)
    expect(y2).toBeCloseTo(100, 6)
    expect(axisAngle(4, 8)).toBeCloseTo(Math.PI / 2, 9)
  })
  it('centres labels near the vertical axis', () => {
    expect(labelAnchor(Math.cos(axisAngle(0, 8)))).toBe('middle')
    expect(labelAnchor(0.7)).toBe('start')
    expect(labelAnchor(-0.7)).toBe('end')
  })
})
