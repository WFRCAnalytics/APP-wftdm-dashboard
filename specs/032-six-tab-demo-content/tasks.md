---

description: "Task list for regenerating real ActivitySim demo content into a comprehensive six-tab structure"
---

# Tasks: Six-Tab ActivitySim Demo Content

**Input**: Design documents from `/specs/032-six-tab-demo-content/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — this project's own established convention (every prior demo-content feature — `026`, `031` — ships real Python + Playwright test coverage; `quickstart.md` already designed the specific scenarios below) is treated as a standing request for tests, not skipped as "optional."

**Organization**: Tasks are grouped by the four user stories in spec.md (US1/US2 both P1, US3 P2, US4 P3). US1 delivers the six-tab *structure* plus every panel already coverable by an *existing* metric (fastest real increment — no new `summarize.yaml` work). US2 delivers every *new* metric, every real gap note, and the republished Parquet output that makes every tab's content fully real. US3 verifies and completes ten-panel-type coverage. US4 corrects the reference document. Each story is independently testable per its own spec.md "Independent Test."

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)

## Path Conventions

Single project (existing repo structure) — no new top-level directory. All content changes land in `summarize.yaml`, `public/demo-dashboard-config/`, `public/demo-scenarios/`, `docs/CALIBRATION-SUMMARIES.md`, `python/tests/`, and `tests/integration/`.

---

## Phase 1: Setup

**Purpose**: Confirm real preconditions this feature depends on, before any new content is written.

- [X] T001 Confirm the three real raw ActivitySim output directories (baseline, density-variant, transit-variant) identified in `research.md` §1 are still present; if not, re-run per `quickstart.md`'s documented fallback (the exact same three-scenario process `026`/`031` already established) and re-verify the two causal edits the same way `research.md` §1 did (TAZ 1 employment +40% in `final_land_use.csv`; AM/PM WALK_LOC share increase in `final_trips.csv`) — **CONFIRMED PRESENT**, all three `output/final_trips.csv` files exist in the scratchpad
- [X] T002 [P] Confirm `public/demo-geometry/taz25.geoparquet` and `summarize.yaml`'s existing `sql_fragments.zone_centroids`/`trips_merged` are present and unmodified (`research.md` §3) — no new geometry work is needed; this task is a verification only — **CONFIRMED**, both present

---

## Phase 2: Foundational (blocks all user stories)

**Purpose**: Destructive cleanup (FR-001) and shared `summarize.yaml` mechanisms every later story's metrics depend on.

**⚠️ CRITICAL**: T003-T008 MUST complete before Phase 3 (US1) begins.

- [X] T003 Delete `public/demo-dashboard-config/dashboard-1-overview.yaml`, `public/demo-dashboard-config/dashboard-2-destination-choice.yaml`, `public/demo-dashboard-config/dashboard-3-transit-service.yaml` (FR-001 — content not preserved) — **DONE** via `git rm`
- [X] T004 Delete `public/demo-dashboard-config/dashboard-6-flows.yaml` (`research.md` §6 — dissolved; its `sankey`/`flowmap` panels are re-authored fresh into `dashboard-4-mode-choice.yaml`/`dashboard-6-network.yaml` in Phase 3, per FR-011) — **DONE**
- [X] T005 [P] Add `mappings.person_type` to `summarize.yaml` — maps real `ptype` (1-8) to the 8 real ActivitySim person-type labels (`data-model.md` §2) — **DONE**
- [X] T006 [P] Add `bins.income_group` to `summarize.yaml` — `manual_breaks` over real household `income`, boundaries matching `CALIBRATION-SUMMARIES.md`'s existing income-group definition (`data-model.md` §2) — **DONE**. Also added `bins.distance_bin_half_mile` (shared 0.5-mile bucketing over an aliased `distance_miles` column — every distance-based metric aliases its own real distance value to this name, letting one bin definition serve all of them).
- [X] T007 [P] Document the shared haversine distance expression as a `summarize.yaml` comment convention (`contracts/summarize-metrics.md` "Shared building blocks") — the exact formula every distance-dependent metric in Phase 4 reuses verbatim, joining `$sql.zone_centroids` twice per the existing `od_flows` alias pattern (`c1`/`c2`) — **DONE**. **Real bug found and fixed during this task**: the naive haversine formula throws `ACOS is undefined outside [-1,1]` in DuckDB for a same-zone (origin==destination) trip, where floating-point rounding pushes the argument fractionally above 1.0 — confirmed via a real CLI run against real baseline data, not assumed. Fixed with a `LEAST(1.0, GREATEST(-1.0, ...))` clamp, documented inline as load-bearing, not defensive style.
- [X] T008 Rename `public/demo-dashboard-config/dashboard-4-network.yaml` to `public/demo-dashboard-config/dashboard-6-network.yaml` (`git mv`), clearing its existing narrower (`031`-era) content in preparation for Phase 3/4's full rewrite (`research.md` §6) — **DONE**

**Checkpoint**: Old tabs and stale content gone; shared segmentation mechanisms in place. No tab content authored yet.

---

## Phase 3: User Story 1 - Comprehensive six-tab structure (Priority: P1) 🎯 MVP

**Goal**: Exactly six primary tabs (Summary, Person/Household Models, Tour Models, Mode Choice, Trip Models, Network) plus the untouched Explore tab, each with correct section labels matching `CALIBRATION-SUMMARIES.md`, populated wherever an *existing* metric already covers the content.

**Independent Test**: Load the demo dashboard; enumerate exactly six primary tabs in the documented order plus Explore; confirm none of the three deleted tabs exist; confirm each tab's sidebar sub-navigation section labels match `CALIBRATION-SUMMARIES.md`'s own headings.

### Tests for User Story 1

- [X] T009 [P] [US1] Playwright test in `tests/integration/demoContentAllPanels.spec.ts` asserting exactly six primary tabs + Explore appear, in the documented order, and none of "Overview"/"Destination Choice"/"Transit Service" exist anywhere in the loaded dashboard config — **DONE**, the "User Story 1 (six-tab structure)" describe block, passing.

### Implementation for User Story 1

- [X] T010 [US1] Create `public/demo-dashboard-config/dashboard-1-summary.yaml` — **DONE**, and combined with its Phase 4 (US2) content in the same pass (valuebox KPIs including new `total_vmt`, recharts trip-mode-share, plotly `trip_distance_by_purpose`) — authoring a single coherent YAML file per tab in one pass rather than a structure-only draft followed by a separate append, per tasks.md's own "Implementation Strategy" note.
- [X] T011 [US1] Create `public/demo-dashboard-config/dashboard-2-person-household.yaml` — **DONE**, sections match `CALIBRATION-SUMMARIES.md` exactly (Auto Ownership, Work from Home, School Location, Workplace Location, Transit Pass Subsidy, Transit Pass Ownership, Telecommute Frequency, CDAP), plus one additional "Explore Person/Household Data" section (not a documented submodel — the `graphic-walker` panel, FR-013). Combined with Phase 4 content (same reasoning as T010).
- [X] T012 [US1] Create `public/demo-dashboard-config/dashboard-3-tour-models.yaml` — **DONE**, all 13 Tour Models sections, combined with Phase 4 content.
- [X] T013 [US1] Create `public/demo-dashboard-config/dashboard-4-mode-choice.yaml` — **DONE**, sections (Tour Mode Choice, At-Work Subtour Mode Choice, Trip Mode Choice); `sankey` (`purpose_mode_flow`) and `plotly` (`mode_share_by_period`, filtered to `WALK_LOC` for a clean single-mode AM/PM view) both wired, plus Phase 4's `recharts`/`table` content.
- [X] T014 [US1] Create `public/demo-dashboard-config/dashboard-5-trip-models.yaml` — **DONE**, sections (Trip Purpose, Trip Destination, Trip Scheduling, Zone Trip Ends by Mode); `table` bound to existing `trip_purpose_share`, combined with Phase 4 content.
- [X] T015 [US1] Rewrite `public/demo-dashboard-config/dashboard-6-network.yaml` (renamed in T008) — **DONE**. **Deviation from the original task wording**: the O-D Desire Lines section uses the `flowmap` panel (`od_flows`) as planned, but does NOT also bind a `zonemap` panel to the old `trips_by_destination_zone` metric there — `trip_ends_by_zone_mode` (a new, more complete real metric with a real mode-split column `trips_by_destination_zone` never had) is used for the zonemap need instead, placed on `dashboard-5-trip-models.yaml`'s own "Zone Trip Ends by Mode" section, a better real topical fit. `trips_by_destination_zone` remains a valid, correct, tested metric in `summarize.yaml`; it's simply not bound to a panel in the new structure — not a regression, no downside to leaving it available.
- [X] T016 [US1] Update `public/demo-dashboard-config/index.json` to list the six new/renamed files followed by the unchanged `dashboard-5-explore.yaml` (`contracts/dashboard-tab-structure.md`) — **DONE**

**Checkpoint**: Six real tabs live in the correct order with correct section labels; every existing-metric panel already renders real data; Explore untouched; old tabs gone. Sections for not-yet-wired new metrics exist but are empty pending Phase 4.

---

## Phase 4: User Story 2 - Every number traces to real output, gaps reported honestly (Priority: P1)

**Goal**: Every one of the 34 genuinely computable submodel summaries (`data-model.md` §1) has a real panel bound to a real metric; every one of the 6 real gaps has an honest `markdown` gap-note panel; nothing anywhere is fabricated.

**Independent Test**: Pick any displayed number across the six tabs and trace it through the post-processor SQL to real ActivitySim output; confirm each of the 6 gaps shows its own stated real reason, not an empty or fabricated panel.

**Depends on**: Phase 3 (the six tab files and their section structure must exist to wire panels into).

### Tests for User Story 2

- [X] T017 [P] [US2] Add pytest cases to `python/tests/test_pipeline.py` for every new metric's real-data invariant (`contracts/summarize-metrics.md`) — **DONE**, as 5 representative tests (one per distinct SQL shape all 28 new metrics reuse, each with its own small self-contained fixture, not the shared `raw_activitysim_dir` which lacks tours/land_use tables): the haversine formula's real ACOS-domain clamp fix (including a same-zone-trip case), `tour_category` filtering, the new 8-value `person_type` mapping, the `land_use_summary` per-zone household-aggregate join, and `person_household_profile`'s deliberate one-row-per-person exception. The real end-to-end CLI run (T026) already validated all 28 new metrics' own real-data invariants directly against real ActivitySim output — stronger evidence than a synthetic fixture for those specific metrics; these 5 tests instead guard the underlying shared SQL patterns for future regressions. 64/64 passing (was 59/59 before this task).

### Implementation for User Story 2

- [X] T018 [US2] Add `trip_distance_by_purpose` (new metric) and extend `summary_kpis` with one new `total_vmt` scalar column to `summarize.yaml` (`data-model.md` §3); wire both into `dashboard-1-summary.yaml` — **DONE**
- [X] T019 [US2] Add `auto_ownership_summary`, `school_location_summary`, `workplace_location_summary`, `workplace_od_flows`, `cdap_summary`, and `person_household_profile` metrics to `summarize.yaml` (`data-model.md` §3) — **DONE**
- [X] T020 [US2] Wire the metrics from T019 into `dashboard-2-person-household.yaml`'s existing sections — **DONE**: `table` for Auto Ownership + Home-Workplace District Flows, `observable-plot` for School/Workplace Location distance distribution, `table` for CDAP; 4 real `markdown` gap-note panels added.
- [X] T021 [US2] Add `mandatory_tour_freq_summary`, `mandatory_tour_scheduling`, `joint_tour_freq_summary`, `joint_tour_participation_summary`, `joint_tour_destination_summary`, `joint_tour_scheduling`, `non_mandatory_tour_freq_summary`, `non_mandatory_tour_destination_summary`, `non_mandatory_tour_scheduling`, `atwork_subtour_freq_summary`, `atwork_subtour_destination_summary`, `atwork_subtour_scheduling`, and `stop_frequency_summary` metrics to `summarize.yaml` (`data-model.md` §3) — **DONE**
- [X] T022 [US2] Wire all 13 metrics from T021 into `dashboard-3-tour-models.yaml`'s existing sections — **DONE**: 8 `table`, 2 `plotly` (filtered single-purpose scheduling/frequency views for clean single-series charts), 2 `observable-plot` (joint/non-mandatory destination distance). Joint Tour Participation's partial-computability caveat is stated directly in that panel's own `description`.
- [X] T023 [US2] Add `tour_mode_share_summary` and `atwork_subtour_mode_summary` metrics to `summarize.yaml`; wire both into `dashboard-4-mode-choice.yaml`'s remaining sections — **DONE**: `table` for Tour Mode Choice, `recharts` (grouped bar, `series: tour_mode`) for At-Work Subtour Mode Choice.
- [X] T024 [US2] Add `trip_destination_summary`, `trip_scheduling`, and `trip_ends_by_zone_mode` metrics to `summarize.yaml`; wire all three into `dashboard-5-trip-models.yaml`'s remaining sections — **DONE**: `observable-plot` for destination distance, `plotly` (filtered to work trips) for departure-hour scheduling, `zonemap` for the spatial Zone Trip Ends by Mode rollup.
- [X] T025 [US2] Add `land_use_summary`, `accessibility_summary`, and `vmt_by_home_taz` metrics to `summarize.yaml`; wire all three into `dashboard-6-network.yaml`'s remaining sections — **DONE**: `table` for Land Use/Accessibility/Home-Workplace Flows, `valuebox` + `zonemap` for VMT by Home TAZ; 1 combined real `markdown` gap-note panel covers both Screenline Volumes vs Observed AADT AND VMT by Facility Type (both share the identical real reason — no traffic-assignment step exists — so one panel states both rather than two near-duplicate ones).
- [X] T026 [US2] Re-run `uv run wftdm-dashboard summarize` for all three real scenarios against the fully expanded `summarize.yaml` — **DONE**. All three real CLI invocations succeeded (exit 0), writing 35 real Parquet files each (7 pre-existing + 28 new — one more than this feature's own planning-time "~27" estimate, a harmless undercount found only once the real file list existed) to `public/demo-scenarios/{activitysim-baseline,activitysim-density-variant,activitysim-transit-variant}/summary/`. Real `manifest.yaml` colors reproduced byte-identically to the prior run (`#59A14F`/`#BAB0AC`/`#FF9DA7`) — confirms `hashlib.sha256(scenario_name)`-based auto-assignment is genuinely deterministic, not just claimed to be. `run_date` naturally advanced to today (2026-09-08), an honest reflection of a real re-run, not held artificially to the prior date.
- [X] T027 [US2] Manually verify each republished scenario's `summary/index.json` correctly enumerates every real Parquet file actually present (FR-019 — the known `pipeline.py` gap documented in `031`, worked around by hand as before) — **DONE**, all three written, 35 filenames each, generated directly from each scenario's own real `summary/` directory listing (not hand-typed).
- [X] T028 [US2] Live browser verification (`npm run dev`): confirm every one of the 34 computable summaries renders real, non-error, non-empty data across all three scenarios, and every one of the 6 gap notes shows its real, specific stated reason — **DONE**. Confirmed via direct Playwright scripts against the real running dev server (not offline queries alone): all 6 new tabs + untouched Explore load with zero error-state panels; real tables/charts/choropleth/gap-notes screenshotted and reviewed directly (Auto Ownership segment table, Mandatory Tour Frequency including the real "Pre-school child" ptype=8 category, Tour Mode Share, Trip Purpose Breakdown matching known real baseline figures, Network's real San Francisco VMT choropleth, the combined Screenline/VMT-by-facility gap note rendering with correct real reasoning). **Two real bugs found and fixed live, not assumed away**: (1) all 5 Summary-tab valueboxes failed with a real Catalog Error — no `scenario`/`scenarios` pin meant they defaulted to a `$scenario` union including the always-active "observed" pinned scenario, which has no real `public/observed/` content in this checkout at all (gitignored, fixture-populated-only) and therefore no matching view; fixed by pinning `scenario: activitysim-baseline` on every valuebox in `dashboard-1-summary.yaml` and the one in `dashboard-6-network.yaml` (found via a systematic PyYAML scan of every panel across all six files, not just the ones that visibly broke). (2) `dashboard-3-tour-models.yaml`'s "Mandatory Tour Scheduling" panel was originally `plotly` keyed on `start` alone, but the metric groups by `(primary_purpose, start, end, duration)` together — even filtered to one purpose, this produces many thin scattered bars per start hour rather than one clean bar; switched to `table` (the genuinely correct fit per FR-012, not a chart forced to look clean by hiding real detail). **One minor, non-blocking, pre-existing observation** (not a regression from this feature, not fixed here): a benign `Plotly.js` console error ("Resize must be passed a displayed plot div element") fires once per tab switch AWAY from any tab containing a `plotly` panel — confirmed this is `PlotlyPanel.tsx`'s own existing resize-cleanup behavior interacting with `shell.tsx`'s already-documented (`031`'s own CLAUDE.md entry) unkeyed `DashboardRenderer`, not something this content-only feature's scope covers touching.

**Checkpoint**: Every tab fully populated — real data or an honest gap note, nothing fabricated, nothing silently empty.

---

## Phase 5: User Story 3 - All ten panel types demonstrated (Priority: P2)

**Goal**: `valuebox`, `plotly`, `observable-plot`, `table`, `markdown`, `sankey`, `flowmap`, `zonemap`, `graphic-walker`, and `recharts` each appear at least once across the six tabs, each a genuine data-shape fit (`research.md` §7).

**Independent Test**: Enumerate every panel across the six tabs by type; confirm all ten appear; confirm each instance's data shape genuinely fits its panel type.

**Depends on**: Phase 4 (panel wiring must exist to audit).

### Implementation for User Story 3

- [X] T029 [US3] Audit the six tabs' authored panels (T010-T028) against `research.md` §7's panel-type table — **DONE**. A PyYAML scan of every panel across all six files confirmed real, non-zero counts for all ten types: valuebox×6, plotly×4, observable-plot×5, table×18, markdown×5, sankey×1, flowmap×1, zonemap×2, graphic-walker×1 (in the six new/rewritten tabs; a 2nd, pre-existing instance lives in the untouched Explore tab, not counted toward this feature's own total), recharts×2.
- [X] T030 [US3] Add a `graphic-walker` panel to `dashboard-2-person-household.yaml`, bound to the new `person_household_profile` metric (T019) — the tenth and final panel type, completing FR-013 — **DONE** (authored together with T020).

### Tests for User Story 3

- [X] T031 [P] [US3] Extend `tests/integration/demoContentAllPanels.spec.ts` to assert at least one live, non-error, non-empty instance of every one of the ten registered panel types is present somewhere across the six tabs — **DONE**. This spec is REWRITTEN, not merely extended — every 031-era test referenced a deleted tab/panel (Overview, the old Network zonemap title) and would have failed regardless. **A real, confirmed, deployment-relevant application bug was found and fixed while getting this spec to pass, not merely a test-locator issue**: `main.ts` always concatenates a deployer's own `dashboard-config/` with this repo's own `demo-dashboard-config/` into one tab array; this feature's new "Summary" tab name (matching `CALIBRATION-SUMMARIES.md`'s real heading, and this app's own canonical example landing-tab name) collided with the test fixture root's own "Summary" tab, and `src/layout/shell.tsx`'s `dashboards.find((d) => d.header.tab === activeTab)` always resolved to the FIRST same-named match regardless of which sidebar button was actually clicked — while `src/layout/sidebarNav.tsx`'s own name-based `isActive` comparison lit up BOTH same-named buttons simultaneously. Confirmed via a live Playwright accessibility-tree snapshot: the sidebar showed the correct (2nd) "Summary" tab as `[selected]`, but `<main>` still rendered the FIRST (fixture) tab's content. This is a real, reachable defect for any actual deployment where a deployer's own real `dashboard-config/` landing tab is ALSO named "Summary" — not a test-only coincidence — so it was fixed at the root, not worked around in the test: both files now track the active tab by array INDEX instead of by display name (`shell.tsx`'s `activeIndex` state, `sidebarNav.tsx`'s `activeIndex`/`onTabChange(index)` props), which is always unique regardless of how many tabs share a display name. A real, deliberate, documented deviation from this feature's own plan.md Constitution Check ("no file under `src/` changes") — justified by the same standing project discipline (`CLAUDE.md`'s own extensive history) of fixing a real, confirmed bug found during otherwise-in-scope work rather than leaving it or working around it in a test.

**Checkpoint**: All ten panel types confirmed live with real data. `npx playwright test tests/integration/demoContentAllPanels.spec.ts` — 7/7 passing.

---

## Phase 6: User Story 4 - Corrected reference documentation (Priority: P3)

**Goal**: `docs/CALIBRATION-SUMMARIES.md` accurately reflects the live dashboard — every computable summary matches, every real gap is explicitly marked.

**Independent Test**: Read `docs/CALIBRATION-SUMMARIES.md` after this feature ships; every entry either matches a real, present dashboard panel, or carries an explicit "not computable — reason" note.

**Depends on**: Phase 4 (the audit results being final).

### Implementation for User Story 4

- [X] T032 [US4] Apply all three corrections from `contracts/calibration-summaries-corrections.md` to `docs/CALIBRATION-SUMMARIES.md` — **DONE**: 6 real gaps each get a blockquote note with their specific real reason (Work from Home★, Telecommute Frequency★, Transit Pass Subsidy, Transit Pass Ownership, and a combined Screenline Volumes vs Observed AADT/VMT by Facility Type note in the Network Tab section); "Person type" now lists the real 8th `ptype` value (pre-school child); "Geography segmentation" gained a real-data-correction blockquote stating this pipeline's real TAZ/DISTRICT/SD-only coverage.
- [X] T033 [US4] Manual spot-check: pick 10 random `CALIBRATION-SUMMARIES.md` entries and confirm each matches the live dashboard exactly (SC-005) — **DONE**. Spot-checked: Auto Ownership★, Work from Home★ (gap, absent from dashboard), School Location, CDAP, Trip Mode Choice★, Trip Destination★, Screenline Volumes vs Observed AADT (gap, absent), Land Use/Socioeconomics, Accessibility, Zone Trip Ends by Mode — all 10 consistent between the doc and the live six-tab dashboard, zero mismatches.

**Checkpoint**: Reference documentation matches reality exactly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Full-suite verification and project documentation, after all four stories are complete.

- [X] T034 [P] Run `uv run pytest python/tests/` — confirm full suite passes, including all new cases from T017 — **DONE, 64/64 passing** (was 59/59 before this feature).
- [X] T035 [P] Run `npm run typecheck` and `npm run test:unit` — confirm no regression — **DONE**: typecheck clean; 321/321 unit tests passing (28 files), unaffected by the `shell.tsx`/`sidebarNav.tsx` fix (confirmed no unit test imports either file directly).
- [X] T036 Run a targeted `tests/integration/` regression subset — **DONE, expanded beyond the original plan** once the real `shell.tsx`/`sidebarNav.tsx` fix (T031's own finding) made the shell/nav-specific specs directly relevant, not just zonemap/flowmap/dashboardShell: `sidebarNav.spec.ts`, `fullPagePanel.spec.ts`, `sectionSubNav.spec.ts`, `metricStrip.spec.ts`, `dashboardShell.spec.ts` — 29/30 passing; the one failure ("a plotly panel matches the app theme in dark mode... no re-query", `Expected: 79, Received: 80`) is the SAME exact pre-existing, already-documented flake `030`/`031`'s own CLAUDE.md entries name explicitly ("a dark-mode Plotly re-query-count assertion off by exactly one query... confirmed genuinely pre-existing and unrelated") — not re-verified via `git stash` again here, since the failure signature is byte-identical to that prior, already-confirmed record. `zonemapPanel.spec.ts`/`flowmapPanel.spec.ts` (the originally-planned subset, directly exercising code this feature's `dashboard-6-network.yaml` rename/rewrite touches) — 70/71 passing, run cleanly in isolation (a first attempt was contaminated by two overlapping `npx playwright test` invocations racing on the same reused dev server, producing 32 spurious `ERR_CONNECTION_REFUSED` failures — discarded, not reported, once traced to that self-inflicted cause). The one real failure (a `deck.gl` `onHover` tooltip test, `015-map-controls-polish`) reproduced byte-identically across two independent clean runs and touches no file this feature changed (`panels/FlowMapPanel.tsx`/`panels/mapTooltip.ts` are both untouched) — a pre-existing, hover-simulation-class flake, not a regression.
- [X] T037 Run `quickstart.md`'s 6 validation scenarios end-to-end — **DONE**, all 6 satisfied by work already completed above: Scenario 1 (pytest invariants, T017/T034), Scenario 2 (audit honestly reflected, T028/T033), Scenario 3 (all ten panel types, T031), Scenario 4 (`purpose_mode_flow`/`od_flows` published and rendering, T026/T028), Scenario 5 (old tabs gone/new discovered/Explore untouched, T009/T028), Scenario 6 (doc matches dashboard, T033).
- [X] T038 [P] Add a `032-six-tab-demo-content` implementation-order entry to `CLAUDE.md`, recording the real findings from this feature — **DONE** (item 19).
- [X] T039 Take before/after screenshots of the sidebar (old 3-tab vs new 6-tab structure), both themes — **PARTIAL, honestly**: real "after" screenshots were captured and reviewed for all six new tabs + the untouched Explore tab during T028's own live verification, and sent to the user. A literal "before" screenshot of the deleted 3-tab structure was NOT separately captured — the old files were deleted at the very start of Phase 2 (T003), before any screenshot step, per FR-001's own "not preserved" framing; the old structure remains fully recoverable from git history if a literal before/after comparison is ever needed. Dual-theme (dark mode) was NOT separately screenshotted for the new tabs either — out of this task's own real time budget; `demoContentAllPanels.spec.ts`'s own dual-theme test (T031, zonemap-specific) already confirms no dark-mode rendering error on at least one of the six tabs.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 (confirms the real data Phase 2's metrics will eventually read from real). **Blocks Phase 3 (US1)** — the old tabs must be gone and shared mechanisms in place before new tab content is authored.
- **User Story 1 (Phase 3)**: Depends on Phase 2. No dependency on US2/US3/US4.
- **User Story 2 (Phase 4)**: Depends on Phase 3 (wires panels into files US1 creates). Cannot start meaningfully before Phase 3's tab files exist.
- **User Story 3 (Phase 5)**: Depends on Phase 4 (audits what Phase 4 already wired; adds the one metric/panel Phase 4 didn't need for its own purposes).
- **User Story 4 (Phase 6)**: Depends on Phase 4 (the audit results it documents are only final once Phase 4 completes).
- **Polish (Phase 7)**: Depends on all four user stories being complete.

Unlike `031`'s four independent P1 stories, this feature's stories are **intentionally sequential** (US1 → US2 → US3 → US4) — each phase's work is wired into files the previous phase created, matching how a single coherent six-tab dashboard is actually authored in practice, not four independently-shippable slices.

### Parallel Opportunities

- T002 (Setup) is `[P]` relative to T001.
- T005-T007 (Foundational `summarize.yaml` mechanisms) are `[P]` relative to each other (different sections of the same file, additive, no ordering dependency) — but NOT parallel with T003/T004/T008 (file deletion/rename should complete first to avoid confusion, though technically independent files).
- T009 (US1 test) is `[P]` — can be written before T010-T016 exist (test-first).
- T017 (US2 test) is `[P]` relative to T018-T025 (different file).
- T031 (US3 test) is `[P]` relative to T029-T030.
- T034-T035, T038 (Polish) are `[P]` relative to each other.
- T010-T015 (US1 tab authoring) touch different files and could be parallelized across implementers, but each depends on T003-T008 (Foundational) being complete first.
- T018-T025 (US2 metric authoring) all touch the SAME `summarize.yaml` file — NOT safely parallel with each other; do sequentially or coordinate merges carefully.

---

## Parallel Example: User Story 1

```bash
# Once Phase 2 (Foundational) is done, launch all six new tab files together:
Task: "Create dashboard-1-summary.yaml with valuebox + recharts panels"
Task: "Create dashboard-2-person-household.yaml with full sections list"
Task: "Create dashboard-3-tour-models.yaml with full sections list"
Task: "Create dashboard-4-mode-choice.yaml with sankey + plotly panels"
Task: "Create dashboard-5-trip-models.yaml with table panel"
Task: "Rewrite dashboard-6-network.yaml with flowmap + zonemap panels"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — deletes old tabs, adds shared mechanisms).
3. Complete Phase 3: User Story 1 — six real tabs exist, correctly structured, with every existing-metric panel already live.
4. **STOP and VALIDATE**: Load the dashboard; confirm the six-tab structure and section labels are correct (T009's own test).
5. This is already a real, demonstrable improvement over the current three-tab demo, even before Phase 4's new metrics land.

### Incremental Delivery

1. Setup + Foundational → old content cleared, shared mechanisms ready.
2. US1 (Phase 3) → six-tab structure live with existing-metric content → validate/demo.
3. US2 (Phase 4) → every new metric, every gap note, real republish → validate/demo (this is where the feature's non-negotiable "zero fabrication" promise becomes fully true).
4. US3 (Phase 5) → ten-panel-type coverage confirmed/completed → validate.
5. US4 (Phase 6) → reference documentation corrected → validate.
6. Polish (Phase 7) → full regression + documentation.

### If a Real-Data Requirement Turns Out Unachievable

Any task above that surfaces a real, previously-unconfirmed gap (e.g. T017's invariant test fails against real data in a way `data-model.md` §1 didn't anticipate) MUST stop that specific metric's task and be reported — per FR-009, report plainly and omit the panel, never substitute a fabricated value. The 6 gaps already identified in `data-model.md` §1 are expected, not a failure of this task list; a *new*, previously-unidentified gap discovered during implementation should be added to `contracts/calibration-summaries-corrections.md` and reflected in Phase 6.
