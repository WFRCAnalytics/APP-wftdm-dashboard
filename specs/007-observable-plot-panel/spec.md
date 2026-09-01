# Feature Specification: ObservablePlotPanel

**Feature Branch**: `007-observable-plot-panel`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "Add a fifth panel type — observable-plot — to the registry, following the same pattern as ValueBoxPanel/PlotlyPanel/TablePanel/MarkdownPanel and inheriting 004's expand-to-dialog mechanism automatically. Uses @observablehq/plot. Reuse PlotlyPanel's proven pattern where it genuinely applies (query/fetch chain, loading/empty/error states); research whether Observable Plot needs its own resize treatment rather than assuming PlotlyPanel's ResizeObserver fix transfers unchanged. Confirm, against docs/GRAMMAR.md, whether `type: observable-plot` uses the same `$metric.<column>` convention PlotlyPanel resolves or something else, and whether panel-local reactive input widgets (`$inputs.x` or similar) are real, documented grammar or just an illustrative example — if real, scope this as a materially bigger feature than 'swap Plotly for Observable Plot,' not silently included or excluded."

## Grammar findings (pre-spec verification)

Verified directly against `docs/GRAMMAR.md` and `docs/SPEC.md` before writing this
spec, per this project's established discipline (005/006 required the same):

1. **`type: observable-plot` is a real, fully-specified panel type**, appearing in
   three separate places in `docs/GRAMMAR.md` (a worked example at line ~880, the
   canonical panel-type reference at line ~970, and the top-level dashboard example
   at line ~308) plus `docs/SPEC.md`'s Panel types table, which describes it as
   "For panels with reactive filter inputs" — not a hypothetical or aspirational
   entry.
2. **Chart encodings (`mark`, `x`, `y`, `fill`, `stroke`, `facet_x`, `facet_y`) are
   bare column names from the queried result set — NOT `$metric.<column>`-prefixed.**
   This is a real, confirmed grammar difference from `type: plotly`, whose trace
   axes (`x: $metric.observed`) *do* use the `$metric.` placeholder convention.
   `PlotlyPanel`'s trace-resolution logic (`plotlyTraces.ts`) does not transfer
   directly — Observable Plot's encoding channels map straight onto whatever
   columns the SQL query returns, no placeholder substitution needed for those
   fields specifically.
3. **`$inputs.<id>` is real, documented grammar — not an illustrative-only
   example.** `docs/GRAMMAR.md`'s placeholder reference table lists it explicitly
   ("`$inputs.x` | dashboard panel `filter:` | Current panel-level input value"),
   and it appears as working grammar in two separate full examples (the Trip
   Length Frequency Distribution panel and the Mode Share by Income Group panel),
   plus the top-level dashboard example. Panel-local reactive input widgets
   (`inputs:` — an array of `{id, label, type: select|multiselect|range, column,
   default}`) are therefore **in scope for this feature**, not a hypothetical
   deferred to a future feature. `docs/SPEC.md`'s one-line description of this
   panel type ("For panels with reactive filter inputs") is not incidental
   color — it is this panel type's entire reason for existing as a distinct type
   from `plotly`, so a version of this feature that omits panel-local inputs would
   not actually deliver what `type: observable-plot` is documented to do.
4. **No global filter-bar UI exists anywhere in this codebase yet.** The
   top-level `filters:` block (`FilterDefinition` — `select | multiselect |
   range`) is fully typed (`src/layout/types.ts`) and stored (`state/
   filterState.ts`), but no component renders it as an interactive control
   anywhere in `src/` — filter values today can only be set programmatically
   (URL params, test code). Panel-local `inputs:` reuses the exact same
   three-value type vocabulary but has no existing rendered control to copy
   from either. Building working `select`/`multiselect`/`range` input controls
   for this feature means building the **first interactive filter-value-setting
   UI in this application**, global or panel-local — this is the concrete reason
   this feature is materially bigger than the `table`/`markdown` panel-type
   features that preceded it, and it is named here explicitly rather than
   discovered mid-implementation.

These four findings shape the scope below: this feature includes both a static
query-and-render pipeline (parallel in shape to `PlotlyPanel`) *and* new
panel-local input-control UI, because the second is not a separable "nice to
have" for this specific panel type — it is what the type is documented to be for.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author renders a metric as a reactive Observable Plot chart (Priority: P1)

