# Feature Specification: Expand Real ActivitySim Demo Content to All Ten Panel Types

**Feature Branch**: `031-all-panel-demo-content`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Extend 026-activitysim-demo-content's real, already-working pipeline (summarize.yaml, the wftdm-dashboard summarize CLI, the three real scenarios — baseline/density-variant/transit-variant) to demonstrate ALL TEN panel types using exclusively real, non-fabricated data from those same three scenarios, including flowmap/zonemap, as one unified feature (no phased sequencing). Hard constraint: zero fabricated/placeholder/synthetic data anywhere — if any panel type's real-data requirement isn't achievable, stop and report rather than substitute anything invented. Geometry blocker for flowmap/zonemap is resolved via this session's own research: prototype_mtc's 25 zones are a real, unmodified, non-renumbered subset (TAZ 1-25) of MTC's actual TAZ1454 system, with real, live, licensable boundary geometry confirmed available from MTC's own open-data FeatureServer."

## Research Findings (grounding this spec)

Confirmed directly against this codebase's real, current files before
writing any requirement below — nothing here is re-derived speculation:

- **Current real panel-type coverage, confirmed by reading the real,
  current `summarize.yaml` (repo root) and all three real
  `public/demo-dashboard-config/*.yaml` files**: exactly 3 of the 10
  panel types are demonstrated today — `valuebox`, `plotly`, `table` —
  across 5 real metrics (`summary_kpis`, `trips_by_destination_zone`,
  `mode_share_by_period`, `trip_mode_share`, `trip_purpose_share`). The
  other 7 (`markdown`, `observable-plot`, `sankey`, `flowmap`, `zonemap`,
  `graphic-walker`, `recharts`) have zero real demo content anywhere in
  this repo today.
- **The post-processor's existing `sources.py`/`config.py`/`pipeline.py`
  are already fully generic and need NO new Python code for the
  Observable Plot/Recharts/Sankey/GraphicWalker/Markdown panel types** —
  confirmed by direct read: `load_source()` already handles any file
  extension generically (CSV via `read_csv_auto`, Parquet/GeoParquet via
  `read_parquet`), and `run_pipeline()`/`expand()` make no panel-type
  assumption anywhere. These five panel types are pure `dashboard-*.yaml`
  authoring work (plus one new metric for Sankey — below), not pipeline
  work.
- **`ZoneMap`'s real per-zone value data already exists — no new metric
  needed for it.** `trips_by_destination_zone` (already real, already
  computed, already keyed by `destination_zone_id`) is directly usable as
  `zonemap`'s `column:`/`metric_id:` binding once real boundary geometry
  exists — confirmed by comparing its own real schema against
  `project-docs/GRAMMAR.md`'s `type: zonemap` grammar (`metric_id:`/`column:`
  bind to exactly this shape).
- **`FlowMap` needs one new metric — a real origin/destination trip-count
  aggregation — joined to real centroid coordinates.** `project-docs/GRAMMAR.md`'s
  `type: flowmap` grammar (corrected during `010-flowmap-panel`, per its
  own documented research) reads `origin_lat`/`origin_lon`/`dest_lat`/
  `dest_lon` as plain columns already present on each metric row — no
  live geometry join in the browser, ever. The real `trips`/`tours`
  sources already carry real `origin`/`destination` zone-id columns
  (`destination` confirmed directly — the real, current `summarize.yaml`
  already joins on `t.destination = lu.zone_id`; `origin`'s presence is
  ActivitySim's own standard trip-table shape, per `project-docs/GRAMMAR.md`'s
  existing `od_flows` worked example referencing `t.origin`, but MUST be
  re-confirmed directly against the real `final_trips.csv` schema during
  planning, not assumed final here).
- **`Sankey` needs one new, real, well-justified metric** — a
  `primary_purpose` × grouped `major_trip_mode` real trip-count
  aggregation. `primary_purpose` and `trip_mode` are both already real,
  already-used columns (the existing `trip_purpose_share`/
  `trip_mode_share` metrics each use one of them) — this is a new
  cross-tabulation of two already-proven-real columns, not a new data
  requirement.
