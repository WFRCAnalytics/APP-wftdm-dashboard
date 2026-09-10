# Feature Specification: shadcn/Recharts Chart Panel Type

**Feature Branch**: `029-shadcn-chart-panel`

**Created**: 2026-09-06

**Status**: Draft

**Input**: User description: "Add a new panel type using shadcn/ui's official chart component (a themed layer over Recharts, not a wrapper) as this app's new default/primary charting option for the chart types it supports. Additive — plotly, observable-plot, and sankey are not modified, replaced, or deprecated; they remain fully supported for cases this new panel type doesn't cover (Sankey diagrams; Plotly-style interactive per-category legend toggling, explicitly accepted as not being replicated)."

## Research Findings (grounding this spec)

Confirmed directly against this codebase and against shadcn/ui's/Recharts'
own real, current source before writing requirements below — this is the
first feature to actually build what `project-docs/PIPELINE.md`'s own "five total
chart technologies" note and the `wftdm-design-system` skill's own
"Charting research" section already researched; nothing here re-derives
those findings, only applies them:

- **Naming precedent, confirmed against every existing panel type's own
  `type:` value** (`project-docs/GRAMMAR.md`): chart-rendering panel types name the
  underlying rendering LIBRARY directly (`plotly`, `observable-plot`), not
  a generic word or the theming layer on top of it. Following that same
  precedent, this feature's new panel type is named `type: recharts` — not
  `chart` (too generic, collides conceptually with every panel type that
  already renders a chart) and not `shadcn` (names the theming layer, not
  the rendering library, breaking the established convention).
- **Grammar precedent, confirmed against `ObservablePlotPanelConfig`'s own
  real shape** (`layout/types.ts`): that panel type's field-mapping keys
  (`x`, `y`, `fill`, `stroke`) are plain literal column names the author
  supplies directly, never a `$metric.`-prefixed placeholder string
  (Plotly's older `PlotlyTraceConfig` still uses `$metric.<column>`
  strings inside `traces[].x`/`traces[].y`, an earlier convention this
  project has already moved past once, in `007-observable-plot-panel`).
  This feature follows the newer, already-established convention, not the
  older one.
- **`buildPanelQuery()` (`panels/panelQuery.ts`), confirmed to already be
  fully generic**: it accepts any `DataBoundPanelConfigBase`-extending
  config and needs zero modification to serve a new panel type that
  extends the same base interface — the same base every other data-bound
  panel type (`valuebox`, `plotly`, `table`, `observable-plot`, `sankey`)
  already extends.
- **Recharts is confirmed NOT present in this project today** (`node_modules`
  checked directly) — this feature adds it as a new, real npm dependency,
  not something transitively already available.
- **shadcn's own chart component is confirmed a thin theming layer over
  Recharts**, not a wrapper (their own docs: "We do not wrap Recharts"),
  confirmed via direct source read this session
  (`apps/v4/registry/new-york-v4/ui/chart.tsx`). Colors flow through a
  two-tier CSS-variable system: a per-chart `ChartConfig` naming each
  series' color (typically `var(--chart-1)` through `--chart-5` — tokens
  this app does not yet define), remapped by `ChartStyle` into
  per-chart-instance-scoped `--color-{seriesKey}` variables.
- **Confirmed real chart-type coverage vs. this app's actual current
  grammar**: shadcn's own showcased set covers Area/Bar/Line/Pie/Radar/
  Radial; this app's real, authored grammar today only ever uses
  `type: bar`/`type: scatter` (Plotly) and `mark: barY`/`mark: lineY`
  (Observable Plot) — no dashboard anywhere in this project currently
  authors a pie, radar, or radial chart of any kind.
