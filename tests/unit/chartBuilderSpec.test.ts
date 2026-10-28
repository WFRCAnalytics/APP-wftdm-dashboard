import { describe, expect, it } from 'vitest'
import { assignField, defaultSpec, fromConfig, swapAxes, switchMark, toConfig } from '../../src/charts/builder/spec.ts'
import { suggest } from '../../src/charts/builder/rules.ts'
import type { Role } from '../../src/charts/builder/columnTypes.ts'

const ROLES: Record<string, Role> = { mode: 'n', trips: 'q', hour: 'q', scenario: 'n', notes: '', day: 't' }
const roleOf = (f: string) => ROLES[f] ?? ''

describe('assignField', () => {
  it('places a number on y with a default sum', () => {
    const r = assignField(defaultSpec(), 'y', 'trips', 'integer', 'q')
    expect(r.ok && r.spec.enc.y).toEqual({ f: 'trips', agg: 'sum' })
  })
  it('refuses a role the channel does not take, with the reason', () => {
    const r = assignField(defaultSpec({ mark: 'box' }), 'y', 'mode', 'category', 'n')
    expect(r).toEqual({ ok: false, reason: 'mode is a category. Y axis takes a number.' })
  })
  it('refuses text columns because they have no chart role yet', () => {
    const r = assignField(defaultSpec(), 'x', 'notes', 'text', '')
    expect(r.ok).toBe(false)
  })
  it('refuses a channel the mark does not use', () => {
    expect(assignField(defaultSpec({ mark: 'pie' }), 'x', 'mode', 'category', 'n').ok).toBe(false)
  })
})

describe('switchMark', () => {
  it('keeps compatible encodings and reports what was dropped', () => {
    const spec = defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' }, pattern: { f: 'scenario' } } })
    const r = switchMark(spec, 'line', roleOf)
    expect(r.spec.enc.pattern).toBeUndefined()
    expect(r.dropped).toEqual(['x', 'pattern'])
    expect(r.spec.enc.y?.f).toBe('trips')
  })
  it('turns an overlap area into a stack', () => {
    expect(switchMark(defaultSpec(), 'area', roleOf).spec.stack).toBe('stack')
  })
})

describe('suggest', () => {
  const fit = (enc: Record<string, { f: string }>, distinct = 5) => suggest(defaultSpec({ enc }), roleOf, () => distinct)
  it('offers everything when nothing is placed', () => {
    const s = suggest(defaultSpec(), roleOf, () => 0)
    expect(s.best).toBeNull()
    expect(Object.values(s.byMark).every((x) => x.viable)).toBe(true)
  })
  it('ranks scatter first for two numbers and bar for a category and a number', () => {
    expect(fit({ x: { f: 'hour' }, y: { f: 'trips' } }).best).toBe('scatter')
    expect(fit({ x: { f: 'mode' }, y: { f: 'trips' } }).best).toBe('bar')
  })
  it('prefers a line for an ordered x', () => {
    expect(fit({ x: { f: 'day' }, y: { f: 'trips' } }).best).toBe('line')
  })
  it('keeps pie low and explains why it is not viable with too many slices', () => {
    const s = fit({ color: { f: 'mode' }, size: { f: 'trips' } }, 20)
    expect(s.byMark.pie.viable).toBe(false)
    expect(s.byMark.pie.reason).toContain('12 or fewer')
  })
  it('offers a text table for two categories and a number, and a tick strip for one number', () => {
    expect(fit({ x: { f: 'mode' }, y: { f: 'scenario' }, label: { f: 'trips' } }).byMark.text.viable).toBe(true)
    expect(fit({ x: { f: 'trips' } }).byMark.tick.viable).toBe(true)
    expect(fit({ x: { f: 'mode' } }).byMark.tick.viable).toBe(false)
  })
  it('offers density for one number and a treemap for a category and a number', () => {
    expect(fit({ x: { f: 'trips' } }).byMark.density.viable).toBe(true)
    expect(fit({ color: { f: 'mode' }, size: { f: 'trips' } }).byMark.treemap.viable).toBe(true)
    expect(fit({ x: { f: 'mode' } }).byMark.radar.viable).toBe(false)
  })
  it('offers sankey and chord for from, to and a number, and a trail for three numbers', () => {
    const f = fit({ x: { f: 'mode' }, y: { f: 'scenario' }, size: { f: 'trips' } })
    expect(f.byMark.sankey.viable && f.byMark.chord.viable).toBe(true)
    expect(f.byMark.trail.viable).toBe(false)
    expect(fit({ x: { f: 'hour' }, y: { f: 'trips' }, order: { f: 'day' } }).byMark.trail.viable).toBe(true)
  })
  it('needs a number for a histogram', () => {
    expect(fit({ x: { f: 'mode' } }).byMark.histogram.viable).toBe(false)
  })
})

