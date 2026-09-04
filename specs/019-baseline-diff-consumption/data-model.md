# Phase 1 Data Model: $baseline consumption across panel types

## Entity: `ComparisonCapablePanelConfig` (new shared mixin)

Mirrors `MapRenderingPanelConfig`'s existing pattern exactly (`layout/types.ts`) — a small interface carrying only the fields a specific subset of panel types opt into via `extends`, not promoted onto the universal `DataBoundPanelConfigBase`.

```ts
export interface ComparisonCapablePanelConfig {
  comparison?: 'side_by_side' | ComparisonDiff
  compare_on?: string[]
}
```

| Field | Type | Meaning |
|---|---|---|
| `comparison` | `'side_by_side' \| ComparisonDiff` (optional) | Unchanged in shape from `013-zonemap-panel`'s existing field — omitted or `'side_by_side'` means no change from pre-existing behavior. |
| `compare_on` | `string[]` (optional) | NEW. Names the column(s) that jointly identify a "comparable row" between the two sides of a diff. Required in practice for `plotly`/`table`/`observable-plot` when `comparison` is the `diff` shape (no reasonable single-column default exists for them — Assumptions). For `zonemap`, defaults to `[metric_id]` when omitted, preserving every existing zonemap `comparison: diff` config unchanged. |

### Consumers (all four, identical mixin)

| Panel type | Before | After |
|---|---|---|
| `ZoneMapPanelConfig` | Declares `comparison?: 'side_by_side' \| ComparisonDiff` locally | `extends DataBoundPanelConfigBase, MapRenderingPanelConfig, ComparisonCapablePanelConfig` — local `comparison` field removed, now inherited (adds `compare_on` to zonemap too, optional) |
| `PlotlyPanelConfig` | No comparison concept | `extends DataBoundPanelConfigBase, ComparisonCapablePanelConfig` |
| `TablePanelConfig` | No comparison concept | `extends DataBoundPanelConfigBase, ComparisonCapablePanelConfig` |
| `ObservablePlotPanelConfig` | No comparison concept | `extends DataBoundPanelConfigBase, ComparisonCapablePanelConfig` |

`ComparisonDiff` itself (`type: 'diff'`, `a: string`, `b: string`, `expr: string`) is **unchanged** — `a`/`b` remain plain `string`; `'$baseline'` is a value those fields can hold, not a type-level change (spec Grammar finding #1).

## Entity: Resolved comparison (query-time only, not stored)

Two pure functions in `panels/panelQuery.ts`, both used identically by all four panel types' own fetch effects:

```ts
function resolveComparisonScenarioName(name: string, baseline: string | undefined): string | undefined
function buildComparisonDiffQuery(metric: string, aScenario: string, bScenario: string, compareOn: string[], expr: string): string
function isComparisonDiff(comparison: 'side_by_side' | ComparisonDiff | undefined): comparison is ComparisonDiff
```

| Step | Input | Output |
|---|---|---|
| 1. Type-narrow | `config.comparison` | `isComparisonDiff()` → is this a diff, or side-by-side/omitted? |
| 2. Resolve each side | `diff.a`/`diff.b`, `useBaseline()`'s current value | `resolveComparisonScenarioName()` → a real scenario name, or `undefined` if `'$baseline'` and unresolved |
| 3. Gate | either resolved side is `undefined` | Panel shows its existing error state (FR-011); query never built |
| 4. Build SQL | metric, both resolved names, `compare_on ?? [metric_id]` (zonemap only), `expr` | `buildComparisonDiffQuery()` → the query text, run directly (no `sqlExpander.expand()` — unchanged from today, research.md §4) |

## Entity: `diff_value` (query result column, not a stored entity)

Always the literal column name `diff_value` in the query result — unchanged from `013-zonemap-panel`'s own existing convention (spec FR-004). `NULL` is its own defined state (research.md §6):

| Panel type | `diff_value: null` rendering |
|---|---|
| `table` | `formatValue()` → `'N/A'` (new explicit branch); `cellColor()` → a dedicated, visibly-distinct "not computable" color (new explicit branch), never blended into the real color scale |
| `plotly` | Point omitted — Plotly.js's own native null-handling, zero new code |
| `observable-plot` | Row filtered out before `Plot.plot()` sees it — `resolveObservablePlotEncoding()`'s new explicit filter (corrected during implementation: `barY`'s own native handling was empirically found to render a null y as a real `height="0"` rect at the real-0-value position instead, research.md §6) |
| `zonemap` | Unaffected by this feature — `013`'s own existing `resolveZoneFillColor()` already handles a missing/null value correctly (the precedent this feature's `table` fix is modeled on) |

## State/reactivity model

No new state. Each panel type's own existing fetch effect gains:
1. `useBaseline()` called near the top of the component (mirroring the existing `useActiveScenarios()` call site in each file).
2. Its return value added to the fetch effect's dependency array (FR-016).
3. A `comparison: diff` branch inside that SAME effect (mirroring `ZoneMapPanel.tsx`'s own existing `isComparisonDiff(config.comparison) ? ... : ...` branch) — not a second, separate effect.

No component's render-time JSX structure changes beyond what already renders `diff_value`-bound content through its own pre-existing field-binding grammar (`x`/`y`/`color` for plotly, `x`/`y`/`fill`/`stroke` for observable-plot, `field` for table columns) — no new JSX, no new component.
