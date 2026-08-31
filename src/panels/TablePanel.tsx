import { useEffect, useState } from 'react'
import { Search, SearchX, Table as TableIcon } from 'lucide-react'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import * as appState from '@/state/appState'
import { useFilterState } from '@/hooks/useFilterState'
import { buildPanelQuery, resolveActiveScenarios, EMPTY_SUMMARIZE_CONFIG } from '@/panels/panelQuery'
import { formatValue } from '@/panels/formatValue'
import { cellColor, filterRows, resolveColumns, sortRows } from '@/panels/tableLogic'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { TablePanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*'] // module-level constant — stable identity,
// never an inline `?? ['*']` literal (that allocates a new array every render)

const DEFAULT_PAGE_SIZE = 20 // docs/GRAMMAR.md's own example value for
// `pagination:` — spec.md's Assumptions.

type SortState = { column: string; direction: 'asc' | 'desc' } | null

function initialSort(config: TablePanelConfig): SortState {
  return config.sort ? { column: config.sort.column, direction: config.sort.order } : null
}

// The third panel type — see contracts/table-panel.md and
// specs/005-table-panel/research.md. Sort/pagination/search are all
// plain client-side operations over the one already-fetched `rows` array
// (FR-012) — no table library, per docs/SPEC.md's own "plain DOM"
// description (research.md §1).
export function TablePanel({ config }: { config: TablePanelConfig }) {
  const filters = useFilterState(
    config.filter ? [config.filter.replace(/^\$filters\./, '')] : ALL_FILTERS,
  )
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [sortState, setSortState] = useState<SortState>(() => initialSort(config))
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(0)

  // Data fetch — re-runs on config/filters change, identical chain to
  // ValueBoxPanel.tsx/PlotlyPanel.tsx (contracts/panel-query.md).
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(
      config,
      appState.getActive().map((s) => s.name),
    )
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)

    query(sql)
      .then((result) => {
        if (cancelled) return
        if (result.length === 0) {
          setStatus('empty')
          return
        }
        setRows(result)
        setStatus('ready')
        // A genuinely new result set — sortState/searchTerm/currentPage
        // all reset together, not a subset of the three
        // (contracts/table-panel.md's three-way reset — every client-only
        // view state resets across a real refetch; sortState reverts to
        // config.sort, not whatever the user last clicked).
        setSortState(initialSort(config))
        setSearchTerm('')
        setCurrentPage(0)
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [config, filters])

  if (status === 'loading') {
    return <div className="h-40 animate-pulse rounded-md bg-muted" />
  }
  if (status === 'empty') {
    return <PanelEmptyState icon={TableIcon} message="No data for this selection" />
  }
  if (status === 'error') {
    return <PanelErrorState message="Couldn't load this table" />
  }

  const columns = resolveColumns(config, rows)
  // Order of operations per contracts/table-panel.md: filter the full
  // fetched set, sort the filtered subset, then paginate what's left.
  const filtered = searchTerm ? filterRows(rows, columns, searchTerm) : rows
  const sorted = sortState ? sortRows(filtered, sortState.column, sortState.direction) : filtered
  const pageSize = config.pagination ?? DEFAULT_PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(currentPage, pageCount - 1)
  const pageRows = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const noSearchResults = searchTerm.length > 0 && sorted.length === 0

  function handleSort(field: string) {
    setSortState((prev) =>
      prev?.column === field
        ? { column: field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column: field, direction: 'asc' },
    )
  }

  function handleSearchChange(value: string) {
    setSearchTerm(value)
    setCurrentPage(0) // a search can change the total row count — a
    // stale page index could point past the end of the now-filtered set.
    // Sorting alone doesn't do this (row count unchanged), so it doesn't
    // reset currentPage.
  }

  return (
    <div>
      {config.searchable && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5">
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

      {noSearchResults ? (
        // Visibly distinct from the "no data at all" empty state above —
        // the query did return data; the search just matched nothing.
        <PanelEmptyState icon={SearchX} message="No rows match your search" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-body text-sm">
              <thead>
                <tr className="border-b border-border">
                  {columns.map((column) => (
                    <th
                      key={column.field}
                      aria-sort={
                        sortState?.column === column.field
                          ? sortState.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                      className="whitespace-nowrap px-3 py-2 text-left font-heading text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {/* A real <button>, not a click handler on the <th>
                          itself — matches how the pagination
                          Previous/Next controls in this same file are
                          already real buttons. A native <button> is
                          Tab-focusable and treats Enter/Space as a click
                          for free — no manual onKeyDown needed — where the
                          <th>-with-onClick this replaced was mouse-only
                          (found and flagged as a real accessibility gap,
                          not caught when this feature first shipped). */}
                      <button
                        type="button"
                        onClick={() => handleSort(column.field)}
                        className="flex cursor-pointer select-none items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {column.label}
                        {sortState?.column === column.field &&
                          (sortState.direction === 'asc' ? ' ▲' : ' ▼')}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {columns.map((column) => {
                      const value = row[column.field]
                      const background = cellColor(value, column.colorScale, column.domain)
                      return (
                        <td
                          key={column.field}
                          style={background ? { backgroundColor: background } : undefined}
                          className="whitespace-nowrap px-3 py-2"
                        >
                          {column.format ? formatValue(value, column.format) : String(value ?? '')}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sorted.length > pageSize && (
            <div className="mt-3 flex items-center justify-between font-body text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
