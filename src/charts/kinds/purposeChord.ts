// Purpose to mode, Chord: the same daily trips as the Sankey on a ring. Purposes sit on one side, modes on the other, and a
// ribbon joins each purpose to a mode in that mode's colour. Hovering an arc isolates its ribbons. The focus scenario alone,
// like the Sankey, so Change / % change keep showing values.
import { chordDirected, ribbonArrow } from 'd3-chord'
import { descending } from 'd3-array'
import { select } from 'd3-selection'
import { arc as d3arc } from 'd3-shape'

import { fmtTrips } from '@/charts/lib/hierarchy'
import type { ChartKind } from '@/charts/types'
import { emptyNote, num, str } from '@/charts/util'
import { MODES, PURPOSES } from '@/charts/vocab'
import { tooltip } from '@/services/tooltip'
import { prettyText } from '@/services/typography'

const kind: ChartKind = {
  tables: () => ['purpose_mode_flow'],
  draw(el, env) {
    const run = env.pinned ? env.scenarios[0]?.run : (env.focus?.run ?? env.scenarios[0]?.run)
    const rows = run ? env.data.rows(run, 'purpose_mode_flow') : []
    const np = PURPOSES.length
    const n = np + MODES.length
    // directed matrix: purpose i sends its trips to mode j (rows are sources, columns targets)
    const m = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (const r of rows) {
      const p = (PURPOSES as readonly string[]).indexOf(str(r, 'primary_purpose'))
      const k = (MODES as readonly string[]).indexOf(str(r, 'major_trip_mode'))
      const v = num(r, 'trips')
      if (p >= 0 && k >= 0 && Number.isFinite(v)) m[p][np + k] += v
    }
    if (m.every((row) => row.every((v) => v <= 0))) {
      emptyNote(el, `No data for ${env.focus?.label ?? 'this scenario'} in ${env.year}.`)
      return { label: `${env.config.title}: no data` }
    }
    const t = env.theme
    const w = env.width
    const h = env.height
    const R = Math.max(30, Math.min(w, h) / 2 - 84)
    const name = (i: number) => (i < np ? PURPOSES[i] : MODES[i - np])
    const col = (i: number) => (i < np ? t.neutral(i % 5) : t.mode(MODES[i - np]))

    const ch = chordDirected().padAngle(0.04).sortSubgroups(descending)(m)
    el.replaceChildren()
    const svg = select(el).append('svg').attr('width', w).attr('height', h).style('display', 'block').style('overflow', 'visible').style('font-family', t.font).style('font-size', '12px')
    const gg = svg.append('g').attr('transform', `translate(${w / 2},${h / 2})`)

    const rib = gg
      .append('g')
      .selectAll<SVGPathElement, (typeof ch)[number]>('path')
      .data(ch)
      .join('path')
      .attr('d', ribbonArrow().radius(R - 3).headRadius(0) as never)
      .attr('data-m', (d) => MODES[d.target.index - np] ?? null)
      .attr('fill', (d) => col(d.target.index))
      .attr('fill-opacity', 0.6)
      .attr('stroke', t.surface)
      .attr('stroke-width', 0.6)

    const arcs = gg.append('g').selectAll<SVGGElement, (typeof ch.groups)[number]>('g').data(ch.groups).join('g')
    arcs
      .append('path')
      .attr('d', d3arc<(typeof ch.groups)[number]>().innerRadius(R).outerRadius(R + 10).cornerRadius(3) as never)
      .attr('fill', (d) => col(d.index))
    arcs
      .append('text')
      .attr('dy', '.35em')
      .attr('transform', (d) => {
        const a = (d.startAngle + d.endAngle) / 2
        return `rotate(${(a * 180) / Math.PI - 90}) translate(${R + 20}) ${a > Math.PI ? 'rotate(180)' : ''}`
      })
      .attr('text-anchor', (d) => ((d.startAngle + d.endAngle) / 2 > Math.PI ? 'end' : null))
      .attr('fill', t.ink)
      .attr('font-weight', (d) => (d.index < np ? 400 : 500))
      .style('pointer-events', 'none')
      .text(prettyText((d) => (d.endAngle - d.startAngle > 0.16 ? name(d.index) : '')))

    const isolate = (i: number | null) =>
      rib.attr('fill-opacity', (d) => (i === null ? 0.6 : d.source.index === i || d.target.index === i ? 0.85 : 0.07))
    const total = (i: number) => (i < np ? m[i].reduce((a, b) => a + b, 0) : m.reduce((a, row) => a + row[i], 0))
    arcs
      .on('mouseenter', (_e, d) => isolate(d.index))
      .on('mousemove', (e: MouseEvent, d) =>
        tooltip.show({ title: name(d.index), swatch: col(d.index), sub: d.index < np ? 'Purpose' : 'Mode', rows: [{ k: 'Daily trips', v: fmtTrips(total(d.index)), b: true }] }, e),
      )
      .on('mouseleave', () => {
        isolate(null)
        tooltip.hide()
      })
    rib
      .on('mouseenter', (_e, d) => isolate(d.target.index))
      .on('mousemove', (e: MouseEvent, d) => {
        const p = d.source.index
        const k = d.target.index
        tooltip.show(
          {
            title: `${name(p)} → ${name(k)}`,
            rows: [
              { k: 'Daily trips', v: fmtTrips(m[p][k]), b: true, c: col(k) },
              { k: `Share of ${name(p).toLowerCase()} trips`, v: `${((m[p][k] / total(p)) * 100).toFixed(1)}%` },
            ],
          },
          e,
        )
      })
      .on('mouseleave', () => {
        isolate(null)
        tooltip.hide()
      })

    return {
      legend: { items: MODES.map((mo) => ({ label: mo, color: t.mode(mo), mode: mo })) },
      label: `Daily trips from purpose to mode, ${env.focus?.label ?? env.scenarios[0]?.label ?? ''}, ${env.year}`,
    }
  },
}

export default kind
