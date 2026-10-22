// Across model years (project-docs/redesign/04-chart-catalogue.md section 25). Observable Plot lines over the milestone
// years, a dashed rule at the current year, a hollow dot for the Observed base-year value, and the shared crosshair
// snapping to milestones; a click switches the dashboard's year. Change modes plot scenario minus reference per year.
import * as Plot from '@observablehq/plot'

import { buildTrendRows, hasTrend, snapYear, trendTick, type TrendRow } from '@/charts/lib/trend'
import { deltaDecimals, kpiValue, metricOf, withUnit } from '@/charts/lib/metrics'
import type { ChartEnv, ChartKind, ChartPlan, LegendSpec } from '@/charts/types'
import { emptyNote } from '@/charts/util'
import { formatDelta } from '@/panels/compareMath'
import { crosshair } from '@/panels/plotInteraction'
import { get as getScenario, getBaseline } from '@/state/appState'

const TABLE = 'summary_kpis'
const stripYear = (run: string) => run.replace(/-\d{4}$/, '')

/** The alternative the reference stands for: a scenario reference as chosen, Observed as the baseline alternative, null
 * for "the same scenario in the base year" (each line then has its own reference). */
function referenceAlternative(plan: ChartPlan): string | null {
  if (plan.reference.kind === 'self-base-year') return null
  if (plan.reference.kind === 'scenario' && plan.reference.run) {
    const run = plan.reference.run
    return plan.scenarios.find((s) => s.run === run)?.alternative ?? getScenario(run)?.alternative ?? stripYear(run)
  }
  const base = getBaseline()
  const baseAlt = base ? (getScenario(base)?.alternative ?? stripYear(base)) : undefined
  return baseAlt ?? plan.scenarios[0]?.alternative ?? null
}

const yearsOf = (plan: ChartPlan) => plan.years.map((y) => y.year)

/** Every alternative whose per-year runs are needed: the compared ones and the reference's. */
function involved(plan: ChartPlan): string[] {
  const out = new Set(plan.scenarios.map((s) => s.alternative))
  const ref = referenceAlternative(plan)
  if (ref) out.add(ref)
  return [...out]
}

