// 065-chart-builder: a chart spec written in dashboard YAML (`type: chart, kind: custom, spec: ...`). It uses the same shape as
// the exported configuration; only the data source is shorter: `data: { table: <metric table> }`, and the scenarios are the
// dashboard's own compared runs. Pure: tests/unit/chartBuilderCustomSpec.test.ts.
import type { ChartConfig } from '@/charts/builder/spec'

export type CustomSpecResult = { ok: true; config: ChartConfig; table: string } | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v) // eslint-disable-line @typescript-eslint/no-explicit-any

export function normalizeCustomSpec(raw: unknown, runs: readonly string[]): CustomSpecResult {
  if (!isObj(raw)) return { ok: false, error: 'This chart needs a `spec:` with a table, a mark and an encoding.' }
  const rel = raw.data?.relation
  const table = String(raw.data?.table ?? raw.table ?? (typeof rel === 'string' && rel.startsWith('t:') ? rel.slice(2) : '') ?? '')
  if (!table) return { ok: false, error: 'spec.data.table: name the table to chart, for example `data: { table: trip_mode_share }`.' }
  if (!raw.mark) return { ok: false, error: 'spec.mark: choose bar, line, area, scatter, heatmap, histogram, box or pie.' }
  if (!isObj(raw.encoding)) return { ok: false, error: 'spec.encoding: place at least one field, for example `x: { field: mode }`.' }
  const config: ChartConfig = {
    version: 1,
    data: { relation: `t:${table}`, source: { scenarios: [...runs], sql: '' } },
    mark: String(raw.mark) + (raw.donut ? ':donut' : ''),
    encoding: raw.encoding,
    stack: raw.stack ?? 'group',
    filter: Array.isArray(raw.filter) ? raw.filter : [],
    axes: {
      zeroBaseline: raw.axes?.zeroBaseline === true,
      gridlines: raw.axes?.gridlines !== false,
      referenceLine: typeof raw.axes?.referenceLine === 'number' ? raw.axes.referenceLine : null,
    },
    text: isObj(raw.text) ? raw.text : {},
  }
  return { ok: true, config, table }
}
