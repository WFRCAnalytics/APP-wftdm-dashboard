---

description: "Task list for 059-server-side-pagination"
---

# Tasks: Server-Side Sort, Filter & Pagination for TablePanel

**Input**: Design documents from `/specs/059-server-side-pagination/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/query-shapes.md, quickstart.md (all present)

**Tests**: Included as real tasks throughout — matching this project's own overwhelming, already-established precedent (every prior panel-type/query feature in this repo shipped with dedicated Vitest + Playwright coverage; `spec.md`'s own Success Criteria are explicitly measurable/verifiable outcomes).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = "a viewer explores a large table without waiting" (P1), US2 = "search still finds what a viewer sees on screen" (P2), US3 = "every existing dashboard keeps working, unchanged" (P3)

## Path Conventions

Single project — this repo's existing `src/`/`tests/` at the repository root (per `plan.md`'s own Project Structure — no new directory).

---

## Phase 1: Setup

**Purpose**: establish the one shared constant everything else in this feature reads.

- [X] T001 Add `TABLE_QUERY_MODE_THRESHOLD = 100_000` as an exported constant in `src/panels/panelQuery.ts`, with a comment citing `research.md` §1's own real, measured justification (15k/50k/100k/150k/500k/2M row data points) — no other change in this task.

**Checkpoint**: the constant exists and is importable; nothing consumes it yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the query-building primitives every user story phase below depends on. Per `contracts/query-shapes.md` — none of this touches `resolveQueryAndPairs()`/`buildPanelQuery()`/`buildComparisonDiffQuery()`/`sqlExpander.ts`, all of which stay exactly as they are.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Add `buildRowCountQuery(innerSql: string): string` to `src/panels/panelQuery.ts` — produces `SELECT COUNT(*) FROM (<innerSql>) t`, per `contracts/query-shapes.md` §1. Pure function, no DOM/browser dependency.
- [X] T003 [P] Add `buildTableDrivenPageQuery(params: { innerSql: string; sortColumn: string; direction: 'asc' | 'desc'; page: number; pageSize: number; searchPredicate?: string }): string` to `src/panels/panelQuery.ts` — produces the `ROW_NUMBER() OVER (ORDER BY "<sortColumn>" <direction>)`-wrapped, `WHERE __rn > page*pageSize ORDER BY __rn LIMIT pageSize` query from `contracts/query-shapes.md` §2, with the optional `searchPredicate` spliced in as a `WHERE` clause on the same nesting level as the `ROW_NUMBER()` computation (§3's own "filter before the window function" requirement — verified live in `research.md` §2's own WHERE-before-window-function check). Leave `searchPredicate` unused by any caller for now (US1 doesn't need it; US2 wires it up later) — this task only builds the function and proves the shape via its own unit test.
- [X] T004 [P] [US1] Unit tests for T002/T003 in `tests/unit/panelQuery.test.ts`: `buildRowCountQuery()` produces the exact wrapped-COUNT shape; `buildTableDrivenPageQuery()` produces the exact `ROW_NUMBER()`/`WHERE __rn >`/`ORDER BY __rn`/`LIMIT` shape for both `asc` and `desc`, with and without a `searchPredicate`, and confirms the search predicate (when present) sits inside the same subquery as the `ROW_NUMBER()` computation (a string-shape assertion, e.g. that the predicate text appears before the line computing `__rn`).
- [X] T005 Add a `TableQueryMode` resolution step to `src/panels/TablePanel.tsx`'s existing fetch effect: before the existing `ensureRegistered(pairs).then(() => query(sql))` call, run `query(buildRowCountQuery(sql))` once, compare the result to `TABLE_QUERY_MODE_THRESHOLD`, and store `{ mode: 'client' | 'query-driven', rowCount: number }` in a new `useState`. Gate this on the same `isContentChange` check the existing three-way `sortState`/`searchTerm`/`currentPage` reset already uses (`data-model.md`'s own "a table does not switch handling strategy while a viewer is actively interacting with it" lifecycle rule) — a scenario-activation-only refetch must not re-resolve the mode. When `rowCount < TABLE_QUERY_MODE_THRESHOLD`, the rest of the existing fetch effect runs completely unmodified (today's behavior, byte-for-byte).

**Checkpoint**: mode detection works and is provably cheap (per `research.md` §1, 1–4ms at every scale); no rendering behavior has changed yet for either mode, since nothing downstream reads `mode` until US1.

---

## Phase 3: User Story 1 - A viewer explores a large table without waiting (Priority: P1) 🎯 MVP

**Goal**: a query-driven table sorts and pages quickly, at any real scale, with no dependency on the browser having the full result set in memory.

**Independent Test**: register a real, throwaway synthetic Parquet file over the threshold (`quickstart.md` Scenario 2's own generation command), bind a table panel to it, sort by a column, and page forward/back/to-last — every action completes in well under 200ms regardless of page depth.

### Tests for User Story 1

- [X] T006 [P] [US1] Integration test in `tests/integration/tablePanelServerSidePagination.spec.ts` (new file): generate a real, throwaway 250,000-row synthetic Parquet file (matching `research.md`'s own generation technique — native `duckdb` CLI, a realistic trip-shaped schema with a genuinely non-unique `primary_purpose` column), register it via `window.__wftdm.registerFileURL()`, bind a real table panel to it (either a temporary `dashboard-8-test.yaml` row or a page-injected config — whichever this repo's own established pattern for a large-scale-only test fixture favors, matching `056`/`057`'s own precedent of not committing large fixtures), and assert: (a) sorting by `trip_distance` returns correctly ordered results; (b) paging to a page near the very end of the result set completes in a comparable time to paging to the second page (assert both timings are under, e.g., 300ms — a generous real-world margin above the ~40–90ms this session's own research measured, to absorb CI variance without being a flaky hair-trigger); (c) every row across a full page-by-page walk is accounted for exactly once (no gap, no duplicate) when sorting by the non-unique `primary_purpose` column, mirroring `research.md` §2's own live-verified correctness check. Delete the generated Parquet file in the test's own teardown; confirm via the test itself (or a documented manual follow-up) that nothing is left committed.

### Implementation for User Story 1

- [X] T007 [US1] In `src/panels/TablePanel.tsx`, branch the fetch effect on `mode` (from T005): when `mode === 'query-driven'`, call `query(buildTableDrivenPageQuery({ innerSql: sql, sortColumn, direction, page: currentPage, pageSize, searchPredicate: undefined }))` instead of the existing full-fetch `query(sql)` call — `sortColumn`/`direction` come from `sortState`, falling back to the first resolved column when `sortState` is `null` (per `contracts/query-shapes.md` §2's own "a stable default ordering is still required" note — never an unordered `ROW_NUMBER()`). Store the result directly in the existing `rows` state.
- [X] T008 [US1] In `src/panels/TablePanel.tsx`'s render body, branch the existing `filtered`/`sorted`/`pageRows` derivation on `mode`: when `mode === 'query-driven'`, skip `filterRows()`/`sortRows()`/the client-side `.slice()` entirely — `rows` (from T007) already *is* the correct page, correctly ordered. `visibleColumns` (from `067`) is unaffected either way — it only ever decides which already-fetched columns render, never which are fetched.
- [X] T009 [US1] Wire the existing sort-header `onClick` handler (`handleSort`) so that, when `mode === 'query-driven'`, changing `sortState` triggers a new T007-shaped fetch (reset to `currentPage = 0`, matching the real, honest UX point that a new sort order makes "page 3 of the old order" meaningless) rather than a client-side re-sort. `mode === 'client'` keeps today's exact behavior (no page reset on sort — unchanged).
- [X] T010 [US1] Wire the existing pagination controls (first/previous/next/last, `067`) so that, when `mode === 'query-driven'`, each one sets `currentPage` and triggers a new T007-shaped fetch for that page — including "last page," computed from `Math.ceil(tableQueryMode.rowCount / pageSize) - 1` (per `data-model.md`'s `PagePosition`, confirmed by `research.md` §2 to cost the same as any other page). Update the existing "Showing X–Y of Z rows"/"Page X of Y" caption to read `tableQueryMode.rowCount` instead of `sorted.length` when in query-driven mode.

**Checkpoint**: User Story 1 is independently functional — a real large table sorts and pages quickly. Search (typing into the existing search box) is not yet wired to the query-driven path; that box does nothing until US2, or plumbing it to a no-op is acceptable, since spec `US1`'s own Acceptance Scenario 3 is satisfied once US2 lands and this checkpoint's own scope is sort+pagination only, matching this phase's title.

---

## Phase 4: User Story 2 - Search still finds what a viewer sees on screen (Priority: P2)

**Goal**: a query-driven table's search matches the same rendered/formatted text a viewer sees, exactly as today's client-side search already does.

**Independent Test**: on the same large synthetic table from US1, search using a formatted numeric string exactly as displayed (e.g., a comma-separated count or a percentage) and confirm the matching row is found — the same term that would match on a small, client-mode table.

### Tests for User Story 2

- [X] T011 [P] [US2] Unit tests in `tests/unit/panelQuery.test.ts` for a new `escapeSqlLiteral(term: string): string` function (T012): a plain term round-trips unchanged; a term containing one or more embedded single quotes doubles each one (`research.md` §6's own verified case, `"O'Brien"` → `"O''Brien"`).
- [X] T012 [US2] Add `escapeSqlLiteral(term: string): string` to `src/panels/panelQuery.ts` — `term.replace(/'/g, "''")`.
- [X] T013 [P] [US2] Unit tests in `tests/unit/panelQuery.test.ts` for a new `buildSearchPredicate(columns: ResolvedColumn[], searchTerm: string): string | null` function (T014), covering every real branch from `contracts/query-shapes.md` §3's table: a `'number'`-typed column with a configured `format` produces a `format(CAST(... AS DOUBLE), '<stripped format>') ILIKE '%<escaped term>%'` clause; a `'number'`-typed column with no `format` produces a plain `CAST(... AS VARCHAR) ILIKE ...`; a `'string'`-typed column produces a direct `ILIKE` with no `format()` wrapping; an `'unknown'`-typed column is omitted from the predicate entirely; multiple columns are `OR`-joined; an empty `searchTerm` returns `null` (no predicate at all, matching today's `searchTerm ? filterRows(...) : rows` short-circuit).
- [X] T014 [US2] Add `buildSearchPredicate(columns: ResolvedColumn[], searchTerm: string): string | null` to `src/panels/panelQuery.ts`, per `contracts/query-shapes.md` §3 — reuses `escapeSqlLiteral()` (T012) and each column's own `valueType` (`068-column-type-indicators`, unmodified) and `format` (existing `TableColumnConfig.format`, with its `{:`/`}` delimiters stripped before being passed to DuckDB's own `format()`, per `research.md` §3's own confirmed bare-spec requirement). Only *visible* columns (the caller passes `visibleColumns`, not the full `columns` list — matching `filterRows()`'s own existing "search only what's shown" behavior, `067`) are ever included.
- [X] T015 [P] [US2] Unit test in `tests/unit/panelQuery.test.ts` for a new `buildSearchRowCountQuery(innerSql: string, searchPredicate: string): string` function (T016): produces `SELECT COUNT(*) FROM (<innerSql>) t WHERE (<searchPredicate>)`, per `contracts/query-shapes.md` §4.
- [X] T016 [US2] Add `buildSearchRowCountQuery(innerSql: string, searchPredicate: string): string` to `src/panels/panelQuery.ts`.
- [X] T017 [P] [US2] Integration test in `tests/integration/tablePanelServerSidePagination.spec.ts`: on the same real, large synthetic table (regenerated fresh per `research.md`'s own generation command, or reusing T006's fixture setup if the test file structures it as a shared `beforeAll`), read a real formatted cell value from a query-driven page (e.g. `trip_distance` shown to one decimal place via a configured `format`), search using that exact displayed text, and confirm the matching row is returned — cross-checked against a direct `window.__wftdm.query()` call proving the same row's *raw* value would NOT necessarily be found by a naive raw-value substring match (proving this is genuinely testing format-parity, not accidentally passing because raw and formatted happen to look the same for that value).

