import { useCallback, useRef, useSyncExternalStore } from 'react'

import { list, subscribe } from '@/state/appState'
import { resolveDefaultScenarioColor, type ScenarioDisplay, type ScenarioDisplayMap } from '@/panels/scenarioDisplay'
import { useColorScheme } from '@/hooks/useColorScheme'

// 035-scenario-label-color — mirrors hooks/useActiveScenarios.ts's own
// memoized-snapshot-over-useSyncExternalStore shape exactly (same reason:
// building a fresh Map every call, like getActive()'s fresh array, would
// otherwise fail useSyncExternalStore's Object.is snapshot comparison on
// every render and loop). Every registered scenario gets an entry, not
// just active ones — data-model.md §3: a comparison: diff panel or a
// just-deactivated scenario still lingering in a panel's last-fetched
// rows should keep resolving correctly through a mid-transition render,
// rather than silently falling back to the raw name/no color.
//
// 036-scenario-color-picker (Part A) — the one surgical change: the
// manifest-color fallback (`s.color`) is replaced by
// resolveDefaultScenarioColor(index) (deployer-configured, else this
// app's own shipped --chart-1..5 default), cycled by each scenario's
// stable position in `scenarios` (the SAME array both loops below
// iterate, so the index is consistent between the "did anything change"
// check and the actual rebuild). A DEFAULT_PALETTE entry is a literal
// `var(--chart-N)` REFERENCE string, not yet a concrete color —
// resolveEffectiveDefault() below resolves it via getComputedStyle()
// against document.documentElement (the same element Tailwind's `.dark`
// class toggles onto, per useColorScheme.ts's own established
// convention), since panels/scenarioDisplay.ts itself must stay
// DOM-free/Vitest-safe and cannot do this resolution on its own
// (research.md §4).
//
// That resolution is only ever CORRECT for the theme active at the
// moment it runs — a pure getComputedStyle() call doesn't itself notice
// a LATER theme flip. useColorScheme() is called here specifically so
// this hook's own consuming component re-renders on every real theme
// change (that hook's own independent useSyncExternalStore forces it),
// and `colorScheme` is folded into the cache-invalidation check below
// so THIS hook's snapshot is rebuilt — with a freshly-resolved concrete
// value — on that same render pass, not left stale until some unrelated
// appState change happens to force a rebuild (research.md §4's full
// finding).
export function useScenarioDisplay(): ScenarioDisplayMap {
  const colorScheme = useColorScheme()
  const cache = useRef<Map<string, ScenarioDisplay>>(new Map())
  const cachedColorScheme = useRef(colorScheme)

  const getSnapshot = useCallback(() => {
    const scenarios = list()
    const prev = cache.current
    let changed = scenarios.length !== prev.size || colorScheme !== cachedColorScheme.current
    if (!changed) {
      scenarios.forEach((s, index) => {
        const prevEntry = prev.get(s.name)
        const color = s.colorOverride ?? resolveEffectiveDefault(index)
        if (!prevEntry || prevEntry.label !== s.label || prevEntry.color !== color) {
          changed = true
        }
      })
    }
    if (changed) {
      const next = new Map<string, ScenarioDisplay>()
      scenarios.forEach((s, index) => {
        next.set(s.name, { label: s.label, color: s.colorOverride ?? resolveEffectiveDefault(index) })
      })
      cache.current = next
      cachedColorScheme.current = colorScheme
    }
    return cache.current
  }, [colorScheme])

  return useSyncExternalStore(subscribe, getSnapshot)
}

/** var(--x) -> a real, concrete getComputedStyle() value; anything else
 * (a deployer's own literal hex/rgb/named color) passes through as-is. */
function resolveEffectiveDefault(index: number): string {
  const raw = resolveDefaultScenarioColor(index)
  if (!raw.startsWith('var(')) return raw
  const tokenName = raw.slice(4, -1)
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim()
}
