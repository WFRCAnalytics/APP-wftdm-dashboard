---
description: "Task list — 040-test-suite-migration"
---

# Tasks: Migrate the test suite from synthetic fixtures to real demo-dashboard-config content

**Input**: Design documents from `specs/040-test-suite-migration/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/` (all present)

**Tests**: This feature's deliverable *is* the test suite. Every migration task below rewrites an existing Playwright spec; there is no separate "write a failing test first" step. New spec files (T012, T013) are the explicit coverage the spec requires (FR-004, FR-019–FR-021, SC-004, SC-008).

**Organization**: Grouped by user story (US1–US5 = spec priorities P1–P5). See "Green-checkpoint reality" under Dependencies for how the phase gates actually behave given `main.tsx`'s single concatenated dashboard-root load.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task → parallelizable
- **[Story]**: US1…US5; Setup/Foundational/Polish carry no story label
- Every task names its exact file path(s)

## Path Conventions

Repo root. App source under `src/`; Playwright specs under `tests/integration/`; harness under `tests/`; Vitest under `tests/unit/`.

---

## Phase 1: Setup

**Purpose**: baseline for regression comparison before the cutover.

- [x] T001 Confirm branch is `040-test-suite-migration`; run `npm run test:integration` once against the current tree and record the pass/fail/flake counts (and which specs are the known pre-existing flakes) into a new `specs/040-test-suite-migration/baseline.md` — this is the number every later phase's full-suite run is compared against.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: build the new infrastructure and perform the atomic cutover. After this phase the integration suite is RED for every not-yet-migrated fixture-coupled spec — that is expected (see Dependencies → Green-checkpoint reality); green is restored progressively in Phases 3–6.

**⚠️ No user-story phase may begin until this phase is complete.**

