// 065-chart-builder: everything the Data tab needs, in one hook: the scenarios and tables on offer, the described columns,
// the plan and SQL (from the builder, or the hand-edited text), the paged result, the row count and the per-step counts.
import { useEffect, useMemo, useRef, useState } from 'react'
import { inferDataType, type DataType } from '@/charts/builder/columnTypes'
import { describeMany, describeTable, listScenarios, tablesFor, viewName, type ScenarioOption, type TableOption } from '@/explore/relations'
import { buildSql, planQuery, type ColumnInfo, type Plan, type PlanInput, type SqlStage, type TableInfo } from '@/explore/sql/queryModel'
import { runUserSql, type UserQueryResult } from '@/explore/sql/runUserSql'
import { query } from '@/services/duckdb'
import { authorize } from '@/services/ai/sqlGuard'
import { protectedNames } from '@/services/ai/catalog'
import { setExplore, useExplore, resetQuery, type ExploreState } from '@/state/exploreState'

export interface StepCounts { source?: number; joins: (number | undefined)[]; filter?: number; summary?: number }
export type RunStatus = 'idle' | 'running' | 'ok' | 'error' | 'refused' | 'cancelled' | 'timed-out'

export interface DataTabModel {
  state: ExploreState
  scenarioOptions: ScenarioOption[]
  tableOptions: TableOption[]
  isMine: boolean
  tables: Record<string, TableInfo>
  plan: Plan | null
  sql: string
  columns: ColumnInfo[]
  rows: unknown[][]
  hasMore: boolean
  total: number | null
  status: RunStatus
  message: string
  ms: number | null
  counts: StepCounts
  ready: boolean
  /** True while the shown result belongs to the current statement and succeeded, including while another page loads. */
  settled: boolean
}

const applyOverrides = (cols: ColumnInfo[], o: Record<string, DataType>): ColumnInfo[] => cols.map((c) => ({ ...c, type: o[c.name] ?? c.type }))

