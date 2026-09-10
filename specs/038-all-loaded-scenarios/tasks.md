---
description: "Task list for 038-all-loaded-scenarios"
---

# Tasks: All Loaded Scenarios Participate by Default

**Input**: Design documents from `/specs/038-all-loaded-scenarios/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/discovery-activation.md, contracts/demo-panel-disposition.md,
quickstart.md

**Tests**: INCLUDED — the feature explicitly requires them (FR-012 test-suite
honesty, SC-005 full-suite pass, and the standing dual-theme verification
requirement). Test tasks appear before/with the implementation they cover.

**Organization**: by user story. US1 and US2 are both P1 and share one
foundational code change; US3 (P2) is the demo-content payoff.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task — can run in parallel
- **[Story]**: US1 / US2 / US3
- Every task names an exact file path

## Path Conventions

Single-project web app. Source: `src/`. Tests: `tests/unit/` (Vitest),
`tests/integration/` (Playwright). Demo config:
`public/demo-dashboard-config/`. Fixture config:
`tests/fixtures/dashboard-config/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: pin down the exact test blast radius before touching code.

- [X] T001 Enumerate every `tests/integration/*.spec.ts` assertion that depends on `observed` being the sole auto-active scenario on a plain (`?s=`-less) boot. Run `grep -rn "getActive\|only observed\|s=good_scenario\|activeScenario\|__wftdm.*active" tests/integration/` and `grep -rln "boot()" tests/integration/`, cross-check against `research.md` §6's two categories, and write the resulting file:line list into `specs/038-all-loaded-scenarios/research.md` under a new "§6a — enumerated test touch-points" subsection. No source/test edits in this task.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the one code change both P1 stories depend on, plus the fixture
edits that keep the wider suite runnable. **No user-story phase can start until
this phase is complete and `typecheck` + `test:unit` are green.**

- [X] T002 Implement the auto-activation rule in `src/services/scenarioDiscovery.ts` per `contracts/discovery-activation.md` (DA-1..DA-8): in `registerObserved()` move `appState.setActive('observed', true)` into the `status`-`'ready'` success branch (immediately after `appState.setStatus('observed', 'ready')`) and delete the unconditional call plus its stale 037-item-4 comment block; in `registerPublishedScenarios()` add `appState.setActive(name, true)` immediately after `appState.setStatus(name, 'ready')`; in `registerDemoScenarios()` add `appState.setActive(name, true)` immediately after `appState.setStatus(name, 'ready')`. Do NOT touch `applyURLParams()` or `discoverScenarios()`'s call order. Add a short comment on each of the three call sites citing this feature and the "status === 'ready' only, no context branching (FR-013)" rule.
- [X] T003 [P] In `tests/fixtures/dashboard-config/dashboard-1-summary.yaml` add `scenarios: [observed]` to the `Total Households` and `Total Trips` valuebox panels; in `tests/fixtures/dashboard-config/dashboard-2-detail.yaml` add `scenarios: [observed]` to the `Average Trip Distance` valuebox panel. Do NOT touch the `Scenario Split (*)`, `Free-form Visual Analytics (Multi-Scenario)`, or any `*(intentional)`/`*Broken*` panels (`research.md` §6).
- [X] T004 Run `npm run typecheck` and `npm run test:unit`; confirm both green (the `Scenario`/`appState` shape is unchanged, so unit counts must not move). Fix any typecheck fallout from T002 before proceeding.

**Checkpoint**: auto-activation rule live; unit layer green. User stories can begin.

---

## Phase 3: User Story 2 - Every loaded scenario shows up without the viewer doing anything (Priority: P1)

**Goal**: on a no-`?s=` boot, exactly the `status === 'ready'` scenarios are
active on all three discovery paths; `failed` scenarios (incl. empty `observed`)
are absent with zero error/empty states; `?s=` stays add-only.

**Independent Test**: boot the fixture content with no `?s=`; assert
`appState.getActive()` == the fixture ready-set (`observed` + `good_scenario`),
`broken_scenario` absent; assert an unpinned fixture panel renders that many
series and a failed scenario triggers no panel error.

