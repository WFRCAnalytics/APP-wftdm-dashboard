---

description: "Task list template for feature implementation"
---

# Tasks: ZoneMapPanel

**Input**: Design documents from `/specs/013-zonemap-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/zonemap-panel.md, quickstart.md — all present.

**Tests**: Included — every prior panel-type feature in this project (005 through 012) has included test tasks, and `013`'s own planning phase already produced two real, pinned unit tests (`zonemapColor.test.ts`'s cases per quickstart.md, `tests/unit/zoneGeometry.test.ts` written and confirmed red during `/speckit-plan`) — this feature follows that established convention, not the template's own generic "optional" default.

**Organization**: Tasks are grouped by user story (spec.md's four priorities, P1–P4) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are included in every task description

## Path Conventions

Single project — `src/`, `tests/` at repository root (plan.md's own Project Structure), unchanged from every prior panel-type feature.

---

## Phase 1: Setup

- [X] T001 [P] Add a synthetic zone-boundary geometry set (~6–8 simple adjacent rectangular polygons, hand-authored zone ids) plus a `vmt_by_home_taz`-shaped metric table keyed to the same zone ids to `tests/fixtures/generate.py`, written to GeoParquet via DuckDB spatial's `ST_AsWKB()`/`COPY ... TO ... (FORMAT PARQUET)` — this project's first geometry fixture (research.md §5). Include at least one zone id present in geometry but absent from the metric table (the "no data" case, FR-012) and at least one metric row whose zone id has no matching geometry (the excluded-row case, FR-012).
- [X] T002 [P] Wire `tests/fixtures/geometry` → `public/geometry` into the existing fixture-publishing pipeline (`scripts/copy-fixtures.js`, `tests/global-setup.js`, `tests/global-teardown.js`) — corrected during implementation: this project's actual fixture-publishing pipeline is these three scripts' own `copies`/`dirs` lists, not a one-off manual copy; there is no standalone "create public/geometry" step separate from them. Depends on: T001.
- [X] T003 [P] Add five `type: zonemap` panel entries to `tests/fixtures/dashboard-config/dashboard-1-summary.yaml`'s new `row_zonemap` (core render/hover/filter-reactivity, auto-domain, `comparison: diff`, an unresolvable-diff-scenario case, and a deliberately-broken "Zone Map Broken Panel (intentional)" entry) plus three more to `dashboard-3-basemaps.yaml`'s new `row_zonemap_basemaps` (tab-default/panel-override/unreachable-basemap coverage, mirroring that file's existing flowmap panels) — corrected during implementation: this project's actual fixture-tab naming is `dashboard-1-summary.yaml`/`dashboard-2-detail.yaml`/`dashboard-3-basemaps.yaml`, not the production `dashboard-6-network.yaml` name this task originally assumed. Verified no title-prefix collisions with any existing panel in either file (26 and 14 total panels respectively, zero duplicates). Depends on: T001, T002.

**Checkpoint**: Fixture geometry + metric data exist and are published; dashboard fixture config references them. No `package.json` change needed (research.md §1, §8).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The config type and both new pure/async modules every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Add `ZoneMapPanelConfig` + `ComparisonDiff` to `src/layout/types.ts` per contracts/zonemap-panel.md — add `ZoneMapPanelConfig` to the `PanelConfig` union, extend `isMapRenderingPanel()` to include `config.type === 'zonemap'` (its own existing comment already anticipates this exact line), update `UnknownPanelConfig`'s doc comment to drop `zonemap` from its "still deferred" list (`graphic-walker` is the only one left).
- [X] T005 [P] Write failing unit tests for `zonemapColor.ts` in `tests/unit/zonemapColor.test.ts` (new file) per contracts/zonemap-panel.md + quickstart.md's own list (research.md §8/§10): `color_scale: sequential`/`diverging` + `domain` matches `tableLogic.ts`'s `cellColor()` formula exactly when `color_ramp` is omitted (including the zero-anchored diverging midpoint, not the domain's geometric center); a recognized `color_ramp` name (`YlOrRd`, `RdBu`) resolves via the matching `d3-scale-chromatic` interpolator; an unrecognized/omitted name falls back to the token-derived default; `steps` quantizes into the correct discrete bands; out-of-domain values clamp to the nearest extreme; `value: null` returns the dedicated "no data" color, never the scale's minimum/zero color.
- [X] T006 Implement `src/panels/zonemapColor.ts` (`resolveZoneFillColor`/`resolveNamedColorRamp`/`computeAutoDomain`) per contracts/zonemap-panel.md — makes T005 pass. Depends on: T005.
- [X] T007 [P] Confirm `tests/unit/zoneGeometry.test.ts` (already written and committed during `/speckit-plan`, research.md §11) — currently fails only on `Cannot find module '@/panels/zoneGeometry'` (already verified); no changes needed to the test itself before implementation.
- [X] T008 Implement `src/panels/zoneGeometry.ts` (`loadZoneGeometry`/`resolveGeometryUrl`/`ensureSpatialExtensionLoaded`) per contracts/zonemap-panel.md + research.md §2/§3/§4/§11 — `registerFileURL()` + `read_parquet()` + `ST_GeomFromWKB()`/`ST_AsGeoJSON()` (never `ST_Read()`/`registerFileBuffer()`), the module-level no-eviction cache keyed on `boundaries`, and the `boundariesId`-mismatch rejection (research.md §11) that does not disturb an existing cache entry. Makes T007 pass. Depends on: T007.

**Checkpoint**: Config type parses; both pure/async modules implemented and tested (T005/T007 now pass). Fixture data exists (Phase 1). User story implementation can begin.

---

## Phase 3: User Story 1 - Author renders a zone-level metric as a choropleth (Priority: P1) 🎯 MVP

**Goal**: Query a zone-level metric, join it to `boundaries` geometry, render a MapLibre choropleth shaded per value using the configured color scale.

**Independent Test**: Per spec.md — load a dashboard tab with one `type: zonemap` panel against fixture geometry + metric data with known zone ids and values, confirm each rendered zone's fill color matches a direct join + color-scale computation of that data.

### Tests for User Story 1 ⚠️

> Write these first; confirm they fail against the not-yet-implemented `ZoneMapPanel.tsx` before proceeding to implementation below.

- [X] T009 [P] [US1] Integration test in `tests/integration/zonemapPanel.spec.ts` (new file) — every zone in the fixture geometry renders shaded per its joined metric value, using the configured `color_scale`/`color_ramp`/`domain` (SC-001, Acceptance Scenario 1).
- [X] T010 [US1] Integration test — the map centers/zooms per the panel's `center`/`zoom` config, and per a documented default when omitted (Acceptance Scenario 2, mirroring `010`'s own precedent for the same two keys).
- [X] T011 [US1] Integration test — with no `domain` configured, the color scale's domain auto-computes from the actual min/max of the mapped `column` across the returned rows (Acceptance Scenario 3, FR-007).
- [X] T012 [US1] Integration test — hovering/clicking a rendered zone shows its zone id and metric value (Acceptance Scenario 4, research.md §6 — plain MapLibre `mousemove`/`mouseleave`, no deck.gl).
- [X] T013 [US1] Integration test — a zone with no matching metric row renders with the dedicated "no data" treatment, not the scale's minimum-value color, and not omitted from the map (Edge Cases, FR-012).
- [X] T014 [US1] Integration test — a metric row whose `metric_id` has no matching zone in the boundary geometry is excluded before rendering (Edge Cases, FR-012).

### Implementation for User Story 1

- [X] T015 [US1] Implement `src/panels/ZoneMapPanel.tsx` (new file) per contracts/zonemap-panel.md in full: data-fetch effect (`side_by_side` path only for now — `comparison: diff` routing lands in US3); geometry-fetch effect (`loadZoneGeometry`, independent `geometryStatus`); mount-only map-creation effect (`freshBlankStyle()`, one `GeoJSONSource`/`fill` layer with a data-driven `fill-color` paint expression, `mousemove`/`mouseleave`/`click` handlers, a `ResizeObserver`, `map.remove()` teardown — no `MapboxOverlay`, no `contextLost` state, research.md §1); basemap-application effect (reusing `011`'s existing effect shape verbatim — `resolveEffectiveBasemap`/`loadBasemapStyle`/`transformStyle`, FR-005); data-update effect (join `rows` to `zoneGeometry.features` by `metric_id`/`boundaries_id`, resolve `fillColor` via `zonemapColor.ts`, `setData()`); shared `PanelEmptyState`/`PanelErrorState`/inline loading-skeleton branches. Depends on: T004, T006, T008.
- [X] T016 [US1] Add `zonemap: ZoneMapPanel` to `src/panels/registry.tsx`. Depends on: T015.

**Checkpoint**: User Story 1 fully functional and independently testable (T009–T014 pass). This is the MVP — the eighth and final originally-listed panel type has a real implementation.

---

## Phase 4: User Story 2 - Zonemap panel responds to global filters, resizes correctly, and inherits the app's basemap system (Priority: P2)

**Goal**: Filter changes re-color the choropleth in place (no map recreation); the panel inherits the tab/app basemap the same way a flowmap panel already does; the map resizes correctly on both a plain window resize and the 004 expand/collapse transition.

**Independent Test**: Per spec.md — change a bound global filter's value and confirm the choropleth re-colors via `setData()` without the map instance being destroyed/recreated; set a tab's `default_basemap:` and confirm the panel picks it up; expand/collapse via 004 and resize the window, confirming correct sizing in both cases.

### Tests for User Story 2 ⚠️

- [X] T017 [P] [US2] Integration test — changing a bound global filter's value re-colors the choropleth via `setData()`, with the same underlying `maplibregl.Map`/`GeoJSONSource` objects before and after (proves no instance recreation — SC-002, Acceptance Scenario 1).
- [X] T018 [US2] Integration test — a zonemap panel with no `basemap:` of its own on a tab with `default_basemap:` set renders that basemap via the unmodified `panels/basemap/` resolution, the same way a flowmap panel on the same tab would (Acceptance Scenario 2, FR-005).
- [X] T019 [US2] Integration test — a deliberately unreachable/misconfigured basemap still renders the choropleth (falls back to the blank background) — a basemap failure never blocks the panel's own data (Acceptance Scenario 3, SC-004).
- [X] T020 [US2] Integration test — expanding via 004's trigger resizes the map canvas to fill the dialog correctly, with zero re-fetch and the map instance preserved (Acceptance Scenario 4, SC-003).
- [X] T021 [US2] Integration test — collapsing returns the map to correct card-sized rendering, with the choropleth still correctly colored afterward (research.md §9's `setData()`-survives-relocation check, Acceptance Scenario 4).
- [X] T022 [US2] Integration test — a plain browser window resize (not a 004 transition) also resizes the map canvas correctly, without a manual refresh (Acceptance Scenario 5, FR-011).
- [X] T023 [US2] Integration test — a basemap `setStyle()` switch (tab `default_basemap:` present, or a theme toggle) leaves `zonemap-zones`/`zonemap-fill` present and correctly colored afterward — assert via `map.getStyle().layers` containing the expected layer id, not just a visual check (research.md §9's `transformStyle` layer-preservation check).

**Checkpoint**: User Stories 1 and 2 both independently functional — no new implementation in this phase; `ZoneMapPanel.tsx` (T015) already had to account for filter reactivity, basemap inheritance, and resize from the start, the same way `FlowMapPanel.tsx`'s own T014 did for `010`.

---

## Phase 5: User Story 3 - Author configures a color scale and a two-scenario diff comparison (Priority: P3)

**Goal**: `color_scale`/`color_ramp`/`domain` precisely control per-zone fill color (sequential and diverging, including the zero-anchored diverging midpoint); `comparison: diff` computes and renders a two-scenario per-zone difference on a diverging scale.

**Independent Test**: Per spec.md — configure one panel with `color_scale: sequential` + a fixed `domain` and confirm fill colors match a direct scale computation; configure a second panel with `comparison: diff` naming two fixture scenarios and a simple `expr`, confirm computed diff values and diverging fill colors match a direct `b - a` computation.

### Tests for User Story 3 ⚠️

- [X] T024 [P] [US3] Integration test — `color_scale: sequential` with a fixed `domain` produces fill colors matching `tableLogic.ts`'s token-derived, capped `color-mix()` computation exactly (Acceptance Scenario 1).
- [X] T025 [US3] Integration test — `color_scale: diverging` anchors its midpoint at literal zero, not the domain's geometric center — a zone at the domain's non-zero center does NOT render the scale's "neutral" color (Acceptance Scenario 2).
- [X] T026 [US3] Integration test — `comparison: diff` naming two loaded fixture scenarios and a simple `expr` computes and renders the correct per-zone diff value on a diverging scale, matching a direct `b - a` computation of the fixture rows (Acceptance Scenario 3, SC-001).
- [X] T027 [US3] Integration test — `comparison: diff` with an `a`/`b` scenario pair where one name isn't currently loaded/active shows the shared error/empty state, never a partial or silently-wrong computation (Acceptance Scenario 4).

### Implementation for User Story 3

- [X] T028 [US3] Add `buildComparisonDiffQuery()` to `src/panels/panelQuery.ts` per contracts/zonemap-panel.md + research.md §7 (corrected during implementation from the original draft — no upfront validation, matching `config.scenario` singular's own existing zero-validation convention) — interpolates `a`/`b` as literal view-name prefixes, substitutes `expr` verbatim into the generated SQL (never evaluates it in JS, never `eval()` — constitution Principle III); an unresolvable name fails naturally at query time, caught by the existing error path. Depends on: T004.
- [X] T029 [US3] Wire `ZoneMapPanel.tsx`'s data-fetch effect to route through `buildComparisonDiffQuery()` when `config.comparison.type === 'diff'`, instead of the ordinary `buildPanelQuery`/`sqlExpander.expand` path (contracts/zonemap-panel.md, Effect 1). Depends on: T015, T028.

**Checkpoint**: User Stories 1–3 all independently functional.

---

## Phase 6: User Story 4 - Zonemap panel behaves consistently with the rest of the panel registry (Priority: P4)

**Goal**: Same loading/error/empty conventions, same 004 inheritance, same mixed-tab-of-all-panel-types guarantee as every other panel type — completing the originally-listed eight-panel-type set.

**Independent Test**: Per spec.md — load a tab mixing a zonemap panel with all seven other panel types and confirm all render without error; confirm a deliberately broken config renders the shared error state instead of crashing.

### Tests for User Story 4 ⚠️

- [X] T030 [P] [US4] Integration test — 004 expand/collapse on a zonemap panel shows the same choropleth (same underlying query result and geometry, not re-fetched), map instance preserved (Acceptance Scenario 1).
- [X] T031 [US4] Integration test — the "Zone Map Broken Panel (intentional)" fixture entry (T003) renders the shared `PanelErrorState`, not an unhandled exception, with no partially-initialized map instance left in the DOM (Acceptance Scenario 2, SC-006).
- [X] T032 [US4] Integration test — extend the mixed-panel-types tab test to include a zonemap panel alongside `valuebox`/`plotly`/`table`/`markdown`/`observable-plot`/`sankey`/`flowmap`, confirming all eight now-built panel types render without error in one load (Acceptance Scenario 3, SC-005).
- [X] T033 [US4] Integration test — multiple zonemap panels referencing the same `boundaries` file trigger exactly one `registerFileURL()`/geometry query, not one per panel instance (research.md §4, Edge Cases).
- [X] T034 [US4] Integration test — a live network capture confirms the `spatial` extension fetch to `extensions.duckdb.org` happens exactly once per session regardless of how many zonemap panels mount (research.md §2, quickstart.md manual scenario 10's automated equivalent).

**Checkpoint**: All four user stories independently functional — no new implementation in this phase either.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T035 [P] Run `npm run typecheck` — zero errors across every new/modified file.
- [X] T036 [P] Run the full Vitest suite (`npx vitest run`) — zero regressions in every existing unit test file, confirming `zonemapColor.test.ts` (T005) and `zoneGeometry.test.ts` (T007) now pass.
- [X] T037 [P] Run the full Playwright suite (`npx playwright test`) — zero regressions in every existing integration spec alongside the new `zonemapPanel.spec.ts`.
- [X] T038 Extend `project-docs/ARCHITECTURE.md`'s existing parquet-extension "no internet required" caveat to name the `spatial` extension too (FR-014, research.md §2) — real text drafted against the actual current wording of that caveat, not a duplicate paragraph.
- [ ] T039 Run quickstart.md's manual verification steps 1–10 against a real browser session. **Not performed by the implementing agent** (no real browser to click through manually) — left unchecked honestly rather than marked done on an equivalence claim, matching `009-scenario-manager`'s/`010-flowmap-panel`'s own precedent for this exact situation. Every automated equivalent (T009–T034) does pass.
- [X] T040 Update `CLAUDE.md`'s Implementation Order — mark `ZoneMapPanel` done in item 9's per-type list (currently "❌ not started"), noting this completes the originally-listed eight-panel-type set (`graphic-walker`, item 10, remains the one built-in panel type still not started).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–6)**: All depend on Foundational completion. US1 must complete before US2/US4 (both are test-only phases verifying guarantees `ZoneMapPanel.tsx` already has by construction from T015, the same relationship `010-flowmap-panel`'s own US2/US3 had to its US1). US3 depends on US1 (`ZoneMapPanel.tsx` must exist before its data-fetch effect can be extended) but is otherwise independent of US2/US4.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Within Each Phase

- Tests are written and confirmed failing before their corresponding implementation task (T005 before T006; T007 before T008; T009–T014 before T015; T024–T027 before T028–T029).
- T002 (publish fixture geometry) depends on T001 (fixture geometry must exist to publish); T003 (fixture dashboard entry) depends on both.
- T016 (registry wiring) depends on T015 (the component must exist to register).
- T029 (wiring `comparison: diff` into the data-fetch effect) depends on both T015 (the effect must exist) and T028 (the query builder it calls).

### Parallel Opportunities

- All Setup tasks (T001–T003) are effectively `[P]`-authorable but chained by real data dependency (T001 → T002 → T003) — marked `[P]` per the checklist format rule (different files), not implying true concurrency here.
- Within Foundational: T004/T005/T007 are `[P]` (different files, no inter-dependency); T006 depends on T005; T008 depends on T007.
- Within US1's test block: T009–T014 are all in the same new spec file (`zonemapPanel.spec.ts`), so — matching `010`'s own precedent — `[P]` here means parallel-to-*author*, not parallel-at-Playwright-runtime (`playwright.config.js` sets `fullyParallel: false`).
- US2's, US3's, and US4's test tasks are similarly same-file/author-parallel, runtime-serial.

---

## Parallel Example: Foundational

```bash
# T004/T005/T007 together (different files, no inter-dependency):
Task: "Add ZoneMapPanelConfig + ComparisonDiff to layout/types.ts (T004)"
Task: "Write failing zonemapColor.ts unit tests (T005)"
Task: "Confirm the already-written zoneGeometry.test.ts fails only on the missing module (T007)"

