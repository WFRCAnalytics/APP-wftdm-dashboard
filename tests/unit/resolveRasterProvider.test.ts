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
  // override at all (relies on Leaflet's own class default). Attribution
  // is the REAL, current raw string from the actual generated catalog
  // (public/basemap/leaflet-providers.json, confirmed directly, not
  // paraphrased) — genuinely contains leaflet-providers' own
  // `{attribution.OpenStreetMap}` placeholder convention, the regression
  // case for resolveAttributionPlaceholders() below.
  OpenTopoMap: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: {
      attribution:
        'Map data: {attribution.OpenStreetMap}, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    },
  },
  // Real entry, real upstream shape — a PARENT with no placeholder of its
  // own (the actual resolution TARGET every {attribution.Esri} reference
  // points at) plus a real variant (WorldImagery) whose own attribution
  // DOES carry the placeholder — the second real regression case, and
  // the one that actually broke in production (012-webgl-context-
  // management's own fixture panels). Both strings are the REAL,
  // current raw values from the actual generated catalog, confirmed
  // directly.
  Esri: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/{variant}/MapServer/tile/{z}/{y}/{x}',
    options: { variant: 'World_Street_Map', attribution: 'Tiles &copy; Esri' },
    variants: {
      WorldImagery: {
        options: {
          variant: 'World_Imagery',
          attribution:
            '{attribution.Esri} &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        },
      },
    },
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

  // A REAL bug found via a live user report: leaflet-providers' own
  // `{attribution.ProviderName}` placeholder convention (real source
  // quoted in resolveAttributionPlaceholders()'s own comment) was never
  // resolved at all — the raw, unsubstituted placeholder text was passed
  // straight through to MapLibre's raster source, rendering literally
  // instead of being substituted. OpenTopoMap's OWN real, current
  // attribution string (confirmed directly against the actual generated
  // catalog, not paraphrased) is the regression case: it references
  // `{attribution.OpenStreetMap}` and nothing else needs to change for
  // this to reproduce — confirmed this assertion genuinely fails against
  // a reverted resolveAttributionPlaceholders() (the raw placeholder text
  // survives verbatim) before confirming it passes against the fix.
  it("resolves OpenTopoMap's real {attribution.OpenStreetMap} placeholder against the top-level OpenStreetMap entry's own attribution", async () => {
    const result = await resolveRasterProvider('OpenTopoMap')
    expect(result?.attribution).not.toContain('{attribution.')
    expect(result?.attribution).toBe(
      'Map data: OpenStreetMap, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    )
  })

  // The SECOND real regression case — the one that actually broke in a
  // real production build (012-webgl-context-management's own "Flowmap
  // Esri World Imagery Preset"/"Flowmap UGRC Vector Hybrid" fixture
  // panels): the placeholder lives on a VARIANT's own attribution
  // (Esri.WorldImagery), not the parent's, and references the PARENT's
  // top-level attribution (`{attribution.Esri}`) — confirming resolution
  // happens against `resolved.options.attribution` (the already-merged,
  // post-variant-override value), not against the parent's raw entry
  // directly.
  it("resolves Esri.WorldImagery's real {attribution.Esri} placeholder (on the VARIANT's own attribution) against the parent Esri entry", async () => {
    const result = await resolveRasterProvider('Esri.WorldImagery')
    expect(result?.attribution).not.toContain('{attribution.')
    expect(result?.attribution).toBe(
      'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    )
  })

  // Genuinely recursive/chained resolution — no REAL 2-level chain exists
  // in the current catalog (every {attribution.X}-referencing provider's
  // own referenced target has no placeholder of its own, confirmed
  // directly against the real generated catalog), so this specific case
  // is deliberately synthetic, unlike the two regression tests above —
  // it proves resolveAttributionPlaceholders() matches leaflet-providers'
  // own genuinely recursive `attributionReplacer` (real source quoted in
  // that function's own comment) rather than only a single substitution
  // pass, which would leave B's own unresolved placeholder sitting inside
  // A's final resolved string.
  it('resolves a chained placeholder — a referenced provider whose own attribution itself contains another placeholder', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...FIXTURE_CATALOG,
        ChainA: {
          url: 'https://tile.chain-a.test/{z}/{x}/{y}.png',
          options: { attribution: '{attribution.ChainB} via ChainA' },
        },
        ChainB: {
          url: 'https://tile.chain-b.test/{z}/{x}/{y}.png',
          options: { attribution: '{attribution.OpenStreetMap} via ChainB' },
        },
      }),
    } as Response)
    const result = await resolveRasterProvider('ChainA')
    expect(result?.attribution).toBe('OpenStreetMap via ChainB via ChainA')
  })

  // Fail-soft (FR-010's own established convention) — an unresolvable
  // reference (the referenced provider name isn't in the catalog at all)
  // must never throw and must never silently drop the REST of an
  // otherwise-valid attribution string; leaving that one placeholder's
  // raw text in place is the least-destructive fallback.
  it('leaves an unresolvable {attribution.X} reference as raw, un-substituted text rather than throwing or dropping the whole string', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...FIXTURE_CATALOG,
        BrokenReference: {
          url: 'https://tile.broken.test/{z}/{x}/{y}.png',
          options: { attribution: 'Data by {attribution.NoSuchProvider}, thanks!' },
        },
      }),
    } as Response)
    const result = await resolveRasterProvider('BrokenReference')
    expect(result?.attribution).toBe('Data by {attribution.NoSuchProvider}, thanks!')
  })

  // Defensive-only (no real cycle exists in the actual catalog) — proves
  // a malformed/circular catalog fails soft (a depth cap, matching
  // FR-010) rather than hanging the browser via unbounded recursion,
  // which leaflet-providers.js's own real attributionReplacer has no
  // protection against at all.
  it('never hangs on a circular {attribution.X} reference — depth-capped, fails soft', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...FIXTURE_CATALOG,
        CycleA: { url: 'https://tile.cycle-a.test/{z}/{x}/{y}.png', options: { attribution: '{attribution.CycleB}' } },
        CycleB: { url: 'https://tile.cycle-b.test/{z}/{x}/{y}.png', options: { attribution: '{attribution.CycleA}' } },
      }),
    } as Response)
    const result = await resolveRasterProvider('CycleA')
    // Never resolves (genuinely circular) — must still return promptly
    // with SOME string, not hang/throw/stack-overflow.
    expect(typeof result?.attribution).toBe('string')
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
