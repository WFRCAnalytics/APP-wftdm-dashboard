// Where a label goes on an arc or a pie slice. Fit or move, never squeeze: the text is measured, then it goes horizontal,
// along the arc or along the radius, whichever reads best and still lies wholly inside the arc; if none does it is
// left off (the tooltip and legend carry it). Pure geometry plus one measuring helper; no DOM beyond an optional canvas.
// Angles run clockwise from 12 o'clock, like d3-shape's arc.

let ctx: CanvasRenderingContext2D | null | undefined
const cache = new Map<string, number>()

/** Width of `text` in px: the canvas measures it when there is one, else a per-character estimate. */
export function textWidth(text: string, size: number, weight: number | string = 400, family = 'sans-serif'): number {
  const key = `${weight}|${size}|${family}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  if (ctx === undefined) {
    try { ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d') } catch { ctx = null }
  }
  let w = text.length * size * 0.56
  if (ctx) {
    ctx.font = `${weight} ${size}px ${family}`
    const m = ctx.measureText(text).width
    if (m > 0) w = m
  }
  if (cache.size > 2000) cache.clear()
  cache.set(key, w)
  return w
}

export interface ArcGeom { a0: number; a1: number; ir: number; or: number }
export interface ArcPlacement {
  mode: 'horizontal' | 'along' | 'radial'
  /** Centre of the text, relative to the pie's centre. */
  x: number
  y: number
  /** Rotation in degrees, already flipped so the text never reads upside down. */
  rot: number
}

const TAU = Math.PI * 2
/** Smallest signed angle from b to a, in (-PI, PI]. */
const diff = (a: number, b: number) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d <= -Math.PI) d += TAU; return d }

/** Whether a w x h box centred at (cx, cy) and turned by rot degrees lies inside the annular sector, with `pad` px to spare. */
export function boxInSector(g: ArcGeom, cx: number, cy: number, w: number, h: number, rot: number, pad = 3): boolean {
  const am = (g.a0 + g.a1) / 2, half = (g.a1 - g.a0) / 2
  const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180)
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const dx = (sx * w) / 2, dy = (sy * h) / 2
    const x = cx + dx * c - dy * s, y = cy + dx * s + dy * c
    const r = Math.hypot(x, y)
    if (r < g.ir + pad || r > g.or - pad) return false
    // angular room: the corner's angle from the arc's middle must stay inside the half-width, less the pad as an angle
    if (Math.abs(diff(Math.atan2(x, -y), am)) > half - pad / Math.max(r, 1)) return false
  }
  return true
}

/** The best way to lay a w x h label inside an arc, or null when it fits no way. Horizontal text is preferred, then along the arc, then along the radius. */
export function placeArcLabel(g: ArcGeom, w: number, h: number): ArcPlacement | null {
  const am = (g.a0 + g.a1) / 2, rc = (g.ir + g.or) / 2
  const x = rc * Math.sin(am), y = -rc * Math.cos(am)
  const deg = (am * 180) / Math.PI
  const bottom = Math.cos(am) < 0
  const tries: ArcPlacement[] = [
    { mode: 'horizontal', x, y, rot: 0 },
    { mode: 'along', x, y, rot: deg + (bottom ? 180 : 0) },
    { mode: 'radial', x, y, rot: deg - 90 + (deg > 180 ? 180 : 0) },
  ]
  return tries.find((p) => boxInSector(g, p.x, p.y, w, h, p.rot)) ?? null
}

/** `translate(x,y) rotate(rot)` for a text anchored in the middle (with dy .35em), as a placement says. */
export const arcLabelTransform = (p: ArcPlacement): string => `translate(${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}) rotate(${Math.round(p.rot * 10) / 10})`

export interface Side<T> { item: T; y: number }
/**
 * Spreads labels down one side of a pie so none overlap: each wants a y, keeps at least `gap` from the one above, and the
 * whole run is slid back inside [lo, hi] (the usual outside-labels pass). Returns the same items with their settled y.
 */
export function spreadLabels<T>(items: Side<T>[], gap: number, lo: number, hi: number): Side<T>[] {
  const s = items.map((i) => ({ ...i })).sort((a, b) => a.y - b.y)
  for (let i = 0; i < s.length; i++) s[i].y = Math.max(s[i].y, i === 0 ? lo : s[i - 1].y + gap)
  const over = s.length ? s[s.length - 1].y - hi : 0
  if (over > 0) {
    s[s.length - 1].y -= over
    for (let i = s.length - 2; i >= 0; i--) s[i].y = Math.min(s[i].y, s[i + 1].y - gap)
  }
  return s
}
