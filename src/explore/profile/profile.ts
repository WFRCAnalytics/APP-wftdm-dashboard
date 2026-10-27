// 065-chart-builder: column summaries. SQL builders and a pure shaper (no DuckDB, no DOM), so the numbers are unit-tested
// (tests/unit/exploreProfile.test.ts). `runProfile` in profileRun.ts executes the SQL through services/duckdb.ts.
import { ROLE_OF, type DataType } from '@/charts/builder/columnTypes'

export interface ProfileStat { k: string; v: string }
export interface ProfileListItem { label: string; n: number; pct: number; w: number }
export interface ColumnProfile {
  n: number
  nulls: number
  missPct: number
  distinct: number
  /** Bar heights 0..1 for the sparkline and the large histogram. */
  bars: number[]
  hist?: { title: string; lo: string; mid: string; hi: string }
  list?: { title: string; items: ProfileListItem[] }
  stats: ProfileStat[]
  /** One line under the column name in the list. */
  meta: string
  /** Two stats for the compact card in the chart tab. */
  peek: ProfileStat[]
}

type Row = Record<string, unknown>
const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0))
const q = (name: string) => `"${name.replace(/"/g, '""')}"`

export function exact(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString('en-US') : (Math.round(v * 100) / 100).toLocaleString('en-US')
}
export function compact(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (a >= 1e4) return `${Math.round(v / 1e3)}k`
  if (a >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10)
}
const day = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString().slice(0, 10)

export const HIST_BINS = 12
export const TOP_VALUES = 8

type Kind = 'numeric' | 'time' | 'text' | 'list' | 'id' | 'geometry' | 'none'
export function kindOf(type: DataType): Kind {
  if (type === 'integer' || type === 'decimal') return 'numeric'
  if (type === 'date' || type === 'datetime') return 'time'
  if (type === 'text') return 'text'
  if (type === 'category' || type === 'ordinal' || type === 'boolean') return 'list'
  if (type === 'id') return 'id'
  if (type === 'geometry') return 'geometry'
  return 'none'
}

/** The value expression a column is summarised by: epoch seconds for dates, length for text, the value for numbers. */
function valueExpr(col: string, type: DataType): string {
  const c = q(col)
  if (type === 'date' || type === 'datetime') return `epoch(CAST(${c} AS TIMESTAMP))`
  if (type === 'text') return `length(CAST(${c} AS VARCHAR))`
  return `CAST(${c} AS DOUBLE)`
}

/** First query: counts and, for numbers, dates and text, the range and quartiles. `rel` is a FROM source such as `(SELECT ...) AS r`. */
export function basicSql(rel: string, col: string, type: DataType): string {
  const c = q(col)
  const base = `count(*) AS n, count(${c}) AS nn, count(DISTINCT ${c}) AS d`
  const k = kindOf(type)
  if (k === 'numeric' || k === 'time' || k === 'text') {
    const v = valueExpr(col, type)
    const extra = k === 'text' ? `, avg(${v}) AS avglen` : ''
    return `SELECT ${base}, min(${v}) AS lo, max(${v}) AS hi, quantile_cont(${v}, 0.25) AS q1, quantile_cont(${v}, 0.5) AS med, quantile_cont(${v}, 0.75) AS q3, avg(${v}) AS mean, stddev_pop(${v}) AS sd${extra} FROM ${rel}`
  }
  if (k === 'id') return `SELECT ${base}, min(CAST(${c} AS VARCHAR)) AS minv, max(CAST(${c} AS VARCHAR)) AS maxv FROM ${rel}`
  return `SELECT ${base} FROM ${rel}`
}

/** Second query (histogram bins or top values), built from the first query's result. */
export function detailSql(rel: string, col: string, type: DataType, basic: Row): string | null {
  const c = q(col)
  const k = kindOf(type)
  if (k === 'numeric' || k === 'time' || k === 'text') {
    if (basic.lo === null || basic.lo === undefined) return null
    const lo = num(basic.lo), hi = num(basic.hi), w = (hi - lo) / HIST_BINS || 1
    const v = valueExpr(col, type)
    const hist = `SELECT least(${HIST_BINS - 1}, CAST(floor((${v} - ${lo}) / ${w}) AS INTEGER)) AS b, count(*) AS c FROM ${rel} WHERE ${c} IS NOT NULL GROUP BY 1 ORDER BY 1`
    return hist
  }
  if (k === 'list') return `SELECT CAST(${c} AS VARCHAR) AS v, count(*) AS c FROM ${rel} WHERE ${c} IS NOT NULL GROUP BY 1 ORDER BY c DESC LIMIT 200`
  return null
}

function listItems(entries: { v: string; c: number }[], total: number, limit: number): ProfileListItem[] {
  const top = entries.slice(0, limit)
  const mx = Math.max(1, ...top.map((e) => e.c))
  return top.map((e) => ({ label: e.v, n: e.c, pct: total ? Math.round((e.c / total) * 1000) / 10 : 0, w: Math.round((e.c / mx) * 100) }))
}

