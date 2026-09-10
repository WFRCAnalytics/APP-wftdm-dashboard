# Contract: ZoneMapPanel

Mirrors `010-flowmap-panel`'s own `contracts/flowmap-panel.md` structure — one section per new/modified file, signatures and behavioral guarantees only, no full implementation bodies.

## `src/layout/types.ts` (MODIFIED — additive)

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
}

export type PanelConfig =
  | ValueBoxPanelConfig
  | PlotlyPanelConfig
  | TablePanelConfig
  | MarkdownPanelConfig
  | ObservablePlotPanelConfig
  | SankeyPanelConfig
  | FlowMapPanelConfig
  | ZoneMapPanelConfig   // NEW
  | UnknownPanelConfig

export function isMapRenderingPanel(config: PanelConfig): config is PanelConfig & MapRenderingPanelConfig {
  return config.type === 'flowmap' || config.type === 'zonemap'   // MODIFIED
}
```

No other exported type changes. `dashboardRenderer.tsx`'s existing `_tabDefaultBasemap` injection (011's own memoized-per-tab mechanism) requires zero changes — it already operates generically via `isMapRenderingPanel()`, per its own original design intent.

## `src/panels/zoneGeometry.ts` (NEW — pure/DOM-free, async)

```ts
export interface ZoneFeature {
  zoneId: string
  geometry: GeoJSON.Geometry
}

export interface ZoneGeometry {
  boundaries: string
  features: ZoneFeature[]
}

/**
 * Loads and caches `boundaries` geometry, keyed by the exact `boundaries`
 * string. `boundariesId` names the geometry's own zone-id column
 * (config.boundaries_id) — required here, not optional, because the
 * query this builds must select it (research.md §11).
 *
 * Idempotent ONLY when successive calls for the same `boundaries` also
 * agree on `boundariesId`: a second such call while a load is in flight,
 * or after one has resolved, returns the SAME pending/resolved promise
 * (never triggers a second registerFileURL()/query()) — mirroring
 * services/duckdb.ts's own initDuckDB() pattern. Resolves the
 * module-level cache entry for the rest of the page session (research.md
 * §4 — no eviction).
 *
 * A call for a `boundaries` that already has a cache entry recorded
 * under a DIFFERENT `boundariesId` is a real, reachable config-authoring
 * mismatch (research.md §11) — this returns `Promise.reject(new
 * Error(...))` SYNCHRONOUSLY (no registerFileURL()/query() attempted for
 * this call), and does NOT touch, replace, or invalidate the existing
 * cache entry — every other panel already sharing that entry keeps
 * working. The rejection error names `boundaries`, the previously
 * recorded `boundariesId`, and this call's own (different) `boundariesId`
 * — actionable directly from a console error. The caller (ZoneMapPanel.tsx)
 * maps this to `geometryStatus: 'error'` -> the shared PanelErrorState,
 * the same path FR-010 already defines for any other unresolvable
 * `boundaries`/`boundaries_id`/`metric_id`/`column` configuration — no
 * new error-handling branch needed, only this detection.
 *
 * Internally, for a genuinely new `boundaries` entry: ensures
 * `INSTALL spatial; LOAD spatial;` has run (once, lazily, shared across
 * every call regardless of `boundaries`) — see
 * ensureSpatialExtensionLoaded() below — then:
 *   1. registerFileURL(`zonemap-geom__${boundaries}`, resolveGeometryUrl(boundaries))
 *   2. query(`SELECT "${boundariesId}" AS zone_id, ST_AsGeoJSON(ST_GeomFromWKB(geometry))
 *             AS geojson FROM read_parquet('zonemap-geom__${boundaries}')`)
 *      — never ST_Read() (research.md §3)
 *   3. Parses each row's geojson string into a GeoJSON.Geometry.
 *
 * Also rejects (does not silently return an empty ZoneGeometry) on a
 * genuine fetch/parse failure — same PanelErrorState path as the
 * mismatch case above.
 */
