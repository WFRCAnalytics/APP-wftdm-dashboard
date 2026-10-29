// 064-ai-chat-assistant: runs the assistant's SQL on the app's one shared DuckDB connection (services/duckdb.ts),
// after the statement guard has authorized it, and turns the Arrow result into a capped preview.
import { cancelRunning, query, queryArrow } from '@/services/duckdb'
import { ensureRegistered } from '@/services/tabDataLoader'
import { buildCatalog, protectedNames, viewsReferencedBy } from './catalog.ts'
import { getLimits } from './assistantPolicy.ts'
import { authorize } from './sqlGuard.ts'
import type { ColumnInfo, Permission, QueryAttempt } from './types.ts'

/** Rows of a result shown to the viewer unless the deployment sets `assistant.limits.preview_rows` (assistantPolicy.ts). */
export const MAX_PREVIEW_ROWS = 1000

const ROW_VERBS = new Set(['SELECT', 'WITH', 'FROM', 'VALUES', 'TABLE'])

function toCell(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object' && typeof (v as { toJSON?: unknown }).toJSON === 'function') {
    return toCell((v as { toJSON: () => unknown }).toJSON())
  }
  try {
    return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x)))
  } catch {
    return String(v)
  }
}

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

// Best-effort second opinion for Read-Only (research.md §4): DuckDB's own parser refuses to serialize anything that is
// not a plain SELECT. Skipped for good the first time it cannot run (e.g. the JSON extension is unavailable).
let parserCheckAvailable = true
async function parserSaysNotSelect(statement: string): Promise<boolean> {
  if (!parserCheckAvailable) return false
  try {
    const rows = await query(`SELECT json_serialize_sql(${sqlString(statement)}) AS j`)
    return String(rows[0]?.j ?? '').includes('Only SELECT statements')
  } catch {
    parserCheckAvailable = false
    return false
  }
}

function attempt(sql: string, mode: Permission, patch: Partial<QueryAttempt>): QueryAttempt {
  return { sql, outcome: 'ok', columns: [], rows: [], truncated: false, mode, ...patch }
}

/** Authorize, make the needed data available, run every statement, and return the last statement's preview. */
export async function runSql(sql: string, mode: Permission, signal?: AbortSignal): Promise<QueryAttempt> {
  const verdict = authorize(sql, mode, protectedNames())
  if (!verdict.allowed) return attempt(sql, mode, { outcome: 'refused', reason: verdict.reason })
  if (signal?.aborted) return attempt(sql, mode, { outcome: 'cancelled' })

  if (mode === 'read-only') {
    for (const s of verdict.statements) {
      if (ROW_VERBS.has(s.verb) && (await parserSaysNotSelect(s.text))) {
        return attempt(sql, mode, {
          outcome: 'refused',
          reason: 'This statement is not a plain read, and the assistant is in Read-Only mode.',
        })
      }
    }
  }

  const onAbort = () => void cancelRunning()
  signal?.addEventListener('abort', onAbort)
  try {
    const needed = viewsReferencedBy(sql, buildCatalog())
    if (needed.length) await ensureRegistered(needed.map(({ scenario, metric }) => ({ scenario, metric })))

    const previewRows = getLimits().previewRows
    let table: Awaited<ReturnType<typeof queryArrow>> | undefined
    for (const s of verdict.statements) {
      const text = ROW_VERBS.has(s.verb) ? `SELECT * FROM (\n${s.text}\n) LIMIT ${previewRows + 1}` : s.text
      table = await queryArrow(text)
    }
    if (!table) return attempt(sql, mode, { outcome: 'ok' })

    const columns: ColumnInfo[] = table.schema.fields.map((f) => ({ name: f.name, type: String(f.type) }))
    const shown = Math.min(table.numRows, previewRows)
    const rows: unknown[][] = []
    for (let i = 0; i < shown; i++) {
      rows.push(columns.map((_c, j) => toCell(table!.getChildAt(j)?.get(i))))
    }
    return attempt(sql, mode, { columns, rows, truncated: table.numRows > previewRows })
  } catch (e) {
    if (signal?.aborted) return attempt(sql, mode, { outcome: 'cancelled' })
    return attempt(sql, mode, { outcome: 'error', reason: (e as Error).message })
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

/** DESCRIBE one view: its column names and types. */
export async function describeView(view: string): Promise<ColumnInfo[]> {
  const rows = await query(`DESCRIBE "${view.replace(/"/g, '""')}"`)
  return rows.map((r) => ({ name: String(r.column_name), type: String(r.column_type) }))
}

/**
 * Reset session data: drop every table, view and macro the assistant created. The dashboard's own views are
 * protected (they cannot be changed in the first place), so they are never touched. Returns how many were removed.
 */
export async function resetSessionData(): Promise<number> {
  const protectedLower = new Set(Array.from(protectedNames(), (n) => n.toLowerCase()))
  const objects = await query(
    `SELECT 'TABLE' AS kind, schema_name, table_name AS name FROM duckdb_tables() WHERE NOT internal
     UNION ALL SELECT 'VIEW', schema_name, view_name FROM duckdb_views() WHERE NOT internal
     UNION ALL SELECT 'MACRO', schema_name, function_name FROM duckdb_functions()
       WHERE NOT internal AND function_type IN ('macro', 'table_macro')`,
  )
  let removed = 0
  for (const o of objects) {
    const name = String(o.name)
    if (protectedLower.has(name.toLowerCase())) continue
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`
    await query(`DROP ${o.kind} IF EXISTS ${q(String(o.schema_name))}.${q(name)}`)
    removed++
  }
  return removed
}
