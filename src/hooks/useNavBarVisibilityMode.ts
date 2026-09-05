import { useSyncExternalStore } from 'react'

import { getNavBarVisibilityMode, subscribe } from '@/state/navBarVisibilityState'

/**
 * Subscribes to the viewer's Appearance-tab nav-bar visibility choice.
 * Mirrors hooks/useGlobalBasemap.ts's/hooks/useThemeMode.ts's exact shape —
 * no memoized cache needed: getNavBarVisibilityMode() returns a primitive
 * ('auto' | 'fixed'), which useSyncExternalStore's default Object.is
 * comparison already handles correctly by value.
 */
export function useNavBarVisibilityMode(): ReturnType<typeof getNavBarVisibilityMode> {
  return useSyncExternalStore(subscribe, getNavBarVisibilityMode)
}
