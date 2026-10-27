// 065-chart-builder: the Query box. A Builder tab (starter queries and a vertical pipeline of steps: table, joins, filter,
// summarize, columns/sort/limit, each with its row count) and a SQL tab (highlighted editor), with one Run and Save footer.
// All scrolling happens inside the box. Contract: specs/065-chart-builder/contracts/builder-ui.md.
import { useRef, useState } from 'react'
import { ArrowUpDown, Filter, Link2, Play, Plus, Sigma, Sparkles, Table2, X } from 'lucide-react'
import { TYPE_LABEL } from '@/charts/builder/columnTypes'
import { SearchPopover, type PopAction, type PopItem } from '@/explore/parts'
import { highlightSql } from '@/explore/sql/highlight'
import { checkName, saveMyTable } from '@/explore/sql/myTables'
import {
  autoKeys, buildSql, emptyModel, planQuery, suggestJoins, MAX_JOINS,
  type AggFn, type FilterOp, type JoinSpec, type JoinType, type QueryModel,
} from '@/explore/sql/queryModel'
import type { DataTabModel } from '@/explore/useDataTab'
import { cancelRunning } from '@/services/duckdb'
import { resetQuery, setExplore } from '@/state/exploreState'
import { roleOfType } from '@/explore/typeRole'

const AGGS: AggFn[] = ['sum', 'mean', 'median', 'min', 'max', 'count']
const OPS: FilterOp[] = ['=', '≠', '>', '<', 'contains']
const JOIN_TYPES: { k: JoinType; label: string; tip: string; fill: string }[] = [
  { k: 'inner', label: 'Inner join', tip: 'Inner: only rows that match', fill: 'M12 7.76A6 6 0 0 1 12 16.24A6 6 0 0 1 12 7.76z' },
  { k: 'left', label: 'Left join', tip: 'Left: every left row', fill: 'M3 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0' },
  { k: 'right', label: 'Right join', tip: 'Right: every right row', fill: 'M9 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0' },
  { k: 'full', label: 'Full join', tip: 'Full: every row from both', fill: 'M3 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0M9 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0' },
]
const JOIN_EXPLAIN: Record<JoinType, string> = {
  inner: 'Keeps only the rows that have a match in both tables.',
  left: 'Keeps every row from the left table. Rows with no match get blanks for the new columns.',
  right: 'Keeps every row from the joined table. Rows with no match get blanks for the left columns.',
  full: 'Keeps every row from both tables, matched where possible.',
}
const rows = (n?: number) => (n === undefined ? '' : `${n.toLocaleString('en-US')} rows`)

const update = (patch: Partial<QueryModel>) =>
  setExplore((s) => ({ model: { ...s.model, ...patch }, detached: false, sql: '', page: 0 }))

export function QueryBox({ m }: { m: DataTabModel }) {
  const s = m.state
  const [pop, setPop] = useState<{ kind: 'cols' | 'group'; rect: DOMRect } | null>(null)
  const plan = m.plan
  const tab = s.queryTab

  return (
    <section className="tile qt">
      <div className="th">
        <div><h2 className="tt">Query</h2><p className="ts">{m.isMine ? 'Preview only. Pick a table to query.' : 'Add steps and the SQL follows.'}</p></div>
        <div className="pills sm qtabs" role="tablist" aria-label="Query view">
          {(['builder', 'sql'] as const).map((k) => (
            <button key={k} type="button" role="tab" className={`pill ${tab === k ? 'on' : ''}`} aria-selected={tab === k} onClick={() => setExplore({ queryTab: k })}>{k === 'builder' ? 'Builder' : 'SQL'}</button>
          ))}
        </div>
      </div>
      <div className="qscroll">
        {tab === 'builder' ? <Builder m={m} openPicker={(kind, rect) => setPop({ kind, rect })} /> : <SqlTab m={m} />}
      </div>
      <Footer m={m} />
      {pop && plan && (
        <SearchPopover
          anchor={pop.rect}
          title={pop.kind === 'cols' ? 'Choose columns' : 'Group by column'}
          placeholder={pop.kind === 'cols' ? `Search ${plan.cols.length} columns` : 'Search columns'}
          single={pop.kind === 'group'}
          actions={pop.kind === 'cols' ? ([{ label: 'Use all columns', run: () => update({ select: [] }) }] as PopAction[]) : undefined}
          items={(pop.kind === 'cols' ? plan.cols : plan.cols.filter((c) => !plan.group.includes(c.name))).map<PopItem>((c) => ({
            key: c.name, label: c.name, meta: TYPE_LABEL[c.type], on: pop.kind === 'cols' && s.model.select.includes(c.name),
            onPick: () => {
              if (pop.kind === 'cols') update({ select: s.model.select.includes(c.name) ? s.model.select.filter((x) => x !== c.name) : [...s.model.select, c.name] })
              else { update({ group: [...s.model.group, c.name] }); setPop(null) }
            },
          }))}
          onClose={() => setPop(null)}
        />
      )}
    </section>
  )
}

