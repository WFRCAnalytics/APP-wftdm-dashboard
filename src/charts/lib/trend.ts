// Data rules of the Across model years chart (04 section 25): which scenario groups get a line, the per-year values in
// Values / Change / % change, and the crosshair snap. Pure.
import { deltaValue } from '@/panels/compareMath'
import type { DisplayMode } from '@/state/compareState'

export interface TrendRow {
  /** Series key (the scenario group). */
  n: string
  y: number
  /** Plotted value. */
  v: number
  /** The scenario's own value that year. */
  raw: number
  /** The reference's value that year (null in Values mode). */
  ref: number | null
}

/** Nearest milestone to a raw x (ties go to the earlier one). */
export function snapYear(raw: number, years: readonly number[]): number {
  return years.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a))
}

/** A scenario group is an independent scenario (gets a line) when it has runs in more than one model year; calibration
 * rounds and Observed exist in the base year only. */
export function hasTrend(scenarioGroup: string, years: readonly number[], runFor: (alt: string, year: number) => string | undefined): boolean {
  let n = 0
  for (const y of years) if (runFor(scenarioGroup, y)) n += 1
  return n > 1
}

export interface TrendInput {
  scenarioGroups: readonly string[]
  years: readonly number[]
  display: DisplayMode
  /** The scenario group's metric value in a year; null when it has no run (or no value) there. */
  value(alt: string, year: number): number | null
  /** The reference's value for this scenario group in that year (per scenario group: self-base-year differs per line). */
  refValue(alt: string, year: number): number | null
}

/** One row per (scenario group, year) with a plottable value. Change modes drop points whose difference is not defined. */
export function buildTrendRows(i: TrendInput): TrendRow[] {
  const out: TrendRow[] = []
  for (const n of i.scenarioGroups) {
    for (const y of i.years) {
      const raw = i.value(n, y)
      if (raw === null) continue
      const ref = i.display === 'val' ? null : i.refValue(n, y)
      const v = deltaValue(raw, ref, i.display)
      if (v === null) continue
      out.push({ n, y, v, raw, ref })
    }
  }
  return out
}

/** Y tick label: plain number in Values, signed (U+2212) in Change, with % in % change. */
export function trendTick(d: number, display: DisplayMode): string {
  if (display === 'val') return String(d)
  const s = d > 0.0049 ? '+' : d < -0.0049 ? '−' : ''
  return `${s}${Math.abs(+d.toFixed(1))}${display === 'pct' ? '%' : ''}`
}
