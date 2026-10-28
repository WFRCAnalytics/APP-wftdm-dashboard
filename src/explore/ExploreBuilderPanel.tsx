// 065-chart-builder: the Explore builder (full-page panel). Top bar (scenarios, tabs) over the Data tab: Columns
// (summaries), the paged preview, and the Query box with the pinned My tables list. Chart tabs arrive in the next step.
import { useEffect, useRef, useState } from 'react'
import { AssistantButton } from '@/layout/chat/chatLauncher'
import { ChevronDown, Plus, Redo2, Table2, Trash2, Undo2, Upload, X } from 'lucide-react'
import { defaultSpec } from '@/charts/builder/spec'
import { ChartTabView } from '@/explore/ChartTabView'
import { ImportDialog } from '@/explore/ExportDialog'
import '@/explore/explore.css'
import { ColumnsPanel } from '@/explore/ColumnsPanel'
import { PreviewTable } from '@/explore/PreviewTable'
import { QueryBox } from '@/explore/QueryBox'
import { Btn, SearchPopover } from '@/explore/parts'
import { dropMyTable } from '@/explore/sql/myTables'
import { useDataTab, type DataTabModel } from '@/explore/useDataTab'
import { redoCharts, resetQuery, setExplore, undoCharts, updateChart } from '@/state/exploreState'
import type { PanelProps } from '@/panels/registry'
import type { ExploreBuilderPanelConfig } from '@/layout/types'

const dotColor = (i: number) => `var(--chart-${(i % 8) + 1})`

// The same pill the control bar's Scenarios chip uses, so the toolbar's buttons match the other pages.
const CHIP = 'inline-flex h-[38px] min-w-0 shrink-0 items-center gap-2 rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] pl-[12px] pr-[10px] font-body text-sm text-[var(--ink)] shadow-[inset_0_1px_0_var(--hi)] hover:bg-[color-mix(in_srgb,var(--ink)_6%,var(--tile-hi))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]'

function TopBar({ m }: { m: DataTabModel }) {
  const s = m.state
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [importing, setImporting] = useState(false)
  const names = m.scenarioOptions.map((o) => o.name)
  const label = s.scenarios.length === 1 ? s.scenarios[0] : `${s.scenarios.length} of ${names.length} scenarios`
  const apply = (scenarios: string[]) => setExplore((st) => ({ scenarios, ...resetQuery({ table: st.table.startsWith('m:') ? st.table : '' }) }))
  return (
    <header className="top">
      <button type="button" className={CHIP} aria-label="Scenarios" aria-haspopup="dialog" aria-expanded={!!rect} onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())}>
        <span className="dots" aria-hidden="true">{s.scenarios.slice(0, 5).map((n) => <i key={n} style={{ background: dotColor(names.indexOf(n)) }} />)}</span>
        <span className="min-w-0 max-w-[170px] truncate font-medium">{label || 'Pick scenarios'}</span>
        <ChevronDown size={14} className="text-[var(--mute)]" aria-hidden="true" />
      </button>
      <div className="tabs" role="tablist" aria-label="Explore tabs">
        <button type="button" role="tab" className={`pill ${s.activeTab === 'data' ? 'on' : ''}`} aria-selected={s.activeTab === 'data'} onClick={() => setExplore({ activeTab: 'data' })}><Table2 size={15} aria-hidden="true" />Data</button>
        {s.charts.map((c) => (
          <span key={c.id} className={`tabw ${s.activeTab === c.id ? 'on' : ''}`}>
            <ChartTabLabel id={c.id} name={c.name} selected={s.activeTab === c.id} />
            <button type="button" className="x" aria-label={`Close tab ${c.name}`} onClick={() => setExplore((st) => ({ charts: st.charts.filter((x) => x.id !== c.id), activeTab: st.activeTab === c.id ? 'data' : st.activeTab }))}><X size={12} aria-hidden="true" /></button>
          </span>
        ))}
        <button type="button" className="pill" aria-label="Add chart tab" onClick={() => setExplore((st) => {
          const id = `c${st.nextId}`
          const source = st.table.startsWith('m:') ? st.table : st.table || `t:${m.tableOptions.find((t) => t.missingIn.length === 0)?.name ?? ''}`
          return { charts: [...st.charts, { id, name: `Chart ${st.charts.length + 1}`, source, spec: defaultSpec() }], activeTab: id, nextId: st.nextId + 1, notice: '', selectedField: null }
        })}><Plus size={15} aria-hidden="true" /></button>
      </div>
      {s.activeTab !== 'data' && (
        <div className="undo" role="group" aria-label="Undo and redo">
          <Btn icon aria-label="Undo" aria-keyshortcuts="Control+Z Meta+Z" disabled={s.undoDepth === 0} onClick={undoCharts}><Undo2 size={15} aria-hidden="true" /></Btn>
          <Btn icon aria-label="Redo" aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z" disabled={s.redoDepth === 0} onClick={redoCharts}><Redo2 size={15} aria-hidden="true" /></Btn>
        </div>
      )}
      <button type="button" className={CHIP} onClick={() => setImporting(true)}><Upload size={15} aria-hidden="true" /><span className="font-medium">Import</span></button>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {rect && (
        <SearchPopover
          anchor={rect}
          title="Choose scenarios"
          placeholder={`Search ${names.length} scenarios`}
          actions={[{ label: 'Select all', run: () => apply(names) }, { label: 'Only the first', run: () => apply(names.slice(0, 1)) }]}
          items={m.scenarioOptions.map((o, i) => ({
            key: o.name, label: o.name, dot: dotColor(i), on: s.scenarios.includes(o.name), meta: o.kind === 'observed' ? 'observed' : '',
            onPick: () => {
              const next = s.scenarios.includes(o.name) ? s.scenarios.filter((x) => x !== o.name) : names.filter((x) => x === o.name || s.scenarios.includes(x))
              if (next.length) apply(next)
            },
          }))}
          onClose={() => setRect(null)}
        />
      )}
    </header>
  )
}

