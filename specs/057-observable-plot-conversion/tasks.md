---

description: "Task list template for feature implementation"
---

# Tasks: Observable Plot Chart Consolidation

**Input**: Design documents from `/specs/057-observable-plot-conversion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Not separately requested as TDD, but this feature's Success
Criterion SC-006 ("zero broken chart panel that worked before") makes
updating the existing, currently-passing Playwright suite mandatory, not
optional — those test-update tasks are included inline within each user
story's own phase, scoped to exactly that story's own converted panel(s),
per contracts/test-migration.md.

**Organization**: Tasks are grouped by user story (spec.md) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task names an exact file path

---

## Phase 1: Setup

**Purpose**: Establish a before/after baseline so "no regression outside
the touched areas" is verifiable, not assumed.

- [X] T001 Establish the pre-change baseline: run `npx tsc --noEmit` and `npm run test:unit`, recording pass counts; run `git diff --stat -- public/demo-dashboard-config/dashboard-8-test.yaml src/panels/panelQuery.ts src/services/sqlExpander.ts src/panels/PlotlyPanel.tsx src/panels/plotlyTraces.ts src/panels/RechartsPanel.tsx src/panels/rechartsEncoding.ts src/panels/SankeyPanel.tsx src/panels/sankeyGraph.ts src/panels/sankeyColor.ts` (expect empty output) as the reference `git diff --stat` re-checked in T033.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Confirm the shared grammar every user story below relies on
already exists — a read-only verification gate, not new code (research.md
§5 already confirmed this during planning; re-confirm here before content
edits begin).

**⚠️ CRITICAL**: No user story work should begin until this is confirmed.

- [X] T002 Re-confirm `ObservablePlotPanelConfig` (`src/layout/types.ts`) and `resolveObservablePlotEncoding()` (`src/panels/observablePlotEncoding.ts`) already support every field every conversion below needs (`mark`, `x`, `y`, `fill`, `tip`, `grid`, plus the shared `scenario`/`filter` fields from `DataBoundPanelConfigBase`) — read-only, per data-model.md §1; if anything is missing, STOP and escalate before proceeding (this would mean research.md's own confirmed finding was wrong).

**Checkpoint**: Foundation confirmed — user story implementation may begin.

---

## Phase 3: User Story 1 - Consistent chart rendering across the dashboard (Priority: P1) 🎯 MVP

**Goal**: Every Plotly-rendered chart panel in the real demo content (4
panels, 3 tabs) renders via Observable Plot instead, showing the same
data.

**Independent Test**: Open the Summary, Tour, Mode Choice, and Trip tabs;
confirm each of the four named panels renders via Observable Plot
(`.observable-plot-chart svg[viewBox]` visible, no `.js-plotly-plot`
anywhere in the real demo content) showing the same figures as before.

### Implementation for User Story 1

- [X] T003 [P] [US1] Convert the "Average Trip Distance by Purpose" panel in `public/demo-dashboard-config/dashboard-1-summary.yaml` from `type: plotly` to `type: observable-plot` per contracts/panel-conversions.md
- [X] T004 [P] [US1] Convert the "Non-Mandatory Tour Frequency by Purpose" panel in `public/demo-dashboard-config/dashboard-3-tour-models.yaml` from `type: plotly` to `type: observable-plot` per contracts/panel-conversions.md
- [X] T005 [P] [US1] Convert the "Trip Mode Share by Time-of-Day Period (WALK_LOC)" panel in `public/demo-dashboard-config/dashboard-4-mode-choice.yaml` from `type: plotly` to `type: observable-plot` per contracts/panel-conversions.md — leave the same file's `row_trip_mode_flow` (sankey) panel completely untouched
- [X] T006 [P] [US1] Convert the "Trip Departure Hour (Work Trips)" panel in `public/demo-dashboard-config/dashboard-5-trip-models.yaml` from `type: plotly` to `type: observable-plot` per contracts/panel-conversions.md

### Test updates for User Story 1

- [X] T007 [P] [US1] In `tests/integration/dashboardShell.spec.ts`: replace both `.js-plotly-plot` visibility checks for "Average Trip Distance by Purpose" with `.observable-plot-chart svg[viewBox]`; replace the `page.evaluate` read of `gd.data.length` (Plotly trace count) with an equivalent count of the 3 active scenarios via the rendered legend swatches or distinct `fill` colors (confirm exact selector against the live DOM); rewrite the dark-mode `.js-plotly-plot .bg` computed-style assertion to check the `--plot-background`/`--card` mechanism per research.md §8/contracts/test-migration.md
- [X] T008 [P] [US1] In `tests/integration/panelExpand.spec.ts`: rewrite every `.js-plotly-plot` locator (all ~10 assertions keyed on `CHART_TITLE = 'Average Trip Distance by Purpose'`, inline and expanded-dialog states alike) to `.observable-plot-chart svg[viewBox]`, preserving the existing DOM-identity assertions across expand/collapse
- [X] T009 [P] [US1] In `tests/integration/lazyTabLoading.spec.ts`: rewrite `chart.locator('svg').getByText(scenarioName)` to `chart.locator('.observable-plot-chart [class*="-swatches"]').getByText(scenarioName)` per research.md §9 (legend swatches render as a sibling of the chart `<svg>`, not nested inside it)
- [X] T010 [P] [US1] In `tests/integration/scenarioColorOverride.spec.ts`: update only the "Average Trip Distance by Purpose"-specific assertions — swap the `.js-plotly-plot` visibility check to `.observable-plot-chart svg[viewBox]` and rewrite its trace-color assertion to read the resolved `fill`/`stroke` on the rendered marks/swatches; leave the "Total Trips by Mode" (`.recharts-wrapper`) assertions in this same file untouched for now (completed by T017)
- [X] T011 [P] [US1] In `tests/integration/scenarioLabelDisplay.spec.ts`: update only the "Average Trip Distance by Purpose"-specific assertions, same rewrite approach as T010; leave "Total Trips by Mode" assertions untouched (completed by T018)
- [X] T012 [P] [US1] In `tests/integration/switchControlsUnpinnedPanels.spec.ts`: update only the "Average Trip Distance by Purpose"-specific (`plotlyCard`) locator/assertions; leave the "Total Trips by Mode" (`rechartsCard`) assertions untouched (completed by T019)
- [X] T013 [P] [US1] In `tests/integration/demoMultiScenario.spec.ts`: update only the "Average Trip Distance by Purpose"-specific (`pl`) comments/locators; leave the "Total Trips by Mode" (`rc`) comments/locators untouched (completed by T020)

**Checkpoint**: Run `npx playwright test tests/integration/dashboardShell.spec.ts tests/integration/panelExpand.spec.ts tests/integration/lazyTabLoading.spec.ts tests/integration/scenarioColorOverride.spec.ts tests/integration/scenarioLabelDisplay.spec.ts tests/integration/switchControlsUnpinnedPanels.spec.ts tests/integration/demoMultiScenario.spec.ts --workers=1` and manually spot-check the four US1 panels (quickstart.md §1). User Story 1 is complete and independently demonstrable here — the four Plotly panels are gone from real content; Recharts panels and the Sankey panel are still untouched.

---

## Phase 4: User Story 2 - Recharts panels (including value-box sparklines) converted (Priority: P2)

**Goal**: Every Recharts-rendered chart panel in the real demo content (2
panels) renders via Observable Plot, and the value-box sparkline
mechanism renders via Observable Plot at its existing compact size.

**Independent Test**: Open the Summary and Mode Choice tabs; confirm the
two named panels render via Observable Plot; independently, exercise a
value-box sparkline (`dashboard-8-test.yaml`'s existing broken-sparkline
row, or the fixture suite's own working sparkline panel) and confirm it
renders via Observable Plot at its existing 40px, chrome-less size.

### Implementation for User Story 2

- [X] T014 [P] [US2] Convert the "Total Trips by Mode" panel in `public/demo-dashboard-config/dashboard-1-summary.yaml` from `type: recharts` to `type: observable-plot` per contracts/panel-conversions.md
- [X] T015 [P] [US2] Convert the "At-Work Subtour Mode Share by Purpose" panel in `public/demo-dashboard-config/dashboard-4-mode-choice.yaml` from `type: recharts` to `type: observable-plot` per contracts/panel-conversions.md (note `fill: tour_mode`, not `scenario` — it stays pinned to the baseline scenario, per contracts/panel-conversions.md's own explanation)
- [X] T016 [US2] Re-implement `src/panels/valueBoxSparkline.tsx` to render via `@observablehq/plot` (`Plot.plot()` with `axis: null` on both scales, explicit `height: 40`, the same `--plot-background` theming fix `ObservablePlotPanel.tsx` already uses) instead of bare Recharts primitives, per contracts/valuebox-sparkline-plot.md — preserve the exact same exported function signature, the same `h-10 w-full aria-hidden` container, and the same `chart_type: 'bar' | 'line'` behavior

### Test updates for User Story 2

- [X] T017 [P] [US2] (done together with T010 — same file, single consistent pass) In `tests/integration/scenarioColorOverride.spec.ts`: update the remaining "Total Trips by Mode"-specific assertions (the `.recharts-wrapper` visibility check and its series-color assertion) to `.observable-plot-chart svg[viewBox]` and the resolved `fill` on the rendered marks/swatches — this completes the file T010 started
- [X] T018 [P] [US2] (done together with T011) In `tests/integration/scenarioLabelDisplay.spec.ts`: update the remaining "Total Trips by Mode"-specific assertions, same approach — completes the file T011 started
- [X] T019 [P] [US2] (done together with T012) In `tests/integration/switchControlsUnpinnedPanels.spec.ts`: update the remaining "Total Trips by Mode" (`rechartsCard`) locator/assertions — completes the file T012 started
- [X] T020 [US2] (done together with T013) In `tests/integration/demoMultiScenario.spec.ts`: update the remaining "Total Trips by Mode" (`rc`) comments/locators — completes the file T013 started
- [X] T021 [P] [US2] In `tests/integration/markdownPanel.spec.ts`: update the stale `// recharts`/`// plotly` inline comments for both panels to reflect Observable Plot (assertions themselves are title-only and need no change)
- [X] T022 [US2] Run `tests/integration/metricStrip.spec.ts` and confirm its "Total Trips by Mode" title-only assertion still passes unchanged — no edit expected (research.md §10); if it fails, investigate before marking this task done
- [X] T023 [US2] In `tests/integration/valueBoxPanel.spec.ts` (depends on T016): rewrote the three Recharts-specific sparkline-mechanism assertions to their Observable Plot equivalents (`.observable-plot-chart svg[viewBox] rect` / `.observable-plot-chart` absence/presence). **Could not be verified end-to-end**: this whole file's `boot()` turned out to be pre-existing broken, confirmed via a real `git stash` A/B — it depends on a fixture copy-in mechanism `040-test-suite-migration` already retired, unrelated to this feature (research.md §10b, new). The rewritten selectors are logically correct by construction (same convention proven working everywhere else this feature touched) but full verification of this file is blocked on a separate, pre-existing migration gap, out of this feature's scope.
- [X] T024 [US2] (depends on T016) Ran `tests/integration/brokenPanelStates.spec.ts` in full isolation: 9/9 passing, including "a valuebox with a broken sparkline / baseline_trend still shows its scalar value" — this is the real, working, real-content-based regression coverage for the sparkline conversion (research.md §10b)

