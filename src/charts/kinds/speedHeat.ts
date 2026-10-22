// Average speed, Heatmap (04-chart-catalogue.md section 13): facility type by hour, linear colour from c1 (slow) to a
// faint tint (fast), 10 to 62 mph. Drawn for one run; side-by-side cells share the grid's synced tooltip.
import * as Plot from '@observablehq/plot'

import { FACILITIES } from '@/charts/vocab'
import { emptyNote } from '@/charts/util'
import type { ChartKind } from '@/charts/types'
import { HOURS, hourTickEvery3, hourTitle, speedCells, type SpeedCell } from '@/charts/lib/timeOfDay'
import { armPlot } from '@/panels/plotInteraction'

const kind: ChartKind = {
  tables: () => ['speed_by_facility_hour'],
  draw(el, env) {
    const { theme: t } = env
    const run = env.focus?.run ?? env.scenarios[0]?.run
    const rows = speedCells(run ? env.data.rows(run, 'speed_by_facility_hour') : [])
    if (rows.length === 0) {
      emptyNote(el, 'No speed data for this scenario.')
      return { label: `${env.config.title}: no data` }
    }
    const plot = Plot.plot({
      width: env.width,
      height: env.height,
      style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: `${t.fs}px`, overflow: 'visible' },
      marginLeft: 70,
      marginBottom: 26,
      marginTop: 4,
      marginRight: 6,
      x: { label: null, domain: Array.from({ length: HOURS }, (_, h) => h), tickFormat: hourTickEvery3, padding: 0.08 },
      y: { label: null, domain: [...FACILITIES], padding: 0.12 },
      color: { type: 'linear', range: [t.tokens.c1, t.mix(t.surface, t.tokens.c1, 0.12)], domain: [10, 62] },
      marks: [Plot.cell(rows, { x: 'hour', y: 'facility', fill: 'v', rx: 4, title: (_d: unknown, i: number) => `wfa:${i}` })],
    }) as unknown as SVGSVGElement

    armPlot(plot, { a: rows }, (d: SpeedCell) => ({
      title: d.facility,
      sub: hourTitle(d.hour),
      rows: [{ k: 'Average speed', v: `${d.v.toFixed(0)} mph`, b: true }],
    }))
    if (env.pinned) {
      // Cells of a side-by-side grid: identical keys across cells drive one synced tooltip (05 section 4).
      plot.querySelectorAll('[data-wf]').forEach((node) => {
        const d = rows[Number((node.getAttribute('data-wf') ?? '').split(':')[1])]
        if (!d) return
        node.setAttribute('data-key', `${d.facility}|${d.hour}`)
        node.setAttribute('data-title', `${d.facility} · ${hourTitle(d.hour)}`)
        node.setAttribute('data-val', `${d.v.toFixed(0)} mph`)
        node.setAttribute('data-num', String(d.v))
        node.setAttribute('data-unit', ' mph')
      })
    }
    el.replaceChildren(plot)
    return { label: `Average speed by road type and hour of day, ${env.focus?.label ?? ''}`.trim() }
  },
}

export default kind