### Implementation for User Story 2

- [X] T018 [US2] Wire `src/panels/TablePanel.tsx`'s existing `handleSearchChange` so that, when `mode === 'query-driven'`, it: (a) builds the search predicate via `buildSearchPredicate(visibleColumns, searchTerm)` (T014); (b) if non-null, runs `buildSearchRowCountQuery()` (T016) to get the filtered row count for the "Showing X–Y of Z rows" caption, and passes the predicate into `buildTableDrivenPageQuery()`'s (T003) `searchPredicate` parameter for the actual page fetch, resetting to `currentPage = 0` (matching today's existing `handleSearchChange` behavior exactly — a search can change the total row count, so a stale page index would be wrong); (c) if the search term is cleared, falls back to T007's own no-predicate fetch and `tableQueryMode.rowCount` for the caption. `mode === 'client'` keeps today's exact `filterRows()` behavior, completely unchanged.

**Checkpoint**: User Stories 1 AND 2 both work independently — a large table sorts, pages, and searches correctly and quickly, with search matching exactly what's rendered on screen.

---

## Phase 5: User Story 3 - Every existing dashboard keeps working, unchanged (Priority: P3)

**Goal**: prove — not assume — that nothing built above changes any real, currently-published table panel's behavior.

**Independent Test**: re-run the full existing real demo-content table-panel set (small tables, color-scaled columns, baseline-diff columns, searchable and non-searchable panels) and confirm every one renders identically to its pre-feature behavior.

### Tests for User Story 3

- [X] T019 [P] [US3] Unit test in `tests/unit/panelQuery.test.ts`: mode resolution (the comparison in T005, extracted as a small pure helper if it isn't already, e.g. `resolveTableQueryMode(rowCount: number): 'client' | 'query-driven'`) returns `'client'` for `99_999` and exactly `TABLE_QUERY_MODE_THRESHOLD - 1`, and `'query-driven'` for exactly `TABLE_QUERY_MODE_THRESHOLD` and above — a real boundary test, not just a mid-range sanity check.
- [X] T020 [US3] Re-run `tests/integration/tablePanelOptionB.spec.ts` (the real, existing `067`/`068` suite, unmodified by this feature) against this feature's own branch and confirm all cases still pass — every panel it exercises is real, small, published demo content that must stay on the unchanged `mode: 'client'` path. Fix forward immediately if anything regressed (do not silently adjust the test to match a new, wrong behavior).
- [X] T021 [P] [US3] Integration test in `tests/integration/tablePanelServerSidePagination.spec.ts`: confirm a real, existing color-scaled table column (any real published panel using `color_scale`/`domain`) renders identical cell shading before and after this feature — a direct `getComputedStyle()` background-color comparison against the same panel on `main`, per `research.md` §4's own "domain is already always author-specified" finding (this test exists to prove that finding stays true in the shipped code, not just in the code read during research).
- [X] T022 [US3] Confirm, by direct code read (not a new test — `research.md` §5 already proved this structurally), that no `comparison: diff` table panel's own fetch path was touched by T005–T018: `resolveQueryAndPairs()`'s comparison-diff branch is untouched, and T007's own `innerSql` parameter is populated from its existing `sql` output exactly as it is for the ordinary branch. Record the confirmation in this task's own commit message or a short note in `tasks.md`'s own completion log — no code change expected from this task.

  **Confirmed** (`src/panels/TablePanel.tsx`, current code): `resolveQueryAndPairs(config, filters, activeScenarioNames, baseline, config.compare_on ?? [])` is called exactly once per fetch, unconditionally — no `if (config.comparison)` branch anywhere in this file; the ordinary/comparison-diff split lives entirely inside `resolveQueryAndPairs()` itself (already unified there by a prior, separate feature — the resulting `{ sql, pairs }` is identically shaped either way). The destructured `sql` is stored in `resolvedSqlRef.current` and passed as `innerSql` to both `buildRowCountQuery(sql)` and `buildTableDrivenPageQuery({ innerSql: sql, ... })` — the exact same variable, same code path, regardless of which branch produced it. No code change made; confirmation only.

**Checkpoint**: all three user stories are independently functional together, and nothing real that worked before this feature regressed.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: documentation and final, whole-suite verification.

- [X] T023 [P] Update `CLAUDE.md` with a new numbered "Implementation order" entry for `059-server-side-pagination`, matching this project's own established per-feature documentation convention (real findings: the 100,000-row threshold and its measured justification, the `ROW_NUMBER()` synthetic-tiebreaker technique and why a natural unique key doesn't exist for real metrics, the `format()`-based search-parity finding, the depth-independence correction made during planning).
- [X] T024 [P] Update `project-docs/TABLE-PANEL-PROPOSAL.md`'s §8/§9 to mark the query-architecture recommendation as implemented (linking to `059-server-side-pagination`), matching this document's own established pattern of recording when a prior recommendation is acted on (e.g. its own `067`/`068` STATUS notes).
- [X] T025 Run `npx tsc --noEmit`, `npm run test:unit`, and the full `npm run test:integration` suite. Compare the full-suite result against this repo's own already-documented pre-existing baseline (per `CLAUDE.md`'s own repeatedly-recorded fixture-coupled failure counts) — use a real `git stash` A/B comparison for any failure whose relationship to this feature isn't immediately obvious, matching this project's own established discipline, before concluding a regression is or isn't real.

  **Confirmed.** `npx tsc --noEmit` clean. `npm run test:unit` 531/531 passing. The full integration suite (399 tests) needed `--workers=4` — the default (10 workers) reproduced a real, confirmed environmental resource-exhaustion cascade TWICE independently (mass ~3.1-3.2s failures across dozens of totally unrelated files, starting partway through the run, on a clean tree with nothing else running concurrently) — a genuine limitation of this machine under 10-way parallel Chromium+DuckDB-WASM load, not a code issue; reducing to 4 workers eliminated the cascade entirely (real, varied per-test timings throughout).

  Final tally at `--workers=4`: **284 passed, 115 failed** (12.3 min). Breakdown by file: `settingsModal.spec.ts`×31, `observablePlotPanel.spec.ts`×24, `tablePanel.spec.ts`×23, `scenarioManager.spec.ts`×16, `valueBoxPanel.spec.ts`×14, `flowmapPanel.spec.ts`×2, `dashboardShell.spec.ts`×2, `treemapPanel.spec.ts`×1, `panelExpand.spec.ts`×1, `lazyTabLoading.spec.ts`×1. Four of these counts are **exact matches** to `057-observable-plot-conversion`'s own already-documented pre-existing baseline (CLAUDE.md item 28: `observablePlotPanel.spec.ts`×24, `tablePanel.spec.ts`×23, `scenarioManager.spec.ts`×16, `valueBoxPanel.spec.ts`×14 — identical numbers), and `settingsModal.spec.ts` is close (31 vs. that baseline's 32) — this is the same, already-known, already-triaged test-infrastructure migration gap (`040-test-suite-migration` left ~9 spec files un-migrated off a retired fixture path), not a new regression. Confirmed directly, not assumed: `git log`/`git status` on `tablePanel.spec.ts` and `scenarioManager.spec.ts` (the two most TablePanel/panelQuery-adjacent-looking files) show both are completely untouched by this branch (last modified in unrelated, much earlier commits `b6c8d39`/`a280849`), and the one test whose title directly names TablePanel (`scenarioManager.spec.ts`'s "a genuine filter change still resets a TablePanel's search/page") was reproduced failing in full isolation, single-worker — root cause: it targets a fixture panel title, "Screenline Validation (Raw)," that no longer exists in this repo's current fixture set at all (a retired-content reference, the exact class of gap `040`'s own incomplete migration already left behind elsewhere). The 5 smaller, previously-unlisted failures (`flowmapPanel`/`dashboardShell`/`treemapPanel`/`panelExpand`/`lazyTabLoading`, 1-2 each) were each confirmed via `git log`/`git status` to be in files completely untouched by this branch — isolated, scattered single-test failures consistent with this project's own extensively-documented multi-worker flakiness, not a pattern pointing at 059's own changes.

  **The one cross-cutting change with a blast radius beyond `TablePanel.tsx`** — the `resolveActiveScenarios()` bug fix — was checked by direct code read (not assumed): `FlowMapPanel.tsx`/`SankeyPanel.tsx`/`ValueBoxPanel.tsx` all route their actual SQL text through `buildPanelQuery()`, which already short-circuits on `config.scenario` (singular) *before* any `$scenario` union placeholder ever reaches `sqlExpander.expand()` — so `resolveActiveScenarios()`'s corrected return value is a no-op for their query text specifically when `config.scenario` is set (the same "output is unused in that branch" property `buildPanelQuery()`'s own comment already documents). `ObservablePlotPanel.tsx`'s own `resolveInputOptionsView()` already checks `config.scenario ??` before ever calling `resolveActiveScenarios()`, short-circuiting identically. Zero of these four panel types' own spec files show a failure pattern suggesting this fix caused a regression (their handful of failures above are pre-existing, confirmed by git log).

  Zero failures occurred in `tablePanelOptionB.spec.ts` (6/6) or `tablePanelServerSidePagination.spec.ts` (4/4) — both ran and passed cleanly within this exact full-suite run (not just in isolation), confirming this feature's own regression coverage holds under real full-suite conditions, not only when run alone.
