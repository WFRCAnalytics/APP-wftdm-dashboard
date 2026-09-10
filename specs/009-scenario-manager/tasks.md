---

description: "Task list for Scenario Manager (local folder loading)"
---

# Tasks: Scenario Manager (local folder loading)

**Input**: Design documents from `/specs/009-scenario-manager/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/scenario-manager.md, quickstart.md — all present.

**Tests**: Included, TDD-ordered (test task before its implementation
task, expected to fail first) — matching this project's established
convention across every prior feature (`005` through `008`), not merely
the template's optional default.

**Organization**: Tasks are grouped by user story (spec.md's US1/US2/US3,
priority order) so each story is independently implementable and
testable, per Foundational infrastructure shared by all three.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an
  incomplete task)
- **[Story]**: US1, US2, or US3 — omitted for Setup/Foundational/Polish

## Path Conventions

Single project — `src/`, `tests/` at repository root, per plan.md's
Project Structure (no new top-level directory).

---

## Phase 1: Setup

- [X] T001 [P] Verify `tests/fixtures/scenarios/good_scenario/manifest.yaml`
      and `tests/fixtures/scenarios/good_scenario/summary/*.parquet` exist
      and are suitable for reuse as this feature's Playwright fake-picker
      fixture (research.md §2, quickstart.md Prerequisites) — no new
      fixture generation needed; confirm, don't create.

**Checkpoint**: No new dependencies, no config changes — Setup is a
verification-only phase for this feature (plan.md's Technical Context:
"No new dependencies").

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure every user story depends on — the
reactivity mechanism (FR-008) and the deployment-mode/support-detection
functions US1's UI gating and US2's tests both need.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Write failing unit test for `appState.ts`'s new
      `subscribe()`/`notify()` in `tests/unit/appState.test.ts` (new file)
      — asserts a subscriber fires once per `register()`/`setStatus()`/
      `setActive()`/`unregister()` call, and an unsubscribed callback
      stops firing (contracts/scenario-manager.md).
- [X] T003 Implement `subscribe()`/`notify()` in `src/state/appState.ts`
      per contracts/scenario-manager.md — one added `notify()` call as the
      last statement of each of `register`/`setStatus`/`setActive`/
      `unregister`; correct the file's header comment (no longer "no
      pub/sub... no FR requires it" — FR-008 now does, research.md §1).
      Depends on: T002 (satisfies it).
- [X] T004 [P] Implement `src/hooks/useActiveScenarios.ts` per
      contracts/scenario-manager.md — mirrors `useFilterState.ts`'s
      memoized-snapshot-over-`useSyncExternalStore` shape exactly. No
      dedicated unit test (quickstart.md's Testing note: `vitest.config.js`
      is `environment: 'node'`, no React renderer — same reason
      `useFilterState.ts` has none either; verified via Playwright in
      later story tasks instead. Depends on: T003.
- [X] T005 [P] Implement `parseYAMLText()` in `src/services/yamlLoader.ts`
      per contracts/scenario-manager.md — factored out of `loadConfig`'s
      existing inline try/catch; `loadConfig`'s own behavior unchanged.
- [X] T006 Extend `tests/unit/yamlLoader.test.ts` to cover `parseYAMLText`
      directly (valid text parses; malformed text throws an error naming
      the given `sourceLabel`) and confirm `loadConfig`'s three existing
      tests still pass unchanged. Depends on: T005.
- [X] T007 [P] Create `src/scenario/scenarioManager.ts` with
      `isLocalDeployment()` and `supportsLocalFolderLoading()` only
      (contracts/scenario-manager.md) — the two functions US1's UI gating
      and US2's tests both need; `loadLocalScenario()`/
      `removeLocalScenario()` are added later by US1/US3 tasks in this
      same file.
- [X] T008 [P] Unit test `isLocalDeployment()`/`supportsLocalFolderLoading()`
      in `tests/unit/scenarioManager.test.ts` (new file) — mock
      `window.location.hostname` and `window.showDirectoryPicker`'s
      presence/absence. Depends on: T007.
- [X] T009 [P] Apply the mechanical panel diff (contracts/
      scenario-manager.md's panel diff) to `src/panels/ValueBoxPanel.tsx`
      — swap the in-effect `appState.getActive()` call for
      `useActiveScenarios()`, add its return value to the data-fetch
      effect's dependency array. Depends on: T004.
- [X] T010 [P] Apply the same mechanical diff to
      `src/panels/PlotlyPanel.tsx`. Depends on: T004.
- [X] T011 [P] Apply the same mechanical diff to
      `src/panels/TablePanel.tsx`. Depends on: T004.
- [X] T012 [P] Apply the same mechanical diff to
      `src/panels/ObservablePlotPanel.tsx`. Depends on: T004.
- [X] T013 [P] Apply the same mechanical diff to
      `src/panels/SankeyPanel.tsx`. Depends on: T004.

**Checkpoint**: Foundation ready — `appState.ts` is reactive, every
existing panel type consumes the active-scenario set through the new hook,
`manifest.yaml` can be parsed from either a URL or a handle, and
deployment-mode/support detection exist. User story implementation can now
begin.

---

## Phase 3: User Story 1 - Analyst loads a local scenario folder from the hosted web app (Priority: P1) 🎯 MVP

**Goal**: Pick a folder → read its `manifest.yaml` → collision-check →
register + activate → already-rendered panels reflect it, with no reload
and no loss of any panel's own local state.

**Independent Test**: Per spec.md — pick a fixture folder with a valid
`manifest.yaml`/`summary/*.parquet`, confirm its name appears active and
queryable, and an already-rendered unpinned panel updates to include it.

### Tests for User Story 1 ⚠️

> Write these first; confirm they fail against the not-yet-implemented
> code before proceeding to implementation below.

- [X] T014 [P] [US1] Unit test `readManifest()` in
      `tests/unit/manifestReader.test.ts` (new file) — valid manifest →
      `{status: 'ok', manifest: {...}}`; missing file → `{status:
      'missing'}`; malformed YAML → `{status: 'invalid', message}` with a
      real, non-empty message reflecting the actual parse error (the
      distinction fixed during contract review — contracts/
      scenario-manager.md's header); partial manifest (some fields absent)
      parses the present fields under `status: 'ok'`.
- [X] T015 [P] [US1] Unit test the collision-classification logic in
      `tests/unit/scenarioManager.test.ts` (extends T008's file) — a name
      colliding with an existing `source: 'url'` entry classifies as
      reject; colliding with an existing `source: 'handle'` entry
      classifies as proceed; no collision classifies as proceed. Test the
      decision in isolation (mocked `appState.get()`), not through a real
      `showDirectoryPicker()` call.
- [X] T016 [US1] Integration test in
      `tests/integration/scenarioManager.spec.ts` (new file) — via a fake
      `window.showDirectoryPicker` injected through `page.addInitScript()`
      (research.md §2), picking a valid fixture folder registers and
      activates it, and an already-rendered unpinned panel's query results
      include its data without a page reload (Acceptance Scenario 1).
- [X] T017 [US1] Integration test — **the FR-008 no-state-loss regression
      test the user specifically required**: a `TablePanel`'s search term
      and pagination survive a local-scenario load untouched. Assert the
      React state values (not DOM-node identity — corrected during
      implementation: every panel type replaces its content with a
      loading skeleton on any refetch, so the DOM node is destroyed/
      recreated on every refetch by design, unrelated to state loss; see
      quickstart.md scenario 2). Paired with a second test proving a
      genuine filter change still resets search/page as before, proving
      the guard is selective, not disabled.
- [X] T018 [US1] Integration test — re-picking the same folder a second
      time re-registers cleanly, no duplicate entry in the loaded-scenario
      list (quickstart.md scenario 3).
- [X] T019 [US1] Integration test — a folder whose name collides with an
      already-published scenario is rejected with a visible error, and
      the published scenario's views/metadata are provably untouched
      (re-query them, compare to pre-attempt values) (FR-006, SC-005,
      quickstart.md scenario 4).
- [X] T020 [US1] Integration test — a folder with no `manifest.yaml` (or
      an unparseable one) falls back to the folder's own name and still
      registers successfully (FR-005, quickstart.md scenario 5).
- [X] T021 [US1] Integration test — a folder with no `summary/` subfolder
      registers the entry but marks it `failed`, and does not activate it
      (quickstart.md scenario 6).
- [X] T022 [US1] Integration test — cancelling the native picker dialog
      produces no error and no partial registration (Acceptance Scenario
      3, SC-002).

### Implementation for User Story 1

- [X] T023 [US1] Implement `readManifest()` in
      `src/scenario/manifestReader.ts` (new file) per contracts/
      scenario-manager.md. Depends on: T014, T006 (`parseYAMLText`).
- [X] T024 [US1] Implement `loadLocalScenario()` in
      `src/scenario/scenarioManager.ts` per contracts/scenario-manager.md
      — picker call with `AbortError` → `'cancelled'` handling, manifest
      read with the status-specific `console.warn` (contract fix),
      collision check (FR-006), register/setStatus/setActive (FR-007).
      Depends on: T023, T015, T007.
- [X] T025 [US1] Create `src/layout/scenarioLoader.tsx` (new file) with
      the trigger button (supported-browser path only — US2 adds the
      disabled/tooltip branch), gated on `isLocalDeployment()`, calling
      `loadLocalScenario()` on click and showing a collision/failure error
      message per contracts/scenario-manager.md. Depends on: T024.
- [X] T026 [US1] Mount `<ScenarioLoader />` in `src/layout/shell.tsx`'s
      header, as a sibling to `<NavBar />` — no change to `NavBar` itself.
      Depends on: T025.

**Checkpoint**: User Story 1 fully functional and independently testable
(T016–T022 pass). This is the MVP — `services/duckdb.ts`'s
`registerScenario()` finally has a caller.

---

## Phase 4: User Story 2 - Unsupported browser sees a clear, non-broken control (Priority: P2)

**Goal**: In Firefox/Safari, the control is visibly present but disabled
with an explanation — not hidden, not a silent no-op, not a thrown
exception.

**Independent Test**: Simulate the absence of `window.showDirectoryPicker`
and confirm the control renders disabled with an explanatory tooltip,
with the rest of the dashboard fully usable.

### Tests for User Story 2 ⚠️

- [X] T027 [P] [US2] Integration test — with `window.showDirectoryPicker`
      simulated absent, the control renders disabled with a tooltip
      naming Chrome/Edge, and the rest of the dashboard (tabs, panels,
      auto-discovered scenarios) is unaffected (Acceptance Scenarios 1–2,
      quickstart.md scenario 8).
- [X] T028 [P] [US2] Integration test — with `isLocalDeployment()`'s
      `localhost` condition simulated true, the control does not render
      at all (quickstart.md scenario 9).

### Implementation for User Story 2

- [X] T029 [US2] Extend `src/layout/scenarioLoader.tsx` with the
      disabled+`Tooltip` branch for `!supportsLocalFolderLoading()`, per
      contracts/scenario-manager.md. Depends on: T025 (T007 already
      provides `supportsLocalFolderLoading()`).

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Analyst manages multiple loaded local scenarios (Priority: P3)

**Goal**: Load two distinct local folders simultaneously; remove one
without affecting the other or any auto-discovered scenario, and without a
page reload.

**Independent Test**: Load two distinct local folders, confirm both are
simultaneously active/queryable, then remove one and confirm only its
views/metadata are dropped.

### Tests for User Story 3 ⚠️

- [X] T030 [P] [US3] Unit test `removeLocalScenario()`'s pure call
      sequence in `tests/unit/scenarioManager.test.ts` (extends T015's
      file, mocked `duckdb`/`appState` imports) — calls
      `unregisterScenario(name)` then `appState.unregister(name)`, in
      that order.
- [X] T031 [US3] Integration test — two distinct local folders loaded in
      the same session are both simultaneously active and queryable, the
      first not replaced or deactivated by the second (Acceptance
      Scenario 1, quickstart.md scenario 7).
- [X] T032 [US3] Integration test — removing one loaded local scenario via
      its list entry's remove control drops its views and deactivates it,
      while the other locally loaded scenario and every auto-discovered
      scenario remain unaffected (Acceptance Scenario 2, quickstart.md
      scenario 7).

### Implementation for User Story 3

- [X] T033 [US3] Implement `removeLocalScenario()` in
      `src/scenario/scenarioManager.ts` per contracts/scenario-manager.md.
      Depends on: T030, T007.
- [X] T034 [US3] Extend `src/layout/scenarioLoader.tsx` with the
      loaded-scenario list (name + status + remove `Button`, per
      contracts/scenario-manager.md), reading
      `appState.list().filter((s) => s.source === 'handle')`. Depends on:
      T033, T029.

**Checkpoint**: All three user stories independently functional. FR-009
(visible list + remove) complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T035 [P] Run `npm run typecheck` — zero errors across every new/
      modified file.
- [X] T036 [P] Run the full Vitest suite (`npx vitest run`) — zero
      regressions in every existing unit test file alongside the new
      `appState.test.ts`/`manifestReader.test.ts`/`scenarioManager.test.ts`
      and the extended `yamlLoader.test.ts`.
- [X] T037 [P] Run the full Playwright suite (`npx playwright test`) —
      zero regressions in every existing integration spec alongside the
      new `scenarioManager.spec.ts`.
- [ ] T038 Run quickstart.md's manual verification steps 1–8 against a
      real Chrome/Edge session on a non-`localhost` origin. **Not
      performed by the implementing agent** (no real browser to click
      through manually) — left unchecked honestly rather than marked done
      on an equivalence claim. All 9 of quickstart.md's automated
      Playwright scenarios (which this manual list mirrors) do pass
      (T016–T022, T027–T028, T031–T032), so the same user-facing behavior
      is exercised, but a literal manual click-through is a real,
      outstanding gap for a human to close before shipping, not something
      to claim as done.
- [X] T039 Update `CLAUDE.md`'s Implementation order section — mark item 7
      (`scenario/scenarioManager.ts`, previously "⏸️ explicitly deferred")
      done, matching the audit discipline every prior feature in this
      project has performed at completion.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  US1 → US2 → US3 in priority order is the recommended sequence (US2 and
  US3 both extend `scenarioLoader.tsx`, which US1 creates), though US2 and
  US3 could proceed in parallel by different people once US1's T025
  exists — US2 doesn't depend on US3 or vice versa.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each Phase

- Tests are written and confirmed failing before their corresponding
  implementation task.
- `manifestReader.ts` before `scenarioManager.ts`'s `loadLocalScenario()`
  (T023 before T024) — the latter calls the former.
- `scenarioLoader.tsx`'s creation (T025) before either extension (T029,
  T034) — same file, sequential edits.

### Parallel Opportunities

- T001 (Setup) has no dependents and can run any time before Phase 2.
- Within Foundational: T002/T004/T005/T007/T008 (and T009–T013, once T004
  lands) are marked `[P]` — different files, no inter-dependency beyond
  T004 itself.
- Within US1's test block: T014/T015 are `[P]` (different files from each
  other and from the integration spec); T016–T022 share one spec file, so
  are sequenced, not parallel, despite testing independent scenarios.
- Within US2: T027/T028 are `[P]` at the authoring level (independent
  `test()` blocks, no shared mutable state) — `playwright.config.js` sets
  `fullyParallel: false`, so Playwright itself still runs a spec file's
  tests one at a time; the `[P]` marker here means the two tasks can be
  *written* without waiting on each other, not that they execute
  concurrently at runtime, matching every prior feature's spec file.

---

## Parallel Example: Foundational Phase

```bash
# Once T003 (appState.ts subscribe()) lands, these can proceed together:
Task: "Implement useActiveScenarios.ts (T004)"
Task: "Implement parseYAMLText() in yamlLoader.ts (T005)"
Task: "Create scenarioManager.ts's isLocalDeployment()/
       supportsLocalFolderLoading() (T007)"

# Once T004 lands, all five panel diffs can proceed together:
Task: "Apply mechanical diff to ValueBoxPanel.tsx (T009)"
Task: "Apply mechanical diff to PlotlyPanel.tsx (T010)"
Task: "Apply mechanical diff to TablePanel.tsx (T011)"
Task: "Apply mechanical diff to ObservablePlotPanel.tsx (T012)"
Task: "Apply mechanical diff to SankeyPanel.tsx (T013)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational — CRITICAL, blocks
   everything).
2. Complete Phase 3 (US1).
3. **STOP and VALIDATE**: run T016–T022 (US1's integration tests),
   independently confirming the core load flow and FR-008's no-state-loss
   guarantee.
4. This is a legitimate, demoable MVP — `registerScenario()`'s
   longest-standing gap (zero callers since `001`) is closed.

### Incremental Delivery

1. Setup + Foundational → foundation ready (reactive `appState`, every
   panel type consuming it, manifest-reading capability, deployment-mode
   detection).
2. Add US1 → validate independently → MVP.
3. Add US2 → validate independently (no regression to US1).
4. Add US3 → validate independently (no regression to US1/US2).
5. Polish → typecheck/full suites/manual quickstart/`CLAUDE.md` audit.

Each story adds value without breaking the previous one — `scenarioLoader.tsx`
is additive at each step (US1 creates it with the trigger only; US2 adds a
branch; US3 adds a list), never a rewrite.

---

## Completion

38/39 tasks done (T038, manual browser verification, is honestly left
unchecked — see its own note above; every automated equivalent passes).
Full suite green: 137/137 unit tests (15 files, including new
`appState.test.ts`/`manifestReader.test.ts`/`scenarioManager.test.ts` and
the extended `yamlLoader.test.ts`) + 99/99 integration tests (including
the new `scenarioManager.spec.ts`'s 13 tests), `npm run typecheck` clean,
zero regressions across every prior feature's suite.

**Real bugs/gaps found and fixed during implementation** (none caught in
review beforehand — this feature's own contract review only found the
`manifestReader.ts` result-shape bug, already fixed before `tasks.md`):

1. **`playwright.config.js`'s `baseURL`/`webServer` ran on literal
   `'localhost'`**, colliding with `isLocalDeployment()`'s own correctly
   spec'd `hostname === 'localhost'` check (FR-001) — every Playwright
   test would have had the trigger hidden, not just on real production
   `localhost`. Fixed at the test-infrastructure level (`127.0.0.1`,
   explicit `--host` bind) rather than weakening the production check.
2. **`TablePanel.tsx`'s existing fetch effect reset
   `sortState`/`searchTerm`/`currentPage` unconditionally on every
   successful query** — including a scenario-activation-only refetch,
   which is exactly the state loss FR-008 exists to prevent. Fixed with a
   `lastContentKeyRef`-based guard that only resets on a genuine
   `config`/`filters` change, not an `activeScenarioNames`-only one.
3. **`readManifest()` didn't handle js-yaml parsing an unquoted
   `run_date: 2026-06-15` as a native `Date`**, not a string — the exact
   shape `project-docs/SPEC.md`'s own `manifest.yaml` example uses — silently
   dropping the field. Found by this feature's own `manifestReader.test.ts`
   before it ever reached integration testing.
4. **Radix's `Tooltip.Root` throws without a `TooltipProvider` ancestor**
   in the installed `@radix-ui/react-tooltip` version — not assumed
   standalone-safe from general docs. No other production code in this
   app used `Tooltip` before this feature (only `src/demo/
   DesignTokenDemo.tsx`), so this had never been exercised; an uncaught
   instance crashed the whole React tree (no error boundary around
   `Shell`). Fixed with a locally scoped `TooltipProvider`.
5. **A disabled `Button`'s own `disabled:pointer-events-none`** (Tailwind)
   meant it couldn't receive the hover driving its tooltip — the wrapping
   `<span>` (the real `asChild` trigger target) needed its own
   `data-testid` for tests to hover instead.
6. **`page.addInitScript()` only affects the next navigation**, not an
   already-loaded page — a second call mid-test (to simulate picking a
   *second* local folder, US3) silently had no effect. Fixed by holding
   the fake picker's config in a mutable `window` slot, updatable live via
   `page.evaluate()`.
7. A genuine test-authoring bug (not app code): `FakeFile`'s constructor
   parameter `private text: string | null` collided with its own
   `async text()` method (`TS2300: Duplicate identifier`) — caught by
   `npm run typecheck`, which is exactly why it's run after every new file,
   not just at the end.

`plan.md`'s Constitution Check re-confirmed PASS post-implementation (all
9 principles); no Complexity Tracking entries. `research.md`/`data-model.md`/
`contracts/scenario-manager.md`/`quickstart.md` were all corrected in place
to reflect these findings rather than left describing the pre-fix design.
