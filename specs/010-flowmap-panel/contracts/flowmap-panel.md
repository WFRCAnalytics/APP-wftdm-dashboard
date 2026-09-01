# Contract: FlowMapPanel

Full-body code for every new/modified module — not illustrative
pseudocode, per this project's established contract discipline since
`008-sankey-panel` (whose own contract was rewritten to this standard
after an earlier sketch-shaped draft hid two real bugs).

## `src/layout/types.ts` (MODIFIED — additive)

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

export type PanelConfig =
  | ValueBoxPanelConfig
  | PlotlyPanelConfig
  | TablePanelConfig
  | MarkdownPanelConfig
  | ObservablePlotPanelConfig
  | SankeyPanelConfig
  | FlowMapPanelConfig
```

`UnknownPanelConfig`'s doc comment updated: "Any other panel type
(zonemap, graphic-walker — still out of scope, still deferred; flowmap is
no longer one of these as of `010-flowmap-panel`) ..."

## `src/panels/flowmapData.ts` (NEW — pure, DOM-free)

```ts
// 010-flowmap-panel: rows-to-flowmap transform — pure, DOM-free, mirrors
// 008-sankey-panel's sankeyGraph.ts precedent (research.md §4). See
// specs/010-flowmap-panel/data-model.md.
import type { FlowMapPanelConfig } from '@/layout/types'

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

/**
 * `Number(null)` and `Number('')`/`Number('   ')` are all `0`, not
 * `NaN` — two real bugs found during implementation (not this contract's
 * original sketch, which used a bare `Number()` coercion throughout): a
 * plain `Number.isFinite()` check alone would silently treat a
 * genuinely missing or blank coordinate as a "valid" 0 rather than
 * excluding it. Found and fixed separately (the null case first, the
 * empty-string case in a follow-up review) — both are covered by
 * flowmapData.test.ts. Real numbers are returned directly, without going
 * through `Number()` coercion at all, so this function's behavior for
 * the common case doesn't depend on `Number()`'s own coercion quirks.
 */
function toNumberOrNaN(v: unknown): number {
  if (typeof v === 'number') return v
  if (v == null) return NaN
  if (typeof v === 'string' && v.trim() === '') return NaN
  return Number(v)
}

/**
 * Deduplicates locations by id (first-seen coordinates win — matches
 * both real reference apps' own Map-keyed-by-id dedup behavior,
 * confirmed against their fetched source). Sums `value` across rows
 * sharing an (origin, destination) pair. Excludes rows missing a
 * required coordinate or contributing a non-positive value (research.md
 * §5). The flows map is keyed on a composite string for lookup only,
 * storing the real {origin, dest, value} object as the value — NEVER
 * reconstructed from the key (008-sankey-panel's own link-key bug,
 * applied here as a precedent to avoid, not relearn).
 */
