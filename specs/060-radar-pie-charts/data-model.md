# Data Model: Pie & Radar Chart Panels

## §1. Panel configuration types (`layout/types.ts`)

Both extend `DataBoundPanelConfigBase` directly — like `SankeyPanelConfig`
— NOT `ComparisonCapablePanelConfig` (no `comparison: diff`/baseline mode
in this feature, per spec.md Assumptions). `category`/`value`/`axis`/
`series` are literal, author-named result-set columns — never
`$metric.`-prefixed — matching `SankeyPanelConfig.source/target/value`'s
own established convention.

```ts
/**
 * The thirteenth panel type — 060-radar-pie-charts. A single-series
 * circular chart: one wedge per distinct `category` value, sized by
 * `value` relative to the sum of all categories present in the result.
 * No donut (innerRadius is always 0) and no exploded/pulled-out wedges —
 * spec.md Assumptions.
 */
export interface PieChartPanelConfig extends DataBoundPanelConfigBase {
  type: 'pie'
  category: string
  value: string
  color_scheme?: string
}

/**
 * The fourteenth panel type — 060-radar-pie-charts. One closed polygon
 * per series, plotted across a shared set of labeled axes (one per
 * distinct `axis` value). `series` is optional — omitted, the whole
 * result is treated as one implicit series (a single polygon); present,
 * one polygon per distinct value of that column (e.g. `series: scenario`
 * against an unpinned $scenario union — the same real column every other
 * scenario-colored chart panel type already reads, e.g.
 * ObservablePlotPanelConfig's `fill: scenario`).
 */
export interface RadarChartPanelConfig extends DataBoundPanelConfigBase {
  type: 'radar'
  axis: string
  value: string
  series?: string
  color_scheme?: string
}
```

Both added to the `PanelConfig` union in `layout/types.ts`.

## §2. `pieData.ts` — pure transform

```ts
export interface PieSlice {
  category: string
  value: number
}

export interface PieAggregateResult {
  slices: PieSlice[]        // one per distinct category, duplicates summed
  excludedCount: number     // rows dropped for a non-positive value
}

/** Rows -> aggregated slices. Mirrors sankeyGraph.ts's buildFlowGraph():
 * sums duplicate `category` values (a metric SQL already GROUPs BY the
 * category column in every real case, but this stays defensive rather
 * than assuming), excludes any row whose mapped `value` is <= 0 or
 * non-finite (FR-013 — a negative value has no valid wedge angle),
 * counting exclusions for the caller's console.warn. A category whose
 * only contributing row(s) were all excluded never appears in `slices`
 * at all — FR-013's "still appears in the legend" requirement is
 * therefore about a category with a genuine ZERO value (kept, sized as
 * a zero-angle wedge), not a category with only negative rows (dropped
 * entirely, same as Sankey's own non-positive-value convention). */
export function aggregatePieSlices(
  config: Pick<PieChartPanelConfig, 'category' | 'value'>,
  rows: Record<string, unknown>[],
): PieAggregateResult

export interface PieWedge extends PieSlice {
  path: string        // SVG <path> `d` attribute from d3.arc()
  percentage: number  // value / sum(all slice values), for tooltip text
}

/** Pure d3.pie()/d3.arc() geometry — DOM-free (d3-shape's own generator
 * functions have no DOM dependency, confirmed against the installed
 * package, same as d3-sankey's own layout() call). innerRadius is always
 * 0 (no donut — spec.md Assumptions). A zero-value slice produces a
 * real, valid zero-angle arc (a degenerate but non-crashing path) —
 * still present in the returned array so the caller's legend still lists
 * it (FR-013). */
export function layoutPieWedges(slices: PieSlice[], radius: number): PieWedge[]
```

## §3. `radarData.ts` — pure transform

