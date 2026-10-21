// Loads the whole table of one run for the chart panels: `SELECT *` from the registered view, cached per (run, table).
// The chart tables are small aggregates, so charts aggregate them in JavaScript; registration stays lazy and goes
// through the shared ensureRegistered(), so only tiles that are drawn load their files.
import { get as getScenario } from '@/state/appState'
import { query } from '@/services/duckdb'
import { ensureRegistered } from '@/services/tabDataLoader'
import type { ChartData, Row } from '@/charts/types'

const cache = new Map<string, Promise<Row[]>>()

const key = (run: string, table: string) => `${run}__${table}`

/** True unless the run's metric catalog is known and lacks the table. */
export function runHasTable(run: string, table: string): boolean {
  const catalog = getScenario(run)?.availableMetrics
  return !catalog || catalog.includes(table)
}

export function loadRows(run: string, table: string): Promise<Row[]> {
  const k = key(run, table)
  const hit = cache.get(k)
  if (hit) return hit
  if (!runHasTable(run, table)) return Promise.resolve([])
  const p = ensureRegistered([{ scenario: run, metric: table }])
    .then(() => query(`SELECT * FROM "${k}"`))
    .catch((err) => {
      cache.delete(k)
      console.error(`chart data: failed to load ${k}`, err)
      return [] as Row[]
    })
  cache.set(k, p)
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
  cache.clear()
}
