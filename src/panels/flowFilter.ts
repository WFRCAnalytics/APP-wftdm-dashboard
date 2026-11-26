// The flow map's volume filter (FlowFilterLegend.tsx): a histogram of the sizes of the lines drawn (clustered at the
// current zoom) with a two-handle range slider, so a viewer can hide the smallest lines, the largest, or both. Pure.
//
// The filter is kept as bounds in flow units (an open end keeps everything beyond it), because the lines drawn change with
// the zoom; the slider works in steps (0..FLOW_STEPS) over the current lines' range, on a log scale when sizes span more
// than an order of magnitude or so, so the long tail of small lines does not crowd the handles into one end.

export const FLOW_STEPS = 1000

export interface FlowScale {
  min: number
  max: number
  log: boolean
}

/** Slider positions, in steps. */
export type FlowRange = [number, number]

/** The filter, in flow units; an unset end is open. */
export interface FlowBounds {
  lo?: number
  hi?: number
}

/** The slider's scale over the positive sizes; null when there is nothing to filter (no lines, or all one size). */
export function flowScale(values: readonly number[]): FlowScale | null {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (!(v > 0) || !Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || max <= min) return null
  return { min, max, log: max / min >= 20 }
}

/** The size at a slider step. */
export function toValue(s: FlowScale, step: number): number {
  const t = Math.min(1, Math.max(0, step / FLOW_STEPS))
  return s.log ? Math.exp(Math.log(s.min) + t * (Math.log(s.max) - Math.log(s.min))) : s.min + t * (s.max - s.min)
}

/** The slider step of a size (clamped to the scale). */
export function toStep(s: FlowScale, v: number): number {
  const c = Math.min(s.max, Math.max(s.min, v))
  const t = s.log ? (Math.log(c) - Math.log(s.min)) / (Math.log(s.max) - Math.log(s.min)) : (c - s.min) / (s.max - s.min)
  return t * FLOW_STEPS
}

/** Whether the filter keeps every line. */
export const isOpen = (b: FlowBounds): boolean => b.lo === undefined && b.hi === undefined

/** Whether a line of size `v` is inside the bounds. */
export const inBounds = (b: FlowBounds, v: number): boolean => (b.lo === undefined || v >= b.lo) && (b.hi === undefined || v <= b.hi)

/** The slider's positions for the bounds on the current scale (an open end at its end). */
export function boundsToRange(s: FlowScale, b: FlowBounds): FlowRange {
  return [b.lo === undefined ? 0 : toStep(s, b.lo), b.hi === undefined ? FLOW_STEPS : toStep(s, b.hi)]
}

/** The bounds for slider positions (a handle at its end leaves that end open). */
export function rangeToBounds(s: FlowScale, r: FlowRange): FlowBounds {
  return { lo: r[0] <= 0 ? undefined : toValue(s, r[0]), hi: r[1] >= FLOW_STEPS ? undefined : toValue(s, r[1]) }
}

/** A CSS gradient of `colorAt` along the slider, so a colour sits right under the size it stands for. */
export function rampGradient(s: FlowScale, colorAt: (magnitude: number) => string, stops = 16): string {
  const parts: string[] = []
  for (let i = 0; i <= stops; i++) parts.push(`${colorAt(toValue(s, (i / stops) * FLOW_STEPS))} ${((i / stops) * 100).toFixed(1)}%`)
  return `linear-gradient(90deg, ${parts.join(', ')})`
}

/** Line counts in `bins` equal slices of the slider (so the bars sit right under the handles). */
export function histogram(s: FlowScale, values: readonly number[], bins: number): number[] {
  const counts = new Array<number>(bins).fill(0)
  for (const v of values) {
    if (!(v > 0) || !Number.isFinite(v)) continue
    counts[Math.min(bins - 1, Math.floor((toStep(s, v) / FLOW_STEPS) * bins))]++
  }
  return counts
}
