import { useCallback, useRef, useSyncExternalStore } from 'react'

import { list, subscribe } from '@/state/appState'
import { mixHex } from '@/panels/chartColor'
import { alternativeOf, runKindOf } from '@/services/runResolution'
import { resolveDefaultScenarioColor, type ScenarioDisplay, type ScenarioDisplayMap } from '@/panels/scenarioDisplay'
import { useColorScheme } from '@/hooks/useColorScheme'
import { useColorblindSafePreference } from '@/hooks/useColorblindSafePreference'

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
  // 061-appearance-controls: the Appearance-tab "prefer colorblind-safe
  // palettes" toggle also affects this hook's own default-tier
  // resolution (resolveDefaultScenarioColor's 2nd parameter) — folded
  // into the same cache-invalidation check colorScheme already
  // participates in, for the identical reason (a value that affects the
  // resolved color must also affect when the memoized snapshot rebuilds).
  const colorblindSafe = useColorblindSafePreference()
  const cache = useRef<Map<string, ScenarioDisplay>>(new Map())
  const cachedColorScheme = useRef(colorScheme)
  const cachedColorblindSafe = useRef(colorblindSafe)

  const getSnapshot = useCallback(() => {
    const scenarios = list()
    const roundCounts = new Map<string, number>()
    for (const s of scenarios) if (runKindOf(s) === 'round') roundCounts.set(s.family ?? '', (roundCounts.get(s.family ?? '') ?? 0) + 1)
    const colorFor = (s: (typeof scenarios)[number], index: number): string => {
      if (s.colorOverride) return s.colorOverride
      if (runKindOf(s) === 'round') return roundColor(s.familyIndex ?? 1, roundCounts.get(s.family ?? '') ?? 1, colorScheme === 'dark')
      return resolveEffectiveDefault(index, colorblindSafe, colorScheme === 'dark')
    }
    const colorIndex = alternativeIndexes(scenarios)
    const prev = cache.current
    let changed =
      scenarios.length !== prev.size ||
      colorScheme !== cachedColorScheme.current ||
      colorblindSafe !== cachedColorblindSafe.current
    if (!changed) {
      scenarios.forEach((s) => {
        const index = colorIndex.get(s.name) ?? 0
        const prevEntry = prev.get(s.name)
        const color = colorFor(s, index)
        if (!prevEntry || prevEntry.label !== (s.label ?? s.displayName) || prevEntry.color !== color) {
          changed = true
        }
      })
    }
    if (changed) {
      const next = new Map<string, ScenarioDisplay>()
      scenarios.forEach((s) => {
        const index = colorIndex.get(s.name) ?? 0
        next.set(s.name, {
          label: s.label ?? s.displayName,
          color: colorFor(s, index),
        })
      })
      cache.current = next
      cachedColorScheme.current = colorScheme
      cachedColorblindSafe.current = colorblindSafe
    }
    return cache.current
  }, [colorScheme, colorblindSafe])

  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Calibration rounds use a sequential ramp, dim early rounds to the full accent last (01-visual-language.md 5.3). */
function roundColor(r: number, n: number, dark: boolean): string {
  const style = getComputedStyle(document.documentElement)
  const surface = style.getPropertyValue('--surface').trim() || '#ffffff'
  const c1 = style.getPropertyValue('--c-1').trim() || '#2fa598'
  const start = mixHex(surface, c1, dark ? 0.55 : 0.4)
  return mixHex(start, c1, n <= 1 ? 1 : (r - 1) / (n - 1))
}

/** The default-tier color for a scenario index, adapted to the active theme. */
function resolveEffectiveDefault(index: number, colorblindSafe: boolean, dark: boolean): string {
  return resolveDefaultScenarioColor(index, colorblindSafe, dark)
}

/** Default colors follow the alternative, not the run: Frequent transit keeps its color in every model year. */
function alternativeIndexes(scenarios: ReturnType<typeof list>): Map<string, number> {
  const order = new Map<string, number>()
  const byName = new Map<string, number>()
  for (const s of scenarios) {
    const alt = alternativeOf(s)
    // only independent scenarios take a palette slot; rounds, Observed and hidden runs do not shift the others
    // (a legacy pinned `observed` dataset, which has no manifest `kind`, keeps its slot as before)
    if (s.kind === 'observed' || runKindOf(s) === 'round' || runKindOf(s) === 'hidden') {
      byName.set(s.name, 0)
      continue
    }
    if (!order.has(alt)) order.set(alt, order.size)
    byName.set(s.name, order.get(alt)!)
  }
  return byName
}