export function loadZoneGeometry(boundaries: string, boundariesId: string): Promise<ZoneGeometry>

/** Resolves a bare `boundaries` filename to its published URL under
 * public/geometry/ (data-model.md). Exported separately so it's unit-
 * testable without a real DuckDB connection. */
export function resolveGeometryUrl(boundaries: string): string

/** Runs `INSTALL spatial; LOAD spatial;` at most once for the life of the
 * page (module-level promise, same idempotent-promise shape as
 * loadZoneGeometry itself) — called internally by loadZoneGeometry, but
 * exported so a test can assert it fires exactly once across multiple
 * panels/boundaries files. */
export function ensureSpatialExtensionLoaded(): Promise<void>
```

## `src/panels/zonemapColor.ts` (NEW — pure, DOM-free)

```ts
export type ColorScale = 'sequential' | 'diverging'

/**
 * Resolves one zone's fill color. `domain` is REQUIRED here — the
 * caller (ZoneMapPanel.tsx) computes the effective domain (config.domain,
 * or auto-computed min/max per FR-007) before calling this, so this
 * function itself never branches on "was domain configured."
 *
 * value === null (no matching metric row, spec.md Edge Cases) returns the
 * dedicated "no data" color — NOT the scale's zero/minimum color.
 *
 * steps, when present, quantizes the result into that many discrete
 * bands (research.md §10); omitted = fully continuous (existing
 * tableLogic.ts/sankeyColor.ts default behavior, unchanged).
 */
export function resolveZoneFillColor(
  value: number | null,
  colorScale: ColorScale | undefined,
  colorRamp: string | undefined,
  domain: [number, number],
  steps: number | undefined,
): string

/** Returns the matching d3-scale-chromatic interpolator for a recognized
 * color_ramp name (e.g. 'YlOrRd' -> interpolateYlOrRd, 'RdBu' ->
 * interpolateRdBu), or undefined for an omitted/unrecognized name — the
 * caller falls back to tableLogic.ts's existing token-derived default in
 * either case (research.md §8), mirroring sankeyColor.ts's
 * resolveNamedColorScheme()'s own recognized-name-else-undefined shape. */
export function resolveNamedColorRamp(colorRamp: string | undefined): ((t: number) => string) | undefined

/** Auto-computes [min, max] from a set of non-null numeric values —
 * used when config.domain is omitted (FR-007). Returns [0, 0] for an
 * empty/all-null input (caller treats that the same as "no data" for
 * every zone, not a crash). */
export function computeAutoDomain(values: (number | null)[]): [number, number]
```

## `src/panels/panelQuery.ts` (MODIFIED — additive)

```ts
/**
 * Builds the comparison: diff SQL (research.md §7) — a's/b's scenario
 * names are interpolated as literal view-name prefixes, exactly like
 * panelQuery.ts's own existing `config.scenario` (singular) path already
 * does. NO upfront validation that either name is "active" or even
 * registered — corrected during implementation to match
 * `resolveActiveScenarios()`'s real (validation-free) behavior, not the
 * stricter behavior an earlier draft of this contract assumed (research.md
 * §7's own correction note). An unresolvable name fails naturally when
 * the built query runs (DuckDB's own "table does not exist" error),
 * caught by ZoneMapPanel.tsx's existing query `.catch()` — same
 * PanelErrorState path as any other unresolvable config, no new
 * error-handling branch needed.
 * `expr` is copied verbatim into the generated SQL — plain string
 * substitution only, never evaluated in JS (constitution Principle III).
 */
