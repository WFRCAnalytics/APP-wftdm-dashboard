// 065-chart-builder: `type: chart, kind: custom, spec: {...}`. Draws a chart from the same specification the Explore builder
// exports, so a chart built there can be pasted into a dashboard tab. The data comes from one metric table across the tile's
// compared runs; DuckDB does the grouping, so only the small result reaches the browser. See contracts/chart-spec.md.
import { buildChart, shelfProblem, type Col, type Row } from '@/charts/builder/compile'
import { normalizeCustomSpec } from '@/charts/builder/customSpec'
import { chartQuery } from '@/charts/builder/specToSql'
import { fromConfig, type ChartSpec } from '@/charts/builder/spec'
import { renderChartSvg } from '@/charts/builder/svg'
import { describeTable, viewName } from '@/explore/relations'
import { buildSql, emptyModel, planQuery, relationColumns } from '@/explore/sql/queryModel'
import { runUserSql, type UserQueryResult } from '@/explore/sql/runUserSql'
import { emptyNote } from '@/charts/util'
import type { ChartKind, ChartPlan, LegendSpec } from '@/charts/types'

interface Loaded { spec?: ChartSpec; cols?: Col[]; rows?: Row[]; error?: string }

const kind: ChartKind = {
  // the kind registers its own views; it never asks the panel to load whole tables into the browser
  tables: () => [],
  async loadExtra(plan: ChartPlan): Promise<Loaded> {
    const runs = plan.scenarios.map((s) => s.run)
    if (!runs.length) return { error: 'No scenario to show.' }
    const n = normalizeCustomSpec((plan.config as { spec?: unknown }).spec, runs)
    if (!n.ok) return { error: n.error }
    let info
    try { info = await describeTable(runs[0], n.table) } catch { return { error: `The table "${n.table}" is not available for this scenario.` } }
    const cols = relationColumns(info, runs).map((c) => ({ name: c.name, type: c.type }))
    const parsed = fromConfig(JSON.stringify(n.config), { scenarios: runs, columnsOf: () => cols })
    if (!parsed.ok) return { error: parsed.errors.join(' ') }
    const problem = shelfProblem(parsed.spec, cols)
    if (problem) return { error: problem }
    const relSql = buildSql(planQuery({ table: n.table, scenarios: runs, tables: { [n.table]: info }, viewName }, emptyModel()), emptyModel())
    const q = chartQuery(parsed.spec, relSql)
    const res: UserQueryResult = await runUserSql(q.sql, { page: 0, pageSize: 50_000 })
    if (res.outcome !== 'ok') return { error: 'reason' in res ? res.reason : 'The data could not be read.' }
    const names = res.columns.map((c) => c.name)
    return { spec: { ...parsed.spec, enc: q.spec.enc }, cols, rows: res.rows.map((r) => Object.fromEntries(names.map((c, i) => [c, r[i]]))) }
  },
  draw(el, env) {
    const x = env.extra as Loaded | undefined
    if (!x || x.error || !x.spec || !x.cols || !x.rows) {
      emptyNote(el, x?.error ?? 'This chart has no data.')
      return
    }
    const model = buildChart({ spec: x.spec, cols: x.cols, rows: x.rows, theme: env.theme, width: env.width, height: env.height, hot: null })
    if (model.problem !== undefined) {
      emptyNote(el, model.problem)
      return
    }
    el.replaceChildren(renderChartSvg(model, env.width, env.height, env.theme.ink))
    const items = model.legend.flatMap((g) =>
      g.items.filter((i) => i.label).map((i) => ({ label: i.label, color: /^(#|rgb|var)/.test(i.fill) ? i.fill : i.stroke !== 'none' ? i.stroke : undefined, dash: i.dash ? true : undefined })),
    )
    const legend: LegendSpec | undefined = items.length ? { items } : undefined
    return { legend, label: x.spec.text.title.t || 'Custom chart' }
  },
}

export default kind
