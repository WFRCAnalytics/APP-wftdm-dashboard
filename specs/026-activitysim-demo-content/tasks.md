---

description: "Task list for 026-activitysim-demo-content"
---

# Tasks: Real ActivitySim scenario content — summarize.yaml, post-processed scenarios, and dashboard panels

**Input**: Design documents from `/specs/026-activitysim-demo-content/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/summarize-config.md, contracts/discovery.md, quickstart.md

**Tests**: Not explicitly requested in spec.md (this feature is authored config/data content plus a small additive TS change, not new application logic) — no unit/integration test tasks are generated. Verification instead happens via direct data spot-checks (DuckDB CLI) and browser checks, per `quickstart.md`, folded into each story's own tasks.

**Organization**: Tasks are grouped by user story (spec.md priorities) to enable independent implementation and verification of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency)
- **[Story]**: Maps the task to spec.md's US1/US2/US3/US4
- File paths are exact, per plan.md's Project Structure

## Path Conventions

Single project (existing repo root). New authored content:
`summarize.yaml` (repo root), `public/demo-scenarios/`, `public/demo-dashboard-config/`.
Additive TS: `src/services/scenarioDiscovery.ts`, `src/main.tsx` (existing files, small diffs only).

---

## Phase 1: Setup

**Purpose**: Author the shared post-processor config and confirm inputs are in place before any scenario is generated.

- [X] T001 Author `summarize.yaml` at the repo root exactly per `contracts/summarize-config.md` (`sources`, `mappings.major_trip_mode`, `bins.time_of_day_period`, `sql_fragments.trips_merged`, and all 5 `metrics` entries from `data-model.md`)
- [X] T002 [P] Confirm the three real raw ActivitySim output directories (baseline, density-variant, transit-variant) are reachable on disk and each contains `final_households.csv`, `final_persons.csv`, `final_tours.csv`, `final_trips.csv`, `final_land_use.csv`
- [X] T003 [P] Confirm `uv run wftdm-dashboard --version` succeeds from `python/` (025-python-postprocessor CLI is installed/runnable)

**Checkpoint**: `summarize.yaml` is written and ready to run against real data; the three raw datasets are confirmed reachable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Generate all three real scenario folders and wire the new content root into discovery. **No user story's dashboard panel can be verified until this phase is complete** — every story's data comes from the same three `summarize.yaml` runs, and every story's dashboard tab needs the new discovery path wired up to be reachable in the browser at all.

- [X] T004 [P] Run the `activitysim-baseline` invocation from `contracts/discovery.md` (`wftdm-dashboard summarize --input <baseline raw dir> --config summarize.yaml --output public/demo-scenarios/activitysim-baseline --scenario-name activitysim-baseline --display-name "ActivitySim Baseline"`); confirm exit code 0
- [X] T005 [P] Run the `activitysim-density-variant` invocation from `contracts/discovery.md` (adds `--notes "TAZ 1 employment +40% (TOTEMP/RETEMPN/FPSEMPN/HEREMPN/OTHEMPN/AGREMPN/MWTEMPN)"`); confirm exit code 0
- [X] T006 [P] Run the `activitysim-transit-variant` invocation from `contracts/discovery.md` (adds `--notes "AM/PM WLK_LOC_WLK_TOTIVT x0.80, WLK_LOC_WLK_IWAIT x0.50"`); confirm exit code 0
- [X] T007 Verify all three scenario folders under `public/demo-scenarios/` each contain a `manifest.yaml` and all 5 expected files in `summary/` (`summary_kpis.parquet`, `trips_by_destination_zone.parquet`, `mode_share_by_period.parquet`, `trip_mode_share.parquet`, `trip_purpose_share.parquet`) — depends on T004, T005, T006
- [X] T008 [P] Create `public/demo-scenarios/index.json` with `["activitysim-baseline", "activitysim-density-variant", "activitysim-transit-variant"]` — baseline MUST be listed first (FR-006, so it resolves as the automatic diff baseline)
- [X] T009 [P] Create `public/demo-dashboard-config/index.json` with `["dashboard-1-overview.yaml", "dashboard-2-destination-choice.yaml", "dashboard-3-transit-service.yaml"]` (the files themselves are authored per-story below; `loadDashboards()`'s existing per-file fail-soft behavior means listing them here first is safe)
- [X] T010 [P] Add `registerDemoScenarios()` to `src/services/scenarioDiscovery.ts` and call it from `discoverScenarios()`, exactly per `contracts/discovery.md`'s code block — zero changes to `registerObserved()`/`registerPublishedScenarios()` (FR-010)
- [X] T011 [P] Add a second `loadDashboards()` call in `src/main.tsx` against `` `${import.meta.env.BASE_URL}demo-dashboard-config/` ``, concatenated with the existing call's result, exactly per `contracts/discovery.md`'s code block — zero changes to `loadDashboards()`'s own signature/body
- [X] T012 Run `npm run typecheck` and `npm run test:unit`; confirm both pass unchanged — depends on T010, T011 (confirms the additive TS change is well-typed and doesn't regress the existing, untouched test suite per FR-009)

**Checkpoint**: Three real scenario folders exist and are discoverable at boot; the new dashboard-config root is wired up (still empty of real tab content until the user-story phases below author it). Foundation ready — user story phases can now proceed.

---

## Phase 3: User Story 1 - See the density variant's destination-choice shift (Priority: P1) 🎯 MVP

**Goal**: A viewer can see TAZ 1's trip/tour count rise for the density variant vs. baseline, purely from a dashboard panel.

**Independent Test**: Load baseline + density-variant scenarios, open the destination-zone panel, confirm TAZ 1 is visibly higher for the density variant (spec.md Acceptance Scenario 1).

### Implementation for User Story 1

- [X] T013 [US1] Author `public/demo-dashboard-config/dashboard-2-destination-choice.yaml` with `header.tab: Destination Choice` and a `plotly` (or `table`) panel bound to `trips_by_destination_zone`, `scenarios: [activitysim-baseline, activitysim-density-variant, activitysim-transit-variant]`, x-axis `destination_zone_id`, series per scenario — per `data-model.md`'s panel entity table
- [X] T014 [P] [US1] Spot-check via DuckDB CLI (`quickstart.md` §2): query `trips_by_destination_zone.parquet` for `destination_zone_id = 1` in both `activitysim-baseline` and `activitysim-density-variant`; confirm the increase falls in the already-measured +37%–40% range (SC-003)
- [X] T015 [US1] Run `npm run dev`, open the Destination Choice tab, confirm TAZ 1's bar/row is visibly higher for the density variant than baseline (SC-001) — depends on T013 and Phase 2's T007/T010/T011

**Checkpoint**: User Story 1 is independently functional and verifiable — the density-variant story is visible end-to-end.

---

## Phase 4: User Story 2 - See the transit variant's AM/PM mode-share shift (Priority: P1)

**Goal**: A viewer can see `WALK_LOC`'s AM/PM share rise for the transit variant vs. baseline, with MD/EV staying flat, purely from a dashboard panel.

**Independent Test**: Load baseline + transit-variant scenarios, open the mode-share-by-period panel, confirm AM/PM `WALK_LOC` share is visibly higher while MD/EV are not (spec.md Acceptance Scenarios 1–2).

### Implementation for User Story 2

- [X] T016 [US2] Author `public/demo-dashboard-config/dashboard-3-transit-service.yaml` with `header.tab: Transit Service` and a `plotly`/`observable-plot` panel bound to `mode_share_by_period`, filtered/highlighted on `trip_mode = 'WALK_LOC'`, x-axis `time_of_day_period` (ordered EA/AM/MD/PM/EV), series per scenario (`activitysim-baseline`, `activitysim-transit-variant`) — per `data-model.md`
- [X] T017 [P] [US2] Spot-check via DuckDB CLI (`quickstart.md` §2): query `mode_share_by_period.parquet` for `trip_mode = 'WALK_LOC'` across AM/PM/MD in both scenarios; confirm AM/PM rise ~+1 percentage point and MD stays close to flat (SC-004)
- [X] T018 [US2] Run `npm run dev`, open the Transit Service tab, confirm `WALK_LOC`'s AM/PM bars are visibly higher for the transit variant while MD/EV are close to unchanged (SC-002) — depends on T016 and Phase 2's T007/T010/T011

**Checkpoint**: User Stories 1 AND 2 both work independently — both headline causal stories are now visible.

---

## Phase 5: User Story 3 - Compare a variant against baseline using the built-in diff mechanism (Priority: P2)

**Goal**: A viewer sees a real, computed `$baseline` diff for TAZ 1 with zero manual scenario-list setup.

**Independent Test**: With no manual baseline configuration, open a `comparison: diff` panel (`a: '$baseline'`, `b: activitysim-density-variant`); confirm a real, positive, correctly-signed `diff_value` for TAZ 1 (spec.md Acceptance Scenario 1).

### Implementation for User Story 3

- [X] T019 [US3] Edit `public/demo-dashboard-config/dashboard-2-destination-choice.yaml` (from T013) to add a `table` panel with `comparison: { type: diff, a: '$baseline', b: activitysim-density-variant, expr: "b.trips - a.trips" }` and `compare_on: [destination_zone_id, primary_purpose]`, per `data-model.md`
- [X] T020 [US3] Confirm `activitysim-baseline` resolves as the automatic diff baseline with zero manual Settings/Scenarios-tab action, relying only on T008's registration order (SC-005) — depends on T008, T019
- [X] T021 [US3] Run `npm run dev`, open the diff table, confirm a positive `diff_value` for TAZ 1 consistent with the already-measured +37%–40% real increase — depends on T019

**Checkpoint**: All three headline user stories (1, 2, 3) are independently functional; the `$baseline` mechanism has been exercised against real data for the first time.

---

## Phase 6: User Story 4 - Get oriented with overview KPIs and mode/purpose breakdowns (Priority: P3)

**Goal**: A viewer sees real, non-zero, internally-consistent landing-page KPIs and general mode/purpose breakdowns.

**Independent Test**: Load any one real scenario alone; confirm KPI value boxes and mode/purpose panels render real, non-zero, consistent values (spec.md Acceptance Scenarios 1–2).

### Implementation for User Story 4

- [X] T022 [US4] Author `public/demo-dashboard-config/dashboard-1-overview.yaml` — this is the FIRST file in T009's `index.json` (constitution Principle VII: first `dashboard-*.yaml` is the landing page) — with `valuebox` panels bound to `summary_kpis`, a `plotly` panel bound to `trip_mode_share`, and a `plotly` panel bound to `trip_purpose_share`, per `data-model.md`
- [X] T023 [P] [US4] Spot-check via DuckDB CLI: confirm `summary_kpis.parquet` for `activitysim-baseline` shows `total_households = 5000`, `total_persons = 8212`, `total_trips = 23583` (matching this session's already-confirmed real row counts)
- [X] T024 [US4] Run `npm run dev`, open the Overview tab, confirm KPI value boxes and both breakdown panels render with no error for the baseline scenario alone and for all three scenarios together — depends on T022 and Phase 2's T007/T010/T011

**Checkpoint**: All four user stories are independently functional. The full demo is complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final, whole-feature verification — confirms nothing regressed and the feature is genuinely isolated from the existing fixture/test workflow.

- [X] T025 [P] Run `quickstart.md` end-to-end, top to bottom, as a final full walkthrough (CLI runs already done in Phase 2 — re-verify steps 2–4 fresh)
- [X] T026 [P] Run `npm run test:unit` and `npm run test:integration`; confirm both pass exactly as before this feature existed (FR-009, SC-006) — the fixture-copy workflow (`npm run dev:fixtures`) must remain unaffected by `public/demo-*/` existing alongside it. **Real finding**: the first run found 5 genuine failures (`public/demo-scenarios/`/`public/demo-dashboard-config/` bleeding into Playwright's raw-`vite` webServer, unlike every gitignored fixture-swapped path). Fixed, with explicit user sign-off, by extending `tests/global-setup.js`/`global-teardown.js` to blank/restore the two new `index.json` files around the test run — see `research.md` #6. Final re-run: 273/273 unit + 230/230 integration passing.
- [X] T027 [P] Confirm each of the 3 `manifest.yaml` files' `scenario_name`/`display_name`/`notes` correctly and specifically trace back to which real raw dataset produced it (FR-008)
- [X] T028 [P] Update `CLAUDE.md`'s file-structure documentation to record the new `public/demo-scenarios/`/`public/demo-dashboard-config/` content root and the two additive `scenarioDiscovery.ts`/`main.tsx` changes, matching this project's established per-feature documentation convention

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 (`summarize.yaml` must exist before any CLI run). **Blocks all user stories** — every story needs the real Parquet data (T004–T007) and the discovery wiring (T008–T011) in place.
- **User Stories (Phases 3–6)**: All depend on Phase 2 completion. US1 (P1) and US2 (P1) have no dependency on each other and can proceed in parallel. US3 (P2) depends on US1's file (T013) already existing. US4 (P3) is independent of US1/US2/US3 (its own file, its own metrics).
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Depends only on Phase 2. No dependency on US2/US3/US4.
- **User Story 2 (P1)**: Depends only on Phase 2. No dependency on US1/US3/US4.
- **User Story 3 (P2)**: Depends on Phase 2 AND User Story 1 (edits the same file T013 created).
- **User Story 4 (P3)**: Depends only on Phase 2. No dependency on US1/US2/US3.

### Parallel Opportunities

- T002, T003 (Setup) in parallel.
- T004, T005, T006 (the three CLI runs — different `--output` dirs, same read-only `summarize.yaml`) in parallel.
- T008, T009, T010, T011 (Foundational, four different files) in parallel once T007 confirms the scenario data exists.
- Once Phase 2 completes: **User Story 1, User Story 2, and User Story 4 can all proceed in parallel** (three different dashboard files, no shared state). User Story 3 must wait for User Story 1's file.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch the three real ActivitySim summarize runs together:
Task: "Run activitysim-baseline summarize invocation (T004)"
Task: "Run activitysim-density-variant summarize invocation (T005)"
Task: "Run activitysim-transit-variant summarize invocation (T006)"

# Once T007 confirms all three produced complete output, launch together:
Task: "Create public/demo-scenarios/index.json (T008)"
Task: "Create public/demo-dashboard-config/index.json (T009)"
Task: "Add registerDemoScenarios() to scenarioDiscovery.ts (T010)"
Task: "Add second loadDashboards() call to main.tsx (T011)"
```

