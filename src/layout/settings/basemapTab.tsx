import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/panels/mapControls.css'
import { PMTiles } from 'pmtiles'
import {
  Landmark,
  Globe,
  Map as MapIcon,
  Sun,
  Sparkles,
  Moon,
  Compass,
  Palette,
  Waves,
  Satellite,
  Mountain,
  Star,
  Layers,
  Contrast,
  CircleDashed,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  resolveBuiltInPreset,
  listCuratedRasterProviders,
  APP_DEFAULT,
  type CuratedRasterProvider,
} from '@/panels/basemap/registry'
import { loadBasemapStyle, freshBlankStyle } from '@/panels/basemap/loadBasemapStyle'
import { PROTOMAPS_FLAVOR_NAMES, isProtomapsFlavorName } from '@/panels/basemap/protomapsStyle'
// 042-boot-performance-fix: imported from the dependency-free
// mapDefaults.ts, NOT from FlowMapPanel.tsx (this file is reachable
// unconditionally from Shell -> SettingsModal -> BasemapTab, so an import
// of FlowMapPanel.tsx itself would transitively pull maplibre-gl/
// @deck.gl/@flowmap.gl/layers into the app's eager entry graph — see
// mapDefaults.ts's own header comment for the full finding).
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/panels/mapDefaults'
import { useGlobalBasemap } from '@/hooks/useGlobalBasemap'
import { useProtomapsSource } from '@/hooks/useProtomapsSource'
import { setGlobalBasemap } from '@/state/basemapState'
import {
  subscribe as subscribeProtomapsSource,
  getViewerPmtilesOverride,
  setViewerPmtilesOverride,
  clearViewerPmtilesOverride,
} from '@/state/protomapsSourceState'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { BasemapPresetName } from '@/panels/basemap/types'

// 021-basemap-catalog-redesign: replaces 020-settings-modal's flat,
// immediate-apply radio list entirely with a sectioned catalog, a single
// persistent shared preview, and a stage-then-Apply flow. See
// specs/021-basemap-catalog-redesign/research.md for the full design
// history — including a superseded per-entry-Popover-preview draft (§3's
// own revision note) this component deliberately does NOT implement.
// UI polish pass (post-merge correction): preview map now carries the
// same NavigationControl/attribution/default-view-state FlowMapPanel.tsx/
// ZoneMapPanel.tsx already use (see the mount effect below), "Explore
// options" moved beside the Raster Tiles heading, and this component's
// own top block (preview + description + Apply) is now fixed while only
// the catalog sections scroll — see settingsModal.tsx's own Basemap
// TabsContent, which no longer owns that scroll itself.

// Test-only instrumentation, additive only, never read by application
// code — same category as FlowMapPanel.tsx's own __flowmapTestMaps.
// Singular (TestMap, not TestMaps): there is exactly one preview map for
// this whole feature, by construction (research.md §3/§4).
declare global {
  interface Window {
    __basemapPreviewTestMap?: maplibregl.Map
  }
}

interface VectorEntry {
  name: BasemapPresetName
  label: string
  // 024-settings-modal-visual-redesign (US3): a per-ENTRY icon, new —
  // 021's own catalog had only a per-SECTION icon (research.md §4 below
  // explains why a per-entry icon is not the same thing as the literal
  // thumbnail that item deliberately ruled out). Chosen to be honestly
  // CATEGORICAL (light/dark/hybrid/outdoors/colorful), never a fabricated
  // preview of what the style actually looks like — Sun/Moon for a light/
  // dark style, Satellite for imagery-backed hybrid, Mountain for
  // terrain-oriented outdoors styles, Waves for Fiord (a coastal/fjord
  // name), Palette for Liberty (OpenFreeMap's own most colorful style),
  // Compass for a general-purpose default (Voyager).
  icon: LucideIcon
  // Marks the single entry matching registry.ts's own APP_DEFAULT — a
  // small "Recommended" cue so a viewer knows which style the app falls
  // back to for every unconfigured flowmap/zonemap panel. Exactly one
  // entry across all sections carries this.
  recommended?: boolean
}

interface Section {
  heading: string
  icon: LucideIcon
  entries: VectorEntry[]
}