export function buildFlowmapData(
  config: FlowMapPanelConfig,
  rows: Record<string, unknown>[],
): FlowmapData {
  const locationsById = new Map<string, FlowLocation>()
  const flowsByKey = new Map<string, Flow>()
  let excludedCount = 0

  for (const row of rows) {
    const originId = String(row[config.origin])
    const destId = String(row[config.destination])
    const originLat = toNumberOrNaN(row[config.origin_lat])
    const originLon = toNumberOrNaN(row[config.origin_lon])
    const destLat = toNumberOrNaN(row[config.dest_lat])
    const destLon = toNumberOrNaN(row[config.dest_lon])
    const value = toNumberOrNaN(row[config.value])

    if (
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLon) ||
      !Number.isFinite(destLat) ||
      !Number.isFinite(destLon) ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      excludedCount += 1
      continue
    }

    if (!locationsById.has(originId)) {
      locationsById.set(originId, { id: originId, lat: originLat, lon: originLon })
    }
    if (!locationsById.has(destId)) {
      locationsById.set(destId, { id: destId, lat: destLat, lon: destLon })
    }

    const key = originId + '|' + destId
    const existing = flowsByKey.get(key)
    if (existing) existing.value += value
    else flowsByKey.set(key, { origin: originId, dest: destId, value })
  }

  return {
    locations: [...locationsById.values()],
    flows: [...flowsByKey.values()],
    excludedCount,
  }
}
```

## `src/panels/FlowMapPanel.tsx` (NEW)

```tsx
import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { FlowmapLayer } from '@flowmap.gl/layers'
import { Map as MapIcon } from 'lucide-react'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import {
  buildPanelQuery,
  resolveActiveScenarios,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { buildFlowmapData } from '@/panels/flowmapData'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { FlowMapPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// Default view state when a panel's config omits center/zoom — roughly
// the Wasatch Front, matching both real reference apps' own default
// centering (research.md; docs/GRAMMAR.md's own worked example uses the
// same coordinates).
const DEFAULT_CENTER: [number, number] = [-111.89, 40.76]
const DEFAULT_ZOOM = 9

// A minimal, self-contained MapLibre style — no external tile source, no
// network request of any kind (constitution Principle II's no-CDN
// discipline, established for DuckDB-WASM specifically but the same
// reasoning applies here: `wftdm-dashboard here` must not require
// internet access). NOT a real basemap — docs/GRAMMAR.md's type: flowmap
// grammar has no style:/basemap: key at all today, so there is no
// author-facing way to configure a real tile source yet; that remains a
// genuinely open, unresolved question (a self-hosted style/tile approach
// vs. a documented grammar addition), out of this feature's scope to
// settle, not silently papered over with a hardcoded external CDN URL
// the way an illustrative sketch might have defaulted to.
const BLANK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5e5e5' } }],
}

// The seventh panel type, and the first to render a real map — see
// contracts/flowmap-panel.md and research.md. Genuinely different from
// every prior panel type in two ways: (1) the maplibregl.Map/
// MapboxOverlay instances are imperative, mount-lifetime objects (a ref,
// never React-rendered output — docs/SPEC.md's own create-once/
// setProps()-on-update/map.remove()-on-destroy shape), not rebuilt
// per-render the way PlotlyPanel/SankeyPanel/ObservablePlotPanel each
// rebuild their own chart on data change; (2) it must survive 004's
// appendChild-based DOM relocation with a live WebGL context intact
// (research.md §3) — verified empirically, not assumed.
// Test-only synchronization hook — lets a Playwright test force the
// "data resolves before the map finishes initializing" ordering
// deterministically, rather than relying on real-world timing happening
// to cooperate (found necessary during contract review — see the
// mapReady state below and its own comment). Same category of
// test-only, additive-only instrumentation as services/duckdb.ts's own
// __debugQueryLog(); unset (0) in production — zero behavior change.
// Must be a window global, not something threaded through the
// __wftdm debug hook — it has to be readable from this effect on first
// mount, before the app's own boot sequence has finished assembling that
// hook, so a test sets it via page.addInitScript() before navigation.
declare global {
  interface Window {
    __flowmapTestMapReadyDelayMs?: number
    // Test-only registry (keyed by panel title) exposing the real
    // maplibregl.Map instance — found necessary during implementation
    // (not part of the original contract sketch): a Playwright test
    // proving the map survives 004's relocation needs to verify actual
    // post-relocation *interactivity* (e.g. a programmatic panTo()
    // producing a real 'moveend' event), which no DOM-only assertion
    // can prove. Same category/rationale as __flowmapTestMapReadyDelayMs.
    __flowmapTestMaps?: Record<string, maplibregl.Map>
  }
}

export function FlowMapPanel({ config }: { config: FlowMapPanelConfig }) {
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  const activeScenarioNames = useActiveScenarios()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const renderCountRef = useRef(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  // Set to true at the end of the map-creation effect below, once
  // mapRef/overlayRef are genuinely populated — included in the
  // data-update effect's own dependency array (FR-006/FR-009's own
  // fix, found during contract review) so React re-runs that effect the
  // moment the overlay actually becomes available, rather than the
  // data-update effect reading a bare ref with no corresponding
  // re-trigger mechanism if it happened to run first and returned early.
  const [mapReady, setMapReady] = useState(false)

  // Data fetch — identical shape to every other data-bound panel type.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(config, activeScenarioNames)
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)

    query(sql)
      .then((result) => {
        if (cancelled) return
        if (result.length === 0) {
          setStatus('empty')
          return
        }
        setRows(result)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [config, filters, activeScenarioNames])

  // Mount-only: create the maplibregl.Map + MapboxOverlay exactly once
  // (FR-006), independent of data/status — a mount-lifetime object, not
  // rebuilt on data change. ResizeObserver mirrors the real reference
  // app's own explicit handling (research.md §2), not relying solely on
  // MapLibre's native auto-resize — this is also what's expected to
  // correctly pick up 004's relocation-driven size change (research.md
  // §3), verified by the Playwright test quickstart.md documents.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const map = new maplibregl.Map({
      container: el,
      style: BLANK_STYLE,
      center: config.center ?? DEFAULT_CENTER,
      zoom: config.zoom ?? DEFAULT_ZOOM,
    })
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] })
    map.addControl(overlay)
    mapRef.current = map
    overlayRef.current = overlay
    window.__flowmapTestMaps ??= {}
    window.__flowmapTestMaps[config.title] = map

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize()
    })
    observer.observe(el)

    // window.__flowmapTestMapReadyDelayMs (see the module-level comment
    // above) — 0/unset in production, so this resolves on the next
    // microtask-adjacent tick with no observable delay. A test sets it
    // to a real delay to deterministically force the data-fetch effect's
    // query to resolve first, exercising the mapReady-gated re-run below
    // rather than hoping real-world timing (synchronous Map construction
    // vs. an always-async query) happens to keep working.
    const delay = window.__flowmapTestMapReadyDelayMs ?? 0
    const readyTimer = window.setTimeout(() => setMapReady(true), delay)

    return () => {
      window.clearTimeout(readyTimer)
      observer.disconnect()
      delete window.__flowmapTestMaps?.[config.title]
      overlayRef.current = null
      mapRef.current = null
      // mapReady is NOT reset to false here — this effect's deps are []
      // (mount-only), so this cleanup only ever runs on actual unmount,
      // where no later render would read it anyway; resetting it would
      // be dead code, not a safety net.
      map.remove() // FR-011 — the only teardown of the map/overlay instances
    }
  }, [])

  // Data update — rebuilds the FlowmapLayer and pushes it to the
  // already-existing overlay via setProps(). Never creates a new
  // MapboxOverlay/maplibregl.Map (FR-006/FR-009). Gated on `mapReady`
  // (React state, not a bare ref read) — found necessary during contract
  // review: the original draft checked `overlayRef.current` directly,
  // which has no mechanism to re-trigger this effect once the ref
  // becomes non-null after an early return, since a ref mutation alone
  // never causes a re-render. In practice, synchronous Map construction
  // racing an always-asynchronous query means the ref is already
  // populated by the time `status` can first become 'ready' — but that
  // safety was entirely implicit, undeclared anywhere in the code, and
  // fragile against a reasonable future refactor (e.g., anything making
  // map setup itself asynchronous). `mapReady` makes the dependency
  // explicit and React-reactive instead of relying on incidental timing.
  useEffect(() => {
    if (status !== 'ready' || !mapReady || !overlayRef.current || !containerRef.current) return

    const data = buildFlowmapData(config, rows)
    if (data.excludedCount > 0) {
      console.warn(
        `FlowMapPanel "${config.title}" (metric: ${config.metric}): excluded ${data.excludedCount} row(s) with a missing coordinate or non-positive value.`,
      )
    }

    const layer = new FlowmapLayer({
      id: 'flowmap',
      data: { locations: data.locations, flows: data.flows },
      getLocationId: (l: { id: string }) => l.id,
      getLocationLat: (l: { lat: number }) => l.lat,
      getLocationLon: (l: { lon: number }) => l.lon,
      getFlowOriginId: (f: { origin: string }) => f.origin,
      getFlowDestId: (f: { dest: string }) => f.dest,
      getFlowMagnitude: (f: { value: number }) => f.value,
      clusteringEnabled: config.clustering ?? true,
      clusteringAuto: config.clustering_auto ?? true,
      animationEnabled: config.animation ?? false,
      maxTopFlowsDisplayNum: config.max_flows,
      pickable: true,
    })
    overlayRef.current.setProps({ layers: [layer] })

    // Test-observability instrumentation only (same category as
    // 007/008's own data-render-count) — proves setProps() actually ran
    // with real data, distinguishing "stuck, never updated" (the race
    // this effect's mapReady gate exists to close) from "successfully
    // updated," which a Playwright test can't otherwise observe (deck.gl
    // renders to its own canvas, not individually inspectable DOM nodes
    // the way SankeyPanel's SVG elements are).
    renderCountRef.current += 1
    containerRef.current.dataset.renderCount = String(renderCountRef.current)
    containerRef.current.dataset.flowCount = String(data.flows.length)
    containerRef.current.dataset.locationCount = String(data.locations.length)
  }, [config, rows, status, mapReady])

  if (status === 'empty') {
    return <PanelEmptyState icon={MapIcon} message="No data for this selection" />
  }
  if (status === 'error') {
    return <PanelErrorState message="Couldn't load this map" />
  }

  return (
    <>
      {status === 'loading' && (
        <div className="animate-pulse rounded-md bg-muted" style={{ height: config.height ?? 500 }} />
      )}
      <div
        ref={containerRef}
        className="flowmap-chart"
        style={{
          width: '100%',
          height: '100%',
          display: status === 'ready' ? undefined : 'none',
        }}
      />
    </>
  )
}
```

**Note on the map-creation effect's `style:` value**: `BLANK_STYLE` (a
background-only, zero-network MapLibre style) is used deliberately, not
as a placeholder to fix up later — an external hosted style URL (e.g. a
public demo tile server) would violate constitution Principle II's
no-CDN discipline (established for DuckDB-WASM specifically, but the
same "`wftdm-dashboard here` must not require internet access"
reasoning applies to any external network dependency this app adds).
**Real basemap tiles remain a genuinely open, unresolved question**
beyond this feature's scope: `docs/GRAMMAR.md`'s `type: flowmap` grammar
has no `style:`/`basemap:` key at all, so there is no author-facing way
to configure a real tile source yet, and settling that (self-hosted
style/tile approach vs. a documented grammar addition) is future work,
not something to paper over with a hardcoded external URL here.

## `src/panels/registry.tsx` (MODIFIED)

```tsx
import { FlowMapPanel } from '@/panels/FlowMapPanel'
// ...
export const registry: Record<string, ComponentType<PanelProps<any>>> = {
  valuebox: ValueBoxPanel,
  plotly: PlotlyPanel,
  table: TablePanel,
  markdown: MarkdownPanel,
  'observable-plot': ObservablePlotPanel,
  sankey: SankeyPanel,
  flowmap: FlowMapPanel,
}
```

## `package.json` (MODIFIED — additive, research.md §1)

```json
{
  "dependencies": {
    "@deck.gl/core": "^9.0.0",
    "@deck.gl/layers": "^9.0.0",
    "@deck.gl/mapbox": "^9.0.0",
    "@flowmap.gl/layers": "^9.3.0",
    "maplibre-gl": "^4.7.1"
  }
}
```

No new devDependencies — every package above ships its own TypeScript
types (research.md §1's confirmed `"types"` fields), unlike
`d3-sankey`/`d3-scale-chromatic`.
