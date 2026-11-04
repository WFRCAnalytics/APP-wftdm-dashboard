import { describe, expect, it } from 'vitest'
import { buildChart, type ChartModel, type Col, type Row } from '../../src/charts/builder/compile.ts'
import { foldOther, OTHER } from '../../src/charts/builder/other.ts'
import { OTHER_DEFAULTS, defaultSpec, fromConfig, toConfig } from '../../src/charts/builder/spec.ts'
import type { ChartTheme } from '../../src/charts/types.ts'

const theme = {
  ink: '#111111', mute: '#666666', line: '#cccccc', grid: '#eeeeee', surface: '#ffffff', font: 'sans-serif', fs: 11, r: 5, dark: false,
  tokens: { c1: '#2fa598' }, mode: (n: string) => `mode:${n}`, cat: (i: number) => `cat:${i}`, ramp: () => [], neutral: () => '#888888',
  diverge: () => '#888888', mix: (_a: string, b: string) => `grey:${b}`, onColor: () => '#000000',
} as unknown as ChartTheme
const cols: Col[] = [{ name: 'kind', type: 'category' }, { name: 'trips', type: 'integer' }, { name: 'year', type: 'category' }]
const sizes: Record<string, number> = { A: 100, B: 60, C: 30, D: 6, E: 4 }
const rows: Row[] = []
for (const year of ['2020', '2030']) for (const [kind, n] of Object.entries(sizes)) rows.push({ kind, year, trips: n })

const total = (rs: Row[], k: string) => rs.filter((r) => r.kind === k).reduce((a, r) => a + r.trips, 0)
type Drawn = Exclude<ChartModel, { problem: string }>
const ok = (m: ChartModel): Drawn => { if (m.problem !== undefined) throw new Error(m.problem); return m as Drawn }
const enc = { x: { f: 'year' }, y: { f: 'trips', agg: 'sum' as const }, color: { f: 'kind' } }
const build = (over: Parameters<typeof defaultSpec>[0]) => ok(buildChart({ spec: defaultSpec({ enc, ...over }), cols, rows, theme, width: 700, height: 400, hot: null }))

describe('folding small values into Other', () => {
  it('keeps the largest N and adds the rest together', () => {
    const f = foldOther(rows, 'kind', 'trips', { mode: 'top', n: 2, pct: 3 })
    expect(f.folded).toBe(3)
    expect(new Set(f.rows.map((r) => r.kind))).toEqual(new Set(['A', 'B', OTHER]))
    expect(total(f.rows, OTHER)).toBe(2 * (30 + 6 + 4))
    expect(f.rows.filter((r) => r.kind === OTHER)).toHaveLength(2)
  })

  it('folds the values under a share of the total', () => {
    expect(new Set(foldOther(rows, 'kind', 'trips', { mode: 'percent', n: 6, pct: 5 }).rows.map((r) => r.kind))).toEqual(new Set(['A', 'B', 'C', OTHER]))
    // a single small value is left as it is
    expect(foldOther(rows, 'kind', 'trips', { mode: 'percent', n: 6, pct: 3 }).folded).toBe(0)
  })

  it('auto keeps seven and only acts when there are more than eight values', () => {
    expect(foldOther(rows, 'kind', 'trips', { mode: 'auto', n: 6, pct: 3 }).folded).toBe(0)
    const many = Array.from({ length: 12 }, (_v, i) => ({ kind: `k${i}`, year: '2020', trips: 100 - i }))
    const f = foldOther(many, 'kind', 'trips', { mode: 'auto', n: 6, pct: 3 })
    expect(f.folded).toBe(5)
    expect(new Set(f.rows.map((r) => r.kind)).size).toBe(8)
  })

  it('does nothing when off', () => {
    expect(foldOther(rows, 'kind', 'trips', { ...OTHER_DEFAULTS }).rows).toBe(rows)
  })
})

describe('Other in a drawn chart', () => {
  it('puts Other last in grey and says how many values it holds', () => {
    const m = build({ other: { mode: 'top', n: 2, pct: 3 } })
    expect(m.othered).toBe(3)
    expect(m.legend[0].items.map((i) => i.label)).toEqual(['A', 'B', OTHER])
    expect(m.legend[0].items[2].fill).toContain('grey')
  })

  it('keeps the setting through export and import', () => {
    const spec = defaultSpec({ enc, other: { mode: 'percent', n: 6, pct: 4 } })
    const cfg = toConfig(spec, { relation: 't:x', scenarios: [], sql: '', typeOf: () => 'category' })
    expect(cfg.other).toEqual({ mode: 'percent', percent: 4 })
    const back = fromConfig(JSON.stringify(cfg), { scenarios: [], columnsOf: () => cols.map(({ name }) => ({ name })) })
    expect(back.ok && back.spec.other).toEqual({ mode: 'percent', n: 6, pct: 4 })
  })

  it('leaves the chart alone for an average, which cannot be added up', () => {
    const m = build({ other: { mode: 'top', n: 2, pct: 3 }, enc: { ...enc, y: { f: 'trips', agg: 'mean' } } })
    expect(m.othered).toBeUndefined()
  })
})
