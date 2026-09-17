import { useSyncExternalStore } from 'react'

import { getColorblindSafe, subscribe } from '@/state/colorPreferenceState'

/**
 * 061-appearance-controls — mirrors hooks/useThemeMode.ts's exact shape:
 * no memoized cache needed, since getColorblindSafe() returns a
 * primitive (boolean), which useSyncExternalStore's default Object.is
 * comparison already handles correctly by value.
 */
export function useColorblindSafePreference(): boolean {
  return useSyncExternalStore(subscribe, getColorblindSafe)
}
