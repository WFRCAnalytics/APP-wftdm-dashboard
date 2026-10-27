// 065-chart-builder: saving a query result as a named temporary table. The user never submits DDL: the app writes
// `CREATE OR REPLACE TEMP VIEW "xb_<name>" AS <guarded SELECT>` itself. The reserved prefix and the protected-name check keep
// a saved name from hiding a dashboard view. Contract: specs/065-chart-builder/contracts/query-and-guard.md rules 5-7.
import { protectedNames } from '@/services/ai/catalog'
import { authorize } from '@/services/ai/sqlGuard'
import { query } from '@/services/duckdb'
import { inferDataType } from '@/charts/builder/columnTypes'
import type { ColumnInfo } from '@/explore/sql/queryModel'

export const MY_PREFIX = 'xb_'

export function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string }

export function checkName(input: string, existing: readonly string[]): NameCheck {
  const slug = slugify(input)
  if (!slug) return { ok: false, reason: 'Give the result a name first.' }
  const name = MY_PREFIX + slug
  if (existing.some((n) => n.toLowerCase() === name)) return { ok: false, reason: `A table named ${name} already exists.` }
  if (Array.from(protectedNames()).some((n) => n.toLowerCase() === name)) return { ok: false, reason: `${name} is already used by the dashboard.` }
  return { ok: true, name }
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** Creates the temp view and describes it. Throws a readable message when the SQL is refused or fails. */
export async function saveMyTable(name: string, sql: string): Promise<{ columns: ColumnInfo[]; rowCount: number }> {
  const verdict = authorize(sql, 'read-only', protectedNames())
  if (!verdict.allowed) throw new Error(verdict.reason)
  const body = sql.replace(/[;\s]+$/, '')
  await query(`CREATE OR REPLACE TEMP VIEW ${quote(name)} AS\n${body}`)
  const d = await query(`DESCRIBE ${quote(name)}`)
  const n = Number((await query(`SELECT count(*) AS n FROM ${quote(name)}`))[0]?.n ?? 0)
  return {
    columns: d.map((r) => ({ name: String(r.column_name), type: inferDataType({ name: String(r.column_name), dbType: String(r.column_type) }) })),
    rowCount: n,
  }
}

/** Only objects the builder itself created (name starts with the reserved prefix) can be dropped. */
export async function dropMyTable(name: string): Promise<void> {
  if (!name.startsWith(MY_PREFIX)) throw new Error('Only saved tables can be deleted here.')
  await query(`DROP VIEW IF EXISTS temp.${quote(name)}`)
}