A dashboard author adds a `type: observable-plot` panel to a `dashboard-*.yaml`
tab, pointing it at a metric with a `mark`/`x`/`y` (and optionally `fill`/
`stroke`/`facet_x`/`facet_y`/`tip`/`grid`) encoding. The chart renders inside the
panel card with the dashboard's own chrome, updates when the global sidebar
filter changes (via `$filters.x` in its `filter:` block, the same mechanism
`PlotlyPanel` already uses), and inherits 004's expand-to-dialog mechanism with
no visual distortion when the dialog opens or closes.

**Why this priority**: This is the minimum slice that makes `observable-plot` a
usable fifth panel type at all — a working query→render pipeline bound to the
existing global filter/scenario system, on par with what `PlotlyPanel` already
delivers for its own library. It is independently valuable and shippable even
before panel-local inputs exist, the same way `PlotlyPanel` shipped useful
charts without needing every future feature first.

**Independent Test**: Add an `observable-plot` panel with a `mark`/`x`/`y`
config bound to a fixture metric and a global filter; confirm it renders the
expected marks, updates when the global filter value changes, and opens/closes
cleanly in the 004 expand dialog with correctly resized output.

**Acceptance Scenarios**:

1. **Given** an `observable-plot` panel configured with `mark: barY`, `x`, and
   `y` bound to columns present in its metric's query result, **When** the
   dashboard tab loads, **Then** the panel renders a bar chart whose values
   match a direct query against the same data.
2. **Given** an `observable-plot` panel whose `filter:` block maps a key to
   `$filters.purpose`, **When** the global Trip Purpose filter value changes,
   **Then** the chart re-queries and re-renders with the new filtered data,
   without a full panel remount.
3. **Given** a rendered `observable-plot` panel, **When** the user clicks its
   expand trigger, **Then** the same chart renders at the dialog's larger size
   with correctly proportioned marks (not stretched, clipped, or still sized for
   the small card), and closing the dialog returns the original card-sized
   rendering intact.
4. **Given** an `observable-plot` panel's metric query returns zero rows,
   **When** the panel renders, **Then** it shows the shared empty-state
   component, not a blank chart area or a crash.
5. **Given** an `observable-plot` panel's metric name does not resolve to any
   registered view, **When** the query rejects, **Then** the panel shows the
   shared error-state component, not a blank chart area or a crash.

---

### User Story 2 - Author adds panel-local reactive input controls (Priority: P2)

A dashboard author adds an `inputs:` list to an `observable-plot` panel (e.g. a
`select` control for income group, or a `multiselect` for mode), referencing
each input's current value from the panel's `filter:` block via `$inputs.<id>`.
The controls render inside the panel card. Changing one updates only that
panel's own chart — it does not touch the global sidebar filter state and does
not affect any other panel on the tab, including other `observable-plot`
panels.

**Why this priority**: This is the capability that makes `type: observable-plot`
distinct from `type: plotly` per `docs/SPEC.md`'s own description ("for panels
with reactive filter inputs") — real, documented grammar (see Grammar findings
above), not a stretch goal. It is scoped as P2 rather than folded into User
Story 1 because it is independently testable and buildable on top of a working
US1 rendering pipeline, and because it is the first interactive
filter-value-setting UI this codebase has needed (no existing control to reuse)
— isolating it lets US1 ship and be verified on its own first.

**Independent Test**: Add an `observable-plot` panel with one `select` input
and one `multiselect` input, each bound via `$inputs.<id>` in the panel's
`filter:` block, alongside at least one other panel on the same tab (including
another `observable-plot` panel with its own `inputs:`). Change each input's
value and confirm only the owning panel's chart updates, its own value persists
across an expand/collapse cycle, and no other panel or the global filter store
is affected.

**Acceptance Scenarios**:

1. **Given** an `observable-plot` panel with a `select`-type input bound to a
   column, **When** the user picks a different option, **Then** the panel
   re-queries with that value substituted for `$inputs.<id>` and re-renders,
   using its input's declared `default` value before any user interaction.
2. **Given** an `observable-plot` panel with a `multiselect`-type input,
   **When** the user selects more than one value, **Then** the query filters to
   rows matching any of the selected values (the same "any of" semantics
   `multiselect` already implies for global filters).
3. **Given** two `observable-plot` panels on the same tab, each with its own
   `inputs:`, **When** the user changes one panel's input value, **Then** the
   other panel's chart and input controls are unaffected, and the global
   sidebar filter values (if any) are unchanged.
4. **Given** an `observable-plot` panel with a non-default input value set,
   **When** the user expands the panel into the 004 dialog and then closes it,
   **Then** the input's current value (not its config-declared `default`) is
   still in effect, and the chart is not re-queried from scratch on that
   transition alone.

