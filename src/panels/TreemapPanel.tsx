import { HierarchicalChartHost } from '@/panels/HierarchicalChartHost'
import { treemapRenderer } from '@/panels/hierarchyRenderers/treemapRenderer'
import type { TreemapPanelConfig } from '@/layout/types'

// The eleventh panel type — 058-hierarchical-chart-panels
// (contracts/treemap-panel.md). A thin wrapper over HierarchicalChartHost —
// see that file for the shared query/loading/theming behavior.
export function TreemapPanel({ config }: { config: TreemapPanelConfig }) {
  return <HierarchicalChartHost config={config} renderer={treemapRenderer} />
}
