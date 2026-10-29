// Sankey: purpose > mode > distance (project-docs/redesign/04-chart-catalogue.md section 8). D3 + d3-sankey. Links are
// coloured by mode; hovering a link or mode node cross-highlights the mode everywhere. Always the focus scenario alone
// (never a union), so Change / % change keep showing values. Click a node to keep only the flows through it (re-laid out
// over the full height, tweened); click it again, or the line above, to show all. The last column's labels sit on its inner
// side, so they never run past the chart's edge.
import { select } from 'd3-selection'
import { attachPanZoom } from '@/charts/lib/panZoom'
import { sankey as d3sankey, type SankeyLink as DLink, type SankeyNode as DNode } from 'd3-sankey'
import 'd3-transition'

import { buildSankey, showNodeLabel, type SankeyLink, type SankeyNode } from '@/charts/lib/flows'
import { fmtTrips } from '@/charts/lib/hierarchy'
import type { ChartKind } from '@/charts/types'
import { emptyNote, f1 } from '@/charts/util'
import { MODES } from '@/charts/vocab'
import { wireModeHover } from '@/panels/crossHighlight'
import { tooltip } from '@/services/tooltip'
import { prettyText } from '@/services/typography'

type N = DNode<SankeyNode, SankeyLink>
type L = DLink<SankeyNode, SankeyLink>
/** One band's ends, so a refocus can tween every one of them. */
interface LinkGeo { x0: number; x1: number; y0: number; y1: number; w: number }
interface NodeGeo { y0: number; y1: number }

const TWEEN_MS = 380
const TOP = 26 // the hint line, kept in both views so nothing jumps
const mix = (a: number, b: number, u: number) => a + (b - a) * u

