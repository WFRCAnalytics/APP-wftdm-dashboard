import { describe, expect, it } from 'vitest'
import { buildChart, type Col, type Row } from '../../src/charts/builder/compile.ts'
import { chartQuery } from '../../src/charts/builder/specToSql.ts'
import { defaultSpec } from '../../src/charts/builder/spec.ts'
import type { ChartTheme } from '../../src/charts/types.ts'

const rel = 'SELECT * FROM "base__trips"'
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('chartQuery: aggregated marks', () => {
  it('groups by x and series and applies the aggregate in DuckDB', () => {
    const c = chartQuery(defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'mean' }, color: { f: 'scenario' } } }), rel)
    expect(c.mode).toBe('aggregated')
    expect(norm(c.sql)).toContain('SELECT "mode", "scenario", AVG(CAST("trips" AS DOUBLE)) AS "trips" FROM ( SELECT * FROM "base__trips" ) AS r')
    expect(norm(c.sql)).toContain('GROUP BY "mode", "scenario"')
  })
  it('resets the aggregate so the drawn rows are totalled once', () => {
    const c = chartQuery(defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'median' } } }), rel)
    expect(c.spec.enc.y?.agg).toBe('sum')
  })
  it('counts with COUNT and adds facets and a chart filter', () => {
    const c = chartQuery(defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'count' }, column: { f: 'scenario' } }, filter: { f: 'purpose', v: "it's" } }), rel)
    expect(c.sql).toContain('COUNT("trips") AS "trips"')
    expect(c.sql).toContain(`CAST("purpose" AS VARCHAR) = 'it''s'`)
    expect(c.sql).toContain('GROUP BY "mode", "scenario"')
  })
  it('skips rows with missing values in the used fields', () => {
    const c = chartQuery(defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'trips' } } }), rel)
    expect(c.sql).toContain('"mode" IS NOT NULL AND "trips" IS NOT NULL')
  })
  it('groups a heatmap by both axes and a pie by its slices', () => {
    const h = chartQuery(defaultSpec({ mark: 'heatmap', enc: { x: { f: 'a' }, y: { f: 'b' }, color: { f: 'v', agg: 'sum' } } }), rel)
    expect(norm(h.sql)).toContain('SELECT "a", "b", SUM(CAST("v" AS DOUBLE)) AS "v"')
    const p = chartQuery(defaultSpec({ mark: 'pie', enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } }), rel)
    expect(norm(p.sql)).toContain('GROUP BY "mode"')
    expect(p.spec.enc.size?.agg).toBe('sum')
  })
  it('groups a text table by both axes and a waffle like a pie; a detail field splits a line', () => {
    const x = chartQuery(defaultSpec({ mark: 'text', enc: { x: { f: 'a' }, y: { f: 'b' }, label: { f: 'v', agg: 'mean' } } }), rel)
    expect(norm(x.sql)).toContain('SELECT "a", "b", AVG(CAST("v" AS DOUBLE)) AS "v"')
    expect(x.spec.enc.label?.agg).toBe('sum')
    const w = chartQuery(defaultSpec({ mark: 'waffle', enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } }), rel)
    expect(norm(w.sql)).toContain('GROUP BY "mode"')
    const l = chartQuery(defaultSpec({ mark: 'line', enc: { x: { f: 'a' }, y: { f: 'v', agg: 'sum' }, detail: { f: 'g' } } }), rel)
    expect(norm(l.sql)).toContain('GROUP BY "a", "g"')
  })
  it('caps the result', () => {
    expect(chartQuery(defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'trips' } } }), rel).sql).toContain('LIMIT 50001')
  })
})

describe('chartQuery: histogram, box and scatter', () => {
  it('bins in DuckDB and returns counts with the true range', () => {
    const c = chartQuery(defaultSpec({ mark: 'histogram', enc: { x: { f: 'trips' }, color: { f: 'scenario' } } }), rel)
    expect(c.mode).toBe('histogram')
    expect(c.sql).toContain('count(*) AS __n')
    expect(c.sql).toContain('any_value(mm.lo) AS __lo')
    expect(c.sql).toContain('GROUP BY 1, r0."scenario"')
  })
  it('computes quartiles and whiskers in DuckDB', () => {
    const c = chartQuery(defaultSpec({ mark: 'box', enc: { x: { f: 'mode' }, y: { f: 'trips' } } }), rel)
    expect(c.mode).toBe('box')
    expect(c.sql).toContain('quantile_cont(y, 0.25) AS q1')
    expect(c.sql).toContain('AS __wl')
    expect(c.sql).toContain('AS __out')
  })
  it('samples scatter points repeatably', () => {
    const c = chartQuery(defaultSpec({ mark: 'scatter', enc: { x: { f: 'a' }, y: { f: 'b' } } }), rel)
    expect(c.mode).toBe('raw')
    expect(c.sql).toContain('USING SAMPLE 5000 ROWS (reservoir, 42)')
  })
})

const theme = { ink: '#111', mute: '#666', line: '#ccc', grid: '#eee', surface: '#fff', font: 'x', fs: 11, r: 5, dark: false, tokens: { c1: '#2fa598' }, mode: (n: string) => n, cat: (i: number) => `c${i}`, ramp: () => [], neutral: () => '#888', diverge: () => '#888', mix: (a: string) => a, onColor: () => '#000' } as unknown as ChartTheme
const draw = (spec: ReturnType<typeof defaultSpec>, cols: Col[], rows: Row[]) => buildChart({ spec, cols, rows, theme, width: 700, height: 400, hot: null })

describe('the compiler reads DuckDB results', () => {
  it('draws a pre-binned histogram with weighted counts', () => {
    const cols: Col[] = [{ name: 'trips', type: 'integer' }]
    const rows: Row[] = [0, 1, 2].map((b) => ({ trips: 5 + b * 10, __n: 4 + b, __lo: 0, __hi: 120 }))
    const m = draw(defaultSpec({ mark: 'histogram', enc: { x: { f: 'trips' } } }), cols, rows)
    if (m.problem !== undefined) throw new Error(m.problem)
    expect(m.panels[0].rects).toHaveLength(3)
    expect(m.panels[0].rects.map((r) => r.tip.split('=')[1])).toEqual(['4', '5', '6'])
  })
  it('draws boxes from precomputed statistics', () => {
    const cols: Col[] = [{ name: 'mode', type: 'category' }, { name: 'trips', type: 'integer' }]
    const rows: Row[] = [
      { mode: 'Car', __q1: 10, __md: 20, __q3: 30, __wl: 2, __wh: 40, __n: 50, __out: '[90.0, 95.5]' },
      { mode: 'Bus', __q1: 5, __md: 8, __q3: 12, __wl: 1, __wh: 20, __n: 40, __out: null },
    ]
    const m = draw(defaultSpec({ mark: 'box', enc: { x: { f: 'mode' }, y: { f: 'trips' } } }), cols, rows)
    if (m.problem !== undefined) throw new Error(m.problem)
    expect(m.panels[0].rects).toHaveLength(2)
    expect(m.panels[0].paths).toHaveLength(2)
    expect(m.panels[0].rects[0].tip).toContain('median=8')
  })
})
