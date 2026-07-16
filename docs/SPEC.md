# SPEC.md — WFRC TDM Calibration Dashboard

Implementation specification. Service APIs, panel contracts, config grammar.

---

## Config file set (three files, no more)

```
summarize.yaml        post-processor only — not read by browser
dashboard-*.yaml      tab layout and panels — first file is the landing page
manifest.yaml         per-scenario metadata — read by browser at folder load
```

- No `topsheet.yaml` — `dashboard-1-summary.yaml` serves as the landing page
- No `summarize-preprocessor.yaml` — join logic lives in `sql_fragments`
- No `dashboard-config.yaml` — does not exist
- Config files live in `.wfrc/` parent folder shared across scenario runs
- Parquet outputs live in each scenario folder's `summary/` subfolder

---

## Navigation model

```
Scenario loaded → dashboard-1-summary.yaml (landing page, always active on load)
  ├── Tab: Summary ★    dashboard-1-summary.yaml  ← value boxes + overview charts
  ├── Tab: Person/HH    dashboard-2-person.yaml
  ├── Tab: Tour         dashboard-3-tour.yaml
  ├── Tab: Mode Choice  dashboard-4-mode.yaml
  ├── Tab: Trip         dashboard-5-trip.yaml
  ├── Tab: Network      dashboard-6-network.yaml
  └── Tab: Explore      dashboard-7-explore.yaml  (Graphic Walker)
```

The Summary tab renders immediately on scenario load. Value boxes read from
`summary_kpis.parquet` (smallest file, loads first). Charts below load
progressively as other Parquet files are registered.

---

## DuckDB service (`services/duckdb.js`)

```js
initDuckDB()
registerScenario(name, dirHandle)   // summary/*.parquet → name__* views
unregisterScenario(name)
registerFileURL(viewName, url)      // for wftdm-dashboard serve/here mode
query(sql) → Array<Object>
queryArrow(sql) → ArrowTable
distinctValues(view, column) → Array
listViews() → Array<string>
```

**Deployment detection:**
```js
const LOCAL = window.location.hostname === 'localhost'
// LOCAL → registerFileURL via http://localhost:8050/  (wftdm-dashboard serve/here)
// WEB   → registerFileHandle via showDirectoryPicker()
//         (wfrcanalytics.github.io/APP-wftdm-dashboard or wfrc.utah.gov/wftdm-dashboard)
```

**Observed views** — registered at startup, always available (no scenario prefix):
`observed_mode_share`, `observed_counts`, `observed_tlfd`, `observed_trip_rates`

---

## SQL expander (`services/sqlExpander.js`)

| Placeholder | Expands to |
|---|---|
| `$mappings.major_trip_mode` | WHEN clauses inside CASE block |
| `$bins.income_category` | CASE expression (manual_breaks / quantiles / spaced_intervals) |
| `$sql.trips_merged` | Inline FROM clause joining trips + persons + households |
| `$filters.purpose` | Current filter value; omit WHERE if value is `'all'` |
| `$scenario` | UNION ALL across all loaded scenario views |

---

## Filter state (`state/filterState.js`)

```js
get(id)
set(id, value)
subscribe(ids, fn) → unsubFn   // ids: ['purpose'] or ['*']
getAll() → Object
```

---

## Panel contract

Every panel: `create(config, conn, filterState) → { element, destroy }`

```js
export function create(config, conn, filterState) {
  const el = document.createElement('div')
  async function render() { /* query + draw */ }
  const unsub = filterState.subscribe(config.filter_ids ?? ['*'], render)
  render()
  return { element: el, destroy: () => { unsub(); /* lib cleanup */ } }
}
```

---

## Panel types

| type | Library | Notes |
|---|---|---|
| `plotly` | Plotly.js | Default. Use `Plotly.react()` not `newPlot()` for updates |
| `plot` | Observable Plot | For panels with reactive filter inputs |
| `table` | plain DOM | Sortable, paginated |
| `valuebox` | plain DOM | Single scalar KPI with threshold coloring |
| `flowmap` | flowmap.gl + MapLibre | `MapboxOverlay` + `FlowmapLayer`; `setProps()` on update |
| `zonemap` | MapLibre | GeoParquet join; `setData()` on update |
| `sankey` | d3-sankey | Mode shift / tour-to-trip consistency |
| `graphic-walker` | Graphic Walker | Explore tab only; snapshot model |
| `markdown` | marked.js | Text/methodology panels |