describe('configuration', () => {
  const ctx = { scenarios: ['a', 'b'], columnsOf: (rel: string) => (rel === 't:trips' ? [{ name: 'mode' }, { name: 'trips' }, { name: 'scenario' }] : undefined) }
  const spec = defaultSpec({ enc: { x: { f: 'mode', agg: null }, y: { f: 'trips', agg: 'sum' } }, ref: '5' })
  spec.text.title = { t: 'Hello', size: 'xl', b: true, i: true }
  const cfg = toConfig(spec, { relation: 't:trips', scenarios: ['a'], sql: 'SELECT 1', typeOf: () => 'category' })
  it('round-trips a spec', () => {
    const r = fromConfig(JSON.stringify(cfg), ctx)
    expect(r.ok && r.spec).toEqual(spec)
    expect(r.ok && r.scenarios).toEqual(['a'])
  })
  it('lists each problem with its path', () => {
    const bad = { ...cfg, mark: 'map', data: { relation: 't:trips', source: { scenarios: ['zzz'], sql: '' } } }
    const r = fromConfig(JSON.stringify(bad), ctx)
    expect(!r.ok && r.errors.join(' ')).toContain('mark: "map" is not available yet')
    expect(!r.ok && r.errors.join(' ')).toContain('data.source.scenarios: not loaded here: zzz')
  })
  it('rejects unknown columns and non-JSON', () => {
    const r = fromConfig(JSON.stringify({ ...cfg, encoding: { x: { field: 'nope' } } }), ctx)
    expect(!r.ok && r.errors[0]).toContain('encoding.x.field: "nope" is not a column of t:trips')
    expect(fromConfig('{', ctx).ok).toBe(false)
  })
  it('reports a relation that does not exist', () => {
    const r = fromConfig(JSON.stringify({ ...cfg, data: { relation: 't:gone', source: { scenarios: ['a'], sql: '' } } }), ctx)
    expect(!r.ok && r.errors[0]).toContain('t:gone is not a table here')
  })
})

describe('data labels in a saved chart', () => {
  const ctx = { relation: 't:trips', scenarios: ['a'], sql: 'SELECT 1', typeOf: () => 'category' }
  const ictx = { scenarios: ['a'], columnsOf: () => [{ name: 'mode' }, { name: 'trips' }] }
  it('are saved only when chosen, and come back', () => {
    const plain = toConfig(defaultSpec({ mark: 'bar', enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } }), ctx)
    expect('labels' in plain).toBe(false)
    const spec = defaultSpec({ mark: 'bar', labels: 'value', enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } })
    const r = fromConfig(JSON.stringify(toConfig(spec, ctx)), ictx)
    expect(r.ok && r.spec.labels).toBe('value')
  })
  it('reject a mode that does not exist', () => {
    const cfg = { ...toConfig(defaultSpec({ mark: 'bar', enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } }), ctx), labels: 'sideways' }
    const r = fromConfig(JSON.stringify(cfg), ictx)
    expect(!r.ok && r.errors.join(' ')).toContain('labels: "sideways"')
  })
})

