import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resolveRasterProvider, __resetProvidersCacheForTests } from '@/panels/basemap/registry'

// Fixture catalog shaped exactly like the REAL, extracted
// public/basemap/leaflet-providers.json (confirmed directly against the
// real generated file during implementation — see
// specs/011-basemap-style-system/research.md §4). Most practically-
// useful providers are a PARENT entry with a `variants` map addressed by
// leaflet-providers' own dotted convention ("CartoDB.Positron"), not flat
// per-variant keys — the plan-phase contract's flat-lookup design was
// wrong and corrected here against the real data shape.
const FIXTURE_CATALOG = {
  CartoDB: {
    url: 'https://{s}.basemaps.cartocdn.com/{variant}/{z}/{x}/{y}{r}.png',
    options: { subdomains: 'abcd', maxZoom: 20, variant: 'light_all', attribution: 'CARTO' },
    // A plain-string variant value — substituted into options.variant.
    variants: { Positron: 'light_all', DarkMatter: 'dark_all' },
  },
  // Real entry, real upstream shape — a variant with its own full url/
  // options override (OpenStreetMap.HOT's real shape).
  OpenStreetMap: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: 'OpenStreetMap' },
    variants: {
      // An empty-object variant — no overrides, use the parent as-is
      // (OpenStreetMap.Mapnik's real shape).
      Mapnik: {},
      HOT: {
        url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        options: { attribution: 'HOT' },
      },
    },
  },
  // Real entry, real upstream shape — {s} in the url, no subdomains
  // override at all (relies on Leaflet's own class default).
  OpenTopoMap: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { attribution: 'OpenTopoMap' },
  },
  // A provider with no {s} at all — must NOT get a padded/duplicated
  // tiles array just because the {s}-only subdomains default kicks in.
  HikeBikeHikeBike: {
    url: 'https://tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png',
    options: { attribution: 'HikeBike' },
  },
}

beforeEach(() => {
  __resetProvidersCacheForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => FIXTURE_CATALOG })))
})

describe('resolveRasterProvider', () => {
  it('resolves a dotted provider.variant name via a string variant value (CartoDB.Positron)', async () => {
    const result = await resolveRasterProvider('CartoDB.Positron')
    expect(result?.tiles).toEqual([
      'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    ])
  })

  it('resolves a dotted provider.variant name via an empty-object variant (OpenStreetMap.Mapnik — no overrides)', async () => {
    const result = await resolveRasterProvider('OpenStreetMap.Mapnik')
    // No {s} in this url — a single, un-padded tile entry.
    expect(result?.tiles).toEqual(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'])
    expect(result?.attribution).toBe('OpenStreetMap')
  })

  it('resolves a dotted provider.variant name via a full-object variant override (OpenStreetMap.HOT — its own url + options)', async () => {
    const result = await resolveRasterProvider('OpenStreetMap.HOT')
    expect(result?.attribution).toBe('HOT')
    // {s} present + no subdomains anywhere on the variant or parent ->
    // defaults to Leaflet's own 'abc'.
    expect(result?.tiles).toEqual([
      'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    ])
  })

  // The real bug found during implementation (T003): without this
  // default, this provider's {s} would ship un-substituted (a literally
  // broken tile URL) since the raw extracted data has no subdomains
  // field anywhere for it.
  it('defaults to Leaflet\'s own "abc" subdomains for a no-variant provider when {s} is used but options.subdomains is absent', async () => {
    const result = await resolveRasterProvider('OpenTopoMap')
    expect(result?.tiles).toEqual([
      'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
    ])
    expect(result?.tiles.some((t) => t.includes('{s}'))).toBe(false)
  })

  it('does not pad the tiles array for a provider whose url has no {s} at all', async () => {
    const result = await resolveRasterProvider('HikeBikeHikeBike')
    expect(result?.tiles).toEqual(['https://tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png'])
  })

  it('returns undefined for an unrecognized provider name', async () => {
    expect(await resolveRasterProvider('Nonexistent.Provider')).toBeUndefined()
  })

  it('returns undefined for a recognized provider with an unrecognized variant name', async () => {
    expect(await resolveRasterProvider('CartoDB.NotARealVariant')).toBeUndefined()
  })

  it('returns undefined (not a thrown error) when the catalog fetch itself fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response)
    expect(await resolveRasterProvider('CartoDB.Positron')).toBeUndefined()
  })
})
