// Ranked by metric (project-docs/redesign/04-chart-catalogue.md section 24). Observable Plot barX sorted descending in the
// scenario colours, value labels at the bar end, a dashed rule at the reference value in Values mode and bars that diverge
// from zero in Change modes. The metric comes from the tile's group-by. Each scenario's full name sits above its bar, across the
// chart's width, instead of in a left axis where long names were cut to 30 characters.
import * as Plot from '@observablehq/plot'

import { deltaDecimals, kpiValue, metricOf, rankRows, withUnit, type RankRow } from '@/charts/lib/metrics'
import type { ChartKind } from '@/charts/types'
import { emptyNote } from '@/charts/util'
import { deltaValue, formatDelta } from '@/panels/compareMath'
import { armPlot } from '@/panels/plotInteraction'
import { prettyOperators } from '@/services/typography'

const TABLE = 'summary_kpis'

const kind: ChartKind = {
  tables: () => [TABLE],
  draw(el, env) {
    const { theme: t, display: m } = env
    if (env.width < 320) {
      el.replaceChildren()
      return { label: `${env.config.title}: too narrow to draw` }
    }
    const metric = metricOf(env.group)
    const dec = deltaDecimals(metric, m)
    const self = env.reference.kind === 'self-base-year'
    const refRun = env.reference.run
    // the reference scenario's own bar would be zero in Change modes
    const shown = env.scenarios.filter((s) => !(m !== 'val' && !self && s.run === refRun))
    if (shown.length === 0) {
      emptyNote(el, 'Pick a scenario other than the reference to see differences.')
      return { label: `${env.config.title}: nothing to compare` }
    }
    const valueOf = (run: string | undefined) => (run ? kpiValue(env.data.rows(run, TABLE), metric) : null)
    const ranked = rankRows(
      shown.map((s): RankRow => {
        const raw = valueOf(s.run)
        const ref = valueOf(env.refRunFor(s.run))
        return { key: s.run, raw, ref, v: deltaValue(raw, ref, m) }
      }),
    )
    const info = new Map(shown.map((s) => [s.run, s]))
    const lab = (v: number | null) => (m === 'val' ? (v === null ? 'n/a' : v.toFixed(metric.decimals)) : formatDelta(v, m, { decimals: dec }))
    const barRows = ranked.filter((r) => r.v !== null)
    const naRows = ranked.filter((r) => r.v === null)
    const refValue = !self ? valueOf(env.refRunFor(shown[0].run)) : null

    const x =
      m === 'val'
        ? { label: `${metric.label} (${metric.unit})`, labelAnchor: 'center' as const }
        : {
            label: `${m === 'pct' ? 'Percent change in' : 'Change in'} ${metric.label.toLowerCase()} vs ${env.reference.label}`,
            labelAnchor: 'center' as const,
            tickFormat: (d: number) => formatDelta(d, m, { decimals: m === 'pct' ? 0 : metric.decimals }),
          }

    // a name above each bar: the band leaves room for it (padding) and the label sits half a bar plus a gap above the centre.
    // With many scenarios in a short tile a row cannot hold a name and a bar, so the names go back to a left axis (cut to fit).
    const marginBottom = 38
    const padding = 0.45
    const stepAbove = (env.height - 22 - marginBottom) / (ranked.length + padding)
    const above = stepAbove >= 30
    const marginTop = above ? 22 : 6
    const nameDy = -(stepAbove * (1 - padding)) / 2 - 7
    const axisWidth = Math.min(210, Math.max(124, Math.min(30, Math.max(...ranked.map((r) => (info.get(r.key)?.label ?? r.key).length))) * 6.2 + 16))
    const plot = Plot.plot({
      width: env.width,
      height: env.height,
      style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: `${t.fs}px`, overflow: 'visible' },
      marginLeft: above ? 8 : axisWidth,
      marginRight: 48,
      marginBottom,
      marginTop,
      // room for a value label beside a bar: on the right always, on the left only when Change modes draw bars below zero
      x: { grid: false, nice: true, insetRight: 40, insetLeft: m === 'val' ? 0 : 40, ...x },
      y: above
        ? { axis: null, label: null, domain: ranked.map((r) => r.key), padding }
        : { label: null, domain: ranked.map((r) => r.key), padding: 0.32, tickFormat: (d: string) => { const n = info.get(d)?.label ?? d; return prettyOperators(n.length > 30 ? `${n.slice(0, 29)}…` : n) } },
      color: { domain: ranked.map((r) => r.key), range: ranked.map((r) => info.get(r.key)?.color ?? t.mute) },
      marks: [
        Plot.barX(barRows, { x: 'v', y: 'key', fill: 'key', rx: 4, title: (_d: unknown, i: number) => `wfa:${i}` }),
        above && Plot.text(ranked, {
          y: 'key',
          frameAnchor: 'left',
          textAnchor: 'start',
          dy: nameDy,
          text: (r: RankRow) => prettyOperators(info.get(r.key)?.label ?? r.key),
          fill: t.ink,
          // the whole width is the line; only a name longer than the chart is cut, with an ellipsis
          lineWidth: Math.max(10, (env.width - 60) / (t.fs * 0.6)),
          textOverflow: 'ellipsis-end',
        }),
        Plot.text(
          barRows.filter((d) => (d.v as number) >= 0),
          { x: 'v', y: 'key', text: (d: RankRow) => lab(d.v), dx: 6, textAnchor: 'start', fill: t.ink },
        ),
        Plot.text(
          barRows.filter((d) => (d.v as number) < 0),
          { x: 'v', y: 'key', text: (d: RankRow) => lab(d.v), dx: -6, textAnchor: 'end', fill: t.ink },
        ),
        naRows.length ? Plot.text(naRows, { x: () => 0, y: 'key', text: () => 'n/a', dx: 6, textAnchor: 'start', fill: t.mute }) : null,
        m === 'val' && refValue !== null
          ? Plot.ruleX([refValue], { stroke: t.ink, strokeWidth: 1.6, strokeDasharray: '4 3' })
          : m === 'val'
            ? null
            : Plot.ruleX([0], { stroke: t.mute }),
        Plot.ruleX([0], { stroke: t.line }),
      ].filter(Boolean) as Plot.Markish[],
    }) as unknown as SVGSVGElement

    armPlot(plot, { a: barRows }, (d: RankRow) => {
      const s = info.get(d.key)
      return {
        title: s?.label ?? d.key,
        swatch: s?.color,
        rows: [
          { k: metric.label, v: m === 'val' ? withUnit(lab(d.v), metric.unit) : `${lab(d.v)}${m === 'abs' ? ` ${metric.unit}` : ''}`, b: true },
          ...(d.ref !== null ? [{ k: 'Reference', v: withUnit(d.ref.toFixed(metric.decimals), metric.unit) }] : []),
        ],
      }
    })
    el.replaceChildren(plot)
    return { label: `${m === 'val' ? '' : m === 'pct' ? 'Percent change in ' : 'Change in '}${metric.label} by scenario, ranked, ${env.year}` }
  },
}

export default kind
