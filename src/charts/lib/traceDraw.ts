// Drawing of the calibration progress charts (entry 26): lines of the gap to observed, lines of raw values, and a heatmap.
// Observable Plot plus the shared crosshair / armPlot; clicking a round focuses it, shift-click toggles it in the compare set.
import * as Plot from '@observablehq/plot'

import { dfmt, traceGroupOf, traceMeta, traceRows, withinTolerance, type TraceMeta, type TraceRow } from '@/charts/lib/trace'
import type { ChartEnv, ChartPlan, ChartResult, LegendSpec } from '@/charts/types'
import { emptyNote } from '@/charts/util'
import { armPlot, crosshair } from '@/panels/plotInteraction'
import { loadFamilyRollup, type RollupRow } from '@/services/familyRollup'

export const FAMILY = 'calibration'

export const loadRollup = (_plan: ChartPlan): Promise<RollupRow[]> => loadFamilyRollup(FAMILY)

const cssVar = (el: HTMLElement, name: string, fallback: string) => getComputedStyle(el).getPropertyValue(name).trim() || fallback

function setup(el: HTMLElement, env: ChartEnv) {
  const rows = (env.extra as RollupRow[] | undefined) ?? []
  const meta = traceMeta(traceGroupOf(env.group), rows, env.theme)
  const data = traceRows(rows, meta)
  if (data.length === 0) return null
  const rounds = new Map(env.rounds.map((r) => [r.round, r]))
  // selected rounds: the focused one in ink, the others in their ramp colour
  const sel = env.scenarios
    .filter((s) => s.round !== undefined)
    .map((s) => ({ r: s.round as number, color: s.isFocus ? env.theme.ink : s.color }))
  const pick = (round: number, e?: MouseEvent) => {
    const alt = rounds.get(round)?.scenarioGroup
    if (!alt) return
    if (e?.shiftKey) env.toggleCompare(alt)
    else env.focusScenarioGroup(alt)
  }
  return {
    meta,
    data,
    sel,
    pick,
    ok: cssVar(el, '--ok', '#167a4a'),
    warn: cssVar(el, '--warn', '#95600f'),
    fail: cssVar(el, '--fail', '#d13e3b'),
  }
}

const legendOf = (meta: TraceMeta, ok: string): LegendSpec => ({
  items: [...meta.names.map((n, i) => ({ label: n, color: meta.color(i) })), { label: meta.tolLabel, color: ok }],
})

const plotStyle = (env: ChartEnv) => ({
  background: 'transparent',
  color: env.theme.mute,
  fontFamily: env.theme.font,
  fontSize: `${env.theme.fs}px`,
  overflow: 'visible',
})

