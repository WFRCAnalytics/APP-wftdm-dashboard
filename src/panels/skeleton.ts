// Which loading skeleton a panel gets: the silhouette of what it will draw, so the page does not jump when the data arrives.
// Pure (no React), so a unit test can check that every chart kind in src/charts/kinds has a shape.

/** Every silhouette PanelSkeleton can draw (a unit test checks each one has a drawing). */
export const SKELETON_SHAPES = [
  'bars',
  'hbars',
  'pyramid',
  'lines',
  'area',
  'heat',
  'waffle',
  'donut',
  'sunburst',
  'chord',
  'radar',
  'treemap',
  'sankey',
  'stacked',
  'dots',
  'slope',
  'ridge',
  'stream',
  'map',
  'table',
  'kpi',
  'text',
  'generic',
] as const
export type SkeletonShape = (typeof SKELETON_SHAPES)[number]

/** `type: chart` kinds, keyed by file name in src/charts/kinds (a dashboard writes them in kebab case: `zone-map`; see `kindFileName`). */
export const KIND_SHAPE: Record<string, SkeletonShape> = {
  calibrationTable: 'table',
  chord: 'chord',
  custom: 'generic', // refined from its spec's mark by skeletonShape
  donut: 'donut',
  dumbbell: 'dots',
  flowTable: 'table',
  gapDots: 'dots',
  modeBars: 'bars',
  modeRadar: 'radar',
  modeTable: 'table',
  purposeChord: 'chord',
  purposeRadar: 'radar',
  pyramid: 'pyramid',
  radar: 'radar',
  rankBars: 'hbars',
  ridgeline: 'ridge',
  sankey: 'sankey',
  scorecard: 'table', // an HTML table of scenarios x metrics, not a big-number tile
  slope: 'slope',
  speedHeat: 'heat',
  stackedBars: 'stacked',
  sunburst: 'sunburst',
  timeHeat: 'heat',
  timeLines: 'lines',
  timeStream: 'stream',
  traceHeat: 'heat',
  traceLines: 'lines',
  traceValues: 'lines',
  treemap: 'treemap',
  waffle: 'waffle',
  yearsTrend: 'lines',
  zoneDiffMap: 'map',
  zoneMap: 'map',
  zoneSwipeMap: 'map',
}

/** Panel types that are not `chart`. */
export const TYPE_SHAPE: Record<string, SkeletonShape> = {
  'observable-plot': 'bars',
  table: 'table',
  valuebox: 'kpi',
  flowmap: 'map',
  zonemap: 'map',
  sankey: 'sankey',
  treemap: 'treemap',
  sunburst: 'sunburst',
  pie: 'donut',
  radar: 'radar',
  markdown: 'text',
  'graphic-walker': 'generic',
}

/** The chart builder's marks, for `kind: custom` (and anything else carrying a spec). */
const MARK_SHAPE: Record<string, SkeletonShape> = {
  bar: 'bars', column: 'bars', line: 'lines', area: 'area', pie: 'donut', donut: 'donut', treemap: 'treemap', sunburst: 'sunburst',
  text: 'table', heatmap: 'heat', cell: 'heat', sankey: 'sankey', radar: 'radar',
}

/** An observable-plot panel's `mark` (a Plot mark constructor name). */
const PLOT_MARK_SHAPE: Record<string, SkeletonShape> = {
  barY: 'bars', rectY: 'bars', barX: 'hbars', rectX: 'hbars', line: 'lines', lineY: 'lines', lineX: 'lines',
  areaY: 'area', areaX: 'area', area: 'area', cell: 'heat', dot: 'lines',
}

interface Shapeable {
  type?: string
  mark?: string
  kind?: string
  spec?: { mark?: string }
  views?: Shapeable[]
  default_view?: string
}

/** A dashboard writes a kind as `zone-map`; the module (and so KIND_SHAPE) is `zoneMap`. Either spelling is accepted. */
export const kindFileName = (kind: string): string => kind.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/** Takes any panel config (read loosely: only `type`, `kind`, `mark`, `spec` and `views` matter). */
export function skeletonShape(panel: object | undefined): SkeletonShape {
  const config = panel as Shapeable | undefined
  if (!config) return 'generic'
  if (config.type === 'multi-view') {
    const views = config.views ?? []
    const first = views.find((v) => (v as { id?: string }).id === config.default_view) ?? views[0]
    return skeletonShape(first)
  }
  if (config.type === 'chart' || (config.kind && !config.type)) {
    const k = kindFileName(config.kind ?? '')
    if (k === 'custom') return MARK_SHAPE[config.spec?.mark ?? ''] ?? 'generic'
    return KIND_SHAPE[k] ?? 'generic'
  }
  if (config.type === 'observable-plot') return PLOT_MARK_SHAPE[config.mark ?? ''] ?? 'bars'
  return TYPE_SHAPE[config.type ?? ''] ?? 'generic'
}

/** The height a skeleton takes when its container does not give one. */
export const SKELETON_DEFAULT_HEIGHT = 350
