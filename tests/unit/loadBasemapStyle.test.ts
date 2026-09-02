import { describe, expect, it, vi, beforeEach } from 'vitest'
import { loadBasemapStyle, BLANK_STYLE } from '@/panels/basemap/loadBasemapStyle'
import { __resetProvidersCacheForTests } from '@/panels/basemap/registry'
import type { StyleSpecification } from 'maplibre-gl'

describe('loadBasemapStyle', () => {
  beforeEach(() => {
    __resetProvidersCacheForTests()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('resolves a CARTO/OpenFreeMap preset name to its URL directly — no fetch', async () => {
    const result = await loadBasemapStyle('carto-positron')
    expect(result).toEqual({
      kind: 'url',
      url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falls back to BLANK_STYLE for an unrecognized preset name (author typo)', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)
    const result = await loadBasemapStyle('totally-made-up-preset')
    expect(result).toEqual({ kind: 'style', style: BLANK_STYLE })
  })

  it("rewrites a relative source url/sprite/glyphs against each layer's own URL and namespaces ids", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'https://example.test/hillshade/root.json') {
        return {
          ok: true,
          json: async () => ({
            version: 8,
            sources: { hillshade: { type: 'vector', url: '../../' } },
            sprite: '../../sprites/sprite',
            glyphs: '../../{fontstack}/{range}.pbf',
            layers: [{ id: 'hs-layer', type: 'fill', source: 'hillshade' }],
          }),
        } as Response
      }
      if (url === 'https://example.test/base/root.json') {
        return {
          ok: true,
          json: async () => ({
            version: 8,
            sources: { base: { type: 'vector', url: '../../' } },
            layers: [{ id: 'base-layer', type: 'fill', source: 'base' }],
          }),
        } as Response
      }
      // Both sources' own "../../" url resolves to the SAME absolute
      // root URL (https://example.test/) — matching the real UGRC case,
      // where distinct services (VectorHillshade, LiteBase) each have
      // their own real TileJSON at this same relative depth. Real
      // TileJSON shape confirmed against the actual UGRC endpoint during
      // implementation (research.md §6 update): a RELATIVE `tiles`
      // template, which inlineTileJsonSource() must resolve itself
      // (MapLibre cannot, for an in-memory/composed style).
      if (url === 'https://example.test/') {
        return { ok: true, json: async () => ({ tiles: ['tile/{z}/{x}/{y}.pbf'] }) } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await loadBasemapStyle({
      layers: ['https://example.test/hillshade/root.json', 'https://example.test/base/root.json'],
    })

    expect(result.kind).toBe('style')
    const style = (result as { kind: 'style'; style: StyleSpecification }).style
    expect(Object.keys(style.sources)).toEqual(['layer0__hillshade', 'layer1__base'])
    // The source's own `url` is replaced entirely with an inlined,
    // absolute `tiles` array — not left as a `url` reference — since
    // MapLibre can't resolve that TileJSON's own relative `tiles`
    // template for a composed, in-memory style (research.md §6 update).
    expect((style.sources.layer0__hillshade as { url?: string }).url).toBeUndefined()
    expect((style.sources.layer0__hillshade as { tiles?: string[] }).tiles).toEqual([
      'https://example.test/tile/{z}/{x}/{y}.pbf',
    ])
    expect(style.sprite).toBe('https://example.test/sprites/sprite')
    // Regression coverage for a real bug found during implementation
    // (research.md §6 update): a naive `new URL()` resolution percent-
    // encodes glyphs' required literal {fontstack}/{range} template
    // tokens, which MapLibre's style validator then rejects outright.
    expect(style.glyphs).toBe('https://example.test/{fontstack}/{range}.pbf')
    expect(style.layers.map((l) => l.id)).toEqual(['layer0__hs-layer', 'layer1__base-layer'])
    expect((style.layers[0] as { source?: string }).source).toBe('layer0__hillshade')
    expect((style.layers[1] as { source?: string }).source).toBe('layer1__base')
  })

  it('falls back to BLANK_STYLE for the WHOLE composition when any one layer fails — never a partial composite', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'https://example.test/ok.json') {
        return { ok: true, json: async () => ({ version: 8, sources: {}, layers: [] }) } as Response
      }
      return { ok: false, status: 500 } as Response
    })
    const result = await loadBasemapStyle({
      layers: ['https://example.test/ok.json', 'https://example.test/broken.json'],
    })
    expect(result).toEqual({ kind: 'style', style: BLANK_STYLE })
  })

  it('resolves a raster provider preset name via a real fetched catalog', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('basemap/leaflet-providers.json')) {
        return {
          ok: true,
          json: async () => ({
            OpenTopoMap: {
              url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
              options: { attribution: 'OpenTopoMap' },
            },
          }),
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await loadBasemapStyle('OpenTopoMap')
    expect(result.kind).toBe('style')
    const style = (result as { kind: 'style'; style: StyleSpecification }).style
    expect(style.sources.basemap).toMatchObject({
      type: 'raster',
      tiles: [
        'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
      ],
    })
  })
})