const kind: ChartKind = {
  tables: () => [TABLE],
  extraRuns(plan) {
    const runs: string[] = []
    for (const alt of involved(plan)) for (const y of yearsOf(plan)) {
      const run = plan.runFor(alt, y)
      if (run) runs.push(run)
    }
    if (plan.observedRun) runs.push(plan.observedRun)
    return runs
  },
  draw(el, env: ChartEnv) {
    const { theme: t, display: m } = env
    const years = yearsOf(env)
    if (years.length < 2) {
      emptyNote(el, 'This chart needs more than one model year.')
      return { label: `${env.config.title}: needs several model years` }
    }
    const metric = metricOf(env.group)
    const refAlt = referenceAlternative(env)
    const self = env.reference.kind === 'self-base-year'
    const value = (alt: string, y: number): number | null => {
      const run = env.runFor(alt, y)
      return run ? kpiValue(env.data.rows(run, TABLE), metric) : null
    }

    // one line per independent scenario; the reference's own line would be zero in Change modes
    const series = env.scenarios.filter(
      (s) => hasTrend(s.alternative, years, env.runFor) && !(m !== 'val' && !self && s.alternative === refAlt),
    )
    if (series.length === 0) {
      emptyNote(el, m === 'val' ? 'Pick a scenario to see how it develops across model years.' : 'Pick a scenario other than the reference to see differences.')
      return { label: `${env.config.title}: nothing to compare` }
    }
    const names = series.map((s) => s.alternative)
    const color = new Map(series.map((s) => [s.alternative, s.color]))
    const label = new Map(series.map((s) => [s.alternative, s.label]))
    const refValue = (alt: string, y: number) => (self ? value(alt, env.baseYear) : refAlt ? value(refAlt, y) : null)

    const rows = buildTrendRows({ alternatives: names, years, display: m, value, refValue })
    if (rows.length === 0) {
      emptyNote(el, 'No data for this metric.')
      return { label: `${env.config.title}: no data` }
    }
    const obsVal = m === 'val' && env.observedRun ? kpiValue(env.data.rows(env.observedRun, TABLE), metric) : null
    const obs = obsVal !== null ? [{ y: env.baseYear, v: obsVal }] : []
    const refTitle = (() => {
      if (m === 'val' || self || !refAlt) return ''
      const s = env.scenarios.find((x) => x.alternative === refAlt)
      const sc = env.reference.run ? getScenario(env.reference.run) : undefined
      return s?.label ?? sc?.label ?? sc?.displayName ?? refAlt
    })()

    const ml = 46
    const mr = 14
    const mt = 10
    const mb = 34
    const inset = 8
    const x0 = years[0]
    const x1 = years[years.length - 1]
    const dec = deltaDecimals(metric, m)

    const plot = Plot.plot({
      width: env.width,
      height: env.height,
      style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: `${t.fs}px`, overflow: 'visible' },
      marginLeft: ml,
      marginRight: mr,
      marginTop: mt,
      marginBottom: mb,
      x: { label: null, domain: [x0, x1], ticks: years, tickFormat: (d: number) => String(d), inset },
      y: { label: null, grid: true, tickFormat: (d: number) => trendTick(d, m), ticks: 5 },
      color: { domain: names, range: names.map((n) => color.get(n) ?? t.mute) },
      marks: [
        Plot.gridY({ stroke: t.grid, strokeOpacity: 1 }),
        m === 'val' ? null : Plot.ruleY([0], { stroke: t.mute }),
        Plot.ruleX([env.year], { stroke: t.ink, strokeOpacity: 0.5, strokeDasharray: '3 3' }),
        Plot.line(rows, { x: 'y', y: 'v', z: 'n', stroke: 'n', strokeWidth: 2.4, strokeLinecap: 'round', curve: 'monotone-x' }),
        Plot.dot(rows, { x: 'y', y: 'v', fill: 'n', stroke: t.surface, strokeWidth: 2, r: 4.5 }),
        obs.length ? Plot.dot(obs, { x: 'y', y: 'v', r: 6.5, fill: t.surface, stroke: t.ink, strokeWidth: 2.2 }) : null,
      ].filter(Boolean) as Plot.Markish[],
    }) as unknown as SVGSVGElement

    const yScale = (plot as unknown as { scale(n: string): { apply(v: number): number } }).scale('y')
    const byYear = new Map<number, TrendRow[]>()
    for (const r of rows) byYear.set(r.y, [...(byYear.get(r.y) ?? []), r])
    const milestone = new Map(env.years.map((y) => [y.year, y.label]))

    crosshair(plot, {
      // Plot insets the linear x range by `inset` on both sides: the crosshair maps pixels the same way
      ml: ml + inset,
      mr: mr + inset,
      mt,
      mb,
      w: env.width,
      h: env.height,
      x0,
      x1,
      snap: (raw) => snapYear(raw, years),
      bg: t.surface,
      click: (y) => env.setYear(y),
      spec: (y) => {
        const at = (byYear.get(y) ?? []).slice().sort((a, b) => b.v - a.v)
        const fmtVal = (v: number) => withUnit(v.toFixed(metric.decimals), metric.unit)
        const tipRows = at.map((q) => ({
          k: label.get(q.n) ?? q.n,
          v: m === 'val' ? fmtVal(q.v) : `${formatDelta(q.v, m, { decimals: dec })}${m === 'abs' ? ` ${metric.unit}` : ''}`,
          c: color.get(q.n),
          d: m === 'val' ? '' : fmtVal(q.raw),
        }))
        let ref: { k: string; v: string; b: boolean } | null = null
        if (m !== 'val' && !self && refAlt) {
          const rv = value(refAlt, y)
          if (rv !== null) ref = { k: `Reference · ${refTitle}`, v: fmtVal(rv), b: true }
        } else if (m === 'val' && y === env.baseYear && obsVal !== null) {
          ref = { k: 'Observed', v: fmtVal(obsVal), b: true }
        }
        return {
          title: String(y),
          sub: milestone.get(y),
          rows: ref ? [...tipRows, ref] : tipRows,
          foot: `Click to switch the dashboard to ${y}.`,
        }
      },
      ys: (y) => (byYear.get(y) ?? []).map((q) => ({ y: yScale.apply(q.v), c: color.get(q.n) ?? t.mute })),
    })
    plot.setAttribute('data-years-trend', '1')
    el.replaceChildren(plot)

    const legend: LegendSpec = { items: series.map((s) => ({ label: s.label, color: s.color, run: s.run })) }
    const what = m === 'val' ? metric.label : m === 'abs' ? `Change in ${metric.label.toLowerCase()}` : `Percent change in ${metric.label.toLowerCase()}`
    return { legend, label: `${what} across model years ${x0} to ${x1}` }
  },
}

export default kind
