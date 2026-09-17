import { useSyncExternalStore } from 'react'

import { getScale, subscribe } from '@/state/textSizeState'

/**
 * 061-appearance-controls — mirrors hooks/useThemeMode.ts's exact shape:
 * no memoized cache needed, since getScale() returns a primitive
 * (number), which useSyncExternalStore's default Object.is comparison
 * already handles correctly by value.
 */
export function useTextSize(): number {
  return useSyncExternalStore(subscribe, getScale)
}
