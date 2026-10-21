// Headline metrics shared by the scenario-comparison charts (Across model years, Ranked by metric, Scenario scorecard).
// Each metric is read from one run's `summary_kpis` row. Pure: no DOM, no stores. (project-docs/redesign/03 section 5.5)
import type { Row } from '@/charts/types'
import { deltaValue } from '@/panels/compareMath'
import type { DisplayMode } from '@/state/compareState'

export interface MetricDef {
  id: string
  label: string
  /** Unit shown under a scorecard header and after a value in a tooltip. */
  unit: string
  decimals: number
  /** The metric's value in its display unit from a `summary_kpis` row, or null when the row lacks it. */
  get(row: Row): number | null
}

const col = (row: Row, c: string): number | null => {
  const v = row[c]
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const scaled = (c: string, k: number) => (row: Row): number | null => {
  const v = col(row, c)
  return v === null ? null : v * k
}

export const METRICS: readonly MetricDef[] = [
  { id: 'trips', label: 'Daily trips', unit: 'M', decimals: 2, get: scaled('total_trips', 1e-6) },
  { id: 'drive', label: 'Drive-alone share', unit: '%', decimals: 1, get: scaled('drive_share', 100) },
  { id: 'transit', label: 'Transit share', unit: '%', decimals: 1, get: scaled('transit_share', 100) },
  { id: 'active', label: 'Walk and bike share', unit: '%', decimals: 1, get: scaled('active_share', 100) },
  { id: 'vmt', label: 'Daily VMT', unit: 'M mi', decimals: 1, get: scaled('total_vmt', 1e-6) },
  { id: 'boards', label: 'Transit boardings', unit: 'k', decimals: 0, get: scaled('transit_boardings', 1e-3) },
  { id: 'len', label: 'Average trip length', unit: 'mi', decimals: 1, get: (row) => col(row, 'avg_trip_length_miles') },
]

/** The metric with this id; unknown or missing ids fall back to Transit share (the tiles' default). */
export function metricOf(id: string | undefined): MetricDef {
  return METRICS.find((m) => m.id === id) ?? METRICS[2]
}

/** One run's value of `metric` from the rows of its summary_kpis table; null when the run has none. */
export function kpiValue(rows: readonly Row[], metric: MetricDef): number | null {
  return rows.length ? metric.get(rows[0]) : null
}

/** Decimals used to show a Change / % change value of `metric` (a % change is always one decimal). */
export const deltaDecimals = (metric: MetricDef, mode: DisplayMode): number => (mode === 'pct' ? 1 : metric.decimals)

/** `value unit` in a tooltip ("12.4 %" reads badly, so a % unit is attached without a space). */
export function withUnit(text: string, unit: string): string {
  return unit === '%' ? `${text}%` : `${text} ${unit}`
}

export interface ScoreColumn {
  metric: MetricDef
  /** Largest absolute % distance from the reference in this column, at least 0.5, so each column spans its colour range. */
  max: number
}

/** The % distance of `v` from `ref` (null when not computable). */
export const pctDistance = (v: number | null, ref: number | null): number | null => deltaValue(v, ref, 'pct')

/** Scorecard shading strength 0..38 and sign for a cell: `|distance| / column max` clamped to 1, times 38, rounded. */
export function shade(distancePct: number | null, max: number): { strength: number; negative: boolean } {
  if (distancePct === null || !Number.isFinite(distancePct)) return { strength: 0, negative: false }
  const x = Math.max(-1, Math.min(1, distancePct / max))
  return { strength: Math.round(Math.abs(x) * 38), negative: x < 0 }
}

/** Column scale for the scorecard: max absolute % distance across the compared rows, floored at 0.5. */
export function columnMax(distances: readonly (number | null)[]): number {
  let m = 0
  for (const d of distances) if (d !== null && Number.isFinite(d)) m = Math.max(m, Math.abs(d))
  return Math.max(0.5, m || 1)
}

export interface SortState {
  /** Column index, or null for the table's own order. */
  key: number | null
  /** -1 descending (first click), 1 ascending. */
  dir: 1 | -1
}

/** Header click: a new column sorts descending first, the same column flips direction. */
export function nextSort(s: SortState, key: number): SortState {
  return s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }
}

/** Rows ordered by the sort state; null values sink to the bottom whichever direction. Stable. */
export function sortRows<T>(rows: readonly T[], s: SortState, value: (row: T, key: number) => number | null): T[] {
  if (s.key === null) return [...rows]
  const k = s.key
  return rows
    .map((r, i) => ({ r, i, v: value(r, k) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i
      if (a.v === null) return 1
      if (b.v === null) return -1
      return s.dir * (a.v - b.v) || a.i - b.i
    })
    .map((x) => x.r)
}

export interface RankRow {
  key: string
  /** Plotted value: the value itself, or the difference; null = not computable (drawn "n/a"). */
  v: number | null
  raw: number | null
  ref: number | null
}

/** Descending by plotted value; "n/a" rows last. */
export function rankRows(rows: readonly RankRow[]): RankRow[] {
  return [...rows].sort((a, b) => {
    if (a.v === null && b.v === null) return 0
    if (a.v === null) return 1
    if (b.v === null) return -1
    return b.v - a.v
  })
}
