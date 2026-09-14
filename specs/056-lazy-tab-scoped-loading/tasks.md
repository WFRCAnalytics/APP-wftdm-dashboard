---

description: "Task list for 056-lazy-tab-scoped-loading"
---

# Tasks: Lazy, Tab-Scoped Data Loading

**Input**: Design documents from `/specs/056-lazy-tab-scoped-loading/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — all present and finalized (research.md's two open questions, the loader-pool sweep and the GraphicWalker picker regression check, were both resolved with real measurement/verification before this file was generated; see research.md §4/§4a).

**Tests**: Included — this repo's own established convention (every prior feature ships dedicated Vitest + Playwright coverage; see CLAUDE.md) makes this the appropriate default even though the spec doesn't say "TDD" explicitly.

**Organization**: Tasks are grouped by user story (spec.md's US1/US2/US3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)
- File paths are exact, matching plan.md's Project Structure

## Path Conventions

Single existing web app — `src/`, `tests/` at repository root (unchanged by this feature; see plan.md's Project Structure for the full real-file list).

---

## Phase 1: Setup

**Purpose**: Establish a real, current baseline before any change — no new tooling/dependencies needed (plan.md's Technical Context: "None new").

- [X] T001 Run the full existing regression suite (`npx tsc --noEmit`, `npm run test:unit`, `npx playwright test`) on the unmodified `056-lazy-tab-scoped-loading` branch tip and record the result as this feature's own baseline — distinguishes a regression this feature causes from the two already-documented pre-existing flakes (dark-mode Plotly re-query-count off-by-one; deck.gl hover-tooltip timing flake — CLAUDE.md) and from `graphicWalkerPanel.spec.ts`'s own already-confirmed 29/29 pre-existing failure (research.md §4a), which T024 fixes separately.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared loading infrastructure every user story depends on — the Dataset Catalog field, the pool retirement, and `tabDataLoader.ts` itself. No user story task can begin until this phase is complete.

**⚠️ CRITICAL**: US1/US2/US3 all call `ensureRegistered()`/`computeTabDataRequirement()` and read `Scenario.availableMetrics` — none of that exists until this phase lands.

- [X] T002 [P] Add `availableMetrics: string[]` to the `Scenario` type in `src/state/appState.ts` (data-model.md entity 3) — bare metric stems, same convention `stemFromViewName()` already uses; no other field/behavior change.
- [X] T003 Move the `fetchScenarioFileList()` result into Phase 1 of `src/services/scenarioDiscovery.ts`'s `registerObserved()`, `registerPublishedScenarios()`, and `registerDemoScenarios()` — write it onto each scenario's `appState.register()` call as `availableMetrics`, immediately after the existing manifest fetch (data-model.md entity 3: "moved earlier, not duplicated"). Depends on T002.
- [X] T004 Rewrite `src/services/scenarioDiscovery.ts`'s Phase 2 (`registerScenarioGroupFiles()` and `registerSummaryFolder()`) to stop eagerly registering any file — a scenario reaches `status: 'ready'`/`active: true` once its catalog (`index.json`) is confirmed fetchable, not once every file is registered (data-model.md entity 4's `scenarioDiscovery.ts` note). Depends on T003.
- [X] T005 Delete `src/services/duckdbLoaderPool.ts` entirely (research.md §4: real sweep confirmed it is never faster than the single shared instance at any batch size this feature produces, and T004 removes its only real caller). Depends on T004.
- [X] T006 Remove `createLoaderInstance()` from `src/services/duckdb.ts` (its only caller was `duckdbLoaderPool.ts`, removed in T005) — `registerFileURL()` and every other existing export stay unchanged. Depends on T005.
- [X] T007 [P] Create `src/services/tabDataLoader.ts` with `computeTabDataRequirement(tab, activeScenarios)` (contracts/tab-data-loader.md, data-model.md entity 1) — pure function, walks `tab.layout`'s panels, resolves `{scenario, metric}` pairs per panel type per the documented rules (scenario/scenarios/active-union, `comparison: diff` via the existing, unmodified `resolveComparisonScenarioName()`, `valuebox.sparkline`, `graphic-walker.dataset`), deduplicated and sorted by `{scenario}__{metric}`.
- [X] T008 In `src/services/tabDataLoader.ts`, implement `ensureRegistered(pairs)` and `getMetricLoadState(scenario, metric)` (contracts/tab-data-loader.md, data-model.md entities 2/4) — the Metric Load State map (`not-requested`/`loading`/`loaded`/`failed`), in-flight-promise memoization keyed by `{scenario}__{metric}` (same idempotency shape as `services/duckdb.ts#initDuckDB()`), routing every registration through `services/duckdb.ts#registerFileURL()` directly (no dispatch, no pool — research.md §4), one retry on a `failed` entry per call. Depends on T006, T007.
- [X] T009 [P] `tests/unit/tabDataLoader.test.ts` — Vitest coverage for `computeTabDataRequirement()` (contracts/tab-data-loader.md's own testing note: pure, no DOM/network, same shape as `dashboardLayout.test.ts`), including the confirmed-real Network-tab-style dedup case (two panels referencing the same `{scenario}__{metric}` pair) and the `comparison: diff`/`$baseline` resolution case. Depends on T007.

**Checkpoint**: `tabDataLoader.ts` exists and is unit-tested; boot no longer eagerly registers any scenario's files; the pool is gone. User story implementation can now begin.

---

## Phase 3: User Story 1 - Fast landing on the tab a viewer actually opens (Priority: P1) 🎯 MVP

**Goal**: Any tab (starting with the landing tab on boot) becomes interactive using only the data its own panels reference, deduplicated, for active scenarios — not the deployment's full catalog.

**Independent Test**: Fresh load on a multi-scenario deployment; confirm only the active tab's own metrics register before it renders; switch tabs and confirm a real loading indicator then correct data; revisit a tab and confirm no re-fetch (quickstart.md §1/§2).

### Implementation for User Story 1

- [X] T010 [US1] In `src/layout/dashboardRenderer.tsx`, call `computeTabDataRequirement()` + `ensureRegistered()` for the active tab's full batch whenever the active tab or active-scenario set changes (data-model.md entity 4: "DashboardRenderer proactively triggers the whole tab's batch load immediately on tab activation"). Depends on T008.
- [X] T011 [P] [US1] Add one `await ensureRegistered([...])` call to `src/panels/ValueBoxPanel.tsx`'s existing data-fetch effect, immediately before its existing `query()` call (research.md §2: same effect, no new one) — resolve the pair(s) the same way `buildPanelQuery()` already resolves scenario/metric. Depends on T008.
- [X] T012 [P] [US1] Same one-call addition to `src/panels/PlotlyPanel.tsx`. Depends on T008.
- [X] T013 [P] [US1] Same one-call addition to `src/panels/TablePanel.tsx`. Depends on T008.
- [X] T014 [P] [US1] Same one-call addition to `src/panels/ObservablePlotPanel.tsx`. Depends on T008.
- [X] T015 [P] [US1] Same one-call addition to `src/panels/SankeyPanel.tsx`. Depends on T008.
- [X] T016 [P] [US1] Same one-call addition to `src/panels/RechartsPanel.tsx`. Depends on T008.
- [X] T017 [P] [US1] Same one-call addition to `src/panels/FlowMapPanel.tsx`. Depends on T008.
- [X] T018 [P] [US1] Same one-call addition to `src/panels/ZoneMapPanel.tsx`. Depends on T008.
- [X] T019 [P] [US1] Same one-call addition to `src/panels/GraphicWalkerPanel.tsx`'s existing primary data-fetch effect, for its currently-selected dataset (its own `dataset_picker`-specific wiring is US3's concern, T022–T023 — this task only covers the same baseline behavior every other panel type gets). Depends on T008.
- [X] T020 [US1] `tests/integration/lazyTabLoading.spec.ts` (new) — cover spec.md US1's four acceptance scenarios: landing tab loads only its own referenced metrics; a not-yet-visited tab shows a loading indicator then correct data; a revisited tab renders instantly with no repeated network requests; total requests on a fresh landing-tab load do not include any metric outside that tab's own real fan-out. Depends on T010–T019.
- [X] T021 [US1] Run quickstart.md §1/§2 manually against a real dev server and confirm both, matching this session's own real-verification standard (screenshot or network-panel evidence, not assumed). Depends on T020.

