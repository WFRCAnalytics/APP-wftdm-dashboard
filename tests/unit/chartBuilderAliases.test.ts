import { describe, expect, it } from 'vitest'
import { buildChart, type ChartModel, type Col, type Row } from '../../src/charts/builder/compile.ts'
import { defaultSpec, fromConfig, toConfig } from '../../src/charts/builder/spec.ts'
import type { ChartTheme } from '../../src/charts/types.ts'

const theme = {
  ink: '#111111', mute: '#666666', line: '#cccccc', grid: '#eeeeee', surface: '#ffffff', font: 'sans-serif', fs: 11, r: 5, dark: false,
  tokens: { c1: '#2fa598' }, mode: (n: string) => `mode:${n}`, cat: (i: number) => `cat:${i}`, ramp: () => [], neutral: () => '#888888',
  diverge: () => '#888888', mix: (_a: string, b: string) => `grey:${b}`, onColor: () => '#000000',
} as unknown as ChartTheme
const cols: Col[] = [{ name: 'kind', type: 'category' }, { name: 'trips', type: 'integer' }, { name: 'year', type: 'category' }]
const rows: Row[] = []
for (const year of ['2020', '2030']) for (const [kind, n] of Object.entries({ A: 100, B: 60, C: 30 })) rows.push({ kind, year, trips: n })

type Drawn = Exclude<ChartModel, { problem: string }>
const ok = (m: ChartModel): Drawn => { if (m.problem !== undefined) throw new Error(m.problem); return m as Drawn }
const enc = { x: { f: 'year' }, y: { f: 'trips', agg: 'sum' as const }, color: { f: 'kind' } }
const build = (over: Parameters<typeof defaultSpec>[0]) => ok(buildChart({ spec: defaultSpec({ enc, ...over }), cols, rows, theme, width: 700, height: 400, hot: null }))

describe('field names', () => {
  it('uses a field name on the axis title, and keeps it through export and import', () => {
    const m = build({ axisTitles: true, aliases: { year: 'Model year' } })
    expect(m.panels[0].texts.some((t) => t.t === 'Model year')).toBe(true)
    const spec = defaultSpec({ enc, aliases: { year: 'Model year' } })
    const cfg = toConfig(spec, { relation: 't:x', scenarios: [], sql: '', typeOf: () => 'category' })
    const back = fromConfig(JSON.stringify(cfg), { scenarios: [], columnsOf: () => cols.map(({ name }) => ({ name })) })
    expect(back.ok && back.spec.aliases).toEqual({ year: 'Model year' })
  })
})
