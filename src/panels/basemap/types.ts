// 011-basemap-style-system: shared types for the built-in preset registry,
// custom compositions, and the panel/tab precedence resolver. See
// specs/011-basemap-style-system/data-model.md.

export type BasemapPresetName = string

/** The custom multi-source composition shape (FR-006/FR-008, User Story 3).
 * `layers` is ordered bottom-to-top — layers[0] renders first (furthest
 * back), matching the UGRC proof case's own VectorHillshade (bottom) ->
 * LiteBase (middle) -> LiteLabels (top) stacking. Each entry is EITHER a
 * full style.json URL (fetched and merged as a vector style layer) OR a
 * raster provider preset name with no http(s):// scheme, e.g.
 * "Esri.WorldImagery" (resolved via resolveRasterProvider() and inlined
 * directly, no style document to fetch — 012-webgl-context-management,
 * loadBasemapStyle.ts's own composeStyles()/isRasterProviderName()
 * comments have the full reasoning; this is what makes a genuine
 * raster-underneath-vector "Hybrid" composition representable). Neither
 * shape is itself a preset name at the TOP level of BasemapSelection —
 * composition is deliberately a downstream-authoring-only escape hatch
 * (FR-012), never itself a named registry entry. */
export interface BasemapComposition {
  layers: string[]
}

export type BasemapSelection = BasemapPresetName | BasemapComposition

export function isBasemapComposition(v: BasemapSelection): v is BasemapComposition {
  return typeof v === 'object' && v !== null && Array.isArray((v as BasemapComposition).layers)
}

// 020-settings-modal: 'global' added — a viewer's Settings-modal Basemap-
// tab pick, resolved between 'tab' and 'app-default' in the precedence
// chain (resolveEffectiveBasemap.ts). Additive: every existing literal
// and every existing comparison against them is unaffected.
export type BasemapSource = 'panel' | 'tab' | 'global' | 'app-default'

export interface EffectiveBasemap {
  selection: BasemapSelection
  source: BasemapSource
}
