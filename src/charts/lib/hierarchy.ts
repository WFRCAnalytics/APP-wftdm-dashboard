// Shared logic of the hierarchical charts (Treemap, Sunburst; project-docs/redesign/04-chart-catalogue.md sections 6-7):
// nesting rows into group > leaf, leaf colours (mode / purpose / ramp / diverging change), number formats and the label
// visibility thresholds. Pure functions over rows and a theme, so the numbers are unit-tested without a DOM.
import { AUTOS, COUNTIES, FACILITIES, INCOMES, MODES, PURPOSES } from '@/charts/vocab'
import { num, str } from '@/charts/util'
import type { ChartEnv, ChartTheme, LegendSpec, Row } from '@/charts/types'

export type HierVariant = 'trips' | 'hh' | 'vmt'
/** Group-by ids of the trips variant: purpose > mode, mode > purpose, income > mode. */
export type HierGroup = 'pm' | 'mp' | 'im'

export interface HLeaf {
  name: string
  /** In display units: thousands of trips, thousands of households, millions of miles. */
  v: number
}
export interface HGroup {
  name: string
  idx: number
  children: HLeaf[]
}

export interface HierSpec {
  groups: HGroup[]
  /** Fill of a leaf in Values mode. */
  leaf(leaf: string, group: string): string
  fmt(v: number): string
  /** Centre caption of the sunburst and the unit of the tooltip total. */
  unit: string
  ofLabel: string
  /** Leaves are coloured by travel mode (they carry data-m and cross-highlight). */
  isMode: boolean
}

export const variantOf = (v: unknown): HierVariant => (v === 'hh' || v === 'vmt' ? v : 'trips')
export const groupOfTrips = (g: string): HierGroup => (g === 'mp' || g === 'im' ? g : 'pm')

/** The Parquet table a variant (and group) reads. */
export function hierTable(variant: HierVariant, group: string): string {
  if (variant === 'hh') return 'auto_ownership_summary'
  if (variant === 'vmt') return 'vmt_county_facility'
  return groupOfTrips(group) === 'im' ? 'trip_mode_share_by_income' : 'purpose_mode_flow'
}

// ---- formats (values in thousands for trips and households, millions for VMT) ----

/** 9810 -> "9.81M", 812.4 -> "812k". */
export const fmtTrips = (thousands: number): string => (thousands >= 1000 ? `${(thousands / 1000).toFixed(2)}M` : `${Math.round(thousands)}k`)
export const fmtHouseholds = (thousands: number): string => `${Math.round(thousands)}k`
export const fmtVmt = (millions: number): string => `${millions.toFixed(1)}M`

/** Signed percent change with U+2212 minus: 0.032 -> "+3.2%", -0.1 -> "−10.0%". */
export function fmtPctChange(fraction: number): string {
  const x = fraction * 100
  return `${x > 0.0499 ? '+' : x < -0.0499 ? '−' : ''}${Math.abs(x).toFixed(1)}%`
}

// ---- nesting ----

/** Vocabulary order first (absent categories keep their slot), then any category the table adds. */
const order = (names: readonly string[], seen: Iterable<string>): string[] => [...names, ...[...new Set(seen)].filter((n) => !names.includes(n))]

/** Sum a value column over (outer, inner) pairs; the keys follow the vocabularies, absent combinations are 0. */
function matrix(rows: readonly Row[], outerKey: string, innerKey: string, valueKey: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const o = str(r, outerKey)
    const i = str(r, innerKey)
    const inner = out.get(o) ?? new Map<string, number>()
    inner.set(i, (inner.get(i) ?? 0) + num(r, valueKey))
    out.set(o, inner)
  }
  return out
}

