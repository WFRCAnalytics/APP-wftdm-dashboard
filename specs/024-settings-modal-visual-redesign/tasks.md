---

description: "Task list template for feature implementation"
---

# Tasks: Settings Modal Visual Redesign

**Input**: Design documents from `/specs/024-settings-modal-visual-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — spec.md's own Acceptance Scenarios and Success Criteria
are behavior/accessibility assertions best captured as Playwright tests in
the existing `tests/integration/settingsModal.spec.ts` suite; this project's
own established convention (every prior Settings-modal feature) adds
regression tests alongside the change, not after it ships separately.

**Organization**: Tasks are grouped by user story (P1-P4, from spec.md) to
enable independent implementation and testing of each. All four stories
touch different tab components and can be done in any order or in parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)

## Path Conventions

Single project — `src/`, `tests/` at repository root, per plan.md's Project
Structure section. No new directories.

---

## Phase 1: Setup

- [X] T001 Confirm a clean baseline: run `npm run typecheck`, the Vitest unit
      suite, and `npx playwright test settingsModal.spec.ts` on
      `024-settings-modal-visual-redesign` before any change, so any later
      failure can be attributed to this feature and not pre-existing state.

---

## Phase 2: Foundational

**None.** Each of the four user stories below touches an independent
component (`scenariosTab.tsx`, `basemapTab.tsx`, `basemapTab.tsx` again for
polish, `appearanceTab.tsx`) with no shared blocking prerequisite —
confirmed directly in plan.md's Project Structure (per-file, not per-shared-
module). Proceed directly to whichever story you want first; T001 above is
the only shared setup step.

---

## Phase 3: User Story 1 - Scenarios tab is legible and status is visible at a glance (Priority: P1) 🎯 MVP

**Goal**: Each scenario row in Settings → Scenarios visually communicates
its status (ready/failed/registering) via color, not text alone, while
every existing action (reorder, baseline, relabel, remove) keeps working
unchanged.

**Independent Test**: Open Settings → Scenarios with a mix of ready,
failed, and still-registering scenarios; confirm status is distinguishable
by color alone, and every existing row action still works.

### Implementation for User Story 1

- [X] T002 [P] [US1] Add `--success` / `--success-foreground` custom
      properties to `src/styles/tokens.css`, in both the `:root` (light) and
      `.dark` blocks, following the exact existing pattern of
      `--destructive`/`--destructive-foreground` (data-model.md).
- [X] T003 [US1] Create `src/layout/settings/scenarioStatusColor.ts`
      exporting a pure function mapping `ScenarioStatus` (`'registering' |
      'ready' | 'failed'`) to a Tailwind class name (or small style object)
      using `--success` (ready), the existing `--destructive` (failed), and
      `--muted-foreground` (registering) — same "split pure color-resolution
      logic into its own testable module" convention this codebase already
      follows in `panels/zonemapColor.ts`/`panels/sankeyColor.ts`
      (data-model.md, research.md §2).
- [X] T004 [P] [US1] Add a Vitest unit test for `scenarioStatusColor.ts`
      covering all three `ScenarioStatus` values.
- [X] T005 [US1] In `src/layout/settings/scenariosTab.tsx`, render a status
      indicator (e.g. a small colored dot/badge next to the existing
      `({s.status})` text) driven by T003's helper, for every row.
      Reorganize each row's layout for legibility (clearer grouping of
      identity / status / actions) without removing or renaming any
      existing `data-testid`/`aria-label`/role attribute the current test
      suite depends on (move-up/down buttons, baseline star, `scenario-name`
      input, remove button).
- [X] T006 [P] [US1] Add Playwright test(s) in
      `tests/integration/settingsModal.spec.ts` (User Story 3 — Scenarios —
      describe block) asserting a `ready` row, a `failed` row, and a
      `registering` row each render a visually distinct status indicator
      (e.g. by asserting distinct computed background-color or a distinct
      class/data attribute per status) — spec.md Acceptance Scenarios 1-3.
- [X] T007 [US1] Run the existing Scenarios-tab tests (reorder, baseline
      star, relabel, remove) unmodified against the new layout and confirm
      they still pass — spec.md Acceptance Scenario 4. Fix any selector that
      broke only because of the layout change (not because the behavior
      changed).

**Checkpoint**: Scenarios tab status is legible by color; all prior actions
still work. This alone is a shippable, demonstrable increment.

---

## Phase 4: User Story 2 - Raster tile providers can be previewed before applying (Priority: P2)

**Goal**: Selecting a raster provider in the Basemap tab's Raster Tiles
dropdown shows real tiles in the shared preview map, the same as every
vector-style entry already does.

**Independent Test**: Select a raster provider; confirm the shared preview
map shows real tiles (no placeholder). Switch to a vector entry; confirm a
clean switch back. Apply; confirm the real basemap updates as before.

### Implementation for User Story 2

- [X] T008 [US2] In `src/layout/settings/basemapTab.tsx`, remove the
      `isRasterProviderSelection(stagedSelection)` early-return from the
      preview-application `useEffect` so `loadBasemapStyle(stagedSelection,
      signal)` is called (and its result applied via `setStyle()`) for a
      raster-provider selection exactly as it already is for every
      vector-style selection — no change to `loadBasemapStyle.ts` itself
      (research.md §1). Depends on: none (independent of US1).
- [X] T009 [US2] In the same file, remove the `stagedIsRaster &&
      <div>...No live preview for raster providers...</div>` placeholder
      render branch — the preview map itself now handles this selection.
      Depends on: T008.
- [X] T010 [US2] Add a scoped MapLibre `'error'` listener to the preview
      map's basemap-application effect in `basemapTab.tsx`, guarded by the
      existing `basemapGenerationRef` generation counter (mirroring
      `FlowMapPanel.tsx`'s own basemap-application `'error'` handling
      pattern), setting a new local `previewError` state when the CURRENT
      generation's style load fails — FR-007, research.md §1's "Remaining
      real work". Depends on: T008.
- [X] T011 [US2] Render a distinct failure message in the preview area (an
      absolutely-positioned overlay, reusing the same visual treatment
      pattern the removed placeholder used) when `previewError` is true for
      the current staged selection, cleared on the next successful style
      load or selection change. Depends on: T010.
- [X] T012 [P] [US2] Add Playwright test(s) verifying: selecting a raster
      provider (one with no variants, and one addressed via its
      `<optgroup>` variant) renders real tiles in
      `window.__basemapPreviewTestMap` (no placeholder text present), and
      switching back to a vector entry cleanly replaces the raster source —
      spec.md Acceptance Scenarios 1-2. Depends on: T008, T009.
- [X] T013 [P] [US2] Add a Playwright test for the failure path: force a
      raster tile/style request to fail (e.g. route-abort via
      `page.route()`) and confirm the distinct failure indication renders
      — spec.md Acceptance Scenario 4, FR-007. Depends on: T010, T011.
- [X] T014 [US2] Add/confirm a Playwright test that clicking Apply while a
      raster provider is staged still calls the existing
      `setGlobalBasemap(stagedSelection)` path and a live panel picks up
      that raster basemap — spec.md Acceptance Scenario 3 (regression check
      on the unmodified Apply mechanism). Depends on: T008.

**Checkpoint**: Raster Tiles selections preview live, independent of US1;
Apply behavior is unchanged.

---

## Phase 5: User Story 3 - Basemap catalog list reads more clearly (Priority: P3)

**Goal**: Improved spacing, sizing, typography, and hover/active states for
the existing flat catalog list — no structural change.

**Independent Test**: Visually compare section headings and entry states
(resting/hover/staged) against the pre-change version; confirm staging and
Apply behavior is unchanged.

### Implementation for User Story 3

- [X] T015 [US3] In `src/layout/settings/basemapTab.tsx`, restyle each
      section's `<h3>` heading (spacing/typography, visual separation from
      the entries above/below) — markup structure unchanged, Tailwind
      classes only. Independent of US2's changes to the same file (touches
      the render's heading/entry styling, not the preview effect) — resolve
      merge overlap by rebasing onto US2's changes if done after them, or
      vice versa.
- [X] T016 [US3] In the same file, restyle each catalog entry `<Button>`
      (spacing, sizing, typography) and give resting/hover/staged states
      distinct visual treatment beyond the existing `variant={staged ?
      'secondary' : 'outline'}` — preserve `role="radio"`, `aria-checked`,
      and `data-staged` unchanged (research.md §4).
- [X] T017 [P] [US3] Add a Playwright test asserting a hover state on an
      unstaged entry is visually distinct (e.g. a changed computed
      background-color or class on `:hover`) — spec.md Acceptance Scenario
      1.
- [X] T018 [P] [US3] Add a Playwright test confirming the staged entry has
      a computed style distinguishable from an unstaged entry beyond
      `aria-checked` alone — spec.md Acceptance Scenario 2.
- [X] T019 [US3] Run the existing Basemap-tab test block (staging, preview,
      Apply, section rendering, `data-testid="basemap-sections-scroll"`)
      unmodified and confirm all still pass — spec.md Acceptance Scenario
      4.

**Checkpoint**: Basemap catalog list is visually improved; staging/preview/
Apply mechanism unchanged; independent of US1 and US2.

---

## Phase 6: User Story 4 - Appearance tab uses a real tab control (Priority: P4)

**Goal**: Replace the System/Light/Dark `<Button>` row with a proper `Tabs`/
`TabsTrigger` control, without colliding with the Settings modal's own outer
tab navigation.

**Independent Test**: Arrow-key between System/Light/Dark; confirm
selection persists across a Settings-tab round trip; confirm exactly two
distinguishable `tablist` regions exist while this tab is open.

### Implementation for User Story 4

- [X] T020 [US4] Add `aria-label="Settings sections"` to the outer
      `<TabsList>` in `src/layout/settingsModal.tsx` (research.md §3).
      Independent of T021-T025 below; can be done first or in parallel.
- [X] T021 [US4] Rebuild `src/layout/settings/appearanceTab.tsx`'s
      System/Light/Dark selector: replace the `<div role="group"
      aria-label="Theme">` + `<Button>` row with `<Tabs value={mode}
      onValueChange={(v) => setMode(v as ThemeMode)}>` /
      `<TabsList aria-label="Theme">` / one `<TabsTrigger value={m}>` per
      mode (default horizontal orientation — no `orientation` prop, per
      research.md §5). Keep the existing mount/`matchMedia` effect and
      `setMode`/`useThemeMode()` wiring completely unchanged (data-model.md)
      — only the rendered control shape changes.
- [X] T022 [US4] Confirm keyboard arrow-key navigation moves focus between
      the three `TabsTrigger` options (manual check per quickstart.md US4
      step 2, or a Playwright keyboard-navigation test if the existing
      suite already has an equivalent pattern for `navBar.tsx`'s tabs to
      copy).
- [X] T023 [US4] In `tests/integration/settingsModal.spec.ts`, migrate the
      two existing assertions keyed on `page.getByRole('button', { name:
      'Dark'|'Light'|'System' })` + `toHaveAttribute('aria-pressed', ...)`
      to `page.getByRole('tab', { name: ... })` +
      `toHaveAttribute('aria-selected', ...)` (research.md §3 — required,
      not optional; confirmed to be the only two assertions this rebuild
      breaks).
- [X] T024 [P] [US4] Add a Playwright test asserting
      `page.getByRole('dialog').getByRole('tablist', { name: 'Settings
      sections' })` and `page.getByRole('dialog').getByRole('tablist', {
      name: 'Theme' })` each resolve to exactly one element while the
      Appearance tab is open — spec.md FR-013/SC-005. Depends on: T020,
      T021.
- [X] T025 [US4] Re-run the existing "a Light/Dark selection survives
      switching to another Settings tab and back" regression test (added by
      the prior theme-reset fix) against the rebuilt control; confirm it
      still passes with no code change to `state/themeState.ts` or
      `hooks/useThemeMode.ts` — spec.md Acceptance Scenario 2.

**Checkpoint**: Appearance tab uses a real `Tabs` control; the two nested
`tablist` regions are unambiguously distinguishable; theme-mode persistence
behavior is unregressed.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T026 Grep `src/layout/settings/basemapTab.tsx` and any other file for
      stale comments/strings claiming raster providers have no live preview
      (021-basemap-catalog-redesign's own FR-008 language) and correct or
      remove them — FR-008.
- [X] T027 [P] Update this project's `CLAUDE.md` file-structure narrative
      comments for `scenariosTab.tsx`, `basemapTab.tsx`, `appearanceTab.tsx`,
      and `tokens.css` to record this feature's real findings (the raster-
      preview mechanism already existed — research.md §1 — and the
      nested-tablist scoping approach used), matching this project's own
      established documentation convention for every prior Settings-modal
      feature.
- [X] T028 Run the full regression pass from quickstart.md: `npm run
      typecheck`, the full Vitest unit suite, and the full Playwright suite.
      Per this project's established flakiness-triage discipline, re-run
      any single failing test in isolation (`--repeat-each=3`) and the full
      suite serially (`--workers=1`) before concluding a failure is a real
      regression introduced by this feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: None — skip directly to any user story after T001.
- **User Stories (Phases 3-6)**: Each depends only on T001 (baseline
  confirmed), not on each other. They may be done in any order, in
  parallel, or dropped individually without affecting the others — the only
  shared file across two stories is `basemapTab.tsx` (US2 and US3 both edit
  it; see T015's note on rebasing if done sequentially).
- **Polish (Phase 7)**: Depends on however many of Phases 3-6 you choose to
  complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on US2/US3/US4.
- **US2 (P2)**: No dependency on US1/US3/US4. Shares `basemapTab.tsx` with
  US3 — same file, different regions (preview effect vs. render styling) —
  low conflict risk, but do them sequentially if worked on by the same
  person to avoid a merge that has to be resolved by hand.
- **US3 (P3)**: No dependency on US1/US2/US4. See US2 note above.
- **US4 (P4)**: No dependency on US1/US2/US3.

### Within Each User Story

- Token/helper additions before the component change that consumes them
  (T002/T003 before T005; T020 can precede or run alongside T021).
- The component change before its own tests (T008-T011 before T012-T014;
  T021 before T022-T024).
- Regression checks of pre-existing behavior last within each story (T007,
  T014, T019, T025).

### Parallel Opportunities

- T002 (tokens.css) and T003 (scenarioStatusColor.ts) can start together —
  different files.
- All four user-story phases (3-6) can be staffed and worked in parallel —
  confirmed independent above.
- Every task marked `[P]` within a phase touches a different file (or a
  test file distinct from the implementation file it tests) from the other
  tasks in that phase at the same dependency depth.

---

## Parallel Example: User Story 1

```bash
# T002 and T003 have no dependency on each other:
Task: "Add --success/--success-foreground to src/styles/tokens.css"
Task: "Create src/layout/settings/scenarioStatusColor.ts"

