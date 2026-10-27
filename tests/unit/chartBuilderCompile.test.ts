import { describe, expect, it } from 'vitest'
import { buildChart, fmtTick, shelfProblem, type ChartModel, type Col, type Row } from '../../src/charts/builder/compile.ts'
import { defaultSpec } from '../../src/charts/builder/spec.ts'
import type { ChartTheme } from '../../src/charts/types.ts'

const theme = {
  ink: '#111111', mute: '#666666', line: '#cccccc', grid: '#eeeeee', surface: '#ffffff', font: 'sans-serif', fs: 11, r: 5, dark: false,
  tokens: { c1: '#2fa598' }, mode: (n: string) => `mode:${n}`, cat: (i: number) => `cat:${i}`, ramp: () => [], neutral: () => '#888888',
  diverge: () => '#888888', mix: (a: string) => a, onColor: () => '#000000',
} as unknown as ChartTheme

const cols: Col[] = [
  { name: 'mode', type: 'category' }, { name: 'trips', type: 'integer' }, { name: 'scenario', type: 'category' },
  { name: 'hour', type: 'integer' }, { name: 'notes', type: 'text' },
]
const rows: Row[] = []
for (const scenario of ['a', 'b']) {
  for (const mode of ['Car', 'Bus', 'Walk']) {
    for (let hour = 0; hour < 4; hour++) rows.push({ scenario, mode, hour, trips: 10 + hour + (scenario === 'b' ? 5 : 0), notes: 'x' })
  }
}

const build = (over: Parameters<typeof defaultSpec>[0], data: Row[] = rows, hot: string | null = null) =>
  buildChart({ spec: defaultSpec(over), cols, rows: data, theme, width: 700, height: 400, hot })
type Drawn = Exclude<ChartModel, { problem: string }>
const ok = (m: ChartModel): Drawn => {
  if (m.problem !== undefined) throw new Error(m.problem)
  return m as Drawn
}

describe('shelves', () => {
  it('says what a mark still needs', () => {
    expect(shelfProblem(defaultSpec({ enc: { x: { f: 'mode' } } }), cols)).toContain('Y axis needs a number')
  })
  it('explains a wrong role and a non-chartable column', () => {
    expect(shelfProblem(defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'mode' } } }), cols)).toContain('Y axis takes a number, but mode is a category')
    expect(shelfProblem(defaultSpec({ enc: { x: { f: 'notes' }, y: { f: 'trips' } } }), cols)).toContain('not chartable yet')
  })
})

describe('bar', () => {
  const enc = { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' as const }, color: { f: 'scenario' } }
  it('draws one bar per category and series when grouped', () => {
    const m = ok(build({ enc }))
    expect(m.panels[0].rects).toHaveLength(6)
    expect(m.legend[0].items.map((i) => i.label)).toEqual(['a', 'b'])
  })
  it('totals values per bar', () => {
    const m = ok(build({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } }))
    const total = [0, 1, 2, 3].reduce((s, h) => s + 10 + h, 0) + [0, 1, 2, 3].reduce((s, h) => s + 15 + h, 0)
    expect(m.panels[0].rects[0].tip).toBe(`Bus~trips=${total}`)
  })
  it('reaches 100 percent when normalised', () => {
    const m = ok(build({ enc, stack: 'normalize' }))
    expect(m.panels[0].texts.some((t) => t.t === '100%')).toBe(true)
  })
  it('makes hatch patterns and a pattern legend', () => {
    const m = ok(build({ enc: { ...enc, pattern: { f: 'scenario' } } }))
    expect(m.defs.length).toBeGreaterThanOrEqual(2)
    expect(m.panels[0].rects[0].fill).toMatch(/^url\(#pt/)
  })
  it('dims everything except a hovered legend value', () => {
    const m = ok(build({ enc }, rows, 'scenario=a'))
    expect(new Set(m.panels[0].rects.map((r) => r.op))).toEqual(new Set([1, 0.2]))
  })
})

describe('line', () => {
  it('uses a different dash per series', () => {
    const m = ok(build({ mark: 'line', enc: { x: { f: 'hour' }, y: { f: 'trips', agg: 'sum' }, dash: { f: 'scenario' } } }))
    const dashes = new Set(m.panels[0].paths.map((p) => p.dash))
    expect(dashes.has('')).toBe(true)
    expect(dashes.has('7 4')).toBe(true)
    expect(m.legend.map((g) => g.title)).toEqual(['scenario'])
  })
})

describe('other marks', () => {
  it('bins a histogram into at most 12 bars', () => {
    const m = ok(build({ mark: 'histogram', enc: { x: { f: 'trips' } } }))
    expect(m.panels[0].rects.length).toBeGreaterThan(0)
    expect(m.panels[0].rects.length).toBeLessThanOrEqual(12)
  })
  it('draws one slice per category and a total for a donut', () => {
    const m = ok(build({ mark: 'pie', donut: true, enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } }))
    expect(m.panels[0].paths).toHaveLength(3)
    expect(m.panels[0].texts.some((t) => t.size === 20)).toBe(true)
  })
  it('refuses a pie with more than 12 slices', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ mode: `m${i}`, trips: 1, scenario: 'a', hour: 0, notes: '' }))
    expect(build({ mark: 'pie', enc: { color: { f: 'mode' }, size: { f: 'trips' } } }, many).problem).toContain('12 slices or fewer')
  })
  it('draws a heatmap cell per pair', () => {
    const m = ok(build({ mark: 'heatmap', enc: { x: { f: 'mode' }, y: { f: 'scenario' }, color: { f: 'trips', agg: 'sum' } } }))
    expect(m.panels[0].rects).toHaveLength(6)
  })
  it('draws scatter points', () => {
    const m = ok(build({ mark: 'scatter', enc: { x: { f: 'hour' }, y: { f: 'trips' } } }))
    expect(m.panels[0].paths).toHaveLength(rows.length)
  })
  it('draws a box per category', () => {
    const m = ok(build({ mark: 'box', enc: { x: { f: 'mode' }, y: { f: 'trips' } } }))
    expect(m.panels[0].rects).toHaveLength(3)
  })
})

