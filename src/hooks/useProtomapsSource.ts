import { getEffectiveProtomapsSource } from '@/state/protomapsSourceState'

/**
 * 041-protomaps-pmtiles-basemap, revised: the effective, deployer-only
 * Protomaps source. No longer reactive — state/protomapsSourceState.ts's
 * only remaining value is set exactly once at boot, before any component
 * calling this hook has mounted, so there is nothing left to subscribe to
 * (the removed viewer-override mechanism was the only thing that ever
 * changed after boot). Kept as a `useX` hook purely so its existing call
 * sites (FlowMapPanel.tsx/ZoneMapPanel.tsx/basemapTab.tsx) needed zero
 * changes.
 */
export function useProtomapsSource(): ReturnType<typeof getEffectiveProtomapsSource> {
  return getEffectiveProtomapsSource()
}