- **Two gaps already researched and confirmed — explicitly NOT
  re-investigated or solved by this feature**: no Sankey diagram support
  (Recharts has a real `Sankey` component, but it sits outside shadcn's
  own examples and would offer no advantage over the already-working
  `d3-sankey`-based `sankey` panel type); no legend-click-to-toggle
  behavior (shadcn's shipped `ChartLegendContent` wires up no click
  handler at all — a real, closed-without-a-fix upstream request,
  `shadcn-ui/ui#4188` — while Plotly's own equivalent behavior stays free
  and automatic for any panel still using `type: plotly`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author a bar, line, or area chart with the new default engine (Priority: P1)

A dashboard author building a new chart panel — or updating an existing
one — wants to use this app's new default charting option for the common
case (a bar, line, or area chart), getting a chart that automatically
matches the app's own visual design system (typography, spacing, color
tokens, light/dark theme) with no manual theming work of their own.

**Why this priority**: This is the entire value of the feature — a new,
better-integrated default for the large majority of this app's real
charting needs (confirmed: every real chart authored in this project today
is a bar, line, or scatter/point chart).

**Independent Test**: Author a `type: recharts` panel in a `dashboard-*.yaml`
naming a real metric and a chart type (bar, line, or area), with real
column names for its axes; confirm it renders a real, correctly-shaped
chart from real queried data, in both light and dark mode, with no
author-side theming code.

**Acceptance Scenarios**:

1. **Given** a `type: recharts` panel configured with `chart_type: bar` and
   real x/y column names, **When** the dashboard tab renders, **Then** a
   real bar chart appears, its bars colored from this app's own new
   chart-color tokens, matching real data queried from the panel's
   configured metric.
2. **Given** the same panel, **When** the same tab is viewed in dark mode,
   **Then** the chart's colors, gridlines, axis labels, and tooltip remain
   fully legible and visually consistent with the rest of the app's dark
   theme — verified the same rigorous way this project already verifies
   every other themed surface (a real computed-style check in both
   themes), not a visual glance alone.
3. **Given** a panel author picks `chart_type: line` or `chart_type: area`
   instead, **When** the panel renders, **Then** the same theming,
   tooltip, and data-binding behavior applies, changing only the visual
   mark.
4. **Given** a metric with more than one distinct series (e.g. a
   categorical grouping column), **When** the chart renders, **Then**
   each series gets its own distinct color from the new chart-color token
   set, with a legend identifying each one (display only — no
   click-to-toggle, per this feature's own accepted scope boundary).

---

### User Story 2 - Existing panel types remain completely unaffected (Priority: P1)

A dashboard author who already has working `plotly`, `observable-plot`, or
`sankey` panels sees no change to any of them after this feature ships —
this is a new, additional option, not a migration.

**Why this priority**: Equal in importance to User Story 1 — this feature
is explicitly additive; regressing any of the three existing chart-
rendering panel types would violate the feature's own core premise.

**Independent Test**: Render a dashboard tab containing one panel of each
existing chart-rendering type (`plotly`, `observable-plot`, `sankey`)
alongside a new `recharts` panel; confirm all four render correctly, and
that none of the three pre-existing types' own rendering, theming, or
test coverage changed.

**Acceptance Scenarios**:

1. **Given** an existing `plotly` panel authored before this feature
   shipped, **When** the dashboard renders after this feature ships,
   **Then** it renders identically — same chart, same interactive legend
   toggle behavior, same theming.
2. **Given** an existing `sankey` panel, **When** viewed after this
   feature ships, **Then** it is completely unaffected — this feature
   does not attempt to render Sankey diagrams at all.

---

### User Story 3 - A viewer gets useful, on-brand tooltips without extra author work (Priority: P2)

A viewer hovering over a `recharts` panel's chart sees a clear tooltip
showing the real underlying data value(s) for that point, styled
consistently with the rest of the app (matching this app's own established
shared tooltip visual language), without the dashboard author having
configured any tooltip behavior explicitly.

**Why this priority**: A real, working tooltip is part of what makes a
chart usable at all, but it's a supporting capability to User Story 1's
core "render a themed chart" value, not the reason this feature exists.

**Independent Test**: Hover over a rendered `recharts` panel's chart; a
tooltip appears showing the real value(s) at that point, legible in both
light and dark mode.

**Acceptance Scenarios**:

1. **Given** a rendered bar or line chart, **When** a viewer hovers over a
   data point, **Then** a tooltip shows that point's real underlying
   value(s), sourced from the same query result the chart itself renders
   from — never a placeholder or stale value.

---

### Edge Cases

- What happens when a `recharts` panel's query returns zero rows? The
  panel must show this app's own existing shared empty-result state
  (matching every other data-bound panel type), never a blank chart area.
- What happens when a `recharts` panel's query fails? The panel must show
  this app's own existing shared error state, matching every other panel
  type's own established failure handling (a broken panel must never
  prevent sibling panels on the same tab from rendering).
