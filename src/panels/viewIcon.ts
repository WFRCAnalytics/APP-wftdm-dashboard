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
  Grid2x2,
  Grid3x3,
  Hash,
  LayoutGrid,
  Map,
  Network,
  Orbit,
  Radar,
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

/** A view's icon: its `icon` (a skeleton shape name) when set, else the icon of the silhouette it draws. */
export function viewIcon(view: object): LucideIcon {
  const own = (view as { icon?: unknown }).icon
  if (typeof own === 'string' && own in SHAPE_ICON) return SHAPE_ICON[own as SkeletonShape]
  return SHAPE_ICON[skeletonShape(view)]
}
