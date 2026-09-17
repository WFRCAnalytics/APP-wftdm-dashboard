# Contract: `type: pie` panel

## Grammar

```yaml
- type:     pie
  title:    Trip Purpose Share
  metric:   trip_purpose_share
  category: primary_purpose
  value:    share
  scenario: activitysim-baseline   # optional — see "Scenario binding" below
  color_scheme: Tableau10          # optional — falls back to --chart-1..5 cycling
  height: 400
  width:  0.5
```

- `metric`/`filter`/`scenario`/`scenarios` — the standard
  `DataBoundPanelConfigBase` fields, resolved exactly like every other
  data-bound panel type (`buildPanelQuery()` + `sqlExpander.expand()`).
- `category` — a literal column name in the query result; one wedge per
  distinct value.
- `value` — a literal numeric column name; wedge angle is proportional to
  this value relative to the sum of all (non-excluded) values present.
- `color_scheme` — optional named categorical scheme (same vocabulary as
  `type: sankey`'s own `color_scheme`: `Tableau10`/`Observable10`/
  `Category10`/`Set3`); omitted falls back to this app's `--chart-1..5`
  token cycling.

## Scenario binding

A pie chart renders exactly one series (one full circle). Left unpinned,
`$scenario`'s multi-scenario union still executes (no error), but every
scenario's rows are combined into ONE circle with no per-scenario
distinction — an author comparing more than one scenario's own
categorical breakdown should use multiple pie panels (one per scenario)
or a different panel type (e.g. `recharts`/`observable-plot` with
faceting), not rely on this panel type to disambiguate. This is
documented behavior, not a validation error — matching this app's own
"YAML has no runtime schema; author error surfaces as a data-shape
oddity, not a crash" convention.

## Behavior

- **Loading**: shared skeleton state (matching `SankeyPanel.tsx`'s own
  shape/loading convention, adapted to a circular silhouette).
- **Empty** (zero rows): `PanelEmptyState`, standard message.
- **Error** (query failure, or every row excluded by a non-positive
  value leaving zero renderable slices): `PanelErrorState`.
- **Zero-value category**: appears in the legend with a real (zero-angle,
  effectively invisible) wedge — never silently dropped (FR-013).
- **Negative-value category**: excluded from the rendered wedges/legend
  entirely (its row is dropped before aggregation) — never corrupts the
  other wedges' proportions (FR-013). A `console.warn` names the excluded
  count, matching `SankeyPanel.tsx`'s own `excludedCount` convention.
- **Hover**: `mousemove` over a wedge shows a tooltip (`mapTooltip.ts`)
  with that category's real value and its percentage of the total;
  `mouseleave` hides it.
- **Theme**: wedge/legend colors resolve from `--chart-1..5` (or the
  named `color_scheme`) at render time; a theme flip triggers a fresh
  render via the same `colorScheme` dependency `ObservablePlotPanel.tsx`/
  `HierarchicalChartHost.tsx` already include in their render effects.
- **Expand (004)**: redraws at the dialog's larger size via the existing
  `ResizeObserver`, no special handling needed.

## Non-goals (this feature)

- Donut/hollow-center rendering.
- Exploded/pulled-out wedges.
- Multi-series (side-by-side) pie comparison.