- [X] T026 Walk through `quickstart.md`'s five scenarios end-to-end against a real `npm run dev` session, confirming each one's stated expected outcome; delete every scratch Parquet file created along the way and confirm via `git status` that nothing was left committed.

  **Confirmed**, live, against a real vite dev server (127.0.0.1:5180, equivalent to `npm run dev`), via a throwaway Playwright-driven script (deleted after use): Scenario 1 (small real table, client mode, sorts instantly — separately reconfirmed by T020's full pass) — verified; Scenario 2 — `COUNT(*)` over 250,000 real rows resolved in 4.6ms, first-page 91.8ms, near-end-page 58.5ms (both well under 200ms, flat latency); Scenario 3 — raw value `48.23` displayed as `"48.2"`, searching by the displayed text correctly matched; Scenario 4 — sorting by the non-unique `primary_purpose` column produced `rowCount=distinctRn=250000`, `minRn=1`, `maxRn=250000` (gap-free, duplicate-free); Scenario 5 — confirmed by direct code read, see T022. Cleanup confirmed: scratch Parquet file deleted, `git status` shows nothing stray. **A real, useful finding along the way**: generating the Parquet file directly under `public/` (quickstart.md's own literal instruction) crashes Vite's dev server on Windows with an `fs.watch()` EBUSY error — a race between the DuckDB CLI process releasing its file handle and Vite's watcher picking up the new file. Worked around with the same tmpdir-then-copy technique the Playwright test fixtures already use (one atomic filesystem event instead of create-then-write-then-close) — `quickstart.md`'s own Scenario 2 snippet should be updated to match if this is hit again.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup (needs `TABLE_QUERY_MODE_THRESHOLD`) — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: depends on Foundational. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: depends on Foundational; in practice also depends on US1's T007/T008 (the query-driven fetch/render branch it extends) — not independent of US1 the way a typical two-feature split is, because search is a refinement of the same fetch path US1 builds. Still independently *testable* (T017 exercises search specifically) and independently *valuable* (US1 alone ships fast sort+pagination even if search parity lands a day later).
- **User Story 3 (Phase 5)**: depends on Foundational (needs `mode` resolution to exist) and, for T020/T021, on US1/US2 having landed (so there's something real to regression-check against) — but adds no new production code of its own, only verification.
- **Polish (Phase 6)**: depends on all three user stories being complete.

### Parallel Opportunities

- T002/T003 (different new functions, same file but non-overlapping) can be developed in parallel by different people, though both land in `panelQuery.ts`.
- T004, T006 can run in parallel with each other once their respective implementation tasks (T002/T003) land.
- T011/T013/T015 (three independent unit-test tasks for three independent new functions) can run fully in parallel.
- T023/T024 (documentation) can run in parallel with each other and with T025/T026.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. **STOP and VALIDATE**: run T006 against a real large synthetic table; confirm sort+pagination is fast and correct.
3. This alone already delivers the feature's primary, P1 value — search still falls back to whatever US1 leaves it at (see Phase 3's own checkpoint note) until US2 lands.

### Incremental Delivery

1. Setup + Foundational → US1 (fast sort/pagination) → US2 (search parity) → US3 (regression proof) → Polish.
2. Each user-story checkpoint is a real, demonstrable increment per `spec.md`'s own priority order.
