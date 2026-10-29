/* eslint-disable @typescript-eslint/no-explicit-any */
// 065-chart-builder: turns a chart spec and its rows into drawing primitives (rects, paths, lines, texts) for eight marks.
// Pure: no DOM, no DuckDB. It draws its own SVG, like the radar and pie panels, because Observable Plot has no dash channel,
// no fill patterns and no pie. Colours come from the app's ChartTheme (tokens), never hard-coded. tests/unit/chartBuilderCompile.test.ts.
import { prettyOperators } from '@/services/typography'
import type { ChartTheme } from '@/charts/types'
import { buildPivot, type PivotTable } from '@/charts/builder/pivot'
import { chartRole, type DataType, type Role } from '@/charts/builder/columnTypes'
import { acceptsText, AXIS_MARKS, channelLabel, effectiveLabels, isHorizontalBar, RING_CHANNELS, SLOTS, TABLE_COLS, TABLE_ROWS, TABLE_VALUES, ROLE_WORD, type ChartSpec, type Channel, type Sort } from '@/charts/builder/spec'

export type Row = Record<string, any>
export interface Col { name: string; type: DataType }

export interface RectP { x: number; y: number; w: number; h: number; rx: number; fill: string; stroke: string; op: number; tip: string }
export interface PathP { d: string; fill: string; stroke: string; sw: number; dash: string; op: number; tip: string }
export interface LineP { x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash: string }
export interface TextP { x: number; y: number; t: string; anchor: 'start' | 'middle' | 'end'; fill: string; size: number; tf: string; /** A ring of this colour round the letters, for text drawn over a chart. */ halo?: string }
export interface Panel { tf: string; title: string; rects: RectP[]; paths: PathP[]; lines: LineP[]; texts: TextP[] }
export interface LegendItem { label: string; key: string; d: string; fill: string; stroke: string; sw: number; dash: string }
export interface LegendGroup { title: string; items: LegendItem[] }
export interface PatternDef { id: string; color: string; d: string; sw: number; fill: string }
/** One node of a treemap or sunburst: a group (with `children`) or a leaf. Colours and tooltips are decided here, the drawing only places them. */
export interface HNode { name: string; value: number; fill: string; color: string; op: number; tip: string; children?: HNode[] }
/** A treemap or sunburst panel as a tree, so it can be drawn zoomable. `w` and `h` are the panel's size, `head` the room kept above it. */
export interface HTree { kind: 'treemap' | 'sunburst'; tf: string; title: string; w: number; h: number; head: number; unit: string; root: HNode }
/** A flow diagram's node: its name, total, colour and tooltip. */
export interface SNode { name: string; v: number; color: string; tip: string }
/** A Sankey panel as data (nodes and flows with their colours and tooltips decided), so it can be drawn with a node in focus. */
export interface HSankey { tf: string; title: string; w: number; h: number; small: boolean; from: SNode[]; to: SNode[]; flows: { f: string; t: string; v: number; tip: string }[] }
export type ChartModel =
  | { problem: string }
  | { problem?: undefined; panels: Panel[]; legend: LegendGroup[]; defs: PatternDef[]; W: number; H: number; rows: number; limitedSeries: boolean; /** The legend limit in force, for the note. */ seriesLimit: number; /** Data labels were asked for but the bars are too narrow to carry them. */ labelsHidden?: boolean; trees?: HTree[]; sankeys?: HSankey[]; tables?: PivotTable[] }

export type DrawnChart = Exclude<ChartModel, { problem: string }>

/**
 * Shows a deployer's column labels (`columns:` on the explore-builder panel) on a drawn chart: legend titles and the field
 * names in tooltips. The drawing itself keeps the real column names, so a chart's configuration never carries a label.
 */
export function relabel(m: ChartModel, labels: Record<string, string>): ChartModel {
  if (m.problem !== undefined || Object.keys(labels).length === 0) return m
  const L = (s: string) => (Object.prototype.hasOwnProperty.call(labels, s) ? labels[s] : s)
  // a tooltip is `title~key=value~key=value`
  const tip = (t: string) => {
    if (!t) return t
    const [title, ...rest] = t.split('~')
    return [L(title), ...rest.map((p) => { const i = p.indexOf('\u2063'); return i < 0 ? p : `${L(p.slice(0, i))}${p.slice(i)}` })].join('~')
  }
  return {
    ...m,
    legend: m.legend.map((g) => ({ ...g, title: L(g.title) })),
    ...(m.tables ? { tables: m.tables.map((t) => ({ ...t, rowLabels: t.rowLabels.map(L), colLabels: t.colLabels.map(L), measures: t.measures.map((me) => ({ ...me, label: me.label.replace(/ of (.+)$/, (_x: string, f: string) => ` of ${L(f)}`) })) })) } : {}),
    panels: m.panels.map((p) => ({
      ...p,
      rects: p.rects.map((r) => (r.tip ? { ...r, tip: tip(r.tip) } : r)),
      paths: p.paths.map((r) => (r.tip ? { ...r, tip: tip(r.tip) } : r)),
    })),
  }
}

export interface BuildInput {
  spec: ChartSpec
  cols: Col[]
  rows: Row[]
  theme: ChartTheme
  width: number
  height: number
  /** A legend entry (`field=value`) being hovered: everything else dims. */
  hot: string | null
  /** Legend values drawn per field before the rest are cut (explore.limits.legend_series); default `MAX_SERIES`. */
  legendSeries?: number
}

const DASH = ['', '7 4', '2 3', '9 3 2 3', '1 4']
const PATTERNS = [
  { d: 'M-2 2l4-4M0 8l8-8M6 10l4-4', fill: false, sw: 1.6 },
  { d: 'M-2 6l4 4M0 0l8 8M6 -2l4 4', fill: false, sw: 1.6 },
  { d: 'M0 2h8M0 6h8', fill: false, sw: 1.6 },
  { d: 'M1.5 1.5h2v2h-2zM5.5 5.5h2v2h-2z', fill: true, sw: 0 },
  { d: 'M0 0l8 8M8 0l-8 8', fill: false, sw: 1.4 },
]
export const MAX_SERIES = 15
const r1 = (v: number) => Math.round(v * 10) / 10

export function aggregate(a: number[], fn: string): number {
  if (!a.length) return 0
  if (fn === 'count') return a.length
  if (fn === 'min') return Math.min(...a)
  if (fn === 'max') return Math.max(...a)
  if (fn === 'mean') return a.reduce((x, y) => x + y, 0) / a.length
  if (fn === 'median') { const s = a.slice().sort((x, y) => x - y), k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2 }
  return a.reduce((x, y) => x + y, 0)
}

export function niceScale(lo: number, hi: number, n: number): { min: number; max: number; ticks: number[] } {
  if (hi === lo) hi = lo + 1
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag
  const min = Math.floor(lo / step + 1e-9) * step, max = Math.ceil(hi / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = min; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step)
  return { min, max, ticks }
}

export function fmtCompact(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (a >= 1e4) return `${Math.round(v / 1e3)}k`
  if (a >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10)
}
/** An axis label with just the decimals the tick step needs, so close ticks on a narrow range never repeat (12.4, 12.45, 12.5). */
export function fmtTick(v: number, step: number): string {
  if (!step || Math.abs(step) >= 1) return fmtCompact(v)
  const d = Math.min(6, Math.ceil(-Math.log10(Math.abs(step)) - 1e-9))
  return v.toFixed(d)
}
export const fmtExact = (v: unknown): string =>
  typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-US') : (Math.round(v * 100) / 100).toLocaleString('en-US')) : String(v)

export function uniqSorted(rows: Row[], f: string): any[] {
  const s = new Set<any>()
  for (const r of rows) if (r[f] !== undefined && r[f] !== null) s.add(r[f])
  const a = Array.from(s)
  if (a.every((v) => typeof v === 'number')) return a.sort((x, y) => x - y)
  return a.sort((x, y) => String(x).localeCompare(String(y)))
}

/** Puts the categories in a chosen order; any the order does not name keep their place after it. */
export function applyOrder<T>(cats: T[], order: string[] | undefined): T[] {
  if (!order?.length) return cats
  const pos = new Map(order.map((v, i) => [v, i] as const))
  const named = cats.filter((c) => pos.has(String(c))).sort((a, b) => pos.get(String(a))! - pos.get(String(b))!)
  return [...named, ...cats.filter((c) => !pos.has(String(c)))]
}

/**
 * Orders categories. `V` holds each category's value per series (key `category\u0002series`); a category's height is the sum
 * over its series when they stack and the tallest one when they sit side by side. Ties keep the natural order.
 */
export function sortCategories<T>(cats: T[], sort: Sort | undefined, V: Map<string, number>, series: string[], tallest: boolean): T[] {
  if (!sort || sort === 'natural') return cats
  if (sort === 'reverse') return cats.slice().reverse()
  const height = (c: T): number => {
    let h: number | undefined
    for (const k of series) {
      const v = V.get(`${c}\u0002${k}`)
      if (v !== undefined) h = h === undefined ? v : tallest ? Math.max(h, v) : h + v
    }
    return h ?? 0
  }
  const h = new Map(cats.map((c) => [c, height(c)] as const))
  return cats.slice().sort((a, b) => (sort === 'high' ? h.get(b)! - h.get(a)! : h.get(a)! - h.get(b)!))
}

export function glyph(shape: number, cx: number, cy: number, r: number): { d: string; line: boolean } {
  const R = r1
  if (shape === 1) return { d: `M${R(cx - r)} ${R(cy - r)}h${R(2 * r)}v${R(2 * r)}h${R(-2 * r)}z`, line: false }
  if (shape === 2) return { d: `M${R(cx)} ${R(cy - r * 1.15)}L${R(cx + r)} ${R(cy + r * 0.85)}L${R(cx - r)} ${R(cy + r * 0.85)}z`, line: false }
  if (shape === 3) return { d: `M${R(cx)} ${R(cy - r)}L${R(cx + r)} ${R(cy)}L${R(cx)} ${R(cy + r)}L${R(cx - r)} ${R(cy)}z`, line: false }
  if (shape === 4) return { d: `M${R(cx - r)} ${R(cy)}h${R(2 * r)}M${R(cx)} ${R(cy - r)}v${R(2 * r)}`, line: true }
  return { d: `M${R(cx - r)} ${R(cy)}a${R(r)} ${R(r)} 0 1 0 ${R(2 * r)} 0a${R(r)} ${R(r)} 0 1 0 ${R(-2 * r)} 0`, line: false }
}

/** An annular sector (a ring slice) between two radii and two angles; ri 0 gives a wedge. */
export function sector(cx: number, cy: number, ri: number, ro: number, a0: number, a1: number): string {
  const e = a1 - a0 >= 2 * Math.PI - 1e-6 ? a0 + 2 * Math.PI - 1e-4 : a1
  const p = (rad: number, ang: number) => `${r1(cx + rad * Math.cos(ang))} ${r1(cy + rad * Math.sin(ang))}`
  const lg = e - a0 > Math.PI ? 1 : 0
  return `M${p(ro, a0)}A${r1(ro)} ${r1(ro)} 0 ${lg} 1 ${p(ro, e)}L${p(ri, e)}A${r1(ri)} ${r1(ri)} 0 ${lg} 0 ${p(ri, a0)}Z`
}

interface Series { key: string; label: string; color: string; fill: string; pat: boolean; di: number; si: number; has: Record<string, 1>; r: Row; heat?: { lo: number; hi: number; f: string } }

const roleOf = (cols: Col[], f: string): Role => chartRole(cols.find((c) => c.name === f)?.type ?? 'text')

