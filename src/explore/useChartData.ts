// 065-chart-builder: the columns and rows behind one chart tab. A chart tab has its own data source (a source table across the
// selected scenarios, or a saved table). Only the columns the chart uses are fetched, through the guarded runner, capped.
import { useEffect, useMemo, useState } from 'react'
import { shelfProblem, type Col, type Row } from '@/charts/builder/compile'
import { chartQuery, ROW_CAP, SCATTER_SAMPLE, type ChartQueryMode } from '@/charts/builder/specToSql'
import type { ChartSpec } from '@/charts/builder/spec'
import { describeTable, quoteIdent, viewName } from '@/explore/relations'
import { buildSql, emptyModel, planQuery, relationColumns, type TableInfo } from '@/explore/sql/queryModel'
import { runUserSql } from '@/explore/sql/runUserSql'
import type { ChartTab, ExploreState } from '@/state/exploreState'

export { ROW_CAP }

export interface ChartData {
  cols: Col[]
  rows: Row[]
  relSql: string
  /** The spec to draw with (aggregates already applied by DuckDB are reset). */
  spec: ChartSpec
  mode: ChartQueryMode | null
  /** Rows in the source relation, when known. */
  total: number | null
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

  // one query returns just what the chart draws (groups, bins, box statistics or a sample), computed over the full data
  // (only the mark, shelves and filter change the data; text, axes and style edits never re-run it)
  const dataKey = JSON.stringify([tab.spec.mark, tab.spec.enc, tab.spec.filter])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(() => (relSql && cols.length && !shelfProblem(tab.spec, cols) ? chartQuery(tab.spec, relSql) : null), [relSql, cols, dataKey])
  const [state, setState] = useState<{ rows: Row[]; loading: boolean; truncated: boolean; error: string }>({ rows: [], loading: false, truncated: false, error: '' })
  useEffect(() => {
    if (!query) { setState({ rows: [], loading: false, truncated: false, error: '' }); return }
    let dead = false
    setState((p) => ({ ...p, loading: true, error: '' }))
    const h = setTimeout(() => {
      void runUserSql(query.sql, { page: 0, pageSize: ROW_CAP }).then((r) => {
        if (dead) return
        if (r.outcome !== 'ok') { setState({ rows: [], loading: false, truncated: false, error: 'reason' in r ? r.reason : 'The data could not be read.' }); return }
        const names = r.columns.map((c) => c.name)
        setState({ rows: r.rows.map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]]))), loading: false, truncated: r.hasMore || (query.mode === 'raw' && r.rows.length >= SCATTER_SAMPLE), error: '' })
      })
    }, 150)
    return () => { dead = true; clearTimeout(h) }
  }, [query])

  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    setTotal(null)
    if (!relSql) return
    let dead = false
    void runUserSql(`SELECT count(*) AS n FROM (
${relSql.replace(/[;\s]+$/, '')}
) AS c`, { page: 0, pageSize: 1 }).then((r) => { if (!dead && r.outcome === 'ok') setTotal(Number(r.rows[0]?.[0] ?? 0)) })
    return () => { dead = true }
  }, [relSql])

  return { cols, rows: state.rows, relSql, spec: query ? { ...tab.spec, enc: query.spec.enc } : tab.spec, mode: query ? query.mode : null, total, loading: state.loading, truncated: state.truncated, error: state.error, relationName: isMine ? mine?.name ?? '' : table }
}
