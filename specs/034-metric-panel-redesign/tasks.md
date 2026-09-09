---

description: "Task list for redesigned metric panels, scoped expandability, and trend indicators"
---

# Tasks: Redesigned Metric Panels, Scoped Expandability, and Trend Indicators

**Input**: Design documents from `/specs/034-metric-panel-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — this project's own established convention (every prior feature ships real Vitest/Playwright coverage) is treated as a standing request for tests, not skipped as "optional."

**Organization**: Tasks are grouped by the four user stories in spec.md (US1/US2 P1, US3/US4 P2). US1 (panelCard.tsx/registry.tsx) is fully independent of the other three. US2/US3/US4 all edit `src/panels/ValueBoxPanel.tsx` — each is still independently *testable* (a panel with no `sparkline`/`baseline_trend` config is unaffected by US3/US4 per FR-014/FR-020), but US2 should land first since US3/US4 add new zones onto the layout US2 establishes, and all three touching one file means true simultaneous parallel editing across stories isn't realistic — noted explicitly in Dependencies below, not glossed over.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)

## Path Conventions

Single existing project (no new top-level directory). Changes land in `src/layout/`, `src/panels/`, `src/components/ui/`, `tests/unit/`, `tests/integration/`.

---

## Phase 1: Setup

**Purpose**: Confirm real preconditions this feature depends on, before any file changes.

- [X] T001 Confirm no new npm dependency is required — **DONE**. `recharts` (^3.10.1), `lucide-react` (^0.460.0), `class-variance-authority` (^0.7.1) all confirmed present in `package.json`.

---

## Phase 2: Foundational (blocks US3 and US4; US1/US2 have no dependency on this phase)

**Purpose**: The one genuinely shared prerequisite — the two new config interfaces both US3 and US4 build their own logic around. Editing `ValueBoxPanelConfig` once, here, avoids two separate stories independently touching the same interface block.

**⚠️ CRITICAL**: T003 MUST complete before Phase 5 (US3) or Phase 6 (US4) begins. US1 (Phase 3) and US2 (Phase 4) do not depend on this phase at all and may start immediately.

- [X] T002 [P] Run `npm run test:unit` and `npx tsc --noEmit` from repo root — **DONE**. Clean baseline confirmed: 386/386 unit tests passing, zero typecheck errors, before any change.
- [X] T003 [P] Add `ValueBoxSparklineConfig` and `ValueBoxBaselineTrendConfig` interfaces, and the two new optional `sparkline`/`baseline_trend` fields on `ValueBoxPanelConfig`, in `src/layout/types.ts` (data-model.md §2) — **DONE**. Purely additive; `npx tsc --noEmit` clean afterward.
- [X] T003a [US1] **NEW task, added mid-implementation for spec.md's Part A addendum (FR-023–FR-025)** — add `expandable?: boolean` to `PanelConfigBase` in `src/layout/types.ts` (data-model.md §1a) — **DONE**. Purely additive on the shared base every one of the ten panel types already extends; `npx tsc --noEmit` clean afterward.

**Checkpoint**: Baseline confirmed clean; new config types compile. US3/US4 may now proceed once reached in priority order.

---

## Phase 3: User Story 1 - Expand-to-dialog only appears where it makes sense (Priority: P1) 🎯 MVP

**Goal**: Remove the expand-to-dialog control from `valuebox` and ordinary (non-full-page) `graphic-walker` panels; every other panel type keeps it unchanged (FR-001–FR-004).

**Independent Test**: Load a dashboard tab with one of every panel type; confirm the expand control is present only on the intended eight types (contracts/panel-expand-scoping.md).

**Independent of every other phase** — touches `src/layout/panelCard.tsx`/`src/panels/registry.tsx` only, never `ValueBoxPanel.tsx`.

### Tests for User Story 1

- [X] T004 [P] [US1] Create `tests/unit/panelRegistry.test.ts` — **DONE**. Two real, confirmed corrections made during implementation: (1) `tests/unit/registry.test.ts` already exists but tests an unrelated module (`panels/basemap/registry.ts`'s basemap presets, not `panels/registry.tsx`) — a new, distinctly-named file avoids conflating the two; (2) importing `panels/registry.tsx` itself (even just to cross-check `EXPANDABLE_PANEL_TYPES` entries against its keys) fails under Vitest's plain-Node unit-test environment — that module eagerly imports every real panel component, and `FlowMapPanel.tsx` (via `@flowmap.gl/layers`) throws a real "directory import is not supported resolving ES modules" error. Fixed by NOT importing `registry.tsx` at all (see T006's own note — the constant moved to its own dependency-free file). 11/11 tests passing: membership of all 8 expandable types, absence of `valuebox`/`graphic-walker`, and an exact-size check.
- [X] T005 [US1] Update `tests/integration/panelExpand.spec.ts` — **DONE**. (a) Swapped every generic expand-mechanism test's fixture from "Total Households" (valuebox) to "Mode Share by Purpose" (plotly) — 6 tests (Escape/click-outside/close-control/Tab-cycle/modal-blocks-background/expand-collapse-identical-data), plus 2 more adapted to plotly's own signals (`.js-plotly-plot` visibility instead of a literal `'1,500'` text; `'trip_mode_share'` instead of `'total_households'` as the query-count needle). (b) The "error state" test was ALSO forced to swap — a real, confirmed finding not in the original task description: `dashboard-2-detail.yaml`'s "Broken Panel (intentional)" (used by that test) is ITSELF a `valuebox`, so it lost its own expand trigger too; swapped to `dashboard-1-summary.yaml`'s "Observable Plot Broken Panel (intentional)" instead (no Detail-tab navigation needed — already on the landing tab), with a second real finding: that panel's error text ("Couldn't load this chart") is NOT unique on the tab (`PlotlyPanel.tsx`/`RechartsPanel.tsx` share it, and a real "Recharts Broken Panel (intentional)" fixture exists on the same tab) — scoped via `panelCard()` to avoid a strict-mode collision. (c) Added one new test confirming a valuebox panel ("Total Households") and the chromeless-mode-irrelevant graphic-walker case both show NO expand trigger (folded into T004's already-passing test). 17/17 tests passing.

### Implementation for User Story 1

- [X] T006 [P] [US1] Add exported `EXPANDABLE_PANEL_TYPES: Set<string>` constant — **DONE, with a real, confirmed deviation from data-model.md §1's original placement**: NOT co-located inside `src/panels/registry.tsx` (that module eagerly imports all ten real panel components, and importing it from a Vitest unit test — even indirectly, per T004 — fails on `FlowMapPanel.tsx`'s own `@flowmap.gl/layers` dependency under Vitest's plain-Node environment, a real error confirmed live, not assumed). Created as its own new, dependency-free module instead, `src/panels/expandablePanelTypes.ts`, with the same explicit 8-entry list from contracts/panel-expand-scoping.md.
- [X] T007 [US1] Update `src/layout/panelCard.tsx` — **DONE, updated mid-implementation for the Part A addendum**: `isExpandable = config.expandable ?? EXPANDABLE_PANEL_TYPES.has(config.type)` (not the originally-planned bare `EXPANDABLE_PANEL_TYPES.has(config.type)` — `config.expandable`, when explicitly set, now takes precedence via `??`, deliberately not `||`, so an explicit `false` override is never confused with "unset"). `usePanelExpandHost()` call kept fully unconditional (research.md §1). `CardHeader` renders `trigger` only when `PanelComponent && isExpandable`; `CardContent` renders `body` when `isExpandable`, else the panel directly — depends on T006, T003a
- [X] T007a [US1] **NEW task, Part A addendum** — add a new test confirming the override works in BOTH directions — **DONE**. Added `expandable: true` to the fixture's second valuebox ("Total Trips" — kept "Total Households" unmodified as the clean default-behavior control) and `expandable: false` to "Screenline Validation" (a `table`, kept "Screenline Validation (Raw)" unmodified as its own default-behavior control) in `tests/fixtures/dashboard-config/dashboard-1-summary.yaml`; confirmed via direct grep first that neither fixture reassignment collides with any other spec file's own use of those titles. New test in `panelExpand.spec.ts` proves both override directions plus that sibling panels of the same type without an override are unaffected. A real, confirmed test-locator bug found and fixed along the way: Playwright's `getByRole` `name` matches by SUBSTRING by default — the shared `expandTrigger()` helper (no `exact: true`) matched "Screenline Validation (Raw)"'s own button when queried for the exact-prefix title "Screenline Validation", producing a false failure; fixed with an inline `exact: true` locator for that specific assertion, not a change to the shared helper (every other call site's title is not a prefix of another's, so it stays unaffected).
- [X] T008 [US1] Run `npx playwright test tests/integration/panelExpand.spec.ts`, confirm the full file passes against the swapped fixture, the new no-expand-trigger assertion, and the new override test — **DONE**. 17/17 passing (up from the original 15, +1 override test, +1 net from the error-state fixture swap not changing the count).

**Checkpoint**: Expand-ability correctly scoped app-wide; existing expand-mechanism coverage intact against a still-expandable fixture. Independently shippable.

---

## Phase 4: User Story 2 - Value-box panels adopt a cleaner, more polished metric-card look (Priority: P1) 🎯 MVP

**Goal**: Redesign `ValueBoxPanel.tsx`'s visual layout to match shadcn's real metric-card pattern — label above value, tabular-aligned figures — with zero change to underlying data/behavior (FR-005–FR-009).

**Independent Test**: Load a dashboard tab with a row of value-box panels (no new config); confirm identical values/icons/units render in the new layout, in both themes.

**Depends on**: Nothing (Phase 2 not required — no new config fields are used by this story). Should land before Phase 5/6 since both add new zones onto this layout, but is independently testable and shippable on its own.

### Tests for User Story 2

- [X] T009 [US2] Create `tests/integration/valueBoxPanel.spec.ts` (new file) — **DONE**. 5 tests: no-new-config parity, `tabular-nums` presence, icon rendering, dark-mode legibility, and empty/error-state parity. A real, confirmed finding from this test's own first live run (not assumed): the label (`CardTitle`) and value are the SAME color in both themes — both inherit `text-card-foreground` from the shared `Card` ancestor, with neither setting an explicit color of its own — distinguished by size/weight only (16px vs. 30px). The test's own first draft wrongly assumed a muted-vs-full-strength color distinction (extrapolating too far from shadcn's own `CardDescription`-based reference); corrected to assert what's actually true and actually required by FR-005 (size/weight distinction, not color) rather than forcing a real code change to satisfy an assumption the requirement never actually made — see T010's own note for why a color change was deliberately rejected.

### Implementation for User Story 2

- [X] T010 [US2] Redesign `src/panels/ValueBoxPanel.tsx`'s ready-state JSX — **DONE, with a real, confirmed correction to this task's own original premise**: `ValueBoxPanel.tsx` never renders its own title/label at all — `layout/panelCard.tsx`'s shared `CardHeader`/`CardTitle` already renders `config.title` ABOVE `CardContent` (where this panel's own value renders) for EVERY panel type generically, already styled smaller (`text-base font-semibold`, `components/ui/card.tsx`) than the value's own `text-3xl` — confirmed by direct re-read of both files before touching either. FR-005's "label above value" is therefore already satisfied by the existing, shared chrome; the one genuinely new, real change (confirmed via research.md §4's shadcn fetch) is adding `tabular-nums` to the value's className. No other JSX restructuring was needed or made — a smaller, more honest diff than originally planned.
- [X] T011 [US2] Update `ValueBoxPanel.tsx`'s loading-state skeleton — **DONE, verified no change needed**: since T010 found the label is rendered by the shared, always-static `CardTitle` (never itself in a loading state — `config.title` is a synchronous config value, not fetched data), the existing icon-circle + value-bar skeleton already correctly represents everything THIS component's own loading state covers. No edit made.
- [X] T012 [US2] Confirm `ValueBoxPanel.tsx`'s existing empty/error states (via `PanelEmptyState`/`PanelErrorState`) render correctly inside the redesigned card with no behavior change — **DONE, verified via direct read**: both already render inside `CardContent`, below the same unchanged `CardHeader`/`CardTitle` — no behavior or code change needed, matching FR-009's own "restyled to match the new layout but otherwise unchanged" (there is no new layout to restyle these two states INTO, since T010's finding means Part B's only real visual change is the `tabular-nums` value, which neither of these two states even renders).
- [X] T013 [US2] Run `npx playwright test tests/integration/valueBoxPanel.spec.ts`, confirm passing in both themes — **DONE**, 5/5 passing.

**Checkpoint**: Value-box redesign shipped app-wide; every existing value-box panel visually updated with zero data/behavior regression. Independently shippable.

---

## Phase 5: User Story 3 - A value box shows how its metric varies across its own categories (Priority: P2)

**Goal**: Optional `sparkline` mode — a small embedded Recharts chart from a distinct grouped query (FR-010–FR-014).

**Independent Test**: Configure one value-box panel with `sparkline:`; confirm a real, data-driven mini-chart renders alongside the scalar value, while a panel without it is unaffected.

**Depends on**: Phase 2 (T003 — needs `ValueBoxSparklineConfig`). Builds on Phase 4's redesigned layout (renders into the zone that layout establishes) but does not require Phase 4's tasks to have run to compile or be tested in isolation.

### Tests for User Story 3

- [X] T014 [P] [US3] Extend `tests/unit/panelQuery.test.ts`: coverage for the new `buildSparklineQuery()` — **DONE**. 3 new tests (delegation/`SELECT *` shape, shared-filter reuse, `$scenario.` union when unpinned). 44/44 tests passing in this file (37 existing + 7 new, shared with T020 below).
- [X] T015 [US3] Extend `tests/integration/valueBoxPanel.spec.ts` — **DONE**. 3 new tests: real chart from a real, independent `trip_mode_share` query (`__debugQueryLog()`-confirmed); a broken sparkline metric leaves the primary value fully intact; a plain value box (no `sparkline:`) is completely unaffected. Required 3 new fixture panels in `tests/fixtures/dashboard-config/dashboard-1-summary.yaml` (a new `row_valuebox_trends` row) — a real, confirmed constraint found while designing the fixtures: `observed` never publishes `trip_mode_share` at all (only `summary_kpis`/`vmt_by_home_taz`), so every new fixture pins `scenario: good_scenario` explicitly, matching this project's own established single-scenario-pin convention.

### Implementation for User Story 3

- [X] T016 [US3] Add `buildSparklineQuery()` to `src/panels/panelQuery.ts` (data-model.md §5) — **DONE**. A new, purely additive export, delegating to the unmodified `buildPanelQuery()` via a synthetic object (needed a placeholder `title` field — required by `DataBoundPanelConfigBase` but confirmed never read by `buildPanelQuery()` itself). Zero change to any existing export.
- [X] T017 [US3] Create `src/panels/valueBoxSparkline.tsx` — **DONE**. Takes `rows`/`config` (`ValueBoxSparklineConfig`), calls the existing `encodeRechartsData()` unmodified, renders bare `BarChart`/`LineChart` + `Bar`/`Line` inside a `ResponsiveContainer` — no `ChartContainer`, no axes/tooltip/legend/grid.
- [X] T018 [US3] Wire a new, independent fetch effect into `ValueBoxPanel.tsx` — **DONE**. Keyed on `config`/`filters`/`activeScenarioNames`; own `idle`/`loading`/`ready`/`empty`/`error` state (`idle` when `config.sparkline` is unset — FR-014); renders `<ValueBoxSparkline>` on success, a small skeleton while loading, a small contained text indicator for empty/error — never touches the primary value's own `value`/`state`. `npx tsc --noEmit` clean.
- [X] T019 [US3] Run the extended `tests/integration/valueBoxPanel.spec.ts` sparkline scenarios, confirm passing in both themes — **DONE**, 14/14 passing (whole file, US2+US3+US4 together — all landed as one implementation pass).

**Checkpoint**: Sparkline mode fully functional, independently optional, and does not affect a panel that doesn't configure it.

---

## Phase 6: User Story 4 - A value box shows whether it's trending up or down against baseline (Priority: P2)

**Goal**: Optional `baseline_trend` mode — a directional badge reusing this app's existing `$baseline`/`expr` comparison technique via one new, small query builder (FR-015–FR-020).

**Independent Test**: Configure one value-box panel (with `scenario:` pinned) with `baseline_trend:`; confirm the badge's computed value matches an existing comparison-diff panel's own computation for the same two scenarios/metric/column; confirm the no-baseline and baseline-equals-current states both render correctly.

**Depends on**: Phase 2 (T003 — needs `ValueBoxBaselineTrendConfig`). Builds on Phase 4's redesigned layout, same relationship as Phase 5.

### Tests for User Story 4

- [X] T020 [P] [US4] Extend `tests/unit/panelQuery.test.ts`: coverage for the new `buildValueBoxBaselineTrendQuery()` — **DONE**. 3 new tests (exact SQL shape, verbatim `expr` interpolation, confirms no `JOIN`/`ON` clause — a real, independent sibling to `buildComparisonDiffQuery()`, never calling it). 44/44 tests passing (implemented together with T014/T016/T023 in one pass, since both new functions landed in the same file edit).
- [X] T021 [US4] Extend `tests/integration/valueBoxPanel.spec.ts` — **DONE, with a real, confirmed correction to this task's own original premise (a)**: no EXISTING `comparison: diff` panel in this fixture set uses a scalar metric+column at all — every one of `019-baseline-diff-consumption`'s own fixtures uses `vmt_by_home_taz` (multi-row). More significantly, `generate.py`'s own `SUMMARY_KPIS_ROWS` is written VERBATIM for both `observed`/`good_scenario` — every real summary_kpis column is IDENTICAL between them in this fixture set, so a same-column diff is always exactly 0 regardless of which two scenarios are compared, making a "cross-check against an existing panel" both impossible (no such panel exists) and insufficient (0 diff either way, indistinguishable from the deliberate "no change" case). Resolved by hand-verifying a real, deterministic, non-zero result directly against `generate.py`'s own real values instead (`a.total_trips - b.total_persons = 9200 - 3800 = 5400`, documented inline in the new fixture's own header comment) — proves the real scenario-view resolution and cross-join mechanism work correctly, which is what this test actually needs to prove. 6 new tests total: (a) real diff value + up-icon; (b) no-baseline state + automatic recovery (reusing `tablePanel.spec.ts`'s own established unregister/re-register technique); (c) `config-error` state (no `scenario:` pinned); (d) same-scenario "no change" state (`Minus` icon, confirmed absence of both trend icons); (e) a plain value box (no `baseline_trend:`) unaffected; (f) both trend modes together. Required 3 more new fixture panels (baseline_trend variants) plus 1 combined-modes panel, all in the same new `row_valuebox_trends` row as T015's.

### Implementation for User Story 4

- [X] T022 [US4] Create `src/components/ui/badge.tsx` — **DONE**. Adapted from shadcn's real, current `new-york-v4` registry source (fetched directly), `default`/`secondary`/`destructive`/`outline` variants only, `React.forwardRef` + `@/lib/utils` `cn` + single quotes + no `"use client"`, no Radix `Slot`/`asChild` (matching `button.tsx`'s own precedent as the closest non-Radix, `cva`-based primitive in this codebase).
- [X] T023 [US4] Add `buildValueBoxBaselineTrendQuery()` to `src/panels/panelQuery.ts` (data-model.md §5) — **DONE** (implemented alongside T016, same file edit). A new, purely additive export; zero change to `buildComparisonDiffQuery()`, `compare_on`, or any other existing export in this file.
- [X] T024 [US4] Wire a new, independent fetch effect into `ValueBoxPanel.tsx` — **DONE**. Reuses `useBaseline()`/`resolveComparisonScenarioName()` unmodified; `config.baseline_trend` set but `config.scenario` unset → `config-error` state, no query fired; own `idle`/`loading`/`ready`/`config-error`/`no-baseline`/`error` states (data-model.md §6). Renders `<Badge variant="outline">` with `TrendingUp`/`TrendingDown`/`Minus` (diff `> 0`/`< 0`/`=== 0` — the `Minus` case also covers the baseline-equals-current "no change" edge case, since the cross-join `expr` naturally evaluates to exactly 0 when both sides are the same scenario) plus `formatValue(diff, baseline_trend.format ?? config.format)`; a distinct muted `secondary` badge for `no-baseline`, `destructive` for `config-error`/`error`. `npx tsc --noEmit` clean; re-ran `valueBoxPanel.spec.ts` + `panelExpand.spec.ts` (22/22) to confirm zero regression from this same edit.
- [X] T025 [US4] Run the extended `tests/integration/valueBoxPanel.spec.ts` baseline-diff scenarios, confirm passing in both themes — **DONE**, all 14 tests in the file passing (US2+US3+US4 combined).

**Checkpoint**: Baseline-diff mode fully functional, independently optional, reuses the existing comparison mechanism with zero modification to it. Both new trend modes can coexist on one panel.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Full-suite verification and project documentation, after all four stories are complete.

- [X] T026 [P] Run `npm run typecheck` — **DONE**, clean (zero errors) — re-confirmed after all fixture/test edits below.
- [X] T027 [P] Run `npm run test:unit` — **DONE**, 403/403 passing (30 files) — up from the 386/386 baseline T002 recorded, the +17 being T004's new `panelRegistry.test.ts` (11) plus T014/T020's `panelQuery.test.ts` extensions (6).
- [X] T028 Run `npm run build` — **DONE**, clean build, no new warnings — only this project's existing, already-documented pre-existing ones (`@radix-ui/react-menu`'s "use client" ignore notice, >500kB chunk-size notices for `plotly`/`graphic-walker`/`maps`/`index`, none introduced by this feature).
- [X] T029 Run the full `tests/integration/` Playwright suite — **DONE**, with real, confirmed regressions found and fixed, and real pre-existing flakiness confirmed via isolated re-runs (never dismissed on assumption) — matching this project's own "confirm before concluding" discipline:
  - **First full run**: 303 passed, 10 failed. Investigated each:
    1. `dashboardShell.spec.ts` "a value-box panel displays a number matching its underlying fixture data" — **REAL regression, fixed**: `getByText('1,500')`/`getByText('9,200')` (no `.first()`) became strict-mode violations once T015/T021's new `row_valuebox_trends` fixture panels also legitimately display those same real values. Fixed by adding `.first()` to both assertions, with an explanatory comment.
    2. `graphicWalkerPanel.spec.ts` — 3 failures (`expanding via 004 relocates the same mounted panel...`, `collapsing returns the panel to the card...`, `all nine now-built panel types render without error on one tab (SC-005)`) — **REAL, EXPECTED consequence of Part A, fixed**: these pre-existing tests specifically exercised the 004 expand-to-dialog mechanism against a `graphic-walker` panel, which is no longer expandable by DEFAULT (FR-002). Fixed two different ways depending on what each test actually needs: (a) `dashboard-2-detail.yaml`'s "Free-form Visual Analytics" (used by the two User-Story-3 expand-mechanism tests) gained `expandable: true` — the new per-panel override (FR-023) exists for exactly this case, opting back in rather than discarding real expand-mechanism coverage for this panel type; (b) the SC-005 "all nine panel types render" test's own now-inapplicable expand-button assertion was removed instead (its own "(Summary Tab)" fixture panel was NOT given an override — SC-005 is about panel-type rendering, not expand-ability, so the correct fix is dropping the stale assertion, not manufacturing a second override with no real test need). Re-ran the whole file in isolation after: 29/29 passing.
    5–9. `dashboardShell.spec.ts` (dark-mode Plotly "no re-query"), `flowmapPanel.spec.ts:551` (reset-view-disabled timing), `settingsModal.spec.ts` (Appearance Light/Dark survives tab switch), `zonemapPanel.spec.ts` (choropleth fill-color) — each re-run in ISOLATION and confirmed PASSING alone. The dark-mode "no re-query" one was additionally cross-checked via `git stash` against the clean, unmodified tree — reproduced there too (Expected 79/Received 80, vs. this branch's Expected 103/Received 104 — same off-by-one-query flake CLAUDE.md's own history already documents repeatedly, just a different absolute count from this feature's own added fixture queries) — confirming it predates this feature entirely, not caused by it.
  - **Second full run** (re-confirmation, after the fixes above): 306 passed, 7 failed — a DIFFERENT set: the already-confirmed dark-mode "no re-query" flake and `flowmapPanel.spec.ts:551` recurred (already confirmed pre-existing above), plus 5 NEW ones (`flowmapPanel.spec.ts` onHover tooltip, `flowmapPanel.spec.ts` UGRC NavigationControl dark-mode, `rechartsPanel.spec.ts` tooltip legibility, `scenarioManager.spec.ts` local-folder-load, `settingsModal.spec.ts` raster-to-vector basemap switch) — none in a file this feature touches, none related to expand-ability/valuebox/panelQuery. Each re-run in isolation: all 5 passed alone. This run-to-run variation in WHICH tests fail (never the same 10 twice) is itself the signature of genuine multi-worker resource-contention flakiness (10 workers, real WebGL contexts/timing races) — not a regression, consistent with this project's own extensively pre-documented flakiness history.
  - **Net result**: zero real, unresolved regressions. 1 real regression found and fixed (dashboardShell fixture-collision). 3 real, expected, correctly-caused test failures from Part A's own design, fixed via the same per-panel-override mechanism this feature built. 9 other failures across two full runs, all individually confirmed passing in isolation (one additionally cross-checked against a clean tree) — genuine pre-existing/environmental flakiness, none newly introduced.
- [X] T030 [P] Add a `034-metric-panel-redesign` implementation-order entry to `CLAUDE.md`, recording the real findings from this feature (the expand-scoping mechanism and its hooks-safety reasoning, the shadcn metric-card research, the baseline-diff scalar-join gap and its resolution, the `panelExpand.spec.ts` fixture migration) — **DONE**.
- [X] T031 Run `quickstart.md`'s 7 validation scenarios end-to-end — **DONE**, all 7 confirmed via the passing `valueBoxPanel.spec.ts`/`panelExpand.spec.ts` suites plus the isolated full-suite re-runs above (each scenario maps directly to tests already run and confirmed passing in this same task).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1. **Blocks Phase 5 (US3) and Phase 6 (US4) only** — US1 and US2 use no new config field and do not depend on this phase.
- **User Story 1 (Phase 3)**: No dependency on Phase 2 or any other story. Touches `panelCard.tsx`/`registry.tsx` only.
- **User Story 2 (Phase 4)**: No dependency on Phase 2 or any other story. Touches `ValueBoxPanel.tsx`.
- **User Story 3 (Phase 5)**: Depends on Phase 2 (T003). Touches `ValueBoxPanel.tsx` — should follow Phase 4 to avoid two stories independently restructuring the same render function, though its own new fetch effect/zone is additive and doesn't require Phase 4's specific styling tasks to have run.
- **User Story 4 (Phase 6)**: Depends on Phase 2 (T003). Same file-sharing relationship with Phase 4 as Phase 5. Independent of Phase 5 (US3) — the two can be built in either order relative to each other, though testing "both together" (T021e) needs both complete.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Parallel Opportunities

- T002/T003 (Foundational) are `[P]` — different files.
- T004 (US1 unit test) is `[P]` relative to T005 (a different file, `registry.test.ts` vs. `panelExpand.spec.ts`).
- T006 (US1, `registry.tsx`) is `[P]` relative to T004/T005 (different files) — T007 is NOT `[P]`, since it imports the constant T006 creates.
- T014 (US3 unit test) and T020 (US4 unit test) both extend `panelQuery.test.ts` — NOT `[P]` against each other (same file), but each is `[P]` relative to that story's own integration-spec task (different file).
- US1 (Phase 3) and US2 (Phase 4) can be built fully in parallel by different people — zero shared files.
- US3 (Phase 5) and US4 (Phase 6) touch `ValueBoxPanel.tsx`/`panelQuery.ts` independently (different new functions, different new effects) but in the SAME two files — real merge coordination is needed if worked on simultaneously by different people; not marked `[P]` against each other for this reason, even though each story's own internal logic has no dependency on the other's.
- T026/T027/T030 (Polish) are `[P]` — independent checks/docs.

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 only)

1. Complete Phase 1: Setup
2. Complete Phase 3: User Story 1 (expand-ability scoping)
3. Complete Phase 4: User Story 2 (visual redesign)
4. **STOP and VALIDATE**: both P1 stories independently, per their own Independent Test
5. Ship — this alone delivers spec.md's two P1 user stories with zero new grammar

### Incremental Delivery

1. Setup → US1 + US2 (parallel, zero shared files) → validate → ship (MVP)
2. Add Foundational (T003) → US3 (sparkline) → validate → ship
3. Add US4 (baseline-diff) → validate → ship
4. Polish pass once all four are live
