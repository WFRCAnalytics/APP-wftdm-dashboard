# Contract: New `summarize.yaml` Metrics

## `purpose_mode_flow`

- Input: the real `trips` source, already loaded by the existing,
  unmodified pipeline — no new `sources:` entry.
- Uses the existing, real `$mappings.major_trip_mode` — no new
  `mappings:` entry.
- Output schema: `primary_purpose` (string), `major_trip_mode` (string),
  `trips` (integer ≥ 1 — a `GROUP BY` with `COUNT(*)` can never produce a
  zero-count row).
- **Real-data invariant**: `SUM(trips)` over the whole output equals
  `SELECT COUNT(*) FROM trips` for that scenario — a full partition, no
  row dropped or duplicated. A verification query checking this
  invariant directly (not just "the file exists") is part of this
  metric's own test coverage (research.md §5).
- Consumed by exactly one panel type: `sankey` (`source:
  primary_purpose`, `target: major_trip_mode`, `value: trips`).

## `od_flows`

- Input: the real `trips` source (already loaded) joined against the new
  `$sql.zone_centroids` fragment (data-model.md §1) — no new `sources:`
  entry (the centroid data lives inline in `summarize.yaml` itself, not
  a file).
- Output schema: `orig_taz`/`dest_taz` (integer, 1-25), `orig_lat`/
  `orig_lon`/`dest_lat`/`dest_lon` (float, real MTC-derived centroid
  coordinates), `trips` (integer ≥ 1).
- **Real-data invariant**: every `orig_lat`/`orig_lon`/`dest_lat`/
  `dest_lon` value in the output is byte-identical to some row's `lat`/
  `lon` in `zone_centroids` — because the join is an equality join on
  `zone_id`, this holds by construction, but is still worth a direct
  test assertion (not just "the columns exist") since it's the concrete,
  checkable form of this feature's own "never fabricate a coordinate"
  constraint (FR-001) for this specific metric.
- **Known, accepted possible under-count**: `SUM(trips)` MAY be less than
  the scenario's real total trip count, if any real trip's origin/
  destination falls outside zones 1-25 (the inner `JOIN` silently
  excludes such rows — data-model.md §3). This MUST be checked
  empirically once real data is available (how many rows, if any) and
  reported, not assumed either way before that check.
- Consumed by exactly one panel type: `flowmap` (`origin: orig_taz`,
  `origin_lat: orig_lat`, `origin_lon: orig_lon`, `destination:
  dest_taz`, `dest_lat: dest_lat`, `dest_lon: dest_lon`, `value: trips`).

## What does NOT change

- No existing metric's SQL, output schema, or file name changes.
- No new `sources:`, `mappings:`, or `bins:` entry — both new metrics
  reuse exactly what the existing, real `summarize.yaml` already loads
  and defines.
- `expand.py`/`config.py`/`pipeline.py` need zero code change to support
  either metric — both use only already-implemented `$mappings.x`/
  `$sql.x` placeholder mechanisms.
