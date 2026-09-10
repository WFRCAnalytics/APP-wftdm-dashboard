# Contract: `useColorScheme`, `dashboardRenderer.tsx`, `FlowMapPanel.tsx`

Full-body code for the new hook and the two modified files' relevant
sections. `FlowMapPanel.tsx`'s data-fetch effect and render/return JSX are
unchanged from `010-flowmap-panel`'s own contract — only the map-creation
effect (adds the `'error'` listener) and a **new**, third effect (basemap
style application) are shown in full; the unchanged data-fetch/data-update
effects are elided with a comment marker rather than reproduced verbatim a
second time.

## `src/hooks/useColorScheme.ts` (NEW)

```ts
// 011-basemap-style-system: reads whichever light/dark theme is currently
// active by observing document.documentElement's Tailwind `.dark` class
// (tailwind.config.js: darkMode: ['class']) — does NOT control theme, only
// reads it, since no real theme-toggle UI exists in the app yet
// (research.md §3; the only place `.dark` is toggled today is
// src/demo/DesignTokenDemo.tsx, a deliberately out-of-band demo page).
// Same useSyncExternalStore external-store shape as useFilterState.ts/
// useActiveScenarios.ts — no bespoke subscription plumbing.
import { useSyncExternalStore } from 'react'

export type ColorScheme = 'light' | 'dark'

function getSnapshot(): ColorScheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.attributeName === 'class')) onChange()
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, getSnapshot)
}
```

## `src/layout/dashboardRenderer.tsx` (MODIFIED)

