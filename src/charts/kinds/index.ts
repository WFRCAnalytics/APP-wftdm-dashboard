// The chart kinds a `type: chart` panel can draw (project-docs/redesign/04-chart-catalogue.md). Every module in this
// folder (except this file) is one kind, named from its file name in kebab case (`modeBars.ts` is `mode-bars`) and
// loaded on first use, so a dashboard only fetches the drawing code of the kinds it shows. Shared helpers belong in
// src/charts/lib, not here.
import type { ChartKind } from '@/charts/types'

type Loader = () => Promise<{ default: ChartKind }>

const modules = import.meta.glob<{ default: ChartKind }>(['./*.ts', '!./index.ts'])

export const kindName = (path: string): string =>
  path
    .replace(/^\.\//, '')
    .replace(/\.ts$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()

export const KINDS: Record<string, Loader> = Object.fromEntries(Object.entries(modules).map(([path, load]) => [kindName(path), load as Loader]))

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
