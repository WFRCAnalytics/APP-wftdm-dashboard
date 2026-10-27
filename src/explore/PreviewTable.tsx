// 065-chart-builder: the Data tab's paged preview. The page size follows the height of the tile; the first column stays
// pinned while the rest scrolls sideways (tables can have hundreds of columns); cells render by data type.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Columns2, Filter, Maximize2, Minimize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Modal } from '@/explore/ExportDialog'
import { TYPE_LABEL } from '@/charts/builder/columnTypes'
import { update } from '@/explore/QueryBox'
import { toggleSelect } from '@/explore/sql/queryModel'
import { Btn, SearchPopover, TypeChip, type PopItem } from '@/explore/parts'
import { addFilter, canQuickFilter, currentSort, removeFilter, setSort, tableCaps } from '@/explore/tableActions'
import { typeColorKey } from '@/explore/profile/profile'
import { describeFilter, opsFor } from '@/explore/sql/queryModel'
import type { DataTabModel } from '@/explore/useDataTab'
import { setExplore } from '@/state/exploreState'

const ROW_PX = 33

// The column's type colour, as a CSS variable the header tint and the selected-column tint both read.
const tint = (type: Parameters<typeof typeColorKey>[0]) => ({ '--tc': `var(--${{ c1: 'c-1', c2: 'c-2', c3: 'c-3', mute: 'mute' }[typeColorKey(type)]})` }) as React.CSSProperties

function cell(type: string, v: unknown): { text: string; cls: string } {
  if (v === null || v === undefined) return { text: 'null', cls: 'nl' }
  if (typeof v === 'boolean') return { text: String(v), cls: v ? 'bt' : 'bf' }
  if (typeof v === 'number') return { text: Number.isInteger(v) ? v.toLocaleString('en-US') : String(Math.round(v * 100) / 100), cls: 'num' }
  const text = String(v)
  return { text, cls: type === 'text' || type === 'geometry' ? 'tx' : '' }
}

