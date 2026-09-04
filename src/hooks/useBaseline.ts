import { useSyncExternalStore } from 'react'

import { getBaseline, subscribe } from '@/state/appState'

/**
 * Subscribes to appState's baseline designation (018-baseline-scenario-
 * designation), re-rendering only when the RESOLVED baseline scenario name
 * actually changes. Mirrors useActiveScenarios.ts's useSyncExternalStore-
 * over-subscribe() shape — but, unlike that hook, needs no memoized cache:
 * getBaseline() returns a primitive (string | undefined), which
 * useSyncExternalStore's default Object.is comparison already handles
 * correctly by value. useActiveScenarios() only needs its own cache because
 * getActive() builds a new ARRAY every call, and array identity would
 * differ on every render without one (research.md §7).
 */
export function useBaseline(): string | undefined {
  return useSyncExternalStore(subscribe, getBaseline)
}
