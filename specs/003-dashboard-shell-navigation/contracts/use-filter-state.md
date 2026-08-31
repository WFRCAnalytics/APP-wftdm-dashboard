# Contract: `useFilterState` hook (`src/hooks/useFilterState.ts`)

Satisfies: FR-007. Implements the hook the constitution's v2.2.0 amendment
and `CLAUDE.md`'s "Panel pattern"/"`useFilterState` hook" sections already
specify — this is that specification's first real implementation, not a
new design.

## Signature

```ts
import type { FilterId, FilterValue } from '@/state/filterState'

export function useFilterState(ids: FilterId[] | ['*']): Record<FilterId, FilterValue>
```

## Implementation (from the constitution amendment, unchanged)

```ts
export function useFilterState(ids: FilterId[] | ['*']): Record<FilterId, FilterValue> {
  const cache = useRef<Record<FilterId, FilterValue>>({})

  const getSnapshot = useCallback(() => {
    const next = ids[0] === '*' ? getAll() : Object.fromEntries(ids.map((id) => [id, get(id)]))
    const prev = cache.current
    const changed =
      Object.keys(next).length !== Object.keys(prev).length ||
      Object.entries(next).some(([k, v]) => prev[k] !== v)
    if (changed) cache.current = next
    return cache.current
  }, [ids])

  return useSyncExternalStore((onChange) => subscribe(ids, onChange), getSnapshot)
}
```

## Given/When/Then

- **Given** a component calls `useFilterState(['purpose'])`, **when**
  `state/filterState.ts`'s `set('purpose', value)` is called anywhere in
  the app, **then** the component re-renders with the new value — no
  manual subscription/unsubscription code in the component itself.
- **Given** a component calls `useFilterState(['purpose'])`, **when** a
  *different* filter id (`'mode'`) changes, **then** the component does
  NOT re-render — `subscribe(['purpose'], ...)` only registers against
  that one id, per `state/filterState.ts`'s existing per-id subscriber
  sets.
- **Given** the hook's `getSnapshot`, **when** called on two consecutive
  renders with no relevant filter change in between, **then** it returns
  the *same* object reference both times (`Object.is` equal) — this is
  the pitfall the constitution amendment's own commentary calls out:
  `filterState.getAll()` allocates a new object every call, so an
  unmemoized snapshot would re-render on every call (or loop under
  `useSyncExternalStore`'s consistency checks).
- **Given** `ids` is `['*']`, **when** any filter changes, **then** the
  hook re-renders — wildcard subscription, matching
  `state/filterState.ts`'s existing `'*'` convention.
- **Given** a panel component passes an inline `config.filter_ids ?? ['*']`
  expression as `ids`, **when** the component re-renders for an unrelated
  reason, **then** the `??` fallback must resolve to the *same* `['*']`
  reference each time (a module-level constant, not an inline literal) —
  per `docs/SPEC.md`'s Panel contract note; `useFilterState` itself cannot
  fix an unstable `ids` argument its caller passes in.

## Non-goals for this feature

- No filter-editing UI (sliders, selects, etc.) consuming this hook
  directly — this feature's panels are read-only consumers of filter
  *values*; a future feature builds the controls that call
  `state/filterState.ts`'s `set()`.
- No `useFilterState` unit test with `@testing-library/react` — verified
  via the Playwright integration spec instead (research.md §5).