function nest(
  m: Map<string, Map<string, number>>,
  outer: readonly string[],
  inner: readonly string[],
  scale: number,
  minLeaf: number,
): HGroup[] {
  return order(outer, m.keys()).map((o, idx) => ({
    name: o,
    idx,
    children: order(inner, [...(m.get(o)?.keys() ?? [])])
      .map((n) => ({ name: n, v: (m.get(o)?.get(n) ?? 0) * scale }))
      .filter((d) => d.v > minLeaf),
  })).filter((g) => g.children.length > 0)
}

/**
 * Groups for a variant from the rows of its table. Leaves smaller than 1k trips (0.5k households) are dropped as in the
 * prototype. `group` only matters for the trips variant.
 */
export function buildGroups(variant: HierVariant, group: string, rows: readonly Row[]): HGroup[] {
  if (variant === 'hh') return nest(matrix(rows, 'income_group', 'auto_ownership', 'households'), INCOMES, AUTOS, 1 / 1000, 0.5)
  if (variant === 'vmt') return nest(matrix(rows, 'county', 'facility_type', 'vmt'), COUNTIES, FACILITIES, 1 / 1e6, 0)
  const g = groupOfTrips(group)
  if (g === 'im') return nest(matrix(rows, 'income_group', 'major_trip_mode', 'trips'), INCOMES, MODES, 1 / 1000, 1)
  if (g === 'mp') return nest(matrix(rows, 'major_trip_mode', 'primary_purpose', 'trips'), MODES, PURPOSES, 1 / 1000, 1)
  return nest(matrix(rows, 'primary_purpose', 'major_trip_mode', 'trips'), PURPOSES, MODES, 1 / 1000, 1)
}

/** Leaf lookup `group|leaf` -> value, for the reference of a difference treemap. */
export function leafValues(groups: readonly HGroup[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const g of groups) for (const l of g.children) out.set(`${g.name}|${l.name}`, l.v)
  return out
}

/** Sum of a group's leaves. */
export const groupTotal = (g: HGroup): number => g.children.reduce((s, l) => s + l.v, 0)

// ---- colour ----

/** Fraction change of `v` against `ref`; 0 when the reference is 0 or missing (nothing to compare). */
export const changeFraction = (v: number, ref: number | undefined): number => (ref ? v / ref - 1 : 0)

/** Diverging position of a change: clamp(change / 25%, -1, 1). */
export const changeToDiverge = (fraction: number): number => Math.max(-1, Math.min(1, fraction / 0.25))

export function hierSpec(variant: HierVariant, group: string, groups: HGroup[], theme: ChartTheme): HierSpec {
  if (variant === 'hh') {
    const cols = theme.ramp(theme.tokens.c2, 5, 0.8)
    return { groups, leaf: (n) => cols[AUTOS.indexOf(n as (typeof AUTOS)[number])] ?? cols[0], fmt: fmtHouseholds, unit: 'households', ofLabel: 'households', isMode: false }
  }
  if (variant === 'vmt') {
    const cols = theme.ramp(theme.tokens.c1, 4, 0.75)
    return { groups, leaf: (n) => cols[FACILITIES.indexOf(n as (typeof FACILITIES)[number])] ?? cols[0], fmt: fmtVmt, unit: 'million vehicle miles', ofLabel: 'miles', isMode: false }
  }
  const g = groupOfTrips(group)
  if (g === 'mp') {
    return { groups, leaf: (n) => theme.cat(PURPOSES.indexOf(n as (typeof PURPOSES)[number])), fmt: fmtTrips, unit: 'daily trips', ofLabel: 'trips', isMode: false }
  }
  return { groups, leaf: (n) => theme.mode(n), fmt: fmtTrips, unit: 'daily trips', ofLabel: 'trips', isMode: true }
}

// ---- label rules ----

/** Treemap group header text: shown from 46px wide; the muted total from 110px. */
export const showGroupName = (width: number): boolean => width >= 46
export const showGroupTotal = (width: number): boolean => width >= 110
/** Treemap leaf label (name and value): only in a leaf larger than 66 x 40 px. */
export const showLeafLabel = (width: number, height: number): boolean => width > 66 && height > 40
/** Sunburst group label along the arc: only when the arc spans more than .32 rad. */
export const showArcLabel = (span: number): boolean => span > 0.32

