import { useState } from 'react'

import { applyOrder, uniqSorted } from '@/charts/builder/compile'

type Row = Record<string, any>

const MAX_VALUES = 50

/** The look of an arrow that cannot move further (the shared `.mini` button has no disabled style). */
const OFF = { opacity: 0.3, cursor: 'not-allowed', pointerEvents: 'none' } as const

/** The values of a field in the order they are drawn: the chosen order first, then the alphabetical rest. */
function current(rows: Row[], field: string, order: string[] | undefined): string[] {
  return applyOrder(uniqSorted(rows, field), order).map(String)
}

/**
 * Lets people arrange the categories of one field (bars, legend entries, facets). Drag a value, use the arrows, or pick a
 * preset. Nothing is written until a value is moved, and the drag only reorders this list (no global state is touched).
 */
export function CategoryOrder({ fields, rows, order, onChange }: { fields: string[]; rows: Row[]; order: Record<string, string[]>; onChange: (next: Record<string, string[]>) => void }) {
  const [picked, setPicked] = useState(fields[0] ?? '')
  const [drag, setDrag] = useState<number | null>(null)
  const field = fields.includes(picked) ? picked : fields[0]
  if (!field) return null
  const values = current(rows, field, order[field])
  if (values.length < 2 || values.length > MAX_VALUES) return null

  const set = (next: string[] | null) => {
    const { [field]: _drop, ...rest } = order
    onChange(next ? { ...rest, [field]: next } : rest)
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= values.length || from === to) return
    const next = values.slice()
    next.splice(to, 0, next.splice(from, 1)[0])
    set(next)
  }
  const byTotal = (dir: 1 | -1) => {
    const t = new Map<string, number>()
    for (const r of rows) {
      const v = Object.values(r).find((x) => typeof x === 'number')
      t.set(String(r[field]), (t.get(String(r[field])) ?? 0) + (typeof v === 'number' ? v : 1))
    }
    set(values.slice().sort((a, b) => dir * ((t.get(a) ?? 0) - (t.get(b) ?? 0))))
  }

  return (
    <div data-testid="category-order">
      <div className="rrow">
        <span className="lab" style={{ minWidth: 96 }}>Order values of</span>
        {fields.length > 1 ? (
          <select className="mini sel2" aria-label="Field to order" value={field} onChange={(e) => setPicked(e.target.value)}>
            {fields.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        ) : <b>{field}</b>}
      </div>
      <div className="rrow" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button type="button" className="mini" onClick={() => set(null)}>A to Z</button>
        <button type="button" className="mini" onClick={() => set(values.slice().reverse())}>Reverse</button>
        <button type="button" className="mini" onClick={() => byTotal(-1)}>Largest first</button>
        <button type="button" className="mini" onClick={() => byTotal(1)}>Smallest first</button>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 220, overflowY: 'auto' }} aria-label={`Order of ${field}`}>
        {values.map((v, i) => (
          <li
            key={v}
            draggable
            onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (drag !== null) move(drag, i); setDrag(null) }}
            onDragEnd={() => setDrag(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', cursor: 'grab', opacity: drag === i ? 0.5 : 1 }}
          >
            <span aria-hidden="true">⋮⋮</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
            <button type="button" className="mini" aria-label={`Move ${v} up`} disabled={i === 0} style={i === 0 ? OFF : undefined} onClick={() => move(i, i - 1)}>↑</button>
            <button type="button" className="mini" aria-label={`Move ${v} down`} disabled={i === values.length - 1} style={i === values.length - 1 ? OFF : undefined} onClick={() => move(i, i + 1)}>↓</button>
          </li>
        ))}
      </ol>
      <p className="hint">Sets the order of bars, legend entries and panels. "Sort categories" by size, when chosen, takes over for the bars.</p>
    </div>
  )
}