- What happens when an author sets `chart_type` to something this first
  version doesn't support (e.g. `pie`)? This must fail clearly and
  visibly (a configuration error surfaced the same way other panel types
  already surface an invalid/unsupported configuration), never silently
  render nothing or fall back to an unrelated chart type.
- What happens when a metric has only one series (no grouping column)? A
  single-series chart renders correctly, using only the first chart-color
  token — the legend either shows one entry or is omitted, whichever this
  app's own established valuebox/plotly single-series precedent already
  does (no new behavior invented here).
- What happens in dark mode specifically? Every visual aspect (bars/lines/
  areas, axis text, gridlines, tooltip surface, legend text) must remain
  legible and on-token — this is the one area this feature's own
  Functional Requirements call out for mandatory, real (not visual-glance)
  verification, given this project's own repeated history of dark-mode-
  specific bugs in every other charting panel type.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a new panel type, `type: recharts`,
  authorable in `dashboard-*.yaml` exactly like every other panel type
  (a named `type:` value inside a tab's `layout:` rows).
- **FR-002**: This new panel type MUST bind to real queried data the same
  way every other data-bound panel type does — a `metric:` naming which
  published dataset to query, with the same `scenario:`/`scenarios:`/
  `filter:` grammar every other data-bound panel type already supports,
  reusing the existing query-building mechanism unmodified.
- **FR-003**: Authors MUST configure this panel type's chart axes/series by
  naming real, literal column names present in the queried result set
  (e.g. which column is the category axis, which is the value, which
  column — if any — splits the data into multiple series) — never a
  `$metric.`-prefixed placeholder string.
- **FR-004**: The system MUST support, at minimum, bar, line, and area
  chart types in this first version. Pie, radar, and radial chart types
  are explicitly OUT OF SCOPE for this feature (no real dashboard in this
  project authors one today) and MAY be added later as a separate,
  deliberate extension once a real need is confirmed.
- **FR-005**: Every visual aspect of a rendered `recharts` panel (series
  colors, axis text, gridlines, tooltip surface and text, legend) MUST
  resolve from this app's own real design tokens (existing tokens plus
  the new chart-color tokens this feature adds), automatically following
  the app's current light/dark theme with no per-panel author
  configuration required.
- **FR-006**: The system MUST introduce a new, dedicated set of chart
  series color tokens (five colors), each with both a light-mode and a
  dark-mode value, following this app's own established token-addition
  discipline (verified for WCAG contrast the same way every other
  token pair already is) and deliberately chosen to read as visually
  consistent with — not a clash against, and not a generic default
  palette unrelated to — this app's existing WFRC brand blue.
- **FR-007**: A `recharts` panel showing more than one series MUST display
  a legend identifying each series by color. Clicking a legend entry to
  show/hide that series is explicitly OUT OF SCOPE for this feature — the
  legend is informational/display-only. A dashboard author who needs that
  specific interaction continues to use a `plotly` panel for that chart
  instead, which already provides it for free.
- **FR-008**: A `recharts` panel MUST show a tooltip on hover, presenting
  the real underlying value(s) for the hovered data point, styled
  consistently with this app's own established visual language.
- **FR-009**: A `recharts` panel MUST participate in this app's existing
  shared empty-result and error states, exactly like every other
  data-bound panel type — a failure in one panel must never affect
  sibling panels on the same tab.
- **FR-010**: This feature MUST NOT modify, regress, or change the
  rendering, theming, or behavior of the existing `plotly`,
  `observable-plot`, or `sankey` panel types in any way.
