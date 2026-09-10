# Phase 0 Research: Expand Real ActivitySim Demo Content to All Ten Panel Types

## §1. Geometry download mechanism — direct FeatureServer query, not a shapefile download

**Decision**: The one-time geometry script issues a single HTTP GET
against MTC's real FeatureServer's query endpoint:

```
https://services3.arcgis.com/i2dkYWmb4wHvYPda/arcgis/rest/services/Travel_Analysis_Zones/FeatureServer/0/query
  ?where=TAZ1454+IN+(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25)
  &outFields=TAZ1454,SUPERD
  &outSR=4326
  &f=geojson
```

returning one real GeoJSON `FeatureCollection` with exactly 25 polygon
features, already in WGS84 (`outSR=4326` requested explicitly — this
session's own earlier ad hoc queries already returned WGS84 by default,
but pinning it explicitly makes the script's own behavior independent of
that default ever changing).

**Rationale**: this exact query shape was already used and confirmed
working, repeatedly, earlier this session (single zones, then a 3-zone
`IN` filter) — a proven, reproducible mechanism, not a new approach being
proposed untested. It also avoids two real downsides of the shapefile-
download alternative: (a) a full TAZ1454 shapefile is a ~1454-feature
file the script would need to download, unzip, and filter locally for a
result 25 features simpler to just ask the server for directly; (b) a
shapefile requires reprojection (MTC's real service defaults to NAD83
UTM Zone 10N, confirmed this session via the FeatureServer's own
`spatialReference: {wkid: 26910}` — the flowmap/zonemap grammar both need
WGS84 lon/lat) — the direct GeoJSON query sidesteps this by requesting
`outSR=4326` server-side, one real HTTP call producing exactly the target
format.

**Alternatives considered**: Download the full public TAZ1454 shapefile/
GeoJSON and filter locally with DuckDB spatial. Rejected — strictly more
steps (download, unzip, reproject, filter) for an identical real result,
with no reliability advantage; a single scoped `WHERE...IN(...)` query
against a small, known id list is not near any URL-length practical
limit (confirmed: the query above is well under 300 characters).

## §2. One-time geometry script — `scripts/build-demo-zone-geometry.py`, run once, output reviewed by hand

**Decision**: A new, standalone Python script (native DuckDB, not part of
`python/wftdm_dashboard`'s installable package or its `summarize` CLI)
performs, in order:

1. Fetch the real GeoJSON (§1).
2. `INSTALL spatial; LOAD spatial;` (native DuckDB — the SAME extension
   `panels/zoneGeometry.ts` already loads browser-side, now used offline;
   confirmed this project's own established convention, not a new
   dependency).
3. Read the fetched GeoJSON via DuckDB spatial's `ST_Read()` (native
   DuckDB has no equivalent of `duckdb-wasm#1791`'s browser-only bug —
   confirmed that bug is specific to `registerFileBuffer()`-registered
   files in the WASM build, per `zoneGeometry.ts`'s own existing comment;
   a native script reading a real local/fetched file has no such
   constraint).
4. Write `public/demo-geometry/taz25.geoparquet` — one row per zone,
   columns `(TAZ1454, geometry)` where `geometry` is `ST_AsWKB(geom)` —
   matching `tests/fixtures/generate.py::write_geoparquet()`'s own
   already-established WKB-output convention exactly, so
   `zoneGeometry.ts`'s existing `ST_GeomFromWKB(geometry)` browser-side
   read path needs zero change to consume it.
5. Compute each zone's centroid via `ST_Centroid(geom)` /
   `ST_Y`/`ST_X` and print a ready-to-paste YAML block (the real
   `sql_fragments.zone_centroids` VALUES table, data-model.md §2) to
   stdout — NOT written directly into `summarize.yaml` by the script.

**Rationale for the "print, don't auto-write" choice**: `summarize.yaml`
is this project's own authored, human-reviewed artifact throughout its
existing history (every metric in it, including this feature's own two
new ones, is hand-written and reasoned about in its own comments) —
having a script silently rewrite it would break that convention and make
a real data change look like an untracked, unreviewed diff. Printing the
real, correct data for a developer to paste in (and `git diff` review
before committing) keeps `summarize.yaml` fully human-authored while
still guaranteeing the pasted values are exactly the real, computed
result, not hand-transcribed (and therefore error-prone).

**Rationale for the script's location**: mirrors `scripts/copy-
fixtures.js`/`scripts/postinstall.js`'s existing convention (one-off repo
tooling, not part of either installable package) — and specifically NOT
`tests/fixtures/generate.py`'s location, since this script produces real,
permanent, git-tracked content, not a regenerated test fixture (the two
serve genuinely different purposes despite superficial code similarity).

**Alternatives considered**: Make this a `wftdm-dashboard` CLI subcommand.
Rejected — this step is scenario-independent and needs to run at most
once, ever, for this fixed 25-zone system; wiring it into the CLI's
per-scenario `summarize` command (or adding a new subcommand) would imply
a repeatability/generality this step doesn't have and doesn't need,
and would touch the post-processor's core CLI surface — explicitly out
of scope per spec.md's FR-014.

## §3. New metrics — both reuse already-loaded real columns, zero new sources

**`purpose_mode_flow` (Sankey, FR-006)**:

```yaml
- name: purpose_mode_flow
  description: Real trip counts by primary purpose and grouped major trip mode (Sankey source/target)
  sql: |
    SELECT
      t.primary_purpose,
      CASE t.trip_mode $mappings.major_trip_mode END AS major_trip_mode,
      COUNT(*) AS trips
    FROM trips t
    GROUP BY t.primary_purpose, major_trip_mode
