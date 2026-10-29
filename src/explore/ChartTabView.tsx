// 065-chart-builder: one visualization tab. Fields on the left (search, type filters, grouped by name prefix when there are many),
// the chart card in the middle (a single row of encoding shelves over a chart that fills the remaining height), and the settings
// rail on the right (Chart, Style, Axes, Filter). Drag a field onto a shelf, or select it and press the shelf (keyboard path).
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, ChevronRight, Download, GripVertical, Maximize2, Minimize2, Plus, X } from 'lucide-react'
import { chainEntries, chainIndex, chainOrder, closeGap, dropZone, insertIntoChain, removeFromChain, reorderInChain, type Box, type Side } from '@/charts/builder/chainOps'
import { buildChart, relabel, type ChartModel, type Col, type DrawnChart } from '@/charts/builder/compile'
import { chartRole, DATA_TYPES, TYPE_LABEL, typesPresent, type DataType } from '@/charts/builder/columnTypes'
import { suggest } from '@/charts/builder/rules'
import { CategoryOrder } from './CategoryOrder'
import { Slider } from '@/components/ui/slider'
import { prettyOperators } from '@/services/typography'
import {
  HIST_STATS, HIST_BINS_MIN, HIST_BINS_MAX, assignField, swapAxes, AXIS_MARKS, GRID_MARKS, REF_MARKS, ZERO_MARKS, acceptsShort, chainOf, CHAINS, effectiveLabels, LABEL_MARKS, labelModesFor, SHOW_AS, TABLE_VALUES, ZOOMABLE_MARKS, AGGS, channelAggregates, channelLabel, COMING_SOON, MARK_LABEL, MARKS, SLOTS, SORTS, switchMark, TEXT_SIZES,
  type Agg, type CellStyle, type LabelMode, type Channel, type ChartSpec, type Density, type MeasureFormat, type ShowAs, type TableOpts, type Mark, type Sort, type Stack, type TextKey,
} from '@/charts/builder/spec'
import { drawHierarchy, type HierState } from '@/charts/builder/hierarchyDraw'
import { renderPivots, type PivotState } from '@/charts/builder/pivotDraw'
import { attachPanZoom } from '@/charts/lib/panZoom'
import { readChartTheme } from '@/charts/theme'
import type { ChartTheme } from '@/charts/types'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { MARK_ICONS, SOON_ICONS } from '@/explore/markIcons'
import { Btn, Sparkline, TypeChip, TypeFilter, XSelect } from '@/explore/parts'
import { loadProfile } from '@/explore/profile/profileRun'
import { typeColorKey, type ColumnProfile } from '@/explore/profile/profile'
import { useDistinct } from '@/explore/useDistinct'
import { ExportDialog, Modal } from '@/explore/ExportDialog'
import { columnLabel, getExploreOptions } from '@/explore/options'
import { useChartData, type ChartData } from '@/explore/useChartData'
import { useColorScheme } from '@/hooks/useColorScheme'
import { tooltip } from '@/services/tooltip'
import { setExplore, updateChart, type ChartTab, type ExploreState } from '@/state/exploreState'

/** What a shelf takes, in the fewest words, for the hint drawn over it while a field is dragged: "numbers", "categories or dates". */
function takesWord(accepts: string): string {
  const w = [/[no]/.test(accepts) ? 'categories' : '', accepts.includes('t') ? 'dates' : '', accepts.includes('q') ? 'numbers' : ''].filter(Boolean)
  return w.join(' or ')
}

/**
 * The picture that follows the pointer while a field is dragged: a small pill with the field's type colour and name, instead of the
 * browser's snapshot of whatever element the drag started on. It sits off screen only long enough for the browser to copy it.
 */
function setDragPill(ev: React.DragEvent, name: string, color: string): void {
  const pill = document.createElement('div')
  pill.textContent = name
  pill.style.cssText = `position:fixed;top:-200px;left:-200px;display:flex;align-items:center;gap:8px;padding:6px 14px 6px 10px;border-radius:999px;background:var(--surface,#fff);color:var(--ink,#111);border:1px solid var(--brand,#1b2a47);box-shadow:0 10px 24px -8px rgba(0,0,0,.35);font:500 13px var(--font-body,system-ui,sans-serif);white-space:nowrap`
  const dot = document.createElement('span')
  dot.style.cssText = `width:9px;height:9px;border-radius:50%;background:${color};flex:none`
  pill.prepend(dot)
  document.body.appendChild(pill)
  ev.dataTransfer.setDragImage(pill, 14, 16)
  setTimeout(() => pill.remove(), 0)
}

/** Marks a drag that started on a placed field (not on the field list): the data is the channel it came from. */
const FROM_SHELF = 'application/x-explore-channel'

const colorVar = (t: DataType) => `var(--${{ c1: 'c-1', c2: 'c-2', c3: 'c-3', mute: 'mute' }[typeColorKey(t)]})`

function useProfileOf(sql: string, col: Col | undefined): ColumnProfile | undefined {
  const [p, setP] = useState<ColumnProfile>()
  useEffect(() => {
    setP(undefined)
    if (!sql || !col) return
    let dead = false
    loadProfile(sql, col).then((x) => !dead && setP(x), () => undefined)
    return () => { dead = true }
  }, [sql, col?.name, col?.type])
  return p
}

// ---------------------------------------------------------------------------------------------------------------- fields

