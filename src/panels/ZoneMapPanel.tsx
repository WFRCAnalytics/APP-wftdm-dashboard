import { useEffect, useRef, useState } from 'react'
import maplibregl, { type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon } from 'lucide-react'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useColorScheme } from '@/hooks/useColorScheme'
import {
  buildComparisonDiffQuery,
  buildPanelQuery,
  resolveActiveScenarios,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { loadZoneGeometry, type ZoneGeometry } from '@/panels/zoneGeometry'
import { computeAutoDomain, resolveZoneFillColor } from '@/panels/zonemapColor'
import { resolveEffectiveBasemap, basemapKey } from '@/panels/basemap/resolveEffectiveBasemap'
import { loadBasemapStyle, BLANK_STYLE, freshBlankStyle } from '@/panels/basemap/loadBasemapStyle'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { ComparisonDiff, ZoneMapPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// Default view state when a panel's config omits center/zoom — same
// Wasatch Front default 010-flowmap-panel's own FlowMapPanel.tsx uses.
const DEFAULT_CENTER: [number, number] = [-111.89, 40.76]
const DEFAULT_ZOOM = 9

const SOURCE_ID = 'zonemap-zones'
const FILL_LAYER_ID = 'zonemap-fill'

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

// Same exclusion 011/012 already established for FlowMapPanel.tsx's own
// transformStyle — BLANK_STYLE's own scaffolding layer(s) must never be
// carried forward across a real setStyle() call by the layer-
// preservation mechanism below (research.md §9).
const BLANK_STYLE_LAYER_IDS = new Set(BLANK_STYLE.layers.map((l) => l.id))

// Test-only instrumentation, same category as FlowMapPanel.tsx's own
// __flowmapTestMaps — no MapboxOverlay/deck.gl exists for this panel
// type (research.md §1), so only the plain maplibregl.Map itself needs
// exposing for Playwright assertions (map.getStyle().layers,
// map.getCanvas(), etc.).
declare global {
  interface Window {
    __zonemapTestMaps?: Record<string, maplibregl.Map>
  }
}

/**
 * Resolves a CSS color string (possibly a var()/color-mix() reference —
 * zonemapColor.ts's own token-derived output) to its concrete computed
 * value, via a persistent hidden probe element. Required because
 * MapLibre's `fill-color` paint property needs a literal color value —
 * unlike this app's SVG/DOM-rendered panel types (TablePanel.tsx,
 * SankeyPanel.tsx), where the browser's own CSS engine resolves var()/
 * color-mix() natively, MapLibre renders to a WebGL canvas with its own
 * JS-side color parser that has no CSS engine to defer to. Mirrors this
 * codebase's established DOM-free-pure-module + DOM-touching-caller
 * split (SankeyPanel.tsx's own resolveFallbackColors()).
 */
function resolveCssColor(cssColor: string, probe: HTMLElement, cache: Map<string, string>): string {
  const cached = cache.get(cssColor)
  if (cached) return cached
  probe.style.color = cssColor
  const resolved = getComputedStyle(probe).color || cssColor
  cache.set(cssColor, resolved)
  return resolved
}

function isComparisonDiff(comparison: ZoneMapPanelConfig['comparison']): comparison is ComparisonDiff {
  return typeof comparison === 'object' && comparison !== null && comparison.type === 'diff'
}

// The eighth and final originally-listed panel type — the second
// map-rendering panel type, and the first with only ONE WebGL context
// (research.md §1: confirmed no deck.gl/MapboxOverlay capability gap —
// a plain MapLibre GeoJSON source + data-driven fill-color paint
// expression covers both the choropleth fill and the hover/click
// interaction need). None of 012-webgl-context-management's interleaved-
// mode/context-loss-detection machinery applies here: MapLibre already
// auto-recovers its OWN native sources/layers on webglcontextlost/
// webglcontextrestored (confirmed — CLAUDE.md's own FlowMapPanel.tsx
// tree comment); that bespoke handling was specifically for deck.gl's
// separate GPU resources, which this panel type has none of.
export function ZoneMapPanel({ config }: { config: ZoneMapPanelConfig }) {
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  const activeScenarioNames = useActiveScenarios()
  const colorScheme = useColorScheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const probeRef = useRef<HTMLDivElement | null>(null)
  const colorCacheRef = useRef<Map<string, string>>(new Map())
  const renderCountRef = useRef(0)
  const basemapGenerationRef = useRef(0)

  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  // Independent of `status` — geometry and metric data load on separate
  // paths (research.md §3) and either can fail independently. The
  // panel's own combined empty/error rendering treats a geometry-load
  // failure the same as a query failure (shared PanelErrorState, FR-010).
  const [geometryStatus, setGeometryStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [zoneGeometry, setZoneGeometry] = useState<ZoneGeometry | null>(null)
  // Same purpose as FlowMapPanel.tsx's own mapReady (010's research.md
  // §11) — true only once the mount effect's map has genuinely finished
  // loading its initial style AND the fill source/layer have been added
  // (this panel type's own real requirement flowmap's overlay-based
  // design never had: MapLibre refuses addSource()/addLayer() before a
  // style has finished loading).
  const [mapReady, setMapReady] = useState(false)
  // Bumped when the already-added source/layer need re-ensuring and
  // re-populating for a reason OTHER than rows/geometry/config changing
  // — a basemap setStyle() switch (research.md §9). Routes through the
  // SAME data-update effect below, whose closure is guaranteed fresh —
  // same pattern FlowMapPanel.tsx's own layerRepopulateGeneration
  // establishes, and the same reasoning for not doing this inline in a
  // long-lived event-handler closure instead.
  const [layerRepopulateGeneration, setLayerRepopulateGeneration] = useState(0)

  // 1. Data fetch — routes through buildComparisonDiffQuery() (no
  // sqlExpander involved — that query has no $filters/$scenario
  // placeholders to expand, research.md §7) when config.comparison is
  // the diff shape; otherwise identical to every other data-bound panel
  // type.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    const sql = isComparisonDiff(config.comparison)
      ? buildComparisonDiffQuery(config, config.comparison)
      : sqlExpander.expand(
          buildPanelQuery(config, filters),
          EMPTY_SUMMARIZE_CONFIG,
          filterState,
          resolveActiveScenarios(config, activeScenarioNames),
        )

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

  // 2. Geometry fetch — independent of the data fetch above.
  useEffect(() => {
    let cancelled = false
    setGeometryStatus('loading')
    loadZoneGeometry(config.boundaries, config.boundaries_id)
      .then((geometry) => {
        if (cancelled) return
        setZoneGeometry(geometry)
        setGeometryStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setGeometryStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [config.boundaries, config.boundaries_id])

  // 3. Mount-only: create the maplibregl.Map exactly once. No
  // MapboxOverlay, no interleaved mode, no contextLost state (research.md
  // §1) — a plain map, a GeoJSON source, and one fill layer, added once
  // the map's own 'load' event confirms the initial (blank) style has
  // genuinely finished loading (required before addSource()/addLayer()
  // are safe to call — MapLibre throws "Style is not done loading"
  // otherwise, a real constraint FlowMapPanel.tsx's overlay-based design
  // never had to account for).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Hidden probe element for resolveCssColor() — never rendered
    // visibly, lives for the panel's full mount lifetime.
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;'
    el.appendChild(probe)
    probeRef.current = probe

    const map = new maplibregl.Map({
      container: el,
      // freshBlankStyle() (an independent deep clone), not the shared
      // BLANK_STYLE constant — same real, confirmed bug avoidance
      // FlowMapPanel.tsx's own mount effect already documents: MapLibre
      // treats a Map's constructor-time style as a live, mutable
      // reference, not something it clones.
      style: freshBlankStyle(),
      center: config.center ?? DEFAULT_CENTER,
      zoom: config.zoom ?? DEFAULT_ZOOM,
    })
    mapRef.current = map
    window.__zonemapTestMaps ??= {}
    window.__zonemapTestMaps[config.title] = map

    // Hover/click value inspection (research.md §6) — plain MapLibre
    // mouse events reading the hovered feature's own properties, no
    // deck.gl picking layer.
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    const onMouseMove = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return
      map.getCanvas().style.cursor = 'pointer'
      const zoneId = feature.properties?.zoneId
      const value = feature.properties?.value
      const valueText = value === null || value === undefined ? 'No data' : String(value)
      popup.setLngLat(e.lngLat).setHTML(`<strong>Zone ${zoneId}</strong><br/>${valueText}`).addTo(map)
    }
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      popup.remove()
    }
    map.on('mousemove', FILL_LAYER_ID, onMouseMove)
    map.on('mouseleave', FILL_LAYER_ID, onMouseLeave)

    // Matches 010-flowmap-panel's own precedent — an explicit
    // ResizeObserver, not relying solely on MapLibre's native
    // auto-resize (research.md §9, that feature's own research.md §2).
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize()
    })
    observer.observe(el)

    map.once('load', () => {
      map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FEATURE_COLLECTION })
      map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          // Pre-resolved per-feature color (resolveCssColor(), computed
          // by the data-update effect below) — a data-driven expression
          // referencing zonemapColor.ts's own CSS output directly isn't
          // possible here: MapLibre's paint-property color parser has no
          // CSS engine to evaluate var()/color-mix() with.
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': 0.75,
          'fill-outline-color': 'rgba(0, 0, 0, 0.2)',
        },
      })
      setMapReady(true)
    })

    return () => {
      observer.disconnect()
      map.off('mousemove', FILL_LAYER_ID, onMouseMove)
      map.off('mouseleave', FILL_LAYER_ID, onMouseLeave)
      popup.remove()
      delete window.__zonemapTestMaps?.[config.title]
      probe.remove()
      probeRef.current = null
      mapRef.current = null
      map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 4. Basemap application — 011-basemap-style-system's own effect
  // shape, reused verbatim (FR-005, research.md §9), unmodified from
  // FlowMapPanel.tsx's own version except: no overlayRef/MapboxOverlay
  // to clear before setStyle() (nothing lives outside this map's own
  // style to wipe), and the post-style-ready trigger below re-ensures
  // AND re-populates this panel's native source/layer instead of a
  // deck.gl overlay's props.
  const effectiveBasemap = resolveEffectiveBasemap(config.basemap, config._tabDefaultBasemap, colorScheme)
  const key = basemapKey(effectiveBasemap.selection)

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const myGeneration = ++basemapGenerationRef.current
    const controller = new AbortController()
    let detachStyleReadyListener: (() => void) | undefined

    loadBasemapStyle(effectiveBasemap.selection, controller.signal)
      .then((resolved) => {
        if (basemapGenerationRef.current !== myGeneration || !mapRef.current) return
        const styleArg = resolved.kind === 'url' ? resolved.url : resolved.style
        const map = mapRef.current

        const onLoadError = () => {
          map.off('error', onLoadError)
          const current = map.getStyle()
          if (current && JSON.stringify(current) !== JSON.stringify(BLANK_STYLE)) {
            map.setStyle(freshBlankStyle())
          }
        }
        map.on('error', onLoadError)

        // 'styledata' (not 'style.load', which only fires once per Map
        // instance's lifetime — 012's own confirmed finding, quoted in
        // FlowMapPanel.tsx) — fires unconditionally on the FIRST
        // occurrence after this setStyle() call, regardless of source
        // count, same reasoning as 012's own fix.
        const onStyleReady = () => {
          map.off('styledata', onStyleReady)
          map.off('error', onLoadError)
          setLayerRepopulateGeneration((g) => g + 1)
        }
        map.on('styledata', onStyleReady)
        detachStyleReadyListener = () => map.off('styledata', onStyleReady)

        // transformStyle — same mechanism 011/012 already built,
        // reused verbatim: carries this panel's own zonemap-zones
        // source / zonemap-fill layer forward across the style swap
        // (excluding BLANK_STYLE's own scaffolding layers) — the
        // "future app-added custom layer" FlowMapPanel.tsx's own
        // comment already anticipated this panel type would be.
        map.setStyle(styleArg, {
          transformStyle: (previous, next) => {
            if (!previous) return next
            const nextIds = new Set(next.layers.map((l) => l.id))
            const preserved = previous.layers.filter(
              (l) => !nextIds.has(l.id) && !BLANK_STYLE_LAYER_IDS.has(l.id),
            )
            return {
              ...next,
              sources: { ...next.sources, ...previous.sources },
              layers: [...next.layers, ...preserved],
            }
          },
        })
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) throw e
      })

    return () => {
      controller.abort()
      detachStyleReadyListener?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mapReady])

  // 5. Data update — joins rows to zoneGeometry by metric_id/
  // boundaries_id/zoneId, resolves each feature's fill color, and calls
  // setData() on the (idempotently re-ensured) GeoJSON source. Never
  // recreates the map (FR-003, FR-009).
  useEffect(() => {
    if (
      status !== 'ready' ||
      geometryStatus !== 'ready' ||
      !mapReady ||
      !mapRef.current ||
      !zoneGeometry ||
      !containerRef.current ||
      !probeRef.current
    ) {
      return
    }
    const map = mapRef.current
    const probe = probeRef.current

    const valueField = isComparisonDiff(config.comparison) ? 'diff_value' : config.column

    // One metric row per zone is expected (FR-003/FR-009's join
    // invariant) — a Map naturally keeps only the last-seen row per
    // zone id if that invariant is ever violated, same fail-soft
    // tolerance every other panel type's own row-keyed lookups already
    // have, rather than crashing on a config-authoring surprise.
    const valueByZoneId = new Map<string, number | null>()
    for (const row of rows) {
      const zoneId = String(row[config.metric_id])
      const raw = row[valueField]
      valueByZoneId.set(zoneId, typeof raw === 'number' ? raw : null)
    }

    // Auto-domain (FR-007): computed from the actual returned rows,
    // regardless of whether each row's zone id has matching geometry —
    // spec.md's own literal wording ("across the returned rows").
    const domain: [number, number] =
      config.domain ?? computeAutoDomain(Array.from(valueByZoneId.values()))

    let excludedCount = 0
    let noDataCount = 0
    const geometryZoneIds = new Set(zoneGeometry.features.map((f) => f.zoneId))
    const features: GeoJSON.Feature[] = zoneGeometry.features.map((zf) => {
      const value = valueByZoneId.get(zf.zoneId) ?? null
      if (value === null) noDataCount += 1
      const cssColor = resolveZoneFillColor(value, config.color_scale, config.color_ramp, domain, config.steps)
      return {
        type: 'Feature',
        // A per-feature id — enables any future feature-state use
        // (hover/selection highlighting). Does NOT, on its own,
        // deduplicate querySourceFeatures() results across tile
        // boundaries for a GeoJSON source — confirmed against MapLibre's
        // own documented behavior ("features are not merged across
        // tiles... it's the responsibility of the caller to determine if
        // a feature is duplicated") after first assuming otherwise; the
        // integration test's own sourceFeatureProps() helper dedupes by
        // zoneId instead, since that duplication is a test-introspection
        // concern only — actual rendering is unaffected either way.
        id: Number(zf.zoneId),
        geometry: zf.geometry,
        properties: {
          zoneId: zf.zoneId,
          value,
          fillColor: resolveCssColor(cssColor, probe, colorCacheRef.current),
        },
      }
    })
    // A metric row whose metric_id has no matching zone in the boundary
    // geometry is excluded before rendering (FR-012) — counted here for
    // instrumentation/observability, same convention FlowMapPanel.tsx's
    // own excludedCount warning already established.
    for (const zoneId of valueByZoneId.keys()) {
      if (!geometryZoneIds.has(zoneId)) excludedCount += 1
    }

    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }

    // Idempotent re-ensure — normally a no-op (the mount effect's own
    // 'load' handler already added these), but re-creates them if a
    // basemap transition's transformStyle happened not to carry the
    // live, setData()-mutated source content forward correctly (research.md
    // §9) — the same defensive repopulate-on-generation-bump discipline
    // FlowMapPanel.tsx's own layerRepopulateGeneration mechanism uses.
    let source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (!source) {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson })
      if (!map.getLayer(FILL_LAYER_ID)) {
        map.addLayer({
          id: FILL_LAYER_ID,
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': ['get', 'fillColor'],
            'fill-opacity': 0.75,
            'fill-outline-color': 'rgba(0, 0, 0, 0.2)',
          },
        })
      }
    } else {
      source.setData(geojson)
    }

    renderCountRef.current += 1
    containerRef.current.dataset.renderCount = String(renderCountRef.current)
    containerRef.current.dataset.zoneCount = String(features.length)
    containerRef.current.dataset.noDataCount = String(noDataCount)
    containerRef.current.dataset.excludedCount = String(excludedCount)
  }, [config, rows, zoneGeometry, status, geometryStatus, mapReady, layerRepopulateGeneration])

  if (status === 'empty') {
    return <PanelEmptyState icon={MapIcon} message="No data for this selection" />
  }
  if (status === 'error' || geometryStatus === 'error') {
    return <PanelErrorState message="Couldn't load this map" />
  }

  const loading = status === 'loading' || geometryStatus === 'loading'

  return (
    <>
      {loading && (
        <div className="animate-pulse rounded-md bg-muted" style={{ height: config.height ?? 450 }} />
      )}
      <div
        ref={containerRef}
        className="zonemap-chart"
        style={{
          width: '100%',
          height: config.height ?? 450,
          display: loading ? 'none' : undefined,
        }}
      />
    </>
  )
}