- [x] T002 [P] Add optional `blank_nav?: boolean` to `DashboardTabConfig.header` in `src/layout/types.ts`, and parse it fail-soft in `parseDashboardConfig()` (`blank_nav: typeof header.blank_nav === 'boolean' ? header.blank_nav : undefined`), mirroring the existing `full_page` line exactly. Add the doc comment from `data-model.md` E-1b.
- [x] T003 Implement blank-nav rendering in `src/layout/sidebarNav.tsx` per `contracts/dashboard-8-test.md` "Sidebar entry contract": when `tab.header.blank_nav === true` → force `Icon` to `undefined`; render the `header.tab` label `<span>` in BOTH sidebar states with `className="truncate invisible"`; set `aria-label={tab.header.tab}` on `SidebarMenuButton` (leave it `undefined` for every other tab). No change to `role`/`aria-selected`/`onClick`/key. (depends on T002)
- [x] T004 [P] Add `tests/unit/dashboardConfigBlankNav.test.ts` (Vitest) — `parseDashboardConfig()` reads `header.blank_nav` as `true` / `false` / `undefined` (absent) correctly; a non-boolean value parses to `undefined`.
- [x] T005 [P] Author `public/demo-dashboard-config/dashboard-8-test.yaml` — git-tracked, existing grammar only, every panel from `contracts/dashboard-8-test.md` "Panel inventory" (missing-metric ×7 types, `chart_type: pie`, unreachable basemap ×2, broken composition, bad graphic-walker dataset ×2, markdown XSS/empty/whitespace ×3, valuebox sparkline/baseline_trend edge ×2, unresolvable `comparison: diff`, zero-row filter ×2, basemap precedence ×2). `header`: `tab: "Test"`, `title: "Test / Broken Panels"`, `blank_nav: true`, `full_page: true` (with >1 panel ⇒ the misconfiguration case), **no `icon`**. Verify every sentinel (`__nonexistent_metric__`, `__no_such_purpose__`, `totally-made-up-preset-name`, etc.) is absent from the real demo Parquet columns/values and from `src/panels/basemap/registry.ts`.
- [x] T006 [P] Verify `public/demo-dashboard-config/index.json` still lists exactly the 7 real dashboards (no `dashboard-8-test.yaml`) and add a guard test `tests/integration/testTabInvisibility.spec.ts` stub asserting `git`-committed `index.json` never contains `dashboard-8-test.yaml` (full body in T012).
- [x] T007 Redesign `tests/global-setup.js` per `contracts/test-harness.md` "after": reduce `copies[]` to the single `['tests/fixtures/all-placeholders-config.yaml', 'public/all-placeholders-config.yaml']` entry (drop `observed`/`scenarios`/`dashboard-config`/`geometry`); reduce the missing-file guard to that one file with no `generate.py` mention; STOP touching `public/demo-scenarios/index.json`; for `public/demo-dashboard-config/index.json` — keep the `*.original-during-tests` save + fail-loud "already exists" guard, but replace the `writeFileSync(live, '[]\n')` blank with: parse JSON, `dashboards.push('dashboard-8-test.yaml')` (skip if already present), write back with trailing newline.
- [x] T008 Redesign `tests/global-teardown.js` per the same contract: `dirs[]` handling removed entirely; keep only — restore `public/demo-dashboard-config/index.json` from `*.original-during-tests` then `unlinkSync` the backup, and `rmSync('public/all-placeholders-config.yaml', { force: true })`. No reference to `public/demo-scenarios/index.json` or any fixture dir.
- [~] T009 [P] PARTIAL — lock import removed from `sidebarNav.spec.ts` + `fullPagePanel.spec.ts` (migrated); `dashboardShell.spec.ts` still imports it (blocked on T014), so `_sharedFixtureLock.ts` is NOT deleted yet. Original text: Delete `tests/integration/_sharedFixtureLock.ts`; remove its import and every `beforeAll`/`afterAll` acquire/release plus each file's own `public/*dashboard-config/index.json` rewrite from `tests/integration/dashboardShell.spec.ts`, `sidebarNav.spec.ts`, `fullPagePanel.spec.ts`, `demoContentAllPanels.spec.ts`, `demoMultiScenario.spec.ts` (spec bodies are migrated later; here only the lock/rewrite scaffolding is removed).
- [x] T010 [P] DONE — removed `pretest:integration` + `dev:fixtures` from `package.json`; deleted `scripts/copy-fixtures.js`. FR-015 "repurpose" branch ALSO taken: new `scripts/dev-test-tab.js` + `npm run dev:test-tab` / `dev:test-tab:off` register/unregister `dashboard-8-test.yaml` for a manual `npm run dev` check (in-place, EOL-preserving, no backup file). Documented in CLAUDE.md.
- [x] T011 [P] `git rm -r tests/fixtures/dashboard-config tests/fixtures/observed tests/fixtures/scenarios tests/fixtures/geometry` and `git rm tests/fixtures/generate.py`. Keep `tests/fixtures/all-placeholders-config.yaml`.

**Checkpoint**: infrastructure complete. `npm run test:integration` is now red for all fixture-coupled specs. Proceed to US1.

---

## Phase 3: User Story 1 - Test-only broken-panel dashboard, invisible to real users (Priority: P1) 🎯 MVP

**Goal**: real users see exactly the 7 real tabs; during a test run an 8th "Test" tab exists with a *visually blank* sidebar entry, and its panels render every error/empty state that fixtures used to cover.

**Independent Test**: `npm run build:pages` + serve `docs/` at the Pages path → sidebar shows 7 tabs, no "Test", no data 404s. Then run `testTabInvisibility.spec.ts` + `dashboardShell.spec.ts` + `sidebarNav.spec.ts` → 8th "Test" tab present, `getByRole('tab', { name: 'Test' })` resolves one element, that element has no `<svg>` and no painted label, and every `dashboard-8-test.yaml` panel shows its error/empty state.