**Checkpoint**: Run `npx playwright test tests/integration/scenarioColorOverride.spec.ts tests/integration/scenarioLabelDisplay.spec.ts tests/integration/switchControlsUnpinnedPanels.spec.ts tests/integration/demoMultiScenario.spec.ts tests/integration/markdownPanel.spec.ts tests/integration/metricStrip.spec.ts tests/integration/valueBoxPanel.spec.ts tests/integration/brokenPanelStates.spec.ts --workers=1` and manually spot-check the two US2 panels plus a sparkline (quickstart.md §1). User Stories 1 AND 2 are both complete and independently demonstrable here — zero real Plotly or Recharts chart panels remain in the demo content; the Sankey panel is still untouched.

---

## Phase 5: User Story 3 - Existing Observable Plot panels confirmed correct (Priority: P3)

**Goal**: The five chart panels already rendered via Observable Plot are
confirmed correct and idiomatic; any concrete, confirmed defect is fixed.

**Independent Test**: Review each of the five panels' configuration and
the shared encoding module against Observable Plot's own idioms; apply a
fix only where a real issue is confirmed.

### Implementation for User Story 3

- [X] T025 [P] [US3] (reviewed, no defect found) Review the "School Location Distance Distribution" panel (`public/demo-dashboard-config/dashboard-2-person-household.yaml`) against research.md §7's audit; fix only if a concrete defect is found
- [X] T026 [P] [US3] (reviewed, no defect found) Review the "Workplace Location Distance Distribution" panel (`public/demo-dashboard-config/dashboard-2-person-household.yaml`) against research.md §7's audit; fix only if a concrete defect is found
- [X] T027 [P] [US3] (reviewed, no defect found) Review the "Joint Tour Destination Distance" panel (`public/demo-dashboard-config/dashboard-3-tour-models.yaml`) against research.md §7's audit; fix only if a concrete defect is found
- [X] T028 [P] [US3] (reviewed, no defect found) Review the "Non-Mandatory Tour Destination Distance" panel (`public/demo-dashboard-config/dashboard-3-tour-models.yaml`) against research.md §7's audit; fix only if a concrete defect is found
- [X] T029 [P] [US3] (reviewed, no defect found) Review the "Trip Destination Distance Distribution" panel (`public/demo-dashboard-config/dashboard-5-trip-models.yaml`) against research.md §7's audit; fix only if a concrete defect is found
- [X] T030 [US3] (reviewed, no defect found — no code change) Re-confirm `src/panels/observablePlotEncoding.ts` and `src/panels/ObservablePlotPanel.tsx` against research.md §7's specific findings (null-filtering, tip-mode-per-mark, scenario label/color fallback, automatic legend); apply a fix only if a concrete, confirmed defect surfaces — expected outcome per research.md is no code change
- [X] T031 [US3] Ran `npx playwright test tests/integration/observablePlotPanel.spec.ts --workers=1`: all 24 tests fail. **Confirmed pre-existing via `git stash` A/B** (identical 24/24 failures on a fully clean tree) — this file depends on the same retired `tests/fixtures/dashboard-config/` mechanism as §10b's `valueBoxPanel.spec.ts` finding, a fifth instance of the `040-test-suite-migration` gap (research.md §10c). `git diff --stat -- src/panels/observablePlotEncoding.ts src/panels/ObservablePlotPanel.tsx` is confirmed empty; real, passing, end-to-end confirmation of both shared files comes instead from every US1/US2 checkpoint test that already renders a converted panel through this exact component (all passed).

