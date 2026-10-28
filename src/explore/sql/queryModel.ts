// 065-chart-builder: the query builder's model and the SQL it produces. Pure: no DuckDB, no DOM. The builder form edits a
// QueryModel; `planQuery` resolves it against the tables' columns (joins, name clashes, group); `buildSql` writes the SQL.
// Contract: specs/065-chart-builder/contracts/query-and-guard.md.
import { chartRole, type DataType } from '@/charts/builder/columnTypes'
import { getExploreOptions } from '@/explore/options'

export type JoinType = 'inner' | 'left' | 'right' | 'full'
export type FilterOp = '=' | '≠' | '>' | '<' | 'contains' | 'in' | 'not in'
export type AggFn = 'sum' | 'mean' | 'median' | 'min' | 'max' | 'count'

export interface JoinKey { l: string; r: string }
export interface JoinSpec { table: string; type: JoinType; keys: JoinKey[] }
/** `val` is the text typed or picked; for `in` and `not in` it is a JSON list of the picked values. */
export interface Filter { col: string; op: FilterOp; val: string }

/** Columns whose values are picked from a list (a few distinct values) rather than typed. */
export const isPickType = (t: DataType): boolean => t === 'category' || t === 'ordinal' || t === 'boolean'

/** The comparisons that make sense for a column of this type: no greater-than on a category, no ranges on text. */
export function opsFor(t: DataType): FilterOp[] {
  if (isPickType(t)) return ['=', '≠', 'in', 'not in']
  const role = chartRole(t)
  if (role === 'q' || role === 't') return ['=', '≠', '>', '<']
  return ['=', '≠', 'contains']
}

export function opLabel(op: FilterOp, t: DataType): string {
  const role = chartRole(t)
  if (op === '=') return 'is'
  if (op === '≠') return 'is not'
  if (op === 'in') return 'is any of'
  if (op === 'not in') return 'is none of'
  if (op === 'contains') return 'contains'
  if (role === 't') return op === '>' ? 'after' : 'before'
  return op === '>' ? 'greater than' : 'less than'
}

export const isListOp = (op: FilterOp): boolean => op === 'in' || op === 'not in'
export const parseList = (val: string): string[] => {
  try { const v: unknown = JSON.parse(val); return Array.isArray(v) ? v.map(String) : [] } catch { return [] }
}
export const listVal = (items: string[]): string => (items.length ? JSON.stringify(items) : '')

// Edits the table makes to the query. Pure patches over the model, so the table, the builder and the SQL stay one thing.

/** Sort by a column, or clear the sort when `dir` is null. */
export function sortPatch(col: string, dir: 'asc' | 'desc' | null): Pick<QueryModel, 'order' | 'dir'> | { order: '' } {
  return dir === null ? { order: '' } : { order: col, dir }
}

/** The filters with one more `col op val`; the same filter twice is added once. */
export function withFilter(where: Filter[], f: Filter): Filter[] {
  return where.some((w) => w.col === f.col && w.op === f.op && w.val === f.val) ? where : [...where, f]
}

/** A short phrase for a filter, e.g. `mode is any of Car, Bus`, for the chips above the table. */
export function describeFilter(w: Filter, type: DataType): string {
  const val = isListOp(w.op) ? parseList(w.val).join(', ') : w.val
  return `${w.col} ${opLabel(w.op, type)} ${val || '…'}`
}

/** Toggle one column in the chosen output columns. An empty list means every column, so the first uncheck starts from all. */
export function toggleSelect(select: string[], all: string[], name: string): string[] {
  const on = select.length ? select : all
  const next = on.includes(name) ? on.filter((n) => n !== name) : all.filter((n) => on.includes(n) || n === name)
  if (next.length === 0) return on
  return next.length === all.length ? [] : next
}

export interface QueryModel {
  /** Chosen output columns; empty means every column. Ignored while grouping. */
  select: string[]
  joins: JoinSpec[]
  where: Filter[]
  group: string[]
  fn: AggFn
  aggCol: string
  order: string
  dir: 'asc' | 'desc'
  limit: string
}

/** How many tables may be joined to the first: the deployer's `limits.max_joins`, 4 unless set. */
export const maxJoins = (): number => getExploreOptions().limits.maxJoins

export function emptyModel(): QueryModel {
  return { select: [], joins: [], where: [], group: [], fn: 'sum', aggCol: '', order: '', dir: 'desc', limit: '' }
}

export interface ColumnInfo { name: string; type: DataType }
export interface TableInfo { name: string; columns: ColumnInfo[] }

export interface PlanInput {
  table: string
  scenarios: readonly string[]
  tables: Readonly<Record<string, TableInfo>>
  /** DuckDB view name of one table in one scenario. */
  viewName(scenario: string, table: string): string
}

