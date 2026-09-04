# Feature Specification: Baseline scenario designation (foundation)

**Feature Branch**: `018-baseline-scenario-designation`

**Created**: 2026-09-04

**Status**: RESOLVED. `appState.ts` gained a single nullable `explicitBaseline` pointer + `setBaseline()`/`getBaseline()` (mutual exclusivity by construction, automatic default excluding pinned/`observed` and requiring `status: 'ready'`, `unregister()` clearing the pointer on match — no separate "shift to next" rule needed). `hooks/useBaseline.ts` exposes it reactively. `ScenarioLoader` widened to render every registered scenario with a baseline-marking star control. `services/sqlExpander.ts` gained `$baseline.<metric>` — a single bare view reference, additive, zero changes to any of the nine existing `expand()` call sites. `013-zonemap-panel`'s `comparison: diff` confirmed completely unaffected. Verified: 227/227 unit tests (16 new in `appState.test.ts`, 5 new in `sqlExpander.test.ts`), 17/17 new+existing integration tests in `scenarioManager.spec.ts`, full Playwright suite 193/194 (the one failure confirmed pre-existing and unrelated — reproduces identically on the base commit before this feature's changes), `npx tsc --noEmit` and `npm run build` both clean.

**Input**: User description: "Add a 'baseline' designation to the scenario system (009-scenario-manager) — the foundational mechanism a later feature will use to let every chart/data panel type compute differences and percent-differences relative to whichever scenario is currently marked baseline. This feature builds ONLY the foundation: the data model, the UI to set/unset it, and a generic query-time resolution mechanism. It does NOT build per-panel-type consumption (plotly/table/observable-plot/zonemap diff support) — that's a separate, later feature building on this one, the same relationship 011-basemap-style-system had to 013-zonemap-panel. Exactly one scenario can be marked baseline at a time. If the user never explicitly marks a baseline, the FIRST scenario loaded becomes baseline by default automatically. Resolve, with real reasoning, what happens when the scenario currently holding the baseline designation is unloaded. The UI lives in the existing ScenarioLoader component. A new, generic SQL placeholder resolved at query time to whichever scenario currently holds the baseline designation is added to sqlExpander.ts's existing placeholder mechanism, additive to (not replacing) 013-zonemap-panel's own hardcoded-name comparison: diff. Does not include: any panel-type-specific diff/percent-difference rendering; removing or altering 013-zonemap-panel's existing comparison: diff mechanism in any way."

## Grammar & documentation findings (pre-spec verification)

Verified directly against the real, current `src/state/appState.ts`, `src/services/scenarioDiscovery.ts`, `src/scenario/scenarioManager.ts`, `src/layout/scenarioLoader.tsx`, `src/services/sqlExpander.ts`, `docs/GRAMMAR.md`, and `src/panels/panelQuery.ts` before writing this spec — the same "check the real file before assuming its shape" discipline every prior feature in this project has required.

1. **Scenario registration order is real Map insertion order, not a separate timestamp field.** `appState.ts`'s `scenarios` store is a `Map<string, Scenario>`; `list()` returns `Array.from(scenarios.values())`, which JavaScript guarantees iterates in insertion order. No `loadedAt`/`registeredAt` field exists or is needed — "first loaded" is answerable directly from existing state.

2. **`observed` is always the literal first entry, in every real deployment, with no exception** — including when its own data registration later fails. `scenarioDiscovery.ts`'s `discoverScenarios()` runs `registerObserved()` before `registerPublishedScenarios()`, and `registerObserved()` calls `appState.register('observed', { pinned: true, ... })` synchronously, before it even attempts to fetch `observed/summary/index.json` — so the `observed` entry exists in the Map first regardless of whether that fetch later succeeds. A naive "first Map entry" reading of "first scenario loaded" would therefore make `observed` — survey/count reference data, not a model run — the default baseline in literally every deployment, defeating the feature's own stated purpose (comparing model scenario runs against each other). This is corrected below (FR-003): the automatic default explicitly excludes `pinned` entries, reusing the `pinned` flag that already exists for exactly this "this entry is not an ordinary selectable scenario" distinction, rather than inventing a new field.