describe('axis labels', () => {
  it('labels a narrow axis with enough decimals to tell ticks apart', () => {
    expect([12.4, 12.45, 12.5].map((v) => fmtTick(v, 0.05))).toEqual(['12.40', '12.45', '12.50'])
    expect(fmtTick(12000, 2000)).toBe('12k')
  })
})

describe('more marks and channels', () => {
  it('fills a waffle with exactly 100 squares, split by share', () => {
    const m = ok(build({ mark: 'waffle', enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } }))
    expect(m.panels[0].rects).toHaveLength(100)
    expect(m.legend[0].items).toHaveLength(3)
  })
  it('refuses a waffle with more than 12 groups', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ mode: `m${i}`, trips: 1, scenario: 'a', hour: 0, notes: '' }))
    expect(build({ mark: 'waffle', enc: { color: { f: 'mode' }, size: { f: 'trips' } } }, many).problem).toContain('12 groups or fewer')
  })
  it('draws a tick per row, banded by the category', () => {
    const m = ok(build({ mark: 'tick', enc: { x: { f: 'trips' }, y: { f: 'mode' } } }))
    expect(m.panels[0].rects).toHaveLength(rows.length)
    const one = ok(build({ mark: 'tick', enc: { x: { f: 'trips' } } }))
    expect(one.panels[0].rects).toHaveLength(rows.length)
  })
  it('writes the aggregated number in each cell of a text table', () => {
    const m = ok(build({ mark: 'text', enc: { x: { f: 'mode' }, y: { f: 'scenario' }, label: { f: 'trips', agg: 'sum' } } }))
    expect(m.panels[0].rects).toHaveLength(6)
    expect(m.panels[0].texts.some((t) => t.t === '46')).toBe(true)
  })
  it('splits a line by a detail field without adding a legend', () => {
    const m = ok(build({ mark: 'line', enc: { x: { f: 'hour' }, y: { f: 'trips', agg: 'sum' }, detail: { f: 'mode' } } }))
    expect(m.panels[0].paths.filter((p) => p.d && p.fill === 'none' && p.sw > 2)).toHaveLength(3)
    expect(m.legend).toHaveLength(0)
  })
  it('fades scatter points by an opacity number and labels sparse points', () => {
    const m = ok(build({ mark: 'scatter', enc: { x: { f: 'hour' }, y: { f: 'trips' }, opacity: { f: 'trips' }, label: { f: 'mode' } } }))
    const ops = m.panels[0].paths.map((p) => p.op)
    expect(Math.min(...ops)).toBeLessThan(Math.max(...ops))
    expect(m.panels[0].texts.some((t) => t.t === 'Car')).toBe(true)
  })
})

