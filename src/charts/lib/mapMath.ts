// Pure logic shared by the zone-map kinds (zone-map, zone-diff-map, zone-swipe-map): colour domains and ramps, the swipe
// divider's clamping, and the camera-sync guard that links several MapLibre maps. No DOM, no MapLibre import, so all of
// it is unit-tested (tests/unit/zoneMaps.test.ts).

/** Transit share colour domain in percent: 0 to 14, the legend reads "0%" ... "14%+ transit share". */
export const SHARE_DOMAIN: readonly [number, number] = [0, 14]

/** Linear-interpolated quantile of an ascending-sorted array (d3.quantile's R-7 rule); NaN when empty. */
export function quantileSorted(sorted: readonly number[], p: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  if (n === 1) return sorted[0]
  const i = (n - 1) * Math.min(1, Math.max(0, p))
  const lo = Math.floor(i)
  const hi = Math.min(n - 1, lo + 1)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

/**
 * Half-width L of the difference colour domain: the 96th percentile of the absolute differences (so a few outlier zones
 * saturate instead of washing the rest out), never below `floor`. The ramp spans -L .. +L.
 */
export function diffDomain(values: readonly (number | null | undefined)[], floor = 0.5): number {
  const abs = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v)).map(Math.abs).sort((a, b) => a - b)
  const q = quantileSorted(abs, 0.96)
  return Number.isFinite(q) ? Math.max(floor, q) : floor
}

/** Position on the diverging ramp, -1..1 (clamped): the value over the domain half-width. */
export function divergeT(v: number, half: number): number {
  if (!Number.isFinite(v) || half <= 0) return 0
  return Math.max(-1, Math.min(1, v / half))
}

/** Position on the sequential ramp, 0..1 (clamped). */
export function sequentialT(v: number, domain: readonly [number, number] = SHARE_DOMAIN): number {
  const span = domain[1] - domain[0]
  if (!Number.isFinite(v) || span <= 0) return 0
  return Math.max(0, Math.min(1, (v - domain[0]) / span))
}

/** Rounds `v` to one decimal for legends and tooltips ("4.1"). */
export const f1 = (v: number): string => v.toFixed(1)

// ---- swipe divider ----

export const SWIPE_MARGIN = 24
export const SWIPE_STEP = 24

/** Divider x clamped to stay `margin` px from each edge (centred when the map is narrower than twice the margin). */
export function clampSwipe(x: number, width: number, margin = SWIPE_MARGIN): number {
  if (width <= margin * 2) return width / 2
  return Math.max(margin, Math.min(width - margin, x))
}

/** New divider x after a key press: arrows move 24px, Home/End jump to the edges; null for any other key. */
export function swipeKey(key: string, pos: number, width: number): number | null {
  if (key === 'ArrowLeft' || key === 'ArrowDown') return clampSwipe(pos - SWIPE_STEP, width)
  if (key === 'ArrowRight' || key === 'ArrowUp') return clampSwipe(pos + SWIPE_STEP, width)
  if (key === 'Home') return clampSwipe(0, width)
  if (key === 'End') return clampSwipe(width, width)
  return null
}

// ---- linked cameras ----

export interface Camera {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

export interface CameraMap {
  getCamera(): Camera
  /** Moves the camera at once (MapLibre's jumpTo, which fires its move events synchronously). */
  jumpTo(camera: Camera): void
}

/**
 * Keeps several maps on one camera. A map reports its own `move`; the group copies the camera to every other map with
 * a re-entrancy guard, because the copy fires `move` on those maps too. The last camera is remembered so a map that
 * joins later (paging in a grid) starts where the others are.
 */
export class CameraGroup<M extends CameraMap = CameraMap> {
  private readonly maps = new Set<M>()
  private syncing = false
  last: Camera | undefined

  add(map: M): void {
    this.maps.add(map)
  }

  remove(map: M): void {
    this.maps.delete(map)
  }

  get size(): number {
    return this.maps.size
  }

  members(): M[] {
    return [...this.maps]
  }

  /** Call from each map's `move` handler. Returns false when the call was an echo of our own sync (ignored). */
  moved(from: M): boolean {
    if (this.syncing) return false
    this.syncing = true
    try {
      const camera = from.getCamera()
      this.last = camera
      for (const m of this.maps) if (m !== from) m.jumpTo(camera)
    } finally {
      this.syncing = false
    }
    return true
  }
}
