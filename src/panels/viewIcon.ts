import {
  ChartArea,
  ChartBar,
  ChartBarBig,
  ChartColumn,
  ChartColumnStacked,
  ChartLine,
  ChartNoAxesColumn,
  ChartPie,
  ChartScatter,
  ChartSpline,
  Diff,
  Grid2x2,
  Grid3x3,
  Hash,
  LayoutGrid,
  Map,
  Network,
  Orbit,
  Radar,
  SquareSplitHorizontal,
  Table2,
  Type,
  Waves,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import { skeletonShape, type SkeletonShape } from '@/panels/skeleton'

// The icon a tile's view control shows for a view. A view is classified once, by the silhouette its loading skeleton
// draws (panels/skeleton.ts), so a new chart kind gets an icon as soon as it has a skeleton shape.
export const SHAPE_ICON: Record<SkeletonShape, LucideIcon> = {
  bars: ChartColumn,
  hbars: ChartBar,
  pyramid: ChartBarBig,
  lines: ChartLine,
  area: ChartArea,
  heat: Grid3x3,
  waffle: LayoutGrid,
  donut: ChartPie,
  sunburst: Orbit,
  chord: Network,
  radar: Radar,
  treemap: Grid2x2,
  sankey: Workflow,
  stacked: ChartColumnStacked,
  dots: ChartScatter,
  slope: ChartSpline,
  ridge: Waves,
  stream: Waves,
  map: Map,
  table: Table2,
  kpi: Hash,
  text: Type,
  generic: ChartNoAxesColumn,
}

/**
 * Kinds that share a silhouette with others they sit beside in one tile, each with an icon of what it shows: the zone maps'
 * Values, Difference and Swipe views all draw a map, and the calibration tile's Values and Difference views both draw lines.
 * A difference is always the Diff icon. tests/unit/viewIcon.test.ts fails when a demo tile shows two views with one icon.
 */
export const KIND_ICON: Record<string, LucideIcon> = {
  'zone-map': Map,
  'zone-diff-map': Diff,
  'zone-swipe-map': SquareSplitHorizontal,
  'trace-values': ChartLine,
  'trace-lines': Diff,
}

/** A view's icon: its `icon` (a skeleton shape name) when set, else its kind's own icon, else the icon of the silhouette it draws. */
export function viewIcon(view: object): LucideIcon {
  const own = (view as { icon?: unknown }).icon
  if (typeof own === 'string' && own in SHAPE_ICON) return SHAPE_ICON[own as SkeletonShape]
  const kind = (view as { kind?: unknown }).kind
  if (typeof kind === 'string' && kind in KIND_ICON) return KIND_ICON[kind]
  return SHAPE_ICON[skeletonShape(view)]
}
