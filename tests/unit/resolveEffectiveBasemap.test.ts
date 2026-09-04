import { describe, expect, it } from 'vitest'
import { resolveEffectiveBasemap, basemapKey } from '@/panels/basemap/resolveEffectiveBasemap'
import { APP_DEFAULT_LIGHT, APP_DEFAULT_DARK } from '@/panels/basemap/registry'

describe('resolveEffectiveBasemap', () => {
  it('panel basemap wins over everything, regardless of theme', () => {
    expect(resolveEffectiveBasemap('openfreemap-bright', 'carto-voyager', 'light')).toEqual({
      selection: 'openfreemap-bright',
      source: 'panel',
    })
    expect(resolveEffectiveBasemap('openfreemap-bright', 'carto-voyager', 'dark')).toEqual({
      selection: 'openfreemap-bright',
      source: 'panel',
    })
  })

  it('tab default wins when no panel override is set, regardless of theme', () => {
    expect(resolveEffectiveBasemap(undefined, 'carto-voyager', 'light')).toEqual({
      selection: 'carto-voyager',
      source: 'tab',
    })
    expect(resolveEffectiveBasemap(undefined, 'carto-voyager', 'dark')).toEqual({
      selection: 'carto-voyager',
      source: 'tab',
    })
  })

  // 020-settings-modal (US2, FR-011/FR-012): the new 3rd-priority tier —
  // fills the fallback ONLY when neither panel nor tab is set, and is
  // itself still outranked by either of them.
  it('global basemap wins over the app default, but never over panel or tab', () => {
    expect(resolveEffectiveBasemap(undefined, undefined, 'light', 'openfreemap-liberty')).toEqual({
      selection: 'openfreemap-liberty',
      source: 'global',
    })
    expect(resolveEffectiveBasemap(undefined, undefined, 'dark', 'openfreemap-liberty')).toEqual({
      selection: 'openfreemap-liberty',
      source: 'global',
    })
    expect(resolveEffectiveBasemap('carto-voyager', undefined, 'light', 'openfreemap-liberty')).toEqual({
      selection: 'carto-voyager',
      source: 'panel',
    })
    expect(resolveEffectiveBasemap(undefined, 'carto-voyager', 'light', 'openfreemap-liberty')).toEqual({
      selection: 'carto-voyager',
      source: 'tab',
    })
  })

  it('an unset global basemap (undefined) falls through to the app default, same as omitting the argument', () => {
    expect(resolveEffectiveBasemap(undefined, undefined, 'light', undefined)).toEqual({
      selection: APP_DEFAULT_LIGHT,
      source: 'app-default',
    })
    expect(resolveEffectiveBasemap(undefined, undefined, 'light')).toEqual(
      resolveEffectiveBasemap(undefined, undefined, 'light', undefined),
    )
  })

  it('falls back to the theme-paired app default when nothing is set', () => {
    expect(resolveEffectiveBasemap(undefined, undefined, 'light')).toEqual({
      selection: APP_DEFAULT_LIGHT,
      source: 'app-default',
    })
    expect(resolveEffectiveBasemap(undefined, undefined, 'dark')).toEqual({
      selection: APP_DEFAULT_DARK,
      source: 'app-default',
    })
  })

  it('treats an empty/blank basemap string as unset, not as an explicit pin', () => {
    expect(resolveEffectiveBasemap('', 'carto-voyager', 'light').source).toBe('tab')
    expect(resolveEffectiveBasemap('   ', undefined, 'dark').source).toBe('app-default')
  })

  it('accepts a composition object at either scope', () => {
    const composition = { layers: ['https://example.test/a.json', 'https://example.test/b.json'] }
    expect(resolveEffectiveBasemap(composition, undefined, 'light')).toEqual({
      selection: composition,
      source: 'panel',
    })
    expect(resolveEffectiveBasemap(undefined, composition, 'dark')).toEqual({
      selection: composition,
      source: 'tab',
    })
  })

  // The failure mode this whole contract exists to prevent (research.md
  // §2): an explicit pin must NOT change its resolved value across a
  // theme flip (so the caller's effect never re-runs for it), while the
  // no-config app default MUST change (so the caller's effect does
  // re-run). Asserted directly via basemapKey, the exact mechanism the
  // caller (FlowMapPanel.tsx) keys its effect's dependency array on.
  it('basemapKey is stable across a theme flip for an explicit pin, but not for the app default', () => {
    const pinnedLight = resolveEffectiveBasemap('openfreemap-bright', undefined, 'light')
    const pinnedDark = resolveEffectiveBasemap('openfreemap-bright', undefined, 'dark')
    expect(basemapKey(pinnedLight.selection)).toBe(basemapKey(pinnedDark.selection))

    const defaultLight = resolveEffectiveBasemap(undefined, undefined, 'light')
    const defaultDark = resolveEffectiveBasemap(undefined, undefined, 'dark')
    expect(basemapKey(defaultLight.selection)).not.toBe(basemapKey(defaultDark.selection))
  })
})