export interface PlanCol extends ColumnInfo { expr: string; origin: string }
export interface PlanJoin {
  ok: boolean
  table: string
  type: JoinType
  alias: string
  keys: { l: string; r: string; lx: string; rx: string }[]
  added: (PlanCol & { orig: string })[]
  leftNames: string[]
  rightNames: string[]
}
export interface Plan {
  input: PlanInput
  cols: PlanCol[]
  names: string[]
  joins: PlanJoin[]
  needAlias: boolean
  group: string[]
  fn: AggFn
  aggCol: string
  outName: string
  outCols: ColumnInfo[]
  selCols: PlanCol[]
}

const ALIASES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']

/** The columns a table exposes: a scenario column is added when several scenarios are combined. */
export function relationColumns(table: TableInfo, scenarios: readonly string[]): ColumnInfo[] {
  return scenarios.length > 1 ? [{ name: 'scenario', type: 'category' }, ...table.columns] : table.columns
}

/** Matching column names between the columns so far and another table: the keys a join should start with. */
export function autoKeys(input: PlanInput, other: string, leftNames: readonly string[]): JoinKey[] {
  const info = input.tables[other]
  if (!info) return []
  const rn = relationColumns(info, input.scenarios).map((c) => c.name)
  const keys: JoinKey[] = rn.filter((n) => n !== 'scenario' && leftNames.includes(n)).map((n) => ({ l: n, r: n }))
  if (keys.length && leftNames.includes('scenario') && rn.includes('scenario')) keys.push({ l: 'scenario', r: 'scenario' })
  return keys
}

/** Tables that share a column name with the current result and are not joined yet. */
export function suggestJoins(input: PlanInput, plan: Plan, model: QueryModel): { table: string; keys: JoinKey[] }[] {
  const used = new Set([input.table, ...model.joins.map((j) => j.table)])
  const out: { table: string; keys: JoinKey[] }[] = []
  for (const name of Object.keys(input.tables)) {
    if (used.has(name)) continue
    const keys = autoKeys(input, name, plan.names)
    if (keys.length) out.push({ table: name, keys })
  }
  return out
}

export function planQuery(input: PlanInput, model: QueryModel): Plan {
  const primary = input.tables[input.table]
  const primaryCols = primary ? relationColumns(primary, input.scenarios) : []
  let cols: PlanCol[] = primaryCols.map((c) => ({ ...c, expr: `a.${c.name}`, origin: input.table }))
  const joins: PlanJoin[] = []
  let n = 0
  for (const j of model.joins) {
    const leftNames = cols.map((c) => c.name)
    const info = input.tables[j.table]
    if (!info || n >= maxJoins()) {
      joins.push({ ok: false, table: j.table, type: j.type, alias: '', keys: [], added: [], leftNames, rightNames: [] })
      continue
    }
    const rc = relationColumns(info, input.scenarios)
    const rightNames = rc.map((c) => c.name)
    const keys = j.keys.filter((k) => leftNames.includes(k.l) && rightNames.includes(k.r))
    if (!keys.length) {
      joins.push({ ok: false, table: j.table, type: j.type, alias: '', keys: [], added: [], leftNames, rightNames })
      continue
    }
    n++
    const alias = ALIASES[n]
    const dropRight = new Set(keys.filter((k) => k.l === k.r).map((k) => k.r))
    const added = rc
      .filter((c) => !dropRight.has(c.name))
      .map((c) => ({
        name: leftNames.includes(c.name) ? `${j.table}_${c.name}` : c.name,
        type: c.type, expr: `${alias}.${c.name}`, origin: j.table, orig: c.name,
      }))
    const keysX = keys.map((k) => ({ l: k.l, r: k.r, lx: cols.find((c) => c.name === k.l)!.expr, rx: `${alias}.${k.r}` }))
    cols = cols.concat(added)
    joins.push({ ok: true, table: j.table, type: j.type, alias, keys: keysX, added, leftNames, rightNames })
  }
  const names = cols.map((c) => c.name)
  const group = model.group.filter((g) => names.includes(g))
  let outCols: ColumnInfo[]
  let fn = model.fn
  let aggCol = ''
  let outName = ''
  let selCols: PlanCol[] = []
  if (group.length) {
    const quant = cols.filter((c) => chartRole(c.type) === 'q' && !group.includes(c.name)).map((c) => c.name)
    aggCol = model.aggCol && quant.includes(model.aggCol) ? model.aggCol : quant[0] ?? ''
    if (!aggCol) fn = 'count'
    outName = fn === 'count' ? 'n' : `${fn}_${aggCol}`
    outCols = [...group.map((g) => cols.find((c) => c.name === g)!), { name: outName, type: fn === 'count' ? 'integer' : 'decimal' }]
  } else {
    selCols = model.select.filter((s) => names.includes(s)).map((s) => cols.find((c) => c.name === s)!)
    outCols = selCols.length ? selCols : cols
  }
  return { input, cols, names, joins, needAlias: joins.some((j) => j.ok), group, fn, aggCol, outName, outCols, selCols }
}

const KEYWORDS = new Set(['select', 'from', 'where', 'group', 'order', 'by', 'table', 'column', 'index', 'user', 'limit', 'join', 'end', 'case'])
/** Bare when safe, double-quoted otherwise. */
export function ident(name: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(name) && !KEYWORDS.has(name) ? name : `"${name.replace(/"/g, '""')}"`
}