- **FR-011**: This feature MUST NOT implement Sankey-diagram rendering of
  any kind — that gap is deliberately, permanently out of scope for this
  panel type; `sankey` remains the only supported way to author a Sankey
  diagram in this app.
- **FR-012**: Every visual aspect introduced by this feature MUST be
  verified correct in both light and dark mode via a real, automated,
  computed-style check (matching this app's own established
  `getComputedStyle()`-based verification technique) before being
  considered complete — not a visual/manual check alone, per this
  project's own already-established dual-theme verification discipline.

### Key Entities

- **Recharts Panel Configuration**: An author-facing panel definition —
  which metric/scenario(s)/filter(s) to query (shared with every other
  data-bound panel type), which chart type to render (bar/line/area),
  and which real, literal result-set columns map to the chart's axes and
  optional series-grouping.
- **Chart Color Token Set**: Five new, paired (light/dark) design tokens
  representing the palette a `recharts` panel's series colors are drawn
  from — a new, small addition to this app's existing token system, not a
  replacement for any existing token.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A dashboard author can add a new bar, line, or area chart
  using this panel type, with real data rendering correctly, without
  writing any custom theming or color logic of their own.
- **SC-002**: 100% of this app's currently-authored Plotly `bar`/`scatter`
  and Observable Plot `barY`/`lineY` chart configurations have a directly
  equivalent representation achievable in this new panel type's grammar
  (measuring real grammar coverage, not requiring any existing panel to
  actually be migrated).
- **SC-003**: Every visual element of a rendered chart remains fully
  legible in both light and dark mode, confirmed by real automated checks,
  with zero manual "it looked fine" sign-off standing in for that
  verification.
- **SC-004**: Zero regressions in any existing `plotly`, `observable-plot`,
  or `sankey` panel's own existing, already-passing test coverage.
- **SC-005**: An author who needs Sankey rendering or Plotly's
  interactive per-category legend toggle can clearly tell, from this
  panel type's own documented grammar, that they should use the existing
  `sankey`/`plotly` panel type instead — no ambiguity about which panel
  type to reach for.

## Assumptions

- **Panel type name**: `recharts` — matches this app's own established
  convention of naming a chart-rendering panel type after its underlying
  rendering library (`plotly`, `observable-plot`), not the theming layer
  on top of it (`shadcn`) or a generic term (`chart`).
- **Grammar shape**: field-mapping keys name real, literal result-set
  columns directly (no `$metric.` placeholder prefix), matching
  `observable-plot`'s own already-established precedent — the exact field
  names themselves are an implementation-level design decision for
  `/speckit-plan`, not fixed by this spec.
- **Scope of chart types**: bar, line, and area only in this first version
  — matches 100% of this app's real, currently-authored chart grammar
  (no dashboard anywhere in this project authors a pie/radar/radial chart
  today). Pie/radar/radial are a deliberate, explicit non-goal for this
  feature, not an oversight.
- **Comparison/baseline-diff support**: this panel type is assumed to
  support the same `comparison: diff`/baseline mechanism every other
  data-bound chart-rendering panel type (`plotly`, `table`,
  `observable-plot`) already does, for grammar consistency — reusing the
  existing shared mechanism, not inventing a new one.
- **No panel-local reactive inputs in v1**: `observable-plot`'s own
  panel-local `inputs:` capability (independent select/range controls
  local to one panel) is NOT included in this first version — a
  deliberate, explicit scope boundary, not an oversight, added only if a
  real future need is confirmed.
- **Exact chart-color token values**: this spec requires the tokens exist,
  be WCAG-verified, and read as visually consistent with the existing WFRC
  brand blue — the actual hex/oklch values themselves are a design
  decision for `/speckit-plan`, made in direct consultation with this
  project's own `wftdm-design-system` skill (which already governs this
  app's color-token discipline), not invented ad hoc here.
- **New dependency**: Recharts is confirmed not currently present in this
  project and will be added as a new, real npm dependency by this
  feature — not a transitive dependency already available.
