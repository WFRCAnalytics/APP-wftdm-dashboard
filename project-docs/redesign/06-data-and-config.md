# 06 — Data and configuration contracts

What the redesign needs from the data (Parquet) and from configuration (YAML/JSON), and what is new.
Existing formats stay valid. Everything here is **additive**: a dashboard configured the old way must
keep working (it simply behaves as one independent scenario set with no years, rounds or observed margins).

Where this lives: Parquet and `manifest.yaml` are produced by the post-processor from the TDM repo's
`summarize.yaml` (not in this repo). The browser reads published copies from `public/scenarios/`,
`public/demo-scenarios/`, `public/observed/`, and the config from `public/dashboard-config/`.

## 1. Scenario identity and the manifest

Today `manifest.yaml` carries `scenario_name`, `display_name`, `engine`, `run_date`, `color`, `pinned`.
Add these **optional** fields:

```yaml
scenario_name: freq-transit-2036        # unique id (folder name)
display_name: Frequent transit
kind: scenario                          # scenario | round | observed   (default: scenario)
alternative: freq-transit               # groups the runs of one alternative across years
year: 2036                              # model year of this run
tag: Transit                            # free text; used for picker tag chips
color: '#4C8BF5'                        # optional deployer default (viewer override still wins)
summary_metrics: [transit_share, total_vmt]   # shown in the picker sub-line
# only for kind: round
family: calibration                     # id of a family declared in dashboard-config/index.json
family_index: 12                        # 1-based position in the family
```
Rules:
- A scenario's **identity for the UI** is `alternative`. Its **run for a given year** is the folder whose
  `alternative` matches and whose `year` is that year. If `alternative`/`year` are absent, the scenario is a
  single-year run and the Year control is hidden for that deployment.
- `kind: round` runs are shown only in the base year and only through the round strip (file 02 §1.3).
- `kind: observed` is not a scenario: it is the Observed reference (§6). It is never in the compare set.
- Keep the manifest order stable; the default color index of a scenario is its position at load time.

## 2. Dashboard config additions (`public/dashboard-config/index.json`)

Existing fields stay (`dashboards`, `title`, `logoUrl`, `logoUrlDark`, `markUrl`, `markUrlDark` (the collapsed-rail mark), `scenarioPalette`, `protomapsPmtilesUrl`,
`protomapsApiKey`, `primaryColor`, `secondaryColor`, `accentColor`). Add:

```jsonc
{
  "years": [                                   // omit for single-year deployments
    { "year": 2023, "label": "Base year" },
    { "year": 2027, "label": "Opening year" },
    { "year": 2032, "label": "End of STIP" },
    { "year": 2036, "label": "End of RTP Phase I" },
    { "year": 2046, "label": "End of RTP Phase II" },
    { "year": 2055, "label": "Horizon year" }
  ],
  "baseYear": 2023,
  "defaultYear": 2036,
  "compare": { "default": "auto" },            // auto = on when >= 2 independent scenarios | on | off
  "families": [
    { "id": "calibration", "label": "Calibration rounds", "kind": "rounds", "baseYearOnly": true,
      "rollup": "calibration_by_round" }         // metric (Parquet) with every round, for the trace tile
  ],
  "headlineMetrics": [                          // hero KPI band; defaults to the five in file 02 if omitted
    { "id": "total_trips", "label": "Daily trips", "unit": "M", "format": ",.2f", "scale": 1e-6 },
    { "id": "boardings",   "label": "Transit boardings", "unit": "k", "format": ",.0f", "scale": 1e-3 }
  ],
  "scorecardMetrics": [ { "id": "transit_share", "label": "Transit share", "unit": "%", "decimals": 1 } ],
  "tolerances": { "mode_share_pts": 1, "volume_pct": 5, "boardings_pct": 10, "submodel_error_pct": 3 }
}
```
The Settings, branding and basemap config described in `CLAUDE.md` is unchanged.

## 3. Parquet tables used by the demo tiles

Use the existing metric files where they exist; the rest are new. Column names follow the repo's existing
snake_case style. Every table is **one file per scenario run** under `{scenario}/summary/`, loaded lazily by
`tabDataLoader.ts`, unless stated.

