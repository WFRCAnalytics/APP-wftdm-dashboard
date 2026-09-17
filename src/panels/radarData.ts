// Pure, DOM-free (research.md §4) — no D3 layout package for the actual
// geometry (unlike pieData.ts's d3.pie()/d3.arc()): D3 has no dedicated
// "radar chart" layout module, so layoutRadarPolygons()/
// layoutRadarAxisLabels() are hand-rolled polar trigonometry, matching
// this project's own established "plain math, no DOM" convention
// (hierarchyTween.ts's own precedent for reimplementing D3 behavior by
// hand). Only RadarChartPanel.tsx builds real SVG DOM from this module's
// output.
import type { RadarChartPanelConfig } from '@/layout/types'

const IMPLICIT_SERIES_NAME = 'value'

export interface RadarSeries {
  name: string
  valuesByAxis: Map<string, number>
}

export interface RadarAggregateResult {
  axes: string[]
  series: RadarSeries[]
}

/**
 * Rows -> {axes, series}. A row missing `series` config resolves every
 * row into one implicit series (named "value" — no real column produces
 * this literal string as a category, since it's never a value read from
 * `row[...]`, only a fixed label). Duplicate (series, axis) rows sum
 * their `value` (same defensive convention as pieData.ts's
 * aggregatePieSlices / sankeyGraph.ts's buildFlowGraph). A negative
 * value is clamped to 0 HERE (not layoutRadarPolygons) — unlike a pie
 * chart's own "drop the row" convention, a radar axis must stay present
 * for every series to keep the shared axis order intact (contracts/
 * radar-panel.md). Every series' `valuesByAxis` Map always has an entry
 * for every axis discovered anywhere in the result — a series with no
 * row for one axis gets an explicit 0, never an omitted key (the "must
 * never misalign the shared axis order" edge case).
 */
export function aggregateRadarSeries(
  config: Pick<RadarChartPanelConfig, 'axis' | 'value' | 'series'>,
  rows: Record<string, unknown>[],
): RadarAggregateResult {
  const axesSeen: string[] = []
  const axesSet = new Set<string>()
  const seriesOrder: string[] = []
  const seriesByName = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const axis = String(row[config.axis])
    const seriesName = config.series ? String(row[config.series]) : IMPLICIT_SERIES_NAME
    const rawValue = Number(row[config.value])
    const value = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0

    if (!axesSet.has(axis)) {
      axesSet.add(axis)
      axesSeen.push(axis)
    }

    let valuesByAxis = seriesByName.get(seriesName)
    if (!valuesByAxis) {
      valuesByAxis = new Map()
      seriesByName.set(seriesName, valuesByAxis)
      seriesOrder.push(seriesName)
    }
    valuesByAxis.set(axis, (valuesByAxis.get(axis) ?? 0) + value)
  }

  // Every series gets an explicit 0 entry for every axis it doesn't
  // already have one for — done AFTER the full axis set is known, so a
  // series seen early (before a later row introduces a new axis) still
  // ends up with a complete, correctly-ordered axis set.
  const series = seriesOrder.map((name) => {
    const valuesByAxis = seriesByName.get(name)!
    for (const axis of axesSeen) {
      if (!valuesByAxis.has(axis)) valuesByAxis.set(axis, 0)
    }
    return { name, valuesByAxis }
  })

  return { axes: axesSeen, series }
}

export interface RadarPoint {
  x: number
  y: number
  axis: string
  value: number
}

export interface RadarPolygon {
  seriesName: string
  points: RadarPoint[]
}

/**
 * Pure polar-coordinate geometry (research.md §4) — no D3 layout
 * package. Angles start at -π/2 (12 o'clock) and proceed clockwise,
 * matching Recharts'/Chart.js's own real radar-chart convention. A fixed
 * 0 domain min (values are already clamped to >= 0 by
 * aggregateRadarSeries). A `maxValue` of 0 degenerates every point to
 * the exact center — still a valid, non-crashing polygon.
 */
export function layoutRadarPolygons(
  data: RadarAggregateResult,
  center: { cx: number; cy: number },
  outerRadius: number,
  maxValue: number,
): RadarPolygon[] {
  const axisCount = data.axes.length
  return data.series.map((s) => ({
    seriesName: s.name,
    points: data.axes.map((axis, i) => {
      const angle = -Math.PI / 2 + i * ((2 * Math.PI) / axisCount)
      const value = s.valuesByAxis.get(axis) ?? 0
      const radius = maxValue > 0 ? (value / maxValue) * outerRadius : 0
      return {
        x: center.cx + radius * Math.cos(angle),
        y: center.cy + radius * Math.sin(angle),
        axis,
        value,
      }
    }),
  }))
}

/**
 * The N axis label positions — separate from layoutRadarPolygons() since
 * a label is drawn once per axis, not once per (axis, series) pair.
 */
export function layoutRadarAxisLabels(
  axes: string[],
  center: { cx: number; cy: number },
  outerRadius: number,
): { axis: string; angle: number; x: number; y: number }[] {
  const axisCount = axes.length
  return axes.map((axis, i) => {
    const angle = -Math.PI / 2 + i * ((2 * Math.PI) / axisCount)
    return {
      axis,
      angle,
      x: center.cx + outerRadius * Math.cos(angle),
      y: center.cy + outerRadius * Math.sin(angle),
    }
  })
}
