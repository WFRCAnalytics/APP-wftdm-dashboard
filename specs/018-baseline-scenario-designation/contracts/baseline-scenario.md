# Contract: Baseline scenario designation

## `state/appState.ts` additions

```ts
/**
 * Marks `name` as the explicit baseline scenario (spec FR-001/FR-002).
 * Throws if `name` was never registered, matching setActive()/setStatus()'s
 * existing convention. Marking the scenario that already holds the
 * designation is a harmless no-op (FR-001 Acceptance Scenario 3).
 */
export function setBaseline(name: string): void

/**
 * Resolves "which scenario is baseline right now" (spec Key Entities:
 * Baseline designation). Always computed fresh from current state — never
 * a stored/cached resolved value:
 *   1. The explicit choice (setBaseline()'s target), if it still exists.
 *   2. Else the earliest-registered scenario with pinned === false AND
 *      status === 'ready'.
 *   3. Else undefined (spec Edge Cases: zero scenarios loaded).
 */
export function getBaseline(): string | undefined
```

`unregister(name)` (existing function) gains one new line: if `name` is the
current explicit baseline, clear it to `null` before deleting the entry
(spec FR-005). No signature change.

Both new functions call the existing `notify()` on any change, exactly like
every other mutator in this module — no new subscription mechanism.

## `hooks/useBaseline.ts` (new file)

```ts
/**
 * Subscribes to appState's baseline designation, re-rendering only when the
 * RESOLVED baseline scenario name actually changes. Mirrors
 * useActiveScenarios.ts's useSyncExternalStore shape over the same
 * subscribe() pub-sub — no memoized cache needed here (unlike
 * useActiveScenarios()), since getBaseline() returns a primitive
 * (string | undefined), which useSyncExternalStore's default Object.is
 * comparison already handles correctly (research.md §7).
 */
export function useBaseline(): string | undefined
```

## `services/sqlExpander.ts` additions

```ts
export function expand(
  sqlTemplate: string,
  config: DashboardConfig,
  filterState: FilterStateLike,
  activeScenarios: string[],
  inputState?: FilterStateLike,
  baselineScenario?: string,          // NEW — 6th, optional, trailing
): string
```

- `PLACEHOLDER_RE` gains `baseline` in its kind alternation.
- New `case 'baseline': return expandBaseline(baselineScenario, name)` in `expand()`'s switch.
- New function:
  ```ts
  function expandBaseline(baselineScenario: string | undefined, metric: string): string {
    if (!baselineScenario) missing(`baseline.${metric} (no baseline scenario)`)
    return `"${baselineScenario}__${metric}"`
  }
  ```

**Backward compatibility (verified, not assumed)**: all nine existing call
sites (`FlowMapPanel.tsx`, `GraphicWalkerPanel.tsx`, `ObservablePlotPanel.tsx`,
`PlotlyPanel.tsx`, `SankeyPanel.tsx`, `TablePanel.tsx`, `ValueBoxPanel.tsx`,
`ZoneMapPanel.tsx`) pass at most 5 positional arguments today — none require
any change. `$baseline.<metric>` is unusable from any of them until a future
feature threads `appState.getBaseline()` through to one of these call sites
(explicitly out of scope here, FR-011).

## Before / after — `$baseline.<metric>` expansion

| Input | `getBaseline()` result | Output |
|---|---|---|
| `FROM $baseline.trip_mode_share` | `"abm_2026"` | `FROM "abm_2026__trip_mode_share"` |
| `FROM $baseline.trip_mode_share` | `"base_tbm"` (after re-marking) | `FROM "base_tbm__trip_mode_share"` |
| `FROM $baseline.trip_mode_share` | `undefined` | `expand()` throws: `sqlExpander.expand: unresolved placeholder "baseline.trip_mode_share (no baseline scenario)"` |

## `layout/scenarioLoader.tsx` UI contract

- The scenario list this component renders is widened from `appState.list().filter((s) => s.source === 'handle')` to `appState.list()` (every registered scenario) **for the purpose of the new baseline control only** — the existing remove (`X`) button stays exactly as gated today (`source === 'handle'` only).
- Each rendered scenario row gains a baseline-marking control (icon-only button, matching this component's existing `Button variant="ghost" size="icon"` convention already used elsewhere in this app's header controls — e.g. `ThemeToggle`'s trigger). `onClick` calls `appState.setBaseline(scenario.name)` directly (no `scenarioManager.ts` indirection — no I/O involved, research.md §6).
- The row currently resolving as baseline (per `useBaseline()`, compared against `scenario.name`) is visually distinguished (e.g. filled vs. outline icon state) — exact styling is an implementation detail, not fixed further here.
- No "un-mark"/"clear baseline" action exists in this control — re-marking the current baseline is a no-op (FR-001 Acceptance Scenario 3); reverting to the automatic default happens only via removal (FR-005) or by marking a different scenario.
- Hidden entirely in `LOCAL` deployment mode, unchanged — inherits the component's existing `isLocalDeployment()` early-return, no new branching.

## Non-goals (explicitly unaffected by this contract)

- `panels/panelQuery.ts`'s `buildComparisonDiffQuery()` (013-zonemap-panel's `comparison: diff`) — zero changes.
- `project-docs/GRAMMAR.md`'s panel-type grammar (`plotly`/`table`/`observable-plot`/`zonemap`/etc.) — zero changes.
- No `dashboard-*.yaml` key is added to let an author supply `baselineScenario` to any panel's query build — that wiring is the next, separate feature.