function FieldsPanel({ tab, s, data }: { tab: ChartTab; s: ExploreState; data: ChartData }) {
  const { cols } = data
  const present = typesPresent(cols)
  const active = s.fieldType !== 'all' && present.some((p) => p.type === s.fieldType) ? s.fieldType : 'all'
  const q = s.fieldQuery.toLowerCase()
  const matches = cols.filter((c) => (active === 'all' || c.type === active) && (!q || c.name.toLowerCase().includes(q)))
  const grouped = !q && cols.length > 40 && active === 'all'
  const selected = cols.find((c) => c.name === s.selectedField)
  const peek = useProfileOf(data.relSql, selected)

  // a field can sit on several shelves (a category on X and on Colour, a number as two measures), so it is tagged, never disabled
  const usedOn = new Map<string, string[]>()
  for (const [ch, e] of Object.entries(tab.spec.enc) as [Channel, { f: string }][]) usedOn.set(e.f, [...(usedOn.get(e.f) ?? []), channelLabel(tab.spec.mark, ch)])

  const field = (c: Col) => {
    const chartable = !!chartRole(c.type)
    const used = usedOn.get(c.name)
    return (
      <div className="fwrap" key={c.name} draggable={chartable}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.name); e.dataTransfer.effectAllowed = 'copy'; setDragPill(e, c.name, colorVar(c.type)); setExplore({ dragField: c.name, dragFrom: null }) }}
        onDragEnd={() => setExplore({ dragField: null, dragFrom: null })}>
        <button type="button" className={`fchip ${s.selectedField === c.name ? 'sel' : ''} ${chartable ? '' : 'dim'} ${used ? 'used' : ''} ${s.dragField === c.name && !s.dragFrom ? 'lifted' : ''}`} aria-pressed={s.selectedField === c.name}
          onClick={() => setExplore({ selectedField: s.selectedField === c.name ? null : c.name, notice: '' })}>
          <TypeChip type={c.type} /><span className="fname">{columnLabel(getExploreOptions(), c.name)}</span>{used ? <span className="fused" aria-label={`Used on ${used.join(', ')}`}>{used[0]}{used.length > 1 ? ` +${used.length - 1}` : ''}</span> : <span className="fty">{getExploreOptions().columns[c.name]?.unit ?? TYPE_LABEL[c.type]}</span>}
        </button>
      </div>
    )
  }
  const nodes: React.ReactNode[] = []
  if (grouped) {
    const counts: Record<string, number> = {}
    cols.forEach((c) => { const p = c.name.split('_')[0]; counts[p] = (counts[p] ?? 0) + 1 })
    const order: string[] = [], map: Record<string, Col[]> = {}
    cols.forEach((c) => { const p0 = c.name.split('_')[0], p = counts[p0] >= 3 ? p0 : 'general'; if (!map[p]) { map[p] = []; order.push(p) } map[p].push(c) })
    order.sort((a, b) => (a === 'general' ? -1 : b === 'general' ? 1 : 0))
    order.forEach((p) => {
      const open = s.fieldOpen[p] === true || (p === 'general' && s.fieldOpen[p] !== false)
      nodes.push(
        <button key={`g-${p}`} type="button" className={`ghead ${open ? 'open' : ''}`} aria-expanded={open} onClick={() => setExplore({ fieldOpen: { ...s.fieldOpen, [p]: !open } })}>
          <ChevronRight size={12} aria-hidden="true" />{p === 'general' ? 'general' : `${p}_*`}<span className="gc">{map[p].length}</span>
        </button>,
      )
      if (open) map[p].forEach((c) => nodes.push(field(c)))
    })
  } else matches.slice(0, s.fieldShow).forEach((c) => nodes.push(field(c)))

  // dropping a placed field back on the list takes it off its shelf
  const takeOff = (ev: React.DragEvent) => {
    const from = ev.dataTransfer.getData(FROM_SHELF) as Channel
    if (!from) return
    ev.preventDefault()
    const name = tab.spec.enc[from]?.f
    updateChart(tab.id, (t) => ({ ...t, spec: removeFromChain(t.spec, from) }))
    setExplore({ selectedField: null, dragField: null, dragFrom: null, notice: name ? `${name} removed from ${channelLabel(tab.spec.mark, from)}.` : '', noticeBad: false })
  }
  return (
    <aside className={`tile col ${s.dragFrom ? 'dz' : ''}`} data-drop={s.dragFrom ? 'Drop here to remove it from the chart' : undefined}
      onDragOver={(ev) => { if (ev.dataTransfer.types.includes(FROM_SHELF)) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move' } }} onDrop={takeOff}>
      <div className="th"><div><h2 className="tt">Fields</h2><p className="ts">{cols.length} columns in {data.relationName || 'this table'}.</p></div></div>
      <div className="psearch">
        <XSelect className="sel" style={{ width: '100%' }} aria-label="Data source" value={tab.source} onChange={(e) => updateChart(tab.id, (t) => ({ ...t, source: e.target.value, spec: { ...t.spec, enc: {}, filter: { f: '', v: '' } } }))}>
          {s.mine.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.name}</option>)}
          {tab.source.startsWith('t:') && <option value={tab.source}>{tab.source.slice(2)}</option>}
          {s.table.startsWith('t:') && s.table !== tab.source && <option value={s.table}>{s.table.slice(2)}</option>}
        </XSelect>
        <input className="inp" type="search" aria-label="Search fields" placeholder="Search fields" value={s.fieldQuery} onChange={(e) => setExplore({ fieldQuery: e.target.value, fieldShow: 60 })} />
        <TypeFilter label="Field type" value={active} total={cols.length} present={present} onChange={(id) => setExplore({ fieldType: id as typeof active })} />
      </div>
      <div className="flist grow">
        {nodes}
        {matches.length === 0 && <p className="hint" style={{ padding: 8 }}>No field matches that search.</p>}
        {!grouped && matches.length > s.fieldShow && <button type="button" className="more" onClick={() => setExplore({ fieldShow: s.fieldShow + 60 })}>Show {Math.min(60, matches.length - s.fieldShow)} more of {matches.length - s.fieldShow} left</button>}
      </div>
      {selected && peek && (
        <div className="peek">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span><span className="fty">{TYPE_LABEL[selected.type]}</span></div>
          <Sparkline bars={peek.bars} width={240} height={34} fill={colorVar(selected.type)} />
          {[...peek.peek, { k: 'Missing', v: `${peek.missPct}%` }].map((r) => <div className="pr" key={r.k}><span>{r.k}</span><b>{r.v}</b></div>)}
        </div>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------------------------------------------- the chart

function Plot({ model, spec, hot, size, theme }: { model: DrawnChart; spec: ChartSpec; hot: string | null; size: { w: number; h: number }; theme: ChartTheme }) {
  void hot
  // Treemap and sunburst are drawn as zoomable hierarchies (click a group to open it). Which group is open outlives a redraw.
  const host = useRef<HTMLDivElement>(null)
  const open = useRef<HierState>({})
  const hierarchical = !!(model.trees || model.sankeys)
  const pivot = useRef<PivotState>({})
  const pivoted = !!model.tables
  useEffect(() => {
    if (!host.current || !(hierarchical || pivoted)) return
    host.current.replaceChildren(model.tables ? renderPivots(model.tables, pivot.current, getExploreOptions().limits.pivotRows) : drawHierarchy(model, theme, open.current))
    return () => tooltip.hide()
  }, [model, theme, hierarchical, pivoted])
  const ref = useRef<SVGSVGElement>(null)
  const layer = useRef<SVGGElement>(null)
  const zoomable = ZOOMABLE_MARKS.includes(spec.mark)
  // Axis-free marks pan and zoom. The drawing is React's, so the wrapper group is made once per new model and the old one dropped.
  useEffect(() => {
    const svg = ref.current
    if (!svg || !zoomable) return
    const detach = attachPanZoom(svg, size.w, size.h, {}, layer.current)
    return () => { detach.dispose() }
  }, [model, zoomable, size.w, size.h])
  const onOver = (e: React.MouseEvent) => {
    const t = (e.target as SVGElement).getAttribute?.('data-t')
    if (!t) { tooltip.hide(); return }
    const [title, ...rest] = t.split('~')
    tooltip.show({ title, rows: rest.map((p) => { const i = p.indexOf('\u2063'); return { k: p.slice(0, i), v: p.slice(i + 1) } }) }, e)
  }
  if (pivoted) return <div ref={host} className="plot pivot" />
  if (hierarchical) return <div ref={host} className="plot hier" role="img" aria-label="Chart" />
  return (
    <svg ref={ref} className="plot" viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label="Chart" onMouseOver={onOver} onMouseMove={onOver} onMouseLeave={() => tooltip.hide()}>
      <defs>
        {model.defs.map((d) => <pattern key={d.id} id={d.id} patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill={d.color} fillOpacity=".16" /><path d={d.d} stroke={d.color} strokeWidth={d.sw} fill={d.fill} /></pattern>)}
      </defs>
      <g ref={layer}>
      {model.panels.map((p, i) => (
        <g key={i} transform={p.tf}>
          {p.title && <text x="0" y="11" fontSize="12.5" fontWeight="600" fill="currentColor">{p.title}</text>}
          {p.lines.map((l, k) => <line key={k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.stroke} strokeWidth={l.sw} strokeDasharray={l.dash || undefined} />)}
          {p.rects.map((r, k) => <rect key={k} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.rx} fill={r.fill} stroke={r.stroke} strokeWidth="1" opacity={r.op} data-t={r.tip || undefined} />)}
          {p.paths.map((r, k) => <path key={k} d={r.d} fill={r.fill} stroke={r.stroke} strokeWidth={r.sw} strokeDasharray={r.dash || undefined} strokeLinejoin="round" strokeLinecap="round" opacity={r.op} data-t={r.tip || undefined} />)}
          {p.texts.map((t, k) => <text key={k} x={t.x} y={t.y} textAnchor={t.anchor} fill={t.fill} fontSize={t.size} transform={t.tf || undefined} stroke={t.halo} strokeWidth={t.halo ? 3 : undefined} paintOrder={t.halo ? 'stroke' : undefined} strokeLinejoin={t.halo ? 'round' : undefined}>{t.t}</text>)}
        </g>
      ))}
      </g>
    </svg>
  )
}

/** Channels added one at a time (treemap and sunburst levels, a table's groups and values): the ones in use, plus one "Add" pill for the next. */
function slotsShown(spec: ChartSpec) {
  const next = new Set((CHAINS[spec.mark] ?? []).map((c) => c.chs.find((ch) => !spec.enc[ch])).filter((ch): ch is Channel => !!ch))
  return SLOTS[spec.mark].filter((slot) => !chainOf(spec.mark, slot.ch) || !!spec.enc[slot.ch] || next.has(slot.ch))
}

function ChartCard({ tab, s, data }: { tab: ChartTab; s: ExploreState; data: ChartData }) {
  const spec = tab.spec
  const scheme = useColorScheme()
  const plotRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 760, h: 420 })
  const [theme, setTheme] = useState<ChartTheme>()
  const [hot, setHot] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  // the shelf the drag is over, and the shelf a field has just landed on (for its small settle animation)
  const [over, setOver] = useState<Channel | null>(null)
  const [landed, setLanded] = useState<Channel | null>(null)
  // The ordered shelves (levels, table groups) are decided for the whole strip from the pointer's position over the shelves' own,
  // fixed boxes: which shelf and which part of it. Nothing moves while it is decided, and nothing global is written while a field
  // is in flight (a drag once rewrote shelf text and selected the field, which reflowed the row under the pointer and ran profiling queries).
  const stripRef = useRef<HTMLDivElement>(null)
  const [zone, setZone] = useState<{ ch: Channel; side: Side } | null>(null)
  useEffect(() => { if (!s.dragField) { setOver(null); setZone(null) } }, [s.dragField]) // whatever ended the drag, no shelf stays lit
  useEffect(() => {
    if (!landed) return
    const t = setTimeout(() => setLanded(null), 700)
    return () => clearTimeout(t)
  }, [landed])
  // the plot panel can open in a wide dialog, like the data table; the chart is drawn in one place at a time
  const [big, setBig] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = plotRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight); if (w > 40 && h > 40) setSize((p) => (Math.abs(p.w - w) > 2 || Math.abs(p.h - h) > 2 ? { w, h } : p)) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [big])
  useEffect(() => { if (plotRef.current) setTheme(readChartTheme(plotRef.current)) }, [scheme, size.w])
  const setSpec = (fn: (x: ChartSpec) => ChartSpec) => updateChart(tab.id, (t) => ({ ...t, spec: fn(t.spec) }))
  const roleOf = (f: string) => chartRole(data.cols.find((c) => c.name === f)?.type ?? 'text')
  const model = useMemo<ChartModel | null>(() => {
    if (!theme) return null
    const built = buildChart({ spec: data.spec, cols: data.cols, rows: data.rows, theme, width: size.w, height: size.h, hot, legendSeries: getExploreOptions().limits.legendSeries })
    const labels: Record<string, string> = {}
    for (const [name, note] of Object.entries(getExploreOptions().columns)) if (note.label) labels[name] = note.label
    return relabel(built, labels)
  }, [theme, data.spec, data.cols, data.rows, size, hot])
  const dragging = s.dragField ?? s.selectedField
  const dragRole = dragging ? roleOf(dragging) : ''
  // the click-to-place path (a field selected in the list) writes its name on the shelves; a drag only tints them, so nothing moves under the pointer
  const picked = s.selectedField
  const pickedRole = picked ? roleOf(picked) : ''

  const assign = (ch: Channel, field: string) => {
    if (chainOrder(spec.mark, ch) && !spec.enc[ch]) { dropOnChain({ ch, side: 'on' }, null, field); return }
    const c = data.cols.find((x) => x.name === field)
    if (!c) return
    const r = assignField(spec, ch, field, c.type, chartRole(c.type))
    if (r.ok) { setSpec(() => r.spec); setLanded(ch); setExplore({ selectedField: null, dragField: null, dragFrom: null, notice: `${field} placed on ${channelLabel(spec.mark, ch)}.`, noticeBad: false }) }
    else setExplore({ notice: r.reason, noticeBad: true })
  }
  // Moves the field on one shelf to another. A shelf that already holds a field swaps with it when the field fits where the first one
  // came from; otherwise the one that was there is taken off.
  const move = (from: Channel, to: Channel) => {
    const src = spec.enc[from]
    if (!src || from === to) return
    const srcCol = data.cols.find((c) => c.name === src.f)
    if (!srcCol) return
    const fit = assignField(spec, to, src.f, srcCol.type, chartRole(srcCol.type))
    if (!fit.ok) { setExplore({ notice: fit.reason, noticeBad: true }); return }
    const values = (ch: Channel) => TABLE_VALUES.includes(ch)
    // a number keeps its aggregate (and a table value its format) where the new shelf can use them
    const carried = (e: typeof src, ch: Channel, base: NonNullable<ChartSpec['enc'][Channel]>) => ({
      ...base, ...(channelAggregates(spec.mark, ch) && e.agg ? { agg: e.agg } : {}),
      ...(values(from) && values(to) ? { show: e.show, dec: e.dec, pre: e.pre, suf: e.suf } : {}),
    })
    const enc = { ...spec.enc }
    delete enc[from]
    enc[to] = carried(src, to, fit.spec.enc[to]!)
    const there = spec.enc[to]
    let note = `${src.f} moved to ${channelLabel(spec.mark, to)}.`
    if (there) {
      const thereCol = data.cols.find((c) => c.name === there.f)
      const back = thereCol ? assignField(spec, from, there.f, thereCol.type, chartRole(thereCol.type)) : null
      if (back?.ok) { enc[from] = carried(there, from, back.spec.enc[from]!); note = `${src.f} and ${there.f} swapped places.` }
      else note = `${src.f} moved to ${channelLabel(spec.mark, to)}. ${there.f} was taken off it.`
    }
    setSpec((x) => {
      const order = chainOrder(x.mark, from)
      return order && !enc[from] ? closeGap({ ...x, enc }, order) : { ...x, enc } // a ring taken from its place: the ones after it move up
    })
    setLanded(to)
    setExplore({ selectedField: null, dragField: null, dragFrom: null, notice: note, noticeBad: false })
  }
  // A field dropped on an ordered shelf: before or after a field it is inserted there (the others move along), on a field it replaces it
  // (or swaps, when the dragged one comes from the same chain), on an empty shelf it is added last. Nothing is ever left with a gap.
  const dropOnChain = (z: { ch: Channel; side: Side }, from: Channel | null, field: string | null) => {
    const order = chainOrder(spec.mark, z.ch)
    if (!order) return
    const src = from ? spec.enc[from] : undefined
    const name = src?.f ?? field
    const col = name ? data.cols.find((c) => c.name === name) : undefined
    if (!name || !col) return
    const fit = assignField(spec, order[0], name, col.type, chartRole(col.type))
    if (!fit.ok) { setExplore({ notice: fit.reason, noticeBad: true }); return }
    const entry = src ? { ...src } : fit.spec.enc[order[0]]!
    const k = chainIndex(spec, order, z.ch)
    const used = chainEntries(spec, order).length
    const at = k < 0 ? used : z.side === 'after' ? k + 1 : k
    const inChain = !!from && order.includes(from)
    let next: ChartSpec | null
    let note: string
    if (inChain && z.side === 'on' && k >= 0) {
      const enc = { ...spec.enc, [from!]: spec.enc[z.ch]!, [z.ch]: spec.enc[from!]! }
      next = { ...spec, enc }
      note = `${name} and ${spec.enc[z.ch]!.f} swapped places.`
    } else if (inChain) {
      next = reorderInChain(spec, order, from!, at)
      note = `${name} moved to ${channelLabel(spec.mark, order[Math.min(at > chainIndex(spec, order, from!) ? at - 1 : at, used - 1)])}.`
    } else {
      const base = from ? removeFromChain(spec, from) : spec
      if (k >= 0 && z.side === 'on') {
        next = { ...base, enc: { ...base.enc, [z.ch]: entry } }
        note = `${name} replaced ${spec.enc[z.ch]!.f} on ${channelLabel(spec.mark, z.ch)}.`
      } else {
        next = insertIntoChain(base, order, at, entry)
        note = `${name} added as ${channelLabel(spec.mark, order[at])}.`
      }
    }
    if (!next) { setExplore({ notice: `All ${order.length} levels are used. Drop on one to replace it, or take one off first.`, noticeBad: true }); return }
    setSpec(() => next!)
    setLanded(z.ch)
    setExplore({ selectedField: null, dragField: null, dragFrom: null, notice: note, noticeBad: false })
  }
  const zoneAt = (ev: React.DragEvent): { ch: Channel; side: Side } | null => {
    const strip = stripRef.current
    if (!strip) return null
    const own = (ev.target as Element).closest?.('.sp')
    if (own && !own.hasAttribute('data-chain')) return null // an ordinary shelf answers for itself
    const boxes: Box[] = [...strip.querySelectorAll<HTMLElement>('.sp[data-chain]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { ch: el.dataset.ch as Channel, left: r.left, right: r.right, top: r.top, bottom: r.bottom, empty: el.classList.contains('add') }
    })
    return dropZone(boxes, ev.clientX, ev.clientY)
  }
  const onStripOver = (ev: React.DragEvent) => {
    const z = zoneAt(ev)
    if (!z) { setZone((p) => (p ? null : p)); return }
    ev.preventDefault()
    const order = chainOrder(spec.mark, z.ch)
    const slot = order && SLOTS[spec.mark].find((sl) => sl.ch === order[0])
    const role = dragRole
    ev.dataTransfer.dropEffect = !s.dragField || (slot && role && slot.accepts.includes(role)) ? (s.dragFrom ? 'move' : 'copy') : 'none'
    setZone((p) => (p && p.ch === z.ch && p.side === z.side ? p : z)) // same answer: no render
  }
  const onStripDrop = (ev: React.DragEvent) => {
    const z = zoneAt(ev)
    setZone(null)
    if (!z) return
    ev.preventDefault()
    const from = ev.dataTransfer.getData(FROM_SHELF) as Channel
    const f = ev.dataTransfer.getData('text/plain') || dragging
    dropOnChain(z, from || null, f || null)
  }
  // Swap follows the same rules as placing a field, so it is offered only when both fields fit their new shelves (and says why when not)
  const swapped = swapAxes(spec, (f) => { const c = data.cols.find((x) => x.name === f); return c ? { type: c.type, role: chartRole(c.type) } : undefined })
  const swap = () => { if (swapped.ok) setSpec(() => swapped.spec) }
  const txt = (k: TextKey) => spec.text[k]
  const cls = (k: TextKey) => `sz-${txt(k).size} ${txt(k).b ? 'b' : txt(k).i ? 'i' : 'n'}${txt(k).b && txt(k).i ? ' i' : ''}`
  const drawn = model && model.problem === undefined ? (model as DrawnChart) : null
  const aria = Object.values(spec.enc).map((e) => e!.f).join(', ')

  const body = (
      <div className="cardbody" data-testid="chart-export-card" ref={bodyRef}>
        {txt('tag').t && <p className={`tb ttag ${cls('tag')}`}>{prettyOperators(txt('tag').t)}</p>}
        {txt('title').t && <h3 className={`tb ${cls('title')}`}>{prettyOperators(txt('title').t)}</h3>}
        {txt('sub').t && <p className={`tb tsub ${cls('sub')}`}>{prettyOperators(txt('sub').t)}</p>}
        {drawn && drawn.legend.length > 0 && (
          <div className="legend">
            {drawn.legend.map((g) => (
              <div className="lgg" key={g.title}>
                <span className="lgt">{g.title}</span>
                {g.items.map((it, i) => (
                  <button key={`${it.key}${i}`} type="button" className={`lgi ${hot && it.key && hot !== it.key ? 'dim' : ''}`} onMouseEnter={() => it.key && setHot(it.key)} onMouseLeave={() => setHot(null)} onFocus={() => it.key && setHot(it.key)} onBlur={() => setHot(null)}>
                    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d={it.d} fill={it.fill} stroke={it.stroke} strokeWidth={it.sw} strokeDasharray={it.dash || undefined} strokeLinecap="round" /></svg>{prettyOperators(it.label)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className={`plotw ${data.loading && drawn ? 'stale' : ''}`} ref={plotRef} aria-label={spec.alt.trim() || (aria ? `Chart of ${aria}` : 'Chart')} aria-busy={data.loading}>
          {data.loading && !drawn && !model?.problem && <div className="skel" role="status" aria-label="Loading the chart" />}
          {model?.problem && <div className="empty"><b>This chart needs a little more</b><span>{model.problem}</span></div>}
          {!model?.problem && data.error && <div className="empty"><b>The data could not be read</b><span>{data.error}</span></div>}
          {drawn && !data.error && <Plot model={drawn} spec={spec} hot={hot} size={{ w: drawn.W, h: drawn.H }} theme={theme!} />}
        </div>
        {txt('foot').t && <p className={`tb tfoot ${spec.footAlign === 'right' ? 'tright' : 'tleft'} ${cls('foot')}`}>{txt('foot').t}</p>}
        {(data.truncated || drawn?.limitedSeries || drawn?.labelsHidden) && <p className="hint" style={{ marginTop: 4 }}>{data.truncated ? (data.mode === 'raw' ? 'Showing a sample of the points. ' : `Showing the first ${getExploreOptions().limits.chartRows.toLocaleString('en-US')} groups. `) : ''}{drawn?.limitedSeries ? `Showing the first ${drawn.seriesLimit} values of a legend field.` : ''}{drawn?.labelsHidden ? ' Data labels are hidden: the bars are too thin to carry them. Use fewer groups, or expand the chart.' : ''}</p>}
      </div>
  )

  return (
    <section className="tile col card" ref={cardRef}>
      <div className="cardhead">
        <span className="ci">{tab.name} · {data.relationName} · {(data.total ?? data.rows.length).toLocaleString('en-US')} rows</span>
        <span className={`cn ${s.noticeBad ? 'bad' : ''}`} role="status">{s.notice}</span>
        <span className="tp swapw" data-tip={swapped.ok ? undefined : swapped.reason}><Btn small disabled={!swapped.ok} onClick={swap}><ArrowLeftRight size={14} aria-hidden="true" />Swap x and y</Btn></span>
        <Btn small onClick={() => { setSpec((x) => ({ ...x, enc: {} })); setExplore({ notice: 'Shelves cleared.', noticeBad: false }) }}>Clear</Btn>
        {getExploreOptions().features.importExport && <Btn small onClick={() => setExportOpen(true)}><Download size={14} aria-hidden="true" />Export</Btn>}
        <Button variant="ghost" size="icon" aria-label={`Expand ${tab.name}`} onClick={() => setBig(true)}><Maximize2 className="h-4 w-4" /></Button>
      </div>
      <div className="strip" ref={stripRef} onDragOver={onStripOver} onDrop={onStripDrop}
        onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setZone(null) }}>
        {slotsShown(spec).map((slot) => {
          const e = spec.enc[slot.ch]
          const adding = !!chainOf(spec.mark, slot.ch) && !e
          const ok = dragging ? !!dragRole && slot.accepts.includes(dragRole) : false
          const col = e ? data.cols.find((c) => c.name === e.f) : undefined
          const label = adding ? chainOf(spec.mark, slot.ch)!.add : channelLabel(spec.mark, slot.ch)
          // while a field is dragged: the shelf it came from, and (for the one under the pointer) what dropping would do
          const fromCh = (s.dragFrom as Channel | null) ?? null
          const isSource = !!s.dragField && fromCh === slot.ch
          const order = chainOrder(spec.mark, slot.ch)
          const zs = order && zone?.ch === slot.ch ? zone.side : null // which part of an ordered shelf the pointer is over
          const hovered = !!s.dragField && !isSource && (order ? zs === 'on' : over === slot.ch)
          let hint: string | undefined
          if (order && s.dragField && (zs === 'before' || zs === 'after')) {
            const used = chainEntries(spec, order).length, k = chainIndex(spec, order, slot.ch), at = zs === 'after' ? k + 1 : k
            const mine = !!fromCh && order.includes(fromCh)
            const pushed = chainEntries(spec, order)[at]
            hint = !ok ? `Takes ${takesWord(slot.accepts)} only` : !mine && used >= order.length ? `All ${order.length} levels are used` : mine ? `Move to ${channelLabel(spec.mark, order[Math.min(at > chainIndex(spec, order, fromCh!) ? at - 1 : at, used - 1)])}` : `Insert as ${channelLabel(spec.mark, order[at])}${pushed ? ` · ${pushed.f} moves to ${channelLabel(spec.mark, order[at + 1])}` : ''}`
          } else if (hovered) {
            const fromSlot = fromCh ? SLOTS[spec.mark].find((sl) => sl.ch === fromCh) : undefined
            const swaps = !!(e && fromSlot && roleOf(e.f) && fromSlot.accepts.includes(roleOf(e.f)))
            hint = !ok ? `Takes ${takesWord(slot.accepts)} only` : e ? (e.f === s.dragField ? 'Already here' : swaps ? `Swap with ${e.f}` : `Replace ${e.f}`) : fromCh ? 'Move here' : `Place ${s.dragField}`
          }
          return (
            <div key={slot.ch} data-chain={order ? '' : undefined} data-ch={slot.ch} data-ins={zs === 'before' || zs === 'after' ? zs : undefined} className={`sp ${e ? 'filled' : ''} ${adding ? 'add' : ''} ${dragging && !isSource ? (ok ? 'ok' : 'no') : ''} ${hovered ? 'over' : ''} ${isSource ? 'source' : ''} ${landed === slot.ch ? 'landed' : ''}`} draggable={!!e}
              data-hint={hint}
              onDragStart={e ? (ev) => { ev.dataTransfer.setData(FROM_SHELF, slot.ch); ev.dataTransfer.setData('text/plain', e.f); ev.dataTransfer.effectAllowed = 'move'; setDragPill(ev, e.f, col ? colorVar(col.type) : 'var(--mute)'); setExplore({ dragField: e.f, dragFrom: slot.ch }) } : undefined}
              onDragEnd={() => { setOver(null); setExplore({ dragField: null, dragFrom: null }) }}
              {...(order ? {} : {
                onDragEnter: () => setOver(slot.ch),
                onDragLeave: (ev: React.DragEvent<HTMLDivElement>) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setOver((o) => (o === slot.ch ? null : o)) },
                onDragOver: (ev: React.DragEvent<HTMLDivElement>) => { ev.preventDefault(); ev.dataTransfer.dropEffect = !s.dragField || ok ? (fromCh ? 'move' : 'copy') : 'none' },
                onDrop: (ev: React.DragEvent<HTMLDivElement>) => { ev.preventDefault(); setOver(null); const from = ev.dataTransfer.getData(FROM_SHELF) as Channel; if (from) { move(from, slot.ch); return } const f = ev.dataTransfer.getData('text/plain') || dragging; if (f) assign(slot.ch, f) },
              })}>
              {order && e && picked && pickedRole && SLOTS[spec.mark].find((sl) => sl.ch === order[0])!.accepts.includes(pickedRole) && chainEntries(spec, order).length < order.length && (
                <button type="button" className="ins tp" data-tip={`Insert ${picked} before ${e.f}`} aria-label={`Insert ${picked} before ${e.f}`} onClick={() => dropOnChain({ ch: slot.ch, side: 'before' }, null, picked)}><Plus size={12} aria-hidden="true" /></button>
              )}
              {e && <GripVertical size={14} className="grip" aria-hidden="true" />}
              <span className="spl">{adding && <Plus size={12} aria-hidden="true" />}{label}{slot.req && <><i className="rq" aria-hidden="true" /><span className="sr">required</span></>}</span>
              {e && col && (
                <>
                  <TypeChip type={col.type} /><span className="fname">{columnLabel(getExploreOptions(), e.f)}</span>
                  {channelAggregates(spec.mark, slot.ch) && chartRole(col.type) === 'q' && (
                    <XSelect className="agg" aria-label={`Aggregate for ${label}`} value={e.agg ?? 'sum'} onChange={(ev) => setSpec((x) => ({ ...x, enc: { ...x.enc, [slot.ch]: { ...e, agg: ev.target.value as Agg } } }))}>{AGGS.map((a) => <option key={a} value={a}>{a}</option>)}</XSelect>
                  )}
                  <button type="button" className="x" aria-label={`Remove ${e.f} from ${label}`} onClick={() => setSpec((x) => removeFromChain(x, slot.ch))}><X size={12} aria-hidden="true" /></button>
                </>
              )}
              {!e && (
                <button type="button" className="place tp" data-tip={`Takes ${acceptsShort(slot.accepts)}`} disabled={!picked || !(pickedRole && slot.accepts.includes(pickedRole))} onClick={() => picked && assign(slot.ch, picked)}>
                  {picked ? (pickedRole && slot.accepts.includes(pickedRole) ? `Place ${picked}` : `Takes ${acceptsShort(slot.accepts)}`) : 'Drop a field'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {big ? <div className="cardbody"><p className="hint" style={{ padding: '24px 0' }}>This chart is open in the expanded view.</p></div> : body}
      {big && (
        <Modal wide bare title={tab.name} onClose={() => setBig(false)}>
          <div className="th">
            <div><h2 className="tt">{tab.name}</h2><p className="ts">{data.relationName} · {(data.total ?? data.rows.length).toLocaleString('en-US')} rows</p></div>
            <div className="pager">
              {getExploreOptions().features.importExport && <Btn small onClick={() => setExportOpen(true)}><Download size={14} aria-hidden="true" />Export</Btn>}
              <Button variant="ghost" size="icon" aria-label={`Contract ${tab.name}`} onClick={() => setBig(false)}><Minimize2 className="h-4 w-4" /></Button>
            </div>
          </div>
          {body}
        </Modal>
      )}
      {exportOpen && <ExportDialog tab={tab} data={data} cardEl={() => bodyRef.current} onClose={() => setExportOpen(false)} />}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------- the rail

function Rail({ tab, s, data }: { tab: ChartTab; s: ExploreState; data: ChartData }) {
  const spec = tab.spec
  const setSpec = (fn: (x: ChartSpec) => ChartSpec) => updateChart(tab.id, (t) => ({ ...t, spec: fn(t.spec) }))
  const roleOf = (f: string) => chartRole(data.cols.find((c) => c.name === f)?.type ?? 'text')
  const sug = suggest(spec, roleOf, (f) => new Set(data.rows.map((r) => r[f])).size)
  // the chart types a deployer allows (`charts.allow`); the open chart's own type always stays so it never disappears
  const offered = getExploreOptions().charts.allow
  const values = useDistinct(data.relSql, spec.filter.f)
  // the text fields on a shelf whose values can be put in a chosen order
  const orderFields = [...new Set((['x', 'y', 'color', 'row', 'column', 'pattern'] as const).map((ch) => spec.enc[ch]?.f).filter((f): f is string => !!f && data.rows.some((r) => r[f] !== undefined && r[f] !== null) && data.rows.every((r) => typeof r[f] !== 'number')))]
  const tabs: [typeof s.railTab, string][] = [['chart', 'Chart'], ['style', 'Style'], ['axes', spec.mark === 'text' ? 'Table' : spec.mark === 'pie' ? 'Pie' : AXIS_MARKS.includes(spec.mark) ? 'Axes' : 'Options'], ['filter', 'Filter']]
  const setTable = (patch: Partial<TableOpts>) => setSpec((x) => ({ ...x, table: { ...x.table, ...patch } }))
  const setMeasure = (ch: Channel, patch: MeasureFormat) => setSpec((x) => (x.enc[ch] ? { ...x, enc: { ...x.enc, [ch]: { ...x.enc[ch]!, ...patch } } } : x))
  const pills = <T extends string | boolean | number>(opts: [T, string][], cur: T, set: (v: T) => void, label: string) => (
    <div className="xseg"><Segmented label={label} value={String(cur)} onChange={(id) => set(opts.find(([v]) => String(v) === id)![0])} options={opts.map(([v, l]) => ({ id: String(v), label: l }))} /></div>
  )
  return (
    <aside className="tile rail2">
      <div className="rtabs"><div className="xseg"><Segmented label="Chart settings" value={s.railTab} onChange={(id) => setExplore({ railTab: id as typeof s.railTab })} options={tabs.map(([k, l]) => ({ id: k, label: l }))} /></div></div>
      {s.railTab === 'chart' && (
        <div className="rsec">
          <div className="mkgrid">
            {MARKS.filter((m) => offered.includes(m) || m === spec.mark).map((m: Mark) => {
              const r = sug.byMark[m], off = !r.viable, on = spec.mark === m
              return (
                <button key={m} type="button" className={`mk ${on ? 'on' : ''} ${off ? 'off' : ''}`} aria-pressed={on} aria-disabled={off}
                  onClick={() => {
                    if (off) { setExplore({ notice: `${r.reason}.`, noticeBad: true }); return }
                    const res = switchMark(spec, m, roleOf)
                    setSpec(() => res.spec)
                    setExplore({ noticeBad: false, notice: res.dropped.length ? `Switched to ${MARK_LABEL[m]}. Removed ${res.dropped.map((c) => channelLabel(spec.mark, c)).join(', ')}, which ${MARK_LABEL[m]} does not use.` : `Switched to ${MARK_LABEL[m]}. Your fields stayed in place.` })
                  }}>
                  {sug.best === m && <span className="sug">Suggested</span>}
                  {(() => { const I = MARK_ICONS[m]; return <I size={24} strokeWidth={1.6} aria-hidden="true" /> })()}{MARK_LABEL[m]}
                </button>
              )
            })}
            {offered.length === MARKS.length && COMING_SOON.map((c) => (
              <button key={c} type="button" className="mk off" aria-disabled="true" aria-label={`${c}, coming soon`} onClick={() => setExplore({ notice: `${c} is coming soon.`, noticeBad: true })}>
                {(() => { const I = SOON_ICONS[c]; return <I size={24} strokeWidth={1.6} aria-hidden="true" /> })()}{c}
              </button>
            ))}
          </div>
          <p className="hint">{sug.total === 0 ? 'Pick a chart, or place columns on the shelves to get suggestions.' : sug.best ? `${MARK_LABEL[sug.best]} fits these ${sug.total} column${sug.total > 1 ? 's' : ''} best. Dimmed charts need other columns.` : 'No chart fits these columns yet. Add a number or a category.'}</p>
          {(spec.mark === 'bar' || spec.mark === 'area') && pills<Stack>([['group', spec.mark === 'area' ? 'Overlap' : 'Grouped'], ['stack', 'Stacked'], ['normalize', '100%']], spec.stack, (v) => setSpec((x) => ({ ...x, stack: v })), 'Stacking')}
          {spec.mark === 'pie' && pills<boolean>([[false, 'Pie'], [true, 'Donut']], spec.donut, (v) => setSpec((x) => ({ ...x, donut: v })), 'Pie style')}
        </div>
      )}
      {s.railTab === 'style' && (
        <div className="rsec">
          {LABEL_MARKS.includes(spec.mark) && (
            <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Data labels</span>{pills<LabelMode>(labelModesFor(spec.mark).map((o) => [o.v, o.label] as [LabelMode, string]), effectiveLabels(spec), (v) => setSpec((x) => ({ ...x, labels: v })), 'Data labels')}</div>
          )}
          <p className="hint">Size, weight and italic only. Typeface and colours follow the app theme.</p>
          {([['Headline', [['tag', 'Tag', 'A short label above the title'], ['title', 'Title', 'Add a title'], ['sub', 'Subtitle', 'Add a subtitle']]], ['Footer', [['foot', 'Footer', 'A source, a caveat or a credit']]]] as [string, [TextKey, string, string][]][]).map(([group, keys]) => (
            <div className="tgrp" key={group}>
              <div className="rghrow"><p className="rgh">{group}</p>{group === 'Footer' && pills<'left' | 'right'>([['left', 'Left'], ['right', 'Right']], spec.footAlign, (v) => setSpec((x) => ({ ...x, footAlign: v })), 'Footer position')}</div>
              {keys.map(([k, label, ph]) => {
            const t = spec.text[k]
            const patch = (p: Partial<typeof t>) => setSpec((x) => ({ ...x, text: { ...x.text, [k]: { ...x.text[k], ...p } } }))
            return (
              <div className="trow" key={k}>
                <label className="lab" htmlFor={`tx-${k}`}>{label}</label>
                <input id={`tx-${k}`} className="inp" value={t.t} placeholder={ph} onChange={(e) => patch({ t: e.target.value })} />
                <div className="rrow">
                  <XSelect className="mini sel2" aria-label={`${label} size`} value={t.size} onChange={(e) => patch({ size: e.target.value as typeof t.size })}>{TEXT_SIZES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</XSelect>
                  <button type="button" className="tgl" aria-label="Bold" aria-pressed={t.b} onClick={() => patch({ b: !t.b })}>B</button>
                  <button type="button" className="tgl" aria-label="Italic" aria-pressed={t.i} style={{ fontStyle: 'italic' }} onClick={() => patch({ i: !t.i })}>I</button>
                </div>
              </div>
            )
          })}
            </div>
          ))}
          <div className="tgrp">
            <p className="rgh">Accessibility</p>
            <label className="lab" htmlFor="tx-alt">Alt text</label>
            <textarea id="tx-alt" className="inp alt" rows={3} value={spec.alt} placeholder="Describe the chart for someone who cannot see it" onChange={(e) => setSpec((x) => ({ ...x, alt: e.target.value }))} />
            <p className="hint">Read out by screen readers in place of the automatic description.</p>
          </div>
        </div>
      )}
      {s.railTab === 'axes' && (
        <div className="rsec">
          {AXIS_MARKS.includes(spec.mark) && (
            <>
              <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Axis titles</span>{pills<boolean>([[true, 'Show'], [false, 'Hide']], spec.axisTitles, (v) => setSpec((x) => ({ ...x, axisTitles: v })), 'Axis titles')}</div>
              {spec.axisTitles && (
                <>
                  <div className="rrow"><label className="lab" htmlFor="xtitle" style={{ minWidth: 96 }}>X title</label><input id="xtitle" className="inp" value={spec.xTitle} placeholder={spec.enc.x?.f ?? 'X axis'} onChange={(e) => setSpec((x) => ({ ...x, xTitle: e.target.value }))} /></div>
                  <div className="rrow"><label className="lab" htmlFor="ytitle" style={{ minWidth: 96 }}>Y title</label><input id="ytitle" className="inp" value={spec.yTitle} placeholder={spec.enc.y?.f ?? (spec.mark === 'histogram' ? 'Count' : spec.mark === 'density' ? 'Density' : 'Y axis')} onChange={(e) => setSpec((x) => ({ ...x, yTitle: e.target.value }))} /></div>
                  <p className="hint">Leave a title empty to use the field name.</p>
                </>
              )}
              {ZERO_MARKS.includes(spec.mark) && <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>{spec.mark === 'scatter' || spec.mark === 'trail' ? 'Axes start at zero' : 'Y axis starts at zero'}</span>{pills<boolean>([[true, 'Yes'], [false, 'No']], spec.zero, (v) => setSpec((x) => ({ ...x, zero: v })), 'Zero baseline')}</div>}
              {GRID_MARKS.includes(spec.mark) && <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Gridlines</span>{pills<boolean>([[true, 'Show'], [false, 'Hide']], spec.grid, (v) => setSpec((x) => ({ ...x, grid: v })), 'Gridlines')}</div>}
              {spec.mark === 'histogram' && (() => {
                const auto = Math.min(HIST_BINS_MAX, Math.max(HIST_BINS_MIN, getExploreOptions().limits.histogramBins))
                const shown = spec.bins > 0 ? spec.bins : auto
                return (
                  <div className="rrow" style={{ flexWrap: 'nowrap' }}>
                    <label className="lab" id="binslab" style={{ minWidth: 96 }}>Bins</label>
                    <Slider aria-label="Bins" aria-labelledby="binslab" min={HIST_BINS_MIN} max={HIST_BINS_MAX} step={1} value={[shown]} onValueChange={([n]) => setSpec((x) => ({ ...x, bins: n }))} className="flex-1" />
                    <span style={{ minWidth: 22, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{shown}</span>
                    <button type="button" className="mini" style={spec.bins > 0 ? undefined : { visibility: 'hidden' }} tabIndex={spec.bins > 0 ? 0 : -1} aria-hidden={spec.bins > 0 ? undefined : true} onClick={() => setSpec((x) => ({ ...x, bins: 0 }))}>Auto</button>
                  </div>
                )
              })()}
              {spec.mark === 'histogram' && (
                <div role="group" aria-label="Vertical lines" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="lab">Vertical lines</span>
                  <div className="pills sm" style={{ display: 'flex', width: '100%' }}>
                    {HIST_STATS.map((o) => {
                      const on = spec.stats.includes(o.v)
                      return <button key={o.v} type="button" className={`pill ${on ? 'on' : ''}`} style={{ flex: '1 1 0', justifyContent: 'center' }} title={o.label} aria-pressed={on} onClick={() => setSpec((x) => ({ ...x, stats: on ? x.stats.filter((v) => v !== o.v) : [...x.stats, o.v] }))}>{o.short}</button>
                    })}
                  </div>
                </div>
              )}
              {REF_MARKS.includes(spec.mark) && <div className="rrow"><label className="lab" htmlFor="refin" style={{ minWidth: 96 }}>Reference line</label><input id="refin" className="inp" value={spec.ref} placeholder={spec.mark === 'histogram' || (spec.mark === 'bar' && spec.enc.x && roleOf(spec.enc.x.f) === 'q') ? 'x value' : 'y value'} onChange={(e) => setSpec((x) => ({ ...x, ref: e.target.value.replace(/[^0-9.-]/g, '') }))} /></div>}
            </>
          )}
          {spec.mark === 'pie' && (
            <>
              <div className="rrow">
                <span className="lab" style={{ minWidth: 96 }}>Slice order</span>
                <XSelect className="mini sel2" aria-label="Slice order" value={spec.sort} onChange={(e) => setSpec((x) => ({ ...x, sort: e.target.value as Sort }))}>{SORTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</XSelect>
              </div>
              <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Group small slices</span>{pills<number>([[0, 'Off'], [2, '< 2%'], [5, '< 5%'], [10, '< 10%']], spec.pie.other, (v) => setSpec((x) => ({ ...x, pie: { ...x.pie, other: v } })), 'Group small slices')}</div>
              <p className="hint">Slices under that share are folded into one grey Other slice, so a long tail does not crowd the labels.</p>
              {spec.donut ? (
                <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Ring</span>{pills<number>([[72, 'Thin'], [58, 'Medium'], [42, 'Thick']], spec.pie.hole, (v) => setSpec((x) => ({ ...x, pie: { ...x.pie, hole: v } })), 'Ring thickness')}</div>
              ) : <p className="hint">Switch to Donut on the Chart tab to set the ring thickness.</p>}
            </>
          )}
          {!AXIS_MARKS.includes(spec.mark) && spec.mark !== 'pie' && spec.mark !== 'text' && <p className="hint">This chart has no axes, so there is nothing to set here. Labels and text are on the Style tab.</p>}
          {spec.mark === 'text' && (
            <>
              <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Cells</span>{pills<CellStyle>([['plain', 'Plain'], ['shade', 'Shade'], ['bars', 'Bars']], spec.table.cells, (v) => setTable({ cells: v }), 'Cell style')}</div>
              <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Density</span>{pills<Density>([['comfortable', 'Roomy'], ['compact', 'Compact']], spec.table.density, (v) => setTable({ density: v }), 'Row density')}</div>
              <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Subtotals</span>{pills<boolean>([[true, 'Show'], [false, 'Hide']], spec.table.subtotals, (v) => setTable({ subtotals: v }), 'Subtotals')}</div>
              <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Swap rows and columns</span>{pills<boolean>([[false, 'Off'], [true, 'On']], spec.table.transpose, (v) => setTable({ transpose: v }), 'Transpose')}</div>
              <div className="rrow">
                <span className="lab" style={{ minWidth: 96 }}>Sort rows</span>
                <XSelect className="mini sel2" aria-label="Sort rows" value={spec.sort} onChange={(e) => setSpec((x) => ({ ...x, sort: e.target.value as Sort }))}>{SORTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</XSelect>
              </div>
              <p className="hint">Largest and smallest order the rows by the first value. Click any heading in the table to sort by it, and the + / - beside a group to open or close it.</p>
              {TABLE_VALUES.filter((ch) => spec.enc[ch]).map((ch) => {
                const e = spec.enc[ch]!
                const adds = (e.agg ?? 'sum') === 'sum' || e.agg === 'count'
                return (
                  <div className="rsec measure" key={ch}>
                    <p className="mname">{channelLabel('text', ch)}: {e.agg ?? 'sum'} of {e.f}</p>
                    <div className="rrow">
                      <span className="lab" style={{ minWidth: 96 }}>Show as</span>
                      <XSelect className="mini sel2" aria-label={`Show ${e.f} as`} value={adds ? (e.show ?? 'value') : 'value'} onChange={(ev) => setMeasure(ch, { show: ev.target.value as ShowAs })}>{SHOW_AS.map((o) => <option key={o.v} value={o.v} disabled={!adds && o.v !== 'value'}>{o.label}</option>)}</XSelect>
                    </div>
                    <div className="rrow">
                      <span className="lab" style={{ minWidth: 96 }}>Decimals</span>
                      <XSelect className="mini sel2" aria-label={`Decimals of ${e.f}`} value={typeof e.dec === 'number' ? String(e.dec) : 'auto'} onChange={(ev) => setMeasure(ch, { dec: ev.target.value === 'auto' ? null : Number(ev.target.value) })}>{['auto', '0', '1', '2', '3', '4'].map((o) => <option key={o} value={o}>{o === 'auto' ? 'Automatic' : o}</option>)}</XSelect>
                    </div>
                    <div className="rrow">
                      <label className="lab" htmlFor={`pre-${ch}`} style={{ minWidth: 96 }}>Prefix, suffix</label>
                      <input id={`pre-${ch}`} className="inp" style={{ width: 62 }} value={e.pre ?? ''} placeholder="$" aria-label={`Prefix of ${e.f}`} onChange={(ev) => setMeasure(ch, { pre: ev.target.value })} />
                      <input className="inp" style={{ width: 62 }} value={e.suf ?? ''} placeholder=" mi" aria-label={`Suffix of ${e.f}`} onChange={(ev) => setMeasure(ch, { suf: ev.target.value })} />
                    </div>
                  </div>
                )
              })}
            </>
          )}
          {(spec.mark === 'bar' || spec.mark === 'line') && (
            <>
              <div className="rrow">
                <span className="lab" style={{ minWidth: 96 }}>Sort categories</span>
                <XSelect className="mini sel2" aria-label="Sort categories" value={spec.sort} onChange={(e) => setSpec((x) => ({ ...x, sort: e.target.value as Sort }))}>{SORTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</XSelect>
              </div>
              <p className="hint">{spec.mark === 'bar' ? 'Largest and smallest order the bars by their size. Put the number on X to lay the bars down.' : 'Works when the X axis is an ordered category or a date, not a number.'}</p>
            </>
          )}
          {orderFields.length > 0 && <CategoryOrder fields={orderFields} rows={data.rows} order={spec.order} onChange={(order) => setSpec((x) => ({ ...x, order }))} />}
          {!!spec.enc.row !== !!spec.enc.column && (
            <div className="rrow">
              <span className="lab" style={{ minWidth: 96 }}>Grid columns</span>
              <XSelect className="mini sel2" aria-label="Grid columns" value={String(spec.wrap)} onChange={(e) => setSpec((x) => ({ ...x, wrap: Number(e.target.value) }))}>
                <option value="0">One {spec.enc.row ? 'column' : 'row'}</option>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>Wrap into {n} columns</option>)}
              </XSelect>
            </div>
          )}
        </div>
      )}
      {s.railTab === 'filter' && (
        <div className="rsec">
          <p className="hint">Keep only the rows where a column equals a value. Applies to this chart's data.</p>
          <XSelect className="sel" style={{ width: '100%' }} aria-label="Filter column" value={spec.filter.f} onChange={(e) => setSpec((x) => ({ ...x, filter: { f: e.target.value, v: '' } }))}>
            <option value="">No filter</option>
            {data.cols.filter((c) => (['category', 'ordinal', 'boolean'] as DataType[]).includes(c.type)).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </XSelect>
          <XSelect className="sel" style={{ width: '100%' }} aria-label="Filter value" value={spec.filter.v} onChange={(e) => setSpec((x) => ({ ...x, filter: { ...x.filter, v: e.target.value } }))}>
            <option value="">All values</option>
            {values.map((v) => <option key={v} value={v}>{v}</option>)}
          </XSelect>
        </div>
      )}
    </aside>
  )
}

export function ChartTabView({ tab, s }: { tab: ChartTab; s: ExploreState }) {
  const data = useChartData(tab, s)
  void DATA_TYPES
  return (
    <div className="vgrid">
      <FieldsPanel tab={tab} s={s} data={data} />
      <ChartCard tab={tab} s={s} data={data} />
      <Rail tab={tab} s={s} data={data} />
    </div>
  )
}
