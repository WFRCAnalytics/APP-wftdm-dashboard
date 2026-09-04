import { useSyncExternalStore } from 'react'

import { getGlobalBasemap, subscribe } from '@/state/basemapState'

/**
 * 020-settings-modal: subscribes to the viewer's global Basemap-tab pick,
 * re-rendering only when it actually changes. Mirrors hooks/useBaseline.ts's
 * exact shape — no memoized cache needed: getGlobalBasemap() returns a
 * primitive (BasemapPresetName | undefined), which useSyncExternalStore's
 * default Object.is comparison already handles correctly by value
 * (research.md §6).
 */
export function useGlobalBasemap(): ReturnType<typeof getGlobalBasemap> {
  return useSyncExternalStore(subscribe, getGlobalBasemap)
}