```tsx
import { PanelCard } from '@/layout/panelCard'
import { useColorScheme } from '@/hooks/useColorScheme'
import { isMapRenderingPanel, type DashboardTabConfig, type PanelConfig } from '@/layout/types'

// Renders one active tab's layout (project-docs/GRAMMAR.md: named rows, each a
// flat list of panels) as ordered rows of PanelCards, each sized by its
// width fraction (0.0-1.0) within its own row.
//
// 011-basemap-style-system: also the one place that injects each
// map-rendering panel's tab-level default_basemap (FR-005) onto its own
// config object as _tabDefaultBasemap, BEFORE that panel ever renders —
// see data-model.md's MapRenderingPanelConfig note for why this keeps the
// panel pattern's "single config prop" contract intact instead of adding
// a second prop to PanelCard/every panel component. Subscribing to
// useColorScheme() HERE (not inside FlowMapPanel itself) is what makes a
// live theme change flow through React's ordinary prop-change mechanism:
// DashboardRenderer re-renders on a theme flip, rebuilds every panel's
// config object fresh (same object-construction path as any other
// render), and FlowMapPanel's own basemap-application effect picks up the
// change via its config-derived dependency — no second, redundant
// MutationObserver subscription per map panel instance.
//
// CSS Grid, not flexbox, for the row track sizing — unchanged from
// 003-dashboard-shell-navigation (flexbox's percentage flex-basis doesn't
// account for `gap`; Grid's `fr` units are gap-aware by design).
export function DashboardRenderer({ tab }: { tab: DashboardTabConfig }) {
  const rows = Object.entries(tab.layout)
  const colorScheme = useColorScheme()

  function withTabDefaultBasemap(panel: PanelConfig): PanelConfig {
    if (!isMapRenderingPanel(panel)) return panel
    return { ...panel, _tabDefaultBasemap: tab.default_basemap }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {rows.map(([rowName, panels]) => (
        <div
          key={rowName}
          className="grid gap-6"
          style={{
            gridTemplateColumns: panels.map((p) => `${(p.width ?? 1) * 100}fr`).join(' '),
          }}
        >
          {panels.map((panel, index) => (
            <div key={`${rowName}-${index}`} className="min-w-0">
              <PanelCard config={withTabDefaultBasemap(panel)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

**Why `colorScheme` isn't threaded into `withTabDefaultBasemap`'s output
directly** (e.g. as `_resolvedColorScheme` on the config): `resolveEffectiveBasemap`
still needs `theme` as its own explicit input either way, and
`FlowMapPanel` already needs a live `useColorScheme()` subscription of its
own regardless — for the `map.on('error')` fallback path (research.md
§7), which has nothing to do with `DashboardRenderer`'s re-render cycle,
and for correctness if `FlowMapPanel` is ever rendered outside
`DashboardRenderer` in a future test harness. Passing theme through the
config object as well would be a second, redundant channel for the same
value — `FlowMapPanel` reads `useColorScheme()` directly instead.

## `src/panels/FlowMapPanel.tsx` (MODIFIED)

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
const DEFAULT_CENTER: [number, number] = [-111.89, 40.76]
const DEFAULT_ZOOM = 9

declare global {
  interface Window {
    __flowmapTestMapReadyDelayMs?: number
    __flowmapTestMaps?: Record<string, maplibregl.Map>
    __flowmapTestOverlays?: Record<string, MapboxOverlay>   // NEW (data-model.md)
  }
}

export function FlowMapPanel({ config }: { config: FlowMapPanelConfig }) {
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  const activeScenarioNames = useActiveScenarios()
  const colorScheme = useColorScheme()                       // NEW
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const renderCountRef = useRef(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [mapReady, setMapReady] = useState(false)

  // ---- Data fetch effect — UNCHANGED from 010-flowmap-panel's own
  // contract (query(buildPanelQuery(...)) -> setRows/setStatus). Elided
  // here; see contracts/flowmap-panel.md (010) for the full body. ----

  // Mount-only: create the maplibregl.Map + MapboxOverlay exactly once.
  // MODIFIED — adds the map.on('error', ...) fallback listener
  // (research.md §7); everything else unchanged from 010's contract.
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
    window.__flowmapTestOverlays ??= {}          // NEW
    window.__flowmapTestOverlays[config.title] = overlay // NEW

    // FR-010/research.md §7 — a style-load failure surfaces as a
    // maplibregl 'error' event, not a rejected promise (setStyle(url)
    // resolves the fetch internally). Any error while a non-blank style
    // was in flight falls back to BLANK_STYLE directly — coarse by
    // design, matching FR-010's "fails to load" framing rather than
    // enumerating every possible MapLibre error cause.
    map.on('error', () => {
      if (JSON.stringify(map.getStyle()) !== JSON.stringify(BLANK_STYLE)) {
        map.setStyle(BLANK_STYLE)
      }
    })

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize()
    })
    observer.observe(el)

    const delay = window.__flowmapTestMapReadyDelayMs ?? 0
    const readyTimer = window.setTimeout(() => setMapReady(true), delay)

    return () => {
      window.clearTimeout(readyTimer)
      observer.disconnect()
      delete window.__flowmapTestMaps?.[config.title]
      delete window.__flowmapTestOverlays?.[config.title]  // NEW
      overlayRef.current = null
      mapRef.current = null
      map.remove()
    }
  }, [])

  // NEW — basemap style application. Deliberately its own effect, not
  // folded into the mount-only effect above (a style CHANGE, unlike map
  // creation, must be able to re-run many times over the map's lifetime)
  // and not folded into the data-update effect below (a basemap change is
  // independent of query/data state — resolving them in the same effect
  // would make an unrelated data refresh redundantly reapply the style,
  // and vice versa). Keyed on basemapKey(...), NOT on colorScheme or
  // config.basemap directly — research.md §2's core mechanism: an
  // explicit pin resolves to the SAME key across a theme flip, so this
  // effect correctly does NOT re-run for it, while the no-config
  // app-default case resolves to a DIFFERENT key per theme, so it does.
  const effectiveBasemap = resolveEffectiveBasemap(config.basemap, config._tabDefaultBasemap, colorScheme)
  const key = basemapKey(effectiveBasemap.selection)

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    let cancelled = false

    loadBasemapStyle(effectiveBasemap.selection).then((resolved) => {
      if (cancelled || !mapRef.current) return
      const styleArg = resolved.kind === 'url' ? resolved.url : resolved.style
      // transformStyle — reused directly from APP-WFRC-Commute-Patterns'
      // own real, production setStyle() call (research.md §1), not
      // re-derived: preserves this project's own future custom
      // MapLibre-native layers (e.g. a later zonemap's choropleth fill)
      // across the swap by carrying forward any previous-style layer id
      // the new style doesn't already have. No-op today (FlowMapPanel
      // adds no MapLibre-native layers of its own — only the deck.gl
      // overlay, which research.md §1 confirms lives outside this
      // mechanism entirely), but the right default to establish now
      // rather than retrofit once zonemap needs it.
      mapRef.current.setStyle(styleArg, {
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

    return () => {
      cancelled = true
    }
  }, [key, mapReady])

  // ---- Data update effect — UNCHANGED from 010-flowmap-panel's own
  // contract (buildFlowmapData -> new FlowmapLayer(...) -> overlayRef
  // .current.setProps({ layers: [layer] })). Elided here; see
  // contracts/flowmap-panel.md (010) for the full body. Confirmed by
  // research.md §1's empirical test to remain unaffected by the basemap
  // effect above running independently — same overlay instance,
  // untouched by map.setStyle() in non-interleaved mode. ----

  // ---- Render/return JSX — UNCHANGED from 010's own contract. ----
}
```

**Why `effectiveBasemap`/`key` are computed in the render body, not inside
the effect**: `resolveEffectiveBasemap` is pure and cheap (no I/O — it's
`loadBasemapStyle` that does the actual async work, correctly kept inside
the effect). Computing the key at render time is what lets it be used
directly in the dependency array without a second `useMemo` — the same
"parsed config referencing is already stable, `useMemo` would be
defensive-not-needed" reasoning `CLAUDE.md`'s own Panel pattern section
already documents for `ALL_FILTERS`.