| Tile | Metric file | Columns | Status |
|---|---|---|---|
| Hero KPIs, Scorecard, Ranked, Across years | `summary_kpis` | `total_households, total_persons, total_trips, total_tours, total_vmt, …` plus new: `transit_boardings, avg_trip_length_miles` | extend existing |
| Mode share | `trip_mode_share` | `major_trip_mode, trips, share` | exists |
| Mode share by purpose | `trip_mode_share_by_purpose` | `primary_purpose, major_trip_mode, trips` | new |
| Mode share by income | `trip_mode_share_by_income` | `income_group, major_trip_mode, trips` | new |
| Trips by purpose and mode (all views) | `purpose_mode_flow` | `primary_purpose, major_trip_mode, trips` | exists |
| Purpose→mode→distance (Sankey) | `purpose_mode_distance_flow` | `primary_purpose, major_trip_mode, distance_band, trips` | new |
| Trips through the day | `trips_by_hour` | `hour, trips` plus `trips_by_hour_mode`, `…_purpose`, `…_income` with the extra column | new |
| Heatmap by purpose | `trips_by_hour_purpose` | `hour, primary_purpose, trips` | new |
| Zone map (all map views) | `zone_transit_share` (+ `zones.geoparquet`) | `taz_id, transit_share, residents` | new (geometry exists as `demo-geometry`) |
| District flows | `od_district` | `orig_district, dest_district, trips` | new (aggregate of `od_flows`) |
| Auto ownership | `auto_ownership_summary` | `auto_ownership, income_group, …, households` | exists |
| Population pyramid | `population_age_sex` | `age_band, sex, persons` (+ observed with `moe`) | new |
| Trip length distribution | `trip_length_frequency` | `primary_purpose, distance_bin_miles, trips` | new (`trip_distance_by_purpose` has only averages) |
| Transit boardings | `transit_boardings` | `line, boardings` | new |
| Average speed | `speed_by_facility_hour` | `facility_type, hour, avg_speed_mph` | new |
| Vehicle miles | `vmt_county_facility` | `county, facility_type, vmt` | new |
| Calibration fingerprint | `calibration_errors` | `submodel, worst_segment_error_pct` | new |
| Calibration progress | `calibration_by_round` (**one roll-up file for the whole family**) | `round, metric_group, series, value, observed_value` where `metric_group ∈ {mode_share, volumes, boardings_by_line, submodel_error}` | new |
| Across model years | derived at query time from `summary_kpis` of each `(alternative, year)` run | — | no new file |

Shares are fractions (0–1) in Parquet; the UI multiplies by 100 for display. Every table must include rows
for **all categories** (a zero-trip mode still appears) so shapes and axes are stable across scenarios.

## 4. How the app discovers runs by alternative and year

Extend `services/scenarioDiscovery.ts` (and the `useScenarioList` hook):
1. Read each manifest. Build `alternatives: Map<alternative, Map<year, scenarioName>>`.
2. `resolveRun(alternative, year)` returns the scenario folder name for that year (or `undefined`).
3. The **compare set holds alternative ids**; `ViewContext.active` is resolved to the run names for the
   current year before queries are built. Calibration rounds are their own alternatives (`kind: round`).
4. `registerFor(tile)` registers only the `(run, metric)` Parquet files that tile needs for the current
   year (existing `ensureRegistered`).
5. Reference `self-base-year`: for each compared alternative also resolve `resolveRun(alternative, baseYear)`.
6. The Across-years tile requests every milestone year of each compared alternative for **one** metric
   (`summary_kpis` columns). It needs 6 small files per alternative; load them lazily when the tile is visible.

## 5. Calibration rounds family

- 50+ round folders, each a normal scenario folder with `kind: round`, `family: calibration`, `family_index: n`.
- **Roll-up file** `calibration_by_round.parquet` in the *family's* own folder (or the observed folder) with one
  row per `(round, metric_group, series)`. It powers the progress tile and the picker strip's status ticks
  without opening 50 folders. Required columns: `round (int), metric_group, series, value, observed_value`.
  `submodel_error` rows have `observed_value = 0`.
