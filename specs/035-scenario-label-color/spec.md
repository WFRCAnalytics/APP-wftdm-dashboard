# Feature Specification: Scenario Label Propagation & Color Override

**Feature Branch**: `035-scenario-label-color`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Scenario label propagation to chart/panel display text, and per-scenario viewer-configurable color override" — two related but independent presentation-layer changes (Part A: propagate `020-settings-modal`'s existing scenario `label` field to every chart/table/legend display, never to data-resolution keys; Part B: add a per-scenario, session-only viewer color override, replacing today's automatic color assignment).

## Research performed before writing this spec

Per the request's own explicit instruction, this is the real substance of
the feature — every claim below was confirmed by reading the actual,
current source, not assumed from the feature description or from memory.

**Part A — every real scenario-name-as-display-text surface, audited panel
type by panel type:**

| Panel type | Real display surface found? | Where |
|---|---|---|
| `plotly` | **Yes** | `panels/plotlyTraces.ts`'s `resolveTraces()` — when a trace's `color`/`name` config resolves to the bare `$scenario` placeholder, rows are grouped by the real `scenario` column value and that same value becomes the trace's `name` (the Plotly legend label) |
| `recharts` | **Yes** | `panels/rechartsEncoding.ts`'s `encodeRechartsData()` — when `series` is bound to the literal `scenario` column, each distinct value becomes both a pivoted-row column key AND `chartConfig[key].label` (read by shadcn's `ChartTooltipContent`/`ChartLegendContent`) |
| `observable-plot` | **Yes, but structurally different** | `ObservablePlotPanel.tsx` hands raw query rows straight to `Plot.plot()`; `panels/observablePlotEncoding.ts` never regroups them. When `fill`/`stroke`/`facet_x`/`facet_y` is bound to the literal `scenario` column, Observable Plot reads the legend/facet/axis text directly from each row's own cell value — there is no intermediate "trace name" or "config label" to substitute into; the row's own `scenario` cell value itself is what must display the label |
| `table` | **Yes, cell values only — not headers** | `panels/tableLogic.ts`'s column resolution derives one column per row key when `config.columns` is absent, giving a `scenario` COLUMN a literal header of `"scenario"` (never a scenario name) — but that column's CELLS (`String(raw)` in `resolveRows()`) render the real scenario name per row. Headers are unaffected; cell values are the real surface |
| `sankey` | **No** | `panels/sankeyGraph.ts`/`SankeyPanel.tsx` — confirmed via full-file grep: zero `scenario` references. This panel type has no scenario-keyed node/link naming today |
| `flowmap` | **No** | `panels/FlowMapPanel.tsx`/`flowmapData.ts`/`mapTooltip.ts` — scenario only appears in query-resolution comments (009/018-era), never as rendered map/tooltip text |
| `zonemap` | **No** | `panels/ZoneMapPanel.tsx` — same, scenario is a query-resolution parameter only (comparison-diff `a`/`b`), never rendered as visible text on the map itself |
| `graphic-walker` | **No** | `panels/graphicWalkerDatasetPicker.tsx`/`graphicWalkerDatasets.ts` — the dataset picker (028) lists real **metric** names (e.g. `trip_mode_share`), never scenario names. The feature description's own suspicion that this surface exists was checked directly and disproven |
| `valuebox` | **No** | `panels/ValueBoxPanel.tsx`'s `baseline_trend` badge renders only a directional icon (`TrendingUp`/`TrendingDown`/`Minus`) plus a formatted numeric diff — it never names either scenario as text anywhere |
| `markdown` | **No** | Author-authored free text; no scenario-name interpolation mechanism exists |

Also confirmed: `services/sqlExpander.ts`'s `$scenario.<metric>` union
(`expand()`, the mechanism that puts a real scenario name into a `scenario`
column at all) always uses the literal, real scenario/view name — `SELECT
*, '${name}' AS scenario FROM "${name}__${metric}"` — never a label. And
`panelQuery.ts`'s `buildComparisonDiffQuery()`/
`buildValueBoxBaselineTrendQuery()` (018/019/034) never embed a scenario
name into an output column at all — their columns are always the generic
`current_value`/`baseline_value`/`diff_value` (or an author-declared
`compare_on` column), so comparison-diff table/value-box rendering needs no
change beyond the general table-cell case above.

