import { useMemo } from 'react'

import { Slider } from '@/components/ui/slider'
import { compact, exact } from '@/charts/lib/format'
import { cn } from '@/lib/utils'
import {
  FLOW_STEPS,
  boundsToRange,
  histogram,
  inBounds,
  isOpen,
  rampGradient,
  rangeToBounds,
  toValue,
  type FlowBounds,
  type FlowScale,
} from '@/panels/flowFilter'

// The flow map's legend and volume filter in one card, bottom-left in the map. It shows the lines the map draws (clustered
// at the current zoom, so it changes as the viewer zooms): their colour ramp (flowmap.gl's own scale, so a bar is the
// colour of a line of that size) is the slider's track, a histogram of their sizes stands on it, the trimmed ends are
// washed out (after the interactive legends of Kyle Walker's mapgl) and the two handles are keyboard sliders (Radix,
// through the shared Slider). The values at the handles sit under the ends; "Reset" keeps its place, so the card never
// moves. The bounds live in FlowMapPanel and the maths in flowFilter.ts.

/** Ten bars at every zoom, so the histogram keeps its shape while the map re-clusters. */
const BINS = 10
/** A size at a handle: whole above 10 (913, 2.3k), one decimal below. */
const label = (v: number) => compact(v >= 10 ? Math.round(v) : v)

export interface FlowFilterLegendProps {
  scale: FlowScale
  /** Sizes of the lines drawn. */
  magnitudes: readonly number[]
  /** The flow map's colour for a line size (panels/flowColors.ts). */
  colorAt: (magnitude: number) => string
  bounds: FlowBounds
  onChange: (bounds: FlowBounds) => void
}

export function FlowFilterLegend({ scale, magnitudes, colorAt, bounds, onChange }: FlowFilterLegendProps) {
  const bins = BINS
  const counts = useMemo(() => histogram(scale, magnitudes, bins), [scale, magnitudes, bins])
  const barColors = useMemo(() => counts.map((_, i) => colorAt(toValue(scale, ((i + 0.5) / bins) * FLOW_STEPS))), [counts, colorAt, scale, bins])
  const gradient = useMemo(() => rampGradient(scale, colorAt), [scale, colorAt])
  const shown = useMemo(() => magnitudes.filter((m) => inBounds(bounds, m)).length, [magnitudes, bounds])
  const range = boundsToRange(scale, bounds)
  const peak = Math.max(1, ...counts)
  const open = isOpen(bounds)
  const lo = (range[0] / FLOW_STEPS) * 100
  const hi = (range[1] / FLOW_STEPS) * 100

  return (
    <div
      className="absolute bottom-2.5 left-2.5 z-[2] w-[244px] rounded-xl border border-border/70 bg-card/90 px-3 pb-2.5 pt-2.5 font-body text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_14px_rgb(0_0_0/0.08)] backdrop-blur-md"
      data-testid="flow-filter"
      role="group"
      aria-label="Flow volume filter"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold leading-5">Flow volume</span>
        <button
          type="button"
          onClick={() => onChange({})}
          tabIndex={open ? -1 : undefined}
          aria-hidden={open || undefined}
          className={cn(
            'rounded text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring',
            open && 'invisible',
          )}
        >
          Reset
        </button>
      </div>
      <div className="text-[11px] leading-4 tabular-nums text-muted-foreground" aria-live="polite">
        {open ? `All ${exact(magnitudes.length)} lines` : `${exact(shown)} of ${exact(magnitudes.length)} lines`}
      </div>

      {/* sizes; bar heights by square root, so a slice with a few lines still shows beside the crowded ones */}
      <div className="mt-2">
        <div className="flex h-9 items-end gap-[3px]" aria-hidden="true">
          {counts.map((n, i) => {
            const centre = ((i + 0.5) / bins) * 100
            return (
              <div
                key={i}
                // a hairline in the text colour keeps the palest bars visible on a light card and the darkest on a dark one
                className="flex-1 rounded-t-[2px] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_15%,transparent)] transition-opacity duration-150"
                style={{
                  height: n === 0 ? 0 : `${Math.max(8, Math.sqrt(n / peak) * 100)}%`,
                  background: barColors[i],
                  opacity: centre >= lo && centre <= hi ? 1 : 0.18,
                }}
              />
            )
          })}
        </div>
        {/* the ramp is the track; the washed-out ends are what the filter hides */}
        <Slider
          min={0}
          max={FLOW_STEPS}
          step={1}
          minStepsBetweenThumbs={20}
          value={range}
          onValueChange={(v) => onChange(rangeToBounds(scale, [v[0], v[1]]))}
          thumbLabels={['Smallest line shown', 'Largest line shown']}
          className="h-4"
          parts={{
            track: 'h-1.5 rounded-[2px] bg-transparent',
            trackStyle: { background: gradient },
            range: 'bg-transparent',
            // a small upright tab, square-cornered like the bars it stands under
            thumb:
              'h-4 w-2 rounded-[2px] border border-foreground/55 bg-card shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
          }}
          track={
            <>
              <span className="absolute inset-y-0 left-0 bg-card/75" style={{ width: `${lo}%` }} />
              <span className="absolute inset-y-0 right-0 bg-card/75" style={{ width: `${100 - hi}%` }} />
            </>
          }
        />
      </div>

      <div className="mt-1.5 flex justify-between text-[11px] font-medium tabular-nums">
        <span>{label(bounds.lo ?? scale.min)}</span>
        <span>{label(bounds.hi ?? scale.max)}</span>
      </div>
    </div>
  )
}
