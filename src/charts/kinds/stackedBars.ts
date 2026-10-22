// 100% stacked bars (catalogue section 3), hand-rolled D3 rects. One kind, four variants (`variant` on the view):
//   trips    purpose x mode, coloured by mode        income   income x mode, coloured by mode
//   auto     income x vehicles, the vehicle ramp     scenario one row per compared scenario x mode, reference first
import { select } from 'd3-selection'
import { scaleLinear } from 'd3-scale'

import { emptyNote, f1 } from '@/charts/util'
import { labelFits, ownsLegend, segmentLabel, segments, stackSpec, stackTables, stackVariant } from '@/charts/lib/modeShare'
import type { ChartKind, LegendSpec } from '@/charts/types'
import { wireModeHover } from '@/panels/crossHighlight'
import { tooltip } from '@/services/tooltip'

const kind: ChartKind = {
  tables: (plan) => stackTables(stackVariant((plan.config as { variant?: unknown }).variant)),
  draw(el, env) {
    const { theme: t, width: w, height: h } = env
    const variant = stackVariant((env.config as { variant?: unknown }).variant)
    const spec = stackSpec(env, variant)
    const rows = spec.rows.filter((r) => r.vals.some((v) => v > 0))
    if (rows.length === 0) {
      emptyNote(el, 'No data for this selection.')
      return { label: `${env.config.title ?? '100% bars'}: no data` }
    }
    const ml = spec.ml
    const n = rows.length
    const step = (h - 6) / n
    const bh = Math.min(38, step * 0.66)
    const x = scaleLinear([0, 100], [ml, w - 6])

    el.replaceChildren()
    const svg = select(el)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .style('display', 'block')
      .style('overflow', 'visible')
      .style('font-family', t.font)
      .style('font-size', '12px')

    for (const v of [25, 50, 75]) {
      svg.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', 0).attr('y2', h - 4).attr('stroke', t.grid)
    }

    rows.forEach((r, i) => {
      const yc = 3 + step * i + step / 2
      svg
        .append('text')
        .attr('x', ml - 12)
        .attr('y', yc)
        .attr('dy', '.35em')
        .attr('text-anchor', 'end')
        .attr('fill', t.ink)
        .text(r.label)
      for (const seg of segments(r.vals)) {
        const key = spec.keys[seg.j]
        const color = spec.colors[seg.j]
        const x0 = x(seg.from)
        const x1 = x(seg.from + seg.pc)
        const title = `${r.label} · ${key}`
        const g = svg
          .append('g')
          .attr('data-m', spec.isMode ? key : null)
          .attr('data-key', `${r.label}|${key}`)
          .attr('data-title', title)
          .attr('data-val', `${f1(seg.pc)}%`)
          .attr('data-num', seg.pc)
          .attr('data-unit', ' pts')
        g.append('rect')
          .attr('x', x0)
          .attr('y', yc - bh / 2)
          .attr('width', Math.max(0, x1 - x0 - 2))
          .attr('height', bh)
          .attr('rx', 5)
          .attr('fill', color)
        if (labelFits(x1 - x0)) {
          g.append('text')
            .attr('x', (x0 + x1) / 2 - 1)
            .attr('y', yc)
            .attr('dy', '.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', t.onColor(color))
            .attr('font-weight', 500)
            .style('pointer-events', 'none')
            .text(segmentLabel(seg.pc))
        }
        g.on('mousemove', (e: MouseEvent) =>
          tooltip.show({ title, rows: [{ k: 'Share', v: `${f1(seg.pc)}%`, b: true, c: color }, { k: `Of: ${spec.of}`, v: '' }] }, e),
        ).on('mouseleave', () => tooltip.hide())
      }
    })

    const node = svg.node() as SVGSVGElement
    if (spec.isMode) wireModeHover(node)

    // The legend row: modes cross-highlight everywhere; vehicles are plain chips
    const legend: LegendSpec = {
      items: spec.keys.map((k, j) => (spec.isMode ? { label: k, color: spec.colors[j], mode: k } : { label: k, color: spec.colors[j] })),
    }
    const what = variant === 'trips' ? 'Trips by purpose and mode' : variant === 'income' ? 'Trips by income and mode' : variant === 'auto' ? 'Households by income and vehicles' : 'Mode share by scenario'
    return { legend: ownsLegend(el) ? legend : undefined, label: `${what}, 100% bars, ${env.year}` }
  },
}

export default kind
