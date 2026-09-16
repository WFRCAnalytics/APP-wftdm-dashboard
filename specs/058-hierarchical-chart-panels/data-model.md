# Phase 1 Data Model: Hierarchical Chart Panels (Zoomable Treemap & Sunburst)

## Entities

### 1. `HierarchicalPanelConfigBase` (author-facing, parsed from `dashboard-*.yaml`)

Extends the existing `DataBoundPanelConfigBase` (`metric`, `filter?`,
`scenario?`, `scenarios?`) and the existing `ComparisonCapablePanelConfig`
mixin (`comparison?`, `compare_on?`) — both reused completely unmodified,
matching `RechartsPanelConfig`'s own precedent (research.md §4).

| Field | Type | Required | Notes |
|---|---|---|---|
| `path` | `string[]` | yes | Ordered, root-to-leaf list of real column names present in the panel's queried result set. Minimum length 1 (a single-level "hierarchy" is a degenerate, valid case — FR-004/Edge Cases). |
| `value` | `string` | yes | Real column name supplying each leaf's sized value. Must resolve to a real numeric column in the query result; a missing/non-numeric value at any row is treated as `0` (FR-009), never dropped or erroring the whole panel. |
| `color_scheme` | `string` | no | A named categorical color scheme, matching `SankeyPanelConfig.color_scheme`'s own exact precedent — falls back to this app's existing `--chart-1..5` token cycling when omitted. |

**Validation rules** (enforced the same "resolve first, never query on an
unresolvable config" way `resolveQueryAndPairs()` already enforces for
`comparison: diff`):
- `path` MUST contain at least one entry.
- Every `path` entry and `value` MUST be literal column names — never a
  `$metric.`-prefixed placeholder (matching every other chart-rendering
  panel type's own grammar rule).

### 2. `TreemapPanelConfig`

`HierarchicalPanelConfigBase & { type: 'treemap' }` — no additional
fields beyond the discriminant. Rendered by `treemapRenderer.ts`
(research.md §3a).

### 3. `SunburstPanelConfig`

`HierarchicalPanelConfigBase & { type: 'sunburst' }` — no additional
fields beyond the discriminant. Rendered by `sunburstRenderer.ts`
(research.md §3b).

Both are added to the existing `PanelConfig` discriminated union in
`layout/types.ts`, alongside the other nine panel config types.

### 4. `HierarchyNode` (runtime-only — never authored, never persisted)

The shape `hierarchyData.ts`'s pure transform produces from flat tidy
query rows, before it is handed to `d3.hierarchy()`:

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | The real category value at this depth (one distinct value from the corresponding `path` column). |
| `value` | `number` \| `undefined` | Only present on a LEAF node — the real, summed `value` column for that (path-tuple) group. Non-leaf nodes derive their own total via `d3.hierarchy().sum()`, never set directly (avoids double-counting). |
| `children` | `HierarchyNode[]` \| `undefined` | Present on every non-leaf node; absent (not empty) on a leaf — `d3.hierarchy()`'s own convention for distinguishing "no children" from "children not yet computed." |

**Transform rule** (`hierarchyData.ts`): group the flat rows by
`path[0]`, then recursively by `path[1]`, etc., down to `path.length`
levels; at the final level, SUM `value` across any rows that still share
the same full path tuple (a real, defensive case — matches this app's
own established "aggregate, don't assume pre-aggregated" discipline
already applied elsewhere, e.g. `rechartsEncoding.ts`'s own pivot). A
row with a missing/non-numeric `value` contributes `0` to that sum
(FR-009), never `NaN` and never a dropped row.

### 5. Zoom / Focus State (component-local, never authored, never
persisted, never part of the query)

One piece of state per rendered panel instance: which node is currently
the "focus" (the node whose subtree fills the visible chart area — the
root by default). Concretely:

- **Treemap**: the two `d3.scaleLinear()` domains (`x`, `y`) currently in
  effect — see research.md §3a. Equivalent to "which node's own
  `x0/x1/y0/y1` box the scales are currently mapped from."
- **Sunburst**: the node currently bound to the center "zoom out" circle
  (`p.parent ?? root` from the last click) — see research.md §3b.

**State transitions**:
- `loading -> ready | empty | error` — identical to every other
  data-bound panel type's own existing status machine (`PanelEmptyState`/
  `PanelErrorState`, shared, unmodified).
- Within `ready`: `focus = root` initially -> clicking a non-leaf node
  sets `focus = <that node>` (zoom in) -> clicking the zoom-out
  affordance (breadcrumb / center circle / title bar, per chart type)
  sets `focus = focus.parent ?? root` (zoom out one level).
- **Any new query result arriving** (a config/filter/active-scenario/
  baseline change re-running the fetch effect — the same dependency
  array every other data-bound panel type's fetch effect already has)
  resets `focus = root` unconditionally (spec.md Assumption: "Zoom-state
  reset on data change" — the simplest, most predictable behavior, no
  attempt to preserve a zoom position against potentially-mismatched new
  data).
- Zooming (either direction) never re-triggers the fetch effect (FR-014)
  — it is pure client-side state over the already-fetched, already-
  transformed `HierarchyNode` tree.

## Relationships

```
DashboardTabConfig
  └─ layout: PanelConfig[]
       └─ TreemapPanelConfig | SunburstPanelConfig   (discriminated by `type`)
            ├─ queried via: existing metric/scenario/filter grammar (unchanged)
            ├─ query result: flat tidy rows (this app's universal shape)
            │    └─ hierarchyData.ts transform ──▶ HierarchyNode (root)
            │                                         └─ d3.hierarchy(root)
            │                                              └─ d3.treemap() | d3.partition()
            └─ rendered by: HierarchicalChartHost.tsx
                 └─ delegates drawing/zoom to: treemapRenderer.ts | sunburstRenderer.ts
