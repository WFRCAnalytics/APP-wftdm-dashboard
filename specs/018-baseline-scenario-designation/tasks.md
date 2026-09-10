# Tasks: Baseline scenario designation (foundation)

**Input**: Design documents from `specs/018-baseline-scenario-designation/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/baseline-scenario.md, quickstart.md

**Tests**: This feature's own spec (User Stories 1–4, quickstart.md) requires automated proof of behavior at both the unit (appState.ts/sqlExpander.ts) and integration (ScenarioLoader UI) layers — test tasks are included per story, matching this project's established convention (every prior panel/state feature ships with both layers).

**Organization**: Unlike a typical feature, User Stories 1–3 all depend on ONE shared resolver (`appState.ts`'s `explicitBaseline` pointer + `getBaseline()`) — Phase 2 (Foundational) builds the core mechanism once; Phase 3 (US1) is where it first becomes visible/testable through the real UI; Phase 4 (US2) and Phase 5 (US3) are each a distinct, narrower angle of proof on top of what Phases 2–3 already implement (US2 needs no new production code at all — its own logic already lives in Phase 2; US3 needs exactly one small addition to `unregister()`). User Story 4 (sqlExpander placeholder) is fully independent of all of the above — different file, no shared code — and can be built in parallel with Phases 2–5 by a different contributor if desired.

## Phase 1: Setup

- [X] T001 Confirmed dev fixtures current + baseline suite state before starting. RESULT: `npm run dev:fixtures` ran clean; full pre-existing suite state noted for later diffing.

## Phase 2: Foundational (blocking prerequisites for US1, US2, US3)

**Purpose**: The core baseline-resolution mechanism in `state/appState.ts`, plus the hook that exposes it reactively. Nothing in US1–US3 can be built or tested without this.

- [X] T002 In `src/state/appState.ts`, added the module-level `let explicitBaseline: string | null = null` pointer (data-model.md).
- [X] T003 In `src/state/appState.ts`, implemented `setBaseline(name: string): void` — throws on an unregistered name, sets `explicitBaseline = name`, calls `notify()`.
- [X] T004 In `src/state/appState.ts`, implemented `getBaseline(): string | undefined` — the three-step resolution rule, computed fresh on every call, no caching.
- [X] T005 [P] Created `src/hooks/useBaseline.ts` — `useSyncExternalStore(subscribe, getBaseline)`, no memoization cache.
- [X] T006 [P] Extended `tests/unit/appState.test.ts` with a new `describe('appState.getBaseline / setBaseline')` block (9 tests): zero-scenario undefined, throw-on-unregistered, mutual exclusivity + idempotent re-mark, automatic default excluding pinned, default not moving as more load, `status: 'ready'` gating, explicit-can-target-pinned, removal fallback, removal-of-non-baseline no-op. RESULT: 16/16 tests pass in this file (6 pre-existing + 10 new/adjacent from this feature — see also T014).

**Checkpoint**: `getBaseline()`/`setBaseline()` are fully correct and unit-tested in isolation — verified via `npx vitest run tests/unit/appState.test.ts`, 16/16 pass.

---

## Phase 3: User Story 1 - Analyst marks a scenario as baseline via the UI (Priority: P1) 🎯 MVP

**Goal**: A viewer can see and set the baseline designation from the real, running `ScenarioLoader` component.

**Independent Test**: Load two or more scenarios, mark one as baseline via the scenario list UI, confirm exactly that one is shown as baseline; mark a different one, confirm the designation moved.

- [X] T007 [US1] Widened the rendered scenario list in `src/layout/scenarioLoader.tsx` from local-only to `appState.list()` (every registered scenario); existing remove (`X`) button stays gated on `source === 'handle'`, unchanged.
- [X] T008 [US1] Added a baseline-marking `Star` icon button (`Button variant="ghost" size="icon"`) to each row — `onClick` calls `appState.setBaseline(scenario.name)` directly.
- [X] T009 [US1] Wired `useBaseline()` in `scenarioLoader.tsx`; the matching row's star renders filled + `text-primary` (a real Tailwind-mapped token — `text-brand-wfrc-blue` was tried first and found NOT to be a valid utility class in this project's `tailwind.config.js`, corrected to `text-primary`, which resolves to the same brand-blue value via `--primary: var(--brand-wfrc-blue)`).
- [X] T010 [US1] **File-path correction**: no `tests/integration/scenarioLoader.spec.ts` exists — the real, existing 009-scenario-manager integration file is `tests/integration/scenarioManager.spec.ts` (confirmed via directory listing before writing any test, per this project's own discipline). Added a new `test.describe('018-baseline-scenario-designation')` block there, `User Story 1` sub-block: mark/re-mark/mutual-exclusivity test. RESULT: passes on first run.

**Checkpoint**: Explicit baseline marking is fully working and independently demonstrable end-to-end through the real UI — this alone is a shippable MVP slice of the feature. Verified: `npx playwright test tests/integration/scenarioManager.spec.ts`, 17/17 pass (12 pre-existing + 5 new across US1-US3).

---

## Phase 4: User Story 2 - Automatic default baseline with zero clicks (Priority: P2)

**Goal**: Confirm, through the real UI, that a viewer who never touches the baseline control still sees a sensible default.

**Independent Test**: Load a scenario without ever touching the baseline control; confirm it is shown as baseline. Load a second scenario; confirm the designation does not move to it.

**Note**: No new production code — `getBaseline()`'s automatic-default branch (T004) and its visual display (T009) already implement this completely. This phase is proof, not implementation.

- [X] T011 [US2] Added to `tests/integration/scenarioManager.spec.ts`'s new `018-baseline-scenario-designation` block: confirms `good_scenario` (published, non-pinned, ready at boot) resolves as baseline automatically with zero clicks, and stays put after loading a further local scenario. RESULT: passes.
- [X] T012 [US2] Same block: confirms `observed` (pinned) is never shown as baseline automatically — its own star renders in the not-baseline state right alongside `good_scenario`'s baseline-marked one, both checked in the same assertion. RESULT: passes — exercises the real, always-`observed`-registered-first fixture behavior directly (research.md §1), not a synthetic setup.

**Checkpoint**: The automatic-default rule is proven correct both in isolation (Phase 2's unit tests, T006) and through the real, running UI (T011/T012).

---

## Phase 5: User Story 3 - Removing the baseline scenario falls back cleanly (Priority: P2)

**Goal**: Removing the scenario currently marked baseline never leaves a dangling reference, and resolves via the same automatic-default rule already proven in Phases 2 and 4 — not a new, separate rule.

**Independent Test**: Explicitly mark a locally-loaded scenario as baseline, remove it via the existing remove control, confirm the baseline designation does not still reference it and instead matches the automatic-default rule applied to what's left.

- [X] T013 [US3] Added the one new line to `unregister()` in `src/state/appState.ts`: clears `explicitBaseline` to `null` when it equals the removed `name`, before deleting the Map entry.
- [X] T014 [P] [US3] Extended `tests/unit/appState.test.ts` (folded into T006's same new describe block, not a separate one) with: removal-triggers-fallback, removal-of-the-only-remaining-scenario → `undefined`, and removal-of-a-non-baseline-scenario → unaffected. RESULT: included in the 16/16 passing.
- [X] T015 [US3] Added to `tests/integration/scenarioManager.spec.ts`'s new block, `User Story 3` sub-block: two tests — removal of the explicit baseline falls back to the automatic default; removal of a non-baseline scenario leaves it unaffected. RESULT (real bug caught and fixed during this task): the second test's initial version assumed `good_scenario` was NOT yet baseline and tried to click a "Mark good_scenario as baseline scenario" button — that label never existed at that point in the test, because `good_scenario` is ALREADY the automatic default baseline the moment it registers `ready` at boot (Phase 4/US2's own behavior), before any local scenario is even loaded. `locator.click` timed out waiting for a button whose aria-label was already `"good_scenario is the baseline scenario"` instead. Fixed by asserting the already-`true` state directly rather than clicking. Confirmed via isolated re-run, then the full file, both green.

**Checkpoint**: The full explicit-mark → automatic-default → removal-fallback lifecycle is proven correct at both the unit and real-UI layers, satisfying the user's own explicitly-flagged open edge case in full. Verified: 17/17 in `scenarioManager.spec.ts`.

---

## Phase 6: User Story 4 - `$baseline.<metric>` SQL placeholder (Priority: P3)

**Goal**: A dashboard author can reference "the baseline scenario" generically in SQL, resolved at query time — proven via a direct test of the expander, not any real chart.

**Independent Test**: Author a query fragment containing the new placeholder for a known metric; with a known scenario marked baseline, confirm the expanded SQL text references that exact scenario's view — and confirm it updates correctly after the baseline designation changes.

**Note**: Fully independent of Phases 2–5 (different file, no shared code) — can be built in parallel with any of them.

- [X] T016 [P] [US4] Added `baseline` to `PLACEHOLDER_RE`'s kind alternation in `src/services/sqlExpander.ts`.
- [X] T017 [P] [US4] Added the new optional 6th parameter `baselineScenario?: string` to `expand()`'s signature, and `case 'baseline': return expandBaseline(baselineScenario, name)` in its switch.
- [X] T018 [US4] Implemented `expandBaseline(baselineScenario, metric)` — returns `` `"${baselineScenario}__${metric}"` `` when set, throws via `missing()` when `undefined`.
- [X] T019 [US4] Added 3 tests to `tests/unit/sqlExpander.test.ts`: correct single-scenario resolution, same-template-tracks-a-later-baseline-change, throws clearly when unresolved. Also added a 4th (`does not require a leading FROM keyword`, matching `$sql.x`'s own bare-reference convention) beyond what this task originally scoped, since it directly proves FR-008's "single-table reference usable inside a JOIN" requirement.
- [X] T020 [P] [US4] Added a dedicated regression test re-running this file's very first (SC-004) expansion assertion byte-for-byte with the pre-existing 4/5-argument call shape — direct proof of research.md §5's finding, not merely relying on the rest of the suite's implicit coverage.

**Checkpoint**: The placeholder mechanism is complete and independently proven — ready for a future feature to wire a real panel-config key to it, with no further changes needed to `sqlExpander.ts` itself. Verified: 19/19 in `sqlExpander.test.ts` (14 pre-existing + 5 new).

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T021 Confirmed `013-zonemap-panel`'s `comparison: diff` coverage completely unaffected: `npx vitest run tests/unit/panelQuery.test.ts` (31/31 pass), `npx playwright test tests/integration/zonemapPanel.spec.ts` (both `comparison: diff` tests specifically pass; one unrelated test in the same file — "an unreachable basemap still renders the choropleth" — failed on the first full-file run and passed cleanly in isolation, the same pre-existing network-timing flakiness pattern documented repeatedly earlier this session, unrelated to this feature).
- [X] T022 [P] Added a `$baseline.x` row to `project-docs/GRAMMAR.md`'s "SQL placeholder reference" table, plus a dedicated caveat paragraph immediately below it stating plainly that no `dashboard-*.yaml` key can reach the placeholder yet (FR-011) — judged necessary beyond just the table row, since the table's own "Where used" column would otherwise misleadingly imply present-day author usability.
- [X] T023 [P] Updated `CLAUDE.md`'s file-tree notes for `state/appState.ts`, `hooks/` (new `useBaseline.ts` entry, inserted before `useColorScheme.ts`'s own block — this required converting that entry's closing `└──` to `├──` since it was previously the list's last item), `services/sqlExpander.ts`, and `layout/scenarioLoader.tsx`.
- [X] T024 Full regression: `npx tsc --noEmit` clean; `npx vitest run` 227/227 pass; `npx playwright test` 193/194 pass (the one failure — `dashboardShell.spec.ts`'s dark-mode plotly re-query-count test — confirmed via `git stash`/re-run against the clean pre-feature commit to be a PRE-EXISTING, unrelated failure, reproducing identically with none of this feature's changes present; restored via `git stash pop` immediately after confirming); `npm run build` clean (pre-existing chunk-size warnings only, unrelated).
- [X] T025 `quickstart.md`'s four scenarios are covered 1:1 by T006/T014 (unit) and T010–T012/T015 (integration), all passing. `spec.md`'s Status field updated to RESOLVED with a full completion summary.

## Dependencies & Execution Order

- **Phase 1 (Setup)** → no dependencies, run first.
- **Phase 2 (Foundational)** → depends on Phase 1; blocks Phases 3, 4, 5 (US1/US2/US3 all read `getBaseline()`/`setBaseline()`/`useBaseline()`). Does NOT block Phase 6 (US4 touches a different file entirely).
- **Phase 3 (US1)** → depends on Phase 2. Delivers the MVP slice.
- **Phase 4 (US2)** → depends on Phase 2 AND Phase 3 (T009's visual-indicator rendering is what US2's own tests observe) — test-only phase, no new production code.
- **Phase 5 (US3)** → depends on Phase 2 AND Phase 3 (same reason as Phase 4) — T013 is Phase 5's only production-code task.
- **Phase 6 (US4)** → depends only on Phase 1. Independent of Phases 2–5 — may run in parallel with any of them.
- **Phase 7 (Polish)** → depends on all of Phases 2–6 being complete.

## Parallel Execution Examples

- T005 (`useBaseline.ts`) and T006 (appState unit tests) can run in parallel with each other once T002–T004 land, since they touch different files.
- Phase 6 (T016–T020) can run entirely in parallel with Phases 2–5 — different contributor, different file, zero shared code (research.md §5's own "zero-touch" finding is what makes this safe).
- T022 and T023 (documentation) can run in parallel with each other and with T024 (regression suite) once T007–T020 are all complete.

## Implementation Strategy

**MVP first**: Phases 1–3 (Setup, Foundational, US1) alone deliver a fully working, viewer-facing explicit-baseline-marking feature — independently demonstrable and shippable before Phases 4–7 exist. Phases 4–5 then prove the two behaviors (automatic default, removal fallback) that were already implemented by Phase 2/3's own code, but not yet exercised through the real UI. Phase 6 (the SQL placeholder) can be delivered whenever convenient — before, during, or after Phases 3–5 — since it shares no code with them.
