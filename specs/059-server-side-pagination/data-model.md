# Data Model: Server-Side Sort, Filter & Pagination for TablePanel

No new persisted or authored data entities — this feature is entirely about *how* an already-existing query result is sorted/filtered/paged, not about any new stored data shape. The entities below are the real, in-memory/runtime concepts this feature introduces or changes, expressed at the level `TablePanel.tsx`/`tableLogic.ts`/`panelQuery.ts` already work at.

## TableQueryMode

The per-panel, per-mount decision from spec FR-001, resolved once (via a real `COUNT(*)` query, confirmed to cost 1–4ms at every scale tested — `research.md` §1) and held for that panel's lifetime.

| Field | Type | Notes |
|---|---|---|
| `mode` | `'client' \| 'query-driven'` | `'client'` when the real row count is below the threshold; today's unmodified behavior. `'query-driven'` otherwise. |
| `rowCount` | `number` | The real count backing the decision — also reused directly for the "of Z rows"/"Page X of Y" pagination caption in either mode, so it is never re-queried a second time just to render that text. |

**Threshold**: 100,000 rows — a real, measured, justified constant (`research.md` §1), not author-configurable (spec FR-001/Assumptions).

**Lifecycle**: resolved once per fetch (the same point `TablePanel.tsx`'s existing effect already re-runs on `config`/`filters`/`activeScenarioNames`/`baseline` changes — see `panels/TablePanel.tsx`'s existing three-way-reset discussion). A table does not change mode mid-session even if its own real row count would newly cross the threshold on a later refetch within the same mount, matching the spec's own Edge Cases entry ("a table does not switch handling strategy while a viewer is actively interacting with it") — the mode is fixed at the moment a genuinely new content fetch begins, alongside the existing `isContentChange`-gated reset of `sortState`/`searchTerm`/`currentPage`.

## SortState

**Unchanged** from today's real shape (`TablePanel.tsx`'s existing `SortState` type): `{ column: string; direction: 'asc' | 'desc' } | null`. Both modes read/write this identically — a query-driven table's sort click sets the same state today's client-sort click does; only what happens *after* that state changes differs (a re-fetch instead of a local re-sort).

## PagePosition

A plain page index (`currentPage: number`, 0-based) — **identical in both modes**, per the real, measured finding in `research.md` §2 that a query-driven table's own per-page cost does not depend on which page is requested. No separate "cursor" or "last seen row" concept is introduced; "jump to page N" (including the last page, computed from `TableQueryMode.rowCount`) is a direct translation, not an incremental walk.

**Client mode** (unchanged): `sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize)` — today's existing code, untouched.

**Query-driven mode** (new): a page request translates to a row-number range inside the wrapped query (see `contracts/query-shapes.md`) — `WHERE __rn > currentPage * pageSize ORDER BY __rn LIMIT pageSize`. `currentPage` is computed the same way in both modes (`Math.min(currentPage, pageCount - 1)`, `pageCount = Math.ceil(rowCount / pageSize)`), so every existing pagination-UI control shipped in `067` (first/previous/next/last, the "Showing X–Y of Z rows" caption) needs zero visible change for either mode.

## SearchTerm

**Unchanged shape** (`string`), but its effect diverges by mode:

- **Client mode**: unchanged — `tableLogic.ts#filterRows()`, matching against each visible column's own *rendered* value.
- **Query-driven mode**: becomes a `WHERE` predicate, one `format(<col>, '<that column's own configured format string, or a plain string cast when none is configured>') ILIKE '%<escaped term>%'` clause per visible, non-hidden column, `OR`-joined — reproducing `filterRows()`'s own "any visible column matches" semantics and its render-then-match behavior (`research.md` §3), with the search term's own embedded single quotes doubled first (`research.md` §6).

## ResolvedColumn (existing type, `tableLogic.ts`) — no change

`ResolvedColumn`'s existing `valueType` field (from `068-column-type-indicators`, already shipped) is reused directly to decide, per column, whether the query-driven search predicate needs the `format()` wrapping at all — a `'string'`-typed column's own raw value already *is* its rendered value (no format string ever applies to a text column in this app's grammar), so only `'number'`-typed columns with a configured `format` need the `format()` wrapper; every other column type matches its raw value directly via a plain `CAST(... AS VARCHAR) ILIKE ...`.

## QueryShape (conceptual — see `contracts/query-shapes.md` for the literal SQL)

The wrapping this feature adds around whatever `panelQuery.ts#resolveQueryAndPairs()` already produces (unchanged — `research.md` §5 confirmed no special-casing is needed for the comparison-diff path):

```
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (ORDER BY "<sortColumn>" <ASC|DESC>) AS __rn
  FROM (<resolveQueryAndPairs()'s own existing sql>) t
  [WHERE <search predicate, if searchTerm is non-empty>]
)
WHERE __rn > <currentPage * pageSize>
ORDER BY __rn
LIMIT <pageSize>
```

`__rn` is a synthetic, query-scoped column — never persisted, never exposed to `tableLogic.ts`'s existing `ResolvedColumn`/rendering logic, stripped implicitly by only ever destructuring the real columns back out of each returned row.
