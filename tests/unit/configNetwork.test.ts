import { describe, expect, it } from 'vitest'

import { allowedIds, checkAllowList, checkDefaultBasemap, globToRegExp, hostOf, isAllowed, matchesAny, outsideHosts, unmatchedPatterns } from '../../src/config'

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

describe('checkAllowList', () => {
  const known = ['carto-positron', 'ugrc-vector-lite', 'protomaps-light']

  it('is quiet for no list, an empty list and a list that matches', () => {
    expect(checkAllowList(undefined, known)).toEqual([])
    expect(checkAllowList([], known)).toEqual([])
    expect(checkAllowList(['carto-*', 'ugrc-vector-lite'], known)).toEqual([])
  })

  it('reports each pattern that matches nothing and keeps the others quiet', () => {
    expect(checkAllowList(['carto-*', 'nope-*', 'ugrc-lite'], known)).toEqual(['the pattern "nope-*" matches no known basemap', 'the pattern "ugrc-lite" matches no known basemap'])
  })

  it('also says when the list allows nothing at all', () => {
    expect(checkAllowList(['nope-*'], known)).toEqual(['the pattern "nope-*" matches no known basemap', 'no basemap is allowed, so every map shows the plain background'])
  })
})

describe('checkDefaultBasemap', () => {
  const known = ['carto-positron', 'ugrc-vector-lite', 'protomaps-light']

  it('is fine for an allowed name, no list, and a style URL', () => {
    expect(checkDefaultBasemap('ugrc-vector-lite', ['ugrc-*'], known)).toBeUndefined()
    expect(checkDefaultBasemap('openfreemap-positron', undefined, known)).toBeUndefined()
    expect(checkDefaultBasemap('https://tiles.example.org/style.json', ['nope-*'], known)).toBeUndefined()
  })

  it('names the replacement, the first allowed id in catalogue order', () => {
    expect(checkDefaultBasemap('openfreemap-positron', ['ugrc-*', 'protomaps-*'], known)).toBe('the basemap "openfreemap-positron" is not allowed by network.basemaps.allow; "ugrc-vector-lite" is used')
  })

  it('says the plain background is used when nothing is allowed', () => {
    expect(checkDefaultBasemap('carto-positron', ['nope-*'], known)).toContain('the plain background is used')
  })
})

describe('outsideHosts: one line per host', () => {
  const catalogue = [
    { id: 'openfreemap-liberty', hosts: ['tiles.openfreemap.org'] },
    { id: 'openfreemap-bright', hosts: ['tiles.openfreemap.org'] },
    { id: 'openfreemap-dark', hosts: ['tiles.openfreemap.org'] },
    { id: 'openfreemap-fiord', hosts: ['tiles.openfreemap.org'] },
    { id: 'ugrc-vector-lite', hosts: ['tiles.arcgis.com'] },
  ]

  it('names up to three entries that reach a host and counts the rest', () => {
    const hosts = outsideHosts({ catalogue, fonts: 'bundled', extensionAddress: 'https://m.example.org/x' })
    expect(hosts).toEqual([
      { host: 'tiles.arcgis.com', why: 'allowed basemap ugrc-vector-lite' },
      { host: 'tiles.openfreemap.org', why: 'allowed basemaps openfreemap-liberty, openfreemap-bright, openfreemap-dark and 1 more' },
    ])
  })

  it('joins every reason a host has (a style written in a page on a catalogue host)', () => {
    const hosts = outsideHosts({ catalogue, fonts: 'bundled', extensionAddress: 'https://m.example.org/x', patterns: ['ugrc-*'], authored: [{ host: 'tiles.arcgis.com', where: 'a style written in p.yaml' }] })
    expect(hosts).toEqual([{ host: 'tiles.arcgis.com', why: 'allowed basemap ugrc-vector-lite; a style written in p.yaml' }])
  })
})
