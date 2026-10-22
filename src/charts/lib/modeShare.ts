// Pure data builders shared by the mode-share kinds: mode-bars, gap-dots, stacked-bars, slope, donut, mode-table
// (project-docs/redesign/04-chart-catalogue.md sections 1-5). Shares are percents (0-100) here, in MODES order.
import { AUTOS, INCOMES, MODES, PURPOSES } from '@/charts/vocab'
import { f1, num, str } from '@/charts/util'
import type { ChartEnv, ChartPlan, Row } from '@/charts/types'
import type { DisplayMode } from '@/state/compareState'

export type ModeShareEnv = Pick<ChartEnv, 'scenarios' | 'focus' | 'reference' | 'refRunFor' | 'data' | 'group' | 'theme' | 'observedRun'>

const zeros = () => new Array<number>(MODES.length).fill(0)

/** Rows of (key?, major_trip_mode, share) as key -> percent per mode. Without a key the single entry is ''. */
export function sharesBy(rows: readonly Row[], key?: string): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const r of rows) {
    const k = key ? str(r, key) : ''
    const j = (MODES as readonly string[]).indexOf(str(r, 'major_trip_mode'))
    if (j < 0) continue
    const arr = out.get(k) ?? zeros()
    arr[j] = num(r, 'share') * 100
    out.set(k, arr)
  }
  return out
}

/** Overall mode share of a run in percent, zeros when the run has no data. */
export function modeShare(env: Pick<ChartEnv, 'data'>, run: string | undefined): number[] {
  return (run && sharesBy(env.data.rows(run, 'trip_mode_share')).get('')) || zeros()
}

/** Total daily trips of a run (sum of the trip_mode_share `trips` column). */
export function totalTrips(env: Pick<ChartEnv, 'data'>, run: string | undefined): number {
  return run ? env.data.rows(run, 'trip_mode_share').reduce((s, r) => s + num(r, 'trips'), 0) : 0
}

/** Margin of error per mode in percent points (observed trip_mode_share `moe` column), or null when there is none. */
export function moeByMode(env: Pick<ChartEnv, 'data'>, run: string | undefined): Map<string, number> | null {
  if (!run) return null
  const rows = env.data.rows(run, 'trip_mode_share')
  if (!rows.some((r) => Number.isFinite(num(r, 'moe')))) return null
  return new Map(rows.map((r) => [str(r, 'major_trip_mode'), num(r, 'moe') * 100]))
}

export type Group = 'scn' | 'purpose' | 'income'

export function groupOf(plan: Pick<ChartPlan, 'group'>): Group {
  return plan.group === 'purpose' ? 'purpose' : plan.group === 'income' ? 'income' : 'scn'
}

/** What the bars/dots of a mode-share chart are: scenarios, or purposes/incomes of the focus scenario. */
export interface Series {
  names: string[]
  color(name: string): string
  label(name: string): string
  /** Series value for mode index j, in percent. */
  val(name: string, j: number): number
  /** Reference value for series `name` and mode j, in percent. */
  ref(name: string, j: number): number
  refName: string
  /** The series are scenarios (the reference scenario is dropped in Change modes). */
  self: boolean
}

export function seriesTables(plan: Pick<ChartPlan, 'group'>): string[] {
  const g = groupOf(plan)
  return g === 'purpose' ? ['trip_mode_share', 'trip_mode_share_by_purpose'] : g === 'income' ? ['trip_mode_share', 'trip_mode_share_by_income'] : ['trip_mode_share']
}

export function buildSeries(env: ModeShareEnv): Series {
  const group = groupOf(env)
  const { theme } = env
  const focusRun = env.focus?.run ?? env.scenarios[0]?.run
  if (group === 'purpose' || group === 'income') {
    const table = group === 'purpose' ? 'trip_mode_share_by_purpose' : 'trip_mode_share_by_income'
    const key = group === 'purpose' ? 'primary_purpose' : 'income_group'
    const names: string[] = group === 'purpose' ? [...PURPOSES] : [...INCOMES]
    const by = focusRun ? sharesBy(env.data.rows(focusRun, table), key) : new Map<string, number[]>()
    const colors = group === 'purpose' ? names.map((_, i) => theme.cat(i)) : theme.ramp(theme.tokens.c1, 4, 0.55)
    const overall = modeShare(env, focusRun)
    return {
      names,
      color: (n) => colors[names.indexOf(n)],
      label: (n) => n,
      val: (n, j) => by.get(n)?.[j] ?? 0,
      ref: (_n, j) => overall[j],
      refName: `Overall ${env.focus?.label ?? ''}`.trim(),
      self: false,
    }
  }
  const byRun = new Map(env.scenarios.map((s) => [s.run, modeShare(env, s.run)]))
  return {
    names: env.scenarios.map((s) => s.run),
    color: (n) => env.scenarios.find((s) => s.run === n)?.color ?? theme.mute,
    label: (n) => env.scenarios.find((s) => s.run === n)?.label ?? n,
    val: (n, j) => byRun.get(n)?.[j] ?? 0,
    ref: (n, j) => modeShare(env, env.refRunFor(n))[j],
    refName: env.reference.label,
    self: true,
  }
}

