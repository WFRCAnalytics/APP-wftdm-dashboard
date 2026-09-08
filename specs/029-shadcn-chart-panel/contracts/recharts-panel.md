# Contract: `RechartsPanel` (`src/panels/RechartsPanel.tsx`)

Satisfies FR-001 through FR-012. The tenth panel type — the first to reuse
`buildPanelQuery()` with literally zero modification to shared query code.

## Config grammar (`dashboard-*.yaml`)

```yaml
- type:       recharts
  title:      Mode Share by Purpose
  metric:     trip_mode_share
  chart_type: bar            # 'bar' | 'line' | 'area'
  x:          purpose
  y:          share
  series:     mode           # optional
  stacked:    false          # optional, default false
  scenario:   good_scenario  # optional, same meaning as every other type
  filter:     purpose        # optional, same $ref/inline-map grammar
  comparison: side_by_side   # optional, same grammar as plotly/table/observable-plot
  height:     350
  width:      1.0
```

## Shape

```tsx
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  ChartLegend, ChartLegendContent,
} from '@/components/ui/chart'
import { Bar, BarChart, Line, LineChart, Area, AreaChart, XAxis, CartesianGrid } from 'recharts'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import {
  buildPanelQuery, resolveActiveScenarios, extractGlobalFilterIds, EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { encodeRechartsData } from '@/panels/rechartsEncoding'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { RechartsPanelConfig } from '@/layout/types'

export function RechartsPanel({ config }: { config: RechartsPanelConfig }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const filters = useFilterState(extractGlobalFilterIds(config))
  const activeScenarioNames = useActiveScenarios()

  // Data fetch — identical shape to PlotlyPanel.tsx/ObservablePlotPanel.tsx's
  // own existing effect. buildPanelQuery() is called completely
  // UNMODIFIED — this panel type needed zero changes to shared query code.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(config, activeScenarioNames)
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)
    query(sql).then((result) => {
      if (cancelled) return
      if (result.length === 0) { setStatus('empty'); return }
      setRows(result)
      setStatus('ready')
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [config, filters, activeScenarioNames])

  if (status === 'error') return <PanelErrorState message="Couldn't load this chart" />
  if (status === 'empty') return <PanelEmptyState icon={ChartNoAxesColumn} message="No data for this selection" />
  if (status === 'loading') return <div className="animate-pulse rounded-md bg-muted" style={{ height: config.height ?? 350 }} />

  const { data, chartConfig, seriesKeys } = encodeRechartsData(rows, config)
  const ChartComponent = { bar: BarChart, line: LineChart, area: AreaChart }[config.chart_type]
  const MarkComponent = { bar: Bar, line: Line, area: Area }[config.chart_type]

  return (
    <ChartContainer config={chartConfig} style={{ height: config.height ?? 350 }}>
      <ChartComponent data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={config.x} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {seriesKeys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {seriesKeys.map((key) => (
          <MarkComponent
            key={key}
            dataKey={key}
            fill={`var(--color-${key})`}
            stroke={`var(--color-${key})`}
            stackId={config.stacked ? 'stack' : undefined}
          />
        ))}
      </ChartComponent>
    </ChartContainer>
  )
}
```

`extractGlobalFilterIds`/`resolveActiveScenarios`/`EMPTY_SUMMARIZE_CONFIG`
are all existing `panelQuery.ts` exports, reused unmodified — the same
ones `PlotlyPanel.tsx`/`TablePanel.tsx`/`ObservablePlotPanel.tsx` already
import. Illustrative only — the actual implementation task confirms exact
prop names against the real, CLI-generated `chart.tsx` and Recharts 3.x's
own real API before finalizing.

## What does NOT change

- `panels/panelQuery.ts` — zero changes, `buildPanelQuery()` untouched.
- `services/sqlExpander.ts` — zero changes.
- `panels/PlotlyPanel.tsx`/`ObservablePlotPanel.tsx`/`SankeyPanel.tsx` —
  zero changes, fully unaffected (FR-010).
- `panels/registry.tsx` — one new line (`recharts: RechartsPanel`), no
  change to any existing entry.

## Explicitly out of scope (do not build)

- Sankey rendering of any kind (FR-011) — `chart_type` has no `'sankey'`
  option; this is enforced by the type union itself, not a runtime check
  bolted on afterward.
- Legend click-to-toggle (FR-007) — `ChartLegendContent` is used exactly
  as shadcn ships it, no custom `onClick` wiring added.
- `pie`/`radar`/`radial` chart types (FR-004) — not in the `chart_type`
  union in this version.
- Panel-local reactive `inputs:` (Observable Plot's own capability) — not
  part of `RechartsPanelConfig` in this version.
