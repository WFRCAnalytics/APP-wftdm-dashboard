---

description: "Task list for FlowMapPanel"
---

# Tasks: FlowMapPanel

**Input**: Design documents from `/specs/010-flowmap-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/flowmap-panel.md, quickstart.md — all present.

**Tests**: Included, TDD-ordered (test task before its implementation
task, expected to fail first) — matching this project's established
convention across every prior feature (`005` through `009`).

**Organization**: Tasks are grouped by user story (spec.md's
US1/US2/US3, priority order). US2 and US3 are test-only phases —
`FlowMapPanel.tsx`'s own shape (data-fetch effect with filter/scenario
reactivity built in, map-creation effect with resize handling built in,
registry wiring) is delivered whole in US1, matching `008-sankey-panel`'s
and `009-scenario-manager`'s own precedent for a single-component panel
type/feature where the later-priority stories are additional guarantees
to verify, not additional code to write.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an
  incomplete task)
- **[Story]**: US1, US2, or US3 — omitted for Setup/Foundational/Polish

## Path Conventions

Single project — `src/`, `tests/` at repository root, per plan.md's
Project Structure (no new top-level directory).

---

## Phase 1: Setup

- [X] T001 [P] Add `maplibre-gl@^4.7.1`, `@deck.gl/core@^9.0.0`,
      `@deck.gl/layers@^9.0.0`, `@deck.gl/mapbox@^9.0.0`,
      `@flowmap.gl/layers@^9.3.0` to `package.json` `dependencies` and run
      `npm install` — no new devDependencies (research.md §1: every
      package ships its own types).
- [X] T002 [P] Add a `manualChunks` entry to `vite.config.ts` for the new
      map libraries (`maplibre-gl`/`@deck.gl/*`/`@flowmap.gl/layers`) —
      the real current file only splits `duckdb`/`plotly` today
      (quickstart.md's own corrected Prerequisites note); exact chunk
      boundary (one combined chunk vs. per-package) is this task's own
      call.
- [X] T003 [P] Add an `od_flows`-shaped fixture table to
      `tests/fixtures/generate.py` with `orig_taz`/`orig_lat`/`orig_lon`/
      `dest_taz`/`dest_lat`/`dest_lon`/`trips` columns (the corrected
      `project-docs/GRAMMAR.md` grammar), including: a duplicate (origin,
      destination) pair (summing coverage), a non-positive `trips` row,
      and a row with a missing/null coordinate (exclusion coverage) —
      mirroring `008-sankey-panel`'s own fixture-design discipline.

**Checkpoint**: Dependencies installed, build config updated, fixture
data exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The config type, the pure data-transform module, and the
fixture dashboard entry every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Add `FlowMapPanelConfig` to `src/layout/types.ts` per
      contracts/flowmap-panel.md — add to the `PanelConfig` union, update
      `UnknownPanelConfig`'s doc comment to drop `flowmap` from its
      "still deferred" list.
- [X] T005 [P] Write failing unit tests for `buildFlowmapData` in
      `tests/unit/flowmapData.test.ts` (new file) — location dedup by id
      (first-seen coordinates win); duplicate-pair summing; non-positive-
      value exclusion; missing-coordinate exclusion; `excludedCount`
      accuracy; the link-key regression test (multi-word ids, mirroring
      `008-sankey-panel`'s own regression test — asserting exact
      `origin`/`dest` per flow, not just aggregate values).
- [X] T006 Implement `buildFlowmapData` in `src/panels/flowmapData.ts`
      (new file) per contracts/flowmap-panel.md. Depends on: T005, T004.
- [X] T007 Add a `type: flowmap` panel entry to
      `tests/fixtures/dashboard-config/dashboard-1-summary.yaml`, bound
      to the `od_flows` fixture table (T003), plus a deliberately-broken
      "Flow Map Broken Panel (intentional)" entry pointing at a
      nonexistent metric — mirroring every prior panel type's own
      fixture convention (verify no title-prefix collision with existing
      panels, matching `007`'s/`008`'s own precedent check). Depends on:
      T003.

**Checkpoint**: Foundation ready — the config type parses, the pure
transform is implemented and tested, fixture data exists. User story
implementation can now begin.

---

## Phase 3: User Story 1 - Author renders an O-D metric as a flow map (Priority: P1) 🎯 MVP

**Goal**: Query an O-D metric, derive deduplicated locations and summed
flows, render a MapLibre map with flowmap.gl desire lines sized by
magnitude.

**Independent Test**: Per spec.md — load a dashboard tab with one
`type: flowmap` panel against fixture data with known origin/destination/
coordinate/value rows, confirm rendered locations/flows match a direct
aggregation of that data.

### Tests for User Story 1 ⚠️

> Write these first; confirm they fail against the not-yet-implemented
> code before proceeding to implementation below.

- [X] T008 [P] [US1] Integration test in
      `tests/integration/flowmapPanel.spec.ts` (new file) — rendered
      locations/flows (via `data-flow-count`/`data-location-count`,
      contracts/flowmap-panel.md's own test instrumentation) match a
      direct `GROUP BY origin, destination` / `SUM(value)` aggregation of
      the fixture query result (SC-001, Acceptance Scenario 1).
- [X] T009 [US1] Integration test — the map centers/zooms per the panel's
      `center`/`zoom` config, and per the documented default when omitted
      (Acceptance Scenario 2).
- [X] T010 [US1] Integration test — `clustering`/`clustering_auto`
      config values reach the constructed `FlowmapLayer`'s
      `clusteringEnabled`/`clusteringAuto` props (Acceptance Scenario 3,
      research.md §6's mapping table).
- [X] T011 [US1] Integration test — duplicate (origin, destination) rows
      sum into one flow line, not duplicate overlapping lines
      (quickstart.md scenario 7).
- [X] T012 [US1] Integration test — a non-positive `value` row and a
      missing-coordinate row are both excluded, and exactly one scoped
      `console.warn` logs the total excluded count (quickstart.md
      scenario 8, research.md §5).
- [X] T013 [US1] Integration test — zero requests to any external tile
      server or map-style host on page load (`page.on('request')`),
      confirming the base style is entirely self-contained (research.md
      §9, quickstart.md manual scenario 7's automated equivalent).

### Implementation for User Story 1

- [X] T014 [US1] Implement `src/panels/FlowMapPanel.tsx` (new file) per
      contracts/flowmap-panel.md in full — data-fetch effect (with
      `useActiveScenarios()`/`extractGlobalFilterIds` reactivity built
      in); mount-only map-creation effect (`BLANK_STYLE`, `ResizeObserver`,
      the `mapReady` state fix, the `window.__flowmapTestMapReadyDelayMs`
      test hook); data-update effect (`buildFlowmapData`, `FlowmapLayer`
      construction per research.md §6's prop mapping, the
      `data-render-count`/`data-flow-count`/`data-location-count`
      instrumentation); loading/empty/error branches using the shared
      `PanelEmptyState`/`PanelErrorState`. Depends on: T006, T004.
- [X] T015 [US1] Add `flowmap: FlowMapPanel` to
      `src/panels/registry.tsx`. Depends on: T014.

**Checkpoint**: User Story 1 fully functional and independently testable
(T008–T013 pass). This is the MVP — the seventh and final
originally-listed panel type has a real implementation.

---

## Phase 4: User Story 2 - Flowmap panel responds to global filters and resizes correctly (Priority: P2)

**Goal**: Filter changes update flow lines in place (no map recreation);
the map resizes correctly on both a plain window resize and the 004
expand/collapse transition — including surviving 004's DOM relocation
with a live WebGL context intact.

**Independent Test**: Per spec.md — change a bound global filter's value
and confirm flow lines update without the map instance being destroyed/
recreated; expand/collapse via 004 and resize the window, confirming
correct sizing in both cases.

### Tests for User Story 2 ⚠️

- [X] T016 [P] [US2] Integration test — changing a bound global filter's
      value updates the flow lines (via `data-render-count`/
      `data-flow-count` changing) without the map's canvas DOM node being
      replaced (proves no instance recreation — SC-002, Acceptance
      Scenario 1).
- [X] T017 [US2] Integration test — a filter value matching zero rows
      shows the shared `PanelEmptyState` (Acceptance Scenario 2).
- [X] T018 [US2] Integration test — expanding via 004's trigger resizes
      the map canvas to fill the dialog correctly, with zero re-fetch and
      the map instance preserved (not recreated) (SC-003, Acceptance
      Scenario 3).
- [X] T019 [US2] Integration test — collapsing returns the map to
      correct card-sized rendering (Acceptance Scenario 3, second half).
- [X] T020 [US2] Integration test — a plain browser window resize (not a
      004 transition) also resizes the map canvas correctly, without a
      manual refresh (FR-008, Acceptance Scenario 4, quickstart.md
      scenario 9).
- [X] T021 [US2] Integration test — **the FR-009 relocation-survival
      test the user specifically required** (research.md §3): expand a
      flowmap panel via 004's trigger and assert (a) `map.getCanvas()` is
      the same DOM node before and after (proves no remount), (b) the
      canvas's rendered dimensions reflect the dialog's larger size
      (proves resize handling composes with the relocation), and (c) the
      map remains interactive afterward (a programmatic pan or a real
      pointer drag still produces a `moveend` event) — not merely that
      the panel "looks fine" (quickstart.md scenario 3).
- [X] T022 [US2] Integration test — **the `mapReady` race test the user
      specifically required** (research.md §11): set
      `window.__flowmapTestMapReadyDelayMs` to a real delay via
      `page.addInitScript()` before navigation, deterministically forcing
      the data-fetch to resolve before the map finishes initializing;
      assert (via `expect.poll`, not a raw sleep) the panel still ends up
      with correct `data-render-count`/`data-flow-count` once the
      artificial delay elapses — proving the data-update effect actually
      re-runs once `mapReady` flips true (quickstart.md scenario 10).

**Checkpoint**: User Stories 1 and 2 both independently functional — no
new implementation in this phase; `FlowMapPanel.tsx` already satisfies
every test here by construction (T014's own design).

---

## Phase 5: User Story 3 - Flowmap panel behaves consistently with the rest of the panel registry (Priority: P3)

**Goal**: Same loading/error/empty conventions, same 004 inheritance,
same mixed-tab-of-all-panel-types guarantee as every other panel type.

**Independent Test**: Per spec.md — load a tab mixing a flowmap panel
with every other panel type and confirm all render without error; confirm
a broken config renders the shared error state instead of crashing.

### Tests for User Story 3 ⚠️

- [X] T023 [P] [US3] Integration test — 004 expand/collapse on a flowmap
      panel shows the same map (same underlying query result, not
      re-fetched), map instance preserved (Acceptance Scenario 1).
- [X] T024 [US3] Integration test — the "Flow Map Broken Panel
      (intentional)" fixture entry (T007) renders the shared
      `PanelErrorState`, not an unhandled exception, with no
      partially-initialized map instance left in the DOM (Acceptance
      Scenario 2, SC-004).
- [X] T025 [US3] Integration test — extend (or add, matching
      `008-sankey-panel`'s own precedent) the mixed-panel-types tab test
      to include a flowmap panel alongside
      valuebox/plotly/table/markdown/observable-plot/sankey, confirming
      all seven now-built panel types render without error in one load
      (Acceptance Scenario 3, SC-005).

**Checkpoint**: All three user stories independently functional — no new
implementation in this phase either.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [P] Run `npm run typecheck` — zero errors across every new/
      modified file.
- [X] T027 [P] Run the full Vitest suite (`npx vitest run`) — zero
      regressions in every existing unit test file alongside the new
      `flowmapData.test.ts`.
- [X] T028 [P] Run the full Playwright suite (`npx playwright test`) —
      zero regressions in every existing integration spec alongside the
      new `flowmapPanel.spec.ts`.
- [ ] T029 Run quickstart.md's manual verification steps 1–7 against a
      real Chrome/Edge session. **Not performed by the implementing
      agent** (no real browser to click through manually) — left
      unchecked honestly rather than marked done on an equivalence claim,
      matching `009-scenario-manager`'s own precedent for this exact
      situation. Every automated equivalent (T008–T025) does pass.
- [X] T030 Update `CLAUDE.md`'s Implementation order — mark
      `FlowMapPanel` done in item 8's per-type panel list, and split item
      9 (currently "`FlowMapPanel` + `ZoneMapPanel` — not started") into
      `FlowMapPanel` ✅ done / `ZoneMapPanel` still ❌ not started —
      matching every prior panel-type feature's own completion-audit
      convention.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup (T003 specifically feeds
  T007) — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  US1 must complete before US2/US3 (both are test-only phases verifying
  guarantees `FlowMapPanel.tsx` already has by construction from T014) —
  unlike a typical spec-kit feature where US2/US3 could start in
  parallel with US1, here they structurally cannot: there is no
  component to test against until T014/T015 land.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each Phase

- Tests are written and confirmed failing before their corresponding
  implementation task (T005 before T006; T008–T013 before T014).
- T007 (fixture dashboard entry) depends on T003 (fixture data) —
  the panel config needs real columns to bind to.
- T015 (registry wiring) depends on T014 (the component must exist to
  register).

### Parallel Opportunities

- All Setup tasks (T001–T003) are `[P]` — different files, no
  inter-dependency.
- Within Foundational: T004/T005 are `[P]` (different files); T006
  depends on both; T007 depends on T003 only.
- Within US1's test block: T008–T013 are all in the same new spec file
  (`flowmapPanel.spec.ts`), so — matching `009`'s own precedent — `[P]`
  here means parallel-to-*author*, not parallel-at-Playwright-runtime
  (`playwright.config.js` sets `fullyParallel: false`).
- US2's and US3's test tasks are similarly same-file/author-parallel,
  runtime-serial.

---

## Parallel Example: Setup + Foundational

```bash
# Setup — all three together:
Task: "Add map library dependencies to package.json (T001)"
Task: "Add a manualChunks entry to vite.config.ts (T002)"
Task: "Add an od_flows fixture table to generate.py (T003)"

# Foundational — T004/T005 together, T006/T007 after their own deps:
Task: "Add FlowMapPanelConfig to layout/types.ts (T004)"
Task: "Write failing buildFlowmapData unit tests (T005)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational — CRITICAL, blocks
   everything).
2. Complete Phase 3 (US1: T008–T015).
3. **STOP and VALIDATE**: run T008–T013, independently confirming the
   core render/aggregation/exclusion behavior.
4. This is a legitimate, demoable MVP — the seventh and final
   originally-listed panel type renders real O-D flow data, and this
   codebase's first real map is on screen.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. Add US1 → validate independently → MVP.
3. Add US2 → validate independently (no new code, only new guarantees
   verified — filter reactivity, resize, the two user-mandated race/
   relocation tests).
4. Add US3 → validate independently (registry consistency).
5. Polish → typecheck/full suites/manual quickstart/`CLAUDE.md` audit.

Unlike every prior panel-type feature's own US2/US3 phases (which
sometimes added real, if small, new implementation), this feature's
US2/US3 are pure verification — `FlowMapPanel.tsx`'s own design (T014)
already had to account for filter reactivity, resize, DOM relocation,
and the `mapReady` race from the start, because the contract review that
preceded `tasks.md` (this session) already found and fixed those
concerns before any task was written.

---

## Completion

29/30 tasks done (T029, manual browser verification, is honestly left
unchecked — see its own note above; every automated equivalent passes).
Full suite green: 143/143 unit tests (16 files, including the new
`flowmapData.test.ts`'s 6 tests) + 113/113 integration tests (including
the new `flowmapPanel.spec.ts`'s 19 tests), `npm run typecheck` clean,
zero regressions across every prior feature's suite. **Both of the
user's specifically-required tests pass**: T021 (relocation-survival —
same canvas DOM node, resize composes correctly, and a programmatic
`panTo()` produces a real `moveend` event afterward, proving the WebGL
context genuinely survives, not just "looks fine") and T022 (the
`mapReady` race, forced deterministically via
`window.__flowmapTestMapReadyDelayMs`, not hoped-for real-world timing).

**Real bugs found and fixed during implementation** (beyond the two
already fixed during contract review — the `mapReady` state gate and the
`BLANK_STYLE`/no-CDN correction):

1. **`Number(null) === 0` in JS, then found not to be the whole bug** —
   `buildFlowmapData`'s original coordinate-validity check used a plain
   `Number.isFinite()` test, which treats a genuinely missing coordinate
   as a "valid" `0` rather than `NaN`, silently plotting a bogus `0,0`
   location instead of excluding the row. Caught by this module's own
   unit test (T005, written first) failing against the real
   implementation. First fix (`v == null ? NaN : Number(v)`) only
   rejected `null`/`undefined` — a follow-up review correctly pointed out
   `Number('')`/`Number('   ')` are *also* `0`, the identical bug
   triggered by a blank string cell instead of a SQL NULL one. Fixed
   properly: real numbers are returned directly (no `Number()` coercion
   at all for the common case), `null`/`undefined` and empty/whitespace-
   only strings are all rejected explicitly before any coercion. A second
   unit test (empty-string and whitespace-only cases) was added and
   confirmed it would have failed against the first, narrower fix.
2. **`SUM(INTEGER)` in DuckDB defaults to `HUGEINT`**, whose Arrow-to-JS
   serialization doesn't come back as a plain number in the integration
   test's own direct cross-check query — the same class of DuckDB-WASM
   Arrow-conversion quirk `tests/fixtures/generate.py`'s own
   `_sql_literal` already documents for `DECIMAL`/`DOUBLE`, now
   confirmed for `HUGEINT` too. Fixed with an explicit
   `CAST(SUM(trips) AS BIGINT)`.
3. **A test-scope-too-broad bug, not an app bug**: the "zero external
   requests" test's first run correctly caught a real request
   (`extensions.duckdb.org`, DuckDB-WASM's own parquet-extension lazy-load
   — a pre-existing characteristic of *every* panel type in this app that
   queries Parquet, not something this feature introduces) and a `blob:`
   URL (not a real network request at all). Neither was what
   research.md §9's no-CDN claim was actually about — that claim was
   specifically the map's own base style/tiles. Fixed by scoping the
   check to map/tile-host URL patterns specifically, and documented
   honestly in research.md §9 rather than silently narrowing the test
   with no explanation.
4. **A Playwright strict-mode locator bug** (test code, not app code):
   non-interleaved `MapboxOverlay` mode composites deck.gl's own
   `#deckgl-overlay` canvas above MapLibre's base canvas — two real
   `<canvas>` elements exist inside `.flowmap-chart`, confirmed
   empirically when the mixed-panel-tab test's one unguarded
   `.locator('canvas')` (every other usage in the file already had
   `.first()`) hit Playwright's strict-mode ambiguity error.

`plan.md`'s Constitution Check re-confirmed PASS post-implementation (all
9 principles, including Principle VIII genuinely satisfied — not N/A —
for the first time among the panel-type features); no Complexity
Tracking entries. `research.md`/`data-model.md`/`contracts/
flowmap-panel.md`/`CLAUDE.md` were all corrected in place to reflect
these findings, including two pieces of `CLAUDE.md` drift unrelated to
this feature's own new work but found while updating it: a stale
`SankeyPanel.tsx` comment still calling itself "the sixth and final"
panel type, and a `@deck.gl/layers` pin (added to the constitution
earlier this session) that had never been mirrored into `CLAUDE.md`'s
own "Map panels" pinned-versions list.

**Two follow-up items from a later review round, both closed**:

5. **T021 extended to cover both real canvases**, not just MapLibre's.
   Non-interleaved `MapboxOverlay` mode (finding #4 above) means a second,
   independently-relocatable `#deckgl-overlay` canvas exists — the
   relocation-survival test now asserts same-DOM-node identity and a
   stable count of 2 for *both* canvases before and after the 004 move,
   not just the one that happened to be checked first.
6. **`extensions.duckdb.org` investigated properly, not left as a passing
   observation**: confirmed via git history it's been present since
   `001-data-state-layer`'s first `read_parquet()` call (commit `0a2cd55`,
   2026-08-30) — every panel type, every deployment mode, not introduced
   by this feature. Confirmed against DuckDB's own docs that a real fix
   exists (`SET custom_extension_repository` to a self-hosted mirror) but
   isn't implemented. `project-docs/ARCHITECTURE.md`'s, `CLAUDE.md`'s, and
   `README.md`'s "no internet required" claims for `wftdm-dashboard here`
   were all overstated by exactly this gap and have been corrected with
   an honest caveat rather than left as-is.