export function useDataTab(): DataTabModel {
  const s = useExplore()
  const scenarioOptions = useMemo(() => listScenarios(), [])
  const tableOptions = useMemo(() => tablesFor(s.scenarios), [s.scenarios])
  const [infos, setInfos] = useState<Record<string, TableInfo>>({})
  const isMine = s.table.startsWith('m:')
  const mine = isMine ? s.mine.find((m) => `m:${m.id}` === s.table) : undefined

  // Start with the first two scenarios and the first table they share.
  useEffect(() => {
    if (!s.scenarios.length && scenarioOptions.length) setExplore({ scenarios: scenarioOptions.slice(0, 2).map((o) => o.name) })
  }, [s.scenarios.length, scenarioOptions])
  useEffect(() => {
    if (s.table || !s.scenarios.length) return
    const first = tableOptions.find((t) => t.missingIn.length === 0)
    if (first) setExplore({ table: `t:${first.name}` })
  }, [s.table, s.scenarios.length, tableOptions])

  // Describe the chosen table first, then the others (for join suggestions) in the background.
  useEffect(() => {
    const scen = s.scenarios[0]
    if (!scen) return
    let dead = false
    ;(async () => {
      const names = tableOptions.filter((t) => t.missingIn.length === 0).map((t) => t.name)
      if (s.table.startsWith('t:')) {
        try {
          const info = await describeTable(scen, s.table.slice(2))
          if (!dead) setInfos((p) => ({ ...p, [info.name]: info }))
        } catch { /* shown as an error by the run below */ }
      }
      const rest = await describeMany(scen, names)
      if (!dead) setInfos((p) => ({ ...p, ...rest }))
    })()
    return () => { dead = true }
  }, [s.scenarios, s.table, tableOptions])

  const tables = useMemo(() => {
    const out: Record<string, TableInfo> = {}
    for (const [k, v] of Object.entries(infos)) out[k] = { name: v.name, columns: applyOverrides(v.columns, s.typeOverride) }
    return out
  }, [infos, s.typeOverride])

  const tableName = s.table.startsWith('t:') ? s.table.slice(2) : ''
  const ready = isMine || (!!tableName && !!tables[tableName])
  const plan = useMemo(() => {
    if (isMine || !ready) return null
    const input: PlanInput = { table: tableName, scenarios: s.scenarios, tables, viewName }
    return planQuery(input, s.model)
  }, [isMine, ready, tableName, s.scenarios, tables, s.model])

  const sql = isMine ? (mine ? `SELECT * FROM ${mine.name}` : '') : s.detached ? s.sql : plan ? buildSql(plan, s.model) : ''

  // The paged result.
  const [result, setResult] = useState<{ status: RunStatus; res?: UserQueryResult; ms: number | null; forSql?: string }>({ status: 'idle', ms: null })
  const token = useRef(0)
  useEffect(() => {
    if (!sql) return
    const mine_ = ++token.current
    setResult((r) => ({ ...r, status: 'running' }))
    const t0 = performance.now()
    const h = setTimeout(() => {
      void runUserSql(sql, { page: s.page, pageSize: s.pageSize }).then((res) => {
        if (mine_ !== token.current) return
        setResult({ status: res.outcome === 'ok' ? 'ok' : res.outcome, res, ms: Math.round(performance.now() - t0), forSql: sql })
      })
    }, 120)
    return () => clearTimeout(h)
  }, [sql, s.page, s.pageSize, s.runNonce])

  // The statement whose result is on screen. It stays the same while another page loads, and changes only with the statement.
  const okSql = result.res?.outcome === 'ok' && result.forSql === sql ? sql : ''

  // The total row count, only when the SQL is allowed.
  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    setTotal(null)
    if (!okSql) return
    let dead = false
    void runUserSql(`SELECT count(*) AS n FROM (\n${sql.replace(/[;\s]+$/, '')}\n) AS c`, { page: 0, pageSize: 1 }).then((r) => {
      if (!dead && r.outcome === 'ok') setTotal(Number(r.rows[0]?.[0] ?? 0))
    })
    return () => { dead = true }
    // only when the statement changes, not on every page turn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [okSql])

  // Row counts after each builder step.
  const [counts, setCounts] = useState<StepCounts>({ joins: [] })
  useEffect(() => {
    setCounts({ joins: [] })
    if (!plan || s.detached || !okSql) return
    let dead = false
    const run = async (stage: SqlStage) => {
      const text = buildSql(plan, s.model, stage)
      if (!authorize(text, 'read-only', protectedNames()).allowed) return undefined
      try { return Number((await query(text))[0]?.n ?? 0) } catch { return undefined }
    }
    void (async () => {
      const next: StepCounts = { joins: [] }
      next.source = await run('source')
      const okJoins = plan.joins.filter((j) => j.ok)
      for (let i = 0; i < plan.joins.length; i++) next.joins.push(plan.joins[i].ok ? await run({ joins: okJoins.indexOf(plan.joins[i]) + 1 }) : undefined)
      next.filter = await run('filter')
      if (plan.group.length) next.summary = await run('summary')
      if (!dead) setCounts(next)
    })()
    return () => { dead = true }
    // keyed on the statement whose result has landed (its views exist by then), not on the plan object or the page: another
    // table's description arriving rebuilds the plan with the same SQL, and a page turn changes neither
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [okSql, s.detached])

  const res = result.res?.outcome === 'ok' ? result.res : undefined
  const columns = useMemo<ColumnInfo[]>(() => {
    if (!res) return []
    const known = new Map<string, DataType>()
    if (plan && !s.detached) plan.outCols.forEach((c) => known.set(c.name, c.type))
    if (mine) mine.columns.forEach((c) => known.set(c.name, c.type))
    return res.columns.map((c) => ({ name: c.name, type: s.typeOverride[c.name] ?? known.get(c.name) ?? inferDataType({ name: c.name, dbType: c.dbType }) }))
  }, [res, plan, mine, s.detached, s.typeOverride])

  const failed = result.res && result.res.outcome !== 'ok' && result.res.outcome !== 'cancelled' && result.res.outcome !== 'timed-out'
  const message =
    result.res?.outcome === 'timed-out' ? 'This query took too long and was stopped.'
      : result.res?.outcome === 'cancelled' ? 'Cancelled.'
        : failed && result.res && 'reason' in result.res ? result.res.reason : ''
  return {
    state: s, scenarioOptions, tableOptions, isMine, tables, plan, sql, columns, rows: res?.rows ?? [], hasMore: res?.hasMore ?? false,
    total, status: result.status, settled: !!okSql, message, ms: result.ms, counts, ready,
  }
}

export { resetQuery }
