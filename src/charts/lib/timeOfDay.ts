// Shared data and interaction helpers for the "trips through the day" kinds (time-lines, time-stream, time-heat) and the
// speed heatmap. The builders are pure (no DOM, no stores) so their numbers are unit-tested.
import { select } from 'd3-selection'

import { FACILITIES, INCOMES, MODES, PURPOSES } from '@/charts/vocab'
import { num, str } from '@/charts/util'
import type { ChartScenario, ChartTheme, Row } from '@/charts/types'

export type TodGroup = 'scn' | 'mode' | 'purpose' | 'income' | 'none'
export const HOURS = 24
export const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21]

export function todGroup(id: string | undefined): TodGroup {
  return id === 'mode' || id === 'purpose' || id === 'income' || id === 'none' ? id : 'scn'
}

/** The metric table each group reads. */
export function todTable(group: TodGroup): string {
  return group === 'mode'
    ? 'trips_by_hour_mode'
    : group === 'purpose'
      ? 'trips_by_hour_purpose'
      : group === 'income'
        ? 'trips_by_hour_income'
        : 'trips_by_hour'
}

const CATEGORY_COLUMN = { mode: 'major_trip_mode', purpose: 'primary_purpose', income: 'income_group' } as const
export const ALL_TRIPS = 'All trips'

export interface TodPoint {
  /** Series name (a run id for the scenario group, else the category). */
  g: string
  hour: number
  /** Thousand trips. */
  v: number
}

export interface TodSeries {
  names: string[]
  rows: TodPoint[]
}

/** Thousand trips per hour (24 entries) of a run's `trips_by_hour`; zeros when the run has no table. */
export function hourlyThousands(rows: readonly Row[]): number[] {
  const out = new Array<number>(HOURS).fill(0)
  for (const r of rows) {
    const h = num(r, 'hour')
    if (h >= 0 && h < HOURS) out[h] += num(r, 'trips') / 1000
  }
  return out
}

/**
 * One series per compared run (group `scn`) or per category of the focus run, every series with all 24 hours and
 * categories in vocabulary order including categories with no rows.
 */
export function buildTodSeries(
  group: TodGroup,
  scenarios: readonly Pick<ChartScenario, 'run'>[],
  focusRun: string | undefined,
  rows: (run: string, table: string) => readonly Row[],
): TodSeries {
  const out: TodPoint[] = []
  if (group === 'scn') {
    for (const s of scenarios) hourlyThousands(rows(s.run, 'trips_by_hour')).forEach((v, hour) => out.push({ g: s.run, hour, v }))
    return { names: scenarios.map((s) => s.run), rows: out }
  }
  if (!focusRun) return { names: group === 'none' ? [ALL_TRIPS] : [], rows: out }
  if (group === 'none') {
    hourlyThousands(rows(focusRun, 'trips_by_hour')).forEach((v, hour) => out.push({ g: ALL_TRIPS, hour, v }))
    return { names: [ALL_TRIPS], rows: out }
  }
  const names: string[] = group === 'mode' ? [...MODES] : group === 'purpose' ? [...PURPOSES] : [...INCOMES]
  const col = CATEGORY_COLUMN[group]
  const grid = new Map<string, number[]>(names.map((n) => [n, new Array<number>(HOURS).fill(0)]))
  for (const r of rows(focusRun, todTable(group))) {
    const arr = grid.get(str(r, col))
    const h = num(r, 'hour')
    if (arr && h >= 0 && h < HOURS) arr[h] += num(r, 'trips') / 1000
  }
  for (const n of names) grid.get(n)!.forEach((v, hour) => out.push({ g: n, hour, v }))
  return { names, rows: out }
}

/** Each row's trips as a percentage of that row's own total, one entry per hour. */
export function rowShares(series: TodSeries): TodPoint[] {
  const totals = new Map<string, number>()
  for (const d of series.rows) totals.set(d.g, (totals.get(d.g) ?? 0) + d.v)
  return series.rows.map((d) => ({ ...d, v: totals.get(d.g) ? (d.v / totals.get(d.g)!) * 100 : 0 }))
}

