// Data builders of the flow charts (Sankey: purpose > mode > distance, Chord and its Table: district to district;
// project-docs/redesign/04-chart-catalogue.md sections 8 and 14). Pure: rows in, plain structures out. Values are in
// thousands of daily trips.
import { DISTANCE_BANDS, DISTRICTS, MODES, PURPOSES } from '@/charts/vocab'
import { num, str } from '@/charts/util'
import type { Row } from '@/charts/types'

/** Links smaller than this many thousand trips are dropped from the Sankey. */
export const MIN_SANKEY_LINK = 5

export interface SankeyNode {
  id: string
  name: string
  /** Set on mode nodes: colours the node and cross-highlights. */
  mode?: string
}
export interface SankeyLink {
  source: string
  target: string
  value: number
  mode: string
}
export interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
  /** True total of a node (all of its links, before the small-link filter), by node id. */
  totals: Map<string, number>
}

/** Purpose > mode links from the purpose x mode totals, mode > distance links from the mode x distance totals. */
export function buildSankey(rows: readonly Row[]): SankeyData {
  const pm = new Map<string, number>()
  const md = new Map<string, number>()
  const total = new Map<string, number>()
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
  for (const r of rows) {
    const v = num(r, 'trips') / 1000
    if (!Number.isFinite(v)) continue
    const p = str(r, 'primary_purpose')
    const m = str(r, 'major_trip_mode')
    const b = str(r, 'distance_band')
    add(pm, `${p}|${m}`, v)
    add(md, `${m}|${b}`, v)
    add(total, `p:${p}`, v)
    add(total, `m:${m}`, v)
    add(total, `b:${b}`, v)
  }
  const nodes: SankeyNode[] = [
    ...PURPOSES.map((p) => ({ id: `p:${p}`, name: p })),
    ...MODES.map((m) => ({ id: `m:${m}`, name: m, mode: m })),
    ...DISTANCE_BANDS.map((b) => ({ id: `b:${b}`, name: b })),
  ]
  const links: SankeyLink[] = []
  for (const p of PURPOSES)
    for (const m of MODES) {
      const v = pm.get(`${p}|${m}`) ?? 0
      if (v > MIN_SANKEY_LINK) links.push({ source: `p:${p}`, target: `m:${m}`, value: v, mode: m })
    }
  for (const m of MODES)
    for (const b of DISTANCE_BANDS) {
      const v = md.get(`${m}|${b}`) ?? 0
      if (v > MIN_SANKEY_LINK) links.push({ source: `m:${m}`, target: `b:${b}`, value: v, mode: m })
    }
  return { nodes, links, totals: total }
}

/** Label of a node shorter than 9px is hidden. */
export const showNodeLabel = (height: number): boolean => height >= 9

/** District x district trips in thousands (origin rows, destination columns), in DISTRICTS order, diagonal included. */
export function districtMatrix(rows: readonly Row[]): number[][] {
  const m = DISTRICTS.map(() => DISTRICTS.map(() => 0))
  for (const r of rows) {
    const i = DISTRICTS.indexOf(str(r, 'orig_district') as (typeof DISTRICTS)[number])
    const j = DISTRICTS.indexOf(str(r, 'dest_district') as (typeof DISTRICTS)[number])
    if (i < 0 || j < 0) continue
    m[i][j] += num(r, 'trips') / 1000
  }
  return m
}

/** The chord matrix: trips that stay inside a district are left out (they dominate). */
export const withoutIntra = (m: number[][]): number[][] => m.map((row, i) => row.map((v, j) => (i === j ? 0 : v)))

/** Table cell: 820k, 25.0k, 3,100k reads "3100k"; values under 100 keep one decimal. */
export const fmtFlowCell = (thousands: number): string => `${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1)}k`

/** Trips leaving and arriving at district i (intra-district excluded). */
export function districtTotals(m: number[][], i: number): { out: number; into: number } {
  let out = 0
  let into = 0
  m.forEach((row, a) =>
    row.forEach((v, b) => {
      if (a === b) return
      if (a === i) out += v
      if (b === i) into += v
    }),
  )
  return { out, into }
}
