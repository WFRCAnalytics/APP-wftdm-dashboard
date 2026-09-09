---

description: "Task list for 035-scenario-label-color"
---

# Tasks: Scenario Label Propagation & Color Override

**Input**: Design documents from `/specs/035-scenario-label-color/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/scenario-display-resolution.md, quickstart.md

**Tests**: Included throughout, matching this project's established convention (every prior feature — see `034-metric-panel-redesign`, `033-shadcn-default-theme`, etc. — ships unit + Playwright coverage as a normal part of implementation, not an opt-in).

**Organization**: Phase 2 (Foundational) builds the shared `ScenarioDisplayMap` infrastructure both parts consume. Phase 3 (US1, P1) delivers label propagation completely on its own. Phase 4 (US2, P2) adds the color override on top of the SAME already-extended pure functions — each panel-type integration function (`resolveTraces()`/`encodeRechartsData()`/`resolveObservablePlotEncoding()`) is touched once per story (label branch in US1, color branch in US2), never redesigned.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (label propagation) or US2 (color override)
- Paths are repo-relative from `D:\GitHub\APP-wftdm-dashboard`

---

## Phase 1: Setup

- [X] T001 Confirm clean baseline — **DONE**. `npm run typecheck` clean; `npm run test:unit` 403/403 passing (30 files) before any change.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared `ScenarioDisplayMap` read path both US1 and US2 consume. Neither story can begin until this phase is complete.

- [X] T002 [P] Add `colorOverride?: string` field to `Scenario` in `src/state/appState.ts`, plus `setColorOverride(name, color)`/`clearColorOverride(name)` exports mirroring the existing `setLabel()`/`clearLabel()` look-up/throw/mutate/`notify()` shape exactly — **DONE**. Also added `colorOverride: undefined` to `register()`'s initial object literal, matching `label`'s own existing explicit-undefined convention there.
- [X] T003 [P] Create `src/panels/scenarioDisplay.ts` — **DONE**. Pure, dependency-free (no React/appState import): `ScenarioDisplay`/`ScenarioDisplayMap` types, `resolveScenarioLabel(name, display)`, `resolveScenarioColor(name, display)`.
- [X] T004 Create `src/hooks/useScenarioDisplay.ts` — **DONE**. `useSyncExternalStore` over `appState.subscribe()`/`appState.list()`, memoized-cache `getSnapshot` mirroring `hooks/useActiveScenarios.ts`'s own shape exactly (size + per-entry label/color comparison, not identity), resolving `color` as `s.colorOverride ?? s.color`. Includes every REGISTERED scenario, not just active ones (data-model.md §3).
- [X] T005 [P] Create `tests/unit/scenarioDisplay.test.ts` — **DONE**. 6 tests: label present/absent-falls-to-name/name-absent-from-map; color present/absent-returns-undefined/name-absent-from-map.
- [X] T006 Run `npm run typecheck` and `npx vitest run tests/unit/scenarioDisplay.test.ts` — **DONE**. Both clean/passing (6/6).

**Checkpoint**: `ScenarioDisplayMap` infrastructure ready — US1 and US2 can now each proceed independently.

---

## Phase 3: User Story 1 - Scenario labels appear everywhere a name is shown (Priority: P1) 🎯 MVP

**Goal**: `label ?? name` resolves at every confirmed real display surface (spec.md's audit): Plotly trace legends, Recharts chart config labels, Observable Plot legend/axis text, table cell values in a `scenario` column — with zero change to any query/join/state key.

**Independent Test**: Set a custom label on an active scenario; open a Plotly panel (trace split by `$scenario`), a Recharts panel (`series: scenario`), an Observable Plot panel (`fill`/`stroke: scenario`), and a table panel with a `scenario` column; confirm the label — not the raw name — renders in every legend/tooltip/cell, and that `window.__wftdm.__debugQueryLog()` still shows the real name in every SQL statement. Fully testable and shippable with zero US2 work.

### Tests for User Story 1

- [X] T007 [P] [US1] Extend `tests/unit/plotlyTraces.test.ts` — **DONE**. 6 new tests (also covers T020's color cases — landed together since both live in the same conditional branch, see T011/T025 note).
- [X] T008 [P] [US1] Extend `tests/unit/rechartsEncoding.test.ts` — **DONE**. 5 new tests (also covers T021's color cases, same reason).
- [X] T009 [P] [US1] Extend `tests/unit/observablePlotEncoding.test.ts` — **DONE**. 6 new tests, including the original rows-never-mutated assertion (also covers T022's all-or-nothing domain/range cases, same reason).
- [X] T010 [US1] Create `tests/integration/scenarioLabelDisplay.spec.ts` — **DONE**. 5 tests. New fixture row `row_scenario_display` added to `tests/fixtures/dashboard-config/dashboard-1-summary.yaml` — a real, confirmed constraint found while designing it: `summary_kpis` is the ONLY metric with matching columns published under both `good_scenario` and `observed` (`vmt_by_home_taz` is published by both too, but with a real, already-documented 2-vs-3 column mismatch that would make its own `$scenario.` UNION ALL throw). Two real test-authoring bugs found and fixed on first run: (1) `summary_kpis` has 2 rows per scenario, so a labeled scenario's cell text matches twice in the table panel — fixed with `.first()`; (2) `buildPanelQuery()` emits `SELECT *` for a metric-bound panel, so no column name ever appears literally in the logged SQL — the query-log assertion was re-scoped to filter on `UNION ALL` presence instead of a column name.

### Implementation for User Story 1

- [X] T011 [US1] Extend `src/panels/plotlyTraces.ts`'s `resolveTraces()` — **DONE**. Real deviation from the plan: the color branch (T025/FR-007-011) was implemented in the SAME edit, since both live in the same `isScenarioSplit` conditional — see T025's own note; T007/T020's test split still verifies each independently.
- [X] T012 [US1] Extend `src/panels/rechartsEncoding.ts`'s `encodeRechartsData()` — **DONE**. Same real deviation — color branch (T026) landed in the same edit.
- [X] T013 [US1] Extend `src/panels/observablePlotEncoding.ts`'s `resolveObservablePlotEncoding()` — **DONE**. Same real deviation — the domain/range all-or-nothing logic (T027) landed in the same edit, since research.md §4's rule needs the same distinct-scenario-values pass the label substitution already computes.
- [X] T014 [US1] Extend `src/panels/PlotlyPanel.tsx` — **DONE, with a real addition beyond the original plan**: `useScenarioDisplay()` alone wasn't enough for FR-005/FR-012 reactivity without a new query — this panel's data-fetch effect is imperative (`Plotly.react()` inside a `.then()`), so a NEW `lastRowsRef` cache plus a dedicated scenario-display-only re-render effect were added, mirroring the existing theme-only effect's own "re-derive from cached data, no new query" pattern exactly.
- [X] T015 [US1] Extend `src/panels/RechartsPanel.tsx` — **DONE**. Simpler than Plotly: this panel type is fully declarative (`encodeRechartsData()` called directly in the render body from `rows` state) — `useScenarioDisplay()` alone is sufficient, no extra effect needed.
- [X] T016 [US1] Extend `src/panels/ObservablePlotPanel.tsx` — **DONE**. `rows` is already React state consumed by an existing redraw effect — `scenarioDisplay` added to that effect's own dependency array, no new effect needed.
- [X] T017 [US1] Extend `src/panels/TablePanel.tsx` — **DONE** exactly as planned.
- [X] T018 [US1] Run unit tests — **DONE**. 45/45 passing (plotlyTraces 14, rechartsEncoding 10, observablePlotEncoding 21).
- [X] T019 [US1] Run `npx playwright test tests/integration/scenarioLabelDisplay.spec.ts` — **DONE**. 5/5 passing.

**Checkpoint**: User Story 1 fully functional and independently testable/shippable.

---

## Phase 4: User Story 2 - A viewer picks a scenario's own display color (Priority: P2)

**Goal**: Manifest `color` becomes each scenario's real, consistent default color across `plotly`/`recharts`/`observable-plot`; a new Scenarios-tab swatch lets a viewer override it for the session, reflected immediately in every already-rendered panel.

**Independent Test**: Load two scenarios with different manifest colors; confirm consistent per-scenario color across the three panel types with no override set; override one scenario's color from the Scenarios tab; confirm every already-rendered panel updates immediately; clear the override, confirm it reverts. Fully testable without touching US1's own code paths again (only extends the same functions US1 already modified).

### Tests for User Story 2

- [X] T020 [P] [US2] Extend `tests/unit/plotlyTraces.test.ts` — **DONE** (landed together with T007, see that task's note). 2 dedicated color tests: resolved color sets `marker.color`; no resolved color leaves the key absent (asserted via `'marker' in trace === false`, not just `undefined`).
- [X] T021 [P] [US2] Extend `tests/unit/rechartsEncoding.test.ts` — **DONE** (landed together with T008). 2 dedicated color tests: resolved color used in `chartConfig[key].color`; unresolved falls back to `--chart-${tokenNumber}` cycling.
- [X] T022 [P] [US2] Extend `tests/unit/observablePlotEncoding.test.ts` — **DONE** (landed together with T009). 2 dedicated color tests: every distinct scenario resolved → matched `domain`/`range`; even one unresolved → both unset, whole-panel fallback (research.md §4).
- [X] T023 [US2] Create `tests/integration/scenarioColorOverride.spec.ts` — **DONE**. 3 tests. **A real, significant, pre-existing bug found and fixed while writing this test — see the new "Real bugs found during US2" note below tasks.md's Phase 4 header**: (1) `services/scenarioDiscovery.ts` NEVER read `manifest.yaml` at all for any of its three registration paths (observed/published/demo) — only the separate local-folder path did — so `Scenario.color` was `undefined` for every normally-discovered scenario, always, since the field was introduced; (2) once fixed, a SECOND real bug surfaced: `tests/fixtures/generate.py`'s own hand-rolled `write_manifest()` wrote string values completely unquoted, so `color: #4e79a7` parsed as YAML `null` (a `#` preceded by whitespace starts a comment) — confirmed the REAL production `manifest.py` (genuine PyYAML `yaml.dump()`) is unaffected, this was fixture-generator-only. Both fixed; fixtures regenerated via `uv run python tests/fixtures/generate.py`.
- [X] T024 [US2] Extend `tests/integration/settingsModal.spec.ts` — **DONE**. 3 tests, new `describe` block. A real Playwright/React finding: a manual `el.value = ...; dispatchEvent(new Event('change'))` updates the DOM but never reaches React's own synthetic `onChange` for a controlled input — fixed by using `locator.fill()` instead (which uses the native value setter, correctly triggering it).

