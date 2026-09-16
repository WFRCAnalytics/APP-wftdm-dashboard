# Feature Specification: Hierarchical Chart Panels (Zoomable Treemap & Sunburst)

**Feature Branch**: `058-hierarchical-chart-panels`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "Feature: Custom D3-based interactive hierarchical charts (zoomable treemap, zoomable sunburst), themed to match Observable Plot/Nova. Add a new panel capability for hierarchical (parent-child nested) data visualizations — zoomable treemap and zoomable sunburst as the first two chart types — built directly with D3 (d3-hierarchy for layout, raw SVG/D3 for rendering and interaction), since Observable Plot has no native or clean compositional support for these. Visually theme them to look and feel consistent with this app's existing Observable Plot panels and the broader Nova/shadcn design system — a viewer should not be able to tell these are a different underlying rendering technology. REAL, CONFIRMED CONTEXT FROM THIS SESSION — carry forward: Observable Plot is now this app's default charting library (057); Plotly/Recharts remain supported but are deliberately not being further invested in — per direct user decision, keep them working and tested at their current level, don't deepen their capability. Every existing panel type consumes FLAT, tidy-row data (confirmed via panelQuery.ts's own query-building model). Hierarchical charts need genuinely different data — parent-child nesting — which no existing panel type or query mechanism currently produces. DESIGN, per direct user decisions this session: (1) Build ONE generic, reusable D3-chart-host component/architecture that different hierarchical chart types plug into — not a separate, bespoke component per chart type. Model this loosely on how ObservablePlotPanel.tsx already wraps a non-React rendering library via useEffect/ref, but generalize the pattern to support multiple D3-based chart 'renderers' sharing one host. (2) Both treemap and sunburst must be genuinely INTERACTIVE — zoomable, matching the well-established, real, canonical D3 community pattern for zoomable treemaps/icicles/sunbursts (Mike Bostock's own reference implementations are the standard starting point — study the real, current versions directly, don't approximate from memory). (3) Visual theming must match Nova/shadcn — real token-derived colors (the same --chart-1..5 lineage already used elsewhere), real typography matching wftdm-design-system's established roles, and verified dual-theme correctness using this project's own established getComputedStyle()-based verification technique. REQUIRED RESEARCH (see Research Findings below for results): (1) Confirm definitively whether Observable Plot has ANY native or compositional support for treemap/sunburst. (2) Audit this app's OWN real, current demo data for anything with a genuine hierarchical structure. (3) Research the real, current, canonical D3 zoomable treemap/sunburst reference implementations directly. (4) Design the real grammar/config shape for this new panel type/family. (5) Confirm real dark-mode/theming interaction for D3-rendered SVG. Does not include: any further investment in Plotly/Recharts' capabilities; any change to Observable Plot's own existing panel type; migrating any existing flat-data panel to a hierarchical structure — this is new capability only, for genuinely hierarchical data."

## Research Findings (grounding this spec)

Confirmed directly against this codebase's own installed dependencies and
real, live-queried demo data before writing requirements below — nothing
here is assumed or approximated from memory.

- **Observable Plot has no treemap/sunburst support of any kind —
  confirmed by direct source inspection, not assumed.** A full-text
  search of the installed `@observablehq/plot` package's own source
  (`node_modules/@observablehq/plot/src/`) for "treemap"/"partition"/
  "pack" returns zero real matches, and the package's own `package.json`
  lists no `d3-hierarchy` dependency at all. Its one real hierarchical
  capability — `Plot.tree`/`Plot.cluster` (`marks/tree.js`,
  `transforms/tree.js`) — renders a node-link "tidy tree"/cluster diagram
  (dots, links, and text, via `d3.tree`/`d3.cluster`), a fundamentally
  different visual than an area-subdivision treemap or a radial sunburst,
  and not a composable substitute for either. This confirms, definitively,
  that no genuine Observable Plot composition path exists for this
  feature's two target chart types — a custom D3 renderer is the only
  real option, the same class of gap `057-observable-plot-conversion`'s
  own research already confirmed for Sankey diagrams (never re-checked by
  that feature for treemap/sunburst specifically, since neither existed
  as a real need at the time).