# Then, once their own dependency is satisfied:
Task: "Implement zonemapColor.ts (T006)"
Task: "Implement zoneGeometry.ts (T008)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational — CRITICAL, blocks everything).
2. Complete Phase 3 (US1: T009–T016).
3. **STOP and VALIDATE**: run T009–T014, independently confirming the core join/color-scale/hover behavior.
4. This is a legitimate, demoable MVP — the eighth and final originally-listed panel type renders a real zone-level choropleth, completing the panel-type set this project's `CLAUDE.md` has tracked since `001`.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. Add US1 → validate independently → MVP.
3. Add US2 → validate independently (no new code, only new guarantees verified — filter reactivity, basemap inheritance, resize, relocation survival).
4. Add US3 → adds real new implementation (`comparison: diff`'s query builder) → validate independently.
5. Add US4 → validate independently (registry consistency, the eighth-panel-type mixed-tab guarantee).
6. Polish → typecheck/full suites/`project-docs/ARCHITECTURE.md` caveat/manual quickstart/`CLAUDE.md` audit.

Unlike `010-flowmap-panel`, where every user story past US1 was pure verification, this feature's US3 adds real, separable new implementation (`comparison: diff`) — `ZoneMapPanel.tsx`'s own T015 deliberately ships the `side_by_side` path only, with the `diff` path wired in afterward (T029), so US1's MVP scope stays exactly "render one metric as a choropleth," matching spec.md's own explicit statement that `comparison: diff` "is not required for the panel type to exist at all."

---

## Completion

Feature complete when all 40 tasks are checked and Phase 7's three automated-suite tasks (T035–T037) pass with zero regressions. T039 (manual quickstart walkthrough) is expected to remain unchecked by an implementing agent with no real browser access — a human reviewer completes it before merge, matching established project precedent.
