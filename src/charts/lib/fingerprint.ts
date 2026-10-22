// Calibration fingerprint rules (04 section 9): the eight ActivitySim submodels, status thresholds, radar scale and
// geometry. Pure.
import type { Row } from '@/charts/types'

export interface Submodel {
  /** The value of `calibration_errors.submodel`; also the radar axis label. */
  short: string
  /** Tooltip / table title. */
  name: string
  /** What the error is measured on. */
  measure: string
}

export const SUBMODELS: readonly Submodel[] = [
  { short: 'Auto ownership', name: 'Auto ownership', measure: 'Households by vehicles' },
  { short: 'Activity pattern', name: 'Coordinated daily activity pattern', measure: 'Persons by pattern' },
  { short: 'Work location', name: 'Work location', measure: 'Mean commute distance' },
  { short: 'School location', name: 'School location', measure: 'Mean school distance' },
  { short: 'Tour mode', name: 'Tour mode choice', measure: 'Tours by mode' },
  { short: 'Tour timing', name: 'Tour scheduling', measure: 'Departure by hour' },
  { short: 'Stop frequency', name: 'Stop frequency', measure: 'Stops per tour' },
  { short: 'Trip mode', name: 'Trip mode choice', measure: 'Trips by mode' },
]

export const TOLERANCE = 3
export const MAX_SERIES = 6

export type Status = 'ok' | 'warn' | 'fail'
export const status = (e: number): Status => (e <= TOLERANCE ? 'ok' : e <= 5 ? 'warn' : 'fail')
export const STATUS_LABEL: Record<Status, string> = { ok: 'Within 3%', warn: 'Review', fail: 'Off target' }
export const statusVar = (s: Status): string => `var(--${s})`

/** Worst-segment error per submodel (SUBMODELS order) from a run's `calibration_errors` rows; null when the table is
 * empty. A submodel missing from the table reads 0. */
export function errorsFrom(rows: readonly Row[]): number[] | null {
  if (rows.length === 0) return null
  const by = new Map(rows.map((r) => [String(r.submodel ?? ''), Number(r.worst_segment_error_pct)]))
  return SUBMODELS.map((s) => {
    const v = by.get(s.short)
    return v !== undefined && Number.isFinite(v) ? v : 0
  })
}

/** Outer radius value of the radar: at least 6.5, else the largest error rounded up to even, plus 1. */
export function radarMax(errors: readonly number[]): number {
  const m = errors.length ? Math.max(...errors) : 0
  return Math.max(6.5, Math.ceil(m / 2) * 2 + 1)
}

/** The three ring values (thirds of the max, rounded). */
export const ringValues = (max: number): number[] => [1, 2, 3].map((q) => Math.round((max * q) / 3))

/** Axis angle in radians: axis 0 at 12 o'clock, clockwise. */
export const axisAngle = (i: number, n: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n

/** Polar point of value `v` on axis i for a radar of outer radius R representing `max`. */
export function polar(cx: number, cy: number, R: number, max: number, i: number, n: number, v: number): [number, number] {
  const r = (v / max) * R
  const a = axisAngle(i, n)
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
}

/** SVG text-anchor for an axis label from the cosine of its angle: centred near the vertical axis. */
export const labelAnchor = (cosA: number): 'start' | 'middle' | 'end' => (Math.abs(cosA) < 0.2 ? 'middle' : cosA > 0 ? 'start' : 'end')
