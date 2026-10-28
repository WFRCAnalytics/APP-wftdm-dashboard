// 065-chart-builder: what the Explore builder can browse. Scenarios and their tables come from the app's own scenario
// registry (the same catalogue the AI assistant reads); columns come from DESCRIBE on the registered view, with a type
// inferred per column. Everything goes through services/duckdb.ts (one shared connection).
import { inferDataType } from '@/charts/builder/columnTypes'
import { buildCatalog, viewNameOf } from '@/services/ai/catalog'
import { query } from '@/services/duckdb'
import { ensureRegistered } from '@/services/tabDataLoader'
import type { ColumnInfo, TableInfo } from '@/explore/sql/queryModel'
import { getExploreOptions, tableAllowed } from '@/explore/options'

export interface ScenarioOption { name: string; label: string; kind: string }

export function listScenarios(): ScenarioOption[] {
  return buildCatalog().map((s) => ({ name: s.name, label: s.label, kind: s.kind }))
}

export interface TableOption { name: string; missingIn: string[] }

/** Tables present in every selected scenario come first and are selectable; the rest list where they are missing.
 * The deployer's `tables.include` and `tables.exclude` decide which names are offered at all. */
export function tablesFor(scenarios: readonly string[]): TableOption[] {
  const cat = buildCatalog().filter((s) => scenarios.includes(s.name))
  const all = new Set<string>()
  for (const s of cat) for (const m of s.metrics) all.add(m.metric)
  const { tables } = getExploreOptions()
  return Array.from(all)
    .filter((name) => tableAllowed(name, tables))
    .sort()
    .map((name) => ({ name, missingIn: cat.filter((s) => !s.metrics.some((m) => m.metric === name)).map((s) => s.name) }))
}

export const viewName = viewNameOf
export const quoteIdent = (s: string) => `"${s.replace(/"/g, '""')}"`

const cache = new Map<string, Promise<TableInfo>>()

/** Columns and inferred types of one table, read from one scenario's view. Cached. */
export function describeTable(scenario: string, table: string): Promise<TableInfo> {
  const key = `${scenario}__${table}`
  let p = cache.get(key)
  if (!p) {
    p = load(scenario, table)
    cache.set(key, p)
    p.catch(() => cache.delete(key))
  }
  return p
}

async function load(scenario: string, table: string): Promise<TableInfo> {
  await ensureRegistered([{ scenario, metric: table }])
  const view = quoteIdent(viewNameOf(scenario, table))
  const d = await query(`DESCRIBE ${view}`)
  const cols = d.map((r) => ({ name: String(r.column_name), dbType: String(r.column_type) }))
  const strings = cols.filter((c) => /^(VARCHAR|STRING|TEXT)/i.test(c.dbType))
  const stats = new Map<string, { rows: number; distinct: number; avgLength: number }>()
  if (strings.length) {
    const parts = strings.map((c, i) => `count(DISTINCT ${quoteIdent(c.name)}) AS d${i}, avg(length(${quoteIdent(c.name)})) AS l${i}`)
    const r = (await query(`SELECT count(*) AS n, ${parts.join(', ')} FROM ${view}`))[0] ?? {}
    strings.forEach((c, i) => stats.set(c.name, { rows: Number(r.n ?? 0), distinct: Number(r[`d${i}`] ?? 0), avgLength: Number(r[`l${i}`] ?? 0) }))
  }
  const columns: ColumnInfo[] = cols.map((c) => ({ name: c.name, type: inferDataType({ name: c.name, dbType: c.dbType, ...stats.get(c.name) }) }))
  return { name: table, columns }
}

/** Describes several tables with a small concurrency limit; used to find joinable tables without flooding the connection. */
export async function describeMany(scenario: string, tables: readonly string[], limit = 3): Promise<Record<string, TableInfo>> {
  const out: Record<string, TableInfo> = {}
  let i = 0
  const worker = async () => {
    while (i < tables.length) {
      const t = tables[i++]
      try { out[t] = await describeTable(scenario, t) } catch { /* an unreadable table is simply not offered */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tables.length) }, worker))
  return out
}
