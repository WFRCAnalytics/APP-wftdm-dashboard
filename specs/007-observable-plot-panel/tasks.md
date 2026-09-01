---

description: "Task list for ObservablePlotPanel"
---

# Tasks: ObservablePlotPanel

**Input**: Design documents from `/specs/007-observable-plot-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/,
quickstart.md — all present

**Tests**: Included. `research.md`/`quickstart.md`/`contracts/` name specific
required Vitest and Playwright scenarios (not optional coverage), matching
`003`-`006`'s established practice. Unlike `006-markdown-panel` (no Vitest
suite — nothing pure to extract), this feature has real pure logic
(`observablePlotEncoding.ts`, `extractGlobalFilterIds`) and two shared,
already-tested modules being modified (`panelQuery.ts`, `sqlExpander.ts`), so
Vitest coverage is a first-class part of this task list, not skipped.

**Organization**: Tasks are grouped by user story (spec.md's US1-US3), after
a Foundational phase that is deliberately heavier than `005`/`006`'s —
research.md §1/§2 found that `filter:`'s common-key shape and
`sqlExpander.ts`'s placeholder dispatch both needed real (if
backward-compatible) changes before `ObservablePlotPanelConfig` could even be
added, not just a bolt-on field the way `006`'s `MarkdownPanelConfig` was.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files/scopes, no dependency on an
  incomplete task)
- **[Story]**: US1-US3 (spec.md's priorities)
- Most Playwright test tasks target `tests/integration/observablePlotPanel.spec.ts`
  — marked `[P]` where the *scenarios themselves* are independent (no shared
  mutable state), even though several land in the same file; write each as
  its own `test()`/`describe()` block.

## Path Conventions

Single-project web frontend (`src/`, `tests/` at repo root), per plan.md's
Project Structure — additive to `001`-`006`.

---

## Phase 1: Setup

**Purpose**: This feature's only new runtime dependency.

- [x] T001 Add `@observablehq/plot` (^0.6.17) to `package.json` `dependencies`
      and run `npm install`. Ships its own TypeScript types (plan.md's
      Technical Context, research.md §5) — no `@types/@observablehq/plot` to
      add alongside it. `d3` arrives transitively; do not add it to
      `package.json` directly. Confirm `npm run typecheck` still passes with
      no new type errors after install (nothing imports the package yet at
      this point, so this is just confirming the install itself didn't break
      anything)

**Checkpoint**: Dependency installed, nothing yet imports it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared-module changes research.md §1/§2 found necessary
before `ObservablePlotPanelConfig` can exist at all, plus fixture data rich
enough to exercise all three stories' Playwright coverage.

**🚨 CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Widen `DataBoundPanelConfigBase.filter` in `src/layout/types.ts`
      from `string | undefined` to `string | Record<string, string> |
      undefined`, per data-model.md/research.md §1. This is not new grammar —
      `docs/GRAMMAR.md`'s common-keys table already documented both the bare
      `$ref` string form and an `inline` map form for `filter:`;
      `observable-plot` is simply the first panel type to use the map form.
      No other field on `DataBoundPanelConfigBase` changes
- [x] T003 Rewrite `buildPanelQuery` in `src/panels/panelQuery.ts`
      (research.md §1) to normalize `config.filter` in either shape into a
      list of `[column, placeholderString]` pairs before building the SQL
      template: `undefined` → `[]` (unchanged); a string matching
      `^\$filters\.([A-Za-z0-9_]+)$` → `[[id, filter]]` (today's exact
      behavior — column assumed equal to id); a non-matching literal string
      → `[]` (unchanged); a `Record<string, string>` → `Object.entries(...)`
      verbatim, one `AND "<column>" = '<placeholder>'` line per entry. Must
      not know or care whether a given placeholder string is `$filters.` or
      `$inputs.` — passes it through literally; `sqlExpander.ts` (T006)
      dispatches on kind. Depends on T002
- [x] T004 **Checkpoint**: run `npm run typecheck` and `npx vitest run
      tests/unit/panelQuery.test.ts` and confirm both are clean —
      `tests/unit/panelQuery.test.ts`'s existing assertions (all six `describe('buildPanelQuery', ...)`/
      `describe('resolveActiveScenarios', ...)` cases) must pass **unchanged,
      byte-for-byte**, proving T003's rewrite preserves
      `ValueBoxPanel.tsx`/`PlotlyPanel.tsx`/`TablePanel.tsx`'s existing
      single-string `filter:` behavior exactly. Do not proceed to T008 until
      this is clean. Depends on T003
- [x] T005 [P] Add a new export, `extractGlobalFilterIds(filter:
      DataBoundPanelConfigBase['filter']): FilterId[]`, to
      `src/panels/panelQuery.ts` per contracts/observable-plot-panel.md:
      extracts every `$filters.<id>` referenced (in either `filter:` shape),
      deliberately excluding any `$inputs.<id>` entries — these must never
      reach `useFilterState` (research.md §2/§3, FR-005). Add Vitest cases to
      `tests/unit/panelQuery.test.ts` covering: a bare `$filters.x` string, a
      map with only `$filters.` entries, a map mixing `$filters.` and
      `$inputs.` entries (only the `$filters.` id(s) returned), `undefined`,
      and a non-placeholder literal string (empty result). Depends on T004
      (checkpoint clean first)
- [x] T006 [P] Extend `src/services/sqlExpander.ts` per research.md §2: add
      `inputs` to `PLACEHOLDER_RE`'s kind alternation and the dispatch
      `switch`; add a new optional 5th parameter to `expand()`, `inputState?:
      FilterStateLike` (reuses the existing duck-typed interface — no new
      type), with a new `expandInputs(inputState, name)` mirroring
      `expandFilter`'s shape (throws via the existing `missing()` helper if
      `inputState` is undefined but an `$inputs.` placeholder is present).
      Extend the existing 'all'-value line-drop pass (currently
      `$filters.`-only) to also recognize `$inputs.` lines, for consistency
      with `$filters.`'s treatment (research.md §2). Add Vitest cases to
      `tests/unit/sqlExpander.test.ts`: an `$inputs.<id>` placeholder
      resolves via the new `inputState` param; an unresolved `$inputs.`
      reference with no `inputState` throws the same `missing()` error shape
      an unresolved `$filters.` reference already does; an `$inputs.` line
      with value `'all'` is dropped, mirroring `$filters.`'s existing case.
      Existing callers (`ValueBoxPanel`/`PlotlyPanel`/`TablePanel`) pass no
      5th argument and are unaffected — depends on T001 only in the sense of
      sequencing (no actual code dependency)
- [x] T007 **Checkpoint**: run `npm run typecheck` and `npx vitest run
      tests/unit/sqlExpander.test.ts tests/unit/panelQuery.test.ts` and
      confirm both are clean — every existing `sqlExpander.test.ts` case
      (mappings/bins/sql_fragments/filters/scenario expansion) must still
      pass unchanged, alongside T005/T006's new cases. Do not proceed to T008
      until this is clean. Depends on T005, T006
- [x] T008 [P] Add `ObservablePlotInputConfig` (`id`/`label`/`type: 'select' |
      'multiselect' | 'range'`/`column`/`default`) and
      `ObservablePlotPanelConfig` (`type: 'observable-plot'`, extends
      `DataBoundPanelConfigBase`, `mark`/`x?`/`y?`/`fill?`/`stroke?`/
      `facet_x?`/`facet_y?`/`tip?`/`grid?`/`inputs?:
      ObservablePlotInputConfig[]`) to `src/layout/types.ts` per
      data-model.md; add `ObservablePlotPanelConfig` to the `PanelConfig`
      union. Depends on T004 and T007 (both checkpoints must be clean first)
- [x] T009 [P] Add a new fixture table to `tests/fixtures/generate.py`,
      mirroring `docs/GRAMMAR.md`'s own Trip Length Frequency Distribution
      worked example: `TRIP_DESTINATION_DIST_COLUMNS = ["distance_bin",
      "trips", "purpose", "mode"]`, `TRIP_DESTINATION_DIST_ROWS` — a small
      hard-coded set spanning `purpose` in `{HBW, NHB}`, `mode` in `{SOV,
      Transit}`, `distance_bin` (integer, 1-5) — 20 rows. Write it via
      `write_parquet(con, good_summary / "trip_destination_dist.parquet",
      TRIP_DESTINATION_DIST_COLUMNS, TRIP_DESTINATION_DIST_ROWS)` and add
      `"trip_destination_dist.parquet"` to `good_summary`'s
      `write_summary_index(...)` call, alongside the existing
      `summary_kpis.parquet`/`trip_mode_share.parquet`/`screenlines.parquet`
      entries. `trip_mode_share` (already published) needs no changes —
      reused as-is for the `barY` fixture panel below
- [x] T010 Add a new `row_observable_plot` layout section to
      `tests/fixtures/dashboard-config/dashboard-1-summary.yaml`, alongside
      the existing `row_kpis`/`row_chart`/`row_table`/`row_markdown` rows (so
      US3's "mixed panel types on one tab" coverage is exercised for free,
      matching `005`/`006`'s own fixture precedent) — six panels, each
      exercising a distinct, non-overlapping property:
      1. **"Mode Share by Purpose (Bar)"** — `mark: barY`, `x: purpose`, `y:
         share`, `fill: mode`, `metric: trip_mode_share`, `scenario:
         good_scenario`, `filter: { purpose: $filters.purpose }` — US1's
         primary vehicle (direct-query-match assertion, global filter
         reactivity, expand/resize correctness).
      2. **"Trip Length Frequency Distribution"** — `mark: lineY`, `x:
         distance_bin`, `y: trips`, `stroke: purpose`, `metric:
         trip_destination_dist`, `scenario: good_scenario`, `inputs: [{id:
         mode_select, label: Mode, type: select, column: mode, default:
         SOV}]`, `filter: { purpose: $filters.purpose, mode:
         $inputs.mode_select }` — reuses `docs/GRAMMAR.md`'s own example
         almost verbatim; second mark type + `select` input coverage.
      3. **"Mode Share by Purpose (Multiselect Filter)"** — `mark: barY`, `x:
         purpose`, `y: share`, `metric: trip_mode_share`, `scenario:
         good_scenario`, `inputs: [{id: mode_select, label: Mode, type:
         multiselect, column: mode}]`, `filter: { purpose: $filters.purpose,
         mode: $inputs.mode_select }` — **deliberately reuses the same input
         `id` (`mode_select`) as panel 2**, to exercise cross-panel isolation
         under a genuine id collision (spec.md's named edge case); also
         `multiselect` "any of" coverage.
      4. **"Trip Length by Distance Bin (Range Filter)"** — `mark: barY`,
         `x: mode`, `y: trips`, `metric: trip_destination_dist`, `scenario:
         good_scenario`, `inputs: [{id: distance_picker, label: Distance
         Bin, type: range, column: distance_bin, default: 99}]`, `filter: {
         distance_bin: $inputs.distance_picker }` — `default: 99` is
         deliberately outside the column's real `[1, 5]` range, so this
         panel's own initial render directly exercises the browser's native
         `<input type="range">` clamping behavior (research.md §9) rather
         than needing a second range fixture just for that case.
      5. **"Mode Share (Mismatched Default, intentional)"** — `mark: barY`,
         `x: purpose`, `y: share`, `metric: trip_mode_share`, `scenario:
         good_scenario`, `inputs: [{id: mode_filter_bad, label: Mode, type:
         select, column: mode, default: Bike}]`, `filter: { mode:
         $inputs.mode_filter_bad }` — `Bike` matches no row in
         `trip_mode_share`, so this legitimately produces a zero-row result
         on load: doubles as the empty-state fixture (US1) and the
         mismatched-`select`-default fixture (US2, research.md §9).
      6. **"Observable Plot Broken Panel (intentional)"** — `metric:
         nonexistent_observable_metric`, `mark: barY`, `x: a`, `y: b` — the
         error-state fixture, same convention as `005`/`006`'s own "Broken
         Panel (intentional)" entries.

      Verify the file still parses via a quick `js-yaml` load, same check
      used for prior features' fixture edits. Depends on T008 (needs the new
      types to exist for authoring correctness, though YAML itself is
      untyped) and T009 (needs `trip_destination_dist.parquet` published)

**Checkpoint**: Shared infrastructure exists and is verified — existing
panel types unaffected (T004, T007), config types and fixture data (two
tables, six panels covering every story) ready. Nothing observable-plot-
specific renders yet (no component, no registry entry).

---

## Phase 3: User Story 1 - Author renders a metric as a reactive Observable Plot chart (Priority: P1) 🎯 MVP

**Goal**: A `type: observable-plot` panel renders correctly via
`@observablehq/plot`, reacts to the global sidebar filter, resizes correctly
across `004`'s expand/collapse transition with zero extra query, and shows
the shared empty/error states.

**Independent Test**: Configure an `observable-plot` panel with `mark:
barY`/`x`/`y` bound to fixture columns and a global filter, load the
dashboard tab, confirm the rendered chart matches a direct query and updates
when the filter changes.

### Tests for User Story 1

> Write these first; they should fail until T017-T020 land.

- [x] T011 [P] [US1] Vitest unit tests in a new
      `tests/unit/observablePlotEncoding.test.ts`: `resolveObservablePlotEncoding`
      copies `x`/`y`/`fill`/`stroke` through as literal column names (NOT
      `$metric.`-prefixed, research.md §4); `facet_x`/`facet_y` map to
      `fx`/`fy`; `tip`/`grid` pass through only when set; omitted fields
      produce no corresponding key (so Plot's own per-mark defaults apply)
- [x] T012 [P] [US1] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: the "Mode Share by
      Purpose (Bar)" fixture panel's rendered bar marks match a direct SQL
      query against `good_scenario__trip_mode_share` (SC-001)
- [x] T013 [P] [US1] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: the "Trip Length
      Frequency Distribution" fixture panel (`mark: lineY`) renders real
      line-mark DOM elements — a second, structurally different mark type
      resolves correctly (SC-001)
- [x] T014 [P] [US1] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: changing the global
      Trip Purpose filter re-queries and re-renders the "Mode Share by
      Purpose (Bar)" panel's chart, while a sibling `plotly`/`observable-plot`
      panel bound to a *different* filter is unaffected (SC-002)
- [x] T015 [P] [US1] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: expanding the "Mode
      Share by Purpose (Bar)" panel via `004`'s dialog produces a correctly
      proportioned chart on both ends of the transition, and
      `window.__wftdm!.__debugQueryLog()` shows **zero** additional query
      attributable to the panel's own metric fired solely by that transition
      — same `__debugQueryLog` pattern `panelExpand.spec.ts`/
      `tablePanel.spec.ts` already use (FR-007/FR-009, SC-003)
- [x] T016 [P] [US1] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: the "Mode Share
      (Mismatched Default, intentional)" panel renders `PanelEmptyState` (not
      a blank chart or a crash) on its zero-row initial load; the "Observable
      Plot Broken Panel (intentional)" panel renders `PanelErrorState`
      (SC-004)

### Implementation for User Story 1

- [x] T017 [US1] Implement `src/panels/observablePlotEncoding.ts` per
      contracts/observable-plot-panel.md: pure, DOM-free —
      `resolveObservablePlotEncoding(config, rows)` returns `{markName, data,
      options, plotOptions}`. Never imports `@observablehq/plot` at runtime
      (only its types, if needed at all) and never calls a DOM API
      (research.md §4/§6). Depends on T008
- [x] T018 [US1] Implement `src/panels/ObservablePlotPanel.tsx`'s data-fetch
      effect per contracts/observable-plot-panel.md: `useFilterState` fed by
      `extractGlobalFilterIds(config.filter)` (not the raw `config.filter`);
      component-local `useState` for `inputValues` (empty object when
      `config.inputs` is unset); an `inputState = {get: (id) =>
      inputValues[id]}` wrapper passed as `sqlExpander.expand()`'s new 5th
      argument; `buildPanelQuery`/`resolveActiveScenarios` reused unchanged;
      `'loading'|'ready'|'empty'|'error'` status state machine identical in
      shape to `PlotlyPanel.tsx`'s (research.md §7). No `Plot.plot()` call in
      this effect — it only resolves `rows`/`status`. Depends on T005, T006,
      T017
- [x] T019 [US1] Implement `ObservablePlotPanel.tsx`'s render-and-swap effect
      per contracts/observable-plot-panel.md and **research.md §5b
      specifically**: a synchronous initial `render()` call followed by
      `observer.observe(el)`, guarded by a last-rendered-`{width,height}`
      comparison so `ResizeObserver`'s spec-guaranteed initial callback (which
      fires unconditionally, even with no size change) is a no-op instead of
      a duplicate `Plot.plot()` rebuild-and-swap. Each actual rebuild removes
      the previous returned element (`plotElementRef.current.remove()`) and
      appends the new one — `Plot.plot()` has no in-place update API
      (research.md §5). Tag the container with a `data-render-count`
      attribute incremented once per *actual* rebuild (past the guard) — the
      instrumentation T028 asserts against. Unmount-only teardown effect
      removes the current plot element. Depends on T018
- [x] T020 [US1] Register `'observable-plot': ObservablePlotPanel` in
      `src/panels/registry.tsx`. Depends on T019

**Checkpoint**: User Story 1 is fully functional and independently
testable — an `observable-plot` panel queries, renders at least two mark
types correctly, reacts to global filters, resizes correctly through `004`'s
dialog with zero extra query, and shows the shared empty/error states.

---

## Phase 4: User Story 2 - Author adds panel-local reactive input controls (Priority: P2)

**Goal**: `inputs:` controls (`select`/`multiselect`/`range`) render inside
the panel card, drive `$inputs.<id>` substitution, and stay fully isolated
per panel instance — including under a deliberate input-`id` collision
between two panels.

**Independent Test**: Configure two `observable-plot` panels with their own
`inputs:` (one pair sharing an input `id`), change each input's value, and
confirm only the owning panel's chart updates while the other panel and the
global filter store are unaffected.

### Tests for User Story 2

> Write these first; they should fail until T028-T030 land.

- [x] T021 [P] [US2] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: the "Trip Length
      Frequency Distribution" panel's `select` input (`mode_select`) uses its
      `default` (`SOV`) before any interaction; picking a different option
      re-queries and re-renders using the new `$inputs.mode_select` value
      (FR-004/FR-006, SC-002)
- [x] T022 [P] [US2] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: the "Mode Share by
      Purpose (Multiselect Filter)" panel's `multiselect` input, with more
      than one value selected, includes rows matching *any* selected value
      (FR-004)
- [x] T023 [P] [US2] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: changing the "Trip
      Length Frequency Distribution" panel's `mode_select` input does **not**
      change the "Mode Share by Purpose (Multiselect Filter)" panel's chart
      or its own `mode_select` input's displayed value — despite the two
      panels declaring the identical input `id` — and does not change the
      global filter store (`window.__wftdm!.filterState.getAll()`
      unaffected) (FR-005, research.md §3)
- [x] T024 [P] [US2] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: setting the "Trip
      Length Frequency Distribution" panel's input to a non-default value,
      expanding it into `004`'s dialog, and collapsing it again leaves that
      value in effect (not reset to `default`), with zero additional query
      fired solely by the transition (`__debugQueryLog`, FR-006)
- [x] T025 [P] [US2] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: the "Trip Length
      Frequency Distribution" panel's `mode_select` fetched option list
      contains every mode the column actually has (`SOV`, `Transit`), not
      narrowed to only the currently-selected value — proves the options
      query is genuinely unfiltered by the panel's own `filter:` bindings,
      including the input's own (research.md §9)
- [x] T026 [P] [US2] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: the "Mode Share
      (Mismatched Default, intentional)" panel's `select` control still
      visibly displays `Bike` (its actual, unmatched current value) as a
      synthesized `<option>`, even though the fetched option list from
      `trip_mode_share.mode` doesn't contain it; separately, the "Trip Length
      by Distance Bin (Range Filter)" panel's slider is clamped to its
      column's real max (`5`), not left at its configured out-of-range
      `default` (`99`) — no crash, no empty state, a categorically different
      outcome from the `select` case (research.md §9, spec.md's Edge Cases)
- [x] T027 [P] [US2] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: for the "Mode Share by
      Purpose (Bar)" panel, `data-render-count` on the chart container
      reaches `1` (not `2`) shortly after mount — proving the render-and-swap
      effect's synchronous call and `ResizeObserver`'s guaranteed initial
      callback don't each independently rebuild the chart (research.md §5b)

### Implementation for User Story 2

- [x] T028 [US2] Extend `ObservablePlotPanel.tsx`'s `inputValues` state
      (already scaffolded in T018) to actually drive the UI: render one
      `PanelLocalInput` per `config.inputs` entry above the chart container;
      `onChange` updates `inputValues` immutably, keyed by `input.id`.
      Compute `activeScenarios`/`view` (`resolveInputOptionsView`, per
      contracts/observable-plot-panel.md) once per render and pass `view` to
      every `PanelLocalInput`. Depends on T019
- [x] T029 [US2] Implement `PanelLocalInput` (in `ObservablePlotPanel.tsx`,
      per contracts/observable-plot-panel.md): `select`/`multiselect` render
      a `<select>` whose options always include a synthesized `<option>` for
      the current value even if absent from the fetched list (research.md
      §9); `range` renders a native `<input type="range" min max>` (browser
      clamping handles the mismatched-default case with no application code).
      Depends on T028
- [x] T030 [US2] Implement `PanelLocalInput`'s options/bounds fetch effect:
      `select`/`multiselect` call `distinctValues(view, config.column)`
      (`services/duckdb.ts` — its first real caller, research.md §9);
      `range` issues a small `SELECT MIN("<column>") AS min, MAX("<column>")
      AS max FROM "<view>"` query via the existing `query()`. Deliberately
      issues **no** `filter:` bindings of any kind — re-fetches only when
      `view`/`config.column`/`config.type` change, never on this input's own
      or a sibling input's value changing (research.md §9). Depends on T029

**Checkpoint**: User Stories 1 and 2 both hold, independently and together —
panel-local reactive inputs work, stay isolated across panels (including
under a real `id` collision), persist across `004`'s dialog transition, and
their two distinct mismatched-default outcomes are both verified.

---

## Phase 5: User Story 3 - Panel behaves consistently with the rest of the registry (Priority: P3)

**Goal**: The `observable-plot` panel type integrates into the existing
registry/layout grid/panel-card chrome with no special-casing.

**Independent Test**: Load a tab mixing `observable-plot` with
`valuebox`/`plotly`/`table`/`markdown` panels, confirm standard panel-card
chrome, grid placement, and loading-skeleton convention.

**Note**: Like `006`'s US2/US3, this story is test-only — T017-T020's
implementation already provides everything this story needs; no
observable-plot-specific panel-card/registry code exists to write beyond
what US1 already built.

### Tests for User Story 3

- [x] T031 [P] [US3] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: a tab mixing
      `observable-plot` panels with `valuebox`/`plotly`/`table`/`markdown`
      panels (this fixture file's full `row_kpis`/`row_chart`/`row_table`/
      `row_markdown`/`row_observable_plot` set) renders all of them without
      error, and an `observable-plot` panel's card has the same title bar and
      expand trigger every other panel type has (SC-005)
- [x] T032 [P] [US3] Playwright test in
      `tests/integration/observablePlotPanel.spec.ts`: an `observable-plot`
      panel shows the same inline `animate-pulse` skeleton convention
      `PlotlyPanel`/`ValueBoxPanel` already use while its query is in flight
      — not a new shared loading component (research.md §7)

### Implementation for User Story 3

*No new implementation tasks* — covered by T017-T020 above (see Note).

**Checkpoint**: All three user stories are independently functional and
verified together — the full `docs/GRAMMAR.md` `type: observable-plot`
grammar this feature scoped itself to (including panel-local reactive
inputs) is implemented end to end, correctly, and consistently with every
other panel type.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T033 [P] Run quickstart.md's full validation pass end to end — the
      automated `npm run test:integration -- observablePlotPanel` run, plus
      every manual verification step (including the resize/expand check, the
      cross-panel isolation check, and the mismatched-default check)
- [x] T034 [P] Run the full Playwright suite (`npx playwright test
      --workers=1 --reporter=list`, this project's established serial-worker
      convention) and confirm zero regressions in `boot.spec.ts`/
      `dashboardShell.spec.ts`/`panelExpand.spec.ts`/`tablePanel.spec.ts`/
      `markdownPanel.spec.ts` — T009/T010's fixture changes (a new Parquet
      table plus a new fixture row in a file those existing suites already
      read from) are this feature's one real cross-feature blast-radius
      vector, worth confirming directly rather than assumed harmless
- [x] T035 [P] Run the full Vitest suite (`npm run test:unit`) and confirm
      zero regressions — `panelQuery.test.ts`/`sqlExpander.test.ts` in
      particular, given T003/T006's rewrites of shared, already-tested
      functions
- [x] T036 [P] Re-confirm plan.md's Constitution Check against what was
      actually built — expected to still read PASS across all nine
      principles with no new Complexity Tracking entries; update the note
      only if implementation revealed an actual deviation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001, sequencing only). T002
  → T003 → T004 (checkpoint) is strictly sequential; T005/T006 can proceed in
  parallel once T004 is clean, each feeding into T007 (checkpoint); T008
  depends on both checkpoints (T004, T007); T009 is independent of the
  type/query-layer chain and can run in parallel with it; T010 depends on
  both T008 (types exist) and T009 (Parquet published) — **BLOCKS all user
  stories**.
- **User Stories (Phase 3-5)**: All depend on Foundational completing. US1's
  implementation tasks (T017-T020) are the only tasks that write the actual
  rendering pipeline; US2 (T028-T030) extends that same pipeline with input
  handling; US3 is test-only, verifying properties US1/US2 already provide —
  unlike `005` (where each story added genuinely new wiring layer by layer),
  this mirrors `006`'s pattern for its later stories.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- US1 tests (T011-T016) are written first; expected to fail until
  T017-T020 land.
- US2 tests (T021-T027) are written first; expected to fail until
  T028-T030 land (T017-T020 must already exist — US2 extends, not
  replaces, US1's pipeline).
- US3 tests (T031-T032) are written against already-complete US1/US2
  implementation — no "write first, watch it fail" cadence applies, since
  there is no separate implementation step for this story to wait on.

### Parallel Opportunities

- T005 and T006 (Foundational) can run in parallel once T004 is clean —
  different files.
- T009 (Foundational, fixture Parquet) can run in parallel with the entire
  T002-T008 type/query-layer chain — different file, no dependency either
  way until T010 needs both.
- Within US1, all test tasks (T011-T016) marked `[P]` can be authored in
  parallel once Foundational (through T010) is complete.
- Within US2, all test tasks (T021-T027) marked `[P]` can be authored in
  parallel once US1's implementation (T017-T020) exists.
- T031-T032 (US3) can be authored in parallel with each other, and with
  US2's tests, once T017-T020 land.
- T033-T036 (Polish) can run in parallel with each other.

---

## Parallel Example: User Story 1

```bash
# Once Phase 2 (T001-T010) is complete, author all US1 test scenarios together:
Task: "Vitest: observablePlotEncoding resolves bare column names, not $metric.-prefixed, in tests/unit/observablePlotEncoding.test.ts"
Task: "Playwright: barY marks match direct query in tests/integration/observablePlotPanel.spec.ts"
Task: "Playwright: lineY renders real line-mark DOM elements in tests/integration/observablePlotPanel.spec.ts"
Task: "Playwright: global filter change re-queries/re-renders only the affected chart in tests/integration/observablePlotPanel.spec.ts"
Task: "Playwright: 004 expand/collapse resize correctness + zero extra query in tests/integration/observablePlotPanel.spec.ts"
Task: "Playwright: empty/error states in tests/integration/observablePlotPanel.spec.ts"

