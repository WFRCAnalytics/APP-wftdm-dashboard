import { describe, expect, it } from 'vitest'
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
