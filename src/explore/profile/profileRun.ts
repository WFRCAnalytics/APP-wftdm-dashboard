// 065-chart-builder: runs the column-summary queries through services/duckdb.ts. Two at a time, memoised per (query,
// column, type), and only for SQL the statement guard has already allowed: a summary never runs unseen user SQL.
import { authorize } from '@/services/ai/sqlGuard'
import { protectedNames } from '@/services/ai/catalog'
import { query } from '@/services/duckdb'
import { basicSql, detailSql, shapeProfile, type ColumnProfile } from '@/explore/profile/profile'
import type { ColumnInfo } from '@/explore/sql/queryModel'

const cache = new Map<string, Promise<ColumnProfile>>()
let active = 0
const waiting: (() => void)[] = []

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((r) => waiting.push(r))
  active++
  try { return await fn() } finally { active--; waiting.shift()?.() }
}

export function clearProfileCache(): void {
  cache.clear()
}

/** The summary of one column of the result of `sql`. */
export function loadProfile(sql: string, col: ColumnInfo, order?: readonly string[]): Promise<ColumnProfile> {
  const key = `${sql}\u0001${col.name}\u0001${col.type}`
  let p = cache.get(key)
  if (!p) {
    p = (async () => {
      const verdict = authorize(sql, 'read-only', protectedNames())
      if (!verdict.allowed) throw new Error(verdict.reason)
      const rel = `(\n${sql.replace(/[;\s]+$/, '')}\n) AS r`
      return slot(async () => {
        const basic = (await query(basicSql(rel, col.name, col.type)))[0] ?? {}
        const d = detailSql(rel, col.name, col.type, basic)
        const detail = d ? await query(d) : []
        return shapeProfile(col.type, basic, detail, order)
      })
    })()
    cache.set(key, p)
    p.catch(() => cache.delete(key))
  }
  return p
}
