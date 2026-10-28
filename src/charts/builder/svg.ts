// 065-chart-builder: draws a compiled chart model into the DOM as one SVG, for the chart kinds that fill an element
// (the `custom` kind in dashboard tiles). The Explore builder draws the same model with React instead.
import type { DrawnChart } from '@/charts/builder/compile'
import { drawHierarchy, type HierState } from '@/charts/builder/hierarchyDraw'
import type { ChartTheme } from '@/charts/types'
import { attachPanZoom } from '@/charts/lib/panZoom'
import { tooltip } from '@/services/tooltip'

const NS = 'http://www.w3.org/2000/svg'
function el(name: string, attrs: Record<string, string | number | undefined>, parent?: Element): SVGElement {
  const e = document.createElementNS(NS, name)
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== '') e.setAttribute(k, String(v))
  parent?.appendChild(e)
  return e
}

export function renderChartSvg(model: DrawnChart, width: number, height: number, ink: string, zoomable = false, hier?: { theme: ChartTheme; state: HierState }): SVGSVGElement {
  // a treemap or sunburst is drawn as a zoomable hierarchy, a Sankey with a node to focus on: click to open or filter
  if ((model.trees || model.sankeys) && hier) {
    const h = drawHierarchy(model, hier.theme, hier.state)
    h.setAttribute('width', String(width))
    h.setAttribute('height', String(height))
    return h
  }
  const svg = el('svg', { width, height, viewBox: `0 0 ${model.W} ${model.H}`, role: 'img' }) as SVGSVGElement
  svg.style.overflow = 'visible'
  const defs = el('defs', {}, svg)
  for (const d of model.defs) {
    const p = el('pattern', { id: d.id, patternUnits: 'userSpaceOnUse', width: 8, height: 8 }, defs)
    el('rect', { width: 8, height: 8, fill: d.color, 'fill-opacity': 0.16 }, p)
    el('path', { d: d.d, stroke: d.color, 'stroke-width': d.sw, fill: d.fill }, p)
  }
  for (const pn of model.panels) {
    const g = el('g', { transform: pn.tf }, svg)
    if (pn.title) { const t = el('text', { x: 0, y: 11, 'font-size': 12.5, 'font-weight': 600, fill: ink }, g); t.textContent = pn.title }
    for (const l of pn.lines) el('line', { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, stroke: l.stroke, 'stroke-width': l.sw, 'stroke-dasharray': l.dash }, g)
    for (const r of pn.rects) el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.rx, fill: r.fill, stroke: r.stroke, 'stroke-width': 1, opacity: r.op, 'data-t': r.tip }, g)
    for (const p of pn.paths) el('path', { d: p.d, fill: p.fill, stroke: p.stroke, 'stroke-width': p.sw, 'stroke-dasharray': p.dash, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: p.op, 'data-t': p.tip }, g)
    for (const x of pn.texts) { const t = el('text', { x: x.x, y: x.y, 'text-anchor': x.anchor, fill: x.fill, 'font-size': x.size, transform: x.tf, stroke: x.halo, 'stroke-width': x.halo ? 3 : undefined, 'paint-order': x.halo ? 'stroke' : undefined, 'stroke-linejoin': x.halo ? 'round' : undefined }, g); t.textContent = x.t }
  }
  const show = (e: MouseEvent) => {
    const t = (e.target as Element).getAttribute?.('data-t')
    if (!t) { tooltip.hide(); return }
    const [title, ...rest] = t.split('~')
    tooltip.show({ title, rows: rest.map((p) => { const i = p.indexOf('='); return { k: p.slice(0, i), v: p.slice(i + 1) } }) }, e)
  }
  svg.addEventListener('mouseover', show)
  svg.addEventListener('mousemove', show)
  svg.addEventListener('mouseleave', () => tooltip.hide())
  // a dashboard page scrolls, so the wheel only zooms with Ctrl or Cmd held
  if (zoomable) attachPanZoom(svg, model.W, model.H, { wheel: 'modifier' })
  return svg
}
