import { useSyncExternalStore } from 'react'

import { getEffectivePmtilesSource, subscribe } from '@/state/protomapsSourceState'

/**
 * 041-protomaps-pmtiles-basemap: subscribes to the effective PMTiles
 * source (viewer override ?? deployer default), re-rendering only when
 * it actually changes. Mirrors hooks/useGlobalBasemap.ts's exact shape —
 * no memoized cache needed: getEffectivePmtilesSource() returns a
 * primitive (string | undefined), which useSyncExternalStore's default
 * Object.is comparison already handles correctly by value.
 *
 * Consumed by FlowMapPanel.tsx/ZoneMapPanel.tsx (alongside their existing
 * useGlobalBasemap() call, in the same basemap-application effect's
 * dependency array) and by layout/settings/basemapTab.tsx's own preview
 * map and Protomaps-section rendering — so a viewer setting/clearing a
 * session override, or the deployer default resolving at boot, reaches
 * an already-mounted map with no remount needed.
 */
export function useProtomapsSource(): ReturnType<typeof getEffectivePmtilesSource> {
  return useSyncExternalStore(subscribe, getEffectivePmtilesSource)
}
