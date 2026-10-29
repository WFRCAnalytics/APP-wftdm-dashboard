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
