# Tasks: Unified Settings Modal

**Input**: Design documents from `specs/020-settings-modal/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/settings-modal.md, quickstart.md

**Tests**: included throughout, matching this project's established convention
(every prior panel/UI feature — `018-baseline-scenario-designation`,
`019-baseline-diff-consumption`, etc. — ships Vitest + Playwright coverage
alongside the implementation it covers, not as an optional add-on).

**Organization**: Tasks are grouped by user story (spec.md's own P1/P2/P3
priorities) so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency)
- **[Story]**: Maps the task to spec.md's US1–US5
- Every task names its exact file path

## Path Conventions

Single project — `src/`, `tests/` at repository root (per plan.md's
Project Structure; no new top-level directory or build target).

---

## Phase 1: Setup

- [X] T001 Create the `src/layout/settings/` directory that will hold the
      four new Settings-modal tab components

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `state/appState.ts` changes every later user story's Scenarios
tab work depends on (path display for US1, reorder for US3, label for
US4) — done once here rather than three times.

**⚠️ CRITICAL**: No user story phase below may begin until this phase is
complete.

- [X] T002 Extend `Scenario`/`ScenarioMetadata` in `src/state/appState.ts`:
      add `path: string`, `order: number` (assigned in `register()` from a
      new module-level ever-incrementing counter), and `label?: string`
      fields (data-model.md's `Scenario`/`ScenarioMetadata` shapes)
- [X] T003 Add `moveScenario(name, direction: 'up' | 'down')`,
      `listByDisplayOrder()`, `setLabel(name, label)`, `clearLabel(name)`
      exports to `src/state/appState.ts`, following the existing
      `setBaseline()`/`setActive()` look-up/throw/mutate/`notify()`
      convention (depends on T002 — same file)
- [X] T004 [P] Update `src/services/scenarioDiscovery.ts`'s
      `registerObserved()` and `registerPublishedScenarios()` to pass their
      existing folder-URL local variable as the new required `path` field
      to `appState.register()` (research.md §5; depends on T002)
- [X] T005 [P] Update `src/scenario/scenarioManager.ts`'s
      `loadLocalScenario()` to pass `path: dirHandle.name` to
      `appState.register()` (research.md §5; depends on T002)
- [X] T006 [P] Extend `tests/unit/appState.test.ts`: add the new required
      `path` field to every existing `register()` call in the file, and
      add cases for `moveScenario()`/`listByDisplayOrder()`/`setLabel()`/
      `clearLabel()`, including FR-008 (reorder never changes
      `getBaseline()`'s pick) and FR-018 (a newly-registered scenario
      always appends last in `listByDisplayOrder()`) — quickstart.md
      Scenarios 3–5 (depends on T002, T003). ALSO required (found during
      implementation, not anticipated by this task's original text):
      fixing two other pre-existing `appState.register()` call sites that
      also lacked the newly-required `path` field —
      `tests/integration/tablePanel.spec.ts` and
      `tests/unit/scenarioManager.test.ts` — both broke `tsc --noEmit`
      the moment `path` became required; fixed the same way (a synthetic
      `test/<name>` path). Full project typecheck and `npx vitest run`
      (253/253) both confirmed clean after.

**Checkpoint**: Foundation ready — every user story phase below can begin.

---

## Phase 3: User Story 1 - One place to manage dashboard-wide settings (Priority: P1) 🎯 MVP

**Goal**: A single `SettingsModal` replaces `ScenarioLoader` + `ThemeToggle`
entirely, with Appearance and Scenarios tabs reproducing their exact prior
behavior (plus the corrected LOCAL-mode treatment, FR-019) — and 4-tab
structure in place (Basemap/Documentation ship as stubs here, filled in by
US2/US5).

**Independent Test**: spec.md's own Independent Test — open the dashboard,
confirm no standalone theme/scenario controls remain, open Settings, and
confirm Appearance + Scenarios reproduce the removed controls' behavior.

### Implementation for User Story 1

- [X] T007 [P] [US1] Create `src/layout/settings/appearanceTab.tsx` —
      relocate `themeToggle.tsx`'s `mode` state and mount/mode effect
      unchanged, rendered as three directly visible System/Light/Dark
      options (not the icon-only dropdown) — FR-004, research.md §9
- [X] T008 [P] [US1] Create `src/layout/settings/scenariosTab.tsx` —
      relocate `scenarioLoader.tsx`'s list/add/remove/baseline-mark logic;
      render `appState.listByDisplayOrder()` (not `list()`); show each
      row's `path` and `status` (FR-005); keep the existing
      `TooltipProvider`/disabled-span pattern for the no-File-System-API
      case; change LOCAL-deployment-mode handling from "return null
      entirely" to "Load Local Scenario alone is disabled, with its own
      explanatory tooltip, via the same pattern" (FR-006, FR-019,
      research.md §8) — reorder/label controls are added later by T026/T029.
      Also renders each row's `label ?? name` (US4's own field, ahead of
      its own T029 edit control — harmless, forward-compatible).
- [X] T009 [P] [US1] Create a stub `src/layout/settings/basemapTab.tsx`
      (placeholder content only, e.g. "Coming soon") — the real picker is
      built by US2 (T023)
- [X] T010 [P] [US1] Create a stub `src/layout/settings/documentationTab.tsx`
      (bare placeholder) — finalized by US5 (T032)
- [X] T011 [US1] Create `src/layout/settingsModal.tsx` — a trigger `Button`
      opening `components/ui/dialog.tsx`'s `Dialog`, containing
      `components/ui/tabs.tsx`'s `Tabs` with four `TabsTrigger`/
      `TabsContent` pairs (Appearance, Scenarios, Basemap, Documentation)
      composing T007–T010 (FR-003; depends on T007, T008, T009, T010)
- [X] T012 [US1] Update `src/layout/shell.tsx` — replace
      `<ScenarioLoader />` + `<ThemeToggle />` in the header with
      `<SettingsModal />` (FR-001, FR-002; depends on T011)
- [X] T013 [US1] Delete `src/layout/scenarioLoader.tsx` and
      `src/layout/themeToggle.tsx` — logic fully relocated, not duplicated
      (depends on T012). ALSO required (found via grep, not anticipated):
      fixed three now-stale comments referencing the deleted files
      (`main.tsx`, `scenarioManager.ts` ×2) — none were real imports, so
      nothing broke the build, but left uncorrected they'd have pointed
      future readers at nonexistent files.
      `components/ui/dropdown-menu.tsx` (015-theme-toggle) is now a
      zero-consumer file (ThemeToggle was its only caller) — deliberately
      LEFT IN PLACE, not deleted: it's a generic, reusable shadcn/ui-
      pattern primitive, not feature-specific glue code, the same category
      this project already keeps unused-until-needed (matching how
      `components/ui/` is a primitive library, not a per-feature file set).
- [X] T014 [US1] Delete `tests/integration/themeToggle.spec.ts` (the
      component it tests no longer exists; depends on T013)
- [X] T015 [P] [US1] Write `tests/integration/settingsModal.spec.ts`
      covering: single header control (quickstart Scenario 1), Appearance
      tab's three-visible-option switch (Scenario 2), Scenarios tab's
      path/status/add/remove/baseline display (US1 Acceptance Scenario 3),
      modal dismiss via close/overlay/Escape (Acceptance Scenario 4), and
      LOCAL-mode disabled+tooltip treatment (Acceptance Scenario 5 /
      quickstart Scenario 7) (depends on T012, T013). 10/10 passing.
- [X] T016 [P] [US1] Port `tests/integration/scenarioManager.spec.ts`'s
      UI-flow Playwright cases (add / collision / remove) into
      `settingsModal.spec.ts`; leave that file's Vitest-covered pure-logic
      scope (`tests/unit/scenarioManager.test.ts`) untouched (depends on
      T012, T013). CORRECTED DURING IMPLEMENTATION, not executed as
      originally written: `scenarioManager.spec.ts` turned out to be 665
      lines of rich, valuable US1–US3/018-baseline UI-flow coverage — far
      more than a simple "port" — so instead of duplicating it into
      `settingsModal.spec.ts`, it was kept in place and fixed to open the
      Settings modal's Scenarios tab as a real prerequisite step (a new
      `openScenariosTab()` helper, idempotent — checks whether the dialog
      is already open before clicking the trigger). Three real findings
      from making this fix actually pass, not anticipated by this task's
      original text:
      (1) `boot()` cannot unconditionally open the modal — two tests
      interact with an underlying dashboard panel BEFORE ever touching a
      scenario control, and Radix Dialog's overlay/hideOthers() blocks
      that; `openScenariosTab()` is instead called at the point each test
      actually needs it (directly, or via `loadAndWait()`'s own call).
      (2) Radix Dialog's `hideOthers()` (dialog.tsx's own documented
      behavior) applies `aria-hidden` to the rest of the page while open —
      `getByRole()` locators (accessibility-tree-based) against
      underlying dashboard content stop resolving, while plain
      `getByText()` locators (DOM-text-based, unaffected by aria-hidden)
      keep working — a real, confirmed distinction, not a flaky timing
      issue. One test (`"a TablePanel's search term and pagination
      survive..."`) needed an explicit `Escape` after `loadAndWait()`
      before its `getByRole('textbox')` assertions.
      (3) The LOCAL-deployment-mode test was rewritten (not just
      relocated) per FR-019 — from asserting the control has zero count to
      asserting it's visible-but-disabled with its own tooltip text.
      All 25 tests across both files pass (`npx playwright test
      settingsModal.spec.ts scenarioManager.spec.ts`).