**Part B — the real, current shape of scenario color, audited from
manifest to pixel:**

A real, confirmed correction to this feature's own starting premise: the
feature description assumes a scenario's `manifest.yaml`-sourced `color`
is "today... auto-assigned" and already visibly rendered somewhere, needing
only an override. Direct audit of every real reference to `.color` across
`src/panels/`, `src/services/`, `src/layout/`, `src/hooks/` found the
opposite: `Scenario.color` (populated from `manifest.yaml` by
`scenario/manifestReader.ts` → `scenario/scenarioManager.ts` →
`state/appState.ts`'s `register()`) has **zero real rendering consumers
anywhere in the current codebase.** The one place `project-docs/GRAMMAR.md` says
"the panel colors by scenario" (the multi-scenario overlaid-series section)
refers to `plotlyTraces.ts`'s own confirmed behavior of setting no explicit
`marker.color` at all on a scenario-split trace, letting Plotly's own
built-in default palette assign each trace a color by cycling position —
a generic, scenario-**agnostic** mechanism with no relationship to the
manifest `color` field. The equivalent default behaviors in
`rechartsEncoding.ts` (`--chart-1`..`--chart-5` token cycling, by
first-seen order) and Observable Plot (its own built-in categorical color
scale) are the same kind of generic cycling.

This means Part B is not "intercept the existing color pipeline at its one
real chokepoint" — there is no existing pipeline reaching a rendered pixel
to intercept. This feature is the first real wiring of a per-scenario
color to rendered output at all. Given the feature description's own
stated intent (a viewer overriding "that scenario's own displayed color"),
the coherent, complete reading — treated as an informed default, not a
new ask — is: this feature ALSO makes the manifest `color` the real
DEFAULT color at the same three confirmed per-scenario-color surfaces Part
A's audit already found (`plotly`, `recharts`, `observable-plot` — the
three panel types where scenario can be the rendered color/series
dimension), so scenarios get a real, consistent color across panel types
for the first time, and the new override has a real baseline to override.
`table`/`sankey`/`flowmap`/`zonemap`/`graphic-walker`/`valuebox` have no
per-scenario color-by-identity surface today (confirmed by the same audit
above, since none of them render scenario as a distinct color dimension in
the first place) and are out of scope for Part B, same as Part A.

