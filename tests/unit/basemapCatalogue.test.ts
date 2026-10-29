import { describe, expect, it } from 'vitest'

import { catalogueEntries, catalogueIds, hostOfTemplate, rasterIds, type RasterCatalog } from '../../src/panels/basemap/catalogue'

const catalog: RasterCatalog = {
  OpenStreetMap: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', options: {}, variants: { Mapnik: {}, HOT: { url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png' } } },
  OpenTopoMap: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', options: {} },
  Esri: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/{variant}/MapServer/tile/{z}/{y}/{x}', options: {}, variants: { WorldImagery: 'World_Imagery' } },
  Stadia: { url: 'https://tiles.stadiamaps.com/tiles/{variant}/{z}/{x}/{y}{r}.png?api_key={apikey}', options: {}, variants: { AlidadeSmooth: 'alidade_smooth' } },
  CartoDB: { url: 'https://{s}.basemaps.cartocdn.com/{variant}/{z}/{x}/{y}{r}.png', options: {}, variants: { Positron: 'light_all' } },
  PlainHttp: { url: 'http://tile.example.org/{z}/{x}/{y}.png', options: {} },
}

describe('hostOfTemplate', () => {
  it('drops the subdomain placeholder and other tokens', () => {
    expect(hostOfTemplate('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')).toBe('tile.openstreetmap.org')
    expect(hostOfTemplate('https://server.arcgisonline.com/{variant}/{z}')).toBe('server.arcgisonline.com')
    expect(hostOfTemplate('not a template')).toBeUndefined()
  })
})

describe('rasterIds', () => {
  it('lists curated providers as Provider.Variant, or the bare name without variants, and skips keyed, http-only and excluded ones', () => {
    expect(rasterIds(catalog)).toEqual(['OpenStreetMap.Mapnik', 'OpenStreetMap.HOT', 'OpenTopoMap', 'Esri.WorldImagery'])
  })

  it('is empty without a catalogue', () => expect(rasterIds(undefined)).toEqual([]))
})

describe('catalogueEntries', () => {
  it('starts with the built-in styles, then Protomaps, then the raster providers', () => {
    const ids = catalogueIds(catalog)
    expect(ids.slice(0, 3)).toEqual(['carto-positron', 'carto-dark-matter', 'carto-voyager'])
    expect(ids).toContain('openfreemap-liberty')
    expect(ids).toContain('ugrc-vector-lite')
    expect(ids.indexOf('protomaps-light')).toBeGreaterThan(ids.indexOf('ugrc-vector-lite'))
    expect(ids.slice(-4)).toEqual(['OpenStreetMap.Mapnik', 'OpenStreetMap.HOT', 'OpenTopoMap', 'Esri.WorldImagery'])
  })

  it('gives each entry the hosts it reaches', () => {
    const by = Object.fromEntries(catalogueEntries(catalog).map((e) => [e.id, e.hosts]))
    expect(by['carto-positron']).toEqual(['basemaps.cartocdn.com'])
    expect(by['openfreemap-liberty']).toEqual(['tiles.openfreemap.org'])
    expect(by['ugrc-vector-lite']).toEqual(['tiles.arcgis.com'])
    expect(by['protomaps-light']).toEqual([])
    expect(by['OpenStreetMap.HOT']).toEqual(['tile.openstreetmap.org', 'tile.openstreetmap.fr'])
    expect(by['Esri.WorldImagery']).toEqual(['server.arcgisonline.com'])
  })

  it('resolves a raster layer inside a composition through the catalogue', () => {
    const by = Object.fromEntries(catalogueEntries(catalog).map((e) => [e.id, e.hosts]))
    expect(by['ugrc-vector-hybrid']).toContain('server.arcgisonline.com')
    expect(by['ugrc-vector-hybrid']).toContain('tiles.arcgis.com')
  })

  it('works without a catalogue (built-ins and Protomaps only)', () => {
    expect(catalogueIds(undefined)).not.toContain('OpenStreetMap.Mapnik')
    expect(catalogueIds(undefined)).toContain('protomaps-dark')
  })
})
