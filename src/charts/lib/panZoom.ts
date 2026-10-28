// Pan and zoom for the charts whose geometry has no axes to keep honest (Sankey, chord, radar, pie, treemap, sunburst, waffle).
// One d3-zoom behaviour over the whole drawing: drag pans, the wheel zooms, a double click resets. Everything the chart drew
// moves into one group first, so the chart's own selectors, tooltips and cross-highlight keep working untouched.
// Axis charts are left out on purpose: scaling a drawn axis would stretch its ticks and labels.
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import 'd3-transition'

import { tooltip } from '@/services/tooltip'

const NS = 'http://www.w3.org/2000/svg'
const MAX_SCALE = 8

export interface PanZoomOptions {
  /** `always`: the wheel zooms (a full-height chart card). `modifier`: only Ctrl/Cmd + wheel, so a scrolling page still scrolls. */
  wheel?: 'always' | 'modifier'
}

export interface PanZoom {
  reset(): void
  /** Removes the listeners and puts the drawing back where it was. */
  dispose(): void
}

/**
 * Wires pan and zoom to `layer`. Without one, the svg's children are moved into a new group first (for drawings built with D3).
 * A framework-rendered drawing passes its own wrapper group, so its children are never moved.
 */
export function attachPanZoom(svg: SVGSVGElement, width: number, height: number, opts: PanZoomOptions = {}, own?: SVGGElement | null): PanZoom {
  let layer = own
  if (!layer) {
    layer = document.createElementNS(NS, 'g')
    layer.setAttribute('data-zoom-layer', '')
    while (svg.firstChild) layer.appendChild(svg.firstChild)
    svg.appendChild(layer)
  }
  const target = layer

  const modifier = opts.wheel === 'modifier'
  const behavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, MAX_SCALE])
    .extent([[0, 0], [width, height]])
    // keep the drawing from being dragged away entirely: at least a quarter of it stays in view
    .translateExtent([[-width * 0.75, -height * 0.75], [width * 1.75, height * 1.75]])
    .filter((e: Event) => {
      if (e.type === 'dblclick') return false // reset instead, below
      if (e.type === 'wheel') return !modifier || (e as WheelEvent).ctrlKey || (e as WheelEvent).metaKey
      return !(e as MouseEvent).button
    })
    .on('start', () => tooltip.hide())
    .on('zoom', (e) => {
      target.setAttribute('transform', e.transform.toString())
      svg.style.cursor = e.transform.k > 1 ? 'grab' : ''
    })

  const sel = select(svg)
  sel.call(behavior).on('dblclick.zoom', null)
  const reset = () => { sel.transition().duration(220).call(behavior.transform, zoomIdentity) }
  svg.addEventListener('dblclick', reset)
  return {
    reset,
    dispose() {
      svg.removeEventListener('dblclick', reset)
      sel.interrupt().on('.zoom', null)
      svg.style.cursor = ''
      if (own) target.removeAttribute('transform')
      ;(svg as unknown as { __zoom?: unknown }).__zoom = zoomIdentity
    },
  }
}
