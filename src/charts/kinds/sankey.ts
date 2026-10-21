// Sankey: purpose > mode > distance (project-docs/redesign/04-chart-catalogue.md section 8). D3 + d3-sankey. Links are
// coloured by mode; hovering a link or mode node cross-highlights the mode everywhere. Always the focus scenario alone
// (never a union), so Change / % change keep showing values.
import { select } from 'd3-selection'
import { sankey as d3sankey, sankeyLinkHorizontal, type SankeyLink as DLink, type SankeyNode as DNode } from 'd3-sankey'

import { buildSankey, showNodeLabel, type SankeyLink, type SankeyNode } from '@/charts/lib/flows'
import { fmtTrips } from '@/charts/lib/hierarchy'
import type { ChartKind } from '@/charts/types'
import { emptyNote, f1 } from '@/charts/util'
import { MODES } from '@/charts/vocab'
import { wireModeHover } from '@/panels/crossHighlight'
import { tooltip } from '@/services/tooltip'

type N = DNode<SankeyNode, SankeyLink>
type L = DLink<SankeyNode, SankeyLink>

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

    const layout = d3sankey<SankeyNode, SankeyLink>()
      .nodeId((d) => d.id)
      .nodeWidth(12)
      .nodePadding(10)
      .nodeSort(null)
      .extent([
        [2, 6],
        [w - 2, h - 6],
      ])
    const graph = layout({ nodes: g.nodes.map((d) => ({ ...d })), links: g.links.map((d) => ({ ...d })) })

    el.replaceChildren()
    const svg = select(el)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .style('display', 'block')
      .style('overflow', 'visible')
      .style('font-family', t.font)
      .style('font-size', '12px')

    const links = svg
      .append('g')
      .attr('fill', 'none')
      .selectAll<SVGPathElement, L>('path')
      .data(graph.links as L[])
      .join('path')
      .attr('data-m', (d) => (d as unknown as SankeyLink).mode)
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (d) => t.mode((d as unknown as SankeyLink).mode))
      .attr('stroke-width', (d) => Math.max(1, d.width ?? 0))
      .attr('stroke-opacity', 0.4)
    links
      .on('mousemove', (e: MouseEvent, d) => {
        const s = d.source as N
        const tg = d.target as N
        const mode = (d as unknown as SankeyLink).mode
        tooltip.show(
          {
            title: `${s.name} → ${tg.name}`,
            rows: [
              { k: 'Daily trips', v: fmtTrips(d.value), b: true, c: t.mode(mode) },
              { k: `Share of ${s.name.toLowerCase()}`, v: `${f1((d.value / (g.totals.get(s.id) || 1)) * 100)}%` },
            ],
          },
          e,
        )
        links.attr('stroke-opacity', (x) => (x === d ? 0.75 : 0.4))
      })
      .on('mouseleave', () => {
        tooltip.hide()
        links.attr('stroke-opacity', 0.4)
      })

    const nodes = svg.append('g').selectAll<SVGGElement, N>('g').data(graph.nodes as N[]).join('g')
    nodes
      .append('rect')
      .attr('x', (d) => d.x0 ?? 0)
      .attr('y', (d) => d.y0 ?? 0)
      .attr('width', (d) => (d.x1 ?? 0) - (d.x0 ?? 0))
      .attr('height', (d) => Math.max(1, (d.y1 ?? 0) - (d.y0 ?? 0)))
      .attr('rx', 3)
      .attr('fill', (d) => (d.mode ? t.mode(d.mode) : neutral))
      .attr('data-m', (d) => d.mode ?? null)
      .on('mousemove', (e: MouseEvent, d) => {
        const total = g.totals.get(d.id) ?? 0
        tooltip.show({ title: d.name, rows: [{ k: 'Daily trips', v: fmtTrips(total), b: true, c: d.mode ? t.mode(d.mode) : undefined }] }, e)
      })
      .on('mouseleave', () => tooltip.hide())
    nodes
      .append('text')
      .attr('x', (d) => (d.depth === 2 ? (d.x0 ?? 0) - 7 : (d.x1 ?? 0) + 7))
      .attr('y', (d) => ((d.y0 ?? 0) + (d.y1 ?? 0)) / 2)
      .attr('dy', '.35em')
      .attr('text-anchor', (d) => (d.depth === 2 ? 'end' : 'start'))
      .attr('fill', t.ink)
      .attr('stroke', t.surface)
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .attr('font-weight', 500)
      .style('pointer-events', 'none')
      .text((d) => (showNodeLabel((d.y1 ?? 0) - (d.y0 ?? 0)) ? d.name : ''))

    wireModeHover(svg.node() as Element)
    return {
      legend: { items: MODES.map((m) => ({ label: m, color: t.mode(m), mode: m })) },
      label: `Daily trips from purpose to mode to distance, ${env.focus?.label ?? env.scenarios[0]?.label ?? ''}, ${env.year}`,
    }
  },
}

export default kind