**Design precedent (`020-settings-modal`'s Scenarios tab)**: confirmed by
direct read of `layout/settings/scenariosTab.tsx`. Each scenario row is
already: leading status dot → identity block (editable `label` `<input>` +
monospace `path`) → trailing status word → a trailing actions cluster
(reorder up/down, baseline star, remove — all icon-sized `Button
variant="ghost" size="icon"`, `gap-0.5`). The new color control belongs in
that same trailing actions cluster, matching its existing icon-button
sizing/spacing/hover convention, not a new interaction pattern.

One cited precedent in the feature description does not exist: `state/
navBarVisibilityState.ts` was deleted by `030-sidebar-navigation` (its
whole subsystem was removed with the top nav bar it belonged to — confirmed
via `ls src/state/`). `state/themeState.ts`/`state/basemapState.ts` remain
real, current examples of the general "session-only, module-level
subscribe/notify state, no persistence" shape the description is really
asking for — but the closer, more directly applicable precedent is
`state/appState.ts`'s own existing `label`/`setLabel`/`clearLabel` trio:
the new color override is a second, equally-shaped optional field on the
same `Scenario` object, using the same store, the same
`unregister()`-discards-it-for-free behavior `label` already gets (no
special-cased cleanup needed — confirmed by `018-baseline-scenario-
designation`'s and `020-settings-modal`'s own prior CLAUDE.md findings on
exactly this point for `explicitBaseline`/`label`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A scenario's custom label appears everywhere its name is shown (Priority: P1)

An analyst renames a cryptically-named scenario (e.g. `run_2026_v4b`) to a
readable custom label (e.g. "Preferred Alternative") in Settings >
Scenarios. Today that label only appears in the Scenarios list itself —
every chart legend, table cell, and comparison label elsewhere in the
dashboard still shows the raw, cryptic name. This story makes the label
appear everywhere the scenario's name is shown as text, so the analyst
(and anyone they share the dashboard with) sees a consistent, readable
identity for that scenario throughout the whole app.

**Why this priority**: The label field already exists and already does
nothing outside one settings list — this is the highest-value, most
visible completion of already-shipped functionality, and every other panel
type in the app is affected by it.

**Independent Test**: Set a custom label on an active scenario, open a
tab with a multi-scenario Plotly/Recharts/Observable Plot chart (`series`
or `color`/`name` bound to scenario) and a table showing a `scenario`
column, and confirm the label — not the raw name — appears in every
legend/tooltip/cell. Fully testable without Part B.

**Acceptance Scenarios**:

1. **Given** a scenario with a custom label and an active Plotly panel
   whose trace `color`/`name` resolves to `$scenario`, **When** the panel
   renders, **Then** the trace's legend name shows the custom label, not
   the real scenario name.
2. **Given** the same setup with a Recharts panel (`series: scenario`),
   **When** the panel renders, **Then** the tooltip/legend show the custom
   label.
3. **Given** the same setup with an Observable Plot panel (`fill`/`stroke`:
   `scenario`), **When** the panel renders, **Then** its legend/axis text
   shows the custom label.
4. **Given** a table panel with a `scenario` column, **When** it renders,
   **Then** each row's `scenario` cell shows that row's scenario's custom
   label (the column header itself is unaffected, since it was never a
   scenario name).
5. **Given** a scenario with NO custom label, **When** any of the above
   render, **Then** the real scenario name displays exactly as before —
   zero behavior change for the unlabeled case.
6. **Given** a panel already rendered showing a scenario's real name (no
   label yet), **When** a viewer sets that scenario's label in the
   Scenarios tab, **Then** the already-rendered panel's display updates to
   the new label without a page reload or manual re-fetch.
7. **Given** any of the above, **When** the underlying SQL/DuckDB
   query/join/filter is inspected, **Then** it still references the real
   scenario name exclusively — the label never appears in a query, a view
   name, or a React state key.

---

### User Story 2 - A viewer picks a scenario's own display color for the session (Priority: P2)

A viewer comparing three scenarios finds the auto-cycled chart colors
inconsistent and hard to track across tabs (the same scenario can render a
different color in a Plotly chart than in a Recharts chart on the same
page, since each panel type cycles its own default palette independently).
This story gives every scenario a real, consistent color across panel
types (from its own `manifest.yaml`), and lets a viewer override any
scenario's color for the current session from the Scenarios tab — e.g.
picking a familiar "red for baseline, blue for alternative" scheme.

**Why this priority**: Real, useful, but narrower in reach than Part A
(only the three panel types that render scenario as a color dimension) and
depends on no prior state (a fresh session with no override still gets a
real, consistent color, just not a chosen one) — a complete, valuable
feature on its own, independently shippable after Part A.

**Independent Test**: Load two scenarios with different manifest colors,
confirm a Plotly/Recharts/Observable Plot panel splitting by scenario
renders each in its own manifest color consistently; then override one
scenario's color from the Scenarios tab and confirm every already-rendered
panel showing that scenario updates immediately, in every one of the three
panel types, without touching Part A at all.

**Acceptance Scenarios**:

1. **Given** two active scenarios with different `manifest.yaml` colors
   and no override set, **When** a Plotly/Recharts/Observable Plot panel
   splits by scenario, **Then** each scenario renders in its own manifest
   color, consistently across all three panel types.
2. **Given** a scenario with no manifest color at all (e.g. a locally
   loaded folder with no post-processor-generated manifest), **When** the
   same panels render, **Then** that scenario falls back to that panel
   type's own existing default palette-cycling behavior, unchanged from
   today.
3. **Given** the Scenarios tab, **When** a viewer opens it, **Then** each
   scenario row shows a color control in the same trailing actions cluster
   as the existing baseline star/reorder/remove controls, previewing that
   scenario's currently-effective color (its override if set, else its
   manifest color, else a neutral placeholder if neither exists).
4. **Given** a viewer picks a new color for a scenario, **When** the pick
   is made, **Then** every already-rendered Plotly/Recharts/Observable
   Plot panel showing that scenario updates to the new color immediately,
   with no reload or manual re-fetch.
