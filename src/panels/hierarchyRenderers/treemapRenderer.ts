import { treemap, treemapBinary, type HierarchyRectangularNode as D3HierarchyNode } from 'd3-hierarchy'

import type { HierarchyRenderContext, HierarchyRenderer } from '@/panels/HierarchicalChartHost'
import type { HierarchyNode } from '@/panels/hierarchyData'
import { tween, lerp } from '@/panels/hierarchyTween'
import { createMapTooltip, type MapTooltip } from '@/panels/mapTooltip'

// 058-hierarchical-chart-panels — the real, current D3 zoomable-treemap
// technique (research.md §3a, fetched directly from Observable's own
// current `@d3/zoomable-treemap` notebook), reimplemented with plain DOM
// (`document.createElementNS`) and a hand-rolled linear scale + tween
// instead of d3-selection/d3-transition/d3-scale (research.md §7a —
// matching SankeyPanel.tsx's own established precedent). `d3-hierarchy`'s
// own `treemap`/`treemapBinary` layout functions are reused exactly as the
// reference uses them — only the DOM/animation layer is reimplemented.

const SVG_NS = 'http://www.w3.org/2000/svg'
const TITLE_BAR_HEIGHT = 24
const ZOOM_DURATION_MS = 750
const MIN_LABEL_WIDTH = 32
const MIN_LABEL_HEIGHT = 14

// The reference's own real custom tile() — lays out at the FULL content
// size every time (treemapBinary), then rescales into whatever box this
// call was actually asked to fill. This is what lets the SAME, one-time
// layout computation serve every zoom level: only the x/y SCALES (below)
// change on zoom, never the underlying treemap layout itself.
function tile(node: D3HierarchyNode<HierarchyNode>, x0: number, y0: number, x1: number, y1: number, contentW: number, contentH: number) {
  treemapBinary(node, 0, 0, contentW, contentH)
  for (const child of node.children ?? []) {
    child.x0 = x0 + (child.x0 / contentW) * (x1 - x0)
    child.x1 = x0 + (child.x1 / contentW) * (x1 - x0)
    child.y0 = y0 + (child.y0 / contentH) * (y1 - y0)
    child.y1 = y0 + (child.y1 / contentH) * (y1 - y0)
  }
}

function scaleValue(value: number, domain: readonly [number, number], range: readonly [number, number]): number {
  const [d0, d1] = domain
  const [r0, r1] = range
  if (d1 === d0) return r0
  return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0)
}

interface TreemapState {
  rootRef: D3HierarchyNode<HierarchyNode>
  focus: D3HierarchyNode<HierarchyNode>
  svg: SVGSVGElement
  contentGroup: SVGGElement
  tooltip: MapTooltip
  cancelTween: (() => void) | null
}

const stateByContainer = new WeakMap<HTMLDivElement, TreemapState>()

function nodeName(node: D3HierarchyNode<HierarchyNode>): string {
  return node.data.name
}

function nodePath(node: D3HierarchyNode<HierarchyNode>): string {
  return node
    .ancestors()
    .reverse()
    .slice(1)
    .map(nodeName)
    .join(' / ')
}

/** Every descendant colors by its own top-level (depth-1) ancestor's name
 * — matches the real zoomable-sunburst reference's own established
 * convention, reused here too so the two chart types read as visually
 * consistent with each other. */
function colorFor(node: D3HierarchyNode<HierarchyNode>, resolveColor: (name: string) => string): string {
  let d = node
  while (d.depth > 1 && d.parent) d = d.parent
  return resolveColor(nodeName(d))
}

function clearChildren(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild)
}