/** The series left after dropping the reference scenario's own (all-zero) entry in Change modes. */
export function visibleNames(s: Series, display: DisplayMode, referenceRun: string | undefined): string[] {
  return s.names.filter((n) => !(s.self && display !== 'val' && n === referenceRun))
}

/** Tooltip name of the reference row: "Observed" or "Reference · <label>". */
export const refRowLabel = (refName: string): string => `${refName === 'Observed' ? '' : 'Reference · '}${refName}`

// ---------------------------------------------------------------------------------------------------------------- gap dots

export interface GapRow {
  mode: string
  s: string
  /** Difference rounded to one decimal; null when % change has no reference value. */
  gap: number | null
}

export function gapRows(names: string[], s: Series, display: 'abs' | 'pct'): GapRow[] {
  return names.flatMap((n) =>
    MODES.map((mode, j) => {
      const a = s.val(n, j)
      const r = s.ref(n, j)
      const v = display === 'abs' ? a - r : r === 0 ? null : (a / r - 1) * 100
      return { mode, s: n, gap: v === null ? null : Math.round(v * 10) / 10 }
    }),
  )
}

/** Symmetric x domain half-width: max(4, ceil(maxAbs / 2) * 2). */
export function gapLimit(rows: readonly GapRow[]): number {
  const max = rows.reduce((m, d) => Math.max(m, d.gap === null ? 0 : Math.abs(d.gap)), 0)
  return Math.max(4, Math.ceil(max / 2) * 2)
}

/** Axis title: "Percentage points vs Observed" (the reference name capitalised, rest lower case, as the prototype). */
export function gapAxisLabel(display: 'abs' | 'pct', refName: string): string {
  const r = refName.toLowerCase().replace(/^./, (x) => x.toUpperCase())
  return `${display === 'pct' ? 'Percent change' : 'Percentage points'} vs ${r}`
}

// ---------------------------------------------------------------------------------------------------------------- status

export type Status = 'ok' | 'warn' | 'fail'

/** Gap to observed in points: within 1 is ok, within 2.5 warn, else fail. */
export function gapStatus(gap: number): Status {
  const a = Math.abs(gap)
  return a <= 1 ? 'ok' : a <= 2.5 ? 'warn' : 'fail'
}

// ---------------------------------------------------------------------------------------------------------------- stacked bars

export type StackVariant = 'trips' | 'income' | 'auto' | 'scenario'

export interface StackRow {
  label: string
  vals: number[]
}

export interface StackSpec {
  rows: StackRow[]
  keys: string[]
  colors: string[]
  isMode: boolean
  /** Left margin for the row labels. */
  ml: number
  /** "Of: <population>" in the tooltip. */
  of: string
}

export const stackVariant = (v: unknown): StackVariant => (v === 'income' || v === 'auto' || v === 'scenario' ? v : 'trips')

export function stackTables(variant: StackVariant): string[] {
  return variant === 'trips' ? ['trip_mode_share_by_purpose'] : variant === 'income' ? ['trip_mode_share_by_income'] : variant === 'auto' ? ['auto_ownership_summary'] : ['trip_mode_share']
}

/** Rows (category in order) x columns (MODES or AUTOS) of values from a long table. */
export function crossTab(rows: readonly Row[], rowKey: string, colKey: string, value: string, rowOrder: readonly string[], colOrder: readonly string[]): number[][] {
  const out = rowOrder.map(() => new Array<number>(colOrder.length).fill(0))
  for (const r of rows) {
    const i = rowOrder.indexOf(str(r, rowKey))
    const j = colOrder.indexOf(str(r, colKey))
    if (i >= 0 && j >= 0) out[i][j] += num(r, value)
  }
  return out
}

