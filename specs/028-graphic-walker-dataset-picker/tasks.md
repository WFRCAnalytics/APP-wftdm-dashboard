---

description: "Task list for 028-graphic-walker-dataset-picker"
---

# Tasks: Viewer-Selectable Dataset Picker for Graphic Walker Panels

**Input**: Design documents from `/specs/028-graphic-walker-dataset-picker/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/graphic-walker-dataset-picker.md, quickstart.md (all present)

**Tests**: Included — this codebase's established convention (every prior panel-type feature) pairs pure-module Vitest tests with Playwright integration tests; no explicit TDD ordering is required, but tests are written alongside/before the UI wiring they verify.

**Organization**: Tasks are grouped by user story (spec.md: US1 P1, US2 P2, US3 P3) so each can be implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3, per spec.md's priorities
- File paths are exact and repo-relative

---

## Phase 1: Setup (fixture data)

**Purpose**: Prepare the fixture dashboard config every later story's tests read from. Pure YAML edits — no source code dependency, so this can run before any implementation exists.

- [X] T001 [P] In `tests/fixtures/dashboard-config/dashboard-2-detail.yaml`, add two new `graphic-walker` panels alongside the existing six (014-era) ones, following the file's existing panel-list shape: `"Free-form Visual Analytics (Dataset Picker)"` (`dataset: trip_mode_share`, `scenario: good_scenario`, `dataset_picker: true`) and `"Free-form Visual Analytics (Dataset Picker, Multi-Scenario)"` (`dataset: summary_kpis`, `dataset_picker: true`, no `scenario:` pin) — per quickstart.md.
- [X] T002 [P] In the same file, add a third, deliberately-broken picker panel, `"Free-form Visual Analytics (Dataset Picker, No Match) (intentional)"` (`dataset: summary_kpis`, `scenario: nonexistent_scenario_zzz`, `dataset_picker: true`), matching the file's existing `(intentional)` broken-fixture naming convention — exercises the zero-selectable-datasets edge case (spec.md Edge Cases) with no new scenario data needed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The config field and the pure filtering logic every user story's UI work depends on.

**⚠️ CRITICAL**: No user story implementation task can begin until this phase is complete.

- [X] T003 Add `dataset_picker?: boolean` to `GraphicWalkerPanelConfig` in `src/layout/types.ts`, with a doc comment per data-model.md §1 (`dataset` stays required unconditionally — research.md §6).
- [X] T004 [P] Implement `listSelectableDatasets(viewNames: readonly string[], scenarioNames: readonly string[]): string[]` in new file `src/panels/graphicWalkerDatasets.ts` (contracts/graphic-walker-dataset-picker.md): returns `[]` when `scenarioNames` is empty; otherwise the alphabetically-sorted set of metric names with a `{scenario}__{metric}` view present for **every** name in `scenarioNames` (intersection, not union — research.md §3), excluding any view whose prefix doesn't match one of `scenarioNames` (excludes `zonemap-geom__*` and similar — research.md §2). **Expanded during implementation** (research.md §3a, a real confirmed gap, not merely anticipated): also added `filterSchemaConsistent(candidates, scenarioNames, columnsByScenario)` in the same file — view existence alone can't detect that a metric's real columns differ across scenarios (confirmed live: `tests/fixtures/generate.py`'s `vmt_by_home_taz` has 2 columns under `observed`, 3 under `good_scenario`), which would make `sqlExpander.ts`'s existing `$scenario.` `UNION ALL` throw the moment it's selected. Stays pure — the caller fetches columns.
- [X] T005 [P] Unit tests in new file `tests/unit/graphicWalkerDatasets.test.ts`: empty `scenarioNames` → `[]`; a metric present for every given scenario is included; a metric present for only some of them is excluded; a `zonemap-geom__{x}` view is never returned even when its suffix coincidentally matches a real metric name; result is alphabetically sorted regardless of input ordering; **plus 4 new tests for `filterSchemaConsistent()`** (no-op at ≤1 scenario, matching signatures kept, differing signatures excluded — the real `vmt_by_home_taz` case, missing-scenario entry excluded). **11/11 passing.**

**Checkpoint**: Foundation ready — `listSelectableDatasets()` is correct and unit-tested in isolation before any UI consumes it.

---

## Phase 3: User Story 1 - Explore any available dataset from one panel (Priority: P1) 🎯 MVP

**Goal**: A viewer can switch a picker-enabled panel to a different dataset and see Graphic Walker re-query and re-render against it, with any prior chart binding reset.

**Independent Test**: Open the `"Free-form Visual Analytics (Dataset Picker)"` fixture panel (pinned to `good_scenario`), pick a different dataset from the picker, and confirm Graphic Walker re-renders with that dataset's real rows/fields and no leftover chart configuration.

### Tests for User Story 1

- [X] T006 [P] [US1] Integration test in `tests/integration/graphicWalkerPanel.spec.ts`: the `"Free-form Visual Analytics (Dataset Picker)"` panel shows its configured default dataset (`trip_mode_share`) on first render, identical in content to a non-picker panel pinned to the same dataset/scenario (014's original behavior unaffected).
- [X] T007 [P] [US1] Integration test in `tests/integration/graphicWalkerPanel.spec.ts`: picking a different entry from that panel's picker re-renders Graphic Walker with the new dataset's own fields (assert the field list changes to match the new dataset's real columns), and any chart the viewer built against the old dataset no longer appears (fresh chart state).
- [X] T008 [P] [US1] Integration test in `tests/integration/graphicWalkerPanel.spec.ts` — **reshaped during implementation**: a literal one-frame "loading div" assertion was judged too timing-fragile (matches 014's own precedent of never testing that transient state directly) to reliably assert; a real regression risk it protects against is more directly proven instead: rapid re-selection (switch twice without awaiting the first) settles on the LAST pick only, never a mix of two datasets' fields — exercises the query effect's own `cancelled` guard.

### Implementation for User Story 1

- [X] T009 [US1] Create `DatasetPicker` in new file `src/panels/graphicWalkerDatasetPicker.tsx`, built on `src/components/ui/dropdown-menu.tsx`'s `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuRadioGroup`/`DropdownMenuRadioItem` (research.md §7, no new dependency) — props `{ current: string; options: string[]; onSelect: (name: string) => void }`; when `options.length === 0`, renders a plain non-interactive label communicating that instead of an empty/broken dropdown (spec.md Edge Cases, contracts).
- [X] T010 [US1] In `src/panels/GraphicWalkerPanel.tsx`, add `selectedDataset` state initialized to `config.dataset`, and derive `scenarioScope` (`config.scenario ? [config.scenario] : activeScenarioNames`) and `availableDatasets` (via `listSelectableDatasets(listViews(), scenarioScope)`, memoized) — depends on T003, T004.
- [X] T011 [US1] In `src/panels/GraphicWalkerPanel.tsx`, change the existing query effect to build its SQL from an effective config (`{ ...config, dataset: selectedDataset }`) passed to the existing, unmodified `buildGraphicWalkerQuery()`, and add `selectedDataset` to the effect's dependency array — depends on T010; contracts/graphic-walker-dataset-picker.md.
- [X] T012 [US1] In `src/panels/GraphicWalkerPanel.tsx`, render `<DatasetPicker current={selectedDataset} options={availableDatasets} onSelect={setSelectedDataset} />` above the embedded `<GraphicWalker>` only when `config.dataset_picker` is true — depends on T009, T010, T011. **`tsc --noEmit` clean. Revised twice after T016's own test surfaced real bugs**: (1) the picker was originally rendered only in the 'ready' branch — moved to render across every status (loading/error/empty/ready) so a viewer can recover from a failing selection; (2) doing so exposed a second, real, pre-existing-shape bug in `graphicWalkerPanel.css`'s `.graphic-walker-panel-host > div` rule — an unscoped direct-child selector that would have force-stretched the picker's own wrapper div to 100% height too — fixed by rescoping it to a new `.graphic-walker-panel-content` wrapper (flex column: picker keeps natural height, content gets `flex: 1; min-height: 0`).

**Checkpoint**: User Story 1 is fully functional and independently testable — the core switch-and-re-render interaction works for a single pinned scenario.

---

## Phase 4: User Story 2 - The picker only ever offers datasets that actually work (Priority: P2)

**Goal**: Every dataset the picker lists is guaranteed real and queryable — no internal plumbing, no partially-available metric, and the list stays correct as the active scenario set changes.

**Independent Test**: With a `zonemap` panel active elsewhere (registering its own internal geometry view) and both `observed`/`good_scenario` active, open the `"...Multi-Scenario"` picker and confirm only the datasets common to both scenarios appear, with no internal view name ever listed.

### Tests for User Story 2

- [X] T013 [P] [US2] Integration test in `tests/integration/graphicWalkerPanel.spec.ts` — **adjusted**: the fixture Detail tab already hosts a `zonemap` panel of its own (`row_baseline_diff`, boundaries: `taz.geoparquet`), no separate Basemaps-tab visit needed; waits on the real `__debugQueryLog()` for its `zonemap-geom__taz.geoparquet` registration query before asserting the `"...Multi-Scenario"` panel's picker never lists it (or any non-scenario-prefixed name).
- [X] T014 [P] [US2] Integration test in `tests/integration/graphicWalkerPanel.spec.ts` — **corrected from the original plan**: a real, confirmed gap (research.md §3a) means the exact list is `['summary_kpis']` alone, not `['summary_kpis', 'vmt_by_home_taz']` as originally assumed — `vmt_by_home_taz` exists in both scenarios but has a genuinely different column count between them, so `filterSchemaConsistent()` excludes it too, alongside the good_scenario-only metrics.
- [X] T015 [P] [US2] Integration test in `tests/integration/graphicWalkerPanel.spec.ts`: every entry listed in either picker-enabled fixture panel, when selected, loads successfully with no error state (a sweep over all currently listed options) — for both the pinned panel (7 options) and the multi-scenario panel (1 option, post schema-consistency filtering).
- [X] T016 [P] [US2] Integration test in `tests/integration/graphicWalkerPanel.spec.ts`: the `"...No Match) (intentional)"` panel (pinned to a nonexistent scenario) renders the picker's empty/disabled state from T009, never a crash or a broken dropdown. **Surfaced a real bug** (see T012's note): the picker was originally only rendered in the 'ready' status branch, so it never appeared at all while this panel's own initial query was failing — fixed by making the picker part of every status branch (loading/error/empty/ready), not just ready.

### Implementation for User Story 2

- [X] T017 [US2] Verify (and fix if T013/T014 surface a gap) that `scenarioScope` in `src/panels/GraphicWalkerPanel.tsx` correctly narrows to `[config.scenario]` when pinned vs. the full active-scenario set otherwise (research.md §5) — depends on T010. **A real gap WAS surfaced and fixed** (research.md §3a): `scenarioScope` narrowing itself was already correct, but the existence-only candidate list it fed into was not sufficient on its own — `availableDatasets` was converted from a `useMemo` to an async `useEffect`+state pair that also calls the new `filterSchemaConsistent()` (querying `information_schema.columns` per scenario) whenever `scenarioScope.length > 1`, closing a confirmed, reachable FR-005 violation (`vmt_by_home_taz`'s real column-count mismatch between `observed`/`good_scenario`).
- [X] T018 [US2] Ensure `availableDatasets` in `src/panels/GraphicWalkerPanel.tsx` recomputes whenever `activeScenarioNames` changes (not only on mount), so the picker's own option list — not just the currently displayed data — stays consistent with scenario activation/deactivation elsewhere in the dashboard (FR-010) — depends on T010. Satisfied by T017's effect — `activeScenarioNames` is in its dependency array.

**Checkpoint**: User Stories 1 and 2 both hold — the picker only ever offers guaranteed-working choices, and stays correct as scenarios are activated/deactivated.

---

## Phase 5: User Story 3 - An author decides, per panel, whether to allow open exploration (Priority: P3)

**Goal**: This capability is strictly additive and opt-in; every pre-existing Graphic Walker panel is unaffected.

**Independent Test**: Confirm every one of the six pre-existing (014-era) fixture panels shows no picker control and renders identically to before this feature.

### Tests for User Story 3

- [X] T019 [P] [US3] Integration test in `tests/integration/graphicWalkerPanel.spec.ts`: each pre-existing 014-era Graphic Walker fixture panel (the six panels documented in that file's own header comment) shows no picker control and renders its single configured dataset exactly as before this feature (FR-002 regression coverage).
- [X] T020 [P] [US3] Integration test in `tests/integration/graphicWalkerPanel.spec.ts`: changing an unrelated global sidebar filter while a picker-enabled panel is showing data does not change that panel's content (confirms FR-009 — 014's own FR-005 filter non-reactivity is unaffected by this feature).

### Implementation for User Story 3

- [X] T021 [US3] Document `dataset_picker` in `project-docs/GRAMMAR.md`'s `type: graphic-walker` section, alongside the existing `dataset:`/`scenario:`/`fields:` keys.

**Checkpoint**: All three user stories are independently functional together.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 [P] Update `CLAUDE.md`'s `panels/GraphicWalkerPanel.tsx` file-tree entry to record this feature's addition (`dataset_picker`, `graphicWalkerDatasets.ts`, `graphicWalkerDatasetPicker.tsx`), matching this project's established per-feature documentation convention. Also updated the `dropdown-menu.tsx` entry (no longer zero-consumer) and the dedicated "Graphic Walker panel" narrative section.
- [X] T023 Ran `npm run test:unit` (292/292 passing) and the full `npx playwright test` suite (250/256 passing; the graphic-walker file itself is 29/29). The 6 failures are all OUTSIDE `graphicWalkerPanel.spec.ts` (dashboardShell.spec.ts's plotly-theme test, flowmapPanel.spec.ts ×2, zonemapPanel.spec.ts ×2, scenarioManager.spec.ts) — confirmed pre-existing via a `git stash`/rerun of exactly those tests against the clean pre-feature commit: 4 reproduce identically (same "Settings button outside viewport" timeout class), the other 2 are the same already-documented ~1-in-3-4 flaky class (didn't reproduce that specific run, on either commit). None touch any file this feature changed.
- [X] T024 Walked through quickstart.md's steps via the automated Playwright coverage above (T006-T020 collectively exercise every quickstart.md scenario: default rendering, switching, exclusion of internal/partial/schema-inconsistent datasets, the empty-picker state, and backward compatibility) rather than a separate manual pass — equivalent real-browser verification, same fixture data.
- [X] T025 [P] `npx tsc --noEmit` — clean, reconfirmed after the full test run.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — pure YAML, can start immediately, even before Phase 2.
- **Foundational (Phase 2)**: No dependency on Phase 1; BLOCKS all of Phase 3–5's implementation tasks (T003/T004 are imported by T010).
- **User Stories (Phase 3–5)**: All depend on Phase 2 completing. Phase 3 (US1) delivers the interaction Phase 4 (US2) hardens and Phase 5 (US3) guards — implement in priority order (P1 → P2 → P3); each phase's own tests can be written in parallel with its implementation tasks.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests marked [P] within a phase can be written/run in parallel with each other.
- T010 (state/derivation) before T011 (query effect) before T012 (render wiring) — same file, sequential.
- T017/T018 (US2) both depend on T010 from US1's phase — US2 cannot start implementation before US1's Phase 3 implementation tasks land, even though US2's *tests* (T013–T016) can be written earlier.

### Parallel Opportunities

- T001/T002 (Setup) in parallel.
- T004/T005 (Foundational) in parallel once T003 lands (T005 tests T004's module).
- T006/T007/T008 (US1 tests) in parallel with each other, and with T009 (different files).
- T013/T014/T015/T016 (US2 tests) in parallel with each other.
- T019/T020 (US3 tests) in parallel with each other and with T021 (docs).
- T022/T025 (Polish) in parallel with each other; T023/T024 run after implementation is complete.

---

## Parallel Example: Foundational + User Story 1 kickoff

```bash
# After T003 lands:
Task: "Implement listSelectableDatasets() in src/panels/graphicWalkerDatasets.ts"
Task: "Unit tests in tests/unit/graphicWalkerDatasets.test.ts"

# Once Foundational is done, US1 tests and the picker control can start together:
Task: "Integration test: default dataset renders unchanged"
Task: "Integration test: switching datasets re-renders with new fields"
Task: "Integration test: loading state during dataset switch"
Task: "Create DatasetPicker in src/panels/graphicWalkerDatasetPicker.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (fixture data) + Phase 2 (Foundational) — the type field and the pure filtering module, unit-tested in isolation.
2. Phase 3 (US1) — wire the picker into `GraphicWalkerPanel.tsx` for the single-pinned-scenario case.
3. **STOP and VALIDATE**: run T006–T008 and quickstart.md steps 1–3 against the `"...Dataset Picker"` fixture panel.
4. This is a demonstrable MVP: a viewer can already switch datasets on one real panel.

### Incremental Delivery

1. Setup + Foundational → pure logic proven correct in isolation.
2. Add US1 → validate independently → the core interaction works.
3. Add US2 → validate independently → the picker's guarantees (no plumbing leakage, no dead-end choices, stays correct as scenarios change) are proven end-to-end, not just at the unit level.
4. Add US3 → validate independently → zero regression on every pre-existing panel, capability documented for authors.
5. Polish → full-suite regression run, docs, typecheck.
