// 041-protomaps-pmtiles-basemap: the shared PMTiles source configuration
// (data-model.md E-2) — two layers, precedence high -> low:
//   1. viewer session override (this module's own subscribe/notify state
//      — mirrors state/basemapState.ts's exact shape, since the Basemap
//      tab and any already-rendering map panel both need to reactively
//      pick up a change, the same reason useGlobalBasemap() exists)
//   2. deployer default (a plain module-level value, set exactly ONCE at
//      boot from main.tsx — mirrors panels/scenarioDisplay.ts's
//      setDeployerScenarioPalette() shape instead, since this value
//      never changes after boot and nothing needs to react to it
//      changing)
//
// The viewer override is deliberately NEVER written to localStorage/
// sessionStorage (Constitution Principle VI) — a plain in-memory module
// value already satisfies FR-006's "never persists beyond the current
// session" for free: a page reload clears it with no explicit cleanup
// (research.md R-4).

let deployerDefault: string | undefined
let viewerOverride: string | undefined

export type Subscriber = () => void
export type Unsubscribe = () => void

const subscribers = new Set<Subscriber>()

function notify(): void {
  for (const fn of subscribers) fn()
}

export function subscribe(fn: Subscriber): Unsubscribe {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

/** Called once, at boot, from main.tsx — the deployer-configured value
 * resolved from dashboard-config/index.json's protomapsPmtilesUrl field
 * (contracts/deployer-config.md), same real/demo-root precedence every
 * other DashboardBranding field already uses. Never called again after
 * boot, so it does NOT notify() — nothing has ever subscribed before
 * this runs, and calling it later would be a misuse of this API. */
export function setDeployerPmtilesUrl(url: string | undefined): void {
  deployerDefault = url
}

/** Set by a viewer via the Basemap tab's Protomaps-section override
 * field (contracts/basemap-tab-ui.md), only after the entered value has
 * been validated (data-model.md E-2's "MUST be confirmed openable"
 * rule) — this module performs no validation of its own. */
export function setViewerPmtilesOverride(url: string): void {
  viewerOverride = url
  notify()
}

export function clearViewerPmtilesOverride(): void {
  viewerOverride = undefined
  notify()
}

export function getViewerPmtilesOverride(): string | undefined {
  return viewerOverride
}

export function getDeployerPmtilesUrl(): string | undefined {
  return deployerDefault
}

/** viewer override ?? deployer default ?? undefined ("not configured",
 * FR-010). Returns a plain source URL/path, not a BasemapPresetName —
 * this is what feeds buildProtomapsStyle()'s pmtilesUrl argument, not a
 * preset selection. */
export function getEffectivePmtilesSource(): string | undefined {
  return viewerOverride ?? deployerDefault ?? undefined
}