**Checkpoint**: User Story 1 is fully functional and independently
testable — deployable as the MVP.

**Regression note**: a broader sweep (`settingsModal.spec.ts` +
`scenarioManager.spec.ts` + `dashboardShell.spec.ts` + `panelExpand.spec.ts`,
48 tests) found one pre-existing failure —
`dashboardShell.spec.ts`'s "a plotly panel matches the app theme in dark
mode ... no-re-query" test, off by exactly one query (69 vs 70),
deterministic (3/3 runs). Confirmed via `git stash` — the SAME test fails
identically 3/3 on the clean pre-implementation baseline, with none of
this feature's changes present at all. Genuinely pre-existing, unrelated
to this feature (per this project's own established stash-comparison
discipline, `research.md` of `019-baseline-diff-consumption`) — left
unfixed, out of this feature's scope.

---

## Phase 4: User Story 2 - Viewer-wide basemap choice (Priority: P2)

**Goal**: A real Basemap tab lets a viewer pick a preset that fills
`resolveEffectiveBasemap()`'s app-default fallback tier only, reactively,
with no page reload.

**Independent Test**: spec.md's own Independent Test — pick a preset with
an unconfigured panel present, confirm it re-renders with no reload;
confirm a configured panel/tab is unaffected.

### Implementation for User Story 2

