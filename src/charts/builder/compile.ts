/* eslint-disable @typescript-eslint/no-explicit-any */
// 065-chart-builder: turns a chart spec and its rows into drawing primitives (rects, paths, lines, texts) for eight marks.
// Pure: no DOM, no DuckDB. It draws its own SVG, like the radar and pie panels, because Observable Plot has no dash channel,
// no fill patterns and no pie. Colours come from the app's ChartTheme (tokens), never hard-coded. tests/unit/chartBuilderCompile.test.ts.
import type { ChartTheme } from '@/charts/types'
import { chartRole, type DataType, type Role } from '@/charts/builder/columnTypes'
import { acceptsText, channelLabel, SLOTS, ROLE_WORD, type ChartSpec, type Channel } from '@/charts/builder/spec'

export type Row = Record<string, any>
export interface Col { name: string; type: DataType }

export interface RectP { x: number; y: number; w: number; h: number; rx: number; fill: string; stroke: string; op: number; tip: string }
export interface PathP { d: string; fill: string; stroke: string; sw: number; dash: string; op: number; tip: string }
export interface LineP { x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash: string }
export interface TextP { x: number; y: number; t: string; anchor: 'start' | 'middle' | 'end'; fill: string; size: number; tf: string }
export interface Panel { tf: string; title: string; rects: RectP[]; paths: PathP[]; lines: LineP[]; texts: TextP[] }
export interface LegendItem { label: string; key: string; d: string; fill: string; stroke: string; sw: number; dash: string }
export interface LegendGroup { title: string; items: LegendItem[] }
export interface PatternDef { id: string; color: string; d: string; sw: number; fill: string }
export type ChartModel =
  | { problem: string }
  | { problem?: undefined; panels: Panel[]; legend: LegendGroup[]; defs: PatternDef[]; W: number; H: number; rows: number; limitedSeries: boolean }

export type DrawnChart = Exclude<ChartModel, { problem: string }>

