# Feature Specification: TablePanel

**Feature Branch**: `005-table-panel`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "Feature: TablePanel

Add a table panel type to the registry (panels/registry.tsx), following
the same pattern as ValueBoxPanel/PlotlyPanel from 003-dashboard-shell-
navigation and inheriting 004's panel-expand-dialog mechanism
automatically (no per-type wiring needed there).

- Renders a panel's query result as a sortable, paginated table — per
  project-docs/SPEC.md's Panel types table (\"table | plain DOM | Sortable,
  paginated\").
- Columns are derived from the query result's own shape (whatever
  columns buildPanelQuery's SQL template + sqlExpander.expand() produce
  for this panel's config) — not a separately-configured column list in
  dashboard-*.yaml, unless research during planning finds the grammar
  already expects one (check project-docs/GRAMMAR.md's actual TablePanel-related
  fields, if any, rather than assuming there are none).
- Sortable: clicking a column header re-sorts the currently-loaded rows
  client-side (no new query per sort) — this is client-side
  interactivity over an already-fetched result set, not a new query
  pattern.
- Paginated: for a result set larger than a reasonable page size, only
  a page's worth of rows render at once, with pagination controls -
  determine a sensible default page size during planning.
- Uses 002-design-tokens' existing tokens/typography for styling — same
  bar as every prior panel type, not framework-default table styling.
- Loading/empty/error states follow the same pattern as ValueBoxPanel/
  PlotlyPanel (shared PanelEmptyState/PanelErrorState components, no new
  state-handling pattern invented).
- Same query/state-management approach as the other two panel types
  (useFilterState hook, direct services/duckdb.ts import, no new
  architecture) - this is a new panel TYPE, not a new panel PATTERN.

Does not include: column-level filtering/search within the table (out
of scope unless spec.md's own research finds this is expected grammar,
not assumed), CSV export, or any other panel type (flowmap, zonemap,
sankey, markdown, observable-plot all remain separately deferred).