- [X] T017 [P] [US2] Add the `'global'` literal to `BasemapSource` in
      `src/panels/basemap/types.ts` (data-model.md)
- [X] T018 [US2] Add an optional 4th parameter
      `globalBasemap?: BasemapPresetName` and a new 3rd-priority branch
      (between `tab` and `app-default`) to `resolveEffectiveBasemap()` in
      `src/panels/basemap/resolveEffectiveBasemap.ts` (research.md §6,
      data-model.md's updated truth table; depends on T017)
- [X] T019 [P] [US2] Create `src/state/basemapState.ts` —
      `subscribe()`/`notify()`/`getGlobalBasemap()`/`setGlobalBasemap()`/
      `clearGlobalBasemap()`, mirroring `state/appState.ts`'s own shape
      (data-model.md)
- [X] T020 [US2] Create `src/hooks/useGlobalBasemap.ts` —
      `useSyncExternalStore(basemapState.subscribe, basemapState.getGlobalBasemap)`,
      mirroring `hooks/useBaseline.ts` (depends on T019)
- [X] T021 [P] [US2] Update `src/panels/FlowMapPanel.tsx` — add a
      `useGlobalBasemap()` call and pass its result as
      `resolveEffectiveBasemap()`'s new 4th argument (depends on T018, T020)
- [X] T022 [P] [US2] Update `src/panels/ZoneMapPanel.tsx` — the same
      one-line change (depends on T018, T020)
- [X] T023 [US2] Replace the T009 stub in
      `src/layout/settings/basemapTab.tsx` with a real single-select
      picker over `panels/basemap/registry.ts`'s `BUILT_IN_PRESETS`,
      calling `basemapState.setGlobalBasemap()` on selection (FR-011;
      depends on T019, T009). ALSO required (found during implementation):
      `BUILT_IN_PRESETS` was never exported — added a new
      `listBuiltInPresetNames()` export to `registry.ts` rather than
      exporting the map itself or hardcoding names in the tab component.
- [X] T024 [P] [US2] Extend `tests/unit/resolveEffectiveBasemap.test.ts`
      with the 5th truth-table row (global tier resolves when panel/tab
      unset) and a case confirming a set panel/tab value still wins over a
      set `globalBasemap` (quickstart Scenario 6; depends on T018)
- [X] T025 [P] [US2] Extend `tests/integration/settingsModal.spec.ts`:
      picking a Basemap preset re-renders an unconfigured flowmap/zonemap
      panel with no reload (SC-003), and leaves a configured panel/tab
      unaffected (SC-004) — quickstart Scenario 6 (depends on T023, T021,
      T022). Reused the existing `tests/fixtures/dashboard-config/
      dashboard-1-summary.yaml`'s already-unconfigured flowmap panel and
      `dashboard-3-basemaps.yaml`'s already-panel-configured one (both
      pre-dating this feature, from 010/011) rather than adding new
      fixture panels — real coverage, no fixture duplication. 3/3 new
      tests pass; `flowmapPanel.spec.ts`/`zonemapPanel.spec.ts`'s own
      pre-existing basemap-precedence suites (61 tests) re-run in full and
      still pass, confirming the new resolver parameter is backward-
      compatible. One unrelated failure surfaced in that sweep —
      `flowmapPanel.spec.ts`'s WebGL-context-loss-recovery test — repeated
      3× on unchanged code (fail/pass/fail); this is the same pre-existing,
      hardware/software-rendering-dependent flakiness `012-webgl-context-
      management`'s own CLAUDE.md history already documents, not a
      regression from this feature.