3. **Only locally-loaded ("handle"-sourced) scenarios can currently be unloaded at all.** `scenarioLoader.tsx`'s remove control (the `X` button) only renders for `appState.list().filter((s) => s.source === 'handle')` — published (`url`-sourced) scenarios and `observed` have no remove/unload control anywhere in the current UI (`scenarioManager.ts`'s `removeLocalScenario()` is the only unregister path with any caller). The "what happens when the baseline scenario is unloaded" edge case is therefore scoped by the app's own real current capability: it can only actually happen to a scenario a viewer loaded from a local folder — not to `observed` or a published scenario, today.

4. **`sqlExpander.ts`'s placeholder mechanism is a single regex + switch, additive by design.** `PLACEHOLDER_RE = /\$(mappings|bins|sql|filters|scenario|inputs)\.([A-Za-z0-9_]+)/g` and a matching `switch (kind)` in `expand()`. `inputState` (007-observable-plot-panel) already established the precedent for adding a new placeholder kind as an additional optional trailing parameter on `expand()` with zero changes to any existing caller — the same shape this feature's new baseline-resolution parameter follows.

5. **The nearest existing precedent for "reference one specific named scenario's view directly" is `013-zonemap-panel`'s `comparison: diff`**, not `$scenario.x`'s own UNION-ALL-across-every-active-scenario expansion. `panelQuery.ts`'s `buildComparisonDiffQuery()` interpolates `diff.a`/`diff.b` as bare, literal, unvalidated view-name prefixes (`"${diff.a}__${config.metric}"`) — no upfront check that the name is active or even registered; an unresolvable name fails naturally when DuckDB runs the query, caught by the panel's existing error path. This feature's new placeholder is a single-scenario reference in that same spirit, not a second UNION-ALL mechanism.

6. **This project has no persistence layer to reset** (constitution Principle VI: no `localStorage`/`sessionStorage`, `appState.ts` is explicitly in-memory only "for the page's lifetime"). Baseline designation is in-memory UI state, like everything else `appState.ts` already tracks — it does not survive a reload, and does not need to.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A model-team analyst marks a scenario as the comparison baseline (Priority: P1)

An analyst has loaded two or more scenarios (e.g. a base year and a horizon year model run) and wants every future difference/percent-difference calculation to be measured against a specific one of them. They mark that scenario as "baseline" in the scenario list; the designation moves cleanly if they later mark a different scenario instead.

**Why this priority**: This is the core mechanism the entire feature exists to provide — without it, there is no concept of "the baseline" for any later panel-consumption feature to reference.

**Independent Test**: Load two or more scenarios, mark one as baseline via the scenario list UI, confirm exactly that one shows as baseline; mark a different one, confirm the designation moved and the first is no longer marked.

**Acceptance Scenarios**:

1. **Given** two or more scenarios are loaded and none is yet explicitly marked baseline, **When** the analyst marks scenario A as baseline, **Then** scenario A is shown as the baseline scenario and no other scenario is.
2. **Given** scenario A is currently marked baseline, **When** the analyst marks scenario B as baseline instead, **Then** scenario B becomes the baseline and scenario A is automatically un-marked — at no point are both, or neither, marked (except the zero-scenarios-loaded state).
3. **Given** scenario A is currently marked baseline, **When** the analyst marks scenario A as baseline again, **Then** nothing changes (idempotent).

---

### User Story 2 - The system picks a sensible default baseline automatically (Priority: P2)

An analyst who has never touched the baseline control at all still gets a working, sensible baseline — the first real model scenario they loaded — without having to take any extra action first.

**Why this priority**: A future panel-consumption feature depends on a baseline always resolving to *something* usable whenever at least one real scenario is loaded, not on every dashboard author remembering to configure one by hand first.

**Independent Test**: Load a scenario without ever touching the baseline control; confirm it is shown as the (implicit) baseline. Load a second scenario; confirm the baseline designation does not move to it (the default only ever applies when nothing has been explicitly chosen).

