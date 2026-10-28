import { describe, expect, it } from 'vitest'
import { buildChart, sortCategories, type ChartModel, type Col, type Row } from '../../src/charts/builder/compile.ts'
import { defaultSpec, fromConfig, toConfig } from '../../src/charts/builder/spec.ts'
import type { ChartTheme } from '../../src/charts/types.ts'

const V = new Map<string, number>([['a\u0002s1', 5], ['a\u0002s2', 1], ['b\u0002s1', 4], ['b\u0002s2', 4], ['c\u0002s1', 9]])
const series = ['s1', 's2']

describe('sortCategories', () => {
  it('leaves the natural order alone', () => {
    expect(sortCategories(['a', 'b', 'c'], 'natural', V, series, false)).toEqual(['a', 'b', 'c'])
    expect(sortCategories(['a', 'b', 'c'], undefined, V, series, false)).toEqual(['a', 'b', 'c'])
  })
  it('reverses', () => {
    expect(sortCategories(['a', 'b', 'c'], 'reverse', V, series, false)).toEqual(['c', 'b', 'a'])
  })
  it('orders by the stacked height, largest or smallest first', () => {
    // a: 6, b: 8, c: 9
    expect(sortCategories(['a', 'b', 'c'], 'high', V, series, false)).toEqual(['c', 'b', 'a'])
    expect(sortCategories(['a', 'b', 'c'], 'low', V, series, false)).toEqual(['a', 'b', 'c'])
  })
  it('orders by the tallest bar when bars sit side by side', () => {
    // a: 5, b: 4, c: 9
    expect(sortCategories(['a', 'b', 'c'], 'high', V, series, true)).toEqual(['c', 'a', 'b'])
  })
  it('does not change the list it was given', () => {
    const cats = ['a', 'b', 'c']
    sortCategories(cats, 'reverse', V, series, false)
    expect(cats).toEqual(['a', 'b', 'c'])
  })
})

describe('sort in a chart', () => {
  const theme = {
    ink: '#111111', mute: '#666666', line: '#cccccc', grid: '#eeeeee', surface: '#ffffff', font: 'sans-serif', fs: 11, r: 5, dark: false,
    tokens: { c1: '#2fa598' }, mode: (n: string) => `mode:${n}`, cat: (i: number) => `cat:${i}`, ramp: () => [], neutral: () => '#888888',
    diverge: () => '#888888', mix: (a: string) => a, onColor: () => '#000000',
  } as unknown as ChartTheme
  // a line takes an ordered category, a date or a number on x, never a plain category
  const colsFor = (mark: string): Col[] => [{ name: 'mode', type: mark === 'line' ? 'ordinal' : 'category' }, { name: 'trips', type: 'integer' }]
  const rows: Row[] = [{ mode: 'Bus', trips: 30 }, { mode: 'Car', trips: 90 }, { mode: 'Walk', trips: 10 }]
  const labels = (mark: 'bar' | 'line', sort: 'natural' | 'high' | 'low' | 'reverse') => {
    const m = buildChart({ spec: defaultSpec({ mark, sort, enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } }), cols: colsFor(mark), rows, theme, width: 700, height: 400, hot: null }) as Exclude<ChartModel, { problem: string }>
    return m.panels[0].texts.map((t) => t.t).filter((t) => ['Bus', 'Car', 'Walk'].includes(String(t)))
  }
  it('orders bars largest first', () => expect(labels('bar', 'high')).toEqual(['Car', 'Bus', 'Walk']))
  it('orders bars smallest first', () => expect(labels('bar', 'low')).toEqual(['Walk', 'Bus', 'Car']))
  it('keeps alphabetical order by default', () => expect(labels('bar', 'natural')).toEqual(['Bus', 'Car', 'Walk']))
  it('reverses a line over categories', () => expect(labels('line', 'reverse')).toEqual(['Walk', 'Car', 'Bus']))
})

describe('sort in the configuration', () => {
  const ctx = { scenarios: ['a'], columnsOf: () => [{ name: 'mode' }, { name: 'trips' }] }
  const spec = defaultSpec({ sort: 'high', enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } })
  const cfg = toConfig(spec, { relation: 't:trips', scenarios: ['a'], sql: 'SELECT 1', typeOf: () => 'category' })
  it('is written only when it is not the default', () => {
    expect(cfg.axes.sort).toBe('high')
    expect(toConfig(defaultSpec(), { relation: 't:trips', scenarios: ['a'], sql: '', typeOf: () => undefined }).axes.sort).toBeUndefined()
  })
  it('round-trips, and an old file without it imports as natural', () => {
    const back = fromConfig(JSON.stringify(cfg), ctx)
    expect(back.ok && back.spec.sort).toBe('high')
    const { sort: _s, ...axes } = cfg.axes
    const old = fromConfig(JSON.stringify({ ...cfg, axes }), ctx)
    expect(old.ok && old.spec.sort).toBe('natural')
  })
  it('rejects an unknown sort with its path', () => {
    const r = fromConfig(JSON.stringify({ ...cfg, axes: { ...cfg.axes, sort: 'sideways' } }), ctx)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors[0]).toMatch(/^axes\.sort:/)
  })
})
