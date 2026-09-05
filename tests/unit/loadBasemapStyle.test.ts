import { describe, expect, it, vi, beforeEach } from 'vitest'
import { loadBasemapStyle, BLANK_STYLE, freshBlankStyle } from '@/panels/basemap/loadBasemapStyle'
import { __resetProvidersCacheForTests } from '@/panels/basemap/registry'
import type { StyleSpecification } from 'maplibre-gl'

// 012-webgl-context-management — regression coverage for a real,
// confirmed live-user bug: MapLibre treats a Map's constructor-time/
// setStyle() style as a LIVE, mutable object, not something it
// defensively clones. Handing every flowmap panel the SAME BLANK_STYLE
// object reference let one panel's own real basemap transition mutate
// resolved fields (confirmed: sprite/glyphs) directly onto that shared
// object, corrupting every OTHER panel still starting from "blank" —
// invisible with one flowmap panel per tab (010/011's own coverage),
// only surfaced once this feature made several real panels on one tab
// normal. The existing `.toEqual()`-based tests above (VALUE equality)
// cannot catch a regression back to this bug — a broken freshBlankStyle()
// that returned the shared BLANK_STYLE reference itself would still pass
// every one of them. This block asserts REFERENCE independence
// specifically, reproducing the exact corruption shape the real bug had
// (a `sprite`/`glyphs` field mutated onto an otherwise-blank style).
describe('freshBlankStyle', () => {
  it('returns a genuinely independent object on every call — mutating one result never affects another call\'s result or the BLANK_STYLE constant', () => {
    const first = freshBlankStyle()
    const second = freshBlankStyle()

    // Not the same object as each other, and not the same object as the
    // canonical constant either — three distinct references.
    expect(first).not.toBe(second)
    expect(first).not.toBe(BLANK_STYLE)
    expect(second).not.toBe(BLANK_STYLE)

    // All three still agree on VALUE before any mutation.
    expect(first).toEqual(BLANK_STYLE)
    expect(second).toEqual(BLANK_STYLE)

    // Reproduce the real corruption shape directly: a resolved style's
    // sprite/glyphs mutated onto what should have been an independent
    // blank style, plus a mutation of a NESTED field (the background
    // layer's own paint color) to prove this is a genuine deep clone,
    // not a shallow one that would still share nested objects/arrays.
    ;(first as StyleSpecification & { sprite?: string; glyphs?: string }).sprite =
      'https://tiles.basemaps.cartocdn.com/gl/positron-gl-style/sprite'
    ;(first as StyleSpecification & { sprite?: string; glyphs?: string }).glyphs =
      'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf'
    first.layers.push({ id: 'mutated-extra-layer', type: 'background', paint: {} })
    const firstBackgroundLayer = first.layers[0] as { paint: { 'background-color'?: string } }
    firstBackgroundLayer.paint['background-color'] = '#ff0000'

    // The SECOND call's own, already-obtained result is completely
    // unaffected by mutating the first.
    expect((second as StyleSpecification & { sprite?: string }).sprite).toBeUndefined()
    expect((second as StyleSpecification & { glyphs?: string }).glyphs).toBeUndefined()
    expect(second.layers).toHaveLength(1)
    expect((second.layers[0] as { paint: { 'background-color'?: string } }).paint['background-color']).toBe(
      '#e5e5e5',
    )

    // The canonical BLANK_STYLE constant itself — what every future
    // freshBlankStyle() call clones FROM — is also completely unaffected.
    expect((BLANK_STYLE as StyleSpecification & { sprite?: string }).sprite).toBeUndefined()
    expect((BLANK_STYLE as StyleSpecification & { glyphs?: string }).glyphs).toBeUndefined()
    expect(BLANK_STYLE.layers).toHaveLength(1)
    expect((BLANK_STYLE.layers[0] as { paint: { 'background-color'?: string } }).paint['background-color']).toBe(
      '#e5e5e5',
    )

    // A call made AFTER the mutation is also unaffected — confirms
    // freshBlankStyle() clones from the pristine constant every time,
    // not from whatever the previous call's (now-mutated) result was.
    const third = freshBlankStyle()
    expect(third).toEqual(BLANK_STYLE)
    expect((third as StyleSpecification & { sprite?: string }).sprite).toBeUndefined()
  })
})

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
            layers: [
              { id: 'hs-layer', type: 'fill', source: 'hillshade' },
              // 017-multi-sprite-support: this composition has only ONE
              // sprite-declaring layer (hillshade) — base-layer below
              // declares none. icon-image still gets prefixed here even
              // so, per FR-004's own "no special-cased skip" — see the
              // sprite/icon-image assertions below.
              {
                id: 'hs-icon-layer',
                type: 'symbol',
                source: 'hillshade',
                layout: { 'icon-image': 'peak' },
              },
            ],
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
    // 017-multi-sprite-support: this composition has only ONE
    // sprite-declaring layer (hillshade) — base-layer's own root.json
    // declares no sprite at all. `style.sprite` is STILL the array
    // form (length 1), never a plain string, per FR-004's own "no
    // special-cased skip for the single-sprite case" — see
    // contracts/compose-styles-multi-sprite.md's own table.
    expect(style.sprite).toEqual([{ id: 'layer0', url: 'https://example.test/sprites/sprite' }])
    // Regression coverage for a real bug found during implementation
    // (research.md §6 update): a naive `new URL()` resolution percent-
    // encodes glyphs' required literal {fontstack}/{range} template
    // tokens, which MapLibre's style validator then rejects outright.
    expect(style.glyphs).toBe('https://example.test/{fontstack}/{range}.pbf')
    // 016-fix-ugrc-dark-mode: neither composed source above provides its
    // own `background`-typed layer, so composeStyles() injects one at
    // the bottom (index 0) — a real, confirmed fix for corrupted-color
    // rendering on real hardware (specs/016-fix-ugrc-dark-mode/
    // diagnostic-results.md); every other layer shifts down by one.
    expect(style.layers.map((l) => l.id)).toEqual([
      'background',
      'layer0__hs-layer',
      'layer0__hs-icon-layer',
      'layer1__base-layer',
    ])
    expect(style.layers[0]).toMatchObject({ type: 'background', paint: { 'background-color': '#ffffff' } })
    expect((style.layers[1] as { source?: string }).source).toBe('layer0__hillshade')
    // 017-multi-sprite-support: icon-image is prefixed with this layer's
    // OWN sprite id ("layer0") even though it's the composition's only
    // sprite-declaring layer — the reference STRING changes ("peak" ->
    // "layer0:peak"), but this is not a rendering regression (FR-003/
    // FR-004's own explicit distinction): the rendered icon is
    // unaffected, since "layer0" IS this sprite's own real id in the
    // array form above, not an arbitrary/unresolvable prefix.
    expect((style.layers[2] as { layout?: { 'icon-image'?: string } }).layout?.['icon-image']).toBe('layer0:peak')
    expect((style.layers[3] as { source?: string }).source).toBe('layer1__base')
  })

  // 017-multi-sprite-support — the actual, confirmed real-world bug
  // (specs/017-multi-sprite-support/research.md §1): TWO composed
  // layers each declare their own sprite, and the layer that actually
  // needs its OWN icons (matching LiteLabels/Outdoors_Labels's own real
  // shape — an icon-only layer, no icons on the base layer at all) is
  // NOT the first one processed. Under the old "first sprite wins"
  // logic, this layer's own sprite was silently discarded entirely and
  // its icon-image references could never resolve. Confirmed fixed.
  it('preserves and correctly resolves a SECOND composed layer\'s own sprite/icon-image — the real UGRC bug shape', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'https://example.test/base-no-icons/nested/root.json') {
        return {
          ok: true,
          json: async () => ({
            version: 8,
            sources: { base: { type: 'vector', url: '../../' } },
            sprite: '../sprites/sprite',
            layers: [{ id: 'base-layer', type: 'fill', source: 'base' }],
          }),
        } as Response
      }
      if (url === 'https://example.test/labels-with-icons/nested/root.json') {
        return {
          ok: true,
          json: async () => ({
            version: 8,
            sources: { labels: { type: 'vector', url: '../../' } },
            sprite: '../sprites/sprite',
            layers: [
              { id: 'highway-shield', type: 'symbol', source: 'labels', layout: { 'icon-image': 'Interstates' } },
            ],
          }),
        } as Response
      }
      if (url === 'https://example.test/') {
        return { ok: true, json: async () => ({ tiles: ['tile/{z}/{x}/{y}.pbf'] }) } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await loadBasemapStyle({
      layers: [
        'https://example.test/base-no-icons/nested/root.json',
        'https://example.test/labels-with-icons/nested/root.json',
      ],
    })

    expect(result.kind).toBe('style')
    const style = (result as { kind: 'style'; style: StyleSpecification }).style

    // BOTH layers' own sprites survive — the real, confirmed fix. Under
    // the old logic, only layer0's own sprite URL would appear here at
    // all, as a plain string, and layer1's would be silently dropped.
    expect(style.sprite).toEqual([
      { id: 'layer0', url: 'https://example.test/base-no-icons/sprites/sprite' },
      { id: 'layer1', url: 'https://example.test/labels-with-icons/sprites/sprite' },
    ])

    // layer1's own icon-image resolves against ITS OWN sprite id
    // ("layer1"), not layer0's (which is what "first sprite wins" would
    // have silently left it stuck referencing).
    const shieldLayer = style.layers.find((l) => l.id === 'layer1__highway-shield')
    expect((shieldLayer as { layout?: { 'icon-image'?: string } })?.layout?.['icon-image']).toBe(
      'layer1:Interstates',
    )
  })

  // 017-multi-sprite-support — User Story 3: the mechanism generalizes
  // to ANY future composition with multiple sprite-declaring layers,
  // not just the two currently-known real UGRC panels. Deliberately
  // generic, non-UGRC-shaped fixture URLs/icon names — proves this is
  // not a special case reading panel titles or specific real service
  // names (FR-006), and — unlike the previous test, where only layer1
  // had icon-image layers — BOTH layers here have their own icons, so
  // this confirms each one resolves to its OWN sprite specifically,
  // not merely that "the second layer's icons now work."
  it('resolves each composed layer\'s own icon-image against its own sprite when BOTH layers declare one, with non-overlapping icon names', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'https://example.test/roadsigns/nested/root.json') {
        return {
          ok: true,
          json: async () => ({
            version: 8,
            sources: { roads: { type: 'vector', url: '../../' } },
            sprite: '../sprites/sprite',
            layers: [{ id: 'stop-sign-layer', type: 'symbol', source: 'roads', layout: { 'icon-image': 'stop_sign' } }],
          }),
        } as Response
      }
      if (url === 'https://example.test/shops/nested/root.json') {
        return {
          ok: true,
          json: async () => ({
            version: 8,
            sources: { shops: { type: 'vector', url: '../../' } },
            sprite: '../sprites/sprite',
            layers: [{ id: 'cafe-layer', type: 'symbol', source: 'shops', layout: { 'icon-image': 'cafe' } }],
          }),
        } as Response
      }
      if (url === 'https://example.test/') {
        return { ok: true, json: async () => ({ tiles: ['tile/{z}/{x}/{y}.pbf'] }) } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await loadBasemapStyle({
      layers: ['https://example.test/roadsigns/nested/root.json', 'https://example.test/shops/nested/root.json'],
    })

    expect(result.kind).toBe('style')
    const style = (result as { kind: 'style'; style: StyleSpecification }).style

    expect(style.sprite).toEqual([
      { id: 'layer0', url: 'https://example.test/roadsigns/sprites/sprite' },
      { id: 'layer1', url: 'https://example.test/shops/sprites/sprite' },
    ])

    const stopSignLayer = style.layers.find((l) => l.id === 'layer0__stop-sign-layer')
    const cafeLayer = style.layers.find((l) => l.id === 'layer1__cafe-layer')
    // Each layer's own icon resolves against its OWN sprite id — not
    // both collapsing onto layer0 (the old "first wins" bug) and not
    // swapped (layer0 getting layer1's prefix or vice versa).
    expect((stopSignLayer as { layout?: { 'icon-image'?: string } })?.layout?.['icon-image']).toBe(
      'layer0:stop_sign',
    )
    expect((cafeLayer as { layout?: { 'icon-image'?: string } })?.layout?.['icon-image']).toBe('layer1:cafe')
  })

  // 017-multi-sprite-support — FR-005: confirmed, exhaustively, that no
  // real currently-composed layer's icon-image is a style expression
  // (research.md §1) — this test exercises that branch anyway, via a
  // synthetic fixture, since the requirement is to handle it
  // explicitly (warn, leave unrewritten), never silently.
  it('warns and leaves icon-image untouched when its value is a style expression, not a literal string', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'https://example.test/expr/root.json') {
        return {
          ok: true,
          json: async () => ({
            version: 8,
            sources: { data: { type: 'vector', url: '../../' } },
            sprite: '../../sprites/sprite',
            layers: [
              {
                id: 'dynamic-icon-layer',
                type: 'symbol',
                source: 'data',
                layout: { 'icon-image': ['get', 'icon'] },
              },
            ],
          }),
        } as Response
      }
      if (url === 'https://example.test/') {
        return { ok: true, json: async () => ({ tiles: ['tile/{z}/{x}/{y}.pbf'] }) } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await loadBasemapStyle({ layers: ['https://example.test/expr/root.json'] })
    expect(result.kind).toBe('style')
    const style = (result as { kind: 'style'; style: StyleSpecification }).style

    const exprLayer = style.layers.find((l) => l.id === 'layer0__dynamic-icon-layer')
    // Untouched — NOT prefixed, since a bare string prefix can't safely
    // rewrite an expression tree.
    expect((exprLayer as { layout?: { 'icon-image'?: unknown } })?.layout?.['icon-image']).toEqual(['get', 'icon'])
    // But not silent either (FR-005) — a scoped warning names the
    // specific layer and its source composition URL.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dynamic-icon-layer'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('https://example.test/expr/root.json'))
    warnSpy.mockRestore()
  })

  // 016-fix-ugrc-dark-mode — a composed source that DOES provide its own
  // background-typed layer (namespaced like any other layer id, e.g.
  // `layer0__background`) must NOT get a second, redundant one injected
  // — a real author's own intentional background is never double-covered
  // or overridden.
  it('does not inject a background layer when a composed source already provides its own', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'https://example.test/base/root.json') {
        return {
          ok: true,
          json: async () => ({
            version: 8,
            sources: { base: { type: 'vector', url: '../../' } },
            layers: [
              { id: 'own-background', type: 'background', paint: { 'background-color': '#123456' } },
              { id: 'base-layer', type: 'fill', source: 'base' },
            ],
          }),
        } as Response
      }
      if (url === 'https://example.test/') {
        return { ok: true, json: async () => ({ tiles: ['tile/{z}/{x}/{y}.pbf'] }) } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await loadBasemapStyle({ layers: ['https://example.test/base/root.json'] })
    expect(result.kind).toBe('style')
    const style = (result as { kind: 'style'; style: StyleSpecification }).style

    const backgroundLayers = style.layers.filter((l) => l.type === 'background')
    expect(backgroundLayers).toHaveLength(1)
    // The composed source's own namespaced background — not a second,
    // injected one — and its own real color, untouched.
    expect(style.layers[0]).toMatchObject({
      id: 'layer0__own-background',
      paint: { 'background-color': '#123456' },
    })
    expect(style.layers.map((l) => l.id)).toEqual(['layer0__own-background', 'layer0__base-layer'])
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

  // 012-webgl-context-management — a composition layer entry that isn't
  // a URL (no http(s):// scheme) resolves as a raster provider preset
  // name instead of a fetched style document — the mechanism this
  // feature added specifically to represent UGRC's real "Vector Hybrid
  // Base Map" (a raster layer, Esri World Imagery, underneath a vector
  // overlay layer, both real, confirmed live during implementation).
  it('composes a raster provider layer underneath a real vector-style URL layer — a mixed raster+vector composition', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('basemap/leaflet-providers.json')) {
        return {
          ok: true,
          json: async () => ({
            'Esri': {
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/{variant}/MapServer/tile/{z}/{y}/{x}',
              options: { variant: 'World_Street_Map', attribution: 'Tiles &copy; Esri' },
              variants: {
                WorldImagery: { options: { variant: 'World_Imagery', attribution: 'Esri World Imagery' } },
              },
            },
          }),
        } as Response
      }
      if (url === 'https://example.test/overlay/root.json') {
        return {
          ok: true,
          json: async () => ({
            version: 8,
            sources: { overlay: { type: 'vector', url: '../../' } },
            layers: [{ id: 'labels', type: 'symbol', source: 'overlay' }],
          }),
        } as Response
      }
      if (url === 'https://example.test/') {
        return { ok: true, json: async () => ({ tiles: ['tile/{z}/{x}/{y}.pbf'] }) } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await loadBasemapStyle({
      layers: ['Esri.WorldImagery', 'https://example.test/overlay/root.json'],
    })

    expect(result.kind).toBe('style')
    const style = (result as { kind: 'style'; style: StyleSpecification }).style

    // Raster layer (index 0, bottom) — namespaced, no fetch of a "style
    // document" for it (none exists to fetch — resolved programmatically
    // via resolveRasterProvider(), same mechanism a panel-level
    // `basemap: Esri.WorldImagery` pin already uses).
    expect(style.sources.layer0__basemap).toMatchObject({
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    })
    // 016-fix-ugrc-dark-mode: neither the raster layer nor the vector
    // overlay provides its own `background`-typed layer, so
    // composeStyles() injects one at the very bottom (index 0) — every
    // other layer shifts down by one (see the "rewrites a relative
    // source..." test above for the full reasoning/citation).
    expect(style.layers[0]).toMatchObject({ type: 'background', paint: { 'background-color': '#ffffff' } })
    expect(style.layers[1]).toMatchObject({ id: 'layer0__basemap', type: 'raster', source: 'layer0__basemap' })

    // Vector layer (top) — fetched and rewritten exactly like any other
    // URL composition layer, unaffected by the raster layer preceding it.
    expect(style.sources.layer1__overlay).toMatchObject({ type: 'vector' })
    expect((style.sources.layer1__overlay as { tiles?: string[] }).tiles).toEqual([
      'https://example.test/tile/{z}/{x}/{y}.pbf',
    ])
    expect(style.layers[2]).toMatchObject({ id: 'layer1__labels', source: 'layer1__overlay' })

    // Stacking order: injected background (bottom) → raster → vector
    // (top) — the real UGRC Vector Hybrid's own intended order (imagery
    // under labels, not the reverse) is preserved above the new
    // background layer.
    expect(style.layers.map((l) => l.id)).toEqual(['background', 'layer0__basemap', 'layer1__labels'])
  })

  // 012-webgl-context-management — a REAL bug found via live production
  // debugging: the existing "mixed raster+vector composition" test above
  // uses `toMatchObject`, which only asserts the listed keys are present
  // with matching values — it does NOT fail if the object carries EXTRA
  // own-enumerable keys, so it never caught this. Both raster-source call
  // sites (resolvePresetName's simple-preset branch, composeStyles' own
  // raster branch) unconditionally wrote `maxzoom: raster.maxZoom` even
  // when a provider defines no maxZoom override at all (Esri.WorldImagery
  // in the real catalog is exactly this case — confirmed directly).
  // `raster.maxZoom` is then `undefined`, but the KEY still ends up
  // own-enumerable on the resulting source object (`Object.keys()`
  // reports it) — MapLibre's real style-spec validator normalizes that
  // to `null` for its type check, firing a genuine 'error' event and
  // silently reverting the whole map to BLANK_STYLE before any tile ever
  // fetches (confirmed live: a real production build's browser console
  // showed "Expected value to be of type number, but found null instead"
  // for exactly this panel, and window.__flowmapTestMaps' own
  // map.getStyle() showed zero sources — BLANK_STYLE — despite
  // resolveRasterProvider() itself resolving correctly, traced with
  // temporary instrumentation). Fixed with a conditional spread (the same
  // pattern inlineTileJsonSource() already uses for its own optional
  // fields) — this test asserts the key is truly ABSENT, not merely
  // undefined-valued, which `toMatchObject`/`toEqual` alone cannot catch.
  it('omits maxzoom/attribution entirely from a raster source when the provider defines neither — never an own-enumerable undefined-valued key', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('basemap/leaflet-providers.json')) {
        return {
          ok: true,
          json: async () => ({
            Esri: {
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/{variant}/MapServer/tile/{z}/{y}/{x}',
              options: { variant: 'World_Street_Map' },
              variants: {
                // Real shape, real gap: WorldImagery defines a variant
                // (so it's a resolvable name) but neither an attribution
                // nor a maxZoom override of its own — matching the real
                // catalog exactly (confirmed directly against
                // public/basemap/leaflet-providers.json's real "Esri"
                // entry during this bug's investigation).
                WorldImagery: { options: { variant: 'World_Imagery' } },
              },
            },
          }),
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    // resolvePresetName's own simple-preset branch — a panel-level
    // `basemap: Esri.WorldImagery` pin, not a composition.
    const presetResult = await loadBasemapStyle('Esri.WorldImagery')
    expect(presetResult.kind).toBe('style')
    const presetStyle = (presetResult as { kind: 'style'; style: StyleSpecification }).style
    const presetSource = presetStyle.sources.basemap as Record<string, unknown>
    expect(Object.keys(presetSource)).not.toContain('maxzoom')
    expect(Object.keys(presetSource)).not.toContain('attribution')
    expect(Object.prototype.hasOwnProperty.call(presetSource, 'maxzoom')).toBe(false)

    __resetProvidersCacheForTests()

    // composeStyles' own raster branch — the SAME provider used as one
    // layer of a composition (the real UGRC Vector Hybrid's own shape).
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('basemap/leaflet-providers.json')) {
        return {
          ok: true,
          json: async () => ({
            Esri: {
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/{variant}/MapServer/tile/{z}/{y}/{x}',
              options: { variant: 'World_Street_Map' },
              variants: { WorldImagery: { options: { variant: 'World_Imagery' } } },
            },
          }),
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    const compositionResult = await loadBasemapStyle({ layers: ['Esri.WorldImagery'] })
    expect(compositionResult.kind).toBe('style')
    const compositionStyle = (compositionResult as { kind: 'style'; style: StyleSpecification }).style
    const compositionSource = compositionStyle.sources.layer0__basemap as Record<string, unknown>
    expect(Object.keys(compositionSource)).not.toContain('maxzoom')
    expect(Object.keys(compositionSource)).not.toContain('attribution')
    expect(Object.prototype.hasOwnProperty.call(compositionSource, 'maxzoom')).toBe(false)
  })

  it('throws for an unrecognized raster provider name used as a composition layer — falls back to BLANK_STYLE, same as any other composition failure', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('basemap/leaflet-providers.json')) {
        return { ok: true, json: async () => ({}) } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await loadBasemapStyle({ layers: ['NotARealProvider.Variant'] })
    expect(result).toEqual({ kind: 'style', style: BLANK_STYLE })
  })

  // 021-basemap-catalog-redesign (T010): proves FR-009 structurally — a
  // built-in UGRC preset NAME reaches composeStyles() through the exact
  // same call this test makes by hand with the equivalent ad hoc
  // `{ layers: [...] }` object, so removing the preset alias from the
  // registry in the future could never break an author's own manually-
  // written equivalent (research.md §1).
  it("resolves the built-in 'ugrc-vector-lite' preset via composeStyles() identically to the equivalent ad hoc composition object", async () => {
    const LITE_BASE_URL =
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/LiteBase/VectorTileServer/resources/styles/root.json'
    const LITE_LABELS_URL =
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/LiteLabels/VectorTileServer/resources/styles/root.json'
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === LITE_BASE_URL) {
        return { ok: true, json: async () => ({ version: 8, sources: {}, layers: [{ id: 'base-layer', type: 'fill' }] }) } as Response
      }
      if (url === LITE_LABELS_URL) {
        return {
          ok: true,
          json: async () => ({ version: 8, sources: {}, layers: [{ id: 'labels-layer', type: 'fill' }] }),
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const viaPreset = await loadBasemapStyle('ugrc-vector-lite')
    const viaAdHocComposition = await loadBasemapStyle({ layers: [LITE_BASE_URL, LITE_LABELS_URL] })

    expect(viaPreset.kind).toBe('style')
    expect(viaPreset).toEqual(viaAdHocComposition)
  })
})