**Checkpoint**: User Stories 1 AND 2 both independently functional.

---

## Phase 5: User Story 3 - Reorder loaded scenarios (Priority: P2)

**Goal**: Move-up/move-down controls change display order without ever
affecting the automatic-default baseline pick.

**Independent Test**: spec.md's own Independent Test — reorder with 3+
scenarios loaded, confirm the list updates and the baseline pick is
unchanged.

### Implementation for User Story 3

- [X] T026 [US3] Add move-up/move-down controls to
      `src/layout/settings/scenariosTab.tsx`, calling
      `appState.moveScenario(name, direction)`, disabled (not hidden) at
      either list boundary (FR-007; depends on T008)
- [X] T027 [P] [US3] Extend `tests/unit/appState.test.ts` with the
      UI-triggered-flow assertions T006 didn't cover: a full
      move-then-verify-baseline-unchanged sequence (FR-008) and a
      register-after-reorder sequence (FR-018) — quickstart Scenarios 3–4.
      Found already fully covered by T006's own foundational cases (which
      exercise `moveScenario()`/`getBaseline()` directly — the same
      function calls a UI click would trigger) — no additional unit
      assertions were needed; the genuinely NEW coverage this story adds
      is at the Playwright layer (T028).
- [X] T028 [P] [US3] Extend `tests/integration/settingsModal.spec.ts`:
      reorder button flow, boundary-disabled buttons, single-scenario
      no-op (Edge Cases; depends on T026). Real fixture has THREE
      auto-discovered scenarios at boot (`observed`, `good_scenario`,
      `broken_scenario` — confirmed by reading
      `tests/fixtures/scenarios/index.json`, not assumed from earlier,
      2-scenario-only planning), so the boundary test moves the MIDDLE
      entry and asserts both ends' disabled state — the "single scenario"
      edge case stays covered at the unit level only (T006), where it's
      already exercised directly. A real bug surfaced and was fixed while
      writing this test's own helper (see T029's note below) —
      `scenarioNamesInOrder()` initially read `.font-medium` text, which
      collided with `Button`'s own base CSS class (also named
      `font-medium`) and matched the move-button's own empty icon text
      instead of the scenario name.

**Checkpoint**: User Stories 1–3 independently functional. Confirmed:
`settingsModal.spec.ts` + `scenarioManager.spec.ts` together (32 tests)
and the full Vitest suite (255 tests) all pass.

