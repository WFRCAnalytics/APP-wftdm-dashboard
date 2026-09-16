import { partition, type HierarchyRectangularNode as D3HierarchyNode } from 'd3-hierarchy'
import { arc as d3Arc } from 'd3-shape'

import type { HierarchyRenderContext, HierarchyRenderer } from '@/panels/HierarchicalChartHost'
import type { HierarchyNode } from '@/panels/hierarchyData'
import { tween, lerp } from '@/panels/hierarchyTween'
import { createMapTooltip, type MapTooltip } from '@/panels/mapTooltip'

// 058-hierarchical-chart-panels — the real, current D3 zoomable-sunburst
// technique (research.md §3b, fetched directly from Observable's own
// current `@d3/zoomable-sunburst` notebook), reimplemented with plain DOM
// (`document.createElementNS`) and a hand-rolled tween instead of
// d3-selection/d3-transition/d3.interpolate (research.md §7a). `d3.arc()`
// (from `d3-shape`, this feature's one other real new dependency) and
// `d3.partition()` (from `d3-hierarchy`) are reused exactly as the
// reference uses them — real SVG arc-path generation is genuinely
// intricate math this project has no reason to re-derive.

const SVG_NS = 'http://www.w3.org/2000/svg'
const ZOOM_DURATION_MS = 750

interface ArcCoords {
  x0: number
  x1: number
  y0: number
  y1: number
}

function arcPath(coords: ArcCoords, radius: number): string {
  const generator = d3Arc<ArcCoords>()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
    .padRadius(radius * 1.5)
    .innerRadius((d) => d.y0 * radius)
    .outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1))
  return generator(coords) ?? ''
}

