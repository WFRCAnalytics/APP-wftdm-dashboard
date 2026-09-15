# Contract: Panel Conversions (`public/demo-dashboard-config/*.yaml`)

Satisfies FR-001, FR-002, FR-005, FR-006, FR-007, FR-011. Six real chart
panels, four files, re-authored from `plotly`/`recharts` to
`observable-plot`. No `src/` code change is required to make any of these
render — `ObservablePlotPanelConfig`/`resolveObservablePlotEncoding()`/
`ObservablePlotPanel.tsx` already fully support every field used below
(data-model.md §1/§2).

## `dashboard-1-summary.yaml`

```yaml
  row_charts:
    - type:    observable-plot
      title:   Total Trips by Mode
      metric:  trip_mode_share
      mark:    barY
      x:       major_trip_mode
      y:       share
      fill:    scenario
      tip:     true
      grid:    true
      height:  400
      width:   0.5

    - type:    observable-plot
      title:   "Average Trip Distance by Purpose"
      metric:  trip_distance_by_purpose
      mark:    barY
      x:       primary_purpose
      y:       avg_distance_miles
      fill:    scenario
      tip:     true
      grid:    true
      height:  400
      width:   0.5
```

`layout.xaxis.title`/`layout.yaxis.title`/`showlegend` (Plotly-only
fields) are dropped — Observable Plot derives axis labels from the field
name by default (matching every existing Observable Plot panel's own
convention of not overriding them) and shows a legend automatically
whenever `fill` is set (`observablePlotEncoding.ts`'s existing
`color: {legend: true}` behavior — no `showlegend`-equivalent key exists
or is needed).

## `dashboard-3-tour-models.yaml`

```yaml
  row_non_mandatory_tour_freq:
    - type:    observable-plot
      title:   "Non-Mandatory Tour Frequency by Purpose"
      metric:  non_mandatory_tour_freq_summary
      mark:    barY
      x:       purpose
      y:       tours
      fill:    scenario
      tip:     true
      grid:    true
      height:  400
      width:   1.0
```

`barmode: group` has no separate Observable Plot equivalent to set — a
`fill`-colored `barY` mark already renders one bar per distinct
`(x, fill)` combination side-by-side by default (Plot's own grouping
behavior for a categorical color channel), matching Plotly's
`barmode: group` visual result for this data shape.

## `dashboard-4-mode-choice.yaml`

```yaml
  row_atwork_subtour_mode:
    - type:       observable-plot
      title:      "At-Work Subtour Mode Share by Purpose"
      metric:     atwork_subtour_mode_summary
      scenario:   activitysim-baseline
      description: "Baseline scenario, split by mode. Compare runs on the other Mode Choice panels via the Scenarios tab."
      mark:       barY
      x:          primary_purpose
      y:          tours
      fill:       tour_mode
      tip:        true
      grid:       true
      height:     400
      width:      1.0

  # row_trip_mode_flow (sankey) — UNCHANGED, see contracts/test-migration.md
  # for why it's excluded, not omitted by oversight.

  row_trip_mode_by_period:
    - type:    observable-plot
      title:   "Trip Mode Share by Time-of-Day Period (WALK_LOC)"
      metric:  mode_share_by_period
      filter:  { trip_mode: WALK_LOC }
      mark:    barY
      x:       time_of_day_period
      y:       share
      fill:    scenario
      tip:     true
      grid:    true
      height:  400
      width:   1.0
```

`scenario: activitysim-baseline` and `filter:` carry over unchanged
(`DataBoundPanelConfigBase` fields, identical grammar across every panel
type). The At-Work Subtour panel's `fill: tour_mode` (not `scenario`) is
deliberate — it stays pinned to one scenario because its color channel is
already committed to the mode breakdown, matching the same real pattern
the already-existing, already-audited Observable Plot panels use
(research.md §7) — this is not a partial/incomplete conversion, it is the
correct translation of what `series: tour_mode` already meant.

## `dashboard-5-trip-models.yaml`

```yaml
  row_trip_scheduling:
    - type:    observable-plot
      title:   "Trip Departure Hour (Work Trips)"
      metric:  trip_scheduling
      filter:  { primary_purpose: work }
      mark:    barY
      x:       depart_hour
      y:       trips
      fill:    scenario
      tip:     true
      grid:    true
      height:  400
      width:   1.0
```

## What does NOT change

- `panels/panelQuery.ts`, `services/sqlExpander.ts` — zero changes.
- `panels/PlotlyPanel.tsx`, `panels/plotlyTraces.ts`, `panels/RechartsPanel.tsx`,
  `panels/rechartsEncoding.ts` — zero changes; both panel types stay
  registered and supported (`dashboard-8-test.yaml` keeps exercising
  both).
- `panels/SankeyPanel.tsx`, `panels/sankeyGraph.ts`, `panels/sankeyColor.ts`,
  and `dashboard-4-mode-choice.yaml`'s `row_trip_mode_flow` panel — zero
  changes (FR-004).
- `dashboard-2-person-household.yaml`, `dashboard-6-network.yaml`,
  `dashboard-7-explore.yaml`, `dashboard-8-test.yaml` — zero changes.
- `panels/observablePlotEncoding.ts`, `panels/ObservablePlotPanel.tsx` —
  zero changes expected (research.md §7 audit found both already correct
  and idiomatic); only touched if a genuine defect surfaces during
  implementation, per FR-008/FR-009.

## Explicitly out of scope (do not build)

- Faceting (`facet_x`/`facet_y`) to unpin the baseline-pinned panels
  (research.md §7, spec.md Assumptions) — deferred to the later polish
  effort.
- Any change to which metric a panel queries, or to its filter/scenario
  resolution — FR-005.
