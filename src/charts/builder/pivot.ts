// 065-chart-builder: the data of a table as a pivot table. Pure: the compiler hands it rows and the fields of the row groups, column
// groups and measures; it returns nested row and column trees and a function that answers "what is measure m for this row path and
// this column path", where an empty path means "all". The answers come from DuckDB's grouping sets (every subtotal and total is its
// own result row, so a mean or median total is exact), or, for plain rows, from aggregating here over the same prefixes.
// The DOM drawing is pivotDraw.ts.
import type { ShowAs, Sort, TableOpts } from '@/charts/builder/spec'

export type PivotRowData = Record<string, unknown>

export interface MeasureInput {
  label: string
  /** The column the measure summarises (raw rows only; grouping-set rows carry it as `__m{index}`). */
  field: string
  agg: string
  show: ShowAs
  dec: number | null | undefined
  pre: string
  suf: string
}

export interface PivotMeasure {
  label: string
  agg: string
  /** What the cell shows: the value, or its share of a row, a column or the table (only for sums and counts, which add up). */
  show: ShowAs
  pct: boolean
  /** Writes a value (or, for a share, a fraction) the way this measure is formatted. */
  fmt(v: number): string
  /** Every digit, for tooltips. */
  exact(v: number): string
  /** The range of the body cells, for shading and bars. */
  lo: number
  hi: number
}

export interface PNode { name: string; path: string[]; children: PNode[] }

export interface PivotTable {
  title: string
  rowLabels: string[]
  colLabels: string[]
  measures: PivotMeasure[]
  rowTree: PNode[]
  colTree: PNode[]
  /** Measure m over a row path and a column path; `[]` means all rows or all columns. null: no data there. */
  val(m: number, rp: string[], cp: string[]): number | null
  /** What the cell shows: val(), or its share when the measure asks for one. */
  shown(m: number, rp: string[], cp: string[]): number | null
  opts: TableOpts
}

export interface PivotInput {
  title: string
  rowFields: string[]
  colFields: string[]
  rowLabels: string[]
  colLabels: string[]
  measures: MeasureInput[]
  rows: PivotRowData[]
  aggregate(values: number[], agg: string): number
  sort: Sort
  opts: TableOpts
  exact(v: number): string
}

const ADDS = new Set(['sum', 'count'])
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const sep = '\u0002'
const key = (m: number, rp: string[], cp: string[]) => `${m}\u0001${rp.join(sep)}\u0001${cp.join(sep)}`

/** One format for every number of a measure: whole numbers stay whole, otherwise decimals follow the size of the largest. */
export function numberFormat(values: number[]): (v: number) => string {
  const v = values.filter(Number.isFinite)
  if (!v.length) return String
  const max = Math.max(...v.map(Math.abs))
  if (max >= 1e9) return (x) => `${+(x / 1e9).toFixed(2)}B`
  if (max >= 1e7) return (x) => `${+(x / 1e6).toFixed(1)}M`
  const whole = v.every((x) => Math.abs(x - Math.round(x)) < 1e-9)
  const dec = whole ? 0 : max >= 1000 ? 0 : max >= 100 ? 1 : max >= 1 ? 2 : 3
  return (x) => x.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))