/** What the chart needs before it can draw, or null when the shelves are complete and compatible. */
export function shelfProblem(spec: ChartSpec, cols: Col[]): string | null {
  for (const s of SLOTS[spec.mark]) {
    const e = spec.enc[s.ch]
    const label = channelLabel(spec.mark, s.ch)
    if (s.req && !e) return `${label} needs ${acceptsText(s.accepts)}. Drag one from the field list.`
    if (e) {
      const role = roleOf(cols, e.f)
      if (!role || !s.accepts.includes(role)) return `${label} takes ${acceptsText(s.accepts)}, but ${e.f} is ${role ? ROLE_WORD[role as Exclude<Role, ''>] : 'not chartable yet'}. Try Swap x and y, or pick another field.`
    }
  }
  // a bar chart is one category and one number, in either order (columns, or bars lying down)
  if (spec.mark === 'bar' && spec.enc.x && spec.enc.y) {
    const xq = roleOf(cols, spec.enc.x.f) === 'q', yq = roleOf(cols, spec.enc.y.f) === 'q'
    if (xq === yq) return `A bar chart needs one category and one number. X axis (${spec.enc.x.f}) and Y axis (${spec.enc.y.f}) are both ${xq ? 'numbers' : 'categories'}.`
  }
  return null
}

export function buildChart(input: BuildInput): ChartModel {
  const { spec, cols, theme: T } = input
  const enc = spec.enc, mark = spec.mark
  // a chosen category order wins over the alphabetical one; values the order does not name follow, alphabetically
  const us = (rs: Row[], f: string): any[] => applyOrder(uniqSorted(rs, f), spec.order?.[f])
  const problem = shelfProblem(spec, cols)
  if (problem) return { problem }
  let rows = input.rows
  if (spec.filter.f && spec.filter.v !== '') rows = rows.filter((r) => String(r[spec.filter.f]) === spec.filter.v)
  // box statistics from DuckDB carry no raw y value
  const preBox = rows[0]?.__q1 !== undefined
  const used = Object.values(enc).map((e) => e!.f).filter((f) => !(preBox && f === enc.y?.f) && !(mark === 'rule' && rows[0]?.__lo !== undefined && f === enc.x?.f))
  // a table's grouping-set rows leave the fields they roll up NULL on purpose
  const prePivot = mark === 'text' && rows[0]?.__m0 !== undefined
  if (!prePivot) rows = rows.filter((r) => used.every((f) => r[f] !== null && r[f] !== undefined))
  if (!rows.length) return { problem: 'No rows match this data and filter.' }
  if (mark === 'pie' && us(rows, enc.color!.f).length > 12) return { problem: `Pie and donut charts need 12 slices or fewer. ${enc.color!.f} has ${us(rows, enc.color!.f).length}.` }
  if (mark === 'waffle' && us(rows, enc.color!.f).length > 12) return { problem: `Waffle charts need 12 groups or fewer. ${enc.color!.f} has ${us(rows, enc.color!.f).length}.` }

  if (mark === 'radar') {
    const n = us(rows, enc.x!.f).length
    if (n < 3 || n > 16) return { problem: `Radar charts need 3 to 16 spokes. ${enc.x!.f} has ${n}.` }
  }

  if (mark === 'sankey' || mark === 'chord') {
    const n = new Set([...us(rows, enc.x!.f), ...us(rows, enc.y!.f)].map(String)).size
    const most = mark === 'chord' ? 24 : 60
    if (n > most) return { problem: `${mark === 'chord' ? 'Chord' : 'Sankey'} charts need ${most} categories or fewer. ${enc.x!.f} and ${enc.y!.f} have ${n} together.` }
  }

  const rf = enc.row?.f, cf = enc.column?.f
  // one facet field can wrap into a grid of `wrap` columns instead of a single row or column
  const wrapField = spec.wrap >= 2 && !!rf !== !!cf ? (rf ?? cf)! : null
  const cells: { rvv: any; cvv: any; ri: number; ci: number }[] = []
  let nr: number, nc: number
  if (wrapField) {
    const vals = us(rows, wrapField).slice(0, 12)
    nc = Math.min(spec.wrap, vals.length); nr = Math.ceil(vals.length / nc)
    vals.forEach((v, i) => cells.push({ rvv: rf ? v : null, cvv: cf ? v : null, ri: Math.floor(i / nc), ci: i % nc }))
  } else {
    const rv: any[] = rf ? us(rows, rf).slice(0, 6) : [null], cv: any[] = cf ? us(rows, cf).slice(0, 6) : [null]
    nr = rv.length; nc = cv.length
    rv.forEach((rvv, ri) => cv.forEach((cvv, ci) => cells.push({ rvv, cvv, ri, ci })))
  }
  const small = cells.length > 1, gap = 14
  const W = Math.max(320, input.width), HF = Math.max(240, input.height)
  const pw = (W - (nc - 1) * gap) / nc
  const ph = nr === 1 ? HF : Math.max(150, Math.floor((HF - (nr - 1) * gap) / nr))
  const H = nr === 1 ? HF : nr * ph + (nr - 1) * gap

  // series: one per distinct combination of the colour, pattern, dash and shape fields
  const serF: string[] = []
  for (const ch of ['color', 'pattern', 'dash', 'shape'] as Channel[]) {
    const e = enc[ch]
    if (e && !(mark === 'heatmap' && ch === 'color') && !serF.includes(e.f)) serF.push(e.f)
  }
  // a detail field splits the data into more series without giving them a look of their own
  const nStyle = serF.length
  if (enc.detail && !serF.includes(enc.detail.f)) serF.push(enc.detail.f)
  // the deeper levels of a treemap or sunburst split the data the same way
  for (const ch of RING_CHANNELS) if (enc[ch] && !serF.includes(enc[ch]!.f)) serF.push(enc[ch]!.f)
  const dom: Record<string, any[]> = {}
  let limitedSeries = false
  const seriesLimit = input.legendSeries ?? MAX_SERIES
  for (const f of serF) {
    const all = us(rows, f)
    if (all.length > seriesLimit) limitedSeries = true
    dom[f] = all.slice(0, seriesLimit)
  }
  const skey = (r: Row) => serF.map((f) => r[f]).join('|')
  const seen = new Set<string>(), combos: Row[] = []
  for (const r of rows) { const k = skey(r); if (!seen.has(k)) { seen.add(k); combos.push(r) } }
  const ix = (ch: Channel, r: Row) => (enc[ch] && !(mark === 'heatmap' && ch === 'color') ? dom[enc[ch]!.f].indexOf(r[enc[ch]!.f]) : -1)
  const colorField = enc.color && mark !== 'heatmap' ? enc.color.f : null
  const colorFor = (f: string, v: any, i: number) => (f === 'mode' ? T.mode(String(v)) : T.cat(i))
  const defs: PatternDef[] = []
  const raw: { r: Row; ci: number; pi: number; di: number; si: number }[] = []
  for (const r of combos) {
    const ci = ix('color', r), pi = ix('pattern', r), di = ix('dash', r), si = ix('shape', r)
    if ((enc.color && mark !== 'heatmap' && ci < 0) || (enc.pattern && pi < 0) || (enc.dash && di < 0) || (enc.shape && si < 0) || (enc.detail && !dom[enc.detail.f].includes(r[enc.detail.f])) || RING_CHANNELS.some((ch) => enc[ch] && !dom[enc[ch]!.f].includes(r[enc[ch]!.f]))) continue
    raw.push({ r, ci, pi, di: Math.max(0, di), si: Math.max(0, si) })
  }
  raw.sort((a, b) => a.ci - b.ci || a.pi - b.pi || a.di - b.di || a.si - b.si)
  if (!raw.length) raw.push({ r: rows[0], ci: -1, pi: -1, di: 0, si: 0 })
  const series: Series[] = raw.map((q, i) => {
    const color = colorField ? colorFor(colorField, q.r[colorField], q.ci) : nStyle ? T.mix(T.surface, T.ink, 0.55) : T.cat(0)
    const has: Record<string, 1> = {}
    for (const f of serF) has[`${f}=${q.r[f]}`] = 1
    const s: Series = { key: serF.length ? skey(q.r) : '', label: serF.map((f) => q.r[f]).join(' · '), color, fill: color, pat: q.pi >= 0, di: q.di, si: q.si, has, r: q.r }
    if (s.pat) {
      const p = PATTERNS[q.pi % 5]
      defs.push({ id: `pt${i}`, color, d: p.d, sw: p.sw, fill: p.fill ? color : 'none' })
      s.fill = `url(#pt${i})`
    }
    return s
  })
  const op = (s: Series) => (input.hot && !s.has[input.hot] ? 0.2 : 1)

  const panels: (Panel & { prows: Row[]; V?: Map<string, number>; B?: Record<string, number>[]; S?: Map<string, any>; G?: Map<string, number> })[] = []
  cells.forEach(({ rvv, cvv, ri, ci }) => {
    panels.push({
      tf: `translate(${r1(ci * (pw + gap))} ${r1(ri * (ph + gap))})`, prows: rows.filter((r) => (rvv === null || r[rf!] === rvv) && (cvv === null || r[cf!] === cvv)),
      title: [rvv, cvv].filter((x) => x !== null).join(' · '), rects: [], paths: [], lines: [], texts: [],
    })
  })
  const labelMode = effectiveLabels(spec)
  const horizontal = isHorizontalBar(spec, (f) => roleOf(input.cols, f))
  // labels above bars and points need a little headroom
  const top = (small ? 22 : 10) + (labelMode !== 'off' && ((mark === 'bar' && !horizontal) || mark === 'line') ? (mark === 'bar' && spec.stack === 'group' && series.length > 1 ? 30 : 12) : 0)
  // axis titles need a strip along the bottom and the left edge, which every cartesian mark takes from the same frame
  const titled = spec.axisTitles && AXIS_MARKS.includes(mark)
  const frames: { x0: number; x1: number; y0: number; y1: number }[] = []
  const frame = (lm?: number) => {
    const f = { x0: (lm ?? 46) + (titled ? 16 : 0), x1: pw - 10, y0: top, y1: ph - 42 - (titled ? 16 : 0) }
    frames.push(f)
    return f
  }
  type P = Panel
  const tx = (o: P, x: number, y: number, t: string | number, anchor: TextP['anchor'] = 'start', size = T.fs, tf = '', fill = T.mute, halo?: string) => o.texts.push({ x: r1(x), y: r1(y), t: prettyOperators(String(t)), anchor, fill, size, tf, ...(halo ? { halo } : {}) })
  const ln = (o: P, x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number, dash = '') => o.lines.push({ x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2), stroke, sw, dash })
  const pa = (o: P, d: string, fill: string, stroke: string, sw: number, dash: string, opac: number, tip: string) => o.paths.push({ d, fill, stroke, sw, dash, op: opac, tip })
  const rect = (o: P, x: number, y: number, w: number, h: number, s: Series, tip: string, rx = T.r) =>
    o.rects.push({ x: r1(x), y: r1(y), w: r1(Math.max(0, w)), h: r1(Math.max(0, h)), rx: Math.min(rx, Math.max(0, w) / 2, Math.max(0, h) / 2), fill: s.fill, stroke: s.pat ? s.color : 'none', op: op(s), tip })
  // a tooltip is title~label\u2063value~...: the separator is a control character so a label like "Autos >= Workers" survives
  const tip = (title: string, pairs: [string, string][]) => [title, ...pairs.map((p) => `${p[0]}\u2063${p[1]}`)].join('~')
  // treemap and sunburst: the groups (colour field) and the pieces inside each (detail field), as a tree the drawing can zoom into
  const trees: HTree[] = []
  const sankeys: HSankey[] = []
  const tables: PivotTable[] = []
  let labelsHidden = false
  const makeTree = (kind: HTree['kind'], pn: Panel, vals: number[], head: number) => {
    const sz = enc.size!.f, tot = vals.reduce((p, c) => p + c, 0) || 1
    const levels = [enc.color, enc.detail, ...RING_CHANNELS.map((c) => enc[c])].filter((e) => !!e).map((e) => e!.f)
    const share = (v: number) => `${Math.round((v / tot) * 1000) / 10}%`
    type Item = { x: Series; i: number }
    // one level at a time: the values of this level's field, each holding the next level's values (or, at the last level, the series themselves)
    const build = (items: Item[], depth: number, base: string, path: string[]): HNode[] => {
      const f = levels[depth]
      const present = dom[f].filter((v) => items.some((it) => it.x.r[f] === v))
      const out: HNode[] = []
      present.forEach((pv, vi) => {
        const sub = items.filter((it) => it.x.r[f] === pv)
        const value = sub.reduce((p, it) => p + vals[it.i], 0)
        if (value <= 0) return
        const first = sub[0].x
        const color = depth === 0 ? first.color : T.mix(base, T.surface, 0.12 + (0.5 * vi) / Math.max(1, present.length - 1))
        const here = [...path, String(pv)]
        const node: HNode = { name: String(pv), value, fill: depth === 0 ? first.fill : color, color, op: op(first), tip: tip(here.join(' · '), [[sz, fmtExact(value)], ['share', share(value)]]) }
        if (depth + 1 < levels.length) node.children = build(sub, depth + 1, color, here)
        else if (sub.length > 1) {
          // several series share the last level (a hatch field): one piece each
          node.children = sub.map((it, ki) => {
            const c = T.mix(color, T.surface, 0.12 + (0.5 * ki) / Math.max(1, sub.length - 1))
            return { name: it.x.label, value: vals[it.i], fill: c, color: c, op: op(it.x), tip: tip(`${here.join(' · ')} · ${it.x.label}`, [[sz, fmtExact(vals[it.i])], ['share', share(vals[it.i])]]) }
          })
        }
        out.push(node)
      })
      return out
    }
    const groups = build(series.map((x, i) => ({ x, i })).filter((it) => vals[it.i] > 0), 0, T.surface, [])
    trees.push({ kind, tf: pn.tf, title: pn.title, w: pw, h: ph, head, unit: sz, root: { name: '', value: tot, fill: 'none', color: T.surface, op: 1, tip: '', children: groups } })
  }
  const yAx = (o: P, bx: ReturnType<typeof frame>, lo: number, hi: number, f?: (v: number) => string) => {
    const nt = niceScale(lo, hi, Math.max(3, Math.min(6, Math.round((bx.y1 - bx.y0) / 55))))
    const sy = (v: number) => bx.y1 - ((v - nt.min) / (nt.max - nt.min || 1)) * (bx.y1 - bx.y0)
    for (const v of nt.ticks) {
      const y = sy(v)
      if (spec.grid) ln(o, bx.x0, y, bx.x1, y, T.grid, 1)
      tx(o, bx.x0 - 8, y + 3.5, f ? f(v) : fmtTick(v, nt.ticks[1] - nt.ticks[0]), 'end')
    }
    ln(o, bx.x0, bx.y1, bx.x1, bx.y1, T.line, 1)
    return { sy, min: nt.min, max: nt.max }
  }
  const xBand = (o: P, bx: ReturnType<typeof frame>, cats: any[]) => {
    const step = (bx.x1 - bx.x0) / cats.length, rot = step < 56
    const stride = Math.max(1, Math.ceil(cats.length / Math.max(2, Math.floor((bx.x1 - bx.x0) / 54))))
    cats.forEach((c, i) => {
      if (i % stride) return
      const cx = bx.x0 + step * (i + 0.5), y = bx.y1 + (rot ? 12 : 18), s = String(c), n = rot ? 13 : Math.max(6, Math.floor(step / 6.4))
      tx(o, cx, y, s.length > n ? `${s.slice(0, n - 1)}…` : s, rot ? 'end' : 'middle', T.fs, rot ? `rotate(-32 ${r1(cx)} ${r1(y)})` : '')
    })
    return step
  }
  const xNum = (o: P, bx: ReturnType<typeof frame>, lo: number, hi: number) => {
    const nt = niceScale(lo, hi, Math.max(3, Math.min(8, Math.round((bx.x1 - bx.x0) / 90))))
    const sx = (v: number) => bx.x0 + ((v - nt.min) / (nt.max - nt.min || 1)) * (bx.x1 - bx.x0)
    for (const v of nt.ticks) tx(o, sx(v), bx.y1 + 18, fmtTick(v, nt.ticks[1] - nt.ticks[0]), 'middle')
    ln(o, bx.x0, bx.y1, bx.x1, bx.y1, T.line, 1)
    return { sx }
  }
  const refLine = (o: P, bx: ReturnType<typeof frame>, sy: (v: number) => number) => {
    const v = Number(spec.ref)
    if (spec.ref === '' || Number.isNaN(v)) return
    const y = sy(v)
    if (y < bx.y0 - 1 || y > bx.y1 + 1) return
    ln(o, bx.x0, y, bx.x1, y, T.ink, 1.5, '5 4')
    tx(o, bx.x1 - 2, y - 5, `Reference ${fmtCompact(v)}`, 'end', T.fs, '', T.ink)
  }
  const refMax = (hi: number) => (spec.ref !== '' && !Number.isNaN(Number(spec.ref)) ? Math.max(hi, Number(spec.ref)) : hi)
  const gm = (prows: Row[], xf: string, yf: string | null, agg: string) => {
    const G = new Map<string, any[]>()
    for (const r of prows) { const k = `${r[xf]}\u0002${skey(r)}`; let a = G.get(k); if (!a) { a = []; G.set(k, a) } a.push(yf ? r[yf] : 1) }
    const V = new Map<string, number>()
    G.forEach((a, k) => V.set(k, aggregate(a, agg)))
    return V
  }
  const stackMode = spec.stack
  const pct = (v: number) => `${Math.round(v * 100)}%`

  if (mark === 'bar' && !horizontal) {
    const xf = enc.x!.f, yf = enc.y!.f, agg = enc.y!.agg ?? 'sum'
    const cats = sortCategories(us(rows, xf), spec.sort, gm(rows, xf, yf, agg), series.map((s) => s.key), stackMode === 'group')
    for (const pn of panels) pn.V = gm(pn.prows, xf, yf, agg)
    let ymax = 0
    for (const pn of panels) for (const c of cats) {
      let sum = 0, mx = 0
      for (const s of series) { const v = pn.V!.get(`${c}\u0002${s.key}`) ?? 0; sum += v; mx = Math.max(mx, v) }
      ymax = Math.max(ymax, stackMode === 'group' ? mx : stackMode === 'normalize' ? 1 : sum)
    }
    ymax = refMax(ymax) || 1
    for (const pn of panels) {
      const bx = frame(), ax = yAx(pn, bx, 0, ymax, stackMode === 'normalize' ? pct : undefined)
      const step = xBand(pn, bx, cats), bw = step * 0.72
      // grouped bars: labels sit flat above the bars when they all fit their width, turn vertical when the bars are narrow, and are left off when even that does not fit
      let orient: 'flat' | 'upright' | 'none' = 'none'
      if (labelMode !== 'off' && stackMode === 'group') {
        const own = bw / series.length - (series.length > 1 ? 1.5 : 0)
        const widest = Math.max(0, ...cats.flatMap((c) => series.map((s) => { const v = pn.V!.get(`${c}${s.key}`); return v === undefined ? 0 : fmtCompact(v).length * 6.1 + 2 })))
        orient = widest <= own ? 'flat' : own >= 9 ? 'upright' : 'none'
        if (orient === 'none') labelsHidden = true
      }
      cats.forEach((c, i) => {
        const left = bx.x0 + step * (i + 0.5) - bw / 2
        let tot = 0
        for (const s of series) tot += pn.V!.get(`${c}\u0002${s.key}`) ?? 0
        if (stackMode === 'group') {
          const sw = bw / series.length
          series.forEach((s, j) => {
            const v = pn.V!.get(`${c}\u0002${s.key}`)
            if (v === undefined) return
            rect(pn, left + j * sw + (series.length > 1 ? 0.75 : 0), ax.sy(v), sw - (series.length > 1 ? 1.5 : 0), bx.y1 - ax.sy(v), s, tip(String(c), [[s.label || yf, fmtExact(v)]]))
            // a data label above the bar
            if (orient !== 'none') {
              const cx = left + j * sw + sw / 2, cy = ax.sy(v) - 5, t = fmtCompact(v)
              if (orient === 'flat') tx(pn, cx, cy, t, 'middle', T.fs - 0.5, '', T.ink, T.surface)
              else tx(pn, cx + 3.5, cy, t, 'start', T.fs - 1.5, `rotate(-90 ${r1(cx + 3.5)} ${r1(cy)})`, T.ink, T.surface)
            }
          })
        } else {
          let acc = 0
          for (const s of series) {
            const v = pn.V!.get(`${c}\u0002${s.key}`) ?? 0, v1 = stackMode === 'normalize' ? (tot ? v / tot : 0) : v
            if (v <= 0) continue
            rect(pn, left, ax.sy(acc + v1), bw, ax.sy(acc) - ax.sy(acc + v1) - (acc > 0 ? 1 : 0), s, tip(String(c), [[s.label || yf, fmtExact(v)], ['share', `${Math.round(tot ? (v / tot) * 100 : 0)}%`]]), 3)
            // a data label inside the segment, when it is tall and wide enough
            if (labelMode !== 'off') { const h = ax.sy(acc) - ax.sy(acc + v1), t = fmtCompact(v); if (h >= 16 && t.length * 6.1 <= bw) tx(pn, left + bw / 2, ax.sy(acc + v1) + h / 2 + 4, t, 'middle', T.fs - 0.5, '', s.pat ? T.ink : T.onColor(s.color), s.pat ? T.surface : undefined) }
            acc += v1
          }
        }
      })
      refLine(pn, bx, ax.sy)
    }
  } else if (mark === 'bar') {
    // horizontal bars: the number on X sets each bar's length, the category on Y gives the rows
    const vf = enc.x!.f, cf = enc.y!.f, agg = enc.x!.agg ?? 'sum'
    const cats = sortCategories(us(rows, cf), spec.sort, gm(rows, cf, vf, agg), series.map((s) => s.key), stackMode === 'group')
    for (const pn of panels) pn.V = gm(pn.prows, cf, vf, agg)
    let vmax = 0
    for (const pn of panels) for (const c of cats) {
      let sum = 0, mx = 0
      for (const s of series) { const v = pn.V!.get(`${c}\u0002${s.key}`) ?? 0; sum += v; mx = Math.max(mx, v) }
      vmax = Math.max(vmax, stackMode === 'group' ? mx : stackMode === 'normalize' ? 1 : sum)
    }
    vmax = refMax(vmax) || 1
    const lm = Math.min(150, Math.max(46, Math.max(...cats.map((c) => String(c).length)) * 6.4 + 14))
    // room at the right for the labels that follow the bars
    const rm = labelMode !== 'off' && stackMode === 'group' ? 40 : 0
    for (const pn of panels) {
      const bx = { ...frame(lm), x1: pw - 10 - rm }
      const nt = niceScale(0, vmax, Math.max(3, Math.min(8, Math.round((bx.x1 - bx.x0) / 90))))
      const sx = (v: number) => bx.x0 + ((v - nt.min) / (nt.max - nt.min || 1)) * (bx.x1 - bx.x0)
      for (const v of nt.ticks) {
        if (spec.grid) ln(pn, sx(v), bx.y0, sx(v), bx.y1, T.grid, 1)
        tx(pn, sx(v), bx.y1 + 18, stackMode === 'normalize' ? pct(v) : fmtTick(v, nt.ticks[1] - nt.ticks[0]), 'middle')
      }
      ln(pn, bx.x0, bx.y0, bx.x0, bx.y1, T.line, 1)
      const band = (bx.y1 - bx.y0) / cats.length, bh = band * 0.72, stride = Math.max(1, Math.ceil(13 / band))
      cats.forEach((c, i) => {
        const mid = bx.y0 + band * (i + 0.5), top0 = mid - bh / 2
        if (i % stride === 0) { const t = String(c); tx(pn, bx.x0 - 8, mid + 4, t.length > 20 ? `${t.slice(0, 19)}\u2026` : t, 'end') }
        let tot = 0
        for (const s of series) tot += pn.V!.get(`${c}\u0002${s.key}`) ?? 0
        if (stackMode === 'group') {
          const sh = bh / series.length
          if (labelMode !== 'off' && sh - (series.length > 1 ? 1.5 : 0) < 11) labelsHidden = true
          series.forEach((s, j) => {
            const v = pn.V!.get(`${c}\u0002${s.key}`)
            if (v === undefined) return
            const y0 = top0 + j * sh + (series.length > 1 ? 0.75 : 0), h = sh - (series.length > 1 ? 1.5 : 0)
            rect(pn, bx.x0, y0, sx(v) - bx.x0, h, s, tip(String(c), [[s.label || vf, fmtExact(v)]]))
            if (labelMode !== 'off' && h >= 11) tx(pn, sx(v) + 5, y0 + h / 2 + 4, fmtCompact(v), 'start', T.fs - 0.5, '', T.ink, T.surface)
          })
        } else {
          let acc = 0
          for (const s of series) {
            const v = pn.V!.get(`${c}\u0002${s.key}`) ?? 0, v1 = stackMode === 'normalize' ? (tot ? v / tot : 0) : v
            if (v <= 0) continue
            const x0 = sx(acc) + (acc > 0 ? 1 : 0), w = sx(acc + v1) - x0
            rect(pn, x0, top0, w, bh, s, tip(String(c), [[s.label || vf, fmtExact(v)], ['share', `${Math.round(tot ? (v / tot) * 100 : 0)}%`]]), 3)
            if (labelMode !== 'off') { const t = fmtCompact(v); if (w >= t.length * 6.1 + 8 && bh >= 14) tx(pn, x0 + w / 2, mid + 4, t, 'middle', T.fs - 0.5, '', s.pat ? T.ink : T.onColor(s.color), s.pat ? T.surface : undefined) }
            acc += v1
          }
        }
      })
      const rv = Number(spec.ref)
      if (spec.ref !== '' && !Number.isNaN(rv) && rv >= nt.min && rv <= nt.max) {
        ln(pn, sx(rv), bx.y0, sx(rv), bx.y1, T.ink, 1.5, '5 4')
        tx(pn, sx(rv) + 4, bx.y0 + 11, `Reference ${fmtCompact(rv)}`, 'start', T.fs, '', T.ink)
      }
    }
  } else if (mark === 'line' || mark === 'area') {
    const xf = enc.x!.f, yf = enc.y!.f, agg = enc.y!.agg ?? 'sum', xc = roleOf(cols, xf) === 'q'
    // only a line over categories or dates sorts; a numeric axis keeps its scale
    const xs = mark === 'line' && !xc ? sortCategories(us(rows, xf), spec.sort, gm(rows, xf, yf, agg), series.map((s) => s.key), true) : us(rows, xf)
    for (const pn of panels) pn.V = gm(pn.prows, xf, yf, agg)
    let lo = Infinity, hi = 0
    for (const pn of panels) for (const x of xs) {
      let sum = 0
      for (const s of series) { const v = pn.V!.get(`${x}\u0002${s.key}`); if (v !== undefined) { sum += v; lo = Math.min(lo, v); hi = Math.max(hi, mark === 'line' ? v : stackMode === 'group' ? v : sum) } }
    }
    if (mark === 'area' && stackMode === 'normalize') hi = 1
    if (mark === 'area' || spec.zero) lo = Math.min(0, lo === Infinity ? 0 : lo)
    hi = refMax(hi)
    for (const pn of panels) {
      const bx = frame(), ax = yAx(pn, bx, lo === Infinity ? 0 : lo, hi || 1, mark === 'area' && stackMode === 'normalize' ? pct : undefined)
      const xi = new Map<any, number>()
      xs.forEach((x, i) => xi.set(x, i))
      let sx: (v: any) => number
      if (xc) { const nx = xNum(pn, bx, xs[0], xs[xs.length - 1]); sx = (v) => nx.sx(v) } else { const step = xBand(pn, bx, xs); sx = (v) => bx.x0 + step * (xi.get(v)! + 0.5) }
      if (mark === 'line') {
        for (const s of series) {
          let d = '', pen = false
          for (const x of xs) {
            const v = pn.V!.get(`${x}\u0002${s.key}`)
            if (v === undefined) { pen = false; continue }
            d += `${pen ? 'L' : 'M'}${r1(sx(x))} ${r1(ax.sy(v))}`; pen = true
          }
          pa(pn, d, 'none', s.color, 2.4, DASH[s.di % 5], op(s), '')
          // data labels above the points, thinned out when there are many
          if (labelMode !== 'off') {
            const every = Math.max(1, Math.ceil(xs.length / 20))
            xs.forEach((x, k) => { const v = pn.V!.get(`${x}\u0002${s.key}`); if (v !== undefined && k % every === 0) tx(pn, sx(x), ax.sy(v) - 9, fmtCompact(v), 'middle', T.fs - 0.5, '', T.ink, T.surface) })
          }
          if (xs.length > 120 && !enc.shape) continue
          for (const x of xs) {
            const v = pn.V!.get(`${x}\u0002${s.key}`)
            if (v === undefined) continue
            const t = tip(String(x), [[s.label || yf, fmtExact(v)]])
            if (enc.shape) { const g = glyph(s.si % 5, sx(x), ax.sy(v), 4); pa(pn, g.d, g.line ? 'none' : s.color, g.line ? s.color : T.surface, g.line ? 2 : 1.5, '', op(s), t) }
            else pa(pn, glyph(0, sx(x), ax.sy(v), 6).d, 'transparent', 'none', 0, '', 1, t)
          }
        }
      } else {
        const acc = new Map<any, number>(), tot = new Map<any, number>()
        for (const x of xs) { acc.set(x, 0); let t = 0; for (const s of series) t += pn.V!.get(`${x}\u0002${s.key}`) ?? 0; tot.set(x, t) }
        for (const s of series) {
          const up: [number, number][] = [], dn: [number, number][] = []
          for (const x of xs) {
            const v = pn.V!.get(`${x}\u0002${s.key}`) ?? 0, v1 = stackMode === 'normalize' ? (tot.get(x)! ? v / tot.get(x)! : 0) : v
            const b0 = stackMode === 'group' ? 0 : acc.get(x)!, b1 = b0 + v1
            up.push([r1(sx(x)), r1(ax.sy(b1))]); dn.push([r1(sx(x)), r1(ax.sy(b0))])
            if (stackMode !== 'group') acc.set(x, b1)
          }
          const d = `M${up.map((p) => p.join(' ')).join('L')}L${dn.slice().reverse().map((p) => p.join(' ')).join('L')}Z`
          pa(pn, d, s.fill, s.color, 1.2, '', stackMode === 'group' ? Math.min(op(s), 0.6) : op(s), '')
          if (xs.length > 120) continue
          xs.forEach((x, xj) => {
            const v = pn.V!.get(`${x}\u0002${s.key}`)
            if (v !== undefined) pa(pn, glyph(0, sx(x), up[xj][1], 6).d, 'transparent', 'none', 0, '', 1, tip(String(x), [[s.label || yf, fmtExact(v)]]))
          })
        }
      }
      refLine(pn, bx, ax.sy)
    }
  } else if (mark === 'scatter') {
    const xf = enc.x!.f, yf = enc.y!.f, szf = enc.size?.f, opf = enc.opacity?.f, lbf = enc.label?.f
    let xl = Infinity, xh = -Infinity, yl = Infinity, yh = -Infinity, sl = Infinity, sh = -Infinity, ol = Infinity, oh = -Infinity
    for (const r of rows) {
      xl = Math.min(xl, r[xf]); xh = Math.max(xh, r[xf]); yl = Math.min(yl, r[yf]); yh = Math.max(yh, r[yf])
      if (szf) { sl = Math.min(sl, r[szf]); sh = Math.max(sh, r[szf]) }
      if (opf) { ol = Math.min(ol, r[opf]); oh = Math.max(oh, r[opf]) }
    }
    if (spec.zero) { xl = Math.min(0, xl); yl = Math.min(0, yl) }
    yh = refMax(yh)
    for (const pn of panels) {
      const bx = frame(), ax = yAx(pn, bx, yl, yh), nx = xNum(pn, bx, xl, xh)
      const stride = Math.max(1, Math.ceil(pn.prows.length / 500))
      pn.prows.forEach((r, i) => {
        if (i % stride) return
        const s = series.find((q) => q.key === skey(r)) ?? series[0]
        const rr = szf ? 3 + Math.sqrt((r[szf] - sl) / (sh - sl || 1)) * 7 : 4.6
        const g = glyph(s.si % 5, nx.sx(r[xf]), ax.sy(r[yf]), rr)
        const pairs: [string, string][] = [[xf, fmtExact(r[xf])], [yf, fmtExact(r[yf])]]
        if (szf) pairs.push([szf, fmtExact(r[szf])])
        if (opf) pairs.push([opf, fmtExact(r[opf])])
        if (lbf) pairs.push([lbf, fmtExact(r[lbf])])
        const po = opf ? 0.15 + 0.85 * ((r[opf] - ol) / (oh - ol || 1)) : 1
        pa(pn, g.d, g.line ? 'none' : s.color, g.line ? s.color : T.surface, g.line ? 2 : 1.4, '', op(s) * po, tip(s.label || 'Point', pairs))
        // labels stay readable only on a sparse chart: past 60 points the field shows in the tooltip alone
        if (lbf && pn.prows.length / stride <= 60) { const t = String(r[lbf]); tx(pn, nx.sx(r[xf]) + rr + 3, ax.sy(r[yf]) + 3.5, t.length > 18 ? `${t.slice(0, 17)}…` : t, 'start', T.fs, '', T.ink) }
      })
      refLine(pn, bx, ax.sy)
    }
  } else if (mark === 'histogram') {
    const xf = enc.x!.f, nb = Number(rows[0]?.__nb) || spec.bins || 12
    // rows from DuckDB arrive already binned: x is the bin centre, __n the count, __lo/__hi the true range
    const weighted = rows[0]?.__n !== undefined
    let lo = Infinity, hi = -Infinity
    if (weighted) { lo = Number(rows[0].__lo); hi = Number(rows[0].__hi) } else for (const r of rows) { lo = Math.min(lo, r[xf]); hi = Math.max(hi, r[xf]) }
    const bw0 = (hi - lo) / nb || 1
    for (const pn of panels) {
      pn.B = Array.from({ length: nb }, () => ({}))
      for (const r of pn.prows) { const b = Math.max(0, Math.min(nb - 1, Math.floor((r[xf] - lo) / bw0))), k = skey(r); pn.B[b][k] = (pn.B[b][k] ?? 0) + (weighted ? Number(r.__n) : 1) }
    }
    let ymax = 1
    for (const pn of panels) for (const b of pn.B!) ymax = Math.max(ymax, Object.values(b).reduce((a, c) => a + c, 0))
    for (const pn of panels) {
      const bx = frame(), ax = yAx(pn, bx, 0, ymax), nx = xNum(pn, bx, lo, hi)
      pn.B!.forEach((b, i) => {
        let acc = 0
        const total = series.reduce((a, s) => a + (b[s.key] ?? 0), 0)
        // every segment of a bin lists all the series in that bin, the hovered one first, so colour-split bins are readable
        const lines = (s: (typeof series)[number]): [string, string][] => {
          const mine: [string, string] = [s.label || 'rows', fmtExact(b[s.key] ?? 0)]
          if (series.length < 2) return [mine]
          return [mine, ...series.filter((o) => o !== s && (b[o.key] ?? 0) > 0).map((o): [string, string] => [o.label || 'rows', fmtExact(b[o.key])]), ['bin total', fmtExact(total)]]
        }
        for (const s of series) {
          const v = b[s.key] ?? 0
          if (!v) continue
          const x0 = nx.sx(lo + i * bw0), x1 = nx.sx(lo + (i + 1) * bw0)
          rect(pn, x0 + 1, ax.sy(acc + v), x1 - x0 - 2, ax.sy(acc) - ax.sy(acc + v), s, tip(`${fmtCompact(lo + i * bw0)} to ${fmtCompact(lo + (i + 1) * bw0)}`, lines(s)), 3)
          acc += v
        }
      })
      const rv = Number(spec.ref)
      if (spec.ref !== '' && !Number.isNaN(rv) && rv >= lo && rv <= hi) {
        ln(pn, nx.sx(rv), bx.y0, nx.sx(rv), bx.y1, T.ink, 1.5, '5 4')
        tx(pn, nx.sx(rv) + 4, bx.y0 + 11, `Reference ${fmtCompact(rv)}`, 'start', T.fs, '', T.ink)
      }
      // summary lines, computed by DuckDB over all the filtered rows; labels step down so close lines stay readable
      const sv: Record<string, unknown> = { mean: rows[0]?.__mean, median: rows[0]?.__md, q1: rows[0]?.__q1, q3: rows[0]?.__q3 }
      const dashes: Record<string, string> = { mean: '2 3', median: '9 3 2 3', q1: '7 4', q3: '7 4' }
      const names: Record<string, string> = { mean: 'Mean', median: 'Median', q1: 'Q1', q3: 'Q3' }
      spec.stats.forEach((st, k) => {
        if (st === 'sd') {
          // a soft band and two dashed edges at the mean plus and minus one sample standard deviation
          const m = Number(rows[0]?.__mean), sd = Number(rows[0]?.__sd)
          if (rows[0]?.__mean == null || rows[0]?.__sd == null || Number.isNaN(m) || Number.isNaN(sd) || sd <= 0) return
          const a = nx.sx(m - sd), b = nx.sx(m + sd), x0 = Math.max(bx.x0, Math.min(a, b)), x1 = Math.min(bx.x1, Math.max(a, b))
          if (x1 > x0) pn.rects.push({ x: r1(x0), y: r1(bx.y0), w: r1(x1 - x0), h: r1(bx.y1 - bx.y0), rx: 0, fill: T.ink, stroke: 'none', op: 0.08, tip: tip('Mean ± 1 SD', [['mean', fmtCompact(m)], ['standard deviation', fmtCompact(sd)], ['range', `${fmtCompact(m - sd)} to ${fmtCompact(m + sd)}`]]) })
          for (const e of [a, b]) if (e >= bx.x0 && e <= bx.x1) ln(pn, e, bx.y0, e, bx.y1, T.ink, 1.2, '3 3')
          tx(pn, Math.min(b, bx.x1 - 2) - 4, bx.y0 + 11 + (spec.ref !== '' ? 12 : 0) + k * 12, `± 1 SD ${fmtCompact(sd)}`, 'end', T.fs, '', T.ink)
          return
        }
        const v = Number(sv[st])
        if (sv[st] === undefined || sv[st] === null || Number.isNaN(v)) return
        ln(pn, nx.sx(v), bx.y0, nx.sx(v), bx.y1, T.ink, 1.5, dashes[st])
        tx(pn, nx.sx(v) + 4, bx.y0 + 11 + (spec.ref !== '' ? 12 : 0) + k * 12, `${names[st]} ${fmtCompact(v)}`, 'start', T.fs, '', T.ink)
      })
    }
  } else if (mark === 'box') {
    const xf = enc.x!.f, yf = enc.y!.f, cats = us(rows, xf)
    let lo = Infinity, hi = -Infinity
    for (const pn of panels) {
      pn.S = new Map()
      if (rows[0]?.__q1 !== undefined) {
        // statistics computed by DuckDB: one row per category and series
        for (const r of pn.prows) {
          let out: number[] = []
          try { out = r.__out ? (JSON.parse(String(r.__out)) as number[]).slice(0, 12) : [] } catch { out = [] }
          pn.S.set(`${r[xf]}${skey(r)}`, { q1: Number(r.__q1), md: Number(r.__md), q3: Number(r.__q3), wl: Number(r.__wl), wh: Number(r.__wh), out, n: Number(r.__n) })
          lo = Math.min(lo, Number(r.__wl), ...(out.length ? out : [Number(r.__wl)])); hi = Math.max(hi, Number(r.__wh), ...(out.length ? out : [Number(r.__wh)]))
        }
        continue
      }
      for (const c of cats) for (const s of series) {
        const v = pn.prows.filter((r) => r[xf] === c && skey(r) === s.key).map((r) => r[yf] as number).sort((a, b) => a - b)
        if (!v.length) continue
        const q = (p: number) => { const i = (v.length - 1) * p, f = Math.floor(i), c2 = Math.ceil(i); return v[f] + (v[c2] - v[f]) * (i - f) }
        const q1 = q(0.25), md = q(0.5), q3 = q(0.75), iq = q3 - q1
        const wl = v.find((x) => x >= q1 - 1.5 * iq)!, wh = v.slice().reverse().find((x) => x <= q3 + 1.5 * iq)!
        const out = v.filter((x) => x < wl || x > wh).slice(0, 12)
        pn.S.set(`${c}\u0002${s.key}`, { q1, md, q3, wl, wh, out, n: v.length })
        lo = Math.min(lo, wl, ...(out.length ? out : [wl])); hi = Math.max(hi, wh, ...(out.length ? out : [wh]))
      }
    }
    if (spec.zero) lo = Math.min(0, lo)
    hi = refMax(hi)
    for (const pn of panels) {
      const bx = frame(), ax = yAx(pn, bx, lo, hi), step = xBand(pn, bx, cats), bw = step * 0.72
      cats.forEach((c, i) => {
        const left = bx.x0 + step * (i + 0.5) - bw / 2, sw = bw / series.length
        series.forEach((s, j) => {
          const b = pn.S!.get(`${c}\u0002${s.key}`)
          if (!b) return
          const cx = left + j * sw + sw / 2, w = Math.max(6, sw * 0.7), o2 = op(s)
          ln(pn, cx, ax.sy(b.wl), cx, ax.sy(b.wh), s.color, 1.6)
          pn.rects.push({ x: r1(cx - w / 2), y: r1(ax.sy(b.q3)), w: r1(w), h: r1(Math.max(1, ax.sy(b.q1) - ax.sy(b.q3))), rx: 3, fill: s.fill, stroke: s.color, op: o2, tip: tip(String(c) + (s.label ? ` · ${s.label}` : ''), [['median', fmtExact(b.md)], ['q1 to q3', `${fmtCompact(b.q1)} to ${fmtCompact(b.q3)}`], ['rows', String(b.n)]]) })
          ln(pn, cx - w / 2, ax.sy(b.md), cx + w / 2, ax.sy(b.md), T.ink, 2)
          for (const x of b.out as number[]) pa(pn, glyph(0, cx, ax.sy(x), 2.6).d, 'none', s.color, 1.4, '', o2, tip(String(c), [['outlier', fmtExact(x)]]))
        })
      })
      refLine(pn, bx, ax.sy)
    }
  } else if (mark === 'heatmap') {
    const xf = enc.x!.f, yf = enc.y!.f, vf = enc.color!.f, agg = enc.color!.agg ?? 'sum'
    const xc2 = us(rows, xf), yc2 = us(rows, yf)
    let lo = Infinity, hi = -Infinity
    for (const pn of panels) {
      const raw2 = new Map<string, number[]>()
      for (const r of pn.prows) { const k = `${r[xf]}\u0002${r[yf]}`; let a = raw2.get(k); if (!a) { a = []; raw2.set(k, a) } a.push(r[vf]) }
      pn.G = new Map()
      raw2.forEach((a, k) => { const v = aggregate(a, agg); pn.G!.set(k, v); lo = Math.min(lo, v); hi = Math.max(hi, v) })
    }
    const ramp = (t: number) => T.mix(T.surface, T.tokens.c1, 0.1 + 0.9 * t)
    const lm = Math.min(150, Math.max(46, Math.max(...yc2.map((y) => String(y).length)) * 6.4 + 14))
    for (const pn of panels) {
      const bx = frame(lm), sx = (bx.x1 - bx.x0) / xc2.length, sy2 = (bx.y1 - bx.y0) / yc2.length
      yc2.forEach((y, j) => { const s = String(y); tx(pn, bx.x0 - 8, bx.y0 + sy2 * (j + 0.5) + 4, s.length > 20 ? `${s.slice(0, 19)}…` : s, 'end') })
      xBand(pn, bx, xc2)
      xc2.forEach((x, i) => yc2.forEach((y, j) => {
        const v = pn.G!.get(`${x}\u0002${y}`)
        if (v === undefined) return
        const t = (v - lo) / (hi - lo || 1), fill = ramp(t)
        pn.rects.push({ x: r1(bx.x0 + sx * i + 1), y: r1(bx.y0 + sy2 * j + 1), w: r1(sx - 2), h: r1(sy2 - 2), rx: 4, fill, stroke: 'none', op: 1, tip: tip(`${x} · ${y}`, [[vf, fmtExact(v)]]) })
        if (sx > 40 && sy2 > 18) tx(pn, bx.x0 + sx * (i + 0.5), bx.y0 + sy2 * (j + 0.5) + 4, fmtCompact(v), 'middle', T.fs, '', T.onColor(fill))
      }))
    }
    series.length = 1
    series[0].heat = { lo, hi, f: vf }
    ;(series[0] as any).ramp = ramp
  } else if (mark === 'pie') {
    const sz = enc.size!.f, agg = enc.size!.agg ?? 'sum'
    for (const pn of panels) {
      let items = series.map((s) => ({ s, v: Math.max(0, aggregate(pn.prows.filter((r) => skey(r) === s.key).map((r) => r[sz] as number), agg)) }))
      const tot = items.reduce((a, b) => a + b.v, 0) || 1
      // slice order: largest or smallest first, or reversed (natural keeps the data's own order)
      if (spec.sort === 'high') items = items.slice().sort((p, q) => q.v - p.v)
      else if (spec.sort === 'low') items = items.slice().sort((p, q) => p.v - q.v)
      else if (spec.sort === 'reverse') items = items.slice().reverse()
      // slices under the chosen share fold into one grey "Other" slice at the end (a single small slice stays as it is)
      const tiny = spec.pie.other > 0 ? items.filter((it) => it.v > 0 && (it.v / tot) * 100 < spec.pie.other) : []
      if (tiny.length > 1) {
        const grey = T.mix(T.surface, T.ink, 0.55)
        items = [...items.filter((it) => !tiny.includes(it)), { s: { ...tiny[0].s, key: '\u0000other', label: 'Other', color: grey, fill: grey, pat: false, has: {} }, v: tiny.reduce((a, b) => a + b.v, 0) }]
      }
      const cx = pw / 2, cy = (small ? 20 : 0) + (ph - (small ? 20 : 0)) / 2, Rr = Math.max(30, Math.min(pw, ph - (small ? 20 : 0)) / 2 - 30), r0 = spec.donut ? Rr * (spec.pie.hole / 100) : 0
      let a = -Math.PI / 2
      items.forEach(({ s, v }) => {
        if (v <= 0) return
        const f = v / tot, a1 = a + f * 2 * Math.PI, am = (a + a1) / 2
        const P0 = (rad: number, ang: number): [number, number] => [r1(cx + rad * Math.cos(ang)), r1(cy + rad * Math.sin(ang))]
        let d: string
        if (f > 0.9999) d = `M${r1(cx - Rr)} ${r1(cy)}a${r1(Rr)} ${r1(Rr)} 0 1 0 ${r1(2 * Rr)} 0a${r1(Rr)} ${r1(Rr)} 0 1 0 ${r1(-2 * Rr)} 0`
        else {
          const p0 = P0(Rr, a), p1 = P0(Rr, a1), lg = f > 0.5 ? 1 : 0
          if (r0 > 0) { const q0 = P0(r0, a), q1 = P0(r0, a1); d = `M${p0.join(' ')}A${r1(Rr)} ${r1(Rr)} 0 ${lg} 1 ${p1.join(' ')}L${q1.join(' ')}A${r1(r0)} ${r1(r0)} 0 ${lg} 0 ${q0.join(' ')}Z` }
          else d = `M${r1(cx)} ${r1(cy)}L${p0.join(' ')}A${r1(Rr)} ${r1(Rr)} 0 ${lg} 1 ${p1.join(' ')}Z`
        }
        pa(pn, d, s.fill, s.pat ? s.color : T.surface, s.pat ? 1.2 : 2, '', op(s), tip(s.label || 'Slice', [[sz, fmtExact(v)], ['share', `${Math.round(f * 1000) / 10}%`]]))
        if (labelMode !== 'off' && f > 0.04) {
          const share = `${Math.round(f * 100)}%`, text = labelMode === 'value' ? fmtCompact(v) : labelMode === 'both' ? `${fmtCompact(v)} \u00b7 ${share}` : share
          const lp = P0(Rr + 14, am)
          tx(pn, lp[0], lp[1] + 4, text, Math.cos(am) > 0.2 ? 'start' : Math.cos(am) < -0.2 ? 'end' : 'middle', T.fs, '', T.ink)
        }
        a = a1
      })
      if (spec.donut) { tx(pn, cx, cy + 2, fmtCompact(tot), 'middle', 20, '', T.ink); tx(pn, cx, cy + 20, sz, 'middle') }
    }
  } else if (mark === 'waffle') {
    // 100 squares, one per percent of the total; groups get whole squares by largest remainder so the grid always fills
    const sz = enc.size!.f, agg = enc.size!.agg ?? 'sum', head = small ? 20 : 0
    for (const pn of panels) {
      const vals = series.map((s) => Math.max(0, aggregate(pn.prows.filter((r) => skey(r) === s.key).map((r) => r[sz] as number), agg)))
      const tot = vals.reduce((a, b) => a + b, 0) || 1
      const exact = vals.map((v) => (v / tot) * 100), count = exact.map((e) => Math.floor(e))
      let left = 100 - count.reduce((a, b) => a + b, 0)
      exact.map((e, i) => [e - Math.floor(e), i] as [number, number]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0 && vals[i] > 0) { count[i]++; left-- } })
      const side = Math.max(60, Math.min(pw - 20, ph - head - 36)), cell = side / 10, x0 = (pw - side) / 2, y0 = head + 6
      let k = 0
      series.forEach((s, i) => {
        for (let n = 0; n < count[i]; n++, k++) {
          const col = Math.floor(k / 10), row = k % 10
          rect(pn, x0 + col * cell + 1.5, y0 + side - (row + 1) * cell + 1.5, cell - 3, cell - 3, s, tip(s.label || 'Group', [[sz, fmtExact(vals[i])], ['share', `${Math.round((vals[i] / tot) * 1000) / 10}%`]]), 2)
        }
      })
      tx(pn, pw / 2, y0 + side + 18, 'Each square is 1% of the total', 'middle')
    }
  } else if (mark === 'tick') {
    const xf = enc.x!.f, yf = enc.y?.f, cats = yf ? us(rows, yf) : [null]
    let lo = Infinity, hi = -Infinity
    for (const r of rows) { lo = Math.min(lo, r[xf]); hi = Math.max(hi, r[xf]) }
    const lm = yf ? Math.min(150, Math.max(46, Math.max(...cats.map((c) => String(c).length)) * 6.4 + 14)) : 20
    for (const pn of panels) {
      const bx = frame(lm), nx = xNum(pn, bx, lo, hi), band = (bx.y1 - bx.y0) / cats.length, h = Math.min(band * 0.7, 28)
      cats.forEach((c, j) => {
        const cy = bx.y0 + band * (j + 0.5)
        if (spec.grid) ln(pn, bx.x0, cy, bx.x1, cy, T.grid, 1)
        if (yf) tx(pn, bx.x0 - 8, cy + 4, String(c).length > 20 ? `${String(c).slice(0, 19)}…` : String(c), 'end')
      })
      const stride = Math.max(1, Math.ceil(pn.prows.length / 3000))
      pn.prows.forEach((r, i) => {
        if (i % stride) return
        const s = series.find((q) => q.key === skey(r)) ?? series[0], j = yf ? cats.indexOf(r[yf]) : 0
        if (j < 0) return
        const cy = bx.y0 + band * (j + 0.5), x = nx.sx(r[xf])
        pn.rects.push({ x: r1(x - 1.25), y: r1(cy - h / 2), w: 2.5, h: r1(h), rx: 1.25, fill: s.color, stroke: 'none', op: op(s) * 0.7, tip: tip(yf ? String(r[yf]) : xf, [[xf, fmtExact(r[xf])]]) })
      })
    }
  } else if (mark === 'text') {
    // a pivot table: the DOM drawing is pivotDraw.ts; this decides its rows, columns, measures and formats
    const rowFields = TABLE_ROWS.map((c) => enc[c]?.f).filter((f): f is string => !!f)
    const colFields = TABLE_COLS.map((c) => enc[c]?.f).filter((f): f is string => !!f)
    const measures = TABLE_VALUES.map((c) => enc[c]).filter((e) => !!e).map((e) => {
      const fn = e!.agg ?? 'sum'
      return { label: `${fn === 'count' ? 'Count' : fn[0].toUpperCase() + fn.slice(1)} of ${e!.f}`, field: e!.f, agg: fn, show: e!.show ?? 'value', dec: e!.dec, pre: e!.pre ?? '', suf: e!.suf ?? '' }
    })
    for (const pn of panels) {
      tables.push(buildPivot({
        title: pn.title, rowFields, colFields, rowLabels: rowFields, colLabels: colFields, measures, rows: pn.prows, aggregate, sort: spec.sort, opts: spec.table, exact: fmtExact,
      }))
    }
  } else if (mark === 'density') {
    // a smoothed curve of where the values fall, one per series, scaled so every curve has the same area
    const xf = enc.x!.f, NP = 96
    let lo = Infinity, hi = -Infinity
    for (const r of rows) { lo = Math.min(lo, r[xf]); hi = Math.max(hi, r[xf]) }
    const span = hi - lo || 1, a = lo >= 0 ? Math.max(0, lo - span * 0.08) : lo - span * 0.08, b = hi + span * 0.08
    const curves = new Map<Panel, { s: Series; n: number; d: number[] }[]>()
    let ymax = 0
    for (const pn of panels) {
      const list: { s: Series; n: number; d: number[] }[] = []
      for (const s of series) {
        const v = pn.prows.filter((r) => skey(r) === s.key).map((r) => Number(r[xf]))
        if (v.length < 2) continue
        const mean = v.reduce((p, c) => p + c, 0) / v.length, sd = Math.sqrt(v.reduce((p, c) => p + (c - mean) ** 2, 0) / (v.length - 1))
        const bw = 1.06 * (sd || span / 20) * Math.pow(v.length, -0.2)
        const d = Array.from({ length: NP }, (_, i) => {
          const x = a + ((b - a) * i) / (NP - 1)
          let t = 0
          for (const y of v) { const z = (x - y) / bw; t += Math.exp(-0.5 * z * z) }
          return t / (v.length * bw * Math.sqrt(2 * Math.PI))
        })
        ymax = Math.max(ymax, ...d)
        list.push({ s, n: v.length, d })
      }
      curves.set(pn, list)
    }
    for (const pn of panels) {
      const bx = frame(14), ax = yAx(pn, bx, 0, (ymax || 1) * 1.08, () => ''), nx = xNum(pn, bx, a, b)
      for (const c of curves.get(pn)!) {
        const pts = c.d.map((v, i) => [r1(nx.sx(a + ((b - a) * i) / (NP - 1))), r1(ax.sy(v))] as [number, number])
        const line = `M${pts.map((p) => p.join(' ')).join('L')}`
        pa(pn, `${line}L${pts[NP - 1][0]} ${r1(bx.y1)}L${pts[0][0]} ${r1(bx.y1)}Z`, c.s.fill, 'none', 0, '', Math.min(op(c.s), 0.5), tip(c.s.label || xf, [['rows', fmtExact(c.n)]]))
        pa(pn, line, 'none', c.s.color, 2.2, '', op(c.s), '')
      }
    }
  } else if (mark === 'rule') {
    // the range of a number per category, with a dot at the mean
    const xf = enc.x!.f, yf = enc.y!.f, cats = us(rows, yf), pre = rows[0]?.__lo !== undefined
    type St = { lo: number; hi: number; mean: number; n: number }
    const stats = new Map<Panel, Map<string, St>>()
    let lo = Infinity, hi = -Infinity
    for (const pn of panels) {
      const m = new Map<string, St>()
      if (pre) for (const r of pn.prows) m.set(`${r[yf]}\u0002${skey(r)}`, { lo: Number(r.__lo), hi: Number(r.__hi), mean: Number(r.__mean), n: Number(r.__n) })
      else {
        const g = new Map<string, number[]>()
        for (const r of pn.prows) { const k = `${r[yf]}\u0002${skey(r)}`; let q = g.get(k); if (!q) { q = []; g.set(k, q) } q.push(Number(r[xf])) }
        g.forEach((v, k) => m.set(k, { lo: Math.min(...v), hi: Math.max(...v), mean: v.reduce((p, c) => p + c, 0) / v.length, n: v.length }))
      }
      m.forEach((v) => { lo = Math.min(lo, v.lo); hi = Math.max(hi, v.hi) })
      stats.set(pn, m)
    }
    const lm = Math.min(150, Math.max(46, Math.max(...cats.map((c) => String(c).length)) * 6.4 + 14))
    for (const pn of panels) {
      const bx = frame(lm), nx = xNum(pn, bx, lo, hi), band = (bx.y1 - bx.y0) / cats.length, sub = band / series.length
      cats.forEach((c, i) => {
        const mid = bx.y0 + band * (i + 0.5), t = String(c)
        if (spec.grid) ln(pn, bx.x0, mid, bx.x1, mid, T.grid, 1)
        tx(pn, bx.x0 - 8, mid + 4, t.length > 20 ? `${t.slice(0, 19)}…` : t, 'end')
        series.forEach((s, j) => {
          const v = stats.get(pn)!.get(`${c}\u0002${s.key}`)
          if (!v) return
          const cy = bx.y0 + band * i + sub * (j + 0.5), x1 = nx.sx(v.lo), x2 = nx.sx(v.hi)
          ln(pn, x1, cy, x2, cy, s.color, 3)
          ln(pn, x1, cy - 5, x1, cy + 5, s.color, 2)
          ln(pn, x2, cy - 5, x2, cy + 5, s.color, 2)
          pn.rects.push({ x: r1(Math.min(x1, x2) - 4), y: r1(cy - 9), w: r1(Math.abs(x2 - x1) + 8), h: 18, rx: 4, fill: 'transparent', stroke: 'none', op: 1, tip: tip(t + (s.label ? ` · ${s.label}` : ''), [['min to max', `${fmtCompact(v.lo)} to ${fmtCompact(v.hi)}`], ['mean', fmtExact(v.mean)], ['rows', fmtExact(v.n)]]) })
          pa(pn, glyph(0, nx.sx(v.mean), cy, 4.6).d, s.color, T.surface, 1.6, '', op(s), tip(t, [['mean', fmtExact(v.mean)]]))
        })
      })
    }
  } else if (mark === 'treemap') {
    // tile area is the share of the total; tiles are laid out so they stay close to square
    const sz = enc.size!.f, agg = enc.size!.agg ?? 'sum', head = small ? 22 : 8
    for (const pn of panels) {
      const vals = series.map((s) => Math.max(0, aggregate(pn.prows.filter((r) => skey(r) === s.key).map((r) => r[sz] as number), agg)))
      const tot = vals.reduce((p, c) => p + c, 0) || 1
      makeTree('treemap', pn, vals, head)
      const items = vals.map((v, i) => ({ v, i })).filter((q) => q.v > 0).sort((p, c) => c.v - p.v)
      const scale = ((pw - 4) * (ph - head - 4)) / tot
      let X = 2, Y = head, W = pw - 4, H = ph - head - 4, rest = items.slice()
      while (rest.length) {
        const short = Math.min(W, H)
        const worst = (row: typeof items, sum: number) => { const mx = row[0].v * scale, mn = row[row.length - 1].v * scale; return Math.max((short * short * mx) / (sum * sum), (sum * sum) / (short * short * mn)) }
        let row = [rest[0]], sum = rest[0].v * scale, k = 1
        while (k < rest.length) {
          const next = [...row, rest[k]], ns = sum + rest[k].v * scale
          if (worst(next, ns) <= worst(row, sum)) { row = next; sum = ns; k++ } else break
        }
        const thick = sum / short
        let off = 0
        for (const it of row) {
          const len = (it.v * scale) / thick, s = series[it.i]
          const [rx0, ry0, rw, rh] = W >= H ? [X, Y + off, thick, len] : [X + off, Y, len, thick]
          rect(pn, rx0 + 1, ry0 + 1, rw - 2, rh - 2, s, tip(s.label || 'Group', [[sz, fmtExact(it.v)], ['share', `${Math.round((it.v / tot) * 1000) / 10}%`]]), 4)
          if (rw > 54 && rh > 30) {
            const name = s.label.length * 6.4 > rw - 12 ? `${s.label.slice(0, Math.max(2, Math.floor((rw - 12) / 6.4) - 1))}…` : s.label
            const fg = s.pat ? T.ink : T.onColor(s.color)
            tx(pn, rx0 + 8, ry0 + 18, name, 'start', T.fs, '', fg)
            tx(pn, rx0 + 8, ry0 + 33, `${Math.round((it.v / tot) * 100)}%`, 'start', T.fs, '', fg)
          }
          off += len
        }
        if (W >= H) { X += thick; W -= thick } else { Y += thick; H -= thick }
        rest = rest.slice(row.length)
      }
    }
  } else if (mark === 'radar') {
    // one spoke per category, one polygon per series
    const xf = enc.x!.f, yf = enc.y!.f, agg = enc.y!.agg ?? 'sum', axes = us(rows, xf), n = axes.length, head = small ? 20 : 0
    let mx = 0
    for (const pn of panels) { pn.V = gm(pn.prows, xf, yf, agg); pn.V.forEach((v) => { mx = Math.max(mx, v) }) }
    mx = mx || 1
    for (const pn of panels) {
      const cx = pw / 2, cy = head + (ph - head) / 2, Rr = Math.max(30, Math.min(pw - 120, ph - head - 50) / 2)
      const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n
      const P0 = (rad: number, i: number): [number, number] => [r1(cx + rad * Math.cos(ang(i))), r1(cy + rad * Math.sin(ang(i)))]
      for (let k = 1; k <= 4; k++) {
        const ring = axes.map((_, i) => P0((Rr * k) / 4, i).join(' ')).join('L')
        pa(pn, `M${ring}Z`, 'none', T.grid, 1, '', 1, '')
        tx(pn, cx + 4, cy - (Rr * k) / 4 + 11, fmtCompact((mx * k) / 4), 'start', T.fs - 1)
      }
      axes.forEach((c, i) => {
        const e = P0(Rr, i), l = P0(Rr + 14, i), cs = Math.cos(ang(i)), t = String(c)
        ln(pn, cx, cy, e[0], e[1], T.grid, 1)
        tx(pn, l[0], l[1] + 4, t.length > 14 ? `${t.slice(0, 13)}…` : t, cs > 0.25 ? 'start' : cs < -0.25 ? 'end' : 'middle', T.fs, '', T.ink)
      })
      for (const s of series) {
        const pts = axes.map((c, i) => { const v = pn.V!.get(`${c}\u0002${s.key}`) ?? 0; return { v, p: P0((Rr * v) / mx, i), c } })
        const d = `M${pts.map((q) => q.p.join(' ')).join('L')}Z`
        pa(pn, d, s.color, 'none', 0, '', op(s) * 0.14, '')
        pa(pn, d, 'none', s.color, 2.2, '', op(s), '')
        for (const q of pts) pa(pn, glyph(0, q.p[0], q.p[1], 4).d, s.color, T.surface, 1.4, '', op(s), tip(String(q.c), [[s.label || yf, fmtExact(q.v)]]))
      }
    }
  } else if (mark === 'sunburst') {
    // two rings: the inner ring is the colour field, the outer ring splits each of its slices by the detail field
    const sz = enc.size!.f, agg = enc.size!.agg ?? 'sum', cf = enc.color!.f, df = enc.detail?.f, head = small ? 20 : 0
    for (const pn of panels) {
      const vals = series.map((s) => Math.max(0, aggregate(pn.prows.filter((r) => skey(r) === s.key).map((r) => r[sz] as number), agg)))
      const tot = vals.reduce((p, c) => p + c, 0) || 1
      makeTree('sunburst', pn, vals, head)
      const cx = pw / 2, cy = head + (ph - head) / 2, R = Math.max(40, Math.min(pw, ph - head) / 2 - 24)
      const r0 = R * 0.24, rm = df ? R * 0.62 : R
      let a = -Math.PI / 2
      dom[cf].forEach((pv) => {
        const kids = series.map((s, i) => ({ s, i })).filter((k) => k.s.r[cf] === pv && vals[k.i] > 0)
        const pt = kids.reduce((p, k) => p + vals[k.i], 0)
        if (pt <= 0) return
        const a1 = a + (pt / tot) * 2 * Math.PI, first = kids[0].s
        pa(pn, sector(cx, cy, r0, rm - (df ? 1 : 0), a, a1), first.color, T.surface, 2, '', op(first), tip(String(pv), [[sz, fmtExact(pt)], ['share', `${Math.round((pt / tot) * 1000) / 10}%`]]))
        if (a1 - a > 0.3 && rm - r0 > 30) {
          const am = (a + a1) / 2, rr = (r0 + rm) / 2, t = String(pv)
          tx(pn, cx + rr * Math.cos(am), cy + rr * Math.sin(am) + 4, t.length > 10 ? `${t.slice(0, 9)}…` : t, 'middle', T.fs, '', T.onColor(first.color))
        }
        if (df) {
          let b = a
          kids.forEach((k, ki) => {
            const b1 = b + (vals[k.i] / tot) * 2 * Math.PI, shade = T.mix(first.color, T.surface, 0.12 + (0.5 * ki) / Math.max(1, kids.length - 1))
            pa(pn, sector(cx, cy, rm + 1, R, b, b1), shade, T.surface, 1.5, '', op(k.s), tip(`${pv} · ${k.s.r[df]}`, [[sz, fmtExact(vals[k.i])], ['share', `${Math.round((vals[k.i] / tot) * 1000) / 10}%`]]))
            b = b1
          })
        }
        a = a1
      })
      tx(pn, cx, cy + 2, fmtCompact(tot), 'middle', 16, '', T.ink)
      tx(pn, cx, cy + 18, sz, 'middle')
    }
  } else if (mark === 'sankey') {
    // from on the left, to on the right: band thickness is the flow
    const ff = enc.x!.f, tf = enc.y!.f, sz = enc.size!.f, agg = enc.size!.agg ?? 'sum'
    for (const pn of panels) {
      const g = new Map<string, number[]>()
      for (const r of pn.prows) { const k = `${r[ff]}\u0002${r[tf]}`; let q = g.get(k); if (!q) { q = []; g.set(k, q) } q.push(Number(r[sz])) }
      const flow = new Map<string, number>(), out = new Map<string, number>(), inn = new Map<string, number>()
      g.forEach((a, k) => {
        const v = Math.max(0, aggregate(a, agg)), [f, t] = k.split('\u0002')
        if (v <= 0) return
        flow.set(k, v); out.set(f, (out.get(f) ?? 0) + v); inn.set(t, (inn.get(t) ?? 0) + v)
      })
      const L = Array.from(out.keys()).sort((p, c) => out.get(c)! - out.get(p)!), Rt = Array.from(inn.keys()).sort((p, c) => inn.get(c)! - inn.get(p)!)
      const tot = Array.from(out.values()).reduce((p, c) => p + c, 0) || 1
      const lw = Math.min(140, Math.max(...L.map((n) => n.length), 1) * 6.4 + 10), rw = Math.min(140, Math.max(...Rt.map((n) => n.length), 1) * 6.4 + 10)
      const xL = lw, xR = pw - rw - 12, y0 = small ? 26 : 12, y1 = ph - 12, gap = 6
      const scale = (y1 - y0 - gap * (Math.max(L.length, Rt.length) - 1)) / tot
      const place = (names: string[], tots: Map<string, number>) => { const m = new Map<string, number>(); let y = y0; for (const n of names) { m.set(n, y); y += tots.get(n)! * scale + gap } return m }
      sankeys.push({
        tf: pn.tf, title: pn.title, w: pw, h: ph, small,
        from: L.map((n, i) => ({ name: n, v: out.get(n)!, color: colorFor(ff, n, i), tip: tip(n, [[sz, fmtExact(out.get(n)!)]]) })),
        to: Rt.map((n) => ({ name: n, v: inn.get(n)!, color: T.mix(T.surface, T.ink, 0.55), tip: tip(n, [[sz, fmtExact(inn.get(n)!)]]) })),
        flows: Array.from(flow.entries()).map(([k, v]) => { const [f, t] = k.split(''); return { f, t, v, tip: tip(`${f} to ${t}`, [[sz, fmtExact(v)], ['share', `${Math.round((v / tot) * 1000) / 10}%`]]) } }),
      })
      const ly = place(L, out), ry = place(Rt, inn), lc = new Map<string, number>(), rc = new Map<string, number>()
      const label = (t: string) => (t.length > 20 ? `${t.slice(0, 19)}…` : t)
      Array.from(flow.entries()).sort((p, c) => L.indexOf(p[0].split('\u0002')[0]) - L.indexOf(c[0].split('\u0002')[0]) || Rt.indexOf(p[0].split('\u0002')[1]) - Rt.indexOf(c[0].split('\u0002')[1])).forEach(([k, v]) => {
        const [f, t] = k.split('\u0002'), h = v * scale, a0 = ly.get(f)! + (lc.get(f) ?? 0), b0 = ry.get(t)! + (rc.get(t) ?? 0), sx = xL + 12, mid = (sx + xR) / 2
        lc.set(f, (lc.get(f) ?? 0) + h); rc.set(t, (rc.get(t) ?? 0) + h)
        const d = `M${r1(sx)} ${r1(a0)}C${r1(mid)} ${r1(a0)} ${r1(mid)} ${r1(b0)} ${r1(xR)} ${r1(b0)}L${r1(xR)} ${r1(b0 + h)}C${r1(mid)} ${r1(b0 + h)} ${r1(mid)} ${r1(a0 + h)} ${r1(sx)} ${r1(a0 + h)}Z`
        pa(pn, d, colorFor(ff, f, L.indexOf(f)), 'none', 0, '', 0.42, tip(`${f} to ${t}`, [[sz, fmtExact(v)], ['share', `${Math.round((v / tot) * 1000) / 10}%`]]))
      })
      L.forEach((n, i) => {
        pn.rects.push({ x: r1(xL), y: r1(ly.get(n)!), w: 12, h: r1(Math.max(1, out.get(n)! * scale)), rx: 2, fill: colorFor(ff, n, i), stroke: 'none', op: 1, tip: tip(n, [[sz, fmtExact(out.get(n)!)]]) })
        tx(pn, xL - 6, ly.get(n)! + (out.get(n)! * scale) / 2 + 4, label(n), 'end', T.fs, '', T.ink)
      })
      Rt.forEach((n) => {
        pn.rects.push({ x: r1(xR), y: r1(ry.get(n)!), w: 12, h: r1(Math.max(1, inn.get(n)! * scale)), rx: 2, fill: T.mix(T.surface, T.ink, 0.55), stroke: 'none', op: 1, tip: tip(n, [[sz, fmtExact(inn.get(n)!)]]) })
        tx(pn, xR + 18, ry.get(n)! + (inn.get(n)! * scale) / 2 + 4, label(n), 'start', T.fs, '', T.ink)
      })
    }
  } else if (mark === 'chord') {
    // every category is an arc around the circle; a ribbon joins two arcs and is as wide as the flow between them
    const ff = enc.x!.f, tf = enc.y!.f, sz = enc.size!.f, agg = enc.size!.agg ?? 'sum', head = small ? 20 : 0
    const names = Array.from(new Set([...us(rows, ff), ...us(rows, tf)].map(String))).sort((p, c) => p.localeCompare(c)), n = names.length
    for (const pn of panels) {
      const g = new Map<string, number[]>()
      for (const r of pn.prows) { const k = `${r[ff]}\u0002${r[tf]}`; let q = g.get(k); if (!q) { q = []; g.set(k, q) } q.push(Number(r[sz])) }
      const flows: { f: number; t: number; v: number }[] = [], tot = new Array(n).fill(0) as number[]
      g.forEach((a, k) => {
        const v = Math.max(0, aggregate(a, agg)), [f, t] = k.split('\u0002').map((x) => names.indexOf(x))
        if (v <= 0) return
        flows.push({ f, t, v }); tot[f] += v; tot[t] += v
      })
      const grand = tot.reduce((p, c) => p + c, 0) || 1, gapA = Math.min(0.06, 1.2 / n), k = (2 * Math.PI - gapA * n) / grand
      const cx = pw / 2, cy = head + (ph - head) / 2, R = Math.max(40, Math.min(pw - 160, ph - head - 40) / 2), ri = R - 14
      const start: number[] = [], cur: number[] = []
      let a = -Math.PI / 2
      names.forEach((_, i) => { start.push(a); cur.push(a); a += tot[i] * k + gapA })
      const pt = (rad: number, ang: number) => `${r1(cx + rad * Math.cos(ang))} ${r1(cy + rad * Math.sin(ang))}`
      flows.sort((p, c) => c.v - p.v).forEach((fl) => {
        const w = fl.v * k, s0 = cur[fl.f], s1 = s0 + w; cur[fl.f] = s1
        const t0 = cur[fl.t], t1 = t0 + w; cur[fl.t] = t1
        const d = `M${pt(ri, s0)}A${r1(ri)} ${r1(ri)} 0 ${w > Math.PI ? 1 : 0} 1 ${pt(ri, s1)}Q${r1(cx)} ${r1(cy)} ${pt(ri, t0)}A${r1(ri)} ${r1(ri)} 0 ${w > Math.PI ? 1 : 0} 1 ${pt(ri, t1)}Q${r1(cx)} ${r1(cy)} ${pt(ri, s0)}Z`
        pa(pn, d, colorFor(ff, names[fl.f], fl.f), T.surface, 0.8, '', 0.5, tip(`${names[fl.f]} to ${names[fl.t]}`, [[sz, fmtExact(fl.v)], ['share', `${Math.round((fl.v / (grand / 2)) * 1000) / 10}%`]]))
      })
      names.forEach((nm, i) => {
        if (tot[i] <= 0) return
        const a0 = start[i], a1 = a0 + tot[i] * k, am = (a0 + a1) / 2, cs = Math.cos(am), lp = pt(R + 12, am).split(' ').map(Number)
        pa(pn, sector(cx, cy, ri, R, a0, a1), colorFor(ff, nm, i), 'none', 0, '', 1, tip(nm, [[sz, fmtExact(tot[i])]]))
        tx(pn, lp[0], lp[1] + 4, nm.length > 16 ? `${nm.slice(0, 15)}…` : nm, cs > 0.25 ? 'start' : cs < -0.25 ? 'end' : 'middle', T.fs, '', T.ink)
      })
    }
  } else if (mark === 'trail') {
    // points joined in the order of a third field, with a ring at the start and a solid dot at the end
    const xf = enc.x!.f, yf = enc.y!.f, of = enc.order!.f
    let xl = Infinity, xh = -Infinity, yl = Infinity, yh = -Infinity
    for (const r of rows) { xl = Math.min(xl, r[xf]); xh = Math.max(xh, r[xf]); yl = Math.min(yl, r[yf]); yh = Math.max(yh, r[yf]) }
    if (spec.zero) { xl = Math.min(0, xl); yl = Math.min(0, yl) }
    yh = refMax(yh)
    const num = (v: any) => (typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Number(v))
    for (const pn of panels) {
      const bx = frame(), ax = yAx(pn, bx, yl, yh), nx = xNum(pn, bx, xl, xh)
      for (const s of series) {
        let pts = pn.prows.filter((r) => skey(r) === s.key)
        if (pts.every((r) => Number.isFinite(num(r[of])))) pts = pts.slice().sort((p, c) => num(p[of]) - num(c[of]))
        if (pts.length < 2) continue
        pa(pn, `M${pts.map((r) => `${r1(nx.sx(r[xf]))} ${r1(ax.sy(r[yf]))}`).join('L')}`, 'none', s.color, 2, '', op(s), '')
        pts.forEach((r, i) => {
          const last = i === pts.length - 1, first = i === 0
          const t = tip(s.label || of, [[of, String(r[of] instanceof Date ? r[of].toISOString().slice(0, 10) : r[of])], [xf, fmtExact(r[xf])], [yf, fmtExact(r[yf])]])
          pa(pn, glyph(0, nx.sx(r[xf]), ax.sy(r[yf]), last ? 5.5 : first ? 5 : 3).d, first ? T.surface : s.color, s.color, first ? 2 : 1, '', op(s), t)
        })
      }
      refLine(pn, bx, ax.sy)
    }
  }

  // legend: one group per encoded field
  const legend: LegendGroup[] = []
  const SW = 'M3 2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z'
  const item = (f: string, v: any, o: Partial<LegendItem>): LegendItem => ({ label: String(v), key: `${f}=${v}`, d: SW, fill: 'none', stroke: 'none', sw: 1.5, dash: '', ...o })
  if (mark === 'heatmap') {
    const h = series[0].heat!, ramp = (series[0] as any).ramp as (t: number) => string
    legend.push({ title: enc.color!.f, items: [0, 0.25, 0.5, 0.75, 1].map((t, i) => ({ label: i === 0 ? fmtCompact(h.lo) : i === 4 ? fmtCompact(h.hi) : '', key: '', d: SW, fill: ramp(t), stroke: 'none', sw: 1, dash: '' })) })
  } else {
    if (colorField) legend.push({ title: colorField, items: dom[colorField].map((v, i) => item(colorField, v, { fill: colorFor(colorField, v, i) })) })
    if (enc.pattern) {
      const pf = enc.pattern.f
      legend.push({ title: pf, items: dom[pf].map((v, i) => { const p = PATTERNS[i % 5]; defs.push({ id: `lp${i}`, color: T.mute, d: p.d, sw: p.sw, fill: p.fill ? T.mute : 'none' }); return item(pf, v, { fill: `url(#lp${i})`, stroke: T.mute, sw: 1 }) }) })
    }
    if (enc.dash) { const df = enc.dash.f; legend.push({ title: df, items: dom[df].map((v, i) => item(df, v, { d: 'M1 7h16', stroke: T.mute, sw: 2.2, dash: DASH[i % 5] })) }) }
    if (enc.shape) { const sf = enc.shape.f; legend.push({ title: sf, items: dom[sf].map((v, i) => { const g = glyph(i % 5, 9, 7, 4.2); return item(sf, v, { d: g.d, fill: g.line ? 'none' : T.mute, stroke: g.line ? T.mute : 'none', sw: 2 }) }) }) }
  }
  // axis titles: the chosen text, else the field on that axis (a histogram counts rows, a density estimates density)
  if (titled && frames.length === panels.length) {
    const xn = spec.xTitle.trim() || enc.x?.f || '', yn = spec.yTitle.trim() || enc.y?.f || (mark === 'histogram' ? 'Count' : mark === 'density' ? 'Density' : '')
    panels.forEach((pn, i) => {
      const f = frames[i], my = (f.y0 + f.y1) / 2
      if (xn) tx(pn, (f.x0 + f.x1) / 2, ph - 6, xn, 'middle', T.fs, '', T.ink)
      if (yn) tx(pn, 12, my, yn, 'middle', T.fs, `rotate(-90 12 ${r1(my)})`, T.ink)
    })
  }
  return { panels: panels.map(({ tf, title, rects, paths, lines, texts }) => ({ tf, title, rects, paths, lines, texts })), legend, defs, W, H, rows: rows.length, limitedSeries, seriesLimit, ...(labelsHidden ? { labelsHidden } : {}), ...(trees.length ? { trees } : {}), ...(sankeys.length ? { sankeys } : {}), ...(tables.length ? { tables } : {}) }
}