function Step(props: { tone?: string; icon: React.ReactNode; title: string; count?: string; ghost?: boolean; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="step">
      <div className={`sico ${props.tone ?? ''}`}>{props.icon}</div>
      <div className={`sbody ${props.ghost ? 'ghost' : ''}`}>
        <div className="shd"><span className={`sn ${props.ghost ? 'mute' : ''}`}>{props.title}</span><span className="cnt">{props.count}</span>{props.right}</div>
        {props.children}
      </div>
    </div>
  )
}

function Builder({ m, openPicker }: { m: DataTabModel; openPicker(kind: 'cols' | 'group', rect: DOMRect): void }) {
  const s = m.state
  const model = s.model
  const plan = m.plan
  const tableOpts = m.tableOptions.filter((t) => t.missingIn.length === 0)
  const candidates: { label: string; table: string; model: Partial<QueryModel> }[] = [
    { label: 'Households with their vehicles', table: 'households', model: { joins: [{ table: 'vehicles', type: 'left', keys: [{ l: 'hh_id', r: 'hh_id' }] }] } },
    { label: 'Persons with their household', table: 'persons', model: { joins: [{ table: 'households', type: 'inner', keys: [{ l: 'hh_id', r: 'hh_id' }] }] } },
  ]
  const firstCategory = plan?.cols.find((c) => c.type === 'category' && c.name !== 'scenario')
  if (firstCategory && !m.isMine) candidates.push({ label: `Row counts by ${firstCategory.name}`, table: plan!.input.table, model: { group: [firstCategory.name], fn: 'count', order: 'n', dir: 'desc' } })
  const starters = candidates.filter((x) => m.tableOptions.some((t) => t.name === x.table && t.missingIn.length === 0))

  if (m.isMine) return <p className="hint" style={{ padding: 18 }}>This is a saved table. Pick a source table in the top bar to build a query.</p>
  if (!plan) return <p className="hint" style={{ padding: 18 }}>{m.ready ? '' : 'Loading the table…'}</p>

  const setJoin = (i: number, patch: Partial<JoinSpec>) => update({ joins: model.joins.map((j, k) => (k === i ? { ...j, ...patch } : j)) })
  const sugs = suggestJoins(plan.input, plan, model)
  const quant = plan.cols.filter((c) => roleOfType(c.type) === 'q' && !plan.group.includes(c.name))
  const okJoins = plan.joins.filter((j) => j.ok)

  return (
    <>
      {s.detached && (
        <div className="paused"><span>The builder is paused because you edited the SQL by hand.</span><button type="button" className="lnk" onClick={() => setExplore({ detached: false, sql: '', queryTab: 'builder' })}>Back to the builder</button></div>
      )}
      {starters.length > 0 && (
        <div className="starters">
          <span className="lab">Try one of these</span>
          <div className="chips">
            {starters.map((x) => (
              <button key={x.label} type="button" className="chipb" onClick={() => setExplore(resetQuery({ table: `t:${x.table}`, model: { ...emptyModel(), ...x.model }, queryTab: 'builder' }))}>
                <Sparkles size={13} aria-hidden="true" />{x.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={`pipe ${s.detached ? 'dis' : ''}`} style={{ padding: '14px 18px 4px' }}>
        <Step tone="s-src" icon={<Table2 size={16} aria-hidden="true" />} title="Table" count={rows(m.counts.source)}>
          <select className="sel" style={{ width: '100%' }} aria-label="Source table" value={s.table} onChange={(e) => setExplore(resetQuery({ table: e.target.value }))}>
            {tableOpts.map((t) => <option key={t.name} value={`t:${t.name}`}>{t.name}</option>)}
            {s.mine.map((t) => <option key={t.id} value={`m:${t.id}`}>My table · {t.name}</option>)}
          </select>
        </Step>

        {model.joins.map((j, i) => {
          const pj = plan.joins[i]
          const lNames = pj?.leftNames ?? plan.names
          const rNames = pj?.rightNames ?? []
          return (
            <Step key={i} tone="s-join" icon={<Link2 size={16} aria-hidden="true" />} title="Join" count={pj?.ok ? rows(m.counts.joins[i]) : ''}
              right={<button type="button" className="x2" aria-label="Remove this join" onClick={() => update({ joins: model.joins.filter((_, k) => k !== i) })}><X size={12} /></button>}>
              <div className="jrow">
                <span className="tch">{i === 0 ? plan.input.table : 'Result so far'}</span>
                <div className="jt" role="group" aria-label="Join type">
                  {JOIN_TYPES.map((t) => (
                    <button key={t.k} type="button" className={`jb tp ${j.type === t.k ? 'on' : ''}`} data-tip={t.tip} aria-pressed={j.type === t.k} aria-label={t.label} onClick={() => setJoin(i, { type: t.k })}>
                      <svg width="30" height="20" viewBox="2 4 20 16" aria-hidden="true"><path d={t.fill} fill="currentColor" fillOpacity=".45" stroke="none" /><path d="M3 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0M9 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
                    </button>
                  ))}
                </div>
                <select className="mini sel2" aria-label="Table to join" value={j.table} onChange={(e) => setJoin(i, { table: e.target.value, keys: autoKeys(plan.input, e.target.value, lNames) })}>
                  {Object.keys(plan.input.tables).filter((t) => t !== plan.input.table).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <p className="jx">{JOIN_EXPLAIN[j.type]}</p>
              <div className="jk">
                {j.keys.map((k, ki) => (
                  <div className="kr" key={ki}>
                    <select className="mini sel2" aria-label="Column from the left table" value={k.l} onChange={(e) => setJoin(i, { keys: j.keys.map((q, z) => (z === ki ? { ...q, l: e.target.value } : q)) })}>{lNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                    <span className="eq">=</span>
                    <select className="mini sel2" aria-label="Column from the joined table" value={k.r} onChange={(e) => setJoin(i, { keys: j.keys.map((q, z) => (z === ki ? { ...q, r: e.target.value } : q)) })}>{rNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                    <button type="button" className="x2" aria-label="Remove this key pair" onClick={() => setJoin(i, { keys: j.keys.filter((_, z) => z !== ki) })}><X size={12} /></button>
                  </div>
                ))}
                <div className="rrow">
                  <button type="button" className="lnk" onClick={() => setJoin(i, { keys: [...j.keys, { l: lNames[0] ?? '', r: rNames[0] ?? '' }] })}>Add a key pair</button>
                  {pj && !pj.ok && <span className="warnt">Pick the columns that match in both tables.</span>}
                </div>
              </div>
            </Step>
          )
        })}

        {model.joins.length < MAX_JOINS && (
          <Step ghost tone="s-add" icon={<Plus size={14} aria-hidden="true" />} title="Join another table">
            <div className="chips">
              {sugs.map((x) => (
                <button key={x.table} type="button" className="chipb" onClick={() => update({ joins: [...model.joins, { table: x.table, type: 'left', keys: x.keys }] })}>
                  {x.table}<span className="sub">on {x.keys.map((k) => k.l).join(', ')}</span>
                </button>
              ))}
              <select className="mini sel2" aria-label="Join any other table" value="" onChange={(e) => e.target.value && update({ joins: [...model.joins, { table: e.target.value, type: 'left', keys: autoKeys(plan.input, e.target.value, plan.names) }] })}>
                <option value="">Another table…</option>
                {Object.keys(plan.input.tables).filter((t) => t !== plan.input.table && !model.joins.some((j) => j.table === t)).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {sugs.length === 0 && <p className="hint">No other table shares a column name with this one, but you can still pick one and choose the matching columns.</p>}
          </Step>
        )}

        <Step tone="s-flt" icon={<Filter size={16} aria-hidden="true" />} title="Filter" count={model.where.length ? rows(m.counts.filter) : ''}>
          {model.where.map((w, i) => (
            <div className="frow" key={i}>
              <select className="mini sel2" aria-label="Filter column" value={w.col} onChange={(e) => update({ where: model.where.map((x, k) => (k === i ? { ...x, col: e.target.value } : x)) })}>{plan.names.map((n) => <option key={n} value={n}>{n}</option>)}</select>
              <select className="mini sel2" aria-label="Filter operator" value={w.op} onChange={(e) => update({ where: model.where.map((x, k) => (k === i ? { ...x, op: e.target.value as FilterOp } : x)) })}>{OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              <input className="mini w" aria-label="Filter value" value={w.val} placeholder="value" onChange={(e) => update({ where: model.where.map((x, k) => (k === i ? { ...x, val: e.target.value } : x)) })} />
              <button type="button" className="x2" aria-label="Remove filter" onClick={() => update({ where: model.where.filter((_, k) => k !== i) })}><X size={12} /></button>
            </div>
          ))}
          <div className="rrow">
            <button type="button" className="lnk" onClick={() => plan.names.length && update({ where: [...model.where, { col: plan.names[Math.min(plan.names.length - 1, 2)], op: '=', val: '' }] })}>Add a filter</button>
            {model.where.length === 0 && <span className="hint">Keep only the rows you care about.</span>}
          </div>
        </Step>

        <Step tone="s-sum" icon={<Sigma size={16} aria-hidden="true" />} title="Summarize" count={plan.group.length ? rows(m.counts.summary) : ''}>
          <div className="chips">
            {plan.group.map((g) => <button key={g} type="button" className="cc" aria-label={`Remove ${g} from group by`} onClick={() => update({ group: model.group.filter((x) => x !== g) })}>{g}<X size={10} strokeWidth={2.6} aria-hidden="true" /></button>)}
            <button type="button" className="lnk" aria-haspopup="dialog" onClick={(e) => openPicker('group', e.currentTarget.getBoundingClientRect())}>Group by…</button>
          </div>
          {plan.group.length > 0 ? (
            <div className="frow">
              <select className="mini sel2" aria-label="Aggregate" value={plan.fn} onChange={(e) => update({ fn: e.target.value as AggFn })}>{AGGS.map((a) => <option key={a} value={a}>{a}</option>)}</select>
              <span className="lab">of</span>
              <select className="mini sel2" aria-label="Aggregated column" value={plan.aggCol} onChange={(e) => update({ aggCol: e.target.value })}>{quant.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
            </div>
          ) : <p className="hint">Group rows to count or total them, for example trips by mode.</p>}
        </Step>

        <Step icon={<ArrowUpDown size={16} aria-hidden="true" />} title="Columns, sort and limit">
          <div className="frow"><button type="button" className="btn sm" aria-haspopup="dialog" onClick={(e) => openPicker('cols', e.currentTarget.getBoundingClientRect())}>{plan.selCols.length ? `${plan.selCols.length} of ${plan.cols.length} columns` : `All ${plan.cols.length} columns`}</button></div>
          <div className="frow">
            <span className="lab">Sort by</span>
            <select className="mini sel2" aria-label="Sort column" value={plan.outCols.some((c) => c.name === model.order) ? model.order : ''} onChange={(e) => update({ order: e.target.value })}>
              <option value="">none</option>{plan.outCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <select className="mini sel2" aria-label="Sort direction" value={model.dir} onChange={(e) => update({ dir: e.target.value as 'asc' | 'desc' })}><option value="desc">descending</option><option value="asc">ascending</option></select>
            <span className="lab">Limit</span>
            <input className="mini w" aria-label="Row limit" value={model.limit} placeholder="none" onChange={(e) => update({ limit: e.target.value.replace(/[^0-9]/g, '') })} />
          </div>
        </Step>
      </div>
      {okJoins.length === 0 && null}
    </>
  )
}

function SqlTab({ m }: { m: DataTabModel }) {
  const s = m.state
  const ta = useRef<HTMLTextAreaElement>(null)
  const text = m.sql
  const tokens = highlightSql(text)
  const lines = text.split('\n').map((_, i) => i + 1)

  const onChange = (value: string) => {
    const plan = m.plan
    if (plan && !s.detached) {
      const lim = /\blimit\s+(\d+)\s*;?\s*$/i.exec(value)
      const cand: QueryModel = { ...s.model, limit: lim ? lim[1] : '' }
      const norm = (x: string) => x.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim().toLowerCase()
      if (norm(buildSql(planQuery(plan.input, cand), cand)) === norm(value)) { setExplore({ model: cand, detached: false, sql: '' }); return }
    }
    setExplore({ detached: true, sql: value })
  }
  const copy = () => { ta.current?.select(); try { document.execCommand('copy') } catch { /* the text stays selected */ } }
  return (
    <>
      <div className="th">
        <div><p className="ts" style={{ margin: 0 }}>{s.detached ? 'You edited the SQL by hand, so the builder is paused. It runs as written.' : 'Read-only SQL. Edit it directly and it takes over from the builder.'}</p></div>
        <div className="rrow">
          {s.detached && <><span className="badge warnb">edited by hand</span><button type="button" className="lnk" onClick={() => setExplore({ detached: false, sql: '', queryTab: 'builder' })}>Back to the builder</button></>}
          <button type="button" className="btn sm" onClick={copy}>Copy</button>
        </div>
      </div>
      <div className="ed">
        <div className="edscroll">
          <div className="gut" aria-hidden="true">{lines.map((n) => <div key={n}>{n}</div>)}</div>
          <div className="edc">
            <pre aria-hidden="true">{tokens.map((t, i) => <span key={i} className={t.c}>{t.t}</span>)}</pre>
            <textarea ref={ta} className="edta" spellCheck={false} wrap="off" aria-label="SQL query" value={text} onChange={(e) => onChange(e.target.value)} />
          </div>
        </div>
      </div>
    </>
  )
}

function Footer({ m }: { m: DataTabModel }) {
  const s = m.state
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const running = m.status === 'running'
  const save = async () => {
    const ok = checkName(name, s.mine.map((t) => t.name))
    if (!ok.ok) { setNote(ok.reason); return }
    try {
      const info = await saveMyTable(ok.name, m.sql)
      setExplore((st) => ({ mine: [...st.mine, { id: `m${st.nextId}`, name: ok.name, sql: m.sql, columns: info.columns, rowCount: info.rowCount }], nextId: st.nextId + 1 }))
      setName('')
      setNote(`Saved as ${ok.name}. Charts can use it now.`)
    } catch (e) { setNote((e as Error).message) }
  }
  const status =
    m.status === 'ok' ? `${m.rows.length.toLocaleString('en-US')} rows on this page, ${m.columns.length} columns${m.ms !== null ? ` in ${m.ms} ms` : ''}`
      : running ? 'Running…' : m.status === 'idle' ? '' : m.message || 'Cancelled.'
  return (
    <div className="qfoot">
      <div className="actions">
        {running
          ? <button type="button" className="btn run" onClick={() => void cancelRunning()}>Cancel</button>
          : <button type="button" className="btn pri run" onClick={() => setExplore({ runNonce: s.runNonce + 1 })}><Play size={14} fill="currentColor" aria-hidden="true" />Run query</button>}
        <span className={`runmsg ${m.status === 'ok' ? 'ok' : ''}`} role="status">{note || status}</span>
      </div>
      <div className="save">
        <input className="inp" aria-label="Name for the saved table" value={name} placeholder="Name this result to reuse it in charts" onChange={(e) => { setName(e.target.value); setNote('') }} />
        <button type="button" className="btn" disabled={m.status !== 'ok'} onClick={() => void save()}>Save as table</button>
      </div>
    </div>
  )
}
