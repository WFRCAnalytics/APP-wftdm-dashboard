import type { ChartConfig } from '@/components/ui/chart'
import type { RechartsPanelConfig } from '@/layout/types'
import { resolveScenarioColor, resolveScenarioLabel, type ScenarioDisplayMap } from '@/panels/scenarioDisplay'

// 029-shadcn-chart-panel — pure, DOM-free transform: tidy SQL rows (this
// app's own universal query-result shape, one row per x/series
// combination sharing a single y value column) pivoted into Recharts' own
// wide-row shape (one column per distinct series value) plus the matching
// shadcn ChartConfig. Split out of RechartsPanel.tsx for the same reason
// every other pure-logic module in this directory is (plotlyTraces.ts,
// sankeyGraph.ts, flowmapData.ts, observablePlotEncoding.ts) — easy Vitest
// coverage with no DOM/React renderer needed. See
// specs/029-shadcn-chart-panel/data-model.md §2/§3 and research.md §2/§3.

export type WideChartRow = Record<string, string | number>

const CHART_TOKEN_COUNT = 5

export interface EncodedRechartsData {
  data: WideChartRow[]
  chartConfig: ChartConfig
  seriesKeys: string[]
}

/**
 * @param rows tidy query result rows (buildPanelQuery()'s own output)
 * @param config the panel's own x/y/series field-mapping — only those
 *   three fields are read
 */
export function encodeRechartsData(
  rows: readonly Record<string, unknown>[],
  config: Pick<RechartsPanelConfig, 'x' | 'y' | 'series'>,
  // 035-scenario-label-color: optional — every existing call site with no
  // 3rd argument behaves identically to before this feature. Only applied
  // when config.series is literally 'scenario' (the column
  // services/sqlExpander.ts's $scenario.<metric> union always produces —
  // recharts/observable-plot's own x/y/series are literal column names,
  // not $-prefixed placeholders, unlike plotly's traces).
  scenarioDisplay?: ScenarioDisplayMap,
): EncodedRechartsData {
  const { x, y, series } = config

  // No series column configured — single-series case. Each row becomes
  // one wide row with exactly the x/y pair; the y field name itself is
  // the one synthetic series key.
  if (!series) {
    const data = rows.map((row) => ({ [x]: row[x] as string | number, [y]: row[y] as number }))
    return {
      data,
      chartConfig: { [y]: { label: y, color: 'var(--chart-1)' } },
      seriesKeys: [y],
    }
  }

  // Multi-series case: pivot to one output row per distinct x value, one
  // column per distinct series value. seriesKeys is built in FIRST-SEEN
  // order (never re-sorted) so color assignment is deterministic and
  // stable across re-renders of the same query result.
  const seriesKeys: string[] = []
  const seenSeriesKeys = new Set<string>()
  const rowsByX = new Map<string, WideChartRow>()

  for (const row of rows) {
    const xValue = row[x] as string
    const seriesValue = String(row[series])
    if (!seenSeriesKeys.has(seriesValue)) {
      seenSeriesKeys.add(seriesValue)
      seriesKeys.push(seriesValue)
    }
    let wideRow = rowsByX.get(xValue)
    if (!wideRow) {
      wideRow = { [x]: xValue }
      rowsByX.set(xValue, wideRow)
    }
    // A missing x/series combination is simply never assigned here,
    // leaving it `undefined` in the resulting object — a genuine no-data
    // gap, never coerced to 0 (data-model.md §3).
    wideRow[seriesValue] = row[y] as number
  }

  // 035-scenario-label-color: the pivoted-row column key (`key`, the real
  // scenario name when isScenarioSplit) is UNCHANGED — Recharts' own
  // `dataKey` must match the actual column key in `data`, so only the
  // ChartConfig's own display-only `label`/`color` fields (read by
  // shadcn's ChartTooltipContent/ChartLegendContent, never by Recharts'
  // own data binding) are substituted (FR-002/FR-003).
  const isScenarioSplit = config.series === 'scenario' && scenarioDisplay !== undefined
  const chartConfig: ChartConfig = {}
  seriesKeys.forEach((key, index) => {
    const tokenNumber = (index % CHART_TOKEN_COUNT) + 1
    const resolvedColor = isScenarioSplit ? resolveScenarioColor(key, scenarioDisplay) : undefined
    chartConfig[key] = {
      label: isScenarioSplit ? resolveScenarioLabel(key, scenarioDisplay) : key,
      // FR-008: falls back to the existing token-cycling default when no
      // color resolves (an unresolved scenario, or a non-scenario split).
      color: resolvedColor ?? `var(--chart-${tokenNumber})`,
    }
  })

  return { data: [...rowsByX.values()], chartConfig, seriesKeys }
}