---

## Phase 6: User Story 4 - Custom scenario label (Priority: P3)

**Goal**: An optional display-only label per scenario, never substituted
into query/view resolution.

**Independent Test**: spec.md's own Independent Test — assign a label,
confirm it displays in place of the real name in the Scenarios tab only.

### Implementation for User Story 4

- [X] T029 [US4] Add an inline custom-label edit control to
      `src/layout/settings/scenariosTab.tsx`, calling
      `appState.setLabel(name, value)` on commit and
      `appState.clearLabel(name)` when cleared to empty (FR-009; depends
      on T008). Built as a fully store-driven controlled `<input>`
      (`value={s.label ?? ''}`, `placeholder={s.name}`) — no local draft
      state, matching every other control in the same row (star, move
      buttons) writing straight to `appState` with no intermediate
      component state.

      **A real, confirmed bug found and fixed while making T028/T031's
      own tests pass, not anticipated by any prior task**:
      `scenariosTab.tsx` originally relied only on `useActiveScenarios()`
      + `useBaseline()` for reactivity. Neither hook's own
      content-filtered snapshot changes for a label-only or reorder-only
      mutation, so calling `appState.setLabel()`/`moveScenario()` never
      triggered a re-render at all — a viewer's edit silently would not
      appear until some UNRELATED change happened to force one. Fixed
      with a new `hooks/useScenarioList.ts` (replacing the direct
      `appState.listByDisplayOrder()` call), subscribing to appState with
      its own full-record content comparison.

      That fix itself hit a SECOND, subtler real bug on first attempt:
      `listByDisplayOrder()` (like `list()`/`getActive()` before it)
      returns LIVE `Scenario` object references — every appState mutator
      changes fields IN PLACE on the same object stored in its `Map`,
      never replacing it. Caching those live references directly meant a
      later comparison's "previous" and "current" values were literally
      the SAME object read twice — always equal, defeating the
      memoization entirely and permanently suppressing re-renders. Fixed
      by snapshotting shallow COPIES into the cache
      (`live.map((s) => ({ ...s }))`) instead of the live array itself —
      confirmed via the label-editing Playwright test failing identically
      before this second fix and passing cleanly after.

      A THIRD, smaller issue surfaced once the input existed: several
      EXISTING tests (`scenarioManager.spec.ts`'s own multi-scenario test,
      this feature's own T015/T025 path/status test) asserted a
      scenario's name via `toContainText()` against the list container —
      correct when the name was plain text, but the name now lives in an
      `<input>`'s `value`/`placeholder`, neither of which counts as
      `textContent`. Fixed by scoping those assertions to the specific
      named input via its `aria-label` (`Custom label for <name>`)
      instead.
- [X] T030 [P] [US4] Extend `tests/unit/appState.test.ts`: confirm a
      labeled scenario's `sqlExpander`/`panelQuery` resolution still uses
      its real `name`, never `label` (FR-010, quickstart Scenario 5).
      Already covered by T006's own foundational
      `'FR-010: a scenario is never addressable by its label'` case.
- [X] T031 [P] [US4] Extend `tests/integration/settingsModal.spec.ts`:
      label assign → displays in place of name → reload clears it
      (depends on T029). Split into two tests: one drives the REAL UI
      `<input>` directly (typing, clearing) for FR-009's own UI-facing
      guarantee; the other drives the debug hook directly for FR-010's
      resolution guarantee plus the FR-015 reload-reset check. All 15
      tests in `settingsModal.spec.ts` and all 17 in the fixed
      `scenarioManager.spec.ts` pass together (32/32), and the full
      Vitest suite still passes in full (255/255).

**Checkpoint**: User Stories 1–4 independently functional.

---

## Phase 7: User Story 5 - Documentation placeholder (Priority: P3)

**Goal**: A clearly-labeled, non-broken placeholder tab.

**Independent Test**: spec.md's own Independent Test — open the
Documentation tab, confirm the placeholder message and no dead link.

### Implementation for User Story 5

- [X] T032 [US5] Finalize `src/layout/settings/documentationTab.tsx` —
      replace T010's bare stub with real, clearly-labeled placeholder copy
      (FR-014). Deliberately renders no `<a>` element at all (rather than
      a dead/placeholder `href`) — the spec's own "no broken link" wording
      is most directly satisfied by there being no link, not a disabled
      one.
- [X] T033 [P] [US5] Extend `tests/integration/settingsModal.spec.ts`:
      Documentation tab shows the placeholder, no broken/misleading link
      (depends on T032). Was already written alongside T015 (US1's own
      stub already satisfied this test); this task's own work was
      re-confirming it still passes against T032's finalized copy.

**Checkpoint**: All five user stories independently functional — feature
complete. Full suite re-confirmed: 15/15 `settingsModal.spec.ts`, 17/17
`scenarioManager.spec.ts`, 255/255 Vitest.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T034 [P] Update `CLAUDE.md`'s file-tree history (`layout/`,
      `state/`, `hooks/`, `panels/basemap/` entries) documenting this
      feature's real files and the decisions recorded in research.md,
      matching this project's established documentation convention.
      Covered: `state/appState.ts` (new fields/exports), new
      `state/basemapState.ts`, `hooks/useColorScheme.ts`'s stale
      `themeToggle.tsx` cross-reference corrected, new
      `hooks/useGlobalBasemap.ts`/`useScenarioList.ts` (with both real
      bugs recorded), `layout/shell.tsx`, new `layout/settingsModal.tsx` +
      `layout/settings/` (all four tabs, each real finding noted),
      `panels/basemap/`'s header comment + `types.ts` + `registry.ts` +
      `resolveEffectiveBasemap.ts`. `scenarioManager.ts`'s two stale
      `scenarioLoader.tsx` comment references were also corrected
      (grep-verified no other stale references remain).