/** Turns the two query results into everything the UI shows for one column. `order` fixes the level order of an ordinal. */
export function shapeProfile(type: DataType, basic: Row, detail: Row[] = [], order?: readonly string[]): ColumnProfile {
  const n = num(basic.n), nn = num(basic.nn), distinct = num(basic.d), nulls = n - nn
  const missPct = n ? Math.round((nulls / n) * 1000) / 10 : 0
  const out: ColumnProfile = {
    n, nulls, missPct, distinct, bars: [], stats: [
      { k: 'Rows', v: exact(n) }, { k: 'Missing', v: `${exact(nulls)} (${missPct}%)` }, { k: 'Distinct', v: exact(distinct) },
    ], meta: '', peek: [],
  }
  const k = kindOf(type)
  if (k === 'numeric' || k === 'time' || k === 'text') {
    if (basic.lo === null || basic.lo === undefined) return out
    const lo = num(basic.lo), hi = num(basic.hi), med = num(basic.med)
    const counts = new Array<number>(HIST_BINS).fill(0)
    for (const r of detail) counts[Math.max(0, Math.min(HIST_BINS - 1, num(r.b)))] += num(r.c)
    const mx = Math.max(1, ...counts)
    out.bars = counts.map((c) => c / mx)
    if (k === 'numeric') {
      out.hist = { title: 'Distribution', lo: compact(lo), mid: `${compact(med)} median`, hi: compact(hi) }
      out.meta = `${compact(lo)} to ${compact(hi)}`
      out.stats.push(
        { k: 'Min', v: exact(lo) }, { k: 'Median', v: exact(med) }, { k: '25%', v: exact(num(basic.q1)) }, { k: '75%', v: exact(num(basic.q3)) },
        { k: 'Max', v: exact(hi) }, { k: 'Mean', v: exact(num(basic.mean)) }, { k: 'Std dev', v: exact(num(basic.sd)) },
      )
      out.peek = [{ k: 'Range', v: out.meta }, { k: 'Median', v: exact(med) }]
    } else if (k === 'time') {
      out.hist = { title: 'Rows over time', lo: day(lo), mid: day(med), hi: day(hi) }
      out.meta = `${day(lo)} to ${day(hi)}`
      out.stats.push({ k: 'Earliest', v: day(lo) }, { k: 'Latest', v: day(hi) }, { k: 'Median', v: day(med) }, { k: 'Span', v: `${exact(Math.round((hi - lo) / 86400))} days` })
      out.peek = [{ k: 'Earliest', v: day(lo) }, { k: 'Latest', v: day(hi) }]
    } else {
      const avg = Math.round(num(basic.avglen))
      out.hist = { title: 'Length in characters', lo: String(lo), mid: `${avg} average`, hi: String(hi) }
      out.meta = `average ${avg} characters`
      out.stats.push({ k: 'Average length', v: `${avg} chars` }, { k: 'Longest', v: `${hi} chars` })
      out.peek = [{ k: 'Average length', v: `${avg} chars` }, { k: 'Distinct', v: exact(distinct) }]
    }
    return out
  }
  if (k === 'list') {
    let entries = detail.map((r) => ({ v: String(r.v), c: num(r.c) }))
    if (order) entries = entries.slice().sort((a, b) => order.indexOf(a.v) - order.indexOf(b.v))
    const items = listItems(entries, nn, type === 'boolean' ? 2 : TOP_VALUES)
    out.list = { title: type === 'boolean' ? 'True and false' : order ? 'Rows by level' : 'Most common values', items }
    out.bars = items.map((i) => i.w / 100)
    const top = entries.slice().sort((a, b) => b.c - a.c)[0]
    if (type === 'boolean') {
      const t = entries.find((e) => e.v === 'true')?.c ?? 0
      const tp = nn ? Math.round((t / nn) * 1000) / 10 : 0
      out.meta = `${tp}% true`
      out.stats.push({ k: 'True', v: `${exact(t)} (${tp}%)` }, { k: 'False', v: `${exact(nn - t)} (${Math.round((100 - tp) * 10) / 10}%)` })
      out.peek = [{ k: 'True', v: `${tp}%` }, { k: 'Missing', v: `${missPct}%` }]
    } else {
      out.meta = `${distinct} value${distinct === 1 ? '' : 's'}`
      if (top) out.stats.push({ k: 'Most common', v: top.v })
      out.peek = [{ k: 'Distinct', v: exact(distinct) }, { k: 'Most common', v: top?.v ?? '' }]
    }
    return out
  }
  if (k === 'id') {
    const uniq = nn ? Math.round((distinct / nn) * 1000) / 10 : 0
    out.meta = uniq === 100 ? 'unique on every row' : `${exact(distinct)} distinct, ${uniq}% unique`
    out.stats.push({ k: 'Unique', v: `${uniq}%` }, { k: 'First', v: String(basic.minv ?? '') }, { k: 'Last', v: String(basic.maxv ?? '') })
    out.peek = [{ k: 'Unique', v: `${uniq}%` }, { k: 'Distinct', v: exact(distinct) }]
    return out
  }
  out.meta = type === 'geometry' ? 'geometry' : 'not summarised'
  out.peek = [{ k: 'Distinct', v: exact(distinct) }, { k: 'Missing', v: `${missPct}%` }]
  return out
}

/** The sparkline colour token per type. */
export function typeColorKey(type: DataType): 'c1' | 'c2' | 'c3' | 'mute' {
  if (type === 'category' || type === 'boolean') return 'c1'
  if (type === 'ordinal') return 'c3'
  if (ROLE_OF[type] === 'q') return 'c2'
  return 'mute'
}
