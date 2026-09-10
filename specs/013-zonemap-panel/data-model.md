# Phase 1 Data Model: ZoneMapPanel

## `ZoneMapPanelConfig` (new — `src/layout/types.ts`)

Extends **both** `DataBoundPanelConfigBase` (like every prior data-bound panel type — `project-docs/GRAMMAR.md`'s `type: zonemap` grammar always queries a metric) **and** the already-generic `MapRenderingPanelConfig` (`011-basemap-style-system`'s own interface, whose doc comment already anticipates this exact type: "today just `FlowMapPanelConfig`; a future `ZoneMapPanelConfig` extends this same interface unchanged"). Field-mapping keys (`boundaries_id`, `metric_id`, `column`) are author-configurable, naming literal columns already present in the geometry/queried result — not `$metric.`-prefixed placeholders (spec.md Grammar findings #3), the same convention `SankeyPanelConfig`/`FlowMapPanelConfig` already use.

```ts
export interface ComparisonDiff {
  type: 'diff'
  a: string
  b: string
  expr: string
}

export interface ZoneMapPanelConfig extends DataBoundPanelConfigBase, MapRenderingPanelConfig {
  type: 'zonemap'
  boundaries: string
  boundaries_id: string
  metric_id: string
  column: string
  label?: string
  color_scale?: 'sequential' | 'diverging'
  color_ramp?: string
  steps?: number
  domain?: [number, number]
  comparison?: 'side_by_side' | ComparisonDiff
  center?: [number, number]
  zoom?: number
  // basemap / _tabDefaultBasemap already come from MapRenderingPanelConfig
}
```

Added to the `PanelConfig` union; `UnknownPanelConfig`'s own doc comment (`layout/types.ts`) updated to drop `zonemap` from its "still deferred" list (`graphic-walker` is the only one left). `isMapRenderingPanel()`'s existing `// extend with '|| config.type === 'zonemap'' when that panel type ships` comment is made real.

`comparison` defaults to `'side_by_side'` when omitted (spec.md Grammar findings #8) — the panel renders its single selected/active scenario's values normally, the existing side-by-side-panels convention every other panel type's `scenario:` key already provides, not a new UI concept.

## `public/geometry/` — published `boundaries` resolution (new)

`boundaries: taz.geoparquet` resolves to `public/geometry/taz.geoparquet` — a new, dedicated static-asset directory (research.md §3's Phase-1 correction: *not* `public/dashboard-config/`, since geometry is scenario-and-tab-independent, unlike `dashboard-*.yaml`). No `index.json` discovery file is needed here (unlike `public/scenarios/`/`public/dashboard-config/`) — a panel's own `boundaries:` key already names the exact file to fetch; there is no "discover what's available" step this feature needs.

## `ZoneGeometryCache` (new — `src/panels/zoneGeometry.ts`)

The module-level cache research.md §3/§4 establishes — one entry per distinct `boundaries` filename, loaded once via `registerFileURL()` + `read_parquet()` + `ST_GeomFromWKB()`/`ST_AsGeoJSON()` (never `ST_Read()`/`registerFileBuffer()`), reused across every panel instance and data update referencing that same file, for the page session's full lifetime (research.md §4 — a stated, deliberate no-eviction decision, not an oversight).

```ts
export interface ZoneFeature {
  zoneId: string
  geometry: GeoJSON.Geometry
}

export interface ZoneGeometry {
  boundaries: string          // the cache key — matches config.boundaries
  features: ZoneFeature[]
}
```

- `ZoneFeature.zoneId` — the geometry's own `boundaries_id`-mapped column value, one per zone.
- `loadZoneGeometry(boundaries: string, boundariesId: string): Promise<ZoneGeometry>` — the cache's only entry point. The cache is keyed on `boundaries` alone (§4), but each entry also records the `boundariesId` that created it (research.md §11 — a real gap in an earlier draft of this contract, caught before implementation began). A repeat call with the same `boundaries` **and** the same `boundariesId` returns the same in-flight/resolved promise, exactly like `services/duckdb.ts`'s own `initDuckDB()` idempotent-promise pattern (never two concurrent loads of the same file). A call with the same `boundaries` but a **different** `boundariesId` — a real, reachable config-authoring mismatch, not a hypothetical — is rejected immediately (`Promise.reject`, no network activity attempted) with a descriptive error naming both values, and leaves the existing cache entry (and every panel already relying on it) untouched.

```ts
// Internal cache entry shape (not exported) — records boundariesId
// alongside the load itself, so a mismatch is detectable.
interface ZoneGeometryCacheEntry {
  boundariesId: string
  promise: Promise<ZoneGeometry>
}
```

## `ZonemapChoroplethData` (new — `src/panels/zonemapColor.ts` consumer, built in `ZoneMapPanel.tsx`)

The per-render join of cached geometry + the current metric query result — the genuinely new derived entity for this feature, structurally the zone-level analog of `010-flowmap-panel`'s own "Flow data" derived-entity precedent and `008-sankey-panel`'s `FlowGraph`.

```ts
export interface ZoneMapFeatureProperties {
  zoneId: string
  value: number | null    // null = no matching metric row (spec.md Edge Cases: "no data" treatment)
  fillColor: string        // resolved via zonemapColor.ts (research.md §8/§10)
}

// One GeoJSON FeatureCollection, ready for map.getSource('zonemap-zones').setData(...)
export type ZoneMapGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, ZoneMapFeatureProperties>
```

Build rule (FR-009, FR-012): a metric row whose `metric_id` value has no matching `zoneId` in the cached geometry is excluded before this join; a `zoneId` present in geometry with no matching metric row still produces a feature, with `value: null` and a distinct "no data" `fillColor` (not the scale's zero/minimum color).

## `comparison: diff` query shape (new — `src/panels/panelQuery.ts`'s `buildComparisonDiffQuery()`)

Resolved SQL-side per research.md §7 — never a client-side expression evaluator, never `eval()`:

```sql
SELECT a."<metric_id>" AS zone_id, (<expr>) AS diff_value
FROM "<scenario a>__<metric>" a
JOIN "<scenario b>__<metric>" b ON a."<metric_id>" = b."<metric_id>"
```

`a`/`b` scenario names are interpolated as literal view-name prefixes with no upfront validation — the same convention `config.scenario` (singular) already uses elsewhere in `panelQuery.ts` (corrected during implementation; research.md §7's own correction note has the full reasoning: `resolveActiveScenarios()` performs no validation either). An unresolvable pair fails naturally at query time and produces the shared error state (spec.md Edge Cases), never a partial query.

## Relationships

```
config.boundaries + config.boundaries_id ──▶ zoneGeometry.ts's loadZoneGeometry()
                                              (cached by boundaries, boundariesId
                                              mismatch rejected — §3/§4/§11)
                              │
                              ▼
                       ZoneGeometry { features: ZoneFeature[] }
                              │
config.metric/filter ──▶ query rows (Record<string, unknown>[])          [side_by_side]
config.comparison:diff ──▶ buildComparisonDiffQuery() ──▶ query rows      [diff]
                              │                              │
                              └──────────────┬───────────────┘
                                              ▼  join by boundaries_id/metric_id/zone_id
                                    ZoneMapGeoJSON (per-feature value + fillColor,
                                    fillColor resolved via zonemapColor.ts, §8/§10)
                                              │
                                              ▼
                          map.getSource('zonemap-zones').setData(geojson)
                                              │
                                              ▼
                maplibregl.Map (created once per panel mount, one GeoJSONSource +
                one fill layer, map.remove() on unmount — no MapboxOverlay, §1)
```

## State shape (`ZoneMapPanel.tsx`, mirrors every prior panel type)

```
status: 'loading' | 'ready' | 'empty' | 'error'
rows: Record<string, unknown>[]      — the raw metric (or diff) query result
geometryStatus: 'loading' | 'ready' | 'error'   — independent of `status`,
                                                    since geometry and metric
                                                    data load on separate
                                                    paths (§3) and either can
                                                    fail independently; the
                                                    panel's own combined
                                                    empty/error rendering
                                                    treats a geometry-load
                                                    failure the same as a
                                                    query failure (shared
                                                    PanelErrorState, FR-010)
mapReady: boolean                     — same purpose as FlowMapPanel.tsx's
                                          own mapReady (010's research.md
                                          §11) — true once the map-creation
                                          effect has genuinely populated the
                                          map ref
```

The `maplibregl.Map`/`GeoJSONSource` are held in a ref (`useRef`), not React state — imperative lifecycle (FR-013), matching every map-rendering panel type's own create-once/`setData()`-on-update/`map.remove()`-on-destroy shape. Unlike `FlowMapPanel.tsx`, there is no `overlayRef`/`MapboxOverlay`, no `contextLost` state, and no `layerRepopulateGeneration` counter — none of `012`'s interleaved-mode machinery applies (research.md §1).
