import { useCallback, useRef, useSyncExternalStore } from 'react'

import { getActive, subscribe } from '@/state/appState'

/**
 * Subscribes to appState's active-scenario set and returns the current
 * list of active scenario names, re-rendering only when that list actually
 * changes (by content, not by getActive() call identity — it builds a new
 * array every call). Mirrors useFilterState.ts's exact memoized-snapshot-
 * over-useSyncExternalStore shape (009-scenario-manager research.md §1) —
 * deliberately the same pattern applied to a second store, not a new one.
 * No dedicated Vitest unit test — vitest.config.js's environment: 'node'
 * has no React renderer (same reason useFilterState.ts has none either);
 * verified via the Playwright suite's panel-level assertions instead.
 */
export function useActiveScenarios(): string[] {
  const cache = useRef<string[]>([])

  const getSnapshot = useCallback(() => {
    const next = getActive().map((s) => s.name)
    const prev = cache.current
    const changed = next.length !== prev.length || next.some((name, i) => name !== prev[i])
    if (changed) cache.current = next
    return cache.current
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot)
}
