import { describe, expect, it } from 'vitest'

import { panelSettings, settingValue } from '@/config'
import { switchForm } from '@/lib/switchForm'
import { SHAPE_ICON, viewIcon } from '@/panels/viewIcon'
import { SKELETON_SHAPES } from '@/panels/skeleton'

describe('switchForm', () => {
  it('takes the widest form that fits', () => {
    expect(switchForm('auto', 600, 500, 200)).toBe('full')
    expect(switchForm('auto', 400, 500, 200)).toBe('icons')
    expect(switchForm('auto', 150, 500, 200)).toBe('menu')
  })
  it('skips the icons form when an option has no icon', () => {
    expect(switchForm('auto', 400, 500, null)).toBe('menu')
  })
  it('shows the full switch before the first measurement', () => {
    expect(switchForm('auto', 0, 0, null)).toBe('full')
  })
  it('lets a deployer force a form', () => {
    expect(switchForm('switch', 10, 500, 200)).toBe('full')
    expect(switchForm('menu', 2000, 500, 200)).toBe('menu')
  })
})

describe('controls.views through the cascade', () => {
  it('defaults to auto', () => {
    expect(settingValue('controls.views', { site: {} })).toBe('auto')
  })
  it('lets a page and then a tile override the site', () => {
    const site = { controls: { views: 'switch' } }
    expect(settingValue('controls.views', { site })).toBe('switch')
    expect(settingValue('controls.views', { site, page: { controls: { views: 'menu' } } })).toBe('menu')
    expect(settingValue('controls.views', { site, page: { controls: { views: 'menu' } }, panel: panelSettings({ controls: { views: 'auto' } }) })).toBe('auto')
  })
  it('falls back to the default for a value that is not allowed', () => {
    expect(settingValue('controls.views', { site: {}, panel: panelSettings({ controls: { views: 'tabs' } }) })).toBe('auto')
  })
})

describe('panelSettings', () => {
  it('reads only the setting groups, not the panel’s own keys', () => {
    expect(panelSettings({ title: 'x', scale: 1e-6, controls: { views: 'menu' }, charts: { scale: 'shared' }, legend: { scenarios: 'tile' } })).toEqual({
      controls: { views: 'menu' },
      charts: { scale: 'shared' },
      legend: { scenarios: 'tile' },
    })
    expect(panelSettings('nope')).toEqual({})
  })
})

describe('viewIcon', () => {
  it('has an icon for every skeleton shape', () => {
    for (const shape of SKELETON_SHAPES) expect(SHAPE_ICON[shape]).toBeTruthy()
  })
  it('follows the view’s silhouette, or its own icon', () => {
    expect(viewIcon({ type: 'chart', kind: 'mode-table' })).toBe(SHAPE_ICON.table)
    expect(viewIcon({ type: 'chart', kind: 'mode-bars' })).toBe(SHAPE_ICON.bars)
    expect(viewIcon({ type: 'chart', kind: 'mode-bars', icon: 'donut' })).toBe(SHAPE_ICON.donut)
    expect(viewIcon({ type: 'chart', kind: 'mode-bars', icon: 'not-a-shape' })).toBe(SHAPE_ICON.bars)
  })
})
