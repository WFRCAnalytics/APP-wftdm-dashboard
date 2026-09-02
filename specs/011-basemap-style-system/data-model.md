# Data Model: Basemap Style System

## `BasemapSelection` — the shared config shape (panel- and tab-level)

Accepts either a bare preset name (string) or a composition object — one
shape, reused identically at both scopes (spec.md's own Assumptions
section, "Basemap keys accept either a scalar or an object, at both
scopes").

```ts
// src/panels/basemap/types.ts

/** A built-in preset name, e.g. "carto-positron", "openfreemap-liberty",
 * or any leaflet-providers name present in public/basemap/leaflet-providers.json
 * (e.g. "Esri.WorldStreetMap"). Resolved by registry.ts; an unrecognized
 * name resolves to BLANK_STYLE (FR-010), never a thrown parse error —
 * matching every other panel-config field's "fail soft" precedent. */
export type BasemapPresetName = string

/** The custom multi-source composition shape (FR-006/FR-008, User Story 3).
 * `layers` is ordered bottom-to-top — layers[0] renders first (furthest
 * back), matching the UGRC proof case's own VectorHillshade (bottom) ->
 * LiteBase (middle) -> LiteLabels (top) stacking. Each entry is a full
 * style.json URL — not a preset name; composition is deliberately a
 * downstream-authoring-only escape hatch (FR-012), never itself a named
 * registry entry. */
export interface BasemapComposition {
  layers: string[]
}

export type BasemapSelection = BasemapPresetName | BasemapComposition

export function isBasemapComposition(v: BasemapSelection): v is BasemapComposition {
  return typeof v === 'object' && v !== null && Array.isArray((v as BasemapComposition).layers)
}
```

## `EffectiveBasemap` — the resolver's output (research.md §2)

```ts
// src/panels/basemap/types.ts (continued)

export type BasemapSource = 'panel' | 'tab' | 'app-default'

export interface EffectiveBasemap {
  selection: BasemapSelection
  source: BasemapSource
}
```

## `layout/types.ts` changes

```ts
// ADDITIVE — DashboardTabConfig gains the tab-scoped key, precedented
// directly by header:/filters: (spec.md's confirmed grammar quote).
export interface DashboardTabConfig {
  header: { tab: string; title: string; description?: string }
  filters: FilterDefinition[]
  default_basemap?: BasemapSelection   // NEW
  layout: Record<string, PanelConfig[]>
}

// ADDITIVE — FlowMapPanelConfig gains the panel-scoped key (FR-004).
export interface FlowMapPanelConfig extends DataBoundPanelConfigBase {
  type: 'flowmap'
  origin: string
  origin_lat: string
  origin_lon: string
  destination: string
  dest_lat: string
  dest_lon: string
  value: string
  clustering?: boolean
  clustering_auto?: boolean
  animation?: boolean
  max_flows?: number
  center?: [number, number]
  zoom?: number
  basemap?: BasemapSelection            // NEW (FR-004)
  /** Set only by dashboardRenderer.tsx as it constructs each row — never
   * authored in YAML directly (no `_`-prefixed key exists in
   * docs/GRAMMAR.md and none is being added; this is an internal
   * plumbing field, not a new grammar surface). Carries the tab's
   * default_basemap down to the one place resolveEffectiveBasemap is
   * actually called (FlowMapPanel itself), without breaking the "single
   * config prop" panel-pattern contract by adding a second prop. */
  _tabDefaultBasemap?: BasemapSelection // NEW, internal
}

/** Any panel type that participates in basemap resolution — today just
 * FlowMapPanelConfig; a future ZoneMapPanelConfig extends this same
 * interface unchanged (spec.md's own "zonemap will consume the same
 * registry/composition mechanism" requirement). dashboardRenderer.tsx
 * uses this as a type guard so tab-level default_basemap injection stays
 * generic across current and future map-rendering panel types, not
 * hardcoded to check `type === 'flowmap'` specifically. */
export interface MapRenderingPanelConfig {
  basemap?: BasemapSelection
  _tabDefaultBasemap?: BasemapSelection
}

export function isMapRenderingPanel(config: PanelConfig): config is PanelConfig & MapRenderingPanelConfig {
  return config.type === 'flowmap' // extend with '|| config.type === 'zonemap'' when that panel type ships
}
```

## `layout/dashboardRenderer.tsx` — where tab-level injection happens

`DashboardRenderer` is the one place that has both a tab's
`default_basemap` and the full panel list for that tab in scope
simultaneously — it injects `_tabDefaultBasemap` onto each map-rendering
panel's config object as it builds the row, so `FlowMapPanel` itself never
needs to know about `DashboardTabConfig` at all (keeping the panel
pattern's "single config prop, no injected context" contract exactly as
established). This also makes `DashboardRenderer` the natural place to
subscribe to `useColorScheme()` — see `contracts/flowmap-panel-basemap-
integration.md` for why that subscription living here (not inside
`FlowMapPanel`) is what makes the theme-reactive re-render flow through
React's ordinary prop-change mechanism rather than a second, redundant
subscription per map panel instance.

## Registry shape (`panels/basemap/registry.ts`)

```ts
// src/panels/basemap/registry.ts

/** A single-URL, MapLibre-native-relative-resolution-eligible preset
 * (research.md §5/§6 — handed to setStyle() as a URL string, never
 * fetched/parsed by this app's own code). */
interface UrlPreset {
  kind: 'url'
  url: string
}

/** A raster preset built as an in-memory StyleSpecification from a
 * leaflet-providers template (research.md §4) — no relative-URL concern
 * (raster sources have no sprite/glyphs). */
interface InlineRasterPreset {
  kind: 'inline-raster'
  urlTemplate: string      // e.g. 'https://{s}.basemaps.cartocdn.com/{variant}/{z}/{x}/{y}{r}.png'
  subdomains?: string      // e.g. 'abcd'
  attribution?: string
  maxZoom?: number
}

export const BUILT_IN_PRESETS: Record<BasemapPresetName, UrlPreset | InlineRasterPreset> = {
  'carto-positron':      { kind: 'url', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
  'carto-dark-matter':   { kind: 'url', url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
  'carto-voyager':       { kind: 'url', url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
  'openfreemap-liberty': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/liberty' },
  'openfreemap-bright':  { kind: 'url', url: 'https://tiles.openfreemap.org/styles/bright' },
  'openfreemap-positron':{ kind: 'url', url: 'https://tiles.openfreemap.org/styles/positron' },
  'openfreemap-dark':    { kind: 'url', url: 'https://tiles.openfreemap.org/styles/dark' },
  'openfreemap-fiord':   { kind: 'url', url: 'https://tiles.openfreemap.org/styles/fiord' },
  // leaflet-providers raster entries are NOT enumerated here — resolved
  // dynamically at lookup time against public/basemap/leaflet-providers.json
  // (FR-002); see resolveRasterProvider() in the same file.
}

export const APP_DEFAULT_LIGHT: BasemapPresetName = 'carto-positron'
export const APP_DEFAULT_DARK: BasemapPresetName = 'carto-dark-matter'
```

## Test-only instrumentation additions (mirrors `010-flowmap-panel`'s
own `__flowmapTestMaps` precedent)

```ts
// src/panels/FlowMapPanel.tsx — module-level `declare global` block, additive
declare global {
  interface Window {
    __flowmapTestMapReadyDelayMs?: number
    __flowmapTestMaps?: Record<string, maplibregl.Map>
    /** NEW — exposes the live MapboxOverlay instance per panel title,
     * mirroring __flowmapTestMaps exactly. Needed because research.md
     * §1's empirical survival test must inspect overlay.props.layers
     * directly (a duplicate-layer-id bug can leave the overlay
     * "not removed" while silently failing to draw — a DOM-only check
     * can't distinguish that from a genuinely healthy overlay). */
    __flowmapTestOverlays?: Record<string, MapboxOverlay>
  }
}
```