### Implementation for User Story 2

- [X] T025 [US2] Extend `src/panels/plotlyTraces.ts`'s `resolveTraces()` — **DONE** (landed together with T011).
- [X] T026 [US2] Extend `src/panels/rechartsEncoding.ts`'s `encodeRechartsData()` — **DONE** (landed together with T012).
- [X] T027 [US2] Extend `src/panels/observablePlotEncoding.ts`'s `resolveObservablePlotEncoding()` — **DONE** (landed together with T013). Confirmed: `PlotlyPanel.tsx`/`RechartsPanel.tsx`/`ObservablePlotPanel.tsx` needed NO further changes for color — each already passes the full `ScenarioDisplayMap` from T014–T016.
- [X] T028 [US2] Extend `src/layout/settings/scenariosTab.tsx` — **DONE**, exactly as planned. **A second real, necessary fix found along the way**: `hooks/useScenarioList.ts`'s own change-detection comparison omitted `colorOverride` entirely — `appState.setColorOverride()` would `notify()` but this hook's memoized snapshot saw no relevant field change and returned the STALE cached scenario, so the swatch's own `value` never reflected the color it had just been set to. Fixed by adding `colorOverride` to that comparison (same class of bug that file's own header comment already documents for `label`/`order`).
- [X] T029 [US2] Run unit tests — **DONE**. 45/45 passing (unchanged from T018 — the color assertions were already part of those same test files).
- [X] T030 [US2] Run `npx playwright test tests/integration/scenarioColorOverride.spec.ts tests/integration/settingsModal.spec.ts` — **DONE**. 3/3 + 3/3 (new tests) passing; full `settingsModal.spec.ts` file re-run separately to confirm zero regression (see Polish phase).

