---

description: "Task list for SankeyPanel"
---

# Tasks: SankeyPanel

**Input**: Design documents from `/specs/008-sankey-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/,
quickstart.md — all present

**Tests**: Included. `research.md`/`quickstart.md`/`contracts/` name specific
required Vitest and Playwright scenarios (not optional coverage), matching
`003`-`007`'s established practice. This feature has real pure logic
(`sankeyGraph.ts`, `sankeyColor.ts`) that is this feature's actual novel
risk (contracts/sankey-panel.md's own two found-and-fixed bugs prove this
wasn't incidental), so Vitest coverage is first-class here, same as 007's
`observablePlotEncoding.ts`.

**Organization**: Tasks are grouped by user story (spec.md's US1-US3).
Unlike `007` (whose Foundational phase was heavy — two shared modules
needed real, if backward-compatible, rewrites before `ObservablePlotPanelConfig`
could even be added), this feature's Foundational phase is light: no
existing shared module is modified (plan.md's Technical Context) — only a
new config type, a new fixture table, and new fixture panels.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files/scopes, no dependency on an
  incomplete task)
- **[Story]**: US1-US3 (spec.md's priorities)
- Most Playwright test tasks target `tests/integration/sankeyPanel.spec.ts`
  — marked `[P]` where the *scenarios themselves* are independent (no shared
  mutable state), even though several land in the same file; write each as
  its own `test()`/`describe()` block.

## Path Conventions

Single-project web frontend (`src/`, `tests/` at repo root), per plan.md's
Project Structure — additive to `001`-`007`.

---

## Phase 1: Setup

**Purpose**: This feature's new runtime and type dependencies.

- [X] T001 Add `d3-sankey` (`^0.12.3`) and `d3-scale-chromatic` (`^3.1.0`)
      to `package.json` `dependencies`, and `@types/d3-sankey` (`^0.12.5`)
      and `@types/d3-scale-chromatic` (`^3.1.0`) to `devDependencies` —
      neither library ships its own TypeScript types, unlike
      `@observablehq/plot` (research.md §1, confirmed directly against both
      real package manifests). Run `npm install`. Confirm `npm run
      typecheck` still passes with no new type errors after install
      (nothing imports either package yet at this point, so this is just
      confirming the install itself didn't break anything)

**Checkpoint**: Dependencies installed, nothing yet imports them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The config type every user story's rendering depends on, plus
fixture data rich enough to exercise all three stories' Playwright coverage.

**🚨 CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Add `SankeyPanelConfig` (`type: 'sankey'`, extends
      `DataBoundPanelConfigBase`, fields `source: string`, `target: string`,
      `value: string`, `color_scheme?: string`) to `src/layout/types.ts` per
      data-model.md; add `SankeyPanelConfig` to the `PanelConfig` union.
      Also correct the stale doc comment above `UnknownPanelConfig` (it
      currently lists `sankey` alongside `flowmap`/`zonemap`/
      `graphic-walker` as "all out of scope for this feature, still
      deferred" — `sankey` is no longer one of those once this type exists,
      per data-model.md's own note)
- [X] T003 [P] Add a new fixture table to `tests/fixtures/generate.py`,
      mirroring `docs/GRAMMAR.md`'s own sankey worked example
      (`tour_mode`/`trip_mode`/`trips` columns, metric name
      `tour_mode_to_trip_mode` matching `docs/GRAMMAR.md`'s
      `sql_fragments` example) — `TOUR_MODE_TO_TRIP_MODE_COLUMNS =
      ["tour_mode", "trip_mode", "trips", "purpose"]`,
      `TOUR_MODE_TO_TRIP_MODE_ROWS`, a small hard-coded set that MUST
      include, at minimum: (a) several `tour_mode == trip_mode` rows (the
      corrected "no mode shift" case, research.md §4 — including at least
      one where that shared value is the *largest* single row, to make the
      namespacing correction's real-world stakes visible in the rendered
      diagram, not just in a unit test); (b) at least one raw mode value
      containing a space (e.g. `"Drive to Transit"`) appearing on both the
      `tour_mode` and `trip_mode` sides across different rows — regression
      coverage, in real fixture data, for the link-key aggregation bug
      found and fixed in `contracts/sankey-panel.md`; (c) at least one row
      with a non-positive `trips` value — the `excludedCount`/`console.warn`
      fixture vehicle (research.md §5); (d) a `purpose` column (`HBW`/`NHB`)
      varied across enough rows that switching the global Trip Purpose
      filter visibly changes which rows are included, for US2's filter-
      reactivity coverage; (e) at least 3 distinct raw values on each of
      the `tour_mode`/`trip_mode` sides, for `sankeyGraph.test.ts`'s own
      node-identity regression test (T005) to have realistic data to model
      against, though that Vitest test constructs its own rows directly
      and does not read this fixture. Write it via `write_parquet(con,
      good_summary / "tour_mode_to_trip_mode.parquet",
      TOUR_MODE_TO_TRIP_MODE_COLUMNS, TOUR_MODE_TO_TRIP_MODE_ROWS)` and add
      `"tour_mode_to_trip_mode.parquet"` to `good_summary`'s
      `write_summary_index(...)` call, alongside the existing entries
- [X] T004 Add a new `row_sankey` layout section to
      `tests/fixtures/dashboard-config/dashboard-1-summary.yaml`, alongside
      the existing `row_kpis`/`row_chart`/`row_table`/`row_markdown`/
      `row_observable_plot` rows (so US3's "mixed panel types on one tab"
      coverage is exercised for free, matching `005`-`007`'s own fixture
      precedent) — three panels, titled to avoid any prefix collision with
      existing panel titles (none currently start with `Sankey` — verified
      against the full existing title list before choosing these):
      1. **"Sankey Tour-to-Trip Mode Consistency"** — `metric:
         tour_mode_to_trip_mode`, `scenario: good_scenario`, `source:
         tour_mode`, `target: trip_mode`, `value: trips`, `color_scheme:
         Tableau10`, `filter: { purpose: $filters.purpose }` — US1/US2's
         primary vehicle (direct-aggregation-match assertion, same-value-row
         correction assertion, named color scheme assertion, filter
         reactivity, `excludedCount` warning, `004` expand/resize
         correctness).
      2. **"Sankey Mode Consistency (No Color Scheme)"** — same
         `metric`/`scenario`/`source`/`target`/`value` as panel 1, but
         `color_scheme` omitted — the token-derived-fallback-palette
         vehicle (research.md §6, spec.md US1 Acceptance Scenario 3).
      3. **"Sankey Broken Panel (intentional)"** — `metric:
         nonexistent_sankey_metric`, `source: a`, `target: b`, `value: c` —
         the error-state fixture, same convention as `005`-`007`'s own
         "Broken Panel (intentional)" entries.

      Verify the file still parses via a quick `js-yaml` load, same check
      used for prior features' fixture edits. Depends on T002 (needs the
      new type to exist for authoring correctness, though YAML itself is
      untyped) and T003 (needs `tour_mode_to_trip_mode.parquet` published)

**Checkpoint**: Config type exists and is verified — `npm run typecheck`
clean; fixture data (one new Parquet table, three new panels covering every
story) ready. Nothing sankey-specific renders yet (no component, no
registry entry).

---

## Phase 3: User Story 1 - Author renders a two-column flow metric as a Sankey diagram (Priority: P1) 🎯 MVP

**Goal**: A `type: sankey` panel renders correctly (nodes/links matching a
direct aggregation of the query result, same-value rows correctly shown as
real links rather than excluded), colors per `color_scheme` or the
token-derived default, and shows the shared empty/error states.

**Independent Test**: Configure a `sankey` panel with `source`/`target`/
`value` bound to fixture columns, load the dashboard tab, confirm the
rendered nodes/links match a direct `GROUP BY source, target`/`SUM(value)`
aggregation of the same data — including that a same-value row produces a
real link between two distinct nodes, not an excluded one.

### Tests for User Story 1

> Write these first; they should fail until T011-T015 land.

- [X] T005 [P] [US1] Vitest unit tests in a new `tests/unit/sankeyGraph.test.ts`
      for `buildFlowGraph`/`layoutFlowGraph` (`src/panels/sankeyGraph.ts`,
      contracts/sankey-panel.md): (1) a same-value row (`source === target`
      raw value) produces two distinct nodes with the correct `side` on
      each, not one self-referencing node (research.md §4's namespacing —
      the single most important behavior this module has to get right); (2)
      duplicate `(source, target)` pairs are summed into one link, not
      duplicated; (3) non-positive-`value` rows are excluded and
      `excludedCount` reports the correct count; (4) **regression coverage
      for the link-key aggregation bug found and fixed in
      `contracts/sankey-panel.md`**: rows spanning 3+ distinct nodes on the
      `source` side and 3+ on the `target` side, including at least one raw
      source/target value containing a space (e.g. `"Drive to Transit"`),
      asserting each resulting link's `sourceId`/`targetId` *exactly* match
      the correct originating node ids — not just that aggregate link
      `value`s are correct, since a misaligned-but-numerically-correct link
      would not be caught by a value-only assertion; (5) `layoutFlowGraph`
      throws a real `Error` for a graph deliberately constructed to be
      cyclic (bypassing `buildFlowGraph`'s own namespacing, to prove the
      defensive catch has something real to catch — research.md §4)
- [X] T006 [P] [US1] Vitest unit tests in a new `tests/unit/sankeyColor.test.ts`
      for `resolveNamedColorScheme` (`src/panels/sankeyColor.ts`,
      contracts/sankey-panel.md): `resolveNamedColorScheme('Tableau10')`
      returns the real, correct 10-color `d3-scale-chromatic` array; an
      omitted or unrecognized name returns `undefined` (the caller's
      fallback-to-token-default signal)
- [X] T007 [P] [US1] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      the "Sankey Tour-to-Trip Mode Consistency" panel's rendered nodes/links
      match a direct `GROUP BY tour_mode, trip_mode`/`SUM(trips)`
      aggregation of `good_scenario__tour_mode_to_trip_mode` (SC-001) —
      including confirming a same-value row (e.g. `tour_mode == trip_mode`)
      renders as two distinct visible nodes joined by a real link, not a
      missing/excluded row (the corrected self-loop reasoning, research.md
      §4)
- [X] T008 [P] [US1] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      the "Sankey Tour-to-Trip Mode Consistency" panel (`color_scheme:
      Tableau10`) shows node/link colors matching `d3-scale-chromatic`'s
      real `schemeTableau10` hex values on rendered `fill`/`stroke`
      attributes; the "Sankey Mode Consistency (No Color Scheme)" panel
      shows colors matching the token-derived fallback palette instead
      (research.md §6) — both checked against real rendered attribute
      values, not just "some color is present"
- [X] T009 [P] [US1] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      the fixture's non-positive-`trips` row is excluded from the "Sankey
      Tour-to-Trip Mode Consistency" panel's rendered diagram, and loading
      it triggers exactly one `console.warn` mentioning the excluded row
      count — captured via Playwright's `page.on('console', ...)`, not just
      inferred from the diagram's absence of that link (research.md §5)
- [X] T010 [P] [US1] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      the "Sankey Broken Panel (intentional)" panel renders
      `PanelErrorState`, not an unhandled exception (SC-004)

### Implementation for User Story 1

- [X] T011 [P] [US1] Implement `src/panels/sankeyGraph.ts` per
      contracts/sankey-panel.md: pure, DOM-free — `buildFlowGraph(config,
      rows)` (side-namespaced node identity, per-pair value aggregation
      keyed correctly per the fixed contract — never reconstructing
      `sourceId`/`targetId` by splitting a joined key, T005's regression
      test proves this) and `layoutFlowGraph(graph, width, height)`
      (`d3-sankey`'s own layout call, throwing its real `Error` on a cyclic
      graph, caught by the caller not here). Depends on T002
- [X] T012 [P] [US1] Implement `src/panels/sankeyColor.ts` per
      contracts/sankey-panel.md: pure — `resolveNamedColorScheme(colorScheme)`
      mapping a small set of well-known `d3-scale-chromatic` categorical
      scheme names (at minimum `Tableau10`, per `docs/GRAMMAR.md`'s one
      documented example) to their real color arrays, `undefined` for an
      omitted/unrecognized name. Depends on T002
- [X] T013 [US1] Implement `SankeyPanel.tsx`'s data-fetch effect per
      contracts/sankey-panel.md: `useFilterState` fed by
      `extractGlobalFilterIds(config.filter)` (the same existing helper
      007 introduced — no sankey-specific filter concept, Grammar findings
      #4/#5); `buildPanelQuery`/`query` reused unchanged; `'loading' |
      'ready' | 'empty' | 'error'` status state machine identical in shape
      to every prior data-bound panel type's. No `buildFlowGraph`/
      `layoutFlowGraph` call in this effect — it only resolves
      `rows`/`status`. Depends on T011
- [X] T014 [US1] Implement `SankeyPanel.tsx`'s render-and-swap effect per
      contracts/sankey-panel.md **exactly as fixed, not as originally
      drafted**: builds the `FlowGraph` via `buildFlowGraph`, emits the
      `console.warn` when `excludedCount > 0`, then on both the initial
      render and every `ResizeObserver`-observed container resize, calls
      `layoutFlowGraph` with the container's current pixel size and
      builds/replaces real `<svg><rect>`/`<path>` DOM from its output,
      colored via `resolveNamedColorScheme(config.color_scheme)` or the
      token-derived `FALLBACK_TOKEN_VARS` default read via
      `getComputedStyle` against the mounted container (research.md §6).
      **The last-rendered-size guard (`lastWidth`/`lastHeight`) MUST be
      declared as plain local variables inside this effect's body, not a
      component-level `useRef`** — a `useRef` version was drafted, found to
      silently break filter-driven re-renders at the same container size,
      and fixed; T018 (US2) is this bug's regression test, so reintroducing
      it here would be caught, but do not reintroduce it. Wrap the
      `layoutFlowGraph` call in `try/catch`, routing a thrown cyclic-graph
      `Error` to the shared error state (defensive backstop, research.md
      §4). Depends on T012, T013
- [X] T015 [US1] Register `'sankey': SankeyPanel` in `src/panels/registry.tsx`.
      Depends on T014

**Checkpoint**: User Story 1 is fully functional and independently
testable — a `sankey` panel queries, derives a correctly-namespaced
node-link graph, renders it via `d3-sankey`'s layout, colors it per
`color_scheme` or the token-derived default, excludes non-positive-value
rows with a console signal, and shows the shared empty/error states.

---

## Phase 4: User Story 2 - Sankey panel responds to global filters like every other panel type (Priority: P2)

**Goal**: Changing a bound global filter re-queries and re-renders the
diagram to reflect only matching rows, without a full page reload — and
does so correctly even when the container's on-screen size hasn't changed.

**Independent Test**: Change a bound global filter's value while a `sankey`
panel is visible and confirm its diagram updates to reflect only matching
rows, including the zero-match case, and including the no-resize case.

**Note**: Like `007`'s US2 building on US1's pipeline, this story adds no
new implementation beyond what T013/T014 already provide — `useFilterState`
already drives a re-fetch, and the render-and-swap effect already rebuilds
on every `rows` change. This story's own value is verifying that actually
holds, in particular for the no-resize case the fixed resize guard exists
to protect.

### Tests for User Story 2

- [X] T016 [P] [US2] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      changing the global Trip Purpose filter re-queries and re-renders the
      "Sankey Tour-to-Trip Mode Consistency" panel's diagram to reflect only
      matching rows, without a full page reload (SC-002)
- [X] T017 [P] [US2] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      a filter value matching zero rows shows the panel's `PanelEmptyState`
      (US2 Acceptance Scenario 2)
- [X] T018 [P] [US2] Playwright test in `tests/integration/sankeyPanel.spec.ts`
      — **regression coverage for the `useRef`-vs-local-variable resize-guard
      bug found and fixed in `contracts/sankey-panel.md`**: change the
      global Trip Purpose filter's value while the panel's container size
      stays fixed (no viewport resize, no `004` expand/collapse), and
      confirm the diagram's *rendered SVG content itself* changes (different
      node labels and/or link `path`/`width` attribute values before vs.
      after) — not merely that a new query fired. A guard that persists
      across the component's lifetime would pass a weaker "a query re-ran"
      assertion while still silently failing to redraw; this test inspects
      the rendered SVG directly

### Implementation for User Story 2

*No new implementation tasks* — covered by T013 (fetch effect re-runs on
`filters` change) and T014 (render-and-swap effect rebuilds on `rows`
change, with the fixed per-effect-instance resize guard) above.

**Checkpoint**: User Stories 1 and 2 both hold, independently and
together — filter reactivity works correctly, including the no-resize case
the fixed guard specifically protects.

---

## Phase 5: User Story 3 - Sankey panel behaves consistently with the rest of the panel registry (Priority: P3)

**Goal**: The `sankey` panel type integrates into the existing registry/
layout grid/panel-card chrome and `004`'s expand-to-dialog mechanism with no
special-casing, and its diagram resizes correctly under both the dialog
transition and a plain browser window resize.

**Independent Test**: Expand and collapse a `sankey` panel via its `004`
dialog trigger, confirm the diagram survives correctly proportioned on both
ends with no duplicate query; resize the browser window and confirm the
diagram relayouts without distortion; load a tab mixing `sankey` with every
other built panel type and confirm standard panel-card chrome.

**Note**: Like `007`'s US3, this story is almost entirely test-only —
T011-T015's implementation already provides everything this story needs
via `004`'s existing generic mechanism and T014's resize handling; no
sankey-specific panel-card/registry/dialog code exists to write beyond what
US1 already built.

### Tests for User Story 3

- [X] T019 [P] [US3] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      expanding the "Sankey Tour-to-Trip Mode Consistency" panel via `004`'s
      dialog produces a correctly proportioned diagram on both ends of the
      transition, and `window.__wftdm!.__debugQueryLog()` shows **zero**
      additional query attributable to the panel's own metric fired solely
      by that transition — same `__debugQueryLog` pattern
      `panelExpand.spec.ts`/`observablePlotPanel.spec.ts` already use
      (FR-008, SC-003)
- [X] T020 [P] [US3] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      collapsing the dialog back shows the inline card's diagram again,
      correctly sized, with focus returned to the trigger button
- [X] T021 [P] [US3] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      resizing the browser window itself (not just the `004` dialog
      transition) relayouts the panel's diagram without distortion or a
      required manual refresh (FR-007's window-resize half, distinct from
      T019's dialog-transition half)
- [X] T022 [P] [US3] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      a tab mixing `sankey` panels with `valuebox`/`plotly`/`table`/
      `markdown`/`observable-plot` panels (this fixture file's full row
      set) renders all of them without error, and a `sankey` panel's card
      has the same title bar and expand trigger every other panel type has
      (SC-005)
- [X] T023 [P] [US3] Playwright test in `tests/integration/sankeyPanel.spec.ts`:
      a `sankey` panel shows the same inline `animate-pulse` skeleton
      convention `PlotlyPanel`/`ObservablePlotPanel` already use while its
      query is in flight — not a new shared loading component

### Implementation for User Story 3

*No new implementation tasks* — covered by T011-T015 above (see Note).

**Checkpoint**: All three user stories are independently functional and
verified together — the full `docs/GRAMMAR.md` `type: sankey` grammar this
feature scoped itself to is implemented end to end, correctly, and
consistently with every other panel type. This completes the originally-
listed six-panel-type set.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 [P] Run quickstart.md's full validation pass end to end — the
      automated `npm run test:integration -- sankeyPanel` run, the unit
      test run, plus every manual verification step (resize/expand check,
      console.warn check)
- [X] T025 [P] Run the full Playwright suite (`npx playwright test
      --workers=1 --reporter=list`, this project's established serial-worker
      convention) and confirm zero regressions in `boot.spec.ts`/
      `dashboardShell.spec.ts`/`panelExpand.spec.ts`/`tablePanel.spec.ts`/
      `markdownPanel.spec.ts`/`observablePlotPanel.spec.ts` — T003/T004's
      fixture changes (a new Parquet table plus new fixture rows in a file
      those existing suites already read from) are this feature's one real
      cross-feature blast-radius vector, worth confirming directly rather
      than assumed harmless (the exact same reasoning 007's T034 documented
      for its own fixture changes)
- [X] T026 [P] Run the full Vitest suite (`npm run test:unit`) and confirm
      zero regressions
- [X] T027 [P] Re-confirm plan.md's Constitution Check against what was
      actually built — expected to still read PASS across all nine
      principles with no new Complexity Tracking entries; update the note
      only if implementation revealed an actual deviation
- [X] T028 [P] Update `CLAUDE.md`'s Implementation order section (item 8):
      mark `SankeyPanel` ✅ done (`008-sankey-panel`) — this completes the
      originally-listed six-panel-type set, so item 8's list should read as
      fully done, no remaining ❌ entries

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001, sequencing only). T002
  and T003 are independent of each other (different files) and can proceed
  in parallel; T004 depends on both (needs the type for authoring
  correctness and the Parquet file for the metric to exist) — **BLOCKS all
  user stories**.
- **User Stories (Phase 3-5)**: All depend on Foundational completing. US1's
  implementation tasks (T011-T015) are the only tasks that write the actual
  rendering pipeline; US2 and US3 are both test-only, verifying properties
  US1 already provides — the same pattern 007's US3 (and 006's later
  stories) established.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- US1 tests (T005-T010) are written first; expected to fail until
  T011-T015 land.
- US2 tests (T016-T018) are written against already-complete US1
  implementation — no separate implementation step for this story to wait
  on.
- US3 tests (T019-T023) are likewise written against already-complete US1
  implementation.

### Parallel Opportunities

- T002 and T003 (Foundational) can run in parallel — different files.
- Within US1, all test tasks (T005-T010) marked `[P]` can be authored in
  parallel once Foundational (through T004) is complete; T011 and T012
  (Implementation) can run in parallel — different files, both depend only
  on T002.
- Within US2, all test tasks (T016-T018) marked `[P]` can be authored in
  parallel once US1's implementation (T011-T015) exists.
- T019-T023 (US3) can be authored in parallel with each other, and with
  US2's tests, once T011-T015 land.
- T024-T028 (Polish) can run in parallel with each other.

---

## Parallel Example: User Story 1

```bash
# Once Phase 2 (T001-T004) is complete, author all US1 test scenarios together:
Task: "Vitest: buildFlowGraph namespaces same-value rows into two distinct nodes in tests/unit/sankeyGraph.test.ts"
Task: "Vitest: buildFlowGraph link-key aggregation regression (multi-word values, 3+ nodes/side) in tests/unit/sankeyGraph.test.ts"
Task: "Vitest: layoutFlowGraph throws on a deliberately cyclic graph in tests/unit/sankeyGraph.test.ts"
Task: "Vitest: resolveNamedColorScheme resolves Tableau10 / falls back to undefined in tests/unit/sankeyColor.test.ts"
Task: "Playwright: rendered nodes/links match direct aggregation, same-value rows render as real links in tests/integration/sankeyPanel.spec.ts"
Task: "Playwright: color_scheme vs. token-fallback colors in tests/integration/sankeyPanel.spec.ts"
Task: "Playwright: non-positive-value exclusion + console.warn in tests/integration/sankeyPanel.spec.ts"
Task: "Playwright: broken panel renders PanelErrorState in tests/integration/sankeyPanel.spec.ts"

