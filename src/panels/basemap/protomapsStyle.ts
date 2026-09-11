// 041-protomaps-pmtiles-basemap: pure, DOM-free style generation for the
// 5 official Protomaps basemap flavors — no hand-authored per-flavor
// style.json, matching this feature's own FR-003. See
// specs/041-protomaps-pmtiles-basemap/research.md R-1/R-5 and
// contracts/basemap-resolution.md.
import type { StyleSpecification } from 'maplibre-gl'
import { layers, namedFlavor } from '@protomaps/basemaps'

/** The 5 real, official Protomaps flavor names, exposed as
 * BasemapPresetName-compatible values (that type is already a plain
 * `string` — panels/basemap/types.ts — so these need no grammar/type
 * change to be selectable via an ordinary `basemap: protomaps-dark`
 * panel/tab pin). Prefixed `protomaps-` to keep this app's own catalog
 * unambiguous alongside `carto-*`/`openfreemap-*`/`ugrc-*` presets. */
export const PROTOMAPS_FLAVOR_NAMES = [
  'protomaps-light',
  'protomaps-dark',
  'protomaps-white',
  'protomaps-grayscale',
  'protomaps-black',
] as const

export type ProtomapsFlavorName = (typeof PROTOMAPS_FLAVOR_NAMES)[number]

// Maps this app's own prefixed preset name to the real, bare argument
// @protomaps/basemaps' own namedFlavor() expects, and to the bare word
// the confirmed-stable basemaps-assets sprite path segment uses.
const FLAVOR_ARG: Record<ProtomapsFlavorName, string> = {
  'protomaps-light': 'light',
  'protomaps-dark': 'dark',
  'protomaps-white': 'white',
  'protomaps-grayscale': 'grayscale',
  'protomaps-black': 'black',
}

export function isProtomapsFlavorName(name: string): name is ProtomapsFlavorName {
  return (PROTOMAPS_FLAVOR_NAMES as readonly string[]).includes(name)
}

/** Real, confirmed attribution string (carried forward from this
 * feature's own research, not re-derived) — wired the same way every
 * other basemap source's attribution already reaches MapLibre: a plain
 * source-level `attribution` field, rendered by the `AttributionControl`
 * already present on every map instance in this app. */
export const PROTOMAPS_ATTRIBUTION =
  '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © ' +
  '<a href="https://openstreetmap.org">OpenStreetMap</a>'

const SOURCE_ID = 'protomaps'

// Confirmed stable (research.md R-5) — a per-flavor sprite sheet (each
// flavor has its own distinct icon palette) and one shared glyphs
// template.
const BASEMAPS_ASSETS_BASE = 'https://protomaps.github.io/basemaps-assets'

/**
 * Pure — no MapLibre/browser API call, no network fetch. `pmtilesUrl` is
 * whatever `getEffectivePmtilesSource()` (state/protomapsSourceState.ts)
 * resolved — a bundled relative path or a full https:// URL, both valid
 * PMTiles protocol targets once prefixed with `pmtiles://` (the
 * `pmtiles` client library's own real, documented URL scheme — resolved
 * by the Protocol registered in panels/basemap/pmtilesProtocol.ts).
 */
export function buildProtomapsStyle(flavorName: ProtomapsFlavorName, pmtilesUrl: string): StyleSpecification {
  const flavorArg = FLAVOR_ARG[flavorName]
  return {
    version: 8,
    sources: {
      [SOURCE_ID]: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        attribution: PROTOMAPS_ATTRIBUTION,
      },
    },
    // layers() returns @maplibre/maplibre-gl-style-spec's own
    // LayerSpecification[] — structurally identical to maplibre-gl's own
    // re-exported StyleSpecification['layers'], but a different package,
    // so TS treats them as nominally distinct; a narrow, local cast is
    // the same escape hatch this codebase already uses elsewhere for
    // cross-package structural type friction (e.g.
    // panels/RechartsPanel.tsx's documented Record<string, any>).
    layers: layers(SOURCE_ID, namedFlavor(flavorArg), { lang: 'en' }) as StyleSpecification['layers'],
    sprite: `${BASEMAPS_ASSETS_BASE}/sprites/v4/${flavorArg}`,
    glyphs: `${BASEMAPS_ASSETS_BASE}/fonts/{fontstack}/{range}.pbf`,
  }
}