**Real bugs found during US2 (both fixed, both pre-existing, neither introduced by earlier phases of this feature)**:
1. `services/scenarioDiscovery.ts` never fetched `manifest.yaml` for any of its three registration paths — `Scenario.color` was `undefined` for every normally-discovered scenario. Fixed: new `fetchScenarioManifest()` helper (reusing `services/yamlLoader.ts`'s existing, zero-caller `loadManifest()` and a newly-extracted `scenario/manifestReader.ts#manifestFromObject()`), called before each of the three `appState.register()` sites, passing `color`/`runDate`/`notes` through.
2. `tests/fixtures/generate.py`'s hand-rolled manifest writer wrote string values unquoted, so `color: #4e79a7` silently parsed as YAML `null` (a `#` after whitespace starts a comment) — confirmed the real, production PyYAML-based `manifest.py` is unaffected. Fixed by double-quoting every string value; fixtures regenerated.

**Checkpoint**: Both user stories independently functional. US2 never modified a US1 acceptance path — re-run T019 to confirm.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T031 [P] Run `npm run typecheck` — **DONE**, clean.
- [X] T032 [P] Run `npm run test:unit` — **DONE**, 426/426 passing (31 files, up from 403).
- [X] T033 Run `npm run build` — **DONE**, clean, no new warnings beyond the existing documented ones.
- [X] T034 Run the full `tests/integration/` Playwright suite — **DONE**. Full run: 306 passed, 18 failed, spread across 10 files (`dashboardShell`, `demoContentAllPanels`, `flowmapPanel` ×4, `graphicWalkerPanel` ×4, `observablePlotPanel`, `panelExpand` ×3, `sankeyPanel`, `scenarioColorOverride`, `scenarioManager`, `sectionSubNav`). Every failure investigated individually, per this project's own "confirm before concluding" discipline (matching `034-metric-panel-redesign`'s own T029 precedent):
  - 17 of 18 passed cleanly on isolated re-run (including this feature's own new `scenarioColorOverride.spec.ts` test and every file this feature directly touches — `observablePlotPanel.spec.ts`, `settingsModal.spec.ts`, `scenarioManager.spec.ts`).
  - The 18th (`flowmapPanel.spec.ts`'s "hovering the largest flow line shows a real tooltip" — the already-documented, real-hardware-timing-sensitive deck.gl hover-picking flake this project's own `033`/`034` CLAUDE.md entries already record) was rigorously cross-checked with a 3-run-each comparison specifically BECAUSE it failed twice in a row on first isolated re-run: this branch passed 2/3, a clean `git stash`'d tree passed 0/3 in the same session — conclusively pre-existing and, if anything, uncorrelated with (not worsened by) this feature's changes. No code in this feature touches `FlowMapPanel.tsx`/`flowmapData.ts`/`mapTooltip.ts` at all.
  - Net result: zero real regressions found. Every failure was either flaky-in-isolation-too (the flowmap hover case) or passed cleanly once re-run without full-suite 10-worker resource contention.
- [X] T035 [P] Add a `035-scenario-label-color` implementation-order entry to `CLAUDE.md` — **DONE**.
- [X] T036 Run `quickstart.md`'s 8 validation scenarios end-to-end — **DONE**, via the passing automated suites that directly exercise each one (same mapping convention `034-metric-panel-redesign`'s own T031 used): Scenarios 1-2 → `scenarioLabelDisplay.spec.ts` tests 1-2; Scenario 3 → test 4 (reactive update); Scenario 4 → test 5 (query log); Scenarios 5-6 → `scenarioColorOverride.spec.ts` tests 1-2; Scenario 7 → `scenarioColorOverride.spec.ts` test 3 (propagation) + `settingsModal.spec.ts`'s 3 new color-swatch tests (UI); Scenario 8 → `settingsModal.spec.ts`'s existing label-reload test + the new color-override-reload test, both confirming FR-013/FR-015's no-persistence guarantee.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS both user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only — independently shippable MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; its implementation tasks (T025–T027) extend the SAME functions T011–T013 (US1) already modified, so in practice US2 should land after US1 in this codebase even though neither story's acceptance criteria depend on the other's — a parallel team could still build both against Foundational simultaneously by coordinating on those three shared files
- **Polish (Phase 5)**: Depends on both stories being complete (or a deliberate decision to ship US1-only as the MVP and defer US2)

