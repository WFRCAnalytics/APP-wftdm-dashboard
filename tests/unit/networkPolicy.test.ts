import { afterEach, describe, expect, it } from 'vitest'

import { configureNetwork, fontsBundled, getBasemapAllowList, getExtensionRepository, resetNetworkPolicy } from '../../src/services/networkPolicy'

afterEach(() => resetNetworkPolicy())

describe('with nothing configured', () => {
  it('is what the app always was', () => {
    expect(fontsBundled()).toBe(false)
    expect(getBasemapAllowList()).toEqual([])
    expect(getExtensionRepository()).toBeUndefined()
  })

  it('reads an empty input the same way', () => {
    configureNetwork({})
    expect(fontsBundled()).toBe(false)
    expect(getBasemapAllowList()).toEqual([])
  })
})

describe('when configured', () => {
  it('holds the font mode, the allow-list and the mirror', () => {
    configureNetwork({ fonts: 'bundled', basemapsAllow: ['carto-*', 'ugrc-vector-lite'], duckdbExtensions: 'https://m.example.org/duckdb' })
    expect(fontsBundled()).toBe(true)
    expect(getBasemapAllowList()).toEqual(['carto-*', 'ugrc-vector-lite'])
    expect(getExtensionRepository()).toBe('https://m.example.org/duckdb')
  })

  it('keeps its own copy of the list', () => {
    const list = ['a-*']
    configureNetwork({ basemapsAllow: list })
    list.push('b-*')
    expect(getBasemapAllowList()).toEqual(['a-*'])
  })

  it('goes back to the defaults on reset or when configured again with nothing', () => {
    configureNetwork({ fonts: 'bundled', basemapsAllow: ['x'] })
    configureNetwork(undefined)
    expect(fontsBundled()).toBe(false)
    expect(getBasemapAllowList()).toEqual([])
  })
})

describe('the font preference with network.fonts: bundled', async () => {
  const { BUNDLED_FONTS, clearFont, getFont, isFontOffered, setFont } = await import('../../src/state/fontPreferenceState')

  afterEach(() => {
    for (const role of ['body', 'heading', 'mono'] as const) clearFont(role)
  })

  it('offers any family when the fonts are not bundled', () => {
    expect(isFontOffered('Roboto')).toBe(true)
    setFont('body', 'Roboto')
    expect(getFont('body')).toBe('Roboto')
  })

  it('offers only the default font and the system font when bundled', () => {
    configureNetwork({ fonts: 'bundled' })
    expect(BUNDLED_FONTS).toEqual(['Schibsted Grotesk', 'System UI'])
    expect(isFontOffered('Schibsted Grotesk')).toBe(true)
    expect(isFontOffered('System UI')).toBe(true)
    expect(isFontOffered('Geist')).toBe(false)
    expect(isFontOffered('Roboto')).toBe(false)
  })

  it('refuses to set a family that is not offered and keeps what was set', () => {
    configureNetwork({ fonts: 'bundled' })
    setFont('body', 'Roboto')
    expect(getFont('body')).toBeUndefined()
    setFont('body', 'System UI')
    expect(getFont('body')).toBe('System UI')
  })

  it('ignores a stored preference for a family that is no longer offered', () => {
    setFont('heading', 'Geist')
    configureNetwork({ fonts: 'bundled' })
    expect(getFont('heading')).toBeUndefined()
    resetNetworkPolicy()
    expect(getFont('heading')).toBe('Geist')
  })
})