/** Share of a leaf in its group as a percentage; 0 for an empty group. */
export const shareOfGroup = (v: number, total: number): number => (total ? (v / total) * 100 : 0)

// ---- from a chart env ----

export interface HierModel {
  variant: HierVariant
  group: string
  spec: HierSpec
  focusRun: string
  /** Difference treemap: leaf lookup of the reference and its label; undefined for Values. */
  ref?: { values: Map<string, number>; label: string }
  /** Fill of a leaf, difference-aware. */
  fill(leaf: string, group: string, v: number): string
  legend?: LegendSpec
  /** Total of all leaves. */
  total: number
}

/**
 * In a side-by-side grid every cell is a chart panel that would portal the same legend into the tile's one legend row:
 * only the first cell (the reference) offers it.
 */
export function ownsLegend(el: Element, env: Pick<ChartEnv, 'pinned'>): boolean {
  if (!env.pinned) return true
  const cell = el.closest('[data-s]')
  return !cell || cell.parentElement?.firstElementChild === cell
}

/** The run a hierarchical chart draws: the pinned cell's run, else the focus. */
export const hierFocusRun = (env: ChartEnv): string | undefined => (env.pinned ? env.scenarios[0]?.run : (env.focus?.run ?? env.scenarios[0]?.run))

/** Only Purpose > Mode of the trips variant can colour by change. */
export function canDiff(variant: HierVariant, group: string, display: string): boolean {
  return variant === 'trips' && groupOfTrips(group) === 'pm' && display !== 'val'
}

/** Builds the nesting, colours, legend and (for `allowDiff`) the reference. Null when the focus run has no data. */
export function buildHierModel(env: ChartEnv, allowDiff: boolean, el?: HTMLElement): HierModel | null {
  const variant = variantOf(env.config.variant)
  const group = variant === 'trips' ? groupOfTrips(env.group).toString() : ''
  const run = hierFocusRun(env)
  if (!run) return null
  const table = hierTable(variant, group)
  const groups = buildGroups(variant, group, env.data.rows(run, table))
  const total = groups.reduce((s, g) => s + groupTotal(g), 0)
  if (total <= 0) return null
  const spec = hierSpec(variant, group, groups, env.theme)
  const t = env.theme

  let ref: HierModel['ref']
  if (allowDiff && !env.pinned && canDiff(variant, group, env.display)) {
    const refRun = env.refRunFor(run)
    if (refRun && refRun !== run) {
      const refGroups = buildGroups(variant, group, env.data.rows(refRun, table))
      if (refGroups.length) ref = { values: leafValues(refGroups), label: env.reference.label }
    }
  }
  const fill = ref
    ? (leaf: string, g: string, v: number) => t.diverge(changeToDiverge(changeFraction(v, ref!.values.get(`${g}|${leaf}`))))
    : (leaf: string, g: string) => spec.leaf(leaf, g)

  let legend: LegendSpec | undefined
  if (ref) {
    legend = {
      items: [],
      diverge: {
        lowLabel: `Lower than ${env.reference.isObserved ? 'observed' : ref.label}`,
        highLabel: 'Higher',
        low: t.tokens.c2,
        mid: t.mix(t.surface, t.ink, 0.16),
        high: t.tokens.c1,
      },
    }
  } else if (variant === 'trips') {
    legend =
      groupOfTrips(group) === 'mp'
        ? { items: PURPOSES.map((p, i) => ({ label: p, color: t.cat(i) })) }
        : { items: MODES.map((m) => ({ label: m, color: t.mode(m), mode: m })) }
  }
  if (el && !ownsLegend(el, env)) legend = undefined
  return { variant, group, spec, focusRun: run, ref, fill, legend, total }
}