describe('density, rule, treemap and radar', () => {
  it('draws one density curve per series, each an area and a line', () => {
    const m = ok(build({ mark: 'density', enc: { x: { f: 'trips' }, color: { f: 'scenario' } } }))
    expect(m.panels[0].paths.filter((p) => p.fill !== 'none')).toHaveLength(2)
    expect(m.legend[0].items).toHaveLength(2)
  })
  it('draws a rule and a mean dot per category, from raw rows or DuckDB ranges', () => {
    const m = ok(build({ mark: 'rule', enc: { x: { f: 'trips' }, y: { f: 'mode' } } }))
    expect(m.panels[0].paths).toHaveLength(3)
    const pre = ['Car', 'Bus', 'Walk'].map((mode) => ({ mode, __lo: 1, __hi: 9, __mean: 5, __n: 4 }))
    const p = ok(build({ mark: 'rule', enc: { x: { f: 'trips' }, y: { f: 'mode' } } }, pre))
    expect(p.panels[0].paths).toHaveLength(3)
  })
  it('tiles a treemap by share, one tile per group', () => {
    const m = ok(build({ mark: 'treemap', enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } }))
    expect(m.panels[0].rects).toHaveLength(3)
    const area = m.panels[0].rects.reduce((a, r) => a + (r.w + 2) * (r.h + 2), 0)
    expect(area).toBeGreaterThan(0.9 * (700 - 4) * (400 - 8 - 4))
  })
  it('draws a radar polygon per series and refuses fewer than 3 spokes', () => {
    const m = ok(build({ mark: 'radar', enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' }, color: { f: 'scenario' } } }))
    expect(m.panels[0].paths.filter((p) => p.fill !== 'none' && p.sw === 0)).toHaveLength(2)
    expect(build({ mark: 'radar', enc: { x: { f: 'scenario' }, y: { f: 'trips' } } }).problem).toContain('3 to 16 spokes')
  })
})

describe('sunburst, sankey, chord and trail', () => {
  it('draws a sunburst ring slice per colour value and a second ring per detail value', () => {
    const one = ok(build({ mark: 'sunburst', enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } }))
    expect(one.panels[0].paths).toHaveLength(3)
    const two = ok(build({ mark: 'sunburst', enc: { color: { f: 'mode' }, detail: { f: 'scenario' }, size: { f: 'trips', agg: 'sum' } } }))
    expect(two.panels[0].paths).toHaveLength(3 + 6)
    expect(two.legend).toHaveLength(1)
  })
  it('draws a sankey band per from and to pair, with a node on each side', () => {
    const m = ok(build({ mark: 'sankey', enc: { x: { f: 'scenario' }, y: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } }))
    expect(m.panels[0].paths).toHaveLength(6)
    expect(m.panels[0].rects).toHaveLength(2 + 3)
  })
  it('draws a chord ribbon per pair and an arc per category', () => {
    const m = ok(build({ mark: 'chord', enc: { x: { f: 'scenario' }, y: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } }))
    expect(m.panels[0].paths).toHaveLength(6 + 5)
  })
  it('refuses a sankey or chord with too many categories', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ mode: `m${i}`, scenario: `s${i}`, trips: 1, hour: 0, notes: '' }))
    expect(build({ mark: 'chord', enc: { x: { f: 'scenario' }, y: { f: 'mode' }, size: { f: 'trips' } } }, many).problem).toContain('24 categories or fewer')
    expect(build({ mark: 'sankey', enc: { x: { f: 'scenario' }, y: { f: 'mode' }, size: { f: 'trips' } } }, many).problem).toBeUndefined()
  })
  it('joins trail points in the order of the order field', () => {
    const pts = [3, 1, 2].map((h) => ({ hour: h, trips: h * 10, scenario: 'a', mode: 'Car', notes: '' }))
    const m = ok(build({ mark: 'trail', enc: { x: { f: 'hour' }, y: { f: 'trips' }, order: { f: 'hour' } } }, pts))
    const line = m.panels[0].paths.find((p) => p.fill === 'none' && p.sw === 2)!
    const xs = Array.from(line.d.matchAll(/(?:M|L)([\d.-]+) /g)).map((x) => Number(x[1]))
    expect(xs).toEqual(xs.slice().sort((a, b) => a - b))
    expect(m.panels[0].paths.filter((p) => p.tip)).toHaveLength(3)
  })
})

describe('data handling', () => {
  it('makes a panel per facet value', () => {
    const m = ok(build({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' }, column: { f: 'scenario' } } }))
    expect(m.panels).toHaveLength(2)
  })
  it('skips rows with a missing value in a used field', () => {
    const m = ok(build({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } }, [{ mode: 'Car', trips: null }, { mode: 'Bus', trips: 5 }]))
    expect(m.rows).toBe(1)
  })
  it('applies the chart filter and reports when nothing is left', () => {
    expect(build({ enc: { x: { f: 'mode' }, y: { f: 'trips' } }, filter: { f: 'scenario', v: 'zzz' } }).problem).toContain('No rows')
  })
  it('flags more than 15 series', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ mode: 'Car', trips: 1, scenario: `s${i}`, hour: 0, notes: '' }))
    expect(ok(build({ enc: { x: { f: 'mode' }, y: { f: 'trips' }, color: { f: 'scenario' } } }, many)).limitedSeries).toBe(true)
  })
})
