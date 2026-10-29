// Mode share, Radar: one axis per mode, one polygon per scenario, so the shape of a scenario's mode mix reads at a glance
// and two scenarios can be laid over each other. The reference (when it is not itself a plotted scenario) is a dashed
// ink outline. Shares are the same numbers as the bars and the table.
import { select } from 'd3-selection'

import { axisAngle, labelAnchor, MAX_SERIES, polar } from '@/charts/lib/fingerprint'
import { modeShare } from '@/charts/lib/modeShare'
import type { ChartKind, LegendSpec } from '@/charts/types'
import { emptyNote, f1 } from '@/charts/util'
import { MODES } from '@/charts/vocab'
import { tooltip } from '@/services/tooltip'
import { prettyText } from '@/services/typography'

const NS = 'http://www.w3.org/2000/svg'

/** Outer ring value: the largest share rounded up to a multiple of 10 (never under 20). */
const ringMax = (vals: readonly number[]): number => Math.max(20, Math.ceil(Math.max(0, ...vals) / 10) * 10)

const kind: ChartKind = {
  tables: () => ['trip_mode_share'],
  draw(el, env) {
    const { theme: t } = env
    const series = env.scenarios.slice(0, MAX_SERIES).map((s) => ({ s, v: modeShare(env, s.run) }))
    if (series.length === 0 || series.every((x) => x.v.every((v) => v === 0))) {
      emptyNote(el, 'No mode share for this selection.')
      return { label: `${env.config.title ?? 'Mode share'}: no data` }
    }
    const refRun = env.reference.kind === 'self-base-year' ? undefined : env.reference.run
    const ref = refRun && !series.some((x) => x.s.run === refRun) ? modeShare(env, refRun) : null

    const n = MODES.length
    const w = env.width
    const h = env.height
    const max = ringMax([...series.flatMap((x) => x.v), ...(ref ?? [])])
    const R = Math.min(w / 2 - 74, h / 2 - 44)
    const cx = w / 2
    const cy = h / 2 + 4
    const pt = (i: number, v: number) => polar(cx, cy, R, max, i, n, v)
    const ring = (v: number) => Array.from({ length: n }, (_, i) => pt(i, v).join(',')).join(' ')
    const multi = series.length > 1
    const colors = series.map((x) => (multi ? x.s.color : t.tokens.c1))
    const rings = [1, 2, 3].map((q) => Math.round((max * q) / 3))

    const svg = select(document.createElementNS(NS, 'svg'))
      .attr('width', w)
      .attr('height', h)
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('role', 'presentation')
      .style('overflow', 'visible')
      .style('font-family', t.font)
      .style('font-size', `${t.fs}px`)

    rings.forEach((v) => svg.append('polygon').attr('points', ring(v)).attr('fill', 'none').attr('stroke', t.grid))
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, max)
      svg.append('line').attr('x1', cx).attr('y1', cy).attr('x2', x).attr('y2', y).attr('stroke', t.grid)
    }
    if (ref) {
      svg
        .append('polygon')
        .attr('points', ref.map((v, i) => pt(i, v).join(',')).join(' '))
        .attr('fill', 'none')
        .attr('stroke', t.ink)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '5 4')
        .attr('stroke-linejoin', 'round')
    }
    series.forEach((x, si) => {
      svg
        .append('polygon')
        .attr('points', x.v.map((v, i) => pt(i, v).join(',')).join(' '))
        .attr('fill', colors[si])
        .attr('fill-opacity', multi ? 0.12 : 0.22)
        .attr('stroke', colors[si])
        .attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round')
      x.v.forEach((v, i) => {
        const [px, py] = pt(i, v)
        svg.append('circle').attr('cx', px).attr('cy', py).attr('r', series.length > 1 ? 3 + (series.length - 1 - si) * 2.5 : 4).attr('fill', colors[si]).attr('stroke', t.surface).attr('stroke-width', 2).style('pointer-events', 'none')
      })
    })

    MODES.forEach((mode, i) => {
      const [lx, ly] = pt(i, max * 1.12)
      svg
        .append('text')
        .attr('x', lx)
        .attr('y', ly)
        .attr('dy', '.35em')
        .attr('text-anchor', labelAnchor(Math.cos(axisAngle(i, n))))
        .attr('fill', t.mute)
        .style('pointer-events', 'none')
        .text(prettyText(mode))
      const [ex, ey] = pt(i, max)
      svg
        .append('line')
        .attr('x1', cx)
        .attr('y1', cy)
        .attr('x2', ex)
        .attr('y2', ey)
        .attr('stroke', 'transparent')
        .attr('stroke-width', 26)
        .attr('data-axis', mode)
        .on('mousemove', (e: MouseEvent) =>
          tooltip.show(
            {
              title: mode,
              sub: 'Share of daily trips',
              rows: [
                ...series.map((x, si) => ({ k: multi ? x.s.label : 'Share', v: `${f1(x.v[i])}%`, c: multi ? colors[si] : undefined, b: si === 0 })),
                ...(ref ? [{ k: `Reference: ${env.reference.label}`, v: `${f1(ref[i])}%` }] : []),
              ],
            },
            e,
          ),
        )
        .on('mouseleave', () => tooltip.hide())
    })

    rings.forEach((v) => {
      const a0 = axisAngle(0, n) + Math.PI / n
      svg.append('text').attr('x', cx + Math.cos(a0) * ((v / max) * R) + 3).attr('y', cy + Math.sin(a0) * ((v / max) * R) - 2).attr('fill', t.mute).attr('font-size', 10.5).style('pointer-events', 'none').text(prettyText(`${v}%`))
    })

    el.replaceChildren(svg.node() as SVGSVGElement)

    const legend: LegendSpec = {
      items: [...series.map((x, si) => ({ label: x.s.label, color: colors[si], run: x.s.run })), ...(ref ? [{ label: `Reference: ${env.reference.label}`, dash: true }] : [])],
    }
    return { legend, label: `Mode share radar for ${series.map((x) => x.s.label).join(', ')}` }
  },
}

export default kind
