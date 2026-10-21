// Trips through the day, Stream (04-chart-catalogue.md section 11): a wiggle streamgraph of the focus scenario by mode,
// purpose or income. The Scenario group falls back to Mode (stacking scenarios means nothing).
import * as Plot from '@observablehq/plot'
import { select } from 'd3-selection'

import { emptyNote } from '@/charts/util'
import type { ChartKind, ChartPlan, LegendSpec } from '@/charts/types'
import { HOURS, HOUR_TICKS, buildTodSeries, crosshairKeys, hourTick, hourTitle, todColor, todGroup, todTable, type TodGroup } from '@/charts/lib/timeOfDay'
import { crosshair } from '@/panels/plotInteraction'
import { wireModeHover } from '@/panels/crossHighlight'

const M = { ml: 8, mr: 8, mt: 6, mb: 26 }
const streamGroup = (id: string | undefined): TodGroup => {
  const g = todGroup(id)
  return g === 'scn' ? 'mode' : g
}

const kind: ChartKind = {
  tables: (plan: ChartPlan) => [todTable(streamGroup(plan.group))],
  draw(el, env) {
    const { theme: t } = env
    const group = streamGroup(env.group)
    const focusRun = env.focus?.run ?? env.scenarios[0]?.run
    const series = buildTodSeries(group, [], focusRun, env.data.rows)
    const color = todColor(group, series.names, [], t)
    if (series.rows.length === 0 || series.rows.every((d) => d.v === 0)) {
      emptyNote(el, 'No trips-by-hour data for this scenario.')
      return { label: `${env.config.title}: no data` }
    }
    const rows = series.rows
    const mark =
      group === 'none'
        ? Plot.areaY(rows, { x: 'hour', y: 'v', fill: color(rows[0].g), curve: 'basis' })
        : Plot.areaY(rows, { x: 'hour', y: 'v', z: 'g', fill: 'g', curve: 'basis', offset: 'wiggle', order: 'inside-out', stroke: t.surface, strokeWidth: 0.8 })
    const plot = Plot.plot({
      width: env.width,
      height: env.height,
      style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: `${t.fs}px`, overflow: 'visible' },
      marginLeft: M.ml,
      marginBottom: M.mb,
      marginTop: M.mt,
      marginRight: M.mr,
      x: { label: null, domain: [0, HOURS - 1], ticks: HOUR_TICKS, tickFormat: hourTick },
      y: { axis: null },
      color: { domain: series.names, range: series.names.map(color) },
      marks: [mark],
    }) as unknown as SVGSVGElement

    if (group === 'mode') {
      // Plot draws one <path> per band; tag them so hovering a band (or a legend chip) traces the mode everywhere.
      select(plot)
        .selectAll<SVGPathElement, unknown>('g[aria-label="area"] path')
        .each(function (_d, i) {
          const name = series.names[i]
          if (name) this.setAttribute('data-m', name)
        })
      wireModeHover(plot)
    }

    const label = `Trips by hour of day, ${group === 'none' ? 'all trips' : `by ${group}`}, ${env.focus?.label ?? ''}`.trim()
    const total = (h: number) => rows.filter((d) => d.hour === h).reduce((s, d) => s + d.v, 0)
    if (env.pinned) {
      // Side-by-side cell: one invisible column per hour feeds the grid's synced tooltip (05 section 4).
      const colW = (env.width - M.ml - M.mr) / (HOURS - 1)
      const g = select(plot).append('g')
      for (let h = 0; h < HOURS; h++) {
        g.append('rect')
          .attr('x', M.ml + h * colW - colW / 2)
          .attr('y', M.mt)
          .attr('width', colW)
          .attr('height', env.height - M.mt - M.mb)
          .attr('fill', 'transparent')
          .attr('data-key', `h${h}`)
          .attr('data-title', hourTitle(h))
          .attr('data-val', `${Math.round(total(h))}k trips`)
          .attr('data-num', total(h))
          .attr('data-rel', '1')
      }
    }
    const move = crosshair(plot, {
      ...M,
      w: env.width,
      h: env.height,
      x0: 0,
      x1: HOURS - 1,
      bg: t.surface,
      spec: (h) => {
        const r = rows.filter((d) => d.hour === h).sort((a, b) => b.v - a.v)
        const tot = total(h)
        return {
          title: hourTitle(h),
          sub: env.focus?.label ?? '',
          rows: r.map((d) => ({ k: d.g, v: `${Math.round(d.v)}k`, c: color(d.g), d: `${tot ? Math.round((d.v / tot) * 100) : 0}%` })),
          foot: `Total ${Math.round(tot)}k trips in this hour`,
        }
      },
    })
    crosshairKeys(plot, move, { ...M, w: env.width, h: env.height, x0: 0, x1: HOURS - 1 }, label)
    el.replaceChildren(plot)

    const legend: LegendSpec = {
      items: group === 'none' ? [] : series.names.map((n) => (group === 'mode' ? { label: n, color: color(n), mode: n } : { label: n, color: color(n) })),
    }
    return { legend, label }
  },
}

export default kind
