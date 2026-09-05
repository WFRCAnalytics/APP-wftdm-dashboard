# Contract: this feature's `summarize.yaml`

Not a new grammar — this documents how this feature instantiates the
existing `summarize.yaml` grammar (`docs/GRAMMAR.md`, `python/wftdm_dashboard/
postprocessor/config.py`/`expand.py`) against real ActivitySim columns.
Anything not listed here follows the existing grammar unchanged.

## `sources:`

```yaml
sources:
  households: final_households.csv
  persons:    final_persons.csv
  tours:      final_tours.csv
  trips:      final_trips.csv
  land_use:   final_land_use.csv
```

Each path is resolved relative to `--input` (the real per-scenario raw
ActivitySim output directory) at CLI invocation time — see
`contracts/discovery.md`'s "CLI invocations" section for the three real
`--input` values used.

## `mappings.major_trip_mode`

Real ActivitySim mode names (confirmed against `configs/tour_mode_choice.csv`/
`trip_mode_choice.csv` this session) grouped into 5 categories:

```yaml
mappings:
  major_trip_mode:
    DRIVEALONEFREE: SOV
    DRIVEALONEPAY:  SOV
    SHARED2FREE:    HOV
    SHARED2PAY:     HOV
    SHARED3FREE:    HOV
    SHARED3PAY:     HOV
    WALK_LOC:       Transit
    WALK_LRF:       Transit
    WALK_EXP:       Transit
    WALK_HVY:       Transit
    WALK_COM:       Transit
    DRIVE_LOC:      Transit
    DRIVE_LRF:      Transit
    DRIVE_EXP:      Transit
    DRIVE_HVY:      Transit
    DRIVE_COM:      Transit
    WALK:           Non-Motorized
    BIKE:           Non-Motorized
    TAXI:           Ride Hail
    TNC_SINGLE:     Ride Hail
    TNC_SHARED:     Ride Hail
```

Per `expand_mappings()`'s real, confirmed behavior (no `ELSE` clause emitted
— docs/GRAMMAR.md §"How placeholders expand"), any real `trip_mode` value
not listed above yields SQL `NULL` for `major_trip_mode`, not an error —
acceptable here since `prototype_mtc`'s real mode-choice spec's full value
set was directly enumerated (`tour_mode_choice.csv`) and is expected to be
fully covered.

## `bins.time_of_day_period`

```yaml
bins:
  time_of_day_period:
    column: depart
    type:   manual_breaks
    breaks: [0, 5, 9, 14, 18, 24]
    labels: [EA, AM, MD, PM, EV]
```

See `research.md` #2 for why these specific 4 load-bearing boundary values
(5, 9, 14, 18) are correct against ActivitySim's own real
`network_los.yaml` period definition.

## `sql_fragments.trips_merged`

```yaml
sql_fragments:
  trips_merged: |
    trips t
    JOIN land_use lu ON t.destination = lu.zone_id
```

See `research.md` #3 for the confirmed real `zone_id` column name.

## `metrics:`

Five entries, one per Parquet file — full column-level shape in
`data-model.md`. SQL sketches (final SQL is an implementation detail, not
fixed by this contract, provided the output columns match `data-model.md`
exactly):

```yaml
metrics:
  - name: summary_kpis
    sql: |
      SELECT
        (SELECT COUNT(DISTINCT household_id) FROM households) AS total_households,
        (SELECT COUNT(DISTINCT person_id)    FROM persons)    AS total_persons,
        (SELECT COUNT(DISTINCT trip_id)      FROM trips)      AS total_trips,
        (SELECT COUNT(DISTINCT tour_id)      FROM tours)      AS total_tours,
        (SELECT AVG(mode_choice_logsum)      FROM trips)      AS avg_trip_mode_choice_logsum,
        (SELECT COUNT(DISTINCT trip_id) FROM trips) * 1.0
          / (SELECT COUNT(DISTINCT household_id) FROM households) AS trips_per_household

  - name: trips_by_destination_zone
    sql: |
      SELECT
        lu.zone_id       AS destination_zone_id,
        t.primary_purpose,
        COUNT(*)                     AS trips,
        COUNT(DISTINCT t.tour_id)    AS tours
      FROM $sql.trips_merged
      GROUP BY lu.zone_id, t.primary_purpose

  - name: mode_share_by_period
    sql: |
      SELECT
        $bins.time_of_day_period AS time_of_day_period,
        t.trip_mode,
        COUNT(*) AS trips,
        COUNT(*) * 1.0 / SUM(COUNT(*)) OVER (PARTITION BY $bins.time_of_day_period) AS share
      FROM trips t
      GROUP BY time_of_day_period, t.trip_mode

  - name: trip_mode_share
    sql: |
      SELECT
        CASE t.trip_mode $mappings.major_trip_mode END AS major_trip_mode,
        COUNT(*) AS trips,
        COUNT(*) * 1.0 / SUM(COUNT(*)) OVER () AS share
      FROM trips t
      GROUP BY major_trip_mode

  - name: trip_purpose_share
    sql: |
      SELECT
        t.primary_purpose,
        COUNT(*) AS trips,
        COUNT(*) * 1.0 / SUM(COUNT(*)) OVER () AS share
      FROM trips t
      GROUP BY t.primary_purpose
```

## Invariants this contract MUST preserve

- No metric SQL references a `$mappings`/`$bins`/`$sql` name not defined in
  this same file (would raise `UnresolvedPlaceholderError` — a config bug,
  not acceptable in delivered content).
- All 5 metric `name:` values are unique (`DuplicateMetricError` otherwise).
- The same `summarize.yaml` file, byte-for-byte, is used for all three
  `--input` invocations — the three scenarios must differ only in their raw
  input data, never in how that data is summarized (spec.md FR-001, FR-008).