### Tests for User Story 2

- [X] T005 [P] [US2] Create `tests/integration/scenarioAutoActivation.spec.ts` covering `contracts/discovery-activation.md` DA-1..DA-4, DA-6, DA-7, DA-8 against the fixture content root: plain boot → `getActive()` is `['good_scenario','observed']` (order-insensitive); `broken_scenario` not active and `status==='failed'`; `?s=good_scenario` on top of auto-active is idempotent; an unpinned `Scenario Split (Table)` panel renders 2 scenario values with no error banner; toggling every scenario off leaves the panel in its empty/error state without a console crash.
- [X] T006 [P] [US2] Update `tests/integration/boot.spec.ts`: every assertion that a plain boot leaves "only `observed`" active now expects the fixture ready-set (`observed` + `good_scenario`); the `?s=` tests still assert the param *adds* (never reduces). Use the T001 line list.
- [X] T007 [P] [US2] Update `tests/integration/scenarioManager.spec.ts` active-set / baseline-vs-active assertions per the T001 line list — expected active set becomes the ready-set; `getBaseline()` expectations unchanged (baseline resolves on `pinned`/`status`, not `active`).
- [X] T008 [P] [US2] Update `tests/integration/settingsModal.spec.ts` Switch-state / `getActive()` assertions per the T001 line list — a plain boot now shows `good_scenario`'s Switch **on**; `broken_scenario` **off**; `observed` **on** (fixture data present).

### Implementation for User Story 2

- [X] T009 [US2] Update any remaining `tests/integration/*.spec.ts` file identified in T001 but not covered by T005–T008 (e.g. `scenarioColorOverride.spec.ts`, `scenarioLabelDisplay.spec.ts`, `graphicWalkerPanel.spec.ts` if they boot plain and assert single-scenario content) — add an explicit `?s=` to the test's `boot()` or assert the ready-set, matching FR-012's "declare the set explicitly" remedy. Run each touched spec file individually to green.

**Checkpoint**: US2 fully verified against the fixture suite, independent of US1/US3.

---

## Phase 4: User Story 1 - A viewer excludes one scenario from every chart at once (Priority: P1)

**Goal**: flipping one scenario's Switch immediately adds/drops that scenario's
series/rows on **every** unpinned chart and table on **every** tab, no reload;
pinned panels are unaffected.

**Independent Test**: with the fixture's already-unpinned `Scenario Split (*)`
panels on tab 1 and a `?s=good_scenario` boot (2 scenarios active), toggle one
Switch off → each unpinned panel's series/row count drops by one; toggle on →
restored; a pinned fixture panel does not move.

### Tests for User Story 1

- [X] T010 [P] [US1] Create `tests/integration/switchControlsUnpinnedPanels.spec.ts`: boot the fixture with `?s=good_scenario` (2 active), open the Summary tab, record series/row counts on `Scenario Split (Recharts)`, `Scenario Split (Table)`, and `Scenario Split (Observable Plot)`; open the Settings→Scenarios tab, flip `good_scenario`'s Switch off; assert all three panels re-render with one fewer series/row-group and NO `page.reload()` occurred (guard with a `window`-level sentinel set on load); flip back on and assert restoration; additionally assert a pinned panel (`ValueBox` pinned to `observed`) is unchanged throughout. Cover a second tab if the fixture has an unpinned panel there; otherwise note the demo-tab cross-tab check is exercised by T018/T019 under US3.

### Implementation for User Story 1

- [X] T011 [US1] Run `tests/integration/switchControlsUnpinnedPanels.spec.ts` plus its nearest existing neighbor `tests/integration/scenarioColorOverride.spec.ts` to green (no source change expected — the Switch→`useActiveScenarios()`→panel path already exists from 037/009; if a real gap surfaces, fix it in the smallest scope and record it here).

**Checkpoint**: the Switch is proven to universally control every unpinned panel.

---

