// Loads the tables of one run for the chart panels: `SELECT *` from the registered view, cached per (run, table). The
// chart tables are small aggregates, so charts aggregate them in JavaScript; registration stays lazy and goes through the
// shared ensureRegistered(), so only tiles that are drawn load their files. A logical table the run does not publish is
// derived from its source tables, and raw category values are mapped onto the display vocabulary (charts/data/adapt.ts).
import { get as getScenario } from '@/state/appState'
import { query } from '@/services/duckdb'
import { ensureRegistered } from '@/services/tabDataLoader'
import { adaptTable } from '@/charts/data/adapt'
import type { ChartData, Row } from '@/charts/types'

const rawCache = new Map<string, Promise<Row[]>>()
const adaptedCache = new Map<string, Promise<Row[]>>()

const key = (run: string, table: string) => `${run}__${table}`

/** True unless the run's metric catalog is known and lacks the table. */
export function runHasTable(run: string, table: string): boolean {
  const catalog = getScenario(run)?.availableMetrics
  return !catalog || catalog.includes(table)
}

function loadRaw(run: string, table: string): Promise<Row[]> {
  const k = key(run, table)
  const hit = rawCache.get(k)
  if (hit) return hit
  const p = ensureRegistered([{ scenario: run, metric: table }])
    .then(() => query(`SELECT * FROM "${k}"`))
    .catch((err) => {
      rawCache.delete(k)
      console.error(`chart data: failed to load ${k}`, err)
      return [] as Row[]
    })
  rawCache.set(k, p)
  return p
}

/** Rows of a logical table for a run: native, adapted from the run's own tables, or [] when it has neither. */
export function loadRows(run: string, table: string): Promise<Row[]> {
  const k = key(run, table)
  const hit = adaptedCache.get(k)
  if (hit) return hit
  const p = adaptTable(table, { has: (t) => runHasTable(run, t), rows: (t) => loadRaw(run, t) })
    .then((rows) => rows ?? [])
    .catch((err) => {
      adaptedCache.delete(k)
      console.error(`chart data: failed to prepare ${k}`, err)
      return [] as Row[]
    })
  adaptedCache.set(k, p)
  return p
}

/** Loads every (run, table) pair in parallel and returns a synchronous accessor. */
export async function loadChartData(runs: readonly string[], tables: readonly string[]): Promise<ChartData> {
  const entries = await Promise.all(
    runs.flatMap((run) => tables.map(async (table) => [key(run, table), await loadRows(run, table)] as const)),
  )
  const map = new Map(entries)
  return {
    rows: (run, table) => map.get(key(run, table)) ?? [],
    has: (run, table) => (map.get(key(run, table))?.length ?? 0) > 0,
  }
}

/** Test hook: forget cached tables. */
export function clearChartDataCache(): void {
  rawCache.clear()
  adaptedCache.clear()
}
