# Feature Specification: Viewer-Selectable Dataset Picker for Graphic Walker Panels

**Feature Branch**: `028-graphic-walker-dataset-picker`

**Created**: 2026-09-06

**Status**: Draft

**Input**: User description: "Viewer-selectable table/dataset picker for Graphic Walker panels — a viewer, at view time, must be able to select from any real table/view currently queryable against the loaded scenario(s), fully open, not limited to a fixed author-curated list. Selecting a different table must re-query and re-render Graphic Walker against the newly-selected dataset. Does not include: any change to other panel types' own scenario/filter reactivity models; any change to 014's original fixed-dataset mode — this is a new opt-in capability alongside the existing fixed-dataset behavior, not a replacement."

## Research Findings (grounding this spec)

Confirmed directly against this codebase before writing requirements below —
not assumed from general DuckDB/dashboard knowledge:

- `services/duckdb.ts` already tracks every view name it has ever registered,
  in-memory, via `listViews()`. That registry is populated from exactly two
  call sites (`registerScenario()`, `registerFileURL()`) — nothing else in
  this app ever creates a view — so it contains no DuckDB-internal or
  extension-internal plumbing at all. It does, however, contain one
  non-metric family: `zonemap-geom__{boundariesFile}`, registered by any
  `zonemap` panel's geometry loader. Filtering `listViews()` to names
  prefixed by a currently-**active** scenario name (from `useActiveScenarios()`)
  plus `__` cleanly excludes that family without a guessed pattern, because
  `"zonemap-geom"` is never itself a registered scenario name.
- Every real view in this app's fixture/demo/observed data decomposes
  cleanly as `{scenario}__{metric}` (e.g. `activitysim-baseline__trip_mode_share`,
  `observed__vmt_by_home_taz`, `good_scenario__od_flows`) — confirmed against
  every current fixture and the real `026-activitysim-demo-content` data.