export function buildComparisonDiffQuery(config: ZoneMapPanelConfig, diff: ComparisonDiff): string
```

No existing exported signature in `panelQuery.ts` changes — purely additive, same as every prior panel-type feature that touched this file.

## `src/panels/ZoneMapPanel.tsx` (NEW)

```tsx
export function ZoneMapPanel({ config }: { config: ZoneMapPanelConfig }): JSX.Element
```

**Effects** (mirrors the Panel pattern's established two-effect-plus split every map-rendering panel type uses — `FlowMapPanel.tsx` is the closest precedent, minus everything `012`-specific):

1. **Data fetch** (`[config, filters, activeScenarioNames]`) — identical shape to every other data-bound panel type when `config.comparison` is `'side_by_side'`/omitted (`buildPanelQuery` + `sqlExpander.expand`); routes through `buildComparisonDiffQuery(config, config.comparison)` instead when `config.comparison.type === 'diff'` (no `activeScenarioNames` argument — see this file's own corrected signature above).
2. **Geometry fetch** (`[config.boundaries, config.boundaries_id]`) — calls `loadZoneGeometry(config.boundaries, config.boundaries_id)`. Sets `geometryStatus`, independent of `status` (data-model.md). A rejection — including the `boundaries_id` mismatch case (research.md §11) — sets `geometryStatus: 'error'`, same shared `PanelErrorState` path as any other unresolvable configuration.
3. **Mount-only map creation** (`[]`) — creates `maplibregl.Map` once (`freshBlankStyle()` initial style, same shared-mutable-object bug avoidance `012` already fixed — reused unmodified, not a new instance of that bug), adds an empty `GeoJSONSource` (`'zonemap-zones'`) + one `fill` layer (`'zonemap-fill'`) with a data-driven `fill-color` paint expression referencing a feature-state or feature-property color field, registers `mousemove`/`mouseleave`/`click` handlers on that layer (research.md §6), a `ResizeObserver` (matching `010`'s own precedent, not relying solely on MapLibre's native auto-resize), and tears down via `map.remove()` on unmount (FR-013). No `contextLost` state, no `webglcontextlost`/`webglcontextrestored` listeners, no `MapboxOverlay` (research.md §1 — none of `012`'s machinery applies).
4. **Basemap application** (keyed on `basemapKey(effectiveBasemap.selection)` + `mapReady`) — reuses `011`'s existing effect shape verbatim (`resolveEffectiveBasemap`/`loadBasemapStyle`/`transformStyle`), unmodified (FR-005, research.md §9). `zonemap-zones`/`zonemap-fill` survive a `setStyle()` call via the same `transformStyle` layer-preservation `011` already built (their ids are never in `BLANK_STYLE_LAYER_IDS`).
5. **Data-update** (`[config, rows, zoneGeometry, status, geometryStatus, mapReady, colorScale-related config fields]`) — joins `rows` to `zoneGeometry.features` by `metric_id`/`boundaries_id`/`zoneId`, resolves each feature's `fillColor` via `zonemapColor.ts`, and calls `map.getSource('zonemap-zones').setData(geojson)` — never recreates the source or the map (FR-003, FR-009).

**Render**: `status === 'empty'` → shared `PanelEmptyState`; `status === 'error'` or `geometryStatus === 'error'` → shared `PanelErrorState`; otherwise the map container (loading skeleton overlay while `status === 'loading'` or `geometryStatus === 'loading'`, matching every other panel type's own inline-skeleton convention, FR-010/FR-011).

## `src/panels/registry.tsx` (MODIFIED)

```tsx
import { ZoneMapPanel } from '@/panels/ZoneMapPanel'
// ...
export const registry: Record<string, ComponentType<PanelProps<any>>> = {
  // ...existing seven entries, unchanged
  zonemap: ZoneMapPanel,   // NEW
}
```

## `project-docs/ARCHITECTURE.md` (MODIFIED — additive)

Extends the existing parquet-extension "no internet required" caveat (found during `010`) to name the `spatial` extension too, per FR-014/research.md §2 — real text drafted at implementation time against the actual final wording of the existing caveat paragraph, not duplicated here.

## `package.json` (UNCHANGED)

No new dependency — `maplibre-gl` (`010`) and `d3-scale-chromatic` (`008`) are both already present and sufficient (research.md §1, §8).
