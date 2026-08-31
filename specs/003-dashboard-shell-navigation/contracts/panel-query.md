# Contract: Panel SQL-template construction (`src/panels/panelQuery.ts`)

Satisfies: FR-005, FR-006, FR-007. Depends on `services/sqlExpander.ts`'s
existing `expand()` (unchanged) and `layout/types.ts`'s `PanelConfig`.

## Signature

```ts
import type { FilterId, FilterValue } from '@/state/filterState'
import type { PanelConfig } from '@/layout/types'
import type { DashboardConfig } from '@/services/yamlLoader'

/**
 * Builds a bare SQL template for a panel — $scenario.<metric> and
 * $filters.<id> placeholders only, per docs/GRAMMAR.md's SQL placeholder
 * reference table (panel queries never use $mappings/$bins/$sql — those
 * are summarize.yaml-only, already baked into the Parquet). Does NOT
 * expand placeholders itself — hand the result to sqlExpander.expand().
 */
export function buildPanelQuery(
  config: PanelConfig,
  filters: Record<FilterId, FilterValue>,
): string

/**
 * Resolves which scenario names a panel's $scenario.<metric> placeholder
 * should union over — config.scenarios (an explicit override list) wins
 * if set, otherwise the caller's globallyActive list (from
 * appState.getActive()) passes through unchanged. Pure — takes the
 * globally-active list as a parameter rather than reading appState.ts
 * itself, so this module (and its Vitest unit tests) has no dependency on
 * app-wide state.
 */
export function resolveActiveScenarios(
  config: PanelConfig,
  globallyActive: string[],
): string[]

/**
 * The DashboardConfig sqlExpander.expand() structurally requires for its
 * $mappings/$bins/$sql cases, which a panel-built template never actually
 * uses (see "Composing with sqlExpander.expand()" below). Exported from
 * this module — the one place that constructs panel SQL templates — so
 * ValueBoxPanel.tsx/PlotlyPanel.tsx import it from here rather than each
 * defining their own equivalent empty object.
 */
export const EMPTY_SUMMARIZE_CONFIG: DashboardConfig = { raw: {}, sourcePath: '' }
```

## Given/When/Then

- **Given** a `ValueBoxPanelConfig` with `metric: 'summary_kpis'`,
  `column: 'total_trips'`, and no `filter`, **when** `buildPanelQuery`
  runs, **then** it returns `SELECT "total_trips" FROM ($scenario.summary_kpis)`
  (or an equivalent single-column projection) — a bare `$scenario.x`
  reference, no `WHERE` clause.
- **Given** a `PlotlyPanelConfig` with `metric: 'trip_mode_share'` and
  `filter: '$filters.purpose'`, **when** `buildPanelQuery` runs, **then**
  the returned template's `WHERE` clause places the `$filters.purpose`
  reference alone on its own line, per `docs/GRAMMAR.md`'s documented
  `all`-sentinel line-omission rule — never combined with another
  condition on the same line.
- **Given** a config with `scenario` set (single-scenario override) rather
  than the default all-active-scenarios behavior, **when**
  `buildPanelQuery` runs, **then** the returned template queries only
  `"<scenario>__<metric>"` directly, not a `$scenario.x` union — no
  placeholder expansion needed for a single named scenario.
- **Given** the constructed template, **when** it is passed to
  `sqlExpander.ts`'s `expand()`, **then** `expand()` requires no changes —
  every placeholder `buildPanelQuery` emits is one `expand()` already
  supports (`$scenario`, `$filters`).
- **Given** a config referencing a filter id with no corresponding
  `FilterDefinition` in the tab's `filters` array, **when**
  `buildPanelQuery` runs, **then** it still emits the `$filters.x`
  reference — resolution/validation of "does this filter exist" happens at
  `sqlExpander.expand()` time (which already throws on an undefined
  filter's `get(id)`), not duplicated here.
- **Given** a config with `scenarios: ['abm_2026', 'abm_2027']` set and no
  `scenario` (singular), **when** `resolveActiveScenarios` runs, **then**
  it returns exactly `['abm_2026', 'abm_2027']`, regardless of what's
  actually globally active — an explicit override, not a filter applied on
  top of the active set.
- **Given** a config with neither `scenario` nor `scenarios` set, **when**
  `resolveActiveScenarios` runs, **then** it returns `globallyActive`
  unchanged — the default, existing behavior (`appState.getActive()`'s
  full list).
- **Given** a config with *both* `scenario` (singular) and `scenarios`
  (plural) set — an unusual, likely-authoring-error case, but not
  rejected — **when** the panel builds its query, **then** `scenario`
  (singular) wins: `buildPanelQuery` already bypasses the `$scenario.x`
  placeholder entirely for a singular `scenario` (a direct
  `"<scenario>__<metric>"` reference), so `resolveActiveScenarios`'s
  output is never consulted in that case — there's no placeholder left for
  it to resolve.

## Composing with `sqlExpander.expand()`

`buildPanelQuery` and `resolveActiveScenarios` are the two pure inputs a
panel component combines with `sqlExpander.ts`'s existing `expand()` before
it can call `services/duckdb.ts`'s `query()` — `buildPanelQuery`'s output
is a *template*, not executable SQL, until `expand()` runs:

```ts
const template = buildPanelQuery(config, filters)
const activeScenarios = resolveActiveScenarios(config, appState.getActive().map((s) => s.name))
const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterStateLike, activeScenarios)
const rows = await query(sql)
```

`EMPTY_SUMMARIZE_CONFIG` (a module-level `{ raw: {}, sourcePath: '' }`
constant) is deliberate, not a placeholder for missing work:
`sqlExpander.expand()`'s signature requires a `DashboardConfig` argument
for its `$mappings`/`$bins`/`$sql` cases, but research.md §2 already
established a panel-built template never contains those placeholder kinds
— the argument is structurally required by `expand()`'s existing contract
(unchanged, per this feature's own scope decision) but functionally
irrelevant to every call this feature makes. Documented here so it doesn't
read as a mystery empty object during implementation. `filterStateLike` is
any object satisfying `sqlExpander.ts`'s existing `FilterStateLike`
interface (`{ get(id): unknown }`) — `state/filterState.ts`'s own `get`
export already satisfies it directly, no adapter needed.

## Non-goals for this feature

- No `$mappings`/`$bins`/`$sql` support — research.md §2's finding that
  panel queries never need them.
- No query result caching or cross-panel query sharing (spec.md's Edge
  Cases explicitly scope this out — each panel manages its own query).
- No SQL injection defense beyond what `sqlExpander.ts` already provides
  (config-authored values, not end-user input — same trust boundary as
  every other config-driven SQL construction in this codebase).
