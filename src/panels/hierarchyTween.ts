// 058-hierarchical-chart-panels — a small, local replacement for
// d3-transition/d3.interpolate (research.md §7a: this project deliberately
// does not depend on either, matching SankeyPanel.tsx's own established
// "D3 for layout math, raw DOM/plain code for rendering and animation"
// convention). A cubic ease-in-out approximates d3's own default
// transition easing closely enough for this feature's purely cosmetic
// zoom-transition purpose — not a claim of byte-identical interpolation.

function easeCubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Runs `onFrame(easedProgress)` on every animation frame for `durationMs`,
 * easedProgress going 0 -> 1. Returns a cancel function (called by a
 * renderer's own unmount(), or before starting a new tween on the same
 * element, so an interrupted zoom never leaves two competing rAF loops
 * running against the same nodes).
 */
export function tween(durationMs: number, onFrame: (easedProgress: number) => void, onDone?: () => void): () => void {
  let cancelled = false
  const start = performance.now()

  function step(now: number) {
    if (cancelled) return
    const raw = Math.min(1, (now - start) / durationMs)
    onFrame(easeCubicInOut(raw))
    if (raw < 1) {
      requestAnimationFrame(step)
    } else {
      onDone?.()
    }
  }

  requestAnimationFrame(step)
  return () => {
    cancelled = true
  }
}

/** Linear interpolation — the plain-arithmetic replacement for
 * d3.interpolateNumber, used by both renderers to tween a handful of known
 * numeric fields. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
