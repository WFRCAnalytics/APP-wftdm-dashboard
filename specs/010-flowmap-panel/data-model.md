# Phase 1 Data Model: FlowMapPanel

## `FlowMapPanelConfig` (new — `src/layout/types.ts`)

Extends `DataBoundPanelConfigBase` (like every prior data-bound panel
type) — `docs/GRAMMAR.md`'s `type: flowmap` grammar always queries a
metric. Field-mapping keys are author-configurable, naming literal
columns in the queried result set — not `$metric.`-prefixed
placeholders (research.md §1 of spec.md's own Grammar findings, mirroring
`SankeyPanelConfig`'s `source`/`target`/`value` precedent).

```ts
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
}
```

Added to the `PanelConfig` union; `UnknownPanelConfig`'s own doc comment
(`layout/types.ts`) updated to drop `flowmap` from its "still deferred"
list, matching every prior panel-type feature's own precedent there.

## `FlowLocation` / `Flow` / `FlowmapData` (new — `src/panels/flowmapData.ts`)

The node/link-equivalent entities this feature's rows-to-flowmap
transform derives from flat query rows (research.md §4) — structurally
analogous to `008-sankey-panel`'s `FlowNode`/`FlowLink`/`FlowGraph`, but
geographic (lat/lon-bearing locations) rather than namespaced categorical
nodes.

```ts
export interface FlowLocation {
  id: string
  lat: number
  lon: number
}

export interface Flow {
  origin: string
  dest: string
  value: number
}

export interface FlowmapData {
  locations: FlowLocation[]
  flows: Flow[]
  excludedCount: number
}
```

- `FlowLocation.id` — the mapped `origin`/`destination` column's value,
  deduplicated (first-seen coordinates win per a given id — spec.md's
  Edge Cases).
- `Flow` — one per distinct (origin, destination) pair, `value` summed
  across every row sharing that pair.
- `excludedCount` — rows dropped for a non-positive `value` or a missing/
  non-finite coordinate (research.md §5's `console.warn` signal).

## Relationships

```
Query rows (Record<string, unknown>[])
        │
        ▼  flowmapData.ts's buildFlowmapData() (pure, DOM-free)
FlowmapData { locations, flows, excludedCount }
        │
        ▼  FlowMapPanel.tsx's render-and-swap effect
FlowmapLayer's `data: { locations, flows }` prop
(getLocationId/getLocationLat/getLocationLon/getFlowOriginId/
 getFlowDestId/getFlowMagnitude accessors — research.md §6)
        │
        ▼  overlay.setProps({ layers: [flowmapLayer] })
MapboxOverlay (registered once via map.addControl(overlay))
        │
        ▼
maplibregl.Map (created once per panel mount, map.remove() on unmount)
```

## State shape (`FlowMapPanel.tsx`, mirrors every prior panel type)

```
status: 'loading' | 'ready' | 'empty' | 'error'
rows: Record<string, unknown>[]   — the raw query result
mapReady: boolean                 — true once the map-creation effect
                                     has genuinely populated mapRef/
                                     overlayRef (research.md §11) — makes
                                     that dependency explicit/React-
                                     reactive instead of a bare ref read
                                     the data-update effect had no way to
                                     re-trigger on once satisfied late
```

The `maplibregl.Map`/`MapboxOverlay` instances themselves are held in
refs (`useRef`), not React state — their lifecycle is imperative
(FR-006), matching `docs/SPEC.md`'s own documented create-once/
`setProps()`-on-update/`map.remove()`-on-destroy shape, not a
React-owned render output the way every prior panel type's DOM/SVG is.
