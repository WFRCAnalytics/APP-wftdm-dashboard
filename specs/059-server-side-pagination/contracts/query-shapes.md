# Contract: Query Shapes for TablePanel's Server-Side Mode

The internal contract between `TablePanel.tsx` and the query-building layer (`panelQuery.ts`/`services/duckdb.ts`) once a table is in `query-driven` mode (`data-model.md`'s `TableQueryMode`). Every shape below was verified directly against a real DuckDB instance during Phase 0 research (`research.md`), not written speculatively.

`resolveQueryAndPairs()` (existing, unmodified — `panelQuery.ts`) is always called first and always produces one flat `{ sql, pairs }`, regardless of whether the panel is an ordinary table or a `comparison: diff` table. Everything below wraps that `sql` string; none of it needs to know or care which kind of query it originally was (`research.md` §5).

## 1. Mode-detection query

Run once per genuine content change (the same point the existing fetch effect already re-runs), before the real page query:

```sql
SELECT COUNT(*) FROM (<resolveQueryAndPairs().sql>) t
```

- Cost: 1–4ms at every real scale measured (`research.md` §1) — negligible even for a small table.
- The result becomes `TableQueryMode.rowCount`, reused directly for the "Page X of Y" / "Showing X–Y of Z rows" caption in either mode — never queried a second time for that purpose.
- `rowCount < 100_000` → `mode = 'client'`; the existing, fully unmodified fetch-everything path runs exactly as it does today (no other query in this contract applies).
- `rowCount >= 100_000` → `mode = 'query-driven'`; every query below applies.

## 2. Query-driven page request (no search term)

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (ORDER BY "<sortColumn>" <ASC|DESC>) AS __rn
  FROM (<resolveQueryAndPairs().sql>) t
)
WHERE __rn > <currentPage * pageSize>
ORDER BY __rn
LIMIT <pageSize>
```

- `<sortColumn>` is `sortState.column` when set. **Correction, made during implementation**: when `sortState` is `null` (no author-configured `sort:` and no viewer click yet), the original plan here was to fall back to the first resolved column — but `resolveColumns()` cannot always name one before any row has been fetched (when `config.columns` is unset, the derived-columns branch needs a real row to derive from — the exact same chicken-and-egg constraint client mode already has, where `sortState === null` today means "unsorted, natural order," not "sorted by the first column"). The real fix: `ROW_NUMBER() OVER ()` — a fully empty `OVER` clause — is valid SQL and produces the table's own natural/scan-order row numbers, verified live. This is still fully deterministic and gap-free for pagination (FR-006's own real requirement) — it just doesn't impose an ordering the small-table path doesn't already impose either. `buildTableDrivenPageQuery()`'s own `sortColumn` parameter is therefore `string | null`, with `null` mapped to `OVER ()`.
- Verified directly: gap-free, duplicate-free across a full page-by-page walk (`research.md` §2); response time flat across cursor depth (38.8–88.9ms at 500,000 rows, every depth tested); composes correctly over a `UNION ALL`-shaped inner query (the `$scenario` multi-scenario case) with no modification.

## 3. Query-driven page request (with a search term)

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (ORDER BY "<sortColumn>" <ASC|DESC>) AS __rn
  FROM (<resolveQueryAndPairs().sql>) t
  WHERE (
    <perVisibleColumnPredicate1>
    OR <perVisibleColumnPredicate2>
    OR ...
  )
)
WHERE __rn > <currentPage * pageSize>
ORDER BY __rn
LIMIT <pageSize>
```

Verified directly: a `WHERE` clause on the same nesting level as the `ROW_NUMBER()` computation is applied *before* the window function runs (standard SQL evaluation order — confirmed live, not assumed: a 5-row/2-category test table filtered to 3 matching rows before being re-numbered 1–3, not left with its original, pre-filter row identifiers) — so pagination against a search result is automatically, correctly scoped to the filtered set, not the whole table.

Each `perVisibleColumnPredicateN` depends on that column's real value type (`ResolvedColumn.valueType`, from `068-column-type-indicators`, reused directly):

| `valueType` | Has a configured `format`? | Predicate |
|---|---|---|
| `'number'` | Yes | `format(CAST("<field>" AS DOUBLE), '<format string, brace-stripped>') ILIKE '%<escaped term>%'` |
| `'number'` | No | `CAST("<field>" AS VARCHAR) ILIKE '%<escaped term>%'` |
| `'string'` | (n/a — no format ever applies to a text column in this grammar) | `"<field>" ILIKE '%<escaped term>%'` |
| `'boolean'` | (n/a) | `CAST("<field>" AS VARCHAR) ILIKE '%<escaped term>%'` |
| `'unknown'` | (n/a) | omitted entirely — an all-null column can never match a real search term |

Only **visible** columns (`hiddenColumns`, from `067`) get a predicate — matching `filterRows()`'s own existing "search only what's currently shown" behavior exactly (`TablePanel.tsx`'s own `visibleColumns` filter, unchanged).

`<escaped term>` is the viewer's raw search string with every embedded `'` doubled (`term.replace(/'/g, "''")`) — verified directly against a real value containing an apostrophe (`research.md` §6).

`format()`'s real, exact format-string syntax is what `formatValue.ts` already parses (post the `067` bare/braced-form fix) with its own leading `{:`/trailing `}` stripped, since DuckDB's `format()` takes the bare `{...}` spec directly (`format('{:,.0f}', v)`, not `format('{:{:,.0f}}', v)`) — verified directly (`research.md` §3).

## 4. Row-count query for a search result (needed for "Showing X–Y of Z rows"/"Page X of Y" once a search term narrows the result)

```sql
SELECT COUNT(*) FROM (<resolveQueryAndPairs().sql>) t
WHERE (
  <perVisibleColumnPredicate1>
  OR <perVisibleColumnPredicate2>
  OR ...
)
```

Same predicate set as §3, without the `ROW_NUMBER()`/pagination wrapper — re-run whenever the search term changes (matching today's existing `handleSearchChange`-resets-`currentPage` behavior), not on every page click.

## What does NOT change

- `resolveQueryAndPairs()`, `buildPanelQuery()`, `buildComparisonDiffQuery()`, `sqlExpander.ts` — none of these are modified. This feature is additive wrapping around their existing, unmodified output.
- `tableLogic.ts`'s `resolveColumns()`/`cellColor()` — unmodified; a query-driven page's returned rows are shaped identically to a client-mode page's rows before either reaches rendering.
- The rendering layer (`TablePanel.tsx`'s JSX for the table/pagination footer/column-visibility menu, all shipped in `067`/`068`) — unchanged in either mode; only where the sorted/filtered/paginated row array *comes from* differs.