5. **Given** an overridden scenario, **When** a viewer clears the
   override, **Then** that scenario's color reverts to its manifest color
   (or the default palette-cycling fallback if it has none) immediately.
6. **Given** any override, **When** the page is reloaded, **Then** the
   override is gone — the scenario shows its manifest color (or fallback)
   again, matching this app's established no-persisted-UI-preference
   convention.

### Edge Cases

- Two different scenarios given the identical custom label: both display
  identically wherever they're each individually shown (e.g. two separate
  legend entries with the same text) — no uniqueness is enforced, matching
  the existing Scenarios-tab label field's own behavior today.
- A scenario is removed (unregistered) while it has a custom label and/or
  a color override set: both are discarded along with the rest of its
  state, with no special-cased cleanup needed (the same as `label`'s own
  existing, confirmed `unregister()` behavior).
- A scenario's label or color override changes while a `comparison: diff`
  panel is showing that scenario as `a`/`b`: unaffected either way, since
  comparison-diff output columns never embed a scenario name or color
  (confirmed in Research above).
- A single dashboard tab has two panels of different types (e.g. one
  Plotly, one Recharts) both splitting by scenario: each independently
  resolves label/color the same way, so the same scenario shows
  consistently between them.

## Requirements *(mandatory)*

### Functional Requirements

**Part A — label propagation**

- **FR-001**: The system MUST resolve `label ?? name` at every point
  identified in Research above where a real scenario name currently
  becomes human-facing display text: a Plotly trace's legend `name` (when
  split by the `scenario` column), a Recharts `chartConfig[key].label`
  (when `series` is bound to the `scenario` column), Observable Plot's
  rendered legend/facet/axis text (when `fill`/`stroke`/`facet_x`/
  `facet_y` is bound to the `scenario` column), and a table cell's
  rendered value within a `scenario`-keyed column.
- **FR-002**: The substitution MUST occur only after any grouping,
  filtering, or joining that depends on the real scenario name has already
  happened — the real name MUST remain the key used for that resolution;
  only the final, already-resolved value presented to the viewer as text
  is substituted.
- **FR-003**: The underlying SQL, DuckDB view names, and React state keys
  MUST continue to use the real scenario name exclusively, in every case —
  this is a display-only substitution, confirmed to require zero change to
  `services/sqlExpander.ts`, `panels/panelQuery.ts`, or any query/join
  logic.
- **FR-004**: A scenario with no custom label MUST display identically to
  its current (pre-feature) behavior in all of the above surfaces.
- **FR-005**: The label substitution MUST be reactive — a label
  change/clear on an already-active scenario MUST update any
  already-rendered panel showing that scenario's name, without requiring a
  page reload or a new data fetch.
- **FR-006**: `sankey`, `flowmap`, `zonemap`, `graphic-walker`'s dataset
  picker, and `valuebox`'s `baseline_trend` badge are explicitly OUT of
  scope for this substitution — confirmed via direct audit (Research
  above) to have no scenario-name-as-display-text surface today. No change
  is made to any of them by this feature.

**Part B — color override**

- **FR-007**: The system MUST establish a real, consistent per-scenario
  default color — that scenario's own `manifest.yaml`-sourced `color` —
  at the three confirmed per-scenario-color surfaces: a Plotly trace's
  color (when split by the `scenario` column), a Recharts series' color
  token (when `series` is bound to the `scenario` column), and Observable
  Plot's color scale (when `fill`/`stroke` is bound to the `scenario`
  column). Before this feature, none of the three read this field at all.
- **FR-008**: A scenario with no manifest color (e.g. a locally loaded
  scenario with no post-processor-generated manifest) MUST fall back to
  that panel type's own existing default palette-cycling behavior,
  unchanged from today — FR-007 never forces a color where none exists.
- **FR-009**: The system MUST let a viewer override any registered
  scenario's effective color from the Settings > Scenarios tab, for the
  current browser session only.
- **FR-010**: The override control MUST be placed in each scenario row's
  existing trailing actions cluster (`layout/settings/scenariosTab.tsx`),
  matching the sizing, spacing, and hover conventions of the existing
  reorder/baseline/remove controls there — not a new interaction pattern.
