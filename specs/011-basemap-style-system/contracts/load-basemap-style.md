# Contract: `panels/basemap/loadBasemapStyle.ts`

Full-body code. Turns an `EffectiveBasemap` (or, for the composition path,
a `BasemapComposition`) into whatever `map.setStyle()` actually accepts —
either a URL string (single presets, native relative-resolution, no
fetch/parse in this app's own code — research.md §5/§6) or a fully-merged,
relative-URL-rewritten `StyleSpecification` object (compositions,
research.md §6). Uniformly falls back to `BLANK_STYLE` on any failure
(FR-010, research.md §7).

## `src/panels/basemap/loadBasemapStyle.ts` (NEW)

```ts
// 011-basemap-style-system: resolves a BasemapSelection to what
// maplibregl.Map#setStyle() accepts. See research.md §5/§6/§7.
import type { StyleSpecification } from 'maplibre-gl'
import { isBasemapComposition, type BasemapSelection } from '@/panels/basemap/types'
import { resolveUrlPreset, resolveRasterProvider } from '@/panels/basemap/registry'

// Same background-only, zero-network style FlowMapPanel.tsx already
// defines (010-flowmap-panel) — re-exported here as the single source of
// truth for "the fallback," not redefined a second time in this module
// and a third time in FlowMapPanel.tsx.
export const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5e5e5' } }],
}

/** What FlowMapPanel.tsx's basemap-application effect actually calls
 * map.setStyle() with — a URL is passed through directly (native relative
 * resolution); an object is a fully-resolved StyleSpecification (either
 * an inline raster style or a merged composition). */
export type ResolvedStyle = { kind: 'url'; url: string } | { kind: 'style'; style: StyleSpecification }

export async function loadBasemapStyle(selection: BasemapSelection): Promise<ResolvedStyle> {
  try {
    if (isBasemapComposition(selection)) {
      return { kind: 'style', style: await composeStyles(selection.layers) }
    }
    return await resolvePresetName(selection)
  } catch {
    // FR-010 — uniform fallback across every source category. Never
    // rejects up to the caller; a broken/unreachable basemap must never
    // prevent the panel's data-driven overlay from rendering.
    return { kind: 'style', style: BLANK_STYLE }
  }
}

async function resolvePresetName(name: string): Promise<ResolvedStyle> {
  const urlPreset = resolveUrlPreset(name)
  if (urlPreset) return { kind: 'url', url: urlPreset.url }

  const raster = await resolveRasterProvider(name)
  if (raster) {
    return {
      kind: 'style',
      style: {
        version: 8,
        sources: {
          basemap: {
            type: 'raster',
            tiles: raster.tiles,
            tileSize: 256,
            attribution: raster.attribution,
            maxzoom: raster.maxZoom,
          },
        },
        layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
      },
    }
  }

  // Unrecognized name — same fallback path as a fetch failure (FR-010's
  // "at any precedence level, of any source category" language covers an
  // author typo exactly the same as a genuinely offline network).
  return { kind: 'style', style: BLANK_STYLE }
}

/**
 * Composition (research.md §6, User Story 3, FR-008/FR-009): fetches each
 * layer's style.json, rewrites its own relative sources[*].url/sprite/
 * glyphs fields to absolute URLs resolved against THAT layer's own URL
 * (reproducing MapLibre's own native relative-resolution rule in
 * application code, since a merged in-memory object has no single
 * originating URL for MapLibre to resolve against itself), namespaces
 * each layer's source/layer ids to guarantee no collision across
 * independently-authored layers, and concatenates in stacking order
 * (layers[0] = bottom, matching the UGRC proof case's own hillshade ->
 * base -> labels order). Any single layer's failure aborts the WHOLE
 * composition — FR-010 is "the panel falls back to the blank style for
 * the whole basemap," never a partially-broken composite (User Story 3's
 * own Acceptance Scenario 3).
 */
async function composeStyles(layerUrls: string[]): Promise<StyleSpecification> {
  const merged: StyleSpecification = { version: 8, sources: {}, layers: [] }

  for (let i = 0; i < layerUrls.length; i++) {
    const layerUrl = layerUrls[i]
    const res = await fetch(layerUrl)
    if (!res.ok) throw new Error(`composeStyles: ${layerUrl} -> ${res.status}`)
    const raw = (await res.json()) as StyleSpecification
    const prefix = `layer${i}__`

    const rewrittenSources: StyleSpecification['sources'] = {}
    for (const [sourceId, source] of Object.entries(raw.sources ?? {})) {
      const rewritten = { ...source } as Record<string, unknown>
      if (typeof rewritten.url === 'string') {
        rewritten.url = new URL(rewritten.url, layerUrl).href
      }
      rewrittenSources[`${prefix}${sourceId}`] = rewritten as (typeof raw.sources)[string]
    }
    Object.assign(merged.sources, rewrittenSources)

    const rewrittenLayers = (raw.layers ?? []).map((layer) => ({
      ...layer,
      id: `${prefix}${layer.id}`,
      source: 'source' in layer && layer.source ? `${prefix}${layer.source}` : undefined,
    }))
    merged.layers.push(...(rewrittenLayers as StyleSpecification['layers']))

    // sprite/glyphs are top-level style fields, not per-source — the
    // FIRST layer that declares one wins (matching how a single top-level
    // style only ever has one of each; composing three layers that each
    // declare a DIFFERENT sprite sheet is a real, out-of-scope limitation
    // this feature doesn't attempt to solve — no proof case this session
    // researched needed more than one, and User Story 3's own acceptance
    // criteria only requires "correctly stacked... not broken icons/
    // labels," not multi-sprite composition).
    if (!merged.sprite && typeof raw.sprite === 'string') {
      merged.sprite = new URL(raw.sprite, layerUrl).href
    }
    if (!merged.glyphs && typeof raw.glyphs === 'string') {
      merged.glyphs = new URL(raw.glyphs, layerUrl).href
    }
  }

  return merged
}
```

## `tests/unit/loadBasemapStyle.test.ts` (NEW — the DOM-free parts: URL/
raster resolution and the composition merge/rewrite logic, with `fetch`
mocked; the real end-to-end composition render against UGRC's actual
3-layer service is a Playwright test, per quickstart.md — a mocked unit
test proves the merge/rewrite algorithm in isolation, the Playwright test
proves it against the real, un-mocked proof case)

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { loadBasemapStyle, BLANK_STYLE } from '@/panels/basemap/loadBasemapStyle'

describe('loadBasemapStyle', () => {
  beforeEach(() => {
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

  it('rewrites a relative source url/sprite/glyphs against each layer\'s own URL and namespaces ids', async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
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
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await loadBasemapStyle({
      layers: ['https://example.test/hillshade/root.json', 'https://example.test/base/root.json'],
    })

    expect(result.kind).toBe('style')
    const style = (result as { kind: 'style'; style: import('maplibre-gl').StyleSpecification }).style
    expect(Object.keys(style.sources)).toEqual(['layer0__hillshade', 'layer1__base'])
    expect(style.sources.layer0__hillshade.url).toBe('https://example.test/')
    expect(style.sprite).toBe('https://example.test/sprites/sprite')
    expect(style.layers.map((l) => l.id)).toEqual(['layer0__hs-layer', 'layer1__base-layer'])
    expect(style.layers[0].source).toBe('layer0__hillshade')
    expect(style.layers[1].source).toBe('layer1__base')
  })

  it('falls back to BLANK_STYLE for the WHOLE composition when any one layer fails — never a partial composite', async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
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
})
```
