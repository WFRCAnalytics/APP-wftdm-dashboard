# Feature Specification: SankeyPanel

**Feature Branch**: `008-sankey-panel`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Add the sixth and final originally-listed panel type — sankey — to the registry, following the same pattern as ValueBoxPanel/PlotlyPanel/TablePanel/MarkdownPanel/ObservablePlotPanel and inheriting 004's expand-to-dialog mechanism automatically. Check docs/GRAMMAR.md's actual `type: sankey` section before assuming its shape — source/target/value column mapping, placeholder-substitution style, and color_scheme's real documented behavior. Uses d3-sankey (SPEC.md's pinned choice) — research current version and its d3 dependency situation against what 007 already pulled in. Rows-to-graph transform (unique nodes from source/target values, links with computed flow values) plus d3-sankey's layout computation should be a pure, DOM-free module, Vitest-testable without a real DOM, mirroring plotlyTraces.ts/tableLogic.ts/observablePlotEncoding.ts. Reuse the query/fetch chain, loading/empty/error states, and inline skeleton convention where genuinely applicable; research whether d3-sankey's rendered SVG has the same resize-on-container-change gap Plotly/Observable Plot both had, rather than assuming either fix transfers unchanged. Uses 002-design-tokens' existing tokens for node/link coloring where the grammar allows it. Does not include panel-local reactive inputs or any capability beyond rendering a sankey diagram from query results."

## Grammar findings (pre-spec verification)

Verified directly against `docs/GRAMMAR.md` and `docs/SPEC.md` before writing this
spec, per this project's established discipline (005/006/007 each required the same):

