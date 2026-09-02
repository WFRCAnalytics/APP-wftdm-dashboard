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
import { useColorScheme } from '@/hooks/useColorScheme'
import {
  buildPanelQuery,
  resolveActiveScenarios,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { buildFlowmapData } from '@/panels/flowmapData'
import { resolveEffectiveBasemap, basemapKey } from '@/panels/basemap/resolveEffectiveBasemap'
import { loadBasemapStyle, BLANK_STYLE } from '@/panels/basemap/loadBasemapStyle'
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
    // 011-basemap-style-system: same registry shape as __flowmapTestMaps,
    // for the live MapboxOverlay instance — needed because research.md
    // §1's empirical setStyle()-survival test must inspect
    // overlay.props.layers directly (a duplicate-layer-id bug can leave
    // the overlay "not removed" while silently failing to draw, which no
    // DOM-only check can distinguish from a genuinely healthy overlay).
    __flowmapTestOverlays?: Record<string, MapboxOverlay>
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
  const colorScheme = useColorScheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const renderCountRef = useRef(0)
  // 011-basemap-style-system — generation counter guarding the basemap-
  // application effect's async result against being overwritten by a
  // stale/losing concurrent invocation (see that effect's own comment).
  const basemapGenerationRef = useRef(0)
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
    window.__flowmapTestOverlays ??= {}
    window.__flowmapTestOverlays[config.title] = overlay

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
      delete window.__flowmapTestOverlays?.[config.title]
      overlayRef.current = null
      mapRef.current = null
      // mapReady is NOT reset to false here — this effect's deps are []
      // (mount-only), so this cleanup only ever runs on actual unmount,
      // where no later render would read it anyway; resetting it would
      // be dead code, not a safety net.
      map.remove()
    }
  }, [])

  // 011-basemap-style-system — basemap style application. Deliberately
  // its own effect, not folded into the mount-only effect above (a style
  // CHANGE, unlike map creation, must be able to re-run many times over
  // the map's lifetime) and not folded into the data-update effect below
  // (a basemap change is independent of query/data state — resolving
  // them in the same effect would make an unrelated data refresh
  // redundantly reapply the style, and vice versa). Keyed on
  // basemapKey(...), NOT on colorScheme or config.basemap directly —
  // research.md §2's core mechanism: an explicit pin resolves to the
  // SAME key across a theme flip, so this effect correctly does NOT
  // re-run for it, while the no-config app-default case resolves to a
  // DIFFERENT key per theme, so it does.
  const effectiveBasemap = resolveEffectiveBasemap(config.basemap, config._tabDefaultBasemap, colorScheme)
  const key = basemapKey(effectiveBasemap.selection)

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    // A generation counter AND a real AbortController — not just a
    // boolean `cancelled` flag. Found necessary empirically during
    // implementation (React 18 StrictMode, enabled in main.tsx,
    // double-invokes this effect): a plain boolean flag correctly no-ops
    // a stale invocation's own RESULT, but does nothing to stop that
    // stale invocation's own fetch() calls from continuing to run on the
    // network. For a multi-fetch composition, that redundant concurrent
    // load was observed — running the real UGRC proof case for real, not
    // assumed fine from the design alone — to cause the CURRENT
    // (non-stale) invocation's own fetch to fail with a genuine
    // `TypeError: Failed to fetch`, not just a benign race over which
    // result gets applied. The AbortController's signal (threaded through
    // loadBasemapStyle.ts into every fetch() it or its helpers make)
    // actually cancels the stale invocation's requests on cleanup,
    // removing the redundant load entirely; the generation counter
    // remains as a second, independent guard against ever applying an
    // aborted/stale invocation's result, even in a hypothetical case
    // where abort() didn't reach every in-flight request in time.
    const myGeneration = ++basemapGenerationRef.current
    const controller = new AbortController()

    loadBasemapStyle(effectiveBasemap.selection, controller.signal)
      .then((resolved) => {
        if (basemapGenerationRef.current !== myGeneration || !mapRef.current) return
        const styleArg = resolved.kind === 'url' ? resolved.url : resolved.style
        // transformStyle — reused directly from APP-WFRC-Commute-Patterns'
        // own real, production setStyle() call (research.md §1), not
        // re-derived: preserves this project's own future custom
        // MapLibre-native layers (e.g. a later zonemap's choropleth fill)
        // across the swap by carrying forward any previous-style layer id
        // the new style doesn't already have. No-op today (FlowMapPanel
        // adds no MapLibre-native layers of its own — only the deck.gl
        // overlay, which research.md §1 confirms lives outside this
        // mechanism entirely).
        const map = mapRef.current

        // FR-010/research.md §7 — a real STYLE-LOAD failure (the style
        // document, its sprite/glyphs, or a source's TileJSON failing to
        // fetch/parse) surfaces as a maplibregl 'error' event, not a
        // rejected promise. This listener is deliberately scoped to only
        // the WINDOW between this setStyle() call and its own
        // 'style.load' — found necessary empirically, not part of the
        // original design: a first version listened for 'error' for the
        // map's entire lifetime, which also catches completely normal,
        // expected individual-tile-fetch issues that occur constantly
        // with a real, large multi-source composition (confirmed
        // directly against the real UGRC proof case: disabling the
        // lifetime-scoped listener left the style stable and correctly
        // loaded; re-enabling it reverted an otherwise-successfully-
        // loaded 569-layer style back to BLANK_STYLE within ~300ms of a
        // routine post-load tile event). Once the style has genuinely
        // finished loading, further errors are ordinary map runtime
        // noise, not "the basemap failed," and must not trigger a
        // revert.
        const onLoadError = () => {
          map.off('error', onLoadError)
          const current = map.getStyle()
          if (current && JSON.stringify(current) !== JSON.stringify(BLANK_STYLE)) {
            map.setStyle(BLANK_STYLE)
          }
        }
        map.on('error', onLoadError)
        map.once('style.load', () => map.off('error', onLoadError))

        // transformStyle — reused directly from APP-WFRC-Commute-Patterns'
        // own real, production setStyle() call (research.md §1), not
        // re-derived: preserves this project's own future custom
        // MapLibre-native layers (e.g. a later zonemap's choropleth fill)
        // across the swap by carrying forward any previous-style layer id
        // the new style doesn't already have. No-op today (FlowMapPanel
        // adds no MapLibre-native layers of its own — only the deck.gl
        // overlay, which research.md §1 confirms lives outside this
        // mechanism entirely).
        map.setStyle(styleArg, {
          transformStyle: (previous, next) => {
            if (!previous) return next
            const nextIds = new Set(next.layers.map((l) => l.id))
            const preserved = previous.layers.filter((l) => !nextIds.has(l.id))
            return {
              ...next,
              sources: { ...next.sources, ...previous.sources },
              layers: [...next.layers, ...preserved],
            }
          },
        })
      })
      .catch((e) => {
        // loadBasemapStyle only re-throws a genuine AbortError (every
        // other failure resolves to BLANK_STYLE internally, per FR-010) —
        // this is a deliberate, silent no-op for exactly that case, not a
        // caught-and-ignored real error.
        if (!(e instanceof DOMException && e.name === 'AbortError')) throw e
      })

    return () => {
      controller.abort()
    }
    // Deliberately keyed on `key` (basemapKey's stable content-based
    // identity) alone, not on `effectiveBasemap`/`config.basemap`/
    // `colorScheme` directly — see the comment above and research.md §2.
    // No lint config exists in this repo to silence for this (confirmed
    // — no .eslintrc*/eslint.config.* present), so no disable-comment is
    // needed here, just this explanation.
  }, [key, mapReady])

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
