// Slope (catalogue section 4): Observed on the left, the focus scenario on the right, one line per mode on a log y scale
// so the small modes stay readable. Observable Plot; labels on both sides.
import * as Plot from '@observablehq/plot'

import { MODES } from '@/charts/vocab'
import { emptyNote, f1 } from '@/charts/util'
import { modeShare, SLOPE_DOMAIN, slopeRows, slopeY, type SlopeRow } from '@/charts/lib/modeShare'
import type { ChartKind } from '@/charts/types'
import { armPlot } from '@/panels/plotInteraction'

const kind: ChartKind = {
  tables: () => ['trip_mode_share'],
  extraRuns: (plan) => [plan.observedRun, plan.runFor('baseline', plan.year)].filter((r): r is string => Boolean(r)),
  draw(el, env) {
    const { theme: t } = env
    const focus = env.focus ?? env.scenarios[0]
    // a focus on Observed itself falls back to the baseline run of the year
    let rightRun: string | undefined = focus?.run
    let rightLabel = focus?.label ?? ''
    if (!focus || focus.run === env.observedRun) {
      const base = env.runFor('baseline', env.year)
      rightRun = base
      rightLabel = 'Baseline'
    }
    const leftRun = env.observedRun ?? env.reference.run
    if (!rightRun || !leftRun || env.data.rows(leftRun, 'trip_mode_share').length === 0) {
      emptyNote(el, 'This chart needs the Observed run and a scenario to compare it with.')
      return { label: `${env.config.title ?? 'Slope'}: no data` }
    }
    const leftLabel = env.observedRun ? 'Observed' : env.reference.label
    const rows: SlopeRow[] = slopeRows(modeShare(env, leftRun), modeShare(env, rightRun))
    const name = (col: 'a' | 'b') => (col === 'a' ? leftLabel : rightLabel)
    const plotted = rows.map((d) => ({ ...d, y: slopeY(d.v) }))
    const left = plotted.filter((d) => d.col === 'a')
    const right = plotted.filter((d) => d.col === 'b')

    const plot = Plot.plot({
      width: env.width,
      height: env.height,
      style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: '12px', overflow: 'visible' },
      marginLeft: 120,
      marginRight: 120,
      marginTop: 14,
      marginBottom: 8,
      x: { label: null, domain: ['a', 'b'], axis: 'top', tickSize: 0, padding: 0, tickFormat: (d: 'a' | 'b') => name(d) },
      y: { type: 'log', axis: null, domain: SLOPE_DOMAIN },
      color: { domain: [...MODES], range: MODES.map((m) => t.mode(m)) },
      marks: [
        Plot.line(plotted, { x: 'col', y: 'y', z: 'mode', stroke: 'mode', strokeWidth: 3, strokeLinecap: 'round' }),
        Plot.dot(plotted, { x: 'col', y: 'y', fill: 'mode', stroke: t.surface, strokeWidth: 2, r: 5.5, title: (_d: unknown, i: number) => `wfa:${i}` }),
        Plot.text(left, { x: 'col', y: 'y', text: (d: SlopeRow) => `${d.mode}  ${f1(d.v)}%`, textAnchor: 'end', dx: -12, fill: t.ink }),
        Plot.text(right, { x: 'col', y: 'y', text: (d: SlopeRow) => `${f1(d.v)}%  ${d.mode}`, textAnchor: 'start', dx: 12, fill: t.ink }),
      ],
    }) as unknown as SVGSVGElement

    armPlot(plot, { a: plotted }, (d: SlopeRow) => {
      const other = rows.find((q) => q.mode === d.mode && q.col !== d.col)
      return {
        title: d.mode,
        swatch: t.mode(d.mode),
        rows: [
          { k: name(d.col), v: `${f1(d.v)}%`, b: true },
          { k: name(d.col === 'a' ? 'b' : 'a'), v: other ? `${f1(other.v)}%` : 'n/a' },
        ],
      }
    })
    el.replaceChildren(plot)
    return { label: `Mode share, ${leftLabel} to ${rightLabel}, ${env.year}` }
  },
}

export default kind