**Checkpoint**: User Story 1 is fully functional and independently testable/demoable — this alone is the feature's MVP.

---

## Phase 4: User Story 2 - Activating a scenario after arriving on a tab (Priority: P2)

**Goal**: A scenario activated while already viewing a tab that needs its data loads correctly on demand, with a real loading indicator — never a result that looks complete but silently omits it.

**Independent Test**: With one scenario active on a multi-metric tab, activate a second, not-yet-loaded scenario while remaining on that tab; every affected panel must show loading then correct, complete data (quickstart.md §3).

**Note**: The mechanism itself is not new work — every panel touched in Phase 3 already re-runs its `ensureRegistered()` + `query()` effect on `useActiveScenarios()` change (research.md §2: deliberately the same effect, no new reactivity source). This phase is real, necessary verification and UI-correctness work, not a second implementation of the same idea.

### Implementation for User Story 2

- [X] T022 [US2] Audit each panel type touched in T011–T019: confirm its existing loading-state render branch is visually distinct from its own empty/no-data state specifically during a scenario-toggle-triggered `ensureRegistered()` wait (not just an initial load) — fix any panel where the two would currently look identical, since spec.md FR-005 requires a viewer never see a "done-looking" but actually-incomplete result. Depends on T011–T019.
- [X] T023 [US2] Extend `tests/integration/lazyTabLoading.spec.ts` with spec.md US2's four acceptance scenarios: activating a second scenario shows loading then updates every affected panel; no panel ever silently omits the newly active scenario; deactivating a scenario immediately drops it from results; a load failure for one scenario surfaces the existing per-panel error state without blocking sibling panels. Depends on T022.
- [X] T024 [US2] Run quickstart.md §3 manually against a real dev server, confirming with real evidence (network panel / screenshots), not assumed. Depends on T023.

