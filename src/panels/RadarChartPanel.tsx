import { useEffect, useRef, useState } from 'react'
import { Radar } from 'lucide-react'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useColorScheme } from '@/hooks/useColorScheme'
import { useColorblindSafePreference } from '@/hooks/useColorblindSafePreference'
import { ensureRegistered } from '@/services/tabDataLoader'
import {
  buildPanelQuery,
  resolveActiveScenarios,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import {
  aggregateRadarSeries,
  layoutRadarAxisLabels,
  layoutRadarPolygons,
  type RadarPolygon,
} from '@/panels/radarData'
import { resolveNamedColorScheme, resolveCategoryFallbackColors } from '@/panels/chartColor'
import { createMapTooltip, type MapTooltip } from '@/panels/mapTooltip'
import { ChartLegend, type ChartLegendEntry } from '@/panels/ChartLegend'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { RadarChartPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// Token-derived categorical fallback — identical convention to
// PieChartPanel.tsx's own resolveFallbackColors() (this app's real
// --chart-1..5 categorical set).
const FALLBACK_TOKEN_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5']
const FALLBACK_HEX_COLORS = ['#3358be', '#ba7f00', '#cc4330', '#008029', '#914edc']

const SVG_NS = 'http://www.w3.org/2000/svg'
const GRID_RING_COUNT = 4

function renderSvg(
  polygons: RadarPolygon[],
  axisLabels: { axis: string; x: number; y: number }[],
  size: number,
  center: { cx: number; cy: number },
  outerRadius: number,
  colors: readonly string[],
  tooltip: MapTooltip,
  container: HTMLElement,
): { svg: SVGSVGElement; legendEntries: ChartLegendEntry[] } {
  function showTooltip(event: MouseEvent, html: string) {
    const rect = container.getBoundingClientRect()
    tooltip.show(event.clientX - rect.left, event.clientY - rect.top, html)
  }

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('role', 'img')

  // Concentric grid rings + axis spokes, drawn first so polygons/labels
  // layer on top.
  const gridGroup = document.createElementNS(SVG_NS, 'g')
  gridGroup.setAttribute('fill', 'none')
  gridGroup.setAttribute('stroke', 'var(--border)')
  for (let ring = 1; ring <= GRID_RING_COUNT; ring += 1) {
    const r = (outerRadius * ring) / GRID_RING_COUNT
    const circle = document.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('cx', String(center.cx))
    circle.setAttribute('cy', String(center.cy))
    circle.setAttribute('r', String(r))
    gridGroup.appendChild(circle)
  }
  for (const label of axisLabels) {
    const spoke = document.createElementNS(SVG_NS, 'line')
    spoke.setAttribute('x1', String(center.cx))
    spoke.setAttribute('y1', String(center.cy))
    spoke.setAttribute('x2', String(label.x))
    spoke.setAttribute('y2', String(label.y))
    gridGroup.appendChild(spoke)
  }
  svg.appendChild(gridGroup)

  // Axis labels — currentColor, matching SankeyPanel.tsx's/
  // HierarchicalChartHost.tsx's own dark-mode-legible text convention.
  const labelGroup = document.createElementNS(SVG_NS, 'g')
  labelGroup.setAttribute('fill', 'currentColor')
  labelGroup.setAttribute('font-size', '12')
  for (const label of axisLabels) {
    const text = document.createElementNS(SVG_NS, 'text')
    // Nudge the label slightly further out than the spoke's own endpoint
    // so it doesn't overlap the grid ring, and anchor based on which
    // side of center it falls on so labels don't run off past the edge.
    const dx = label.x - center.cx
    const anchor = Math.abs(dx) < 4 ? 'middle' : dx > 0 ? 'start' : 'end'
    text.setAttribute('x', String(label.x + (dx === 0 ? 0 : dx > 0 ? 4 : -4)))
    text.setAttribute('y', String(label.y))
    text.setAttribute('dy', '0.35em')
    text.setAttribute('text-anchor', anchor)
    text.textContent = label.axis
    labelGroup.appendChild(text)
  }
  svg.appendChild(labelGroup)

  const legendEntries: ChartLegendEntry[] = []
  const polygonsGroup = document.createElementNS(SVG_NS, 'g')
  polygons.forEach((polygon, index) => {
    const color = colors[index % colors.length]
    legendEntries.push({ label: polygon.seriesName, color })

    const pathData =
      polygon.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ') + ' Z'
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', pathData)
    path.setAttribute('fill', color)
    path.setAttribute('fill-opacity', '0.25')
    path.setAttribute('stroke', color)
    path.setAttribute('stroke-width', '2')
    path.setAttribute('data-series', polygon.seriesName)
    polygonsGroup.appendChild(path)

    for (const point of polygon.points) {
      const vertex = document.createElementNS(SVG_NS, 'circle')
      vertex.setAttribute('cx', String(point.x))
      vertex.setAttribute('cy', String(point.y))
      vertex.setAttribute('r', '4')
      vertex.setAttribute('fill', color)
      vertex.setAttribute('data-series', polygon.seriesName)
      vertex.setAttribute('data-axis', point.axis)
      vertex.setAttribute('data-value', String(point.value))
      const html = `<strong>${polygon.seriesName}</strong><br/>${point.axis}: ${point.value}`
      vertex.addEventListener('mousemove', (event) => showTooltip(event, html))
      vertex.addEventListener('mouseleave', () => tooltip.hide())
      polygonsGroup.appendChild(vertex)
    }
  })
  svg.appendChild(polygonsGroup)

  return { svg, legendEntries }
}

// The fourteenth panel type — 060-radar-pie-charts, contracts/radar-panel.md.
// Same standalone shape as PieChartPanel.tsx (research.md §8) — no shared
// host, no comparison-diff mixin.
export function RadarChartPanel({ config }: { config: RadarChartPanelConfig }) {
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  const activeScenarioNames = useActiveScenarios()
  const colorScheme = useColorScheme()
  const colorblindSafe = useColorblindSafePreference()
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<MapTooltip | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [legendEntries, setLegendEntries] = useState<ChartLegendEntry[]>([])

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
          console.error('RadarChartPanel: failed to load panel data', err)
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [config, filters, activeScenarioNames])

  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return
    const el = containerRef.current

    const aggregated = aggregateRadarSeries(config, rows)

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
        // Reserve room for the axis labels drawn just past the outer
        // ring — a fixed inset margin, matching PieChartPanel.tsx's own
        // established headroom-reservation convention.
        const size = Math.max(0, Math.min(width, height) - 48)
        const center = { cx: size / 2, cy: size / 2 }
        const outerRadius = size / 2

        const maxValue = Math.max(
          0,
          ...aggregated.series.flatMap((s) => [...s.valuesByAxis.values()]),
        )
        const polygons = layoutRadarPolygons(aggregated, center, outerRadius, maxValue)
        const axisLabelPositions = layoutRadarAxisLabels(aggregated.axes, center, outerRadius)
        const colors =
          resolveNamedColorScheme(config.color_scheme, { colorblindSafe }) ??
          resolveCategoryFallbackColors(el, FALLBACK_TOKEN_VARS, FALLBACK_HEX_COLORS)

        const { svg, legendEntries: nextLegendEntries } = renderSvg(
          polygons,
          axisLabelPositions,
          size,
          center,
          outerRadius,
          colors,
          tooltip,
          el,
        )
        svgRef.current?.remove()
        el.appendChild(svg)
        svgRef.current = svg
        // A legend is only useful once there's more than one series to
        // distinguish (contracts/radar-panel.md) — a single-series
        // radar's own axis labels already convey everything a legend
        // would add.
        setLegendEntries(nextLegendEntries.length > 1 ? nextLegendEntries : [])
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
    // colorblindSafe (061-appearance-controls): forces a redraw when the
    // Appearance-tab toggle changes, matching colorScheme's own identical
    // reasoning already established here.
  }, [config, rows, status, colorScheme, colorblindSafe])

  if (status === 'empty') {
    return <PanelEmptyState icon={Radar} message="No data for this selection" />
  }
  if (status === 'error') {
    return <PanelErrorState message="Couldn't load this chart" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {status === 'loading' && (
        <div className="flex flex-1 items-center justify-center" aria-hidden="true">
          <div className="h-32 w-32 animate-pulse rounded-full bg-muted" />
        </div>
      )}
      {/* Same imperative-children-only container convention as
          PieChartPanel.tsx — the legend below is a separate React
          sibling, never a JSX child of this div. */}
      <div
        ref={containerRef}
        className="radar-chart"
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