// The reference's own real predicate helpers — reused verbatim (only the
// `d` argument's shape changed, from a mutated tree node's own `.current`
// to a plain ArcCoords object this renderer manages separately). Directly
// satisfies FR-009 (a negligibly-small node's label/arc must not render/
// overflow) — this is the SAME real, working mechanism the reference
// already uses for exactly that purpose, not reinvented.
function arcVisible(d: ArcCoords): boolean {
  return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0
}
function labelVisible(d: ArcCoords): boolean {
  return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03
}
function labelTransform(d: ArcCoords, radius: number): string {
  const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI
  const y = ((d.y0 + d.y1) / 2) * radius
  return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`
}

function nodeName(node: D3HierarchyNode<HierarchyNode>): string {
  return node.data.name
}

/** Every descendant colors by its own top-level (depth-1) ancestor's name
 * — the reference's own real convention (`while (d.depth > 1) d =
 * d.parent; return color(d.data.name)`), reused here and by
 * treemapRenderer.ts so both chart types read as visually consistent. */
function colorFor(node: D3HierarchyNode<HierarchyNode>, resolveColor: (name: string) => string): string {
  let d = node
  while (d.depth > 1 && d.parent) d = d.parent
  return resolveColor(nodeName(d))
}

interface SunburstState {
  rootRef: D3HierarchyNode<HierarchyNode>
  focus: D3HierarchyNode<HierarchyNode>
  radius: number
  current: WeakMap<D3HierarchyNode<HierarchyNode>, ArcCoords>
  svg: SVGSVGElement
  arcsGroup: SVGGElement
  labelsGroup: SVGGElement
  centerCircle: SVGCircleElement
  tooltip: MapTooltip
  cancelTween: (() => void) | null
}

const stateByContainer = new WeakMap<HTMLDivElement, SunburstState>()

function pointerPosition(event: MouseEvent, container: HTMLElement): { x: number; y: number } {
  const rect = container.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

const valueFormatter = new Intl.NumberFormat('en-US')

function initCurrent(root: D3HierarchyNode<HierarchyNode>, current: WeakMap<D3HierarchyNode<HierarchyNode>, ArcCoords>) {
  root.each((d) => {
    current.set(d, { x0: d.x0!, x1: d.x1!, y0: d.y0!, y1: d.y1! })
  })
}

function targetFor(d: D3HierarchyNode<HierarchyNode>, focus: D3HierarchyNode<HierarchyNode>): ArcCoords {
  const span = focus.x1! - focus.x0! || 1
  return {
    x0: Math.max(0, Math.min(1, (d.x0! - focus.x0!) / span)) * 2 * Math.PI,
    x1: Math.max(0, Math.min(1, (d.x1! - focus.x0!) / span)) * 2 * Math.PI,
    y0: Math.max(0, d.y0! - focus.depth),
    y1: Math.max(0, d.y1! - focus.depth),
  }
}

function draw(ctx: HierarchyRenderContext, state: SunburstState) {
  clearChildren(state.arcsGroup)
  clearChildren(state.labelsGroup)

  for (const d of state.rootRef.descendants().slice(1)) {
    const coords = state.current.get(d)!
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', arcPath(coords, state.radius))
    path.setAttribute('fill', colorFor(d, ctx.resolveColor))
    path.setAttribute('fill-opacity', arcVisible(coords) ? (d.children ? '0.75' : '0.55') : '0')
    path.style.pointerEvents = arcVisible(coords) ? 'auto' : 'none'
    if (d.children) {
      path.style.cursor = 'pointer'
      path.addEventListener('click', () => zoomTo(ctx, state, d))
    }
    path.dataset.nodeName = nodeName(d)
    path.dataset.nodePath = d
      .ancestors()
      .reverse()
      .slice(1)
      .map(nodeName)
      .join(' / ')
    path.dataset.nodeValue = String(d.value ?? 0)

    // FR-013: hovering ANY arc shows its real underlying value —
    // mapTooltip.ts, not a native SVG <title> (SankeyPanel.tsx's own
    // already-confirmed ~2s native-tooltip-delay finding).
    const nodeValue = d.value ?? 0
    path.addEventListener('mousemove', (event) => {
      const { x, y } = pointerPosition(event, ctx.container)
      state.tooltip.show(x, y, `<strong>${nodeName(d)}</strong><br/>${valueFormatter.format(nodeValue)}`)
    })
    path.addEventListener('mouseleave', () => state.tooltip.hide())

    state.arcsGroup.appendChild(path)

    const label = document.createElementNS(SVG_NS, 'text')
    label.setAttribute('text-anchor', 'middle')
    label.setAttribute('dy', '0.35em')
    label.setAttribute('font-size', '10')
    label.setAttribute('fill', 'currentColor')
    label.setAttribute('transform', labelTransform(coords, state.radius))
    label.style.opacity = labelVisible(coords) ? '1' : '0'
    label.style.pointerEvents = 'none'
    label.textContent = nodeName(d)
    state.labelsGroup.appendChild(label)
  }
}

function clearChildren(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild)
}

function zoomTo(ctx: HierarchyRenderContext, state: SunburstState, focus: D3HierarchyNode<HierarchyNode>) {
  state.cancelTween?.()
  const targets = new Map<D3HierarchyNode<HierarchyNode>, ArcCoords>()
  const starts = new Map<D3HierarchyNode<HierarchyNode>, ArcCoords>()
  for (const d of state.rootRef.descendants()) {
    starts.set(d, state.current.get(d)!)
    targets.set(d, targetFor(d, focus))
  }
  state.focus = focus
  state.centerCircle.style.cursor = focus.parent ? 'pointer' : 'default'
  state.centerCircle.onclick = focus.parent ? () => zoomTo(ctx, state, focus.parent!) : null

  state.cancelTween = tween(
    ZOOM_DURATION_MS,
    (t) => {
      for (const d of state.rootRef.descendants()) {
        const a = starts.get(d)!
        const b = targets.get(d)!
        state.current.set(d, {
          x0: lerp(a.x0, b.x0, t),
          x1: lerp(a.x1, b.x1, t),
          y0: lerp(a.y0, b.y0, t),
          y1: lerp(a.y1, b.y1, t),
        })
      }
      draw(ctx, state)
    },
    () => {
      state.cancelTween = null
    },
  )
}

export const sunburstRenderer: HierarchyRenderer = {
  mount(ctx) {
    const radius = Math.min(ctx.width, ctx.height) / 6
    layoutRoot(ctx.root)

    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', `${-ctx.width / 2} ${-ctx.height / 2} ${ctx.width} ${ctx.height}`)
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.display = 'block'
    ctx.container.appendChild(svg)

    const arcsGroup = document.createElementNS(SVG_NS, 'g')
    const labelsGroup = document.createElementNS(SVG_NS, 'g')
    labelsGroup.style.pointerEvents = 'none'
    const centerCircle = document.createElementNS(SVG_NS, 'circle')
    centerCircle.setAttribute('r', String(radius))
    centerCircle.setAttribute('fill', 'transparent')
    centerCircle.style.pointerEvents = 'all'

    svg.appendChild(arcsGroup)
    svg.appendChild(labelsGroup)
    svg.appendChild(centerCircle)

    const current = new WeakMap<D3HierarchyNode<HierarchyNode>, ArcCoords>()
    initCurrent(ctx.root, current)

    const tooltip = createMapTooltip(ctx.container)
    const state: SunburstState = {
      rootRef: ctx.root,
      focus: ctx.root,
      radius,
      current,
      svg,
      arcsGroup,
      labelsGroup,
      centerCircle,
      tooltip,
      cancelTween: null,
    }
    stateByContainer.set(ctx.container, state)
    draw(ctx, state)
  },

  update(ctx) {
    const state = stateByContainer.get(ctx.container)
    if (!state) {
      sunburstRenderer.mount(ctx)
      return
    }

    const isNewData = state.rootRef !== ctx.root
    const radius = Math.min(ctx.width, ctx.height) / 6
    state.svg.setAttribute('viewBox', `${-ctx.width / 2} ${-ctx.height / 2} ${ctx.width} ${ctx.height}`)
    state.radius = radius
    state.centerCircle.setAttribute('r', String(radius))

    if (isNewData) {
      state.cancelTween?.()
      state.cancelTween = null
      layoutRoot(ctx.root)
      state.rootRef = ctx.root
      state.focus = ctx.root
      state.current = new WeakMap()
      initCurrent(ctx.root, state.current)
      state.centerCircle.style.cursor = 'default'
      state.centerCircle.onclick = null
    }

    // Theme flip/resize (or the just-reset new-data case above): redraw at
    // the current `state.current` coordinates, no animation.
    draw(ctx, state)
  },

  unmount(container) {
    const state = stateByContainer.get(container)
    state?.cancelTween?.()
    state?.tooltip.destroy()
    stateByContainer.delete(container)
  },
}

function layoutRoot(root: D3HierarchyNode<HierarchyNode>) {
  partition<HierarchyNode>().size([2 * Math.PI, root.height + 1])(root)
}
