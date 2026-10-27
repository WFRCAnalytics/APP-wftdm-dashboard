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

// ------------------------------------------------------------------------------------------------ shared controls
// The builder uses the app's own controls so it matches every other page: the Radix Select (themed list, not the browser's),
// Button and Segmented. `XSelect` takes native <option> children, so a native <select> can be swapped in one rename.
import { Children, Fragment, isValidElement } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const EMPTY = '__empty__'
interface Opt { value: string; label: ReactNode; disabled?: boolean }

function collectOptions(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    const el = c as React.ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }>
    if (el.type === 'option') out.push({ value: String(el.props.value ?? ''), label: el.props.children, disabled: el.props.disabled })
    else if (el.type === Fragment || el.props.children) collectOptions(el.props.children, out)
  })
  return out
}

export interface XSelectProps {
  value: string
  onChange(e: { target: { value: string } }): void
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
  disabled?: boolean
}

export function XSelect({ value, onChange, children, className = '', style, disabled, ...rest }: XSelectProps) {
  const options = collectOptions(children)
  const size = /\b(mini|agg)\b/.test(className) ? 'xs' : /\btsel\b/.test(className) ? 'bare' : 'md'
  const trigger = cn(
    size === 'md' && 'h-9 min-w-[150px] font-medium',
    size === 'xs' && 'h-7 max-w-[190px] min-w-0 gap-1.5 px-2 text-[12.5px]',
    size === 'bare' && 'h-6 w-auto gap-1 border-0 bg-transparent px-1 text-xs shadow-none',
    /\bagg\b/.test(className) && 'h-6 rounded-full px-2 text-[11.5px]',
    style?.width === '100%' && 'w-full',
  )
  const current = options.some((o) => o.value === value) ? value : ''
  return (
    <Select value={current === '' && !options.some((o) => o.value === '') ? undefined : current === '' ? EMPTY : current} onValueChange={(v) => onChange({ target: { value: v === EMPTY ? '' : v } })} disabled={disabled}>
      <SelectTrigger size="sm" className={trigger} aria-label={rest['aria-label']}>
        <SelectValue placeholder={options[0]?.label} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {options.map((o) => <SelectItem key={o.value || EMPTY} value={o.value === '' ? EMPTY : o.value} disabled={o.disabled}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'outline' | 'ghost'; small?: boolean; icon?: boolean }
/** The app's Button at the builder's compact sizes. Primary uses the interface (brand) colour, like the selected pills. */
export function Btn({ variant = 'outline', small, icon, className, type = 'button', ...p }: BtnProps) {
  return <Button type={type} variant={variant} size={icon ? 'icon' : 'sm'} className={cn(small && 'h-7 px-2.5 text-[12.5px]', icon && 'h-8 w-8', !small && !icon && 'h-8', variant === 'primary' && 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)] hover:bg-[var(--pill-on-bg)] hover:opacity-90', className)} {...p} />
}
