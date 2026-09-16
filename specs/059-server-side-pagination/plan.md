# Implementation Plan: Server-Side Sort, Filter & Pagination for TablePanel

**Branch**: `059-server-side-pagination` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/059-server-side-pagination/spec.md`

## Summary

`TablePanel.tsx` currently fetches a metric's entire result set once and does every sort/search/page operation on the full, already-in-memory array (`tableLogic.ts`'s `sortRows()`/`filterRows()`). Real, measured evidence (this session, both the preceding `TABLE-PANEL-PROPOSAL.md` research and this plan's own Phase 0) confirms that costs nothing perceptible below ~100,000 rows but grows into multi-second territory at real future WFRC scale (millions of rows).

This plan adds a second, query-driven code path, chosen automatically per panel via a cheap `COUNT(*)` check against a real, measured 100,000-row threshold. Below it, nothing changes. At or above it: sort/paginate is done by wrapping whatever `panelQuery.ts#resolveQueryAndPairs()` already produces in a `ROW_NUMBER() OVER (ORDER BY <sort column>)`-numbered subquery and requesting one page's row-number range at a time (verified, live, to be gap-free, duplicate-free, and flat-latency regardless of page depth — even over a real, non-unique sort column, which is what every real table-bound metric actually has); search becomes a `WHERE` predicate that reproduces today's client-side "match the rendered value" behavior exactly, using DuckDB's own `format()` function against each column's existing configured format string. Color-scale shading and comparison-diff (`$baseline`) tables need no special handling — both were confirmed, by direct code reading, to already be structurally compatible. No new dependency, no new grammar field, no change to any other panel type.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), matching this app's existing `src/` throughout (Constitution Principle I).

**Primary Dependencies**: None new. Reuses `services/duckdb.ts` (the existing, sole `AsyncDuckDB` instance — Constitution Principle II), `panels/panelQuery.ts`, `services/sqlExpander.ts`, and `panels/tableLogic.ts`, all unmodified in their existing exports; this feature adds new functions alongside them rather than changing what already exists.

**Storage**: N/A (no new persisted data) — real Parquet-backed DuckDB-WASM views, already registered by the existing scenario-discovery/tab-data-loader machinery (Constitution Principle V), queried through the one existing shared connection.

**Testing**: Vitest (`tests/unit/`) for new pure query-building/type-classification logic; Playwright (`tests/integration/`) for real, live-browser verification against both a small (existing demo content) and a real, generated-then-discarded large synthetic Parquet file — matching this session's own established methodology (`research.md`, `quickstart.md`).

**Target Platform**: Browser (the existing Vite-built SPA); no server component.

**Project Type**: Single project — this repo's `src/` web front-end only (no backend/mobile counterpart exists or is touched).

**Performance Goals**: Per spec SC-001/SC-003 — sub-200ms response for sort/search/page actions on a real large (hundreds of thousands to millions of rows) table, with response time flat regardless of how deep into the result set a viewer navigates. Concretely, per `research.md`'s own real measurements: a query-driven page request costs roughly 40–90ms at 500,000 rows, at every depth tested, vs. ~600ms (and climbing) for today's fetch-and-sort approach at the same scale.

