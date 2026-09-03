# Feature Specification: Graphic Walker Exploration Panel

**Feature Branch**: `014-graphic-walker-panel`

**Created**: 2026-09-02

**Status**: Draft

**Input**: User description: "Add self-service, drag-and-drop data exploration (Tableau-like free
visualization building) using the @kanaries/graphic-walker library — the last
remaining originally-listed capability from this project's own roadmap
(CLAUDE.md's Implementation order, item 10)."

## Research findings this spec relies on

Resolved directly from `docs/GRAMMAR.md`'s existing `type: graphic-walker`
section and from the real, current `@kanaries/graphic-walker` package
(npm registry + its own GitHub repo), not assumed:

1. **Grammar shape — not a special construct.** `docs/GRAMMAR.md` already
   documents `type: graphic-walker` as an *ordinary* panel entry using the
   exact same row/panel grid grammar every other panel type uses
   (`type`, `title`, plus this type's own `dataset`, `limit`, `height`,
   `width` keys — `width` following the project's existing "fraction of
   row width, panels in a row sum to 1.0" convention). There is no
   dedicated "Explore tab" construct in the schema. "Explore tab" (as this
   project's own past notes call it) is purely an *authoring* convention —
   a `dashboard-*.yaml` file whose only row holds one `graphic-walker`
   panel at `width: 1.0` — not a different kind of tab the app needs to
   special-case.
2. **Snapshot model, confirmed in two places.** Both `docs/GRAMMAR.md`
   ("Snapshot model: does not share DuckDB connection or respond to
   global sidebar filters") and `docs/ARCHITECTURE.md` ("GW holds its own
   data copy, does not respond to global sidebar filters — intentional,
   Explore is an open-ended context") independently confirm: one query at
   mount time, no live re-querying, no reaction to the sidebar filter
   panel other panel types subscribe to via `useFilterState`.
3. **Package is real, current, and actively maintained** —
   `@kanaries/graphic-walker`, Apache-2.0 licensed, latest published
   version `0.5.2`. It ships its own React component (`GraphicWalker`)
   and DOM-mount helpers (`embedGraphicWalker` et al., confirmed present
   in `docs/ARCHITECTURE.md`'s own sketch) usable with no server backend —
   a plain `data` prop (flat array of row objects) plus a `fields` prop
   (`IMutField[]`: `fid`, `name`, `semanticType`, `analyticType`).
4. **A real, confirmed version-compatibility constraint.** Checked the
   npm registry's own published manifests directly, version by version
   (not the changelog's prose, which is incomplete) — the package's peer
   dependency stays `react`/`react-dom` `>=17.0.0 <19.0.0` through
   `0.4.82`, then jumps to `>=19.0.0` starting at `0.4.83`. This project is
   pinned to React `^18.3.1` (confirmed in `package.json`, matching
   CLAUDE.md's own explicit "React once a UI feature needs it" / React 18
   framing throughout) — bumping the whole application to React 19 is a
   cross-cutting change with no relationship to this feature's own scope.
   The last React-18-compatible release is therefore **`0.4.82`**
   (published 2026-04-30), not `0.4.80` — this is the version this
   feature pins to (see Assumptions). This matters beyond version-string
   trivia: diffing `v0.4.80...v0.4.82` directly against the project's own
   GitHub history shows two real, named bug fixes landed in that range
   ("fix: arc" — arc/pie-mark rendering — and "fix: text stack" — text-
   mark stacking) that `0.4.80` alone does not have. Pinning to `0.4.80`
   specifically, as an earlier draft of this research did, would have
   shipped with two already-identified-and-fixed bugs for no compatibility
   benefit at all — `0.4.82` carries the identical React 18 peer range.
   No further behavioral gap between `0.4.82` and the current `0.5.x` line
   beyond the React 19 peer bump itself was found in the available commit/
   release history, though that history was not fully retrievable through
   `0.5.x` — implementation should still watch for any such gap
   empirically (see Assumptions' "verify empirically" list).
5. **Rendering technology is Vega-Lite** (SVG/Canvas via `vega-embed`),
   not WebGL, for the chart types this panel type is expected to
   produce. The package does carry `vega-webgl-renderer` as a
   dependency (confirmed present since well before the 0.4.82 pin, so
   this is not a new risk introduced by the version choice) — but it is
   Vega's own opt-in, high-density point-rendering path, not GW's
   default rendering mode. This class of feature genuinely does not carry
   the same WebGL-context-budget concern `012-webgl-context-management`
   had to solve for map panels: nothing here holds a persistent WebGL
   context the way `maplibregl.Map`/`MapboxOverlay` do. No `arquero`
   dependency is present in the package at all (confirmed absent from its
   published manifest) — the historically-cited arquero/DuckDB-WASM
   duplication concern does not apply to the version this feature ships.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Freely build a chart from an existing dataset (Priority: P1)

A dashboard viewer opens the Explore tab and, without any dashboard author
having pre-built that specific chart, drags fields onto shelves and picks a
mark type to see their own visualization of the underlying scenario data —
the same free-form, drag-and-drop chart-building experience a Tableau-style
tool offers, available for the first time anywhere in this dashboard (every
other panel type is author-fixed at YAML-authoring time).

**Why this priority**: This is the entire point of the feature — every
other capability in this spec exists only to get real, already-loaded
scenario data in front of this free-form builder. Without this, there is
nothing to ship.

**Independent Test**: Load a scenario, open a dashboard tab containing a
`graphic-walker` panel, drag a categorical field onto the x-shelf and a
numeric field onto the y-shelf, and confirm a chart renders using real rows
from the configured dataset — no dashboard YAML edit or code change
required to produce that specific chart.

**Acceptance Scenarios**:

1. **Given** a scenario is loaded and a dashboard tab contains a
   `graphic-walker` panel bound to one of that scenario's summary views,
   **When** the tab is opened, **Then** the panel shows the free-form
   field list, chart-type picker, and encoding shelves, pre-populated with
   that view's own columns and no chart yet selected.
2. **Given** the panel described above, **When** the viewer drags a field
   onto an encoding shelf and picks a mark type, **Then** a chart renders
   using the real rows from the configured dataset, entirely client-side,
   with no dashboard configuration change.
3. **Given** the same panel, **When** the viewer changes fields/marks
   repeatedly, **Then** each change re-renders immediately from the same
   already-fetched snapshot — no additional query is issued per
   interaction.

---

### User Story 2 - Author points an Explore panel at a specific dataset (Priority: P2)

A dashboard author (working in `dashboard-*.yaml`, not application code)
configures which scenario view a given `graphic-walker` panel explores —
exactly as every other panel type is bound to a `metric`/dataset via YAML —
so different Explore panels (or tabs) can be scoped to different underlying
tables purely through configuration.

**Why this priority**: Without a real dataset binding mechanism this
degrades to a hard-coded demo; this is what makes the panel type reusable
across every future dashboard the same way the other eight types already
are.

**Independent Test**: Add a second `graphic-walker` panel to a test
dashboard YAML pointing at a different `dataset:` value than the first, and
confirm each panel independently shows that dataset's own columns and rows
— no shared state or cross-contamination between the two.

**Acceptance Scenarios**:

1. **Given** a `graphic-walker` panel configured with `dataset:
   trip_mode_share`, **When** the panel loads, **Then** its field list and
   rows come only from the currently active scenario's `trip_mode_share`
   view.
2. **Given** a dashboard author changes only the `dataset:` value in YAML
   and reloads, **When** the panel re-renders, **Then** it reflects the
   newly configured dataset with no other code or config change.
3. **Given** more than one scenario is currently loaded and the panel's
   config omits `scenario:`, **When** the panel loads, **Then** its rows
   come from all loaded scenarios combined, with a `scenario` field the
   viewer can freely drag onto any shelf (color, facet, filter) themselves
   — reusing this project's existing multi-scenario union mechanism, not
   a new one.
4. **Given** a panel's config instead sets `scenario: base_tbm`, **When**
   the panel loads, **Then** its rows come from only that one named
   scenario's view.

---

### User Story 3 - Expand an Explore panel for more working room (Priority: P3)

A viewer mid-way through building a chart wants more screen space and uses
this dashboard's existing expand-to-dialog control (the same one every
other panel type already has) to enlarge the Explore panel, continues
working, then collapses it back — without losing the chart they were
building.

**Why this priority**: Valuable polish once the core capability (P1) and
its configurability (P2) exist, but the feature delivers real value even
if a viewer never uses the expand control — Explore panels are already
typically authored close to full width/height by convention.

**Independent Test**: With an in-progress chart built in an Explore panel
(a field already dragged onto a shelf), trigger the expand-to-dialog
control, confirm the same in-progress chart is still showing in the
enlarged view, then collapse and confirm it is still showing back in the
card.

**Acceptance Scenarios**:

1. **Given** an Explore panel with an in-progress, viewer-built chart,
   **When** the viewer triggers the panel's expand control, **Then** the
   same panel (not a fresh copy) relocates into the full-size dialog with
   the in-progress chart still showing.
2. **Given** the panel is showing expanded, **When** the viewer collapses
   it, **Then** it returns to the card with the same in-progress chart
   still showing, unchanged.

---

### Edge Cases

- What happens when the configured `dataset:` (or `scenario__dataset`
  combination) does not exist as a registered view? → Same
  `PanelErrorState` every other data-bound panel type already shows on a
  query failure — no separate error path for this type.
- What happens when the query returns zero rows (e.g., an empty scenario
  view, or a `scenario:` value naming a scenario that isn't currently
  loaded)? → Same shared `PanelEmptyState` every other panel type already
  shows.
- What happens when the underlying view has more rows than the configured
  `limit:`? → The panel explores a truncated snapshot (the first `limit:`
  rows returned by the query) rather than the full table; this is
  expected given the "snapshot, not live" model, but the truncation is
  visible to the viewer so it doesn't read as silently-wrong data.
- What happens when no scenario is loaded at all yet (a fresh session,
  before the viewer picks any scenario)? → Same empty state as any other
  data-bound panel queried with nothing registered.
- What happens when a column's inferred type is wrong for the viewer's
  actual analytical intent (e.g., a numeric zone-ID column auto-inferred
  as `quantitative`/measure when it's really a `nominal` label)? → A
  dashboard author can override the auto-inferred field list for that one
  panel via an optional `fields:` config key; most panels are expected to
  need no override.
- What happens on repeated open/close of the expand dialog, or a basemap-
  style/theme change elsewhere in the app while an Explore panel is
  mounted? → The panel is unaffected — it holds no map/WebGL resources
  and does not participate in the theme-driven basemap re-styling that
  only applies to `flowmap`/`zonemap` panels.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a `graphic-walker` panel type,
  registered in the same panel type-to-component registry every other
  panel type is registered in, requiring no per-type wiring in the
  dashboard shell/layout/expand-dialog mechanism.
- **FR-002**: A `graphic-walker` panel MUST let the viewer freely choose
  fields, encodings, and a chart type at view time, entirely client-side,
  with no dashboard YAML change required to produce a specific chart.
- **FR-003**: A `graphic-walker` panel's config MUST accept `dataset:`
  (which view to query), `limit:` (row cap, default 100000), `height:`
  (default 700), and `width:` (row-fraction, following this project's
  existing panel-width convention) — matching `docs/GRAMMAR.md`'s already-
  documented config surface for this type.
- **FR-004**: A `graphic-walker` panel's config MAY optionally include
  `scenario:` to pin the panel to one specific loaded scenario's view;
  when omitted, the system MUST fall back to this project's existing
  multi-scenario union mechanism (the same one every other panel type
  already uses when its own `scenario:` is omitted), adding a `scenario`
  discriminator field the viewer can use like any other field.
- **FR-005**: The system MUST query the configured dataset exactly once,
  at panel mount, and MUST NOT re-query on global sidebar filter changes —
  matching the snapshot model already documented for this panel type.
- **FR-006**: The system MUST derive each queried column's field
  definition (semantic type: quantitative/nominal/ordinal/temporal;
  analytic type: dimension/measure) automatically from its underlying
  column type, so a dashboard author is not required to hand-author a
  field-type definition for every column of a dataset to use this panel
  type.
- **FR-007**: A `graphic-walker` panel's config MAY optionally include a
  `fields:` list to override the automatically-derived field definitions
  for specific columns, for the cases where automatic inference guesses
  wrong.
- **FR-008**: A `graphic-walker` panel MUST render inside this project's
  existing panel-card chrome (title, error/empty states, expand trigger) —
  the same wrapper every other panel type renders inside — and MUST
  inherit the existing expand-to-dialog mechanism automatically, with no
  panel-type-specific dialog logic.
- **FR-009**: When the configured dataset/scenario cannot be resolved to a
  registered view, the system MUST show the existing shared error state;
  when the query succeeds but returns zero rows, the system MUST show the
  existing shared empty state — both matching every other data-bound panel
  type's own behavior, not a new state unique to this type.
- **FR-010**: The system MUST support more than one `graphic-walker` panel
  in a single dashboard (each independently configured), with no shared
  state leaking between separate panel instances.
- **FR-011**: A `graphic-walker` panel's own viewer-built chart state
  (fields/encodings/mark selections) MUST NOT be persisted anywhere or
  shared with other viewers — it exists only in that viewer's own browser
  session for that panel instance, consistent with the "snapshot,
  exploratory sandbox" framing already documented for this feature.

### Key Entities

- **Explore Dataset Binding**: The author-configured `dataset`/`scenario`/
  `limit` on one `graphic-walker` panel — resolves to exactly one query
  run once at mount.
- **Inferred Field Schema**: The `fid`/`name`/`semanticType`/`analyticType`
  list derived from the queried columns (with any author-supplied `fields:`
  overrides applied), handed to the exploration UI alongside the row data.
- **Viewer-Built Chart**: The ephemeral, in-browser-only chart
  configuration (fields, shelves, mark type) a viewer assembles while
  using one panel instance — never written back to any config file, never
  shared across viewers or sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer can go from an empty Explore panel to a rendered
  chart of their own choosing (picked fields + chart type) in under 30
  seconds, with zero YAML edits or code changes.
- **SC-002**: An analyst can retarget an Explore panel at a different
  existing dataset by changing exactly one configuration value, with no
  source-code change — matching the configuration-only extensibility every
  other panel type already offers.
- **SC-003**: Opening a dashboard tab containing one Explore panel bound to
  a typical scenario summary table (on the order of tens of thousands of
  rows) shows the panel's interactive field list and chart canvas without
  a noticeably longer wait than this dashboard's other data-bound panel
  types loading a comparably-sized table.
- **SC-004**: An Explore panel looks and behaves consistently with every
  other panel type in the dashboard (same card chrome, same expand
  affordance, same error/empty states) — a viewer who already knows how to
  use any other panel needs no separate instructions for this one.
- **SC-005**: All eight previously-shipped panel types continue to render
  exactly as before after this feature ships — this closes out the last
  originally-listed panel type with zero regressions to the existing set.

## Assumptions

- **Package version pin**: This feature pins to `@kanaries/graphic-walker
  ^0.4.82` — confirmed directly against the npm registry to be the *last*
  release with a React-18-compatible peer dependency range
  (`>=17.0.0 <19.0.0`; `0.4.83` and the current `0.5.x` line require React
  19) — rather than an earlier point release in that same compatible
  range: `0.4.80` was considered first, but a direct diff against the
  package's own GitHub history showed `0.4.80` is missing two named bug
  fixes ("fix: arc", "fix: text stack") that landed by `0.4.82` with no
  React-compatibility cost, so `0.4.82` is the strictly better pin.
  Upgrading the whole application's React major version to clear the
  `0.5.x` ceiling is out of scope for a single panel-type feature; this
  can be revisited if/when this project itself moves to React 19.
- **No new fixture data format needed**: Unlike `013-zonemap-panel` (which
  needed this project's first-ever GeoParquet fixture), this feature needs
  no new fixture format — any existing tabular scenario Parquet/view
  already used by other panel types is sufficient to exercise it.
- **Scenario binding reuses existing mechanism**: Rather than inventing a
  new viewer-facing scenario picker, an Explore panel with no `scenario:`
  configured reuses this project's already-existing multi-scenario UNION
  ALL expansion (the same one `plotly`/`table`/etc. panels already use),
  giving the viewer a `scenario` field to facet/color/filter by themselves
  inside the free-form builder — no new UI chrome required.
- **Field-type inference lives in this app's own code, not the library**:
  The `@kanaries/graphic-walker` package's own `fields` prop is required
  input, not something it infers on an empty array; this project's own
  code (not the library) is responsible for deriving a reasonable default
  field schema from DuckDB's own column type information before handing
  data to the library.
- **Out of scope: authoring the actual Explore tab template.** This
  feature adds the `graphic-walker` panel type to the registry so any
  `dashboard-*.yaml` author can use `type: graphic-walker` — matching
  every prior panel-type feature's own stopping point (005 through 013 all
  stopped at "add to registry," none scaffolded a new default dashboard
  template). Actually authoring/publishing a default
  `dashboard-7-explore.yaml` template belongs to the separate, not-yet-
  started Python package/template work (CLAUDE.md's own Implementation
  order, item 12), not this feature.
- **Rendering-technology risk is believed low, not proven zero.** Vega-
  Lite's SVG/Canvas default path is the expected renderer for this
  panel's typical chart types; confirming no WebGL renderer is ever
  silently invoked for this feature's expected data volumes is a real
  verification step for implementation, the same empirical discipline
  `012-webgl-context-management` already established for map panels, not
  something to take fully on faith from package research alone.
- **Expand-to-dialog resize behavior needs empirical confirmation.** The
  existing expand-to-dialog mechanism is generic and panel-type-agnostic
  by design, and this panel type is expected to inherit it with no new
  wiring; whether the third-party exploration UI itself resizes/reflows
  cleanly when its container is relocated into the dialog (rather than
  simply inheriting the mechanism's existing state-preservation guarantee)
  is a real thing to verify empirically during implementation, not assumed
  from the library's own documentation.
- **The `0.4.82` pin's own known-bug history was checked, not just
  whether it installs.** Before committing to `0.4.82` over the current
  `0.5.x` line, its GitHub release history and a direct
  `v0.4.80...v0.4.82` diff were checked for materially broken behavior,
  not only React-version compatibility — this surfaced the two named bug
  fixes cited above and is why the pin is `0.4.82`, not the first
  React-18-compatible point release found. What was *not* fully
  achievable from research alone: a complete `0.5.x`-line changelog was
  not retrievable, so an exhaustive "what does `0.4.82` lack relative to
  current `0.5.x` beyond the React 19 peer bump" comparison remains open.
  Implementation should treat this the same way as the other two
  empirical-verification items above — confirm no chart type or
  interaction this feature actually needs is missing or broken in
  `0.4.82` while building against it, rather than assuming version
  research alone settled the question.
