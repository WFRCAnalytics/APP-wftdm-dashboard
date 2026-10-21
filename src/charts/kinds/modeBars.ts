// Mode share, Bars (project-docs/redesign/04-chart-catalogue.md section 1). Observable Plot, one facet per mode and one
// bar per series; the dashed line is the reference, with a margin-of-error band when the reference is Observed.
import * as Plot from '@observablehq/plot'

import { INCOMES, MODES, PURPOSES } from '@/charts/vocab'
import { f1, num, sgn, str } from '@/charts/util'
import type { ChartEnv, ChartKind, ChartPlan, LegendSpec, Row } from '@/charts/types'
import { deltaValue, formatDelta } from '@/panels/compareMath'
import { armPlot } from '@/panels/plotInteraction'
import { emptyNote } from '@/charts/util'

interface Series {
  names: string[]
  color(name: string): string
  /** Series value for mode index j, in percent. */
  val(name: string, j: number): number
  /** Reference value for series `name` and mode j, in percent. */
  ref(name: string, j: number): number
  refName: string
  /** The series are scenarios (the reference scenario is dropped in Change modes). */
  self: boolean
}

function shares(rows: readonly Row[], key?: string): Map<string, number[]> {
  // key -> percent per mode, in MODES order
  const out = new Map<string, number[]>()
  for (const r of rows) {
    const k = key ? str(r, key) : ''
    const j = MODES.indexOf(str(r, 'major_trip_mode') as (typeof MODES)[number])
    if (j < 0) continue
    const arr = out.get(k) ?? new Array(MODES.length).fill(0)
    arr[j] = num(r, 'share') * 100
    out.set(k, arr)
  }
  return out
}

function modeShare(env: ChartEnv, run: string | undefined): number[] {
  return (run && shares(env.data.rows(run, 'trip_mode_share')).get('')) || new Array(MODES.length).fill(0)
}

function groupOf(plan: ChartPlan): 'scn' | 'purpose' | 'income' {
  return plan.group === 'purpose' ? 'purpose' : plan.group === 'income' ? 'income' : 'scn'
}

function buildSeries(env: ChartEnv): Series {
  const group = groupOf(env)
  const { theme } = env
  const focusRun = env.focus?.run ?? env.scenarios[0]?.run
  if (group === 'purpose' || group === 'income') {
    const table = group === 'purpose' ? 'trip_mode_share_by_purpose' : 'trip_mode_share_by_income'
    const key = group === 'purpose' ? 'primary_purpose' : 'income_group'
    const names: string[] = group === 'purpose' ? [...PURPOSES] : [...INCOMES]
    const by = focusRun ? shares(env.data.rows(focusRun, table), key) : new Map<string, number[]>()
    const colors = group === 'purpose' ? names.map((_, i) => theme.cat(i)) : theme.ramp(theme.tokens.c1, 4, 0.55)
    const overall = modeShare(env, focusRun)
    return {
      names,
      color: (n) => colors[names.indexOf(n)],
      val: (n, j) => by.get(n)?.[j] ?? 0,
      ref: (_n, j) => overall[j],
      refName: `Overall ${env.focus?.label ?? ''}`.trim(),
      self: false,
    }
  }
  const byRun = new Map(env.scenarios.map((s) => [s.run, modeShare(env, s.run)]))
  const refShare = (run: string) => modeShare(env, env.refRunFor(run))
  return {
    names: env.scenarios.map((s) => s.run),
    color: (n) => env.scenarios.find((s) => s.run === n)?.color ?? theme.mute,
    val: (n, j) => byRun.get(n)?.[j] ?? 0,
    ref: (n, j) => refShare(n)[j],
    refName: env.reference.label,
    self: true,
  }
}

const labelOf = (env: ChartEnv, s: Series, name: string) => (s.self ? (env.scenarios.find((x) => x.run === name)?.label ?? name) : name)

const kind: ChartKind = {
  tables: (plan) => {
    const g = groupOf(plan)
    return g === 'purpose' ? ['trip_mode_share', 'trip_mode_share_by_purpose'] : g === 'income' ? ['trip_mode_share', 'trip_mode_share_by_income'] : ['trip_mode_share']
  },
  draw(el, env) {
    const { theme: t, display: m } = env
    const s = buildSeries(env)
    // In Change modes the reference scenario's own bars are all zero: leave them out.
    const refRun = env.reference.run
    const names = s.names.filter((n) => !(s.self && m !== 'val' && n === refRun))
    if (names.length === 0) {
      emptyNote(el, 'Pick a scenario other than the reference to see differences.')
      return { label: `${env.config.title}: nothing to compare` }
    }

    const rows = names.flatMap((n) => MODES.map((mode, j) => ({ mode, s: n, v: deltaValue(s.val(n, j), s.ref(n, j), m) ?? 0 })))
    const refLine = MODES.map((mode, j) => ({ mode, v: s.ref(names[0], j) }))
    const observedRef = env.reference.isObserved && s.self
    const moe = observedRef && refRun ? new Map(env.data.rows(refRun, 'trip_mode_share').map((r) => [str(r, 'major_trip_mode'), num(r, 'moe') * 100])) : null
    const yFormat = (d: number) => (m === 'val' ? `${d}%` : `${sgn(d)}${Math.abs(d)}${m === 'pct' ? '%' : ''}`)

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
      const all = names
        .map((n) => ({ n, val: s.val(n, j), v: deltaValue(s.val(n, j), s.ref(n, j), m) ?? 0 }))
        .sort((a, b) => b.val - a.val)
      const shown = all.filter((q, i) => i < 8 || q.n === d.s)
      const more = all.length - shown.length
      const err = observedRef ? (moe?.get(d.mode) ?? null) : null
      const obsFoot = observedRef && refRun ? observedFooter(env, refRun) : ''
      return {
        title: d.mode,
        sub: m === 'val' ? 'share of trips' : m === 'abs' ? 'change in points' : 'percent change',
        rows: shown
          .map((q) => ({
            k: labelOf(env, s, q.n),
            v: m === 'val' ? `${f1(q.val)}%` : `${formatDelta(q.v, m)}${m === 'abs' ? ' pts' : ''}`,
            c: s.color(q.n),
            b: q.n === d.s,
            d: m === 'val' ? `${formatDelta(q.val - s.ref(q.n, j), 'abs')} pts` : `${f1(q.val)}%`,
          }))
          .concat([{ k: `${s.refName === 'Observed' ? '' : 'Reference · '}${s.refName}`, v: `${f1(rv)}%${err ? ` ±${f1(err)}` : ''}`, b: true, c: undefined as unknown as string, d: '' }]),
        foot: [obsFoot, more ? `${more} more not shown` : ''].filter(Boolean).join('. ') || undefined,
      }
    })
    el.replaceChildren(plot)

    const legend: LegendSpec = {
      items: [
        ...names.map((n) =>
          groupOf(env) === 'scn'
            ? { label: labelOf(env, s, n), color: s.color(n), run: n }
            : { label: n, color: s.color(n) },
        ),
        ...(m === 'val' ? [{ label: env.reference.isObserved ? 'Observed' : `Reference: ${env.reference.label}`, dash: true }] : []),
      ],
    }
    return { legend, label: `Mode share by ${groupOf(env) === 'scn' ? 'scenario' : groupOf(env)}, ${env.year}` }
  },
}

/** "Observed: <source>, <sample>" from the observed run's manifest, when it published one. */
function observedFooter(env: ChartEnv, _run: string): string {
  const obs = (env.config.options as { observedSource?: string } | undefined)?.observedSource
  return obs ? `Observed: ${obs}` : ''
}

export default kind