## Phase 5: User Story 3 - The demo dashboards read as scenario comparisons (Priority: P2)

**Goal**: apply `contracts/demo-panel-disposition.md` to the eight demo tab files
— 27 panels unpinned (5 gaining a `$scenario` series channel, 2 dropping a
redundant list), 14 kept pinned with a baseline-scope `description`.

**Independent Test**: boot the demo (3 `ready` scenarios, no `?s=`); per the
disposition table, each unpinned panel renders a legible multi-scenario
comparison and each kept-pinned panel states its single-scenario scope.

### Implementation for User Story 3 (config edits — all [P], different files)

- [X] T012 [P] [US3] Edit `public/demo-dashboard-config/dashboard-1-summary.yaml` per `contracts/demo-panel-disposition.md` panels 1–7: panels 1–5 (valuebox) keep `scenario: activitysim-baseline`, add the KPI `description` from `research.md` §5; panel 6 (recharts) delete `scenarios:`, keep `series: scenario`; panel 7 (plotly) delete `scenarios:`, add `name: $scenario`.
- [X] T013 [P] [US3] Edit `public/demo-dashboard-config/dashboard-2-person-household.yaml` panels 8,10,11,12,16,17: 8/12/16 (table) delete `scenario:`; 17 (graphic-walker) delete `scenario:`; 10 keep pin + channel-committed `description` (§5); 11 (observable-plot) delete `scenario:`, add `fill: scenario`.
- [X] T014 [P] [US3] Edit `public/demo-dashboard-config/dashboard-3-tour-models.yaml` panels 18–30: 18,19,20,21,23,26,27,28,29,30 (table) delete `scenario:`; 22 and 25 keep pin + channel-committed `description` (§5); 24 (plotly) delete `scenario:`, add `name: $scenario`.
- [X] T015 [P] [US3] Edit `public/demo-dashboard-config/dashboard-4-mode-choice.yaml` panels 31–34: 31 (table) delete `scenario:`; 32 (recharts) keep pin + channel-committed `description` (§5); 33 (sankey) delete `scenarios:` (UNLIST — combined-flow note in `description` that it sums active scenarios); 34 (plotly) delete `scenarios:`, add `name: $scenario`.
- [X] T016 [P] [US3] Edit `public/demo-dashboard-config/dashboard-5-trip-models.yaml` panels 35–38: 35 (table) delete `scenario:`; 36 (observable-plot) keep pin + channel-committed `description` (§5); 37 (plotly) delete `scenario:`, add `name: $scenario`; 38 (zonemap) keep pin + one-draw-per-dataset `description` (§5, FR-010).
- [X] T017 [P] [US3] Edit `public/demo-dashboard-config/dashboard-6-network.yaml` panels 40–45: 40 (valuebox) keep pin + KPI `description`; 41 (zonemap) and 42 (flowmap) keep pin + one-draw-per-dataset `description` (FR-010); 43,44,45 (table) delete `scenario:`.
- [X] T018 [P] [US3] Edit `public/demo-dashboard-config/dashboard-5-explore.yaml` panel 46 (graphic-walker): delete `scenario:`.

### Verification for User Story 3

