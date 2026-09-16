# Quickstart: Validating Server-Side Sort, Filter & Pagination for TablePanel

Validates the three user stories in `spec.md` against a real running dev server. Every step below either reuses this app's own real, existing demo content (small-table stories) or a real, generated-then-discarded synthetic Parquet file at genuine large-table scale (matching the technique already used for this feature's own Phase 0 research, `research.md`) — never a mocked or hand-typed fixture.

## Prerequisites

```sh
npm run dev
```

Open the app; boot completes when `window.__wftdm` is available (the existing debug hook every real integration test in this repo already waits on).

## Scenario 1 — User Story 3: every existing small table is completely unaffected (run this first)

**Setup**: none — real, already-published demo content.

1. Open the **Tour** tab, "Mandatory Tour Frequency by Person Type" panel (a real `table` panel, well under the 100,000-row threshold).
2. Click a column header to sort; type a search term matching a real, comma-formatted numeric cell (e.g. a value shown as `"2,404"`, searched as `2,404`).
3. Page forward/backward.

**Expected**: identical behavior to before this feature — sort/search/paginate all happen instantly, with no visible change from `067`'s own already-shipped behavior. (Per `data-model.md`'s `TableQueryMode`, this panel resolves to `mode: 'client'` and takes none of this feature's new code paths at all.)

## Scenario 2 — User Story 1: a real large table stays fast

**Setup**: generate a real, throwaway synthetic Parquet file over the threshold, matching the exact technique `research.md` used (native DuckDB CLI, deleted after this scenario — never committed). **Confirmed during this feature's own T026 walkthrough**: writing directly to `public/` while `npm run dev` is running crashes Vite's dev server on Windows with an `fs.watch()` EBUSY error (a race between the DuckDB CLI process releasing its file handle and Vite's watcher picking up the new file) — write to a temp directory first, then copy into `public/` as one atomic step (the same technique this feature's own Playwright fixtures already use):

```sh
duckdb -c "
COPY (
  SELECT i AS trip_id, CAST(1 + random()*500000 AS INTEGER) AS person_id,
         ['work','school','shopping','social','eatout','escort','othmaint','othdiscr','univ','atwork'][1+CAST(random()*10 AS INTEGER)] AS primary_purpose,
         ROUND(0.1 + random()*49.9, 2) AS trip_distance
  FROM generate_series(1, 250000) AS t(i)
) TO '/tmp/_quickstart-scale-test.parquet' (FORMAT PARQUET);
"
cp /tmp/_quickstart-scale-test.parquet public/_quickstart-scale-test.parquet
```

Register and query it directly through the real production engine (no dashboard YAML needed for this validation step — the same technique `research.md`'s own measurements used):

```js
// in the browser console, or via Playwright's page.evaluate
await window.__wftdm.registerFileURL('quickstart_scale_test', location.origin + '/APP-wftdm-dashboard/_quickstart-scale-test.parquet')
```

**Expected** (per `contracts/query-shapes.md` §1–2):
- `SELECT COUNT(*) FROM quickstart_scale_test` resolves in a few milliseconds and reports 250,000 — comfortably over the threshold, so `mode: 'query-driven'`.
- A sorted, paginated page request (§2's query shape, sorting by `trip_distance`) returns in well under 200ms regardless of which page is requested — including a page near the very end of the result set (verify by requesting a page near `rowCount / pageSize`, not just the first page).
- Delete `public/_quickstart-scale-test.parquet` when done — it must never be committed.

## Scenario 3 — User Story 2: search still finds what a viewer sees on screen

**Setup**: reuse Scenario 2's registered `quickstart_scale_test` view.

1. Confirm the real, formatted appearance of a numeric value from a page request (e.g. `trip_distance` shown to one decimal place).
2. Search using that exact displayed text.

**Expected** (per `contracts/query-shapes.md` §3, `research.md` §3): the row is found — the search predicate matches the `format()`-wrapped value, not the raw underlying number. Cross-check by running the equivalent client-mode search (Scenario 1's small table, an author-formatted numeric column) and confirming the same *kind* of term (a formatted string, not a raw number) is what finds a match in both modes.

## Scenario 4 — Edge case: sorting by a real non-unique column pages correctly

**Setup**: reuse `quickstart_scale_test` (its `primary_purpose` column has only 10 distinct values across 250,000 rows).

1. Sort by `primary_purpose`.
2. Walk every page from the first to the last (or, faster, directly request page 0, a middle page, and the last page).

**Expected** (per `research.md` §2, `contracts/query-shapes.md` §2): every row appears on exactly one page — no row skipped, no row duplicated across the boundary between two pages, even though most rows share one of only 10 distinct sort-column values. The last page's own request costs about the same as the first page's (flat latency, not a slow "deep scan").

## Scenario 5 — Comparison-diff (`$baseline`) table at large scale

**Setup**: requires a real dashboard panel with `comparison: diff` bound to a metric that would exceed the threshold — not available in this repo's own current demo content (every real metric today is well under 100,000 rows). Validate this scenario against `contracts/query-shapes.md`'s own stated contract instead: confirm, by reading `panelQuery.ts#resolveQueryAndPairs()`'s real, current comparison-diff branch, that it returns the same flat `{ sql, pairs }` shape the ordinary branch does, and confirm (via a direct query, using a hand-built `buildComparisonDiffQuery()`-shaped SQL string wrapped exactly per `contracts/query-shapes.md` §2) that the wrapping composes without modification — the same check `research.md` §5 already performed during Phase 0.

## Cleanup

```sh
rm -f public/_quickstart-scale-test.parquet
```

Confirm via `git status` that no scratch file from this quickstart is tracked.
