import { useSyncExternalStore } from 'react'

import { subscribe as subscribeApp } from '@/state/appState'
import { subscribe as subscribeCompare } from '@/state/compareState'
import { getBaselineForYear } from '@/services/runResolution'

function subscribe(fn: () => void): () => void {
  const a = subscribeApp(fn)
  const b = subscribeCompare(fn)
  return () => {
    a()
    b()
  }
}

/**
 * Subscribes to the resolved baseline run: appState's baseline designation (018-baseline-scenario-designation),
 * mapped to that scenario group's run for the current model year. getBaselineForYear() returns a primitive
 * (string | undefined), which useSyncExternalStore's default Object.is comparison handles by value, so no
 * memoized cache is needed here.
 */
export function useBaseline(): string | undefined {
  return useSyncExternalStore(subscribe, getBaselineForYear)
}
