// 065-chart-builder: the columns and rows behind one chart tab. A chart tab has its own data source (a source table across the
// selected scenarios, or a saved table). Only the columns the chart uses are fetched, through the guarded runner, capped.
import { useEffect, useMemo, useState } from 'react'
import type { Col, Row } from '@/charts/builder/compile'
import { describeTable, quoteIdent, viewName } from '@/explore/relations'
import { buildSql, emptyModel, planQuery, relationColumns, type TableInfo } from '@/explore/sql/queryModel'
import { runUserSql } from '@/explore/sql/runUserSql'
import type { ChartTab, ExploreState } from '@/state/exploreState'

export const ROW_CAP = 50_000

export interface ChartData {
  cols: Col[]
  rows: Row[]
  relSql: string
  loading: boolean
  truncated: boolean
  error: string
  relationName: string
}

export function usedFields(tab: ChartTab): string[] {
  const f = new Set(Object.values(tab.spec.enc).map((e) => e!.f))
  if (tab.spec.filter.f) f.add(tab.spec.filter.f)
  return Array.from(f)
}

export function useChartData(tab: ChartTab, s: ExploreState): ChartData {
  const isMine = tab.source.startsWith('m:')
  const mine = isMine ? s.mine.find((m) => `m:${m.id}` === tab.source) : undefined
  const table = isMine ? '' : tab.source.slice(2)
  const [info, setInfo] = useState<TableInfo | null>(null)
  useEffect(() => {
    setInfo(null)
    if (isMine || !table || !s.scenarios[0]) return
    let dead = false
    describeTable(s.scenarios[0], table).then((i) => !dead && setInfo(i), () => undefined)
    return () => { dead = true }
  }, [isMine, table, s.scenarios])

  const cols = useMemo<Col[]>(() => {
    const base = isMine ? mine?.columns ?? [] : info ? relationColumns(info, s.scenarios) : []
    return base.map((c) => ({ name: c.name, type: s.typeOverride[c.name] ?? c.type }))
  }, [isMine, mine, info, s.scenarios, s.typeOverride])

  const relSql = useMemo(() => {
    if (isMine) return mine ? `SELECT * FROM ${quoteIdent(mine.name)}` : ''
    if (!info) return ''
    return buildSql(planQuery({ table, scenarios: s.scenarios, tables: { [table]: info }, viewName }, emptyModel()), emptyModel())
  }, [isMine, mine, info, table, s.scenarios])

  const used = usedFields(tab)
  const usedKey = used.join('\u0001')
  const [state, setState] = useState<{ rows: Row[]; loading: boolean; truncated: boolean; error: string }>({ rows: [], loading: false, truncated: false, error: '' })
  useEffect(() => {
    if (!relSql || used.length === 0 || cols.length === 0) { setState({ rows: [], loading: false, truncated: false, error: '' }); return }
    let dead = false
    setState((p) => ({ ...p, loading: true, error: '' }))
    const h = setTimeout(() => {
      const sql = `SELECT ${used.map(quoteIdent).join(', ')} FROM (\n${relSql}\n) AS r`
      void runUserSql(sql, { page: 0, pageSize: ROW_CAP }).then((r) => {
        if (dead) return
        if (r.outcome !== 'ok') { setState({ rows: [], loading: false, truncated: false, error: 'reason' in r ? r.reason : 'The data could not be read.' }); return }
        const names = r.columns.map((c) => c.name)
        setState({ rows: r.rows.map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]]))), loading: false, truncated: r.hasMore, error: '' })
      })
    }, 150)
    return () => { dead = true; clearTimeout(h) }
    // `used` is captured through its joined key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relSql, usedKey, cols.length])

  return { cols, rows: state.rows, relSql, loading: state.loading, truncated: state.truncated, error: state.error, relationName: isMine ? mine?.name ?? '' : table }
}
