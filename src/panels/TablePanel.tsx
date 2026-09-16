import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Columns3,
  Hash,
  Search,
  SearchX,
  Table as TableIcon,
  Text,
  ToggleLeft,
  type LucideIcon,
} from 'lucide-react'

import { query } from '@/services/duckdb'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { resolveScenarioLabel } from '@/panels/scenarioDisplay'
import { useBaseline } from '@/hooks/useBaseline'
import { ensureRegistered } from '@/services/tabDataLoader'
import {
  resolveQueryAndPairs,
  extractGlobalFilterIds,
  resolveTableQueryMode,
  buildRowCountQuery,
  buildSearchRowCountQuery,
  buildTableDrivenPageQuery,
  buildSearchPredicate,
  type TableQueryMode,
} from '@/panels/panelQuery'
import { formatValue } from '@/panels/formatValue'
import { cellColor, filterRows, resolveColumns, sortRows, type ColumnValueType } from '@/panels/tableLogic'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TablePanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*'] // module-level constant — stable identity,
// never an inline `?? ['*']` literal (that allocates a new array every render)

const DEFAULT_PAGE_SIZE = 20 // project-docs/GRAMMAR.md's own example value for
// `pagination:` — spec.md's Assumptions.

type SortState = { column: string; direction: 'asc' | 'desc' } | null

function initialSort(config: TablePanelConfig): SortState {
  return config.sort ? { column: config.sort.column, direction: config.sort.order } : null
}

// 059-server-side-pagination — buildRowCountQuery()/buildSearchRowCountQuery()
// (panelQuery.ts) both alias their result as `cnt`; `Number()` handles
// either a plain JS number or a bigint (DuckDB-WASM's own real, confirmed
// possible return shape for a COUNT(*)-derived value over a different
// code path than this one — 031-all-panel-demo-content's own finding —
// guarded here defensively at zero real cost).
function readCount(rows: Record<string, unknown>[]): number {
  return Number(rows[0]?.cnt as number | bigint | undefined)
}

// 068-column-type-indicators — matches gropaul/dash-ui's own real,
// confirmed convention (fetched directly, src/components/relation/
// common/value-icon.tsx): a small, per-column type glyph, leading the
// header label. Its own icon choices are ALREADY lucide-react (dash-ui
// depends on the same library this app's own constitution restricts
// icons to) — Hash/Text/ToggleLeft map 1:1, no adaptation needed;
// CircleHelp is dash-ui's own real fallback for an unrecognized/
// unclassifiable type, reused here for the 'unknown' case (an all-null
// column). dash-ui's own further cases (List/Struct/Map, via a live
// Arrow schema) are deliberately not ported — see tableLogic.ts's own
// inferColumnValueType() doc comment for why no real case in this app's
// query layer can ever produce one.
const COLUMN_TYPE_ICONS: Record<ColumnValueType, LucideIcon> = {
  number: Hash,
  string: Text,
  boolean: ToggleLeft,
  unknown: CircleHelp,
}

