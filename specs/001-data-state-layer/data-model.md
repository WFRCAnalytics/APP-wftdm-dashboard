# Data Model: Data and State Layer Scaffold

**Feature**: `001-data-state-layer` | **Date**: 2026-08-29

This slice has no application database — "entities" here are the in-memory
JS structures the data/state layer maintains, derived from the spec's Key
Entities section. No entity is persisted to Web Storage (constitution
Principle VI forbids `localStorage`/`sessionStorage`).

---

## Scenario

A named model run or the observed reference dataset.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Namespacing key for its views (`{name}__{metric}`); unique across observed + published scenarios |
| `runDate` | string (date) | From `manifest.yaml` |
| `color` | string (hex) | From `manifest.yaml`; used later by chart panels, not by this slice |
| `notes` | string | From `manifest.yaml`, optional |
| `source` | `'url' \| 'handle'` | Which registration path was used (FR-006) |
| `pinned` | boolean | `true` for the observed dataset (always active, not user-deselectable per FR-009) |
| `active` | boolean | Whether currently selected; driven by URL params (Story 3) or default (observed only) |
| `status` | `'registering' \| 'ready' \| 'failed'` | Tracks FR-012's fail-soft behavior per scenario |

**Registry**: `appState.js` holds `Map<name, Scenario>`, readable independently
of any visual component (FR-020). Public API (`register`/`setStatus`/
`setActive`/`get`/`list`/`getActive`/`unregister`) is defined in
`contracts/app-state.md` — pull-based reads only, no subscription (unlike
`Filter`, below).

---

## Registered Dataset (View)

One scenario's one metric, made queryable under a namespaced view name.

| Field | Type | Notes |
|---|---|---|
| `viewName` | string | `{scenarioName}__{metricName}`, e.g. `abm_2026__trip_mode_share` |
| `scenarioName` | string | FK to Scenario.name |
| `metricName` | string | Base name, matches the Parquet file stem |
| `sourceUrl` or `sourceHandle` | string \| FileSystemFileHandle | Where DuckDB reads the Parquet from |

**Invariant**: registering the same `scenarioName` twice replaces all of that
scenario's prior views cleanly — no leftover views from the earlier
registration remain queryable (edge case in spec).

**Invariant**: two different scenarios never produce a colliding `viewName`,
because `metricName` alone is never used as a view name — always
`scenarioName__metricName`.

---

## Filter

A named, shared input value.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Filter identifier, e.g. `purpose` |
| `value` | any | Current value; `'all'` is the sentinel meaning "no constraint" (FR-016) |

**Store**: `filterState.js` holds `Map<id, value>` plus
`Map<id, Set<subscriberFn>>` (and a separate `Set<subscriberFn>` for `'*'`
wildcard subscribers). `set(id, value)` notifies every subscriber registered
for that `id` and every `'*'` subscriber, exactly once each (FR-019, SC-005).

**Invariant**: setting a filter before any subscriber exists still stores the
value; a subscriber registering later and calling `get(id)` sees it (edge
case in spec).

---

## Dashboard Configuration

The parsed structure of a `dashboard-*.yaml` or `manifest.yaml` file, loaded
at runtime (FR-013) — never baked into the Vite build.

| Field | Type | Notes |
|---|---|---|
| `raw` | object | Result of `js-yaml` parsing the fetched file text |
| `sourcePath` | string | URL/path it was fetched from, for error attribution |

This slice only needs the config's structure to exist and be available to the
SQL expander (Story 4) and to a future layout renderer (out of scope here) —
it does not validate dashboard/panel semantics beyond what expansion needs.

---

## Configuration Placeholder

A named shorthand inside a metric's SQL text, resolved by
`sqlExpander.js` against a loaded `summarize.yaml`-shaped config and the
current `filterState`.

| Placeholder | Resolves using | Expands to |
|---|---|---|
| `$mappings.<name>` | `config.mappings[name]` | `WHEN k THEN v ...` fragment inside a `CASE` |
| `$bins.<name>` | `config.bins[name]` | Expression per the bin's `type` (`manual_breaks` / `quantiles` / `spaced_intervals` / `equal_intervals`) — see `contracts/sql-expander.md` |
| `$sql.<name>` | `config.sql_fragments[name]` | Inline FROM-clause / join text |
| `$filters.<id>` | `filterState.get(id)` | The literal current value, or an omitted condition when the value is the `'all'` sentinel (FR-016) |
| `$scenario.<metric>` | `activeScenarios` param (caller-resolved from `appState`) | `UNION ALL` across each active scenario's `{name}__{metric}` view — see `contracts/sql-expander.md` for the exact convention, resolved during implementation |

**Invariant**: a reference to a mapping/bin/fragment/filter name absent from
the loaded config raises an error identifying the specific missing reference
(FR-017) — expansion never silently drops or ignores an unresolved
placeholder.

---

## Relationships

```
Scenario 1───* Registered Dataset (View)
Dashboard Configuration ───references (by name)───> Configuration Placeholder
Configuration Placeholder ──resolves against──> Filter (for $filters.*)
Configuration Placeholder ──resolves against──> Scenario registry (for $scenario)
```

No entity in this slice has a state-transition diagram beyond the simple
`Scenario.status` lifecycle (`registering → ready` or `registering → failed`,
terminal either way — no retry logic specified).
