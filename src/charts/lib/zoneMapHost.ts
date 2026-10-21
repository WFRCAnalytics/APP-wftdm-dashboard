// Plumbing common to the zone-map kinds: the per-panel host kept in `env.state` (so the MapLibre maps survive redraws),
// the lazy geometry load, the data rows, the Observed-reference fallback and cleanup in `destroy`.
import '@/charts/lib/mapChrome.css'
import { DEFAULT_RAIL_FILE, DEFAULT_ZONES_FILE, loadMapGeometry, type MapGeometry } from '@/charts/lib/mapGeometry'
import type { ZoneMap } from '@/charts/lib/zoneMapView'
import { num } from '@/charts/util'
import type { ChartEnv, ChartPlan } from '@/charts/types'
import { getBaselineForYear } from '@/services/runResolution'
import { getGlobalBasemap, subscribe as subscribeBasemap } from '@/state/basemapState'
import { getEffectiveProtomapsSource } from '@/state/protomapsSourceState'
import { tooltip } from '@/services/tooltip'

export const ZONE_TABLE = 'zone_transit_share'

declare global {
  interface Window {
    /** Test instrumentation: every live zone map (a Set, so a test can count live WebGL contexts). */
    __wfzMaps?: Set<ZoneMap>
  }
}

export interface ZoneRow {
  /** Fraction 0..1 as published. */
  share: number
  residents: number
}

export interface ZoneHost {
  /** Container for the maps and the chrome; attached to the chart element. */
  wrap: HTMLDivElement
  /** Overlay chrome (chips, controls, legend), rebuilt on every draw. */
  chrome: HTMLDivElement
  geo?: MapGeometry
  geoLoading: boolean
  geoError?: string
  destroyed: boolean
  /** The newest env, for handlers that outlive one draw. */
  env?: ChartEnv
  maps: ZoneMap[]
  selected: number | null
  unsubs: (() => void)[]
  /** Kind-specific persistent bits (swipe position, grid membership, ...). */
  extra: Record<string, unknown>
}

const KEY = '__zoneHost'

export function hostOf(state: Record<string, unknown>): ZoneHost {
  let h = state[KEY] as ZoneHost | undefined
  if (!h) {
    const wrap = document.createElement('div')
    wrap.className = 'wfz-root'
    const chrome = document.createElement('div')
    chrome.className = 'wfz-chrome'
    chrome.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:8'
    h = { wrap, chrome, geoLoading: false, destroyed: false, maps: [], selected: null, unsubs: [], extra: {} }
    state[KEY] = h
    window.__wfzMaps ??= new Set()
  }
  return h
}

/** Registers a live map for the test instrumentation. */
export function trackMap(map: ZoneMap): void {
  ;(window.__wfzMaps ??= new Set()).add(map)
}

export function untrackMap(map: ZoneMap): void {
  window.__wfzMaps?.delete(map)
}

/** Disposes every map of the host (the kind's `destroy`). */
export function destroyHost(state: Record<string, unknown>): void {
  const h = state[KEY] as ZoneHost | undefined
  if (!h) return
  h.destroyed = true
  for (const u of h.unsubs.splice(0)) u()
  for (const m of h.maps.splice(0)) {
    untrackMap(m)
    m.destroy()
  }
  h.wrap.remove()
  tooltip.hide()
  delete state[KEY]
}

/** A one-line message in place of the map (the map, if any, stays alive off-screen). */
export function showNote(el: HTMLElement, text: string): void {
  const p = document.createElement('p')
  p.textContent = text
  p.className = 'p-5 font-body text-sm text-[var(--mute)]'
  el.replaceChildren(p)
}

export function attach(el: HTMLElement, host: ZoneHost): void {
  if (host.wrap.parentElement !== el || el.children.length !== 1) el.replaceChildren(host.wrap)
}

function option(env: ChartPlan, key: string, fallback: string | null): string | null {
  const v = (env.config.options as Record<string, unknown> | undefined)?.[key] ?? (env.config as Record<string, unknown>)[key]
  if (v === null || v === false) return null
  return typeof v === 'string' && v ? v : fallback
}

/**
 * The zone and rail geometry when loaded; otherwise starts the load (once), shows a note and redraws when it arrives.
 * Returns null while there is nothing to draw.
 */
export function needGeometry(el: HTMLElement, env: ChartEnv, host: ZoneHost): MapGeometry | null {
  if (host.geo) return host.geo
  if (host.geoError) {
    showNote(el, host.geoError)
    return null
  }
  showNote(el, 'Loading the map…')
  if (!host.geoLoading) {
    host.geoLoading = true
    loadMapGeometry(option(env, 'boundaries', DEFAULT_ZONES_FILE) ?? DEFAULT_ZONES_FILE, option(env, 'rail', DEFAULT_RAIL_FILE)).then(
      (geo) => {
        host.geoLoading = false
        if (host.destroyed) return
        host.geo = geo
        host.env?.redraw()
      },
      (err: Error) => {
        console.error('zone map: failed to load the zone geometry', err)
        host.geoLoading = false
        if (host.destroyed) return
        host.geoError = "Couldn't load the zone boundaries."
        host.env?.redraw()
      },
    )
  }
  return null
}

/** Zone id to share/residents for one run. */
export function zoneRows(env: ChartEnv, run: string | undefined): Map<number, ZoneRow> {
  const out = new Map<number, ZoneRow>()
  if (!run) return out
  for (const r of env.data.rows(run, ZONE_TABLE)) {
    const id = num(r, 'taz_id')
    const share = num(r, 'transit_share')
    if (Number.isFinite(id) && Number.isFinite(share)) out.set(id, { share, residents: num(r, 'residents') })
  }
  return out
}

export interface ZoneReference {
  /** The run to compare with (undefined when there is none). */
  run: string | undefined
  label: string
  /** The chosen reference has no zone table (Observed), so the baseline stands in. */
  fellBack: boolean
}

/** The focus run of a plan: the pinned/only run, else the focus. */
export function focusRunOf(plan: ChartPlan): string | undefined {
  return plan.focus?.run ?? plan.scenarios[0]?.run
}

/**
 * The reference for a difference or swipe map. Observed carries no zone-level transit share, so with Observed as the
 * reference the baseline run for the year stands in and the caption says so (04-chart-catalogue.md entry 20).
 */
export function zoneReference(plan: ChartPlan): ZoneReference {
  const focus = focusRunOf(plan)
  const own = focus ? plan.refRunFor(focus) : undefined
  if (plan.reference.isObserved || (own !== undefined && own === plan.observedRun) || !own) {
    const base = getBaselineForYear()
    return { run: base, label: 'Baseline', fellBack: plan.reference.isObserved || own === plan.observedRun }
  }
  const label = plan.scenarios.find((s) => s.run === own)?.label ?? plan.reference.label
  return { run: own, label, fellBack: false }
}

/** Subscribes (once per host) to the viewer's Basemap choice so a change in Settings redraws the map. */
export function watchBasemap(host: ZoneHost): void {
  if (host.extra.watching) return
  host.extra.watching = true
  host.unsubs.push(subscribeBasemap(() => host.env?.redraw()))
}

/** Pushes the effective basemap into every map of the host. */
export function applyBasemaps(host: ZoneHost, env: ChartEnv): void {
  const key = JSON.stringify(getEffectiveProtomapsSource() ?? null)
  for (const m of host.maps) m.setBasemap(env.config, getGlobalBasemap(), key)
}

/** CSS for the map's legend gradient from a list of colours. */
export const gradient = (colors: string[]): string => `linear-gradient(90deg,${colors.join(',')})`
