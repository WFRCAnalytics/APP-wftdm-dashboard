import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/panels/mapControls.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { FlowmapLayer, PickingType } from '@flowmap.gl/layers'
import { Map as MapIcon } from 'lucide-react'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useGlobalBasemap } from '@/hooks/useGlobalBasemap'
import {
  buildPanelQuery,
  resolveActiveScenarios,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { buildFlowmapData } from '@/panels/flowmapData'
import { createMapTooltip, type MapTooltip } from '@/panels/mapTooltip'
import { resolveEffectiveBasemap, basemapKey } from '@/panels/basemap/resolveEffectiveBasemap'
import { loadBasemapStyle, BLANK_STYLE, freshBlankStyle } from '@/panels/basemap/loadBasemapStyle'
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

// 012-webgl-context-management's own BLANK_STYLE_LAYER_IDS constant
// (guarding a since-REMOVED transformStyle option below against
// preserving BLANK_STYLE's own scaffolding "background" layer) no longer
// exists — 021-basemap-catalog-redesign removed transformStyle from this
// panel's setStyle() call entirely after finding a real, related bug in
// it (see that call site's own comment for the full history). The
// original 012 finding is preserved in CLAUDE.md's file-tree history,
// not restated here now that the code it described is gone.

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
  // 020-settings-modal — the viewer's Settings-modal Basemap-tab pick,
  // threaded into resolveEffectiveBasemap() below. 021-basemap-catalog-
  // redesign: this panel no longer reads useColorScheme() at all —
  // resolveEffectiveBasemap()'s bottom fallback tier is now a single
  // static APP_DEFAULT, never theme-dependent (research.md §6); this was
  // this panel's ONLY use of useColorScheme(), confirmed dead once
  // removed.
  const globalBasemap = useGlobalBasemap()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  // 015-map-controls-polish — the shared tooltip component (mapTooltip.ts),
  // created once in the mount effect below and read from the data-update
  // effect's FlowmapLayer onHover callback. A ref, not a variable closed
  // over directly: the FlowmapLayer instance is reconstructed on every
  // data-update effect run, but the tooltip DOM node itself must persist
  // for the whole mount lifetime (recreating it on every data refresh
  // would flash/reset it, and there's no reason to).
  const tooltipRef = useRef<MapTooltip | null>(null)
  const renderCountRef = useRef(0)
  // 011-basemap-style-system — generation counter guarding the basemap-
  // application effect's async result against being overwritten by a
  // stale/losing concurrent invocation (see that effect's own comment).
  const basemapGenerationRef = useRef(0)
  // 012-webgl-context-management — tracks which `rows` reference the
  // exclusion warning below has already fired for. Needed because
  // layerRepopulateGeneration (added to the data-update effect's own
  // dependency array) re-runs that effect for reasons OTHER than rows
  // actually changing (a setStyle()-driven repopulate, a context-loss
  // recovery) — without this guard, the SAME exclusion warning would
  // log again on every one of those redundant re-runs, since `rows`
  // itself (and therefore data.excludedCount) is unchanged. `rows` only
  // gets a new array reference from the data-fetch effect's own
  // setRows(result) call, never from a repopulate trigger, so reference
  // equality is the correct, cheap "did the actual data change" check.
  const warnedForRowsRef = useRef<Record<string, unknown>[] | null>(null)
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
  // 012-webgl-context-management — bumped whenever the already-existing
  // FlowmapLayer needs to be reconstructed and re-applied for a reason
  // OTHER than rows/config/status changing: either the interleaved-mode
  // setStyle() layer-wipe (basemap effect's style.load handler, below)
  // or a WebGL context recovery (webglcontextrestored, below). Neither
  // of those two call sites constructs a FlowmapLayer directly — both
  // are long-lived closures (one fixed at first mount forever, the other
  // fixed until the basemap effect's own next re-run) that would read
  // stale status/rows/config if they tried (a real bug found and
  // corrected during this feature's own plan review — contracts/
  // interleaved-overlay-survival.md's "Why not a standalone helper
  // function"). Bumping this counter instead routes both triggers
  // through the data-update effect below, whose closure is guaranteed
  // fresh every time it actually runs.
  const [layerRepopulateGeneration, setLayerRepopulateGeneration] = useState(0)
  // 012-webgl-context-management — independent of `status`, not a merged
  // enum: `status` answers "did this panel's query return data?";
  // `contextLost` answers "is this panel's map currently able to render
  // at all, right now, regardless of whether it has data?". Only
  // meaningfully becomes true once a real map/overlay exists to lose its
  // context (i.e. after `status` has already reached 'ready' at least
  // once) — never reset by the data-fetch effect below, only by
  // webglcontextrestored or this whole component unmounting.
  const [contextLost, setContextLost] = useState(false)

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
      // 012-webgl-context-management — freshBlankStyle() (an independent
      // deep clone), NOT the shared BLANK_STYLE constant directly: a
      // real, confirmed bug — MapLibre treats a Map's constructor-time
      // style as a live, mutable object, not something it defensively
      // clones, so handing every panel the SAME BLANK_STYLE reference let
      // one panel's own real basemap transition mutate resolved fields
      // (confirmed: sprite/glyphs) directly onto that shared object,
      // corrupting every other panel still starting from "blank" (see
      // loadBasemapStyle.ts's own freshBlankStyle() comment for the full
      // trace).
      style: freshBlankStyle(),
      center: config.center ?? DEFAULT_CENTER,
      zoom: config.zoom ?? DEFAULT_ZOOM,
      // Collapse the default attribution control to a small click-to-
      // expand icon rather than the full attribution text rendered
      // inline — MapLibre's own first-class, built-in option (no custom
      // UI). A card-sized panel has little room to spare; the full text
      // is one click away via the icon, never removed. Set once here at
      // construction — the control is a persistent DOM child of the map
      // container the Map instance itself owns and is unaffected by
      // setStyle() (a style swap only replaces sources/layers, never the
      // controls added via addControl()/the constructor's own control
      // options) and by 004's appendChild-based relocation (the control
      // moves with the container, same as the canvas itself).
      attributionControl: { compact: true },
    })
    // 014-map-navigation-controls — MapLibre's own built-in
    // NavigationControl (zoom in/out + compass), not custom UI, per the
    // same "first-class library control" discipline the attribution
    // control above already established. visualizePitch: true makes the
    // compass button call MapLibre's own resetNorthPitch() on click
    // (confirmed directly against the installed maplibre-gl source:
    // NavigationControl's compass click handler branches on this exact
    // option) instead of resetNorth() — zeroing bearing AND pitch
    // together in one click, not bearing alone. FlowMapPanel has no 3D
    // mode of its own (research confirmed no real reference implementation
    // — SimWrapper's own five real flow/network rendering paths included —
    // ever encodes flow magnitude as height; pitch here can only ever be
    // changed by a user's own manual map drag), but the reset affordance
    // costs nothing to include and matches ZoneMapPanel's own control set
    // for a control a user expects consistently across both map panel
    // types. A persistent DOM child of the map container, like
    // attributionControl above — unaffected by setStyle() and by 004's
    // relocation for the same reason.
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }))
    // 012-webgl-context-management — interleaved: true (was false).
    // Halves this panel's WebGL context cost from 2 (a separate
    // maplibregl.Map context plus a separate deck.gl-owned canvas/
    // context) to 1 (deck.gl renders directly into MapLibre's own
    // WebGL2RenderingContext — confirmed directly against
    // @deck.gl/mapbox's real installed source: interleaved mode's
    // _onAddInterleaved() reads map.painter.context.gl and creates no
    // canvas of its own; getCanvas() returns this._map.getCanvas()).
    // research.md §1/§2 rules out deck.gl's own View system and
    // viewport-gated mounting as unnecessary/architecturally
    // incompatible ways to raise this project's real ~8-panel-per-tab
    // ceiling; this one line is the actual fix, raising it to ~16.
    // pickingRadius: 8 — 015-map-controls-polish. Flow lines are thin
    // (1-few px), and the new onHover tooltip below is otherwise
    // pixel-perfect-only to trigger; a few extra pixels of hit-test
    // tolerance around the pointer is standard deck.gl practice for thin
    // line/point geometries and a real usability improvement, not just a
    // testing convenience.
    const overlay = new MapboxOverlay({ interleaved: true, layers: [], pickingRadius: 8 })
    map.addControl(overlay)
    mapRef.current = map
    overlayRef.current = overlay
    // 015-map-controls-polish — the shared hover tooltip (mapTooltip.ts),
    // appended directly to `el` (this map's own container element) —
    // same anchor point ZoneMapPanel.tsx's own tooltip uses, and safe for
    // the same reason: MapLibre applies `position: relative` to `el`
    // itself via its own `maplibregl-map` class.
    tooltipRef.current = createMapTooltip(el)
    window.__flowmapTestMaps ??= {}
    window.__flowmapTestMaps[config.title] = map
    window.__flowmapTestOverlays ??= {}
    window.__flowmapTestOverlays[config.title] = overlay

    // 012-webgl-context-management — MapLibre's own Map class already
    // listens for the standard canvas-level webglcontextlost/
    // webglcontextrestored events, already calls event.preventDefault()
    // (the one action required for the browser to ever consider
    // restoring the context later), already aborts any in-flight frame
    // request so no crash/hang occurs, and already rebuilds its own
    // internal painter/GL resources on restore — then re-fires both as
    // its own real, public Map events (confirmed directly against the
    // installed maplibre-gl source, research.md §3). This wires up
    // events the library already produces, not new low-level
    // instrumentation.
    const onContextLost = () => setContextLost(true)
    const onContextRestored = () => {
      setContextLost(false)
      // MapLibre has already rebuilt ITS OWN resources by the time this
      // fires — but deck.gl's own interleaved-mode GPU resources
      // (buffers/programs) are a separate concern layered on top of the
      // same now-restored context, not rebuilt by MapLibre's own
      // recovery. Deliberately does NOT construct a FlowmapLayer or read
      // status/rows/config directly in this closure — see the
      // layerRepopulateGeneration comment above. setProps({ layers: [] })
      // needs no external state (a constant empty array), so it's safe
      // to call directly here; the actual re-construction is deferred to
      // the data-update effect below, re-triggered by the generation
      // bump (FR-006: MapLibre's own restored style IS the panel's
      // already-resolved effective basemap — nothing about
      // basemapKey/resolveEffectiveBasemap needs to re-run, since
      // neither the panel's pin nor its tab default nor the current
      // theme changed just because the context was lost).
      overlayRef.current?.setProps({ layers: [] })
      setLayerRepopulateGeneration((g) => g + 1)
    }
    map.on('webglcontextlost', onContextLost)
    map.on('webglcontextrestored', onContextRestored)

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
      map.off('webglcontextlost', onContextLost)
      map.off('webglcontextrestored', onContextRestored)
      delete window.__flowmapTestMaps?.[config.title]
      delete window.__flowmapTestOverlays?.[config.title]
      tooltipRef.current?.destroy()
      tooltipRef.current = null
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
  // basemapKey(...), NOT on config.basemap directly — 021-basemap-
  // catalog-redesign: this key is no longer theme-sensitive at all
  // (resolveEffectiveBasemap()'s bottom fallback tier is a single static
  // APP_DEFAULT, research.md §6) — kept as a stable, content-based
  // identity regardless, so an unrelated re-render that resolves to the
  // SAME selection still doesn't redundantly re-run this effect.
  const effectiveBasemap = resolveEffectiveBasemap(config.basemap, config._tabDefaultBasemap, globalBasemap)
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
    // 012-webgl-context-management — set inside the .then() below, once
    // the real onStyleReady listener for THIS invocation exists; read by
    // this effect's own cleanup so a still-pending listener from a
    // superseded invocation (e.g. a rapid double theme-toggle) is always
    // detached, not left to fire against a map that's already moved on
    // to a newer style.
    let detachStyleReadyListener: (() => void) | undefined

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

        // 012-webgl-context-management — interleaved mode (T003 above)
        // inserts deck.gl's layers directly into MapLibre's own
        // style/layer stack, unlike the non-interleaved overlay this
        // effect was originally written against — setStyle() wipes them,
        // a real, documented failure mode (github.com/visgl/deck.gl/
        // discussions/7170, github.com/maplibre/maplibre-gl-js/
        // issues/2587; research.md §2). Clearing layers before the style
        // changes, then re-populating once the NEW style has finished
        // loading (via the style.load handler's own
        // setLayerRepopulateGeneration bump below), is deck.gl's own
        // documented fix for exactly this.
        overlayRef.current?.setProps({ layers: [] })

        // FR-010/research.md §7 — a real STYLE-LOAD failure (the style
        // document, its sprite/glyphs, or a source's TileJSON failing to
        // fetch/parse) surfaces as a maplibregl 'error' event, not a
        // rejected promise. This listener is deliberately scoped to only
        // the WINDOW between this setStyle() call and its own style
        // becoming ready — found necessary empirically, not part of the
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
          // freshBlankStyle() when actually setting it (MapLibre mutates
          // the live style object in place) — the comparison just above
          // stays against the canonical BLANK_STYLE constant, a safe,
          // read-only value comparison (JSON.stringify compares content,
          // not identity).
          if (current && JSON.stringify(current) !== JSON.stringify(BLANK_STYLE)) {
            map.setStyle(freshBlankStyle())
          }
        }
        map.on('error', onLoadError)

        // 012-webgl-context-management — 'style.load' is NOT used here
        // (011's original design). Confirmed empirically (real
        // instrumented Playwright run against this project's own pinned
        // maplibre-gl) AND against MapLibre's own real-world-reported
        // behavior (github.com/maplibre/maplibre-gl-js/discussions/2716:
        // "style.load only runs once"): it fires exactly once per Map
        // instance's lifetime — on the FIRST style becoming ready — and
        // never again for any subsequent setStyle() call. 011's own
        // original `map.once('style.load', () => map.off('error',
        // onLoadError))` therefore never actually ran on a second+
        // basemap switch, silently leaking one 'error' listener per
        // switch (harmless in 011's own test scenarios, which never
        // exercised a second setStyle() on the same map instance while
        // checking for it, but a real latent bug this feature's own
        // instrumentation surfaced while building the interleaved-mode
        // repopulate trigger on the same assumption).
        //
        // 'styledata' DOES keep firing on every subsequent setStyle()
        // call (confirmed by the same instrumentation) — it also fires
        // many times per style load (once per internal style-related
        // change, not just once when ready).
        //
        // Deliberately NOT filtered on `getStyle().sources` being
        // non-empty (an earlier version of this fix did that, matching
        // waitForBasemapApplied()'s own "simpler, race-free signal" —
        // but that signal is specifically for detecting a REAL,
        // non-blank basemap, not for "this setStyle() call has been
        // processed" in general). BLANK_STYLE — the fallback
        // loadBasemapStyle() itself resolves to for a genuinely
        // unreachable preset (confirmed directly: resolvePresetName()'s
        // own catch block, panels/basemap/loadBasemapStyle.ts) —
        // legitimately has `sources: {}`. A sources-non-empty filter
        // therefore NEVER fires for that transition, meaning the
        // overlay's layers (cleared immediately above, unconditionally)
        // never get re-populated — a REAL, confirmed regression found
        // via direct instrumentation on the fixture's own "Unreachable
        // Basemap" panel: its FlowmapLayer was silently wiped and never
        // restored, violating FR-010/SC-004's "a missing/unreachable
        // basemap never prevents a panel's data-driven content from
        // rendering" guarantee (011's own core promise). Fixed by
        // reacting to the FIRST 'styledata' after this setStyle() call
        // unconditionally, regardless of source count — safe because
        // nothing else calls setStyle() on this map instance between
        // this listener's registration and this call (single-threaded
        // JS, no other concurrent caller), so that first occurrence is
        // always caused by THIS call, never a stale leftover. A
        // repopulate triggered by a blank/unchanged style is a safe,
        // cheap no-op-equivalent: the data-update effect below
        // reconstructs the SAME FlowmapLayer from the SAME rows and
        // calls setProps() again — redundant, not harmful.
        //
        // Deck.gl's own interleaved-mode 'styledata' listener
        // (registered once, at overlay construction, inside
        // MapboxOverlay's real _onAddInterleaved()) re-inserts its
        // render slot into the new style on 'styledata' too — and,
        // being registered long before this one, always runs first for
        // the same event dispatch (MapLibre/DOM-standard listener
        // ordering), so by the time this handler's body runs, deck.gl
        // has already done its own reinsertion for that occurrence —
        // true regardless of which 'styledata' occurrence we react to,
        // so this doesn't depend on the source-count filter either.
        const onStyleReady = () => {
          map.off('styledata', onStyleReady)
          map.off('error', onLoadError)
          // Re-populate with the CURRENT data-derived layer, not the
          // pre-clear one. Does NOT construct the FlowmapLayer directly
          // here (see the layerRepopulateGeneration comment near its
          // declaration) — bumping this counter re-triggers the
          // data-update effect below, whose closure is guaranteed fresh
          // at the moment it actually runs.
          setLayerRepopulateGeneration((g) => g + 1)
        }
        map.on('styledata', onStyleReady)
        detachStyleReadyListener = () => map.off('styledata', onStyleReady)

        // 021-basemap-catalog-redesign — REMOVED the `transformStyle`
        // option this call used to pass (originally reused verbatim from
        // APP-WFRC-Commute-Patterns' own production setStyle() call,
        // research.md §1 of 011-basemap-style-system): a REAL, confirmed
        // bug this feature's own testing found — indiscriminately
        // preserving "any previous-style layer id the new style doesn't
        // already have" preserves the OLD basemap's OWN real content, not
        // just a hypothetical future app-added layer, whenever the
        // PREVIOUS style is a real vector style (e.g. carto-voyager) and
        // the NEXT style is a raster preset with no `glyphs` URL — the
        // carried-forward text/symbol layers still need glyphs the new
        // style doesn't provide, MapLibre rejects the whole style with
        // `layers[N].layout.text-field: use of "text-field" requires a
        // style "glyphs" property`, and the panel silently reverts to
        // BLANK_STYLE via the onLoadError handler below. This exact
        // transition (a real vector app-default/global pick switching to
        // a raster provider via the viewer's own Settings-modal Raster
        // Tiles selection) was never possible before this feature added
        // the Raster Tiles section to the global picker — 011's own
        // pre-existing test coverage only ever exercised a raster preset
        // as a panel's very FIRST setStyle() call (`previous === null`,
        // this transformStyle's own no-op case), never a live switch FROM
        // a real vector style. Confirmed directly, not assumed: this
        // panel adds no MapLibre-native layer of its own at all (only the
        // deck.gl overlay, which lives entirely outside this mechanism —
        // research.md §1's own already-documented finding) — the
        // preservation this option existed to provide was already a
        // no-op for every real case in this codebase today, so removing
        // it outright (rather than trying to special-case which previous
        // layers are "safe" to keep) is the correct, minimal fix. A
        // future feature that genuinely needs to preserve an app-owned
        // FlowMapPanel layer across a style swap should scope its own
        // transformStyle to that layer's specific id/source (the same
        // fix applied to ZoneMapPanel.tsx's own real zonemap-zones/
        // zonemap-fill preservation need), not resurrect this
        // unconditional "preserve everything" shape.
        map.setStyle(styleArg)
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
      // 012-webgl-context-management — detaches a still-pending
      // onStyleReady listener from a superseded invocation (e.g. a rapid
      // double theme-toggle re-running this effect before the first
      // setStyle()'s own style finished loading) — otherwise it would
      // stay registered and could fire against a map that has already
      // moved on to a newer style, redundantly bumping
      // layerRepopulateGeneration for a generation() that already lost.
      // undefined until the promise above actually resolves and reaches
      // that point — a cleanup running before then has nothing to detach
      // (the AbortController above already cancels the underlying
      // fetch(es) in that case).
      detachStyleReadyListener?.()
    }
    // Deliberately keyed on `key` (basemapKey's stable content-based
    // identity) alone, not on `effectiveBasemap`/`config.basemap`
    // directly — see the comment above and research.md §6.
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
    if (data.excludedCount > 0 && warnedForRowsRef.current !== rows) {
      warnedForRowsRef.current = rows
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
      // 015-map-controls-polish — deck.gl's OWN picking/hover mechanism
      // (FlowmapLayer's own onHover prop, backed by `pickable: true`
      // above), NOT MapLibre's mousemove — confirmed necessary, not just
      // a style preference: deck.gl content under interleaved mode
      // shares MapLibre's canvas but is NOT part of MapLibre's own
      // source/layer/feature model, so MapLibre's `map.on('mousemove',
      // layerId, ...)` (ZoneMapPanel.tsx's own mechanism) cannot see it
      // at all — confirmed against MapLibre's own event system, which
      // only ever hit-tests its OWN vector/GeoJSON/raster layers.
      // `info.x`/`info.y` are already pixel coordinates relative to the
      // shared canvas's own top-left corner — the same coordinate space
      // mapTooltip.ts's `show()` expects, no translation needed.
      onHover: (info) => {
        const tooltip = tooltipRef.current
        if (!tooltip) return
        if (!info?.object) {
          tooltip.hide()
          return
        }
        if (info.object.type === PickingType.FLOW) {
          const { origin, dest, count } = info.object
          tooltip.show(info.x, info.y, `<strong>${origin.id} → ${dest.id}</strong><br/>${count}`)
          return
        }
        // A location circle, not a flow line — origin/destination/value
        // (this feature's own required content) only applies to flows;
        // no tooltip for a bare location hover.
        tooltip.hide()
      },
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
    // 012-webgl-context-management — layerRepopulateGeneration added.
    // Bumped by (a) the basemap effect's style.load handler after an
    // interleaved-mode setStyle() wipe, and (b) webglcontextrestored —
    // both need the FlowmapLayer reconstructed from CURRENT rows/config,
    // which only this effect's own always-fresh closure can guarantee
    // (contracts/interleaved-overlay-survival.md's "Why not a standalone
    // helper function"). If status isn't 'ready' when a repopulate is
    // requested, the guard above already returns early — a correct
    // no-op, since this effect re-runs again anyway once status reaches
    // 'ready' (already in this dependency array).
  }, [config, rows, status, mapReady, layerRepopulateGeneration])

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
      {/* 012-webgl-context-management — the containerRef div below must
          NEVER unmount while contextLost is true: MapLibre's own
          automatic restoration rebuilds resources against the SAME
          canvas element, not a newly-created one. This wrapper lets the
          banner overlay the (currently inert but still-mounted) canvas
          instead of replacing it, unlike the 'empty'/'error' early
          returns above (which correctly DO omit the container — a
          context can only be lost after a map has already been
          successfully constructed, which only happens once status
          reaches 'ready'). */}
      <div style={{ position: 'relative', height: '100%', width: '100%' }}>
        {status === 'ready' && contextLost && (
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 1 }}
            className="flex items-center justify-center bg-background/80"
          >
            <PanelErrorState message="Map context lost — too many maps are open at once. It may recover automatically; try closing other panels or reloading if not." />
          </div>
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
      </div>
    </>
  )
}
