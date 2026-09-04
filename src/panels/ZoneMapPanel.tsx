import { useEffect, useRef, useState } from 'react'
import maplibregl, { type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon } from 'lucide-react'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useBaseline } from '@/hooks/useBaseline'
import { useColorScheme } from '@/hooks/useColorScheme'
import {
  buildComparisonDiffQuery,
  buildPanelQuery,
  isComparisonDiff,
  resolveActiveScenarios,
  resolveComparisonScenarioName,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { loadZoneGeometry, type ZoneGeometry } from '@/panels/zoneGeometry'
import { computeAutoDomain, resolveZoneFillColor, resolveZoneHeightFraction } from '@/panels/zonemapColor'
import { createMapTooltip } from '@/panels/mapTooltip'
import { ThreeDToggleControl } from '@/panels/zonemap3dControl'
import '@/panels/mapControls.css'
import { resolveEffectiveBasemap, basemapKey } from '@/panels/basemap/resolveEffectiveBasemap'
import { loadBasemapStyle, BLANK_STYLE, freshBlankStyle } from '@/panels/basemap/loadBasemapStyle'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { ZoneMapPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// Default view state when a panel's config omits center/zoom — same
// Wasatch Front default 010-flowmap-panel's own FlowMapPanel.tsx uses.
const DEFAULT_CENTER: [number, number] = [-111.89, 40.76]
const DEFAULT_ZOOM = 9

const SOURCE_ID = 'zonemap-zones'
const FILL_LAYER_ID = 'zonemap-fill'
// 014-map-navigation-controls — a second layer on the SAME source, not a
// runtime type-swap of FILL_LAYER_ID: MapLibre layer `type` is immutable
// once added (confirmed against the style-spec — changing a layer's
// rendering mode requires removing and re-adding it), and removing a
// layer mid-life reopens exactly the kind of setStyle()/transformStyle
// timing risk 011/012 already fought hard to eliminate for FILL_LAYER_ID.
// A second, permanently-present layer toggled via `visibility` (a cheap,
// synchronous layout-property flip — no re-add, no risk to the existing
// transformStyle preservation, which carries BOTH layers forward
// identically since neither's id is ever in `nextIds`) is the safer,
// idiomatic MapLibre pattern for a flat/3D toggle.
const EXTRUSION_LAYER_ID = 'zonemap-extrusion'

// A deliberately arbitrary, purely visual scaling constant — the
// underlying metric (VMT per capita, mode share, whatever a given
// zonemap panel is configured to show) has no natural unit of meters to
// convert from. Chosen to read as a clearly legible 3D bar at this
// panel's own default viewing zoom (DEFAULT_ZOOM = 9, a regional
// TAZ/zone-scale view) without dwarfing the basemap underneath it —
// tuned by inspection, not derived from the data. Applied via
// resolveZoneHeightFraction's [0,1] output (zonemapColor.ts), which
// mirrors the SAME zero-anchored convention already driving this panel's
// fill color, per this feature's own requirement that height and color
// agree about which zones carry the most magnitude.
const MAX_EXTRUSION_HEIGHT_METERS = 3000

// The angle the camera tilts to when the 3D toggle turns on — a top-down
// (pitch: 0) view can't show extrusion height at all. 45°, per this
// feature's own request (SimWrapper's own real precedent,
// ShapeFile.vue's handleNewFillHeight(), auto-tilts to 30° instead —
// confirmed this session — but that's tuned for a different, always-on
// auto-tilt UX; 45° reads more legibly for a manually-toggled 3D mode
// the user explicitly opted into).
const EXTRUSION_PITCH = 45

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
  // 019-baseline-diff-consumption: only consulted when config.comparison
  // references the '$baseline' sentinel — included in the fetch effect's
  // own dependency array below regardless, so a live baseline change
  // reactively re-triggers the fetch for a panel that uses it (FR-016).
  const baseline = useBaseline()
  const colorScheme = useColorScheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const probeRef = useRef<HTMLDivElement | null>(null)
  const colorCacheRef = useRef<Map<string, string>>(new Map())
  const renderCountRef = useRef(0)
  const basemapGenerationRef = useRef(0)
  // 014/015-map-controls — the 3D toggle's own state. A plain ref, not
  // React state: the toggle button is no longer React-rendered at all
  // (015 rebuilt it as a genuine MapLibre IControl, zonemap3dControl.ts)
  // so nothing in this component's own render output depends on it —
  // it's read in exactly one place OUTSIDE a render, the data-update
  // effect's rare source-re-ensure fallback, which must not silently
  // reset an already-toggled-on 3D view back to flat just because a
  // basemap transition's transformStyle happened not to carry the live
  // source forward (see that effect's own comment). Kept in sync by the
  // mount effect's own toggle handler on every click.
  const is3dRef = useRef(false)

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
  // type. 019-baseline-diff-consumption: buildComparisonDiffQuery() is
  // now the generalized, shared version (panelQuery.ts) — this is the
  // reference migration every other panel type's own wiring mirrors
  // (research.md §7). A '$baseline' sentinel on either side of
  // config.comparison is resolved via resolveComparisonScenarioName()
  // BEFORE the query is built; an unresolved baseline shows the panel's
  // existing error state directly, never attempting a query built from
  // an undefined scenario name (FR-011).
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    let sql: string
    if (isComparisonDiff(config.comparison)) {
      const diff = config.comparison
      const resolvedA = resolveComparisonScenarioName(diff.a, baseline)
      const resolvedB = resolveComparisonScenarioName(diff.b, baseline)
      if (resolvedA === undefined || resolvedB === undefined) {
        setStatus('error')
        return
      }
      sql = buildComparisonDiffQuery(
        config.metric,
        resolvedA,
        resolvedB,
        config.compare_on ?? [config.metric_id],
        diff.expr,
      )
    } else {
      sql = sqlExpander.expand(
        buildPanelQuery(config, filters),
        EMPTY_SUMMARIZE_CONFIG,
        filterState,
        resolveActiveScenarios(config, activeScenarioNames),
      )
    }

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
  }, [config, filters, activeScenarioNames, baseline])

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
      // Same compact attribution control FlowMapPanel.tsx's own mount
      // effect sets, same reasoning — MapLibre's built-in option, a
      // persistent control the map instance owns, unaffected by
      // setStyle() or 004's relocation.
      attributionControl: { compact: true },
    })
    mapRef.current = map
    window.__zonemapTestMaps ??= {}
    window.__zonemapTestMaps[config.title] = map

    // 014-map-navigation-controls — same NavigationControl/visualizePitch
    // FlowMapPanel.tsx's own mount effect now adds, same reasoning
    // (visualizePitch: true makes the compass click call MapLibre's own
    // resetNorthPitch(), zeroing bearing AND pitch together). Matters
    // more concretely here than for FlowMapPanel: the 3D toggle below can
    // leave this panel's camera genuinely tilted, and the compass is a
    // second, always-available way back to flat besides the toggle
    // itself.
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }))

    // 015-map-controls-polish — the 3D toggle, rebuilt as a genuine
    // MapLibre IControl (zonemap3dControl.ts) instead of a React-rendered
    // overlay <Button>. Defined here, not as a component-scoped function
    // referenced from JSX — the control itself is no longer part of
    // React's render tree at all, and this closure only ever needs the
    // CURRENT map/is3dRef, both stable for this effect's mount-only
    // lifetime. Mirrors 014's own layer-visibility/pitch logic verbatim;
    // only the trigger mechanism (an IControl's click, not a React
    // onClick) and the state store (is3dRef alone, no is3d React state)
    // changed.
    const toggle3d = () => {
      const next = !is3dRef.current
      is3dRef.current = next
      threeDToggle.setActive(next)
      if (map.getLayer(FILL_LAYER_ID)) {
        map.setLayoutProperty(FILL_LAYER_ID, 'visibility', next ? 'none' : 'visible')
      }
      if (map.getLayer(EXTRUSION_LAYER_ID)) {
        map.setLayoutProperty(EXTRUSION_LAYER_ID, 'visibility', next ? 'visible' : 'none')
      }
      map.easeTo({ pitch: next ? EXTRUSION_PITCH : 0, duration: 500 })
    }
    const threeDToggle = new ThreeDToggleControl(toggle3d)
    map.addControl(threeDToggle)

    // Hover/click value inspection (research.md §6) — plain MapLibre
    // mouse events reading the hovered feature's own properties, no
    // deck.gl picking layer. Uses the shared mapTooltip.ts component
    // (015-map-controls-polish — replaces the previous unstyled
    // `new maplibregl.Popup(...)`, matching FlowMapPanel.tsx's own
    // tooltip visual language now instead of drifting independently).
    //
    // Registered against BOTH layer ids, not just FILL_LAYER_ID — a real
    // bug this feature fixed: MapLibre's layer-scoped mousemove/
    // mouseleave events only fire for a layer's own RENDERED features,
    // and a layer with `visibility: 'none'` renders nothing to hit-test
    // against at all — so hover silently never fired once the 3D toggle
    // hid FILL_LAYER_ID and showed EXTRUSION_LAYER_ID instead. Since
    // exactly one of the two is ever visible at a time (toggle3d above),
    // registering on both is safe and needs no extra conditional: the
    // hidden layer's own listener simply never receives events.
    const tooltip = createMapTooltip(el)
    const onMouseMove = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return
      map.getCanvas().style.cursor = 'pointer'
      const zoneId = feature.properties?.zoneId
      const value = feature.properties?.value
      const valueText = value === null || value === undefined ? 'No data' : String(value)
      tooltip.show(e.point.x, e.point.y, `<strong>Zone ${zoneId}</strong><br/>${valueText}`)
    }
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      tooltip.hide()
    }
    map.on('mousemove', FILL_LAYER_ID, onMouseMove)
    map.on('mousemove', EXTRUSION_LAYER_ID, onMouseMove)
    map.on('mouseleave', FILL_LAYER_ID, onMouseLeave)
    map.on('mouseleave', EXTRUSION_LAYER_ID, onMouseLeave)

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
      // 014-map-navigation-controls — the 3D toggle's own layer, added
      // unconditionally alongside the flat fill layer above (not lazily
      // on first toggle-on) — same "always present, visibility-toggled"
      // reasoning EXTRUSION_LAYER_ID's own comment gives. Starts hidden
      // (`visibility: 'none'`), matching `is3dRef.current`'s own initial
      // `false`.
      map.addLayer({
        id: EXTRUSION_LAYER_ID,
        type: 'fill-extrusion',
        source: SOURCE_ID,
        layout: { visibility: 'none' },
        paint: {
          // Same per-feature resolved color the flat fill layer uses —
          // the 3D toggle changes HOW the zones are rendered, not what
          // color each one is.
          'fill-extrusion-color': ['get', 'fillColor'],
          'fill-extrusion-height': ['get', 'fillHeight'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.85,
        },
      })
      setMapReady(true)
    })

    return () => {
      observer.disconnect()
      map.off('mousemove', FILL_LAYER_ID, onMouseMove)
      map.off('mousemove', EXTRUSION_LAYER_ID, onMouseMove)
      map.off('mouseleave', FILL_LAYER_ID, onMouseLeave)
      map.off('mouseleave', EXTRUSION_LAYER_ID, onMouseLeave)
      tooltip.destroy()
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
      // 014-map-navigation-controls — same value/domain resolveZoneFillColor
      // above just used, run through resolveZoneHeightFraction's own
      // matching normalization (zonemapColor.ts) instead — the 3D
      // toggle's fill-extrusion-height data-driven property. Computed for
      // every feature unconditionally, not only while is3d is on: cheap
      // (one extra numeric field per feature), and means toggling on
      // never has to wait for a fresh data-update pass to have a height
      // to show.
      const fillHeight = resolveZoneHeightFraction(value, config.color_scale, domain) * MAX_EXTRUSION_HEIGHT_METERS
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
          fillHeight,
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
          // Visibility re-derived from is3dRef.current, not hardcoded
          // 'visible' — this fallback path only runs when a basemap
          // transition's transformStyle failed to carry the live layer
          // forward (see the comment above), which must not silently
          // undo an already-toggled-on 3D view by resetting back to the
          // mount effect's own flat-first defaults.
          layout: { visibility: is3dRef.current ? 'none' : 'visible' },
          paint: {
            'fill-color': ['get', 'fillColor'],
            'fill-opacity': 0.75,
            'fill-outline-color': 'rgba(0, 0, 0, 0.2)',
          },
        })
      }
      if (!map.getLayer(EXTRUSION_LAYER_ID)) {
        map.addLayer({
          id: EXTRUSION_LAYER_ID,
          type: 'fill-extrusion',
          source: SOURCE_ID,
          layout: { visibility: is3dRef.current ? 'visible' : 'none' },
          paint: {
            'fill-extrusion-color': ['get', 'fillColor'],
            'fill-extrusion-height': ['get', 'fillHeight'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.85,
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
      {/* 015-map-controls-polish — no wrapper div/JSX button needed here
          any more: the 3D toggle is now a genuine MapLibre IControl
          (zonemap3dControl.ts, added via map.addControl() in the mount
          effect) and the hover tooltip is a plain DOM child appended
          directly to this containerRef element (mapTooltip.ts) — both
          anchor correctly on their own, since MapLibre already applies
          `position: relative` to this exact container element (the
          `maplibregl-map` class it adds directly to it, confirmed
          against the installed maplibre-gl source), same as
          FlowMapPanel.tsx's own containerRef. */}
      <div
        ref={containerRef}
        className="zonemap-chart"
        style={{
          // '100%', not config.height ?? 450 — matches FlowMapPanel.tsx's
          // own container exactly. A real bug found live (a reported
          // expand-to-dialog discrepancy): panelExpandHost.tsx already
          // applies config.height exactly once, at the host layer, for
          // every panel type — to inlineAnchor only (the INLINE case);
          // dialogAnchor deliberately uses flex-1 instead, so the
          // expanded view fills the dialog's own larger space regardless
          // of the panel's configured inline height. A fixed pixel value
          // here happened to match config.height for the inline case
          // (masking the bug there) but silently stomped the ancestor's
          // intentionally-larger dialog height with this same fixed
          // number once expanded — the container itself topping out at
          // ~450px inside a much taller dialog, confirmed via a live
          // screenshot comparison against FlowMapPanel's own (correctly
          // full-height) expanded rendering.
          width: '100%',
          height: '100%',
          display: loading ? 'none' : undefined,
        }}
      />
    </>
  )
}
