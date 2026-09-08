# Phase 1 Data Model: Expand Real ActivitySim Demo Content to All Ten Panel Types

## 1. `sql_fragments.zone_centroids` — new `summarize.yaml` entry

A literal, real, 25-row VALUES table — not a file, not a `sources:`
entry (research.md §3's own reasoning for why this shape was chosen over
either alternative).

```yaml
sql_fragments:
  zone_centroids: |
    (VALUES
      (1,  37.7921, -122.3981),
      (2,  ..., ...),
      ...
      (25, ..., ...)
    ) AS zc(zone_id, lat, lon)
```

| Field | Type | Source |
|---|---|---|
| `zone_id` | integer, 1-25 | Real MTC `TAZ1454` value, unmodified |
| `lat` | float | `ST_Y(ST_Centroid(geom))` of the same real zone's real boundary polygon |
| `lon` | float | `ST_X(ST_Centroid(geom))` of the same real zone's real boundary polygon |

**Validation rule**: every `zone_id` 1-25 MUST be present exactly once —
`scripts/build-demo-zone-geometry.py`'s own real GeoJSON fetch (§1)
returns exactly 25 features by construction (the `WHERE TAZ1454 IN
(1..25)` filter), so a short count-assertion in the script itself is
sufficient; no separate validation step is needed downstream.

**Provenance requirement (FR-002)**: the comment immediately above this
block in `summarize.yaml` MUST cite the real source (MTC's Travel
Analysis Zones FeatureServer, the query in research.md §1, and the date
the values were pulled) — matching this project's own existing citation
discipline for real data (`summarize.yaml`'s own header comment already
cites `specs/026-activitysim-demo-content/research.md`).

## 2. `purpose_mode_flow` — new metric (Sankey)

| Column | Type | Meaning |
|---|---|---|
| `primary_purpose` | string | Real ActivitySim trip purpose (already-proven-real column) |
| `major_trip_mode` | string | Grouped mode category via the existing, real `$mappings.major_trip_mode` |
| `trips` | integer | Real trip count for this purpose × mode combination |

**Relationships**: consumed by a `sankey` panel's `source: primary_purpose`
/ `target: major_trip_mode` / `value: trips` (matching `docs/GRAMMAR.md`'s
existing `type: sankey` grammar exactly — no new panel-config field).

**Validation rule**: `SUM(trips)` across every row MUST equal the real
total trip count for the scenario it was computed from (a direct,
independently-checkable identity — no trip is double-counted or dropped,
since the `GROUP BY` is a full partition of `trips` with no `WHERE`
clause).

## 3. `od_flows` — new metric (FlowMap)

| Column | Type | Meaning |
|---|---|---|
| `orig_taz` | integer, 1-25 | Real trip origin zone id |
| `dest_taz` | integer, 1-25 | Real trip destination zone id |
| `orig_lat`/`orig_lon` | float | Real centroid of `orig_taz`, from `zone_centroids` |
| `dest_lat`/`dest_lon` | float | Real centroid of `dest_taz`, from `zone_centroids` |
| `trips` | integer | Real trip count for this origin-destination pair |

**Relationships**: consumed by a `flowmap` panel — `origin: orig_taz`,
`origin_lat: orig_lat`, `origin_lon: orig_lon`, `destination: dest_taz`,
`dest_lat: dest_lat`, `dest_lon: dest_lon`, `value: trips` — the exact,
unmodified `type: flowmap` grammar contract (`docs/GRAMMAR.md`), plain
columns already present on the row, no browser-side geometry join.

**Validation rule**: every `orig_taz`/`dest_taz` value MUST have a
matching row in `zone_centroids` (an inner `JOIN`, per research.md §3's
own SQL) — a real trip whose origin/destination falls outside 1-25 (the
Edge Case spec.md names) is silently excluded from this metric BY THE
JOIN ITSELF, not a separate filter — worth stating explicitly since it
means `SUM(trips)` here may legitimately be LESS than the real total
trip count, unlike `purpose_mode_flow`'s full-partition identity above.
This MUST be confirmed empirically during implementation (does it
actually happen, and how many rows) — not assumed zero or assumed
nonzero.

## 4. `public/demo-geometry/taz25.geoparquet` — new geometry asset

| Column | Type | Meaning |
|---|---|---|
| `TAZ1454` | integer, 1-25 | Real MTC zone id, unmodified — this is the file's own `boundaries_id` column, referenced as such from a `zonemap` panel's `boundaries_id: TAZ1454` |
| `geometry` | WKB (binary) | Real MTC TAZ polygon boundary, `ST_AsWKB()`-encoded — matching `zoneGeometry.ts`'s existing `ST_GeomFromWKB(geometry)` read contract exactly |

**Relationships**: consumed by a `zonemap` panel via `boundaries:
taz25.geoparquet`, `boundaries_id: TAZ1454`, joined browser-side (as
every zonemap panel already does) to the ALREADY-REAL
`trips_by_destination_zone` metric via `metric_id: destination_zone_id`.
No new per-scenario metric is needed for this panel type (spec.md's own
Research Findings, restated here as the entity relationship it implies).

**Scenario independence**: this file is published exactly once, shared
identically across all three real scenarios — the same
`boundaries`-is-scenario-independent contract every existing `zonemap`
panel already relies on (`docs/GRAMMAR.md`).

## 5. `zoneGeometry.ts::resolveGeometryUrl()` — extended contract

**Current real signature** (confirmed by direct read, `src/panels/
zoneGeometry.ts`): `resolveGeometryUrl(boundaries: string): string` —
returns exactly one URL, `${BASE_URL}geometry/${boundaries}`.

**New contract**: the loading path (`loadZoneGeometry()`, this function's
own caller) tries `public/geometry/{boundaries}` first (unchanged
default — every existing fixture/production usage keeps working exactly
as today); if that fetch/query fails, it retries against
`public/demo-geometry/{boundaries}` before surfacing an error. No new
`PanelConfig` field, no new parameter threaded through
`dashboardRenderer.tsx`/`ZoneMapPanel.tsx` — the fallback is entirely
internal to this one module, matching its own existing "resolve once,
cache" encapsulation.

**Validation rule**: the existing per-`(boundaries, boundariesId)` cache
(`zoneGeometry.ts`'s own `cache` Map) MUST still key on exactly those two
values, unchanged — the fallback affects WHICH URL is fetched under the
hood, never the cache key or the shape of what's returned to a caller.

## Summary of real, new artifacts this feature produces

| Artifact | Kind | Produced by |
|---|---|---|
| `sql_fragments.zone_centroids` | `summarize.yaml` content | Pasted by hand from `scripts/build-demo-zone-geometry.py`'s own stdout |
| `metrics: purpose_mode_flow` | `summarize.yaml` content | Hand-authored (no script needed — pure SQL over already-loaded columns) |
| `metrics: od_flows` | `summarize.yaml` content | Hand-authored, referencing `$sql.zone_centroids` |
| `public/demo-geometry/taz25.geoparquet` | Git-tracked binary asset | `scripts/build-demo-zone-geometry.py`, run once |
| `public/demo-dashboard-config/dashboard-4-flows.yaml` | New tab | Hand-authored |
| `public/demo-dashboard-config/dashboard-5-explore.yaml` | New tab | Hand-authored |
| `dashboard-1-overview.yaml`'s new row | Modified existing tab | Hand-authored |