describe('swapAxes', () => {
  const info = (f: string) => (f === 'trips' || f === 'hour' ? { type: 'integer' as const, role: 'q' as const } : { type: 'category' as const, role: 'n' as const })
  it('turns columns into bars lying down, and back', () => {
    const r = swapAxes(defaultSpec({ mark: 'bar', enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } }), info)
    expect(r.ok && [r.spec.enc.x?.f, r.spec.enc.y?.f, r.spec.enc.x?.agg]).toEqual(['trips', 'mode', 'sum'])
    const back = r.ok ? swapAxes(r.spec, info) : r
    expect(back.ok && [back.spec.enc.x?.f, back.spec.enc.y?.f]).toEqual(['mode', 'trips'])
  })
  it('refuses to put a number on a category-only axis, and says why', () => {
    const r = swapAxes(defaultSpec({ mark: 'box', enc: { x: { f: 'mode' }, y: { f: 'trips' } } }), info)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain("Can't swap")
    expect(!r.ok && r.reason).toContain('takes')
  })
  it('swaps two numbers on a scatter plot', () => {
    const r = swapAxes(defaultSpec({ mark: 'scatter', enc: { x: { f: 'hour' }, y: { f: 'trips' } } }), info)
    expect(r.ok && [r.spec.enc.x?.f, r.spec.enc.y?.f]).toEqual(['trips', 'hour'])
  })
  it('swaps two categories on a heatmap or a table', () => {
    const r = swapAxes(defaultSpec({ mark: 'heatmap', enc: { x: { f: 'mode' }, y: { f: 'scenario' }, color: { f: 'trips', agg: 'sum' } } }), info)
    expect(r.ok && [r.spec.enc.x?.f, r.spec.enc.y?.f]).toEqual(['scenario', 'mode'])
  })
  it('moves a lone field only where its role fits, and refuses a mark that has no such shelf', () => {
    expect(swapAxes(defaultSpec({ mark: 'box', enc: { y: { f: 'trips' } } }), info).ok).toBe(false)
    const h = swapAxes(defaultSpec({ mark: 'histogram', enc: { x: { f: 'trips' } } }), info)
    expect(!h.ok && h.reason).toContain('not used by this chart')
    expect(swapAxes(defaultSpec({ mark: 'bar' }), info).ok).toBe(false)
  })
  it('keeps a number aggregate where the new shelf still uses one', () => {
    const r = swapAxes(defaultSpec({ mark: 'bar', enc: { x: { f: 'trips', agg: 'sum' }, y: { f: 'mode' } } }), info)
    expect(r.ok && [r.spec.enc.x?.f, r.spec.enc.y?.f, r.spec.enc.y?.agg]).toEqual(['mode', 'trips', 'sum'])
  })
})

describe('text, axis titles and pie options in the configuration', () => {
  const ctx = { relation: 't:trips', scenarios: ['a'], sql: 'SELECT 1', typeOf: () => 'category' }
  it('round-trips the tag, alt text, axis titles and pie options, and saves nothing for the defaults', () => {
    const plain = toConfig(defaultSpec({ mark: 'pie', enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } }), ctx)
    expect(plain.pie).toBeUndefined()
    expect(plain.alt).toBeUndefined()
    expect(plain.axes.titles).toBeUndefined()
    const spec = defaultSpec({ mark: 'pie', donut: true, axisTitles: true, xTitle: 'Mode', alt: 'Shares', pie: { other: 5, hole: 72 }, enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } })
    spec.text.tag = { t: 'DRAFT', size: 'xs', b: true, i: false }
    const r = fromConfig(JSON.stringify(toConfig(spec, ctx)), { scenarios: ['a'], columnsOf: () => [{ name: 'mode' }, { name: 'trips' }] })
    expect(r.ok && [r.spec.pie, r.spec.alt, r.spec.axisTitles, r.spec.xTitle, r.spec.text.tag.t]).toEqual([{ other: 5, hole: 72 }, 'Shares', true, 'Mode', 'DRAFT'])
  })
})