- [X] T035 [P] Run every quickstart.md scenario (1–8) end-to-end against a
      real dev server, confirming each "Done when" condition. Found and
      corrected real drift between the plan-time sketch and the shipped
      implementation in three scenarios: Scenario 1 (checks needed
      reordering — Settings-modal content isn't mounted before the modal
      opens, so the meaningful pre-open check is the OLD controls'
      always-visible triggers, not `scenario-load-trigger-disabled-wrapper`,
      which the NEW ScenariosTab also uses); Scenario 6 (the real Basemap
      picker uses `role="radio"` with the raw registry key as its name,
      e.g. `"openfreemap-liberty"`, not a prettified label or `role="option"`;
      the real test confirms the re-render via a network-request check,
      not a `waitForBasemapApplied()` import); Scenario 7 (the real dev
      server port is 5199 under the `/APP-wftdm-dashboard/` base path, not
      5180 at root). All corrected directly in `quickstart.md`. Every
      scenario now maps to a real, passing test — Scenarios 1/2/7/8 in
      `settingsModal.spec.ts`'s US1 tests, 3/4 in
      `tests/unit/appState.test.ts`, 5 in both
      `tests/unit/appState.test.ts` and `settingsModal.spec.ts`'s US4
      tests, 6 in `resolveEffectiveBasemap.test.ts` and
      `settingsModal.spec.ts`'s US2 tests.