**Acceptance Scenarios**:

1. **Given** no scenario has ever been explicitly marked baseline, **When** the first non-`observed` scenario finishes loading, **Then** it is treated as the baseline automatically, with no action required from the analyst.
2. **Given** only the pre-loaded `observed` reference dataset is registered and no model scenario has loaded yet, **When** the analyst checks which scenario is baseline, **Then** none is — `observed` is never picked as an automatic default (it is reference/survey data, not a model run to compare against).
3. **Given** an automatic default baseline is currently in effect (never explicitly chosen), **When** a second, third, etc. scenario loads, **Then** the baseline designation does NOT move — the default only ever resolves once, to the earliest-loaded eligible scenario; it is not re-evaluated on every subsequent load.
4. **Given** an analyst has explicitly marked a scenario as baseline, **When** any further scenario loads, **Then** the explicit designation is unaffected.

---

### User Story 3 - Removing the current baseline scenario resolves cleanly, not silently (Priority: P2)

An analyst unloads the specific locally-loaded scenario that currently holds the baseline designation. The dashboard does not silently keep pointing at a scenario that no longer exists, and does not silently jump to an arbitrary replacement the analyst didn't choose — it falls back to the same explicit rule everyone already relies on for the no-baseline-chosen case.

**Why this priority**: Documented in the user's own request as an open edge case requiring explicit, reasoned resolution before this feature can be considered complete — a dangling reference here would silently corrupt every downstream diff calculation the next feature builds.

**Independent Test**: Explicitly mark a locally-loaded scenario as baseline, then remove it via the existing remove control; confirm the baseline designation is not left pointing at the removed scenario, and confirm what it resolves to instead matches the stated rule below.

**Acceptance Scenarios**:

1. **Given** a locally-loaded scenario is explicitly marked baseline, **When** the analyst removes it, **Then** the explicit designation is cleared — it is never left referencing a scenario that no longer exists.
2. **Given** the explicit baseline designation was just cleared by removal, **When** the system next resolves "what is the baseline," **Then** it applies the exact same automatic-default rule as User Story 2 (earliest-loaded remaining non-`observed` scenario, if any) — not a new/different removal-specific rule, and not a silent guess.
3. **Given** the removed scenario was the ONLY non-`observed` scenario loaded, **When** the system next resolves "what is the baseline," **Then** no scenario is baseline, exactly matching the no-scenarios-loaded state in User Story 2.
4. **Given** a scenario is removed that is currently NOT the baseline, **When** the analyst checks the baseline designation afterward, **Then** it is completely unaffected.

---

### User Story 4 - A dashboard author references "the baseline" generically in panel SQL (Priority: P3)

A dashboard author authoring `dashboard-*.yaml`/metric SQL wants to write a query that always resolves against "whichever scenario is currently baseline," without hardcoding a specific scenario name — so the same authored query keeps working correctly even after a viewer changes which scenario is marked baseline.

**Why this priority**: This is the foundation the next, separate feature (per-panel-type diff rendering) will build on. This feature only needs to prove the placeholder itself resolves correctly — not that any chart visually renders a computed difference.

**Independent Test**: Author a query fragment containing the new placeholder for a known metric; with a known scenario marked baseline, confirm the expanded SQL text references that exact scenario's view — and confirm it updates correctly after the baseline designation changes.

**Acceptance Scenarios**:

1. **Given** scenario "abm_2026" is currently marked baseline, **When** a query fragment referencing the new baseline placeholder for metric `trip_mode_share` is expanded, **Then** the resulting SQL text references the `abm_2026__trip_mode_share` view specifically.
2. **Given** the baseline designation later changes to scenario "base_tbm", **When** the same query fragment is expanded again, **Then** the resulting SQL text now references `base_tbm__trip_mode_share` instead — the same authored fragment, unmodified, tracks the change.
3. **Given** no scenario currently resolves as baseline (nothing loaded yet), **When** a query fragment referencing the baseline placeholder is expanded, **Then** this fails clearly and identifiably (matching this project's existing convention for every other unresolvable placeholder), never by silently producing SQL that references a nonexistent or empty view.
4. **Given** 013-zonemap-panel's existing `comparison: diff` (`a`/`b` hardcoded scenario names), **When** this feature ships, **Then** that mechanism is completely unchanged and continues to work exactly as before — the new placeholder is a second, additive option, not a replacement.

---

### Edge Cases

- What happens when zero scenarios are loaded at all (not even `observed`)? No baseline is designated — matches User Story 2's "none is baseline" state; there is nothing eligible.
- What happens if an analyst explicitly marks `observed` itself as baseline? Allowed — the exclusion of `pinned` entries applies only to the *automatic* default (User Story 2); an explicit, deliberate choice is respected regardless of which scenario it targets, consistent with `pinned` already being orthogonal to scenario selection elsewhere in this app.
- What happens when the baseline-holding scenario is still "registering" or fails to load (`status: 'failed'`)? See Assumptions — automatic-default eligibility requires `status: 'ready'`, since a not-yet-ready or failed scenario has no queryable views for the placeholder to resolve against.
- What happens when a scenario is marked baseline and then later marked inactive (deselected, still loaded)? The baseline designation is unaffected — it is orthogonal to a scenario's active/visible state, the same relationship `pinned` already has to `active` in this app's existing data model.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow exactly one loaded scenario at a time to hold the "baseline" designation — marking a new scenario as baseline MUST automatically clear the designation from whichever scenario previously held it, with no state where two scenarios are simultaneously baseline.
- **FR-002**: System MUST allow a viewer to explicitly mark any one loaded, registered scenario as baseline, and to change that choice at any time, from the existing scenario list UI.
- **FR-003**: When no scenario has ever been explicitly marked baseline, the system MUST treat the earliest-loaded scenario that is both `status: 'ready'` and not the pinned `observed`/reference entry as the baseline automatically, requiring no action from the viewer. If no such scenario is loaded yet, no scenario is baseline.
- **FR-004**: The automatic default (FR-003) MUST resolve once and MUST NOT move to a later-loaded scenario merely because it loaded after the current default — it only yields to a viewer's own explicit choice (FR-002), never to the passage of time or further loading.
- **FR-005**: When the scenario currently holding an EXPLICIT baseline designation is removed/unloaded, the system MUST clear that explicit designation (never leave it referencing a scenario that no longer exists) and MUST then re-resolve baseline using the exact same automatic-default rule as FR-003 — not a separate "shift to next" rule, and not an unresolved/dangling state.
- **FR-006**: Removing a scenario that does not currently hold the baseline designation MUST NOT affect the current baseline designation in any way.
- **FR-007**: System MUST provide a new, generic SQL placeholder that resolves, at query time, to whichever scenario currently holds the baseline designation (per FR-001/FR-003) — added to the existing placeholder-expansion mechanism (`services/sqlExpander.ts`) alongside its current placeholder kinds, following the same "author references a metric name, the system resolves the concrete scenario view" shape `$scenario.x` and `comparison: diff`'s `a`/`b` already establish.
- **FR-008**: The new placeholder MUST resolve to exactly one scenario's view reference (matching a single named scenario, not a UNION-ALL across every active scenario) — it answers "which one scenario is baseline right now," not "which scenarios are currently active."
- **FR-009**: If the new placeholder is used while no scenario currently resolves as baseline, expansion MUST fail clearly and identifiably, matching this project's existing convention for every other unresolvable placeholder reference — never silently produce SQL referencing an empty or nonexistent view.
- **FR-010**: This feature MUST NOT modify, replace, or remove 013-zonemap-panel's existing `comparison: diff` mechanism (its own hardcoded `a`/`b` scenario names) in any way — the new placeholder is a second, additive way to reference a scenario, coexisting with the existing hardcoded-name approach.
- **FR-011**: This feature's own scope explicitly excludes teaching any panel type's rendering or config grammar to actually consume the new placeholder for computing or displaying a difference/percent-difference — proving correct placeholder resolution (FR-007–FR-009) is sufficient; no chart is required to visually show a computed diff.
- **FR-012**: Baseline designation MUST be in-memory UI state only, matching every other piece of scenario state this app already tracks (no persistence across a reload).
- **FR-013**: Baseline designation MUST be orthogonal to a scenario's active/visible (selected) state — marking, unmarking, or auto-defaulting baseline MUST NOT change whether a scenario is active, and changing a scenario's active state MUST NOT change baseline.

### Key Entities

- **Baseline designation**: A single pointer, at most one scenario wide, tracking which currently-loaded scenario (if any) is the reference point for future difference calculations. Two components: an optional *explicit* choice (set only by a viewer's own action, cleared only when that scenario is removed) and a computed *automatic default* (the earliest-loaded, ready, non-reference-data scenario) that applies whenever no explicit choice is in effect. What "is the baseline right now" always means resolving these two — explicit if present and still valid, else the automatic default, else none — never a value stored and left stale.
- **Baseline SQL placeholder**: An author-facing reference, usable in metric SQL/panel config, that resolves at query time to the view name of whichever scenario currently holds the baseline designation — coexists with, and is structurally independent from, 013-zonemap-panel's existing hardcoded `a`/`b` scenario-name comparison mechanism.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At any point after at least one scenario has loaded, exactly zero or exactly one scenario is marked baseline — never more than one, confirmed across marking, re-marking, and removal sequences.
- **SC-002**: An analyst who never touches the baseline control still has a usable baseline (the first real, ready, non-reference scenario they loaded) with zero extra steps.
- **SC-003**: Removing the scenario currently marked baseline never leaves the system referencing a scenario that no longer exists — the very next baseline resolution always reflects real, currently-loaded state.
- **SC-004**: A dashboard author's SQL fragment referencing the new baseline placeholder resolves to the exact correct scenario's view 100% of the time, confirmed both on first resolution and after the baseline designation subsequently changes.
- **SC-005**: 013-zonemap-panel's existing `comparison: diff` panels continue to behave identically after this feature ships — zero regression, confirmed by its own existing test coverage passing unchanged.

## Assumptions

- "Loaded" (for ordering purposes) means registered in `appState.ts`, in the app's real existing insertion order — the same order `appState.list()` already returns, requiring no new timestamp/ordering field.
- The automatic default (FR-003) additionally requires `status: 'ready'` — a scenario still `'registering'` or that ended in `'failed'` has no queryable Parquet views yet, so treating it as baseline would make the new placeholder (FR-007) resolve to a view that doesn't exist. This mirrors `sqlExpander.ts`'s own existing `$scenario.x` defensive-failure convention (an empty/invalid state fails loudly, never silently).
- The scenario-list UI control for marking/unmarking baseline is added to the existing `ScenarioLoader` component (`layout/scenarioLoader.tsx`) rather than a new component — this feature adds a control to an existing list, it does not introduce a new list or a second place scenario state is shown. Exact visual treatment (icon, label, placement within each row) is a planning-phase design decision, not fixed here.
- The new placeholder's exact name/syntax (e.g. `$baseline.<metric>`) is confirmed against `docs/GRAMMAR.md`'s existing placeholder-naming convention during planning, not fixed in this spec — the functional shape (FR-007–FR-009) is what's authoritative here.
- Today, only locally-loaded ("handle"-sourced) scenarios can be removed at all (Grammar finding #3) — this feature's removal-handling requirements (FR-005/FR-006, User Story 3) are written generally (they describe correct behavior for "a scenario is removed," regardless of source) so they remain correct automatically if a future feature ever adds a remove control for published/`observed` scenarios too, without needing to be revisited.
- This feature does not add any new panel type, does not change `docs/GRAMMAR.md`'s panel-type grammar for `plotly`/`table`/`observable-plot`/`zonemap`/etc., and does not alter 013-zonemap-panel's `comparison: diff` in any way (FR-010).