```

Both `primary_purpose` and `trip_mode` are already real, already-proven
columns — `trip_purpose_share` already groups by the former,
`trip_mode_share` already applies the exact same `$mappings.
major_trip_mode` expansion to the latter. This metric is a new
cross-tabulation of two already-verified-real columns, needing no new
`sources:`/`mappings:`/`bins:` entry.

**`od_flows` (FlowMap, FR-009)** — depends on the new `zone_centroids`
fragment (§2/data-model.md §2):

```yaml
- name: od_flows
  description: Real origin-destination trip flows with real MTC zone-centroid coordinates
  sql: |
    SELECT
      t.origin      AS orig_taz,
      t.destination AS dest_taz,
      c1.lat AS orig_lat, c1.lon AS orig_lon,
      c2.lat AS dest_lat, c2.lon AS dest_lon,
      COUNT(*) AS trips
    FROM trips t
    JOIN $sql.zone_centroids c1 ON t.origin      = c1.zone_id
    JOIN $sql.zone_centroids c2 ON t.destination = c2.zone_id
    GROUP BY t.origin, t.destination, c1.lat, c1.lon, c2.lat, c2.lon
```

`$sql.zone_centroids` expands to a literal `(VALUES (1, 37.79.., -122.39..),
...) AS zc(zone_id, lat, lon)` table expression — the exact same
"a `sql_fragments` entry expands to something usable directly in a
FROM/JOIN clause" contract `trips_merged` already establishes and
`expand.py`'s existing, unmodified plain-string-substitution mechanism
already provides. No new Python code, no new grammar concept.

**`t.origin` — confirmed real during this planning pass, not left as an
open assumption**: `project-docs/GRAMMAR.md`'s own `od_flows` worked example
(pre-existing, corrected during `010-flowmap-panel` against two real
WFRC reference apps) already references `t.origin`/`t.destination`
together as ActivitySim's own standard trip-table shape; combined with
this project's own real, current `summarize.yaml` already confirming
`t.destination` is real (its `trips_merged` fragment joins on it), the
two columns are the same real ActivitySim trip-table pair, not
independently uncertain. **This MUST still be verified against the real
`final_trips.csv` header during implementation** (a five-second check,
per FR-001's own standing "confirm before writing the metric" bar) —
recorded here as a very-likely-true, not yet independently re-verified
this session, fact.

## §4. Dashboard content placement — two new tabs, three existing tabs extended

**Decision**:
- `dashboard-1-overview.yaml` (existing) gains one new row: a `recharts`
  panel and an `observable-plot` panel, each bound to the already-real
  `trip_mode_share` metric (User Story 1) — placed here because it's
  already the tab surfacing that exact metric via `plotly`.
- A new `dashboard-4-flows.yaml` tab ("Network Flows") holds the new
  `sankey` (`purpose_mode_flow`), `flowmap` (`od_flows`), and `zonemap`
  (`trips_by_destination_zone` + the new boundary geometry) panels
  together — these three are thematically related (all spatial/flow
  concepts) and share no existing tab.
- A new `dashboard-5-explore.yaml` tab holds one `graphic-walker` panel
  (bound to `trip_mode_share`, matching `project-docs/GRAMMAR.md`'s own
  established "Explore tab" framing) and one `markdown` panel with real,
  accurate prose describing the three real scenarios and what this demo
  content actually shows (User Story 1's FR-005).
- `public/demo-dashboard-config/index.json` gains the two new filenames.

**Rationale**: keeps each existing tab's own established theme intact
(Overview stays overview-shaped; Destination Choice/Transit Service stay
scoped to their own real causal stories, unchanged) rather than
overloading them with unrelated new panel types, while still reusing
every metric across the three real scenarios throughout, per FR-002.

**Alternatives considered**: Add every new panel type into the three
existing tabs. Rejected — `dashboard-2-destination-choice.yaml`/
`dashboard-3-transit-service.yaml` are each purpose-built around one
specific, already-documented real finding (`spec.md`'s own Research
Finding #7 citations) — adding unrelated panel types there would dilute
that focus for no real benefit, when two new, clearly-scoped tabs serve
the same coverage goal more legibly.

## §5. Python test coverage for the two new metrics

**Decision**: `python/tests/test_pipeline.py` gains two new cases,
following its own existing pattern exactly (a tiny real-shaped CSV
fixture in `conftest.py`'s style, run through `run_pipeline()`, the
output Parquet's rows asserted against a hand-computed expectation) —
for `purpose_mode_flow` directly, and for `od_flows` using a small,
literal `zone_centroids` fragment fixture (2-3 zones, not all 25) so the
test stays fast and self-contained, independent of the real 25-zone data
this feature also introduces.

**Rationale**: matches this project's own established pattern for every
prior metric-adding change — `025-python-postprocessor`'s own test suite
already covers `$sql.x` fragment expansion generically; these two new
metrics need coverage of their own SQL correctness, not the underlying
mechanism (already covered).