export function buildPivot(i: PivotInput): PivotTable {
  const flip = i.opts.transpose
  const R = flip ? i.colFields : i.rowFields
  const C = flip ? i.rowFields : i.colFields
  const store = new Map<string, number>()
  const rowLeaves = new Map<string, string[]>()
  const colLeaves = new Map<string, string[]>()
  const leaf = (map: Map<string, string[]>, p: string[]) => { const k = p.join(sep); if (!map.has(k)) map.set(k, p) }
  const path = (row: PivotRowData, fields: string[]): string[] => {
    const out: string[] = []
    for (const f of fields) { const v = text(row[f]); if (v === null) break; out.push(v) }
    return out
  }

  if (i.rows.length && i.rows[0].__m0 !== undefined) {
    // DuckDB's grouping sets: the fields a row leaves NULL are rolled up, so its path is the prefix that is filled
    for (const row of i.rows) {
      const rp = path(row, R), cp = path(row, C)
      i.measures.forEach((_m, m) => { const v = Number(row[`__m${m}`]); if (row[`__m${m}`] !== null && Number.isFinite(v)) store.set(key(m, rp, cp), v) })
      if (rp.length === R.length) leaf(rowLeaves, rp)
      if (cp.length === C.length) leaf(colLeaves, cp)
    }
  } else {
    const groups = new Map<string, number[]>()
    for (const row of i.rows) {
      const rp = path(row, R), cp = path(row, C)
      if (rp.length < R.length || cp.length < C.length) continue
      leaf(rowLeaves, rp)
      leaf(colLeaves, cp)
      i.measures.forEach((me, m) => {
        const raw = row[me.field]
        const v = me.agg === 'count' ? (raw === null || raw === undefined ? NaN : 1) : Number(raw)
        if (!Number.isFinite(v)) return
        for (let r = 0; r <= R.length; r++) {
          for (let c = 0; c <= C.length; c++) {
            const k = key(m, rp.slice(0, r), cp.slice(0, c))
            const a = groups.get(k)
            if (a) a.push(v)
            else groups.set(k, [v])
          }
        }
      })
    }
    groups.forEach((a, k) => store.set(k, i.aggregate(a, i.measures[Number(k.split('\u0001')[0])].agg)))
  }

  const val = (m: number, rp: string[], cp: string[]): number | null => store.get(key(m, rp, cp)) ?? null

  // ---- trees: natural order, or rows by their subtotal for the first measure
  const grow = (paths: string[][], depth: number, byTotal: ((p: string[]) => number | null) | null, reverse: boolean, dir: 1 | -1 | 0): PNode[] => {
    const names = [...new Set(paths.map((p) => p[depth]))].sort(collator.compare)
    let nodes: PNode[] = names.map((name) => {
      const under = paths.filter((p) => p[depth] === name)
      return { name, path: under[0].slice(0, depth + 1), children: depth + 1 < under[0].length ? grow(under, depth + 1, byTotal, reverse, dir) : [] }
    })
    if (dir !== 0 && byTotal) nodes = nodes.sort((a, b) => ((byTotal(a.path) ?? -Infinity) - (byTotal(b.path) ?? -Infinity)) * dir)
    else if (reverse) nodes = nodes.reverse()
    return nodes
  }
  // the displayed rows are ordered by the sort option (by their total for the first measure); columns keep their natural order
  const dir: 1 | -1 | 0 = i.sort === 'high' ? -1 : i.sort === 'low' ? 1 : 0
  const rowTree = rowLeaves.size ? grow([...rowLeaves.values()], 0, (p) => val(0, p, []), i.sort === 'reverse', dir) : []
  const colTree = colLeaves.size ? grow([...colLeaves.values()], 0, null, false, 0) : []

  // ---- what a cell shows
  const shownOf = (m: number, rp: string[], cp: string[]): number | null => {
    const me = i.measures[m]
    const v = val(m, rp, cp)
    if (v === null || me.show === 'value' || !ADDS.has(me.agg)) return v
    const d = me.show === 'row' ? val(m, rp, []) : me.show === 'col' ? val(m, [], cp) : val(m, [], [])
    return d === null || d === 0 ? null : v / d
  }

  const measures: PivotMeasure[] = i.measures.map((me, m) => {
    const pct = me.show !== 'value' && ADDS.has(me.agg)
    const body: number[] = []
    for (const rp of rowLeaves.values()) for (const cp of colLeaves.values()) { const v = shownOf(m, rp, cp); if (v !== null) body.push(v) }
    const around: number[] = [...body]
    for (const rp of rowLeaves.values()) { const v = shownOf(m, rp, []); if (v !== null) around.push(v) }
    for (const cp of colLeaves.values()) { const v = shownOf(m, [], cp); if (v !== null) around.push(v) }
    const grand = shownOf(m, [], [])
    if (grand !== null) around.push(grand)
    const auto = numberFormat(around)
    const digits = typeof me.dec === 'number' ? me.dec : null
    const core = pct
      ? (x: number) => `${(x * 100).toLocaleString('en-US', { minimumFractionDigits: digits ?? 1, maximumFractionDigits: digits ?? 1 })}%`
      : digits !== null ? (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : auto
    return {
      label: me.label, agg: me.agg, show: pct ? me.show : 'value', pct,
      fmt: pct ? core : (x) => `${me.pre}${core(x)}${me.suf}`,
      exact: (x) => `${me.pre}${i.exact(x)}${me.suf}`,
      lo: body.length ? Math.min(...body) : 0, hi: body.length ? Math.max(...body) : 1,
    }
  })

  return {
    title: i.title,
    rowLabels: flip ? i.colLabels : i.rowLabels,
    colLabels: flip ? i.rowLabels : i.colLabels,
    measures, rowTree, colTree, val, shown: shownOf, opts: i.opts,
  }
}
