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
    expect(shelfProblem(defaultSpec({ mark: 'box', enc: { x: { f: 'mode' } } }), cols)).toContain('Y axis needs a number')
  })
  it('explains a wrong role and a non-chartable column', () => {
    expect(shelfProblem(defaultSpec({ mark: 'box', enc: { x: { f: 'mode' }, y: { f: 'mode' } } }), cols)).toContain('Y axis takes a number, but mode is a category')
    expect(shelfProblem(defaultSpec({ enc: { x: { f: 'notes' }, y: { f: 'trips' } } }), cols)).toContain('not chartable yet')
    // a bar chart is one category and one number, in either order
    expect(shelfProblem(defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'scenario' } } }), cols)).toContain('both categories')
    expect(shelfProblem(defaultSpec({ enc: { x: { f: 'hour' }, y: { f: 'trips' } } }), cols)).toContain('both numbers')
    expect(shelfProblem(defaultSpec({ enc: { x: { f: 'trips' }, y: { f: 'mode' } } }), cols)).toBeNull()
  })
})

describe('bar', () => {
  const enc = { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' as const }, color: { f: 'scenario' } }
  it('draws one bar per category and series when grouped', () => {
    const m = ok(build({ enc }))
    expect(m.panels[0].rects).toHaveLength(6)
    expect(m.legend[0].items.map((i) => i.label)).toEqual(['a', 'b'])
  })
  it('keeps every tooltip legal in XML (the SVG export writes it into an attribute) and splits labels that contain "="', () => {
    const eq = rows.map((r) => ({ ...r, mode: r.mode === 'Car' ? 'Autos >= Workers' : r.mode }))
    const m = ok(build({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } }, eq))
    const tips = m.panels[0].rects.map((r) => r.tip)
    for (const t of tips) expect(t).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/)
    const car = tips.find((t) => t.startsWith('Autos >= Workers'))!
    const [, pair] = car.split('~')
    expect(pair.split('\u2063')[0]).toBe('trips')
  })
  it('totals values per bar', () => {
    const m = ok(build({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } }))
    const total = [0, 1, 2, 3].reduce((s, h) => s + 10 + h, 0) + [0, 1, 2, 3].reduce((s, h) => s + 15 + h, 0)
    expect(m.panels[0].rects[0].tip).toBe(`Bus~trips\u2063${total}`)
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
  it('builds a pivot table with totals for a text table', () => {
    const m = ok(build({ mark: 'text', enc: { y: { f: 'scenario' }, x: { f: 'mode' }, label: { f: 'trips', agg: 'sum' } } }))
    const t = m.tables![0]
    expect(t.val(0, [], [])).toBe(rows.reduce((p, r) => p + r.trips, 0))
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
  it('cuts the legend at the configured number of values and reports the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ mode: 'Car', trips: 1, scenario: `s${i}`, hour: 0, notes: '' }))
    const spec = defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'trips' }, color: { f: 'scenario' } } })
    const m = ok(buildChart({ spec, cols, rows: many, theme, width: 600, height: 400, hot: null, legendSeries: 4 }))
    expect(m.limitedSeries).toBe(true)
    expect(m.seriesLimit).toBe(4)
    expect(ok(buildChart({ spec, cols, rows: many, theme, width: 600, height: 400, hot: null })).seriesLimit).toBe(15)
  })
  it('flags more than 15 series', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ mode: 'Car', trips: 1, scenario: `s${i}`, hour: 0, notes: '' }))
    expect(ok(build({ enc: { x: { f: 'mode' }, y: { f: 'trips' }, color: { f: 'scenario' } } }, many)).limitedSeries).toBe(true)
  })
})

