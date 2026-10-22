import { beforeEach, describe, expect, it } from 'vitest'

import type { MultiViewPanelConfig } from '../../src/layout/types.ts'
import {
  allViewConfigs,
  defaultStrategies,
  resolveMultiView,
  substituteGroup,
  validateMultiView,
} from '../../src/panels/multiView.ts'
import { getTileState, resetTileStates, setTileState, subscribe, tileKey } from '../../src/state/tileState.ts'

function config(over: Partial<MultiViewPanelConfig> = {}): MultiViewPanelConfig {
  return {
    type: 'multi-view',
    title: 'Trips by purpose and mode',
    metric: 'purpose_mode_flow',
    height: 430,
    scenario: 'base',
    group_by: {
      label: 'Group by',
      default: 'pm',
      options: [
        { id: 'pm', label: 'Purpose > Mode', fields: { path: ['primary_purpose', 'major_trip_mode'] } },
        { id: 'mp', label: 'Mode > Purpose', fields: { path: ['major_trip_mode', 'primary_purpose'] } },
      ],
    },
    views: [
      { id: 'tree', label: 'Treemap', type: 'treemap', path: '$group.path' as unknown as string[], value: 'trips', compare: ['multi', 'diff'] },
      { id: 'sun', label: 'Sunburst', type: 'sunburst', path: '$group.path', value: 'trips' },
      { id: 'flow', label: 'Flow', type: 'sankey', source: 'primary_purpose', target: 'major_trip_mode', value: 'trips', compare: [] },
    ],
    ...over,
  }
}

describe('validateMultiView', () => {
  it('accepts a well-formed config', () => {
    expect(validateMultiView(config())).toBeNull()
  })

  it.each([
    ['no views', { views: [] }, /non-empty views/],
    ['a view without a type', { views: [{ id: 'a', type: '' }] }, /view "a" has no type/],
    ['a view without an id', { views: [{ id: '', type: 'pie' }] }, /has no id/],
    ['duplicate view ids', { views: [{ id: 'a', type: 'pie' }, { id: 'a', type: 'table' }] }, /duplicate view id "a"/],
    ['a nested multi-view', { views: [{ id: 'a', type: 'multi-view' }] }, /cannot itself be a multi-view/],
    ['an unknown strategy', { views: [{ id: 'a', type: 'pie', compare: ['sideways' as never] }] }, /unknown compare strategy "sideways"/],
    ['a $group field no option defines', { views: [{ id: 'a', type: 'pie', path: '$group.nope' }] }, /\$group\.nope/],
    ['duplicate group options', { group_by: { options: [{ id: 'x', label: 'X', fields: {} }, { id: 'x', label: 'Y', fields: {} }] } }, /duplicate group_by option id "x"/],
    ['an unknown group default', { group_by: { default: 'zz', options: [{ id: 'x', label: 'X', fields: {} }] } }, /default "zz"/],
  ] as [string, unknown, RegExp][])('rejects %s with a precise message', (_name, over, message) => {
    expect(validateMultiView(config(over as Partial<MultiViewPanelConfig>))).toMatch(message)
  })

  it('names the tile in every message', () => {
    expect(validateMultiView(config({ views: [] }))).toContain('"Trips by purpose and mode"')
  })
})

describe('substituteGroup', () => {
  const fields = { path: ['a', 'b'] }
  it('replaces whole-string $group references, including arrays and nested values', () => {
    expect(substituteGroup('$group.path', fields)).toEqual(['a', 'b'])
    expect(substituteGroup({ x: { y: '$group.path' }, z: 1 }, fields)).toEqual({ x: { y: ['a', 'b'] }, z: 1 })
    expect(substituteGroup(['$group.path', 'keep'], fields)).toEqual([['a', 'b'], 'keep'])
  })
  it('leaves a field the option does not define unset (the key is dropped)', () => {
    expect(substituteGroup({ y: '$group.missing', ok: 'v' }, fields)).toEqual({ ok: 'v' })
  })
  it('leaves other strings alone', () => {
    expect(substituteGroup('trips', fields)).toBe('trips')
    expect(substituteGroup('$filters.purpose', fields)).toBe('$filters.purpose')
  })
})