// The third panel type — see contracts/table-panel.md and
// specs/005-table-panel/research.md. Sort/pagination/search are all
// plain client-side operations over the one already-fetched `rows` array
// (FR-012) — no table library, per project-docs/SPEC.md's own "plain DOM"
// description (research.md §1).
export function TablePanel({ config }: { config: TablePanelConfig }) {
  // extractGlobalFilterIds (panelQuery.ts) — see ValueBoxPanel.tsx's own
  // comment on why this replaced an inline config.filter.replace(...) call.
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  // 009-scenario-manager (FR-008): reactive active-scenario set — see
  // ValueBoxPanel.tsx's own comment. Deliberately does NOT reset
  // sortState/searchTerm/currentPage itself (unlike a genuine new result
  // set below) — FR-008 requires exactly this: local UI state MUST survive
  // a scenario-activation-triggered refetch.
  const activeScenarioNames = useActiveScenarios()
  // 035-scenario-label-color (FR-001/FR-005): a `scenario`-keyed column's
  // CELL values (not its header — see resolveColumns()'s own field/label
  // split, unaffected) resolve through label ?? name below.
  const scenarioDisplay = useScenarioDisplay()
  // 019-baseline-diff-consumption: only consulted when config.comparison
  // references the '$baseline' sentinel — included in the fetch effect's
  // own dependency array below regardless, so a live baseline change
  // reactively re-triggers the fetch for a panel that uses it (FR-016).
  // Deliberately NOT part of isContentChange below (same treatment
  // activeScenarioNames already gets) — a baseline-only refetch must not
  // reset sortState/searchTerm/currentPage either (FR-008's own principle).
  const baseline = useBaseline()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [sortState, setSortState] = useState<SortState>(() => initialSort(config))
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  // TABLE-PANEL-PROPOSAL.md Option B — a viewer's own column-visibility
  // preference for THIS panel. Deliberately NOT included in the
  // three-way reset below (unlike sortState/searchTerm/currentPage) —
  // a genuine content change almost never changes the underlying column
  // SET for the same author-configured panel, and a viewer's "I don't
  // want to see this column" choice should survive a scenario-activation
  // or filter-driven refetch the same way it would survive any other
  // re-render. Resets only on an actual unmount (tab switch), same as
  // every other useState in this component.
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  // 059-server-side-pagination — the per-panel, per-content mode decision
  // (data-model.md's TableQueryMode) plus the CURRENT view's own real row
  // count (the full table's count normally; a search-filtered count while
  // a query-driven table's search box has a term in it — see
  // fetchQueryDrivenPage() below). `null` while not yet resolved (the
  // very first fetch for this content is still in flight).
  const [tableQueryMode, setTableQueryMode] = useState<{ mode: TableQueryMode; rowCount: number } | null>(
    null,
  )
  // Mirrors tableQueryMode for synchronous reads inside the content-fetch
  // effect (same reason lastContentKeyRef below is a ref, not a second
  // state variable: the effect needs the value AS OF the moment it runs,
  // not whatever the last completed render captured).
  const tableQueryModeRef = useRef<{ mode: TableQueryMode; rowCount: number } | null>(null)
  // The current content's own resolved base query (resolveQueryAndPairs()'s
  // `sql`, BEFORE any of this feature's own ROW_NUMBER()/search wrapping) —
  // read by the imperative query-driven re-fetch helper triggered from
  // handleSort/handleSearchChange/the pagination buttons, none of which
  // re-run resolveQueryAndPairs() themselves.
  const resolvedSqlRef = useRef<string | null>(null)
  // Guards against a stale, superseded query-driven fetch overwriting a
  // newer one's result — the same real requirement the main content
  // effect's own `cancelled` flag protects, generalized to cover several
  // independent imperative call sites (sort/search/page) rather than one
  // effect's single cleanup function.
  const fetchGenerationRef = useRef(0)
  // 009-scenario-manager (FR-008): tracks the (config, filters) pair the
  // three-way reset below was last computed against, so the reset only
  // fires for a genuine content change (a real filter/config-driven
  // refetch, where the underlying row set legitimately changed shape) —
  // never for a scenario-activation-triggered refetch alone, where
  // activeScenarioNames changed but config/filters didn't. Without this
  // guard, adding activeScenarioNames to the effect's dependency array
  // below (required for FR-008's "data shows up" half) would silently
  // reintroduce the very state-loss FR-008 exists to prevent — this
  // panel's own sort/search/page state is FR-008's own named example.
  const lastContentKeyRef = useRef<{ config: TablePanelConfig; filters: typeof filters } | null>(
    null,
  )

  // Data fetch — re-runs on config/filters/activeScenarioNames change,
  // identical chain to ValueBoxPanel.tsx/PlotlyPanel.tsx
  // (contracts/panel-query.md), but see lastContentKeyRef above for why
  // the reset below is conditional here and not in those simpler panels.
  //
  // 059-server-side-pagination: gains a real, measured mode decision
  // (data-model.md's TableQueryMode) between this existing full-fetch
  // path (mode: 'client', completely unmodified below — every real
  // table this app ships today stays on it) and a new query-driven path
  // for a real large table (specs/059-server-side-pagination/{research.md,
  // contracts/query-shapes.md}). The mode itself is only (re-)decided on
  // a genuine content change — never mid-interaction (spec's own Edge
  // Cases entry) — reusing the ALREADY-resolved mode on a scenario-
  // activation-only refetch, exactly mirroring how sortState/searchTerm/
  // currentPage already behave.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    const isContentChange =
      lastContentKeyRef.current === null ||
      lastContentKeyRef.current.config !== config ||
      lastContentKeyRef.current.filters !== filters
    lastContentKeyRef.current = { config, filters }

    // 060-codebase-cleanup-audit (Finding 1): resolveQueryAndPairs()
    // (panelQuery.ts) is the shared comparison-diff/ordinary-query
    // resolution every comparison-capable panel type's fetch effect now
    // calls — replaces the ~20-line isComparisonDiff()/
    // buildComparisonDiffQuery()/resolveComparisonScenarioName() block
    // this file used to duplicate inline (see that function's own doc
    // comment for the full story). A '$baseline' sentinel on either side
    // of config.comparison is still resolved BEFORE any query is built;
    // an unresolved baseline still shows this panel's existing error
    // state directly, never attempting a doomed query (FR-011). This
    // whole resolution step, and everything it returns, is completely
    // unaffected by 059 — research.md §5's own confirmed finding.
    const resolved = resolveQueryAndPairs(
      config,
      filters,
      activeScenarioNames,
      baseline,
      config.compare_on ?? [],
    )
    if ('error' in resolved) {
      setStatus('error')
      return
    }
    const { sql, pairs } = resolved
    resolvedSqlRef.current = sql
    const generation = ++fetchGenerationRef.current

    // The effective sort/search/page for THIS fetch: on a genuine content
    // change these are the same reset values the three-way reset below
    // applies; on a scenario-activation-only refetch they're whatever the
    // viewer currently has set (FR-008 — local UI state survives).
    const effectiveSort = isContentChange ? initialSort(config) : sortState
    const effectiveSearch = isContentChange ? '' : searchTerm
    const effectivePage = isContentChange ? 0 : currentPage
    const pageSize = config.pagination ?? DEFAULT_PAGE_SIZE

    function applyContentChangeReset() {
      if (isContentChange) {
        setSortState(initialSort(config))
        setSearchTerm('')
        setCurrentPage(0)
      }
    }

    // 056-lazy-tab-scoped-loading: see dashboardRenderer.tsx's own
    // comment — a no-op when already loaded/in-flight, a real await
    // otherwise.
    ensureRegistered(pairs)
      .then(() => query(buildRowCountQuery(sql)))
      .then((countRows) => {
        if (cancelled || generation !== fetchGenerationRef.current) return
        const fullRowCount = readCount(countRows)

        // Genuinely no data at all — independent of mode, independent of
        // any search term (a real, non-search "empty" is decided here,
        // before either query path below ever runs).
        if (fullRowCount === 0) {
          setRows([])
          setStatus('empty')
          applyContentChangeReset()
          return
        }

        // research.md §1's own real, measured threshold — decided once
        // per genuine content change, reused otherwise.
        const mode = isContentChange
          ? resolveTableQueryMode(fullRowCount)
          : tableQueryModeRef.current?.mode ?? resolveTableQueryMode(fullRowCount)

        if (mode === 'client') {
          tableQueryModeRef.current = { mode, rowCount: fullRowCount }
          setTableQueryMode(tableQueryModeRef.current)
          // Today's exact, unmodified path.
          return query(sql).then((result) => {
            if (cancelled || generation !== fetchGenerationRef.current) return
            setRows(result)
            setStatus('ready')
            applyContentChangeReset()
          })
        }

        // Query-driven mode. `columns`/`visibleColumns` are resolved from
        // whatever `rows` already holds (the previous fetch's own page,
        // or — on the very first fetch for this content — still empty,
        // in which case `effectiveSearch` is always '' anyway per the
        // isContentChange branch above, so no predicate is ever built
        // against a not-yet-known column set).
        const currentColumns = resolveColumns(config, rows)
        const currentVisible = currentColumns.filter((column) => !hiddenColumns.has(column.field))
        const searchPredicate = buildSearchPredicate(currentVisible, effectiveSearch)

        const rowCountPromise = searchPredicate
          ? query(buildSearchRowCountQuery(sql, searchPredicate)).then(readCount)
          : Promise.resolve(fullRowCount)

        return rowCountPromise.then((rowCountForView) => {
          if (cancelled || generation !== fetchGenerationRef.current) return
          tableQueryModeRef.current = { mode, rowCount: rowCountForView }
          setTableQueryMode(tableQueryModeRef.current)

          if (rowCountForView === 0) {
            // A real result set exists overall — the search matched
            // nothing. status stays 'ready' with zero rows, matching
            // client mode's own render-body noSearchResults handling,
            // never this file's "no data at all" empty state.
            setRows([])
            setStatus('ready')
            applyContentChangeReset()
            return
          }

          const pageSql = buildTableDrivenPageQuery({
            innerSql: sql,
            sortColumn: effectiveSort?.column ?? null,
            direction: effectiveSort?.direction ?? 'asc',
            page: effectivePage,
            pageSize,
            searchPredicate,
          })
          return query(pageSql).then((result) => {
            if (cancelled || generation !== fetchGenerationRef.current) return
            setRows(result)
            setStatus('ready')
            applyContentChangeReset()
          })
        })
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('TablePanel: failed to load panel data', err)
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [config, filters, activeScenarioNames, baseline])

  // 059-server-side-pagination — the imperative re-fetch every query-
  // driven sort/search/page interaction below triggers directly (no
  // effect-dependency-array involvement — those interactions never touch
  // config/filters/activeScenarioNames/baseline, so the effect above
  // would never re-run for them on its own). A no-op when the current
  // table isn't in query-driven mode at all (the caller checks first, but
  // this function re-checks too, defensively).
  async function fetchQueryDrivenPage(opts: { sort: SortState; search: string; page: number }) {
    const sql = resolvedSqlRef.current
    if (!sql || tableQueryModeRef.current?.mode !== 'query-driven') return
    const generation = ++fetchGenerationRef.current
    setStatus('loading')

    const currentColumns = resolveColumns(config, rows)
    const currentVisible = currentColumns.filter((column) => !hiddenColumns.has(column.field))
    const searchPredicate = buildSearchPredicate(currentVisible, opts.search)
    const pageSize = config.pagination ?? DEFAULT_PAGE_SIZE

    try {
      const countSql = searchPredicate ? buildSearchRowCountQuery(sql, searchPredicate) : buildRowCountQuery(sql)
      const rowCountForView = readCount(await query(countSql))
      if (generation !== fetchGenerationRef.current) return
      tableQueryModeRef.current = { mode: 'query-driven', rowCount: rowCountForView }
      setTableQueryMode(tableQueryModeRef.current)

      if (rowCountForView === 0) {
        setRows([])
        setStatus('ready')
        return
      }

      const pageSql = buildTableDrivenPageQuery({
        innerSql: sql,
        sortColumn: opts.sort?.column ?? null,
        direction: opts.sort?.direction ?? 'asc',
        page: opts.page,
        pageSize,
        searchPredicate,
      })
      const result = await query(pageSql)
      if (generation !== fetchGenerationRef.current) return
      setRows(result)
      setStatus('ready')
    } catch (err) {
      if (generation === fetchGenerationRef.current) {
        console.error('TablePanel: failed to load query-driven page', err)
        setStatus('error')
      }
    }
  }

  if (status === 'loading') {
    // wftdm-design-system skill's Skeleton section, Phase 3 requirement —
    // a shaped skeleton (header-row + several body-rows), not one plain
    // rectangle. Column/row counts are arbitrary placeholders (the real
    // count isn't known until the query resolves) — 4 columns, 5 rows is
    // a generic, dense-enough shape without overcommitting to a specific
    // width. flex-1 on every cell makes each column share the row's
    // width evenly, matching the real table's own natural full-width
    // layout closely enough for a placeholder.
    return (
      <div aria-hidden="true">
        <div className="flex gap-4 border-b border-border px-3 py-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 flex-1 animate-pulse rounded bg-muted" />
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex gap-4 border-b border-border px-3 py-2 last:border-0">
            {[0, 1, 2, 3].map((col) => (
              <div key={col} className="h-4 flex-1 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ))}
      </div>
    )
  }
  if (status === 'empty') {
    return <PanelEmptyState icon={TableIcon} message="No data for this selection" />
  }
  if (status === 'error') {
    return <PanelErrorState message="Couldn't load this table" />
  }

  const columns = resolveColumns(config, rows)
  // TABLE-PANEL-PROPOSAL.md Option B — the subset of `columns` a viewer
  // hasn't hidden. Search/render both use this, not the full `columns`
  // list — a hidden column contributing an invisible search match would
  // be a real "why did this row match, I don't see the term anywhere"
  // surprise (matching TanStack Table's own default global-filter
  // behavior of excluding hidden columns, the closest real precedent).
  const visibleColumns = columns.filter((column) => !hiddenColumns.has(column.field))
  // 059-server-side-pagination — in query-driven mode, `rows` already IS
  // the correct, server-sorted/filtered/paginated page (data-model.md's
  // own PagePosition — both modes use a plain page number, no separate
  // cursor concept); every client-side derivation below is skipped
  // entirely, matching this file's own scope: client mode gets ZERO
  // behavior change (spec FR-002).
  const isQueryDriven = tableQueryMode?.mode === 'query-driven'
  const pageSize = config.pagination ?? DEFAULT_PAGE_SIZE
  // Order of operations per contracts/table-panel.md: filter the full
  // fetched set, sort the filtered subset, then paginate what's left.
  const filtered = !isQueryDriven && searchTerm ? filterRows(rows, visibleColumns, searchTerm) : rows
  const sorted = !isQueryDriven && sortState ? sortRows(filtered, sortState.column, sortState.direction) : filtered
  const totalRowCount = isQueryDriven ? tableQueryMode?.rowCount ?? 0 : sorted.length
  const pageCount = Math.max(1, Math.ceil(totalRowCount / pageSize))
  const safePage = Math.min(currentPage, pageCount - 1)
  const pageRows = isQueryDriven ? rows : sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const noSearchResults = searchTerm.length > 0 && totalRowCount === 0
  const firstRowNumber = safePage * pageSize + 1
  const lastRowNumber = Math.min((safePage + 1) * pageSize, totalRowCount)

  function handleSort(field: string) {
    const next: SortState =
      sortState?.column === field
        ? { column: field, direction: sortState.direction === 'asc' ? 'desc' : 'asc' }
        : { column: field, direction: 'asc' }
    setSortState(next)
    if (isQueryDriven) {
      setCurrentPage(0)
      void fetchQueryDrivenPage({ sort: next, search: searchTerm, page: 0 })
    }
  }

  // Guards against hiding the LAST visible column — a table with zero
  // visible columns has no defined rendering (every real row would
  // become an empty <tr>), so this is a real correctness guard, not
  // just a UX nicety.
  function toggleColumnVisibility(field: string, hide: boolean) {
    setHiddenColumns((prev) => {
      const currentlyVisible = columns.length - prev.size
      if (hide && currentlyVisible <= 1) return prev
      const next = new Set(prev)
      if (hide) {
        next.add(field)
      } else {
        next.delete(field)
      }
      return next
    })
  }

  function handleSearchChange(value: string) {
    setSearchTerm(value)
    setCurrentPage(0) // a search can change the total row count — a
    // stale page index could point past the end of the now-filtered set.
    // Sorting alone doesn't do this (row count unchanged), so it doesn't
    // reset currentPage.
    if (isQueryDriven) {
      void fetchQueryDrivenPage({ sort: sortState, search: value, page: 0 })
    }
  }

  // 059-server-side-pagination — every pagination control below (first/
  // previous/next/last, 067) routes through this one place so a query-
  // driven table's page-change re-fetches exactly the same way a sort or
  // search change does; a client-mode table just moves `currentPage` and
  // relies on the existing in-memory `.slice()` above, unchanged.
  function goToPage(target: number) {
    setCurrentPage(target)
    if (isQueryDriven) {
      void fetchQueryDrivenPage({ sort: sortState, search: searchTerm, page: target })
    }
  }

  return (
    <div>
      {(config.searchable || columns.length > 0) && (
        <div className="mb-3 flex items-center gap-2">
          {config.searchable && (
            <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search…"
                aria-label={`Search ${config.title}`}
                className="w-full bg-transparent font-body text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          {/* TABLE-PANEL-PROPOSAL.md Option B — column-visibility toggle.
              Always offered when there's more than one column to hide,
              independent of `searchable` (a display concern, not a
              search one). `onSelect` preventDefault keeps the menu open
              across multiple toggles in one interaction — Radix's own
              default CheckboxItem behavior closes the menu on every
              select, which would make hiding three columns three
              separate open/click/close round-trips. */}
          {columns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Toggle column visibility"
                  className="flex shrink-0 items-center justify-center rounded-md border border-input bg-background p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Columns3 className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {columns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.field}
                    checked={!hiddenColumns.has(column.field)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) => toggleColumnVisibility(column.field, !checked)}
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {noSearchResults ? (
        // Visibly distinct from the "no data at all" empty state above —
        // the query did return data; the search just matched nothing.
        <PanelEmptyState icon={SearchX} message="No rows match your search" />
      ) : (
        <>
          {/* 021-basemap-catalog-redesign: scrollbar-thin — see
              tokens.css's own comment; applied here as one of this app's
              other significant scrollable regions, found during that
              feature's own codebase-wide search, not newly introduced by
              it. */}
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full border-collapse font-body text-sm">
              <thead>
                <tr className="border-b border-border">
                  {visibleColumns.map((column) => {
                    // 068-column-type-indicators — see COLUMN_TYPE_ICONS's
                    // own doc comment for the gropaul/dash-ui research this
                    // is built on.
                    const TypeIcon = COLUMN_TYPE_ICONS[column.valueType]
                    return (
                    <th
                      key={column.field}
                      aria-sort={
                        sortState?.column === column.field
                          ? sortState.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                      // wftdm-design-system skill's Typography scale —
                      // this is structurally the Section label role
                      // (font-heading text-xs uppercase tracking-wide
                      // text-muted-foreground, 600 weight), just never
                      // named as such. Was font-medium (500) — the one
                      // real deviation found auditing this file: every
                      // other property already matched Section label
                      // exactly.
                      className="whitespace-nowrap px-3 py-2 text-left font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {/* A real <button>, not a click handler on the <th>
                          itself — matches how the pagination
                          Previous/Next controls in this same file are
                          already real buttons. A native <button> is
                          Tab-focusable and treats Enter/Space as a click
                          for free — no manual onKeyDown needed — where the
                          <th>-with-onClick this replaced was mouse-only
                          (found and flagged as a real accessibility gap,
                          not caught when this feature first shipped).
                          `group` + `group-hover`/`group-focus-visible` on
                          the neutral ArrowUpDown (TABLE-PANEL-PROPOSAL.md
                          §6 Option B, matching gropaul/dash-ui's own real,
                          cited discoverability pattern) — a sortable but
                          currently-unsorted column now shows a faint
                          "you can sort this" cue on hover/focus, not only
                          after the fact. The `aria-sort` attribute above
                          already carries this state to assistive tech, so
                          every icon here is `aria-hidden`. The leading
                          TypeIcon (068-column-type-indicators) is placed
                          BEFORE the label, matching gropaul/dash-ui's own
                          real header layout exactly (type glyph, then
                          name, then the sort affordance last) — inside
                          the same clickable button, `currentColor`-styled
                          like the label itself rather than a distinct
                          color, so it reads as one integrated header
                          design, not a competing element. */}
                      <button
                        type="button"
                        onClick={() => handleSort(column.field)}
                        className="group flex cursor-pointer select-none items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <TypeIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {column.label}
                        {sortState?.column === column.field ? (
                          sortState.direction === 'asc' ? (
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown
                            className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {visibleColumns.map((column) => {
                      const value = row[column.field]
                      const background = cellColor(value, column.colorScale, column.domain)
                      return (
                        <td
                          key={column.field}
                          style={background ? { backgroundColor: background } : undefined}
                          className="whitespace-nowrap px-3 py-2"
                        >
                          {column.field === 'scenario'
                            ? resolveScenarioLabel(String(value), scenarioDisplay)
                            : column.format
                              ? formatValue(value, column.format)
                              : String(value ?? '')}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalRowCount > pageSize && (
            // TABLE-PANEL-PROPOSAL.md §6 Option B — first/last jump
            // buttons + a "Showing X–Y of Z rows" caption alongside the
            // existing "Page X of Y", matching gropaul/dash-ui's own
            // real, cited pagination-footer convention (icon buttons,
            // not plain text — the one place in this file the §7 audit
            // found with no icon at all).
            <div className="mt-3 flex items-center justify-between font-body text-sm text-muted-foreground">
              <span className="text-xs">
                Showing {firstRowNumber}–{lastRowNumber} of {totalRowCount} rows
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="First page"
                  onClick={() => goToPage(0)}
                  disabled={safePage === 0}
                  className="rounded-md p-1 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <ChevronFirst className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Previous page"
                  onClick={() => goToPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  className="rounded-md p-1 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="px-1">
                  Page {safePage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  onClick={() => goToPage(Math.min(pageCount - 1, safePage + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="rounded-md p-1 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Last page"
                  onClick={() => goToPage(pageCount - 1)}
                  disabled={safePage >= pageCount - 1}
                  className="rounded-md p-1 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <ChevronLast className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
