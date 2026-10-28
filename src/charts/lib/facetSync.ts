// Small pub/sub channels shared by the facets of one tile (the side-by-side cells of a Compare grid), so a zoom made in one
// facet is made in all of them. A channel is named by the tile, the chart kind and the view's grouping; a chart outside a tile
// gets a private one. Values are plain data (a scope name), never DOM, so a facet that redraws or remounts just re-reads it.

export interface FacetChannel<T> {
  get(): T | undefined
  /** Sets the value and tells every subscriber, the caller included (it re-renders from the same path as the others). */
  set(value: T): void
  /** Returns the unsubscribe function. */
  subscribe(fn: (value: T) => void): () => void
}

interface Slot { value: unknown; listeners: Set<(value: never) => void> }
const slots = new Map<string, Slot>()

export function facetChannel<T>(key: string): FacetChannel<T> {
  let slot = slots.get(key)
  if (!slot) {
    slot = { value: undefined, listeners: new Set() }
    slots.set(key, slot)
  }
  const s = slot
  return {
    get: () => s.value as T | undefined,
    set(value) {
      s.value = value
      for (const fn of [...s.listeners]) (fn as (v: T) => void)(value)
    },
    subscribe(fn) {
      s.listeners.add(fn as (v: never) => void)
      return () => s.listeners.delete(fn as (v: never) => void)
    },
  }
}

/**
 * The scale of a faceted difference is shared: every facet sizes its colours or axis to the largest change in any facet, so equal
 * colours or bar lengths mean equal changes. A facet publishes its own extent (keyed by run) and re-reads the maximum; when another
 * facet publishes something larger it is redrawn through `redraw`. Outside a faceted difference the extent is simply the facet's own.
 * `dispose` is the unsubscribe: return it from `draw`.
 */
export function sharedExtent(
  env: { facetDiff: boolean; scenarios: { run: string }[]; sync: <T>(name: string) => FacetChannel<T>; redraw: () => void },
  own: number,
): { extent: number; dispose?: () => void } {
  const run = env.scenarios[0]?.run
  if (!env.facetDiff || !run) return { extent: own }
  const channel = env.sync<Record<string, number>>('extent')
  const max = (rec: Record<string, number> | undefined) => Math.max(own, ...Object.values(rec ?? {}))
  const current = channel.get() ?? {}
  if (current[run] !== own) channel.set({ ...current, [run]: own })
  const extent = max(channel.get())
  const dispose = channel.subscribe((rec) => {
    if (max(rec) !== extent) env.redraw()
  })
  return { extent, dispose }
}
