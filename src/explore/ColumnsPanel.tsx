// 065-chart-builder: the Data tab's Columns panel. Every column gets a small distribution and a one-line summary; the
// selected column gets a larger distribution and summary statistics. Only the columns on screen are summarised.
import { useEffect, useState } from 'react'
import { Segmented } from '@/components/ui/segmented'
import { DATA_TYPES, TYPE_LABEL, typesPresent, type DataType } from '@/charts/builder/columnTypes'
import { loadProfile } from '@/explore/profile/profileRun'
import { typeColorKey, type ColumnProfile } from '@/explore/profile/profile'
import { Sparkline, TypeChip, useInView, XSelect } from '@/explore/parts'
import type { DataTabModel } from '@/explore/useDataTab'
import type { ColumnInfo } from '@/explore/sql/queryModel'
import { setExplore } from '@/state/exploreState'

const colorOf = (t: DataType) => `var(--${typeColorKey(t) === 'mute' ? 'mute' : { c1: 'c-1', c2: 'c-2', c3: 'c-3' }[typeColorKey(t) as 'c1' | 'c2' | 'c3']})`

function useProfile(sql: string, col: ColumnInfo, enabled: boolean): ColumnProfile | undefined {
  const [p, setP] = useState<ColumnProfile | undefined>()
  useEffect(() => {
    setP(undefined)
    if (!enabled || !sql) return
    let dead = false
    loadProfile(sql, col).then((x) => !dead && setP(x), () => undefined)
    return () => { dead = true }
  }, [sql, col.name, col.type, enabled])
  return p
}

function ProfileRow({ sql, col, selected }: { sql: string; col: ColumnInfo; selected: boolean }) {
  const [ref, seen] = useInView<HTMLButtonElement>()
  const p = useProfile(sql, col, seen)
  return (
    <button ref={ref} type="button" className={`prow2 ${selected ? 'sel' : ''}`} aria-pressed={selected} onClick={() => setExplore({ profileCol: col.name })}>
      <TypeChip type={col.type} />
      <span className="pn">{col.name}</span>
      <Sparkline bars={p?.bars ?? []} width={64} height={20} fill={colorOf(col.type)} />
      <span className="pm">{p ? p.meta + (p.missPct > 0 ? ` · ${p.missPct}% missing` : '') : ' '}</span>
    </button>
  )
}

function Detail({ sql, col }: { sql: string; col: ColumnInfo }) {
  const p = useProfile(sql, col, true)
  const n = p?.bars.length || 1
  return (
    <div className="det">
      <div className="dth">
        <span className="dn">{col.name}</span>
        <label className="ty">
          <TypeChip type={col.type} />
          <XSelect className="tsel" aria-label={`Type of ${col.name}`} value={col.type} onChange={(e) => setExplore((s) => ({ typeOverride: { ...s.typeOverride, [col.name]: e.target.value as DataType } }))}>
            {DATA_TYPES.filter((t) => t !== 'complex').map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </XSelect>
        </label>
      </div>
      {!p && <p className="cap">Summarising…</p>}
      {p?.hist && (
        <>
          <p className="cap">{p.hist.title}</p>
          <svg className="hist" viewBox="0 0 300 96" role="img" aria-label={`${p.hist.title} of ${col.name}`}>
            {p.bars.map((h, i) => {
              const hh = Math.max(1.5, h * 78)
              return <rect key={i} x={(i * 300) / n + 0.5} y={78 - hh} width={Math.max(1, 300 / n - 1.2)} height={hh} rx="2" fill={colorOf(col.type)} />
            })}
            <text x="0" y="94" textAnchor="start">{p.hist.lo}</text>
            <text x="150" y="94" textAnchor="middle">{p.hist.mid}</text>
            <text x="300" y="94" textAnchor="end">{p.hist.hi}</text>
          </svg>
        </>
      )}
      {p?.list && (
        <>
          <p className="cap">{p.list.title}</p>
          <div className="top5">
            {p.list.items.map((t) => (
              <div className="t5" key={t.label}>
                <span>{t.label}</span>
                <span className="mono">{t.n.toLocaleString('en-US')} · {t.pct}%</span>
                <div className="bar"><i style={{ width: `${t.w}%` }} /></div>
              </div>
            ))}
          </div>
        </>
      )}
      {p && <div className="stats">{p.stats.map((s) => <div className="st" key={s.k}><span>{s.k}</span><b>{s.v}</b></div>)}</div>}
    </div>
  )
}

export function ColumnsPanel({ m }: { m: DataTabModel }) {
  const { state: s, columns, sql } = m
  const present = typesPresent(columns)
  const active = s.profileType !== 'all' && present.some((p) => p.type === s.profileType) ? s.profileType : 'all'
  const q = s.profileQuery.toLowerCase()
  const matches = columns.filter((c) => (active === 'all' || c.type === active) && (!q || c.name.toLowerCase().includes(q)))
  const shown = matches.slice(0, s.profileShow)
  const selected = columns.find((c) => c.name === s.profileCol) ?? columns[0]
  return (
    <section className="tile col">
      <div className="th"><div><h2 className="tt">Columns</h2><p className="ts">{columns.length} column{columns.length === 1 ? '' : 's'}. Pick one to see its distribution and summary.</p></div></div>
      <div className="psearch">
        <input className="inp" type="search" aria-label="Search columns" placeholder="Search columns" value={s.profileQuery} onChange={(e) => setExplore({ profileQuery: e.target.value, profileShow: 40 })} />
        <div className="xseg"><Segmented label="Column type" value={active} onChange={(id) => setExplore({ profileType: id as typeof active, profileShow: 40 })} options={[{ id: 'all', label: `All ${columns.length}` }, ...present.map((p) => ({ id: p.type, label: `${TYPE_LABEL[p.type]} ${p.count}` }))]} /></div>
      </div>
      <div className="plist grow">
        {shown.map((c) => <ProfileRow key={`${c.name}|${c.type}`} sql={sql} col={c} selected={c.name === selected?.name} />)}
        {matches.length === 0 && <p className="hint" style={{ padding: 8 }}>No column matches that search.</p>}
        {matches.length > shown.length && (
          <button type="button" className="more" onClick={() => setExplore({ profileShow: s.profileShow + 60 })}>Show {Math.min(60, matches.length - shown.length)} more of {matches.length - shown.length} left</button>
        )}
      </div>
      {selected && m.status === 'ok' && <Detail sql={sql} col={selected} />}
    </section>
  )
}