- Individual round folders are loaded only when a round is selected (focus, reference or compare set).
- Keep a round's `summary/` identical in structure to a normal scenario so every tile works on it.

## 6. Observed reference data

**Status:** the team has not yet decided how observed data is produced (several sources, some with PII).
This section defines a contract that works regardless of how it is produced.

### 6.1 Principles
1. **Compute outside this repo.** PII processing happens in your secure environment. Only **aggregates** are
   published to the dashboard. No records, no small cells.
2. **Same shape as model outputs.** An observed table has the same name and columns as the model metric it
   is compared with (`trip_mode_share`, `transit_boardings`, …) so chart code and SQL need no special case.
3. **Provenance travels with the data.** Every published observed table says where it came from, how many
   observations stand behind it, and how uncertain it is.
4. **Several sources are normal.** The mapping from metric to source is data, not code.

### 6.2 Layout
```
public/observed/
  index.json                       # registry: sources and which metric each one supplies
  hts-2023/                        # one folder per source
    source.yaml
    trip_mode_share.parquet
    trip_mode_share_by_income.parquet
    population_age_sex.parquet
  obs-2023/
    source.yaml
    transit_boardings.parquet
  udot-counts-2023/
    source.yaml
    summary_kpis.parquet           # observed VMT and trips where counts support them
```
`public/observed/index.json`:
```jsonc
{ "sources": [
    { "id": "hts-2023", "label": "2023 household travel survey" },
    { "id": "obs-2023", "label": "2023 on-board transit survey and APC counts" },
    { "id": "udot-counts-2023", "label": "UDOT traffic counts, 2023" } ],
  "metrics": { "trip_mode_share": "hts-2023", "transit_boardings": "obs-2023", "summary_kpis.total_vmt": "udot-counts-2023" } }
```
`source.yaml`:
```yaml
id: hts-2023
label: 2023 household travel survey
vintage: 2023
method: Weighted expansion to the regional population; 14,820 households
sample: { households: 14820, persons: 38210, trips: 112400 }
suppression: { min_cell_n: 30, rule: cells below min_cell_n are merged into "Other" or dropped }
contact: <name or team email of the data owner>
notes: Collected Sept–Nov 2023.
```

### 6.3 Columns
Observed tables carry the model columns plus, where known:
| Column | Meaning |
|---|---|
| `moe` | margin of error of the value, same unit as the value (90% or 95%, say which in `source.yaml`) |
| `lo`, `hi` | alternative to `moe` (an explicit interval) |
| `n` | number of observations behind the row |
Missing uncertainty is allowed; charts then draw the observed line without a band.

### 6.4 UI behavior
- Observed appears **only** as a reference (control bar *Reference → Observed*, and as the default dashed
  reference line when Compare is off in the base year). It is never listed as a scenario.
