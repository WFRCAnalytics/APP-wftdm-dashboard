# Feature Specification: Pie & Radar Chart Panels

**Feature Branch**: `060-radar-pie-charts`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Add radar chart, piechart to supported Observable chart types."

## Context

This dashboard's charting layer today registers ten panel types
(`panels/registry.tsx`): `valuebox`, `plotly`, `observable-plot`, `table`,
`markdown`, `sankey`, `flowmap`, `zonemap`, `graphic-walker`, `recharts`,
plus the eleventh/twelfth (`treemap`/`sunburst`, `058-hierarchical-chart-
panels`). Observable Plot (`@observablehq/plot@0.6.17`, the version
currently installed) is confirmed, by direct inspection of its own real
source (`node_modules/@observablehq/plot/src/marks/`), to have **no
pie/arc mark and no polar coordinate system at all** — the same class of
gap this project already hit and solved twice before: Sankey diagrams
(`008-sankey-panel`, D3) and treemap/sunburst hierarchies
(`058-hierarchical-chart-panels`, D3). A pie chart and a radar (spider)
chart are therefore **new registry panel types** (`pie`, `radar`), each
with its own dedicated D3-based renderer, following this project's own
established convention: D3 layout/math packages (`d3-shape`) for the hard
geometry, plain DOM/SVG construction for everything else — never
`d3-selection`/`d3-transition` (`SankeyPanel.tsx`'s and
`HierarchicalChartHost.tsx`'s own precedent).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author a pie chart panel for a categorical share metric (Priority: P1)

A dashboard author (the person writing `dashboard-*.yaml`) has a metric
that reports a single categorical breakdown of a whole (e.g. trip mode
share, trip purpose share — both real, already-published metrics whose
values sum to 100% of one scenario's trips). They add a panel with
`type: pie` naming that metric's category and value columns, and it
renders as a real, correctly-proportioned, legible pie chart in the
dashboard.

**Why this priority**: This is the more common, more immediately useful
chart type of the two — a single-series categorical share is a shape that
already appears throughout this dashboard's real content (mode share,
purpose share) and is not well served by any of the ten existing panel
types (a `barY` conveys the same data but not the "parts of a whole"
framing a pie chart makes explicit).

**Independent Test**: Author one `dashboard-*.yaml` panel with
`type: pie` bound to a real, existing categorical-share metric; load the
dashboard and confirm the chart renders proportioned wedges, one per
category, with a legend and hover detail — independent of whether the
radar chart type exists at all.

**Acceptance Scenarios**:

1. **Given** a metric with columns `(category, value)` where values sum
   to a meaningful whole, **When** a `type: pie` panel is configured with
   that metric/category/value, **Then** the panel renders one wedge per
   distinct category, sized proportionally to its value, with a visible
   legend naming each category.
2. **Given** a rendered pie chart, **When** the viewer hovers a wedge,
   **Then** a tooltip shows that category's real value and its percentage
   share of the total.
3. **Given** the dashboard's dark/light theme is toggled, **When** the
   pie chart is visible, **Then** every wedge, its legend swatch, and its
   hover tooltip remain legible and correctly colored in both themes.
4. **Given** the query behind a pie panel returns zero rows, **When** the
   panel loads, **Then** it shows this dashboard's standard empty-state
   message instead of a broken or blank chart.

---

### User Story 2 - Author a radar chart panel comparing categories across one or more series (Priority: P2)

A dashboard author has a metric whose values can be compared across
several named axes (categories) — for example, mode share broken out by
several mode categories, one polygon per scenario — and wants a radar
(spider) chart so a viewer can see each series' overall "shape" across
those axes at a glance, and compare multiple series (e.g. scenarios) on
the same chart.

**Why this priority**: Lower priority than the pie chart because it
depends on a real multi-axis, multi-series data shape that is less common
in this dashboard's existing content (it requires deliberately unpinning
a metric to a `$scenario` union, or a metric with several genuinely
comparable value columns) — still a real, valuable gap the ten existing
panel types don't cover (no existing panel type draws a closed polygon
across named axes), but the pie chart alone already delivers standalone
value.