Resolved during specification, via project-docs/GRAMMAR.md's actual `type:
table` section (real, existing grammar, not assumed either way) and a
clarifying exchange:
- `columns:` (`field`/`label`/`format`/`color_scale`/`domain` per
  column) IS documented, existing grammar — not something to derive
  purely from the query result's shape. When present, it governs which
  fields display, in what order, with what label/format/color-scale.
  When absent, columns fall back to deriving from the query result's
  own shape (reconciling the original framing for the no-config case).
- `searchable: true` IS documented grammar (a bare flag, no further
  behavior specified in the docs). Explicitly brought into scope for
  this feature, filtering the full fetched result set (not just the
  current page) before pagination narrows it — the same reasonable
  default this feature applies to sorting.
- `sort: { column, order }` (an initial/default sort) and
  `pagination: <number>` (a page-size override) are also documented,
  existing grammar, both in scope.
- GRAMMAR.md's prose additionally claims table panels \"support inline
  column expressions,\" but no concrete syntax for this exists anywhere
  in the docs (no `expr:` field, no example). Explicitly out of scope —
  there is nothing defined to build against, and inventing new YAML
  grammar as a side effect of this feature would be exactly the kind of
  undocumented, speculative addition this project avoids."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a panel's query result as a real table (Priority: P1)

As a dashboard user reviewing calibration results, I want a panel to show
its underlying data as a properly formatted table — not a wall of raw
values — with columns labeled and formatted the way the dashboard's
author configured them, so I can read detailed row-level results (e.g.
screenline-by-screenline validation) the way the other panel types
already let me read summary numbers and charts.

**Why this priority**: This is the entire feature's reason to exist —
without a rendering table panel, there's nothing for sorting, pagination,
or search to act on. It's also the smallest slice that delivers real
value: a plain, correctly-styled, correctly-columned table is useful on
its own even before any interactivity is added.

**Independent Test**: Configure a `table` panel against real fixture
data, load the dashboard tab, and confirm the table renders with the
correct rows, columns, labels, and formatting — styled consistently with
every other panel card on the same tab.

**Acceptance Scenarios**:

1. **Given** a `table` panel whose config includes a `columns:` list,
   **When** the panel loads, **Then** the table shows exactly those
   fields, in that order, using each entry's `label` (or the raw field
   name if `label` is omitted), with each entry's `format` string applied
   to that column's values where specified.
2. **Given** a `table` panel whose config has no `columns:` list,
   **When** the panel loads, **Then** the table derives its columns from
   the query result's own returned fields, in the order returned.
3. **Given** a `columns:` entry that also specifies `color_scale`/
   `domain`, **When** the panel loads, **Then** that column's cells show
   the corresponding sequential/diverging color treatment.
4. **Given** any `table` panel, **When** it renders, **Then** it uses
   `002-design-tokens`' existing tokens/typography (border, shadow,
   spacing, font mapping) — the same visual bar every other panel type
   already meets, not framework-default table markup.

---

### User Story 2 - Sort the table by any column (Priority: P2)

As a dashboard user, I want to click a column header to re-sort the table
by that column, so I can quickly find the largest errors, worst-performing
screenlines, or any other column-driven ordering I care about, without
waiting on a new query each time.

**Why this priority**: The single most-used interaction on any data
table, and directly named in `project-docs/SPEC.md`'s own Panel types table
("Sortable, paginated"). Builds directly on US1 — nothing to sort until
a table renders.

**Independent Test**: Load a table panel with real fixture data, click a
column header, and confirm the visible row order changes correctly by
that column — with no new network/query activity.

**Acceptance Scenarios**:

1. **Given** a rendered table, **When** the user clicks a column header,
   **Then** the table re-orders by that column, ascending on the first
   click.
2. **Given** a table already sorted by a column, **When** the user clicks
   that same column's header again, **Then** the sort direction reverses
   to descending.
3. **Given** a table sorted by one column, **When** the user clicks a
   *different* column's header, **Then** the table sorts by the new
   column, ascending, regardless of the previous column's direction.
4. **Given** a panel config that includes `sort: { column, order }`,
   **When** the panel first loads, **Then** the table's initial row order
   already reflects that configured sort, before any user click.
5. **Given** any sort interaction, **When** it happens, **Then** no
   additional query fires — the reorder happens entirely against the
   already-fetched result set.

---

### User Story 3 - Page through a large result set (Priority: P3)

As a dashboard user looking at a panel with many rows (e.g. a
link-by-link screenline validation table), I want the table to show a
manageable page of rows at a time with controls to move between pages,
so the panel stays readable and the page doesn't render hundreds of rows
at once.

**Why this priority**: Directly named alongside sorting in
`project-docs/SPEC.md`'s Panel types table ("Sortable, paginated") — a table
panel isn't considered complete against its own documented description
without it. Independent of US2 (a table can be paginated without being
sorted, and vice versa), so it's its own slice.

**Independent Test**: Load a table panel whose fixture result set exceeds
one page's worth of rows, confirm only the first page renders initially,
and confirm pagination controls correctly move through the remaining
rows.

**Acceptance Scenarios**:

1. **Given** a result set larger than the effective page size, **When**
   the panel loads, **Then** only the first page's rows render, with
   controls available to reach the remaining rows.
2. **Given** a panel config that includes `pagination: <number>`,
   **When** the panel loads, **Then** that number is used as the page
   size instead of the default.
3. **Given** a result set that fits within a single page, **When** the
   panel loads, **Then** no pagination controls are needed to see every
   row (they may be hidden, or shown but inert — either is acceptable,
   as long as every row is reachable without them).
4. **Given** a table sorted by a column, **When** the user pages forward,
   **Then** the pages reflect the sorted order (pagination slices the
   currently-sorted result set, not the original unsorted one).

---

### User Story 4 - Search across the full result set (Priority: P4)

As a dashboard user looking at a large table, I want to type into a
search box and have the table narrow to matching rows — searching the
*entire* underlying result set, not just whatever page happens to be
showing — so I can find a specific link, zone, or value without paging
through everything by hand.

**Why this priority**: Lowest priority of the four — a table panel is
already useful and matches its documented description (US1-US3) without
search. But `searchable: true` is real, existing grammar
(`project-docs/GRAMMAR.md`), confirmed in scope during specification rather than
assumed away, so it's included as its own slice rather than silently
dropped.

**Independent Test**: Load a table panel with `searchable: true` and a
result set spanning multiple pages, type a search term matching a row on
a later page, and confirm that row appears in the (now paginated) filtered
results without the user needing to know or navigate to its original page.

**Acceptance Scenarios**:

1. **Given** a panel config with `searchable: true`, **When** the panel
   renders, **Then** a search input is available.
2. **Given** a search term entered into that input, **When** the table
   updates, **Then** only rows where that term matches (case-insensitive,
   substring) some visible cell value are shown — evaluated against the
   *entire* fetched result set, not only the currently displayed page.
3. **Given** a search term that matches a row that was previously on a
   different page than the one currently shown, **When** the search is
   entered, **Then** that row is shown among the filtered results (the
   filtering happens before pagination re-slices what's visible).
4. **Given** filtered (searched) results, **When** the user also sorts by
   a column, **Then** both apply together — the sort orders the filtered
   subset, not the full unfiltered set.
5. **Given** a search term matching no rows, **When** the table updates,
   **Then** the table clearly shows zero results — distinguishable from
   the panel's own "no data at all" empty state (FR-013), since the
   underlying query did return data; it's the search that found nothing.

---

### Edge Cases

- What happens when a `columns:` entry's `field` doesn't actually exist
  on the returned rows (a config-authoring mismatch)? That column's cells
  render blank rather than crashing the whole panel — consistent with
  this project's general "config errors are visible, not fatal" posture.
- What happens when the query result set is empty (zero rows)? The panel
  shows its existing shared empty state (`PanelEmptyState`) — no table
  shell, sort controls, pagination controls, or search box are rendered
  around nothing.
- What happens when a global filter changes while a table panel is
  visible, mid-sort/mid-search/mid-page? The panel re-queries as normal
  (existing behavior, unchanged); any active client-only sort/search/page
  state resets to its defaults against the new result set, the same way
  the other panel types don't persist client-only view state across a
  genuine data refresh.
- What happens when a table panel is expanded to the large dialog view
  (`004-panel-expand-dialog`) while sorted, paged, or searched? That
  state persists across the expand/collapse round trip, the same way the
  panel's own data already does — it's the same mounted component
  instance either way, per `004`'s own guarantee.
- What happens when a column's values are numeric vs. text? Sorting
  produces the reader's expected order for each (numeric order for
  numbers, not lexicographic-string order) — addressed as part of
  planning the sort implementation, not left to accidental behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `table` panel type registered in the
  panel registry, following the established panel pattern (a function
  component receiving a single `config` prop, per the pattern
  `ValueBoxPanel`/`PlotlyPanel` already use).
- **FR-002**: A table panel MUST render its query result's rows as a
  properly styled table, using the existing design-token set — not
  unstyled or framework-default table markup.
- **FR-003**: When a table panel's config includes a `columns:` list, the
  table MUST display exactly those fields, in that order, using each
  entry's `label` (falling back to the raw field name when `label` is
  omitted).
- **FR-004**: When a table panel's config has no `columns:` list, the
  table MUST derive its displayed columns from the query result's own
  shape (every field present on the returned rows, in the order
  returned).
- **FR-005**: A `columns:` entry's `format` string, when present, MUST be
  applied to that column's rendered cell values.
- **FR-006**: A `columns:` entry's `color_scale`/`domain`, when present,
  MUST be applied as a cell-level color treatment (sequential or
  diverging, matching the same convention already documented for other
  panel types). **The actual visual mapping is not decided by this spec
  — flagged explicitly below, not left for whoever writes the
  color-mapping code to decide unreviewed.**
- **FR-007**: Clicking a column's header MUST re-sort the table by that
  column — ascending on first click, toggling to descending on a repeat
  click of the same column, resetting to ascending when a different
  column is clicked next.
- **FR-008**: When a table panel's config includes `sort: { column,
  order }`, the table MUST apply that as its initial sort order, before
  any user interaction.
- **FR-009**: For a result set larger than the effective page size, the
  table MUST render only the current page's rows, with controls to move
  between pages.
- **FR-010**: The effective page size MUST come from the panel config's
  `pagination:` value when present, or a documented default otherwise.
- **FR-011**: When a table panel's config includes `searchable: true`,
  the table MUST provide a search input; entered text MUST filter to
  rows where that text matches (case-insensitive, substring) some
  displayed cell value, evaluated against the entire fetched result set
  — not only whichever page is currently visible — with the filtered
  subset then paginated normally.
- **FR-012**: Sorting, pagination, and search MUST all operate on the
  same already-fetched, in-memory result set — none of the three may
  trigger an additional data query.
- **FR-013**: A table panel's loading, empty-result, and error states
  MUST use the same shared components other panel types already use
  (`PanelEmptyState`, `PanelErrorState`) — no new state-handling pattern.
- **FR-014**: A table panel MUST read filter values via the existing
  filter-state mechanism and query via the existing shared query service
  — the same architecture `ValueBoxPanel`/`PlotlyPanel` already use, not
  a new one.
- **FR-015**: A table panel MUST automatically inherit the existing
  expand-to-large-view mechanism with zero panel-type-specific wiring —
  the same as every other registered panel type.

### Key Entities

- **TableColumnConfig**: one entry in a table panel's `columns:` list —
  represents which field to show, how to label it, and how to format/
  color it. Fields: `field` (source column name), `label` (display name,
  optional), `format` (Python-style format string, optional),
  `color_scale` (`sequential` | `diverging`, optional), `domain` (a
  `[min, max]` pair the color scale maps against, optional).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A table panel renders its data as soon as its query
  resolves, with no additional user action required to see the first
  page of results.
- **SC-002**: Re-sorting a table by any column happens with no visible
  loading delay and no network activity — the reorder is instant against
  already-loaded data.
- **SC-003**: A user can locate any row in a large, multi-page result set
  by typing a matching search term, without first knowing or navigating
  to the page that row happens to be on.
- **SC-004**: A table panel is visually indistinguishable, in styling
  language (borders, shadows, spacing, typography), from every other
  panel card on the same dashboard tab.
- **SC-005**: Every table panel gains the panel-expand-to-large-view
  behavior with zero additional per-panel-type implementation work.

## Flagged for `/speckit-plan`

- **FR-006's `color_scale`/`domain` visual mapping is genuinely
  undecided and MUST be resolved as an explicit research question before
  implementation, not improvised by whoever writes the color-mapping
  code.** Checked directly, not assumed either way, before writing this
  down: neither `project-docs/CALIBRATION-SUMMARIES.md` (the document
  `project-docs/ARCHITECTURE.md` describes as containing "Standard Segmentation
  Definitions" — no section is literally titled that, in
  `project-docs/GRAMMAR.md` or elsewhere) nor `002-design-tokens`'s actual
  shipped token set (`src/styles/tokens.css`) establishes any
  sequential/diverging color convention. `project-docs/GRAMMAR.md`'s own
  `zonemap` example (the only other place `color_scale`/`color_ramp`
  appear in the grammar) just names generic ColorBrewer ramps (`YlOrRd`,
  `RdBu`) with no connection to any brand token. `tokens.css` itself
  defines exactly one semantically-negative color (`--destructive`,
  `#c23c33`) and no positive/success counterpart — a diverging scale
  cannot even reuse two existing opposite-meaning tokens without at
  least one new token being introduced. `/speckit-plan`'s research.md
  MUST resolve, with the same rigor as any other research question in
  this project (checked against reality, not invented from scratch):
  - What "sequential" and "diverging" actually render as — specific
    colors/ramps, and whether they're new tokens or derived from
    `002-design-tokens`'s existing palette (cheap to get right now;
    easy to accidentally clash with the established brand palette if
    improvised later, once this feature and others start relying on it).
  - For `diverging` specifically: what the midpoint color is, and where
    it sits — the `domain`'s center (e.g. midpoint of `[-0.5, 0.5]`), or
    a fixed value like `0`, which differ whenever a domain isn't
    symmetric around zero.

## Assumptions

- Default page size, when a panel's config omits `pagination:`, is 20
  rows — matching `project-docs/GRAMMAR.md`'s own documented example value for
  this exact field, not an arbitrarily chosen number.
- Default initial sort, when a panel's config omits `sort:`, is the query
  result's own natural/returned row order — no forced default column
  sort invented where none was configured.
- Search matches against each column's *rendered* (formatted) value, not
  a hidden raw underlying value — matching the mental model of "search
  what you can see."
- "Inline column expressions" (mentioned in `project-docs/GRAMMAR.md`'s prose for
  `type: table`) has no defined syntax anywhere in the documentation and
  is explicitly out of scope for this feature — a deliberate boundary
  given there is nothing specified to build against, not an oversight.
- Column-level filtering beyond the single full-table search box, and
  CSV export, remain out of scope, as originally scoped.
- This feature adds no new panel type beyond `table` itself — `flowmap`,
  `zonemap`, `sankey`, `markdown`, and `observable-plot` remain
  separately deferred, matching every prior feature's same boundary.
