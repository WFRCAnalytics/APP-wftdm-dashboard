// Hover plumbing shared by Observable Plot and D3 charts (project-docs/redesign/05-tooltips-and-interaction.md
// sections 5-6): `armPlot` turns Plot's native <title> nodes into the shared tooltip, `crosshair` draws a snapping
// guide with one dot per series on a continuous x axis. Neither uses Plot's own tip or pointer transform.
import { select } from 'd3-selection'

import { tooltip, type TipSpec } from '@/services/tooltip'

/**
 * Give each mark `title: (d, i) => 'wfa:' + i` (a store key, then the index in the rows array), draw the plot, then
 * call this. It removes every native <title> (so no browser tooltip appears) and maps the tag to the datum.
 */
export function armPlot(
  plot: Element,
  store: Record<string, readonly unknown[]>,
  spec: (d: any, key: string) => TipSpec | null,
  click?: (d: any, key: string, e: MouseEvent) => void,
): void {
  plot.querySelectorAll('title').forEach((t) => {
    const parent = t.parentElement
    const text = t.textContent ?? ''
    if (parent && text.startsWith('wf')) parent.setAttribute('data-wf', text)
    t.remove()
  })
  const lookup = (target: EventTarget | null): { d: unknown; key: string } | null => {
    const node = target instanceof Element ? target.closest('[data-wf]') : null
    if (!node) return null
    const [key, index] = (node.getAttribute('data-wf') ?? '').slice(2).split(':')
    const d = store[key]?.[Number(index)]
    return d === undefined ? null : { d, key }
  }
  plot.addEventListener('mousemove', (e) => {
    const hit = lookup(e.target)
    const s = hit && spec(hit.d, hit.key)
    if (s) tooltip.show(s, e as MouseEvent)
    else tooltip.hide()
  })
  plot.addEventListener('mouseleave', () => tooltip.hide())
  if (click) {
    plot.addEventListener('click', (e) => {
      const hit = lookup(e.target)
      if (hit) click(hit.d, hit.key, e as MouseEvent)
    })
  }
}

export interface CrossOptions {
  /** The plot margins passed to Plot, in px. */
  ml: number
  mr: number
  mt: number
  mb: number
  /** Plot size in px. */
  w: number
  h: number
  /** Domain endpoints of x. */
  x0: number
  x1: number
  /** Snap a raw x to a data x. Default: Math.round clamped to [x0, x1]. */
  snap?: (raw: number) => number
  /** Ring colour of the dots (the surface). */
  bg: string
  spec: (x: number) => TipSpec
  /** Pixel y and colour of each series' dot at x. */
  ys?: (x: number) => { y: number; c: string }[]
  /** Makes the plot clickable; receives the snapped x. */
  click?: (x: number, e: MouseEvent) => void
}

/** Pure part of the crosshair: pointer x (px from the svg's left) to a snapped data x, or null outside the plot area. */
export function crosshairX(px: number, o: Pick<CrossOptions, 'ml' | 'mr' | 'w' | 'x0' | 'x1' | 'snap'>): number | null {
  if (px < o.ml - 4 || px > o.w - o.mr + 4) return null
  const raw = o.x0 + ((px - o.ml) / (o.w - o.ml - o.mr)) * (o.x1 - o.x0)
  return o.snap ? o.snap(raw) : Math.max(o.x0, Math.min(o.x1, Math.round(raw)))
}

/**
 * Shared crosshair for a continuous x axis: a dashed guide, one dot per series, one tooltip. Returns a function that
 * moves it from code (keyboard navigation); `null` hides it.
 */
export function crosshair(
  plot: SVGSVGElement,
  o: CrossOptions,
): (x: number | null, at?: { clientX: number; clientY: number }) => void {
  const g = select(plot).append('g').style('pointer-events', 'none').style('display', 'none')
  const line = g
    .append('line')
    .attr('y1', o.mt)
    .attr('y2', o.h - o.mb)
    .attr('stroke', 'currentColor')
    .attr('stroke-opacity', 0.4)
    .attr('stroke-dasharray', '3 3')
  const dots = g.append('g')
  const X = (v: number) => o.ml + ((v - o.x0) / (o.x1 - o.x0)) * (o.w - o.ml - o.mr)

  const move = (v: number | null, at?: { clientX: number; clientY: number }) => {
    if (v === null) {
      g.style('display', 'none')
      tooltip.hide()
      return
    }
    g.style('display', null)
    line.attr('x1', X(v)).attr('x2', X(v))
    let ys: { y: number; c: string }[] = []
    try {
      ys = o.ys ? o.ys(v) : []
    } catch {
      ys = []
    }
    dots
      .selectAll('circle')
      .data(ys)
      .join('circle')
      .attr('cx', X(v))
      .attr('cy', (d) => d.y)
      .attr('r', 4.5)
      .attr('fill', (d) => d.c)
      .attr('stroke', o.bg)
      .attr('stroke-width', 2)
    if (at) tooltip.show(o.spec(v), at)
  }

  plot.addEventListener('mousemove', (e) => {
    const r = plot.getBoundingClientRect()
    move(crosshairX(e.clientX - r.left, o), e)
  })
  plot.addEventListener('mouseleave', () => move(null))
  if (o.click) {
    const onClick = o.click
    plot.style.cursor = 'pointer'
    plot.addEventListener('click', (e) => {
      const r = plot.getBoundingClientRect()
      const v = crosshairX(e.clientX - r.left, o)
      if (v !== null) onClick(v, e)
    })
  }
  return move
}
