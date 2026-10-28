import { describe, expect, it } from 'vitest'

import { sharedControl, tileAccepts } from '../../src/layout/sharedControls.ts'
import { sharedKinds } from '../../src/layout/dashboardLayout.ts'
import type { PanelConfig } from '../../src/layout/types.ts'

const tile = (id: string, groups: string[], views: string[], def?: string) =>
  ({
    id,
    type: 'multi-view',
    title: id,
    group_by: { label: 'Compare by', default: def, options: groups.map((g) => ({ id: g, label: g.toUpperCase(), fields: { group: g } })) },
    views: views.map((v) => ({ id: v, label: v, type: 'chart', kind: 'x' })),
  }) as unknown as PanelConfig

describe('shared tab controls', () => {
  const a = tile('a', ['scn', 'purpose'], ['bars', 'gap'], 'purpose')
  const b = tile('b', ['purpose', 'none'], ['bars', 'lines'])

  it('offers the union of option ids, the first tile deciding order, label and default', () => {
    const c = sharedControl('group', [a, b])!
    expect(c.options.map((o) => o.id)).toEqual(['scn', 'purpose', 'none'])
    expect(c.label).toBe('Compare by')
    expect(c.fallback).toBe('purpose')
    expect(sharedControl('view', [a, b])!.options.map((o) => o.id)).toEqual(['bars', 'gap', 'lines'])
  })

  it('offers nothing when the tiles have fewer than two options', () => {
    expect(sharedControl('group', [tile('c', ['one'], ['v'])])).toBeNull()
    expect(sharedControl('group', [{ type: 'markdown', title: 'm' } as unknown as PanelConfig])).toBeNull()
  })

  it('applies a choice only to the tiles that offer that option', () => {
    expect(tileAccepts(a, 'group', 'scn')).toBe(true)
    expect(tileAccepts(b, 'group', 'scn')).toBe(false)
    expect(tileAccepts(b, 'view', 'lines')).toBe(true)
  })

  it('offers arrangements for Compare as, never a difference (that is the Show control)', () => {
    const t = (strategies: string[]) =>
      ({ id: 't', type: 'multi-view', title: 't', views: [{ id: 'v', type: 'treemap', metric: 'm', value: 'trips', compare: strategies }] }) as unknown as PanelConfig
    const ctx = { compare: true, selection: () => ({}) }
    expect(sharedControl('strategy', [t(['multi', 'diff'])], ctx)).toBeNull()
    expect(sharedControl('strategy', [t(['multi', 'switch', 'diff'])], ctx)!.options.map((o) => o.id)).toEqual(['multi', 'switch'])
  })

  it('reads only known kinds from a section', () => {
    expect(sharedKinds(['group', 'nope', 'group', 'view'])).toEqual(['group', 'view'])
    expect(sharedKinds('group')).toBeUndefined()
    expect(sharedKinds([])).toBeUndefined()
  })
})
