import { useCallback, useRef, useSyncExternalStore } from 'react'

import { listByDisplayOrder, subscribe, type Scenario } from '@/state/appState'

/**
 * 020-settings-modal: the Settings modal's Scenarios tab needs to re-
 * render on ANY change to ANY scenario's full record — order, label,
 * path, status, pinned, active, source — not just the active-scenario
 * set (hooks/useActiveScenarios.ts) or the resolved baseline
 * (hooks/useBaseline.ts), neither of which changes for a label/order-only
 * mutation. A real bug found during this feature's own implementation:
 * scenariosTab.tsx originally relied on those two hooks alone, so calling
 * appState.setLabel()/moveScenario() never triggered a re-render at all
 * (both hooks' own content-filtered snapshots are unaffected by a
 * label/order change) — a viewer's edit would silently not appear until
 * some UNRELATED change (e.g. a scenario's status ticking over) happened
 * to force a re-render.
 *
 * Same useSyncExternalStore-with-a-memoized-cache shape
 * useActiveScenarios.ts/useFilterState.ts already establish — listByDisplayOrder()
 * builds a new array (and, for any mutated entry, a new object) on every
 * call, so an UNMEMOIZED snapshot would re-render on every single
 * appState notify() (or loop, per useFilterState.ts's own documented
 * reasoning) — replaced only when a scenario's own relevant fields
 * actually differ.
 */
export function useScenarioList(): Scenario[] {
  const cache = useRef<Scenario[]>([])

  const getSnapshot = useCallback(() => {
    // listByDisplayOrder() (like list()/getActive() before it) returns
    // LIVE Scenario object references — appState.ts's mutators
    // (setLabel/moveScenario/setStatus/...) all mutate a scenario's
    // fields IN PLACE on the same object stored in its Map, never
    // replacing it. A real, confirmed bug found while fixing this
    // component's own re-render gap (see this file's header comment):
    // caching `live` directly here would mean `cache.current[i]` and a
    // later `live[i]` are THE SAME object once mutated — comparing
    // `s.label !== p.label` then compares a mutated property against
    // itself, always equal, defeating this very memoization. `cache.current`
    // below therefore holds shallow-copied SNAPSHOTS, not live references,
    // so a prior snapshot's field values stay frozen at their old values
    // for this comparison to actually see a difference.
    const live = listByDisplayOrder()
    const prev = cache.current
    const changed =
      live.length !== prev.length ||
      live.some((s, i) => {
        const p = prev[i]
        return (
          !p ||
          s.name !== p.name ||
          s.order !== p.order ||
          s.label !== p.label ||
          // 035-scenario-label-color: a real, confirmed gap found while
          // wiring up the new swatch control — this comparison omitted
          // colorOverride entirely, meaning appState.setColorOverride()
          // would notify() but this hook's own memoized snapshot saw no
          // "relevant field changed" and returned the STALE cached
          // scenario object, so the swatch's own `value` never reflected
          // the color it had just been set to. Same class of bug this
          // file's own header comment already documents for label/order.
          s.colorOverride !== p.colorOverride ||
          s.status !== p.status ||
          s.path !== p.path ||
          s.pinned !== p.pinned ||
          s.active !== p.active ||
          s.source !== p.source
        )
      })
    if (changed) cache.current = live.map((s) => ({ ...s }))
    return cache.current
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot)
}