// Static, ordered catalog data (T011) — which preset names belong to
// which vector section, in what order, plus one small per-SECTION icon.
// What a selection actually LOOKS like is answered entirely by the shared
// preview area below, not by anything on the entry itself — no per-entry
// THUMBNAIL exists or is implied by the per-entry icon above (research.md
// §4's "no thumbnail pipeline" scope boundary is unchanged; a category
// glyph is not a preview image).
//
// Section order: OpenFreeMap first — the most universal, broadly-relevant
// option, and the source of the app-wide default ('openfreemap-positron',
// marked `recommended` below); then CARTO; then UGRC (Utah-specific,
// lowest general relevance). Raster Tiles renders last, after this array.
const SECTIONS: Section[] = [
  {
    heading: 'OpenFreeMap',
    icon: MapIcon,
    entries: [
      { name: 'openfreemap-liberty', label: 'Liberty', icon: Palette },
      { name: 'openfreemap-bright', label: 'Bright', icon: Sparkles },
      { name: 'openfreemap-positron', label: 'Positron', icon: Sun, recommended: true },
      { name: 'openfreemap-dark', label: 'Dark', icon: Moon },
      { name: 'openfreemap-fiord', label: 'Fiord', icon: Waves },
    ],
  },
  {
    heading: 'CARTO Vector Tiles',
    icon: Globe,
    entries: [
      { name: 'carto-positron', label: 'Positron', icon: Sun },
      { name: 'carto-dark-matter', label: 'Dark Matter', icon: Moon },
      { name: 'carto-voyager', label: 'Voyager', icon: Compass },
    ],
  },
  {
    heading: 'UGRC Vector Tiles',
    icon: Landmark,
    entries: [
      { name: 'ugrc-vector-lite', label: 'Vector Lite', icon: MapIcon },
      { name: 'ugrc-vector-hybrid', label: 'Vector Hybrid', icon: Satellite },
      { name: 'ugrc-vector-outdoors', label: 'Vector Outdoors', icon: Mountain },
    ],
  },
]

type RasterSectionStatus =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; providers: CuratedRasterProvider[] }

// A selection that isn't one of this module's own built-in vector/
// composition presets is, by construction, a raster provider's dotted
// name (or bare name) — reusing the existing registry lookup rather than
// inventing a second naming convention (research.md §5).
//
// 041-protomaps-pmtiles-basemap: a Protomaps flavor name ALSO resolves
// to `undefined` from resolveBuiltInPreset() (research.md R-6 — it's
// deliberately not a static BUILT_IN_PRESETS entry), so it must be
// excluded here explicitly or it would be misclassified as a raster
// provider — which would wrongly route it into the preview effect's
// raster-only error/timeout-detection branch below (scoped to a source
// id, "basemap", that a Protomaps style never uses) and, worse, would
// ALWAYS flag a successfully-loading Protomaps selection as failed once
// that branch's own 4-second no-tile-loaded timeout elapses.
function isRasterProviderSelection(name: BasemapPresetName): boolean {
  return resolveBuiltInPreset(name) === undefined && !isProtomapsFlavorName(name)
}

// Honest, categorical icons (never a fabricated preview of what the
// flavor actually renders as) — same convention every entry in SECTIONS
// above already follows. Built FROM PROTOMAPS_FLAVOR_NAMES (data-model.md
// E-1's own single-source-of-truth requirement) rather than a second,
// independently-maintained list of the same 5 names.
const PROTOMAPS_FLAVOR_LABEL_AND_ICON: Record<(typeof PROTOMAPS_FLAVOR_NAMES)[number], { label: string; icon: LucideIcon }> = {
  'protomaps-light': { label: 'Light', icon: Sun },
  'protomaps-dark': { label: 'Dark', icon: Moon },
  'protomaps-white': { label: 'White', icon: Sparkles },
  'protomaps-grayscale': { label: 'Grayscale', icon: Contrast },
  'protomaps-black': { label: 'Black', icon: CircleDashed },
}