# Then, once tests exist and fail as expected:
Task: "Implement sankeyGraph.ts (buildFlowGraph, layoutFlowGraph)"
Task: "Implement sankeyColor.ts (resolveNamedColorScheme)"
Task: "Implement SankeyPanel.tsx's data-fetch effect"
Task: "Implement SankeyPanel.tsx's render-and-swap effect + fixed per-effect resize guard"
Task: "Register 'sankey': SankeyPanel in src/panels/registry.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational — config type +
   fixture data).
2. Complete Phase 3 (US1) — a `sankey` panel renders correctly, colored
   correctly, with the shared empty/error states.
3. **STOP and VALIDATE**: run T005-T010 and confirm all pass independently
   of US2/US3.
4. Deploy/demo if ready.

### Incremental Delivery

1. Complete Setup + Foundational → foundation ready.
2. Add User Story 1 → test independently → deploy/demo (MVP!).
3. Add User Story 2 → test independently → deploy/demo (in particular:
   confirm T018's no-resize regression test actually exercises the fixed
   guard).
4. Add User Story 3 → test independently → deploy/demo.
5. Each story adds verification without breaking previous stories — US2/US3
   add no new production code, only tests, over US1's implementation.

### Solo Sequential Strategy

Given this feature's small Foundational phase and US2/US3 being test-only,
a single implementer can reasonably work Phase 1 → Phase 2 → Phase 3 (tests
then implementation) → Phase 4 → Phase 5 → Phase 6 straight through, the
same shape 006's later stories were completed in.

