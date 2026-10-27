// 065-chart-builder: one visualization tab. Fields on the left (search, type filters, grouped by name prefix when there are many),
// the chart card in the middle (a single row of encoding shelves over a chart that fills the remaining height), and the settings
// rail on the right (Chart, Style, Axes, Filter). Drag a field onto a shelf, or select it and press the shelf (keyboard path).
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, ChevronRight, Download, X } from 'lucide-react'
import { buildChart, type ChartModel, type Col, type DrawnChart } from '@/charts/builder/compile'
import { chartRole, DATA_TYPES, TYPE_LABEL, typesPresent, type DataType } from '@/charts/builder/columnTypes'
import { suggest } from '@/charts/builder/rules'
import {
  assignField, acceptsShort, AGGS, channelAggregates, channelLabel, COMING_SOON, MARK_ICON, MARK_LABEL, MARKS, SLOTS, switchMark, TEXT_SIZES,
  type Agg, type Channel, type ChartSpec, type Mark, type Stack, type TextKey,
} from '@/charts/builder/spec'
import { readChartTheme } from '@/charts/theme'
import type { ChartTheme } from '@/charts/types'
import { Segmented } from '@/components/ui/segmented'
import { Btn, Sparkline, TypeChip, TypeFilter, XSelect } from '@/explore/parts'
import { loadProfile } from '@/explore/profile/profileRun'
import { typeColorKey, type ColumnProfile } from '@/explore/profile/profile'
import { useDistinct } from '@/explore/useDistinct'
import { ExportDialog } from '@/explore/ExportDialog'
import { ROW_CAP, useChartData, type ChartData } from '@/explore/useChartData'
import { useColorScheme } from '@/hooks/useColorScheme'
import { tooltip } from '@/services/tooltip'
import { setExplore, updateChart, type ChartTab, type ExploreState } from '@/state/exploreState'

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

  const field = (c: Col) => {
    const chartable = !!chartRole(c.type)
    return (
      <div className="fwrap" key={c.name} draggable={chartable}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.name); e.dataTransfer.effectAllowed = 'copy'; setExplore({ selectedField: c.name }) }}>
        <button type="button" className={`fchip ${s.selectedField === c.name ? 'sel' : ''} ${chartable ? '' : 'dim'}`} aria-pressed={s.selectedField === c.name}
          onClick={() => setExplore({ selectedField: s.selectedField === c.name ? null : c.name, notice: '' })}>
          <TypeChip type={c.type} /><span className="fname">{c.name}</span><span className="fty">{TYPE_LABEL[c.type]}</span>
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

  return (
    <aside className="tile col">
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

function Plot({ model, spec, hot, size }: { model: DrawnChart; spec: ChartSpec; hot: string | null; size: { w: number; h: number } }) {
  void spec; void hot
  const onOver = (e: React.MouseEvent) => {
    const t = (e.target as SVGElement).getAttribute?.('data-t')
    if (!t) { tooltip.hide(); return }
    const [title, ...rest] = t.split('~')
    tooltip.show({ title, rows: rest.map((p) => { const i = p.indexOf('='); return { k: p.slice(0, i), v: p.slice(i + 1) } }) }, e)
  }
  return (
    <svg className="plot" viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label="Chart" onMouseOver={onOver} onMouseMove={onOver} onMouseLeave={() => tooltip.hide()}>
      <defs>
        {model.defs.map((d) => <pattern key={d.id} id={d.id} patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill={d.color} fillOpacity=".16" /><path d={d.d} stroke={d.color} strokeWidth={d.sw} fill={d.fill} /></pattern>)}
      </defs>
      {model.panels.map((p, i) => (
        <g key={i} transform={p.tf}>
          {p.title && <text x="0" y="11" fontSize="12.5" fontWeight="600" fill="currentColor">{p.title}</text>}
          {p.lines.map((l, k) => <line key={k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.stroke} strokeWidth={l.sw} strokeDasharray={l.dash || undefined} />)}
          {p.rects.map((r, k) => <rect key={k} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.rx} fill={r.fill} stroke={r.stroke} strokeWidth="1" opacity={r.op} data-t={r.tip || undefined} />)}
          {p.paths.map((r, k) => <path key={k} d={r.d} fill={r.fill} stroke={r.stroke} strokeWidth={r.sw} strokeDasharray={r.dash || undefined} strokeLinejoin="round" strokeLinecap="round" opacity={r.op} data-t={r.tip || undefined} />)}
          {p.texts.map((t, k) => <text key={k} x={t.x} y={t.y} textAnchor={t.anchor} fill={t.fill} fontSize={t.size} transform={t.tf || undefined}>{t.t}</text>)}
        </g>
      ))}
    </svg>
  )
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
  useEffect(() => {
    const el = plotRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight); if (w > 40 && h > 40) setSize((p) => (Math.abs(p.w - w) > 2 || Math.abs(p.h - h) > 2 ? { w, h } : p)) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { if (plotRef.current) setTheme(readChartTheme(plotRef.current)) }, [scheme, size.w])
  const setSpec = (fn: (x: ChartSpec) => ChartSpec) => updateChart(tab.id, (t) => ({ ...t, spec: fn(t.spec) }))
  const roleOf = (f: string) => chartRole(data.cols.find((c) => c.name === f)?.type ?? 'text')
  const model = useMemo<ChartModel | null>(() => (theme ? buildChart({ spec: data.spec, cols: data.cols, rows: data.rows, theme, width: size.w, height: size.h, hot }) : null), [theme, data.spec, data.cols, data.rows, size, hot])
  const dragging = s.selectedField
  const dragRole = dragging ? roleOf(dragging) : ''

  const assign = (ch: Channel, field: string) => {
    const c = data.cols.find((x) => x.name === field)
    if (!c) return
    const r = assignField(spec, ch, field, c.type, chartRole(c.type))
    if (r.ok) { setSpec(() => r.spec); setExplore({ selectedField: null, notice: `${field} placed on ${channelLabel(spec.mark, ch)}.`, noticeBad: false }) }
    else setExplore({ notice: r.reason, noticeBad: true })
  }
  const swap = () => setSpec((x) => { const e = { ...x.enc }; const a = e.x, b = e.y; delete e.x; delete e.y; if (a) e.y = a; if (b) e.x = b; return { ...x, enc: e } })
  const txt = (k: TextKey) => spec.text[k]
  const cls = (k: TextKey) => `sz-${txt(k).size} ${txt(k).b ? 'b' : txt(k).i ? 'i' : 'n'}${txt(k).b && txt(k).i ? ' i' : ''}`
  const drawn = model && model.problem === undefined ? (model as DrawnChart) : null
  const aria = Object.values(spec.enc).map((e) => e!.f).join(', ')

  return (
    <section className="tile col card" ref={cardRef}>
      <div className="cardhead">
        <span className="ci">{tab.name} · {data.relationName} · {(data.total ?? data.rows.length).toLocaleString('en-US')} rows</span>
        <span className={`cn ${s.noticeBad ? 'bad' : ''}`} role="status">{s.notice}</span>
        <Btn small onClick={swap}><ArrowLeftRight size={14} aria-hidden="true" />Swap x and y</Btn>
        <Btn small onClick={() => { setSpec((x) => ({ ...x, enc: {} })); setExplore({ notice: 'Shelves cleared.', noticeBad: false }) }}>Clear</Btn>
        <Btn small onClick={() => setExportOpen(true)}><Download size={14} aria-hidden="true" />Export</Btn>
      </div>
      <div className="strip">
        {SLOTS[spec.mark].map((slot) => {
          const e = spec.enc[slot.ch]
          const ok = dragging ? !!dragRole && slot.accepts.includes(dragRole) : false
          const col = e ? data.cols.find((c) => c.name === e.f) : undefined
          const label = channelLabel(spec.mark, slot.ch)
          return (
            <div key={slot.ch} className={`sp ${e ? 'filled' : ''} ${dragging ? (ok ? 'ok' : 'no') : ''}`}
              onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => { ev.preventDefault(); const f = ev.dataTransfer.getData('text/plain') || dragging; if (f) assign(slot.ch, f) }}>
              <span className="spl">{label}{slot.req && <><i className="rq" aria-hidden="true" /><span className="sr">required</span></>}</span>
              {e && col && (
                <>
                  <TypeChip type={col.type} /><span className="fname">{e.f}</span>
                  {channelAggregates(spec.mark, slot.ch) && chartRole(col.type) === 'q' && (
                    <XSelect className="agg" aria-label={`Aggregate for ${label}`} value={e.agg ?? 'sum'} onChange={(ev) => setSpec((x) => ({ ...x, enc: { ...x.enc, [slot.ch]: { ...e, agg: ev.target.value as Agg } } }))}>{AGGS.map((a) => <option key={a} value={a}>{a}</option>)}</XSelect>
                  )}
                  <button type="button" className="x" aria-label={`Remove ${e.f} from ${label}`} onClick={() => setSpec((x) => { const n = { ...x.enc }; delete n[slot.ch]; return { ...x, enc: n } })}><X size={12} aria-hidden="true" /></button>
                </>
              )}
              {!e && (
                <button type="button" className="place tp" data-tip={`Takes ${acceptsShort(slot.accepts)}`} disabled={!dragging || !ok} onClick={() => dragging && assign(slot.ch, dragging)}>
                  {dragging ? (ok ? `Place ${dragging}` : `Takes ${acceptsShort(slot.accepts)}`) : 'Drop a field'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <div className="cardbody" data-testid="chart-export-card">
        {txt('title').t && <h3 className={`tb ${cls('title')}`}>{txt('title').t}</h3>}
        {txt('sub').t && <p className={`tb tsub ${cls('sub')}`}>{txt('sub').t}</p>}
        {drawn && drawn.legend.length > 0 && (
          <div className="legend">
            {drawn.legend.map((g) => (
              <div className="lgg" key={g.title}>
                <span className="lgt">{g.title}</span>
                {g.items.map((it, i) => (
                  <button key={`${it.key}${i}`} type="button" className={`lgi ${hot && it.key && hot !== it.key ? 'dim' : ''}`} onMouseEnter={() => it.key && setHot(it.key)} onMouseLeave={() => setHot(null)} onFocus={() => it.key && setHot(it.key)} onBlur={() => setHot(null)}>
                    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d={it.d} fill={it.fill} stroke={it.stroke} strokeWidth={it.sw} strokeDasharray={it.dash || undefined} strokeLinecap="round" /></svg>{it.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="plotw" ref={plotRef} aria-label={aria ? `Chart of ${aria}` : 'Chart'}>
          {model?.problem && <div className="empty"><b>This chart needs a little more</b><span>{model.problem}</span></div>}
          {!model?.problem && data.error && <div className="empty"><b>The data could not be read</b><span>{data.error}</span></div>}
          {drawn && !data.error && <Plot model={drawn} spec={spec} hot={hot} size={{ w: drawn.W, h: drawn.H }} />}
        </div>
        {txt('src').t && <p className={`tb tfoot ${cls('src')}`} style={{ marginTop: 8 }}>{txt('src').t}</p>}
        {txt('note').t && <p className={`tb tfoot ${cls('note')}`} style={{ marginTop: 4 }}>{txt('note').t}</p>}
        {(data.truncated || drawn?.limitedSeries) && <p className="hint" style={{ marginTop: 4 }}>{data.truncated ? (data.mode === 'raw' ? 'Showing a sample of the points. ' : `Showing the first ${ROW_CAP.toLocaleString('en-US')} groups. `) : ''}{drawn?.limitedSeries ? 'Showing the first 15 values of a legend field.' : ''}</p>}
      </div>
      {exportOpen && <ExportDialog tab={tab} data={data} cardEl={() => cardRef.current?.querySelector<HTMLElement>('[data-testid="chart-export-card"]') ?? null} onClose={() => setExportOpen(false)} />}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------- the rail

function Rail({ tab, s, data }: { tab: ChartTab; s: ExploreState; data: ChartData }) {
  const spec = tab.spec
  const setSpec = (fn: (x: ChartSpec) => ChartSpec) => updateChart(tab.id, (t) => ({ ...t, spec: fn(t.spec) }))
  const roleOf = (f: string) => chartRole(data.cols.find((c) => c.name === f)?.type ?? 'text')
  const sug = suggest(spec, roleOf, (f) => new Set(data.rows.map((r) => r[f])).size)
  const values = useDistinct(data.relSql, spec.filter.f)
  const tabs: [typeof s.railTab, string][] = [['chart', 'Chart'], ['style', 'Style'], ['axes', 'Axes'], ['filter', 'Filter']]
  const pills = <T extends string | boolean>(opts: [T, string][], cur: T, set: (v: T) => void, label: string) => (
    <div className="xseg"><Segmented label={label} value={String(cur)} onChange={(id) => set(opts.find(([v]) => String(v) === id)![0])} options={opts.map(([v, l]) => ({ id: String(v), label: l }))} /></div>
  )
  return (
    <aside className="tile rail2">
      <div className="rtabs"><div className="xseg"><Segmented label="Chart settings" value={s.railTab} onChange={(id) => setExplore({ railTab: id as typeof s.railTab })} options={tabs.map(([k, l]) => ({ id: k, label: l }))} /></div></div>
      {s.railTab === 'chart' && (
        <div className="rsec">
          <div className="mkgrid">
            {MARKS.map((m: Mark) => {
              const r = sug.byMark[m], off = !r.viable, on = spec.mark === m
              return (
                <button key={m} type="button" className={`mk tp ${on ? 'on' : ''} ${off ? 'off' : ''}`} data-tip={off ? r.reason : sug.best === m ? 'Best fit for these columns' : MARK_LABEL[m]} aria-pressed={on} aria-disabled={off}
                  onClick={() => {
                    if (off) { setExplore({ notice: `${r.reason}.`, noticeBad: true }); return }
                    const res = switchMark(spec, m, roleOf)
                    setSpec(() => res.spec)
                    setExplore({ noticeBad: false, notice: res.dropped.length ? `Switched to ${MARK_LABEL[m]}. Removed ${res.dropped.map((c) => channelLabel(spec.mark, c)).join(', ')}, which ${MARK_LABEL[m]} does not use.` : `Switched to ${MARK_LABEL[m]}. Your fields stayed in place.` })
                  }}>
                  {sug.best === m && <span className="sug">Suggested</span>}
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={MARK_ICON[m]} /></svg>{MARK_LABEL[m]}
                </button>
              )
            })}
          </div>
          <p className="hint">{sug.total === 0 ? 'Pick a chart, or place columns on the shelves to get suggestions.' : sug.best ? `${MARK_LABEL[sug.best]} fits these ${sug.total} column${sug.total > 1 ? 's' : ''} best. Dimmed charts need other columns.` : 'No chart fits these columns yet. Add a number or a category.'}</p>
          <div className="rrow">{COMING_SOON.map((c) => <span key={c} className="pillx tp" data-tip="Coming soon">{c}</span>)}</div>
          {(spec.mark === 'bar' || spec.mark === 'area') && pills<Stack>([['group', spec.mark === 'area' ? 'Overlap' : 'Grouped'], ['stack', 'Stacked'], ['normalize', '100%']], spec.stack, (v) => setSpec((x) => ({ ...x, stack: v })), 'Stacking')}
          {spec.mark === 'pie' && pills<boolean>([[false, 'Pie'], [true, 'Donut']], spec.donut, (v) => setSpec((x) => ({ ...x, donut: v })), 'Pie style')}
        </div>
      )}
      {s.railTab === 'style' && (
        <div className="rsec">
          <p className="hint">Size, weight and italic only. Typeface and colours follow the app theme.</p>
          {([['title', 'Title', 'Add a title'], ['sub', 'Subtitle', 'Add a subtitle'], ['src', 'Source', 'Where the data comes from'], ['note', 'Note', 'Add a note']] as [TextKey, string, string][]).map(([k, label, ph]) => {
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
      )}
      {s.railTab === 'axes' && (
        <div className="rsec">
          <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Y axis starts at zero</span>{pills<boolean>([[true, 'Yes'], [false, 'No']], spec.zero, (v) => setSpec((x) => ({ ...x, zero: v })), 'Zero baseline')}</div>
          <p className="hint">{['bar', 'area', 'histogram'].includes(spec.mark) ? 'Bars, areas and histograms always start at zero.' : 'Applies to lines, scatter and box plots.'}</p>
          <div className="rrow"><span className="lab" style={{ minWidth: 96 }}>Gridlines</span>{pills<boolean>([[true, 'Show'], [false, 'Hide']], spec.grid, (v) => setSpec((x) => ({ ...x, grid: v })), 'Gridlines')}</div>
          <div className="rrow"><label className="lab" htmlFor="refin" style={{ minWidth: 96 }}>Reference line</label><input id="refin" className="inp" value={spec.ref} placeholder="y value" onChange={(e) => setSpec((x) => ({ ...x, ref: e.target.value.replace(/[^0-9.-]/g, '') }))} /></div>
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
