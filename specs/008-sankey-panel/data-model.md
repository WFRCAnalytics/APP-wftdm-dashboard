# Data Model: SankeyPanel

**Feature**: `008-sankey-panel` | **Date**: 2026-09-01

No new persisted data, no new config file, no new config file type
(constitution Principle VII unaffected). This feature's shapes are: the
typed parsing of `type: sankey`'s already-documented `dashboard-*.yaml`
grammar (`layout/types.ts`), and one new pure module
(`panels/sankeyGraph.ts`, research.md §7) that turns queried rows into the
node-link graph `d3-sankey` needs and runs its layout computation.

---

## `SankeyPanelConfig` (`type: 'sankey'`, extends `DataBoundPanelConfigBase` — new)

| Field | Type | Notes |
|---|---|---|
| `source` | `string` | Literal column name (from the queried result set) supplying each row's flow origin — **not** `$metric.`-prefixed (Grammar findings #2, research.md's confirmation). Author-configurable, mirroring `TableColumnConfig.field`. |
| `target` | `string` | Literal column name supplying each row's flow destination. |
| `value` | `string` | Literal column name supplying each row's flow magnitude. |
| `color_scheme` | `string?` | Named categorical color scheme (`docs/GRAMMAR.md`'s one example: `Tableau10`) resolved against a small internal name→`d3-scale-chromatic` export lookup (research.md §6). Omitted, or an unrecognized name, both fall through to the same token-derived default palette — never a hard error, since this is a cosmetic key (FR-005, FR-006's error-state reservation is for structural/query problems only). |