- **Real, live MTC TAZ1454 geometry — confirmed reachable and
  correspondence-verified this session, not a guess**: MTC's own official
  open-data FeatureServer
  (`https://services3.arcgis.com/i2dkYWmb4wHvYPda/arcgis/rest/services/
  Travel_Analysis_Zones/FeatureServer`) returns real polygon geometry for
  `TAZ1454 IN (1..25)` on request. Cross-referenced directly against the
  real `summarize.yaml`'s own `land_use.csv`-derived `SD` values for
  multiple sampled zones (TAZ 1, 6, 16, 25 — all `SD`/`SUPERD` = 1,
  matching exactly) and against real-world geography (TAZ 1's real
  coordinates, ~(-122.398, 37.792), land squarely in San Francisco's
  Financial District — consistent with `land_use.csv`'s own real,
  extreme employment-vs-population signature for that zone: 27,318 jobs,
  82 residents). License: the dataset's real, full `licenseInfo` (fetched
  directly from the ArcGIS item's own JSON, not summarized secondhand) is
  a liability/accuracy disclaimer only ("provided as-is... for planning
  purposes... no warranty"), `access: "public"`, with no stated
  redistribution restriction — reinforced by ActivitySim's own
  BSD-3-Clause example package already redistributing MTC-derived
  attribute data for these same 25 zones.
- **A real, confirmed gap in `panels/zoneGeometry.ts`'s current path
  resolution — not previously scoped, found this session**: it hardcodes
  its fetch URL to `${BASE_URL}geometry/${boundaries}` (`public/geometry/`
  only) — confirmed by direct read. `public/geometry/` is one of this
  project's gitignored, fixture-only, destructively-managed paths
  (`tests/fixtures/generate.py`'s own `for stale in ("observed",
  "scenarios", "geometry")` list; `scripts/copy-fixtures.js` overwrites it
  on every `npm run dev:fixtures` run) — publishing real, permanent demo
  geometry there would be silently destroyed the next time anyone runs
  the existing fixture-copy workflow. `026-activitysim-demo-content`
  already solved the identical class of problem for scenarios/dashboards
  by inventing a new, separate, git-tracked root
  (`public/demo-scenarios/`/`public/demo-dashboard-config/`) rather than
  reusing the gitignored fixture path — this feature needs the same
  treatment for geometry (`public/demo-geometry/`), which requires one
  small, additive change to `zoneGeometry.ts`'s path resolution (a new
  base-path parameter, mirroring `loadDashboards()`'s own already-proven
  `baseUrl` parameter pattern from `026`) — a browser-side content-loading
  change, not a change to "025's core post-processor engine" (explicitly
  out of scope per the input), and not a change to the post-processor
  pipeline either.
- **One real, concrete pipeline-design simplification found by reading
  `sources.py`/`pipeline.py` directly**: `load_source()` already handles
  any `.parquet`/`.geoparquet`/CSV file generically — a real TAZ 1-25
  centroid lookup could be added as an ordinary new `sources:` entry with
  zero new Python code. An even simpler alternative exists and is
  preferred: 25 rows of `(zone_id, lat, lon)` is small enough to embed
  directly as literal SQL `VALUES` inside a new `sql_fragments:` entry in
  `summarize.yaml` itself — no new file, no new source-path dependency,
  keeping the real coordinate data inspectable in the one file a modeler
  already reads, matching this project's own established preference for
  self-contained, readable `summarize.yaml` content over scattered
  sidecar files.
- **Centroids MUST be derived from the same real boundary polygons, not
  independently sourced or approximated** — MTC's FeatureServer exposes
  polygon geometry only, no separate centroid attribute. A zone's
  centroid is a well-defined, deterministic mathematical property of its
  own real boundary (e.g. via a spatial `ST_Centroid()`-equivalent
  computation), computed once from the SAME real polygon data the
  ZoneMap boundary file itself is built from — guaranteeing the two
  never disagree, and guaranteeing neither is a separately-invented
  value.

## User Scenarios & Testing *(mandatory)*

**All four user stories below are marked P1, deliberately, not
differentiated by priority** — per the input's own explicit instruction,
this is one unified feature with no phased/sequenced rollout between
"easy" and "geometry-dependent" panel types. Each is independently
testable and independently deliverable (a real technical property, not a
sequencing decision) — the priority tie is a deliberate statement that
none is more expendable than another, not an oversight.

### User Story 1 - See real data in every panel type that needs no new metric or geometry (Priority: P1)

A calibration analyst browsing the ActivitySim demo content sees
Observable Plot, Recharts, and Graphic Walker panels rendering real trip/
mode data from the three real scenarios, and a Markdown panel providing
real, accurate context about what the demo content actually shows — with
zero new `summarize.yaml` metrics required.

**Why this priority**: The lowest-risk, most directly achievable slice —
confirmed by this session's own direct read of the post-processor's
already-generic pipeline code, needing no new data engineering at all.

**Independent Test**: Load the demo scenarios; confirm an Observable
Plot panel, a Recharts panel, and a Graphic Walker panel each render real,
non-empty, non-fabricated series from an existing real metric
(`trip_mode_share` or `mode_share_by_period`), and a Markdown panel
renders real, accurate prose about the three real scenarios.

**Acceptance Scenarios**:

1. **Given** the demo scenarios are loaded, **When** an analyst views a
   new Observable Plot panel bound to an existing real metric, **Then**
   it renders the same real, non-zero values already proven correct by
   the existing Plotly panel using that same metric.
2. **Given** the same real metric, **When** an analyst views a new
   Recharts panel bound to it, **Then** it renders the same real values,
   confirming this is a rendering-engine choice, not a second data
   source.
3. **Given** a Graphic Walker panel pointed at a real, existing metric,
   **When** an analyst opens it, **Then** every field/value available to
   drag onto a shelf is real ActivitySim output — no synthetic column.
4. **Given** a Markdown panel describing the demo content, **When** an
   analyst reads it, **Then** every factual claim it makes (scenario
   names, what varies between them, which metrics are shown) is
   verifiably accurate against the real `summarize.yaml`/scenario
   content — no invented number or claim.

---

### User Story 2 - See a real Sankey diagram of purpose-to-mode flows (Priority: P1)

An analyst wants to see, at a glance, how trip purpose relates to travel
mode choice across the three real scenarios — e.g., whether
work-purpose trips lean more heavily on transit than shopping-purpose
trips do, using real counts.

**Why this priority**: Needs exactly one new, well-justified,
real-data-only metric — a genuine but small new piece of pipeline
authoring work, not a research/geometry dependency.

**Independent Test**: Add the new purpose-by-mode metric to
`summarize.yaml`, re-run the real `wftdm-dashboard summarize` CLI against
the three real raw scenario directories, and confirm the resulting
Sankey panel's node/flow values match a direct, independent SQL
aggregation of the same real `trips` data.

**Acceptance Scenarios**:

1. **Given** the new metric is added and the pipeline re-run against real
   raw ActivitySim output, **When** the resulting Parquet is inspected,
   **Then** every row's trip count is independently verifiable against
   the real `final_trips.csv` it was computed from.
2. **Given** the Sankey panel renders this metric, **When** an analyst
   hovers a flow, **Then** the shown value matches the real, underlying
   aggregated count exactly.

---

### User Story 3 - See real origin-destination flow lines on a map (Priority: P1)

An analyst wants to see where trips actually originate and end across
the 25-zone study area, as real desire lines on a real map — not a
schematic bar chart of zone IDs (already shown elsewhere), but an actual
spatial view.

**Why this priority**: Was the single largest previously-unresolved
blocker (real zone geometry); this session's own research resolved it
with real, verified, licensable source data — this story exists to
actually apply that finding, not re-research it.

**Independent Test**: Produce the real TAZ 1-25 centroid coordinates
(derived from the real MTC boundary geometry, per Research Findings),
add the new real origin-destination metric, and confirm every flow
line's endpoints land at the correct real geographic location for its
zone (spot-checked against the same MTC source data this session already
sampled).

**Acceptance Scenarios**:

1. **Given** the new metric and centroid data are in place, **When** the
   FlowMap panel renders, **Then** every flow line's endpoints are real
   coordinates traceable to a specific real TAZ's real, cited MTC
   geometry — never an approximated or invented coordinate.
2. **Given** a real trip's origin or destination zone ID falls outside
   1-25 (an edge case to be confirmed during planning, not assumed
   present or absent here), **When** the panel renders, **Then** that
   row is excluded with a logged warning — the panel's own existing,
   already-built exclusion/warning behavior — never silently
   substituted with a placeholder coordinate.

---

### User Story 4 - See a real zone choropleth map (Priority: P1)

An analyst wants to see a real geographic choropleth of a zone-level
metric (e.g. trips destined to each zone) across the actual 25-zone study
area's real boundaries, not just the existing bar-chart-by-zone-ID view.

**Why this priority**: Shares the same real-geometry foundation as User
Story 3 and was blocked by the identical previously-unresolved question
— now resolved identically.

**Independent Test**: Publish the real TAZ 1-25 boundary GeoParquet to a
newly-created, git-tracked demo-geometry location; confirm the ZoneMap
panel renders a real, correctly-shaped choropleth (not a placeholder
rectangle grid) using the already-real `trips_by_destination_zone`
metric.

**Acceptance Scenarios**:

1. **Given** the real boundary geometry is published, **When** the
   ZoneMap panel renders, **Then** each zone's shape is its real,
   verifiable MTC TAZ boundary — not a synthetic/approximated polygon.
2. **Given** the real `trips_by_destination_zone` metric, **When** the
   panel colors each zone, **Then** the coloring reflects real,
   already-verified trip counts — no new metric was fabricated to make
   this "work."

---

### Edge Cases

- A specific panel type's real-data requirement turns out NOT achievable
  during implementation (e.g., a real column assumed present in raw
  ActivitySim output doesn't actually exist, or a real trip's zone ID
  falls entirely outside the sourceable geometry) — per the input's own
  hard, non-negotiable constraint: implementation MUST STOP and report
  back, never substitute fabricated/placeholder/synthetic data for that
  specific panel type. This is the single most important edge case in
  this entire feature and is elevated to FR-001 below, not left as a
  passive footnote.
- MTC's real FeatureServer is unreachable at the moment the one-time
  geometry pull happens — this is a one-time, offline data-acquisition
  step (per Constitution Principle V's "all geometry conversion happens
  offline" pattern) whose OUTPUT is what gets committed to the repo; once
  captured, no runtime dependency on MTC's live service exists anywhere
  in the shipped feature. A transient fetch failure during that one-time
  step is retried/re-attempted, not treated as a reason to fall back to
  invented coordinates.
- A real trip's origin/destination zone ID isn't one of TAZ 1-25 (e.g. an
  external "gateway"/special-generator zone some ActivitySim
  configurations include beyond the modeled TAZ count) — excluded via
  the FlowMap panel's own already-existing exclusion/warning mechanism,
  not a reason to invent a coordinate for it.
- The new `sql_fragments:` centroid `VALUES` table in `summarize.yaml`
  needs updating if a future scenario ever uses a different zone system —
  out of scope for this feature (the three real scenarios all use the
  same real 25-zone `land_use.csv`, confirmed by `026`'s own existing,
  unmodified `summarize.yaml`), but worth naming so a future maintainer
  understands why the centroid data lives inline rather than being
  derived generically at run time.

## Requirements *(mandatory)*

### Functional Requirements

**Cross-cutting (governs every other requirement)**

- **FR-001**: If any specific panel type's real-data requirement is found
  during implementation not to be achievable from real ActivitySim
  output or real, cited MTC geographic data, implementation MUST stop
  for that panel type and report back — MUST NOT substitute fabricated,
  placeholder, or synthetic data for it under any circumstance. A partial
  feature (fewer than ten panel types covered) is an acceptable outcome
  of that stop; invented data is never an acceptable substitute.
- **FR-002**: Every new metric, coordinate, and geometry boundary
  introduced by this feature MUST be traceable to either (a) real
  ActivitySim output from the three existing real scenarios, or (b)
  real, cited MTC geographic data — with the specific source named
  in the metric/data's own documentation, matching this project's
  existing `summarize.yaml`/`project-docs/CALIBRATION-SUMMARIES.md` citation
  discipline.

**Panel types needing no new metric (User Story 1)**

- **FR-003**: `dashboard-*.yaml` content MUST include at least one
  `observable-plot` panel and at least one `recharts` panel, each bound
  to an existing real metric, rendering the same real values already
  proven correct by an existing panel type using that metric.
- **FR-004**: `dashboard-*.yaml` content MUST include at least one
  `graphic-walker` panel bound to an existing real metric.
- **FR-005**: `dashboard-*.yaml` content MUST include at least one
  `markdown` panel whose content is real, accurate prose about the
  actual demo scenarios/content — no invented statistic or claim.

**Sankey (User Story 2)**

- **FR-006**: `summarize.yaml` MUST gain exactly one new metric
  aggregating real trip counts by `primary_purpose` × grouped
  `major_trip_mode`, computed from the real `trips` source already
  loaded by the existing pipeline.
- **FR-007**: `dashboard-*.yaml` content MUST include a `sankey` panel
  rendering this new metric across the three real scenarios.

**FlowMap (User Story 3)**

- **FR-008**: A real TAZ 1-25 centroid lookup (zone id, latitude,
  longitude) MUST be derived from the same real MTC boundary geometry
  FR-010 sources — never independently approximated.
- **FR-009**: `summarize.yaml` MUST gain exactly one new metric
  aggregating real trip counts by origin/destination zone, with each
  row's origin/destination coordinates resolved from the FR-008 centroid
  lookup — matching `project-docs/GRAMMAR.md`'s existing `type: flowmap` grammar
  contract (plain lat/lon columns already present on the row, no live
  geometry join in the browser).
- **FR-009a**: `dashboard-*.yaml` content MUST include a `flowmap` panel
  rendering the FR-009 metric across the three real scenarios.

**ZoneMap (User Story 4)**

- **FR-010**: The real TAZ 1-25 boundary polygons MUST be sourced from
  MTC's real, cited, public FeatureServer (or an equivalent real,
  licensable MTC TAZ1454 download, whichever proves more reliable/
  reproducible for this project's offline pipeline — a planning-phase
  decision, not fixed here) and published as a real GeoParquet file to a
  new, git-tracked, scenario-independent location — never regenerated
  per scenario run, matching this project's existing "geometry
  conversion happens offline" principle.
- **FR-011**: The new geometry-publishing location MUST be reachable by
  the browser's existing `zonemap` boundary-loading mechanism without
  disturbing the existing gitignored, fixture-managed `public/geometry/`
  path — requiring a small, additive change to that mechanism's path
  resolution (a new base-path option), not a reuse of the fixture path.
- **FR-012**: `dashboard-*.yaml` content MUST include a `zonemap` panel
  using the FR-010 boundary geometry and the already-real
  `trips_by_destination_zone` metric — no new per-zone metric is
  required for this panel type.

**Non-goals, explicit**

- **FR-013**: This feature MUST NOT modify `030-sidebar-navigation`'s own
  shell/navigation work — separate branch, separate concern.
- **FR-014**: This feature MUST NOT modify the post-processor's core,
  already-generic engine logic (`config.py`/`sources.py`/`pipeline.py`/
  `expand.py`) beyond what FR-008–FR-010 require for one-time geometry
  sourcing — confirmed by this spec's own Research Findings that none of
  that engine code needs to change for any of the ten panel types.

### Key Entities

- **Purpose-Mode Flow Metric** (Sankey, FR-006): real trip counts grouped
  by `primary_purpose` and grouped `major_trip_mode` — a new named
  Parquet output, same shape as every other `summarize.yaml` metric.
- **Zone Centroid** (FlowMap, FR-008): a real `(zone_id, lat, lon)` triple
  per TAZ 1-25, derived from real MTC boundary geometry — not a
  standalone authored value.
- **Origin-Destination Flow Metric** (FlowMap, FR-009): real trip counts
  grouped by origin/destination zone id, with each row's lat/lon
  resolved via the Zone Centroid lookup.
- **Zone Boundary Geometry** (ZoneMap, FR-010): a real GeoParquet file
  containing TAZ 1-25's actual polygon boundaries, scenario-independent,
  published once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All ten panel types render at least one real, non-empty,
  non-fabricated demo panel using the three existing real scenarios — OR
  a specific, named subset does, with a plain, explicit report of which
  panel type(s) could not be completed with real data and why (FR-001).
- **SC-002**: Every new data value introduced by this feature (a metric
  row, a coordinate, a boundary vertex) is independently traceable to
  either a real ActivitySim output file or MTC's cited, real, public
  geographic data source — verifiable by a reviewer with no invented
  value anywhere.
- **SC-003**: An analyst viewing the FlowMap/ZoneMap panels sees flow
  lines/zone shapes that a person familiar with the real San Francisco
  Financial District/downtown area could recognize as geographically
  plausible — not an abstract or schematic placeholder shape.
- **SC-004**: The full existing automated test suite continues to pass
  at its pre-feature rate; the real `wftdm-dashboard summarize` CLI
  re-run against the three real raw scenario directories succeeds with
  the new metrics included.

## Assumptions

- **`origin` is a real column on ActivitySim's `final_trips.csv`,
  consistent with `project-docs/GRAMMAR.md`'s existing `od_flows` worked example
  — to be directly re-confirmed against the real file during planning,
  not assumed permanently settled by this spec.** If it turns out
  missing or differently named, FR-001's stop-and-report rule governs,
  not a silent substitution.
- **The exact mechanism for sourcing MTC's real TAZ1454 geometry (a live
  FeatureServer query filtered to `TAZ1454 IN (1..25)`, vs. downloading
  the full public shapefile/GeoJSON and filtering locally) is a
  planning-phase decision** — both were confirmed reachable this
  session; picking the more reliable/reproducible one for this
  project's own offline pipeline is explicitly deferred to `/speckit-plan`
  per the input's own framing.
- **The new centroid `sql_fragments:` VALUES table and the new boundary
  GeoParquet are produced by a one-time, offline preparation step**
  (a small script or a documented manual procedure — a planning-phase
  decision), run once against MTC's real data and committed as static,
  real content — not re-run as part of the ordinary `wftdm-dashboard
  summarize` CLI invocation for each scenario, since geometry is
  scenario-independent.
- **This feature's own new git-tracked demo-geometry root follows
  `026-activitysim-demo-content`'s own already-established naming/
  structural precedent** (`public/demo-scenarios/`, `public/demo-
  dashboard-config/`) — a `public/demo-geometry/` root, real and
  permanent, never gitignored, never touched by `copy-fixtures.js`.
- **No change to WFRC's actual production `dashboard-*.yaml` authoring**
  is implied — per `CLAUDE.md`'s own authored-vs-published split, those
  files live in the separate TDM repo; this feature's own new panels are
  additive demo/example content in this repo's own `public/demo-
  dashboard-config/`, the same category `026` already established.
