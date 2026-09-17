// Pure, DOM-free (research.md §3) — d3-shape's pie()/arc() generators are
// themselves pure layout computations with no DOM dependency (confirmed
// against the installed package, same as d3-sankey's own layout() call),
// so this entire module, including the actual geometry call, is
// Vitest-testable in `environment: 'node'` with zero DOM shim. Only
// PieChartPanel.tsx builds real SVG DOM from this module's output.
import { pie as d3Pie, arc as d3Arc } from 'd3-shape'

import type { PieChartPanelConfig } from '@/layout/types'

export interface PieSlice {
  category: string
  value: number
}

export interface PieAggregateResult {
  slices: PieSlice[]
  /** Rows dropped for a non-positive or non-finite mapped `value`
   * (contracts/pie-panel.md — a negative value has no valid wedge angle)
   * — always present, never optional, so a caller can't forget to check
   * it, mirroring sankeyGraph.ts's own FlowGraph.excludedCount. */
  excludedCount: number
}

/**
 * Rows -> aggregated slices. Sums duplicate `category` values (a metric
 * SQL already GROUPs BY the category column in every real case, but this
 * stays defensive rather than assuming, mirroring sankeyGraph.ts's
 * buildFlowGraph()) and excludes any row whose mapped `value` is <= 0 or
 * non-finite, counting exclusions for the caller's console.warn. A
 * category whose only contributing row(s) were all excluded never
 * appears in `slices` at all — a category with a genuine ZERO value (not
 * negative) is different: it IS kept as a real slice (contracts/
 * pie-panel.md's "still appears in the legend" requirement), a
 * zero-angle wedge, not dropped.
 */
export function aggregatePieSlices(
  config: Pick<PieChartPanelConfig, 'category' | 'value'>,
  rows: Record<string, unknown>[],
): PieAggregateResult {
  const valueByCategory = new Map<string, number>()
  let excludedCount = 0

  for (const row of rows) {
    const category = String(row[config.category])
    const rawValue = Number(row[config.value])

    if (!Number.isFinite(rawValue) || rawValue < 0) {
      excludedCount += 1
      continue
    }

    valueByCategory.set(category, (valueByCategory.get(category) ?? 0) + rawValue)
  }

  return {
    slices: [...valueByCategory.entries()].map(([category, value]) => ({ category, value })),
    excludedCount,
  }
}

export interface PieWedge extends PieSlice {
  /** SVG <path> `d` attribute, from d3.arc() — precomputed, not a
   * renderer call (mirrors sankeyGraph.ts's SankeyLayoutLink.path). */
  path: string
  /** value / sum(all slice values) — for tooltip/legend text. 0 when
   * every slice is 0 (avoids a NaN from a 0/0 division). */
  percentage: number
}

/**
 * Pure d3.pie()/d3.arc() geometry (research.md §3). innerRadius is
 * always 0 — no donut (contracts/pie-panel.md's own non-goals). A
 * zero-value slice produces a real, valid zero-angle arc (a degenerate
 * but non-crashing path) — still present in the returned array so the
 * caller's legend still lists it.
 */
export function layoutPieWedges(slices: PieSlice[], radius: number): PieWedge[] {
  const total = slices.reduce((sum, s) => sum + s.value, 0)

  const pieGenerator = d3Pie<PieSlice>()
    .value((d) => d.value)
    .sort(null) // preserve input (first-seen) order, not d3's own default descending-by-value sort

  const arcGenerator = d3Arc<ReturnType<typeof pieGenerator>[number]>().innerRadius(0).outerRadius(radius)

  return pieGenerator(slices).map((arcDatum) => ({
    category: arcDatum.data.category,
    value: arcDatum.data.value,
    path: arcGenerator(arcDatum) ?? '',
    percentage: total > 0 ? arcDatum.data.value / total : 0,
  }))
}
