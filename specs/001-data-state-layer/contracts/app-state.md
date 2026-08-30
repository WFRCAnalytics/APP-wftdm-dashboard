# Contract: `state/appState.js`

Satisfies: FR-020 (registry of which scenarios are currently loaded/active,
readable independently of any visual component). Consumed by
`scenarioDiscovery.js` (writes) and, in later slices, by panels/layout (reads
only — out of scope here).

This is a distinct registry from `services/duckdb.js`'s view registration:
`duckdb.js` tracks *queryable Parquet views*; `appState.js` tracks *scenario
metadata and selection state* (the `Scenario` entity in `data-model.md`).
`scenarioDiscovery.js` calls into both for each scenario it processes — a
scenario is fully onboarded only once it has views in `duckdb.js` **and** a
`'ready'` entry here.

## `register(name: string, metadata: { runDate?, color?, notes?, source: 'url' | 'handle', pinned?: boolean }): void`

Adds a new `Scenario` entry with `status: 'registering'` and
**`active: false` always** — `pinned` has no effect on the initial `active`
value; it is stored purely as UI-deselectability metadata for a later slice
to read, not acted on here. Merges in whatever `metadata` fields are known
from `manifest.yaml` (all optional except `source`).

- **Given** `name` is not already registered, **when** `register()` is
  called, **then** `get(name)` returns a `Scenario` with `status:
  'registering'`.
- **Given** `name` is already registered, **when** `register()` is called
  again, **then** the prior entry is replaced (same no-leftover-data
  invariant as `duckdb.js`'s `registerScenario` — see `data-model.md`'s
  Registered Dataset invariant), not merged field-by-field.
- **Given** `metadata.pinned` is `true`, **when** `register()` is called,
  **then** the resulting entry still has `active: false` — `pinned: true`
  never auto-activates a scenario. Authoritative rule: **`active` is only
  ever changed by an explicit `setActive()` call, never as a side effect of
  `register()`.**

## `setStatus(name: string, status: 'ready' | 'failed'): void`

Transitions an existing entry's `status`. No-op error requirement: calling
this for a `name` never registered throws (programmer error — callers in
`scenarioDiscovery.js` always `register()` before `setStatus()`).

## `setActive(name: string, active: boolean): void`

Sets the `active` flag. This is the **only** function that changes `active` —
`scenarioDiscovery.js` is always responsible for calling it explicitly: once
for the observed dataset at startup (`setActive('observed', true)`,
unconditionally — FR-009, regardless of what `pinned` was set to at
`register()` time) and once per URL-param match (Story 3). Because
`register()` never auto-activates, there is no implicit state to override:
Story 3 edge case 3 ("no scenario-selection parameters... observed active by
default") is satisfied entirely by `scenarioDiscovery.js`'s own call sequence
— `appState.js` itself has no pinned-aware branching.

- **Given** a scenario was registered with `pinned: true` and `setActive()`
  has not yet been called for it, **when** `get(name)` is read, **then**
  `active` is still `false` — registration alone never activates anything.

## `get(name: string): Scenario | undefined`

Returns the current entry, or `undefined` if `name` was never registered (or
was `unregister()`-ed — see below).

## `list(): Scenario[]`

Returns every registered scenario (observed + published), regardless of
`active`/`status`. Order is not part of the contract.

## `getActive(): Scenario[]`

Convenience filter: equivalent to `list().filter(s => s.active)`. Used by
`sqlExpander.js`'s `$scenario` expansion (`contracts/sql-expander.md`) to know
which namespaced views to `UNION ALL`.

## `unregister(name: string): void`

Removes the entry entirely. Pairs with `duckdb.js`'s `unregisterScenario` —
callers are expected to call both when fully dropping a scenario (this
slice's own code only ever calls `register`/`setStatus`/`setActive`; a full
`unregister` flow is exercised by a later slice's manual scenario management,
but the function is defined now so its shape doesn't change later).

- **Given** `name` was registered, **when** `unregister(name)` is called,
  **then** a subsequent `get(name)` returns `undefined` and `list()` no
  longer includes it.

## Non-goals for this slice

- **No pub/sub.** Unlike `filterState.js` (FR-019 explicitly requires
  subscribe/notify), no functional requirement in this spec calls for
  `appState.js` to notify anyone of registry changes. Reads are pull-based
  (`get`/`list`/`getActive`) only. A later slice (panels rendering
  per-scenario columns reactively) may need to add subscription — that would
  be an additive change to this contract, not a breaking one.
- No persistence — in-memory only for the page's lifetime, consistent with
  constitution Principle VI (no Web Storage).
