// District flows, Chord (project-docs/redesign/04-chart-catalogue.md section 14). D3 chord of the district-to-district
// matrix with trips that stay inside a district left out; hovering a district dims every ribbon that does not touch it.
// The focus scenario alone: Change / % change keep showing values.
import { chord as d3chord, ribbon as d3ribbon, type Chord, type ChordGroup } from 'd3-chord'
import { descending } from 'd3-array'
import { select } from 'd3-selection'
import { attachPanZoom } from '@/charts/lib/panZoom'
import { arc as d3arc } from 'd3-shape'

import { districtMatrix, districtTotals, withoutIntra } from '@/charts/lib/flows'
import { fmtTrips } from '@/charts/lib/hierarchy'
import type { ChartKind } from '@/charts/types'
import { emptyNote } from '@/charts/util'
import { DISTRICTS } from '@/charts/vocab'
import { tooltip } from '@/services/tooltip'

const kind: ChartKind = {
  tables: () => ['od_district'],
  draw(el, env) {
    const run = env.pinned ? env.scenarios[0]?.run : (env.focus?.run ?? env.scenarios[0]?.run)
    const full = run ? districtMatrix(env.data.rows(run, 'od_district')) : null
    const f = full ? withoutIntra(full) : null
    if (!f || f.every((r) => r.every((v) => v <= 0))) {
      emptyNote(el, `No district flows for ${env.focus?.label ?? 'this scenario'} in ${env.year}.`)
      return { label: `${env.config.title}: no data` }
    }
    const t = env.theme
    const w = env.width
    const h = env.height
    const R = Math.max(30, Math.min(w, h) / 2 - 58)
    const cols = DISTRICTS.map((_, i) => t.cat(i))

    const ch = d3chord().padAngle(0.05).sortSubgroups(descending)(f)
    el.replaceChildren()
    const svg = select(el)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .style('display', 'block')
      .style('overflow', 'visible')
      .style('font-family', t.font)
      .style('font-size', '12px')
    const gg = svg.append('g').attr('transform', `translate(${w / 2},${h / 2})`)

    const rib = gg
      .append('g')
      .selectAll<SVGPathElement, Chord>('path')
      .data(ch)
      .join('path')
      .attr('d', d3ribbon<Chord, { index: number }>().radius(R - 3) as never)
      .attr('fill', (d) => cols[d.source.index])
      .attr('fill-opacity', 0.55)
      .attr('stroke', t.surface)
      .attr('stroke-width', 0.6)

    const arcs = gg.append('g').selectAll<SVGGElement, ChordGroup>('g').data(ch.groups).join('g')
    arcs
      .append('path')
      .attr('d', d3arc<ChordGroup>().innerRadius(R).outerRadius(R + 10).cornerRadius(3) as never)
      .attr('fill', (d) => cols[d.index])
    arcs
      .append('text')
      .each((d) => ((d as ChordGroup & { angle: number }).angle = (d.startAngle + d.endAngle) / 2))
      .attr('dy', '.35em')
      .attr('transform', (d) => {
        const a = (d as ChordGroup & { angle: number }).angle
        return `rotate(${(a * 180) / Math.PI - 90}) translate(${R + 20}) ${a > Math.PI ? 'rotate(180)' : ''}`
      })
      .attr('text-anchor', (d) => ((d as ChordGroup & { angle: number }).angle > Math.PI ? 'end' : null))
      .attr('fill', t.ink)
      .attr('font-weight', 500)
      .style('pointer-events', 'none')
      .text((d) => DISTRICTS[d.index])

    const isolate = (i: number | null) =>
      rib.attr('fill-opacity', (d) => (i === null || d.source.index === i || d.target.index === i ? (i === null ? 0.55 : 0.8) : 0.08))
    arcs
      .on('mouseenter', (_e, d) => isolate(d.index))
      .on('mousemove', (e: MouseEvent, d) => {
        const { out, into } = districtTotals(f, d.index)
        tooltip.show(
          {
            title: DISTRICTS[d.index],
            swatch: cols[d.index],
            sub: 'between districts',
            rows: [
              { k: 'Trips out', v: fmtTrips(out), b: true, c: cols[d.index] },
              { k: 'Trips in', v: fmtTrips(into) },
            ],
          },
          e,
        )
      })
      .on('mouseleave', () => {
        isolate(null)
        tooltip.hide()
      })
    rib
      .on('mousemove', (e: MouseEvent, d) => {
        const s = d.source.index
        const tg = d.target.index
        tooltip.show(
          {
            title: `${DISTRICTS[s]} → ${DISTRICTS[tg]}`,
            rows: [
              { k: 'Daily trips', v: fmtTrips(f[s][tg]), b: true, c: cols[s] },
              { k: 'In return', v: fmtTrips(f[tg][s]) },
            ],
          },
          e,
        )
      })
      .on('mouseleave', () => tooltip.hide())

    attachPanZoom(svg.node() as SVGSVGElement, w, h, { wheel: 'modifier' })
    return { label: `Daily trips between districts, ${env.focus?.label ?? env.scenarios[0]?.label ?? ''}, ${env.year}. Trips inside one district are left out.` }
  },
}

export default kind
