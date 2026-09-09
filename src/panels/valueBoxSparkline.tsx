import { Bar, BarChart, Line, LineChart, ResponsiveContainer } from 'recharts'

import { encodeRechartsData } from '@/panels/rechartsEncoding'
import type { ValueBoxSparklineConfig } from '@/layout/types'

// 034-metric-panel-redesign (data-model.md §4 zone 4, research.md §2) —
// a small, minimal-chrome embedded chart for a value-box panel's optional
// sparkline mode. Reuses this app's own EXISTING chart-rendering
// capability (Recharts, already installed for the `recharts` panel type,
// 029-shadcn-chart-panel) and its existing, tested tidy-rows-to-wide-rows
// transform (encodeRechartsData(), rechartsEncoding.ts, UNMODIFIED) —
// deliberately NOT the full shadcn ChartContainer/axes/tooltip/legend
// chrome RechartsPanel.tsx uses for a full-size chart panel: a sparkline
// by definition has none of that, just the shape. Bare `recharts`
// primitives directly, matching this app's own "reuse the library, not a
// new rendering engine" instruction.
export function ValueBoxSparkline({
  rows,
  config,
}: {
  rows: Record<string, unknown>[]
  config: ValueBoxSparklineConfig
}) {
  const { data, seriesKeys } = encodeRechartsData(rows, { x: config.x, y: config.y })
  const seriesKey = seriesKeys[0] ?? config.y
  const ChartComponent = config.chart_type === 'line' ? LineChart : BarChart
  const MarkComponent = config.chart_type === 'line' ? Line : Bar

  return (
    <div className="h-10 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <ChartComponent data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          {config.chart_type === 'line' ? (
            <MarkComponent
              dataKey={seriesKey}
              type="monotone"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ) : (
            <MarkComponent dataKey={seriesKey} fill="var(--chart-1)" radius={2} isAnimationActive={false} />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  )
}
