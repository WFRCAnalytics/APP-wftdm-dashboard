# Phase 1 Data Model: Real ActivitySim scenario content

This feature's "data model" is the shape of five metric outputs plus the
config/discovery entities that produce and surface them — there is no
application database or new runtime entity type. Real column names are used
throughout (per research.md, confirmed against actual generated
`final_*.csv` output — never `project-docs/GRAMMAR.md`'s illustrative examples).

## Config entities

### `summarize.yaml` (authored once, repo root, never published)

| Key | Value (this feature) |
|---|---|
| `sources.trips` | `final_trips.csv` |
| `sources.tours` | `final_tours.csv` |
| `sources.persons` | `final_persons.csv` |
| `sources.households` | `final_households.csv` |
| `sources.land_use` | `final_land_use.csv` |
| `mappings.major_trip_mode` | Groups ActivitySim's real 19 `trip_mode`/`tour_mode` values (`DRIVEALONEFREE`, `WALK_LOC`, `WALK_LRF`, `WALK`, `BIKE`, `TAXI`, `TNC_SINGLE`, …) into `SOV`/`HOV`/`Transit`/`Non-Motorized`/`Ride Hail` — same category scheme `project-docs/GRAMMAR.md`'s existing worked example already uses (that example's *mapping values* are real ActivitySim mode names; only its unrelated table/column names were found non-real). |
| `bins.time_of_day_period` | `manual_breaks` on `depart`, `breaks: [0,5,9,14,18,24]`, `labels: [EA,AM,MD,PM,EV]` (research.md #2) |
| `sql_fragments.trips_merged` | `trips t JOIN land_use lu ON t.destination = lu.zone_id` (no `tours` join needed — `trips` already carries its own real `primary_purpose`/`tour_id` columns directly, confirmed against `final_trips.csv`'s real header) |
| `metrics` | 5 entries — see "Metric outputs" below |

### Scenario folder (×3, post-processor output — not hand-authored)

| Field | `activitysim-baseline` | `activitysim-density-variant` | `activitysim-transit-variant` |
|---|---|---|---|
| `manifest.yaml: scenario_name` | `activitysim-baseline` | `activitysim-density-variant` | `activitysim-transit-variant` |
| `manifest.yaml: display_name` | `ActivitySim Baseline` | `ActivitySim: TAZ 1 Density +40%` | `ActivitySim: AM/PM Transit Service ↑` |
| `manifest.yaml: engine` | `activitysim` (all three) | | |
| `manifest.yaml: notes` | *(omitted — this is the reference run)* | `TAZ 1 employment +40% (TOTEMP/RETEMPN/FPSEMPN/HEREMPN/OTHEMPN/AGREMPN/MWTEMPN)` | `AM/PM WLK_LOC_WLK_TOTIVT ×0.80, WLK_LOC_WLK_IWAIT ×0.50` |
| `manifest.yaml: pinned` | `false` (all three — none is pre-selected like `observed`; FR-006 relies on registration *order*, not `pinned`) | | |
| `summary/*.parquet` | `summary_kpis.parquet`, `trips_by_destination_zone.parquet`, `mode_share_by_period.parquet`, `trip_mode_share.parquet`, `trip_purpose_share.parquet` (identical filenames across all three — same `summarize.yaml`) | | |

### Discovery entities (new content root)

- **`public/demo-scenarios/index.json`**: `["activitysim-baseline", "activitysim-density-variant", "activitysim-transit-variant"]` — `activitysim-baseline` MUST be first (FR-006: registration order is the automatic-baseline resolution rule — `state/appState.ts`'s `getBaseline()`, unmodified by this feature, picks the earliest-registered non-pinned `ready` scenario).
- **`public/demo-dashboard-config/index.json`**: `["dashboard-1-overview.yaml", "dashboard-2-destination-choice.yaml", "dashboard-3-transit-service.yaml"]` — first entry is this new root's own landing tab, per the existing `dashboard-*.yaml` convention (constitution Principle VII), rendered by `main.tsx` concatenated after the existing `public/dashboard-config/` tabs (order between the two roots' tabs is an implementation-time layout choice, not load-bearing for any requirement).

## Metric outputs (5, satisfying FR-002 a–e)

All five are produced by the one `summarize.yaml` above, run three times (once per scenario). Column names below are the actual output schema each Parquet file will have.

### 1. `summary_kpis` — FR-002(c)

One row. Powers landing-page value boxes (User Story 4).

| Column | Type | Source |
|---|---|---|
| `total_households` | integer | `COUNT(DISTINCT household_id)` from `households` |
| `total_persons` | integer | `COUNT(DISTINCT person_id)` from `persons` |
| `total_trips` | integer | `COUNT(DISTINCT trip_id)` from `trips` |
| `total_tours` | integer | `COUNT(DISTINCT tour_id)` from `tours` |
| `avg_trip_mode_choice_logsum` | float | `AVG(mode_choice_logsum)` from `trips` (real column, confirmed present — a genuine ActivitySim behavioral-model output, used in place of a VMT figure that would need a skim-distance join `summarize.yaml`'s own `sources:` doesn't currently include; VMT is deliberately not claimed here since no distance-per-trip column exists in `final_trips.csv` directly) |
| `trips_per_household` | float | `total_trips / total_households` |

### 2. `trips_by_destination_zone` — FR-002(a), User Stories 1 & 3

One row per `(destination_zone_id, primary_purpose)`. Powers the destination-choice panel and its `$baseline` diff.

| Column | Type | Source |
|---|---|---|
| `destination_zone_id` | integer | `trips.destination` (joined to `land_use.zone_id`, research.md #3) |
| `primary_purpose` | string | `trips.primary_purpose` |
| `trips` | integer | `COUNT(*)` |
| `tours` | integer | `COUNT(DISTINCT tour_id)` |

`compare_on: [destination_zone_id, primary_purpose]` for the `$baseline` diff panel (User Story 3) — matching FR-005/the shared `comparison: diff` grammar's requirement that every bound column also appear in `compare_on`.

### 3. `mode_share_by_period` — FR-002(b), User Story 2

One row per `(time_of_day_period, trip_mode)`. Powers the transit-service panel — the metric that must reproduce the real EA/AM/MD/PM/EV boundaries exactly (research.md #2).

| Column | Type | Source |
|---|---|---|
| `time_of_day_period` | string | `$bins.time_of_day_period` on `trips.depart` |
| `trip_mode` | string | `trips.trip_mode` (real mode name, e.g. `WALK_LOC` — kept ungrouped here, unlike `trip_mode_share` below, since Story 2's whole point is the `WALK_LOC`-specific shift, which `major_trip_mode`'s `Transit` grouping would hide) |
| `trips` | integer | `COUNT(*)` |
| `share` | float | `trips / SUM(trips) OVER (PARTITION BY time_of_day_period)` |

### 4. `trip_mode_share` — FR-002(d), User Story 4

One row per `major_trip_mode` (the grouped category). Overall, not time-split.

| Column | Type | Source |
|---|---|---|
| `major_trip_mode` | string | `$mappings.major_trip_mode` on `trips.trip_mode` |
| `trips` | integer | `COUNT(*)` |
| `share` | float | `trips / SUM(trips) OVER ()` |

### 5. `trip_purpose_share` — FR-002(e), User Story 4

One row per `primary_purpose`.

| Column | Type | Source |
|---|---|---|
| `primary_purpose` | string | `trips.primary_purpose` |
| `trips` | integer | `COUNT(*)` |
| `share` | float | `trips / SUM(trips) OVER ()` |

## Dashboard panel entities (3 new `dashboard-*.yaml` files)

| File | `header.tab` | Panels | Panel types used |
|---|---|---|---|
| `dashboard-1-overview.yaml` | Overview | KPI value boxes (`summary_kpis`); overall mode share (`trip_mode_share`); trip purpose breakdown (`trip_purpose_share`) | `valuebox`, `plotly` |
| `dashboard-2-destination-choice.yaml` | Destination Choice | Side-by-side trips-by-zone chart, all 3 scenarios (`trips_by_destination_zone`); a `$baseline` diff table, `a: '$baseline'`, `b: activitysim-density-variant`, `compare_on: [destination_zone_id, primary_purpose]` (User Story 3) | `plotly`, `table` |
| `dashboard-3-transit-service.yaml` | Transit Service | `WALK_LOC`-highlighted mode share by period, baseline vs. transit-variant (`mode_share_by_period`) | `plotly` or `observable-plot` (facet by period) |

No `zonemap` panel anywhere in this set (FR-007, research Finding #5).

## Relationships

```
summarize.yaml ──(run 3×, one per raw dataset)──> 3 scenario folders (manifest.yaml + summary/*.parquet)
                                                          │
                                                          ▼
            public/demo-scenarios/index.json  ──registers──> DuckDB-WASM views
                                                          │        (activitysim-baseline__*, etc.)
                                                          ▼
public/demo-dashboard-config/*.yaml  ──queries (via $scenario/$baseline)──> panels render
```
