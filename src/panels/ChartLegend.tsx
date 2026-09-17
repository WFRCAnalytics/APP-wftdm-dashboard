// 060-radar-pie-charts (research.md §6, data-model.md §5) — a small,
// genuinely shared presentational component: neither SankeyPanel.tsx nor
// HierarchicalChartHost.tsx renders a legend at all (a Sankey's own node
// labels ARE its legend; a treemap/sunburst's own segment labels serve
// the same role), and RechartsPanel's/ObservablePlotPanel's own legends
// are each tied to their own charting library's payload/DOM shape — not
// reusable by a hand-built D3/SVG chart. This is the one piece of UI
// genuinely identical between PieChartPanel.tsx and RadarChartPanel.tsx
// (their underlying chart geometry is not). Swatch sizing/spacing
// (`h-2 w-2 rounded-[2px]`, `gap-1.5`/`gap-4`) matches
// components/ui/chart.tsx's own real ChartLegendContent swatch exactly
// (research.md §6) — visual consistency with this app's other charts'
// legends, not a bespoke treatment.
export interface ChartLegendEntry {
  label: string
  color: string
}

export function ChartLegend({ entries }: { entries: ChartLegendEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-3 font-body text-xs text-muted-foreground">
      {entries.map((entry) => (
        <div key={entry.label} className="flex items-center gap-1.5">
          <div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: entry.color }} />
          {entry.label}
        </div>
      ))}
    </div>
  )
}
