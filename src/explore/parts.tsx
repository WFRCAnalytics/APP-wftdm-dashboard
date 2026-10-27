// 065-chart-builder: small shared pieces of the Explore builder UI: the type chip, a searchable popover and a sparkline.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { TYPE_ICON, type DataType } from '@/charts/builder/columnTypes'

export function TypeChip({ type }: { type: DataType }) {
  return (
    <span className={`tyi ty-${type}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={TYPE_ICON[type]} />
      </svg>
    </span>
  )
}

export function Sparkline({ bars, width, height, fill }: { bars: number[]; width: number; height: number; fill: string }) {
  const n = bars.length || 1
  return (
    <svg className="spk" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {bars.map((h, i) => {
        const hh = Math.max(1.5, h * height)
        return <rect key={i} x={Math.round((i * width) / n * 10) / 10 + 0.5} y={height - hh} width={Math.max(1, width / n - 1.2)} height={hh} rx="1" fill={fill} />
      })}
    </svg>
  )
}

export interface PopItem { key: string; label: string; on?: boolean; dot?: string; meta?: string; onPick(): void }
export interface PopAction { label: string; run(): void }

/** A searchable list in a floating panel, anchored under a button. Used for scenarios, columns and group-by columns. */
export function SearchPopover(props: {
  anchor: DOMRect
  title: string
  placeholder: string
  items: PopItem[]
  actions?: PopAction[]
  single?: boolean
  onClose(): void
}) {
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const filtered = props.items.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()))
  const left = Math.max(8, Math.min(props.anchor.left, window.innerWidth - 346))
  const nOn = props.items.filter((i) => i.on).length
  const node: ReactNode = (
    <div className="xb xb-portal">
      <div className="pbd" onClick={props.onClose} />
      <div className="pop" style={{ left, top: props.anchor.bottom + 8 }} role="dialog" aria-label={props.title} onKeyDown={(e) => e.key === 'Escape' && props.onClose()}>
        <input ref={input} className="inp" type="search" aria-label="Search" placeholder={props.placeholder} value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 'none' }} />
        <div className="pact">
          {props.actions?.map((a) => <button key={a.label} type="button" className="lnk" onClick={a.run}>{a.label}</button>)}
          <span className="runmsg">{props.single ? `${filtered.length} available` : `${nOn} of ${props.items.length} selected`}</span>
        </div>
        <div className="pl2" role="listbox">
          {filtered.slice(0, 80).map((it) => (
            <button key={it.key} type="button" className={`prow ${it.on ? 'on' : ''} ${props.single ? 'single' : ''}`} role="option" aria-selected={!!it.on} onClick={it.onPick}>
              <span className="chk"><Check size={10} strokeWidth={3.2} aria-hidden="true" /></span>
              {it.dot && <span className="dt" style={{ background: it.dot }} />}
              <span className="pl">{it.label}</span>
              <span className="rt">{it.meta}</span>
            </button>
          ))}
          {filtered.length > 80 && <p className="hint" style={{ padding: '6px 8px' }}>{filtered.length - 80} more. Keep typing to narrow the list.</p>}
        </div>
      </div>
    </div>
  )
  return createPortal(node, document.body)
}

/** True once the element has scrolled into view; lets a long list summarise only the columns that are visible. */
export function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen]
}
