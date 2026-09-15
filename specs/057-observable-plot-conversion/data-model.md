# Phase 1 Data Model: Observable Plot Chart Consolidation

No new TypeScript type is introduced by this feature — `ObservablePlotPanelConfig`
and `ValueBoxSparklineConfig` (`src/layout/types.ts`) already exist, fully
support every conversion below, and need zero field additions (confirmed,
research.md §5). This document records the config-shape *transformation*
each converted panel undergoes — a content/data-authoring change, not a
schema change — plus the one real runtime-shape entity this feature
introduces implicitly: the sparkline's own small render options object.

## 1. Reused, unchanged types

```ts
// src/layout/types.ts — already exists, zero changes
export interface ObservablePlotPanelConfig
  extends DataBoundPanelConfigBase,
    ComparisonCapablePanelConfig {
  type: 'observable-plot'
  mark: string
  x?: string
  y?: string
  fill?: string
  stroke?: string
  facet_x?: string
  facet_y?: string
  tip?: boolean
  grid?: boolean
  inputs?: ObservablePlotInputConfig[]
}

export interface ValueBoxSparklineConfig {
  metric: string
  x: string
  y: string
  chart_type?: 'bar' | 'line' // default 'bar'
}
```

`ValueBoxSparklineConfig` is unchanged by this feature — its shape is
engine-agnostic already (`metric`/`x`/`y`/`chart_type`); only the
component that reads it (`panels/valueBoxSparkline.tsx`) changes which
library it hands that config to.

## 2. Panel conversion mapping (content, not schema)

Each row below is a `public/demo-dashboard-config/*.yaml` panel entry
whose `type:` and type-specific fields change; `title`, `metric`,
`scenario`/`scenarios`, `filter`, `height`, `width` (the fields every
data-bound panel type shares via `DataBoundPanelConfigBase`) are carried
over unchanged, byte-for-byte, in every conversion.

| Panel | File | Old type-specific fields (removed) | New type-specific fields (added) |
|---|---|---|---|
| Total Trips by Mode | `dashboard-1-summary.yaml` | `chart_type: bar`, `x: major_trip_mode`, `y: share`, `series: scenario` | `mark: barY`, `x: major_trip_mode`, `y: share`, `fill: scenario`, `tip: true`, `grid: true` |
| Average Trip Distance by Purpose | `dashboard-1-summary.yaml` | `traces: [{type: bar, x: $metric.primary_purpose, y: $metric.avg_distance_miles, name: $scenario}]`, `layout: {...}` | `mark: barY`, `x: primary_purpose`, `y: avg_distance_miles`, `fill: scenario`, `tip: true`, `grid: true` |
| Non-Mandatory Tour Frequency by Purpose | `dashboard-3-tour-models.yaml` | `traces: [{type: bar, x: $metric.purpose, y: $metric.tours, name: $scenario}]`, `layout: {barmode: group, ...}` | `mark: barY`, `x: purpose`, `y: tours`, `fill: scenario`, `tip: true`, `grid: true` |
| At-Work Subtour Mode Share by Purpose | `dashboard-4-mode-choice.yaml` | `chart_type: bar`, `x: primary_purpose`, `y: tours`, `series: tour_mode` | `mark: barY`, `x: primary_purpose`, `y: tours`, `fill: tour_mode`, `tip: true`, `grid: true` |
| Trip Mode Share by Time-of-Day Period (WALK_LOC) | `dashboard-4-mode-choice.yaml` | `traces: [{type: bar, x: $metric.time_of_day_period, y: $metric.share, name: $scenario}]`, `layout: {...}` | `mark: barY`, `x: time_of_day_period`, `y: share`, `fill: scenario`, `tip: true`, `grid: true` |
| Trip Departure Hour (Work Trips) | `dashboard-5-trip-models.yaml` | `traces: [{type: bar, x: $metric.depart_hour, y: $metric.trips, name: $scenario}]`, `layout: {barmode: group, ...}` | `mark: barY`, `x: depart_hour`, `y: trips`, `fill: scenario`, `tip: true`, `grid: true` |

Note the grammar difference already documented in `ObservablePlotPanelConfig`'s
own doc comment and confirmed unchanged by this feature: `x`/`y`/`fill`
are **literal column names** (`purpose`, `share`), never
`$metric.<column>`-prefixed the way `PlotlyTraceConfig.x`/`y` are — every
mapping above already reflects this (the `$metric.` prefix is dropped,
not translated).

`fill: scenario` is the literal string `'scenario'` — the same sentinel
`resolveObservablePlotEncoding()` already special-cases (research.md §7)
to apply per-scenario label/color resolution; no other value triggers
that behavior.

## 3. Sparkline render options (new, implicit — `panels/valueBoxSparkline.tsx`)

Not a new exported type — an internal shape the re-implemented component
builds from `ValueBoxSparklineConfig` to call `Plot.plot()`:

```ts
// Conceptual only — mirrors what resolveObservablePlotEncoding() already
// does for full panels, scaled down; not necessarily a separate exported
// function unless the implementation finds one useful.
{
  marks: [Plot[markName](data, { x: config.x, y: config.y })], // markName: 'barY' | 'lineY'
  width: <container width>,
  height: 40,           // matches the existing fixed h-10 container
  x: { axis: null },
  y: { axis: null },
  style: { fontSize: '12px' }, // consistent with the full-panel convention
}
```

No `fill`/`color`/`legend` option — the sparkline renders exactly one
series, matching its current Recharts behavior (no color-by-category
mode exists for a sparkline today, and none is being added).

## 4. Excluded from this data model

- `PlotlyPanelConfig`, `RechartsPanelConfig`, `SankeyPanelConfig` — all
  unchanged; still valid, parseable, renderable panel types (FR-010).
- Any field on `PanelConfigBase`/`DataBoundPanelConfigBase`/
  `ComparisonCapablePanelConfig` — untouched; every converted panel keeps
  its existing `comparison`/`compare_on`/`filter`/`scenario` behavior
  exactly as before (none of the six converted panels use `comparison`
  today, confirmed by direct read of each YAML entry).
