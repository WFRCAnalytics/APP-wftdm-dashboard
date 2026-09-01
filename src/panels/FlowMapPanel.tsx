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
// genuinely open, unresolved question (research.md §9), out of this
// feature's scope to settle, not silently papered over with a hardcoded
// external CDN URL.
const BLANK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5e5e5' } }],
}

// Test-only synchronization hook — lets a Playwright test force the
// "data resolves before the map finishes initializing" ordering
// deterministically (research.md §11), rather than relying on real-world
// timing happening to cooperate. Same category of test-only,
// additive-only instrumentation as services/duckdb.ts's own
// __debugQueryLog(); unset (0) in production — zero behavior change.
// Must be a window global, not something threaded through the __wftdm
// debug hook — it has to be readable from this effect on first mount,
// before the app's own boot sequence has finished assembling that hook,
// so a test sets it via page.addInitScript() before navigation.
declare global {
  interface Window {
    __flowmapTestMapReadyDelayMs?: number
    // Test-only registry (keyed by panel title) exposing the real
    // maplibregl.Map instance — lets a Playwright test verify actual
    // post-relocation interactivity (e.g. a programmatic panTo()
    // producing a real 'moveend' event), which no DOM-only assertion can
    // prove. Same category/rationale as __flowmapTestMapReadyDelayMs.
    __flowmapTestMaps?: Record<string, maplibregl.Map>
  }
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
// (research.md §3) — verified empirically via a dedicated Playwright
// test, not assumed.
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
  // data-update effect's own dependency array (research.md §11's fix,
  // found during contract review) so React re-runs that effect the
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

  // Mount-only: create the maplibregl.Map + MapboxOverlay exactly once,
  // independent of data/status — a mount-lifetime object, not rebuilt on
  // data change. ResizeObserver mirrors the real reference app's own
  // explicit handling (research.md §2), not relying solely on MapLibre's
  // native auto-resize — this is also what's expected to correctly pick
  // up 004's relocation-driven size change (research.md §3).
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
    // above) — 0/unset in production, so this resolves on the next tick
    // with no observable delay. A test sets it to a real delay to
    // deterministically force the data-fetch effect's query to resolve
    // first, exercising the mapReady-gated re-run below rather than
    // hoping real-world timing (synchronous Map construction vs. an
    // always-async query) happens to keep working.
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
      map.remove()
    }
  }, [])

  // Data update — rebuilds the FlowmapLayer and pushes it to the
  // already-existing overlay via setProps(). Never creates a new
  // MapboxOverlay/maplibregl.Map. Gated on `mapReady` (React state, not
  // a bare ref read) — see research.md §11 for why.
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
    // with real data, distinguishing "stuck, never updated" from
    // "successfully updated," which a Playwright test can't otherwise
    // observe (deck.gl renders to its own canvas, not individually
    // inspectable DOM nodes the way SankeyPanel's SVG elements are).
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
