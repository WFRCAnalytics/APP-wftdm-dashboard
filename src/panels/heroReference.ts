import { createContext, useContext } from 'react'

import { runNameFor } from '@/services/runResolution'
import type { ResolvedView } from '@/services/viewContext'

// The hero band names the reference once, above its cells (`hero.reference: band`, the default), so a cell shows only its
// delta. The band tells its cells through this context; a cell outside a band (or `hero.reference: cell`) keeps its caption.
export const HeroReferenceNamedContext = createContext(false)
export const useHeroReferenceNamed = () => useContext(HeroReferenceNamedContext)

/** The run a hero delta is measured against, or undefined when there is none (the same rule HeroKpi uses). */
export function heroReferenceRun(view: Pick<ResolvedView, 'focus' | 'referenceRun' | 'referenceKind' | 'baseYear'>): string | undefined {
  return view.referenceKind === 'self-base-year' ? runNameFor(view.focus, view.baseYear) : view.referenceRun
}