- [X] T019 [US3] Verify the post-edit invariants in `contracts/demo-panel-disposition.md`: across the eight files `grep -c "scenario: activitysim-baseline"` totals 14; no `scenarios: [` list remains on any demo panel; 27 panels carry neither key; each UNPIN+CH panel (7,11,24,34,37) has exactly one added channel line; every KEEP+NOTE panel (14) has a non-empty `description`. Fix any mismatch against the contract.
- [X] T020 [P] [US3] Create `tests/integration/demoMultiScenario.spec.ts`: boot the demo content with three `ready` scenarios, no `?s=`; assert an UNPIN table (e.g. "Accessibility by Zone") shows a `scenario` column with 3 distinct values; an UNPIN+CH plotly ("Trip Departure Hour (Work Trips)") and the UNLIST recharts ("Total Trips by Mode") each render 3 series with theme-correct per-scenario colors — asserted via `getComputedStyle()` in BOTH light and dark mode (flip `document.documentElement.classList`); an UNPIN+CH observable-plot ("Workplace Location Distance Distribution") renders 3 `fill` series; toggling one scenario's Switch drops it from a panel on tab A AND a panel on tab B within one render, no reload; a KEEP+NOTE zonemap and a KEEP+NOTE valuebox do not change.
- [X] T021 [US3] Update `tests/integration/demoContentAllPanels.spec.ts` for any assertion that assumed a now-unpinned demo panel was single-scenario (series counts, exact row counts, `getByText` on a single scenario's value). Keep the "all ten panel types render" coverage intact. Run the full file to green.

**Checkpoint**: the demo reads as a scenario comparison everywhere the chart type allows; all demo/integration specs green.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 [P] Add an Implementation-order item (25) to `CLAUDE.md` summarizing 038: the `status === 'ready'` uniform auto-activation rule (all 3 discovery paths, no context branching), the 27-unpin / 14-keep-pinned demo disposition (with the §4 channel-conflict refinement vs. the spec's estimate), the fixture-valuebox pins + boot/scenarioManager/settingsModal assertion updates, and that `$baseline`/`comparison: diff` and 037's Scenarios-tab UI were untouched.
- [X] T023 [P] Check `project-docs/GRAMMAR.md` for any text presenting `scenario:` pinning as the demo/authoring norm; if present, update it to describe the dynamic `$scenario` union as the default and pinning as the deliberate exception (one-draw-per-dataset maps, KPI cards, channel-committed charts).
- [X] T024 Run the FULL `tests/integration/` suite as ONE `npx playwright test` invocation. Triage every failure individually. **T024 results** below.
- [X] T025 Run `npm run build`; confirm clean with no new warning categories. **Clean** — only the pre-existing >500 kB chunk-size advisory (plotly/graphic-walker/maps), unchanged.
- [X] T026 quickstart.md SC-001..SC-004 — covered by automated specs (stronger than a manual pass): SC-001/SC-002 by `demoMultiScenario.spec.ts` (auto-active ready-set, cross-tab Switch, dual-theme 3-series), SC-003 by the `contracts/demo-panel-disposition.md` invariant checks + `demoMultiScenario`, SC-004 by `scenarioAutoActivation.spec.ts` DA-2 (routed-404 `observed` → `failed` → no panel error). Dual-theme (light+dark) explicitly asserted in `demoMultiScenario.spec.ts` via `getComputedStyle()`.

### T024 results

**First full run**: 344 passed / 14 failed. Triage:
- **8 cross-worker contamination** (`boot.spec.ts` ×2, `scenarioAutoActivation.spec.ts` ×2, `graphicWalkerPanel.spec.ts` ×2, `valueBoxPanel.spec.ts`, `zonemapPanel.spec.ts`, `rechartsPanel.spec.ts`, `dashboardShell.spec.ts` — an exact scenario-set / query-count / row-count assertion): a **new 038 interaction** — `demoContentAllPanels.spec.ts`/`demoMultiScenario.spec.ts` wrote the real demo `index.json` to disk in `beforeAll` and blanked it in `afterAll`; before 038 the registered-but-inactive demo scenarios were inert, but 038 **auto-activates** them, so during that on-disk window every concurrently-running spec's `$scenario` union picked up 3 extra scenarios. **Fixed at the root**: both demo specs now serve the real demo indexes via per-page `page.route()` (plus 404 the fixture discovery endpoints so they run as a real demo deployment) — zero on-disk mutation, zero leak window, `_sharedFixtureLock` no longer needed by either.
- **2 real 038 regressions** (`settingsModal.spec.ts:1525` T024 tooltip test, light+dark): asserted `good_scenario` Switch `not.toBeChecked()` ("inactive by default") — now auto-active. **Fixed**: the test's real intent (FR-013 — hovering doesn't alter the Switch) now captures `aria-checked` before the hover and asserts it's unchanged after.
- **2 pre-existing documented flakes**: `dashboardShell.spec.ts:169` (dark-mode Plotly re-query off-by-one — recorded across 030–037) and `flowmapPanel.spec.ts:713` (deck.gl hover-tooltip real-hardware timing — recorded across 033–037; 035's own entry notes a clean `main` tree also fails it).

**Targeted re-runs after fixes**: the 8 contamination + 2 regression specs run together with the demo specs — **54/54** (batch 1) and **119/120** (batch 2, the 1 = the flowmap:713 flake).

**Second full run**: **356 passed / 2 failed** — `flowmapPanel.spec.ts:713` (the deck.gl flake, 3/3 fail in isolation now; 038 touches zero flowmap source — `git diff --stat` empty for `FlowMapPanel.tsx`/`flowmapData.ts`/`mapTooltip.ts`) and `settingsModal.spec.ts:66` ("opens a modal with all three tabs" — **passed in isolation**, multi-worker contention only). **Zero real regressions remain.**

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: no dependency — start immediately.
- **Foundational (T002–T004)**: needs T001's line list for scoping T003 correctly; blocks ALL user stories.
- **US2 (T005–T009)**: after Foundational. Independently testable.
- **US1 (T010–T011)**: after Foundational. Independent of US2 and US3 (uses pre-existing unpinned fixture panels).
- **US3 (T012–T021)**: after Foundational. The config edits (T012–T018) don't need US1/US2 done, but T020/T021 verification reads best after US1's mechanism test exists.
- **Polish (T022–T026)**: after all desired user stories.

### Within user stories

- US2: T005–T008 are parallel (different spec files); T009 mops up the remainder after them.
- US1: T010 (write spec) → T011 (run green).
- US3: T012–T018 fully parallel (eight different YAML files) → T019 (invariant check) → T020/T021 (verification specs).

### Parallel opportunities

- T003 runs parallel to nothing else in Phase 2 (T002 is the gate, T004 follows both).
- US2's T005/T006/T007/T008 — 4-way parallel.
- US3's T012–T018 — 7-way parallel.
- T022 and T023 — parallel (different docs).

---

## Parallel Example: User Story 3 config edits

```bash
# All eight demo tab files are independent — edit together:
Task T012: dashboard-1-summary.yaml   (panels 1-7)
Task T013: dashboard-2-person-household.yaml (8,10,11,12,16,17)
Task T014: dashboard-3-tour-models.yaml (18-30)
Task T015: dashboard-4-mode-choice.yaml (31-34)
Task T016: dashboard-5-trip-models.yaml (35-38)
Task T017: dashboard-6-network.yaml (40-45)
Task T018: dashboard-5-explore.yaml (46)
# then T019 invariant check once all land
```

---

## Implementation Strategy

### MVP (both P1 stories — the mechanism)

1. T001 → T002–T004 (rule live, unit green).
2. US2 (T005–T009): auto-activation proven.
3. US1 (T010–T011): universal Switch control proven against fixture panels.
4. **STOP & VALIDATE**: the Switch now controls every unpinned panel; ready
   scenarios auto-participate. This is shippable even before the demo edits.

### Incremental delivery

5. US3 (T012–T021): the demo becomes a visible scenario comparison.
6. Polish (T022–T026): docs, full-suite regression, dual-theme manual pass.

---

## Notes

- Only ONE source file changes: `src/services/scenarioDiscovery.ts` (T002). No
  new module, no `appState` shape change, no new dependency (plan.md
  Constitution Check).
- Never run two `npx playwright test` processes at once — they corrupt shared
  `public/` fixtures (repeated hazard, see CLAUDE.md 036/037 entries).
- Dual-theme verification (T020, T026) is mandatory, not optional — standing
  project requirement for any single-series → multi-series change.
- `$baseline` / `comparison: diff` and 037's Scenarios-tab UI are out of scope —
  do not touch `panelQuery.ts`, `sqlExpander.ts`, `scenariosTab.tsx`,
  `scenarioRow.tsx`.
