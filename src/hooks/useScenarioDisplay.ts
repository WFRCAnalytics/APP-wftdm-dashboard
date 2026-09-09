import { useCallback, useRef, useSyncExternalStore } from 'react'

import { list, subscribe } from '@/state/appState'
import type { ScenarioDisplay, ScenarioDisplayMap } from '@/panels/scenarioDisplay'

// 035-scenario-label-color — mirrors hooks/useActiveScenarios.ts's own
// memoized-snapshot-over-useSyncExternalStore shape exactly (same reason:
// building a fresh Map every call, like getActive()'s fresh array, would
// otherwise fail useSyncExternalStore's Object.is snapshot comparison on
// every render and loop). Every registered scenario gets an entry, not
// just active ones — data-model.md §3: a comparison: diff panel or a
// just-deactivated scenario still lingering in a panel's last-fetched
// rows should keep resolving correctly through a mid-transition render,
// rather than silently falling back to the raw name/no color.
export function useScenarioDisplay(): ScenarioDisplayMap {
  const cache = useRef<Map<string, ScenarioDisplay>>(new Map())

  const getSnapshot = useCallback(() => {
    const scenarios = list()
    const prev = cache.current
    let changed = scenarios.length !== prev.size
    if (!changed) {
      for (const s of scenarios) {
        const prevEntry = prev.get(s.name)
        const color = s.colorOverride ?? s.color
        if (!prevEntry || prevEntry.label !== s.label || prevEntry.color !== color) {
          changed = true
          break
        }
      }
    }
    if (changed) {
      const next = new Map<string, ScenarioDisplay>()
      for (const s of scenarios) {
        next.set(s.name, { label: s.label, color: s.colorOverride ?? s.color })
      }
      cache.current = next
    }
    return cache.current
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot)
}
