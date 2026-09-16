# Contract: `TreemapPanel` (`src/panels/TreemapPanel.tsx`)

Satisfies FR-001, FR-004, FR-005, FR-009, FR-013, FR-015 for the treemap
chart type specifically. The eleventh panel type. A thin wrapper over
`HierarchicalChartHost` — see that contract for the shared query/loading/
theming behavior; this contract covers only `TreemapPanelConfig`'s own
grammar and `treemapRenderer.ts`'s own zoom mechanics (research.md §3a).

## Config grammar (`dashboard-*.yaml`)

```yaml
- type:   treemap
  title:  "Trip Purpose to Mode Breakdown"
  metric: purpose_mode_flow
  scenario: activitysim-baseline
  path:   [primary_purpose, major_trip_mode]
  value:  trips
  color_scheme: Tableau10   # optional — falls back to --chart-1..5 cycling
  height: 500
  width:  1.0
```

## Shape

```tsx
import { HierarchicalChartHost } from '@/panels/HierarchicalChartHost'
import { treemapRenderer } from '@/panels/hierarchyRenderers/treemapRenderer'
import type { TreemapPanelConfig } from '@/layout/types'

export function TreemapPanel({ config }: { config: TreemapPanelConfig }) {
  return <HierarchicalChartHost config={config} renderer={treemapRenderer} />
}
```

`treemapRenderer.ts` implements the real, current D3 technique fetched
directly in research.md §3a: `d3.hierarchy(root).sum().sort()` ->
`d3.treemap().tile(tile)` (a custom `tile()` that lays out at full canvas
size via `d3.treemapBinary` then rescales into the zoomed-in box) ->
zoom state as two `d3.scaleLinear()` domains, re-pointed to the clicked
node's own `x0/x1`/`y0/y1` on click, with the old DOM group fading out
and a new one fading in (750ms, matching the reference exactly) —
`resolveColor`/`getComputedStyle()` substituted for the reference's own
hardcoded fill colors (research.md §5).

## What does NOT change

- Everything `hierarchical-chart-host.md`'s own "What does NOT change"
  section already lists.
- `sunburstRenderer.ts` / `SunburstPanel.tsx` — zero shared code beyond
  the host and `hierarchyData.ts`; this panel type's own zoom mechanics
  are self-contained.

## Explicitly out of scope

- Any tiling method other than the reference's own binary-tile-then-
  rescale technique (e.g. exposing `treemapSquarify`/`treemapDice` as an
  author-configurable option) — not requested, not built.
