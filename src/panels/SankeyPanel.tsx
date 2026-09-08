import { useEffect, useRef, useState } from 'react'
import { Waypoints } from 'lucide-react'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import {
  buildPanelQuery,
  resolveActiveScenarios,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { buildFlowGraph, layoutFlowGraph, type SankeyLayout } from '@/panels/sankeyGraph'
import { resolveNamedColorScheme } from '@/panels/sankeyColor'
import { createMapTooltip, type MapTooltip } from '@/panels/mapTooltip'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { SankeyPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// Token-derived categorical fallback (research.md §6) — resolved once per
// rebuild against the mounted container's computed style, not hardcoded
// hex values, so a future tokens.css change is picked up automatically.
// This is genuinely new territory for this codebase: neither
// PlotlyPanel.tsx nor observablePlotEncoding.ts sets an explicit
// categorical palette today (both rely on their charting library's own
// default) — research.md §6 documents why that "precedent" doesn't
// actually exist and why this panel type builds one anyway.
const FALLBACK_TOKEN_VARS = ['--primary', '--brand-wfrc-secondary-blue', '--brand-wfrc-yellow', '--brand-wfrc-gray']
// Last-resort literal values (tokens.css's own current values) — only used
// if getComputedStyle somehow resolves none of the vars above (e.g. no
// stylesheet loaded at all), so a render never ships with an empty palette.
const FALLBACK_HEX_COLORS = ['#023c5b', '#52b6d5', '#f8b93e', '#7f7a76']

function resolveFallbackColors(el: HTMLElement): string[] {
  const style = getComputedStyle(el)
  const resolved = FALLBACK_TOKEN_VARS.map((v) => style.getPropertyValue(v).trim()).filter(Boolean)
  return resolved.length > 0 ? resolved : FALLBACK_HEX_COLORS
}

const SVG_NS = 'http://www.w3.org/2000/svg'

// Real, confirmed bug (not application logic at all): every link <path>/
// node <rect> used to carry a native SVG <title> child for its hover text.
// Native title-attribute tooltips are shown by the BROWSER itself, on a
// fixed OS-level timer, historically well over a second (Chrome) before
// ever appearing — the ENTIRE ~2s hover delay, confirmed by finding this
// <title> usage directly (not a debounce/setTimeout/d3 event-binding issue
// anywhere in this file). Replaced with the SAME shared, instant, custom
// tooltip component this project already built and proved this session for
// FlowMapPanel.tsx/ZoneMapPanel.tsx's own hover — mapTooltip.ts is already
// fully framework/library-agnostic (plain DOM, `show(x, y, html)` taking
// container-relative pixel coordinates) with no map-specific assumption
// anywhere in its own implementation, so reusing it here needed zero
// changes to that module — a real THIRD caller confirming its own
// "shared across panel types" design intent, not a new bespoke tooltip.
//
// `container` is the same element the tooltip was created against
// (`createMapTooltip(el)` in the mount effect below) — needed here only to
// convert each mouse event's viewport-relative clientX/clientY into
// coordinates relative to that container's own top-left corner, exactly
// what mapTooltip.ts's own `show()` contract expects (the same conversion
// MapLibre's MapMouseEvent.point/deck.gl's PickingInfo.x/y already do for
// the two map panel types, done by hand here since a raw native DOM event
// carries no such convenience).
function renderSvg(
  layout: SankeyLayout,
  width: number,
  height: number,
  colors: readonly string[],
  tooltip: MapTooltip,
  container: HTMLElement,
): SVGSVGElement {
  const colorForId = new Map<string, string>()
  let colorIndex = 0
  const colorFor = (id: string): string => {
    let color = colorForId.get(id)
    if (!color) {
      color = colors[colorIndex % colors.length]
      colorIndex += 1
      colorForId.set(id, color)
    }
    return color
  }

  // id -> real label lookup, so link tooltips show "SOV → HOV" rather than
  // the internal side-namespaced node id ("source:SOV -> target:HOV") the
  // removed <title> text literally rendered before — a real, minor content
  // quality fix that falls directly out of building real tooltip content
  // here instead of a one-line native title string, not a separate,
  // unrelated change.
  const labelById = new Map(layout.nodes.map((n) => [n.id, n.label]))

  function showTooltip(event: MouseEvent, html: string) {
    const rect = container.getBoundingClientRect()
    tooltip.show(event.clientX - rect.left, event.clientY - rect.top, html)
  }

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('role', 'img')

  const linksGroup = document.createElementNS(SVG_NS, 'g')
  linksGroup.setAttribute('fill', 'none')
  for (const link of layout.links) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', link.path)
    path.setAttribute('stroke', colorFor(link.sourceId))
    path.setAttribute('stroke-opacity', '0.4')
    path.setAttribute('stroke-width', String(Math.max(link.width, 1)))
    path.setAttribute('data-source-id', link.sourceId)
    path.setAttribute('data-target-id', link.targetId)
    path.setAttribute('data-value', String(link.value))
    const sourceLabel = labelById.get(link.sourceId) ?? link.sourceId
    const targetLabel = labelById.get(link.targetId) ?? link.targetId
    const html = `<strong>${sourceLabel} → ${targetLabel}</strong><br/>${link.value}`
    path.addEventListener('mousemove', (event) => showTooltip(event, html))
    path.addEventListener('mouseleave', () => tooltip.hide())
    linksGroup.appendChild(path)
  }
  svg.appendChild(linksGroup)

  const nodesGroup = document.createElementNS(SVG_NS, 'g')
  for (const node of layout.nodes) {
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', String(node.x0))
    rect.setAttribute('y', String(node.y0))
    rect.setAttribute('width', String(Math.max(node.x1 - node.x0, 1)))
    rect.setAttribute('height', String(Math.max(node.y1 - node.y0, 1)))
    rect.setAttribute('fill', colorFor(node.id))
    rect.setAttribute('data-node-id', node.id)
    rect.setAttribute('data-node-side', node.side)
    const html = `<strong>${node.label}</strong>`
    rect.addEventListener('mousemove', (event) => showTooltip(event, html))
    rect.addEventListener('mouseleave', () => tooltip.hide())
    nodesGroup.appendChild(rect)

    const text = document.createElementNS(SVG_NS, 'text')
    // Source-side labels sit to the right of their node, target-side to
    // the left — the conventional Sankey label placement so labels don't
    // overlap the diagram's own flow area.
    const labelX = node.side === 'source' ? node.x1 + 6 : node.x0 - 6
    text.setAttribute('x', String(labelX))
    text.setAttribute('y', String((node.y0 + node.y1) / 2))
    text.setAttribute('dy', '0.35em')
    text.setAttribute('text-anchor', node.side === 'source' ? 'start' : 'end')
    text.setAttribute('font-size', '12')
    // wftdm-design-system skill audit (Phase 3 Batch 2) — a real,
    // confirmed dark-mode bug, the same class this project has hit
    // before (Plotly's hardcoded backgrounds, Observable Plot's tip
    // fill): raw SVG's own initial `fill` value is black, and nothing
    // here or in any stylesheet ever set one — confirmed live,
    // getComputedStyle() read a literal `rgb(0, 0, 0)` in dark mode.
    // Currently borderline-legible only by coincidence (these labels sit
    // just outside each node's own colored rect, over the flow area,
    // whose blended colors happen to still contrast against pure black
    // today) — genuinely broken the moment a label lands over the plain
    // dark page background instead. `currentColor` matches Observable
    // Plot's own tip-mark fix (this file's own PlotlyPanel.tsx/
    // ObservablePlotPanel.tsx sibling precedent): this SVG mounts in the
    // normal light DOM (no shadow root), so it inherits shell.tsx's own
    // real `text-foreground` class through ordinary CSS cascade, no
    // getComputedStyle()-and-set-inline resolution needed the way a CSS
    // custom property (PlotlyPanel's font.color, ObservablePlotPanel's
    // --plot-background) would.
    text.setAttribute('fill', 'currentColor')
    text.textContent = node.label
    nodesGroup.appendChild(text)
  }
  svg.appendChild(nodesGroup)

  return svg
}

// The sixth and final originally-listed panel type — see
// contracts/sankey-panel.md and specs/008-sankey-panel/research.md.
// Genuinely different from every prior chart panel type in two ways:
// (1) a new rows-to-graph transform problem (sankeyGraph.ts, research.md
// §4/§7), (2) d3-sankey computes layout only, never DOM — this component
// builds and owns real SVG markup itself (research.md §2), unlike
// PlotlyPanel's Plotly.react() call or ObservablePlotPanel's Plot.plot()
// call.
export function SankeyPanel({ config }: { config: SankeyPanelConfig }) {
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  // 009-scenario-manager (FR-008): reactive active-scenario set — see
  // ValueBoxPanel.tsx's own comment.
  const activeScenarioNames = useActiveScenarios()
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<MapTooltip | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])

  // Mount-only: create the shared hover tooltip (mapTooltip.ts) once,
  // against this panel's own container — same lifetime/cleanup convention
  // as FlowMapPanel.tsx/ZoneMapPanel.tsx's own tooltip. Deliberately NOT
  // recreated inside the render-and-swap effect below (which replaces the
  // <svg> on every data/resize change) — the tooltip div is a SEPARATE,
  // persistent sibling of the <svg> inside this same container, never
  // touched by that effect's own svg-only swap (see its own comment).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const tooltip = createMapTooltip(el)
    tooltipRef.current = tooltip
    return () => {
      tooltip.destroy()
      tooltipRef.current = null
    }
  }, [])

  // Data fetch — identical shape to every other data-bound panel type
  // (PlotlyPanel.tsx/ObservablePlotPanel.tsx). Does NOT build the
  // FlowGraph or call d3-sankey's layout itself — that happens in the
  // render-and-swap effect below, which also needs the
  // ResizeObserver-measured container size.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(config, activeScenarioNames)
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)

    query(sql)
      .then((result) => {
        if (cancelled) return
        if (result.length === 0) {
          setStatus('empty')
          return
        }
        setRows(result)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [config, filters, activeScenarioNames])

  // Render-and-swap effect: builds the FlowGraph once per data change,
  // then (re)runs layoutFlowGraph + rebuilds the <svg> on both a data
  // change AND a ResizeObserver-triggered resize (research.md §3 —
  // d3-sankey's extent is pixel-absolute, unlike a CSS viewBox rescale).
  //
  // The last-rendered-size guard (lastWidth/lastHeight) is declared as
  // plain local variables INSIDE this effect's body, not a component-level
  // useRef — an earlier draft used useRef and was found to silently break
  // filter-driven re-renders at an unchanged container size (a useRef
  // persists across the component's full lifetime, so the "same size as
  // last render" check incorrectly skipped a real data-driven rebuild).
  // Local variables reset fresh every time this effect re-runs for a real
  // reason (config/rows/status change), matching ObservablePlotPanel.tsx's
  // own real, already-shipped render() closure exactly.
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return
    const el = containerRef.current

    const graph = buildFlowGraph(config, rows)
    if (graph.excludedCount > 0) {
      console.warn(
        `SankeyPanel "${config.title}" (metric: ${config.metric}): excluded ${graph.excludedCount} row(s) with a non-positive value.`,
      )
    }

    let lastWidth = -1
    let lastHeight = -1
    let renderCount = 0

    const rebuild = () => {
      const tooltip = tooltipRef.current
      if (!tooltip) return
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 || height === 0) return
      if (width === lastWidth && height === lastHeight) return
      lastWidth = width
      lastHeight = height
      try {
        const layout = layoutFlowGraph(graph, width, height)
        const colors = resolveNamedColorScheme(config.color_scheme) ?? resolveFallbackColors(el)
        const svg = renderSvg(layout, width, height, colors, tooltip, el)
        // Swap ONLY the <svg> — never el.replaceChildren(svg), which would
        // also wipe the tooltip div the mount effect above appended as a
        // separate, persistent sibling inside this same container.
        svgRef.current?.remove()
        el.appendChild(svg)
        svgRef.current = svg
        renderCount += 1
        el.dataset.renderCount = String(renderCount)
      } catch {
        // A cyclic graph (research.md §4's defensive backstop — structurally
        // unreachable through valid config, still caught here rather than
        // assumed impossible) or any other layout failure.
        setStatus('error')
      }
    }

    rebuild()
    const observer = new ResizeObserver(rebuild)
    observer.observe(el)
    return () => observer.disconnect()
  }, [config, rows, status])

  // Deliberately no separate unmount-only teardown effect (unlike
  // PlotlyPanel.tsx's Plotly.purge()/ObservablePlotPanel.tsx's
  // plotElementRef.current?.remove()) — this component owns plain DOM
  // nodes it built itself via document.createElementNS, with no external
  // library instance holding a reference that needs explicit disposal;
  // React unmounting the container removes them along with it.

  if (status === 'empty') {
    return <PanelEmptyState icon={Waypoints} message="No data for this selection" />
  }
  if (status === 'error') {
    return <PanelErrorState message="Couldn't load this diagram" />
  }

  return (
    <>
      {status === 'loading' && (
        // wftdm-design-system skill's Skeleton composition recipe (Phase 3
        // Batch 1) — a shaped skeleton matching a Sankey's own real
        // structure: two node-columns (source left, target right), each a
        // vertical stack of block placeholders. Column/block counts are
        // arbitrary placeholders (the real node count isn't known until
        // buildFlowGraph() runs) — this is deliberately NOT an attempt at
        // faking the flow paths between them (a decorative loading
        // placeholder doesn't need to be that literal), just the two-
        // sided node structure a Sankey diagram is instantly recognizable
        // by, which a plain rectangle never suggested at all.
        <div className="flex items-stretch justify-between gap-8" style={{ height: config.height ?? 350 }} aria-hidden="true">
          <div className="flex flex-1 flex-col justify-around gap-2 py-2">
            {[28, 20, 16, 10, 8].map((h, i) => (
              <div key={i} className="animate-pulse rounded-sm bg-muted" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="flex flex-1 flex-col justify-around gap-2 py-2">
            {[22, 18, 14, 10].map((h, i) => (
              <div key={i} className="animate-pulse rounded-sm bg-muted" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="sankey-chart"
        style={{
          width: '100%',
          // 100%, not a fixed pixel height — same reasoning
          // PlotlyPanel.tsx/ObservablePlotPanel.tsx already document: this
          // container is the same DOM node whether inline or inside 004's
          // expand dialog.
          height: '100%',
          // relative — mapTooltip.ts's own documented requirement: its
          // tooltip div is `position: absolute`, anchored to the nearest
          // positioned ancestor, which must be THIS container (matching
          // FlowMapPanel.tsx/ZoneMapPanel.tsx's own map container, which
          // gets this from MapLibre's own `maplibregl-map` class instead —
          // this container has no such library-provided class, so it's set
          // explicitly here).
          position: 'relative',
          display: status === 'ready' ? undefined : 'none',
        }}
      />
    </>
  )
}