1. **`type: sankey` is a real, documented panel type**, with one full worked
   example in `docs/GRAMMAR.md`'s panel-type reference (`### type: sankey`, line
   ~1076-1089) plus `docs/SPEC.md`'s Panel types table (`sankey | d3-sankey |
   Mode shift / tour-to-trip consistency`, line 168) — not hypothetical. A
   `summarize.yaml` `sql_fragments` example (`tour_mode_to_trip_mode`, line
   ~617-621, commented "Tour-to-trip mode consistency (Sankey source)") shows
   what its upstream metric SQL actually looks like: a `SELECT` producing
   `tour_mode`, `trip_mode`, and a trip-count column — the metric this panel
   type's one worked example queries by name (`metric: tour_mode_to_trip_mode`).
2. **`source`/`target`/`value` are author-configurable field-mapping keys
   naming literal columns in the query result — NOT `$metric.`-prefixed
   placeholders.** The documented example (`source: tour_mode`, `target:
   trip_mode`, `value: trips`) reads exactly like `observable-plot`'s `x`/`y`/
   `fill`/`stroke` (bare column names resolved directly from the queried rows),
   not like `plotly`'s `x: $metric.observed` placeholder-substitution
   convention. This is the same author-names-the-field approach
   `TableColumnConfig` already uses for its own column mapping — sankey is not
   introducing a new binding shape, just applying the existing one to
   source/target/value instead of x/y/columns.
3. **`color_scheme: Tableau10` is sankey's own dedicated key — a genuinely
   different concept from `color_scale`/`color_ramp`.** `color_scale`/
   `color_ramp` (`docs/GRAMMAR.md` line ~1055-1073, used with a `domain:`
   range) configure a **continuous** sequential/diverging ramp for zonemap's
   numeric diff/value coloring. `color_scheme` names a **categorical**
   color scheme by string identifier for discrete node/link categories —
   `Tableau10` matches d3-scale-chromatic's `schemeTableau10` naming
   convention. No enumerated list of valid `color_scheme` values appears
   anywhere in the docs beyond this one example; confirming the real
   supported set (and how it composes with 002-design-tokens' own palette)
   is a planning-phase question, not assumed here.
4. **Sankey inherits the same common keys every data-bound panel type
   gets** — `docs/GRAMMAR.md`'s "All panels share these common keys" block
   (line ~906-917: `type/title/metric/filter/height/width/scenario/
   scenarios`) applies here too, even though the one worked example doesn't
   happen to show `filter:` in use — the same situation several of
   `observable-plot`'s common keys were in. `metric:` names the Parquet-backed
   view to query, same as every other data-bound panel type.
5. **No panel-local `inputs:` are documented anywhere in sankey's grammar** —
   confirms the feature description's own scoping instruction; there is no
   007-style `$inputs.x` finding to reconcile here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author renders a two-column flow metric as a Sankey diagram (Priority: P1)

A dashboard author adds a `type: sankey` panel to a `dashboard-*.yaml` file,
mapping a metric's `source`, `target`, and `value` columns (e.g. tour mode →
trip mode, weighted by trip count). When the tab loads, the panel shows a flow
diagram: one node per unique category on each side, and links between them
sized proportionally to the flow value — letting an analyst see at a glance
where mode consistency breaks down between the tour and trip levels.

**Why this priority**: This is the core, and only, reason this panel type
exists (`docs/SPEC.md`: "Mode shift / tour-to-trip consistency") — without it
there is nothing to test or ship.

**Independent Test**: Can be fully tested by loading a dashboard tab with one
`type: sankey` panel against fixture data with known source/target/value rows,
and confirming the rendered nodes/links match what a `GROUP BY source, target`
aggregation of that data would produce.

**Acceptance Scenarios**:

1. **Given** a `type: sankey` panel configured with `source: tour_mode`,
   `target: trip_mode`, `value: trips`, **When** its bound metric returns rows
   for each tour_mode/trip_mode combination, **Then** the panel renders one
   node per unique `tour_mode` value, one node per unique `trip_mode` value,
   and one link per combination present in the data, each link's width
   proportional to its summed `trips` value.
2. **Given** the same panel with `color_scheme: Tableau10` set, **When** it
   renders, **Then** distinct node/link categories are shown in visibly
   different colors drawn from that scheme.
3. **Given** the same panel with `color_scheme` omitted, **When** it renders,
   **Then** nodes/links are colored from the application's own design-token
   palette rather than a library default — matching how every other chart
   panel type already respects the app's brand palette.

---

### User Story 2 - Sankey panel responds to global filters like every other panel type (Priority: P2)

A dashboard author binds the sankey panel's `filter:` key to a global sidebar
filter (inline map or `$ref`, per the common-keys grammar). When a viewer
changes that filter's value, the panel re-queries and re-renders its diagram
to reflect only the matching rows, without a full page reload — the same
filter-reactivity every other data-bound panel type already provides.

**Why this priority**: Filter-reactivity is expected baseline behavior for
every data-bound panel in this app; a sankey panel that ignores the global
filter state would be a regression from the established pattern, not a
missing nice-to-have.

**Independent Test**: Can be fully tested by changing a bound global filter's
value while a sankey panel is visible and confirming its diagram updates to
reflect only matching rows, including the zero-match case.

**Acceptance Scenarios**:

1. **Given** a sankey panel's `filter:` bound (inline map or `$ref`) to a
   global filter, **When** the filter's value changes, **Then** the panel
   re-queries and its diagram updates to reflect only rows matching the new
   value.
2. **Given** a filter value that matches zero rows, **When** the panel
   re-queries, **Then** it shows the same shared empty state every other
   panel type shows for a zero-row result.

---

### User Story 3 - Sankey panel behaves consistently with the rest of the panel registry (Priority: P3)

A dashboard tab contains a sankey panel alongside other panel types. The
viewer expands it into the 004 near-fullscreen dialog, sees the same diagram
at a larger size without any re-fetch or flicker, and collapses it back —
exactly as already guaranteed for `valuebox`/`plotly`/`table`/`markdown`/
`observable-plot`, with zero sankey-specific wiring required to get it.

**Why this priority**: This is inherited "for free" from 004's existing
mechanism by construction (registry entry + `panelCard.tsx`), but the panel
component's own render lifecycle must not break that guarantee — worth its
own independently-testable story rather than assuming it as a side effect of
User Story 1.

**Independent Test**: Can be fully tested by expanding and collapsing a
sankey panel via its 004 dialog trigger and confirming the diagram survives
correctly proportioned on both ends with no duplicate query, plus confirming
a deliberately broken config (unresolvable `source`/`target`/`value` column)
renders the shared error state instead of crashing.

**Acceptance Scenarios**:

1. **Given** a rendered sankey panel, **When** the viewer clicks its expand
   trigger, **Then** the dialog shows the same diagram (same underlying query
   result, not re-fetched) resized to the larger container.
2. **Given** the panel is expanded, **When** the viewer closes the dialog,
   **Then** the inline card shows the same diagram again, correctly sized,
   with focus returned to the trigger.
3. **Given** a sankey panel configured with a `source`/`target`/`value`
   column name that doesn't exist in its query result, **When** the panel
   renders, **Then** it shows the same shared error state used by an
   unresolvable metric on any other panel type — not an unhandled exception.

---

### Edge Cases

- What happens when a row's `source` value equals its `target` value (e.g.
  `tour_mode == trip_mode` — "no mode shift")? **Corrected during planning
  (see `research.md`): this is NOT a self-loop and MUST NOT be excluded.**
  Node identity is namespaced by which mapped column a value came from (the
  `source` side vs. the `target` side), so a `tour_mode: SOV` node and a
  `trip_mode: SOV` node are always two distinct graph nodes even though they
  share a display label — the row becomes a normal link between two
  different nodes, not a node linking to itself. This matters precisely
  because, per the earlier planning discussion, this case is plausibly the
  *largest* category in this panel type's own primary use case (no mode
  shift, tour-to-trip) — treating it as excludable data was the wrong
  premise, not merely a visibility gap to paper over.
- What happens when multiple rows share the same `source`/`target` pair?
  Their `value` is summed into a single link before layout — the panel must
  neither silently drop the extra rows nor render duplicate parallel links
  for the same pair.
- What happens when a row's mapped `value` is zero or negative? Excluded
  before layout — a flow link cannot have negative width, and a zero-width
  link carries no visual information. This remains a real exclusion case
  (unlike the same-value case above) — whether it needs a visibility signal
  is resolved during planning — see Assumptions.
- What happens when `source`, `target`, or `value` names a column absent
  from the query result? Shown via the shared error state, same as an
  unresolvable `metric` on any other panel type (User Story 3, Scenario 3).
- What happens when the rows-to-graph transform produces a cyclic graph?
  With node identity namespaced by source/target column (above), every link
  flows from a source-side node to a target-side node, which is structurally
  acyclic by construction for this panel type's documented (two-column,
  single-hop) grammar — there is no author-facing way to configure a cycle.
  d3-sankey's own layout computation still throws a real, catchable error if
  one somehow occurs (confirmed during planning against its actual source —
  see `research.md`); the panel MUST catch it into the shared error state
  as a defensive backstop, not assume it can never happen.
- What happens to the diagram's rendered size when the browser window itself
  is resized (not just the 004 dialog transition)? Must not distort or
  require a manual refresh — same requirement 007 already established for
  Observable Plot charts.
- What happens when the bound metric returns zero rows? Shown via the shared
  `PanelEmptyState`, same as every other data-bound panel type.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `sankey` panel type that resolves
  `type: sankey` `dashboard-*.yaml` entries to a Sankey diagram component via
  `panels/registry.tsx`, inheriting the 004 expand-to-dialog mechanism
  automatically with no per-type wiring.
- **FR-002**: Panel MUST let the dashboard author map three query-result
  columns via the documented `source`, `target`, and `value` keys —
  author-configurable field names, not a fixed/hardcoded set of expected
  column names in the underlying data — mirroring `TableColumnConfig`'s
  existing field-mapping approach.
- **FR-003**: Panel MUST derive a node-link graph from the flat query rows:
  one node per unique value appearing in the mapped `source` column and one
  node per unique value appearing in the mapped `target` column — **node
  identity MUST be namespaced by which column (`source` vs. `target`) a
  value came from**, so a value appearing on both sides (e.g. `SOV` as both
  a `tour_mode` and a `trip_mode`) produces two distinct nodes, not one
  self-referencing node (see Edge Cases; corrected during planning,
  `research.md`) — and one link per distinct (source, target) pair, with
  each link's value equal to the sum of the mapped `value` column across all
  rows sharing that pair.
- **FR-004**: Panel MUST support the common data-bound panel keys already
  shared by every other panel type (`title`, `metric`, `filter`, `height`,
  `width`, `scenario`, `scenarios`), including both the inline-map and
  `$ref` forms of `filter:`.
- **FR-005**: Panel MUST support an optional `color_scheme` key selecting a
  named categorical color scheme for node/link coloring; when omitted, the
  panel MUST fall back to the application's own design-token palette rather
  than a charting library's default colors, matching every other chart panel
  type's existing brand-consistency behavior.
- **FR-006**: Panel MUST use the same inline loading-skeleton convention,
  shared `PanelEmptyState` for a zero-row result, and shared `PanelErrorState`
  for a rejected query or unresolvable configuration (missing/misnamed
  `source`/`target`/`value` column, or a rejected cyclic graph — see Edge
  Cases) that every other panel type already uses.
- **FR-007**: The rendered diagram MUST NOT visually distort, and MUST NOT
  require a manual refresh, when its container is resized — both via the 004
  expand/collapse dialog transition and a plain browser window resize.
- **FR-008**: The panel's query result and rendered diagram MUST NOT reset or
  re-fetch solely because the panel moved into or out of the 004 expand
  dialog.
- **FR-009**: Rows with a non-positive mapped `value` (see Edge Cases) MUST
  be excluded from the graph before layout, and MUST NOT crash the panel or
  render as a visually broken link. (Self-loop exclusion, as originally
  drafted here, was corrected during planning — see FR-003 and Edge Cases;
  node namespacing means there is no self-loop case left to exclude.)
  Whether non-positive-value exclusion requires a visibility signal (vs.
  being silent) is resolved during planning — see Assumptions.

### Key Entities

- **Sankey panel config**: the common data-bound panel fields
  (`title`/`metric`/`filter`/`height`/`width`/`scenario`/`scenarios`) plus
  this panel type's own `source`/`target`/`value` column field-mapping and
  optional `color_scheme`.
- **Flow graph**: the node-link structure this feature's rows-to-graph
  transform derives from flat query rows — a node list (unique category
  values from the mapped `source`/`target` columns, **namespaced by which
  column each came from** — see FR-003) and a link list (each a source
  node, target node, and summed flow value) — the genuinely new
  data-transform entity this feature introduces, not present in any prior
  panel type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A sankey panel's rendered nodes and links match what a direct
  `GROUP BY source, target` / `SUM(value)` aggregation of the same fixture
  query result would produce.
- **SC-002**: Changing a bound global filter updates the sankey panel's
  diagram without a full page reload and without any other panel
  re-rendering unnecessarily.
- **SC-003**: 100% of checks that expand a sankey panel into the 004 dialog
  and collapse it again show a correctly proportioned diagram on both ends of
  the transition, with zero data re-fetch triggered solely by that
  transition.
- **SC-004**: A zero-row query result and a rejected/unresolvable
  configuration each produce the same defined empty/error state already used
  by sibling panel types, with zero unhandled exceptions surfaced to the
  user.
- **SC-005**: A dashboard tab combining all six now-built panel types
  (`valuebox`, `plotly`, `table`, `markdown`, `observable-plot`, `sankey`)
  renders all of them without error in a single load.

## Assumptions

- d3-sankey's current published version, and whether it needs its own
  explicit `d3` (or specific `d3-*` submodule) dependency beyond what
  `@observablehq/plot` already pulls in transitively, is confirmed during
  planning (`research.md`), not assumed here — matches 007's own precedent
  for `@observablehq/plot`'s peer-dependency question.
- Whether d3-sankey's rendered SVG needs the same ResizeObserver-driven
  resize treatment `PlotlyPanel`/`ObservablePlotPanel` both required, or a
  different approach entirely given d3-sankey's own rendering model, is a
  planning-phase research question — not assumed to transfer unchanged from
  either prior fix (per the feature description's own instruction).
- **Node identity is namespaced by source/target column (see FR-003,
  Edge Cases) — resolved during planning, `research.md`.** This was the
  actual correction needed for the self-loop question raised before
  planning: the original "exclude self-loop rows" premise was wrong for
  this panel type's own primary use case (the same-value row, e.g. no mode
  shift, is plausibly the *largest* category, not a rare edge case) — the
  right fix is that such rows were never true self-loops once nodes are
  correctly modeled as belonging to a side, not excludable data needing a
  visibility workaround. This also makes a cyclic graph structurally
  unreachable for this panel type's documented (two-column, single-hop)
  grammar, addressed defensively rather than assumed impossible.
- **Non-positive-value exclusion visibility (the one exclusion case that
  remains real — see Edge Cases) is resolved during planning with real
  reasoning, in `research.md`.** Unlike the self-loop question above, this
  is genuinely rare data (a calibration output producing a zero/negative
  flow count is itself an anomaly worth surfacing), not a large expected
  category — planning MUST still state its reasoning explicitly rather than
  defaulting to silent without justification.
- No panel-local reactive `inputs:` — confirmed absent from sankey's
  documented grammar (Grammar findings #5), and explicitly out of scope per
  the feature description.
- This feature completes the originally-listed six-panel-type set
  (`valuebox`, `plotly`, `table`, `markdown`, `observable-plot`, `sankey`);
  `flowmap`, `zonemap`, and `graphic-walker` remain out of scope, unchanged
  from every prior panel-type feature.
- The rows-to-graph transform and d3-sankey's layout computation are
  implemented as a pure, DOM-free module (mirroring `plotlyTraces.ts`/
  `tableLogic.ts`/`observablePlotEncoding.ts`), Vitest-testable without a
  real DOM — the specific module boundary and shape are a planning-phase
  design decision, not fixed here.
