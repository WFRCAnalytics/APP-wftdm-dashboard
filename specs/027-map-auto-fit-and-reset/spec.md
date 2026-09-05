# Feature Specification: Auto-fit map view to data extent, plus a reset-to-view button

**Feature Branch**: `027-map-auto-fit-and-reset`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Auto-fit map view to data extent, plus a reset-to-view button — neither FlowMapPanel.tsx nor ZoneMapPanel.tsx currently fit their initial camera view to the actual rendered data's bounding box (confirmed by direct code check); both resolve a static center/zoom at Map construction time regardless of what data loads afterward. Compute the initial view from the real loaded data instead — flow data's own origin/destination coordinates for flowmap, the zone geometry cache's real extent for zonemap — but only when the panel author has not explicitly configured a center/zoom; an explicit author config must still win outright. Add a reset-to-view control, in the same control cluster as the existing navigation/3D-toggle controls, that returns the map to its current effective view."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A flowmap panel opens already framed on its own data (Priority: P1)

A dashboard viewer opens a tab containing a flow-map panel (e.g. work-tour
flows into a zone of interest) that has no author-configured center/zoom.
Today the map opens centered on a fixed regional default, and the viewer must
manually pan/zoom to find where the actual flows are before the panel is
useful at all. Instead, the map should open already framed to show every flow
point the panel is displaying.

**Why this priority**: This is the core, most common case — most flowmap
panels in this project's real dashboards do not author an explicit
center/zoom, so this single change fixes the "opens on an empty patch of the
Wasatch Front" problem for the majority of existing and future flowmap
panels.

**Independent Test**: Load a dashboard tab with a flowmap panel whose config
has no `center`/`zoom` and whose query returns real flow rows scattered
across a known geographic area; confirm the map's initial view visibly
contains every flow's origin and destination, with no manual interaction
required.

**Acceptance Scenarios**:

1. **Given** a flowmap panel with no `center`/`zoom` configured, **When** its
   data finishes loading and contains flows spanning a real geographic area,
   **Then** the map's initial view frames that area so every flow's origin
   and destination point is visible without panning or zooming.
2. **Given** a flowmap panel whose query returns zero rows (empty result),
   **When** the panel reaches its empty state, **Then** the map falls back to
   today's existing static default view (no crash, no attempt to fit an
   empty extent).