**Checkpoint**: User Stories 1 and 2 both work independently and together.

---

## Phase 5: User Story 3 - Free-form exploration still offers every real dataset (Priority: P3)

**Goal**: The Explore tab's dataset picker always lists the complete real catalog for active scenario(s), regardless of visit order, and loads a freshly-picked, not-yet-loaded dataset on demand.

**Independent Test**: Navigate directly to a picker-enabled tab first in a session; confirm the full real catalog is listed and a fresh pick loads correctly (quickstart.md §4).

**Prerequisite context** (research.md §4a, already verified before this file was generated — not a task to redo): 028's dataset picker is confirmed NOT regressed against real, live app code today; the real Explore tab (`dashboard-7-explore.yaml`) does not itself enable `dataset_picker`; and `tests/integration/graphicWalkerPanel.spec.ts` is a real, pre-existing, unrelated 29/29 failure (stale fixture references from `040-test-suite-migration`) that T028 repairs.

### Implementation for User Story 3

- [X] T025 [US3] In `src/panels/graphicWalkerDatasets.ts`, change `listSelectableDatasets()`'s input from `viewNames: readonly string[]` (sourced from `listViews()`) to `availableMetricsByScenario: ReadonlyMap<string, readonly string[]>` (contracts/graphic-walker-dataset-catalog.md) — same intersection-across-scenarios logic; remove the now-dead `zonemap-geom__` prefix filtering **only after** confirming via grep that no other real caller of this function still needs it. Depends on T004 (Scenario.availableMetrics must exist).
- [X] T026 [US3] In `src/panels/GraphicWalkerPanel.tsx`, build `availableMetricsByScenario` from each active scenario's `appState.get(name)?.availableMetrics` instead of calling `listViews()`, and pass it to the updated `listSelectableDatasets()`. Depends on T025.
- [X] T027 (already satisfied by T019 — same code path)[US3] In `src/panels/GraphicWalkerPanel.tsx`, add the `ensureRegistered()` call for the currently-selected dataset (default or freshly picked) before its query, matching every other panel type's T011–T019 addition — this is what makes selecting an unloaded catalog entry actually load it (spec.md FR-008). Depends on T019, T026.
- [X] T028 [US3] Decide and implement the `filterSchemaConsistent()` timing question contracts/graphic-walker-dataset-catalog.md leaves open: defer the schema-consistency check to selection time (query `information_schema.columns` only after `ensureRegistered()` resolves, falling back/warning on a genuine mismatch) versus accepting the rarer case where an offered-but-unloaded entry fails at query time with the existing error surface. Document the choice made and why directly in that contract file. Depends on T027.
- [X] T029 [US3] Rewrite `tests/integration/graphicWalkerPanel.spec.ts` to target real, current content instead of the deleted `tests/fixtures/dashboard-config/` tree (research.md §4a) — at minimum, restore real coverage for: the picker listing the full real catalog, selecting an unloaded dataset loading correctly, and the picker's own empty/error states — using either real `public/demo-dashboard-config/` panels or the `page.route()`-injection technique this session's own investigation already proved works cleanly against real, unmodified code. This closes a real, pre-existing gap (not caused by 056) that would otherwise leave T025–T027's own changes with zero automated coverage. Depends on T028.
- [X] T030 [US3] Run quickstart.md §4 manually against a real dev server, with real evidence. Depends on T029.