const kind: ChartKind = {
  tables: () => ['purpose_mode_distance_flow'],
  draw(el, env) {
    const run = env.pinned ? env.scenarios[0]?.run : (env.focus?.run ?? env.scenarios[0]?.run)
    const g = run ? buildSankey(env.data.rows(run, 'purpose_mode_distance_flow')) : null
    if (!run || !g || g.links.length === 0) {
      emptyNote(el, `No data for ${env.focus?.label ?? 'this scenario'} in ${env.year}.`)
      return { label: `${env.config.title}: no data` }
    }
    const t = env.theme
    const w = env.width
    const h = env.height
    const neutral = t.mix(t.surface, t.ink, 0.5)

    // The node in focus (an id), kept in the chart's state so a redraw (resize, theme) keeps it.
    const st = env.state as { focus?: string | null; prev?: { links: Map<string, LinkGeo>; nodes: Map<string, NodeGeo> } }
    if (st.focus && !g.nodes.some((n) => n.id === st.focus)) st.focus = null
    // a redraw must not animate: only a click does
    st.prev = undefined

    /** The links a node's flows run through: everything downstream of it and everything upstream of it. */
    const keep = (focus: string | null | undefined): SankeyLink[] => {
      if (!focus) return g.links
      const down = new Set([focus])
      const up = new Set([focus])
      for (let again = true; again; ) {
        again = false
        for (const l of g.links) {
          if (down.has(l.source) && !down.has(l.target)) {
            down.add(l.target)
            again = true
          }
          if (up.has(l.target) && !up.has(l.source)) {
            up.add(l.source)
            again = true
          }
        }
      }
      return g.links.filter((l) => (down.has(l.source) && down.has(l.target)) || (up.has(l.source) && up.has(l.target)))
    }

    el.replaceChildren()
    const svg = select(el)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .style('display', 'block')
      .style('overflow', 'visible')
      .style('font-family', t.font)
      .style('font-size', '12px')
    const body = svg.append('g')

    function render(animate: boolean): void {
      tooltip.hide()
      const focus = st.focus ?? null
      const links = keep(focus)
      const used = new Set(links.flatMap((l) => [l.source, l.target]))
      const layout = d3sankey<SankeyNode, SankeyLink>()
        .nodeId((d) => d.id)
        .nodeWidth(12)
        .nodePadding(10)
        .nodeSort(null)
        .extent([
          [2, TOP],
          [w - 2, h - 6],
        ])
      const graph = layout({ nodes: g!.nodes.filter((n) => used.has(n.id)).map((d) => ({ ...d })), links: links.map((d) => ({ ...d })) })
      const maxDepth = Math.max(...(graph.nodes as N[]).map((d) => d.depth ?? 0))
      const inner = (d: N) => d.depth === maxDepth && maxDepth > 0
      const nodeKey = (d: N) => d.id
      const linkKey = (d: L) => `${(d.source as N).id}\u0001${(d.target as N).id}`
      const linkGeo = (d: L): LinkGeo => ({ x0: (d.source as N).x1 ?? 0, x1: (d.target as N).x0 ?? 0, y0: d.y0 ?? 0, y1: d.y1 ?? 0, w: Math.max(1, d.width ?? 0) })
      const pathOf = (q: LinkGeo) => {
        const m = (q.x0 + q.x1) / 2
        return `M${q.x0},${q.y0}C${m},${q.y0} ${m},${q.y1} ${q.x1},${q.y1}`
      }
      const before = st.prev
      st.prev = {
        links: new Map((graph.links as L[]).map((d) => [linkKey(d), linkGeo(d)])),
        nodes: new Map((graph.nodes as N[]).map((d) => [nodeKey(d), { y0: d.y0 ?? 0, y1: d.y1 ?? 0 }])),
      }

      body.selectAll('*').remove()
      const go = (id: string | null) => {
        st.focus = id
        render(true)
      }
      const focusName = focus ? g!.nodes.find((n) => n.id === focus)?.name : null
      if (focusName) {
        body
          .append('text')
          .attr('x', 2)
          .attr('y', 14)
          .attr('fill', t.ink)
          .attr('font-weight', 600)
          .style('cursor', 'zoom-out')
          .on('click', () => go(null))
          .text(prettyText(`‹ Only flows through ${focusName}`))
          .append('tspan')
          .attr('font-weight', 400)
          .attr('fill', t.mute)
          .text(prettyText('  · click to show all'))
      } else {
        body.append('text').attr('x', 2).attr('y', 14).attr('fill', t.mute).style('pointer-events', 'none').text(prettyText('Click a node to show only its flows'))
      }

      const linkSel = body
        .append('g')
        .attr('fill', 'none')
        .selectAll<SVGPathElement, L>('path')
        .data(graph.links as L[])
        .join('path')
        .attr('data-m', (d) => (d as unknown as SankeyLink).mode)
        .attr('d', (d) => pathOf(linkGeo(d)))
        .attr('stroke', (d) => t.mode((d as unknown as SankeyLink).mode))
        .attr('stroke-width', (d) => linkGeo(d).w)
        .attr('stroke-opacity', 0.4)
      linkSel
        .on('mousemove', (e: MouseEvent, d) => {
          const s = d.source as N
          const tg = d.target as N
          const mode = (d as unknown as SankeyLink).mode
          tooltip.show(
            {
              title: `${s.name} → ${tg.name}`,
              rows: [
                { k: 'Daily trips', v: fmtTrips(d.value), b: true, c: t.mode(mode) },
                { k: `Share of ${s.name.toLowerCase()}`, v: `${f1((d.value / (g!.totals.get(s.id) || 1)) * 100)}%` },
              ],
            },
            e,
          )
          linkSel.attr('stroke-opacity', (x) => (x === d ? 0.75 : 0.4))
        })
        .on('mouseleave', () => {
          tooltip.hide()
          linkSel.attr('stroke-opacity', 0.4)
        })

      const nodeSel = body
        .append('g')
        .selectAll<SVGGElement, N>('g')
        .data(graph.nodes as N[])
        .join('g')
        .style('cursor', 'pointer')
        .on('click', (_e: MouseEvent, d) => go(focus === d.id ? null : d.id))
      const rects = nodeSel
        .append('rect')
        .attr('x', (d) => d.x0 ?? 0)
        .attr('y', (d) => d.y0 ?? 0)
        .attr('width', (d) => (d.x1 ?? 0) - (d.x0 ?? 0))
        .attr('height', (d) => Math.max(1, (d.y1 ?? 0) - (d.y0 ?? 0)))
        .attr('rx', 3)
        .attr('fill', (d) => (d.mode ? t.mode(d.mode) : neutral))
        .attr('stroke', (d) => (focus === d.id ? t.ink : 'none'))
        .attr('stroke-width', 1.5)
        .attr('data-m', (d) => d.mode ?? null)
        .on('mousemove', (e: MouseEvent, d) => {
          const total = g!.totals.get(d.id) ?? 0
          tooltip.show(
            {
              title: d.name,
              rows: [{ k: 'Daily trips', v: fmtTrips(total), b: true, c: d.mode ? t.mode(d.mode) : undefined }],
              foot: focus === d.id ? 'Click to show all' : 'Click to show only its flows',
            },
            e,
          )
        })
        .on('mouseleave', () => tooltip.hide())
      const labels = nodeSel
        .append('text')
        .attr('x', (d) => (inner(d) ? (d.x0 ?? 0) - 7 : (d.x1 ?? 0) + 7))
        .attr('y', (d) => ((d.y0 ?? 0) + (d.y1 ?? 0)) / 2)
        .attr('dy', '.35em')
        .attr('text-anchor', (d) => (inner(d) ? 'end' : 'start'))
        .attr('fill', t.ink)
        .attr('stroke', t.surface)
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .attr('font-weight', 500)
        .style('pointer-events', 'none')
        .text(prettyText((d) => (showNodeLabel((d.y1 ?? 0) - (d.y0 ?? 0)) ? d.name : '')))

      if (animate && before) {
        linkSel
          .attr('stroke-opacity', (d) => (before.links.has(linkKey(d)) ? 0.4 : 0))
          .transition()
          .duration(TWEEN_MS)
          .attr('stroke-opacity', 0.4)
          .attrTween('d', (d) => {
            const to = linkGeo(d)
            const from = before.links.get(linkKey(d)) ?? to
            return (u: number) => pathOf({ x0: to.x0, x1: to.x1, y0: mix(from.y0, to.y0, u), y1: mix(from.y1, to.y1, u), w: 0 })
          })
          .attrTween('stroke-width', (d) => {
            const to = linkGeo(d)
            const from = before.links.get(linkKey(d)) ?? to
            return (u: number) => String(mix(from.w, to.w, u))
          })
        rects
          .transition()
          .duration(TWEEN_MS)
          .attrTween('y', (d) => {
            const f = before.nodes.get(nodeKey(d))?.y0 ?? (d.y0 ?? 0)
            return (u: number) => String(mix(f, d.y0 ?? 0, u))
          })
          .attrTween('height', (d) => {
            const prev = before.nodes.get(nodeKey(d))
            const f = prev ? prev.y1 - prev.y0 : (d.y1 ?? 0) - (d.y0 ?? 0)
            return (u: number) => String(Math.max(1, mix(f, (d.y1 ?? 0) - (d.y0 ?? 0), u)))
          })
        labels.attr('opacity', 0).transition().delay(TWEEN_MS * 0.6).duration(160).attr('opacity', 1)
      }
      wireModeHover(body.node() as Element)
    }
    render(false)
    attachPanZoom(svg.node() as SVGSVGElement, w, h, { wheel: 'modifier' }, body.node() as SVGGElement)
    return {
      legend: { items: MODES.map((m) => ({ label: m, color: t.mode(m), mode: m })) },
      label: `Daily trips from purpose to mode to distance, ${env.focus?.label ?? env.scenarios[0]?.label ?? ''}, ${env.year}`,
    }
  },
}

export default kind
