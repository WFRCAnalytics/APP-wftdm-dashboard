// 011-basemap-style-system: resolves a BasemapSelection to what
// maplibregl.Map#setStyle() accepts. See
// specs/011-basemap-style-system/research.md §5/§6/§7.
import type { StyleSpecification } from 'maplibre-gl'
import { isBasemapComposition, type BasemapSelection } from '@/panels/basemap/types'
import { resolveUrlPreset, resolveRasterProvider } from '@/panels/basemap/registry'

// Same background-only, zero-network style FlowMapPanel.tsx defined in
// 010-flowmap-panel — re-exported here as the single source of truth for
// "the fallback."
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

/**
 * `signal` (optional — omitted in unit tests that don't need it) is
 * threaded through to every `fetch()` call this function or its helpers
 * make. Found necessary empirically during implementation, not part of
 * the original design: React 18 StrictMode (enabled in main.tsx)
 * double-invokes FlowMapPanel's basemap-application effect, and a plain
 * "ignore the stale result" guard does NOT stop the stale invocation's
 * own `fetch()` calls from continuing to run on the network — for a
 * multi-fetch composition, that redundant concurrent load was observed
 * to cause the CURRENT (non-stale) invocation's own fetch to fail with a
 * genuine `TypeError: Failed to fetch`, not just a benign race in which
 * result gets applied. Actually cancelling the stale invocation's
 * requests via AbortController — not merely ignoring their result —
 * removes the redundant load entirely (research.md §1's own established
 * empirical-verification discipline: found by running the real UGRC
 * proof case for real, not assumed fine from the design alone).
 */
export async function loadBasemapStyle(
  selection: BasemapSelection,
  signal?: AbortSignal,
): Promise<ResolvedStyle> {
  try {
    if (isBasemapComposition(selection)) {
      return { kind: 'style', style: await composeStyles(selection.layers, signal) }
    }
    return await resolvePresetName(selection, signal)
  } catch (e) {
    // An aborted fetch (StrictMode's stale invocation, or a real unmount)
    // rejects with an AbortError — that is NOT a real basemap failure and
    // must not resolve to BLANK_STYLE: the caller's generation-counter
    // guard already discards an aborted invocation's result, but letting
    // it silently resolve to BLANK_STYLE first would still be wasted
    // work masquerading as a real fallback decision. Re-throwing lets it
    // propagate as a rejected promise — FlowMapPanel's effect attaches a
    // `.catch()` specifically to treat this one case (and only this one)
    // as a deliberate, silent no-op, not an unhandled-rejection risk.
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    // FR-010 — uniform fallback across every other source of failure.
    // Never rejects up to the caller for a REAL (non-abort) failure; a
    // broken/unreachable basemap must never prevent the panel's
    // data-driven overlay from rendering.
    return { kind: 'style', style: BLANK_STYLE }
  }
}

