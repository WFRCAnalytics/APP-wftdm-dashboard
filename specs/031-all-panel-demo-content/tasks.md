---

description: "Task list for expanding real ActivitySim demo content to all ten panel types"
---

# Tasks: Expand Real ActivitySim Demo Content to All Ten Panel Types

**Input**: Design documents from `/specs/031-all-panel-demo-content/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — this project's own established convention (every prior feature in this repo's history ships real Python + Playwright test coverage; `quickstart.md` already designed the specific scenarios below) is treated as a standing request for tests, not skipped as "optional."

**Organization**: Tasks are grouped by user story (spec.md: all four are P1, deliberately not differentiated — see spec.md's own "why this priority" text on each). Each story is independently implementable/testable; where two stories touch the same new file (`dashboard-4-flows.yaml`), each story's task creates that file if it doesn't yet exist and appends its own row if it does — so stories can be done in ANY order, not just the numbered order below.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)

## Path Conventions

Single project (existing repo structure) — no new top-level directory beyond `public/demo-geometry/` and `scripts/build-demo-zone-geometry.py`.

---

## Phase 1: Setup

**Purpose**: Confirm real preconditions this feature depends on, before any new code/content is written.

- [X] T001 Confirm or regenerate the three real raw ActivitySim output directories (baseline, density-variant, transit-variant) per `specs/026-activitysim-demo-content/research.md`'s documented run configuration; record their local paths for use in T030's re-run — **CONFIRMED NOT AVAILABLE in this environment** (searched filesystem directly, no `final_trips.csv` or equivalent anywhere). Real, honest blocker — see tasks.md's own "Remaining step" section below. The already-published `public/demo-scenarios/*/summary/*.parquet` files (real, from a prior run) remain available and sufficient for Phases 3/6.
- [ ] T002 [P] Directly inspect one real raw scenario directory's `final_trips.csv` header and confirm `origin` is a real column (research.md §3's flagged verification — `destination` is already confirmed real via the existing `summarize.yaml`). **BLOCKED by T001 — deferred, not skipped.** `project-docs/GRAMMAR.md`'s own `od_flows` worked example already references `t.origin` as ActivitySim's standard trip-table shape; `od_flows`'s SQL (T020) is written on this well-evidenced basis but its actual correctness against the real file is NOT yet independently confirmed. **If `origin` turns out missing/differently named once raw data is available, STOP per FR-001 and report** — do not substitute an invented column name.

---

## Phase 2: Foundational (blocks US3 + US4 only — US1/US2 have no geometry dependency)

**Purpose**: One-time, real MTC geometry sourcing — shared prerequisite for both FlowMap (US3) and ZoneMap (US4).

**⚠️ CRITICAL**: T003-T005 MUST complete before Phase 5 (US3) or Phase 6 (US4) begin. Phases 3 (US1) and 4 (US2) do not depend on this phase and may proceed immediately.

- [X] T003 Create `scripts/build-demo-zone-geometry.py` — fetches real TAZ 1-25 polygon geometry from MTC's public FeatureServer (`contracts/geometry-pipeline.md`'s exact query), converts via native DuckDB spatial (`ST_Read`/`ST_AsWKB`/`ST_Centroid`/`ST_Y`/`ST_X`), writes `public/demo-geometry/taz25.geoparquet` (schema: `data-model.md` §4), and prints a ready-to-paste `sql_fragments.zone_centroids` YAML block to stdout. Exits non-zero with a clear error (never partial/placeholder output) if the fetch fails or returns fewer than 25 features.
- [X] T004 Run `uv run python scripts/build-demo-zone-geometry.py` once; verify the printed TAZ 1/6/16/25 centroid values match this session's already-recorded ground truth (spec.md's own Research Findings: TAZ 1 ≈ (37.792, -122.398), etc.). **STOP and report if they don't match** — do not proceed to T005 with unverified output. **DONE — real live run against MTC's FeatureServer; script's own verify step confirmed all four sampled zones match ground truth; 25 real rows written to `public/demo-geometry/taz25.geoparquet`, independently re-verified via a direct DuckDB query (real WKT geometry, TAZ 1 coordinates match this session's earlier ad hoc sample exactly).**
- [X] T005 Paste T004's printed centroid block into `summarize.yaml`'s new `sql_fragments.zone_centroids` entry, with a citation comment naming the real MTC source and the query used (`data-model.md` §1's provenance requirement) — matching `summarize.yaml`'s own existing citation-comment convention.

**Checkpoint**: `public/demo-geometry/taz25.geoparquet` exists and is git-tracked; `summarize.yaml` has real, verified centroid data. US3/US4 may now proceed.

---

## Phase 3: User Story 1 - Panel types needing no new metric (Priority: P1)

**Goal**: Observable Plot, Recharts, Graphic Walker, and Markdown panels each render real data from the three existing real scenarios, with zero new `summarize.yaml` metrics.

**Independent Test**: Load the demo scenarios; confirm each new panel renders real, non-empty values already proven correct by an existing panel using the same metric (or, for Markdown, real accurate prose).

### Tests for User Story 1

- [X] T006 [P] [US1] Recharts demo-content coverage — **DEVIATION**: consolidated into `tests/integration/demoContentAllPanels.spec.ts` (one file covering T006-T009 + T022-T023 together) rather than a separate `rechartsDemoContent.spec.ts` — all these tests share the same real `beforeAll`/`afterAll` index.json restore machinery (see that file's own header comment), and splitting them into five files would have meant five copies of that setup/teardown. DONE, passing against real data.
- [X] T007 [P] [US1] Observable Plot demo-content coverage — same consolidation as T006, in `tests/integration/demoContentAllPanels.spec.ts`. DONE, passing.
- [X] T008 [P] [US1] Graphic Walker demo-content coverage — same consolidation as T006. DONE, passing. Found and fixed a real bug in the test itself during verification: the panel is pinned to a single scenario (`scenario: activitysim-baseline`, added to fix a real Catalog Error — see T012/T013's own notes), so no auto-added `scenario` union column exists; an earlier draft of this test wrongly asserted one.
- [X] T009 [P] [US1] Markdown demo-content coverage — same consolidation as T006. DONE, passing. Found and fixed a real Playwright strict-mode violation during verification: "Baseline" genuinely appears twice in the real prose (the bolded list label, and lowercase mid-sentence in the Density Variant bullet) — `.first()` added, matching the test's actual intent ("this real word appears somewhere").

### Implementation for User Story 1

- [X] T010 [US1] Add a new row to `public/demo-dashboard-config/dashboard-1-overview.yaml` with a `recharts` panel (`chart_type: bar`, bound to the existing real `trip_mode_share` metric, all three real scenarios)
- [X] T011 [US1] In the same new row (depends on T010, same file), add an `observable-plot` panel (`mark: barY`) bound to the same real `trip_mode_share` metric
- [X] T012 [P] [US1] Create `public/demo-dashboard-config/dashboard-5-explore.yaml` with a `graphic-walker` panel bound to the real `trip_mode_share` metric (research.md §4)
- [X] T013 [US1] In `dashboard-5-explore.yaml` (depends on T012, same file), add a `markdown` panel with real, accurate prose describing the three real scenarios and what this demo content shows
- [X] T014 [US1] Add `"dashboard-5-explore.yaml"` to `public/demo-dashboard-config/index.json` — **DONE, live and published.**

**Checkpoint**: User Story 1 fully functional and independently testable — no dependency on Phase 2/Foundational.

---

## Phase 4: User Story 2 - Real Sankey diagram of purpose-to-mode flows (Priority: P1)

**Goal**: A Sankey panel shows real trip counts flowing from purpose to grouped mode, across the three real scenarios.

**Independent Test**: Add the new metric, re-run the real `summarize` CLI, confirm the Sankey panel's values match a direct, independent SQL aggregation of the same real `trips` data.

### Tests for User Story 2

- [X] T015 [P] [US2] Add `test_purpose_mode_flow_sums_to_total_trips` to `python/tests/test_pipeline.py` (`contracts/new-metrics.md`'s real-data invariant: `SUM(trips)` over the metric's output equals the real total trip count for that scenario) — **DONE, passes.** Runs against the existing small, realistically-shaped fixture (`conftest.py`), not raw ActivitySim data — fully achievable despite the T001 blocker.

### Implementation for User Story 2

- [X] T016 [US2] Add the `purpose_mode_flow` metric to `summarize.yaml` (`contracts/new-metrics.md` — real `trips.primary_purpose` × the existing real `$mappings.major_trip_mode`, no new source/mapping)
- [X] T017 [US2] Create a `sankey` panel bound to `purpose_mode_flow` (`source: primary_purpose`, `target: major_trip_mode`, `value: trips`) across all three real scenarios. **DEVIATION from the original task, per explicit user direction given raw ActivitySim data isn't available in this environment (real blocker confirmed at T001)**: written into `public/demo-dashboard-config/dashboard-6-flows.yaml` alongside T021's flowmap panel (renamed from the originally-planned `dashboard-4-flows.yaml` to avoid colliding with T025's own now-separately-published `dashboard-4-network.yaml`) — real, correct, reviewable config, but **NOT** added to `index.json` (unlike the task's original wording) — `purpose_mode_flow.parquet` cannot actually be generated/published without raw ActivitySim input, so nothing broken/empty is reachable in the live demo. See CLAUDE.md's own 031 entry and `dashboard-6-flows.yaml`'s own header comment for the exact, small, mechanical remaining step.

**Checkpoint**: User Story 2 fully functional and independently testable — no dependency on Phase 2/Foundational.

---

## Phase 5: User Story 3 - Real origin-destination flow map (Priority: P1)

**Goal**: A FlowMap panel shows real desire lines between real TAZ centroids, using real trip counts.

**Independent Test**: Produce the real centroid data (Phase 2), add the new metric, confirm every flow line's endpoints are real, cited MTC coordinates.

**Depends on**: Phase 2 (Foundational) T003-T005; Phase 1 T002 (real `origin` column confirmed).

### Tests for User Story 3

- [X] T018 [P] [US3] Add `test_od_flows_coordinates_match_centroid_table` to `python/tests/test_pipeline.py` (`contracts/new-metrics.md`'s invariant: every `orig_lat`/`orig_lon`/`dest_lat`/`dest_lon` value is byte-identical to the matching `zone_centroids` row) — **DONE, passes.** Found and fixed TWO real bugs in `od_flows`' actual SQL along the way (not just the test): (1) `$sql.zone_centroids` already carries its own `AS zc(...)` alias, so appending a second alias per JOIN was invalid syntax — fixed by removing the fragment's embedded alias and having each JOIN supply its own (`AS c1(zone_id, lat, lon)`/`AS c2(...)`); (2) DuckDB infers a literal decimal in a VALUES clause as `DECIMAL`, not `DOUBLE` — a real risk for the browser-side FlowMap consumer (expects a plain JS number) — fixed with an explicit `CAST(... AS DOUBLE)` in the metric SQL itself, not just the test.
- [ ] T019 [P] [US3] Playwright test in `tests/integration/flowmapDemoContent.spec.ts`: the FlowMap panel renders real, non-empty flow lines (canvas pixel-readback, this project's existing `canvasHasDrawnPixels()` helper); also logs/asserts the real row count where `SUM(trips)` in `od_flows` compares against the scenario's real total trip count, recording whether any real trips fall outside zones 1-25 (`contracts/new-metrics.md`'s flagged, not-yet-empirically-checked possible under-count) rather than assuming either way

### Implementation for User Story 3

- [X] T020 [US3] Add the `od_flows` metric to `summarize.yaml`, joining real `trips.origin`/`trips.destination` against `$sql.zone_centroids` (`contracts/new-metrics.md`) — depends on T005 (✅ done — real centroid data present) and T002 (⚠️ NOT confirmed — `origin` column written on well-evidenced but not-yet-independently-verified basis; see T002/T016's own notes and `summarize.yaml`'s own comment on this metric)
- [X] T021 [US3] Add a `flowmap` panel bound to `od_flows` (`origin`/`origin_lat`/`origin_lon`/`destination`/`dest_lat`/`dest_lon`/`value` mapped per `data-model.md` §3) across all three real scenarios. **Same deviation as T017**: written into `dashboard-6-flows.yaml` alongside the Sankey panel, deliberately NOT added to `index.json` — `od_flows.parquet` cannot be generated/published without raw ActivitySim input.

**Checkpoint**: User Story 3 fully functional and independently testable once Phase 2 is complete.

---

## Phase 6: User Story 4 - Real zone choropleth map (Priority: P1)

**Goal**: A ZoneMap panel shows a real geographic choropleth of the already-real `trips_by_destination_zone` metric across the real TAZ 1-25 boundaries.

**Independent Test**: Publish the real boundary GeoParquet, confirm the ZoneMap panel renders real zone shapes (not synthetic rectangles) using the already-real metric — no new metric required.

**Depends on**: Phase 2 (Foundational) T003 (the GeoParquet file must exist).

### Tests for User Story 4

- [X] T022 [P] [US4] ZoneMap demo-content coverage — **DEVIATION**: consolidated into `tests/integration/demoContentAllPanels.spec.ts` (same reasoning as T006). DONE, passing (real, non-empty choropleth data verified via `map.querySourceFeatures()`, both themes checked). Asserts real 25-zone coverage and "not all zones are no-data," not a polygon-shape contrast against the fixture's synthetic rectangles — the shape distinction is already visually obvious (real San Francisco street-grid polygons vs. a synthetic 4x2 grid) and not independently re-asserted here.
- [X] T023 [P] [US4] Regression guard — consolidated into the same file's own `031-all-panel-demo-content — regression guard` describe block. DONE, passing: confirms zero requests to `demo-geometry/` when only the existing fixture zonemap panel is on the page.

### Implementation for User Story 4

- [X] T024 [US4] Extend `src/panels/zoneGeometry.ts`'s `resolveGeometryUrl()`/`loadZoneGeometry()` with the `public/demo-geometry/{boundaries}` fallback, tried only if the primary `public/geometry/{boundaries}` fetch fails (`contracts/geometry-pipeline.md`) — no new `PanelConfig` field, no change to the existing cache key shape
- [X] T025 [US4] Create a `zonemap` panel using `boundaries: taz25.geoparquet`, `boundaries_id: TAZ1454`, the already-real `trips_by_destination_zone` metric (`metric_id: destination_zone_id`, `column: trips`). **Naming deviation from the plan** (fully published, not a data blocker — US4 has no dependency on raw ActivitySim data): written into its own `public/demo-dashboard-config/dashboard-4-network.yaml` rather than the shared `dashboard-4-flows.yaml` the plan originally envisioned, specifically so this real, fully-working panel could be published to `index.json` immediately without also exposing T017/T021's not-yet-runnable Sankey/FlowMap panels. **DONE, live and published.**

**Checkpoint**: User Story 4 fully functional and independently testable once Phase 2 is complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Full-suite verification and documentation, after all four stories are complete.

- [X] T026 Run `uv run pytest python/tests/` — **DONE, 59/59 passing**, including both new metric tests (T015, T018).
- [X] T027 Run `npm run typecheck`, `npm run test:unit`, `tests/integration/demoContentAllPanels.spec.ts` (this feature's own new spec, standing in for T006-T009/T022-T023) — **DONE**: `typecheck` clean; `test:unit` 308/308 passing (27 files); the new spec 7/7 passing after real, confirmed fixes (see below). The FULL existing `tests/integration/` suite (every other spec file) was **not** re-run end-to-end in this session — a real Playwright hang was hit once earlier and worked around by running this feature's own spec file in isolation throughout; a targeted regression subset (`zonemapPanel.spec.ts`, `dashboardShell.spec.ts`, `flowmapPanel.spec.ts` — the specs most exposed to this feature's own `zoneGeometry.ts`/`ZoneMapPanel.tsx` changes, 86 tests total) was run instead. Result: 83/86 passed; 3 failed (a dark-mode Plotly re-query-count assertion off by exactly one query, and an identical "Settings button outside viewport" timeout in both `flowmapPanel.spec.ts`'s and `zonemapPanel.spec.ts`'s own "manual pan survives... basemap switch" test). All 3 **confirmed genuinely pre-existing and unrelated to this feature** — not assumed: re-ran the identical 3 tests, single-worker, against this feature's changes fully `git stash`ed (a clean unmodified tree), and all 3 reproduced byte-for-byte identically (same "Expected: 79, Received: 80"; same viewport-timeout call log). Stash restored afterward, confirmed via `git status`/`npm run typecheck` clean.
- [X] T028 — **NOT DONE, per explicit user direction** (this session's own governing AskUserQuestion answer): raw ActivitySim scenario directories remain unavailable in this environment (confirmed at T001). `purpose_mode_flow`/`od_flows` stay real, correct, and unpublished; `dashboard-6-flows.yaml` stays out of `index.json`. This is the documented "remaining step," not a skipped task.
- [X] T029 [P] `CLAUDE.md` updated with this feature's real findings — the `zoneGeometry.ts` fallback (and the real "reused view name" bug + fix within it), the geometry script, the two new pending metrics, the pre-existing `pipeline.py` `summary/index.json` bug, AND (found only during T027's own live-browser verification, not anticipated by any earlier task) a real `shell.tsx`/`DashboardRenderer` no-`key` React-reuse nuance that only surfaces when two dashboard-config roots share the page at once — full account in this feature's own CLAUDE.md entry.
- [X] T030 Screenshots taken and reviewed (Overview/Network/Explore tabs, light theme; Network dual-theme also exercised via the automated spec) — confirmed real Recharts/Observable Plot/GraphicWalker/Markdown/ZoneMap rendering, real San Francisco geography, real varying choropleth colors (TAZ 1 darkest — Financial District, the highest real work-trip destination).

### T027's own real findings (not anticipated by this task list — found during live verification)

`tests/integration/demoContentAllPanels.spec.ts`, as first written, had FIVE real, confirmed bugs, each found and fixed via live, evidence-based debugging (never assumed/guessed) before this spec could be trusted as real coverage at all:

1. Its own `beforeAll`/`afterAll` restored `public/demo-dashboard-config/index.json` but not `public/demo-scenarios/index.json` — both are blanked by `tests/global-setup.js` for the whole suite run — so every scenario-pinned panel found no matching views. Fixed by restoring both files together.
2. Recharts (v3) renders each bar as `<path class="recharts-rectangle">`, never a plain `<rect>` — the original selector matched zero elements. Fixed with the correct selector, confirmed directly against the live rendered DOM.
3. Two real Playwright strict-mode violations (`getByText('major_trip_mode')`/`getByText('Baseline')` each genuinely match more than one real element) — fixed with `.first()`, not a locator bug.
4. A stale ZoneMap panel title (`dashboard-4-network.yaml`'s panel was retitled to "Work Trips by Destination Zone (Baseline)" earlier in this feature's own implementation, after the spec was first written) — fixed by updating the constant.
5. A real, multi-round-diagnosed ZoneMap test bug, NOT a fabricated-attribute mistake alone: `window.__zonemapTestMaps[title]` can be legitimately stale on a REUSED `ZoneMapPanel` component instance (`shell.tsx`'s `<DashboardRenderer tab={active} />` has no `key`, so a tab switch across two DIFFERENT dashboard-config roots — this spec is the first to combine `dashboard-config` and `demo-dashboard-config` on one page — can reconcile a new tab's panel onto an EARLIER tab's already-mounted component when row name + index coincide). Resolving the map by DOM container identity (`getContainer()` match) fixed the lookup, but revealed a SECOND, deeper consequence of the same reuse: the map's camera (`center`/`zoom`) is also only ever applied once, at that instance's true first mount, so `querySourceFeatures()` (viewport/tile-dependent) returned nothing even once the correct map/source were found — the real San Francisco polygons were correctly `setData()`'d but sat outside the stale (fixture-era) camera viewport. Fixed by reading the source's raw, camera-independent `_data.features` instead. Full account in CLAUDE.md's 031 entry.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: No dependencies on Phase 1's T001 output directly, but logically follows it; **blocks Phase 5 (US3) and Phase 6 (US4) only** — Phases 3 (US1) and 4 (US2) do NOT depend on Phase 2 and may start immediately after Phase 1.
- **User Stories (Phases 3-6)**: All four are P1 and independently deliverable in any order, EXCEPT: US3 (Phase 5) additionally depends on Phase 1's T002 (real `origin` column confirmed) and Phase 2 (real centroid data); US4 (Phase 6) additionally depends on Phase 2 T003 (the real GeoParquet file existing). US1/US2 have no such dependency.
- **Shared-file note**: US2/US3/US4 (T017/T021/T025) all touch `public/demo-dashboard-config/dashboard-4-flows.yaml` — each task creates the file if absent and appends its own row/panel if present, so these three stories remain independently implementable in any order, but two of them touching that file concurrently is a real-file conflict, not a parallel-safe pair (do not run T017/T021/T025 in parallel with each other).
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Parallel Opportunities

- T002 (Setup) is `[P]` — independent of T001.
- T006-T009 (US1 tests) are all `[P]` — different files, no shared state.
- T015 (US2 test) and T018-T019 (US3 tests) are `[P]` relative to each other and to T006-T009 (different files, different stories).
- T022-T023 (US4 tests) are `[P]` relative to each other.
- T012 (US1) is `[P]` relative to T010/T011 (different file).
- T003-T005 (Foundational) are sequential (each depends on the previous step's real output) — not parallelizable internally.

---

## Parallel Example: User Story 1

```bash
# Once Phase 1 is done, launch all four US1 tests together:
Task: "Playwright test for Recharts demo content in tests/integration/rechartsDemoContent.spec.ts"
Task: "Playwright test for Observable Plot demo content in tests/integration/observablePlotDemoContent.spec.ts"
Task: "Playwright test for Graphic Walker demo content in tests/integration/graphicWalkerDemoContent.spec.ts"
Task: "Playwright test for Markdown demo content in tests/integration/markdownDemoContent.spec.ts"
```

---

## Implementation Strategy

### MVP First

Given all four stories are P1 with no forced sequencing (spec.md's own
explicit framing), there is no single "smallest MVP" story to pick over
another — Phase 1 → Phase 2 → any one of Phases 3-6 → Phase 7 is a
complete, valid increment. **User Story 1 (Phase 3) is the fastest path
to a first real, demonstrable increment** purely because it has zero
dependency on Phase 2's real-world data-fetch step, not because it's
more important than the others.

### Incremental Delivery

1. Phase 1 (Setup) → confirm real preconditions.
2. Phase 2 (Foundational) → real geometry sourced and verified.
3. Phases 3-6 in any order (team capacity allowing, in parallel by
   different people — noting the `dashboard-4-flows.yaml` shared-file
   caution above for US2/US3/US4 specifically).
4. Phase 7 (Polish) → full regression + documentation once all four are
   in.

### If a Real-Data Requirement Turns Out Unachievable (FR-001)

Any task above that hits a real, confirmed gap (T002's `origin` column
check, T004's centroid verification, or a real schema mismatch found
during T016/T020) MUST stop that specific task's story and be reported —
never silently patched with invented data. The other, unaffected stories
still proceed and still ship.
