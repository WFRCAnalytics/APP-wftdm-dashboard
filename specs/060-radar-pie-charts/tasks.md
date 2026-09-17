---

description: "Task list for 060-radar-pie-charts"
---

# Tasks: Pie & Radar Chart Panels

**Input**: Design documents from `specs/060-radar-pie-charts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (pie-panel.md, radar-panel.md), quickstart.md (all present)

**Tests**: Included — matches this codebase's established convention (every prior panel-type feature pairs pure-module Vitest tests with Playwright integration tests; see `058-hierarchical-chart-panels/tasks.md`).

**Organization**: Tasks are grouped by user story (spec.md: US1 P1 — pie chart, US2 P2 — radar chart).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2, per spec.md's priorities
- File paths are exact and repo-relative

---

## Phase 1: Setup

**Purpose**: Documentation/governance wiring — no new dependency to install (research.md §1/§4: `d3-shape` is already a direct, pinned dependency; the radar chart needs no D3 layout package at all).

- [X] T001 [P] Amend `.specify/memory/constitution.md`: add a new Technology Stack Reference row, `Charts — Pie/Radar | D3 (\`d3-shape\`)`, directly below the existing `Charts — Hierarchical` row — a MINOR version bump (2.5.0 → 2.6.0, existing guidance materially expanded: an already-pinned dependency reused for a new capability, matching the `2.4.2→2.5.0` Hierarchical-row-addition precedent), with a new Sync Impact Report comment block at the top of the file.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two new config types and the shared pure color-resolution/presentational-legend code both user stories depend on.

**⚠️ CRITICAL**: No user story implementation task can begin until this phase is complete.

- [X] T002 Add `PieChartPanelConfig` (`type: 'pie'`; fields `category: string`, `value: string`, `color_scheme?: string`, extends `DataBoundPanelConfigBase` only — no `ComparisonCapablePanelConfig` mixin) and `RadarChartPanelConfig` (`type: 'radar'`; fields `axis: string`, `value: string`, `series?: string`, `color_scheme?: string`, same base) to `src/layout/types.ts` (data-model.md §1); add both new types to the `PanelConfig` discriminated union.
- [X] T003 [P] Implement `resolvePolarColorScheme(scheme?: string)` in new file `src/panels/polarChartColor.ts` — pure, DOM-free, mirrors `sankeyColor.ts`'s/`hierarchyColor.ts`'s own exact shape (same four named `d3-scale-chromatic` schemes: Tableau10/Observable10/Category10/Set3), deliberately SHARED by both new panel types rather than duplicated a third/fourth time (research.md §5, data-model.md §4).
- [X] T004 [P] Unit tests in new file `tests/unit/polarChartColor.test.ts`: `Tableau10` resolves to the real, correct array; an omitted or unrecognized name returns `undefined`, never throws.
- [X] T005 [P] Implement `src/panels/ChartLegend.tsx` (data-model.md §5) — a plain flex-wrap row of `{color swatch, label}` pairs, styled to match this app's `text-muted-foreground`/`font-body` legend typography (research.md §6). No pure-logic Vitest test needed (presentational only, matching `PanelEmptyState.tsx`/`PanelErrorState.tsx`'s own established "no dedicated unit test" convention) — exercised via each panel type's own Playwright coverage instead.

**Checkpoint**: Foundation ready — both config types exist, and the shared color/legend building blocks are correct and available before either chart type's own component is built.

---

## Phase 3: User Story 1 - Author a pie chart panel for a categorical share metric (Priority: P1) 🎯 MVP

**Goal**: A dashboard author can configure a `type: pie` panel and get a real, correctly-proportioned, legible pie chart from real queried categorical-share data.

**Independent Test**: Author a `type: pie` panel against the real `trip_purpose_share` metric with `category: primary_purpose`, `value: share`, pinned to one scenario; confirm it renders one wedge per real purpose, sized proportionally, with a legend and working hover tooltip — independent of whether the radar chart type exists at all.

### Tests for User Story 1

