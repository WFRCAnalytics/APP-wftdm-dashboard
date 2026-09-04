# Phase 0 Research: Baseline scenario designation (foundation)

All findings below are verified directly against the real, current source files listed — not assumed from the feature description alone, per this project's established discipline.

## §1. What "first scenario loaded" concretely means

**Finding**: `appState.ts`'s `scenarios` store is a `Map<string, Scenario>`. `list()` returns `Array.from(scenarios.values())`, and JavaScript's `Map` guarantees iteration in insertion order. So "first loaded" is directly answerable from existing state — no new ordering/timestamp field is needed.

**Finding, load-bearing**: `scenarioDiscovery.ts`'s `discoverScenarios()` always runs `registerObserved()` before `registerPublishedScenarios()`, and `registerObserved()` calls `appState.register('observed', { pinned: true, ... })` **synchronously**, before it even attempts to `fetch` `observed/summary/index.json`. This means `observed` is the literal first Map entry in **every** real deployment, with **no exception** — even a deployment where the `observed` data itself fails to load still has `observed` registered first (its `status` just ends up `'failed'` instead of `'ready'`).

**Decision**: The automatic default (spec FR-003) explicitly excludes `pinned` entries — it resolves to the earliest-inserted scenario where `pinned === false` (equivalently: not `observed`, since it's the only entry with `pinned: true` in every current deployment) **and** `status === 'ready'`.

**Rationale**: A literal "first Map entry" reading would make `observed` — real-world survey/count reference data, not a model run — the default baseline 100% of the time, defeating the feature's entire purpose (letting analysts diff model scenario runs against each other). Reusing the existing `pinned` flag for this exclusion needs no new field and matches this app's own existing semantics for `pinned` ("this entry is not an ordinary selectable scenario," already established by `manifest.yaml`'s own `pinned: true` doc comment for `observed`).

**Alternatives considered**:
- *Literal first-Map-entry, including `observed`* — rejected: verified above to always resolve to `observed`, useless as a diff baseline in every real case.
- *A new `isReference`/`isModelRun` field on `Scenario`* — rejected: `pinned` already means exactly this distinction in every currently-registered scenario; adding a second field for the same fact is duplication with no behavioral gain.
- *Excluding by literal name `'observed'`* — rejected: string-matching a magic name is fragile (a future reference dataset with a different name would slip through); `pinned` is the actual semantic marker, confirmed already set specifically for this purpose.

## §2. `status: 'ready'` gating on the automatic default

**Finding**: `Scenario.status` is `'registering' | 'ready' | 'failed'`. A `'registering'` or `'failed'` scenario has no queryable Parquet views yet (`registerScenario()`/`registerSummaryFolder()` populate DuckDB views asynchronously, after the `appState.register()` call that creates the Map entry).

**Decision**: The automatic default additionally requires `status === 'ready'`.

**Rationale**: If a not-yet-ready or failed scenario were picked as the default baseline, the new `$baseline.<metric>` placeholder (§4 below) would resolve to a view that doesn't exist yet (or never will), producing a DuckDB "table does not exist" failure downstream — the exact silent-then-confusing failure mode this project's own `sqlExpander.ts` already avoids elsewhere (`expandScenario()`'s own defensive empty-active-scenarios check, cited directly in its source comment).

## §3. What happens when the baseline-holding scenario is removed

**Finding**: `scenarioLoader.tsx`'s remove control (`removeLocalScenario` via the `X` button) only renders for `appState.list().filter((s) => s.source === 'handle')`. There is no remove/unload control anywhere in the current UI for `url`-sourced (published) scenarios or `observed` — `scenarioManager.ts`'s `removeLocalScenario()` → `appState.unregister()` is the only unregister call path with any real caller today. So this edge case, in the app's real current capability, can only actually happen to a locally-loaded scenario.

**Decision**: Store the explicit baseline choice as a single nullable pointer (`explicitBaseline: string | null`), not a per-scenario boolean flag. `unregister(name)` clears `explicitBaseline` to `null` if it currently equals `name`, in the same function, before deleting the Map entry. `getBaseline()` is always computed fresh from current state — it never trusts a previously-resolved value — so removal requires **no separate "shift to next" code path at all**: the very next call to `getBaseline()` naturally re-evaluates "is there a still-valid explicit choice? If not, apply the §1/§2 automatic-default rule" and gets the correct answer, because the invalidated pointer was already cleared.

**Rationale**: This is deliberately the same reactive-resolution shape this app already uses for `useActiveScenarios()`/`useFilterState()`/`useColorScheme()` — no consumer ever caches a stale derived value; everything re-derives from source state on demand. A design that instead searched for "the next-oldest remaining scenario" as a *separate* removal-time rule would (a) duplicate the exact eligibility logic §1/§2 already define, risking the two rules drifting apart over time, and (b) silently promote a scenario the viewer never chose to the same "explicit" status the removed one had, which is a worse failure mode than falling back to the well-defined, already-documented automatic default. This mirrors `panels/zoneGeometry.ts`'s own established precedent in this codebase: "a mismatch... rejects loudly rather than silently picking a winner" — here, "loudly" means "falls back to the one already-specified default rule," not "picks a winner via new, unreviewed logic."

**Alternatives considered**:
- *Auto-shift to the next-oldest remaining scenario, as its own rule* — rejected per Rationale above (duplicated logic, silent re-promotion to "explicit" status the viewer never chose).
- *Leave baseline fully unset until a viewer re-picks, with no automatic re-resolution* — rejected: this would special-case removal to behave differently from every other "nothing explicit is set" state in the app (initial load, per spec User Story 2), for no benefit; reusing the exact same resolver for both cases is simpler and already correct.

## §4. Placeholder syntax and expansion shape

**Finding**: `docs/GRAMMAR.md`'s existing "SQL placeholder reference" table names five kinds — `$mappings.x`, `$bins.x`, `$sql.x`, `$filters.x`, `$scenario.x`, `$inputs.x` (six, with `$inputs.x` — the table is slightly stale, missing `$inputs.x`'s own row, unrelated to this feature) — all following the same `$<kind>.<name>` shape. `sqlExpander.ts`'s `PLACEHOLDER_RE` is a single regex alternation matching exactly those kind names.

**Decision**: `$baseline.<metric>` — matches the established `$<kind>.<name>` convention exactly, and reads naturally in context (`FROM $baseline.trip_mode_share` is legible next to `FROM $scenario.trip_mode_share`).

**Finding**: `013-zonemap-panel`'s `comparison: diff` (`panelQuery.ts`'s `buildComparisonDiffQuery()`) is the nearest existing precedent for "reference one specific named scenario's view" — it interpolates `diff.a`/`diff.b` as bare, literal, unvalidated view-name prefixes: `` `"${diff.a}__${config.metric}"` ``. This is structurally different from `$scenario.x`'s own expansion, which builds a full `UNION ALL` `SELECT` across every currently-*active* scenario.

**Decision**: `$baseline.<metric>` expands to a single bare quoted view reference — `` `"${baselineScenario}__${metric}"` `` — the same shape `comparison: diff`'s `a`/`b` already produces, **not** a `UNION ALL` statement.

**Rationale**: `$baseline` answers "which one scenario is baseline right now" (FR-008) — a single-table reference usable inside a `JOIN`/subquery the way `comparison: diff`'s `a`/`b` already are — not "which scenarios are currently selected for display," which is what `$scenario.x`'s multi-row UNION already covers. Matching `comparison: diff`'s exact expansion shape also means a future panel-consumption feature can potentially let an author write `$baseline.<metric>` anywhere `a`/`b` are used today with no new SQL-shape handling.

## §5. `expand()` signature change — zero-touch on every existing caller

**Finding**: `expand(sqlTemplate, config, filterState, activeScenarios, inputState?)` already has one optional trailing parameter (`inputState`, added by `007-observable-plot-panel` with zero changes needed to any pre-existing caller). Verified via a direct search: exactly nine real call sites exist today (`FlowMapPanel.tsx`, `GraphicWalkerPanel.tsx`, `ObservablePlotPanel.tsx`, `PlotlyPanel.tsx`, `SankeyPanel.tsx`, `TablePanel.tsx`, `ValueBoxPanel.tsx`, `ZoneMapPanel.tsx`, plus one reference inside `panelQuery.ts`'s own doc comment) — none passes a sixth positional argument.

**Decision**: Add `baselineScenario?: string` as a new sixth, optional, trailing parameter. Add `'baseline'` to `PLACEHOLDER_RE`'s alternation and a matching `case 'baseline'` in `expand()`'s switch, calling a new `expandBaseline(baselineScenario, name)`.

**Rationale**: Confirmed zero-touch: every one of the nine existing call sites keeps compiling and behaving identically, since the new parameter is optional and appended at the end (same evolution shape `inputState` itself already established). This directly satisfies FR-011's scope boundary (no panel type's own call site needs to change in this feature) without requiring any special-casing — it falls out naturally from the signature shape already in use.

**Decision**: `expandBaseline()` throws via the existing `missing()` helper — `` missing(`baseline.${metric} (no baseline scenario)`) `` — when `baselineScenario` is `undefined`, exactly mirroring `expandScenario()`'s own existing defensive-empty-state convention (FR-009).

## §6. UI: widening `ScenarioLoader`, not a new component

**Finding**: `scenarioLoader.tsx` currently renders exactly one scenario-related list — `localScenarios = appState.list().filter((s) => s.source === 'handle')` — with a remove (`X`) button per row. There is **no existing UI anywhere in the app** that lists or lets a viewer interact with published (`url`-sourced) scenarios or `observed` individually; those currently only become `active` via `discoverScenarios()`'s own automatic `observed` activation or `?s=` URL params. This is a genuinely new finding, not previously documented in `CLAUDE.md`'s file-tree notes for this component.

**Decision**: Widen the scenario list this component renders — for the purpose of the new baseline control specifically — to `appState.list()` (every registered scenario, any source), not just `localScenarios`. The existing remove (`X`) button stays conditional on `source === 'handle'` exactly as today (unchanged, still local-only); the new baseline-marking control renders for every row regardless of source.

**Rationale**: FR-002 requires baseline to be markable on "any one loaded, registered scenario" — satisfying that from `ScenarioLoader` (the user's own explicitly named location) requires this component to be aware of every scenario, not only local ones, since today it simply has no rendering path for the others at all. This is additive to the component's existing responsibility (it already reads the full `appState.list()` — just filters it down before rendering); no new component, no new list mechanism, no change to what local-scenario loading/removal already does.

**Decision**: Marking baseline calls a new `appState.setBaseline(name)` directly from the component's `onClick` — not routed through `scenarioManager.ts`.

**Rationale**: Every existing `scenarioManager.ts` function (`loadLocalScenario`, `removeLocalScenario`) wraps genuinely async, fallible I/O (`showDirectoryPicker()`, DuckDB view registration/unregistration) with real error/collision handling. Marking baseline is a synchronous, always-succeeding in-memory state mutation (the target scenario is already known to be registered, since it's being clicked from the rendered list) — there is no I/O or failure mode to wrap, so a `scenarioManager.ts` indirection would add a layer with nothing to actually do. This matches how trivial state mutations elsewhere in this app (e.g. `filterState.set()`) are called directly from UI components without an intermediate service wrapper.

**Decision**: Re-marking the already-current explicit baseline is a no-op (FR-001 Acceptance Scenario 3) — the control does not toggle baseline *off* on a second click. There is no "clear explicit baseline, revert to automatic default" UI action in this feature's scope; a viewer who wants the automatic default back achieves it by marking a different scenario, or (per §3) it happens automatically if the current explicit choice's scenario is ever removed.

**Rationale**: The spec's own acceptance scenarios for User Story 1 test exactly "mark A," "mark B (moves)," "re-mark A (idempotent)" — no scenario exercises an explicit unmark action. Adding one would be scope not asked for; the resolver (§3) already provides the only case where reverting to automatic-default actually needs to happen (removal), which needs no dedicated UI action at all.

**Decision (deployment mode)**: The baseline control is hidden together with the rest of `ScenarioLoader` in `LOCAL` deployment mode (`isLocalDeployment()` returns `null` for the whole component today) — unchanged, no special-casing added for baseline specifically.

**Rationale**: `ScenarioLoader` already has zero scenario-management UI of any kind in `LOCAL` mode ("that mode has its own file-serving path already," per the component's own existing comment). The automatic-default rule (§1/§2) needs no UI at all to function, so `LOCAL` deployments still get a working baseline — they simply never get an explicit-override control, consistent with every other piece of `ScenarioLoader`'s functionality in that mode today.

## §7. Reactivity: `useBaseline()` hook

**Finding**: `useActiveScenarios()` wraps `useSyncExternalStore` with a manual reference-stable cache, because `getActive()` returns a **new array** every call and `useSyncExternalStore` compares snapshots with `Object.is` (array identity would differ every render without the cache, causing either a false-positive re-render loop or requiring the manual diff `useActiveScenarios()` already implements).

**Decision**: `getBaseline()` returns a primitive (`string | undefined`), not an array/object — so `useBaseline()` needs no cache/memoization at all: `Object.is` already compares primitives correctly by value.

```ts
export function useBaseline(): string | undefined {
  return useSyncExternalStore(subscribe, getBaseline)
}
```

**Rationale**: This is a genuine simplification over `useActiveScenarios()`'s shape, not an inconsistency — the underlying reason that hook needs a cache (array identity) simply doesn't apply here. Still reuses the exact same `subscribe()` wildcard pub-sub `appState.ts` already has (no new subscription mechanism); `setBaseline()`/`unregister()`'s clearing-on-match both call the existing `notify()`, so every subscriber (including this new hook) re-renders correctly on any relevant change with zero new plumbing.