describe('data labels', () => {
  const texts = (m: Drawn) => m.panels[0].texts.map((t) => t.t)
  const bars = { mark: 'bar' as const, enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' as const } } }
  it('are off on bars and lines until asked for', () => {
    expect(ok(build(bars)).panels[0].texts.some((t) => t.halo)).toBe(false)
    expect(ok(build({ mark: 'line', enc: { x: { f: 'hour' }, y: { f: 'trips', agg: 'sum' } } })).panels[0].texts.some((t) => t.halo)).toBe(false)
  })
  it('put the value above each bar, with a halo so it reads over gridlines', () => {
    const m = ok(build({ ...bars, labels: 'value' }))
    const labels = m.panels[0].texts.filter((t) => t.halo)
    // sum of trips per mode: 4 hours x (10..13) per scenario, both scenarios
    expect(labels.map((t) => t.t).sort()).toEqual(['112', '112', '112'])
    expect(labels.every((t) => t.anchor === 'middle')).toBe(true)
  })
  it('go inside the segments of a stacked bar when they are tall enough', () => {
    const m = ok(build({ mark: 'bar', stack: 'stack', labels: 'value', enc: { x: { f: 'scenario' }, y: { f: 'trips', agg: 'sum' }, color: { f: 'mode' } } }))
    // each mode's trips per scenario: 46 for a, 66 for b
    expect(m.panels[0].texts.filter((t) => t.t === '46' || t.t === '66')).toHaveLength(6)
  })
  it('turn upright over narrow grouped bars, and are left off when even that does not fit', () => {
    const many = Array.from({ length: 90 }, (_, i) => ({ mode: `m${i}`, trips: 1234567, scenario: 'a', hour: 0, notes: '' }))
    const m = ok(build({ ...bars, labels: 'value' }, many))
    expect(m.panels[0].texts.filter((t) => t.halo)).toHaveLength(0)
    // and the chart says so, so the setting does not look broken
    expect(m.labelsHidden).toBe(true)
    expect(ok(build({ ...bars, labels: 'value' })).labelsHidden).toBeUndefined()
  })
  it('go above the points of a line, thinned out when there are many', () => {
    const m = ok(build({ mark: 'line', labels: 'value', enc: { x: { f: 'hour' }, y: { f: 'trips', agg: 'sum' } } }))
    expect(m.panels[0].texts.filter((t) => t.halo)).toHaveLength(4)
    const long = Array.from({ length: 100 }, (_, i) => ({ mode: 'Car', trips: i, scenario: 'a', hour: i, notes: '' }))
    const thin = ok(build({ mark: 'line', labels: 'value', enc: { x: { f: 'hour' }, y: { f: 'trips', agg: 'sum' } } }, long))
    const shown = thin.panels[0].texts.filter((t) => t.halo).length
    expect(shown).toBeGreaterThan(0)
    expect(shown).toBeLessThanOrEqual(20)
  })
  it('show a pie slice as a share by default, and as a value, both, or not at all', () => {
    const pie = { mark: 'pie' as const, enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' as const } } }
    expect(texts(ok(build(pie)))).toContain('33%')
    expect(texts(ok(build({ ...pie, labels: 'value' })))).toContain('112')
    expect(texts(ok(build({ ...pie, labels: 'both' })))).toContain('112 \u00b7 33%')
    expect(texts(ok(build({ ...pie, labels: 'off' }))).some((t) => t.endsWith('%'))).toBe(false)
  })
})

describe('bar charts lying down', () => {
  const vertical = { mark: 'bar' as const, enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' as const } } }
  const lying = { mark: 'bar' as const, enc: { x: { f: 'trips', agg: 'sum' as const }, y: { f: 'mode' } } }
  it('draw the same bars wide instead of tall when the number is on X', () => {
    const v = ok(build(vertical)).panels[0].rects, h = ok(build(lying)).panels[0].rects
    expect(h).toHaveLength(v.length)
    expect(h.every((r) => r.h < r.w)).toBe(true)
    expect(v.every((r) => r.h > r.w)).toBe(true)
    // a vertical bar's height and a lying bar's length carry the same number
    expect(Math.max(...h.map((r) => r.w))).toBeGreaterThan(300)
  })
  it('keep the category names on the left and the number scale along the bottom', () => {
    const m = ok(build(lying)).panels[0]
    expect(m.texts.filter((t) => t.anchor === 'end').map((t) => t.t).sort()).toEqual(['Bus', 'Car', 'Walk'])
    expect(m.lines.some((l) => l.x1 === l.x2)).toBe(true)
  })
  it('say so when a coloured group of bars is too thin to carry labels', () => {
    const many = ok(build({ mark: 'bar', labels: 'value', enc: { x: { f: 'trips', agg: 'sum' }, y: { f: 'mode' }, color: { f: 'scenario' } } }, Array.from({ length: 200 }, (_, i) => ({ mode: `m${i}`, trips: 5, scenario: i % 2 ? 'a' : 'b', hour: 0, notes: '' }))))
    expect(many.labelsHidden).toBe(true)
  })
  it('stack, label and draw a reference line like standing bars', () => {
    const stacked = ok(build({ mark: 'bar', stack: 'stack', labels: 'value', enc: { x: { f: 'trips', agg: 'sum' }, y: { f: 'scenario' }, color: { f: 'mode' } } }))
    expect(stacked.panels[0].texts.filter((t) => t.t === '46' || t.t === '66')).toHaveLength(6)
    const grouped = ok(build({ ...lying, labels: 'value', ref: '100' }))
    expect(grouped.panels[0].texts.filter((t) => t.halo).map((t) => t.t)).toEqual(['112', '112', '112'])
    expect(grouped.panels[0].texts.some((t) => t.t.startsWith('Reference'))).toBe(true)
  })
})

describe('axis titles and pie options', () => {
  const texts = (m: Drawn) => m.panels.flatMap((p) => p.texts)
  const bar = { mark: 'bar' as const, enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' as const } } }
  it('draw axis titles only when asked, under the axis and along the left edge', () => {
    expect(texts(ok(build(bar))).some((t) => t.t === 'trips')).toBe(false)
    const m = ok(build({ ...bar, axisTitles: true }))
    const x = texts(m).find((t) => t.t === 'mode')!, y = texts(m).find((t) => t.t === 'trips')!
    expect(x.anchor).toBe('middle')
    expect(y.tf).toContain('rotate(-90')
    // the titles sit outside the plot area, so the bars are still drawn clear of them
    expect(Math.max(...m.panels[0].rects.map((r) => r.y + r.h))).toBeLessThan(x.y - 10)
    expect(Math.min(...m.panels[0].rects.map((r) => r.x))).toBeGreaterThan(y.x + 6)
  })
  it('use the typed title in place of the field name, and Count for a histogram', () => {
    expect(texts(ok(build({ ...bar, axisTitles: true, xTitle: 'Travel mode' }))).some((t) => t.t === 'Travel mode')).toBe(true)
    expect(texts(ok(build({ mark: 'histogram', axisTitles: true, enc: { x: { f: 'hour' } } }))).some((t) => t.t === 'Count')).toBe(true)
  })
  it('never put axis titles on a chart without axes', () => {
    const pie = { mark: 'pie' as const, axisTitles: true, enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' as const } } }
    expect(texts(ok(build(pie))).some((t) => t.t === 'trips')).toBe(false)
  })
  const uneven: Row[] = [['A', 100], ['B', 60], ['C', 3], ['D', 2]].map(([mode, trips]) => ({ scenario: 'a', mode, hour: 0, trips, notes: 'x' }))
  const pie = { mark: 'pie' as const, enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' as const } } }
  it('fold small pie slices into one Other slice', () => {
    expect(ok(build(pie, uneven)).panels[0].paths).toHaveLength(4)
    const m = ok(build({ ...pie, pie: { other: 5, hole: 58 } }, uneven))
    expect(m.panels[0].paths).toHaveLength(3)
    expect(m.panels[0].paths.some((p) => p.tip.startsWith('Other~'))).toBe(true)
    // a single small slice is not renamed
    const one = ok(build({ ...pie, pie: { other: 2.5, hole: 58 } }, uneven.slice(0, 3)))
    expect(one.panels[0].paths.some((p) => p.tip.startsWith('Other~'))).toBe(false)
  })
  it('order slices by size and size the donut hole', () => {
    const first = (m: Drawn) => m.panels[0].paths[0].tip.split('~')[0]
    expect(first(ok(build({ ...pie, sort: 'low' }, uneven)))).toBe('D')
    expect(first(ok(build({ ...pie, sort: 'high' }, uneven)))).toBe('A')
    const area = (hole: number) => ok(build({ ...pie, donut: true, pie: { other: 0, hole } }, uneven)).panels[0].paths[0].d
    expect(area(72)).not.toBe(area(42))
  })
})
