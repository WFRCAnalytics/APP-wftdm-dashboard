// Calibration fingerprint, Radar (project-docs/redesign/04-chart-catalogue.md section 9). Hand-rolled polar geometry in D3
// selections: one axis per submodel, rings at thirds of the max, a dashed tolerance polygon at 3%, up to six series, a
// 26px hit line per axis for the tooltip.
import { select } from 'd3-selection'
import { attachPanZoom } from '@/charts/lib/panZoom'

import {
  axisAngle,
  errorsFrom,
  labelAnchor,
  MAX_SERIES,
  polar,
  radarMax,
  ringValues,
  status,
  STATUS_LABEL,
  statusVar,
  SUBMODELS,
  TOLERANCE,
  type Status,
} from '@/charts/lib/fingerprint'
import type { ChartKind, LegendSpec } from '@/charts/types'
import { emptyNote, f1 } from '@/charts/util'
import { tooltip } from '@/services/tooltip'

const TABLE = 'calibration_errors'
const NS = 'http://www.w3.org/2000/svg'

const kind: ChartKind = {
  tables: () => [TABLE],
  draw(el, env) {
    const { theme: t } = env
    const series = env.scenarios
      .slice(0, MAX_SERIES)
      .map((s) => ({ s, e: errorsFrom(env.data.rows(s.run, TABLE)) }))
      .filter((x): x is { s: (typeof env.scenarios)[number]; e: number[] } => x.e !== null)
    if (series.length === 0) {
      emptyNote(el, 'No calibration results for this selection.')
      return { label: `${env.config.title}: no calibration results` }
    }
    const style = getComputedStyle(el)
    const css = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    const statusColor: Record<Status, string> = { ok: css('--ok', '#167a4a'), warn: css('--warn', '#95600f'), fail: css('--fail', '#d13e3b') }

    const n = SUBMODELS.length
    const w = env.width
    const h = env.height
    const max = radarMax(series.flatMap((x) => x.e))
    const R = Math.min(w, h) / 2 - 56
    const cx = w / 2
    const cy = h / 2 + 4
    const pt = (i: number, v: number) => polar(cx, cy, R, max, i, n, v)
    const ring = (v: number) => Array.from({ length: n }, (_, i) => pt(i, v).join(',')).join(' ')
    const multi = series.length > 1
    const colors = series.map((x) => (multi ? x.s.color : t.tokens.c1))

    const svg = select(document.createElementNS(NS, 'svg'))
      .attr('width', w)
      .attr('height', h)
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('role', 'presentation')
      .style('overflow', 'visible')
      .style('font-family', t.font)
      .style('font-size', `${t.fs}px`)

    ringValues(max).forEach((v) => svg.append('polygon').attr('points', ring(v)).attr('fill', 'none').attr('stroke', t.grid))
    svg
      .append('polygon')
      .attr('points', ring(TOLERANCE))
      .attr('fill', statusColor.ok)
      .attr('fill-opacity', 0.08)
      .attr('stroke', statusColor.ok)
      .attr('stroke-dasharray', '4 3')
      .attr('stroke-opacity', 0.8)
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, max)
      svg.append('line').attr('x1', cx).attr('y1', cy).attr('x2', x).attr('y2', y).attr('stroke', t.grid)
    }

    series.forEach((x, si) => {
      svg
        .append('polygon')
        .attr('points', x.e.map((e, i) => pt(i, e).join(',')).join(' '))
        .attr('fill', colors[si])
        .attr('fill-opacity', multi ? 0.12 : 0.22)
        .attr('stroke', colors[si])
        .attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round')
      x.e.forEach((e, i) => {
        const [px, py] = pt(i, e)
        svg
          .append('circle')
          .attr('cx', px)
          .attr('cy', py)
          .attr('r', multi ? 3 + (series.length - 1 - si) * 2.5 : 5)
          .attr('fill', multi ? colors[si] : statusColor[status(e)])
          .attr('stroke', t.surface)
          .attr('stroke-width', 2)
          .style('pointer-events', 'none')
      })
    })

    SUBMODELS.forEach((d, i) => {
      const [lx, ly] = pt(i, max + 1.15)
      const st0 = status(series[0].e[i])
      svg
        .append('text')
        .attr('x', lx)
        .attr('y', ly)
        .attr('dy', '.35em')
        .attr('text-anchor', labelAnchor(Math.cos(axisAngle(i, n))))
        .attr('fill', st0 === 'ok' ? t.mute : statusColor[st0])
        .attr('font-weight', st0 === 'ok' ? 400 : 600)
        .style('pointer-events', 'none')
        .text(d.short)
      const [ex, ey] = pt(i, max)
      svg
        .append('line')
        .attr('x1', cx)
        .attr('y1', cy)
        .attr('x2', ex)
        .attr('y2', ey)
        .attr('stroke', 'transparent')
        .attr('stroke-width', 26)
        .attr('data-axis', d.short)
        .on('mousemove', (e: MouseEvent) =>
          tooltip.show(
            {
              title: d.name,
              sub: d.measure,
              rows: series.map((x, si) => {
                const st = status(x.e[i])
                return {
                  k: multi ? x.s.label : 'Worst-segment error',
                  v: `${f1(x.e[i])}%`,
                  c: multi ? colors[si] : undefined,
                  b: si === 0,
                  d: st === 'ok' ? 'within 3%' : STATUS_LABEL[st].toLowerCase(),
                  dc: statusVar(st),
                }
              }),
            },
            e,
          ),
        )
        .on('mouseleave', () => tooltip.hide())
    })

    ringValues(max).forEach((v) => {
      const a0 = axisAngle(0, n) + Math.PI / n
      const px = cx + Math.cos(a0) * ((v / max) * R)
      const py = cy + Math.sin(a0) * ((v / max) * R)
      svg.append('text').attr('x', px + 3).attr('y', py - 2).attr('fill', t.mute).attr('font-size', 10.5).style('pointer-events', 'none').text(`${v}%`)
    })

    el.replaceChildren(svg.node() as SVGSVGElement)
    attachPanZoom(svg.node() as SVGSVGElement, w, h, { wheel: 'modifier' })

    const legend: LegendSpec = {
      items: [
        ...series.map((x) => ({ label: x.s.label, color: colors[series.indexOf(x)], run: x.s.run })),
        { label: `${TOLERANCE}% tolerance`, dash: true },
      ],
    }
    const worst = series[0].e.reduce((a, b) => Math.max(a, b), 0)
    return {
      legend,
      label: `Calibration fingerprint, worst-segment error per submodel for ${series.map((x) => x.s.label).join(', ')}; the largest is ${f1(worst)}%`,
    }
  },
}

export default kind
