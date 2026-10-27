// 065-chart-builder: the Explore builder (full-page panel). Top bar (scenarios, table, tabs) over the Data tab: Columns
// (summaries), the paged preview, and the Query box with the pinned My tables list. Chart tabs arrive in the next step.
import { useState } from 'react'
import { ChevronDown, Plus, Table2, Trash2, Upload, X } from 'lucide-react'
import { defaultSpec } from '@/charts/builder/spec'
import { ChartTabView } from '@/explore/ChartTabView'
import { ImportDialog } from '@/explore/ExportDialog'
import '@/explore/explore.css'
import { ColumnsPanel } from '@/explore/ColumnsPanel'
import { PreviewTable } from '@/explore/PreviewTable'
import { QueryBox } from '@/explore/QueryBox'
import { SearchPopover } from '@/explore/parts'
import { dropMyTable } from '@/explore/sql/myTables'
import { useDataTab, type DataTabModel } from '@/explore/useDataTab'
import { resetQuery, setExplore } from '@/state/exploreState'
import type { PanelProps } from '@/panels/registry'
import type { ExploreBuilderPanelConfig } from '@/layout/types'

const dotColor = (i: number) => `var(--chart-${(i % 8) + 1})`

function TopBar({ m }: { m: DataTabModel }) {
  const s = m.state
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [importing, setImporting] = useState(false)
  const names = m.scenarioOptions.map((o) => o.name)
  const label = s.scenarios.length === 1 ? s.scenarios[0] : `${s.scenarios.length} of ${names.length} scenarios`
  const apply = (scenarios: string[]) => setExplore((st) => ({ scenarios, ...resetQuery({ table: st.table.startsWith('m:') ? st.table : '' }) }))
  return (
    <header className="top">
      <div className="grp">
        <span className="lab">Scenarios</span>
        <button type="button" className="btn" aria-haspopup="dialog" aria-expanded={!!rect} onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())}>
          <span className="dots" aria-hidden="true">{s.scenarios.slice(0, 5).map((n) => <i key={n} style={{ background: dotColor(names.indexOf(n)) }} />)}</span>
          {label || 'Pick scenarios'}<ChevronDown size={12} aria-hidden="true" />
        </button>
      </div>
      <label className="grp">
        <span className="lab">Table</span>
        <select className="sel" aria-label="Table to browse" value={s.table} onChange={(e) => setExplore(resetQuery({ table: e.target.value }))}>
          {m.tableOptions.map((t) => <option key={t.name} value={`t:${t.name}`} disabled={t.missingIn.length > 0}>{t.name}{t.missingIn.length ? ` (missing in ${t.missingIn.join(', ')})` : ''}</option>)}
          {s.mine.map((t) => <option key={t.id} value={`m:${t.id}`}>My table · {t.name}</option>)}
        </select>
      </label>
      <div className="tabs" role="tablist" aria-label="Explore tabs">
        <button type="button" role="tab" className={`pill ${s.activeTab === 'data' ? 'on' : ''}`} aria-selected={s.activeTab === 'data'} onClick={() => setExplore({ activeTab: 'data' })}><Table2 size={15} aria-hidden="true" />Data</button>
        {s.charts.map((c) => (
          <span key={c.id} className={`tabw ${s.activeTab === c.id ? 'on' : ''}`}>
            <button type="button" role="tab" className="pill" aria-selected={s.activeTab === c.id} onClick={() => setExplore({ activeTab: c.id, notice: '', selectedField: null })}>{c.name}</button>
            <button type="button" className="x" aria-label={`Close tab ${c.name}`} onClick={() => setExplore((st) => ({ charts: st.charts.filter((x) => x.id !== c.id), activeTab: st.activeTab === c.id ? 'data' : st.activeTab }))}><X size={12} aria-hidden="true" /></button>
          </span>
        ))}
        <button type="button" className="pill" aria-label="Add chart tab" onClick={() => setExplore((st) => {
          const id = `c${st.nextId}`
          const source = st.table.startsWith('m:') ? st.table : st.table || `t:${m.tableOptions.find((t) => t.missingIn.length === 0)?.name ?? ''}`
          return { charts: [...st.charts, { id, name: `Chart ${st.charts.length + 1}`, source, spec: defaultSpec() }], activeTab: id, nextId: st.nextId + 1, notice: '', selectedField: null }
        })}><Plus size={15} aria-hidden="true" /></button>
      </div>
      <div className="grp end"><button type="button" className="btn" onClick={() => setImporting(true)}><Upload size={15} aria-hidden="true" />Import</button></div>
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
            <button type="button" className="btn sm" onClick={() => setExplore(resetQuery({ table: `m:${t.id}` }))}>Preview</button>
            <button type="button" className="x2" aria-label={`Delete ${t.name}`} onClick={() => {
              void dropMyTable(t.name).then(() => setExplore((st) => ({ mine: st.mine.filter((x) => x.id !== t.id), ...(st.table === `m:${t.id}` ? resetQuery({ table: '' }) : {}) })))
            }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ExploreBuilderPanel(_props: PanelProps<ExploreBuilderPanelConfig>) {
  const m = useDataTab()
  const chart = m.state.charts.find((c) => c.id === m.state.activeTab)
  return (
    <div className="xb" data-testid="explore-builder">
      <TopBar m={m} />
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
