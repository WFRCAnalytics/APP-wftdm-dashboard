import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BLANK_BASEMAP, resetBasemapPolicy } from '@/panels/basemap/basemapPolicy'
import { configureNetwork, resetNetworkPolicy } from '@/services/networkPolicy'
import { getProblems, resetProblems } from '@/state/configProblems'
import { resolveEffectiveBasemap, basemapKey } from '@/panels/basemap/resolveEffectiveBasemap'
import { APP_DEFAULT } from '@/panels/basemap/registry'

// 021-basemap-catalog-redesign (T023): every call site drops the `theme`
// argument this function no longer accepts (research.md §6, FR-018).
describe('resolveEffectiveBasemap', () => {
  it('panel basemap wins over everything', () => {
    expect(resolveEffectiveBasemap('openfreemap-bright', 'carto-voyager')).toEqual({
      selection: 'openfreemap-bright',
      source: 'panel',
    })
  })

  it('tab default wins when no panel override is set', () => {
    expect(resolveEffectiveBasemap(undefined, 'carto-voyager')).toEqual({
      selection: 'carto-voyager',
      source: 'tab',
    })
  })

  // 020-settings-modal (US2, FR-011/FR-012): the 3rd-priority tier —
  // fills the fallback ONLY when neither panel nor tab is set, and is
  // itself still outranked by either of them.
  it('global basemap wins over the app default, but never over panel or tab', () => {
    expect(resolveEffectiveBasemap(undefined, undefined, 'openfreemap-liberty')).toEqual({
      selection: 'openfreemap-liberty',
      source: 'global',
    })
    expect(resolveEffectiveBasemap('carto-voyager', undefined, 'openfreemap-liberty')).toEqual({
      selection: 'carto-voyager',
      source: 'panel',
    })
    expect(resolveEffectiveBasemap(undefined, 'carto-voyager', 'openfreemap-liberty')).toEqual({
      selection: 'carto-voyager',
      source: 'tab',
    })
  })

  it('an unset global basemap (undefined) falls through to the app default, same as omitting the argument', () => {
    expect(resolveEffectiveBasemap(undefined, undefined, undefined)).toEqual({
      selection: APP_DEFAULT,
      source: 'app-default',
    })
    expect(resolveEffectiveBasemap(undefined, undefined)).toEqual(
      resolveEffectiveBasemap(undefined, undefined, undefined),
    )
  })

  // 021-basemap-catalog-redesign: replaces the old "falls back to the
  // theme-paired app default" test — there is no theme parameter, and no
  // theme-dependent branch, to test anymore (research.md §6).
  it('falls back to the single static APP_DEFAULT when nothing is set', () => {
    expect(resolveEffectiveBasemap(undefined, undefined)).toEqual({
      selection: APP_DEFAULT,
      source: 'app-default',
    })
    expect(APP_DEFAULT).toBe('openfreemap-positron')
  })

  it('treats an empty/blank basemap string as unset, not as an explicit pin', () => {
    expect(resolveEffectiveBasemap('', 'carto-voyager').source).toBe('tab')
    expect(resolveEffectiveBasemap('   ', undefined).source).toBe('app-default')
  })

  it('accepts a composition object at either scope', () => {
    const composition = { layers: ['https://example.test/a.json', 'https://example.test/b.json'] }
    expect(resolveEffectiveBasemap(composition, undefined)).toEqual({
      selection: composition,
      source: 'panel',
    })
    expect(resolveEffectiveBasemap(undefined, composition)).toEqual({
      selection: composition,
      source: 'tab',
    })
  })

  it('basemapKey is stable across repeated calls with the same selection', () => {
    const first = resolveEffectiveBasemap('openfreemap-bright', undefined)
    const second = resolveEffectiveBasemap('openfreemap-bright', undefined)
    expect(basemapKey(first.selection)).toBe(basemapKey(second.selection))
  })
})

describe('the site default (basemap.default) sits under every other level', () => {
  it('is used when nothing else is set, and loses to the viewer, the page and the panel', () => {
    expect(resolveEffectiveBasemap(undefined, undefined, undefined, 'carto-light').selection).toBe('carto-light')
    expect(resolveEffectiveBasemap(undefined, undefined, 'carto-dark' as never, 'carto-light').selection).toBe('carto-dark')
    expect(resolveEffectiveBasemap(undefined, 'tab-one', undefined, 'carto-light')).toEqual({ selection: 'tab-one', source: 'tab' })
    expect(resolveEffectiveBasemap('panel-one', 'tab-one', undefined, 'carto-light')).toEqual({ selection: 'panel-one', source: 'panel' })
  })
})

describe('070/071: the allow-list (network.basemaps.allow)', () => {
  beforeEach(() => {
    resetProblems()
    resetBasemapPolicy()
  })
  afterEach(() => resetNetworkPolicy())

  it('changes nothing without a list', () => {
    expect(resolveEffectiveBasemap(undefined, undefined, undefined, undefined)).toEqual({ selection: APP_DEFAULT, source: 'app-default' })
    expect(getProblems()).toEqual([])
  })

  it('replaces the app default when it is not allowed, keeping the source', () => {
    configureNetwork({ basemapsAllow: ['ugrc-vector-lite'] })
    expect(resolveEffectiveBasemap(undefined, undefined, undefined, undefined)).toEqual({ selection: 'ugrc-vector-lite', source: 'app-default' })
    expect(getProblems()).toHaveLength(1)
  })

  it('replaces a site, page and panel default that is not allowed, and a stale viewer pick', () => {
    configureNetwork({ basemapsAllow: ['ugrc-vector-lite'] })
    expect(resolveEffectiveBasemap('carto-positron', undefined, undefined, undefined)).toEqual({ selection: 'ugrc-vector-lite', source: 'panel' })
    expect(resolveEffectiveBasemap(undefined, 'carto-voyager', undefined, undefined)).toEqual({ selection: 'ugrc-vector-lite', source: 'tab' })
    expect(resolveEffectiveBasemap(undefined, undefined, 'openfreemap-dark', undefined)).toEqual({ selection: 'ugrc-vector-lite', source: 'global' })
    expect(resolveEffectiveBasemap(undefined, undefined, undefined, 'carto-dark-matter')).toEqual({ selection: 'ugrc-vector-lite', source: 'global' })
  })

  it('keeps an allowed choice at any level, and the deployer own composition', () => {
    configureNetwork({ basemapsAllow: ['ugrc-*'] })
    expect(resolveEffectiveBasemap('ugrc-vector-dark', undefined, undefined, undefined).selection).toBe('ugrc-vector-dark')
    const composition = { layers: ['https://tiles.example.org/style.json'] }
    expect(resolveEffectiveBasemap(composition, undefined, undefined, undefined).selection).toBe(composition)
  })

  it('gives the plain background when the list matches nothing', () => {
    configureNetwork({ basemapsAllow: ['nope-*'] })
    expect(resolveEffectiveBasemap(undefined, undefined, undefined, undefined).selection).toBe(BLANK_BASEMAP)
  })
})