---

## YAML grammar

### `summarize.yaml`

Single post-processor config. `sql_fragments` defines reusable join bases
referenced as `$sql.x` in metric queries — this is where merged tables
(trips + persons + households) are defined, replacing any preprocessor step.

```yaml
sources:
  trips:      trips.csv
  tours:      tours.csv
  persons:    persons.csv
  households: households.csv
  land_use:   land_use.csv
  zones:      zones.parquet      # taz_id, small_district, medium_district, large_district, super_district
  skims:      skims.parquet      # converted from OMX by h5db / openmatrix

mappings:                        # → CASE WHEN via $mappings.x
  major_trip_mode:
    DRIVEALONEFREE: SOV
    DRIVEALONEPAY:  SOV
    SHARED2FREE:    HOV
    WALK_LOC:       Transit
    WALK:           Non-Motorized
    # ...

bins:                            # → CASE expression via $bins.x
  income_category:
    column: income
    type: manual_breaks
    breaks: [0, 25000, 50000, 75000, 100000]
    labels: [Very Low, Low, Medium, High, Very High]

  distance_bin_half_mile:
    column: auto_distance
    type: spaced_intervals
    interval: 0.5
    lower: 0

sql_fragments:                   # → inline SQL via $sql.x
  trips_merged: |
    trips t
    JOIN persons p    ON t.person_id    = p.person_id
    JOIN households h ON p.household_id = h.household_id
    JOIN zones z      ON h.home_zone_id = z.taz_id

  tours_merged: |
    tours t
    JOIN persons p    ON t.person_id    = p.person_id
    JOIN households h ON p.household_id = h.household_id
    JOIN zones z      ON h.home_zone_id = z.taz_id

  auto_distance_expr: |
    CASE trip_mode
      WHEN 'DRIVEALONEFREE' THEN s.SOV_DIST
      WHEN 'SHARED2FREE'    THEN s.HOV2_DIST
      ELSE 0
    END

metrics:
  - name: summary_kpis
    sql: |
      SELECT
        COUNT(DISTINCT h.household_id) AS total_households,
        COUNT(DISTINCT p.person_id)    AS total_persons,
        COUNT(DISTINCT t.trip_id)      AS total_trips,
        SUM($sql.auto_distance_expr)   AS total_vmt
      FROM $sql.trips_merged
      JOIN skims s ON t.origin = s.orig AND t.dest = s.dest
                   AND t.time_period = s.period

  - name: trip_mode_share
    sql: |
      SELECT
        t.primary_purpose AS purpose,
        CASE t.trip_mode $mappings.major_trip_mode END AS mode,
        $bins.income_category AS income_category,
        CASE
          WHEN h.auto_ownership = 0             THEN 'Zero Autos'
          WHEN h.auto_ownership < h.num_workers THEN 'Autos < Workers'
          ELSE                                       'Autos >= Workers'
        END AS auto_sufficiency,
        COUNT(*) AS trips,
        COUNT(*) * 1.0 / SUM(COUNT(*)) OVER (PARTITION BY purpose) AS share
      FROM $sql.trips_merged
      GROUP BY purpose, mode, income_category, auto_sufficiency
```

### `dashboard-*.yaml`

The first dashboard file (`dashboard-1-summary.yaml`) is the landing page.
It opens automatically on scenario load. Value boxes at the top read from
`summary_kpis.parquet`; charts below use other metric Parquet files.
Multi-scenario: value box panels auto-render one column per loaded scenario
plus an observed column.

```yaml
header:
  tab: Mode Choice
  title: Mode Share Analysis

filters:
  - id: purpose
    label: Trip Purpose
    type: select
    source: trip_mode_share
    column: purpose
    default: all
    all_option: true

layout:
  row1:
    - type: valuebox
      metric: summary_kpis
      column: auto_share
      observed: 0.847
      width: 0.25

    - type: plotly
      metric: trip_mode_share
      filter: $filters.purpose
      traces:
        - type: bar
          x: $metric.mode
          y: $metric.share
          color: $metric.mode
          barmode: group
      observed:
        source: observed_mode_share
        style: dot
      width: 0.75

  row2:
    - type: plot
      metric: trip_mode_share
      filter: $filters.purpose
      inputs:
        - id: income_filter
          label: Income Group
          type: select
          column: income_category
      mark: barY
      x: income_category
      y: share
      fill: mode
      width: 1.0
```

