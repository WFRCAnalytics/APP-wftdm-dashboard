---

description: "Task list for TablePanel"
---

# Tasks: TablePanel

**Input**: Design documents from `/specs/005-table-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — all present

**Tests**: Included. `research.md`/`quickstart.md`/`contracts/` name specific
required Vitest and Playwright scenarios (not optional coverage), matching
`003`/`004`'s established practice.

**Organization**: Tasks are grouped by user story (spec.md's US1-US4), after
a Foundational phase that builds the shared infrastructure every story
needs (the extracted `formatValue.ts`, the new config types, and fixture
data rich enough to exercise all four stories' Playwright coverage — not
just US1's).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files/scopes, no dependency on an
  incomplete task)
- **[Story]**: US1-US4 (spec.md's priorities)
- Most test tasks target `tests/unit/tableLogic.test.ts` or
  `tests/integration/tablePanel.spec.ts` — marked `[P]` where the
  *scenarios themselves* are independent (no shared mutable state), even
  though several land in the same file; write each as its own
  `test()`/`describe()` block.

## Path Conventions

Single-project web frontend (`src/`, `tests/` at repo root), per plan.md's
Project Structure — additive to `001`-`004`.

---

## Phase 1: Setup

**No tasks** — this feature adds no new dependency (research.md §1:
`project-docs/SPEC.md`'s own "plain DOM" description for `type: table` is taken
directly, no table library added) and needs no project scaffolding beyond
what `001`-`004` already established.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure every user story's tasks depend on —
the extracted format-string parser, the new config types, and fixture
data rich enough for all four stories' Playwright coverage.

**🚨 CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 [P] Extract `ValueBoxPanel.tsx`'s existing local `formatValue()`
      into a new shared module, `src/panels/formatValue.ts`, exported
      (research.md §2) — same Python-style format-string support
      (`{:,.0f}` / `{:.1f}` / `{:.1%}`), non-numeric values stringified
      as-is, behavior byte-for-byte unchanged from the original
- [x] T002 [P] Add `TableColumnConfig` and `TablePanelConfig` interfaces to
      `src/layout/types.ts` per `data-model.md` (`field`/`label`/`format`/
      `color_scale`/`domain` on the column type; `columns`/`sort`/
      `pagination`/`searchable` plus the common `PanelConfigBase` fields on
      the panel type); add `TablePanelConfig` to the `PanelConfig` union
- [x] T003 Update `src/panels/ValueBoxPanel.tsx` to import `formatValue`
      from `@/panels/formatValue` instead of defining its own local copy;
      remove the now-duplicate local function. Depends on T001
- [x] T004 [P] Vitest test in `tests/unit/formatValue.test.ts`: covers the
      same cases `ValueBoxPanel.tsx` previously only exercised indirectly
      through its own rendering (`{:,.0f}`, `{:.1f}`, `{:.1%}`, a
      non-numeric value passed through as-is) — confirms the extraction
      changed nothing observable. Depends on T001, T003
- [x] T005 [P] Add/extend fixture data in
      `tests/fixtures/dashboard-config/`: a `type: table` panel with a
      `columns:` list (including at least one `color_scale: diverging`
      entry with an **asymmetric** `domain`, one `format`-configured
      column, `sort:`, `pagination:`, and `searchable: true`) querying a
      metric with 25+ rows (enough to exceed the default page size and
      exercise cross-page search meaningfully), plus a second `type:
      table` panel with no `columns:` list at all (to exercise derived-
      column rendering). Needed by every Playwright task below, not only
      US1's

**Checkpoint**: Shared infrastructure exists and is verified —
`ValueBoxPanel.tsx` unaffected, fixture data ready. Nothing table-specific
renders yet.

**Done**: T005's fixture reuses `project-docs/GRAMMAR.md`'s own `type: table`
example verbatim (screenline validation — `link_id`/`facility_type`/
`observed`/`modeled`/`pct_error`), 30 generated rows
(`tests/fixtures/generate.py`'s `SCREENLINES_ROWS`), added to
`good_scenario` only (matching the existing `trip_mode_share` precedent).
Two fixture panels in a new `row_table` (plus a third, deliberately
broken one added during US1 for the error-state test — see below):
"Screenline Validation" (full `columns:`, `sort: {pct_error, desc}`,
`pagination: 10`, not searchable) and "Screenline Validation (Raw)" (no
`columns:`, default pagination, `searchable: true` — row `L025`
(`facility_type: "Ramp"`, unique) deliberately placed at fetch index 24,
landing on page 2 of this panel's default 20-row pages, for the
cross-page search test).

---

## Phase 3: User Story 1 - See a panel's query result as a real table (Priority: P1) 🎯 MVP

**Goal**: A `table` panel renders correctly — columns from `columns:`
config (with label/format/color-scale) or derived from the query result's
shape when absent — styled consistently with every other panel type, with
the same loading/empty/error states.

**Independent Test**: Configure a `table` panel against real fixture
data, load the dashboard tab, confirm the table renders with correct
rows, columns, labels, formatting, and color treatment — no
sort/paginate/search interactivity required yet.

### Tests for User Story 1

> Write these first; they should fail until T017-T019 land.

- [x] T006 [P] [US1] Vitest test in `tests/unit/tableLogic.test.ts`:
      `resolveColumns` with `config.columns` present returns exactly those
      fields, in order, `label` defaulted to `field` when omitted
- [x] T007 [P] [US1] Vitest test in `tests/unit/tableLogic.test.ts`:
      `resolveColumns` with no `config.columns` derives one column per key
      of `rows[0]`, in `Object.keys()` order
- [x] T008 [P] [US1] Vitest test in `tests/unit/tableLogic.test.ts`:
      `cellColor` with `color_scale: 'sequential'` maps low values near
      `--muted`, high values near `--brand-wfrc-blue`
- [x] T009 [P] [US1] Vitest test in `tests/unit/tableLogic.test.ts`:
      `cellColor` with `color_scale: 'diverging'` and a **symmetric**
      domain (e.g. `[-0.5, 0.5]`) maps the negative extreme toward
      `--brand-wfrc-blue`, the positive extreme toward `--destructive`,
      and `0` to the neutral midpoint
- [x] T010 [US1] Vitest test in `tests/unit/tableLogic.test.ts`:
      `cellColor` with `color_scale: 'diverging'` and an **asymmetric**
      domain (e.g. `[-0.1, 0.9]`) still maps `0` to the neutral midpoint
      color — not the color at the domain's geometric center (`0.4`).
      Kept as its own standalone test, not folded into T009: this is the
      specific property research.md §4 was flagged twice to get right
      before implementation, and needs a dedicated, independently-visible
      assertion, not incidental coverage from a symmetric-domain case
      where the two interpretations happen to coincide
- [x] T011 [P] [US1] Vitest test in `tests/unit/tableLogic.test.ts`:
      `cellColor` clamps a value outside `domain` to the color at the
      nearest extreme, not an extrapolated or unstyled result
- [x] T012 [P] [US1] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a `columns:`-configured table panel renders exactly those fields, in
      order, with configured `label`s and `format`-applied cell values
- [x] T013 [P] [US1] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a table panel with no `columns:` config renders one column per field
      present on the query result
- [x] T014 [P] [US1] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a `color_scale`-configured column shows a visible color treatment on
      its cells, and text in the most strongly colored cells remains
      legible (computed contrast check, not a visual eyeball)
- [x] T015 [P] [US1] Playwright test in `tests/integration/tablePanel.spec.ts`:
      loading, empty-result, and error states render via the same
      `PanelEmptyState`/`PanelErrorState` components `ValueBoxPanel`/
      `PlotlyPanel` already use — no new state-handling pattern
- [x] T016 [P] [US1] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a table panel's card uses the same border/shadow/spacing/typography
      tokens as a `valuebox`/`plotly` panel on the same tab (SC-004)

### Implementation for User Story 1

- [x] T017 [US1] Implement `resolveColumns` and `cellColor` in
      `src/panels/tableLogic.ts` per `contracts/table-logic.md` — the
      color-scale mapping implements research.md §4's decision exactly
      (existing-token endpoints, fixed-`0` diverging midpoint, capped
      `color-mix()` blend for legibility). Depends on T002
      — **Note**: `sortRows` (T025) and `filterRows` (T038) were written
      into this same file in this same pass, since all four functions are
      small and directly interrelated (`TablePanel.tsx` calls all four
      together, per contracts/table-panel.md's `filtered → sorted →
      pageRows` pipeline) — `tableLogic.test.ts` (T006-T011, T020-T021,
      T032-T033) was likewise written and run as one full pass, not
      phase-gated. The *UI wiring* in `TablePanel.tsx` (T018, T026, T031,
      T039) still landed incrementally per story, matching the phased plan
      — the deviation is scoped to the pure-logic module only.
- [x] T018 [US1] Implement `TablePanel.tsx`'s core shape per
      `contracts/table-panel.md`: the `useFilterState`/`buildPanelQuery`/
      `query()` fetch chain (identical to `ValueBoxPanel.tsx`/
      `PlotlyPanel.tsx`), loading/empty/error states, and column/cell
      rendering via `resolveColumns`/`cellColor`/`formatValue` — no sort,
      pagination, or search interactivity yet (those are US2-US4). Depends
      on T002, T017
- [x] T019 [US1] Register `table: TablePanel` in `src/panels/registry.tsx`.
      Depends on T018

**Checkpoint**: User Story 1 is fully functional and independently
testable — a table panel renders correctly from either config shape, with
correct formatting, color, and shared loading/empty/error states.

**Done, with two real, test-only bugs found and fixed by actually
running the suite**, not caught by reasoning alone: T012's and T014's
first drafts assumed row `L001` (link_id order) would be visible on page
1 of "Screenline Validation" — but that panel's own `sort: {pct_error,
desc}` + `pagination: 10` config means page 1 shows the 10
*highest-pct_error* rows, not the first 10 by link_id. Fixed by asserting
against `L011` (this fixture's actual highest `pct_error`, genuinely on
page 1) instead — confirms the sort/pagination wiring is correct (a test
assuming natural order would have silently passed against a *differently
broken* implementation that ignored `sort:`/`pagination:` entirely, so
this was a real gap worth having caught). Also added a third fixture
panel, "Broken Table Panel (intentional)" (nonexistent metric,
`dashboard-1-summary.yaml`), so T015 could test the genuine
query-rejection error branch distinctly from the search-narrowed-to-zero
branch — both are real, different code paths in `TablePanel.tsx`, not
one test standing in for the other.

---

## Phase 4: User Story 2 - Sort the table by any column (Priority: P2)

**Goal**: Clicking a column header re-sorts the table client-side; a
configured `sort:` applies as the initial order.

**Independent Test**: Load a table panel, click a column header, confirm
correct re-ordering (numeric columns sort numerically) with no network
activity.

### Tests for User Story 2

- [x] T020 [P] [US2] Vitest test in `tests/unit/tableLogic.test.ts`:
      `sortRows` on a numeric column produces numeric order (e.g. `-5`
      before `-0.12` before `0.3`), not lexicographic string order
- [x] T021 [P] [US2] Vitest test in `tests/unit/tableLogic.test.ts`:
      `sortRows` on a non-numeric column produces locale-aware string
      order; the input array is never mutated
- [x] T022 [P] [US2] Playwright test in `tests/integration/tablePanel.spec.ts`:
      clicking a column header sorts ascending; clicking it again reverses
      to descending; clicking a *different* column resets to ascending on
      the new column
- [x] T023 [P] [US2] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a panel with `config.sort` shows that order on first render, before
      any click
- [x] T024 [P] [US2] Playwright test in `tests/integration/tablePanel.spec.ts`:
      any sort interaction triggers no additional query (instrument via
      `services/duckdb.ts`'s `__debugQueryLog()`, the same debug
      instrumentation `004` added, rather than a network-timing guess)

### Implementation for User Story 2

- [x] T025 [US2] Implement `sortRows` in `src/panels/tableLogic.ts` per
      `contracts/table-logic.md`. Depends on T017 (same module)
- [x] T026 [US2] Wire `sortState` (initialized from `config.sort`) and
      column-header click handlers into `TablePanel.tsx`. Depends on T018,
      T025

**Checkpoint**: User Stories 1 and 2 both hold, independently and
together.

---

## Phase 5: User Story 3 - Page through a large result set (Priority: P3)

**Goal**: A result set larger than the effective page size renders one
page at a time, with controls to reach the rest; `config.pagination`
overrides the default page size.

**Independent Test**: Load a table panel whose fixture result set exceeds
one page, confirm only the first page renders initially, confirm
pagination controls correctly reach the remaining rows.

### Tests for User Story 3

- [x] T027 [P] [US3] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a result set larger than the effective page size renders only the
      first page initially, with controls available to reach the rest
- [x] T028 [P] [US3] Playwright test in `tests/integration/tablePanel.spec.ts`:
      `config.pagination: <n>` is used as the page size instead of the
      default (20)
- [x] T029 [P] [US3] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a result set that fits within one page shows every row reachable
      without requiring working pagination controls (hidden or inert is
      acceptable)
- [x] T030 [P] [US3] Playwright test in `tests/integration/tablePanel.spec.ts`:
      paging forward on a sorted table reflects the sorted order —
      pagination slices the already-sorted result set, not the original
      fetch order

### Implementation for User Story 3

- [x] T031 [US3] Wire `currentPage` state, `pageSize = config.pagination ??
      20`, row-slicing, and pagination controls into `TablePanel.tsx`.
      Depends on T026

**Checkpoint**: User Stories 1-3 hold together — a sortable, paginated
table matching `project-docs/SPEC.md`'s own description of `type: table` in full.

---

## Phase 6: User Story 4 - Search across the full result set (Priority: P4)

**Goal**: `searchable: true` renders a search input; entering text
filters to matching rows across the *entire* fetched result set (not just
the current page), before pagination re-slices what's shown.

**Independent Test**: Load a table panel with `searchable: true` and a
multi-page result set, type a term matching a row on a later page, confirm
it appears in the filtered, re-paginated results.

### Tests for User Story 4

- [x] T032 [P] [US4] Vitest test in `tests/unit/tableLogic.test.ts`:
      `filterRows` matches case-insensitively against each column's
      *rendered* (formatted) value, not the raw underlying value (e.g. a
      search for `"12%"` matches a raw `0.12` formatted as `"12.0%"`)
- [x] T033 [P] [US4] Vitest test in `tests/unit/tableLogic.test.ts`:
      `filterRows` evaluates every row passed in, regardless of array
      length — confirms the function itself has no built-in pagination
      assumption baked in (that's `TablePanel.tsx`'s job to apply after)
- [x] T034 [P] [US4] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a panel with `config.searchable` renders a search input; one without
      it does not
- [x] T035 [US4] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a search term matching a row that exists only on a page other than
      the one currently displayed surfaces that row in the (now
      re-paginated) filtered results — the central proof of this whole
      user story, kept as its own standalone task, not folded into T034
- [x] T036 [P] [US4] Playwright test in `tests/integration/tablePanel.spec.ts`:
      combining search and sort orders the *filtered* subset, not the full
      unfiltered set
- [x] T037 [P] [US4] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a search term matching no rows shows a distinct "no results" state,
      visibly different from the panel's own no-data-at-all empty state

### Implementation for User Story 4

- [x] T038 [US4] Implement `filterRows` in `src/panels/tableLogic.ts` per
      `contracts/table-logic.md`. Depends on T017 (same module)
- [x] T039 [US4] Wire `searchTerm` state, a conditionally-rendered search
      input (`config.searchable`), and the `filtered → sorted → pageRows`
      order of operations (`contracts/table-panel.md`) into
      `TablePanel.tsx`; entering a search term resets `currentPage` to `0`.
      Depends on T031, T038
- [x] T040 [US4] Add a distinct "no search results" message to
      `TablePanel.tsx`, rendered when `searchTerm` is non-empty but
      `filterRows` returns zero rows — separate from `PanelEmptyState`
      (which means "the query itself returned nothing"). Depends on T039

**Checkpoint**: All four user stories are independently functional and
verified together — the full `project-docs/GRAMMAR.md` `type: table` grammar this
feature scoped itself to is implemented end to end.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T041 Playwright test in `tests/integration/tablePanel.spec.ts`: a
      table sorted by the user clicking a column header (not by
      `config.sort`) has that sort revert to `config.sort`'s value (or
      natural order if unset) when a global filter change causes a
      refetch — and the same refetch clears any active search term and
      resets to the first page, all three together, not a subset
      (`contracts/table-panel.md`'s three-way reset — kept as its own
      task, not assumed covered by T023's/T035's/T028's individual,
      single-state tests, none of which exercise an actual refetch).
      Depends on T039
- [x] T042 [P] Playwright test in `tests/integration/tablePanel.spec.ts`:
      a `table` panel gets `004`'s expand-to-large-view trigger with zero
      panel-specific code aware that mechanism exists — same as
      confirming any other registry entry inherits it. Depends on T039
- [x] T043 Playwright test in `tests/integration/tablePanel.spec.ts`: a
      table panel's `sortState`/`searchTerm`/`currentPage` — all three
      together — are unchanged after an expand → collapse round trip via
      `004`'s mechanism, the same rigor `004`'s own test suite gave the
      analogous Plotly-zoom-state-persists property, not assumed to "just
      work" by extension. Depends on T042
- [x] T044 [P] Run `quickstart.md`'s full validation pass end to end — the
      automated `npm run test:unit -- tableLogic formatValue` and
      `npm run test:integration -- tablePanel` runs, plus every manual
      verification step
- [x] T045 [P] Re-confirm plan.md's Constitution Check against what was
      actually built — expected to still read PASS across all nine
      principles with no new Complexity Tracking entries; update the note
      only if implementation revealed an actual deviation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks — nothing to depend on.
- **Foundational (Phase 2)**: T001 → T003 → T004 (extraction, then the
  consumer update, then its test) is sequential; T002 and T005 are
  independent of that chain and of each other — **BLOCKS all user
  stories**.
- **User Stories (Phase 3-6)**: All depend on Foundational completing.
  Within each story, test tasks can be authored in parallel with each
  other; each story's implementation tasks depend on that story's own
  `tableLogic.ts` function existing first, and on the *previous* story's
  `TablePanel.tsx` wiring being in place (US2's sort wiring builds on
  US1's render; US3's pagination wiring builds on US2's; US4's search
  wiring builds on US3's) — so, unlike some multi-story features, these
  four are **not** independently buildable in parallel by separate people
  without one blocking the next's implementation task, even though each
  is independently *testable* once its own implementation lands.
- **Polish (Phase 7)**: Depends on all four user stories being complete
  (T041-T043 specifically need sort+search+pagination all wired together
  to test their interaction).

### Within Each User Story

- Tests written first, expected to fail until that story's implementation
  tasks land.
- `tableLogic.ts` functions before `TablePanel.tsx` wiring that calls them.
- Story complete (tests pass) before the next story's implementation
  tasks begin, per the sequential-wiring dependency above.

### Parallel Opportunities

- T001/T002/T005 (Foundational) can run in parallel — different files, no
  interdependency.
- Within each user story, all test tasks marked `[P]` can be authored in
  parallel (independent `test()`/`describe()` blocks).
- T042 and T044/T045 (Polish) can run in parallel with each other; T041
  and T043 are each sequential relative to their own dependencies.

---

## Parallel Example: User Story 1

```bash
# Once Phase 2 (T001-T005) is complete, author all US1 test scenarios together:
Task: "Vitest: resolveColumns with columns: config in tests/unit/tableLogic.test.ts"
Task: "Vitest: resolveColumns derived (no columns:) in tests/unit/tableLogic.test.ts"
Task: "Vitest: cellColor sequential mapping in tests/unit/tableLogic.test.ts"
Task: "Vitest: cellColor diverging, symmetric domain in tests/unit/tableLogic.test.ts"
Task: "Playwright: renders from columns: config in tests/integration/tablePanel.spec.ts"
Task: "Playwright: renders derived columns in tests/integration/tablePanel.spec.ts"
Task: "Playwright: color_scale renders + stays legible in tests/integration/tablePanel.spec.ts"
Task: "Playwright: loading/empty/error states in tests/integration/tablePanel.spec.ts"
Task: "Playwright: token-consistent styling in tests/integration/tablePanel.spec.ts"

