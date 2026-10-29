// 065-chart-builder: a Sankey you can focus. Click a node on either side and only the flows that touch it stay: the bands are laid
// out again over the full height, tweened from where they were. Click the node again, or the "Show all" line, to go back. The
// compiler decides every colour and tooltip (HSankey); this only places them. The node in focus is one entry in `HierState`
// ("from:Name" or "to:Name"), owned by the caller, so a redraw (hover, resize) keeps the filter.
import type { Selection } from 'd3-selection'
import 'd3-transition'

import type { HSankey } from '@/charts/builder/compile'
import type { HierState } from '@/charts/builder/hierarchyDraw'
import type { ChartTheme } from '@/charts/types'
import { tooltip } from '@/services/tooltip'
import { prettyText } from '@/services/typography'

type G = Selection<SVGGElement, unknown, null, undefined>
interface LinkGeo { sx: number; a0: number; b0: number; h: number }
interface NodeGeo { y: number; h: number }

const TWEEN_MS = 380
const GAP = 6
const NODE_W = 12
const mix = (a: number, b: number, u: number) => a + (b - a) * u
const clip = (t: string, n = 20) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
const r1 = (v: number) => Math.round(v * 10) / 10

export function zoomableSankey(body: G, sk: HSankey, T: ChartTheme, state: HierState, idx: number): void {
  const { w, h } = sk
  const lw = Math.min(140, Math.max(...sk.from.map((n) => n.name.length), 1) * 6.4 + 10)
  const rw = Math.min(140, Math.max(...sk.to.map((n) => n.name.length), 1) * 6.4 + 10)
  const xL = lw
  const xR = w - rw - 12
  const sx = xL + NODE_W
  const mid = (sx + xR) / 2
  const y0 = 28 // room for the "showing only" line, kept in both views so nothing jumps
  const y1 = h - 12
  let prevLinks: Map<string, LinkGeo> | undefined
  let prevNodes: Map<string, NodeGeo> | undefined

  const parse = (): { side: 'from' | 'to'; name: string } | null => {
    const raw = state[idx]?.[0]
    if (!raw) return null
    const side = raw.startsWith('from:') ? 'from' : raw.startsWith('to:') ? 'to' : null
    const name = side ? raw.slice(side.length + 1) : ''
    return side && (side === 'from' ? sk.from : sk.to).some((n) => n.name === name) ? { side, name } : null
  }

  const pathOf = (g: LinkGeo) => {
    const { a0, b0, h: th } = g
    return `M${r1(sx)} ${r1(a0)}C${r1(mid)} ${r1(a0)} ${r1(mid)} ${r1(b0)} ${r1(xR)} ${r1(b0)}L${r1(xR)} ${r1(b0 + th)}C${r1(mid)} ${r1(b0 + th)} ${r1(mid)} ${r1(a0 + th)} ${r1(sx)} ${r1(a0 + th)}Z`
  }

  const render = (animate: boolean) => {
    const focus = parse()
    if (!focus) state[idx] = []
    const flows = focus ? sk.flows.filter((f) => (focus.side === 'from' ? f.f === focus.name : f.t === focus.name)) : sk.flows
    const out = new Map<string, number>()
    const inn = new Map<string, number>()
    for (const f of flows) { out.set(f.f, (out.get(f.f) ?? 0) + f.v); inn.set(f.t, (inn.get(f.t) ?? 0) + f.v) }
    const L = sk.from.filter((n) => out.has(n.name)).sort((a, b) => out.get(b.name)! - out.get(a.name)!)
    const Rt = sk.to.filter((n) => inn.has(n.name)).sort((a, b) => inn.get(b.name)! - inn.get(a.name)!)
    const tot = flows.reduce((p, f) => p + f.v, 0) || 1
    const scale = (y1 - y0 - GAP * (Math.max(L.length, Rt.length) - 1)) / tot
    const place = (nodes: { name: string }[], totals: Map<string, number>) => {
      const m = new Map<string, number>()
      let y = y0
      for (const n of nodes) { m.set(n.name, y); y += totals.get(n.name)! * scale + GAP }
      return m
    }
    const ly = place(L, out)
    const ry = place(Rt, inn)
    const lc = new Map<string, number>()
    const rc = new Map<string, number>()
    const li = (n: string) => L.findIndex((x) => x.name === n)
    const ri = (n: string) => Rt.findIndex((x) => x.name === n)
    const links = flows.slice().sort((p, c) => li(p.f) - li(c.f) || ri(p.t) - ri(c.t)).map((f) => {
      const th = f.v * scale
      const geo: LinkGeo = { sx, a0: ly.get(f.f)! + (lc.get(f.f) ?? 0), b0: ry.get(f.t)! + (rc.get(f.t) ?? 0), h: th }
      lc.set(f.f, (lc.get(f.f) ?? 0) + th)
      rc.set(f.t, (rc.get(f.t) ?? 0) + th)
      return { f, geo, k: `${f.f}\u0001${f.t}`, color: sk.from.find((n) => n.name === f.f)!.color }
    })
    const nodes = [
      ...L.map((n) => ({ n, side: 'from' as const, k: `from:${n.name}`, y: ly.get(n.name)!, th: Math.max(1, out.get(n.name)! * scale) })),
      ...Rt.map((n) => ({ n, side: 'to' as const, k: `to:${n.name}`, y: ry.get(n.name)!, th: Math.max(1, inn.get(n.name)! * scale) })),
    ]
    const beforeL = prevLinks
    const beforeN = prevNodes
    prevLinks = new Map(links.map((l) => [l.k, l.geo]))
    prevNodes = new Map(nodes.map((q) => [q.k, { y: q.y, h: q.th }]))
    const go = (to: string | null) => { state[idx] = to ? [to] : []; tooltip.hide(); render(true) }

    body.selectAll('*').remove()
    const hy = sk.small ? 24 : 12 // below a small-multiples panel title
    if (focus) {
      body.append('text').attr('x', 0).attr('y', hy).attr('fill', T.ink).attr('font-weight', 600).style('cursor', 'zoom-out').on('click', () => go(null))
        .text(prettyText(`‹ Only flows ${focus.side === 'from' ? 'from' : 'to'} ${clip(focus.name, 28)}`))
        .append('tspan').attr('font-weight', 400).attr('fill', T.mute).text(prettyText('  · click to show all'))
    } else {
      body.append('text').attr('x', 0).attr('y', hy).attr('fill', T.mute).style('pointer-events', 'none').text(prettyText('Click a node to show only its flows'))
    }

    const linkSel = body.append('g').selectAll<SVGPathElement, (typeof links)[number]>('path').data(links).join('path')
      .attr('d', (l) => pathOf(l.geo)).attr('fill', (l) => l.color).attr('opacity', 0.42).attr('data-t', (l) => l.f.tip)
    const nodeG = body.append('g').selectAll<SVGGElement, (typeof nodes)[number]>('g').data(nodes).join('g')
      .attr('data-t', (q) => q.n.tip).style('cursor', 'pointer')
      .on('click', (_e, q) => go(focus && focus.side === q.side && focus.name === q.n.name ? null : `${q.side}:${q.n.name}`))
    const rectSel = nodeG.append('rect').attr('x', (q) => (q.side === 'from' ? xL : xR)).attr('width', NODE_W).attr('rx', 2).attr('fill', (q) => q.n.color)
      .attr('y', (q) => q.y).attr('height', (q) => q.th)
      .attr('stroke', (q) => (focus && focus.side === q.side && focus.name === q.n.name ? T.ink : 'none')).attr('stroke-width', 1.5)
    const texts = nodeG.append('text').attr('fill', T.ink).attr('font-size', T.fs).attr('text-anchor', (q) => (q.side === 'from' ? 'end' : 'start'))
      .attr('x', (q) => (q.side === 'from' ? xL - 6 : xR + NODE_W + 6)).attr('y', (q) => q.y + q.th / 2 + 4).text(prettyText((q) => clip(q.n.name)))

    if (animate) {
      linkSel.attr('opacity', (l) => (beforeL?.has(l.k) ? 0.42 : 0)).transition().duration(TWEEN_MS).attr('opacity', 0.42)
        .attrTween('d', (l) => {
          const from = beforeL?.get(l.k) ?? l.geo
          return (u: number) => pathOf({ sx, a0: mix(from.a0, l.geo.a0, u), b0: mix(from.b0, l.geo.b0, u), h: mix(from.h, l.geo.h, u) })
        })
      rectSel.transition().duration(TWEEN_MS).attrTween('y', (q) => { const f = beforeN?.get(q.k)?.y ?? q.y; return (u: number) => String(mix(f, q.y, u)) })
        .attrTween('height', (q) => { const f = beforeN?.get(q.k)?.h ?? q.th; return (u: number) => String(mix(f, q.th, u)) })
      texts.attr('opacity', 0).transition().delay(TWEEN_MS * 0.6).duration(160).attr('opacity', 1)
    }
  }
  render(false)
}
