import { describe, expect, it } from 'vitest'

import {
  ALL_TRIPS, buildTodSeries, hourlyThousands, hourTick, hourTickEvery3, hourTitle, lineTickFormat, rowShares, speedCells, todColor,
  todGroup, todTable,
} from '../../src/charts/lib/timeOfDay'
import type { Row } from '../../src/charts/types'

const hours = (f: (h: number) => number): Row[] => Array.from({ length: 24 }, (_, hour) => ({ hour, trips: f(hour) }))

describe('time of day builders', () => {
  it('normalises group ids and picks tables', () => {
    expect(todGroup(undefined)).toBe('scn')
    expect(todGroup('weird')).toBe('scn')
    expect(todGroup('income')).toBe('income')
    expect(todTable('none')).toBe('trips_by_hour')
    expect(todTable('mode')).toBe('trips_by_hour_mode')
  })

  it('converts trips to thousands per hour', () => {
    expect(hourlyThousands(hours((h) => h * 1000))[5]).toBe(5)
    expect(hourlyThousands([])).toHaveLength(24)
  })

  it('builds one series per run for the scenario group', () => {
    const rows = (run: string) => (run === 'a' ? hours(() => 2000) : hours(() => 4000))
    const s = buildTodSeries('scn', [{ run: 'a' }, { run: 'b' }], 'a', rows)
    expect(s.names).toEqual(['a', 'b'])
    expect(s.rows).toHaveLength(48)
    expect(s.rows.find((d) => d.g === 'b' && d.hour === 3)!.v).toBe(4)
  })

  it('plots only the focus run by category in vocabulary order, filling absent categories with zeros', () => {
    const rows = (_run: string, table: string): Row[] =>
      table === 'trips_by_hour_mode'
        ? [
            { hour: 8, major_trip_mode: 'Walk', trips: 3000 },
            { hour: 8, major_trip_mode: 'Drive alone', trips: 9000 },
          ]
        : []
    const s = buildTodSeries('mode', [{ run: 'x' }, { run: 'y' }], 'x', rows)
    expect(s.names).toEqual(['Drive alone', 'Shared ride', 'Transit', 'Walk', 'Bike', 'School bus'])
    expect(s.rows).toHaveLength(6 * 24)
    expect(s.rows.find((d) => d.g === 'Walk' && d.hour === 8)!.v).toBe(3)
    expect(s.rows.find((d) => d.g === 'Transit' && d.hour === 8)!.v).toBe(0)
  })

  it('has an All trips series for the none group and none without a focus run', () => {
    expect(buildTodSeries('none', [], 'x', () => hours(() => 1000)).names).toEqual([ALL_TRIPS])
    expect(buildTodSeries('mode', [], undefined, () => []).rows).toEqual([])
  })

  it('computes each row share of its own total', () => {
    const shares = rowShares({ names: ['a', 'b'], rows: [{ g: 'a', hour: 0, v: 1 }, { g: 'a', hour: 1, v: 3 }, { g: 'b', hour: 0, v: 0 }] })
    expect(shares[0].v).toBeCloseTo(25)
    expect(shares[1].v).toBeCloseTo(75)
    expect(shares[2].v).toBe(0)
  })

  it('colours scenarios by their colour and modes through the theme', () => {
    const theme = { mode: (n: string) => `m:${n}`, cat: (i: number) => `c${i}`, ramp: (_c: string, n: number) => Array.from({ length: n }, (_, i) => `r${i}`), tokens: { c1: '#111' } as never, mute: '#999' }
    expect(todColor('scn', ['a'], [{ run: 'a', color: '#abc' }], theme)('a')).toBe('#abc')
    expect(todColor('scn', ['a'], [], theme)('z')).toBe('#999')
    expect(todColor('mode', [], [], theme)('Walk')).toBe('m:Walk')
    expect(todColor('purpose', ['Work', 'School'], [], theme)('School')).toBe('c1')
    expect(todColor('income', ['a', 'b', 'c', 'd'], [], theme)('c')).toBe('r2')
    expect(todColor('none', [ALL_TRIPS], [], theme)(ALL_TRIPS)).toBe('#111')
  })

  it('formats hours and line ticks', () => {
    expect(hourTitle(0)).toBe('12 AM')
    expect(hourTitle(6)).toBe('6 AM')
    expect(hourTitle(15)).toBe('3 PM')
    expect(hourTick(12)).toBe('12p')
    expect(hourTick(21)).toBe('9p')
    expect(hourTickEvery3(4)).toBe('')
    expect(hourTickEvery3(9)).toBe('9a')
    expect(lineTickFormat('val')(199.6)).toBe('200k')
    expect(lineTickFormat('abs')(12)).toBe('+12k')
    expect(lineTickFormat('abs')(-3)).toBe('−3k')
    expect(lineTickFormat('pct')(-3.46)).toBe('−3.5%')
    expect(lineTickFormat('abs')(0)).toBe('0k')
  })

  it('orders speed cells by facility and drops unusable rows', () => {
    const cells = speedCells([
      { facility_type: 'Local', hour: 3, avg_speed_mph: 21 },
      { facility_type: 'Freeway', hour: 3, avg_speed_mph: 61.5 },
      { facility_type: 'Mystery', hour: 3, avg_speed_mph: 40 },
      { facility_type: 'Freeway', hour: 30, avg_speed_mph: 40 },
    ])
    expect(cells.map((c) => c.facility)).toEqual(['Freeway', 'Local'])
  })
})