- `GraphicWalkerPanel.tsx`'s existing query builder
  (`panelQuery.ts`'s `buildGraphicWalkerQuery()`) already has exactly this
  grammar: an author-pinned `scenario:` produces a single scenario-qualified
  view; an omitted `scenario:` produces `$scenario.<metric>` — a UNION ALL
  across every currently active scenario's own `{scenario}__<metric>` view,
  via `sqlExpander.ts`'s existing `expandScenario()`. This is the same
  bare-metric-name convention every other data-bound panel type already
  uses. This feature reuses that convention rather than inventing a
  scenario+metric compound identifier for the picker.
- `expandScenario()` requires the referenced metric view to exist for
  **every** active scenario (it UNIONs one `SELECT` per active scenario
  unconditionally) — a metric missing from even one active scenario fails
  the whole query. Every other panel type author already relies on this
  same assumption when they omit `scenario:`. This spec's picker inherits
  it rather than working around it: only a metric present across every
  active scenario is offered as selectable, so every choice the picker
  offers is guaranteed queryable.
- `GraphicWalkerPanel.tsx` already re-runs its query effect when the active
  scenario set changes (`activeScenarioNames` is already in its dependency
  array) — this is existing behavior, not new reactivity being introduced.
  It does **not** react to global sidebar filters (FR-005 of
  `014-graphic-walker-panel`, a deliberate exclusion that stays unchanged).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Explore any available dataset from one panel (Priority: P1)

A viewer looking at a dashboard's Explore tab wants to investigate a dataset
other than the one the dashboard author originally wired into that panel —
for example, comparing trip purpose shares after already looking at mode
shares — without navigating away or waiting for a developer to add a new
panel for it.

**Why this priority**: This is the entire value of the feature. Without it,
a viewer's exploration is capped at whatever single dataset an author
happened to pre-wire; this story removes that ceiling.

**Independent Test**: On a dashboard with at least one Graphic Walker panel
enabled for this capability and more than one queryable dataset available,
a viewer opens the panel, picks a dataset other than the one shown by
default, and sees Graphic Walker re-render against the new dataset's real
rows and fields.

**Acceptance Scenarios**:

1. **Given** a Graphic Walker panel enabled for dataset selection, currently
   showing its default dataset, **When** the viewer picks a different
   dataset from the picker, **Then** Graphic Walker re-queries and
   re-renders using the newly selected dataset's own data and fields.
2. **Given** a viewer has already built a chart in Graphic Walker against
   the current dataset, **When** they switch to a different dataset,
   **Then** that chart configuration is reset — the new dataset's fields
   are presented fresh, never showing a stale chart built for
   fields/values that no longer apply.
3. **Given** the viewer switches datasets, **When** the new dataset's data
   is still loading, **Then** the panel shows a clear loading state, never
   a blank panel or the previous dataset's stale content.

---

### User Story 2 - The picker only ever offers datasets that actually work (Priority: P2)

A viewer opens the dataset picker and expects every option in it to be a
real, meaningful dataset that will actually load — never an internal
plumbing artifact, and never a choice that predictably fails because it
doesn't exist for one of the scenarios currently loaded.

**Why this priority**: A picker that lists things that don't work, or that
exposes implementation detail no viewer should ever see, would undermine
trust in the whole feature — this is what keeps "fully open" from meaning
"exposes internals."

**Independent Test**: With multiple scenarios active (including one loaded
specifically for map/geometry panels) and datasets that only partially
overlap across scenarios, open the picker and confirm every listed entry is
a genuine, viewer-meaningful dataset name, and confirm no internal/
geometry-only view name ever appears.

**Acceptance Scenarios**:

1. **Given** a dashboard with an active `zonemap` panel (which registers its
   own internal geometry view), **When** a viewer opens the dataset picker
   on a Graphic Walker panel, **Then** that internal geometry view never
   appears as a selectable option.
2. **Given** two or more scenarios are currently active, and a dataset
   exists for only some of them, **When** the viewer opens the picker,
   **Then** that partially-available dataset is not offered as a choice.
3. **Given** the viewer selects any dataset the picker offers, **When** the
   selection is applied, **Then** it always successfully loads — the picker
   never offers a choice that is guaranteed to fail.

---

### User Story 3 - An author decides, per panel, whether to allow open exploration (Priority: P3)

A dashboard author building a Graphic Walker panel wants to choose, per
panel, whether the viewer gets this open dataset picker or the panel stays
pinned to exactly the one dataset the author configured — exactly as this
panel type has always worked.

**Why this priority**: Backward compatibility and authoring control. Every
Graphic Walker panel published before this feature must keep behaving
identically; this capability must be something an author turns on, not
something forced onto every existing panel.

**Independent Test**: Author two Graphic Walker panels in the same
dashboard — one with the new capability enabled, one without. Confirm the
unmodified panel shows no picker and behaves exactly as it did before this
feature existed, while the enabled panel shows the picker.

**Acceptance Scenarios**:

1. **Given** a Graphic Walker panel's configuration does not enable this
   capability, **When** the dashboard renders, **Then** the panel shows no
   dataset picker and displays only its originally configured dataset,
   identically to its pre-feature behavior.
2. **Given** a Graphic Walker panel's configuration does enable this
   capability, **When** the dashboard renders, **Then** the panel shows the
   picker alongside the embedded Graphic Walker view.

---

### Edge Cases

- What happens when no scenario is currently active at all? (In practice
  this is expected to be effectively unreachable — this app always keeps
  one scenario, "observed," active by default — but the panel must still
  degrade to a clear "nothing to explore yet" state rather than an error or
  blank output if it ever occurs.)
- What happens when the currently selected dataset stops being available
  mid-session because the scenario that provided it is deactivated
  elsewhere in the dashboard (e.g. via the Scenarios settings panel) while
  the viewer is looking at it? The panel must fall back to a clear existing
  state (e.g. its empty/error presentation) rather than continuing to show
  now-stale data or crashing.
- What happens when the currently active scenario set changes (a scenario
  is activated or deactivated) while the picker is open? The list of
  selectable datasets must reflect the new active set the next time it's
  consulted, consistent with this panel type's existing reactivity to
  scenario changes.
- What happens when two active scenarios share no dataset in common at
  all? The picker has zero options to offer; the panel must show this
  plainly rather than silently appearing broken.
- What happens when a global dashboard filter changes while a
  picker-enabled panel is showing a dataset? Nothing — this panel type's
  existing, deliberate non-reactivity to global filters is unchanged by
  this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Dashboard authors MUST be able to enable this dataset-picker
  capability on a specific Graphic Walker panel via that panel's own
  configuration, as an explicit, additive opt-in.
- **FR-002**: A Graphic Walker panel that does not enable this capability
  MUST behave exactly as it did before this feature existed — a single,
  fixed, author-configured dataset, no picker shown.
- **FR-003**: When enabled, the system MUST present the viewer with a
  control listing every dataset currently queryable and meaningful against
  the active scenario(s), and let the viewer choose one.
- **FR-004**: The system MUST exclude from that list any table or view that
  is not a genuine, viewer-meaningful dataset (e.g. internal geometry or
  other non-metric views registered for other panel types' own purposes).
- **FR-005**: The system MUST exclude from that list any dataset that is
  not available for every currently active scenario, so that every listed
  choice is guaranteed to load successfully when selected.
- **FR-006**: Dataset names MUST be presented to the viewer in the same
  plain, scenario-independent form dashboard authors already use to
  reference datasets elsewhere in this app's configuration — never an
  internal, scenario-prefixed technical identifier.
- **FR-007**: Selecting a different dataset MUST trigger a fresh query and
  re-render of the panel's embedded exploration view against the newly
  selected dataset's real, current data and fields.
- **FR-008**: Switching datasets MUST discard the viewer's in-progress
  chart configuration for the previously selected dataset — this is
  expected, correct behavior, not a defect to avoid.
- **FR-009**: This capability MUST NOT make any Graphic Walker panel
  reactive to global dashboard filters — that exclusion, established for
  this panel type, remains unchanged regardless of whether this capability
  is enabled.
- **FR-010**: The list of selectable datasets, and the currently displayed
  data, MUST stay consistent with the currently active scenario set,
  updating when scenarios are activated or deactivated elsewhere in the
  dashboard — matching this panel type's existing reactivity to scenario
  changes.
- **FR-011**: When a picker-enabled panel first renders, it MUST show a
  deterministic default dataset (the author's originally configured
  dataset when one is still provided, otherwise a deterministic choice
  from the available list) — the viewer is never shown an unexplained
  blank picker with nothing selected.
- **FR-012**: If the currently selected dataset becomes unavailable (e.g.
  its enabling scenario is deactivated), the system MUST present a clear,
  existing panel state (such as its established empty or error
  presentation) rather than continuing to display stale data.
- **FR-013**: The viewer's dataset selection is transient view-time state —
  it MUST NOT be persisted across a page reload or panel remount, matching
  this panel type's existing non-persistent, snapshot-based behavior.

### Key Entities

- **Selectable Dataset**: A viewer-facing entry in the picker — a plain
  dataset/metric name (e.g. `trip_mode_share`) that is currently backed by
  a real, queryable table or view for every active scenario. Not a stored
  record; recomputed from the app's live view registry and the current
  active-scenario set whenever the picker is consulted.
- **Picker-Enabled Panel Configuration**: The additive, opt-in setting on a
  single Graphic Walker panel's configuration that turns this capability
  on for that panel; absent by default, leaving every existing panel
  unaffected.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer can switch a picker-enabled panel to a different
  dataset and see it fully rendered, without leaving the current dashboard
  tab or reloading the page.
- **SC-002**: 100% of datasets ever listed in the picker load successfully
  when chosen — none of the options presented can predictably fail.
- **SC-003**: Zero internal or non-viewer-meaningful table/view names ever
  appear in the picker, verified across every real fixture and demo
  dashboard this app ships.
- **SC-004**: Every Graphic Walker panel published before this feature
  continues to render identically, with zero configuration changes
  required, after this feature ships.
- **SC-005**: After switching datasets, the panel never shows a chart still
  bound to the previous dataset's fields or values.

## Assumptions

- This is a new, additive, opt-in capability layered onto the existing
  Graphic Walker panel type from `014-graphic-walker-panel` — not a
  replacement of its fixed-dataset behavior. Every existing panel
  configuration continues to work unchanged.
- The set of selectable datasets is derived from this app's own existing,
  already-tracked registry of real views, filtered to those backed by a
  currently **active** scenario (not merely a registered-but-inactive one)
  and available across all of them — consistent with how every other panel
  type's own omitted-`scenario:` convention already behaves.
- Dataset names shown to the viewer are plain metric names, matching how
  dashboard authors already reference datasets throughout this app's
  configuration grammar — never a scenario-qualified or otherwise internal
  identifier.
- No new data-exposure risk is introduced: every dataset the picker can
  offer is already fully loaded, queryable, client-side data for the
  active scenario(s) — this feature only changes which already-available
  data the viewer is currently looking at, not what data reaches the
  browser.
- The viewer's dataset selection is ordinary, transient UI state — not
  persisted to a URL parameter, browser storage, or any server-side
  record. Reloading the page or switching tabs away and back resets a
  picker-enabled panel to its default dataset.
- Switching global dashboard filters continues to have no effect on any
  Graphic Walker panel, with or without this capability enabled — this
  feature does not touch that exclusion.
