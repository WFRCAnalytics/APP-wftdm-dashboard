import { describe, expect, it } from 'vitest'

import { panelSettings, settingValue } from '@/config'
import { offersScaleChoice } from '@/panels/multiView'

describe('charts.scale', () => {
  it('defaults to own, and a page or a tile can choose shared', () => {
    expect(settingValue('charts.scale', { site: {} })).toBe('own')
    expect(settingValue('charts.scale', { site: { charts: { scale: 'shared' } } })).toBe('shared')
    expect(settingValue('charts.scale', { site: {}, page: { charts: { scale: 'shared' } }, panel: panelSettings({ charts: { scale: 'own' } }) })).toBe('own')
    expect(settingValue('charts.scale', { site: {}, panel: panelSettings({ charts: { scale: 'log' } }) })).toBe('own')
  })
})

describe('offersScaleChoice', () => {
  it('is offered by the faceted mode share bars only', () => {
    expect(offersScaleChoice({ type: 'chart', kind: 'mode-bars' })).toBe(true)
    expect(offersScaleChoice({ type: 'chart', kind: 'stacked-bars' })).toBe(false)
    expect(offersScaleChoice({ type: 'observable-plot' })).toBe(false)
  })
})
