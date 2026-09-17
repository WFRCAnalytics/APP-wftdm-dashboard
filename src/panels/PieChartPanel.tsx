import { useEffect, useRef, useState } from 'react'
import { PieChart } from 'lucide-react'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useColorScheme } from '@/hooks/useColorScheme'
import { ensureRegistered } from '@/services/tabDataLoader'
import {
  buildPanelQuery,
  resolveActiveScenarios,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { aggregatePieSlices, layoutPieWedges, type PieWedge } from '@/panels/pieData'
import { resolvePolarColorScheme } from '@/panels/polarChartColor'
import { createMapTooltip, type MapTooltip } from '@/panels/mapTooltip'
import { ChartLegend, type ChartLegendEntry } from '@/panels/ChartLegend'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { PieChartPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// Token-derived categorical fallback — resolved once per rebuild against
// the mounted container's computed style, matching SankeyPanel.tsx's/
// HierarchicalChartHost.tsx's own resolveFallbackColors() exactly (this
// app's real, already-verified-distinct-and-accessible --chart-1..5
// categorical set, the same lineage rechartsEncoding.ts already cycles
// through).
const FALLBACK_TOKEN_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5']
const FALLBACK_HEX_COLORS = ['#3358be', '#ba7f00', '#cc4330', '#008029', '#914edc']

function resolveFallbackColors(el: Element): string[] {
  const style = getComputedStyle(el)
  const resolved = FALLBACK_TOKEN_VARS.map((v) => style.getPropertyValue(v).trim()).filter(Boolean)
  return resolved.length > 0 ? resolved : FALLBACK_HEX_COLORS
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function renderSvg(
  wedges: PieWedge[],
  size: number,
  colors: readonly string[],
  tooltip: MapTooltip,
  container: HTMLElement,
): { svg: SVGSVGElement; legendEntries: ChartLegendEntry[] } {
  const cx = size / 2
  const cy = size / 2

  function showTooltip(event: MouseEvent, html: string) {
    const rect = container.getBoundingClientRect()
    tooltip.show(event.clientX - rect.left, event.clientY - rect.top, html)
  }

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('role', 'img')

  const group = document.createElementNS(SVG_NS, 'g')
  group.setAttribute('transform', `translate(${cx}, ${cy})`)

  const legendEntries: ChartLegendEntry[] = []

  wedges.forEach((wedge, index) => {
    const color = colors[index % colors.length]
    legendEntries.push({ label: wedge.category, color })

    const path = document.createElementNS(SVG_NS, 'path')
    // d3.arc() paths are already relative to (0,0) — the transform above
    // recenters that origin at the container's own visual center.
    path.setAttribute('d', wedge.path)
    path.setAttribute('fill', color)
    path.setAttribute('stroke', 'var(--card)')
    path.setAttribute('stroke-width', '1')
    path.setAttribute('data-category', wedge.category)
    path.setAttribute('data-value', String(wedge.value))
    path.setAttribute('data-percentage', String(wedge.percentage))
    const percentText = (wedge.percentage * 100).toFixed(1)
    const html = `<strong>${wedge.category}</strong><br/>${wedge.value} (${percentText}%)`
    path.addEventListener('mousemove', (event) => showTooltip(event, html))
    path.addEventListener('mouseleave', () => tooltip.hide())
    group.appendChild(path)
  })

  svg.appendChild(group)
  return { svg, legendEntries }
}

// The thirteenth panel type — 060-radar-pie-charts, contracts/pie-panel.md.
// Mirrors SankeyPanel.tsx's exact shape (research.md §8): a standalone,
// self-contained fetch-effect + render-and-swap-effect component, not a
// shared "host" (pie/radar have genuinely different config grammars and
// neither has a zoom concept, unlike treemap/sunburst).
export function PieChartPanel({ config }: { config: PieChartPanelConfig }) {
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  const activeScenarioNames = useActiveScenarios()
  const colorScheme = useColorScheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<MapTooltip | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [legendEntries, setLegendEntries] = useState<ChartLegendEntry[]>([])

  // Mount-only: create the shared hover tooltip (mapTooltip.ts) once,
  // matching SankeyPanel.tsx's own identical lifetime/cleanup convention.
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

  // Data fetch — identical shape to SankeyPanel.tsx (no comparison-diff
  // mixin on this config type, research.md §8, so buildPanelQuery() +
  // sqlExpander.expand() are called directly, not resolveQueryAndPairs()).
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(config, activeScenarioNames)
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)

    ensureRegistered(activeScenarios.map((scenario) => ({ scenario, metric: config.metric })))
      .then(() => query(sql))
      .then((result) => {
        if (cancelled) return
        if (result.length === 0) {
          setStatus('empty')
          return
        }
        setRows(result)
        setStatus('ready')
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('PieChartPanel: failed to load panel data', err)
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [config, filters, activeScenarioNames])

  // Render-and-swap effect — aggregates + lays out wedges once per data
  // change, rebuilds the <svg> on both a data change AND a
  // ResizeObserver-triggered resize (d3.arc()'s own radius is
  // pixel-absolute, same reasoning as d3-sankey's extent in
  // SankeyPanel.tsx).
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return
    const el = containerRef.current

    const { slices, excludedCount } = aggregatePieSlices(config, rows)
    if (excludedCount > 0) {
      console.warn(
        `PieChartPanel "${config.title}" (metric: ${config.metric}): excluded ${excludedCount} row(s) with a negative or non-finite value.`,
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

      if (slices.length === 0) {
        // Every row was excluded (all-negative/non-finite values) —
        // nothing renderable, matching this app's "structurally
        // unreachable through valid config, still caught defensively"
        // convention.
        setStatus('error')
        return
      }

      try {
        // Leave headroom for the legend below the chart — a fixed inset
        // margin, matching how every other custom-SVG panel type in this
        // app reserves its own chrome space around the drawable area.
        const size = Math.max(0, Math.min(width, height) - 16)
        const colors = resolvePolarColorScheme(config.color_scheme) ?? resolveFallbackColors(el)
        const { svg, legendEntries: nextLegendEntries } = renderSvg(
          layoutPieWedges(slices, size / 2),
          size,
          colors,
          tooltip,
          el,
        )
        svgRef.current?.remove()
        el.appendChild(svg)
        svgRef.current = svg
        setLegendEntries(nextLegendEntries)
        renderCount += 1
        el.dataset.renderCount = String(renderCount)
      } catch {
        setStatus('error')
      }
    }

    rebuild()
    const observer = new ResizeObserver(rebuild)
    observer.observe(el)
    return () => observer.disconnect()
    // colorScheme: a theme flip carries no width/height change, but
    // forces a fresh rebuild() call to re-resolve --chart-1..5's current
    // (dark-mode) values, matching ObservablePlotPanel.tsx's/
    // HierarchicalChartHost.tsx's own identical reasoning.
  }, [config, rows, status, colorScheme])

  if (status === 'empty') {
    return <PanelEmptyState icon={PieChart} message="No data for this selection" />
  }
  if (status === 'error') {
    return <PanelErrorState message="Couldn't load this chart" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {status === 'loading' && (
        // wftdm-design-system skill's Skeleton composition recipe — a
        // circular silhouette, matching SankeyPanel.tsx's own shaped
        // (not generic-rectangle) loading skeleton convention.
        <div className="flex flex-1 items-center justify-center" aria-hidden="true">
          <div className="h-32 w-32 animate-pulse rounded-full bg-muted" />
        </div>
      )}
      {/* containerRef holds ONLY imperatively-managed children (the
          tooltip div + the <svg>, both appended directly via DOM calls) —
          the legend below is a separate React-rendered SIBLING, never a
          JSX child of this div, so React's own reconciliation of this
          node's children never collides with the imperative
          appendChild()/remove() calls in the render-and-swap effect
          above (data-model.md §6). */}
      <div
        ref={containerRef}
        className="pie-chart"
        style={{
          width: '100%',
          flex: '1 1 auto',
          minHeight: 0,
          position: 'relative',
          display: status === 'ready' ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
      {status === 'ready' && <ChartLegend entries={legendEntries} />}
    </div>
  )
}