export interface BuildInput {
  spec: ChartSpec
  cols: Col[]
  rows: Row[]
  theme: ChartTheme
  width: number
  height: number
  /** A legend entry (`field=value`) being hovered: everything else dims. */
  hot: string | null
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

export function glyph(shape: number, cx: number, cy: number, r: number): { d: string; line: boolean } {
  const R = r1
  if (shape === 1) return { d: `M${R(cx - r)} ${R(cy - r)}h${R(2 * r)}v${R(2 * r)}h${R(-2 * r)}z`, line: false }
  if (shape === 2) return { d: `M${R(cx)} ${R(cy - r * 1.15)}L${R(cx + r)} ${R(cy + r * 0.85)}L${R(cx - r)} ${R(cy + r * 0.85)}z`, line: false }
  if (shape === 3) return { d: `M${R(cx)} ${R(cy - r)}L${R(cx + r)} ${R(cy)}L${R(cx)} ${R(cy + r)}L${R(cx - r)} ${R(cy)}z`, line: false }
  if (shape === 4) return { d: `M${R(cx - r)} ${R(cy)}h${R(2 * r)}M${R(cx)} ${R(cy - r)}v${R(2 * r)}`, line: true }
  return { d: `M${R(cx - r)} ${R(cy)}a${R(r)} ${R(r)} 0 1 0 ${R(2 * r)} 0a${R(r)} ${R(r)} 0 1 0 ${R(-2 * r)} 0`, line: false }
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
  return null
}

export function buildChart(input: BuildInput): ChartModel {
  const { spec, cols, theme: T } = input
  const enc = spec.enc, mark = spec.mark
  const problem = shelfProblem(spec, cols)
  if (problem) return { problem }
  let rows = input.rows
  if (spec.filter.f && spec.filter.v !== '') rows = rows.filter((r) => String(r[spec.filter.f]) === spec.filter.v)
  // box statistics from DuckDB carry no raw y value
  const preBox = rows[0]?.__q1 !== undefined
  const used = Object.values(enc).map((e) => e!.f).filter((f) => !(preBox && f === enc.y?.f))
  rows = rows.filter((r) => used.every((f) => r[f] !== null && r[f] !== undefined))
  if (!rows.length) return { problem: 'No rows match this data and filter.' }
  if (mark === 'pie' && uniqSorted(rows, enc.color!.f).length > 12) return { problem: `Pie and donut charts need 12 slices or fewer. ${enc.color!.f} has ${uniqSorted(rows, enc.color!.f).length}.` }

  const rf = enc.row?.f, cf = enc.column?.f
  const rv: any[] = rf ? uniqSorted(rows, rf).slice(0, 6) : [null], cv: any[] = cf ? uniqSorted(rows, cf).slice(0, 6) : [null]
  const nr = rv.length, nc = cv.length, small = nr * nc > 1, gap = 14
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
  const dom: Record<string, any[]> = {}
  let limitedSeries = false
  for (const f of serF) {
    const all = uniqSorted(rows, f)
    if (all.length > MAX_SERIES) limitedSeries = true
    dom[f] = all.slice(0, MAX_SERIES)
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
    if ((enc.color && mark !== 'heatmap' && ci < 0) || (enc.pattern && pi < 0) || (enc.dash && di < 0) || (enc.shape && si < 0)) continue
    raw.push({ r, ci, pi, di: Math.max(0, di), si: Math.max(0, si) })
  }
  raw.sort((a, b) => a.ci - b.ci || a.pi - b.pi || a.di - b.di || a.si - b.si)
  if (!raw.length) raw.push({ r: rows[0], ci: -1, pi: -1, di: 0, si: 0 })
  const series: Series[] = raw.map((q, i) => {
    const color = colorField ? colorFor(colorField, q.r[colorField], q.ci) : serF.length ? T.mix(T.surface, T.ink, 0.55) : T.cat(0)
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
  rv.forEach((rvv, ri) => cv.forEach((cvv, ci) => {
    panels.push({
      tf: `translate(${r1(ci * (pw + gap))} ${r1(ri * (ph + gap))})`, prows: rows.filter((r) => (rvv === null || r[rf!] === rvv) && (cvv === null || r[cf!] === cvv)),
      title: [rvv, cvv].filter((x) => x !== null).join(' · '), rects: [], paths: [], lines: [], texts: [],
    })
  }))
  const top = small ? 22 : 10
  const frame = (lm?: number) => ({ x0: lm ?? 46, x1: pw - 10, y0: top, y1: ph - 42 })
  type P = Panel
  const tx = (o: P, x: number, y: number, t: string | number, anchor: TextP['anchor'] = 'start', size = T.fs, tf = '', fill = T.mute) => o.texts.push({ x: r1(x), y: r1(y), t: String(t), anchor, fill, size, tf })
  const ln = (o: P, x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number, dash = '') => o.lines.push({ x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2), stroke, sw, dash })
  const pa = (o: P, d: string, fill: string, stroke: string, sw: number, dash: string, opac: number, tip: string) => o.paths.push({ d, fill, stroke, sw, dash, op: opac, tip })
  const rect = (o: P, x: number, y: number, w: number, h: number, s: Series, tip: string, rx = T.r) =>
    o.rects.push({ x: r1(x), y: r1(y), w: r1(Math.max(0, w)), h: r1(Math.max(0, h)), rx: Math.min(rx, Math.max(0, w) / 2, Math.max(0, h) / 2), fill: s.fill, stroke: s.pat ? s.color : 'none', op: op(s), tip })
  const tip = (title: string, pairs: [string, string][]) => [title, ...pairs.map((p) => `${p[0]}=${p[1]}`)].join('~')
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

  if (mark === 'bar') {
    const xf = enc.x!.f, yf = enc.y!.f, agg = enc.y!.agg ?? 'sum', cats = uniqSorted(rows, xf)
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
          })
        } else {
          let acc = 0
          for (const s of series) {
            const v = pn.V!.get(`${c}\u0002${s.key}`) ?? 0, v1 = stackMode === 'normalize' ? (tot ? v / tot : 0) : v
            if (v <= 0) continue
            rect(pn, left, ax.sy(acc + v1), bw, ax.sy(acc) - ax.sy(acc + v1) - (acc > 0 ? 1 : 0), s, tip(String(c), [[s.label || yf, fmtExact(v)], ['share', `${Math.round(tot ? (v / tot) * 100 : 0)}%`]]), 3)
            acc += v1
          }
        }
      })
      refLine(pn, bx, ax.sy)
    }
  } else if (mark === 'line' || mark === 'area') {
    const xf = enc.x!.f, yf = enc.y!.f, agg = enc.y!.agg ?? 'sum', xc = roleOf(cols, xf) === 'q', xs = uniqSorted(rows, xf)
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
    const xf = enc.x!.f, yf = enc.y!.f, szf = enc.size?.f
    let xl = Infinity, xh = -Infinity, yl = Infinity, yh = -Infinity, sl = Infinity, sh = -Infinity
    for (const r of rows) {
      xl = Math.min(xl, r[xf]); xh = Math.max(xh, r[xf]); yl = Math.min(yl, r[yf]); yh = Math.max(yh, r[yf])
      if (szf) { sl = Math.min(sl, r[szf]); sh = Math.max(sh, r[szf]) }
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
        pa(pn, g.d, g.line ? 'none' : s.color, g.line ? s.color : T.surface, g.line ? 2 : 1.4, '', op(s), tip(s.label || 'Point', pairs))
      })
      refLine(pn, bx, ax.sy)
    }
  } else if (mark === 'histogram') {
    const xf = enc.x!.f, nb = 12
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
        for (const s of series) {
          const v = b[s.key] ?? 0
          if (!v) continue
          const x0 = nx.sx(lo + i * bw0), x1 = nx.sx(lo + (i + 1) * bw0)
          rect(pn, x0 + 1, ax.sy(acc + v), x1 - x0 - 2, ax.sy(acc) - ax.sy(acc + v), s, tip(`${fmtCompact(lo + i * bw0)} to ${fmtCompact(lo + (i + 1) * bw0)}`, [[s.label || 'rows', fmtExact(v)]]), 3)
          acc += v
        }
      })
    }
  } else if (mark === 'box') {
    const xf = enc.x!.f, yf = enc.y!.f, cats = uniqSorted(rows, xf)
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
    const xc2 = uniqSorted(rows, xf), yc2 = uniqSorted(rows, yf)
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
      const vals = series.map((s) => Math.max(0, aggregate(pn.prows.filter((r) => skey(r) === s.key).map((r) => r[sz] as number), agg)))
      const tot = vals.reduce((a, b) => a + b, 0) || 1
      const cx = pw / 2, cy = (small ? 20 : 0) + (ph - (small ? 20 : 0)) / 2, Rr = Math.max(30, Math.min(pw, ph - (small ? 20 : 0)) / 2 - 30), r0 = spec.donut ? Rr * 0.58 : 0
      let a = -Math.PI / 2
      vals.forEach((v, i) => {
        if (v <= 0) return
        const s = series[i], f = v / tot, a1 = a + f * 2 * Math.PI, am = (a + a1) / 2
        const P0 = (rad: number, ang: number): [number, number] => [r1(cx + rad * Math.cos(ang)), r1(cy + rad * Math.sin(ang))]
        let d: string
        if (f > 0.9999) d = `M${r1(cx - Rr)} ${r1(cy)}a${r1(Rr)} ${r1(Rr)} 0 1 0 ${r1(2 * Rr)} 0a${r1(Rr)} ${r1(Rr)} 0 1 0 ${r1(-2 * Rr)} 0`
        else {
          const p0 = P0(Rr, a), p1 = P0(Rr, a1), lg = f > 0.5 ? 1 : 0
          if (r0 > 0) { const q0 = P0(r0, a), q1 = P0(r0, a1); d = `M${p0.join(' ')}A${r1(Rr)} ${r1(Rr)} 0 ${lg} 1 ${p1.join(' ')}L${q1.join(' ')}A${r1(r0)} ${r1(r0)} 0 ${lg} 0 ${q0.join(' ')}Z` }
          else d = `M${r1(cx)} ${r1(cy)}L${p0.join(' ')}A${r1(Rr)} ${r1(Rr)} 0 ${lg} 1 ${p1.join(' ')}Z`
        }
        pa(pn, d, s.fill, s.pat ? s.color : T.surface, s.pat ? 1.2 : 2, '', op(s), tip(s.label || 'Slice', [[sz, fmtExact(v)], ['share', `${Math.round(f * 1000) / 10}%`]]))
        if (f > 0.04) { const lp = P0(Rr + 14, am); tx(pn, lp[0], lp[1] + 4, `${Math.round(f * 100)}%`, Math.cos(am) > 0.2 ? 'start' : Math.cos(am) < -0.2 ? 'end' : 'middle', T.fs, '', T.ink) }
        a = a1
      })
      if (spec.donut) { tx(pn, cx, cy + 2, fmtCompact(tot), 'middle', 20, '', T.ink); tx(pn, cx, cy + 20, sz, 'middle') }
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
  return { panels: panels.map(({ tf, title, rects, paths, lines, texts }) => ({ tf, title, rects, paths, lines, texts })), legend, defs, W, H, rows: rows.length, limitedSeries }
}