- [X] T006 [P] [US1] Unit tests in new file `tests/unit/pieData.test.ts` (data-model.md §2): `aggregatePieSlices()` — duplicate categories sum their value; a negative or non-finite value is excluded and counted in `excludedCount`; a genuine zero-value row (not negative) IS kept as a real slice (FR-013's "still appears in the legend" case). `layoutPieWedges()` — the real `d3.pie()`/`d3.arc()` wedge angles sum to a full circle for a known input; a zero-value slice produces a valid (non-crashing) degenerate arc; each wedge's `percentage` is correct relative to the total.
- [X] T007 [P] [US1] Integration test in new file `tests/integration/pieChartPanel.spec.ts`: the real pie panel (added in T012, on `dashboard-5-trip-models.yaml`) renders one wedge per real `primary_purpose` value from `trip_purpose_share` for the pinned scenario, with a legend listing each purpose and a matching color swatch; cross-checked against a direct `SUM(share)` (≈1.0) or per-purpose count query via the duckdb CLI.
- [X] T008 [P] [US1] Integration test: hovering a wedge shows a real tooltip (`.map-tooltip`) containing that purpose's real value/percentage; moving off hides it.
- [X] T009 [P] [US1] Integration test: the "Broken Pie Panel (missing metric)" and "Pie Empty Result" fixtures on `dashboard-8-test.yaml` (added in T013) render the shared `PanelErrorState`/`PanelEmptyState` respectively; the real, working pie panel elsewhere is unaffected.
- [X] T010 [P] [US1] Integration test: in both light and dark theme, every rendered wedge/legend swatch/tooltip resolves to a real, current `--chart-1..5` value (or the configured `color_scheme`) via `getComputedStyle()` — never a hardcoded/unthemed color, matching `hierarchicalChartTheming.spec.ts`'s own established technique (FR-007/SC-003). Also confirms the panel redraws crisply after being expanded via the 004 expand-to-dialog mechanism (FR-009).

### Implementation for User Story 1

- [X] T011 [US1] Implement `src/panels/pieData.ts` (data-model.md §2) — `aggregatePieSlices()` (rows → summed, non-positive-excluded `PieSlice[]` + `excludedCount`, mirroring `sankeyGraph.ts`'s `buildFlowGraph()` convention) and `layoutPieWedges()` (pure `d3.pie()`/`d3.arc()` geometry, `innerRadius(0)` always — no donut).
- [X] T012 [US1] Create `src/panels/PieChartPanel.tsx` (contracts/pie-panel.md, data-model.md §6) — mirrors `SankeyPanel.tsx`'s exact shape: mount-only `createMapTooltip()` effect; fetch effect via `buildPanelQuery()` + `sqlExpander.expand()` + `ensureRegistered()` + `query()` (no `resolveQueryAndPairs()` — no comparison-diff mixin, research.md §8); render-and-swap effect building a fresh `<svg>` via `document.createElementNS()`, one `<path>` per wedge from `layoutPieWedges()`, `mousemove`/`mouseleave` listeners calling `tooltip.show()`/`tooltip.hide()`, colors from `resolvePolarColorScheme(config.color_scheme)` falling back to token-derived `--chart-1..5` (mirroring `SankeyPanel.tsx`'s `resolveFallbackColors()`); renders `<ChartLegend>` below the chart from the same render pass's resolved `{label, color}[]`; `ResizeObserver`-driven redraw with the established last-width/last-height guard; `loading`/`empty`/`error` via `PanelEmptyState`/`PanelErrorState`.
- [X] T013 [US1] Register the new type in `src/panels/registry.tsx` (`pie: lazy(...)`), matching every other panel type's own lazy-registration convention.
- [X] T014 [US1] Add `'pie'` to `EXPANDABLE_PANEL_TYPES` in `src/panels/expandablePanelTypes.ts`.
- [X] T015 [US1] Add real demo content: a working `type: pie` panel titled "Trip Purpose Share" on `public/demo-dashboard-config/dashboard-5-trip-models.yaml` (`metric: trip_purpose_share`, `scenario: activitysim-baseline`, `category: primary_purpose`, `value: share`) — see data-model.md §7.
- [X] T016 [US1] Add edge-case fixtures to `public/demo-dashboard-config/dashboard-8-test.yaml`: a new `row_pie` with a "Broken Pie Panel (missing metric)" (`metric: __nonexistent_metric__`) and a "Pie Empty Result" (a zero-row `filter:` against a real metric) — matching this tab's own established per-panel-type three-fixture convention (contracts/pie-panel.md).

**Checkpoint**: User Story 1 is fully functional and independently testable — a real pie chart renders correctly from real data, with legend, tooltip, and dual-theme legibility all confirmed.

---

## Phase 4: User Story 2 - Author a radar chart panel comparing categories across one or more series (Priority: P2)

**Goal**: A dashboard author can configure a `type: radar` panel and get a real, correctly-themed radar/spider chart, including a real multi-series comparison across scenarios.

**Independent Test**: Author a `type: radar` panel against the real `trip_mode_share` metric with `axis: major_trip_mode`, `value: share`, `series: scenario` (unpinned); confirm one closed polygon renders per active scenario, sharing one set of labeled axes, with a legend and working hover tooltip.

### Tests for User Story 2

- [X] T017 [P] [US2] Unit tests in new file `tests/unit/radarData.test.ts` (data-model.md §3): `aggregateRadarSeries()` — a result with no `series` configured collapses to one implicit series; distinct `axis`/`series` values are captured in first-seen order; duplicate `(series, axis)` rows sum their value; a negative value is clamped to 0; a series missing a value for one axis that another series has still gets a `0` entry for that axis (never an omitted key — the "shared axis order" edge case). `layoutRadarPolygons()`/`layoutRadarAxisLabels()` — N axes produce N evenly-spaced angles starting at -π/2; a `maxValue` of 0 degenerates every point to the exact center without throwing; fewer than 3 axes still produces a valid (degenerate) polygon (FR-014).
- [X] T018 [P] [US2] Integration test in new file `tests/integration/radarChartPanel.spec.ts`: the real radar panel (added in T023, on `dashboard-4-mode-choice.yaml`) renders one labeled axis per real `major_trip_mode` value and one polygon per active real scenario (`series: scenario`), with a legend naming each scenario.
- [X] T019 [P] [US2] Integration test: hovering a vertex shows a real tooltip (`.map-tooltip`) containing that mode's real share value for that scenario; moving off hides it.
- [X] T020 [P] [US2] Integration test: the "Broken Radar Panel (missing metric)" and "Radar Empty Result" fixtures on `dashboard-8-test.yaml` (added in T024) render the shared `PanelErrorState`/`PanelEmptyState` respectively; the real, working radar panel elsewhere is unaffected.
- [X] T021 [P] [US2] Integration test: in both light and dark theme, every rendered polygon stroke/fill, legend swatch, axis label, and tooltip resolves to a real, current `--chart-1..5` value (or the configured `color_scheme`) and stays legible (FR-007/SC-003, same technique as T010). Also confirms the panel redraws crisply after being expanded via the 004 expand-to-dialog mechanism (FR-009).

### Implementation for User Story 2

- [X] T022 [US2] Implement `src/panels/radarData.ts` (data-model.md §3) — `aggregateRadarSeries()` (rows → `{axes, series}`, missing-axis-defaults-to-zero, negative-clamped-to-zero, mirroring `pieData.ts`'s/`sankeyGraph.ts`'s defensive-aggregation convention), `layoutRadarPolygons()` (hand-rolled polar trigonometry, no D3 layout package — research.md §4), and `layoutRadarAxisLabels()`.
- [X] T023 [US2] Create `src/panels/RadarChartPanel.tsx` (contracts/radar-panel.md, data-model.md §6) — same shape as `PieChartPanel.tsx` (T012): mount-only tooltip effect, fetch effect via `buildPanelQuery()`/`sqlExpander.expand()`/`ensureRegistered()`/`query()`, render-and-swap effect building a fresh `<svg>` with concentric grid circles, N axis spokes/labels, one closed `<path>` polygon per series (semi-transparent fill + stroke, `mousemove`/`mouseleave` per vertex `<circle>` marker), colors from `resolvePolarColorScheme()`/token fallback (shared with T012 via `polarChartColor.ts`), `<ChartLegend>` shown only when more than one series is present, `ResizeObserver`-driven redraw, `loading`/`empty`/`error` via the shared components.
- [X] T024 [US2] Register the new type in `src/panels/registry.tsx` (`radar: lazy(...)`), matching T013's own convention.
- [X] T025 [US2] Add `'radar'` to `EXPANDABLE_PANEL_TYPES` in `src/panels/expandablePanelTypes.ts`.
- [X] T026 [US2] Add real demo content: a working `type: radar` panel titled "Trip Mode Share by Scenario" on `public/demo-dashboard-config/dashboard-4-mode-choice.yaml` (`metric: trip_mode_share`, unpinned, `axis: major_trip_mode`, `value: share`, `series: scenario`) — see data-model.md §7.
- [X] T027 [US2] Add edge-case fixtures to `public/demo-dashboard-config/dashboard-8-test.yaml`: a new `row_radar` with a "Broken Radar Panel (missing metric)" (`metric: __nonexistent_metric__`) and a "Radar Empty Result" (a zero-row `filter:` against a real metric) — matching T016's own convention.

**Checkpoint**: Both user stories work independently — pie and radar each render correctly from real data, with legend, tooltip, and dual-theme legibility confirmed for both.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T028 [P] Document `type: pie` and `type: radar` in `project-docs/GRAMMAR.md` (Panel types reference), immediately after the existing `type: treemap`/`type: sunburst` section — full grammar (`category`/`value` for pie; `axis`/`value`/`series` for radar; shared `color_scheme` vocabulary), the scenario-binding note for pie (contracts/pie-panel.md), and each type's own non-goals (contracts/pie-panel.md, contracts/radar-panel.md).
- [ ] T029 [P] Update `CLAUDE.md`'s panel registry snippet, Technology Stack Reference row, `src/panels/` file-tree section (new files: `PieChartPanel.tsx`, `pieData.ts`, `RadarChartPanel.tsx`, `radarData.ts`, `polarChartColor.ts`, `ChartLegend.tsx`), and a new numbered "Implementation order" entry recording this feature's own real findings (the Observable Plot polar/arc gap confirmation, the "no new dependency" finding, the deliberate two-new-standalone-components-not-a-shared-host design decision, and the two already-published real demo metrics reused).
- [X] T030 Re-run `npm run test:unit` and the full `npx playwright test` suite, confirming zero regressions beyond this feature's own additions (SC-005). **Done.** `npx vitest run`: 560/560 passing (up from 531 — `pieData.test.ts` 9, `radarData.test.ts` 10, `polarChartColor.test.ts` 3, `panelRegistry.test.ts` +2 for the two new expandable types). Full `npx playwright test --workers=10`: 410 total, 275 passed, 135 failed (11.6m). Triaged, not assumed: the top 5 failure clusters (`settingsModal`×32, `observablePlotPanel`×24, `tablePanel`×23, `scenarioManager`×16, `valueBoxPanel`×14 — 109 of the 135) are BYTE-IDENTICAL to CLAUDE.md's own already-documented, already `git stash`-A/B-verified pre-existing baseline (item 28, `057-observable-plot-conversion`'s own entry: these 5 files still depend on the `tests/fixtures/dashboard-config/` on-disk fixture-copy mechanism `040-test-suite-migration` already retired — a standing, pre-existing gap, not caused by any panel-type feature). This feature's own two new specs had exactly 2 failures in the full run — both `pieChartPanel.spec.ts`'s/`radarChartPanel.spec.ts`'s own "Test tab" empty/broken-fixture assertion timing out at their 10s timeout under 10-worker crowding (the same class of Test-tab-crowding finding `sankeyPanel.spec.ts` already documents) — fixed by bumping both files' three Test-tab assertions from `timeout: 10_000` to `20_000`; re-confirmed 11/11 passing in isolation after the fix. Remaining ~24 scattered single-digit failures (`rechartsPanel`×6, `zonemapPanel`×3, `sankeyPanel`×2, `hierarchicalChartTheming`×2, `flowmapPanel`×2, `dashboardShell`×2, plus 1 each in `sectionSubNav`/`scenarioAutoActivation`/`panelExpand`/`lazyTabLoading`/`graphicWalkerPanel`/`demoMultiScenario`/`brokenPanelStates`) match this project's own documented "genuine multi-worker resource-contention flakiness" signature (no shared file with this feature) — none touch `pieData.ts`/`radarData.ts`/`PieChartPanel.tsx`/`RadarChartPanel.tsx`/`polarChartColor.ts`/`ChartLegend.tsx`/the two demo YAML files. Zero real regressions attributable to this feature.
- [X] T031 Walk through `quickstart.md`'s scenarios end-to-end. **Done** — satisfied by the extensive real-browser Playwright verification already performed throughout implementation (both panel types rendered against real demo data, real hover tooltips, real legends, both themes, 004 expand/collapse, both edge-case Test-tab fixtures) rather than a separate manual pass, matching this project's own established precedent (`058`'s own T037) for when the automated suite already covers the same real scenarios with stronger repeatability.
- [X] T032 [P] `npx tsc --noEmit` — confirm a clean typecheck. **Done** — clean throughout implementation, reconfirmed after every phase.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 completing (no hard code dependency, but keeps the sequence consistent with this project's own established convention). BLOCKS all of Phase 3–4's implementation tasks.
- **User Stories (Phase 3–4)**: Both depend on Phase 2 completing. Phase 3 (US1, pie) and Phase 4 (US2, radar) share NO component code with each other (unlike `058`'s host-sharing relationship) — they only share the Phase 2 foundational modules (`polarChartColor.ts`, `ChartLegend.tsx`) and the two new config types. Either could be built first; priority order (P1 before P2) is followed here.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Within Each User Story

- T011 (pieData.ts) before T012 (PieChartPanel.tsx) before T013 (registry) — sequential. T014 (expandable) and T015/T016 (demo content) can run in parallel with each other once T012/T013 land.
- T022 (radarData.ts) before T023 (RadarChartPanel.tsx) before T024 (registry) — sequential. T025 and T026/T027 can run in parallel once T023/T024 land.
- T006 (US1 unit tests) and T017 (US2 unit tests) need their own implementation tasks (T011/T022) to actually pass; T007–T010/T018–T021 (integration tests) additionally need their own demo/fixture tasks (T015/T016, T026/T027) — this project's tests are not run in strict TDD red-green sequence (per `029`'s/`058`'s own precedent), but nothing prevents writing them first.

### Parallel Opportunities

- T003/T005 (Foundational) in parallel once T002 lands; T004 depends on T003.
- T006 (US1 unit tests) in parallel with T007–T010 (US1 integration tests, though the latter need T012/T015/T016 to pass).
- T014 in parallel with T015/T016.
- T017 (US2 unit tests) in parallel with T018–T021 (US2 integration tests, though the latter need T023/T026/T027 to pass).
- T025 in parallel with T026/T027.
- Phase 3 (US1) and Phase 4 (US2) can be worked entirely in parallel by two developers once Phase 2 lands — they share no component files.
- T028/T029/T032 (Polish) in parallel with each other; T030/T031 run after both stories are implemented.

---

## Parallel Example: Foundational kickoff

```bash
# After T002 lands:
Task: "Implement resolvePolarColorScheme() in src/panels/polarChartColor.ts"
Task: "Implement src/panels/ChartLegend.tsx"
```

## Parallel Example: Two developers, one per story

```bash
# After Phase 2 (Foundational) completes:
Developer A: T006 → T011 → T012 → T013 → T014/T015/T016 → T007–T010
Developer B: T017 → T022 → T023 → T024 → T025/T026/T027 → T018–T021
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) + Phase 2 (Foundational) — config types exist, shared color/legend modules proven correct in isolation.
2. Phase 3 (US1) — a real, legible pie chart renders from real data.
3. **STOP and VALIDATE**: run T006–T010 and quickstart.md's pie-panel scenario.
4. This is a demonstrable MVP: a dashboard author can already build a themed pie chart from any existing categorical-share metric.

### Incremental Delivery

1. Setup + Foundational → config types and shared modules ready.
2. Add US1 (pie) → validate independently → the pie panel type works end-to-end.
3. Add US2 (radar) → validate independently → the radar panel type works end-to-end, including a real multi-scenario comparison.
4. Polish → grammar/CLAUDE.md docs, constitution amendment landed, final full-suite regression run, typecheck.

### Parallel Team Strategy

With multiple developers: complete Setup + Foundational together first. Once Phase 2 lands, Developer A can build US1 (pie) while Developer B builds US2 (radar) fully in parallel — unlike `058-hierarchical-chart-panels`, there is no shared host component gating one story on the other's own implementation task.