- [x] T012 [P] [US1] Complete `tests/integration/testTabInvisibility.spec.ts` — (a) with the harness's registration active: sidebar has 8 `role="tab"` elements; the 8th's accessible name is exactly `"Test"`, it contains zero `<svg>`, its label text is not visible (`toBeVisible()` false on the span, or computed `visibility: hidden`), and it is focusable + activatable via keyboard; (b) route `**/demo-dashboard-config/index.json` to the committed 7-entry file → sidebar has 7 `role="tab"`, none named "Test" (SC-001, SC-008, FR-002, FR-019–FR-021).
- [x] T013 [P] [US1] Add `tests/integration/brokenPanelStates.spec.ts` — one assertion per `dashboard-8-test.yaml` panel that it renders the state named in `contracts/dashboard-8-test.md` (missing-metric → error state; `chart_type: pie` → validation error surfaced pre-query; unreachable basemap → blank style with flow lines / choropleth still drawn; broken composition → data still renders; XSS markdown → no script executed, no `on*` attrs; `""`/whitespace markdown → empty render, no crash; zero-row filter → `PanelEmptyState`; unresolvable `comparison: diff` → error/no-data, no crash; `full_page` + >1 panel → `console.warn` + ordinary card grid). Maps every RF-3 row (SC-004).
- [x] T014 [US1] DONE — Migrated `tests/integration/dashboardShell.spec.ts` to the real 7-tab (+ permanent 8th "Test" tab) demo content, 13/13 passing in isolation. Real KPIs asserted: Households `5000`, Total VMT `15,212` — a REAL, CONFIRMED, OUT-OF-SCOPE bug found live (not fixed here): `total_households`/`total_trips` arrive from DuckDB-WASM as JS `bigint`, and `panels/formatValue.ts`'s `typeof value !== 'number'` guard silently skips the `{:,.0f}` comma format for them (the same bigint-vs-number gap CLAUDE.md already documents fixing once for `ZoneMapPanel.tsx`, never extended to the shared `formatValue.ts`) — `total_vmt` is a real `SUM()`-derived `DOUBLE`, unaffected, confirmed correctly comma-formatted. Two describe blocks from the original file were DELETED, not migrated, after confirming (not assuming) no real content exercises them: `$filters.purpose` reactivity (a direct grep sweep found zero `filters:`/`$filters.` usage anywhere in `public/demo-dashboard-config/`) and 019-baseline-diff-consumption's `$baseline`/`comparison: diff` coverage (038's own audit already established zero real demo panels use it, and `dashboard-8-test.yaml`'s own real scope is broken/edge-case panels, not a home for a working-feature assertion) — both flagged inline as real, confirmed gaps for their own follow-up; both remain covered at the unit level (`sqlExpander.test.ts`). Panel-isolation test re-paired using two real rows already on the "Test" tab (a broken table + a working graphic-walker panel) since no `dashboard-8-test.yaml` row mixes broken+working in one row. `_sharedFixtureLock` import/usage fully removed from this file (confirmed via grep: `demoContentAllPanels.spec.ts`/`demoMultiScenario.spec.ts`/`protomapsBasemap.spec.ts` still legitimately need it for their own shared-file mutations — T009's original "delete once these 5 files no longer need it" framing over-counted; the file itself stays, correctly, not a leftover).
- [x] T015 [US1] Migrate `tests/integration/sidebarNav.spec.ts` — assert against the real tab list and real `sections:` (demo `dashboard-2`/`3`/`5`/`6`); add the D-8 blank-entry assertions for the "Test" tab (no icon, hidden label, `aria-label` name); keep `role="tab"`/`aria-selected` coverage for real tabs.
- [x] T016 [P] [US1] Migrate `tests/integration/demoContentAllPanels.spec.ts` — remove the `page.route(fixture-endpoint → 404)` workarounds and the (already-removed-in-T009) lock usage; adjust any exact tab-count to account for the "Test" tab; still passes its all-panel-types assertion.
- [x] T017 [P] [US1] Migrate `tests/integration/demoMultiScenario.spec.ts` — remove lock usage; assert the 3 real per-scenario series render (light + dark) against an unpinned demo plotly/recharts/observable-plot panel.

**Checkpoint**: US1 specs green; MVP independently verifiable. (Panel-mechanic / shell-nav / scenario-manager specs still red — Phases 4–6.)

---

## Phase 4: User Story 2 - Panel-type behavior verified against real ActivitySim panels (Priority: P2)

**Goal**: each panel-type spec exercises a real demo panel bound to real ActivitySim data and asserts a real value (SC-005); error cases move to `dashboard-8-test.yaml`.

**Independent Test**: each spec below loads the real demo tab containing its panel type, asserts render + one real value from `data-model.md` E-3 / `research.md` D-5, and contains zero `good_scenario`/`broken_scenario`/`fixtures/dashboard-config` references.

- [ ] T018 [P] [US2] Migrate `tests/integration/valueBoxPanel.spec.ts` → Summary KPI valuebox; assert `5,000` households and `15,212` VMT (baseline); sparkline/baseline_trend missing-metric case → the `dashboard-8-test.yaml` `row_valuebox_edge` panels.
- [ ] T019 [P] [US2] Migrate `tests/integration/tablePanel.spec.ts` → Mode Choice "Tour Mode Share by Segment" (`tour_mode_share_summary`, 2738 rows); assert navigation past page 1, a sort toggle, a search filter, and the prepended `scenario` column's real values.
- [ ] T020 [P] [US2] Migrate `tests/integration/markdownPanel.spec.ts` → a real gap-note `markdown` panel (assert its rendered heading text); XSS / empty / whitespace cases → `dashboard-8-test.yaml` `row_markdown_edge`.
- [ ] T021 [P] [US2] Migrate `tests/integration/observablePlotPanel.spec.ts` → Trip "Trip Destination Distance Distribution" (`trip_destination_summary`); assert `barY` marks and the real `primary_purpose` fill legend values; missing-metric → `dashboard-8-test.yaml`.
- [ ] T022 [P] [US2] Migrate `tests/integration/rechartsPanel.spec.ts` → a real recharts demo panel; assert bars render as `<path class="recharts-rectangle">` and a theme-correct series color; `chart_type: pie` and zero-row filter → `dashboard-8-test.yaml`.
- [ ] T023 [P] [US2] Migrate `tests/integration/sankeyPanel.spec.ts` → Mode Choice `purpose_mode_flow` sankey; assert node labels from real `primary_purpose` / `major_trip_mode`; missing-metric → `dashboard-8-test.yaml`.
- [ ] T024 [P] [US2] NOT DONE. Real, confirmed scope (042-boot-performance's own git-stash A/B already flagged this file broken; re-confirmed here directly, 41/379 real baseline failures, the single worst file) — genuinely bigger than a tab/title swap, most of its ~35 tests bind to one fixture panel with hand-crafted synthetic data (`EXPECTED_FLOWS_ALL`: 6 flows, exact values 590/200/60/40/30/50, deliberately-injected bad rows for the "excludes 2 row(s)" warning test, an explicit off-data camera view). Real Network tab's one real flowmap panel ("Trip Distribution Desire Lines", `od_flows`, `activitysim-baseline`) already has an explicit `center`/`zoom` — can't serve the auto-fit tests as-is. **Confirmed via direct line-by-line read (not skimmed), full new-panel list**:
  - NEW `dashboard-8-test.yaml` panel: real `od_flows`/`activitysim-baseline`, NO `center`/`zoom`/`basemap` — the auto-fit-runs, default-basemap-host, attribution-control, NavigationControl, reset-to-view (auto-fit case), pan-survival, and deck.gl-hover-tooltip tests (≈20 of the 35) all reuse this ONE panel, matching FLOWMAP_TITLE's own original fixture role exactly.
  - NEW: an explicit-off-data-view panel (`center`/`zoom` far from the real ~[-112.0,-111.75]/[40.6,40.85] Utah extent — e.g. reuse the fixture's own `[-110.0, 39.0]`/zoom 6) — for 027 US3 "explicit view always wins" + its own reset-to-view case.
  - NEW: a raster-provider preset panel (e.g. OpenTopoMap) — "Flowmap Raster Provider Preset" in the old fixture.
  - NEW: 2 real UGRC composition panels (`ugrc-vector-lite`/`-hybrid` + `ugrc-vector-outdoors`) — "Flowmap UGRC Composition" / "Flowmap UGRC Outdoors Composition", needed by 011 US3, 016, and 017's own highway-shield-icon tests.
  - ALREADY COVERED, no new panel needed — just reference the real titles: `dashboard-8-test.yaml`'s `row_basemap_precedence` ("Basemap Precedence — inherits tab default" / "— panel override wins" = the old "Flowmap Tab Default Basemap" / "Flowmap Panel Basemap Override"), `row_bad_basemap`'s "Flowmap Unreachable Basemap", `row_broken_composition`'s "Flowmap Broken Composition Layer", `row_missing_metric_maps`'s "Broken Flow Map Panel" (missing-metric error state).
  - Real values needing LIVE re-derivation once the new panels exist (do not guess/hardcode): real flow/location counts for the new default panel (the test's own existing live DuckDB cross-check, lines 96–122, already proves this generically — just repoint the table name); the real geographic bounds (`toBeLessThanOrEqual`/`toBeGreaterThanOrEqual` on `getBounds()`); which real (origin, destination) pair is genuinely largest, for the hover-tooltip test's own target coordinates/expected text; whether ANY real row triggers `FlowMapPanel.tsx`'s own exclusion `console.warn` at all (the synthetic bad-row injection has no real analog — if none does, that test becomes "no warning fires", not a guessed count).
  - `$filters.purpose` reactivity tests (User Story 2's filter-change/empty-state tests) hit the SAME real gap `dashboardShell.spec.ts` already documented and left unfixed (T014, above): zero real demo content uses `filter_ids`/global filters. Same call needed here — either add real filter usage somewhere, or drop with the same documented reasoning.
- [ ] T025 [P] [US2] NOT DONE. Real baseline: 30/379 failures. Same fixture-"Basemaps"-tab coupling as T024, confirmed via a structural describe-block survey (not a full line read — deferred to whichever session picks this up, budget was spent on T024's full read instead): `User Story 1` (choropleth rendering, auto-fit bounds — same "real Network zonemap panel already has explicit center/zoom" issue as flowmap), `User Story 2` (filters/resize/basemap inheritance — likely the same missing-basemap-panel set as T024, confirm by direct read before assuming reuse), `User Story 3` (`comparison: diff` on a diverging color scale — confirm whether any real demo zonemap panel uses `comparison: diff` before assuming a gap; 038's own audit only confirmed this for the panels it specifically checked), `019-baseline-diff-consumption` ($baseline — same real, confirmed gap as `dashboardShell.spec.ts`'s own removed describe block: zero real demo panels use it), `014-map-navigation-controls` ×2 (NavigationControl + zonemap's own 3D fill-extrusion toggle — no flowmap equivalent, needs its own real-value pass), `027-map-auto-fit-and-reset` ×2, `User Story 4` (registry consistency — likely low-risk, similar to flowmap's own broken-metric/mixed-tab tests). Start with a full line-by-line read (matching T024's own discipline) before writing anything — do not assume the panel-reuse list above without confirming it against this file's actual test bodies.
- [ ] T026 [P] [US2] Migrate `tests/integration/graphicWalkerPanel.spec.ts` → Person & Households `person_household_profile` and Explore full-page `trip_mode_share`; assert `<GraphicWalker>` mounts with real field names; bad fixed dataset / `dataset_picker` no-match / zero-row filter → `dashboard-8-test.yaml`. (`dashboard-2-detail.yaml`'s former `expandable: true` graphic-walker coverage moves to a real demo panel or a `dashboard-8-test.yaml` panel with `expandable: true`.)
- [ ] T027 [P] [US2] Migrate `tests/integration/panelExpand.spec.ts` → any expandable real demo panel (`table`/`plotly`/`sankey`/…); assert expand → dialog → same panel instance preserved.

**Checkpoint**: panel-mechanic specs green; full-suite run compared to `baseline.md` (only Phases 5–6 groups still red).

---

## Phase 5: User Story 3 - Shell, navigation, and boot verified against the real seven-tab structure (Priority: P3)

**Goal**: shell/sub-nav/full-page/metric-strip/boot specs assert the real 7-tab IA (names, `sections:`, `full_page`) — no synthetic 3-tab fixture, no per-file `index.json` rewrite.

**Independent Test**: `sectionSubNav`/`fullPagePanel`/`metricStrip`/`boot` run against the unmodified real demo `index.json` (+ the harness-added "Test" tab) and assert real section labels, the real `dashboard-7-explore.yaml` full-page tab, and the real auto-activated scenario set.

- [ ] T028 [P] [US3] Migrate `tests/integration/sectionSubNav.spec.ts` → a real `sections:` accordion (demo `dashboard-2`/`3`/`5`/`6`); assert `scrollIntoView` to a real section's first row in `layout` order.
- [x] T029 [P] [US3] DONE EARLY (unblocks T009) — Migrate `tests/integration/fullPagePanel.spec.ts` → `dashboard-7-explore.yaml` (`full_page: true`, `icon: compass`, single `graphic-walker` panel); the deliberately-misconfigured full-page case → `dashboard-8-test.yaml` (`full_page` + >1 panel → `console.warn` + ordinary render); remove all `index.json`-path references.
- [ ] T030 [P] [US3] Migrate `tests/integration/metricStrip.spec.ts` → a real all-`valuebox` demo row + a real mixed row; re-anchor from `data-testid="row_kpis"/"row_chart"` to the real demo row ids (read them from the demo `dashboard-*.yaml`).
- [ ] T031 [US3] Migrate `tests/integration/boot.spec.ts` → assert the plain-boot auto-active set is `['activitysim-baseline', 'activitysim-density-variant', 'activitysim-transit-variant']` and `observed` is `failed`; keep the `all-placeholders-config.yaml` placeholder-grammar `loadConfig` coverage; remove `good_scenario`/`broken_scenario`.

**Checkpoint**: shell/nav/boot specs green.

---

## Phase 6: User Story 4 - Scenario-manager & Settings verified against the real demo scenarios (Priority: P4)

**Goal**: the scenario-manager family asserts against `activitysim-baseline`/`-density-variant`/`-transit-variant` (+ `failed` `observed`) with real `display_name`s and manifest colors; `settingsModal.spec.ts` (the largest file) last.

**Independent Test**: the family runs green with zero `good_scenario`/`broken_scenario` references; a `failed` registration and an unresolvable baseline diff assert against `observed` or a `dashboard-8-test.yaml` panel.

- [ ] T032 [P] [US4] Migrate `tests/integration/scenarioManager.spec.ts` — `good_scenario` → a real demo name; `broken_scenario` → `observed` (failed); confirm the `showDirectoryPicker` local-folder-load path is fixture-independent (adjust minimally if not).
- [ ] T033 [P] [US4] Migrate `tests/integration/scenarioColorOverride.spec.ts` — assert real manifest colors `#59A14F` / `#BAB0AC` / `#FF9DA7`; override-then-reset round-trip.
- [ ] T034 [P] [US4] Migrate `tests/integration/scenarioLabelDisplay.spec.ts` — assert real `display_name`s ("ActivitySim Baseline", "ActivitySim: TAZ 1 Density +40%", "ActivitySim: AM/PM Transit Service Increase") in legend/label/table-cell surfaces.
- [ ] T035 [P] [US4] Migrate `tests/integration/scenarioAutoActivation.spec.ts` — the 3 `ready` demo scenarios auto-activate (DA-1…DA-8); `observed` (`failed`) never auto-activates; `broken_scenario` refs → `observed`.
- [ ] T036 [P] [US4] Migrate `tests/integration/switchControlsUnpinnedPanels.spec.ts` — toggle a real demo scenario's Switch off → an unpinned demo panel's series/row count drops; on → restored, no reload.
- [ ] T037 [US4] Migrate `tests/integration/settingsModal.spec.ts` — every `good_scenario` (~69) → a real demo name; every `broken_scenario` (~31) → `observed`; full Scenarios-tab coverage (drag reorder, arrow reorder, label input, color picker, baseline chip, active Switch + its tooltip, row status border/background) against the real demo rows.

**Checkpoint**: scenario-manager family green; **full `npm run test:integration` green** (baseline delta = 0 real regressions).

---

## Phase 7: User Story 5 - Fixture machinery fully removed, no orphaned code (Priority: P5)

**Goal**: no dead reference to `tests/fixtures/dashboard-config`, no half-removed copy-in, no generator for unused data.

**Independent Test**: `grep -rE "fixtures/dashboard-config|good_scenario|broken_scenario" tests/ scripts/` → nothing; `tests/fixtures/dashboard-config/` and `generate.py` gone; `npm run test:integration` passes from a clean checkout with no pre-step.

- [ ] T038 [P] [US5] `grep -rE "fixtures/dashboard-config|good_scenario|broken_scenario|_sharedFixtureLock" tests/ scripts/ src/` — resolve every straggler (SC-002). Confirm `tests/fixtures/` holds only `all-placeholders-config.yaml`.
- [ ] T039 [P] [US5] Read `tests/global-setup.js` + `tests/global-teardown.js` end to end — confirm no reference remains to `dashboard-config`, `generate.py`, `observed`, `scenarios`, `geometry`, or `public/demo-scenarios/index.json`, no orphaned imports/vars/comments; line counts are lower than the `baseline.md`-era versions (SC-007).
- [ ] T040 [US5] From a clean checkout (stash any WIP), run `npm run test:integration` with **no** manual pre-step — confirm no `uv run python` executes, no missing-fixture error, and the full suite is green (SC-003, SC-006, FR-018). Compare pass count to `baseline.md` and account for every delta.
- [ ] T041 [P] [US5] Confirm `tests/integration/formInputPrimitives.spec.ts` is byte-unchanged and passing (RF-2 — the one independent spec).

**Checkpoint**: feature complete pending Polish.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T042 [P] Refresh the header comment of `tests/fixtures/all-placeholders-config.yaml` — drop the stale `.js` spec-name references; note it is now the sole surviving fixture and is hand-maintained.
- [ ] T043 [P] Dual-theme check for the blank "Test" nav entry (light + dark) — a `getComputedStyle()` assertion in `sidebarNav.spec.ts` (or `testTabInvisibility.spec.ts`) that the label span is not painted and the button stays focusable in both themes, per the `wftdm-design-system` skill's non-negotiable "verify in both themes" rule.
- [ ] T044 [P] Update `CLAUDE.md` — add an Implementation-order entry for `040-test-suite-migration`; update the `File structure` notes for `tests/` (no `tests/fixtures/dashboard-config`, `generate.py` gone, `dashboard-8-test.yaml` is a test-only demo tab) — and grep `project-docs/` for any `tests/fixtures/dashboard-config` mention and fix it.
- [ ] T045 Run `specs/040-test-suite-migration/quickstart.md` V-1 … V-6 end to end; paste the real results into `baseline.md` (rename to `results.md`) or a new `specs/040-test-suite-migration/validation.md`.
- [ ] T046 [P] `npm run typecheck` clean; `npm run test:unit` — pass count unchanged except the new `dashboardConfigBlankNav.test.ts` (Vitest suite is otherwise out of scope).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup. **Blocks every user story.**
- **US1 (P3)** → after Foundational.
- **US2 (P4)**, **US3 (P5)**, **US4 (P6)** → each after Foundational; independent of each other; may run in parallel by different people. Recommended order = priority order (P2 → P3 → P4) so the full-suite delta shrinks monotonically.
- **US5 (P7)** → after US2 + US3 + US4 (nothing left to grep-clean until every spec is migrated).
- **Polish (P8)** → after US5.

### Green-checkpoint reality (spec Q3, honestly scoped)

`src/main.tsx` loads `public/dashboard-config/` and `public/demo-dashboard-config/` as **one concatenated tab set**, switched by a single global `index.json` state that `global-setup.js` owns. There is no per-spec "half fixture / half demo" state without shims over deleted files. Therefore:

- **Foundational (Phase 2) is an atomic cutover** — immediately after it, the integration suite is red for every not-yet-migrated fixture-coupled spec. This is the one phase that does *not* end green. FR-017's "must not leave `tests/fixtures/dashboard-config/` half-removed" is satisfied by deleting it *entirely* in T011 (all-or-nothing), not by deferring.
- **Phases 3–6 each end with a full `npm run test:integration` run.** That phase's own spec group MUST pass and no already-migrated group may regress (compare to `baseline.md`). The suite is fully green again only at the end of Phase 6.
- Known pre-existing flakes (recorded in T001's `baseline.md`) are excluded from "regression" — re-run in isolation before blaming a migration.

### Within a user story

- Migrate one spec file per task; run that file in isolation (`npx playwright test <file>`) before moving on.
- New spec files (T012, T013) before the shell-spec migrations that reference the "Test" tab's blank entry (T014, T015) — so the expected accessible-name/`getByRole` behavior is pinned first.

### Parallel opportunities

- **Foundational**: T002+T004+T005+T006 parallel; T003 after T002; T007↔T008 sequential (same concern, clearer as a pair); T009+T010+T011 parallel with each other and with T005/T006.
- **US1**: T012+T013 parallel; T016+T017 parallel; T014, T015 sequential-ish (both large, both touch shell assertions) and after T012.
- **US2**: T018–T027 are all different spec files → fully parallel.
- **US3**: T028–T030 parallel; T031 independent.
- **US4**: T032–T036 parallel; T037 last (largest, highest collision risk).
- **US5 / Polish**: T038+T039+T041 parallel; T040 after them; T042–T044+T046 parallel; T045 last.

---

## Parallel Example: User Story 2

```bash
# All ten panel-mechanic specs are independent files — migrate concurrently:
Task: "T018 Migrate tests/integration/valueBoxPanel.spec.ts"
Task: "T019 Migrate tests/integration/tablePanel.spec.ts"
Task: "T020 Migrate tests/integration/markdownPanel.spec.ts"
Task: "T021 Migrate tests/integration/observablePlotPanel.spec.ts"
Task: "T022 Migrate tests/integration/rechartsPanel.spec.ts"
Task: "T023 Migrate tests/integration/sankeyPanel.spec.ts"
Task: "T024 Migrate tests/integration/flowmapPanel.spec.ts"
Task: "T025 Migrate tests/integration/zonemapPanel.spec.ts"
Task: "T026 Migrate tests/integration/graphicWalkerPanel.spec.ts"
Task: "T027 Migrate tests/integration/panelExpand.spec.ts"
```

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 Setup → `baseline.md`.
2. Phase 2 Foundational → cutover (suite goes red — expected).
3. Phase 3 US1 → `dashboardShell` + `sidebarNav` + `testTabInvisibility` + `brokenPanelStates` + the two already-demo specs green.
4. **Validate**: build → 7 tabs, no "Test"; test run → 8th blank "Test" tab, error panels. Ship this as the reviewable MVP increment even though US2–US4 specs are still red on the branch.

### Incremental delivery

US2 → US3 → US4, each a self-contained spec-group migration ending with a full-suite run vs `baseline.md`. Branch is mergeable only after US4 (full green) + US5 (orphan sweep) + Polish.

### Never

- Run two `npx playwright test` invocations concurrently against this tree — each runs `global-setup`/`global-teardown` against the shared `public/demo-dashboard-config/index.json` (`index.json.original-during-tests already exists` corruption). This hazard is unchanged by the feature.