---

## Completion

All 28 tasks done. Full suite green: 115 unit tests (12 files — 10
pre-existing + this feature's new `sankeyGraph.test.ts`/`sankeyColor.test.ts`,
all existing cases unchanged) + 87 integration tests (`boot`/
`dashboardShell`/`panelExpand`/`tablePanel`/`markdownPanel`/
`observablePlotPanel` + this feature's 11 new `sankeyPanel.spec.ts` tests),
run serially — zero regressions in any prior feature's coverage. `npm run
typecheck` clean throughout, including after every phase.

**Notable, different from 005/006/007: no NEW real bug was found during
implementation itself.** The two real bugs this feature did find (the
link-key round-trip in `buildFlowGraph`, and the `useRef`-vs-local-variable
resize guard) were both caught during the contract-review step, before any
implementation code was written — `contracts/sankey-panel.md`'s "full,
non-illustrative bodies" requirement (mirroring 007's precedent for
`extractGlobalFilterIds`/`PanelLocalInput`) meant these were real,
executable-shaped code the user could actually read and catch, not
illustrative sketches deferred to implementation-time discovery. Both bug
fixes carried through into implementation verbatim, and both requested
regression tests (T005's node-identity assertion, T018's no-resize
content-change assertion) pass against the real, non-buggy implementation.

**One real technical finding surfaced during implementation, not anticipated
in contracts/sankey-panel.md's own sketch**: `@types/d3-sankey`'s generic
parameters (`N`, `L`) type only the "extra" properties beyond
`SankeyNodeMinimal`/`SankeyLinkMinimal`'s own required/computed fields —
getting `layoutFlowGraph`'s generics right required reading the real
`.d.ts` file directly (not guessing), and the final implementation uses a
small number of `as unknown as X` casts at the d3-sankey boundary,
matching `ObservablePlotPanel.tsx`'s own established precedent for
exactly this class of third-party-typing friction (`as unknown as
Plot.Markish`) rather than fighting the generic system further. Not a bug
— d3-sankey's real behavior matched research.md's predictions exactly
(confirmed empirically: `layoutFlowGraph`'s own Vitest test throws the
real `Error("circular link")` on a deliberately cyclic graph, exactly as
research.md §4 predicted from reading `d3-sankey`'s source) — purely a
TypeScript ergonomics note for future panel types with similarly
loosely-typed third-party layout libraries.
