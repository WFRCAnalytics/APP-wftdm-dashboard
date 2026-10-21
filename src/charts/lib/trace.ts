// Calibration progress data (project-docs/redesign/04-chart-catalogue.md section 26, 03 section 7.3): the roll-up rows of
// the rounds family turned into per-series rows with the gap to observed, plus the formatting rules of each metric group.
import type { ChartTheme } from '@/charts/types'
import { MODES } from '@/charts/vocab'
import type { RollupRow } from '@/services/familyRollup'

export type TraceGroup = 'mode' | 'vol' | 'boards' | 'err'

const METRIC_GROUP: Record<TraceGroup, string> = {
  mode: 'mode_share',
  vol: 'volumes',
  boards: 'boardings_by_line',
  err: 'submodel_error',
}

export interface TraceMeta {
  group: TraceGroup
  label: string
  names: string[]
  color(i: number): string
  /** Difference as percent of observed (volumes, boardings) instead of points. */
  pct: boolean
  /** Tolerance in the unit of the difference (points or percent, or percent error for submodels). */
  tol: number
  tolLabel: string
  /** The group plots an error (distance from 0), not a difference from observed. */
  err: boolean
  vfmt(v: number, i: number): string
}

export function traceGroupOf(group: string | undefined): TraceGroup {
  return group === 'vol' || group === 'boards' || group === 'err' ? group : 'mode'
}

/** Series names in a stable order: modes in vocabulary order, others by first appearance in the roll-up. */
function namesFor(group: TraceGroup, rows: readonly RollupRow[]): string[] {
  const seen: string[] = []
  for (const r of rows) if (r.metric_group === METRIC_GROUP[group] && !seen.includes(r.series)) seen.push(r.series)
  if (group !== 'mode') return seen
  return [...MODES.filter((m) => seen.includes(m)), ...seen.filter((s) => !(MODES as readonly string[]).includes(s))]
}

export function traceMeta(group: TraceGroup, rows: readonly RollupRow[], theme: ChartTheme): TraceMeta {
  const names = namesFor(group, rows)
  const base = { group, names }
  switch (group) {
    case 'vol':
      return {
        ...base,
        label: 'Volumes',
        color: (i) => theme.cat(i),
        pct: true,
        tol: 5,
        tolLabel: '±5% of observed',
        err: false,
        vfmt: (v, i) => [`${v.toFixed(2)}M`, `${v.toFixed(1)}M mi`, `${v.toFixed(0)}k`, `${v.toFixed(1)} mi`][i] ?? v.toFixed(1),
      }
    case 'boards':
      return { ...base, label: 'Boardings by line', color: (i) => theme.cat(i), pct: true, tol: 10, tolLabel: '±10% of observed', err: false, vfmt: (v) => `${v.toFixed(1)}k` }
    case 'err':
      return {
        ...base,
        label: 'Submodel error',
        color: (i) => (i < 7 ? theme.cat(i) : theme.mix(theme.surface, theme.ink, 0.5)),
        pct: false,
        tol: 3,
        tolLabel: '3% tolerance',
        err: true,
        vfmt: (v) => `${v.toFixed(1)}%`,
      }
    default:
      return { ...base, label: 'Mode share', color: (i) => theme.mode(names[i]), pct: false, tol: 1, tolLabel: '±1 point of observed', err: false, vfmt: (v) => `${v.toFixed(1)}%` }
  }
}

export interface TraceRow {
  /** Round number. */
  r: number
  /** Series index in `meta.names`. */
  i: number
  name: string
  v: number
  o: number
  /** Gap to observed (points or percent), or the error itself for submodel error. */
  d: number
}

export function traceRows(rows: readonly RollupRow[], meta: TraceMeta): TraceRow[] {
  const metricGroup = METRIC_GROUP[meta.group]
  const out: TraceRow[] = []
  for (const row of rows) {
    if (row.metric_group !== metricGroup) continue
    const i = meta.names.indexOf(row.series)
    if (i < 0) continue
    const d = meta.err ? row.value : meta.pct ? (row.observed_value ? (row.value / row.observed_value - 1) * 100 : 0) : row.value - row.observed_value
    out.push({ r: row.round, i, name: row.series, v: row.value, o: row.observed_value, d })
  }
  return out.sort((a, b) => a.r - b.r || a.i - b.i)
}

/** Signed gap text: `+1.2 pts`, `−3.4%`, or a plain `4.1%` for submodel error. */
export function dfmt(d: number, meta: Pick<TraceMeta, 'err' | 'pct'>): string {
  if (meta.err) return `${d.toFixed(1)}%`
  const sign = d > 0.005 ? '+' : d < -0.005 ? '−' : ''
  return `${sign}${Math.abs(d).toFixed(1)}${meta.pct ? '%' : ' pts'}`
}

/** How many series of one round are within the tolerance. */
export function withinTolerance(rows: readonly TraceRow[], meta: Pick<TraceMeta, 'err' | 'tol'>): number {
  return rows.filter((q) => (meta.err ? q.d <= meta.tol : Math.abs(q.d) <= meta.tol)).length
}
