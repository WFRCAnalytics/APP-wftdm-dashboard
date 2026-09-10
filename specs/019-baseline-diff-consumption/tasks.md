# Tasks: $baseline consumption across panel types (diff/percent-diff rendering)

**Input**: Design documents from `specs/019-baseline-diff-consumption/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/baseline-diff-consumption.md, quickstart.md

**Tests**: Included per story — pure-function coverage (Vitest) for the shared mechanism, real-browser reactivity/rendering coverage (Playwright) per panel type, matching this project's established two-layer convention.

**File-path correction, confirmed before writing any task below**: `plan.md`/`quickstart.md` assumed a `tests/integration/plotlyPanel.spec.ts` file exists — it does not. Plotly panel integration coverage lives in `tests/integration/dashboardShell.spec.ts` (confirmed via directory listing). All plotly-related integration tasks below reference the real file.

**Organization**: User Stories 1–4 are cross-cutting behaviors that necessarily span all four panel types together (unlike `018`'s per-behavior phases) — Phase 2 (Foundational) builds the ENTIRE shared mechanism once (types, query-builder, resolver, both null-rendering fixes); Phase 3 (US1) is where that mechanism first gets wired into all four panel types' own fetch effects, delivering the MVP. Phases 4–6 (US2/US3/US4) then each verify a distinct angle of behavior that Phases 2–3's own code already implements in full — mirroring `018`'s own "test-only phase" pattern for exactly this reason, stated explicitly per phase below rather than left implicit.

## Phase 1: Setup

- [X] T001 Confirmed dev fixtures current and the full existing suite state noted before starting.

## Phase 2: Foundational (blocking prerequisites for US1–US4)

**Purpose**: The entire shared mechanism — types, query-builder, resolver, and the two real null-rendering bugs found in research.md §6. Nothing in US1–US4 can be built or tested without this.

- [X] T002 Added `ComparisonCapablePanelConfig` mixin to `src/layout/types.ts`.
- [X] T003 Removed `ZoneMapPanelConfig`'s local `comparison` field; added the mixin to its `extends` clause.
- [X] T004 [P] Added the mixin to `PlotlyPanelConfig`'s `extends` clause.
- [X] T005 [P] Added the mixin to `TablePanelConfig`'s `extends` clause.
- [X] T006 [P] Added the mixin to `ObservablePlotPanelConfig`'s `extends` clause.
- [X] T007 Added `resolveComparisonScenarioName(name, baseline)` to `src/panels/panelQuery.ts`.
- [X] T008 Moved `isComparisonDiff()` into `src/panels/panelQuery.ts`, exported, shared.
- [X] T009 Generalized `buildComparisonDiffQuery()` to `(metric, aScenario, bScenario, compareOn, expr)`.
- [X] T010 [P] Fixed `formatValue(null, ...)` in `src/panels/formatValue.ts` — was returning the literal string `"null"`; now returns `'N/A'`.
- [X] T011 [P] Added `cellColor()`'s dedicated `NOT_COMPUTABLE_COLOR` null branch in `src/panels/tableLogic.ts`.
- [X] T012 [P] Extended `tests/unit/panelQuery.test.ts`: migrated the 3 pre-existing `buildComparisonDiffQuery` tests to the new signature, added a multi-column `compare_on` test, a byte-for-byte regression test, `isComparisonDiff()` tests, and `resolveComparisonScenarioName()` tests. RESULT: 38 tests, all pass.
- [X] T013 [P] Extended `tests/unit/formatValue.test.ts` with the null/undefined → `'N/A'` case. RESULT: 6/6 pass.
- [X] T014 [P] Extended `tests/unit/tableLogic.test.ts` with 2 new tests (dedicated color + applies even with no colorScale/domain configured). RESULT: 20/20 pass.

**Checkpoint**: Verified — `npx tsc --noEmit` clean; `npx vitest run tests/unit/panelQuery.test.ts tests/unit/formatValue.test.ts tests/unit/tableLogic.test.ts` all pass.

---

## Phase 3: User Story 1 - Analyst sees a metric's absolute change from the baseline scenario (Priority: P1) 🎯 MVP

**Goal**: All four panel types can render `diff_value` computed against `$baseline`, reactively tracking baseline changes (FR-016) and gating cleanly on an unresolved baseline (FR-011).

- [X] T015 [US1] Migrated `src/panels/ZoneMapPanel.tsx` onto the generalized builder/resolver/shared `isComparisonDiff()`; added the FR-011 gate and `useBaseline()` to the fetch effect's dependency array. RESULT: existing hardcoded-name `comparison: diff` tests pass unchanged (byte-for-byte identity confirmed).
- [X] T016 [P] [US1] Added the `comparison: diff` branch + `useBaseline()` to `src/panels/PlotlyPanel.tsx`.
- [X] T017 [P] [US1] Same for `src/panels/TablePanel.tsx` — also confirmed the existing `isContentChange`/three-way-reset guard (FR-008, from 009-scenario-manager) naturally excludes `baseline` the same way it already excludes `activeScenarioNames`, no extra code needed.
- [X] T018 [P] [US1] Same for `src/panels/ObservablePlotPanel.tsx`.
- [X] T019 [US1] Added coverage to `tests/integration/zonemapPanel.spec.ts`. **Fixture-placement correction, found live**: the new zonemap `$baseline` fixture panel was first added to `dashboard-1-summary.yaml` (alongside its sibling `comparison: diff` panels) — moved to `dashboard-2-detail.yaml` instead after a single git-stash comparison suggested it was destabilizing an unrelated `012-webgl-context-management` test; a LARGER, repeated-run comparison afterward (documented in full in T030 below) showed that conclusion was wrong. Left on the Detail tab anyway as a harmless precaution — see that file's own comment for the complete, corrected record. RESULT: passes.
- [X] T020 [P] [US1] Added coverage to `tests/integration/dashboardShell.spec.ts` (the real file — file-path correction confirmed before writing). **Real bug found and fixed along the way**: the fixed short `toBeVisible({timeout: 10_000})` used in an early draft raced ahead of real DuckDB-WASM query contention on this now-heavier fixture tab; replaced with a generously-timed `expect.poll()`. RESULT: passes.
- [X] T021 [P] [US1] Added coverage to `tests/integration/tablePanel.spec.ts`. RESULT: passes.
- [X] T022 [P] [US1] Added coverage to `tests/integration/observablePlotPanel.spec.ts`. RESULT: passes.

**Checkpoint**: Verified — `npx playwright test tests/integration/zonemapPanel.spec.ts tests/integration/dashboardShell.spec.ts tests/integration/tablePanel.spec.ts tests/integration/observablePlotPanel.spec.ts`, all `019-baseline-diff-consumption` tests pass.

**Real, confirmed regression found and fixed during this phase, beyond the task list's own original scope**: adding these 8 fixture panels to `dashboard-1-summary.yaml` broke 6 PRE-EXISTING tests in `dashboardShell.spec.ts` and `panelExpand.spec.ts` that used an unscoped, page-wide `page.locator('.js-plotly-plot')` — a real, latent fragility (assumed exactly one plotly panel would ever exist on that tab) this feature's own fixture additions were the first to violate. Fixed by scoping each to its specific panel's own card/dialog (the SAME class of fix `014-graphic-walker-panel`'s own `CLAUDE.md` history note already documents for an analogous unscoped `role="tab"` query) — not by shrinking this feature's fixture footprint to avoid the collision. All 6 confirmed passing after the fix.

---

## Phase 4: User Story 2 - Analyst sees a metric's percent change from the baseline scenario (Priority: P1)

**Note, corrected from this phase's own original framing**: NOT purely a proof phase after all — a real, confirmed production bug was found and fixed here (T025), not merely verified.

- [X] T023 [US2] Added coverage to `tests/integration/tablePanel.spec.ts`: `NULLIF`-guarded percent-diff renders `'N/A'` + the dedicated color for the zero-baseline row (TAZ 300), and a correct `-80.0%` for a real row (TAZ 700). RESULT: passes.
- [X] T024 [P] [US2] Added coverage to `tests/integration/dashboardShell.spec.ts`: confirmed via Plotly's own real trace `.data[0].y` array that the zero-baseline row is a genuine `null` (never coerced, never `Infinity`/`NaN`) and a real row is a finite number. RESULT: passes — Plotly's own native omission genuinely holds, no code change needed here.
- [X] T025 [P] [US2] Added coverage to `tests/integration/observablePlotPanel.spec.ts`. **RESULT: found a real, confirmed bug, not merely verified an assumption.** Direct SVG inspection (`getAttribute('height')` on each rendered `<rect>`) showed Observable Plot's `barY` renders a null y as a genuine `<rect height="0">` at the EXACT position a real `0` value would occupy — silently indistinguishable from "no change," violating FR-014. Fixed in `src/panels/observablePlotEncoding.ts`: `resolveObservablePlotEncoding()` now filters out any row whose configured `y` value is `null` before `Plot.plot()` ever sees it. `research.md` §6, `plan.md`, `data-model.md`, and `contracts/baseline-diff-consumption.md` all corrected in place to record the disproven original claim and the real fix, not silently rewritten. New unit coverage added to `tests/unit/observablePlotEncoding.test.ts` (3 tests). Test now passes: 6 rects render, not 7.

**Checkpoint**: The zero-baseline degenerate case is proven correct, distinctly, across every panel type — for `table` via an explicit new code path (Phase 2), for `plotly` via already-correct native library behavior (confirmed, not assumed), and for `observable-plot` via a new code path found necessary only by writing and running the real integration test.

---

## Phase 5: User Story 3 - The four panel types share one authoring convention, not four (Priority: P2)

- [X] T026 [US3] Added a parametrized-style test to `tests/unit/panelQuery.test.ts` confirming the shared `buildComparisonDiffQuery()`/`compareOn` mechanism produces the identically-shaped `diff_value` output regardless of column count — direct proof of one shared implementation, not four.
- [X] T027 [P] [US3] Updated `project-docs/GRAMMAR.md`: added a new shared "Scenario comparison / diff mode" section (under `type: zonemap`, cross-referenced from `type: plotly`/`type: table`/`type: observable-plot`), and corrected/expanded the existing `$baseline.x` placeholder-reference note to explicitly disambiguate it from this feature's own, structurally separate `$baseline` sentinel (both exist, both work, neither builds on the other).

**Checkpoint**: The "one consistent convention" bar is confirmed via both a direct test and updated documentation.

---

## Phase 6: User Story 4 - The baseline is genuinely unresolved (Priority: P3)

**Note, corrected from this phase's own original plan**: T028 (a zonemap-specific version of this test) was dropped — its first draft reused `zonemapPanel.spec.ts`'s own zonemap-specific `waitForRender()` helper against a `table` panel title by mistake, which can never resolve. Rather than fix a broken duplicate, the coverage was consolidated into T029's own `table`-panel test alone, which already exercises the identical FR-011/FR-016 behavior correctly and needs no map-specific machinery at all.

- [X] T029 [P] [US4] Added coverage to `tests/integration/tablePanel.spec.ts`: force-unregistering every scenario (via the same `appState.unregister()` the real remove-scenario control calls) makes `getBaseline()` resolve to `undefined`, and the panel shows its existing `alert`-role error state with no query attempted; re-registering a scenario recovers it automatically, no reload. RESULT: passes.

**Checkpoint**: The user's own explicitly-flagged reactivity requirement (Grammar finding #7/FR-016) is proven correct through the real UI.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T030 Confirmed `013-zonemap-panel`'s existing hardcoded-name `comparison: diff` tests pass completely unchanged. **Also surfaced and resolved a real, confirmed methodology error along the way**: a single-run `git stash` comparison first indicated this feature's fixture additions were causing a deterministic regression in `012-webgl-context-management`'s own WebGL-context-loss test — acted on (moved a fixture panel to a different tab) before a LARGER, 4-runs-per-side comparison disproved it: the test fails at a similar ~1-in-3-to-4 rate with or without this feature's changes present, including on the clean pre-019 commit. Corrected in place, honestly, in every location that had recorded the original (wrong) conclusion (`research.md`-adjacent fixture comments, `CLAUDE.md`) rather than left standing.
- [X] T031 [P] Updated `CLAUDE.md`'s file-tree notes for `layout/types.ts` and `panels/panelQuery.ts` (the latter consolidating the full story for `ZoneMapPanel.tsx`/`PlotlyPanel.tsx`/`TablePanel.tsx`/`tableLogic.ts`/`formatValue.ts`/`ObservablePlotPanel.tsx`/`observablePlotEncoding.ts` in one place, matching this project's own precedent of a single consolidated note for a cross-cutting feature rather than scattering it across every touched file's own far-apart entry).
- [X] T032 Full regression: `npx tsc --noEmit` clean; `npx vitest run` 240/240 pass; `npx playwright test` 200/202 pass (both remaining failures independently confirmed pre-existing and unrelated to this feature — the same two flakes already known from earlier in this session); `npm run build` clean.
- [X] T033 `quickstart.md`'s four scenarios are covered 1:1 by the Phase 2/3/4/6 tests above, all passing. `spec.md`'s Status field updated to RESOLVED with a full completion summary, including the two real bugs found and the disproven WebGL-regression hypothesis.

## Dependencies & Execution Order

- **Phase 1 (Setup)** → no dependencies, run first.
- **Phase 2 (Foundational)** → depends on Phase 1; blocks Phases 3–6 entirely (every later phase wires or verifies this shared mechanism).
- **Phase 3 (US1)** → depends on Phase 2. Delivers the MVP slice. T015 (zonemap) has no dependency on T016–T018 (plotly/table/observable-plot) or vice versa — all four panel-wiring tasks are mutually independent, different files, safely parallel.
- **Phase 4 (US2)** → depends on Phase 2 AND Phase 3 (needs real panels rendering `diff_value` to observe the zero-baseline case against) — test-only phase.
- **Phase 5 (US3)** → depends on Phase 2 AND Phase 3 (same reason) — test-only/doc-only phase.
- **Phase 6 (US4)** → depends on Phase 2 AND Phase 3 (the gate/reactivity being tested lives in Phase 3's own wiring) — test-only phase.
- **Phase 7 (Polish)** → depends on all of Phases 2–6 being complete.

## Parallel Execution Examples

- T004/T005/T006 (the three panel-config `extends` additions) can run in parallel with each other, and with T007–T009 (panelQuery.ts) and T010/T011 (formatValue.ts/tableLogic.ts) — all different files, all depending only on T002/T003.
- T015–T018 (the four panel-type wiring tasks) are fully parallel — different files, identical shape, all depending only on Phase 2.
- T019–T022 (the four integration test files) are fully parallel, once their corresponding T015–T018 task lands.
- T024/T025 (Phase 4's chart-omission checks) can run in parallel with each other and with T023.

## Implementation Strategy

**MVP first**: Phases 1–3 (Setup, Foundational, US1) alone deliver a fully working, absolute-difference-against-`$baseline` feature across all four panel types — independently demonstrable and shippable before Phases 4–7 exist. Phases 4–6 then prove three distinct angles of behavior (zero-baseline degenerate case, cross-panel-type consistency, unresolved-baseline gating) that Phases 2–3's own code already implements correctly — no new production code in any of them, matching `018-baseline-scenario-designation`'s own precedent for exactly this shape of remaining-phases-are-proof-not-implementation feature.
