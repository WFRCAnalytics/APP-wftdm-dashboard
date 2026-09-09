# Contract: New `summarize.yaml` Metrics (Six-Tab Demo Content)

See `data-model.md` §3 for the full list of new metric names, their tab,
and the real columns each draws from. This contract fixes the SHARED
shape rules every new metric MUST follow, plus the two shared building
blocks every distance-dependent metric MUST reuse rather than
reinventing.

## Shared building blocks

### `trip_distance_miles` — real straight-line distance (haversine)

Every metric needing a distance value (Trip/Joint/Non-Mandatory/At-Work
Subtour Destination, VMT metrics, average-trip-distance-by-purpose) joins
`$sql.zone_centroids` (existing, unmodified — `research.md` §3/§4) twice,
once per endpoint, using the SAME alias convention `od_flows` already
established (`c1`/`c2`), and computes distance with a plain haversine
expression — no new DuckDB extension, no new dependency:

```sql
3959 * acos(
  cos(radians(c1.lat)) * cos(radians(c2.lat)) * cos(radians(c2.lon) - radians(c1.lat))
  + sin(radians(c1.lat)) * sin(radians(c2.lat))
)
```

(Exact radian/trig call names confirmed against DuckDB's real, installed
scalar function set before being written into `summarize.yaml` — this
formula is a plan-level sketch, not literal final SQL.)

**Every panel and doc reference to a distance/VMT value computed this way
MUST carry a one-line "straight-line distance between real zone
centroids, not a modeled network distance" disclosure** (`research.md`
§4) — in the panel's own `description`, not buried only in
`summarize.yaml`'s comments.

### `person_type` mapping and `income_group` bin

Both are plain `$mappings`/`$bins` entries (`data-model.md` §2) — every
new metric segmented by person type or income group references
`$mappings.person_type` / `$bins.income_group` exactly the way
`trip_mode_share` already references `$mappings.major_trip_mode`. No
metric computes either segmentation inline with its own ad hoc `CASE`.

## Shared schema rules

- Every new metric's output is grouped ("GROUP BY") — no ungrouped raw
  row dump of `persons`/`tours`/`trips` is published as its own Parquet
  file (matches this project's existing metrics' own shape).
- Every tour-scoped metric filters `tours` by the real `tour_category`
  value it targets (`'mandatory'`, `'joint'`, `'non_mandatory'`,
  `'atwork'` — confirmed real, exhaustive values, `research.md` §2) —
  never by a purpose-name heuristic.
- Every metric name is `snake_case`, matching every existing metric name
  in `summarize.yaml` today.
- `person_household_profile` (the `graphic-walker` dataset) is the one
  metric in this feature that is deliberately NOT grouped — one real row
  per person, by design, since open-ended exploration needs individual
  records, not pre-aggregated ones. This is a legitimate, singular
  exception to the "every metric is grouped" rule above, not a
  precedent for any other metric.

## What does NOT change

- No existing metric's SQL, output schema, or file name changes, except
  `summary_kpis`, which gains exactly one new scalar column (`total_vmt`).
  Average trip distance by purpose is its own new metric,
  `trip_distance_by_purpose` (a small per-purpose table, not a scalar) —
  see `data-model.md` §3.
- No new `sources:` entry — every new metric reads from the five sources
  `summarize.yaml` already declares (`households`, `persons`, `tours`,
  `trips`, `land_use`).
- No new post-processor engine code (`python/wftdm_dashboard/
  postprocessor/`) — every new metric expands through `expand.py`'s
  existing, unmodified `$mappings`/`$bins`/`$sql` substitution.
