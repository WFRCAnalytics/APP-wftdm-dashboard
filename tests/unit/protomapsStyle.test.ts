import { describe, expect, it } from 'vitest'
import {
  PROTOMAPS_FLAVOR_NAMES,
  PROTOMAPS_ATTRIBUTION,
  isProtomapsFlavorName,
  buildProtomapsStyle,
} from '@/panels/basemap/protomapsStyle'

// 041-protomaps-pmtiles-basemap (T011) — contracts/basemap-resolution.md.
describe('isProtomapsFlavorName', () => {
  it('accepts all 5 real flavor names', () => {
    for (const name of PROTOMAPS_FLAVOR_NAMES) {
      expect(isProtomapsFlavorName(name)).toBe(true)
    }
  })

  it('rejects arbitrary strings, including other real preset names', () => {
    expect(isProtomapsFlavorName('protomaps-blue')).toBe(false)
    expect(isProtomapsFlavorName('carto-voyager')).toBe(false)
    expect(isProtomapsFlavorName('')).toBe(false)
  })
})

describe('buildProtomapsStyle', () => {
  it('builds a pmtiles:// source referencing the given URL, both for a bundled relative path and a full external URL (FR-004)', () => {
    const relative = buildProtomapsStyle('protomaps-light', { kind: 'pmtiles', url: 'basemap/wasatch-front.pmtiles' })
    expect(relative.sources.protomaps).toMatchObject({
      type: 'vector',
      url: 'pmtiles://basemap/wasatch-front.pmtiles',
    })

    const external = buildProtomapsStyle('protomaps-light', {
      kind: 'pmtiles',
      url: 'https://example.com/region.pmtiles',
    })
    expect(external.sources.protomaps).toMatchObject({
      type: 'vector',
      url: 'pmtiles://https://example.com/region.pmtiles',
    })
  })

  it('builds a live api.protomaps.com ZXY tiles source for a hosted-api key, revised design', () => {
    const style = buildProtomapsStyle('protomaps-light', { kind: 'hosted-api', apiKey: 'test-key-123' })
    expect(style.sources.protomaps).toMatchObject({
      type: 'vector',
      tiles: ['https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=test-key-123'],
    })
    // No pmtiles:// URL anywhere for this source kind.
    expect(style.sources.protomaps).not.toHaveProperty('url')
  })

  it('sets the confirmed real attribution string exactly, for both source kinds', () => {
    const pmtilesStyle = buildProtomapsStyle('protomaps-dark', {
      kind: 'pmtiles',
      url: 'tests/fixtures/protomaps/tiny-test-area.pmtiles',
    })
    expect(pmtilesStyle.sources.protomaps).toMatchObject({ attribution: PROTOMAPS_ATTRIBUTION })

    const hostedStyle = buildProtomapsStyle('protomaps-dark', { kind: 'hosted-api', apiKey: 'test-key-123' })
    expect(hostedStyle.sources.protomaps).toMatchObject({ attribution: PROTOMAPS_ATTRIBUTION })

    expect(PROTOMAPS_ATTRIBUTION).toBe(
      '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © ' +
        '<a href="https://openstreetmap.org">OpenStreetMap</a>',
    )
  })

  it('sets the confirmed stable sprite/glyphs asset paths, per-flavor sprite', () => {
    const light = buildProtomapsStyle('protomaps-light', { kind: 'pmtiles', url: 'x.pmtiles' })
    expect(light.sprite).toBe('https://protomaps.github.io/basemaps-assets/sprites/v4/light')
    expect(light.glyphs).toBe('https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf')

    const black = buildProtomapsStyle('protomaps-black', { kind: 'pmtiles', url: 'x.pmtiles' })
    expect(black.sprite).toBe('https://protomaps.github.io/basemaps-assets/sprites/v4/black')
  })

  it('generates a non-empty layers array via the real @protomaps/basemaps package, distinct per flavor', () => {
    const light = buildProtomapsStyle('protomaps-light', { kind: 'pmtiles', url: 'x.pmtiles' })
    const dark = buildProtomapsStyle('protomaps-dark', { kind: 'pmtiles', url: 'x.pmtiles' })
    expect(Array.isArray(light.layers)).toBe(true)
    expect(light.layers.length).toBeGreaterThan(0)
    // Real, generated per-flavor layers — not the same object/content
    // reused across flavors (FR-003's own "generated programmatically,
    // not hand-authored/shared" requirement).
    expect(JSON.stringify(light.layers)).not.toBe(JSON.stringify(dark.layers))
  })

  it('version 8, no other sources/layers beyond the generated ones', () => {
    const style = buildProtomapsStyle('protomaps-white', { kind: 'pmtiles', url: 'x.pmtiles' })
    expect(style.version).toBe(8)
    expect(Object.keys(style.sources)).toEqual(['protomaps'])
  })
})
