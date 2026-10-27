// 065-chart-builder: runs the user's SQL on the app's one shared DuckDB connection. Read-only (the statement guard),
// one run at a time (a mutex, because cancelling affects whatever is running), with a time limit, and paged by wrapping the
// statement (never by appending to it). Contract: specs/065-chart-builder/contracts/query-and-guard.md.
import { buildCatalog, protectedNames, viewsReferencedBy } from '@/services/ai/catalog'
import { authorize } from '@/services/ai/sqlGuard'
import { cancelRunning, queryArrow } from '@/services/duckdb'
import { ensureRegistered } from '@/services/tabDataLoader'

export const RUN_TIMEOUT_MS = 60_000

export interface ResultColumn { name: string; dbType: string }
export type UserQueryResult =
  | { outcome: 'ok'; columns: ResultColumn[]; rows: unknown[][]; hasMore: boolean }
  | { outcome: 'refused' | 'error'; reason: string }
  | { outcome: 'cancelled' | 'timed-out' }

export function toCell(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  if (v instanceof Date) return v.toISOString().replace('T', ' ').replace(/\.000Z$/, '').replace(/ 00:00:00$/, '')
  if (v instanceof Uint8Array) return `<${v.length} bytes>`
  if (typeof v === 'object' && typeof (v as { toJSON?: unknown }).toJSON === 'function') return toCell((v as { toJSON: () => unknown }).toJSON())
  try { return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x)) } catch { return String(v) }
}

/** Strips trailing semicolons and comments so the statement can sit inside a subquery. */
export function wrapForPage(sql: string, limit: number, offset: number): string {
  const body = sql.replace(/(--[^\n]*)\s*$/g, '').trim().replace(/[;\s]+$/, '')
  return `SELECT * FROM (\n${body}\n) AS q LIMIT ${limit + 1} OFFSET ${offset}`
}

let chain: Promise<unknown> = Promise.resolve()
let running = false
export const isRunning = (): boolean => running

/** Queues behind any run already in flight. */
export function runUserSql(sql: string, opts: { page: number; pageSize: number; signal?: AbortSignal }): Promise<UserQueryResult> {
  const next = chain.then(() => execute(sql, opts), () => execute(sql, opts))
  chain = next.catch(() => undefined)
  return next
}

async function execute(sql: string, opts: { page: number; pageSize: number; signal?: AbortSignal }): Promise<UserQueryResult> {
  const verdict = authorize(sql, 'read-only', protectedNames())
  if (!verdict.allowed) return { outcome: 'refused', reason: verdict.reason }
  if (verdict.statements.length > 1) return { outcome: 'refused', reason: 'Run one statement at a time.' }
  if (opts.signal?.aborted) return { outcome: 'cancelled' }
  running = true
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; void cancelRunning() }, RUN_TIMEOUT_MS)
  const onAbort = () => void cancelRunning()
  opts.signal?.addEventListener('abort', onAbort)
  try {
    const needed = viewsReferencedBy(sql, buildCatalog())
    if (needed.length) await ensureRegistered(needed.map(({ scenario, metric }) => ({ scenario, metric })))
    const table = await queryArrow(wrapForPage(sql, opts.pageSize, opts.page * opts.pageSize))
    const columns = table.schema.fields.map((f) => ({ name: f.name, dbType: String(f.type) }))
    const n = Math.min(table.numRows, opts.pageSize)
    const rows: unknown[][] = []
    for (let i = 0; i < n; i++) rows.push(columns.map((_c, j) => toCell(table.getChildAt(j)?.get(i))))
    return { outcome: 'ok', columns, rows, hasMore: table.numRows > opts.pageSize }
  } catch (e) {
    if (timedOut) return { outcome: 'timed-out' }
    if (opts.signal?.aborted) return { outcome: 'cancelled' }
    return { outcome: 'error', reason: (e as Error).message }
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
    running = false
  }
}
