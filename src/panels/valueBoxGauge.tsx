import { layoutGauge, type GaugeStatus } from '@/panels/gaugeGeometry'
import { formatValue } from '@/panels/formatValue'
import type { ValueBoxGaugeConfig } from '@/layout/types'

// 034-metric-panel-redesign's own gauge follow-on — a third, independent,
// optional value-box visual mode alongside sparkline/baseline_trend,
// mirroring valueBoxSparkline.tsx's own shape (a small, fixed-size,
// chrome-minimal embedded visual, rendered only once ValueBoxPanel.tsx's
// own primary fetch is already 'ready' — no data fetch of its own at all,
// unlike sparkline/baseline_trend, since a gauge visualizes the SAME
// scalar `value` the panel already has).

const OUTER_RADIUS = 64
const INNER_RADIUS = 44
const PADDING = 8
const WIDTH = OUTER_RADIUS * 2 + PADDING * 2
const HEIGHT = OUTER_RADIUS + PADDING * 2

// No dedicated --warning/amber token exists in this app's tokens.css
// (scenarioStatusColor.ts's own history already records a real prior
// decision NOT to invent one when a real status didn't strictly need
// it) — --chart-2 is reused for "warn" instead, this app's own real,
// already WCAG-verified amber-gold categorical token (rechartsPanel.css's
// own recorded palette history), rather than adding and re-verifying a
// new token pair for this one component.
const STATUS_COLOR: Record<GaugeStatus, string> = {
  normal: 'var(--success)',
  warn: 'var(--chart-2)',
  fail: 'var(--destructive)',
}

export function ValueBoxGauge({
  value,
  config,
  format,
  observed,
  thresholdWarn,
  thresholdFail,
}: {
  value: number
  config: ValueBoxGaugeConfig
  /** The panel's own `format` string — reused for the min/max end labels
   * so they read in the same units/precision as the metric itself
   * (e.g. a percent-formatted metric gets percent-formatted end labels,
   * not a bare, un-unit-ed number). */
  format: string
  observed?: number
  thresholdWarn?: number
  thresholdFail?: number
}) {
  const geometry = layoutGauge(
    value,
    config.min,
    config.max,
    OUTER_RADIUS,
    INNER_RADIUS,
    observed,
    thresholdWarn,
    thresholdFail,
  )
  const cx = WIDTH / 2
  const cy = HEIGHT - PADDING

  // aria-hidden — the panel's own primary number (ValueBoxPanel.tsx's
  // existing top row) already conveys the real value as plain, accessible
  // text; this is a purely supplementary visual, same convention
  // valueBoxSparkline.tsx's own container already established.
  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        data-gauge-status={geometry.status}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          <path d={geometry.trackPath} fill="var(--muted)" />
          <path d={geometry.valuePath} fill={STATUS_COLOR[geometry.status]} />
          {geometry.targetTick && (
            <line
              x1={geometry.targetTick.x1}
              y1={geometry.targetTick.y1}
              x2={geometry.targetTick.x2}
              y2={geometry.targetTick.y2}
              stroke="var(--foreground)"
              strokeWidth={2}
              data-gauge-target="true"
            />
          )}
        </g>
      </svg>
      <div className="flex w-full justify-between px-1 font-body text-[10px] text-muted-foreground">
        <span>{formatValue(config.min, format)}</span>
        <span>{formatValue(config.max, format)}</span>
      </div>
    </div>
  )
}