- **A real, already-published, genuinely hierarchical dataset exists
  today, confirmed via a live query against the real Parquet file** —
  `purpose_mode_flow` (published for every real demo scenario; already
  consumed by the real "Trip Purpose to Mode Flow" `sankey` panel) has 10
  real `primary_purpose` values, each splitting into up to 5 real
  `major_trip_mode` values (50 total rows), with real, non-degenerate
  `trips` counts ranging from 3 to 5,878. This is a genuine two-level
  categorical hierarchy (purpose → mode) usable as this feature's own
  first real demo content, with **zero new `summarize.yaml` metric
  needed**.
- **A candidate real geographic hierarchy was investigated and found NOT
  viable, confirmed live** — `land_use_summary`'s own `SD`/`DISTRICT`/
  `zone_id` columns form a real 3-level structure in principle, but a
  direct `GROUP BY SD, DISTRICT` query against every real zone in the
  real demo scenarios shows every one of the 25 real zones sharing the
  exact same `SD=1`/`DISTRICT=1` value — the synthetic `prototype_mtc`
  25-zone test system has no real district/superdistrict subdivision at
  all. A treemap/sunburst rooted on this data would show one meaningless
  top-level branch; not used.
- **A deeper, real three-level hierarchy is possible but not yet
  available without new data-pipeline work** — `tour_category`
  (mandatory/non_mandatory/joint/atwork) is a real column already used
  as a `WHERE`-clause filter by several existing `summarize.yaml`
  metrics, but no existing metric currently `SELECT`s/`GROUP BY`s it
  alongside purpose and mode together. Producing a genuine
  `tour_category` → `primary_purpose` → `major_trip_mode` hierarchy would
  need a new metric — a real, available future extension, not committed
  to by this feature (see Assumptions).
- **This project already has an established, proven technique for
  resolving theme-token colors inside dynamically-rendered SVG** —
  confirmed directly in `SankeyPanel.tsx`/`sankeyColor.ts` and
  `ObservablePlotPanel.tsx`: `getComputedStyle()` read against a live,
  mounted DOM element (never a raw, unresolved `var(--x)` reference left
  on a D3-managed SVG node), with `currentColor` used for text
  specifically. This is a real, already-solved instance of exactly the
  risk this feature's own design decisions flag — it does not need to be
  re-solved from scratch, only reused.
- **`d3-hierarchy` is confirmed not currently a dependency of this
  project** (`package.json` checked directly) — `d3-sankey` and
  `d3-scale-chromatic` (both already used by the existing `sankey` panel
  type) are the only `d3-*` packages currently present. This feature adds
  `d3-hierarchy` as a new, real dependency.
