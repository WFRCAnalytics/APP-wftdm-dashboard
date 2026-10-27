// 065-chart-builder: compiles a chart spec into the one DuckDB query that returns just what the chart draws, so grouping,
// totals, bins and box statistics are computed over the full data and only a small result reaches the browser. Pure.
// The result rows keep the source field names, so `compile.ts` reads them unchanged: an aggregated measure comes back in a
// column named like the field it summarises, with its aggregate already applied (the compiler is told to total a single value).
import type { Channel, ChartSpec, FieldDef } from '@/charts/builder/spec'

export const ROW_CAP = 50_000
export const SCATTER_SAMPLE = 5_000
export const HIST_BINS = 12

export type ChartQueryMode = 'aggregated' | 'histogram' | 'box' | 'range' | 'raw'
export interface ChartQuery {
  sql: string
  mode: ChartQueryMode
  /** The spec to draw with: aggregates the query already applied are reset so each result row is totalled once. */
  spec: ChartSpec
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`
const AGG_SQL: Record<string, string> = { sum: 'SUM', mean: 'AVG', median: 'MEDIAN', min: 'MIN', max: 'MAX', count: 'COUNT' }

function aggExpr(f: FieldDef, fallback = 'sum'): string {
  const fn = f.agg ?? fallback
  return fn === 'count' ? `COUNT(${q(f.f)})` : `${AGG_SQL[fn]}(CAST(${q(f.f)} AS DOUBLE))`
}

const SERIES: Channel[] = ['color', 'pattern', 'dash', 'shape', 'detail']

/** Fields that split the data into series and panels (the compiler's grouping keys), in a stable order. */
function seriesFields(spec: ChartSpec): string[] {
  const out: string[] = []
  for (const ch of SERIES) {
    const e = spec.enc[ch]
    if (e && !(spec.mark === 'heatmap' && ch === 'color') && !out.includes(e.f)) out.push(e.f)
  }
  return out
}
const facetFields = (spec: ChartSpec): string[] => [spec.enc.row?.f, spec.enc.column?.f].filter((x): x is string => !!x)
const uniq = (a: string[]) => Array.from(new Set(a))

function whereClause(spec: ChartSpec): string {
  const fields = uniq(Object.values(spec.enc).map((e) => e!.f))
  const parts = fields.map((f) => `${q(f)} IS NOT NULL`)
  if (spec.filter.f && spec.filter.v !== '') parts.push(`CAST(${q(spec.filter.f)} AS VARCHAR) = ${lit(spec.filter.v)}`)
  return parts.length ? `WHERE ${parts.join(' AND ')}` : ''
}

function resetAgg(spec: ChartSpec, ch: Channel): ChartSpec {
  const e = spec.enc[ch]
  return e ? { ...spec, enc: { ...spec.enc, [ch]: { ...e, agg: 'sum' } } } : spec
}

export function chartQuery(spec: ChartSpec, relSql: string): ChartQuery {
  const rel = `(\n${relSql.replace(/[;\s]+$/, '')}\n) AS r`
  const where = whereClause(spec)
  const ser = seriesFields(spec), fac = facetFields(spec)
  const { mark } = spec
  const cap = `LIMIT ${ROW_CAP + 1}`
  const grouped = (dims: string[], measure: string, name: string): string => {
    const d = uniq(dims)
    return `SELECT ${[...d.map(q), `${measure} AS ${q(name)}`].join(', ')}\nFROM ${rel}\n${where}\nGROUP BY ${d.map(q).join(', ')}\n${cap}`
  }

  if (mark === 'bar' || mark === 'line' || mark === 'area' || mark === 'radar') {
    const y = spec.enc.y!
    return { mode: 'aggregated', sql: grouped([spec.enc.x!.f, ...ser, ...fac], aggExpr(y), y.f), spec: resetAgg(spec, 'y') }
  }
  if (mark === 'heatmap') {
    const v = spec.enc.color!
    return { mode: 'aggregated', sql: grouped([spec.enc.x!.f, spec.enc.y!.f, ...fac], aggExpr(v), v.f), spec: resetAgg(spec, 'color') }
  }
  if (mark === 'pie' || mark === 'waffle' || mark === 'treemap' || mark === 'sunburst') {
    const v = spec.enc.size!
    return { mode: 'aggregated', sql: grouped([...ser, ...fac], aggExpr(v), v.f), spec: resetAgg(spec, 'size') }
  }
  if (mark === 'sankey' || mark === 'chord') {
    const v = spec.enc.size!
    return { mode: 'aggregated', sql: grouped([spec.enc.x!.f, spec.enc.y!.f, ...fac], aggExpr(v), v.f), spec: resetAgg(spec, 'size') }
  }
  if (mark === 'trail') {
    // a path needs its points in order, so take the first rows by the order field instead of a random sample
    const cols = uniq(Object.values(spec.enc).map((e) => e!.f)).map(q)
    return { mode: 'raw', spec, sql: `SELECT ${cols.join(', ')}\nFROM ${rel}\n${where}\nORDER BY ${q(spec.enc.order!.f)}\nLIMIT ${SCATTER_SAMPLE}` }
  }
  if (mark === 'rule') {
    // one row per category and series: the range of the number and its mean
    const x = `CAST(${q(spec.enc.x!.f)} AS DOUBLE)`, d = uniq([spec.enc.y!.f, ...ser, ...fac]).map(q)
    return { mode: 'range', spec, sql: `SELECT ${d.join(', ')}, MIN(${x}) AS __lo, MAX(${x}) AS __hi, AVG(${x}) AS __mean, COUNT(*) AS __n\nFROM ${rel}\n${where}\nGROUP BY ${d.join(', ')}\n${cap}` }
  }
  if (mark === 'text') {
    const v = spec.enc.label!
    return { mode: 'aggregated', sql: grouped([spec.enc.x!.f, spec.enc.y!.f, ...fac], aggExpr(v), v.f), spec: resetAgg(spec, 'label') }
  }
  if (mark === 'histogram') {
    const x = q(spec.enc.x!.f)
    const dims = uniq([...ser, ...fac])
    const dsel = dims.map(q)
    const w = `(CASE WHEN mm.hi = mm.lo THEN 1.0 ELSE (mm.hi - mm.lo) / ${HIST_BINS} END)`
    const sql =
      `WITH r0 AS (SELECT CAST(${x} AS DOUBLE) AS v${dsel.length ? `, ${dsel.join(', ')}` : ''}\nFROM ${rel}\n${where}),\n` +
      `mm AS (SELECT min(v) AS lo, max(v) AS hi FROM r0)\n` +
      `SELECT mm.lo + (least(${HIST_BINS - 1}, CAST(floor((r0.v - mm.lo) / ${w}) AS INTEGER)) + 0.5) * ${w} AS ${x}, ` +
      `count(*) AS __n, any_value(mm.lo) AS __lo, any_value(mm.hi) AS __hi${dsel.length ? `, ${dsel.map((d) => `r0.${d}`).join(', ')}` : ''}\n` +
      `FROM r0, mm\nGROUP BY 1${dsel.length ? `, ${dsel.map((d) => `r0.${d}`).join(', ')}` : ''}\n${cap}`
    return { mode: 'histogram', sql, spec }
  }
  if (mark === 'box') {
    const y = q(spec.enc.y!.f)
    const dims = uniq([spec.enc.x!.f, ...ser, ...fac]).map(q)
    const d = dims.join(', ')
    const sql =
      `WITH g AS (SELECT ${d}, CAST(${y} AS DOUBLE) AS y\nFROM ${rel}\n${where}),\n` +
      `s AS (SELECT ${d}, quantile_cont(y, 0.25) AS q1, quantile_cont(y, 0.5) AS md, quantile_cont(y, 0.75) AS q3, count(*) AS n FROM g GROUP BY ${d})\n` +
      `SELECT ${dims.map((c) => `s.${c}`).join(', ')}, s.q1 AS __q1, s.md AS __md, s.q3 AS __q3, s.n AS __n,\n` +
      `  min(CASE WHEN g.y >= s.q1 - 1.5 * (s.q3 - s.q1) THEN g.y END) AS __wl,\n` +
      `  max(CASE WHEN g.y <= s.q3 + 1.5 * (s.q3 - s.q1) THEN g.y END) AS __wh,\n` +
      `  CAST(list(g.y) FILTER (WHERE g.y < s.q1 - 1.5 * (s.q3 - s.q1) OR g.y > s.q3 + 1.5 * (s.q3 - s.q1)) AS VARCHAR) AS __out\n` +
      `FROM s JOIN g USING (${d})\nGROUP BY ${dims.map((c) => `s.${c}`).join(', ')}, s.q1, s.md, s.q3, s.n\n${cap}`
    return { mode: 'box', sql, spec }
  }
  // scatter: points are the data, so take a repeatable sample rather than every row
  const cols = uniq(Object.values(spec.enc).map((e) => e!.f)).map(q)
  return { mode: 'raw', sql: `SELECT ${cols.join(', ')}\nFROM ${rel}\n${where}\nUSING SAMPLE ${SCATTER_SAMPLE} ROWS (reservoir, 42)`, spec }
}
