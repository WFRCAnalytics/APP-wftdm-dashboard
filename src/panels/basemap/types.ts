// 011-basemap-style-system: shared types for the built-in preset registry,
// custom compositions, and the panel/tab precedence resolver. See
// specs/011-basemap-style-system/data-model.md.

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

export type BasemapSource = 'panel' | 'tab' | 'app-default'

export interface EffectiveBasemap {
  selection: BasemapSelection
  source: BasemapSource
}