- **FR-011**: A viewer's override MUST take precedence over that
  scenario's manifest color at all three FR-007 surfaces, for as long as
  the override is set.
- **FR-012**: Setting or clearing an override MUST update every
  already-rendered panel showing that scenario's color immediately — no
  reload, no manual re-fetch, no panel remount required.
- **FR-013**: The override MUST be stored in-memory only, alongside the
  existing `label` field on the same per-scenario state object
  (`state/appState.ts`'s `Scenario`), using its existing subscribe/notify
  mechanism — never persisted (e.g. to `localStorage`) and never surviving
  a page reload, matching this app's established no-persisted-UI-
  preference convention (constitution Principle VI).
- **FR-014**: Removing (unregistering) a scenario MUST discard its color
  override along with the rest of its state — no separate cleanup step,
  same as the existing `label` field's own confirmed behavior.
- **FR-015**: `table`, `sankey`, `flowmap`, `zonemap`, `graphic-walker`,
  and `valuebox` are explicitly OUT of scope for the color override —
  confirmed via direct audit (Research above) to have no per-scenario
  color-by-identity rendering surface today. No change is made to any of
  them by this feature.

### Key Entities

- **Scenario** (existing entity, `state/appState.ts`): gains one new
  optional field, `colorOverride?: string` (a CSS color string, e.g. a hex
  value from a color-picker input), alongside its existing `label?:
  string` field. Both are session-only, discarded on `unregister()`, never
  read by any query/resolution path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer who sets a custom label on a scenario sees that
  label — not the raw scenario name — in 100% of the chart legends, chart
  tooltips, and table cells across the dashboard that currently show that
  scenario's name as text, with no per-panel configuration required.
- **SC-002**: Every existing scenario-keyed data query, filter, join, and
  React state lookup continues to resolve identically to before this
  feature, regardless of any custom label in effect — zero regression in
  existing query/state behavior (verified by the full existing automated
  test suite passing unchanged).
- **SC-003**: The same scenario renders in a visually consistent color
  across every chart type on a dashboard (previously arbitrary/independent
  per chart-library default), without a viewer needing to configure
  anything.
- **SC-004**: A viewer who picks a custom color for a scenario sees every
  currently-visible chart showing that scenario update to the new color
  within one interaction, with no page reload.
- **SC-005**: Neither a custom label nor a color override survives a page
  reload — a fresh load always shows a scenario's real name and its
  manifest-or-default color, matching this app's existing session-only
  preference behavior (Settings > Appearance theme choice, basemap
  choice).

## Assumptions

- `Scenario.color` (manifest-sourced) has zero real rendering consumers
  today (Research above) — this feature is understood to include wiring it
  up as each scenario's real default color at the three confirmed surfaces
  (Plotly/Recharts/Observable Plot), not merely adding an override on top
  of an already-visible color. This reading matches the feature
  description's own stated framing ("today each scenario gets an
  auto-assigned color... already") and is necessary for the new override
  control to have a real, meaningful baseline to override.
- `state/navBarVisibilityState.ts`, cited in the feature description as a
  precedent, was deleted by `030-sidebar-navigation` and no longer exists.
  `state/themeState.ts`/`state/basemapState.ts` remain valid examples of
  the general "session-only, module-level, no persistence" shape being
  asked for, but the color override itself is added directly to the
  existing per-scenario `Scenario` object in `state/appState.ts` (right
  alongside `label`) — the closer, more directly applicable precedent,
  confirmed to need no new state module.
- Duplicate custom labels across two different scenarios are permitted; no
  uniqueness constraint is added, matching the existing `label` field's
  own current behavior.
- A native color-picker input (browser-built-in `color-scheme`-aware, no
  new dependency) is assumed as the color-picking UI control, consistent
  with this app's existing preference for native form controls where one
  suffices (`020-settings-modal`'s own established conventions) — the
  exact widget choice is a planning-phase decision, not fixed here.
- This feature does not change `$baseline`/comparison-diff query logic, how
  scenario names function as DuckDB view-name or React state keys, or add
  persistence of either the label or the color override across a page
  reload — all explicitly out of scope per the feature description.
