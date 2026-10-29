import { describe, expect, it } from 'vitest'

import { allowedIds, globToRegExp, hostOf, isAllowed, matchesAny, outsideHosts, unmatchedPatterns } from '../../src/config'

const ids = ['carto-positron', 'openfreemap-liberty', 'openfreemap-bright', 'ugrc-vector-lite', 'protomaps-light', 'OpenStreetMap.Mapnik', 'Esri.WorldImagery']

describe('patterns', () => {
  it('match literally, with * as the only wildcard and the whole id', () => {
    expect(globToRegExp('carto-positron').test('carto-positron')).toBe(true)
    expect(globToRegExp('carto-positron').test('carto-positron-2')).toBe(false)
    expect(globToRegExp('openfreemap-*').test('openfreemap-liberty')).toBe(true)
    expect(globToRegExp('*-lite').test('ugrc-vector-lite')).toBe(true)
    expect(globToRegExp('ugrc-*-lite').test('ugrc-vector-lite')).toBe(true)
    expect(globToRegExp('*').test('anything')).toBe(true)
  })

  it('treat every other character as plain text (a dot is a dot, not any character)', () => {
    expect(globToRegExp('OpenStreetMap.Mapnik').test('OpenStreetMap.Mapnik')).toBe(true)
    expect(globToRegExp('OpenStreetMap.Mapnik').test('OpenStreetMapXMapnik')).toBe(false)
    expect(globToRegExp('a+b').test('a+b')).toBe(true)
    expect(globToRegExp('a(b)').test('a(b)')).toBe(true)
    expect(globToRegExp('[x]').test('x')).toBe(false)
  })

  it('ignore letter case', () => {
    expect(matchesAny(['CARTO-*'], 'carto-positron')).toBe(true)
    expect(matchesAny(['esri.worldimagery'], 'Esri.WorldImagery')).toBe(true)
  })
})

describe('isAllowed and allowedIds', () => {
  it('allow everything for an empty or absent list', () => {
    expect(isAllowed(undefined, 'x')).toBe(true)
    expect(isAllowed([], 'x')).toBe(true)
    expect(allowedIds(undefined, ids)).toEqual(ids)
    expect(allowedIds([], ids)).toEqual(ids)
  })

  it('keep only the matching ids, in the catalogue order', () => {
    expect(allowedIds(['protomaps-*', 'carto-*'], ids)).toEqual(['carto-positron', 'protomaps-light'])
    expect(allowedIds(['Esri.*', 'OpenStreetMap.*'], ids)).toEqual(['OpenStreetMap.Mapnik', 'Esri.WorldImagery'])
  })

  it('allow nothing when no pattern matches', () => {
    expect(allowedIds(['nope-*'], ids)).toEqual([])
    expect(isAllowed(['nope-*'], 'carto-positron')).toBe(false)
  })
})

describe('unmatchedPatterns', () => {
  it('lists each pattern that matches no known id and keeps the others', () => {
    expect(unmatchedPatterns(['carto-*', 'nope-*', 'ugrc-vector-lite', 'ugrc-vector-lit'], ids)).toEqual(['nope-*', 'ugrc-vector-lit'])
    expect(unmatchedPatterns(undefined, ids)).toEqual([])
    expect(unmatchedPatterns([], ids)).toEqual([])
  })
})

describe('outsideHosts', () => {
  const catalogue = [
    { id: 'carto-positron', hosts: ['basemaps.cartocdn.com'] },
    { id: 'openfreemap-liberty', hosts: ['tiles.openfreemap.org'] },
    { id: 'protomaps-light', hosts: [] },
  ]

  it('lists the font host, the extension host and the allowed basemaps hosts, sorted', () => {
    const hosts = outsideHosts({ catalogue, patterns: ['carto-*', 'protomaps-*'] })
    expect(hosts.map((h) => h.host)).toEqual(['basemaps.cartocdn.com', 'extensions.duckdb.org', 'fonts.googleapis.com'])
    expect(hosts.find((h) => h.host === 'basemaps.cartocdn.com')?.why).toBe('allowed basemap carto-positron')
  })

  it('lists every catalogue host when there is no list', () => {
    expect(outsideHosts({ catalogue, fonts: 'bundled', extensionAddress: 'https://m.example.org/x' }).map((h) => h.host)).toEqual(['basemaps.cartocdn.com', 'tiles.openfreemap.org'])
  })

  it('has nothing left when fonts are bundled, an extension address is set and only self-hosted entries are allowed', () => {
    expect(outsideHosts({ catalogue, fonts: 'bundled', extensionAddress: 'https://m.example.org/x', patterns: ['protomaps-*'] })).toEqual([])
  })

  it('adds the hosts of styles written in pages, with where they were found, and drops duplicates', () => {
    const hosts = outsideHosts({
      catalogue, fonts: 'bundled', extensionAddress: 'https://m.example.org/x', patterns: ['protomaps-*'],
      authored: [{ host: 'tiles.arcgis.com', where: 'page Network' }, { host: 'tiles.arcgis.com', where: 'page Network' }],
    })
    expect(hosts).toEqual([{ host: 'tiles.arcgis.com', why: 'page Network' }])
  })
})

describe('hostOf', () => {
  it('reads the host of an address and nothing from other text', () => {
    expect(hostOf('https://tiles.arcgis.com/x/y.json')).toBe('tiles.arcgis.com')
    expect(hostOf('not an address')).toBeUndefined()
    expect(hostOf('Esri.WorldImagery')).toBeUndefined()
  })
})
