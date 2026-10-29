// Trips through the day, Heatmap (04-chart-catalogue.md section 12): one row per group member, one column per hour, the
// fill is the share of that row's own trips falling in that hour (sqrt colour, 0 to 16%).
import * as Plot from '@observablehq/plot'

import { emptyNote } from '@/charts/util'
import type { ChartKind, ChartPlan } from '@/charts/types'
import { HOURS, buildTodSeries, hourTickEvery3, hourTitle, rowShares, todGroup, todTable } from '@/charts/lib/timeOfDay'
import { armPlot } from '@/panels/plotInteraction'
import { prettyOperators } from '@/services/typography'

/** A row label cut to `max` characters with an ellipsis, so a long scenario name stays inside the left margin (the tooltip has it whole). */
const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

const kind: ChartKind = {
  tables: (plan: ChartPlan) => [todTable(todGroup(plan.group))],
  draw(el, env) {
    const { theme: t } = env
    const group = todGroup(env.group)
    const focusRun = env.focus?.run ?? env.scenarios[0]?.run
    const series = buildTodSeries(group, env.scenarios, focusRun, env.data.rows)
    const rows = rowShares(series)
    if (series.names.length === 0 || rows.every((d) => d.v === 0)) {
      emptyNote(el, 'No trips-by-hour data for this scenario.')
      return { label: `${env.config.title}: no data` }
    }
    const labelOf = (n: string) => (group === 'scn' ? (env.scenarios.find((s) => s.run === n)?.label ?? n) : n)
    const plot = Plot.plot({
      width: env.width,
      height: env.height,
      style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: `${t.fs}px`, overflow: 'visible' },
      marginLeft: group === 'scn' ? 138 : 84,
      marginBottom: 26,
      marginTop: 4,
      marginRight: 6,
      x: { label: null, domain: Array.from({ length: HOURS }, (_, h) => h), tickFormat: hourTickEvery3, padding: 0.08 },
      y: { label: null, domain: series.names, padding: 0.12, tickFormat: (n: string) => prettyOperators(clip(labelOf(n), group === 'scn' ? 21 : 13)) },
      color: { type: 'sqrt', range: [t.mix(t.surface, t.tokens.c1, 0.1), t.tokens.c1], domain: [0, 16] },
      marks: [Plot.cell(rows, { x: 'hour', y: 'g', fill: 'v', rx: 4, title: (_d: unknown, i: number) => `wfa:${i}` })],
    }) as unknown as SVGSVGElement

    armPlot(plot, { a: rows }, (d: { g: string; hour: number; v: number }) => ({
      title: labelOf(d.g),
      sub: hourTitle(d.hour),
      rows: [{ k: 'Share of its trips', v: `${d.v.toFixed(1)}%`, b: true }],
    }))
    el.replaceChildren(plot)
    return { label: `Share of each ${group === 'scn' ? 'scenario' : group}'s trips by hour of day, ${env.year}` }
  },
}

export default kind