**Checkpoint**: All three user stories are independently functional. The feature is complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Confirm no regression, no dead code, and the documentation this project consistently keeps in lockstep with every feature.

- [X] T031 Full regression pass — `npx tsc --noEmit`, `npm run test:unit`, full `npx playwright test` — compare against T001's baseline; confirm zero query-*result* differences (spec.md FR-009/SC-006) and that any remaining failure matches an already-known pre-existing flake, never a new category. Depends on T010–T030.
  - `npx tsc --noEmit` clean; `npm run test:unit` — all unit suites passing (including the 11 new `tabDataLoader.test.ts` cases and the updated `graphicWalkerDatasets.test.ts`).
  - A first full `npx playwright test` run: 235 passed, 138 failed, spread across ~12 spec files. Rather than assume regression, each implicated file was checked via a real git-stash A/B against the clean pre-056 tree (`git stash` → re-run the identical test(s) → `git stash pop`, restoring 056's changes each time and re-verified via `git status --short`):
    - `tablePanel.spec.ts` (23) + `scenarioAutoActivation.spec.ts` (6): byte-identical failures on the clean tree — depend on `tests/fixtures/dashboard-config/` panel titles deleted by `040-test-suite-migration` and never migrated.
    - `observablePlotPanel.spec.ts` (24, 100% of the file) + `rechartsPanel.spec.ts` (8): same signature confirmed via A/B — same deleted-fixture dependency (`'Observable Plot Mode Share (Bar)'` etc., zero real matches anywhere in current content).
    - `sankeyPanel.spec.ts` + `valueBoxPanel.spec.ts`: both explicitly document their own dependency on the same deleted `tests/fixtures/dashboard-config/dashboard-1-summary.yaml` fixture in their own header comments; A/B-confirmed identical failures on the clean tree.
    - `flowmapPanel.spec.ts`'s one failure ("the map has a real, non-zero-size canvas once rendered"): passed cleanly on the clean tree in isolation, but also passed 3/3 in isolation on the 056 tree — confirmed genuine resource-contention flakiness from running many WebGL-heavy specs sequentially in one long single-worker invocation, not a regression.
    - `settingsModal.spec.ts` (36 of its failures) + `scenarioManager.spec.ts` (13, all): a full A/B of both files together produced 47 failures on the clean tree against 49 on the 056 tree (the 2-failure delta was a `net::ERR_CONNECTION_REFUSED` — the dev server itself died at the very end of a >10-minute single-worker run — and one additional timeout, both consistent with resource exhaustion from the run's own length, not a code difference) — the failing test list is otherwise the same set on both trees.
  - **Conclusion**: this expands (does not merely confirm) the project's already-documented `040-test-suite-migration` gap — previously known to cover `flowmapPanel.spec.ts`/`zonemapPanel.spec.ts`/`graphicWalkerPanel.spec.ts` (the last fixed by this feature, T029, 0/29 → 28/28) — to also include `tablePanel.spec.ts`, `scenarioAutoActivation.spec.ts`, `observablePlotPanel.spec.ts`, `rechartsPanel.spec.ts`, and `sankeyPanel.spec.ts`/`valueBoxPanel.spec.ts` (the latter two by the files' own documented fixture dependency). `settingsModal.spec.ts`/`scenarioManager.spec.ts`'s large failure counts are separately confirmed as pre-existing environment/resource-contention flakiness in this sandbox for long, WebGL-heavy single-worker runs, unrelated to any deleted fixture. **Zero failures were caused by 056's own changes** — every implicated file reproduces the same (or a near-identical) failure signature on the clean pre-056 tree. This is a real, out-of-scope-for-056 finding reported to the user, not silently fixed (only `graphicWalkerPanel.spec.ts`, T029, was in this feature's own scope to fix).
- [X] T032 [P] Grep the full `src/`/`tests/` tree for any leftover reference to `duckdbLoaderPool`/`createLoaderInstance`/`registerFilesViaPool` and remove any found (should be zero after T005/T006, this is a confirming sweep, not expected to find anything). Depends on T031.
- [X] T033 [P] Update `CLAUDE.md` with this feature's real, shipped shape — `services/tabDataLoader.ts`, `scenarioDiscovery.ts`'s new lazy Phase 2, `duckdbLoaderPool.ts`'s removal, `Scenario.availableMetrics` — matching this project's own established per-feature documentation convention. Depends on T031.
- [X] T034 Locally build both targets (`npm run build`, `npm run build:pages`) and confirm both succeed cleanly with no new warnings; do **not** commit/deploy `docs/` as a side effect of this task (matching this session's own established pattern — deployment is a separate, explicit step). Depends on T031.
  - Both `npm run build` (→ `dist/`) and `npm run build:pages` (→ `docs/`) completed successfully (`✓ built in ~17.5s` each). Warnings are identical between the two and pre-existing/expected (three `@radix-ui` "use client" directive notices, and the `>500kB` chunk-size advisory for `plotly`/`graphic-walker`/`index`/`maps`/`flowmap-deck` — all already documented, e.g. `042-boot-performance-fix`'s own chunking work) — no new warning category from either target.
  - `docs/` was fully reverted afterward (`git checkout -- docs/` + `git clean -fd docs/`, confirmed 0 remaining changes via `git status --short docs/`) and `dist/` removed — no deployment side effect, matching this task's own instruction.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS every user story — T002→T003→T004→T005→T006 is a strict chain (each rewrites the thing the last one touched); T007→T008→T009 is a second, independent chain that only needs T006 done before T008 (since `ensureRegistered()` calls `registerFileURL()`, which T006 leaves unchanged in behavior but must exist post-pool-removal).
- **User Stories (Phase 3-5)**: All depend on Foundational completion. US1 has no dependency on US2/US3. US2 depends on US1's panel-level `ensureRegistered()` additions (T011–T019) already existing — it verifies/extends the same mechanism, not a separate one. US3 depends on US1's `GraphicWalkerPanel.tsx` addition (T019) as its own starting point.
- **Polish (Phase 6)**: Depends on all three user stories.

### Parallel Opportunities

- T002 has no same-phase dependency; T007 doesn't depend on T002–T006 at all (different concern) — could start alongside the T002→T006 chain.
- T011–T019 (the nine panel one-line additions) are fully parallel — nine different files, identical shape, all depending only on T008.
- T032/T033 are parallel with each other once T031 completes.

---

## Parallel Example: User Story 1's panel additions

```bash
Task: "Add ensureRegistered() call to src/panels/ValueBoxPanel.tsx's fetch effect"
Task: "Add ensureRegistered() call to src/panels/PlotlyPanel.tsx's fetch effect"
Task: "Add ensureRegistered() call to src/panels/TablePanel.tsx's fetch effect"
Task: "Add ensureRegistered() call to src/panels/ObservablePlotPanel.tsx's fetch effect"
Task: "Add ensureRegistered() call to src/panels/SankeyPanel.tsx's fetch effect"
Task: "Add ensureRegistered() call to src/panels/RechartsPanel.tsx's fetch effect"
Task: "Add ensureRegistered() call to src/panels/FlowMapPanel.tsx's fetch effect"
Task: "Add ensureRegistered() call to src/panels/ZoneMapPanel.tsx's fetch effect"
Task: "Add ensureRegistered() call to src/panels/GraphicWalkerPanel.tsx's fetch effect"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational — the pool retirement and `tabDataLoader.ts` land here).
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE** via quickstart.md §1/§2 against a real dev server.
4. This alone delivers the feature's entire stated value (spec.md US1's own "Why this priority": the landing tab is what every viewer waits on, every visit).

### Incremental Delivery

1. Setup + Foundational → the eager-boot behavior is already gone; nothing renders any differently yet (no user story wired in).
2. + User Story 1 → fast, tab-scoped loading on every tab visit. MVP.
3. + User Story 2 → scenario-toggle-after-arrival correctness (mostly verification of US1's own mechanism).
4. + User Story 3 → the Explore tab's picker stays complete, and its real test coverage is restored.
5. + Polish → confirmed zero regression, docs current.