function pointerPosition(event: MouseEvent, container: HTMLElement): { x: number; y: number } {
  const rect = container.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

const valueFormatter = new Intl.NumberFormat('en-US')

/** Builds one <g> per child of `node`, positioned via the given x/y
 * domains mapped onto [0, contentWidth]/[0, contentHeight] — plus a title
 * bar for `node` itself (the current focus), clickable to zoom out. */
function buildGroup(
  ctx: HierarchyRenderContext,
  tooltip: MapTooltip,
  node: D3HierarchyNode<HierarchyNode>,
  xDomain: readonly [number, number],
  yDomain: readonly [number, number],
  contentWidth: number,
  contentHeight: number,
  onZoomIn: (child: D3HierarchyNode<HierarchyNode>) => void,
  onZoomOut: () => void,
): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g')

  // Title bar for the current focus node — clicking it zooms out one level,
  // matching the reference's own `d === root ? zoomout : zoomin` split.
  const titleGroup = document.createElementNS(SVG_NS, 'g')
  const titleRect = document.createElementNS(SVG_NS, 'rect')
  titleRect.setAttribute('x', '0')
  titleRect.setAttribute('y', '0')
  titleRect.setAttribute('width', String(contentWidth))
  titleRect.setAttribute('height', String(TITLE_BAR_HEIGHT))
  titleRect.setAttribute('fill', node.parent ? 'currentColor' : 'transparent')
  titleRect.setAttribute('fill-opacity', node.parent ? '0.15' : '0')
  titleGroup.appendChild(titleRect)
  if (node.parent) {
    titleGroup.style.cursor = 'pointer'
    titleGroup.addEventListener('click', onZoomOut)
    const titleText = document.createElementNS(SVG_NS, 'text')
    titleText.setAttribute('x', '6')
    titleText.setAttribute('y', String(TITLE_BAR_HEIGHT / 2))
    titleText.setAttribute('dy', '0.35em')
    titleText.setAttribute('fill', 'currentColor')
    titleText.setAttribute('font-size', '11')
    titleText.textContent = `← ${nodePath(node) || nodeName(node)}`
    titleGroup.appendChild(titleText)
  }
  group.appendChild(titleGroup)

  const contentGroup = document.createElementNS(SVG_NS, 'g')
  contentGroup.setAttribute('transform', `translate(0, ${TITLE_BAR_HEIGHT})`)
  group.appendChild(contentGroup)

  for (const child of node.children ?? []) {
    const x0 = scaleValue(child.x0!, xDomain, [0, contentWidth])
    const x1 = scaleValue(child.x1!, xDomain, [0, contentWidth])
    const y0 = scaleValue(child.y0!, yDomain, [0, contentHeight])
    const y1 = scaleValue(child.y1!, yDomain, [0, contentHeight])
    const w = Math.max(0, x1 - x0)
    const h = Math.max(0, y1 - y0)

    const nodeGroup = document.createElementNS(SVG_NS, 'g')
    nodeGroup.setAttribute('transform', `translate(${x0}, ${y0})`)
    nodeGroup.dataset.nodeName = nodeName(child)

    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('width', String(w))
    rect.setAttribute('height', String(h))
    rect.setAttribute('fill', colorFor(child, ctx.resolveColor))
    rect.setAttribute('stroke', 'var(--card, #fff)')
    rect.setAttribute('stroke-width', '1')
    nodeGroup.appendChild(rect)

    if (child.children) {
      nodeGroup.style.cursor = 'pointer'
      nodeGroup.addEventListener('click', () => onZoomIn(child))
    }

    // FR-013: hovering ANY node (leaf or not) shows its real underlying
    // value — mapTooltip.ts, not a native SVG <title> (SankeyPanel.tsx's
    // own already-confirmed ~2s native-tooltip-delay finding).
    const nodeValue = child.value ?? 0
    nodeGroup.addEventListener('mousemove', (event) => {
      const { x, y } = pointerPosition(event, ctx.container)
      tooltip.show(x, y, `<strong>${nodeName(child)}</strong><br/>${valueFormatter.format(nodeValue)}`)
    })
    nodeGroup.addEventListener('mouseleave', () => tooltip.hide())

    // FR-009: a negligibly small node renders with no overflowing/broken
    // label — hidden below a minimum pixel size, clipped otherwise.
    if (w >= MIN_LABEL_WIDTH && h >= MIN_LABEL_HEIGHT) {
      const clipId = `treemap-clip-${Math.random().toString(36).slice(2)}`
      const clipPath = document.createElementNS(SVG_NS, 'clipPath')
      clipPath.id = clipId
      const clipRect = document.createElementNS(SVG_NS, 'rect')
      clipRect.setAttribute('width', String(w))
      clipRect.setAttribute('height', String(h))
      clipPath.appendChild(clipRect)
      nodeGroup.appendChild(clipPath)

      const text = document.createElementNS(SVG_NS, 'text')
      text.setAttribute('x', '4')
      text.setAttribute('y', '14')
      text.setAttribute('clip-path', `url(#${clipId})`)
      // currentColor (research.md §5) — inherits this app's real,
      // already-correct text color cascade, no separate resolution.
      text.setAttribute('fill', 'currentColor')
      text.setAttribute('font-size', '11')
      text.textContent = nodeName(child)
      nodeGroup.appendChild(text)
    }

    contentGroup.appendChild(nodeGroup)
  }

  return group
}