export function stackSpec(env: ModeShareEnv, variant: StackVariant): StackSpec {
  const t = env.theme
  const focusRun = env.focus?.run ?? env.scenarios[0]?.run
  const modeColors = MODES.map((m) => t.mode(m))
  const rowsOf = (table: string, rowKey: string, rowOrder: readonly string[]) =>
    focusRun ? crossTab(env.data.rows(focusRun, table), rowKey, 'major_trip_mode', 'trips', rowOrder, MODES) : rowOrder.map(() => zeros())
  if (variant === 'income') {
    const m = rowsOf('trip_mode_share_by_income', 'income_group', INCOMES)
    return { rows: INCOMES.map((label, i) => ({ label, vals: m[i] })), keys: [...MODES], colors: modeColors, isMode: true, ml: 104, of: 'income-group trips' }
  }
  if (variant === 'auto') {
    const m = focusRun ? crossTab(env.data.rows(focusRun, 'auto_ownership_summary'), 'income_group', 'auto_ownership', 'households', INCOMES, AUTOS) : INCOMES.map(() => new Array<number>(AUTOS.length).fill(0))
    return { rows: INCOMES.map((label, i) => ({ label, vals: m[i] })), keys: [...AUTOS], colors: t.ramp(t.tokens.c2, AUTOS.length, 0.8), isMode: false, ml: 104, of: 'households' }
  }
  if (variant === 'scenario') {
    const refRun = env.reference.run ?? env.refRunFor(focusRun ?? '')
    const rows: StackRow[] = []
    if (refRun) rows.push({ label: env.reference.label, vals: modeShare(env, refRun) })
    for (const s of env.scenarios) if (s.run !== refRun) rows.push({ label: s.label, vals: modeShare(env, s.run) })
    return { rows, keys: [...MODES], colors: modeColors, isMode: true, ml: 124, of: 'trips' }
  }
  const m = rowsOf('trip_mode_share_by_purpose', 'primary_purpose', PURPOSES)
  return { rows: PURPOSES.map((label, i) => ({ label, vals: m[i] })), keys: [...MODES], colors: modeColors, isMode: true, ml: 86, of: 'purpose trips' }
}

export interface Segment {
  /** Column index. */
  j: number
  /** Percent of the row total. */
  pc: number
  /** Cumulative percent where the segment starts. */
  from: number
}

/** A row's segments as percentages of its total; segments under 0.4% are skipped (but still advance the position). */
export function segments(vals: readonly number[]): Segment[] {
  const tot = vals.reduce((a, b) => a + b, 0)
  if (!(tot > 0)) return []
  const out: Segment[] = []
  let acc = 0
  vals.forEach((v, j) => {
    const pc = (v / tot) * 100
    if (pc >= 0.4) out.push({ j, pc, from: acc })
    acc += pc
  })
  return out
}

/** Segment label: whole percent from 10, one decimal under. */
export const segmentLabel = (pc: number): string => (pc >= 10 ? `${Math.round(pc)}%` : `${f1(pc)}%`)

/** A label fits when the segment is wider than 38 px. */
export const labelFits = (widthPx: number): boolean => widthPx > 38

// ---------------------------------------------------------------------------------------------------------------- donut

/** Mode indexes ranked by share, largest first (stable). */
export function rankModes(vals: readonly number[]): number[] {
  return vals.map((_, i) => i).sort((a, b) => vals[b] - vals[a] || a - b)
}

/** "9.81M" from a trip count. */
export const fmtMillions = (trips: number): string => `${(trips / 1e6).toFixed(2)}M`

// ---------------------------------------------------------------------------------------------------------------- slope

export interface SlopeRow {
  col: 'a' | 'b'
  mode: string
  v: number
}

export function slopeRows(a: number[], b: number[]): SlopeRow[] {
  return MODES.flatMap((mode, j) => [
    { col: 'a' as const, mode, v: a[j] },
    { col: 'b' as const, mode, v: b[j] },
  ])
}

/** Log scale cannot place a zero: plot at the domain floor, label the real number. */
export const SLOPE_DOMAIN: [number, number] = [0.8, 90]
export const slopeY = (v: number): number => Math.max(v, SLOPE_DOMAIN[0])

// ---------------------------------------------------------------------------------------------------------------- table

export interface TableCell {
  /** Share of the run in percent. */
  val: number
  /** The display-mode number (value, difference or percent change); null = n/a. */
  main: number | null
  /** Difference in points vs the reference (null for the reference column). */
  gap: number | null
}

/** One mode's cells per column: the reference first (when there is one), then each scenario. */
export function tableCell(val: number, ref: number | null, display: DisplayMode): TableCell {
  if (ref === null) return { val, main: val, gap: null }
  const gap = val - ref
  const main = display === 'val' ? val : display === 'abs' ? gap : ref === 0 ? null : (val / ref - 1) * 100
  return { val, main, gap }
}

/** Resolved --ok / --warn / --fail of the mounted theme (D3 and Plot need concrete colours). */
export function statusColors(el: Element): Record<Status, string> {
  const style = getComputedStyle(el)
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return { ok: get('--ok', '#167a4a'), warn: get('--warn', '#95600f'), fail: get('--fail', '#d13e3b') }
}

/**
 * In a side-by-side grid every cell draws the same mode legend into the one legend slot of the tile; only the first
 * cell (the reference) should hand it over. True outside a grid.
 */
export function ownsLegend(el: Element): boolean {
  const grid = el.closest('.wf-multi')
  if (!grid) return true
  const cell = el.closest('[data-s]')
  return !cell || grid.firstElementChild === cell
}