---

### User Story 3 - Panel behaves consistently with the rest of the registry (Priority: P3)

An `observable-plot` panel sits alongside `valuebox`/`plotly`/`table`/`markdown`
panels on the same dashboard tab. It uses the same card chrome, the same
loading-skeleton convention, the same shared empty/error-state components, and
requires no special-case code anywhere outside `panels/ObservablePlotPanel.tsx`
and its one `registry.tsx` entry.

**Why this priority**: Confirms this fifth panel type is a drop-in citizen of
the existing panel architecture, not a special case — lower priority than US1/
US2 because it is a consistency check on work those stories already produce,
not new end-user-visible capability.

**Acceptance Scenarios**:

1. **Given** a dashboard tab with `valuebox`, `plotly`, `table`, `markdown`, and
   `observable-plot` panels all present, **When** the tab loads, **Then** every
   panel renders without error and the `observable-plot` panel's expand trigger
   and card chrome are visually consistent with the others.
2. **Given** an `observable-plot` panel while its query is in flight, **When**
   the panel first mounts, **Then** it shows an inline loading skeleton
   consistent with `ValueBoxPanel`/`PlotlyPanel`'s existing per-panel loading
   convention (not a shared loading component, matching this project's
   established choice).

---

### Edge Cases

- What happens when a panel-local input's `default` value does not match any
  value actually present in its bound column? (Resolved at planning time —
  render with no rows matching that default, going through the same empty-state
  path as any other zero-row query, or fall back to an "all" semantics — pick
  one and document the reasoning.)
- What happens when the same tab has two `observable-plot` panels with
  `inputs:` using the same `id` (e.g. both declare an input with `id:
  mode_select`)? Each panel's input state MUST remain independent — this is an
  authoring mistake to guard against structurally, not rely on unique IDs across
  panels.
- What happens when a panel's `filter:` block references `$inputs.<id>` for an
  `id` that panel never declared in its own `inputs:` list? (Should not crash —
  resolve to an empty/no-op binding and let it show as an authoring error at
  worst, consistent with how a bad `$filters.x` reference behaves today.)
- What happens when `mark` is set to a value Observable Plot's API does not
  recognize? (Falls into the shared error-state path, same as an unresolvable
  metric.)
- What happens to a chart's rendered size the moment the browser window itself
  is resized (not just the 004 dialog transition)? Must not distort or require
  a manual refresh.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render `type: observable-plot` panels via
  `@observablehq/plot`, reading `mark`, `x`, `y`, `fill`, `stroke`, `facet_x`,
  `facet_y`, `tip`, and `grid` from the panel config, in addition to the common
  panel keys (`title`, `metric`, `filter`, `height`, `width`, `scenario`,
  `scenarios`) every data-bound panel type already shares.
- **FR-002**: Chart encoding fields (`x`, `y`, `fill`, `stroke`, `facet_x`,
  `facet_y`) MUST resolve as literal column names against the panel's queried
  result set — the `$metric.<column>` placeholder convention `PlotlyPanel` uses
  MUST NOT be applied to these fields, matching the confirmed grammar
  difference.
- **FR-003**: The panel's `filter:` block MUST resolve both `$filters.<id>`
  (global sidebar filter, existing behavior) and `$inputs.<id>` (panel-local
  reactive input, new) placeholders into the query's SQL bindings.
- **FR-004**: Dashboard authors MUST be able to declare panel-local input
  controls via an `inputs:` list (`id`, `label`, `type: select | multiselect |
  range`, `column`, `default`), rendered inside the panel card.
- **FR-005**: Changing a panel-local input's value MUST re-query and re-render
  only the owning panel — it MUST NOT write to the global filter store
  (`state/filterState.ts`) and MUST NOT affect any other panel's rendered state,
  including another `observable-plot` panel with a same-named input `id`.
- **FR-006**: A panel-local input's current value MUST use its config-declared
  `default` before any user interaction, and MUST persist across the panel's
  004 expand-to-dialog/collapse transition without resetting to that default.
- **FR-007**: The panel's rendered chart MUST resize correctly (no distortion,
  clipping, or stale sizing) when its container size changes, specifically
  including the 004 expand-to-dialog transition and ordinary browser window
  resizing — the concrete mechanism (whether the same ResizeObserver approach
  `PlotlyPanel` uses transfers as-is, given Observable Plot's different
  rendering model of returning a detached element rather than reusing a
  persistent container via an imperative `.react()`-style update) is a planning
  decision, not assumed here.
