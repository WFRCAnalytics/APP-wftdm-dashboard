# Data Model: Unified Settings Modal

## `Scenario` (`state/appState.ts`) — extended, not replaced

```ts
export interface Scenario {
  name: string
  runDate?: string
  color?: string
  notes?: string
  source: ScenarioSource        // 'url' | 'handle'
  pinned: boolean
  active: boolean
  status: ScenarioStatus        // 'registering' | 'ready' | 'failed'
  path: string                  // NEW — see research.md §5
  order: number                 // NEW — see research.md §3
  label?: string                // NEW — see research.md §4
}

export interface ScenarioMetadata {
  runDate?: string
  color?: string
  notes?: string
  source: ScenarioSource
  pinned?: boolean
  path: string                  // NEW — required; both call sites already
                                 // have the right value in scope
}
```

**`path`**: for `source: 'url'`, the real folder URL used at registration
(`` `${base}observed/summary` `` / `` `${base}scenarios/${name}/summary` ``).
For `source: 'handle'`, `dirHandle.name` — the File System Access API's
own security boundary means no real absolute path is ever available; this
is the most specific real value that exists (research.md §5). Display-only
— never used for query/view resolution (that stays keyed on `name`
exclusively, unchanged).

**`order`**: assigned at `register()` time from a module-level,
ever-incrementing counter. Drives ONLY `listByDisplayOrder()`'s sort — never
read by `getBaseline()`, which continues to iterate `scenarios.values()`
(Map/registration order) exactly as before (research.md §3, FR-008).
Reassigned only by `moveScenario()`, and only among already-registered
scenarios' existing values — a fresh registration's `order` is always
greater than every existing one, so it always sorts last (FR-018,
research.md §3).

**`label`**: optional, undefined by default. Read only by the Scenarios
tab's own rendering (`s.label ?? s.name`). Never read by any
resolution/query path (FR-010, research.md §4). Discarded automatically
on `unregister()` — it lives on the `Scenario` object itself, so
`scenarios.delete(name)` already removes it with the rest of the entry;
no separate cleanup code, unlike `explicitBaseline` (which lives outside
the `Scenario` object it points at and needed its own clearing step in
`unregister()`).

### New `appState.ts` exports

```ts
export function moveScenario(name: string, direction: 'up' | 'down'): void
export function listByDisplayOrder(): Scenario[]
export function setLabel(name: string, label: string): void
export function clearLabel(name: string): void
```

All four follow the existing `setBaseline()`/`setActive()` convention:
look up the entry, throw `Error` on an unregistered `name`, mutate,
`notify()`. `moveScenario()` is a no-op (still calls `notify()`, matching
`setBaseline()`'s own "harmless no-op re-mark still notifies" precedent)
when `name` is already at the requested boundary (first scenario + 'up',
or last scenario + 'down').

`register()`'s existing signature is unchanged in shape — `metadata:
ScenarioMetadata` gains the new required `path` field, which both real
call sites (`scenarioDiscovery.ts`, `scenarioManager.ts`) already have in
scope, so no caller needs new lookup logic, only one new object property
at each of the two call sites.

## `state/basemapState.ts` (new module)

Mirrors `state/filterState.ts`'s / `state/appState.ts`'s own
subscribe/notify shape exactly — a single module-level value, not a
`Map`, since there is exactly one global basemap choice for the whole
app (not per-scenario, not per-tab).

```ts
export type Unsubscribe = () => void

export function subscribe(fn: () => void): Unsubscribe
export function getGlobalBasemap(): BasemapPresetName | undefined
export function setGlobalBasemap(name: BasemapPresetName): void
export function clearGlobalBasemap(): void
```

Value type is narrowed to `BasemapPresetName | undefined` (a plain
string), not the full `BasemapSelection` union — the Basemap tab's picker
only ever offers entries from `registry.ts`'s `BUILT_IN_PRESETS`, which
contains only preset names, never `BasemapComposition` objects
(research.md §6). This keeps the stored value a primitive, which
`useSyncExternalStore`'s default `Object.is` snapshot comparison handles
correctly with no memoization needed (same reasoning `useBaseline.ts`
already documents for its own primitive `string | undefined` return).

No persistence (FR-015) — in-memory only, reset by nothing except a full
page reload (there is no explicit "reset" UI beyond picking a different
preset — `clearGlobalBasemap()` exists for completeness/testability, not
because any control calls it in this feature).

## `panels/basemap/types.ts` — extended, not replaced

```ts
export type BasemapSource = 'panel' | 'tab' | 'global' | 'app-default'  // was: 'panel' | 'tab' | 'app-default'
```

Additive — the three existing literals and every existing comparison
against them are unaffected (research.md §6).

## `panels/basemap/resolveEffectiveBasemap.ts` — extended signature

```ts
export function resolveEffectiveBasemap(
  panelBasemap: BasemapSelection | undefined,
  tabDefaultBasemap: BasemapSelection | undefined,
  theme: ColorScheme,
  globalBasemap?: BasemapPresetName,   // NEW, optional — trailing param,
                                        // matches sqlExpander.ts's own
                                        // "new trailing optional param"
                                        // evolution shape from 018
): EffectiveBasemap
```

Updated precedence (research.md §6):

| panelBasemap | tabDefaultBasemap | globalBasemap | theme   | `.selection`        | `.source`      |
|---------------|--------------------|-----------------|---------|----------------------|-----------------|
| set (A)       | —                  | —               | —       | A                    | `'panel'`       |
| unset         | set (B)            | —               | —       | B                    | `'tab'`         |
| unset         | unset              | set (C)         | —       | C                    | `'global'`      |
| unset         | unset              | unset           | 'light' | `APP_DEFAULT_LIGHT`  | `'app-default'` |
| unset         | unset              | unset           | 'dark'  | `APP_DEFAULT_DARK`   | `'app-default'` |

`isSet()`'s existing definition is reused unchanged for the new
`globalBasemap` check (a plain string, so its existing "trim + length"
branch already covers it — no new branch needed in `isSet()` itself).

## Key relationships

- `FlowMapPanel.tsx` / `ZoneMapPanel.tsx` each add one
  `useGlobalBasemap()` call and thread its result as
  `resolveEffectiveBasemap()`'s new fourth argument — the only two
  consumers of the resolver, both already reading `useColorScheme()` the
  same symmetric way.
- The Scenarios tab renders `appState.listByDisplayOrder()` (not
  `appState.list()`) — `list()`'s own existing Map-order contract is
  otherwise unused after `scenarioLoader.tsx` (its sole caller) is
  deleted, and is left unchanged rather than repurposed, since
  `getBaseline()`'s own resolution rule (research.md §3, `getBaseline()`
  reads `scenarios.values()` directly, not `list()`) does not depend on
  either function's output.