- [X] T036 Full regression pass — `npx vitest run` and
      `npx playwright test` — confirm no pre-existing suite regressed
      (particular attention to `dashboardShell.spec.ts` and
      `panelExpand.spec.ts`, which have previously needed re-scoping when
      header/tab structure changed). Results: Vitest 255/255. Playwright
      205/206 — the sole failure is `dashboardShell.spec.ts`'s
      "no-re-query" dark-mode test, already confirmed via `git stash`
      comparison (US1's own checkpoint note above) to fail identically on
      the clean pre-implementation baseline — genuinely pre-existing, not
      a regression. Every other suite this feature touches or could
      plausibly affect (`flowmapPanel.spec.ts`, `zonemapPanel.spec.ts`,
      `panelExpand.spec.ts`, `dashboardShell.spec.ts`'s other cases,
      `tablePanel.spec.ts`, `graphicWalkerPanel.spec.ts`,
      `observablePlotPanel.spec.ts`) passed in full, including the
      previously-flaky WebGL-context-loss-recovery test (US2's own
      checkpoint note above), which passed cleanly on this run.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — BLOCKS every user story
- **User Story 1 (Phase 3)**: depends on Foundational only
- **User Story 2 (Phase 4)**: depends on Foundational AND User Story 1
  (needs `settingsModal.tsx`'s tab shell and the `basemapTab.tsx` stub to
  replace — spec.md's own "Why this priority" for US2 states this
  dependency explicitly)
- **User Story 3 (Phase 5)**: depends on Foundational AND User Story 1
  (extends `scenariosTab.tsx`, built in US1)
- **User Story 4 (Phase 6)**: depends on Foundational AND User Story 1
  (same reason as US3); independent of US2/US3
- **User Story 5 (Phase 7)**: depends on Foundational AND User Story 1
  (replaces the `documentationTab.tsx` stub built in US1); independent of
  US2/US3/US4
- **Polish (Phase 8)**: depends on every user story phase desired being
  complete

### Within Each Phase

- Foundational: T002 before T003 (same file); T004/T005/T006 depend on
  T002 but are mutually parallel (different files)
- US1: T007/T008/T009/T010 are mutually parallel (four different new
  files, no cross-dependency); T011 depends on all four; T012 depends on
  T011; T013 depends on T012; T014 depends on T013; T015/T016 depend on
  T012+T013 and are mutually parallel
- US2: T017 before T018 (same file); T019 before T020 (same file);
  T021/T022 depend on T018+T020 and are mutually parallel; T023 depends
  on T019 (and T009 for what it replaces); T024 depends on T018; T025
  depends on T021+T022+T023
- US3/US4/US5: each phase's own single implementation task (T026/T029/
  T032) gates that phase's own test tasks; the three phases are mutually
  independent of each other (all depend only on US1's T008/T010)

### Parallel Opportunities

- Once Foundational completes, US2, US3, US4, and US5 can all be worked
  in parallel by different contributors (each depends only on US1, not on
  each other) — though US1 itself must land first
- Within US1: T007, T008, T009, T010 in parallel; within US2: T017/T019
  (then T021/T022) in parallel; T024/T025 in parallel with each other

---

## Parallel Example: User Story 1

```bash
# Four new tab components, no cross-dependency:
Task: "Create src/layout/settings/appearanceTab.tsx"
Task: "Create src/layout/settings/scenariosTab.tsx"
Task: "Create src/layout/settings/basemapTab.tsx (stub)"
Task: "Create src/layout/settings/documentationTab.tsx (stub)"
```

## Parallel Example: User Story 2

```bash
# Independent new-file work before the panel call-site updates:
Task: "Add 'global' to BasemapSource in src/panels/basemap/types.ts"
Task: "Create src/state/basemapState.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational)
2. Complete Phase 3 (User Story 1)
3. **STOP and VALIDATE**: run `settingsModal.spec.ts`'s US1 cases and
   quickstart.md Scenarios 1, 2, 3(partial — path/status only), 4, 7
4. Deploy/demo — the header consolidation is real value on its own

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. + User Story 1 → test independently → deploy (MVP)
3. + User Story 2 (Basemap) → test independently → deploy
4. + User Story 3 (Reorder) → test independently → deploy
5. + User Story 4 (Custom label) → test independently → deploy
6. + User Story 5 (Documentation) → test independently → deploy
7. Polish

### Parallel Team Strategy

After Foundational + User Story 1 land (US2/US3/US4/US5 all depend on
US1's `scenariosTab.tsx`/`settingsModal.tsx`, not on each other):

- Developer A: User Story 2 (Basemap)
- Developer B: User Story 3 (Reorder)
- Developer C: User Story 4 (Custom label) + User Story 5 (Documentation,
  small enough to pair with US4)

---

## Notes

- No new npm dependency is introduced anywhere in this task list (plan.md
  Technical Context) — every `[P]` pairing above is genuinely
  different-file, not different-package.
- `scenariosTab.tsx` is touched by four separate phases (T008 in US1,
  T026 in US3, T029 in US4) — each addition is a self-contained control
  added to the same file, not a rewrite; sequenced deliberately (US3
  before US4) so no two phases edit it concurrently.
- Verify each phase's tests fail (or don't yet exist) before its own
  implementation tasks land, per this project's established practice.
- Stop at any checkpoint above to validate that phase's story
  independently before continuing.