- The real, canonical D3 zoomable-treemap/zoomable-sunburst reference
  implementations (Observable's own current examples) and the exact
  grammar/config shape an author writes in `dashboard-*.yaml` are both
  genuinely HOW-level design decisions, appropriately made during
  `/speckit-plan`, not fixed by this spec (see Assumptions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author renders a real hierarchical breakdown as a zoomable treemap (Priority: P1)

A dashboard author wants to show a real, nested categorical breakdown
(e.g., trips by purpose, then by mode within each purpose) as an
area-proportional treemap, where a viewer can click into any branch to
focus on it and click back out again.

**Why this priority**: This is the foundational value of the feature — a
viewer being able to see and explore a genuinely hierarchical dataset,
which no existing panel type can currently render at all. It also
establishes the shared underlying architecture the second chart type
(User Story 2) proves out.

**Independent Test**: Author a treemap panel naming the real,
purpose→mode hierarchical metric; confirm it renders nested, color-coded
rectangles sized by the real trip counts, and that clicking a purpose
branch zooms the view into that branch's own mode breakdown, with a clear
way back to the full view.

**Acceptance Scenarios**:

1. **Given** a treemap panel configured against the real purpose→mode
   hierarchical data, **When** the panel renders, **Then** a top-level
   rectangle is subdivided into one region per real purpose, each sized
   in proportion to that purpose's real total trip count, each in its
   own distinct color.
2. **Given** the rendered treemap, **When** a viewer clicks a non-leaf
   region, **Then** the view zooms to fill the panel with that region's
   own children (its real mode breakdown), each still sized and colored
   correctly.
3. **Given** a zoomed-in view, **When** a viewer wants to return to the
   full view, **Then** a clear, discoverable action (e.g., a breadcrumb
   or a click on the current top-level region) zooms back out, one level
   at a time or directly to the root.
4. **Given** the rendered treemap at any zoom level, **When** a viewer
   hovers or taps a region, **Then** its real underlying value is shown
   clearly, not just implied by its relative size.

---

### User Story 2 - Author renders the same real hierarchy as a zoomable sunburst (Priority: P2)

A dashboard author wants the same kind of real, nested categorical
breakdown shown as a radial sunburst instead of a treemap — rings
subdivided by angle rather than rectangles subdivided by area — with the
same click-to-zoom interaction.

**Why this priority**: This proves the architecture built for User Story
1 is genuinely shared and reusable across a second, visually very
different chart type, rather than being a one-off built specifically for
treemaps. It is the feature's core architectural decision (one generic,
reusable host, not one bespoke component per chart type) made real.

**Independent Test**: Author a sunburst panel against the same real
hierarchical data used in User Story 1; confirm it renders concentric
rings whose angular extent reflects real values, and that the same
click-to-zoom / zoom-back-out interaction works.

**Acceptance Scenarios**:

1. **Given** a sunburst panel configured against the same real
   purpose→mode hierarchical data, **When** the panel renders, **Then**
   the innermost ring shows one arc per real purpose (angular width
   proportional to that purpose's real total), and the next ring out
   shows each purpose's own real mode breakdown as further-subdivided
   arcs.
2. **Given** the rendered sunburst, **When** a viewer clicks a non-leaf
   arc, **Then** the view zooms so that arc becomes the new center,
   showing its own children around it — the same click-to-zoom pattern
   as the treemap, adapted to the radial layout.
3. **Given** a zoomed-in sunburst view, **When** a viewer wants to
   return to the full view, **Then** the same kind of clear, discoverable
   zoom-out action from User Story 1 is available.

---

### User Story 3 - A viewer cannot tell these charts use a different rendering technology (Priority: P3)

A viewer looking at a treemap or sunburst panel, in either light or dark
mode, sees colors, typography, and general chrome that read as
completely consistent with this app's existing Observable Plot panels
and its broader design system — nothing about the visual presentation
gives away that a different underlying rendering approach was used.

**Why this priority**: Correctness and interactivity (User Stories 1–2)
must exist before visual polish is meaningful, but this is a hard
requirement from this feature's own design decisions, not a
nice-to-have — a hierarchical chart that looks visually foreign next to
the rest of the app would undermine the whole point of adding it.

**Independent Test**: Render a treemap or sunburst panel on the same tab
as an existing Observable Plot panel, in both light and dark mode;
confirm — via real, automated computed-style checks, not a visual glance
— that colors are drawn from the same token set, text uses the same
established type roles, and the panel reads as visually native to this
app.

**Acceptance Scenarios**:

1. **Given** a treemap or sunburst panel rendered next to an existing
   Observable Plot panel on the same tab, **When** viewed in light mode,
   **Then** both use colors from the same categorical token lineage and
   the same typography roles.
2. **Given** the same pairing, **When** the app is switched to dark mode,
   **Then** every visual element of the treemap/sunburst panel (fills,
   labels, any background) remains legible and on-token, verified the
   same rigorous way this project already verifies every other themed
   surface.

---

### Edge Cases

- What happens when the configured hierarchy is degenerate (only one
  real top-level branch, the same shape the rejected `SD`/`DISTRICT`
  geographic candidate had)? The chart must still render sensibly (one
  region/ring filling the view), never error or show a blank panel.
- What happens when a node's real value is zero or missing? It must
  render without a broken or overflowing label and without distorting
  the layout of its siblings.
- What happens when a leaf's allocated area/arc is too small to fit its
  label? The label must be handled gracefully (e.g., hidden or
  truncated) — it must never render outside its own node or overlap a
  sibling's.
- What happens when a hierarchy level's real category value contains a
  character that is awkward for the rendering technology (e.g., a space,
  the same class of issue already found and fixed once elsewhere in this
  app's charting code)? Every node must render with its correct color
  and its correct, unaltered real label regardless of the literal
  category text.
- What happens when the panel's query returns zero rows? This app's own
  existing shared empty-result state must appear, never a blank chart
  area.
- What happens when the panel's query fails? This app's own existing
  shared error state must appear, and this failure must never prevent
  sibling panels on the same tab from rendering.
- What happens when a viewer clicks rapidly, or clicks a new node while
  a zoom transition is still animating? The chart must settle into a
  single, consistent, correct state — never a visually broken
  mid-transition freeze.
- What happens when the panel is expanded (this app's existing
  expand-to-dialog mechanism) while zoomed into a node? The zoomed state
  must be preserved across the resize, matching this app's own
  established "expand preserves in-progress state" precedent already
  proven on other panel types.
- What happens when the active scenario set or a global filter changes
  while a viewer is zoomed into a node? The view resets to the root
  (see Assumptions) rather than showing a zoomed view against
  potentially mismatched new data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide two new panel types — a zoomable
  treemap and a zoomable sunburst — for rendering genuinely hierarchical
  (parent-child) data, sharing one common underlying rendering
  architecture rather than being independently built per chart type.
- **FR-002**: Both new panel types MUST bind to real queried data using
  this app's existing metric/scenario/filter grammar, consistent with
  every other data-bound panel type.
- **FR-003**: An author MUST be able to express a hierarchy from the
  shape of a query's own real result columns — naming which columns
  form the ordered hierarchy levels (root to leaf) and which column
  supplies each leaf's real, sized value — without needing a query that
  returns pre-nested, tree-shaped data.
- **FR-004**: Both chart types MUST correctly render a real hierarchy of
  at least two levels deep (matching the confirmed real purpose→mode
  dataset) and MUST also render correctly if the underlying data provides
  three or more levels.
- **FR-005**: Both chart types MUST be genuinely interactive: a viewer
  MUST be able to click or tap a non-leaf node to zoom the view into that
  node's own subtree, and MUST have a clear, discoverable way to zoom
  back out — matching the standard, well-established interaction pattern
  this chart family already has across the broader web.
- **FR-006**: Every visual aspect of both chart types (node/segment
  fills, text/labels, background) MUST resolve from this app's existing
  design tokens — the same categorical color-token lineage other chart
  panel types already use — and MUST remain correct and legible in both
  light and dark theme, verified via this project's own established
  computed-style verification technique, not a visual/manual check alone.
- **FR-007**: Typography for any label, breadcrumb, or other text
  rendered by these chart types MUST match this app's established
  typography roles, not an ad hoc or one-off font treatment.
- **FR-008**: Both new panel types MUST participate in this app's
  existing shared loading/empty/error states, exactly like every other
  data-bound panel type — a broken hierarchical-chart panel MUST NOT
  prevent sibling panels on the same tab from rendering.
- **FR-009**: A node/segment whose real value is zero, missing, or
  negligibly small relative to its siblings MUST render without a
  broken or overflowing label and without breaking the layout of its
  siblings.
- **FR-010**: This feature MUST NOT modify, regress, or reduce the
  current rendering, theming, or behavior of any existing panel type
  (Plotly, Recharts, Observable Plot, Sankey, or any other) — it is
  purely additive.
- **FR-011**: This feature MUST NOT extend or further invest in Plotly's
  or Recharts' own capabilities as an alternative way to represent
  hierarchical data, and MUST NOT change Observable Plot's own existing
  panel type in any way.
- **FR-012**: The system MUST demonstrate both new panel types against
  at least one genuinely real, already-published, non-fabricated
  hierarchical dataset from this app's existing real demo content —
  no synthetic/fabricated data is required to prove this feature works.
- **FR-013**: A viewer hovering or tapping any node, at any zoom level,
  MUST see that node's real underlying value(s), consistent with this
  app's own established tooltip/detail conventions on other chart panel
  types — a node's visual size alone MUST NOT be the only way its value
  is communicated.
- **FR-014**: Zooming into or out of a node MUST reuse the same query
  result already rendered — it MUST NOT trigger a new data query,
  consistent with this app's own established "interact without
  re-fetch" convention already proven on other panel types.
- **FR-015**: This feature MUST NOT migrate any existing flat-data panel
  or existing dashboard content to a hierarchical structure — it adds a
  new capability only, for data that is genuinely hierarchical.

### Key Entities

- **Hierarchical Chart Panel Configuration**: An author-facing panel
  definition — which metric/scenario(s)/filter(s) to query (shared with
  every other data-bound panel type), which of the two chart types to
  render (treemap or sunburst), which real result-set columns define the
  hierarchy's levels (ordered, root to leaf), and which column supplies
  each leaf's real, sized value.
- **Hierarchy Node**: One level of the rendered structure — a real
  category value at some depth, its real (own or aggregated) value, and
  its child nodes if any — the common shape both chart types render from,
  regardless of which one an author picks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An author can add a treemap or sunburst panel against a
  real, already-published metric, with zero custom rendering code of
  their own, and it renders correctly on first try.
- **SC-002**: A viewer can zoom into any non-leaf node and return to the
  full view within a small, consistent number of interactions, with no
  confusion about how to get back — matching the familiar interaction
  convention this chart family already has elsewhere on the web.
- **SC-003**: Every visual element of both chart types remains fully
  legible in both light and dark mode, confirmed by real automated
  checks, with zero manual "it looked fine" sign-off standing in for
  that verification.
- **SC-004**: Zero regressions in any existing panel type's own existing,
  already-passing test coverage.
- **SC-005**: A viewer cannot visually distinguish a treemap/sunburst
  panel's general look and feel (color palette, typography, card
  chrome) from this app's existing Observable Plot panels, without being
  told which rendering technology produced it.
- **SC-006**: The underlying architecture built for the treemap and
  sunburst chart types is demonstrably shared (not duplicated) between
  them, such that a future third hierarchical chart type (e.g., an
  icicle diagram) would not require rebuilding the theming, interaction,
  or data-binding foundation from scratch.

## Assumptions

- **Panel type names**: `treemap` and `sunburst` — naming each new panel
  type after the specific chart it produces (matching this app's own
  `sankey` precedent), since — unlike `plotly`/`observable-plot`/
  `recharts`, which name the underlying rendering library — there is no
  single generic library-level name that would meaningfully distinguish
  the two new chart types from each other. The exact `type:` string
  values are a design decision for `/speckit-plan`, informed by this
  convention, not rigidly fixed by this spec.
- **Grammar shape**: an author expresses the hierarchy as an ordered list
  of real result-set column names (root to leaf) plus one value column
  name — the exact field/key names themselves are an implementation-level
  design decision for `/speckit-plan`, matching this project's own
  established precedent of leaving exact grammar field names to the
  planning phase (`029-shadcn-chart-panel`'s own identical Assumption).
- **First real content**: the existing, already-published
  `purpose_mode_flow` metric (`primary_purpose` → `major_trip_mode`, real
  trip counts) is assumed sufficient to demonstrate both chart types with
  zero new `summarize.yaml` metric required. A deeper, real 3+-level
  hierarchy (e.g., adding `tour_category`) is a real, available future
  extension, not committed to by this feature.
- **Zoom-state reset on data change**: if the active scenario set, a
  global filter, or the underlying query result otherwise changes while
  a viewer is zoomed into a node, the view resets to the root — the
  simplest, most predictable behavior, avoiding an ambiguous "stale zoom
  against new data" state. A more sophisticated "preserve zoom position
  across a data refresh if the same node still exists" behavior is out
  of scope for this first version.
- **New dependency**: `d3-hierarchy` is confirmed not currently present
  in this project and will be added as a new, real npm dependency
  (`d3-sankey`/`d3-scale-chromatic`, already present, are the only
  existing `d3-*` packages).
- **Reused theming technique**: the `getComputedStyle()`-based
  CSS-custom-property resolution technique already established and
  proven by `SankeyPanel.tsx`/`ObservablePlotPanel.tsx` is assumed
  sufficient and will be reused, not reinvented, for these two new chart
  types.
- **Reference implementation research**: the real, current, canonical
  D3 zoomable-treemap and zoomable-sunburst techniques (and the exact
  shared-host component architecture they inform) are genuinely
  implementation-level research, appropriately performed during
  `/speckit-plan`, not resolved by this spec.
- **Explicit non-goals** (per direct instruction): no further investment
  in Plotly's or Recharts' own capabilities; no change to Observable
  Plot's own existing panel type; no migration of any existing flat-data
  panel or dashboard content to a hierarchical structure.