### Within Each User Story

- Tests before implementation (T007–T010 before T011–T017; T020–T024 before T025–T028)
- Pure-function extensions (`plotlyTraces.ts`/`rechartsEncoding.ts`/`observablePlotEncoding.ts`) before their panel-component callers, within US1 (T011–T013 before T014–T017); US2 has no new caller-side work at all (T025–T027 only)
- Story complete before moving to Polish

### Parallel Opportunities

- T002/T003 (Foundational) — different files, no shared dependency
- T007/T008/T009 (US1 tests) — three different existing test files
- T020/T021/T022 (US2 tests) — same three files, but different `describe` blocks than T007–T009 already added; still parallelizable against each other, sequenced only after T011–T013 exist
- T031/T032/T035 (Polish) — independent checks/docs

---

## Parallel Example: Foundational

```bash
Task: "Add colorOverride field + setColorOverride/clearColorOverride to src/state/appState.ts"
Task: "Create src/panels/scenarioDisplay.ts with resolveScenarioLabel/resolveScenarioColor"
```

## Parallel Example: User Story 1 tests

```bash
Task: "Extend tests/unit/plotlyTraces.test.ts for scenarioDisplay label cases"
Task: "Extend tests/unit/rechartsEncoding.test.ts for scenarioDisplay label cases"
Task: "Extend tests/unit/observablePlotEncoding.test.ts for scenarioDisplay label cases"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational)
2. Complete Phase 3 (User Story 1) — label propagation, all four panel types
3. **STOP and VALIDATE**: run quickstart.md Scenarios 1–4 manually, confirm T019 passes
4. This is a complete, real, independently valuable deliverable — every custom scenario label set in Settings today already becomes visible everywhere else in the app, with zero color-picker work needed

### Incremental Delivery

1. Setup + Foundational → shared `ScenarioDisplayMap` ready
2. User Story 1 → validate independently → ship (label propagation MVP)
3. User Story 2 → validate independently → ship (consistent + overridable scenario color)
4. Polish → full regression, CLAUDE.md record, quickstart re-validation
