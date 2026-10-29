import { describe, expect, it } from 'vitest'

import { exploreSettings, pageSettings, validate } from '../../src/config'

describe('level adapters', () => {
  it('maps a page\'s header.layout_mode and default_basemap onto schema paths', () => {
    expect(pageSettings({ header: { tab: 'A', title: 'A', layout_mode: 'tabs' }, default_basemap: 'carto-light' })).toEqual({
      layout: { mode: 'tabs' },
      basemap: { default: 'carto-light' },
    })
  })

  it('leaves a page\'s own `layout` (rows) alone but passes a stray site setting through for reporting', () => {
    const tree = pageSettings({ header: { tab: 'A', title: 'A' }, layout: { rows: 2 }, title: 'nope', colors: { primary: '#fff' } })
    expect(tree).toEqual({ title: 'nope', colors: { primary: '#fff' } })
    expect(validate(tree, { file: 'p.yaml', level: 'page' }).problems.map((p) => [p.kind, p.path])).toEqual([
      ['not_allowed_here', 'title'],
      ['not_allowed_here', 'colors.primary'],
    ])
  })

  it('maps a panel\'s Explore option keys onto explore.*', () => {
    expect(exploreSettings({ type: 'explore-builder', limits: { csv_rows: 5 }, charts: { allow: ['bar'] }, tables: { exclude: ['x*'] } })).toEqual({
      explore: { limits: { csv_rows: 5 }, charts: { allow: ['bar'] }, tables: { exclude: ['x*'] } },
    })
    expect(exploreSettings({ type: 'explore-builder' })).toEqual({})
    expect(exploreSettings(null)).toEqual({})
  })

  it('passes header.docs and header.hidden, and no other header key', () => {
    expect(pageSettings({ header: { tab: 'A', title: 'A', slug: 'a', docs: 'x/', hidden: true } })).toEqual({ header: { docs: 'x/', hidden: true } })
    expect(pageSettings({ header: { tab: 'A', title: 'A' } })).toEqual({})
  })
})
