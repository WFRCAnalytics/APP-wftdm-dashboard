import { highlightMode, isolateScenario } from '@/panels/crossHighlight'
import type { LegendSpec } from '@/charts/types'
import { prettyOperators } from '@/services/typography'

// The tile's legend row (project-docs/redesign/05-tooltips-and-interaction.md section 3): round colour chips; hovering
// a run chip isolates that run in the tile, hovering a mode chip cross-highlights the mode in every chart.

export interface ChartLegendProps {
  spec: LegendSpec
  /** Where the chart lives, for run isolation. */
  chartEl: HTMLElement | null
  /** lowercase hex -> run, for isolation. */
  runColors: ReadonlyMap<string, string>
}

export function ChartLegend({ spec, chartEl, runColors }: ChartLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-[14px] gap-y-1" data-testid="chart-legend">
      {spec.items.map((item) => (
        <span
          key={`${item.label}:${item.run ?? item.mode ?? ''}`}
          className="inline-flex cursor-default items-center gap-[7px]"
          data-lm={item.mode}
          data-sc={item.run}
          onMouseEnter={() => {
            if (item.mode) highlightMode(item.mode)
            else if (item.run && chartEl) isolateScenario(chartEl, runColors, item.run)
          }}
          onMouseLeave={() => {
            if (item.mode) highlightMode(null)
            else if (item.run && chartEl) isolateScenario(chartEl, runColors, null)
          }}
        >
          {item.dash ? (
            <i aria-hidden="true" className="inline-block h-0 w-[14px] border-t-2 border-dashed border-[var(--ink)]" />
          ) : (
            <i aria-hidden="true" className="inline-block size-[10px] rounded-full" style={{ background: item.color }} />
          )}
          {prettyOperators(item.label)}
        </span>
      ))}
      {spec.diverge && (
        <span className="inline-flex items-center gap-2">
          {spec.diverge.lowLabel}
          <i
            aria-hidden="true"
            className="inline-block h-2 w-[120px] rounded"
            style={{ background: `linear-gradient(90deg, ${spec.diverge.low}, ${spec.diverge.mid}, ${spec.diverge.high})` }}
          />
          {spec.diverge.highLabel}
        </span>
      )}
    </div>
  )
}
