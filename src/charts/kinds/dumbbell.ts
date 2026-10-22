// Dumbbell (project-docs/redesign/04-chart-catalogue.md section 18): one row per transit line (`variant: boards`) or per
// income group (`variant: hh`, households with no car). A light connector spans Observed and every compared run;
// scenario dots carry a surface ring, Observed is an open circle.
import * as Plot from '@observablehq/plot'

import { emptyNote } from '@/charts/util'
import {
  DUMBBELL,
  boardingsRows,
  connector,
  fmtDiff,
  fmtValue,
  householdRows,
  type AutosRow,
  type BoardingsRow,
  type DumbbellRow,
  type DumbbellVariant,
} from '@/charts/lib/dumbbell'
import { observedFooter, prefetchObservedMeta } from '@/charts/lib/observedMeta'
import type { ChartKind, ChartPlan, LegendSpec, Row } from '@/charts/types'
import { armPlot } from '@/panels/plotInteraction'

const variantOf = (plan: ChartPlan): DumbbellVariant => ((plan.config as { variant?: string }).variant === 'hh' ? 'hh' : 'boards')

const kind: ChartKind = {
  tables: (plan) => [DUMBBELL[variantOf(plan)].table],
  extraRuns: (plan) => (plan.observedRun ? [plan.observedRun] : []),
  draw(el, env) {
    const t = env.theme
    const variant = variantOf(env)
    const spec = DUMBBELL[variant]
    const runs = env.scenarios
    if (runs.length === 0) {
      emptyNote(el, 'No scenario to show.')
      return { label: 'Dumbbell: no data' }
    }
    prefetchObservedMeta(env.observedRun, spec.table)
    const rowsOf = (run: string | undefined): Row[] => (run ? env.data.rows(run, spec.table) : [])
    const obsRows = rowsOf(env.observedRun)
    const byRun = new Map(runs.map((s) => [s.run, rowsOf(s.run)]))
    const rows: DumbbellRow[] =
      variant === 'boards'
        ? boardingsRows(obsRows as unknown as BoardingsRow[], byRun as unknown as Map<string, BoardingsRow[]>)
        : householdRows(obsRows as unknown as AutosRow[], byRun as unknown as Map<string, AutosRow[]>)
    if (rows.length === 0 || runs.every((s) => (byRun.get(s.run)?.length ?? 0) === 0)) {
      emptyNote(el, 'No data for the shown scenarios.')
      return { label: 'Dumbbell: no data' }
    }
    const hasObs = rows.some((r) => r.obs !== null)
    const flat = rows.flatMap((r) => runs.map((s) => ({ label: r.label, sc: s.run, v: r.v[s.run] })))
    const seg = rows.map((r) => ({ label: r.label, ...connector(r) }))
    const color = (run: string) => runs.find((s) => s.run === run)?.color ?? t.mute
    const nameOf = (run: string) => runs.find((s) => s.run === run)?.label ?? run

    const plot = Plot.plot({
      width: env.width,
      height: env.height,
      marginLeft: spec.marginLeft,
      marginBottom: 32,
      marginTop: 6,
      marginRight: 14,
      style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: `${t.fs + 0.5}px`, overflow: 'visible' },
      x: { label: spec.axisLabel, labelAnchor: 'center', grid: false, tickFormat: (d: number) => `${d}${spec.unit === '%' ? '%' : ''}`, nice: true },
      y: { label: null, domain: rows.map((r) => r.label), padding: 0.6 },
      color: { domain: runs.map((s) => s.run), range: runs.map((s) => s.color) },
      marks: [
        Plot.ruleY(rows, { y: 'label', stroke: t.grid, strokeOpacity: 1 }),
        Plot.link(seg, { x1: 'a', x2: 'b', y1: 'label', y2: 'label', stroke: t.line, strokeWidth: 5, strokeLinecap: 'round' }),
        Plot.dot(flat, { x: 'v', y: 'label', fill: 'sc', r: 6, stroke: t.surface, strokeWidth: 2, title: (_d: unknown, i: number) => `wfa:${i}` }),
        hasObs
          ? Plot.dot(
              rows.filter((r) => r.obs !== null),
              { x: 'obs', y: 'label', r: 7.5, fill: t.surface, stroke: t.ink, strokeWidth: 2.2, title: (_d: unknown, i: number) => `wfb:${i}` },
            )
          : null,
      ].filter(Boolean) as Plot.Markish[],
    }) as unknown as SVGSVGElement

    const obsOnly = rows.filter((r) => r.obs !== null)
    armPlot(plot, { a: flat, b: obsOnly }, (d: { label: string; sc?: string; obs?: number }, key) => {
      const opt = env.config.options as { observedSource?: string; observedSample?: string } | undefined
      const foot = observedFooter(env.observedRun, spec.table, { source: opt?.observedSource, sample: opt?.observedSample })
      if (key === 'b') return { title: d.label, rows: [{ k: 'Observed', v: fmtValue(d.obs as number, spec), b: true }], foot: foot || undefined }
      const row = rows.find((r) => r.label === d.label)!
      const o = row.obs
      const list = flat.filter((q) => q.label === d.label).sort((a, b) => b.v - a.v)
      return {
        title: d.label,
        sub: spec.subtitle,
        rows: [
          ...list.map((q) => ({ k: nameOf(q.sc), v: fmtValue(q.v, spec), c: color(q.sc), b: q.sc === d.sc, d: o === null ? '' : fmtDiff(q.v - o, spec) })),
          ...(o === null ? [] : [{ k: 'Observed', v: fmtValue(o, spec), b: true, c: undefined as unknown as string, d: '' }]),
        ],
        foot: foot || undefined,
      }
    })
    el.replaceChildren(plot)

    const legend: LegendSpec = { items: runs.map((s) => ({ label: s.label, color: s.color, run: s.run })) }
    return { legend, label: `${spec.axisLabel} by ${variant === 'boards' ? 'line' : 'income group'}, ${runs.length} scenario${runs.length === 1 ? '' : 's'} against observed` }
  },
}

export default kind
