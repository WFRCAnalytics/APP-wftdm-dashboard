import { useSyncExternalStore } from 'react'

import { getMode, subscribe } from '@/state/themeState'

/**
 * UI polish pass (post-merge correction): subscribes appearanceTab.tsx to
 * the module-level theme mode instead of local React state, so the value
 * survives a Settings-tab switch/remount. Mirrors hooks/useGlobalBasemap.ts's
 * exact shape — no memoized cache needed: getMode() returns a primitive
 * (ThemeMode), which useSyncExternalStore's default Object.is comparison
 * already handles correctly by value.
 */
export function useThemeMode(): ReturnType<typeof getMode> {
  return useSyncExternalStore(subscribe, getMode)
}
