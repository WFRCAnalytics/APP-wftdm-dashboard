// The chart kinds a `type: chart` panel can draw (project-docs/redesign/04-chart-catalogue.md). Each is loaded on
// first use, so a dashboard only fetches the drawing code of the kinds it shows.
import type { ChartKind } from '@/charts/types'

type Loader = () => Promise<{ default: ChartKind }>

export const KINDS: Record<string, Loader> = {
  'mode-bars': () => import('@/charts/kinds/modeBars'),
}

const loaded = new Map<string, Promise<ChartKind>>()

/** Loads a kind by name; rejects with a clear message for an unknown kind. */
export function loadKind(name: string): Promise<ChartKind> {
  const loader = KINDS[name]
  if (!loader) return Promise.reject(new Error(`Unknown chart kind "${name}" (known: ${Object.keys(KINDS).join(', ')})`))
  let p = loaded.get(name)
  if (!p) {
    p = loader().then((m) => m.default)
    loaded.set(name, p)
  }
  return p
}