- Charts draw a dashed ink line and, if `moe`/`lo`/`hi` exist, a band; tooltips name the source ("Observed:
  2023 household travel survey, n = 14,820 households").
- The gap chart marks a modeled value within the margin of error as "within error".
- Observed exists only for the base year (`baseYear`). Outside it the Observed option is not offered.
- Zone-level observed data is out of scope until it exists; maps fall back to the baseline as reference.

### 6.5 Validation (add a CLI command)
Add `wftdm-dashboard validate-observed <folder>` to `python/wftdm_dashboard/cli.py`:
- every `source.yaml` has `id, label, vintage, sample`;
- every Parquet file in a source folder matches a known metric's column set (plus `moe/lo/hi/n`);
- `n >= suppression.min_cell_n` for every row, otherwise fail with the offending rows listed;
- `index.json` references only existing sources and files.
Fail loudly; never publish a table that violates suppression.

## 7. Tile grammar additions (`dashboard-*.yaml`)

Existing panel keys (`type, title, metric, scenario, scenarios, mark, x, y, fill, tip, grid, height, width`,
`source/target/value`, `path/value`, `axis/series`, `comparison`, `description`) are unchanged. Layout rows use
`width` as a fraction of the row (0–1) exactly as today; the 12-column spans in file 02 are `width × 12`.

Add one new wrapper type, **`multi-view`**, that holds several views of the same data:

```yaml
- type: multi-view
  title: Trips by purpose and mode
  description: Daily trips for the focus scenario. Hover a mode to trace it across every chart.
  metric: purpose_mode_flow
  width: 0.58
  height: 430
  group_by:                                  # optional. The deployer decides which tiles get one.
    label: Group by
    default: pm
    options:
      - { id: pm, label: "Purpose › Mode", fields: { path: [primary_purpose, major_trip_mode] } }
      - { id: mp, label: "Mode › Purpose", fields: { path: [major_trip_mode, primary_purpose] } }
  views:                                     # first view is the default
    - { id: tree, label: Treemap,   type: treemap,  path: $group.path, value: trips, compare: [multi, diff] }
    - { id: sun,  label: Sunburst,  type: sunburst, path: $group.path, value: trips, compare: [multi] }
    - { id: flow, label: Flow,      type: sankey,   source: primary_purpose, target: major_trip_mode, value: trips, compare: [switch] }
```
Rules the loader must implement:
1. `views[i]` is an ordinary panel config for its `type`; `multi-view` supplies defaults (`metric`, `height`,
   `width`, `description`) to each view that omits them.
2. `group_by.options[j].fields` is merged into the active view's config. Any string value of the form
   `$group.<field>` in a view is replaced by the active option's `fields[<field>]`. A view that references a
   `$group` field the option does not define keeps the field unset.
3. `compare:` lists the strategies the view supports (`overlay | diff | multi | grid | switch | swipe`); the first is
   the default. Omitted ⇒ the type's default from the matrix in file 03 §4.1. `compare: []` ⇒ the view does not vary by scenario.
4. `scenario_independent: true` on a `multi-view` or a view ⇒ shows the "Same in every scenario" badge in Compare mode.
5. `needs_compare: true` hides the tile when Compare is off (scorecard, ranking).
6. `base_year_only: true` hides or badges the tile outside the base year (calibration progress and fingerprint).
7. `family: calibration` on a view marks it as reading the rounds roll-up.
8. Validate at load: unknown strategy, unknown `$group` field, view without `type`, duplicate ids. Show the
   existing panel error state with a precise message; never throw.

New panel types needed (each follows the existing panel pattern in `CLAUDE.md`):
| `type` | Purpose |
|---|---|
| `multi-view` | the wrapper above |
| `scorecard` | scenario × metric matrix (file 04 §23) |
| `ranked-bars` | ranking (file 04 §24) |
| `trend` | across model years (file 04 §25) and calibration progress (§26), distinguished by `x: year` or `x: round` |
| `chord` | district flows (file 04 §14) |
| `waffle`, `ridgeline`, `pyramid`, `dumbbell`, `stream` | the charts in file 04 not yet in the registry. Prefer Observable Plot marks where possible (`pyramid`, `dumbbell`, `stream`, `heatmap` are Plot); `chord`, `waffle`, `ridgeline` are D3 |
Existing `treemap`, `sunburst`, `sankey`, `radar`, `pie` (donut), `zonemap`, `observable-plot` are reused and
extended per file 03 §4.2.

`trend` example:
```yaml
- type: trend
  title: Across model years
  metric: summary_kpis
  x: year
  group_by:
    label: Metric
    default: transit_share
    options:
      - { id: transit_share, label: Transit share, fields: { y: transit_share } }
      - { id: total_vmt,     label: Daily VMT,     fields: { y: total_vmt } }
  y: $group.y
```

## 8. Backwards compatibility checklist
- A deployment with no `years`, no `families`, one scenario, and old-style panels still renders: Compare
  hidden, Year hidden, tiles show the focus scenario, observed shown as before.
- `type: the old chart library` and `type: the old chart library` no longer exist (removed with the redesign); a panel using them shows the "Unknown panel type" error state. Convert such panels to `observable-plot`.
- `scenario:`/`scenarios:` pins keep their meaning (a pinned panel ignores the compare set).
