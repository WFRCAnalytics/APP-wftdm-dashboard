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