**Constraints**: Exactly one shared `AsyncDuckDB` instance, single Worker, fully serialized query execution (Constitution Principle II; re-confirmed directly this session on a 2,000,000-row dataset — concurrent queries buy no throughput, though a single query's own latency is unaffected by that, which is what this feature relies on). SQL MUST be built via plain string templating only, never `eval()` (Constitution Principle III) — a genuinely new risk surface this feature introduces (a viewer-typed search term reaching a `WHERE` clause for the first time in this codebase) is handled by standard SQL quote-doubling, matching the existing templating convention, not a new parameterized-query code path (`research.md` §6). No new npm dependency (Constitution Principle VI) — every SQL feature used (`ROW_NUMBER()`, `format()`) is already available in the DuckDB-WASM version this app already ships.

**Scale/Scope**: `TablePanel.tsx`/`tableLogic.ts`/`panelQuery.ts` only. Real current demo content stays entirely on the unmodified small-table path (every real table-bound metric today is under 10,000 rows). The large-table path exists for the real, stated future WFRC scale (~15,000 MAZ-level rows — itself still under the 100,000 threshold and thus unaffected; millions of person/trip-level rows — squarely the scale this path targets).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle | Check | Result |
|---|---|---|
| I. TypeScript throughout | All new/changed code is `.ts`/`.tsx`; no plain `.js` added | PASS |
| II. DuckDB-WASM off main thread, one shared instance | Every new query (`COUNT(*)`, the `ROW_NUMBER()`-wrapped page request, the search-predicate variant) runs through the existing `services/duckdb.ts#query()` / the one existing `AsyncDuckDB` instance; no new instance, connection, or Worker is created | PASS |
| III. No `eval()`, string-templating only | New SQL is built the same way `panelQuery.ts`/`sqlExpander.ts` already build every other query — plain string interpolation. The one genuinely new risk (a viewer-typed search term) is handled with standard SQL quote-doubling, verified directly (`research.md` §6), not `eval()` or any dynamic-code mechanism | PASS |
| IV. YAML parsed at runtime | No new `dashboard-*.yaml` field — mode selection is fully automatic (spec FR-001/Assumptions) | PASS (N/A — nothing new to parse) |
| V. Parquet-only browser I/O | No new data-loading path — every query in this feature reads from already-registered Parquet-backed views exactly as today | PASS |
| VI. Fixed technology choices | No new dependency; `ROW_NUMBER()` and `format()` are existing DuckDB SQL features, not a new package | PASS |
| VII. Minimal, fixed config file set | No new config file type | PASS (N/A) |
| VIII. Reuse proven reference implementations | Not applicable — no MapLibre/deck.gl/spatial/coi-serviceworker concern in this feature | N/A |
| IX. Fixed Python/JS source split | No Python change | PASS (N/A) |

**No violations. No Complexity Tracking entries required.**

**Post-Phase-1 re-check**: Phase 0/1 design (`research.md`, `data-model.md`, `contracts/query-shapes.md`) introduced no new dependency, no new config file, no `eval()`-equivalent, and no change to any other panel type's own query path — the table above still holds unchanged after design. One design refinement worth noting here because it affects the Constitution Check's own Principle III row: the originally-considered alternative for safe search-term embedding was DuckDB-WASM's real `AsyncDuckDBConnection.prepare()`/parameterized-query API (confirmed to exist, `research.md` §6) — deliberately NOT adopted, specifically to keep this feature inside the same plain-string-templating convention Principle III already establishes for every other placeholder in this codebase, rather than introducing a second, parallel SQL-construction mechanism.

## Project Structure

### Documentation (this feature)

```text
specs/059-server-side-pagination/
├── plan.md              # This file
├── research.md          # Phase 0 output — real, measured findings
├── data-model.md        # Phase 1 output — TableQueryMode/SortState/PagePosition/SearchTerm/QueryShape
├── quickstart.md         # Phase 1 output — runnable validation scenarios
├── contracts/
│   └── query-shapes.md   # Phase 1 output — the literal SQL contract between TablePanel.tsx and panelQuery.ts
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created by this command)
```

### Source Code (repository root)

Single project — this repo's existing `src/` web front-end. No new top-level directory; every touched/added file sits alongside its existing siblings.

```text
src/
├── panels/
│   ├── TablePanel.tsx        # gains: COUNT(*) mode check, a second (query-driven) fetch/page-request
│   │                         # path alongside the existing client-mode one; pagination-footer/column-
│   │                         # visibility JSX (067/068) unchanged — both modes feed the same rendering code
│   ├── tableLogic.ts         # existing resolveColumns()/cellColor()/ResolvedColumn.valueType (068) reused
│   │                         # unmodified; sortRows()/filterRows() remain the client-mode implementation,
│   │                         # untouched
│   └── panelQuery.ts         # gains new, additive query-building functions (mode-detection COUNT(*),
│                              # the ROW_NUMBER()-wrapped page request, the search-predicate builder) —
│                              # resolveQueryAndPairs()/buildPanelQuery()/buildComparisonDiffQuery() stay
│                              # exactly as they are; this feature only wraps their output
├── services/
│   ├── duckdb.ts              # unchanged — existing query()/registerFileURL() reused as-is
│   └── sqlExpander.ts         # unchanged — $scenario/$filters expansion already happens before this
│                              # feature's own wrapping begins
└── layout/types.ts            # unchanged — no new TablePanelConfig/TableColumnConfig field

tests/
├── unit/
│   ├── tableLogic.test.ts     # existing, unmodified (no change to the functions it covers)
│   └── panelQuery.test.ts     # gains cases for the new query-building functions (pure, no DOM/browser)
└── integration/
    ├── tablePanelOptionB.spec.ts   # existing (067/068), unmodified — exercises only real, small demo
    │                               # content, which stays on the unmodified client-mode path
    └── (new) a server-side-pagination-focused spec, following this repo's own established real-
        synthetic-scale-test pattern (register a real, generated-then-discarded large Parquet file
        directly via window.__wftdm.registerFileURL(), never a checked-in large fixture)
```

**Structure Decision**: No structural change to this repo's existing single-project layout. This feature is additive within three already-existing files (`TablePanel.tsx`, `tableLogic.ts`, `panelQuery.ts`) plus their existing test siblings — no new directory, no new panel type, no new service module.

## Complexity Tracking

*No entries — the Constitution Check above found no violations to justify.*
