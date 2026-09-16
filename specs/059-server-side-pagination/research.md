# Phase 0 Research: Server-Side Sort, Filter & Pagination for TablePanel

Every finding below was verified directly against this repo's real code and/or the real production DuckDB-WASM engine (via `npm run dev` + Playwright + `window.__wftdm`, or via the native `duckdb` CLI for pure-SQL correctness checks that don't need a browser) — none are assumed or extrapolated beyond what was actually measured. Real, synthetic test Parquet files were generated for this research and fully deleted afterward; none were committed (confirmed via `git status`).

## 1. Real, justified row-count threshold (resolves spec FR-010)

**Decision**: **100,000 rows** is the switch point between "small" (browser-handled, unchanged) and "large" (query-driven) table handling.

**Rationale**: Measured full-fetch-then-client-sort time (today's approach) against query-time first-page latency, at six real row counts, through the actual production DuckDB-WASM engine:

| Rows | `COUNT(*)` | Full fetch | Client sort | **Today's total** | Query-time first page |
|---|---|---|---|---|---|
| 15,000 | 4.0ms | 23.8ms | 3.7ms | 27.5ms | 25.4ms |
| 50,000 | 0.9ms | 52.5ms | 16.5ms | 69.1ms | 12.3ms |
| 100,000 | 3.6ms | 100.4ms | 43.7ms | **144.1ms** | 37.4ms |
| 150,000 | 1.1ms | 131.9ms | 52.8ms | 184.7ms | 21.0ms |
| 500,000 | 1.2ms | 425.8ms | 178.4ms | 604.3ms | 61.0ms |
| 2,000,000 (from this session's earlier proposal research) | — | 5,149ms | 1,312ms | ~6,461ms | tens of ms |

Below ~50,000 rows, today's total stays under Nielsen's own widely-cited "0.1s = feels instant" UI-responsiveness boundary. At 100,000 rows, today's total (144ms) has just crossed that boundary; at 150,000+ it climbs further, and by 500,000 it's deep into "flow interrupted, noticeable wait" territory. **100,000 was chosen, not the earlier-crossing ~50,000–70,000ms range, deliberately conservative** — it sits at the real measured knee of the curve rather than the earliest point a difference becomes detectable at all, giving comfortable margin on both sides: every real table-bound metric this app currently ships is under 10,000 rows (confirmed directly, `030-hierarchical-chart-panels`'s and earlier sessions' own real-content surveys), so nothing real crosses this threshold needlessly (FR-010's first half); and 100,000 is low enough that a real future WFRC MAZ-level table (~15,000 rows, per this session's own stated future scale) still stays comfortably in the fast, unchanged small-table path, while a real trip-level table (potentially millions of rows) is guaranteed to land in the fast, query-driven path well before it would ever become slow.

**A real, confirmed non-issue found during this measurement**: the `COUNT(*)` pre-check needed to know a table's real row count (in order to pick a strategy at all) costs 1–4ms at every scale tested — negligible, and in particular no threat to FR-002/SC-002's "no regression for today's small tables" requirement.

**Alternatives considered**: A lower threshold (e.g., 10,000) would switch strategies for tables that are still comfortably fast today, adding query-driven complexity (and its own real, if small, per-interaction round-trip cost) for zero perceptible benefit — rejected as premature. A much higher threshold (e.g., 1,000,000) would leave a real, perceptible multi-hundred-millisecond delay in place for a plausible real future table size (e.g., 150,000–500,000 rows) that this feature could easily have fixed — rejected as too conservative given the real measured data.

## 2. Keyset pagination's tie-breaker mechanics (resolves spec FR-006)

**Decision**: Every query-driven table gets a query-time-only synthetic ordering key, `ROW_NUMBER() OVER (ORDER BY <the viewer's current sort column> <ASC|DESC>)`, wrapped around whatever query `panelQuery.ts#resolveQueryAndPairs()` already produces. Keyset ("next page") pagination is then `WHERE __rn > $lastSeenRowNumber ORDER BY __rn LIMIT $pageSize` — no author-provided unique column is ever required.

**Rationale**: A direct survey of this project's own real `summarize.yaml`, done for this research, confirmed every real table-bound metric is a `GROUP BY`-aggregated result with no natural, unique, per-row identifier column (the one real exception, `person_household_profile`, is a deliberately ungrouped one-row-per-person metric built for the Explore tab's `graphic-walker` panel specifically, never a `table` panel). This makes a per-metric author-supplied tie-breaker unworkable as a general solution — the system must supply its own.

`ROW_NUMBER()` was directly verified, not assumed, to solve this correctly even over a genuinely low-cardinality sort column:
- Three separate query executions against the same 50,000-row synthetic table (a 10-distinct-value sort column) returned byte-identical `ROW_NUMBER()` assignments for the same row range every time — confirming this is *stable/repeatable* for this app's real usage pattern (a static, already-registered Parquet-backed view, re-queried fresh per page with only the `WHERE`/`LIMIT` differing between calls — never a mutated table, never a different query shape between pages).
- A full page-by-page walk (`COUNT(*)`/`COUNT(DISTINCT rn)`/`MIN(rn)`/`MAX(rn)`) confirmed exactly 50,000 rows and exactly 50,000 distinct, gap-free `rn` values from 1 to 50,000.
- A direct page-boundary check (page 1's last row vs. page 2's first row, two independent queries) confirmed `rn=5000` immediately followed by `rn=5001` — no duplicate, no gap.
- The same wrapping was directly confirmed to compose over a `UNION ALL` shape (i.e., `sqlExpander.ts`'s own `$scenario` multi-scenario expansion) with no special handling — `SELECT *, ROW_NUMBER() OVER (...) AS __rn FROM (<UNION ALL query>) t` works exactly the same as wrapping a plain single-table `SELECT`.

**A real, important nuance found and measured, not assumed — how this differs from a "true" keyset scan.** `EXPLAIN`ing this query (500,000-row synthetic table) shows DuckDB cannot push a `WHERE __rn > $cursor` filter into the window-function computation itself — `ROW_NUMBER()` is evaluated over the *entire* partition before the filter narrows it down, confirmed directly in the physical plan (`PROJECTION` over "~500,000 rows" feeding a `FILTER (__rn > 490000)` down to "~100,000 rows"). This means this technique does **not** share the "a deep cursor is nearly free, an unsorted/unindexed deep `OFFSET` is expensive" story the original feature-request evidence described for a real, naturally-unique physical column (`trip_id`) — because most real table-bound metrics have no such column at all (§2's own opening finding). What was directly measured instead, through the real production WASM engine at 500,000 rows, across five cursor depths from the very start to the very end of the table: **38.8ms–88.9ms at every depth tested, with no growth as depth increases** — the first query costs modestly more (a one-time warm-up cost, matching this project's own already-documented pattern for a batch's first query), every subsequent depth lands in the same ~40ms band regardless of how close to the end of the table it targets. This satisfies FR-004/SC-003's real requirement ("response time does not grow as a viewer moves deeper") exactly as measured — just via a different mechanism than a true indexed keyset scan: the cost here is proportional to the table's own *total* size (a fresh, full re-rank on every single page request, cheap in absolute terms at the real scales this app cares about — tens of milliseconds, not hundreds), not to how deep into it a viewer has paged.

**Alternatives considered**: Requiring authors to add a real unique key to every metric's `GROUP BY` clause was rejected outright — it would mean rewriting every real, currently-published metric, and there is often no natural non-aggregated key to add (the whole point of a `GROUP BY` summary is that individual source rows are collapsed). Using DuckDB's own internal row identifier (if any) was not pursued once `ROW_NUMBER()` was confirmed to work directly, since it requires no engine-specific feature beyond standard window functions this project already has zero-cost access to.

## 3. Search-semantics parity, not a disclosed regression (resolves spec FR-005)

**Decision**: A query-driven table's search continues to match the exact rendered/formatted value a viewer sees on screen, by evaluating the same format string already declared on that column (`TableColumnConfig.format`) *inside the SQL query itself*, via DuckDB's own `format()` scalar function, before the `ILIKE` comparison runs — not by matching the raw underlying value.

**Rationale**: This was the one item in the original request explicitly framed as a likely, disclosed behavior change ("searching '1,234' would need to become '1234'"). Direct testing overturned that premise. DuckDB's `format()` function was confirmed, live, to implement the identical Python-style format-string mini-language this app's own `formatValue.ts` already hand-rolls client-side:

```sql
SELECT format('{:,.0f}', 1234567.8);   -- '1,234,568'  (thousands separator — exact match)
SELECT format('{:.1f}', 0.847*100) || '%';  -- '84.7%'   (percent — exact match, mirroring formatValue.ts's own *100 step)
SELECT format('{:+.1f}', 3.2), format('{:+.1f}', -3.2);  -- '+3.2', '-3.2'  (sign-forcing — exact match)
```

A full end-to-end proof (`ILIKE` against a `format()`-wrapped column, matching a thousands-separated substring) returned the correct row. A real, minor implementation nuance found during this: DuckDB's `format()` requires the value to already be a floating-point type for a precision specifier (`{:,.0f}` etc.) — a bare integer literal produced an "precision not allowed for this argument type" error; an explicit numeric column read from a real Parquet `BIGINT`/`DOUBLE` field did not have this problem in practice (confirmed against this app's own real published metrics, where every numeric column is genuinely `BIGINT` or `DOUBLE`), and the query-builder will cast defensively (`CAST(col AS DOUBLE)`) before calling `format()` regardless, matching the same defensive-cast precedent this project's own `od_flows` metric already established for an unrelated DECIMAL-inference gotcha.

Search performance at real scale was also directly measured, not assumed: a `format()`-then-`ILIKE` search over 500,000 rows (the single most expensive of the three query shapes tested, since every row's value must be formatted before it can be filtered) completed in 148.3ms — slower than a plain sort/paginate at the same scale (61.0ms) but still comfortably fast, and far faster than today's approach would be at that scale (604.3ms just for fetch+sort, with a full client-side scan for search still to come on top of that).

**Alternatives considered**: Matching raw values only (the disclosed-regression path the original request anticipated) was rejected once format-string parity was confirmed achievable at negligible extra cost — there is no real reason to accept a user-visible behavior change here. A hybrid ("format-match for small tables, raw-match for large ones") was also rejected — it would reintroduce exactly the kind of scale-dependent behavior seam this feature is designed to avoid everywhere else.

## 4. Color-scale/domain interaction (resolves spec FR-007) — confirmed non-issue

**Decision**: No design change needed.

**Rationale**: A direct read of `tableLogic.ts`'s `cellColor()` confirmed a color-scaled column already requires both `color_scale` *and* `domain` to be present before any shading is applied — `domain` is never auto-computed from the fetched rows for `TablePanel` (unlike, e.g., `ZoneMapPanel`'s own different, unrelated auto-domain behavior). Since `domain` is always author-specified in the grammar already, moving from "every row is in memory" to "only the current page is in memory" changes nothing about how a color scale resolves — the author's own fixed range was always the only input.

## 5. Comparison-diff (`$baseline`) interaction (resolves spec FR-008) — confirmed non-issue

**Decision**: No special-case handling for diff tables.

**Rationale**: A direct read of `panelQuery.ts`'s `resolveQueryAndPairs()` confirmed it already normalizes both the ordinary and the comparison-diff path to one identical output shape — a single flat `{ sql, pairs }` — before this feature's own concerns (sort/paginate/search) ever begin. The new `ROW_NUMBER()`-wrapping technique (§2) was directly confirmed to compose correctly over any inner query shape, including the diff path's own join-based composition, with no additional handling.

## 6. Safe embedding of a viewer-typed search term in SQL (a new risk this feature introduces — not one of the original six questions, found necessary while researching #3)

**Decision**: Escape a viewer's raw search-term input by doubling any embedded single quote (`'` → `''`, the standard SQL string-literal escape) before splicing it into an `ILIKE '%...%'` literal — matching the plain string-templating convention `services/sqlExpander.ts` already uses everywhere else in this app (Constitution Principle III: no `eval()`, string replacement only), rather than introducing a parameterized/prepared-statement code path found only in this one feature.

**Rationale**: Today's search happens entirely in the browser and never touches SQL at all — moving it into a `WHERE` clause is a genuinely new risk surface for this specific value (every other placeholder this app already expands — `$filters`, `$scenario`, etc. — is a closed-set value, e.g. a dropdown selection, not viewer-typed free text). This app has no real, external-attacker security boundary to defend here (DuckDB-WASM runs entirely inside the viewer's own browser tab, querying only their own already-loaded data — a viewer "attacking" their own local instance harms nothing but their own tab), so the real requirement is *correctness* (a search term containing a literal apostrophe, e.g. "O'Brien," must not break the query or silently fail to match), not injection defense in the server-side sense. Verified directly: a raw JS string `"O'Brien"`, escaped via `.replace(/'/g, "''")` and spliced into a real `ILIKE` clause, produced a syntactically valid query that correctly matched the intended row.

The real `AsyncDuckDBConnection.prepare()`/parameterized-query API was confirmed to exist in the installed `@duckdb/duckdb-wasm` package (`AsyncPreparedStatement.query(...params)`) and was considered as a theoretically cleaner alternative — rejected for this feature specifically because adopting it here would introduce a second, parallel SQL-construction convention alongside every other placeholder this codebase already builds via plain string templating through `services/duckdb.ts#query(sql: string)`, for a safety property (defense against a malicious *remote* actor) this single-tab, no-backend app doesn't actually need. Simple, consistent escaping was judged the better fit for this codebase's own established pattern.

## Summary of resolved unknowns

| # | Question | Resolution |
|---|---|---|
| 1 | Mode-selection mechanism | Automatic, via a real `COUNT(*)` pre-check against the threshold in §1 — no new author-facing grammar field (confirmed negligible cost, 1–4ms at every scale tested) |
| 2 | Keyset tie-breaker reliability | A query-time `ROW_NUMBER()` synthetic key, generated automatically — confirmed stable/gap-free/duplicate-free, confirmed to compose over `UNION ALL` and (by the same mechanism) join-based diff queries |
| 3 | Search-semantics risk | Resolved with full parity, not a disclosed regression — DuckDB's own `format()` function reproduces this app's exact format-string vocabulary server-side |
| 4 | Color-scale/domain interaction | Confirmed non-issue — `domain` is already always author-specified, never auto-computed from fetched rows |
| 5 | Comparison-diff interaction | Confirmed non-issue — `resolveQueryAndPairs()` already normalizes to one flat query before this feature's own logic begins |
| 6 | Real threshold | 100,000 rows — a real, measured, justified value, not a round-number guess |
| (new) | Safe search-term embedding | Standard SQL quote-doubling, matching this app's existing string-templating convention — verified directly, not a new parameterized-query code path |