describe('resolveMultiView', () => {
  it('defaults to the first view and the default group, applying tile defaults', () => {
    const r = resolveMultiView(config())
    expect(r.view.id).toBe('tree')
    expect(r.groupOption?.id).toBe('pm')
    expect(r.panel).toMatchObject({
      type: 'treemap',
      title: 'Trips by purpose and mode',
      metric: 'purpose_mode_flow',
      height: 430,
      scenario: 'base',
      path: ['primary_purpose', 'major_trip_mode'],
      value: 'trips',
    })
    expect(r.panel).not.toHaveProperty('id')
    expect(r.panel).not.toHaveProperty('compare')
  })

  it('uses the selected view and group', () => {
    const r = resolveMultiView(config(), { view: 'sun', group: 'mp' })
    expect(r.panel).toMatchObject({ type: 'sunburst', path: ['major_trip_mode', 'primary_purpose'] })
  })

  it('a view setting its own metric or height wins over the tile default', () => {
    const c = config()
    c.views[0] = { ...c.views[0], metric: 'other', height: 200 }
    expect(resolveMultiView(c).panel).toMatchObject({ metric: 'other', height: 200 })
  })

  it('falls back to the first view for an unknown selection', () => {
    expect(resolveMultiView(config(), { view: 'ghost', group: 'ghost' }).view.id).toBe('tree')
  })

  it('strategies: the first is the default, the user choice must be one the view offers', () => {
    expect(resolveMultiView(config()).strategy).toBe('multi')
    expect(resolveMultiView(config(), { strategy: 'diff' }).strategy).toBe('diff')
    expect(resolveMultiView(config(), { strategy: 'overlay' }).strategy).toBe('multi')
  })

  it('an omitted compare list uses the type default; an empty one means the view does not vary by scenario', () => {
    expect(resolveMultiView(config(), { view: 'sun' }).strategies).toEqual(defaultStrategies('sunburst'))
    const flow = resolveMultiView(config(), { view: 'flow' })
    expect(flow.strategies).toEqual([])
    expect(flow.scenarioIndependent).toBe(true)
    expect(flow.strategy).toBeUndefined()
  })

  it('scenario_independent on the tile applies to every view', () => {
    expect(resolveMultiView(config({ scenario_independent: true })).scenarioIndependent).toBe(true)
  })

  it('a field the option defines and the view omits is merged in', () => {
    const c = config()
    c.views[2] = { id: 'flow', type: 'sankey', value: 'trips' }
    expect(resolveMultiView(c, { view: 'flow' }).panel).toMatchObject({ path: ['primary_purpose', 'major_trip_mode'] })
  })
})

describe('allViewConfigs', () => {
  it('returns every view as a panel config, and nothing for an invalid tile', () => {
    expect(allViewConfigs(config()).map((p) => p.type)).toEqual(['treemap', 'sunburst', 'sankey'])
    expect(allViewConfigs(config({ views: [] }))).toEqual([])
  })
})

describe('defaultStrategies', () => {
  it('follows the strategy matrix', () => {
    expect(defaultStrategies('treemap')).toEqual(['multi', 'diff'])
    expect(defaultStrategies('sankey')).toEqual(['switch'])
    expect(defaultStrategies('valuebox')).toEqual([])
    expect(defaultStrategies('something-new')).toEqual(['overlay'])
  })
})

describe('tileState', () => {
  beforeEach(() => resetTileStates())

  it('keys by pageId:tileId, merges patches, and returns a stable object until it changes', () => {
    const key = tileKey('Mode Choice', 'row_a-0')
    expect(key).toBe('Mode Choice:row_a-0')
    const empty = getTileState(key)
    expect(getTileState(key)).toBe(empty)
    setTileState(key, { view: 'sun' })
    setTileState(key, { group: 'mp' })
    expect(getTileState(key)).toEqual({ view: 'sun', group: 'mp' })
    expect(getTileState('other:tile')).toEqual({})
  })

  it('notifies subscribers on every change', () => {
    let calls = 0
    const off = subscribe(() => calls++)
    setTileState('a:b', { page: 1 })
    setTileState('a:b', { page: 2 })
    off()
    setTileState('a:b', { page: 3 })
    expect(calls).toBe(2)
  })
})