# Then, once tests exist and fail as expected:
Task: "Implement resolveColumns + cellColor in src/panels/tableLogic.ts"
Task: "Implement TablePanel.tsx core render"
Task: "Register table: TablePanel in src/panels/registry.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (none) and Phase 2 (Foundational — extraction, types,
   fixture data).
2. Complete Phase 3 (US1): rendering, columns, color-scale, shared
   loading/empty/error states.
3. **STOP and VALIDATE**: run T006-T016 and confirm they pass.
4. This alone is a demoable, mergeable increment — a correctly-styled,
   correctly-columned, correctly-colored table panel exists, even before
   any interactivity is added. US2-US4 each add one more piece of
   `project-docs/SPEC.md`'s "Sortable, paginated" (plus the confirmed-in-scope
   `searchable`) description on top.

### Incremental Delivery

1. Setup (none) + Foundational → shared infrastructure ready.
2. Add US1 → test independently → demoable MVP (a real, styled table).
3. Add US2 → test independently → sortable.
4. Add US3 → test independently → paginated — now matches
   `project-docs/SPEC.md`'s literal description in full.
5. Add US4 → test independently → searchable, the one piece of grammar
   this feature's own research confirmed in scope beyond that literal
   description.
6. Polish → three-way reset correctness, `004` expand-inheritance +
   state-persistence, full quickstart pass, Constitution re-confirmation.