const AGG_SQL: Record<AggFn, string> = { sum: 'SUM', mean: 'AVG', median: 'MEDIAN', min: 'MIN', max: 'MAX', count: 'COUNT' }
const JOIN_SQL: Record<JoinType, string> = { inner: 'INNER JOIN', left: 'LEFT JOIN', right: 'RIGHT JOIN', full: 'FULL OUTER JOIN' }
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`

function fromTable(input: PlanInput, table: string, alias: string): string {
  const view = (s: string) => `"${input.viewName(s, table).replace(/"/g, '""')}"`
  if (input.scenarios.length > 1) {
    return `(\n${input.scenarios.map((s) => `  SELECT ${lit(s)} AS scenario, * FROM ${view(s)}`).join('\n  UNION ALL\n')}\n) AS ${alias}`
  }
  return `${view(input.scenarios[0] ?? '')} AS ${alias}`
}

export type SqlStage = 'full' | 'source' | { joins: number } | 'filter' | 'summary'

/** The SQL for a plan. `stage` returns a count query for the row-count badge on a step instead of the full query. */
export function buildSql(plan: Plan, model: QueryModel, stage: SqlStage = 'full'): string {
  const { input } = plan
  const A = plan.needAlias
  const unionPrimary = input.scenarios.length > 1
  const alias = A || unionPrimary ? (A ? 'a' : 't') : 'a'
  let from = fromTable(input, input.table, alias)
  if (!A && !unionPrimary) from = from.replace(/ AS a$/, '')
  const okJoins = plan.joins.filter((j) => j.ok)
  const upTo = typeof stage === 'object' ? stage.joins : okJoins.length
  const joinSql = okJoins.slice(0, stage === 'source' ? 0 : upTo).map(
    (j) => `${JOIN_SQL[j.type]} ${fromTable(input, j.table, j.alias)}\n  ON ${j.keys.map((k) => `${k.lx} = ${k.rx}`).join(' AND ')}`,
  )
  const ex = (c: PlanCol) => (A ? `${c.expr.slice(0, c.expr.indexOf('.'))}.${ident(c.expr.slice(c.expr.indexOf('.') + 1))}` : ident(c.name))
  const item = (c: PlanCol) => (A && c.expr.slice(c.expr.indexOf('.') + 1) !== c.name ? `${ex(c)} AS ${ident(c.name)}` : ex(c))
  const colX = (name: string) => ex(plan.cols.find((c) => c.name === name)!)

  const wheres = model.where
    .filter((w) => plan.names.includes(w.col) && w.val !== '' && (!isListOp(w.op) || parseList(w.val).length > 0))
    .map((w) => {
      const c = plan.cols.find((x) => x.name === w.col)!
      const numeric = chartRole(c.type) === 'q' && w.val.trim() !== '' && !Number.isNaN(Number(w.val))
      const x = ex(c)
      if (w.op === 'contains') return `${x} ILIKE ${lit(`%${w.val}%`)}`
      if (w.op === 'in' || w.op === 'not in') return `CAST(${x} AS VARCHAR) ${w.op === 'in' ? 'IN' : 'NOT IN'} (${parseList(w.val).map(lit).join(', ')})`
      return `${x} ${w.op === '≠' ? '<>' : w.op} ${numeric ? String(Number(w.val)) : lit(w.val)}`
    })

  const body = [`FROM ${from}`, ...joinSql]
  if (stage === 'source' || typeof stage === 'object') return `SELECT count(*) AS n\n${body.join('\n')}`
  if (wheres.length) body.push(`WHERE ${wheres.join('\n  AND ')}`)
  if (stage === 'filter') return `SELECT count(*) AS n\n${body.join('\n')}`

  let sel = '*'
  if (plan.group.length) {
    const g = plan.group.map((n) => plan.cols.find((c) => c.name === n)!)
    const measure = plan.fn === 'count' ? 'COUNT(*) AS n' : `${AGG_SQL[plan.fn]}(${colX(plan.aggCol)}) AS ${plan.outName}`
    sel = [...g.map(item), measure].join(', ')
    body.push(`GROUP BY ${g.map(ex).join(', ')}`)
  } else if (plan.selCols.length || A) {
    const list = plan.selCols.length ? plan.selCols : plan.cols
    sel = list.length > 4 ? `\n  ${list.map(item).join(',\n  ')}` : list.map(item).join(', ')
  }
  if (stage === 'summary') return `SELECT count(*) AS n FROM (\nSELECT ${sel}\n${body.join('\n')}\n) AS s`
  const out = [`SELECT ${sel}`, ...body]
  if (model.order && plan.outCols.some((c) => c.name === model.order)) out.push(`ORDER BY ${ident(model.order)} ${model.dir === 'asc' ? 'ASC' : 'DESC'}`)
  const lim = parseInt(model.limit, 10)
  if (lim > 0) out.push(`LIMIT ${lim}`)
  return out.join('\n')
}
