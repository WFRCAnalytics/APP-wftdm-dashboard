import { useMemo, useSyncExternalStore } from 'react'

import * as appState from '@/state/appState'
import * as compareState from '@/state/compareState'
import { currentView } from '@/services/runResolution'
import type { ResolvedView } from '@/services/viewContext'

/** The resolved, immutable context every tile reads (project-docs/redesign/03-state-and-compare.md §2). */
export interface ViewContext extends ResolvedView {
  /** Click (or shift-click, `additive`) on a scenario or round in a chart: focus it, or toggle it in the compare set. */
  pickScenario(alternative: string, additive: boolean): void
  setYear(year: number): void
}

let cache: { key: string; view: ResolvedView } | undefined

// currentView() builds a new object every call; useSyncExternalStore compares by Object.is, so the snapshot is
// replaced only when its content changes.
function getSnapshot(): ResolvedView {
  const view = currentView()
  const key = JSON.stringify(view)
  if (cache?.key !== key) cache = { key, view }
  return cache.view
}

function subscribe(fn: () => void): () => void {
  const a = appState.subscribe(fn)
  const b = compareState.subscribe(fn)
  return () => {
    a()
    b()
  }
}

export function useResolvedView(): ResolvedView {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function useViewContext(): ViewContext {
  const view = useResolvedView()
  return useMemo(
    () => ({
      ...view,
      pickScenario: (alternative, additive) =>
        additive ? compareState.toggleCompareMember(alternative) : compareState.focusAlternative(alternative),
      setYear: compareState.setYear,
    }),
    [view],
  )
}
