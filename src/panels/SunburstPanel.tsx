import { HierarchicalChartHost } from '@/panels/HierarchicalChartHost'
import { sunburstRenderer } from '@/panels/hierarchyRenderers/sunburstRenderer'
import type { SunburstPanelConfig } from '@/layout/types'

// The twelfth panel type — 058-hierarchical-chart-panels
// (contracts/sunburst-panel.md). A thin wrapper over HierarchicalChartHost —
// see that file for the shared query/loading/theming behavior.
export function SunburstPanel({ config }: { config: SunburstPanelConfig }) {
  return <HierarchicalChartHost config={config} renderer={sunburstRenderer} />
}
