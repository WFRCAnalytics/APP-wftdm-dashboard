import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/panels/mapControls.css'
import { Landmark, Globe, Map as MapIcon, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  resolveBuiltInPreset,
  listCuratedRasterProviders,
  APP_DEFAULT,
  type CuratedRasterProvider,
} from '@/panels/basemap/registry'
import { loadBasemapStyle, freshBlankStyle } from '@/panels/basemap/loadBasemapStyle'
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/panels/FlowMapPanel'
import { useGlobalBasemap } from '@/hooks/useGlobalBasemap'
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
}

interface Section {
  heading: string
  icon: LucideIcon
  entries: VectorEntry[]
}

// Static, ordered catalog data (T011) — which preset names belong to
// which of the three vector sections, in what order, plus one small
// per-SECTION icon (not per-entry, never a thumbnail — research.md §4).
// What a selection actually LOOKS like is answered entirely by the
// shared preview area below, not by anything on the entry itself.
const SECTIONS: Section[] = [
  {
    heading: 'UGRC Vector Tiles',
    icon: Landmark,
    entries: [
      { name: 'ugrc-vector-lite', label: 'Vector Lite' },
      { name: 'ugrc-vector-hybrid', label: 'Vector Hybrid' },
      { name: 'ugrc-vector-outdoors', label: 'Vector Outdoors' },
    ],
  },
  {
    heading: 'CARTO Vector Tiles',
    icon: Globe,
    entries: [
      { name: 'carto-positron', label: 'Positron' },
      { name: 'carto-dark-matter', label: 'Dark Matter' },
      { name: 'carto-voyager', label: 'Voyager' },
    ],
  },
  {
    heading: 'OpenFreeMap',
    icon: MapIcon,
    entries: [
      { name: 'openfreemap-liberty', label: 'Liberty' },
      { name: 'openfreemap-bright', label: 'Bright' },
      { name: 'openfreemap-positron', label: 'Positron' },
      { name: 'openfreemap-dark', label: 'Dark' },
      { name: 'openfreemap-fiord', label: 'Fiord' },
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
function isRasterProviderSelection(name: BasemapPresetName): boolean {
  return resolveBuiltInPreset(name) === undefined
}

export function BasemapTab() {
  const appliedBasemap = useGlobalBasemap()
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

  // T013 — re-styles the ONE persistent map on every staged-selection
  // change via setStyle(), never recreates it — the same shape
  // FlowMapPanel.tsx/ZoneMapPanel.tsx's own basemap-application effects
  // already use (generation counter + AbortController guarding against a
  // stale/superseded invocation). Skipped entirely for a raster-provider
  // selection (FR-008/FR-013) — the render below shows a placeholder
  // message in that case instead of a stale or misleading render.
  useEffect(() => {
    if (!mapReady || !mapRef.current || isRasterProviderSelection(stagedSelection)) return
    const myGeneration = ++basemapGenerationRef.current
    const controller = new AbortController()

    loadBasemapStyle(stagedSelection, controller.signal)
      .then((resolved) => {
        if (basemapGenerationRef.current !== myGeneration || !mapRef.current) return
        mapRef.current.setStyle(resolved.kind === 'url' ? resolved.url : resolved.style)
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) throw e
      })

    return () => controller.abort()
  }, [mapReady, stagedSelection])

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
        {/* T012/T016 — the ONE shared preview area, above the four sections. */}
        <div className="relative h-[220px] w-full overflow-hidden rounded-md border border-border">
          <div ref={previewContainerRef} className="h-full w-full" />
          {stagedIsRaster && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted p-4 text-center text-sm text-muted-foreground">
              No live preview for raster providers — Apply to use it.
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
        {/* T014 — UGRC Vector Tiles / CARTO Vector Tiles / OpenFreeMap. */}
        {SECTIONS.map((section) => (
          <div key={section.heading} className="flex flex-col gap-1">
            <h3 className="flex items-center gap-1.5 font-heading text-sm font-semibold">
              <section.icon className="h-4 w-4" aria-hidden="true" />
              {section.heading}
            </h3>
            <div className="flex flex-col gap-1" role="radiogroup" aria-label={section.heading}>
              {section.entries.map((entry) => {
                const staged = stagedSelection === entry.name
                return (
                  <Button
                    key={entry.name}
                    type="button"
                    variant={staged ? 'secondary' : 'outline'}
                    size="sm"
                    className="justify-start"
                    role="radio"
                    aria-checked={staged}
                    data-staged={staged || undefined}
                    onClick={() => setStagedSelection(entry.name)}
                  >
                    {entry.label}
                  </Button>
                )
              })}
            </div>
          </div>
        ))}

        {/* T015/T016/T017 — Raster Tiles: loading/error/empty/ready.
            Participates in the SAME stage-then-Apply flow as the sections
            above (FR-013) — it just never drives the live preview
            (FR-008). "Explore options" sits beside the heading itself
            (same flex row), not stacked below the dropdown. */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading text-sm font-semibold">Raster Tiles</h3>
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