# Then, once tests exist and fail as expected:
Task: "Implement observablePlotEncoding.ts"
Task: "Implement ObservablePlotPanel.tsx's data-fetch effect"
Task: "Implement ObservablePlotPanel.tsx's render-and-swap effect + ResizeObserver guard"
Task: "Register 'observable-plot': ObservablePlotPanel in src/panels/registry.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational — the `filter:`
   widening, `buildPanelQuery`/`sqlExpander.ts` extensions, new types, both
   fixture tables/panels).
2. Complete Phase 3 (US1): query→render pipeline, global filter reactivity,
   `004` resize correctness, empty/error states.
3. **STOP and VALIDATE**: run T011-T016 and confirm they pass.
4. This alone is a demoable, mergeable increment — a working fifth panel
   type reactive to the existing global filter system, on par with what
   `PlotlyPanel` already delivers, even before any panel-local input exists
   (spec.md's own stated reasoning for US1 being independently valuable).

### Incremental Delivery

1. Setup + Foundational → shared infrastructure ready, verified not to have
   broken any existing panel type (T004, T007 checkpoints).
2. Add US1 → test independently → a working, filter-reactive, resize-correct
   fifth panel type.
3. Add US2 → test independently → panel-local `select`/`multiselect`/`range`
   inputs, isolated per panel instance, including under a real `id`
   collision — the capability that actually distinguishes this panel type
   per `docs/SPEC.md`'s own description.
4. Add US3 → test independently (no new code) → confirmed consistent with
   the rest of the panel registry.
5. Polish → full quickstart pass, full-suite regression check (Playwright
   *and* Vitest, given the shared-module changes), Constitution
   re-confirmation.

---

## Notes

- T004 and T007 are this feature's equivalent of `006`'s T003 typecheck
  checkpoint — but there are **two** of them here, because two shared
  modules (`panelQuery.ts`, `sqlExpander.ts`) both needed real (if
  backward-compatible) rewrites, not one type split.
- T019's `data-render-count` container attribute is test-observability
  instrumentation, not user-facing behavior — same category as
  `services/duckdb.ts`'s existing `__debugQueryLog()`, which
  `panelExpand.spec.ts`/`tablePanel.spec.ts` already rely on for an
  analogous "prove a transition didn't do unnecessary work" assertion
  (T015/T024/T027 reuse `__debugQueryLog()` directly; T027 needs its own
  counter because it's asserting DOM-rebuild count, not query count).
- T010's fixture panel 3 deliberately reuses fixture panel 2's input `id`
  (`mode_select`) — this is not an oversight to fix, it is the vehicle for
  T023's cross-panel-isolation-under-collision test, spec.md's own named
  edge case.
- T010's fixture panel 4's `default: 99` (outside its column's real `[1,
  5]` range) is deliberate, not a fixture bug — it is what makes that one
  panel's own initial render directly exercise the browser's native
  range-clamping behavior, avoiding the need for a second, otherwise-
  redundant range fixture.
- Commit after each task or logical group; verify each story's tests fail
  before implementing (US1, US2 — see Notes above for why US3 doesn't
  follow that cadence), pass after.

## Completion

All 36 tasks done. Full suite green: 98 unit tests (10 files — 8 pre-existing
+ this feature's new `observablePlotEncoding.test.ts` + `panelQuery.test.ts`/
`sqlExpander.test.ts` both extended, all existing cases unchanged) + 71
integration tests (`boot`/`dashboardShell`/`panelExpand`/`tablePanel`/
`markdownPanel` + this feature's 14 new `observablePlotPanel.spec.ts` tests),
run serially — zero regressions in any prior feature's coverage after fixes
below. `npm run typecheck` clean throughout, including both T004/T007
checkpoints.

**Real issues found and fixed during implementation, beyond what research.md/
contracts anticipated:**

1. **Multiselect "any of" semantics needed a real design addition, not
   covered in planning.** `docs/GRAMMAR.md`'s equality-shaped `filter:`
   binding (`AND "col" = '$inputs.id'`) cannot express "matches any
   selected value." Fixed by teaching `buildPanelQuery` to detect a
   multiselect-typed `$inputs.<id>` reference (via the same `'inputs' in
   config` narrowing idiom already used for `'column' in config`) and emit
   an unquoted `IN (...)` shape instead, with `sqlExpander.ts`'s
   `expandInputs` formatting an array value as a comma-joined, individually-
   quoted list to fill it. Every existing single-value case (`$filters.<id>`,
   a select/range `$inputs.<id>`) keeps its exact original `= '...'` shape —
   additive, not a rewrite.
2. **Input controls were originally gated behind `status === 'ready'`,
   hiding the one control a user would need to fix a bad selection.** A
   panel showing `PanelEmptyState` because of its own mismatched input
   default rendered no input at all in the original sketch — caught by
   T026's own test. Fixed: panel-local inputs now render unconditionally;
   only the chart/loading/empty/error content beneath them is
   status-dependent.
3. **A wrapping `<label>Text<control></label>` composes an unpredictable
   accessible name** (a real browser accname-algorithm quirk — the
   control's own rendered content gets folded into the label's computed
   name), making `getByLabel` resolve to zero or multiple elements
   depending on control state. Fixed by switching to explicit
   `aria-label={config.label}` on the `<select>`/`<input type="range">`
   themselves, with the visible label text as a sibling `<span>`.
4. **research.md §9's original "no application code needed" claim for
   range clamping was wrong** — the browser clamps only the `<input
   type="range">`'s *displayed* value; it fires no `change`/`input` event
   for that automatic clamping, so the React-controlled value (and the
   query built from it) would silently keep using the stale, out-of-range
   default. Fixed with a small effect that syncs `value` to the same
   clamped number the widget already shows, once real bounds are known —
   corrected in research.md, not silently patched around.
5. **Two pre-existing tests in `panelExpand.spec.ts`/`dashboardShell.spec.ts`
   used unscoped, page-wide `getByText('No data for this selection')`
   locators** that were only ever safe because no other panel reacted to
   that specific global-filter/value combination at the time they were
   written. This feature's own fixture panels (also bound to
   `$filters.purpose`) made those locators genuinely ambiguous — a real,
   if latent, test fragility this feature's cross-feature regression check
   (T034) was specifically there to catch, not a reason to weaken this
   feature's own coverage. Fixed by scoping both to their specific panel's
   card, matching the `panelCard()` pattern newer suites already use.
6. **Fixture panel titles "Mode Share by Purpose (Bar)"/"(Multiselect
   Filter)" collided by prefix** with the pre-existing plotly panel titled
   exactly "Mode Share by Purpose", breaking several `panelExpand.spec.ts`/
   `markdownPanel.spec.ts` assertions that queried by non-exact
   substring match. Renamed both to "Observable Plot Mode Share (...)".
7. **`sqlExpander.ts`'s `expandFilter`/`expandInputs` didn't escape
   embedded single quotes before substituting a value into a SQL string
   literal** — a real gap flagged post-implementation, pre-dating this
   feature (`expandFilter`'s scalar case had the identical issue) but
   fixed alongside it since 007's own multiselect array-value path is what
   made the gap concrete and easy to exercise. A value like `"Driver's
   Ed"` would have broken out of its surrounding `'...'` literal,
   producing syntactically invalid (or, worse, structurally different)
   SQL. Fixed with a shared `escapeSqlString()` helper (SQL's standard
   doubling escape, `'` → `''`) applied to both `expandFilter`'s scalar
   return and `expandInputs`'s scalar/each-array-element returns — still
   plain string manipulation, not SQL parsing, so Principle III's
   "string-replacement only" holds. Three new `sqlExpander.test.ts` cases
   cover it: an escaped `$filters.<id>` scalar, an escaped `$inputs.<id>`
   scalar, and an escaped multiselect array element.
8. **Hover tooltips never actually worked on any `observable-plot`
   panel** — a real bug found via manual visual check post-implementation,
   root-caused (not guessed) before fixing:
   - **Confirmed cause #1**: `tests/fixtures/dashboard-config/
     dashboard-1-summary.yaml` never set `tip: true` on any panel — the
     "Trip Length Frequency Distribution" panel was authored as reusing
     `docs/GRAMMAR.md`'s own worked example "almost verbatim," but
     silently dropped that example's `tip: true`/`grid: true`. Verified
     empirically, not just by code inspection: hovering the current
     (pre-fix) chart produced a byte-identical container `innerHTML`
     before and after (2849→2849 bytes for the `barY` panel, 2809→2809
     for `lineY`) — genuinely never rendered, not a CSS-clipping/
     `overflow:hidden` issue anywhere in the ancestor chain.
   - **Confirmed cause #2, found doing the requested mark-type diligence**:
     `@observablehq/plot`'s `tip: true` shorthand resolves to `"xy"`
     (2D) pointer mode for *every* mark type (confirmed against Plot's
     real source, `src/mark.js`'s `maybeTip`) — it is not mark-shape-aware.
     Plot's own docs warn 2D pointing creates "dead spots" on bar/rect
     marks (the pointer must land within ~40px of a bar's centroid, not
     anywhere on its visible area) and recommend one-dimensional
     `"x"`/`"y"` pointing instead. Restoring `tip: true` alone would have
     left `barY` panels technically configured but practically unusable —
     the same user-visible symptom, not actually fixed.
   - **Fix**: restored `tip: true`/`grid: true` on the `lineY` fixture
     panel (matching `docs/GRAMMAR.md` faithfully) and added `tip: true`
     to the `barY` fixture panel too, to exercise both mark types.
     `observablePlotEncoding.ts` gained `resolveTipMode()`: `barY` (the
     one bar-shaped mark this app supports) resolves `tip: true` to
     `"x"`; every other mark keeps the `"xy"` default — resolved
     internally, not by inventing new author-facing grammar
     `docs/GRAMMAR.md` doesn't document.
   - **New coverage**: 2 real Playwright tests hover an actual chart
     element (`.hover()`, not a synthetic DOM query) and assert the
     `<g aria-label="tip">` element — empty before hover — becomes
     non-empty and contains the real underlying data (`mode`/`share`/
     `purpose` for the bar; `purpose`/`distance_bin`/`trips` for the
     line) after. Every prior test only checked that a chart *rendered*;
     none exercised hover at all — exactly the gap that let this ship.
9. **Second real visual bug, same category as #8** — no color legend
   ever rendered on a fill/stroke-encoded `observable-plot` chart,
   caught by a manual visual check:
   - **Investigated before fixing, per instruction**: `docs/GRAMMAR.md`
     documents no `legend:` key at all for this panel type (confirmed by
     grepping the whole file, not just the observable-plot section) —
     confirmed against Plot's real docs that `color: {legend: true}` is
     a top-level `Plot.plot()` option (belongs in `plotOptions`,
     alongside `grid`) and is confirmed **not automatic**. Also did the
     requested broader completeness pass: re-read both documented
     worked examples key-by-key against what's implemented (nothing
     else missing), and empirically verified (not trusted a
     summarized-doc claim that turned out to be wrong) that axis labels
     already auto-derive from field names with zero config — not a gap.
   - **Fix**: `observablePlotEncoding.ts` sets `plotOptions.color =
     {legend: true}` whenever `config.fill` or `config.stroke` is set —
     an internal default, not new grammar, chosen because (a) no
     author-facing key exists to opt in with, so any other default
     would be an unreachable dead feature, and (b) it matches this
     app's own `PlotlyPanel`, which already auto-shows a legend
     whenever a categorical color split exists.
   - **A real regression this fix itself introduced, caught before
     shipping**: Plot's legend swatches render as their own small
     `<svg><rect>` elements — every *existing* test's `svg`/`svg rect`/
     `svg path` locator (written before any legend existed) became
     ambiguous or silently wrong once the legend appeared (DOM order:
     legend swatches render *before* the actual chart `<svg>`, so
     `.first()` started picking a 15×15 swatch icon instead of a real
     bar/line). Caught by the full-suite run failing 4 of this
     feature's own already-passing tests, not by manual review. Fixed
     by scoping every chart-SVG locator to `svg[viewBox]` (only the
     real chart SVG has one; swatch icons don't) across the whole spec
     file — 22 occurrences.
   - **New coverage**: 3 real Playwright tests — a fill-encoded `barY`
     chart and a stroke-encoded `lineY` chart each show a visible
     legend containing the real category labels (`SOV`/`HOV`/
     `Transit`/`Non-Motorized`; `HBW`/`NHB`), plus a negative case (a
     panel with neither `fill` nor `stroke` shows no legend at all) —
     proving the default is conditional, not unconditionally on.

No other implementation surprises — `observablePlotEncoding.ts`'s pure
resolution logic, the data-fetch/render-and-swap effect split, the
`ResizeObserver` double-fire guard (research.md §5b), and the
unfiltered-options-query design (research.md §9) all passed their
Playwright/Vitest coverage without further changes once the nine items
above were resolved. Final state: 106 unit tests (10 files) + 76 integration
tests, all green, `npm run typecheck` clean.
