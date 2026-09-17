// Pure, DOM-free (mirrors panels/pieData.ts's own reasoning) — d3-shape's
// arc() generator is itself a pure layout computation with no DOM
// dependency, so this whole module, including the actual geometry call,
// is Vitest-testable in `environment: 'node'` with zero DOM shim.
// panels/valueBoxGauge.tsx is the only real caller — this module never
// resolves a color/CSS token itself, matching the project's own
// established "geometry stays pure, color/DOM resolution lives in the
// .tsx component" split (pieData.ts/sankeyGraph.ts/radarData.ts all draw
// the same line).
import { arc as d3Arc } from 'd3-shape'

export type GaugeStatus = 'normal' | 'warn' | 'fail'

export interface GaugeTargetTick {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface GaugeGeometry {
  /** SVG <path> `d` for the full-range background track. */
  trackPath: string
  /** SVG <path> `d` for the filled arc from `min` up to the clamped value. */
  valuePath: string
  /** A thin radial tick at `observed`'s own angle — only present when
   * `observed` is configured (contracts: no tick with nothing to mark). */
  targetTick?: GaugeTargetTick
  status: GaugeStatus
  /** The value actually used for layout, clamped to [min, max] — a
   * real value outside the configured range still renders (pinned to
   * the nearer end), never a crash or a blank gauge. */
  clampedValue: number
  /** 0-1 — the clamped value's own position within [min, max]. */
  ratio: number
}

// A half-circle "speedometer" sweep: -90° (9 o'clock) through 0° (12
// o'clock) to +90° (3 o'clock), matching d3's own arc-angle convention
// (0 at 12 o'clock, increasing clockwise) — the same convention pieData.ts/
// radarData.ts already build against. A full 360°/270° gauge was
// considered and rejected: a half-circle reads unambiguously as "empty
// on the left, full on the right," the same left-to-right mental model
// this app's every other axis/scale already uses (barY's own x-axis,
// TLFD distributions, ...); a fuller sweep needs a needle or numeric
// readout to stay legible, adding real complexity for a marginal gain at
// this component's small, embedded-in-a-value-box scale.
const START_ANGLE = -Math.PI / 2
const END_ANGLE = Math.PI / 2

/**
 * `observed` (a real, external reference value — e.g. a survey/count
 * figure) and `thresholdWarn`/`thresholdFail` (an ACCEPTABLE ABSOLUTE
 * DEVIATION from it, in the same units as the metric itself) — the
 * calibration-tolerance semantics project-docs/GRAMMAR.md has documented
 * since before this mode existed. `observed` unset means "no target
 * configured" — a plain progress gauge, always 'normal' (no status to
 * judge against). A configured `thresholdFail` with no `thresholdWarn`
 * is valid (fail-only tolerance); the reverse is too (warn-only, no hard
 * failure boundary) — neither implies the other.
 */
export function resolveGaugeStatus(
  value: number,
  observed: number | undefined,
  thresholdWarn: number | undefined,
  thresholdFail: number | undefined,
): GaugeStatus {
  if (observed === undefined) return 'normal'
  const diff = Math.abs(value - observed)
  if (thresholdFail !== undefined && diff > thresholdFail) return 'fail'
  if (thresholdWarn !== undefined && diff > thresholdWarn) return 'warn'
  return 'normal'
}

/**
 * @param min/max the gauge's own configured range (ValueBoxGaugeConfig).
 *   A degenerate/inverted range (max <= min) is defended against by
 *   treating the range as [min, min + 1] — never a divide-by-zero NaN
 *   path, matching this app's own "structurally unreachable through
 *   valid config, still caught defensively" convention (a real author
 *   typo, not expected in practice).
 */
export function layoutGauge(
  value: number,
  min: number,
  max: number,
  outerRadius: number,
  innerRadius: number,
  observed?: number,
  thresholdWarn?: number,
  thresholdFail?: number,
): GaugeGeometry {
  const safeMax = max > min ? max : min + 1
  const clampedValue = Math.min(safeMax, Math.max(min, value))
  const ratio = (clampedValue - min) / (safeMax - min)
  const valueAngle = START_ANGLE + ratio * (END_ANGLE - START_ANGLE)

  const arcGenerator = d3Arc().innerRadius(innerRadius).outerRadius(outerRadius)
  const trackPath = arcGenerator({ startAngle: START_ANGLE, endAngle: END_ANGLE } as never) ?? ''
  const valuePath = arcGenerator({ startAngle: START_ANGLE, endAngle: valueAngle } as never) ?? ''

  const status = resolveGaugeStatus(value, observed, thresholdWarn, thresholdFail)

  let targetTick: GaugeTargetTick | undefined
  if (observed !== undefined) {
    const clampedObserved = Math.min(safeMax, Math.max(min, observed))
    const observedRatio = (clampedObserved - min) / (safeMax - min)
    const observedAngle = START_ANGLE + observedRatio * (END_ANGLE - START_ANGLE)
    // Plain trig matching d3's own arc-angle convention (0 at 12 o'clock,
    // clockwise): x = sin(angle), y = -cos(angle) (SVG y grows downward).
    // Drawn slightly outside/inside the track's own radii (±4px) so the
    // tick visibly crosses the ring rather than sitting flush with its edges.
    targetTick = {
      x1: Math.sin(observedAngle) * (innerRadius - 4),
      y1: -Math.cos(observedAngle) * (innerRadius - 4),
      x2: Math.sin(observedAngle) * (outerRadius + 4),
      y2: -Math.cos(observedAngle) * (outerRadius + 4),
    }
  }

  return { trackPath, valuePath, targetTick, status, clampedValue, ratio }
}