function renderFocus(
  ctx: HierarchyRenderContext,
  state: TreemapState,
  focus: D3HierarchyNode<HierarchyNode>,
  animate: boolean,
  previousFocus?: D3HierarchyNode<HierarchyNode>,
) {
  state.cancelTween?.()
  const contentHeight = ctx.height - TITLE_BAR_HEIGHT
  const xDomain: [number, number] = [focus.x0!, focus.x1!]
  const yDomain: [number, number] = [focus.y0!, focus.y1!]

  const onZoomIn = (child: D3HierarchyNode<HierarchyNode>) => renderFocus(ctx, state, child, true, focus)
  const onZoomOut = () => {
    if (focus.parent) renderFocus(ctx, state, focus.parent, true, focus)
  }

  const nextGroup = buildGroup(ctx, state.tooltip, focus, xDomain, yDomain, ctx.width, contentHeight, onZoomIn, onZoomOut)

  if (!animate || !previousFocus) {
    clearChildren(state.contentGroup)
    state.contentGroup.appendChild(nextGroup)
    state.focus = focus
    return
  }

  // Crossfade: the previous group fades out while the new one fades in —
  // matching the reference's own zoomin()/zoomout() dual-fade exactly,
  // via a plain opacity tween instead of d3-transition.
  const previousGroup = state.contentGroup.firstElementChild as SVGGElement | null
  nextGroup.style.opacity = '0'
  state.contentGroup.appendChild(nextGroup)
  state.focus = focus

  state.cancelTween = tween(
    ZOOM_DURATION_MS,
    (t) => {
      nextGroup.style.opacity = String(lerp(0, 1, t))
      if (previousGroup) previousGroup.style.opacity = String(lerp(1, 0, t))
    },
    () => {
      previousGroup?.remove()
      state.cancelTween = null
    },
  )
}

export const treemapRenderer: HierarchyRenderer = {
  mount(ctx) {
    layoutRoot(ctx.root, ctx.width, ctx.height - TITLE_BAR_HEIGHT)

    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${ctx.width} ${ctx.height}`)
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.display = 'block'
    ctx.container.appendChild(svg)

    const contentGroup = document.createElementNS(SVG_NS, 'g')
    svg.appendChild(contentGroup)

    const tooltip = createMapTooltip(ctx.container)
    const state: TreemapState = { rootRef: ctx.root, focus: ctx.root, svg, contentGroup, tooltip, cancelTween: null }
    stateByContainer.set(ctx.container, state)
    renderFocus(ctx, state, ctx.root, false)
  },

  update(ctx) {
    const state = stateByContainer.get(ctx.container)
    if (!state) {
      treemapRenderer.mount(ctx)
      return
    }

    const isNewData = state.rootRef !== ctx.root
    state.svg.setAttribute('viewBox', `0 0 ${ctx.width} ${ctx.height}`)

    if (isNewData) {
      layoutRoot(ctx.root, ctx.width, ctx.height - TITLE_BAR_HEIGHT)
      state.rootRef = ctx.root
      // data-model.md: any new query result resets the zoom to root.
      renderFocus(ctx, state, ctx.root, false)
      return
    }

    // Theme flip or resize only — re-lay-out at the (possibly new) size and
    // redraw at the SAME focus node, no zoom reset, no animation.
    layoutRoot(ctx.root, ctx.width, ctx.height - TITLE_BAR_HEIGHT)
    renderFocus(ctx, state, state.focus, false)
  },

  unmount(container) {
    const state = stateByContainer.get(container)
    state?.cancelTween?.()
    state?.tooltip.destroy()
    stateByContainer.delete(container)
  },
}

function layoutRoot(root: D3HierarchyNode<HierarchyNode>, width: number, height: number) {
  treemap<HierarchyNode>()
    .tile((node, x0, y0, x1, y1) => tile(node, x0, y0, x1, y1, width, height))
    .size([width, height])(root)
}