---

## Notes

- [P] tasks touching the same file (`tests/unit/tableLogic.test.ts` or
  `tests/integration/tablePanel.spec.ts`) are parallel at the *authoring*
  level (independent test blocks, no shared mutable state) — coordinate
  accordingly if split across multiple people/agents writing to the same
  file concurrently.
- T010 (asymmetric-domain diverging midpoint) is deliberately its own
  task, not merged into T009's symmetric-domain case — this is the one
  property flagged twice for rigor before implementation even began
  (spec.md's "Flagged for `/speckit-plan`", then research.md §4 review),
  and a symmetric domain alone can't distinguish "midpoint fixed at 0"
  from "midpoint at domain center" since both interpretations agree when
  the domain happens to be symmetric.
- T041/T043 (three-way refetch reset; state persistence across `004`'s
  expand/collapse) are each deliberately their own tasks for the same
  reason — both are specifically-flagged risks (a prior contract-review
  round for T041; explicit carry-through instruction for T043) that a
  collection of single-state tests doesn't automatically cover.
- Commit after each task or logical group; verify each story's tests fail
  before implementing, pass after.

## Completion

All 45 tasks done. Full suite green: 76 unit tests (9 files) + 45
integration tests (`boot.spec.ts` + `dashboardShell.spec.ts` +
`panelExpand.spec.ts` + this feature's 19 new `tablePanel.spec.ts`
tests), run serially — no regressions in any prior feature's coverage.
`npm run typecheck` clean throughout. The two real bugs found (both in
tests, not implementation — see T017's/US1's checkpoint notes above) were
caught by actually running the suite against real fixture data, not
assumed away.
