// 065-chart-builder: the icon of each chart type in the Chart tab's picker. Lucide icons, so they match the rest of the app.
import {
  Barcode, ChartArea, ChartCandlestick, ChartColumn, ChartLine, ChartNetwork, ChartNoAxesColumn, ChartNoAxesGantt, ChartPie,
  ChartScatter, ChartSpline, Grid3x3, LayoutDashboard, LayoutGrid, Map as MapIcon, Radar, Route, Table2, Target, Workflow, type LucideIcon,
} from 'lucide-react'
import type { Mark } from '@/charts/builder/spec'

export const MARK_ICONS: Record<Mark, LucideIcon> = {
  bar: ChartColumn, line: ChartLine, area: ChartArea, scatter: ChartScatter, heatmap: Grid3x3, histogram: ChartNoAxesColumn, box: ChartCandlestick,
  pie: ChartPie, tick: Barcode, text: Table2, waffle: LayoutGrid, density: ChartSpline, rule: ChartNoAxesGantt,
  treemap: LayoutDashboard, radar: Radar, sunburst: Target, sankey: Workflow, chord: ChartNetwork, trail: Route,
}

/** Planned chart types, shown dimmed at the end of the picker. */
export const SOON_ICONS: Record<string, LucideIcon> = { Map: MapIcon }