export function BasemapTab() {
  const appliedBasemap = useGlobalBasemap()
  // 041-protomaps-pmtiles-basemap — the effective PMTiles source
  // (viewer override ?? deployer default ?? undefined). Reactive: a
  // viewer committing/clearing their own override below re-renders this
  // component (and the shared preview map, via its own effect
  // dependency) immediately, no reload.
  const protomapsSource = useProtomapsSource()
  // Whether the CURRENT source is specifically a viewer override (as
  // opposed to the deployer default, or nothing) — drives the "Reset to
  // default" affordance (contracts/basemap-tab-ui.md). A second,
  // independent useSyncExternalStore call against the same store/
  // selector-free subscribe(), watching a different selector than
  // useProtomapsSource()'s own — both are valid, ordinary React.
  const protomapsOverrideActive = useSyncExternalStore(
    subscribeProtomapsSource,
    () => getViewerPmtilesOverride() !== undefined,
  )
  const [protomapsOverrideDraft, setProtomapsOverrideDraft] = useState('')
  const [protomapsOverrideStatus, setProtomapsOverrideStatus] = useState<
    { kind: 'idle' } | { kind: 'validating' } | { kind: 'error'; message: string }
  >({ kind: 'idle' })
  // T013 — initialized ONCE to whatever is currently applied (or the
  // resolved app-default), so the preview never starts blank (FR-011).
  // Deliberately not re-synced on a later live appliedBasemap change —
  // this is the tab's own staged CANDIDATE, decoupled from the real
  // value the moment the tab opens.
  const [stagedSelection, setStagedSelection] = useState<BasemapPresetName>(
    () => appliedBasemap ?? APP_DEFAULT,
  )

  const previewContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const basemapGenerationRef = useRef(0)
  // 024-settings-modal-visual-redesign (US2, FR-007) — see the
  // basemap-application effect below for why this exists and how it's
  // scoped (raster selections only, current generation only).
  const [previewError, setPreviewError] = useState(false)

  // T012 — the ONE persistent preview map for this whole feature
  // (research.md §3). Mount-once/cleanup-once, matching this project's
  // established Panel-pattern map lifecycle (FlowMapPanel.tsx/
  // ZoneMapPanel.tsx) — created when this component mounts (the Basemap
  // tab becomes the active Settings tab) and destroyed when it unmounts
  // (a tab switch or modal close), since neither TabsContent nor
  // DialogContent force-mounts in this codebase. No overlay, no data
  // query — this map renders nothing but the staged basemap itself.
  //
  // UI polish pass: center/zoom, NavigationControl, and the collapsing
  // attribution control now reuse the EXACT same values/construction
  // FlowMapPanel.tsx/ZoneMapPanel.tsx already use — DEFAULT_CENTER/
  // DEFAULT_ZOOM imported directly from FlowMapPanel.tsx (not redefined
  // here), so UGRC's real regional styling is visible immediately without
  // a manual zoom-in, and every catalog entry is compared at the same,
  // consistent extent. `interactive: false` is kept (the preview is
  // deliberately not a free-roam map), but MapLibre's `interactive`
  // option only disables the MAP's own drag/scroll/keyboard handlers —
  // NavigationControl's buttons call map.zoomIn()/zoomOut()/
  // resetNorthPitch() directly and are unaffected, so a viewer can still
  // zoom in for a closer look or reset rotation via the control itself.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: previewContainerRef.current!,
      style: freshBlankStyle(),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      interactive: false,
      // Same first-class-library-control discipline FlowMapPanel.tsx/
      // ZoneMapPanel.tsx already established — MapLibre's own built-in
      // collapsing attribution, not custom UI.
      attributionControl: { compact: true },
    })
    // Same NavigationControl construction as FlowMapPanel.tsx/
    // ZoneMapPanel.tsx — visualizePitch: true makes the compass button
    // reset bearing AND pitch together in one click.
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }))
    mapRef.current = map
    map.on('load', () => setMapReady(true))
    window.__basemapPreviewTestMap = map

    return () => {
      map.remove()
      mapRef.current = null
      delete window.__basemapPreviewTestMap
    }
  }, [])

  // 024-settings-modal-visual-redesign (US2): a raster-provider selection
  // is no longer skipped here — research.md §1 confirmed loadBasemapStyle()
  // already has a working raster-resolution branch (built for Apply-time
  // use, resolveRasterProvider() -> an inline `type: 'raster'` style),
  // reached via the SAME resolvePresetName() call every vector-style entry
  // already goes through. Reversing 021-basemap-catalog-redesign's own
  // FR-008 ("no live preview for raster providers") needed removing this
  // effect's early-return bypass, not any new resolution logic (FR-004,
  // FR-005, FR-006, FR-008).
  //
  // T013 (021) — re-styles the ONE persistent map on every staged-selection
  // change via setStyle(), never recreates it — the same shape
  // FlowMapPanel.tsx/ZoneMapPanel.tsx's own basemap-application effects
  // already use (generation counter + AbortController guarding against a
  // stale/superseded invocation).
  //
  // previewError (FR-007) — loadBasemapStyle() itself has a fail-soft "any
  // non-abort failure -> BLANK_STYLE" contract (research.md §1) — correct
  // for a real panel (011's own FR-010) but not expressive enough for a
  // preview surface whose whole job is showing the viewer whether a
  // selection actually works. A raster source's tiles failing to load
  // surfaces as a MapLibre 'error' event carrying that source's own id —
  // scoped to raster selections only (checked via the SAME
  // isRasterProviderSelection() this effect used to gate on) and to the
  // CURRENT generation, so a stale listener from a superseded selection
  // can never flip the CURRENT selection's error state. The vector-style
  // preview path is completely unchanged by this addition.
  //
  // A real, confirmed MapLibre-internal nondeterminism, found empirically
  // (not merely anticipated) while testing this against a genuinely
  // unreachable provider: MapLibre's own SourceCache can self-abort an
  // in-flight raster tile request (`tile.aborted = true`, e.g. when its
  // own tile-retain-set is recomputed) — a self-aborted tile resolves
  // silently and NEVER reaches the code path that fires a map 'error'
  // event at all (confirmed by reading SourceCache's own `_loadTile`:
  // `catch (err) { ...; if (err.status !== 404) this._source.fire(new
  // ErrorEvent(...)) }` is simply never reached for a tile whose own
  // promise resolved instead of rejecting). Observed directly: with every
  // tile request genuinely failing at the network layer (confirmed via
  // Playwright's own requestfailed events), the map's 'error' event still
  // did not fire on a meaningful fraction of runs. A bounded timeout that
  // treats "no tile for this source ever finished loading" as a failure
  // closes this gap without depending on 'error' alone — tracked via the
  // map's own 'data' event (dataType: 'source', tile.state === 'loaded'),
  // cleared the moment a real success is observed.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const myGeneration = ++basemapGenerationRef.current
    const controller = new AbortController()
    const map = mapRef.current
    setPreviewError(false)

    // MapLibre's own 'error' event payload extends the browser's native
    // ErrorEvent shape (no maplibregl-namespaced type is exported for it —
    // confirmed directly against the installed package's .d.ts).
    let onSourceError: ((e: ErrorEvent) => void) | undefined
    let onSourceData: ((e: unknown) => void) | undefined
    let failureTimeout: ReturnType<typeof setTimeout> | undefined
    if (isRasterProviderSelection(stagedSelection)) {
      const flagFailure = () => {
        if (basemapGenerationRef.current !== myGeneration) return
        setPreviewError(true)
      }
      onSourceError = (e) => {
        // resolvePresetName()'s raster branch always names its source
        // "basemap" (loadBasemapStyle.ts) — scoping to it specifically
        // avoids reacting to an unrelated error from something else on
        // this map (there is nothing else today, but this is the same
        // discipline FlowMapPanel.tsx's own scoped 'error' listener uses).
        if ((e as unknown as { sourceId?: string }).sourceId === 'basemap') flagFailure()
      }
      map.on('error', onSourceError)

      onSourceData = (e) => {
        if (basemapGenerationRef.current !== myGeneration) return
        const event = e as { sourceId?: string; dataType?: string; tile?: { state?: string } }
        if (event.sourceId === 'basemap' && event.dataType === 'source' && event.tile?.state === 'loaded') {
          if (failureTimeout) clearTimeout(failureTimeout)
        }
      }
      map.on('data', onSourceData)

      failureTimeout = setTimeout(flagFailure, 4000)
    }

    loadBasemapStyle(stagedSelection, controller.signal)
      .then((resolved) => {
        if (basemapGenerationRef.current !== myGeneration || !mapRef.current) return
        mapRef.current.setStyle(resolved.kind === 'url' ? resolved.url : resolved.style)
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) throw e
      })

    return () => {
      controller.abort()
      if (failureTimeout) clearTimeout(failureTimeout)
      if (onSourceError) map.off('error', onSourceError)
      if (onSourceData) map.off('data', onSourceData)
    }
    // 041-protomaps-pmtiles-basemap: protomapsSource added — a source
    // becoming available/changing (deployer default resolving, or a
    // viewer committing/clearing their own override) must re-resolve an
    // already-staged `protomaps-*` selection immediately, with no
    // reload (contracts/basemap-tab-ui.md).
  }, [mapReady, stagedSelection, protomapsSource])

  // T015 — the Raster Tiles section's own async load status. The other
  // three sections need no equivalent state (their entries are
  // synchronous BUILT_IN_PRESETS keys).
  const [rasterStatus, setRasterStatus] = useState<RasterSectionStatus>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    listCuratedRasterProviders(controller.signal)
      .then((providers) => setRasterStatus({ kind: 'ready', providers }))
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setRasterStatus({ kind: 'error', message: 'Could not load raster tile providers.' })
      })
    return () => controller.abort()
  }, [])

  const stagedIsRaster = isRasterProviderSelection(stagedSelection)

  // 041-protomaps-pmtiles-basemap (FR-007, data-model.md E-2's
  // validation rule): before accepting a viewer-entered URL, confirm it
  // actually opens — the `pmtiles` client library's own real
  // getHeader() call is the natural, already-provided validation
  // surface, no hand-rolled byte-sniffing needed. A reachable-but-not-a-
  // valid-PMTiles-archive URL rejects the same way an unreachable one
  // does — both are "this source doesn't work," never a silent
  // fallback (contracts/basemap-tab-ui.md).
  async function handleCommitProtomapsOverride(e: FormEvent) {
    e.preventDefault()
    const url = protomapsOverrideDraft.trim()
    if (!url) return
    setProtomapsOverrideStatus({ kind: 'validating' })
    try {
      await new PMTiles(url).getHeader()
      setViewerPmtilesOverride(url)
      setProtomapsOverrideStatus({ kind: 'idle' })
      setProtomapsOverrideDraft('')
    } catch {
      setProtomapsOverrideStatus({
        kind: 'error',
        message: "Couldn't open this PMTiles source — check the URL and try again.",
      })
    }
  }

  function handleResetProtomapsOverride() {
    clearViewerPmtilesOverride()
    setProtomapsOverrideStatus({ kind: 'idle' })
    setProtomapsOverrideDraft('')
  }

  return (
    // UI polish pass: this component now owns its OWN internal scroll
    // split — settingsModal.tsx's Basemap TabsContent no longer sets
    // overflow-y-auto itself (unlike every other tab, which still relies
    // on that shared behavior unchanged). h-full so the fixed-height
    // ancestor chain (DialogContent -> Tabs -> TabsContent) actually
    // reaches this component; min-h-0 so the flex-1 scroll region below
    // can shrink correctly instead of forcing the whole tab to grow.
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* FIXED header block — preview map, description, and Apply never
          scroll, regardless of how long the sections list below gets. */}
      <div className="flex flex-shrink-0 flex-col gap-4">
        {/* T012/T016 — the ONE shared preview area, above the four sections.
            024-settings-modal-visual-redesign (US2): raster providers now
            render real tiles here just like every vector entry (FR-004/
            FR-008) — the placeholder that used to always show for a
            raster selection is gone; a failure message shows only when
            this selection's own tiles genuinely fail to load (FR-007). */}
        <div className="relative h-[220px] w-full overflow-hidden rounded-md border border-border">
          <div ref={previewContainerRef} className="h-full w-full" />
          {previewError && (
            <div
              data-testid="basemap-preview-error"
              className="absolute inset-0 flex items-center justify-center bg-muted p-4 text-center text-sm text-muted-foreground"
            >
              Couldn't load tiles for this raster provider.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Applies to every flowmap/zonemap panel that has no basemap configured by its own
            dashboard author.
          </p>
          {/* T018 — the ONLY call to setGlobalBasemap() in this component. */}
          <Button type="button" size="sm" onClick={() => setGlobalBasemap(stagedSelection)}>
            Apply
          </Button>
        </div>
      </div>

      {/* SCROLLABLE region — only the catalog sections scroll. scrollbar-thin
          — see tokens.css's own comment for why (a codebase-wide search
          found no existing custom scrollbar style to match, so this
          feature proposes one and applies it consistently, not just here). */}
      <div
        data-testid="basemap-sections-scroll"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-thin pr-1"
      >
        {/* T014 — UGRC Vector Tiles / CARTO Vector Tiles / OpenFreeMap.
            024-settings-modal-visual-redesign (US3) — REAL redesign, not
            the prior round's incremental border/color tweak on the same
            vertical button list. Grounded in two concrete sources:
            (1) 021's own research.md already named ArcGIS's real
            BasemapGallery widget as the closest comparable pattern for
            this exact problem — a flat grid of tiles, not an accordion,
            not a dropdown; (2) `gropaul/dash` (project-docs/PIPELINE.md's own
            on-record inspiration note) solves the adjacent "pick one view
            mode from several" problem with a real, installed
            `view-mode-picker.tsx`, fetched and read directly: a
            responsive `grid-cols-[repeat(auto-fit,minmax(_,1fr))]` of
            square-ish tiles (icon on top, label below), the SELECTED
            tile using the accent color pair, resting tiles using the
            card surface with muted text. That selected-state pairing
            (`bg-accent text-accent-foreground`) is not just borrowed —
            it's this app's OWN existing "active" convention already:
            `components/ui/tabs.tsx`'s `TabsTrigger` already uses
            `data-[state=active]:bg-accent
            data-[state=active]:text-accent-foreground` for the active
            Settings-modal tab, one file up from here. Reusing it for the
            staged basemap tile is consistency with this app's own
            language, not a new one borrowed wholesale from Dash.
            No thumbnail images exist or are implied (out of scope, per
            the original spec) — each tile gets a per-entry CATEGORY icon
            instead (Sun/Moon/Satellite/Mountain/Waves/Palette/Compass,
            see the `VectorEntry` interface's own comment) — an honest
            categorical cue, not a fabricated preview. Section headings
            keep the border-b/uppercase/muted treatment from the prior
            round — that part already worked and needed no further
            change. */}
        {SECTIONS.map((section) => (
          <div key={section.heading} className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-1.5 border-b border-border pb-1 font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <section.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {section.heading}
            </h3>
            <div
              className="grid grid-cols-[repeat(auto-fit,minmax(84px,1fr))] gap-2"
              role="radiogroup"
              aria-label={section.heading}
            >
              {section.entries.map((entry) => {
                const staged = stagedSelection === entry.name
                const EntryIcon = entry.icon
                return (
                  <button
                    key={entry.name}
                    type="button"
                    role="radio"
                    aria-checked={staged}
                    data-staged={staged || undefined}
                    onClick={() => setStagedSelection(entry.name)}
                    title={entry.recommended ? 'Recommended — the app default for unconfigured map panels' : undefined}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      staged
                        ? 'border-transparent bg-accent text-accent-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <EntryIcon className="h-5 w-5" aria-hidden="true" />
                    <span className="flex items-center gap-1">
                      {entry.label}
                      {entry.recommended && (
                        // Marks the entry matching registry.ts's APP_DEFAULT.
                        // text-primary keeps it legible on the resting
                        // (bg-card) AND staged (bg-accent) tile in both
                        // themes; the sr-only text carries the meaning for
                        // assistive tech (the accessible name becomes
                        // "Positron recommended default").
                        <>
                          <Star className="h-3 w-3 shrink-0 fill-current text-primary" aria-hidden="true" />
                          <span className="sr-only"> recommended default</span>
                        </>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* 041-protomaps-pmtiles-basemap: "Protomaps" — positioned
            directly above Raster Tiles, after the three vector sections
            above (spec.md FR-001). Not one more SECTIONS entry — unlike
            those three static sections, whether these 5 tiles are
            selectable at all depends on runtime state (is a PMTiles
            source currently configured?), a genuinely different
            rendering shape (contracts/basemap-tab-ui.md). */}
        <div className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 border-b border-border pb-1 font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Protomaps
          </h3>
          <div
            className="grid grid-cols-[repeat(auto-fit,minmax(84px,1fr))] gap-2"
            role="radiogroup"
            aria-label="Protomaps"
          >
            {PROTOMAPS_FLAVOR_NAMES.map((name) => {
              const { label, icon: EntryIcon } = PROTOMAPS_FLAVOR_LABEL_AND_ICON[name]
              const staged = stagedSelection === name
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={staged}
                  data-staged={staged || undefined}
                  disabled={!protomapsSource}
                  onClick={() => setStagedSelection(name)}
                  title={!protomapsSource ? 'No PMTiles source configured' : undefined}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card',
                    staged
                      ? 'border-transparent bg-accent text-accent-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted',
                  )}
                >
                  <EntryIcon className="h-5 w-5" aria-hidden="true" />
                  {label}
                </button>
              )
            })}
          </div>

          {/* FR-010 — clearly distinguishable from the error state below:
              this means "nothing is set up here at all," not "something
              is set up here and it's broken." */}
          {!protomapsSource && (
            <p className="text-sm text-muted-foreground" data-testid="protomaps-not-configured">
              No PMTiles source configured for this deployment.
            </p>
          )}
          {protomapsSource && (
            <p className="text-xs text-muted-foreground" data-testid="protomaps-source-status">
              {protomapsOverrideActive
                ? 'Using your own session-only PMTiles source.'
                : "Using this deployment's configured PMTiles source."}
            </p>
          )}

          {/* FR-006 — always visible/editable, even once a deployer
              default exists (a viewer may still override it for their
              own session, contracts/basemap-tab-ui.md); never persists
              beyond this session (state/protomapsSourceState.ts). */}
          <form
            onSubmit={handleCommitProtomapsOverride}
            className="flex flex-col gap-1.5 sm:flex-row sm:items-center"
          >
            <label htmlFor="protomaps-source-override" className="sr-only">
              PMTiles source URL
            </label>
            <input
              id="protomaps-source-override"
              type="text"
              placeholder="https://example.com/your-region.pmtiles"
              value={protomapsOverrideDraft}
              onChange={(e) => setProtomapsOverrideDraft(e.target.value)}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            />
            <div className="flex gap-1.5">
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={protomapsOverrideStatus.kind === 'validating' || protomapsOverrideDraft.trim().length === 0}
              >
                {protomapsOverrideStatus.kind === 'validating' ? 'Checking…' : 'Use this source'}
              </Button>
              {protomapsOverrideActive && (
                <Button type="button" size="sm" variant="ghost" onClick={handleResetProtomapsOverride}>
                  Reset to default
                </Button>
              )}
            </div>
          </form>
          {protomapsOverrideStatus.kind === 'error' && (
            <p role="alert" data-testid="protomaps-source-error" className="text-sm text-destructive">
              {protomapsOverrideStatus.message}
            </p>
          )}
        </div>

        {/* T015/T016/T017 — Raster Tiles: loading/error/empty/ready.
            Participates in the SAME stage-then-Apply flow as the sections
            above (FR-013) — it just never drives the live preview
            (FR-008). "Explore options" sits beside the heading itself
            (same flex row), not stacked below the dropdown. Heading
            treatment matches the other three sections above (US3) —
            same border-b/uppercase/muted convention, for one consistent
            section-heading style across all five sections. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-1">
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Raster Tiles
            </h3>
            <a
              href="https://leaflet-extras.github.io/leaflet-providers/preview/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              Explore options
            </a>
          </div>
          {rasterStatus.kind === 'loading' && (
            <div
              data-testid="raster-loading-skeleton"
              className="h-9 w-full animate-pulse rounded-md bg-muted"
            />
          )}
          {rasterStatus.kind === 'error' && <PanelErrorState message={rasterStatus.message} />}
          {rasterStatus.kind === 'ready' && rasterStatus.providers.length === 0 && (
            <PanelEmptyState icon={MapIcon} message="No raster tile providers available." />
          )}
          {rasterStatus.kind === 'ready' && rasterStatus.providers.length > 0 && (
            <select
              aria-label="Raster tile provider"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={stagedIsRaster ? stagedSelection : ''}
              onChange={(e) => setStagedSelection(e.target.value)}
            >
              <option value="" disabled>
                Select a raster provider…
              </option>
              {rasterStatus.providers.map((provider) =>
                provider.variants.length === 0 ? (
                  <option key={provider.name} value={provider.name}>
                    {provider.name}
                  </option>
                ) : (
                  <optgroup key={provider.name} label={provider.name}>
                    {provider.variants.map((variant) => (
                      <option key={variant} value={`${provider.name}.${variant}`}>
                        {variant}
                      </option>
                    ))}
                  </optgroup>
                ),
              )}
            </select>
          )}
        </div>
      </div>
    </div>
  )
}
