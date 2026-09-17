import { useCallback, useRef, useSyncExternalStore } from 'react'

import { getFont, subscribe, type FontRole } from '@/state/fontPreferenceState'

export type FontPreferenceMap = Record<FontRole, string | undefined>

function snapshot(): FontPreferenceMap {
  return { body: getFont('body'), heading: getFont('heading'), mono: getFont('mono') }
}

/**
 * 061-appearance-controls — mirrors hooks/useInterfaceColors.ts's own
 * useSyncExternalStore + memoized-ref-cache shape: snapshot() builds a
 * new object every call, so an unmemoized snapshot would fail
 * useSyncExternalStore's Object.is comparison on every render (or loop).
 * Returns all three roles together (a plain object) since
 * appearanceTab.tsx renders all three pickers side by side.
 */
export function useFontPreference(): FontPreferenceMap {
  const cache = useRef<FontPreferenceMap>(snapshot())

  const getSnapshot = useCallback(() => {
    const next = snapshot()
    const prev = cache.current
    if (next.body !== prev.body || next.heading !== prev.heading || next.mono !== prev.mono) {
      cache.current = next
    }
    return cache.current
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot)
}