**Independent Test**: Author one `dashboard-*.yaml` panel with
`type: radar` bound to a metric with an axis column, a value column, and
either an explicit `series` column or an unpinned `$scenario` union
producing more than one series; load the dashboard and confirm one closed
polygon renders per series, sharing one set of labeled axes.

**Acceptance Scenarios**:

1. **Given** a metric with columns `(axis, value)` for a single series,
   **When** a `type: radar` panel is configured with that metric/axis/
   value, **Then** the panel renders one closed polygon connecting a
   point per distinct axis value, with every axis labeled.
2. **Given** the same metric additionally carries a series-distinguishing
   column (e.g. `scenario`), **When** the radar panel is configured with
   that as its series channel, **Then** one distinctly colored polygon
   renders per distinct series value, sharing the same set of axes, with
   a legend identifying each series.
3. **Given** a rendered radar chart, **When** the viewer hovers a vertex,
   **Then** a tooltip shows that axis's real value for that series.
4. **Given** the dashboard's dark/light theme is toggled, **When** the
   radar chart is visible, **Then** every polygon, axis label, legend
   swatch, and hover tooltip remain legible and correctly colored in both
   themes.
5. **Given** the query behind a radar panel returns zero rows, **When**
   the panel loads, **Then** it shows this dashboard's standard
   empty-state message instead of a broken or blank chart.

---

### Edge Cases

- What happens when a pie chart's value column contains a negative or
  zero value for one category? (A negative share has no valid wedge
  angle; a zero-value category should still appear in the legend with no
  visible wedge, not silently vanish.)
- What happens when a pie chart is configured with more distinct
  categories than this app's existing categorical color palette
  (`--chart-1..5`, five colors) has colors for? (Matches the precedent
  already set by every other categorical chart type in this app —
  `rechartsEncoding.ts`'s own documented "cycles past the fifth distinct
  series value, wrapping" behavior.)
- What happens when a radar chart's axis column has fewer than 3 distinct
  values? (A 1- or 2-axis "polygon" degenerates visually; the chart must
  still render without crashing — a real, closed shape with as many
  points as axes exist, even if visually a line or point.)
- What happens when a radar panel's series column produces more distinct
  series than this app's categorical palette has colors for? (Same
  wrap-around answer as the pie-chart color case above, for consistency.)
- What happens when one series in a multi-series radar chart is missing a
  value for one of the axes another series has? (That series' polygon
  must not silently break or shift every remaining vertex — the gap is
  either treated as zero or the axis is omitted for that series' own
  polygon only, but never misaligns the shared axis order.)