/** Colour of a series: scenario colour, mode colour, categorical colour (purposes) or a c1 ramp (incomes). */
export function todColor(
  group: TodGroup,
  names: readonly string[],
  scenarios: readonly Pick<ChartScenario, 'run' | 'color'>[],
  theme: Pick<ChartTheme, 'mode' | 'cat' | 'ramp' | 'tokens' | 'mute'>,
): (name: string) => string {
  if (group === 'scn') return (n) => scenarios.find((s) => s.run === n)?.color ?? theme.mute
  if (group === 'mode') return (n) => theme.mode(n)
  if (group === 'purpose') return (n) => theme.cat(Math.max(0, names.indexOf(n)))
  if (group === 'income') {
    const ramp = theme.ramp(theme.tokens.c1, names.length || 4, 0.55)
    return (n) => ramp[Math.max(0, names.indexOf(n))] ?? theme.tokens.c1
  }
  return () => theme.tokens.c1
}

export interface SpeedCell {
  facility: string
  hour: number
  v: number
}

/** Cells in facility vocabulary order; facilities or hours the table lacks are left out (no invented speeds). */
export function speedCells(rows: readonly Row[]): SpeedCell[] {
  const out: SpeedCell[] = []
  for (const f of FACILITIES) {
    for (const r of rows) {
      if (str(r, 'facility_type') !== f) continue
      const hour = num(r, 'hour')
      const v = num(r, 'avg_speed_mph')
      if (hour >= 0 && hour < HOURS && Number.isFinite(v)) out.push({ facility: f, hour, v })
    }
  }
  return out
}

/** "6 AM", "12 PM": the tooltip title for an hour. */
export const hourTitle = (h: number): string => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`

/** Axis tick: "12a 3a ... 9p". */
export const hourTick = (h: number): string => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`

/** Heatmap column tick: only every third hour is labelled. */
export const hourTickEvery3 = (h: number): string => (h % 3 ? '' : hourTick(h))

/** Lines y tick: "200k" for values, signed "+12k" / "−3.5%" in Change / % change. */
export function lineTickFormat(display: 'val' | 'abs' | 'pct'): (d: number) => string {
  return (d) => {
    if (display === 'val') return `${Math.round(d)}k`
    const sign = d > 0.0049 ? '+' : d < -0.0049 ? '−' : ''
    return `${sign}${Math.abs(+d.toFixed(1))}${display === 'pct' ? '%' : 'k'}`
  }
}

/**
 * Left/Right arrow navigation for a crosshair chart (05 section 9): the svg becomes focusable, each arrow moves the
 * snapped x one step and shows the tooltip near the guide; Escape or blur hides it.
 */
export function crosshairKeys(
  svg: SVGSVGElement,
  move: (x: number | null, at?: { clientX: number; clientY: number }) => void,
  o: { ml: number; mr: number; mt: number; mb: number; w: number; h: number; x0: number; x1: number },
  label: string,
): void {
  let cur: number | null = null
  svg.setAttribute('tabindex', '0')
  svg.setAttribute('aria-label', `${label}. Use the left and right arrow keys to move through the hours.`)
  svg.style.outlineOffset = '-2px'
  const show = (x: number) => {
    const r = svg.getBoundingClientRect()
    const px = o.ml + ((x - o.x0) / (o.x1 - o.x0)) * (o.w - o.ml - o.mr)
    move(x, { clientX: r.left + px, clientY: r.top + o.mt + (o.h - o.mt - o.mb) / 3 })
  }
  select(svg).on('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 1 : -1
      cur = cur === null ? (step > 0 ? o.x0 : o.x1) : Math.max(o.x0, Math.min(o.x1, cur + step))
      show(cur)
    } else if (e.key === 'Escape') {
      cur = null
      move(null)
    }
  })
  select(svg).on('blur', () => {
    cur = null
    move(null)
  })
}
