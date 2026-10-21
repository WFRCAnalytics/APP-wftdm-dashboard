// Population pyramid (project-docs/redesign/04-chart-catalogue.md section 16). Observable Plot: bars for the synthetic
// population (males left, females right), an ink tick at the census estimate. Same in every scenario.
import * as Plot from '@observablehq/plot'

import { emptyNote, num, str } from '@/charts/util'
import { AGE_BANDS, pyramidDifference, pyramidRows, pyramidTick, type PyramidRow } from '@/charts/lib/pyramid'
import type { ChartKind } from '@/charts/types'
import { armPlot } from '@/panels/plotInteraction'

const TABLE = 'population_age_sex'

const kind: ChartKind = {
  tables: () => [TABLE],
  extraRuns: (plan) => (plan.observedRun ? [plan.observedRun] : []),
  draw(el, env) {
    const t = env.theme
    const run = env.focus?.run ?? env.scenarios[0]?.run
    const read = (r: string | undefined) =>
      (r ? env.data.rows(r, TABLE) : []).map((x) => ({ age_band: str(x, 'age_band'), sex: str(x, 'sex'), persons: num(x, 'persons'), moe: x.moe == null ? null : num(x, 'moe') }))
    const model = read(run)
    if (model.length === 0) {
      emptyNote(el, 'No population data for this scenario.')
      return { label: 'Population by age and sex: no data' }
    }
    const rows = pyramidRows(model, read(env.observedRun))
    const hasObs = rows.some((r) => r.o !== 0)
    const cMale = t.tokens.c1
    const cFemale = t.tokens.c2

    const plot = Plot.plot({
      width: env.width,
      height: env.height,
      marginLeft: 44,
      marginBottom: 26,
      marginTop: 6,
      marginRight: 6,
      style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: `${t.fs}px`, overflow: 'visible' },
      x: { label: null, grid: false, tickFormat: pyramidTick, ticks: 6 },
      y: { label: null, domain: [...AGE_BANDS], padding: 0.22 },
      color: { domain: ['Male', 'Female'], range: [cMale, cFemale] },
      marks: [
        Plot.barX(rows, { x: 'v', y: 'age', fill: 'sex', rx: 3, title: (_d: unknown, i: number) => `wfa:${i}` }),
        hasObs ? Plot.tickX(rows, { x: 'o', y: 'age', stroke: t.ink, strokeWidth: 1.6, strokeOpacity: 0.85 }) : null,
        Plot.ruleX([0], { stroke: t.line }),
      ].filter(Boolean) as Plot.Markish[],
    }) as unknown as SVGSVGElement

    armPlot(plot, { a: rows }, (d: PyramidRow) => ({
      title: `Age ${d.age}`,
      rows: [
        { k: d.sex, v: `${Math.abs(Math.round(d.v))}k`, c: d.sex === 'Male' ? cMale : cFemale, b: true },
        ...(hasObs
          ? [
              { k: 'Census estimate', v: `${Math.abs(Math.round(d.o))}k`, d: d.moe != null ? `±${Math.round(d.moe)}k` : '' },
              { k: 'Difference', v: pyramidDifference(d.v, d.o) },
            ]
          : []),
      ],
    }))
    el.replaceChildren(plot)

    return {
      legend: { items: [{ label: 'Male', color: cMale }, { label: 'Female', color: cFemale }, ...(hasObs ? [{ label: 'Census estimate', dash: true }] : [])] },
      label: 'Population by age and sex, synthetic population bars with census estimate ticks',
    }
  },
}

export default kind
