// Trip length distribution, Ridgeline (project-docs/redesign/04-chart-catalogue.md section 15). One overlapping ridge
// per purpose (share of trips per mile), the observed distribution as a dashed line, mean markers in a second pass.
import { select } from 'd3-selection'
import { scaleLinear } from 'd3-scale'
import { area, curveBasis, line } from 'd3-shape'

import { PURPOSES } from '@/charts/vocab'
import { emptyNote, f1, num, str } from '@/charts/util'
import { RIDGE_HEIGHT_ROWS, RIDGE_MARGIN, RIDGE_MAX_MILES, ridgePoints, ridgeRows, ridgeSeries, showMeanMarkers, type RidgeSeries } from '@/charts/lib/ridge'
import type { ChartKind } from '@/charts/types'
import { tooltip } from '@/services/tooltip'
import { prettyText } from '@/services/typography'

const SVG_NS = 'http://www.w3.org/2000/svg'
const TABLE = 'trip_length_frequency'

const kind: ChartKind = {
  tables: () => [TABLE],
  extraRuns: (plan) => (plan.observedRun ? [plan.observedRun] : []),
  draw(el, env) {
    const t = env.theme
    const run = env.focus?.run ?? env.scenarios[0]?.run
    const byPurpose = (r: string | undefined): Map<string, RidgeSeries> => {
      const rows = r ? env.data.rows(r, TABLE) : []
      return new Map(PURPOSES.map((p) => [p, ridgeSeries(rows.filter((x) => str(x, 'primary_purpose') === p).map((x) => ({ bin: num(x, 'distance_bin_miles'), trips: num(x, 'trips') })))]))
    }
    const model = byPurpose(run)
    if (![...model.values()].some((s) => s.total > 0)) {
      emptyNote(el, 'No trip length data for this scenario.')
      return { label: 'Trip length distribution: no data' }
    }
    const hasObs = !!env.observedRun && env.data.rows(env.observedRun, TABLE).length > 0
    const obs = byPurpose(hasObs ? env.observedRun : undefined)

    const w = env.width
    const h = env.height
    const n = PURPOSES.length
    const { rowH, base, chartBottom } = ridgeRows(h, n)
    const xs = scaleLinear([0, RIDGE_MAX_MILES], [RIDGE_MARGIN.left, w - RIDGE_MARGIN.right])
    // One vertical scale for every ridge: the tallest peak of the observed (else modelled) distributions.
    const ref = hasObs ? obs : model
    const ymax = Math.max(1e-9, ...PURPOSES.map((p) => Math.max(...(ref.get(p)?.density ?? [0]))))
    const ys = scaleLinear([0, ymax], [0, rowH * RIDGE_HEIGHT_ROWS])
    const pinned = env.pinned
    const ticks = [0, 5, 10, 15, 20, 25, 30]

    const svg = document.createElementNS(SVG_NS, 'svg')
    el.replaceChildren(svg)
    const root = select(svg).attr('width', w).attr('height', h).style('display', 'block').style('overflow', 'visible').style('font-family', t.font).style('font-size', `${t.fs}px`)
    root.append('g').selectAll('line').data(ticks).join('line').attr('x1', xs).attr('x2', xs).attr('y1', 0).attr('y2', chartBottom).attr('stroke', t.grid)
    root
      .append('g')
      .selectAll('text')
      .data(ticks)
      .join('text')
      .attr('x', xs)
      .attr('y', h - 5)
      .attr('text-anchor', 'middle')
      .attr('fill', t.mute)
      .text(prettyText((d) => d + (d === 30 ? ' mi' : '')))

    const markers: { x: number; y: number; text: string }[] = []
    PURPOSES.forEach((p, i) => {
      const s = model.get(p)!
      const o = obs.get(p)!
      const b = base(i)
      const fill = t.mix(t.tokens.c1, t.surface, 0.12 + 0.05 * i)
      const pts = ridgePoints(s.density)
      const a = area<[number, number]>()
        .x((d) => xs(d[0]))
        .y0(b)
        .y1((d) => b - ys(d[1]))
        .curve(curveBasis)
      const path = root.append('path').attr('d', a(pts)).attr('fill', fill).attr('fill-opacity', 0.92).attr('stroke', t.surface).attr('stroke-width', 1.5)
      if (hasObs && o.total > 0) {
        const l = line<[number, number]>()
          .x((d) => xs(d[0]))
          .y((d) => b - ys(d[1]))
          .curve(curveBasis)
        root.append('path').attr('d', l(ridgePoints(o.density))).attr('fill', 'none').attr('stroke', t.ink).attr('stroke-dasharray', '3 3').attr('stroke-width', 1.3).attr('opacity', 0.8).style('pointer-events', 'none')
      }
      root.append('text').attr('x', RIDGE_MARGIN.left - 10).attr('y', b - 4).attr('text-anchor', 'end').attr('fill', t.ink).style('pointer-events', 'none').text(prettyText(p))
      if (Number.isFinite(s.mean)) markers.push({ x: xs(s.mean), y: b + 12, text: `${f1(s.mean)} mi avg` })

      if (pinned) {
        path
          .attr('data-key', p)
          .attr('data-title', p)
          .attr('data-val', `${f1(s.mean)} mi avg`)
          .attr('data-num', s.mean)
          .attr('data-unit', ' mi')
      } else {
        path
          .style('cursor', 'default')
          .on('mousemove', (e: MouseEvent) => {
            const rows = [{ k: env.focus?.label ?? 'Modeled', v: `${f1(s.mean)} mi`, b: true, c: fill, d: hasObs && o.total > 0 ? `${s.mean - o.mean >= 0 ? '+' : '−'}${Math.abs(s.mean - o.mean).toFixed(1)} mi` : '' }]
            if (hasObs && o.total > 0) rows.push({ k: 'Observed', v: `${f1(o.mean)} mi`, b: false, c: undefined as unknown as string, d: '' })
            tooltip.show(
              {
                title: p,
                sub: 'mean distance',
                rows: [
                  ...rows,
                  { k: 'Under 2 miles', v: `${f1(s.under2)}%`, b: false, c: undefined as unknown as string, d: hasObs && o.total > 0 ? `observed ${f1(o.under2)}%` : '' },
                ],
              },
              e,
            )
          })
          .on('mouseleave', () => tooltip.hide())
      }
    })
    // Second pass: mean markers on top of every ridge, with a surface halo.
    const show = showMeanMarkers(rowH)
    root
      .append('g')
      .selectAll('text')
      .data(markers)
      .join('text')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .attr('text-anchor', 'middle')
      .attr('fill', t.ink)
      .attr('stroke', t.surface)
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .attr('font-size', 10.5)
      .style('pointer-events', 'none')
      .attr('display', show ? null : 'none')
      .text(prettyText((d) => d.text))

    svg.setAttribute('role', 'img')
    const means = PURPOSES.map((p) => `${p} ${f1(model.get(p)!.mean)} miles`).join(', ')
    return {
      label: `Trip length distribution by purpose, average distance: ${means}`,
    }
  },
}

export default kind
