import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { KIND_SHAPE, skeletonShape, TYPE_SHAPE } from '../../src/panels/skeleton.ts'

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

  it('takes a multi-view tile from the view it opens on', () => {
    const tile = { type: 'multi-view', default_view: 'rings', views: [{ id: 'bars', type: 'chart', kind: 'stackedBars' }, { id: 'rings', type: 'sunburst' }] }
    expect(skeletonShape(tile)).toBe('sunburst')
    expect(skeletonShape({ ...tile, default_view: undefined })).toBe('bars')
  })
})