// The table with a soft fade at whichever side has more columns to scroll to.
function DataGrid({ m, boxRef }: { m: DataTabModel; boxRef?: React.RefObject<HTMLDivElement> }) {
  const { state: s, columns, rows } = m
  const caps = tableCaps(m)
  const sort = currentSort(m)
  const own = useRef<HTMLDivElement>(null)
  const box = boxRef ?? own
  const [edge, setEdge] = useState({ l: false, r: false })
  const measure = useCallback(() => {
    const el = box.current
    if (el) setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
  }, [box])
  useEffect(() => {
    measure()
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, box, columns.length, rows.length])
  return (
    <div className={`gridwrap grow ${edge.l ? 'fl' : ''} ${edge.r ? 'fr' : ''}`}>
              <div className="scroll" ref={box} onScroll={measure} aria-busy={m.status === 'running'}>
            <table className="tbl">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.name} style={tint(c.type)} className={c.name === (s.profileCol ?? columns[0]?.name) ? 'hsel' : ''} aria-sort={sort?.col === c.name ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      <div className="hcell">
                      <button type="button" className="hb" onClick={() => setExplore({ profileCol: c.name })}>
                        <TypeChip type={c.type} />{c.name}
                        {sort?.col === c.name && (sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
                      </button>
                      {caps.sort && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className={`hmenu ${sort?.col === c.name ? 'on' : ''}`} aria-label={`Sort or filter ${c.name}`}><ChevronDown size={13} aria-hidden="true" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => setSort(c.name, 'asc')}><ArrowUp size={14} aria-hidden="true" />Sort ascending</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setSort(c.name, 'desc')}><ArrowDown size={14} aria-hidden="true" />Sort descending</DropdownMenuItem>
                            {sort?.col === c.name && <DropdownMenuItem onSelect={() => setSort(c.name, null)}>Clear sort</DropdownMenuItem>}
                            {caps.filter && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => addFilter(c.name, opsFor(c.type)[0], '')}><Filter size={14} aria-hidden="true" />Filter this column…</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c, j) => {
                      const x = cell(c.type, r[j])
                      const quick = caps.filter && canQuickFilter(c) && r[j] !== null && r[j] !== undefined
                      return (
                        <td key={c.name} style={tint(c.type)} className={`${x.cls} ${quick ? 'qf' : ''} ${c.name === (s.profileCol ?? columns[0]?.name) ? 'hsel' : ''}`}>
                          {x.text}
                          {quick && (
                            <button type="button" className="cf" aria-label={`Keep only ${c.name} ${x.text}. Shift-click excludes it.`}
                              onClick={(e) => addFilter(c.name, e.shiftKey ? '≠' : '=', String(r[j]))}><Filter size={11} aria-hidden="true" /></button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
    </div>
  )
}

// Rows per page follow the height of whichever table is on screen (the tile, or the expanded dialog while it is open).
function useRowsFit(ref: React.RefObject<HTMLDivElement>, active: boolean, pageSize: number, hasRows: boolean) {
  useEffect(() => {
    const el = ref.current
    if (!active || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const n = Math.max(8, Math.floor((el.clientHeight - 44) / ROW_PX))
      if (n !== pageSize) setExplore({ pageSize: n, page: 0 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, active, pageSize, hasRows])
}

// Title, row range, page buttons and the expand (or contract) button, shared by the tile and the expanded dialog.
function Head({ m, name, big, onToggle }: { m: DataTabModel; name: string; big: boolean; onToggle(): void }) {
  const { state: s, columns, rows } = m
  const from = rows.length ? s.page * s.pageSize + 1 : 0
  const to = s.page * s.pageSize + rows.length
  const sub = [
    m.total !== null ? `${m.total.toLocaleString('en-US')} rows, ${columns.length} columns.` : `${columns.length} columns.`,
    s.scenarios.length > 1 ? `${s.scenarios.length} scenarios combined.` : '',
    m.plan?.joins.some((j) => j.ok) ? 'Joined tables.' : '',
  ].filter(Boolean).join(' ')
  // which columns the table shows: the builder's own column choice, so the two stay in step (not while summarising or hand-editing)
  const plan = m.plan
  const canPick = !!plan && !m.isMine && !s.detached && plan.group.length === 0
  const [rect, setRect] = useState<DOMRect | null>(null)
  const all = plan?.cols.map((c) => c.name) ?? []
  const shown = s.model.select.length ? s.model.select.length : all.length
  return (
    <div className="th">
      <div><h2 className="tt">{name || 'Table'}</h2><p className="ts">{sub}</p></div>
      <div className="pager">
        {canPick && (
          <Btn small aria-haspopup="dialog" aria-expanded={!!rect} onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())}>
            <Columns2 size={14} aria-hidden="true" />{shown} of {all.length} columns
          </Btn>
        )}
        <span className="mono">{from}–{to}{m.total !== null ? ` of ${m.total.toLocaleString('en-US')}` : ''}</span>
        <Btn icon aria-label="Previous page" disabled={s.page <= 0} onClick={() => setExplore({ page: s.page - 1 })}><ChevronLeft size={14} /></Btn>
        <Btn icon aria-label="Next page" disabled={!m.hasMore} onClick={() => setExplore({ page: s.page + 1 })}><ChevronRight size={14} /></Btn>
        {/* the same ghost icon button every other expandable tile uses */}
        <Button variant="ghost" size="icon" aria-label={`${big ? 'Contract' : 'Expand'} ${name || 'table'}`} onClick={onToggle}>{big ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
      </div>
      {rect && plan && (
        <SearchPopover
          anchor={rect}
          title="Columns to show"
          placeholder={`Search ${all.length} columns`}
          actions={[{ label: 'Show all', run: () => update({ select: [] }) }]}
          items={plan.cols.map<PopItem>((c) => ({
            key: c.name, label: c.name, meta: TYPE_LABEL[c.type], on: s.model.select.length === 0 || s.model.select.includes(c.name),
            onPick: () => update({ select: toggleSelect(s.model.select, all, c.name) }),
          }))}
          onClose={() => setRect(null)}
        />
      )}
    </div>
  )
}

const MAX_CHIPS = 5

// The filters in force, as removable chips above the table, so it is clear why rows are missing without opening the query panel.
// A chip opens its filter in the builder; the X removes it. The note says why an action is unavailable.
function FilterChips({ m }: { m: DataTabModel }) {
  const caps = tableCaps(m)
  const { where } = m.state.model
  const plan = m.plan
  const live = m.state.detached || !plan ? [] : where.map((w, i) => ({ w, i })).filter(({ w }) => plan.names.includes(w.col))
  const shown = live.slice(0, MAX_CHIPS)
  const open = () => setExplore({ queryTab: 'builder', openStep: 'filter' })
  if (!live.length && !caps.reason) return null
  return (
    <div className="chips2" aria-label="Filters on this table">
      {shown.map(({ w, i }) => (
        <span className="fchip" key={i}>
          <button type="button" className="fc" onClick={open}>{describeFilter(w, plan!.cols.find((c) => c.name === w.col)?.type ?? 'text')}</button>
          <button type="button" className="fx" aria-label={`Remove filter ${w.col}`} onClick={() => removeFilter(i)}><X size={11} aria-hidden="true" /></button>
        </span>
      ))}
      {live.length > MAX_CHIPS && <button type="button" className="fchip more" onClick={open}>+{live.length - MAX_CHIPS} more</button>}
      {caps.reason && <span className="fnote">{caps.reason}</span>}
    </div>
  )
}

function Body({ m, boxRef }: { m: DataTabModel; boxRef: React.RefObject<HTMLDivElement> }) {
  if (m.status === 'error' || m.status === 'refused') {
    return <div className="empty"><b>{m.status === 'refused' ? 'This statement is not allowed' : 'The query could not run'}</b><span>{m.message}</span></div>
  }
  if (m.status === 'ok' && m.rows.length === 0) {
    return <div className="empty"><b>No rows</b><span>This query returns nothing. Loosen a filter, switch the join type, or pick other scenarios.</span></div>
  }
  return <DataGrid m={m} boxRef={boxRef} />
}

function Content({ m, boxRef }: { m: DataTabModel; boxRef: React.RefObject<HTMLDivElement> }) {
  return (
    <>
      <FilterChips m={m} />
      <Body m={m} boxRef={boxRef} />
    </>
  )
}

export function PreviewTable({ m }: { m: DataTabModel }) {
  const { state: s, rows } = m
  const [big, setBig] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const bigBox = useRef<HTMLDivElement>(null)
  useRowsFit(box, !big, s.pageSize, rows.length > 0)
  useRowsFit(bigBox, big, s.pageSize, rows.length > 0)
  const name = m.isMine ? s.mine.find((x) => `m:${x.id}` === s.table)?.name ?? '' : s.table.slice(2)
  return (
    <section className="tile col">
      <Head m={m} name={name} big={false} onToggle={() => setBig(true)} />
      <Content m={m} boxRef={box} />
      {big && (
        <Modal wide bare title={name || 'Table'} onClose={() => setBig(false)}>
          <Head m={m} name={name} big onToggle={() => setBig(false)} />
          <Content m={m} boxRef={bigBox} />
        </Modal>
      )}
    </section>
  )
}
