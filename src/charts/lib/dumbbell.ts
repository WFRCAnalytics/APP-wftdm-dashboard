// Pure row building for the dumbbell (project-docs/redesign/04-chart-catalogue.md section 18).
import { INCOMES } from '@/charts/vocab'

export interface DumbbellRow {
  label: string
  /** Observed value, null when the deployment has no observed run (or no row for this label). */
  obs: number | null
  /** Value per compared run. */
  v: Record<string, number>
}

export type DumbbellVariant = 'boards' | 'hh'

export interface DumbbellSpec {
  unit: 'k' | '%'
  axisLabel: string
  subtitle: string
  marginLeft: number
  decimals: number
  /** The metric table the variant reads (also the key of its observed source note). */
  table: string
}

export const DUMBBELL: Record<DumbbellVariant, DumbbellSpec> = {
  boards: { unit: 'k', axisLabel: 'Weekday boardings (thousand)', subtitle: 'weekday boardings', marginLeft: 118, decimals: 0, table: 'transit_boardings' },
  hh: { unit: '%', axisLabel: 'Households with no car (%)', subtitle: 'households with no car', marginLeft: 100, decimals: 1, table: 'auto_ownership_summary' },
}

export interface BoardingsRow {
  line: string
  boardings: number
}
export interface AutosRow {
  auto_ownership: string
  income_group: string
  households: number
}

/** Weekday boardings in thousands per line. Row order: first appearance, observed table first. */
export function boardingsRows(observed: readonly BoardingsRow[], runs: ReadonlyMap<string, readonly BoardingsRow[]>): DumbbellRow[] {
  const labels: string[] = []
  for (const t of [observed, ...runs.values()]) for (const r of t) if (!labels.includes(r.line)) labels.push(r.line)
  const obs = new Map(observed.map((r) => [r.line, r.boardings / 1000]))
  return labels.map((label) => ({
    label,
    obs: obs.get(label) ?? null,
    v: Object.fromEntries([...runs].map(([run, rows]) => [run, (rows.find((r) => r.line === label)?.boardings ?? 0) / 1000])),
  }))
}

/** Percent of an income group's households that own no car; null when the group has no households. */
export function zeroCarShare(rows: readonly AutosRow[], income: string): number | null {
  let all = 0
  let none = 0
  for (const r of rows) {
    if (r.income_group !== income) continue
    all += r.households
    if (r.auto_ownership === '0 cars') none += r.households
  }
  return all ? (none / all) * 100 : null
}

/** One row per income group (INCOMES order). */
export function householdRows(observed: readonly AutosRow[], runs: ReadonlyMap<string, readonly AutosRow[]>): DumbbellRow[] {
  return INCOMES.map((label) => ({
    label,
    obs: zeroCarShare(observed, label),
    v: Object.fromEntries([...runs].map(([run, rows]) => [run, zeroCarShare(rows, label) ?? 0])),
  }))
}

/** Connector extent of a row across Observed and every shown run. */
export function connector(row: DumbbellRow): { a: number; b: number } {
  const vals = [...Object.values(row.v), ...(row.obs === null ? [] : [row.obs])]
  return { a: Math.min(...vals), b: Math.max(...vals) }
}

export const fmtValue = (v: number, spec: DumbbellSpec): string => v.toFixed(spec.decimals) + spec.unit

/** "+1.2 pts" (share) or "+3k" (boardings), with U+2212 for negatives and no sign for a rounded zero. */
export function fmtDiff(diff: number, spec: DumbbellSpec): string {
  const r = Number(Math.abs(diff).toFixed(spec.decimals))
  return `${r === 0 ? '' : diff >= 0 ? '+' : '−'}${r.toFixed(spec.decimals)}${spec.unit === '%' ? ' pts' : 'k'}`
}