### `manifest.yaml`

```yaml
scenario_name: abm_2026_baseline
engine: activitysim
run_date: 2026-06-15
color: "#4e79a7"
notes: First full-region ABM run post-calibration
```

---

## Scenario folder structure

```
scenario_folder/
  manifest.yaml
  summary/
    summary_kpis.parquet
    trip_mode_share.parquet
    tour_mode_share.parquet
    tlfd.parquet
    trip_scheduling.parquet
    auto_ownership.parquet
    telecommute_freq.parquet
    cdap.parquet
    mandatory_tour_freq.parquet
    non_mandatory_tour_freq.parquet
    stop_frequency.parquet
    screenlines.parquet
    od_flows.parquet
    workplace_od_flows.parquet
    vmt_by_home_taz.parquet
    # ... one file per metric in summarize.yaml
```

---

## Multi-scenario comparison

**Overlaid (one panel, N scenarios):** omit `scenario:` key — expander generates UNION ALL:
```sql
SELECT 'abm_2026' AS scenario, mode, share FROM abm_2026__trip_mode_share WHERE purpose = 'HBW'
UNION ALL
SELECT 'base_tbm', mode, share FROM base_tbm__trip_mode_share WHERE purpose = 'HBW'
UNION ALL
SELECT 'Observed', mode, share FROM observed_mode_share WHERE purpose = 'HBW'
```

**Side-by-side:** add `scenario:` key to each panel — renderer queries only that view.

**Diff:** `comparison: { type: diff, a: base_tbm, b: abm_2026, expr: "b.share - a.share" }`

---

## FlowMapPanel wiring

```js
// create
const overlay = new MapboxOverlay({ interleaved: false, layers: [] })
map.addControl(overlay)

// update (no map recreation)
overlay.setProps({ layers: [new FlowmapLayer({
  id: 'od',
  data: { locations, flows },
  getLocationId:    l => l.id,
  getLocationLat:   l => l.lat,
  getLocationLon:   l => l.lon,
  getFlowOriginId:  f => f.orig_taz,
  getFlowDestId:    f => f.dest_taz,
  getFlowMagnitude: f => f.trips,
  clusteringEnabled: config.clustering ?? true,
  pickable: true,
  onHover: handleHover,
})]})

// destroy
map.remove()
```

---

## ZoneMapPanel wiring

```js
// load geometry once (module-level cache)
const geojson = await conn.query('SELECT ST_AsGeoJSON(geom) FROM taz_zones')
  .then(rows => ({ type: 'FeatureCollection', features: rows.map(toFeature) }))

// update (no source re-add)
geojson.features.forEach(f => {
  const row = metricRows.find(r => r.taz_id === f.properties.TAZ_ID)
  f.properties._value = row?.[config.column] ?? null
})
map.getSource('zones').setData(geojson)
```

---

## Charting library decision

| Plotly | Observable Plot |
|---|---|
| Interactive legend (toggle scenarios) | Reactive filter inputs (dropdowns → chart updates) |
| Modebar: fullscreen, PNG export | Grammar-of-graphics (faceted small multiples) |
| Rich formatted hover tooltips | Multiple panels share one input |
| Log-scale axes (volume scatter) | Lightweight, one of several panels in a row |

---

## Post-processor pipeline

Runs: `uv run python summarize.py --config summarize.yaml --scenario-dir <path>`

Steps:
1. Read CSVs via `read_csv_auto()`
2. Read OMX via `h5db` extension (`INSTALL h5db FROM community; LOAD h5db`) — fallback: `openmatrix` Python lib
3. Convert geometry via DuckDB spatial (`ST_Read`) or GeoPandas → GeoParquet
4. Expand `$mappings` / `$bins` / `$sql` placeholders in each metric SQL
5. Execute each metric SQL via DuckDB
6. `COPY result TO 'summary/{name}.parquet' (FORMAT PARQUET)`
