import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/panels/mapControls.css'
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
  Contrast,
  CircleDashed,
  type LucideIcon,
} from 'lucide-react'

import { GroupHeading, PillButton, TabHeader } from '@/layout/settings/settingsParts'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
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
      { name: 'ugrc-vector-dark', label: 'Vector Dark', icon: Moon },
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
  // 041-protomaps-pmtiles-basemap, revised — the effective Protomaps
  // source (self-hosted PMTiles or a hosted-API key), deployer-only, or
  // undefined. No viewer override exists anymore, so this is a plain
  // boot-time value, not a reactive one (hooks/useProtomapsSource.ts).
  const protomapsSource = useProtomapsSource()
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
  const effectiveApplied: BasemapPresetName = appliedBasemap ?? APP_DEFAULT
  const unchanged = stagedSelection === effectiveApplied

  return (
    // The tab fills the modal body: a fixed title, then two columns. The style cards on the left scroll on their own; the
    // preview card on the right never scrolls with them.
    <div className="flex h-full min-h-0 flex-col max-[1100px]:h-auto">
      <TabHeader title="Basemap">
        Choose the map underneath every zone map and flow map. Pick a style to preview it, then apply. Nothing changes until
        you apply.
      </TabHeader>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_310px] gap-5 max-[1100px]:grid-cols-1">
        <div
          data-testid="basemap-sections-scroll"
          className="scrollbar-thin flex min-h-0 flex-col overflow-y-auto pr-1 max-[1100px]:overflow-visible"
        >
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <GroupHeading>{section.heading}</GroupHeading>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5" role="radiogroup" aria-label={section.heading}>
                {section.entries.map((entry) => (
                  <StyleCard
                    key={entry.name}
                    name={entry.name}
                    label={entry.label}
                    icon={entry.icon}
                    staged={stagedSelection === entry.name}
                    inUse={effectiveApplied === entry.name}
                    recommended={entry.recommended}
                    onPick={() => setStagedSelection(entry.name)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Protomaps needs a configured PMTiles source; without one its styles stay disabled, as before. */}
          <div>
            <GroupHeading>Protomaps</GroupHeading>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5" role="radiogroup" aria-label="Protomaps">
              {PROTOMAPS_FLAVOR_NAMES.map((name) => {
                const { label, icon } = PROTOMAPS_FLAVOR_LABEL_AND_ICON[name]
                return (
                  <StyleCard
                    key={name}
                    name={name}
                    label={label}
                    icon={icon}
                    staged={stagedSelection === name}
                    inUse={effectiveApplied === name}
                    disabled={!protomapsSource}
                    note={!protomapsSource ? 'Needs a PMTiles source' : undefined}
                    onPick={() => setStagedSelection(name)}
                  />
                )
              })}
            </div>
            {!protomapsSource ? (
              <p className="mt-2 text-sm text-[var(--mute)]" data-testid="protomaps-not-configured">
                No Protomaps source configured for this deployment.
              </p>
            ) : (
              <p className="mt-2 text-xs text-[var(--mute)]" data-testid="protomaps-source-status">
                Using this deployment's configured Protomaps source.
              </p>
            )}
          </div>

          {/* Raster Tiles: loading / error / empty / ready; part of the same stage-then-Apply flow. */}
          <div className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <GroupHeading>Raster Tiles</GroupHeading>
              <a
                href="https://leaflet-extras.github.io/leaflet-providers/preview/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 rounded text-[12.5px] text-[var(--brand-text)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
              >
                Explore options
              </a>
            </div>
            {rasterStatus.kind === 'loading' && (
              <div data-testid="raster-loading-skeleton" className="h-9 w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
            )}
            {rasterStatus.kind === 'error' && <PanelErrorState message={rasterStatus.message} />}
            {rasterStatus.kind === 'ready' && rasterStatus.providers.length === 0 && (
              <PanelEmptyState icon={MapIcon} message="No raster tile providers available." />
            )}
            {rasterStatus.kind === 'ready' && rasterStatus.providers.length > 0 && (
              // The app's own Radix Select, not a native one: a native listbox is drawn by the OS with its own accent.
              <Select value={stagedIsRaster ? stagedSelection : undefined} onValueChange={(value) => setStagedSelection(value)}>
                <SelectTrigger aria-label="Raster tile provider" className="h-9 w-full">
                  <SelectValue placeholder="Select a raster provider…" />
                </SelectTrigger>
                <SelectContent>
                  {rasterStatus.providers.map((provider) =>
                    provider.variants.length === 0 ? (
                      <SelectItem key={provider.name} value={provider.name}>
                        {provider.name}
                      </SelectItem>
                    ) : (
                      <SelectGroup key={provider.name}>
                        <SelectLabel>{provider.name}</SelectLabel>
                        {provider.variants.map((variant) => (
                          <SelectItem key={variant} value={`${provider.name}.${variant}`}>
                            {variant}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ),
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--tile-hi)] max-[1100px]:order-first">
          <div className="relative min-h-[220px] w-full flex-1">
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
          <div className="shrink-0 px-3.5 py-3">
            <b className="block font-medium">{describeSelection(stagedSelection).name}</b>
            <small className="text-[var(--mute)]">{describeSelection(stagedSelection).group}</small>
            {isProtomapsFlavorName(stagedSelection) && !protomapsSource && (
              <p className="mt-2 text-[12.5px] text-[var(--warn)]">
                This style needs a PMTiles source in the deployment settings. Until one is set, it shows a blank map.
              </p>
            )}
            <p className="mt-2 text-xs text-[var(--mute)]">
              Applies to every flowmap/zonemap panel that has no basemap configured by its own dashboard author.
            </p>
            <div className="mt-3 flex gap-2">
              {/* The ONLY call to setGlobalBasemap() in this component. */}
              <PillButton primary disabled={unchanged} onClick={() => setGlobalBasemap(stagedSelection)}>
                Apply
              </PillButton>
              <PillButton disabled={unchanged} onClick={() => setStagedSelection(effectiveApplied)}>
                Revert
              </PillButton>
            </div>
            <small className="mt-2.5 block text-[var(--mute)]">Applied now: {describeSelection(effectiveApplied).name}</small>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** The display name and source group of a catalog selection, for the preview card. */
function describeSelection(name: BasemapPresetName): { name: string; group: string } {
  for (const section of SECTIONS) {
    const entry = section.entries.find((e) => e.name === name)
    if (entry) return { name: entry.label, group: `${section.heading} · vector` }
  }
  if (isProtomapsFlavorName(name)) {
    return { name: PROTOMAPS_FLAVOR_LABEL_AND_ICON[name].label, group: 'Protomaps · vector' }
  }
  return { name, group: 'Raster Tiles · raster' }
}

const DARK_STYLE = /dark|black|fiord|matter/i

interface StyleCardProps {
  name: BasemapPresetName
  label: string
  icon: LucideIcon
  staged: boolean
  inUse: boolean
  recommended?: boolean
  disabled?: boolean
  note?: string
  onPick: () => void
}

// One style card: a 48px thumbnail area (a tint matching the style's brightness and its category icon; the styles have no
// bundled preview images), the name, and optional captions. A radio of its section's radiogroup.
function StyleCard({ name, label, icon: Icon, staged, inUse, recommended, disabled, note, onPick }: StyleCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={staged}
      data-staged={staged || undefined}
      disabled={disabled}
      onClick={onPick}
      title={disabled ? 'No Protomaps source configured' : recommended ? 'Recommended: the app default for unconfigured map panels' : undefined}
      className={cn(
        'flex flex-col items-stretch justify-start overflow-hidden rounded-[12px] border-2 bg-[var(--tile-hi)] p-0 text-left shadow-[0_0_0_1px_var(--line)] transition-colors motion-reduce:transition-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        staged
          ? 'border-[var(--brand-text)]'
          : 'border-transparent hover:bg-[color-mix(in_srgb,var(--ink)_6%,var(--tile-hi))] disabled:hover:bg-[var(--tile-hi)]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-[48px] w-full shrink-0 items-center justify-center',
          DARK_STYLE.test(name)
            ? 'bg-[linear-gradient(135deg,#2c3644,#1a212b)] text-[#9fb0c4]'
            : 'bg-[linear-gradient(135deg,#eef2f6,#d6dee8)] text-[#5b6b80]',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex items-center gap-1 px-2.5 py-[7px] text-[12.5px]">
        {label}
        {recommended && (
          <>
            <Star className="h-3 w-3 shrink-0 fill-current text-[var(--brand-text)]" aria-hidden="true" />
            <span className="sr-only"> recommended default</span>
          </>
        )}
      </span>
      {note && <small className="-mt-1 block px-2.5 pb-[7px] text-[11px] text-[var(--warn)]">{note}</small>}
      {inUse && <small className="-mt-1 block px-2.5 pb-[7px] text-[11px] text-[var(--brand-text)]">In use</small>}
    </button>
  )
}
