import { describe, expect, it } from 'vitest'

import { dfmt, traceGroupOf, traceMeta, traceRows, withinTolerance } from '../../src/charts/lib/trace.ts'
import { buildChartTheme } from '../../src/charts/theme.ts'
import { meanErrorByRound, roundStatus, worstErrorByRound, type RollupRow } from '../../src/services/familyRollup.ts'

const theme = buildChartTheme(
  { surface: '#ffffff', ink: '#000000', c1: '#2fa598', c2: '#c28940', c3: '#a781eb', dark: false },
  { mute: '#666', line: '#ddd', grid: '#eee', font: 'sans', fs: 11.5, r: 5 },
)

const row = (round: number, metric_group: string, series: string, value: number, observed_value: number): RollupRow => ({
  round,
  metric_group,
  series,
  value,
  observed_value,
})

const rollup: RollupRow[] = [
  row(1, 'mode_share', 'Transit', 2.0, 3.1),
  row(2, 'mode_share', 'Transit', 3.0, 3.1),
  row(1, 'mode_share', 'Drive alone', 60, 63.8),
  row(2, 'mode_share', 'Drive alone', 64, 63.8),
  row(1, 'volumes', 'Daily trips', 10.3, 9.82),
  row(1, 'submodel_error', 'Tour mode', 6.5, 0),
  row(1, 'submodel_error', 'Trip mode', 2.1, 0),
  row(2, 'submodel_error', 'Tour mode', 4.0, 0),
  row(2, 'submodel_error', 'Trip mode', 1.0, 0),
]

describe('trace data', () => {
  it('orders modes by the vocabulary and builds the gap to observed in points', () => {
    const meta = traceMeta('mode', rollup, theme)
    expect(meta.names).toEqual(['Drive alone', 'Transit'])
    const rows = traceRows(rollup, meta)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ r: 1, name: 'Drive alone' })
    expect(rows.find((q) => q.r === 1 && q.name === 'Transit')?.d).toBeCloseTo(-1.1)
  })
  it('uses percent of observed for volumes and the error itself for submodels', () => {
    const vol = traceRows(rollup, traceMeta('vol', rollup, theme))
    expect(vol[0].d).toBeCloseTo((10.3 / 9.82 - 1) * 100)
    const err = traceMeta('err', rollup, theme)
    expect(traceRows(rollup, err).map((q) => q.d)).toEqual([6.5, 2.1, 4, 1])
  })
  it('formats gaps with a true minus, points or percent', () => {
    expect(dfmt(-1.1, { err: false, pct: false })).toBe('−1.1 pts')
    expect(dfmt(3.4, { err: false, pct: true })).toBe('+3.4%')
    expect(dfmt(4.1, { err: true, pct: false })).toBe('4.1%')
  })
  it('counts series within the tolerance', () => {
    const meta = traceMeta('mode', rollup, theme)
    expect(withinTolerance(traceRows(rollup, meta).filter((q) => q.r === 2), meta)).toBe(2)
    expect(withinTolerance(traceRows(rollup, meta).filter((q) => q.r === 1), meta)).toBe(0)
  })
  it('falls back to mode share for an unknown group', () => expect(traceGroupOf('nope')).toBe('mode'))
})

describe('family roll-up helpers', () => {
  it('finds the worst and mean submodel error per round', () => {
    expect(worstErrorByRound(rollup).get(1)).toBe(6.5)
    expect(meanErrorByRound(rollup).get(2)).toBeCloseTo(2.5)
  })
  it('classifies a round by its worst error', () => {
    expect(roundStatus(2.9)).toBe('ok')
    expect(roundStatus(4.5)).toBe('warn')
    expect(roundStatus(8)).toBe('fail')
  })
})