```ts
export interface RadarSeries {
  name: string                         // distinct `series` value, or a
                                        // fixed implicit-series label when
                                        // `series` is unconfigured
  valuesByAxis: Map<string, number>    // one entry per distinct axis
                                        // value seen anywhere in the
                                        // result — missing entries for
                                        // THIS series default to 0 when
                                        // read (never omitted from the
                                        // Map key set), so every series'
                                        // polygon shares the identical
                                        // axis order (edge case: "must
                                        // never misalign the shared axis
                                        // order")
}

export interface RadarAggregateResult {
  axes: string[]           // distinct axis values, first-seen order
  series: RadarSeries[]    // distinct series values, first-seen order
                            // (or one synthetic entry when unconfigured)
}

/** Rows -> {axes, series}. A row missing `series` config resolves every
 * row into one implicit series. Duplicate (series, axis) rows sum their
 * `value` (same defensive convention as pieData.ts's aggregatePieSlices
 * / sankeyGraph.ts's buildFlowGraph). A negative `value` is clamped to 0
 * at THIS layer (not layoutRadarPoints — the aggregate result should
 * never carry an unrenderable negative magnitude forward), since radar
 * has no equivalent to a "dropped wedge" — every axis must stay present
 * for every series to keep the shared axis order intact. */
export function aggregateRadarSeries(
  config: Pick<RadarChartPanelConfig, 'axis' | 'value' | 'series'>,
  rows: Record<string, unknown>[],
): RadarAggregateResult

export interface RadarPoint {
  x: number
  y: number
  axis: string
  value: number   // the real, pre-scaling value — for tooltip text
}

export interface RadarPolygon {
  seriesName: string
  points: RadarPoint[]  // one per axis, in `axes` order — closed by the
                         // renderer (path 'Z'), not by repeating the
                         // first point in this array
}

/** Pure polar-coordinate geometry (research.md §4) — no D3 layout
 * package. `maxValue` is the shared radius-scale domain max across ALL
 * series (computed by the caller from `aggregateRadarSeries()`'s own
 * output) — a fixed 0 domain min (never negative, since values are
 * already clamped to >= 0 by aggregateRadarSeries). Angles start at
 * -π/2 (12 o'clock) and proceed clockwise, matching Recharts'/Chart.js's
 * own real radar-chart convention. A `maxValue` of 0 (every value is 0)
 * degenerates every point to the exact center — still a valid, non-
 * crashing polygon (a single point repeated N times), matching FR-014's
 * "must still render" requirement for the analogous few-axes case. */
export function layoutRadarPolygons(
  data: RadarAggregateResult,
  center: { cx: number; cy: number },
  outerRadius: number,
  maxValue: number,
): RadarPolygon[]

/** The N axis label positions (angle + a text-anchor-friendly point
 * slightly beyond outerRadius) — separate from layoutRadarPolygons()
 * since a label is drawn once per axis, not once per (axis, series)
 * pair. */
export function layoutRadarAxisLabels(
  axes: string[],
  center: { cx: number; cy: number },
  outerRadius: number,
): { axis: string; angle: number; x: number; y: number }[]
```

## §4. `polarChartColor.ts` — shared color-scheme resolution

Identical shape/signature to `sankeyColor.ts`/`hierarchyColor.ts`
(research.md §5) — a `Record<string, readonly string[]>` lookup over the
same four named `d3-scale-chromatic` schemes (`Tableau10`, `Observable10`,
`Category10`, `Set3`), returning `undefined` for an omitted/unrecognized
name so the caller falls back to the token-derived `--chart-1..5` default
— shared by both `PieChartPanel.tsx` and `RadarChartPanel.tsx`.

```ts
export function resolvePolarColorScheme(colorScheme: string | undefined): readonly string[] | undefined
```

## §5. `ChartLegend.tsx` — shared presentational component

```ts
export interface ChartLegendEntry {
  label: string
  color: string
}

export function ChartLegend({ entries }: { entries: ChartLegendEntry[] }): JSX.Element
```

A plain flex-wrap row below the chart SVG, one `{swatch, label}` pair per
entry — pie: one per distinct category; radar: one per distinct series
(omitted/single-entry-hidden when radar has no configured `series`, since
a one-series radar's own axis labels already name everything a legend
would).

## §6. Panel component shape (both `PieChartPanel.tsx`/`RadarChartPanel.tsx`)

Mirrors `SankeyPanel.tsx` exactly (research.md §8):

1. Mount-only effect: `createMapTooltip(containerRef.current)`, torn down
   on unmount.
2. Fetch effect (deps: `config`, `filters`, `activeScenarioNames`):
   `buildPanelQuery(config, filters)` → `sqlExpander.expand(...)` →
   `ensureRegistered(...)` → `query(sql)` → `loading`/`empty`/`ready`/
   `error` state, identical to `SankeyPanel.tsx`.
3. Render-and-swap effect (deps: `config`, `rows`, `status`): aggregate
   (`aggregatePieSlices`/`aggregateRadarSeries`) → layout
   (`layoutPieWedges`/`layoutRadarPolygons` + `layoutRadarAxisLabels`) →
   build a fresh `<svg>` via `document.createElementNS()` → attach
   `mousemove`/`mouseleave` listeners per wedge/vertex calling
   `tooltip.show()`/`tooltip.hide()` → swap into the container (remove
   the previous `<svg>` only, never the tooltip div) → compute this
   render's `ChartLegendEntry[]` into component state so the legend
   (rendered by React, not the imperative SVG code) re-renders alongside
   it.
4. `ResizeObserver` on the container, same last-width/last-height guard
   convention as `SankeyPanel.tsx`/`ObservablePlotPanel.tsx`.
5. `loading`/`empty`/`error` states use `PanelEmptyState`/
   `PanelErrorState`, matching every other panel type.

## §7. Real demo content bindings

| Panel | Metric | Columns used | Scenario binding |
|---|---|---|---|
| Pie (`dashboard-5-trip-models.yaml`) | `trip_purpose_share` | `category: primary_purpose`, `value: share` | `scenario: activitysim-baseline` (pinned — a pie chart is single-series) |
| Radar (`dashboard-4-mode-choice.yaml`) | `trip_mode_share` | `axis: major_trip_mode`, `value: share`, `series: scenario` | unpinned — reuses the existing `$scenario` union already active on this tab's sibling panels |