- **FR-008**: The panel MUST use the shared `PanelEmptyState`/`PanelErrorState`
  components for a zero-row query result and a rejected/failed query,
  respectively, consistent with `ValueBoxPanel`/`PlotlyPanel`/`TablePanel`.
- **FR-009**: The panel MUST show an inline loading skeleton while its initial
  query is in flight, consistent with the existing per-panel loading convention
  (not a new shared loading component).
- **FR-010**: The panel MUST be registered in `panels/registry.tsx` under the
  `observable-plot` key and require no changes anywhere else in the panel-card/
  expand-dialog/layout layer to inherit 004's expand-to-dialog mechanism.
- **FR-011**: The panel MUST query `services/duckdb.ts` via `useFilterState` +
  a direct `services/duckdb.ts` import, following the same query/fetch chain
  shape `PlotlyPanel`/`TablePanel` already use — no new data-access
  architecture introduced for this panel type.

### Key Entities

- **ObservablePlotPanelConfig**: The parsed shape of a `type: observable-plot`
  panel entry — extends the existing data-bound panel config shape
  (`metric`/`filter`/`height`/`width`/`scenario`/`scenarios`) with `mark`, `x`,
  `y`, `fill`, `stroke`, `facet_x`, `facet_y`, `tip`, `grid`, and an optional
  `inputs` list.
- **ObservablePlotInputConfig**: One entry in a panel's `inputs:` list — `id`
  (referenced via `$inputs.<id>` in that same panel's `filter:` block), `label`
  (rendered control label), `type` (`select | multiselect | range` — the same
  vocabulary `FilterDefinition` already uses for global filters), `column`
  (which queried column the control's options are drawn from), `default`.
- **Panel-local input state**: The current value of each declared input,
  scoped to one panel instance — distinct from the global filter store
  (`state/filterState.ts`) both in lifetime and in visibility (never read by
  any other panel). Its concrete storage mechanism (a scoped slice of the
  existing store vs. component-local state) is a design decision for planning,
  not fixed here.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An `observable-plot` panel's rendered marks match the values a
  direct SQL query against the same fixture data would return, for every mark
  type exercised by the fixture (at minimum `barY` and `lineY`, per
  `docs/GRAMMAR.md`'s own worked examples).
- **SC-002**: Changing the bound global filter, or a panel-local input, updates
  the affected chart's rendered output without a full page reload and without
  any other panel or filter re-rendering unnecessarily.
- **SC-003**: 100% of manual/automated checks that expand an `observable-plot`
  panel into the 004 dialog and collapse it again show a correctly proportioned
  chart on both ends of the transition, with zero data re-fetch triggered
  solely by that transition.
- **SC-004**: A zero-row query result and a rejected query each produce the
  same defined empty/error state already used by the sibling panel types, with
  zero unhandled exceptions surfaced to the user.
- **SC-005**: A dashboard tab combining `valuebox`, `plotly`, `table`,
  `markdown`, and `observable-plot` panels renders all of them without error in
  a single load.

## Assumptions

- `@observablehq/plot`'s current published version and any required peer
  dependency (e.g. `d3`) are confirmed during planning (`research.md`), not
  assumed here — `package.json` currently pins it as `"latest"`.
- Whether Observable Plot needs its own resize-handling approach, or can reuse
  `PlotlyPanel`'s ResizeObserver + imperative-resize pattern unchanged, is a
  planning-phase research question (Grammar findings note #2's rendering-model
  difference is the reason this isn't assumed) — see FR-007.
- Panel-local input state's storage mechanism (component-local vs. a
  panel-scoped slice of the existing filter store) is left to planning,
  matching this project's established pattern of deferring implementation-shape
  decisions to `research.md`/`data-model.md` rather than fixing them in
  `spec.md`.
- `range`-type inputs/filters have no prior UI implementation anywhere in this
  codebase to reference (see Grammar findings note #4) — planning MUST treat
  this as new UI, not an adaptation of an existing control.
- Sankey (`type: sankey`) and any panel type not yet built remain out of scope,
  unchanged from prior panel-type features.
- This feature does not include building the global sidebar filter bar UI
  itself (rendering the top-level `filters:` block as interactive controls) —
  only the panel-local `inputs:` controls this panel type's own grammar
  requires. The global filter bar remains a known, standing gap this feature
  does not close, the same way `scenario/scenarioManager.ts`'s folder-picker UI
  remains a documented, deliberately deferred gap (`CLAUDE.md` item 7).
