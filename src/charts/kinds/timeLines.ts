// Trips through the day, Lines (project-docs/redesign/04-chart-catalogue.md section 10). Observable Plot lines with the
// shared crosshair; the dashed line (with a faint area) is the reference, Change modes draw differences around zero.
import { TRIPS_UNIT } from '@/charts/units'
import * as Plot from '@observablehq/plot'

import { emptyNote } from '@/charts/util'
import type { ChartKind, ChartPlan, LegendSpec } from '@/charts/types'
import {
  HOURS, HOUR_TICKS, buildTodSeries, crosshairKeys, hourlyThousands, hourTick, hourTitle, lineTickFormat, todColor, todGroup,
  todTable,
} from '@/charts/lib/timeOfDay'
import { deltaValue, formatDelta } from '@/panels/compareMath'
import { crosshair } from '@/panels/plotInteraction'

const M = { ml: 44, mr: 8, mt: 10, mb: 30 }

const kind: ChartKind = {
  tables: (plan: ChartPlan) => [...new Set(['trips_by_hour', todTable(todGroup(plan.group))])],
  draw(el, env) {
    const { theme: t } = env
    const group = todGroup(env.group)
    const m = group === 'scn' ? env.display : 'val'
    const focusRun = env.focus?.run ?? env.scenarios[0]?.run
    const series = buildTodSeries(group, env.scenarios, focusRun, env.data.rows)
    const color = todColor(group, series.names, env.scenarios, t)
    const labelOf = (n: string) => (group === 'scn' ? (env.scenarios.find((s) => s.run === n)?.label ?? n) : n)

    let names = series.names
    let rows = series.rows
    let refRows: { hour: number; v: number }[] | null = null
    const refVals = (run: string) => hourlyThousands(env.data.rows(env.refRunFor(run) ?? '', 'trips_by_hour'))
    if (group === 'scn') {
      if (m === 'val') {
        const rr = names[0] ? refVals(names[0]) : []
        if (rr.some((v) => v > 0)) refRows = rr.map((v, hour) => ({ hour, v }))
      } else {
        // The reference's own difference is zero everywhere: leave it out.
        names = names.filter((n) => env.refRunFor(n) !== n)
        const rv = new Map(names.map((n) => [n, refVals(n)]))
        rows = rows
          .filter((d) => names.includes(d.g))
          .map((d) => ({ ...d, v: deltaValue(d.v, rv.get(d.g)![d.hour], m) as number }))
          .filter((d) => d.v !== null)
      }
    }
    if (names.length === 0) {
      emptyNote(el, 'Pick a scenario other than the reference to see differences.')
      return { label: `${env.config.title}: nothing to compare` }
    }
    if (rows.length === 0 || (group !== 'scn' && rows.every((d) => d.v === 0))) {
      emptyNote(el, 'No trips-by-hour data for this scenario.')
      return { label: `${env.config.title}: no data` }
    }

    const plot = Plot.plot({
      width: env.width,
      height: env.height,
      style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: `${t.fs}px`, overflow: 'visible' },
      marginLeft: M.ml,
      marginBottom: M.mb,
      marginTop: M.mt,
      marginRight: M.mr,
      x: { label: null, domain: [0, HOURS - 1], ticks: HOUR_TICKS, tickFormat: hourTick },
      y: { label: null, grid: true, tickFormat: lineTickFormat(m), ticks: 4 },
      color: { domain: names, range: names.map(color) },
      marks: [
        Plot.gridY({ stroke: t.grid, strokeOpacity: 1 }),
        refRows ? Plot.areaY(refRows, { x: 'hour', y: 'v', fill: t.ink, fillOpacity: 0.06, curve: 'catmull-rom' }) : null,
        refRows
          ? Plot.line(refRows, { x: 'hour', y: 'v', stroke: t.ink, strokeWidth: 1.5, strokeDasharray: '4 3', curve: 'catmull-rom' })
          : Plot.ruleY([0], { stroke: t.mute }),
        Plot.line(rows, { x: 'hour', y: 'v', stroke: 'g', strokeWidth: 2.25, curve: 'catmull-rom', strokeLinecap: 'round' }),
      ].filter(Boolean) as Plot.Markish[],
    }) as unknown as SVGSVGElement & { scale(n: string): { apply(v: number): number } }

    const at = (n: string, h: number) => rows.find((d) => d.g === n && d.hour === h)
    const refLabel = `${env.reference.isObserved ? '' : 'Reference · '}${env.reference.label}`
    const move = crosshair(plot, {
      ...M,
      w: env.width,
      h: env.height,
      x0: 0,
      x1: HOURS - 1,
      bg: t.surface,
      spec: (h) => ({
        title: hourTitle(h),
        sub: group === 'scn' ? (m === 'val' ? 'trips per hour' : m === 'abs' ? 'change in trips per hour' : 'percent change') : (env.focus?.label ?? ''),
        rows: [
          ...names
            .map((n) => ({ n, d: at(n, h) }))
            .filter((q) => q.d)
            .sort((a, b) => b.d!.v - a.d!.v)
            .map((q) => ({
              k: labelOf(q.n),
              v: m === 'val' ? `${Math.round(q.d!.v)}${TRIPS_UNIT.suffix}` : `${formatDelta(q.d!.v, m, { decimals: m === 'pct' ? 1 : 0 })}${m === 'abs' ? TRIPS_UNIT.suffix : ''}`,
              c: color(q.n),
            })),
          ...(refRows ? [{ k: refLabel, v: `${Math.round(refRows[h].v)}${TRIPS_UNIT.suffix}`, b: true }] : []),
        ],
      }),
      ys: (h) => names.map((n) => at(n, h)).filter(Boolean).map((d) => ({ y: plot.scale('y').apply(d!.v), c: color(d!.g) })),
    })
    const label = `Trips by hour of day${group === 'scn' ? ', by scenario' : group === 'none' ? '' : `, by ${group}`}, ${env.year}`
    crosshairKeys(plot, move, { ...M, w: env.width, h: env.height, x0: 0, x1: HOURS - 1 }, label)
    el.replaceChildren(plot)

    const legend: LegendSpec = {
      items: [
        ...(group === 'none'
          ? []
          : names.map((n) =>
              group === 'scn' ? { label: labelOf(n), color: color(n), run: n } : group === 'mode' ? { label: n, color: color(n), mode: n } : { label: n, color: color(n) },
            )),
        ...(refRows ? [{ label: env.reference.isObserved ? 'Observed' : `Reference: ${env.reference.label}`, dash: true }] : []),
      ],
    }
    return { legend, label }
  },
}

export default kind