`DataBoundPanelConfigBase`'s common fields (`title`, `width`, `height`,
`metric`, `filter`, `scenario`, `scenarios`) apply unchanged (Grammar
findings #4) — same pattern every prior data-bound panel type already
follows.

**Union update**: `layout/types.ts`'s `PanelConfig` becomes
`ValueBoxPanelConfig | PlotlyPanelConfig | TablePanelConfig |
MarkdownPanelConfig | ObservablePlotPanelConfig | SankeyPanelConfig |
UnknownPanelConfig` — a `type: sankey` entry now parses to a real, narrowed
type instead of falling through to `UnknownPanelConfig`'s wide shape. This
is also the point where the doc comment above `UnknownPanelConfig`
("flowmap, zonemap, sankey, graphic-walker — all out of scope...still
deferred") needs its own small correction: `sankey` is no longer one of the
still-deferred types once this feature ships.

---

## `FlowGraph` (internal — `panels/sankeyGraph.ts`, not part of the YAML grammar)

The pure, DOM-free output `sankeyGraph.ts` hands to `SankeyPanel.tsx`
(research.md §4/§7) — the genuinely new data-transform entity this feature
introduces:

| Field | Type | Notes |
|---|---|---|
| `nodes` | `FlowNode[]` | One entry per unique `` `${side}:${rawValue}` `` combination actually present in the mapped `source`/`target` columns across all (post-exclusion) rows — **namespaced by side**, so a value appearing on both sides produces two distinct nodes (research.md §4; the corrected self-loop reasoning). Order is stable (first-seen), not alphabetical — matches `d3-sankey`'s own node-array-order expectations for deterministic layout. |
| `links` | `FlowLink[]` | One entry per distinct (source-node, target-node) pair, `value` equal to the sum of the mapped `value` column across every row sharing that pair (FR-003). Rows with a non-positive mapped `value` are excluded before this aggregation (FR-009) — see `excludedCount` below. |
| `excludedCount` | `number` | Count of rows dropped for having a non-positive mapped `value` (research.md §5) — surfaced by `SankeyPanel.tsx` via a single `console.warn` (including this count and the panel's `title`/`metric` for context) when greater than zero, never rendered as on-panel UI. Always `0` when every row's value was positive; the field always exists (not optional) so a caller can't accidentally skip checking it. |

### `FlowNode`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | The `` `${side}:${rawValue}` `` namespaced key — `d3-sankey`'s own required node identity, resolved via `sankey.nodeId()`. |
| `side` | `'source' \| 'target'` | Which mapped column this node's value came from — drives left/right column placement and is also this feature's mechanism for the namespacing correction (research.md §4), not a cosmetic label. |
| `label` | `string` | The raw column value (e.g. `"SOV"`) — what's actually rendered as the node's on-diagram text, since showing the internal `id` (`"source:SOV"`) to a viewer would be wrong. |

### `FlowLink`

| Field | Type | Notes |
|---|---|---|
| `sourceId` | `string` | A `FlowNode.id` (always a `side: 'source'` node, by construction). |
| `targetId` | `string` | A `FlowNode.id` (always a `side: 'target'` node, by construction — every link flows source-side → target-side, which is what makes the graph structurally acyclic, research.md §4). |
| `value` | `number` | Summed flow magnitude for this (source, target) pair. |

---

## `SankeyLayout` (internal — `panels/sankeyGraph.ts`, wraps `d3-sankey`'s own computed output)

| Field | Type | Notes |
|---|---|---|
| `nodes` | `d3-sankey`'s own computed node objects (each `FlowNode` plus `x0/x1/y0/y1/depth/height/layer/value`) | `sankey()`'s return value (research.md §2) — a pure computation, no DOM touched. Computed fresh on every data change AND every container-resize (research.md §3 — `d3-sankey`'s `extent` is pixel-absolute, unlike a `viewBox`-scalable shape). |
| `links` | `d3-sankey`'s own computed link objects (each `FlowLink` plus `y0/y1/width`) | Same as above; `sankeyLinkHorizontal()` (a path-string generator, not a renderer — research.md §2) turns each into an SVG `<path d="...">` value at render time. |

A rejected/thrown layout (research.md §4's defensive `"circular link"`
catch) never produces a `SankeyLayout` — `SankeyPanel.tsx` catches the
thrown `Error` the same way an unresolvable metric is caught elsewhere in
this codebase, routing to the shared `PanelErrorState` (FR-006).

---

## Color resolution (internal — `panels/sankeyGraph.ts` or a small sibling helper, research.md §6)

| Input | Output | Notes |
|---|---|---|
| `config.color_scheme` set to a recognized name (`Tableau10`, and a small set of other well-known `d3-scale-chromatic` categorical scheme names — exact allow-list is an implementation-task decision, not fixed here) | That scheme's color array, applied via an ordinal scale over `FlowNode.id` (so a node and every link touching it share one color — a link's own color is its *source* node's color, the conventional Sankey coloring choice, not a separate value) | |
| `config.color_scheme` omitted, or set to an unrecognized name | A small ordered palette built from 002-design-tokens' brand hue tokens: `--primary`, `--brand-wfrc-secondary-blue`, `--brand-wfrc-yellow`, `--brand-wfrc-gray` (research.md §6 — a genuinely new categorical-coloring convention for this codebase, not one carried over from `PlotlyPanel`/`ObservablePlotPanel`, neither of which sets an explicit categorical palette today) | |

---

## Relationships

```
dashboard-*.yaml's type: sankey entry
        |
        v  layout/types.ts's parseDashboardConfig()
  SankeyPanelConfig { source, target, value, color_scheme?,
                       ...DataBoundPanelConfigBase }
        |
        v  panels/registry.tsx lookup by .type === 'sankey'
  SankeyPanel.tsx
        |
        +-- useFilterState(extractGlobalFilterIds(config.filter))  [global,
        |    same helper 007 introduced — no observable-plot-specific
        |    inputs: concept applies here, Grammar findings #5]
        |
        v  panelQuery.ts's buildPanelQuery() — same common-key/filter-shape
        |  normalization every data-bound panel type already goes through
        v  sqlExpander.ts's expand(...)
  literal SQL
        |
        v  services/duckdb.ts's query()
  rows: Record<string, unknown>[]
        |
        v  sankeyGraph.ts's rows-to-graph transform (pure, no DOM —
        |  research.md §7): namespace by side, exclude non-positive
        |  values (counting them), aggregate by (source, target) pair
  FlowGraph { nodes, links, excludedCount }
        |
        v  sankeyGraph.ts's d3-sankey layout call (pure, no DOM —
        |  research.md §2): sankey().nodeId(...).extent([[0,0],[w,h]])(graph)
        |  — recomputed on every data change AND every container-resize
        |  (research.md §3), unlike Plotly's cheap resize() call; may throw
        |  a real Error("circular link"), caught into PanelErrorState
  SankeyLayout { nodes (with x0/x1/y0/y1), links (with y0/y1/width) }
        |
        v  SankeyPanel.tsx's own render effect — builds/replaces real
        |  <svg><rect>/<path> DOM under a ref (research.md §2; no
        |  Plot.plot()/Plotly.react()-equivalent single call exists for
        |  this library), colored per the Color resolution table above
  PanelEmptyState (zero rows) -- or -- PanelErrorState (rejected query,
  unresolvable source/target/value column, or a caught cyclic-graph
  Error) -- or -- the rendered diagram
```

`004`'s expand-to-dialog mechanism (`usePanelExpandHost`) relates to this
panel type exactly as it does to every other registry entry —
`SankeyPanel` is just another `PanelComponent` it portals (FR-001, FR-008).
Because the portal host never remounts the component across the
expand/collapse transition, the panel's query result survives that
transition without any sankey-specific handling; the ResizeObserver-driven
full relayout-and-rebuild (research.md §3) is what keeps the *rendered
size* correct on that transition, mirroring `ObservablePlotPanel`'s own
split between "state survives for free (004)" and "rendered size needs its
own fix (this panel type's own resize handling)."