- What happens when the panel is expanded via this app's existing
  generic panel-expand mechanism? (Both chart types must redraw crisply
  at the dialog's larger size, matching every other expandable panel
  type's existing behavior.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST support a new panel type, `pie`, that
  renders one wedge per distinct category value from a bound metric,
  sized proportionally to that category's numeric value relative to the
  sum of all categories present in the result.
- **FR-002**: The dashboard MUST support a new panel type, `radar`, that
  renders one closed polygon per series, connecting one point per
  distinct axis value, all series sharing the same set of labeled axes.
- **FR-003**: A `radar` panel MUST support both a single implicit series
  (no series column configured) and multiple explicit series
  (distinguished by a configured column, including the existing
  `scenario` column produced by this dashboard's `$scenario` union
  mechanism).
- **FR-004**: Both new panel types MUST reuse this dashboard's existing
  categorical color convention (the same `--chart-1..5` token cycle
  already used by `recharts` and `observable-plot` categorical charts) —
  a pie chart's wedges keyed by category, a radar chart's polygons keyed
  by series.
- **FR-005**: Both new panel types MUST show a legend identifying each
  category (pie) or series (radar) by name and matching color.
- **FR-006**: Both new panel types MUST show a hover tooltip on their
  data marks (wedges for pie; vertices for radar) displaying that mark's
  real underlying value, using this dashboard's existing shared
  hover-tooltip mechanism.
- **FR-007**: Both new panel types MUST correctly re-color for the
  dashboard's light and dark themes, with no illegible or invisible
  element in either theme.
- **FR-008**: Both new panel types MUST show this dashboard's standard
  empty-state UI when their bound query returns zero rows, and its
  standard error-state UI when the query fails.
- **FR-009**: Both new panel types MUST support this dashboard's existing
  generic panel-expand-to-dialog mechanism, redrawing correctly at the
  larger size.
- **FR-010**: Both new panel types MUST use this dashboard's standard
  panel data-fetch lifecycle (the shared DuckDB query service, global
  filter state, and active-scenario reactivity every existing data-bound
  panel type already uses) — no separate or bespoke data-loading path.
- **FR-011**: The dashboard's panel-authoring documentation MUST describe
  the configuration grammar for both new panel types, matching the level
  of detail already given to each existing panel type.
- **FR-012**: The dashboard's demonstration content MUST include at least
  one real `pie` panel bound to an existing real categorical-share metric
  and at least one real `radar` panel bound to a metric compared across
  multiple axes, each demonstrating genuine, non-fabricated data already
  produced by this project's real data pipeline.
- **FR-013**: A pie chart category with a zero value MUST still appear in
  the legend; a category with a negative value MUST be excluded from the
  rendered wedges rather than corrupting the other wedges' proportions.
- **FR-014**: A radar chart with fewer than 3 distinct axis values MUST
  still render (as a degenerate polygon) rather than failing or showing
  nothing.

### Key Entities

- **Pie panel configuration**: identifies one metric, one category
  column, and one numeric value column; optionally a scenario pin/list
  the same way every other data-bound panel type already supports.
- **Radar panel configuration**: identifies one metric, one axis
  (category) column, one numeric value column, and an optional series
  column (or reliance on the existing multi-scenario union for multiple
  series); optionally a scenario pin/list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A dashboard author can add a working pie chart panel to a
  `dashboard-*.yaml` file using only column names already present in an
  existing metric, with no code change required.
- **SC-002**: A dashboard author can add a working radar chart panel
  comparing 2 or more series on the same axes using only column names
  already present in an existing metric (or the existing `$scenario`
  mechanism), with no code change required.
- **SC-003**: Both new chart types render correctly (legible text,
  correct colors, working hover tooltips) in both the light and dark
  theme, verified visually in each.
- **SC-004**: Both new chart types are demonstrated with at least one
  real, non-fabricated example each in this project's own demo
  dashboards.
- **SC-005**: Neither new chart type introduces a visible regression to
  any of the twelve existing panel types' own rendering or data loading.

## Assumptions

- Both new panel types are added to the existing panel `registry.tsx`
  map (like `treemap`/`sunburst` before them) rather than as new `mark:`
  values inside the existing `type: observable-plot` grammar, since
  Observable Plot itself has no pie/polar rendering capability to extend
  — confirmed directly against the installed package's real source, not
  assumed.
- "Radar chart" refers to the standard polygon/spider-chart form (one
  axis per category, arranged radially, one polygon per series) — not a
  wind-rose, gauge, or any other polar-chart variant.
- A pie chart shows exactly one series (one full circle divided into
  wedges); comparing more than one series' categorical breakdown side by
  side is out of scope for this feature (an author wanting that today can
  already use faceting on other panel types, or multiple pie panels).
- Donut-style (hollow center) rendering, exploded/pulled-out wedges, and
  3D-style effects are out of scope — a plain, flat, WCAG-legible pie
  chart is sufficient to meet the request.
- Real demonstration content reuses existing, already-published
  `summarize.yaml` metrics (e.g. `trip_mode_share`/`trip_purpose_share`
  for the pie chart's category/value shape) rather than requiring a new
  post-processor metric to be authored and re-run through the pipeline —
  if no existing metric cleanly fits the radar chart's multi-axis
  comparison shape, adding one new `summarize.yaml` metric is in scope,
  but no new raw ActivitySim run is required.
- Accessibility (screen-reader/keyboard) parity is expected to match this
  project's own existing standard for its other D3-rendered chart types
  (Sankey, treemap, sunburst) — not a stricter bar than those.