async function resolvePresetName(name: string, signal?: AbortSignal): Promise<ResolvedStyle> {
  const urlPreset = resolveUrlPreset(name)
  if (urlPreset) return { kind: 'url', url: urlPreset.url }

  const raster = await resolveRasterProvider(name, signal)
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
 * the whole basemap," never a partially-broken composite.
 */
/**
 * `new URL(relative, base).href` percent-encodes `{`/`}` (not valid
 * literal URL characters per the URL spec) into `%7B`/`%7D` — fine for a
 * plain source `url`, but genuinely wrong for `glyphs`, whose value is a
 * TEMPLATE containing literal `{fontstack}`/`{range}` tokens MapLibre
 * requires verbatim (its style validator rejects an encoded token with
 * "glyphs url must include a {fontstack} token", found empirically
 * against the real UGRC proof case during implementation — a first
 * version of this rewrite broke every composed style's glyphs this way,
 * silently: the malformed glyphs URL fired a MapLibre style-validation
 * 'error' event, which FlowMapPanel's own FR-010 fallback listener then
 * (correctly, per its own coarse-by-design contract) treated as "the
 * basemap failed to load," reverting the whole map back to BLANK_STYLE —
 * a successfully-composed style undone by this one field's bad rewrite).
 * Decoding just `%7B`/`%7D` back to `{`/`}` after resolution is safe and
 * sufficient — no other real style field's value legitimately contains a
 * literal percent-encoded brace this would incorrectly restore.
 */
function resolveUrlPreservingTemplateTokens(relative: string, base: string): string {
  return new URL(relative, base).href.replace(/%7B/gi, '{').replace(/%7D/gi, '}')
}

/**
 * A vector/raster source's `url` field, once resolved to an absolute
 * URL, points to a TileJSON document — but that document's OWN `tiles`
 * array is very commonly ITSELF a relative template (confirmed directly
 * against the real UGRC `VectorTileServer` endpoint during
 * implementation: `{"tiles":["tile/{z}/{y}/{x}.pbf"], ...}`). MapLibre
 * resolves a source's TileJSON `tiles` relative to the STYLE's own
 * origin URL when a style is loaded via `setStyle(url)` — but a
 * composed, in-memory style object has no such origin for MapLibre to
 * use, and it does NOT fall back to the source's own fetch URL either
 * (confirmed empirically: this produced a real, reproducible runtime
 * error, `Failed to construct 'Request': Failed to parse URL from
 * tile/{z}/{y}/{x}.pbf undefined`, which then triggered FlowMapPanel's
 * own FR-010 error-fallback listener and silently reverted an otherwise-
 * successfully-composed style back to BLANK_STYLE moments after it had
 * correctly applied). The fix: resolve this ourselves, at composition
 * time — fetch the TileJSON, resolve its own `tiles` template(s) against
 * ITS OWN url, and inline the result as a `tiles` array directly on the
 * source definition, replacing `url` entirely so MapLibre never needs to
 * do this resolution itself.
 */
async function inlineTileJsonSource(
  source: Record<string, unknown>,
  sourceUrl: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const res = await fetch(sourceUrl, { signal })
  if (!res.ok) throw new Error(`inlineTileJsonSource: ${sourceUrl} -> ${res.status}`)
  const tilejson = (await res.json()) as { tiles?: string[]; minzoom?: number; maxzoom?: number; bounds?: number[] }
  if (!Array.isArray(tilejson.tiles) || tilejson.tiles.length === 0) {
    throw new Error(`inlineTileJsonSource: ${sourceUrl} has no "tiles" array`)
  }
  const { url: _url, ...rest } = source
  return {
    ...rest,
    tiles: tilejson.tiles.map((t) => resolveUrlPreservingTemplateTokens(t, sourceUrl)),
    ...(tilejson.minzoom !== undefined ? { minzoom: tilejson.minzoom } : {}),
    ...(tilejson.maxzoom !== undefined ? { maxzoom: tilejson.maxzoom } : {}),
    ...(tilejson.bounds !== undefined ? { bounds: tilejson.bounds } : {}),
  }
}

async function composeStyles(layerUrls: string[], signal?: AbortSignal): Promise<StyleSpecification> {
  const merged: StyleSpecification = { version: 8, sources: {}, layers: [] }

  for (let i = 0; i < layerUrls.length; i++) {
    const layerUrl = layerUrls[i]
    const res = await fetch(layerUrl, { signal })
    if (!res.ok) throw new Error(`composeStyles: ${layerUrl} -> ${res.status}`)
    const raw = (await res.json()) as StyleSpecification
    const prefix = `layer${i}__`

    const rewrittenSources: StyleSpecification['sources'] = {}
    for (const [sourceId, source] of Object.entries(raw.sources ?? {})) {
      let rewritten = { ...source } as Record<string, unknown>
      if (typeof rewritten.url === 'string') {
        const absoluteSourceUrl = resolveUrlPreservingTemplateTokens(rewritten.url, layerUrl)
        rewritten = await inlineTileJsonSource(rewritten, absoluteSourceUrl, signal)
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
    // FIRST layer that declares one wins.
    if (!merged.sprite && typeof raw.sprite === 'string') {
      merged.sprite = resolveUrlPreservingTemplateTokens(raw.sprite, layerUrl)
    }
    if (!merged.glyphs && typeof raw.glyphs === 'string') {
      merged.glyphs = resolveUrlPreservingTemplateTokens(raw.glyphs, layerUrl)
    }
  }

  return merged
}
