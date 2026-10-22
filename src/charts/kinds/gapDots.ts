// Mode share, Gap (catalogue section 2): a dot per series on a band y-scale of the modes, x = difference from the
// reference. Always a difference chart: Values mode is drawn as Change.
import * as Plot from '@observablehq/plot'

import { MODES } from '@/charts/vocab'
import { emptyNote, f1, sgn } from '@/charts/util'
import {
  buildSeries,
  gapAxisLabel,
  gapLimit,
  gapRows,
  groupOf,
  moeByMode,
  refRowLabel,
  seriesTables,
  statusColors,
  visibleNames,
  type GapRow,
} from '@/charts/lib/modeShare'
import { observedFooter } from '@/charts/lib/observedSource'
import type { ChartKind, LegendSpec } from '@/charts/types'
import { armPlot } from '@/panels/plotInteraction'

const fmt = (v: number | null, m: 'abs' | 'pct'): string => (v === null ? 'n/a' : `${sgn(v)}${Math.abs(v).toFixed(1)}${m === 'pct' ? '%' : ''}`)

const kind: ChartKind = {
  tables: (plan) => seriesTables(plan),
  draw(el, env) {
    const { theme: t } = env
    const m: 'abs' | 'pct' = env.display === 'pct' ? 'pct' : 'abs'
    const s = buildSeries(env)
    const names = visibleNames(s, 'abs', env.reference.run)
    if (names.length === 0) {
      emptyNote(el, 'Pick a scenario other than the reference to see differences.')
      return { label: `${env.config.title ?? 'Mode share gap'}: nothing to compare` }
    }
    const rows = gapRows(names, s, m)
    const dots = rows.filter((d): d is GapRow & { gap: number } => d.gap !== null)
    const L = gapLimit(rows)
    const observedRef = env.reference.isObserved
    const moe = observedRef && s.self ? moeByMode(env, env.reference.run) : null
    const foot = moe ? observedFooter(env, 'trip_mode_share') : ''
    const ok = statusColors(el).ok

    const plot = Plot.plot({
      width: env.width,
      height: env.height,
      style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: `${t.fs}px`, overflow: 'visible' },
      marginLeft: 84,
      marginBottom: 36,
      marginTop: 8,
      marginRight: 14,
      x: {
        domain: [-L, L],
        label: gapAxisLabel(m, s.refName),
        labelAnchor: 'center',
        labelArrow: 'none',
        tickFormat: (d: number) => `${sgn(d)}${Math.abs(d)}${m === 'pct' ? '%' : ''}`,
        ticks: 8,
      },
      y: { label: null, domain: [...MODES], padding: 0.5 },
      color: { domain: names, range: names.map(s.color) },
      marks: [
        m === 'abs' && observedRef ? Plot.rectX([{ a: -1, b: 1 }], { x1: 'a', x2: 'b', fill: ok, fillOpacity: 0.12 }) : null,
        Plot.ruleY([...MODES], { stroke: t.grid, strokeOpacity: 1 }),
        Plot.ruleX([0], { stroke: t.ink, strokeOpacity: 0.55 }),
        Plot.dot(dots, { x: 'gap', y: 'mode', fill: 's', r: 5.5, stroke: t.surface, strokeWidth: 2, title: (_d: unknown, i: number) => `wfa:${i}` }),
      ].filter(Boolean) as Plot.Markish[],
    }) as unknown as SVGSVGElement

    armPlot(plot, { a: dots }, (d: GapRow) => {
      const j = MODES.indexOf(d.mode as (typeof MODES)[number])
      const err = moe?.get(d.mode) ?? null
      const list = rows.filter((q) => q.mode === d.mode).sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
      return {
        title: d.mode,
        sub: m === 'pct' ? 'percent change vs reference' : 'points vs reference',
        rows: [
          ...list.map((q) => {
            const within = err !== null && m === 'abs' && q.gap !== null && Math.abs(q.gap) <= err
            return {
              k: s.label(q.s),
              v: `${fmt(q.gap, m)}${m === 'abs' && q.gap !== null ? ' pts' : ''}`,
              c: s.color(q.s),
              b: q.s === d.s,
              d: err !== null && m === 'abs' ? (within ? 'within error' : '') : `${f1(s.val(q.s, j))}%`,
              dc: within ? ok : undefined,
            }
          }),
          { k: refRowLabel(s.refName), v: `${f1(s.ref(names[0], j))}%${err !== null ? ` ±${f1(err)}` : ''}`, b: true },
        ],
        foot: foot || undefined,
      }
    })
    el.replaceChildren(plot)

    const g = groupOf(env)
    const legend: LegendSpec = {
      // as the prototype: every compared scenario (the reference's own chip included) and the reference sample
      items:
        g === 'scn'
          ? [
              ...s.names.map((n) => ({ label: s.label(n), color: s.color(n), run: n })),
              { label: env.reference.isObserved ? 'Observed' : `Reference: ${env.reference.label}`, dash: true },
            ]
          : names.map((n) => ({ label: n, color: s.color(n) })),
    }
    return { legend, label: `Gap to ${s.refName} in mode share by ${g === 'scn' ? 'scenario' : g}, ${env.year}` }
  },
}

export default kind