# T004 and T006 can run once their respective targets (T003, T005) exist:
Task: "Vitest unit test for scenarioStatusColor.ts"
Task: "Playwright test for status-indicator distinguishability"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (T001).
2. Complete Phase 3 (US1 — Scenarios tab status coloring).
3. **STOP and VALIDATE**: run quickstart.md's US1 steps manually, then
   `npx playwright test settingsModal.spec.ts`.
4. Ship — this alone resolves the most visible complaint ("very default and
   ugly") with the smallest surface area.

### Incremental Delivery

1. T001 → done.
2. US1 → validate → ship (MVP).
3. US2 → validate → ship (closes the raster-preview gap).
4. US3 → validate → ship (polish, lowest risk).
5. US4 → validate → ship (the one with the nested-tablist risk — saved for
   last deliberately, since it's the only story whose own dependency,
   `components/ui/tabs.tsx`, is shared with `navBar.tsx` and
   `settingsModal.tsx`'s outer nav, even though research.md confirms it
   needs no changes to that shared file).
6. Phase 7 polish once as many of the above as desired are complete.

### Parallel Team Strategy

With up to four people: each takes one of Phases 3-6 independently once
T001 is confirmed green; only coordinate if two people land changes to
`basemapTab.tsx` (US2 + US3) around the same time.

---

## Notes

- No Foundational phase tasks exist for this feature — confirmed each story
  is file-independent (plan.md's Project Structure).
- `[P]` tasks touch different files, or a test file separate from what it
  tests, from every other `[P]` task at the same point in the graph.
- Every task that touches `basemapTab.tsx`, `scenariosTab.tsx`,
  `appearanceTab.tsx`, or `settingsModal.tsx` preserves every existing
  `data-testid`/`role`/`aria-*` attribute the current
  `settingsModal.spec.ts` suite depends on, except the two `role="button"`/
  `aria-pressed` assertions research.md §3 already identified as needing
  migration (T023) — that migration is expected, not a regression to avoid.
- Constitution Check (plan.md): no violations: no new dependency, no new
  config file, MapLibre/Tailwind/Radix/shadcn all already fixed choices.