## Parallel Example: Phases 3, 4, 6 (after Phase 2)

```bash
Task: "Author dashboard-2-destination-choice.yaml, side-by-side chart only (T013, US1)"
Task: "Author dashboard-3-transit-service.yaml (T016, US2)"
Task: "Author dashboard-1-overview.yaml (T022, US4)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (`summarize.yaml` authored).
2. Complete Phase 2: Foundational (all three real scenarios generated and discoverable — **this is the larger half of the work**; every story is a thin dashboard-YAML layer on top of it).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: Confirm the density-variant TAZ 1 story is genuinely visible (T014, T015) — this alone proves the whole real-data pipeline works end to end.

### Incremental Delivery

1. Setup + Foundational → real data ready, nothing visible yet.
2. Add User Story 1 → validate → demo-able (the anchor proof).
3. Add User Story 2 → validate → both headline stories now demo-able.
4. Add User Story 3 → validate → `$baseline` mechanism proven against real data.
5. Add User Story 4 → validate → full, oriented demo complete.
6. Polish (Phase 7) → confirm total isolation from the existing fixture/test workflow.

### Notes

- [P] tasks touch different files with no unmet dependency.
- No test-file tasks are generated (tests not requested in spec.md) — verification is DuckDB-CLI spot-checks + browser checks, matching `quickstart.md` exactly.
- Phase 2 (Foundational) is intentionally the largest, most front-loaded phase: it is where the actual ActivitySim data generation happens (three real, several-second CLI runs) — every subsequent phase is comparatively small YAML authoring against already-correct data.