function MyTables({ m }: { m: DataTabModel }) {
  const s = m.state
  return (
    <section className="tile mt">
      <div className="th"><div><h2 className="tt">My tables</h2><p className="ts">Saved results last for this session. Charts can use them as a source.</p></div></div>
      <div className="mine">
        {s.mine.length === 0 && <p className="hint" style={{ padding: '6px 6px 0' }}>Nothing saved yet. Run a query, name the result, and it appears here.</p>}
        {s.mine.map((t) => (
          <div className="mrow" key={t.id}>
            <div className="grow2"><div className="mn">{t.name}</div><div className="mi">{t.rowCount.toLocaleString('en-US')} rows, {t.columns.length} columns</div></div>
            <Btn small onClick={() => setExplore(resetQuery({ table: `m:${t.id}` }))}>Preview</Btn>
            <button type="button" className="x2" aria-label={`Delete ${t.name}`} onClick={() => {
              void dropMyTable(t.name).then(() => setExplore((st) => ({ mine: st.mine.filter((x) => x.id !== t.id), ...(st.table === `m:${t.id}` ? resetQuery({ table: '' }) : {}) })))
            }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  )
}

/** A chart tab's label. Double-click it, or press F2 on the tab, to rename it; Enter or leaving the field saves, Escape cancels. */
function ChartTabLabel({ id, name, selected }: { id: string; name: string; selected: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select() } }, [editing])
  const start = () => { setDraft(name); setEditing(true) }
  const finish = (save: boolean) => {
    setEditing(false)
    const next = draft.trim().slice(0, 40)
    if (save && next && next !== name) updateChart(id, (t) => ({ ...t, name: next }))
  }
  if (editing) {
    return (
      <input ref={input} className="renm" aria-label="Rename chart tab" value={draft} maxLength={40} size={Math.max(6, draft.length + 1)}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => finish(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false) }} />
    )
  }
  return (
    <button type="button" role="tab" className="pill" aria-selected={selected} aria-keyshortcuts="F2"
      onClick={() => setExplore({ activeTab: id, notice: '', selectedField: null })} onDoubleClick={start}
      onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); start() } }}>{name}</button>
  )
}

export function ExploreBuilderPanel({ config }: PanelProps<ExploreBuilderPanelConfig>) {
  const m = useDataTab()
  const chart = m.state.charts.find((c) => c.id === m.state.activeTab)
  const onChartTab = !!chart
  // Ctrl/Cmd+Z undoes and Ctrl+Shift+Z or Ctrl+Y redoes a chart change, except while typing: a text field keeps its own undo
  useEffect(() => {
    if (!onChartTab) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoCharts() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redoCharts() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onChartTab])
  return (
    <div className="xb" data-testid="explore-builder">
      {/* the same header every other page has: the title and subtitle, then the toolbar and the Assistant button */}
      <div className="xhead">
        <div className="xtitle">
          <h1>{config.title}</h1>
          {config.description && <p>{config.description}</p>}
        </div>
        <div className="xbar"><TopBar m={m} /><AssistantButton /></div>
      </div>
      {chart ? <ChartTabView key={chart.id} tab={chart} s={m.state} /> : (
      <div className="dgrid">
        <ColumnsPanel m={m} />
        <PreviewTable m={m} />
        <aside className="stack">
          <QueryBox m={m} />
          <MyTables m={m} />
        </aside>
      </div>
      )}
    </div>
  )
}
