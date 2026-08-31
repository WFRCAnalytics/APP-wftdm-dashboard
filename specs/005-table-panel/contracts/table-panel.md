# Contract: `TablePanel` (`src/panels/TablePanel.tsx`)

Satisfies: FR-001, FR-002, FR-007 through FR-015. The third panel type —
proves config → query → interactive table, following exactly the shape
`contracts/valuebox-panel.md`/`contracts/plotly-panel.md` (`003`) already
established.

## Shape

```tsx
export function TablePanel({ config }: PanelProps<TablePanelConfig>) {
  const filters = useFilterState(/* derived from config.filter, or ALL_FILTERS — identical to ValueBoxPanel/PlotlyPanel */)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [sortState, setSortState] = useState(
    config.sort ? { column: config.sort.column, direction: config.sort.order } : null,
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(config, appState.getActive().map((s) => s.name))
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)
    query(sql)
      .then((result) => {
        if (cancelled) return
        if (result.length === 0) { setState('empty'); return }
        setRows(result)
        setState('ready')
        // A genuinely new result set — all three client-only view states
        // reset, not just two of three (spec.md's Edge Cases: "any active
        // client-only sort/search/page state resets to its defaults
        // against the new result set"). sortState reverts to config.sort
        // (or null, natural order) — not left at whatever the user last
        // clicked, which described an ordering over rows that no longer
        // exist as fetched.
        setSortState(config.sort ? { column: config.sort.column, direction: config.sort.order } : null)
        setSearchTerm('')
        setCurrentPage(0)
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [config, filters])

  if (state === 'loading') return <TableSkeleton />
  if (state === 'empty') return <PanelEmptyState icon={TableIcon} message="No data for this selection" />
  if (state === 'error') return <PanelErrorState message="Couldn't load this table" />

  const columns = resolveColumns(config, rows)
  const filtered = searchTerm ? filterRows(rows, columns, searchTerm) : rows
  const sorted = sortState ? sortRows(filtered, sortState.column, sortState.direction) : filtered
  const pageSize = config.pagination ?? 20
  const pageRows = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  return (
    <div>
      {config.searchable && <SearchInput value={searchTerm} onChange={(v) => { setSearchTerm(v); setCurrentPage(0) }} />}
      <table>
        <TableHeader columns={columns} sortState={sortState} onSort={/* toggle/switch column, per FR-007 */} />
        <TableBody rows={pageRows} columns={columns} />
      </table>
      {sorted.length > pageSize && (
        <Pagination current={currentPage} total={Math.ceil(sorted.length / pageSize)} onChange={setCurrentPage} />
      )}
    </div>
  )
}
```

(Illustrative — the load-bearing contract is the *order of operations*
`filtered → sorted → pageRows`, matching spec.md's own stated sequence,
and that `resolveColumns`/`filterRows`/`sortRows`/`cellColor` are the
`tableLogic.ts` functions `contracts/table-logic.md` defines, not
re-derived inline here.)

The full `buildPanelQuery` → `resolveActiveScenarios` → `sqlExpander.
expand()` → `query()` chain is identical to `ValueBoxPanel`/`PlotlyPanel`
— `contracts/panel-query.md`'s (`003`) "Composing with sqlExpander.
expand()" section, reused verbatim, not re-derived. `PanelEmptyState`/
`PanelErrorState` are the same shared components those two panel types
already use — no new state-handling pattern (FR-013).

Two distinct reset rules, not to be conflated: **within** an already-
loaded result set, searching resets `currentPage` to `0` (a search can
change the total row count, so a stale page index could point past the
end of the now-filtered set), while sorting alone does not (row count is
unchanged by sorting). **Across** a genuine refetch (the effect's success
handler, triggered by `config`/`filters` changing), all three —
`sortState`, `searchTerm`, `currentPage` — reset together, unconditionally.
These are different situations: the first is about keeping pagination
consistent with the row count the user is already looking at; the second
is spec.md's Edge Cases requirement that no client-only view state survives
a genuinely new fetched result — `sortState` is exactly as much
"client-only view state" as the other two, so it was a real gap, not a
deliberate omission, that an earlier draft of this contract only reset
two of the three.

## Given/When/Then

- **Given** a `TablePanelConfig` querying a real metric, **when** the
  panel mounts, **then** the rendered table's columns/rows match
  `resolveColumns`/the query result exactly (FR-001, FR-002, US1).
- **Given** the user clicks a column header, **when** the table
  re-renders, **then** row order changes per `sortRows`, with no new
  `query()` call (FR-007, FR-012, US2).
- **Given** `config.sort` is set, **when** the panel first renders,
  **then** the initial row order already reflects it, before any click
  (FR-008).
- **Given** a result set larger than the effective page size, **when**
  the panel renders, **then** only `pageRows` (not the full sorted/
  filtered set) appears in the DOM, with pagination controls to reach the
  rest (FR-009, FR-010, US3).
- **Given** `config.searchable` and a search term matching a row on a
  page other than the one currently shown, **when** the term is entered,
  **then** that row appears in the (now re-paginated) filtered results —
  proving the filter genuinely ran against the full `rows` array, not
  `pageRows` (FR-011, US4).
- **Given** a table sorted by the user clicking a column header (not by
  `config.sort`), **when** a global filter change causes the panel's
  effect to re-run and successfully refetch, **then** the sort reverts to
  `config.sort`'s value — or natural (unsorted) order if `config.sort`
  is unset — not the user's prior click; the same refetch also clears any
  active search term and resets to the first page, all three together,
  not a subset of them (spec.md's Edge Cases).
- **Given** any table panel, **when** it's expanded via `004`'s
  mechanism, **then** it gets the same trigger/dialog behavior as any
  other registered panel type, with zero code in this file aware that
  mechanism exists (FR-015, SC-005) — and the current `sortState`/
  `searchTerm`/`currentPage` survive the expand/collapse round trip
  unchanged, since it's the same mounted component instance either way.

## Non-goals for this feature

- No CSV export, no column-level filtering beyond the single full-table
  search box (spec.md's own stated scope boundary).
- No virtualized/windowed rendering of `pageRows` — a page's worth of
  rows (default 20, or `config.pagination`) is assumed small enough to
  render directly; nothing about this feature's scope requires handling
  page sizes large enough to need virtualization.