export function drawTraceLines(el: HTMLElement, env: ChartEnv, values: boolean): ChartResult | void {
  const s = setup(el, env)
  if (!s) return void emptyNote(el, 'No calibration roll-up for this deployment.')
  const { meta, data, sel, pick } = s
  const t = env.theme
  const N = Math.max(...data.map((d) => d.r))
  const yv = values ? 'v' : 'd'
  const yTick = values
    ? (d: number) => (meta.group === 'mode' ? `${d}%` : String(d))
    : (d: number) => (meta.err ? `${d}%` : `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}${meta.pct ? '%' : ''}`)
  const obsByI = meta.names.map((_, i) => ({ i, y: data.find((d) => d.i === i)?.o ?? 0 }))
  const marks: (Plot.Markish | null)[] = [Plot.gridY({ stroke: t.grid, strokeOpacity: 1 })]
  if (!values) {
    marks.push(
      Plot.rectY([{ a: meta.err ? 0 : -meta.tol, b: meta.tol }], { y1: 'a', y2: 'b', fill: s.ok, fillOpacity: 0.09 }),
      Plot.ruleY(meta.err ? [meta.tol] : [-meta.tol, meta.tol], { stroke: s.ok, strokeDasharray: '4 3', strokeOpacity: 0.7 }),
      meta.err ? null : Plot.ruleY([0], { stroke: t.mute }),
    )
  } else {
    marks.push(Plot.ruleY(obsByI, { y: 'y', stroke: (d: { i: number }) => meta.color(d.i), strokeDasharray: '4 3', strokeOpacity: 0.85 }))
  }
  marks.push(
    Plot.line(data, { x: 'r', y: yv, z: 'i', stroke: (d: TraceRow) => meta.color(d.i), strokeWidth: 1.9, strokeOpacity: 0.92, curve: 'monotone-x' }),
    Plot.ruleX(sel, { x: 'r', stroke: 'color', strokeWidth: 2, strokeOpacity: 0.75 }),
  )
  const m = { l: 44, r: 10, t: 8, b: 32 }
  const plot = Plot.plot({
    width: env.width,
    height: env.height,
    style: plotStyle(env),
    marginLeft: m.l,
    marginBottom: m.b,
    marginTop: m.t,
    marginRight: m.r,
    x: { label: 'Calibration round', labelAnchor: 'center', domain: [1, N], ticks: [1, 10, 20, 30, 40, 50].filter((x) => x <= N) },
    y: { label: null, grid: true, tickFormat: yTick, ticks: 5 },
    marks: marks.filter(Boolean) as Plot.Markish[],
  }) as unknown as SVGSVGElement
  const yScale = (v: number) => (plot as unknown as { scale(n: string): { apply(v: number): number } }).scale('y').apply(v)
  crosshair(plot, {
    ml: m.l,
    mr: m.r,
    mt: m.t,
    mb: m.b,
    w: env.width,
    h: env.height,
    x0: 1,
    x1: N,
    bg: t.surface,
    click: (v, e) => pick(v, e),
    spec: (v) => {
      const rr = data.filter((q) => q.r === v).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
      return {
        title: `Round ${v}`,
        sub: meta.err ? 'worst-segment error' : 'vs observed',
        rows: rr.map((q) => ({
          k: q.name,
          v: values ? meta.vfmt(q.v, q.i) : dfmt(q.d, meta),
          c: meta.color(q.i),
          d: values ? (meta.err ? '' : dfmt(q.d, meta)) : meta.err ? '' : meta.vfmt(q.v, q.i),
        })),
        foot: `${withinTolerance(rr, meta)} of ${rr.length} within ${meta.tolLabel}. Click to focus this round, shift-click to compare.`,
      }
    },
    ys: (v) => data.filter((q) => q.r === v).map((q) => ({ y: yScale(values ? q.v : q.d), c: meta.color(q.i) })),
  })
  el.replaceChildren(plot)
  return { legend: legendOf(meta, s.ok), label: `Calibration progress, ${meta.label}, ${values ? 'values' : 'difference from observed'}` }
}

export function drawTraceHeat(el: HTMLElement, env: ChartEnv): ChartResult | void {
  const s = setup(el, env)
  if (!s) return void emptyNote(el, 'No calibration roll-up for this deployment.')
  const { meta, data, sel, pick } = s
  const t = env.theme
  const N = Math.max(...data.map((d) => d.r))
  const L = meta.tol * 4
  const mid = t.mix(t.surface, t.ink, 0.16)
  const color = meta.err
    ? { type: 'linear' as const, domain: [0, 3, 6, 12], range: [s.ok, s.ok, s.warn, s.fail] }
    : { type: 'linear' as const, domain: [-L, 0, L], range: [t.tokens.c2, mid, t.tokens.c1] }
  const plot = Plot.plot({
    width: env.width,
    height: env.height,
    style: plotStyle(env),
    marginLeft: 124,
    marginBottom: 32,
    marginTop: 8,
    marginRight: 8,
    x: {
      label: 'Calibration round',
      labelAnchor: 'center',
      domain: Array.from({ length: N }, (_, i) => i + 1),
      ticks: [1, 10, 20, 30, 40, 50].filter((x) => x <= N),
      tickFormat: (d: number) => String(d),
      padding: 0.06,
    },
    y: { label: null, domain: meta.names, padding: 0.12 },
    color,
    marks: [
      Plot.cell(data, { x: 'r', y: 'name', fill: 'd', rx: 3, title: (_d: unknown, i: number) => `wfa:${i}` }),
      Plot.ruleX(sel, { x: 'r', stroke: 'color', strokeWidth: 2, strokeOpacity: 0.9 }),
    ],
  }) as unknown as SVGSVGElement
  armPlot(
    plot,
    { a: data },
    (d: TraceRow) => ({
      title: `Round ${d.r}`,
      sub: d.name,
      rows: [{ k: meta.err ? 'Worst-segment error' : 'Difference from observed', v: dfmt(d.d, meta), b: true }].concat(
        meta.err ? [] : [{ k: 'Modeled', v: meta.vfmt(d.v, d.i), b: false }, { k: 'Observed', v: meta.vfmt(d.o, d.i), b: false }],
      ),
      foot: 'Click to focus this round. Shift-click to compare.',
    }),
    (d: TraceRow, _k, e) => pick(d.r, e),
  )
  plot.style.cursor = 'pointer'
  el.replaceChildren(plot)
  return { legend: legendOf(meta, s.ok), label: `Calibration progress heatmap, ${meta.label}` }
}
