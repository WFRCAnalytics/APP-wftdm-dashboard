# Contract: `SunburstPanel` (`src/panels/SunburstPanel.tsx`)

Satisfies FR-001, FR-004, FR-005, FR-009, FR-013, FR-015 for the sunburst
chart type specifically. The twelfth panel type. A thin wrapper over
`HierarchicalChartHost` — see that contract for the shared query/loading/
theming behavior; this contract covers only `SunburstPanelConfig`'s own
grammar and `sunburstRenderer.ts`'s own zoom mechanics (research.md §3b).

## Config grammar (`dashboard-*.yaml`)

```yaml
- type:   sunburst
  title:  "Trip Purpose to Mode Breakdown (Sunburst)"
  metric: purpose_mode_flow
  scenario: activitysim-baseline
  path:   [primary_purpose, major_trip_mode]
  value:  trips
  color_scheme: Tableau10   # optional — falls back to --chart-1..5 cycling
  height: 500
  width:  1.0
```

Note: the identical `path`/`value`/`metric`/`scenario` shape as
`treemap-panel.md`'s own example, deliberately — both chart types read
the same hierarchy grammar; only `type:` differs, matching this
feature's own core value ("show the same real hierarchy two ways").

## Shape

```tsx
import { HierarchicalChartHost } from '@/panels/HierarchicalChartHost'
import { sunburstRenderer } from '@/panels/hierarchyRenderers/sunburstRenderer'
import type { SunburstPanelConfig } from '@/layout/types'

export function SunburstPanel({ config }: { config: SunburstPanelConfig }) {
  return <HierarchicalChartHost config={config} renderer={sunburstRenderer} />
}
```

`sunburstRenderer.ts` implements the real, current D3 technique fetched
directly in research.md §3b: `d3.hierarchy(root).sum().sort()` ->
`d3.partition().size([2π, height+1])` -> `d3.arc()` mapping angle/depth
to a real radial arc -> per-node `current`/`target` state, tweened via
`d3.interpolate` on click (750ms, matching the reference exactly) — a
transparent center circle bound to `focus.parent ?? root` is the
zoom-out target. `arcVisible`/`labelVisible` (the reference's own real
predicate helpers) satisfy FR-009 (a negligibly-small node's label must
not render/overflow) directly, unmodified in logic — only the fill color
source changes (`resolveColor`/`getComputedStyle()` in place of the
reference's own `d3.interpolateRainbow`, per research.md §5).

## What does NOT change

- Everything `hierarchical-chart-host.md`'s own "What does NOT change"
  section already lists.
- `treemapRenderer.ts` / `TreemapPanel.tsx` — zero shared code beyond
  the host and `hierarchyData.ts`; this panel type's own zoom mechanics
  are self-contained.

## Explicitly out of scope

- Showing more than two layers at once, or any "unrolled" full-depth
  view — the reference's own real, deliberate design ("this variant...
  shows only two layers of the hierarchy at a time") is reused as-is,
  not reconsidered.
- An icicle-diagram variant (`d3.partition` rendered linearly instead of
  radially) — a real, available future extension (research.md §6's
  SC-006 framing), not built by this feature.
