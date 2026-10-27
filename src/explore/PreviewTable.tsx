// 065-chart-builder: the Data tab's paged preview. The page size follows the height of the tile; the first column stays
// pinned while the rest scrolls sideways (tables can have hundreds of columns); cells render by data type.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import { Modal } from '@/explore/ExportDialog'
import { Btn, TypeChip } from '@/explore/parts'
import type { DataTabModel } from '@/explore/useDataTab'
import { setExplore } from '@/state/exploreState'

const ROW_PX = 33

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
                    <th key={c.name} className={c.name === (s.profileCol ?? columns[0]?.name) ? 'hsel' : ''}>
                      <button type="button" className="hb" onClick={() => setExplore({ profileCol: c.name })}><TypeChip type={c.type} />{c.name}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c, j) => {
                      const x = cell(c.type, r[j])
                      return <td key={c.name} className={`${x.cls} ${c.name === (s.profileCol ?? columns[0]?.name) ? 'hsel' : ''}`}>{x.text}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
    </div>
  )
}

export function PreviewTable({ m }: { m: DataTabModel }) {
  const { state: s, columns, rows } = m
  const [big, setBig] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const n = Math.max(8, Math.floor((el.clientHeight - 44) / ROW_PX))
      if (n !== s.pageSize) setExplore({ pageSize: n, page: 0 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [s.pageSize, rows.length > 0])

  const from = rows.length ? s.page * s.pageSize + 1 : 0
  const to = s.page * s.pageSize + rows.length
  const sub = [
    m.total !== null ? `${m.total.toLocaleString('en-US')} rows, ${columns.length} columns.` : `${columns.length} columns.`,
    s.scenarios.length > 1 ? `${s.scenarios.length} scenarios combined.` : '',
    m.plan?.joins.some((j) => j.ok) ? 'Joined tables.' : '',
  ].filter(Boolean).join(' ')
  const name = m.isMine ? s.mine.find((x) => `m:${x.id}` === s.table)?.name ?? '' : s.table.slice(2)
  return (
    <section className="tile col">
      <div className="th">
        <div><h2 className="tt">{name || 'Table'}</h2><p className="ts">{sub}</p></div>
        <div className="pager">
          <span className="mono">{from}–{to}{m.total !== null ? ` of ${m.total.toLocaleString('en-US')}` : ''}</span>
          <Btn icon aria-label="Expand the table" onClick={() => setBig(true)}><Maximize2 size={14} /></Btn>
          <Btn icon aria-label="Previous page" disabled={s.page <= 0} onClick={() => setExplore({ page: s.page - 1 })}><ChevronLeft size={14} /></Btn>
          <Btn icon aria-label="Next page" disabled={!m.hasMore} onClick={() => setExplore({ page: s.page + 1 })}><ChevronRight size={14} /></Btn>
        </div>
      </div>
      {m.status === 'error' || m.status === 'refused' ? (
        <div className="empty"><b>{m.status === 'refused' ? 'This statement is not allowed' : 'The query could not run'}</b><span>{m.message}</span></div>
      ) : m.status === 'ok' && rows.length === 0 ? (
        <div className="empty"><b>No rows</b><span>This query returns nothing. Loosen a filter, switch the join type, or pick other scenarios.</span></div>
      ) : (
        <DataGrid m={m} boxRef={box} />
      )}
      {big && <Modal wide title={name || 'Table'} onClose={() => setBig(false)}><DataGrid m={m} /></Modal>}
    </section>
  )
}