3. **Given** a flowmap panel whose only rows collapse to a single shared
   point (e.g. every flow's origin and destination coordinate is identical),
   **When** auto-fit runs, **Then** the map centers on that point at a
   reasonable, bounded zoom level — never an extreme or invalid zoom.

---

### User Story 2 - A zonemap panel opens already framed on its zone geometry (Priority: P1)

A dashboard viewer opens a tab containing a choropleth zone-map panel (e.g.
mode share by zone) that has no author-configured center/zoom. Today the map
opens centered on the same fixed regional default regardless of where the
panel's actual zone boundaries are. Instead, the map should open already
framed to the real extent of the zone geometry it renders.

**Why this priority**: Equally foundational to User Story 1 — zonemap panels
have the identical "opens on a fixed default, unrelated to the real content"
problem today, just sourced from geometry rather than point data.

**Independent Test**: Load a dashboard tab with a zonemap panel whose config
has no `center`/`zoom`, referencing a real `boundaries` geometry file covering
a known area; confirm the map's initial view visibly contains the full zone
boundary extent, with no manual interaction required.

**Acceptance Scenarios**:

1. **Given** a zonemap panel with no `center`/`zoom` configured, **When** its
   zone geometry finishes loading, **Then** the map's initial view frames the
   full extent of that geometry's boundaries, regardless of which zones
   currently have matching metric data.
2. **Given** a zonemap panel whose geometry fails to load or resolves to zero
   features, **When** the panel reaches its error/empty state, **Then** the
   map falls back to today's existing static default view.

---

### User Story 3 - An author's explicit view configuration is always respected (Priority: P2)

A dashboard author deliberately sets `center`/`zoom` on a map panel (for
example, to keep a panel zoomed to a specific sub-area regardless of the
data's full extent). That deliberate choice must never be silently overridden
by the new auto-fit behavior.

**Why this priority**: Protects every existing dashboard's authored intent —
this must hold before auto-fit ships to any panel that already has an
explicit view configured, but it's secondary to actually building the
auto-fit behavior itself (User Stories 1–2).

**Independent Test**: Load a flowmap or zonemap panel with an explicit
`center`/`zoom` configured, whose real data extent is visibly different from
that configured view; confirm the map opens at the author's exact configured
view, not the data's extent.

**Acceptance Scenarios**:

1. **Given** a map panel (flowmap or zonemap) with an explicit `center` and
   `zoom` configured, **When** its data loads, **Then** the map's initial
   view is exactly the configured `center`/`zoom` — auto-fit does not run at
   all.

---

### User Story 4 - A viewer can snap back to the panel's starting view (Priority: P3)

A viewer has panned and zoomed around a map panel while exploring it and
wants to quickly return to where the panel started — its author-configured
view if one was set, or its auto-fitted data extent otherwise — without
reloading the whole dashboard.

**Why this priority**: A genuinely useful convenience once the view Users 1–3
establish exists, but it depends on that view already being well-defined —
it's the smallest, last piece.

**Independent Test**: Open a map panel, manually pan/zoom away from its
initial view, then activate the new reset control; confirm the map smoothly
returns to exactly its original effective view (auto-fitted or authored).

**Acceptance Scenarios**:

1. **Given** a map panel whose initial view was computed via auto-fit,
   **When** a viewer pans/zooms away and then activates the reset control,
   **Then** the map smoothly transitions back to that same originally-fitted
   view.
2. **Given** a map panel with an explicit authored `center`/`zoom`, **When**
   a viewer pans/zooms away and then activates the reset control, **Then**
   the map smoothly transitions back to the authored `center`/`zoom`.
3. **Given** a map panel whose data hasn't finished loading yet (no effective
   view has been established), **When** a viewer looks for the reset control,
   **Then** the control does not perform a broken/no-op reset — either it is
   not yet interactive, or it becomes available the moment a real effective
   view exists.

---

### Edge Cases

- A flowmap panel's rows all get excluded by existing data-quality filtering
  (missing coordinates, non-positive values) — auto-fit must treat this the
  same as "no data" and fall back to the static default, not fit an empty
  point set.
- A zonemap panel's metric rows have no matching zone geometry at all for any
  row (a `metric_id`/`boundaries_id` mismatch) — auto-fit still uses the
  geometry's own extent (it never depends on the metric rows matching), so
  this must not block or degrade the fit.
- A panel is opened already collapsed to a very small or zero on-screen size
  (e.g. still animating into its expanded dialog) at the moment its data
  finishes loading — the computed fit must still be geographically correct
  once the panel reaches its real, laid-out size, not distorted by a
  transient zero-size container.
- A single-zone or single-point dataset produces a degenerate (zero-area)
  bounding box — must resolve to a sensible bounded zoom level, not an
  extreme zoom-in or a MapLibre error.
- A viewer expands a panel into its 004 dialog view or collapses it back —
  this relocates the map's container in the DOM but does not reload data or
  geometry, so it must never re-trigger a fresh auto-fit or discard a
  viewer's manual pan/zoom.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A flowmap panel with no author-configured `center`/`zoom` MUST,
  once its flow data has genuinely finished loading with at least one
  displayable flow, compute its initial map view from the real bounding box
  of every flow's origin and destination coordinate.
- **FR-002**: A zonemap panel with no author-configured `center`/`zoom` MUST,
  once its zone boundary geometry has genuinely finished loading with at
  least one feature, compute its initial map view from the real bounding box
  of that geometry — independent of which zones currently have matching
  metric data.
- **FR-003**: A map panel (flowmap or zonemap) with an author-configured
  `center`/`zoom` MUST use exactly that configured view; auto-fit MUST NOT
  run at all for such a panel. `center` and `zoom` are treated as a single
  unit for this purpose — if the author has set *either one*, auto-fit is
  fully disabled for that panel (the still-unset one keeps falling back to
  today's existing static default, exactly as it does now); auto-fit only
  ever runs when *both* are absent.
- **FR-004**: When a map panel has no displayable data yet (still loading,
  empty result, or a geometry/query error), the map MUST show today's
  existing static default view rather than attempting to fit against no
  data.
- **FR-005**: A degenerate data extent (all points/geometry collapsing to a
  single location) MUST resolve to a sensible, bounded zoom level — never an
  extreme zoom or a failed fit.
- **FR-006**: Auto-fit MUST run at most once per panel mount, on that
  panel's first successful data (flowmap) or geometry (zonemap) load. It
  MUST NOT re-run for any reason afterward — not because the panel
  re-renders, not because an unrelated map-level change occurs (e.g. a
  basemap switch or a WebGL context recovery), not because the panel is
  relocated between its inline and expanded-dialog positions (004's
  expand/collapse mechanism), and not because a later genuine data change
  occurs (e.g. the viewer changes a filter or switches the active scenario,
  producing a materially different flow/zone dataset). Once a panel's
  effective view is established — whether by auto-fit or by the viewer's
  own subsequent manual panning/zooming — it is never overridden again
  until the panel unmounts and remounts.
- **FR-007**: Every map panel (flowmap and zonemap) MUST offer a
  reset-to-view control, presented alongside its existing navigation/3D
  controls, that returns the map to its current effective view — the
  author-configured `center`/`zoom` if one exists, otherwise the view that
  was actually computed by auto-fit for that panel.
- **FR-008**: Activating the reset-to-view control MUST produce a smooth
  camera transition back to that effective view, not an instant jump.
- **FR-009**: The reset-to-view control MUST NOT produce a broken or
  incorrect reset before a panel's effective view has actually been
  established (i.e. before data/geometry has loaded for a panel with no
  authored view).

### Key Entities

- **Effective view**: The center/zoom (or fitted bounds) a map panel is
  actually anchored to at a given moment — either the author's explicit
  configuration, or the view computed by auto-fit from real loaded data.
  Exactly one of these two sources is active per panel at a time; which one
  is active never changes for the life of that panel's mount.
- **Flow extent**: The real geographic bounding box covering every flow's
  origin and destination coordinate that a flowmap panel is currently
  displaying.
- **Zone geometry extent**: The real geographic bounding box covering every
  polygon in a zonemap panel's loaded boundary geometry, independent of
  which zones have matching metric values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer opening any flowmap or zonemap panel that has no
  author-configured view sees all of that panel's real data on screen
  immediately, with zero manual pan/zoom actions needed to find it.
- **SC-002**: Every existing map panel that already has an author-configured
  `center`/`zoom` opens at exactly that view, unchanged from today's
  behavior, in 100% of cases.
- **SC-003**: A viewer who has panned/zoomed away from a panel's starting
  view can return to it in one action (activating the reset control), taking
  under 2 seconds including the transition.
- **SC-004**: Expanding or collapsing a map panel (004's dialog mechanism)
  never changes or resets a viewer's current camera position — verified
  across both auto-fitted and author-configured panels.

## Assumptions

- The precedent this feature follows for "an explicit, more specific value
  always beats a computed default" is this codebase's existing basemap
  panel-precedence pattern (`resolveEffectiveBasemap.ts`) — cited here as the
  *general shape* to match (explicit config always wins outright over a
  fallback), not as a literal instruction to add tab-level/global-level
  center/zoom tiers. No such tiers exist today for `center`/`zoom` (only a
  single panel-level config value), and none are assumed to be in scope for
  this feature.
- Real research this session confirmed (against the installed
  `maplibre-gl@4.7.1` package directly, not from memory) that `Map#fitBounds
  (bounds: LngLatBoundsLike, options?: FitBoundsOptions)` is a real, current
  API — `FitBoundsOptions` (extending `FlyToOptions`) supports `padding`
  (uniform or per-edge), `maxZoom`, `linear` (easeTo vs. flyTo transition),
  and `offset`. A `LngLatBounds` can be built directly from two corner
  coordinates or incrementally via `.extend()`. This feature will apply some
  reasonable, non-zero `padding` so fitted content isn't rendered flush
  against a panel's edges, and a `maxZoom` cap to satisfy the degenerate
  single-point/single-zone edge case (FR-005) — the exact numeric values are
  an implementation-time (`/speckit-plan`) decision, not fixed here.
- Real code confirmed this session (direct read of `FlowMapPanel.tsx` and
  `ZoneMapPanel.tsx`) that both panels already carry a `mapReady` gate and a
  reference-identity-based guard pattern (`warnedForRowsRef` in
  `FlowMapPanel.tsx`) for exactly the "run something once per genuine data
  change, not per re-render" problem this feature needs solved for auto-fit
  timing — this is the established precedent implementation should extend,
  not a new mechanism to invent from scratch.
- **Single feature, not a split**: this session's own required research
  (direct code read of both panels, plus the `zoneGeometry.ts` cache and
  `flowmapData.ts` transform) found the two panel types' bounds *sources*
  are genuinely different (flow point data vs. a geometry cache) and their
  natural re-fit *triggers* are correspondingly different (metric rows vs.
  geometry, which reloads far less often) — but this is the same kind of
  type-specific variation on one shared requirement that every prior
  feature spanning both map panel types in this project already handles as
  ONE feature with per-type branches (basemap style application, WebGL
  context handling, navigation controls) — not a reason to split this into
  two separate specs. Recommendation: proceed as a single feature.
- The reset-to-view control follows the same custom `IControl`
  implementation pattern already established by `ZoneMapPanel.tsx`'s 3D
  toggle (`zonemap3dControl.ts`) — a thin, presentation-only control added
  via `map.addControl()` alongside the existing `NavigationControl`, with no
  application state of its own (implementation detail, confirmed as
  precedent here for scope purposes only, not prescribed further in this
  spec).
- Reset returns to the view that was *actually computed and applied* by
  auto-fit at load time (a stored result), not a live re-computation from
  current data at the moment reset is clicked — matching the plain reading
  of the feature request ("the newly-computed auto-fit bounds").
