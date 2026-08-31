import { useCallback, useRef, useSyncExternalStore } from 'react'

import { get, getAll, subscribe, type FilterId, type FilterValue } from '@/state/filterState'

/**
 * Subscribes to one or more filter ids ('*' for all) and returns their
 * current values, re-rendering only when a subscribed id actually
 * changes. Wraps state/filterState.ts's plain pub/sub store with
 * useSyncExternalStore — the React 18 hook built specifically for
 * wrapping an external mutable store correctly (no stale-closure/tearing
 * risk under concurrent rendering), constitution v2.2.0.
 *
 * The memoized snapshot is deliberate, not incidental:
 * filterState.getAll() builds a new object every call, and
 * useSyncExternalStore compares snapshots by Object.is — an unmemoized
 * snapshot would re-render on every call (or loop). The cache is only
 * replaced when a subscribed id's value actually differs.
 */
export function useFilterState(ids: FilterId[] | ['*']): Record<FilterId, FilterValue> {
  const cache = useRef<Record<FilterId, FilterValue>>({})

  const getSnapshot = useCallback(() => {
    const next =
      ids[0] === '*' ? getAll() : Object.fromEntries(ids.map((id) => [id, get(id)]))
    const prev = cache.current
    const changed =
      Object.keys(next).length !== Object.keys(prev).length ||
      Object.entries(next).some(([k, v]) => prev[k] !== v)
    if (changed) cache.current = next
    return cache.current
  }, [ids])

  return useSyncExternalStore((onChange) => subscribe(ids, onChange), getSnapshot)
}