**Checkpoint**: All three user stories are independently functional. If T025–T030 found and fixed a real defect, re-run T031 to confirm the fix.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Resolve the one cross-story test conflict this feature
deliberately creates, then confirm the whole feature end-to-end.

- [X] T032 Rewrite `tests/integration/demoContentAllPanels.spec.ts`'s "every one of the ten registered panel types renders at least once, real and non-empty" test (depends on T003, T006, T014 all being complete — it asserts on the Summary tab, which both a US1 and a US2 panel occupy): remove the now-failing `.js-plotly-plot`/`svg path.recharts-rectangle` assertions, replace them with an assertion that the Summary tab's own panels now render via `.observable-plot-chart svg[viewBox]`, and update the test's own name/comment to state that `plotly`/`recharts` remain fully supported panel types, exercised for real via `dashboard-8-test.yaml`'s own error-state coverage rather than by real Summary-tab data — per research.md §10a/contracts/test-migration.md
- [X] T033 [P] Confirm the zero-diff invariant from T001 still holds: re-run `git diff --stat -- public/demo-dashboard-config/dashboard-8-test.yaml src/panels/panelQuery.ts src/services/sqlExpander.ts src/panels/PlotlyPanel.tsx src/panels/plotlyTraces.ts src/panels/RechartsPanel.tsx src/panels/rechartsEncoding.ts src/panels/SankeyPanel.tsx src/panels/sankeyGraph.ts src/panels/sankeyColor.ts` and confirm empty output (FR-005/FR-010/FR-011)
- [X] T034 Ran the full regression suite: `npx tsc --noEmit` clean; `npm run test:unit` 481/481 passing (unchanged); the complete `npx playwright test tests/integration/ --workers=1` — 240 passed, 135 failed, run twice to confirm reproducibility (identical both times, ~34.6 min each). **Every one of the 135 failures triaged and confirmed pre-existing** via `git stash` A/B against a fully clean tree, spread across 9 files (`settingsModal`×32, `observablePlotPanel`×24, `tablePanel`×23, `scenarioManager`×16, `valueBoxPanel`×14, `sankeyPanel`×11, `rechartsPanel`×8, `scenarioAutoActivation`×6, `flowmapPanel`×1) — each file's failure count matched exactly on the clean tree. Zero real regressions. Full detail in research.md §10d — a large, genuinely pre-existing test-infrastructure gap (8 of the 9 files depend on a fixture-copy mechanism `040-test-suite-migration` already retired), explicitly out of this feature's own scope, flagged in full rather than silently worked around.
- [X] T035 Spot-check per quickstart.md §1, via a real, throwaway Playwright smoke test (not part of the permanent suite, deleted immediately after — this project's own established convention): booted once, walked all four tabs (Summary/Tour/Mode Choice/Trip), confirmed all six converted panels render real Observable Plot output, confirmed the untouched Sankey panel renders correctly alongside two converted panels on the same tab, flipped to dark mode and re-confirmed a converted panel and the Sankey panel both still render — 1/1 passing
- [X] T036 Add a new numbered entry to `CLAUDE.md`'s "Implementation order" list documenting `057-observable-plot-conversion`'s outcome (converted panels, the Sankey/hierarchical research findings, the sparkline conversion, the already-Observable-Plot audit result, and the `demoContentAllPanels.spec.ts` invariant change), matching this project's own established per-feature documentation convention

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. A pure verification gate — if it fails, stop and reconcile with research.md before any user story work.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational. Its test-update tasks (T017–T020) complete files T010–T013 (US1) started — sequenced after US1 for that reason, not a hard architectural dependency (US2's own panel conversions, T014–T016, have no dependency on US1 at all and could run first if reprioritized).
- **User Story 3 (Phase 5)**: Depends on Foundational only — genuinely independent of US1/US2 (it reviews *different* panels). Could run in parallel with US1/US2 by a second contributor.
- **Polish (Phase 6)**: T032 depends on both US1 (T003, T006) and US2 (T014) being complete. T033–T036 depend on all prior phases.

### Within Each User Story

- Panel-conversion tasks (different YAML files) run in parallel.
- Test-update tasks (different spec files) run in parallel with each other and with the panel-conversion tasks, since a test's own assertions are rewritten independent of whether the YAML edit has landed yet (both are static edits, verified together at the story's checkpoint).
- The Checkpoint's actual Playwright run must come after both the YAML edits and the test-file edits for that story.

### Parallel Opportunities

- T003–T006 (all four US1 panel conversions, different files) — parallel.
- T007–T013 (all seven US1 test-file updates, different files) — parallel with each other and with T003–T006.
- T014–T015 (both US2 panel conversions) — parallel; T016 (sparkline component) is independent of both and can run in parallel too.
- T017–T021, T023 (US2 test-file updates, different files) — parallel with each other and with T014–T016.
- T025–T029 (all five US3 panel reviews, different files/rows) — parallel.
- US3 (Phase 5) can run fully in parallel with US1 (Phase 3) and US2 (Phase 4) if staffed — it touches an entirely disjoint set of panels and files.

---

## Parallel Example: User Story 1

```bash
# Panel conversions (different files):
Task: "Convert 'Average Trip Distance by Purpose' in public/demo-dashboard-config/dashboard-1-summary.yaml"
Task: "Convert 'Non-Mandatory Tour Frequency by Purpose' in public/demo-dashboard-config/dashboard-3-tour-models.yaml"
Task: "Convert 'Trip Mode Share by Time-of-Day Period (WALK_LOC)' in public/demo-dashboard-config/dashboard-4-mode-choice.yaml"
Task: "Convert 'Trip Departure Hour (Work Trips)' in public/demo-dashboard-config/dashboard-5-trip-models.yaml"

# Test updates (different files):
Task: "Update tests/integration/dashboardShell.spec.ts"
Task: "Update tests/integration/panelExpand.spec.ts"
Task: "Update tests/integration/lazyTabLoading.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1 (T003–T013).
4. **STOP and VALIDATE**: run the US1 checkpoint; confirm the four Plotly panels are gone and the rest of the app is unaffected.
5. This alone delivers real, visible value — the majority of the dashboard's chart panels (4 of 6) already consolidated onto one engine.

### Incremental Delivery

1. Setup + Foundational → ready.
2. User Story 1 → validate → the four Plotly panels are converted (MVP).
3. User Story 2 → validate → zero real Plotly/Recharts panels remain; sparkline converted.
4. User Story 3 → validate → the five pre-existing Observable Plot panels confirmed clean.
5. Polish → the one deliberate cross-story test conflict (`demoContentAllPanels.spec.ts`) resolved, full regression confirmed, documented in `CLAUDE.md`.

### Parallel Team Strategy

With multiple contributors: complete Setup + Foundational together, then
one contributor takes US1, a second takes US2, and a third takes US3 in
parallel (US3 touches an entirely disjoint file set from US1/US2).
Reconvene for Phase 6 once all three are done.

---

## Notes

- [P] tasks = different files, no dependencies on an incomplete task.
- [Story] label maps each task to its user story for traceability.
- Several test files (`scenarioColorOverride.spec.ts`, `scenarioLabelDisplay.spec.ts`, `switchControlsUnpinnedPanels.spec.ts`, `demoMultiScenario.spec.ts`) are deliberately split into one task per story (US1 task updates only that story's own panel's assertions, US2 task completes the file) — this keeps each story genuinely independently testable without forcing a premature edit to content that belongs to a not-yet-implemented story.
- `dashboard-8-test.yaml`, `panels/panelQuery.ts`, `services/sqlExpander.ts`, and every non-Observable-Plot panel component are never edited by any task above — verified explicitly in T001 and T033.
