// Mode share, Bars (project-docs/redesign/04-chart-catalogue.md section 1). Observable Plot, one facet per mode and one
// bar per series; the dashed line is the reference, with a margin-of-error band when the reference is Observed.
import * as Plot from '@observablehq/plot'

import { MODES } from '@/charts/vocab'
import { emptyNote, f1, sgn } from '@/charts/util'
import { buildSeries, groupOf, moeByMode, refRowLabel, seriesTables, visibleNames } from '@/charts/lib/modeShare'
import { observedFooter } from '@/charts/lib/observedSource'
import type { ChartEnv, ChartKind, LegendSpec } from '@/charts/types'
import { deltaValue, formatDelta } from '@/panels/compareMath'
import { armPlot } from '@/panels/plotInteraction'

const kind: ChartKind = {
  tables: (plan) => seriesTables(plan),
  draw: (el, env) => drawModeBars(el, env),
}

/** Exported so the donut can draw this chart for the focus scenario in Change mode. */
export function drawModeBars(el: HTMLElement, env: ChartEnv) {
  const { theme: t, display: m } = env
  const s = buildSeries(env)
  const refRun = env.reference.run
  const names = visibleNames(s, m, refRun)
  if (names.length === 0) {
    emptyNote(el, 'Pick a scenario other than the reference to see differences.')
    return { label: `${env.config.title ?? 'Mode share'}: nothing to compare` }
  }

  // bars: one per series and mode; a % change against a zero reference is n/a and draws no bar
  const all = names.flatMap((n) => MODES.map((mode, j) => ({ mode, s: n, v: deltaValue(s.val(n, j), s.ref(n, j), m) })))
  const rows = all.filter((d): d is { mode: (typeof MODES)[number]; s: string; v: number } => d.v !== null)
  const refLine = MODES.map((mode, j) => ({ mode, v: s.ref(names[0], j) }))
  const observedRef = env.reference.isObserved && s.self
  const moe = observedRef ? moeByMode(env, refRun) : null
  const yFormat = (d: number) => (m === 'val' ? `${d}%` : `${sgn(d)}${Math.abs(d)}${m === 'pct' ? '%' : ''}`)
  const foot = observedRef ? observedFooter(env, 'trip_mode_share') : ''

  const plot = Plot.plot({
    width: env.width,
    height: env.height,
    style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: `${t.fs}px`, overflow: 'visible' },
    marginLeft: 40,
    marginBottom: 30,
    marginTop: 14,
    marginRight: 4,
    fx: { label: null, padding: 0.14, domain: [...MODES] },
    x: { axis: null, domain: names, paddingInner: 0.1, paddingOuter: 0.08 },
    y: { label: null, grid: true, tickFormat: yFormat, ticks: 5 },
    color: { domain: names, range: names.map(s.color) },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1 }),
      Plot.barY(rows, { fx: 'mode', x: 's', y: 'v', fill: 's', rx: t.r, title: (_d: unknown, i: number) => `wfa:${i}` }),
      m === 'val' && moe
        ? Plot.rect(
            MODES.map((mode, j) => ({ mode, lo: s.ref(names[0], j) - (moe.get(mode) ?? 0), hi: s.ref(names[0], j) + (moe.get(mode) ?? 0) })),
            { fx: 'mode', y1: 'lo', y2: 'hi', fill: t.ink, fillOpacity: 0.12 },
          )
        : null,
      m === 'val' ? Plot.ruleY(refLine, { fx: 'mode', y: 'v', stroke: t.ink, strokeWidth: 1.6, strokeDasharray: '4 3' }) : null,
      Plot.ruleY([0], { stroke: m === 'val' ? t.line : t.mute }),
    ].filter(Boolean) as Plot.Markish[],
  }) as unknown as SVGSVGElement

  armPlot(plot, { a: rows }, (d: { mode: string; s: string }) => {
    const j = MODES.indexOf(d.mode as (typeof MODES)[number])
    const rv = s.ref(names[0], j)
    const list = names
      .map((n) => ({ n, val: s.val(n, j), v: deltaValue(s.val(n, j), s.ref(n, j), m) }))
      .sort((a, b) => b.val - a.val)
    const shown = list.filter((q, i) => i < 8 || q.n === d.s)
    const more = list.length - shown.length
    const err = moe?.get(d.mode) ?? null
    return {
      title: d.mode,
      sub: m === 'val' ? 'share of trips' : m === 'abs' ? 'change in points' : 'percent change',
      rows: [
        ...shown.map((q) => ({
          k: s.label(q.n),
          v: m === 'val' ? `${f1(q.val)}%` : `${formatDelta(q.v, m)}${m === 'abs' ? ' pts' : ''}`,
          c: s.color(q.n),
          b: q.n === d.s,
          d: m === 'val' ? `${formatDelta(q.val - s.ref(q.n, j), 'abs')} pts` : `${f1(q.val)}%`,
        })),
        { k: refRowLabel(s.refName), v: `${f1(rv)}%${err !== null ? ` ±${f1(err)}` : ''}`, b: true },
      ],
      foot: [observedRef ? foot : '', more ? `${more} more not shown` : ''].filter(Boolean).join('. ') || undefined,
    }
  })
  el.replaceChildren(plot)

  const g = groupOf(env)
  const legend: LegendSpec = {
    items: [
      ...names.map((n) => (g === 'scn' ? { label: s.label(n), color: s.color(n), run: n } : { label: n, color: s.color(n) })),
      ...(m === 'val' ? [{ label: env.reference.isObserved ? 'Observed' : `Reference: ${env.reference.label}`, dash: true }] : []),
    ],
  }
  return { legend, label: `Mode share by ${g === 'scn' ? 'scenario' : g}, ${env.year}` }
}

export default kind
