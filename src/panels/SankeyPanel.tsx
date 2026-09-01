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

function renderSvg(layout: SankeyLayout, width: number, height: number, colors: readonly string[]): SVGSVGElement {
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
    const title = document.createElementNS(SVG_NS, 'title')
    title.textContent = `${link.sourceId} -> ${link.targetId}: ${link.value}`
    path.appendChild(title)
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
    const title = document.createElementNS(SVG_NS, 'title')
    title.textContent = node.label
    rect.appendChild(title)
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
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])

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
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 || height === 0) return
      if (width === lastWidth && height === lastHeight) return
      lastWidth = width
      lastHeight = height
      try {
        const layout = layoutFlowGraph(graph, width, height)
        const colors = resolveNamedColorScheme(config.color_scheme) ?? resolveFallbackColors(el)
        const svg = renderSvg(layout, width, height, colors)
        el.replaceChildren(svg)
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
        <div className="animate-pulse rounded-md bg-muted" style={{ height: config.height ?? 350 }} />
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
          display: status === 'ready' ? undefined : 'none',
        }}
      />
    </>
  )
}
