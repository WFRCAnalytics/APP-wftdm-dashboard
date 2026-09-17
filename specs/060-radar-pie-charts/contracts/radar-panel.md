# Contract: `type: radar` panel

## Grammar

```yaml
- type:   radar
  title:  Trip Mode Share by Scenario
  metric: trip_mode_share
  axis:   major_trip_mode
  value:  share
  series: scenario              # optional — omit for a single-polygon chart
  color_scheme: Tableau10       # optional — falls back to --chart-1..5 cycling
  height: 450
  width:  0.5
```

- `metric`/`filter`/`scenario`/`scenarios` — the standard
  `DataBoundPanelConfigBase` fields, resolved exactly like every other
  data-bound panel type.
- `axis` — a literal column name; one labeled axis per distinct value,
  shared by every series.
- `value` — a literal numeric column name; each series' distance from
  center along an axis, scaled 0..outerRadius against the shared max
  value across every series/axis in the result.
- `series` — optional literal column name; one polygon per distinct
  value (e.g. `scenario`, reusing the same real column every unpinned
  `$scenario` union already produces). Omitted → the whole result is one
  implicit series, one polygon.
- `color_scheme` — same vocabulary as `type: pie`/`type: sankey`.

## Behavior

- **Loading/Empty/Error**: same shared-component convention as every
  other panel type.
- **Fewer than 3 distinct axis values**: still renders — a degenerate
  1- or 2-point "polygon" (a point or a line) rather than failing
  (FR-014).
- **A series missing a value for one axis**: that (series, axis) pair
  defaults to 0 for that series' own polygon only — every series'
  polygon still has one vertex per shared axis, in the same order, never
  shifting or omitting an axis for one series while keeping it for
  another.
- **Negative value**: clamped to 0 before layout (no meaningful negative
  radial distance) — clamped at the aggregation step, not silently
  dropped the way a pie chart's negative-value row is, since dropping an
  axis would misalign every other series' own polygon.
- **Hover**: `mousemove` over a vertex shows a tooltip (`mapTooltip.ts`)
  with that axis's real value for that series; `mouseleave` hides it.
- **Legend**: one entry per series, shown only when more than one series
  is present (a single-series radar's own axis labels already convey
  everything a legend would add).
- **Theme**: same `colorScheme`-dependency-triggered redraw convention as
  every other custom-SVG chart type in this app.
- **Expand (004)**: redraws at the dialog's larger size via the existing
  `ResizeObserver`.

## Non-goals (this feature)

- A configurable radial-axis scale type (log, etc.) — linear only.
- A "fill area" toggle (a radar polygon is always stroked with a
  semi-transparent fill, matching the standard spider-chart convention
  — not author-configurable in this version).
- Any comparison/diff mode (`ComparisonCapablePanelConfig` is not mixed
  into `RadarChartPanelConfig`).
