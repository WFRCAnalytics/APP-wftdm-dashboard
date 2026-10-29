import { readdirSync, readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

import { KIND_SHAPE, kindFileName, SKELETON_SHAPES, skeletonShape, TYPE_SHAPE } from '../../src/panels/skeleton.ts'

describe('skeletonShape', () => {
  it('has a silhouette for every chart kind, so a new kind cannot be forgotten', () => {
    const kinds = readdirSync('src/charts/kinds')
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .map((f) => f.replace(/\.ts$/, ''))
    expect(kinds.length).toBeGreaterThan(20)
    expect(kinds.filter((k) => !(k in KIND_SHAPE))).toEqual([])
    expect(Object.keys(KIND_SHAPE).filter((k) => !kinds.includes(k))).toEqual([])
  })

  it('maps a chart panel by its kind and the other panel types by their type', () => {
    expect(skeletonShape({ type: 'chart', kind: 'sunburst' })).toBe('sunburst')
    expect(skeletonShape({ type: 'chart', kind: 'zoneMap' })).toBe('map')
    expect(skeletonShape({ type: 'chart', kind: 'nope' })).toBe('generic')
    for (const type of Object.keys(TYPE_SHAPE)) expect(skeletonShape({ type })).toBe(TYPE_SHAPE[type])
    expect(skeletonShape(undefined)).toBe('generic')
    expect(skeletonShape({ type: 'unknown-type' })).toBe('generic')
  })

  it('takes an observable-plot panel from its mark', () => {
    expect(skeletonShape({ type: 'observable-plot', mark: 'lineY' })).toBe('lines')
    expect(skeletonShape({ type: 'observable-plot', mark: 'barX' })).toBe('hbars')
    expect(skeletonShape({ type: 'observable-plot', mark: 'weird' })).toBe('bars')
  })

  it('takes a custom chart from its spec mark', () => {
    expect(skeletonShape({ type: 'chart', kind: 'custom', spec: { mark: 'pie' } })).toBe('donut')
    expect(skeletonShape({ type: 'chart', kind: 'custom', spec: { mark: 'text' } })).toBe('table')
    expect(skeletonShape({ type: 'chart', kind: 'custom' })).toBe('generic')
  })

  it('reads a kind the way a dashboard writes it (kebab case), not only as its file name', () => {
    expect(skeletonShape({ type: 'chart', kind: 'zone-map' })).toBe('map')
    expect(skeletonShape({ type: 'chart', kind: 'zone-diff-map' })).toBe('map')
    expect(skeletonShape({ type: 'chart', kind: 'rank-bars' })).toBe('hbars')
    expect(skeletonShape({ type: 'chart', kind: 'scorecard' })).toBe('table') // a table of scenarios x metrics, not a big-number tile
    expect(skeletonShape({ type: 'chart', kind: 'time-heat' })).toBe('heat')
    expect(skeletonShape({ type: 'chart', kind: 'purpose-radar' })).toBe('radar')
  })

  it('draws every silhouette it can name', () => {
    const drawn = new Set([...readFileSync('src/panels/PanelSkeleton.tsx', 'utf8').matchAll(/case '([a-z]+)':/g)].map((m) => m[1]))
    // `generic` is the switch's default branch
    expect(SKELETON_SHAPES.filter((s) => s !== 'generic' && !drawn.has(s))).toEqual([])
    const used = new Set<string>([...Object.values(KIND_SHAPE), ...Object.values(TYPE_SHAPE)])
    expect([...drawn].filter((s) => !(SKELETON_SHAPES as readonly string[]).includes(s))).toEqual([])
    // a silhouette nothing maps to is dead code (generic and the mark-derived ones are reached another way)
    expect(SKELETON_SHAPES.filter((s) => s !== 'generic' && s !== 'text' && !used.has(s) && !['bars', 'lines', 'area', 'heat', 'hbars'].includes(s))).toEqual([])
  })

  // The audit that stops the wrong silhouette reaching a panel: read the real dashboards and check every panel and view.
  describe('every panel in the shipped dashboards', () => {
    const NO_SKELETON = new Set(['explore-builder', 'graphic-walker']) // full-page builders: a plain block is the design
    const PANEL_TYPES = new Set([...Object.keys(TYPE_SHAPE), 'chart', 'multi-view', 'explore-builder']) // not an `inputs:` select or range
    const dirs = ['public/demo-dashboard-config', 'public/demo-synthetic/dashboard-config']
    const found: { file: string; path: string; node: Record<string, unknown> }[] = []
    const walk = (node: unknown, file: string, path: string) => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, file, `${path}[${i}]`))
      if (!node || typeof node !== 'object') return
      const o = node as Record<string, unknown>
      if (typeof o.type === 'string' && PANEL_TYPES.has(o.type) && (o.type !== 'multi-view' || Array.isArray(o.views))) found.push({ file, path, node: o })
      for (const [k, v] of Object.entries(o)) if (k === 'layout' || k === 'views' || typeof v === 'object') walk(v, file, `${path}.${k}`)
    }
    // the Test tab (dashboard-8-test.yaml) is deliberately broken, so it is not audited
    for (const dir of dirs)
      for (const f of readdirSync(dir).filter((n) => /^dashboard-\d.*\.yaml$/.test(n) && !n.includes('test'))) {
        const doc = load(readFileSync(`${dir}/${f}`, 'utf8')) as { layout?: unknown }
        walk(doc?.layout, `${dir}/${f}`, 'layout')
      }

    it('finds panels to audit', () => expect(found.length).toBeGreaterThan(40))

    it('names a chart kind that exists and has a silhouette', () => {
      const bad = found
        .filter((p) => p.node.type === 'chart' && p.node.kind !== 'custom')
        .filter((p) => !(kindFileName(String(p.node.kind)) in KIND_SHAPE))
        .map((p) => `${p.file} ${p.path}: kind "${String(p.node.kind)}"`)
      expect(bad).toEqual([])
    })

    it('never falls back to the generic block', () => {
      const generic = found
        .filter((p) => p.node.type !== 'multi-view' && !NO_SKELETON.has(String(p.node.type)))
        .filter((p) => skeletonShape(p.node) === 'generic')
        .map((p) => `${p.file} ${p.path}: ${String(p.node.type)}${p.node.kind ? ` ${String(p.node.kind)}` : ''}`)
      expect(generic).toEqual([])
    })

    it('gives a multi-view tile the silhouette of the view it opens on', () => {
      for (const p of found.filter((x) => x.node.type === 'multi-view')) {
        const views = p.node.views as { id?: string }[]
        const first = views.find((v) => v.id === p.node.default_view) ?? views[0]
        expect(skeletonShape(p.node), `${p.file} ${p.path}`).toBe(skeletonShape(first))
      }
    })

    it('draws the maps as maps and the tables as tables', () => {
      for (const p of found) {
        const k = kindFileName(String(p.node.kind ?? ''))
        if (/^zone.*Map$/.test(k) || p.node.type === 'flowmap' || p.node.type === 'zonemap') expect(skeletonShape(p.node), `${p.file} ${p.path}`).toBe('map')
        if (/table$/i.test(k) || k === 'scorecard' || p.node.type === 'table') expect(skeletonShape(p.node), `${p.file} ${p.path}`).toBe('table')
      }
    })
  })

  it('takes a multi-view tile from the view it opens on', () => {
    const tile = { type: 'multi-view', default_view: 'rings', views: [{ id: 'bars', type: 'chart', kind: 'stackedBars' }, { id: 'rings', type: 'sunburst' }] }
    expect(skeletonShape(tile)).toBe('sunburst')
    expect(skeletonShape({ ...tile, default_view: undefined })).toBe('stacked')
  })
})
