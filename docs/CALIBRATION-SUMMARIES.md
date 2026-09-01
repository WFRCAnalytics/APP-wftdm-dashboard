# WFRC ActivitySim Calibration Summaries

Reference document for all calibration summary metrics. Organized by dashboard tab,
then by ActivitySim submodel sequence within each tab.

**Boldface** = Level 1 (in-model application / practice — key summaries for scenario
interpretation and debugging). All others = Level 2 (calibration — submodel segmentation
for adjusting constants and functions).

Each summary maps to one named Parquet file produced by the post-processor
(`summarize.yaml`) and consumed by the corresponding dashboard panel.

---

## Level 1 — High-Level Summary (Summary Tab — Landing Page)

Displayed on `dashboard-1-summary.yaml`, which is the landing page loaded
automatically when a scenario folder is opened. Value boxes render from
`summary_kpis.parquet` (first file loaded); charts below load progressively.

| Metric | Parquet file |
|---|---|
| **Total households, persons, tours, trips** | `summary_kpis.parquet` |
| **Average trip distance by purpose** | `summary_kpis.parquet` |
| **Total trips by purpose** | `summary_kpis.parquet` |
| **Total trips by mode** | `summary_kpis.parquet` |
| **VMT** | `summary_kpis.parquet` |

---

## Person / Household Models Tab

Covers household- and person-level submodels in ActivitySim sequence order.

### **Auto Ownership** ★

- **Chooser:** Households
- **Alternatives:** 0, 1, 2, 3, 4+
- **Segmented by:** household size, income group, number of workers, geography
- **Parquet:** `auto_ownership.parquet`

### **Work from Home** ★

- **Chooser:** Persons (workers)
- **Alternatives:** work at home, work away from home
- **Segmented by:** income group, age, sex, geography
- **Parquet:** `work_from_home.parquet`

### School Location

- **Chooser:** Persons (students)
- **Alternatives:** TAZs
  - Distance distribution
  - Average distance
- **Segmented by:** school segment (elementary, high school, college/university)
- **Parquet:** `school_location_dist.parquet`

### **Workplace Location** ★

- **Chooser:** Persons (workers)
- **Alternatives:** TAZs
  - Distance distribution
  - Average distance
  - County-to-county (or district) home-workplace flow
- **Segmented by:** none
- **Parquet:** `workplace_location_dist.parquet`, `workplace_od_flows.parquet`

### Transit Pass Subsidy

- **Chooser:** Persons
- **Alternatives:** subsidy, no subsidy
- **Segmented by:** person type
- **Parquet:** `transit_pass_subsidy.parquet`

### Transit Pass Ownership

- **Chooser:** Persons
- **Alternatives:** pass, no pass
- **Segmented by:** person type, income, auto sufficiency (zero autos, autos < workers, autos ≥ workers)
- **Parquet:** `transit_pass_ownership.parquet`

### **Telecommute Frequency** ★

- **Chooser:** Persons (workers)
- **Alternatives:** 1 day, 2 days, 3 days, 4+ days
- **Segmented by:** income group, age, presence of children, sex, occupation, distance to workplace location, geography
- **Parquet:** `telecommute_freq.parquet`

### CDAP (Coordinated Daily Activity Pattern)

- **Chooser:** Persons
- **Alternatives:** mandatory, non-mandatory, home
- **Segmented by:** person type, auto sufficiency, household size
- **Parquet:** `cdap.parquet`

---

## Tour Models Tab

Covers tour generation, destination, and scheduling submodels.

### Mandatory Tour Frequency

- **Chooser:** Persons (students or workers)
- **Alternatives:** number of tours
- **Segmented by:** purpose, person type
- **Parquet:** `mandatory_tour_freq.parquet`

### Mandatory Tour Scheduling

- **Chooser:** Tours
- **Alternatives:** hour
  - Tours by start time (hourly and aggregate time period)
  - Tours by end time (hourly and aggregate time period)
  - Activity duration (hourly)
- **Segmented by:** tour purpose
- **Parquet:** `mandatory_tour_scheduling.parquet`

### Joint Tour Frequency and Composition

- **Chooser:** Households
- **Alternatives:** number of joint tours
- **Segmented by:** purpose
- **Parquet:** `joint_tour_freq.parquet`

### Joint Tour Participation

- **Chooser:** Tours
- **Alternatives:** participate, not participate
- **Segmented by:** none
- **Parquet:** `joint_tour_participation.parquet`

### Joint Tour Destination

- **Chooser:** Tours
- **Alternatives:** TAZs
  - Distance distribution
  - Average distance
- **Segmented by:** none
- **Parquet:** `joint_tour_destination_dist.parquet`

### Joint Tour Scheduling

- **Chooser:** Tours
- **Alternatives:** hour
  - Tours by start time (hourly and aggregate time period)
  - Tours by end time (hourly and aggregate time period)
  - Activity duration (hourly)
- **Segmented by:** purpose
- **Parquet:** `joint_tour_scheduling.parquet`

### Non-Mandatory Tour Frequency

- **Chooser:** Tours
- **Alternatives:** number of tours
- **Segmented by:** purpose, person type
- **Parquet:** `non_mandatory_tour_freq.parquet`

### Non-Mandatory Tour Destination

- **Chooser:** Tours
- **Alternatives:** TAZs
  - Distance distribution
  - Average distance
- **Segmented by:** purpose
- **Parquet:** `non_mandatory_tour_destination_dist.parquet`

### Non-Mandatory Tour Scheduling

- **Chooser:** Tours
- **Alternatives:** hour
  - Tours by start time (hourly and aggregate time period)
  - Tours by end time (hourly and aggregate time period)
  - Activity duration (hourly)
- **Segmented by:** tour purpose
- **Parquet:** `non_mandatory_tour_scheduling.parquet`

### At-Work Subtour Frequency

- **Chooser:** Persons (workers)
- **Alternatives:** number of tours
- **Segmented by:** purpose
- **Parquet:** `atwork_subtour_freq.parquet`

### At-Work Subtour Destination

- **Chooser:** Tours (at-work)
- **Alternatives:** TAZs
  - Distance distribution
  - Average distance
- **Segmented by:** purpose
- **Parquet:** `atwork_subtour_destination_dist.parquet`

### At-Work Subtour Scheduling

- **Chooser:** Tours (at-work)
- **Alternatives:** hour
  - Tours by start time (aggregate time period)
  - Tours by end time (aggregate time period)
- **Segmented by:** none
- **Parquet:** `atwork_subtour_scheduling.parquet`

### Stop Frequency

- **Chooser:** Tours
- **Alternatives:** number of stops
- **Segmented by:** tour purpose, inbound/outbound
- **Parquet:** `stop_frequency.parquet`

---

## Mode Choice Tab

Covers both tour-level and trip-level mode choice — the primary calibration target.

### **Tour Mode Choice** ★

- **Chooser:** Tours
- **Alternatives:** modes
- **Segmented by:** tour purpose, auto sufficiency, person type, sex, income group
- **Parquet:** `tour_mode_share.parquet`

### At-Work Subtour Mode Choice

- **Chooser:** Tours (at-work)
- **Alternatives:** modes
- **Segmented by:** purpose
- **Parquet:** `atwork_subtour_mode.parquet`

### **Trip Mode Choice** ★

- **Chooser:** Trips
- **Alternatives:** modes
- **Segmented by:** purpose, tour mode
- **Parquet:** `trip_mode_share.parquet`

---

## Trip Models Tab

Covers trip-level submodels.

### **Trip Purpose** ★

- **Chooser:** Trips
- **Alternatives:** purposes
- **Segmented by:** tour purpose
- **Parquet:** `trip_purpose.parquet`

### **Trip Destination** ★

- **Chooser:** Trips
- **Alternatives:** TAZs
  - Distance distribution
  - Average distance
- **Segmented by:** purpose
- **Parquet:** `trip_destination_dist.parquet`

### **Trip Scheduling** ★

- **Chooser:** Trips
- **Alternatives:** hour
  - Trips by start time (hourly and aggregate time period)
  - Trips by end time (hourly and aggregate time period)
  - Activity duration (hourly)
- **Segmented by:** trip purpose
- **Parquet:** `trip_scheduling.parquet`

### Zone Trip Ends by Mode (spatial)

Zone-level choropleth of trip productions/attractions split by major mode.
Not a submodel in its own right — a spatial rollup of Trip Mode Choice output
to TAZ/district geography. Complements the Mode Choice tab's segment-level
tables/charts with a map view of where mode splits differ geographically
(e.g. transit-heavy corridors, walk/bike-heavy districts).

- **Chooser:** N/A (aggregation of `trip_mode_share.parquet`, not a discrete
  choice)
- **Alternatives:** major mode (all, motorized, auto, transit, non-motorized,
  walk, bike)
- **Segmented by:** geography (TAZ, small/medium/large district, super
  district), production/attraction end
- **Parquet:** `trip_ends_by_zone_mode.parquet`

---

## Network Tab

Highway assignment validation. Observed data joined at query time from
`observed_counts.parquet`.

| Metric | Parquet file | Observed source |
|---|---|---|
| Screenline volumes vs observed AADT | `screenlines.parquet` | `observed_counts.parquet` |
| VMT by facility type | `vmt_by_facility.parquet` | — |
| VMT by home TAZ (zone map) | `vmt_by_home_taz.parquet` | — |
| O-D desire lines | `od_flows.parquet` | — |
| Home-workplace flows (county-to-county) | `workplace_od_flows.parquet` | — |

**`od_flows.parquet`/`workplace_od_flows.parquet` need zone-centroid
lat/lon joined in at post-processor build time, not left for the
browser to resolve.** `docs/GRAMMAR.md`'s `type: flowmap` grammar reads
origin/destination coordinates as plain columns already present on each
row (`origin_lat`/`origin_lon`/`dest_lat`/`dest_lon`, author-configurable
field names) — corrected there after finding neither real WFRC reference
app (`APP-Commute-Explorer`, `APP-WFRC-Commute-Patterns`) does a live
GeoParquet/DuckDB-spatial zone join in the browser; both simply carry
resolved lat/lon on the flow data itself. Whenever the actual Python
post-processor (`summarize.py`, still not built — `python/
wftdm_dashboard/` currently holds only `__init__.py`) is implemented,
its `sql_fragments` for these two metrics will need to join each
origin/destination TAZ (or district) to a zone-centroid lookup as part
of that offline build, the same "all geometry conversion happens
offline" split every other geometry-bearing Parquet file in this system
already follows — flagged here now so the expectation isn't lost between
this correction and whenever that post-processor work actually happens.

### Land Use / Socioeconomics

Not a submodel — this is zone-level input data (`land_use.csv`), displayed for
context alongside modeled output. Useful for sanity-checking a scenario's
socioeconomic assumptions (e.g. a horizon-year land use forecast) and for
explaining spatial patterns seen in other tabs (e.g. why a district's auto
ownership or mode share looks the way it does).

- **Chooser:** N/A (input, not modeled)
- **Attributes:** population, households, owned vehicles, total workers,
  employment (3-category and 12-category), average income, K-12 school
  enrollment
- **Segmented by:** geography (TAZ, small/medium/large district, super
  district)
- **Parquet:** `land_use_summary.parquet`

### Accessibility ("Access to Opportunities")

Zone-level output of ActivitySim's `accessibility` component (auto/transit
logsum-based accessibility to jobs and households). Not a calibration target
in the usual sense (no observed counterpart) but useful for explaining
destination-choice and mode-choice patterns spatially — e.g. why a zone's
non-mandatory tour destinations skew short, or why transit mode share is
higher in one district than another.

- **Chooser:** N/A (zone-level model output, not a discrete choice)
- **Attributes:** access to jobs, access to households, combined access to
  jobs + households
- **Segmented by:** geography (TAZ, small/medium/large district, super
  district), mode (auto, transit)
- **Parquet:** `accessibility.parquet`

---

## Summary — All Parquet Files

Complete inventory of files produced by the post-processor, one row per file.
★ = Level 1 (also shown on topsheet or summary tab).

| Parquet file | Submodel | Tab |
|---|---|---|
| `summary_kpis.parquet` ★ | High-level | Topsheet + Summary |
| `auto_ownership.parquet` ★ | Auto Ownership | Person/HH |
| `work_from_home.parquet` ★ | Work from Home | Person/HH |
| `school_location_dist.parquet` | School Location | Person/HH |
| `workplace_location_dist.parquet` ★ | Workplace Location | Person/HH |
| `workplace_od_flows.parquet` ★ | Workplace Location | Person/HH + Network |
| `transit_pass_subsidy.parquet` | Transit Pass Subsidy | Person/HH |
| `transit_pass_ownership.parquet` | Transit Pass Ownership | Person/HH |
| `telecommute_freq.parquet` ★ | Telecommute Frequency | Person/HH |
| `cdap.parquet` | CDAP | Person/HH |
| `mandatory_tour_freq.parquet` | Mandatory Tour Frequency | Tour |
| `mandatory_tour_scheduling.parquet` | Mandatory Tour Scheduling | Tour |
| `joint_tour_freq.parquet` | Joint Tour Frequency | Tour |
| `joint_tour_participation.parquet` | Joint Tour Participation | Tour |
| `joint_tour_destination_dist.parquet` | Joint Tour Destination | Tour |
| `joint_tour_scheduling.parquet` | Joint Tour Scheduling | Tour |
| `non_mandatory_tour_freq.parquet` | Non-Mandatory Tour Frequency | Tour |
| `non_mandatory_tour_destination_dist.parquet` | Non-Mandatory Tour Destination | Tour |
| `non_mandatory_tour_scheduling.parquet` | Non-Mandatory Tour Scheduling | Tour |
| `atwork_subtour_freq.parquet` | At-Work Subtour Frequency | Tour |
| `atwork_subtour_destination_dist.parquet` | At-Work Subtour Destination | Tour |
| `atwork_subtour_scheduling.parquet` | At-Work Subtour Scheduling | Tour |
| `stop_frequency.parquet` | Stop Frequency | Tour |
| `tour_mode_share.parquet` ★ | Tour Mode Choice | Mode Choice |
| `atwork_subtour_mode.parquet` | At-Work Subtour Mode Choice | Mode Choice |
| `trip_mode_share.parquet` ★ | Trip Mode Choice | Mode Choice |
| `trip_purpose.parquet` ★ | Trip Purpose | Trip |
| `trip_destination_dist.parquet` ★ | Trip Destination | Trip |
| `trip_scheduling.parquet` ★ | Trip Scheduling | Trip |
| `trip_ends_by_zone_mode.parquet` | Zone Trip Ends by Mode (spatial) | Trip |
| `screenlines.parquet` | Network Assignment | Network |
| `vmt_by_facility.parquet` | Network Assignment | Network |
| `vmt_by_home_taz.parquet` | Network Assignment | Network |
| `od_flows.parquet` | O-D Flows | Network |
| `land_use_summary.parquet` | Land Use (input, not modeled) | Network |
| `accessibility.parquet` | Accessibility | Network |

**Total: 36 Parquet files**

---

## Standard Segmentation Definitions

These segmentations appear across multiple submodels and are defined once in
`summarize.yaml` under `bins:` and `sql_fragments:`, then referenced as
`$bins.x` or inline CASE expressions throughout all metric SQL.

| Segmentation | Definition |
|---|---|
| **Income group** | Very Low (<$25k), Low ($25k–$50k), Medium ($50k–$75k), High ($75k–$100k), Very High (>$100k) |
| **Auto sufficiency** | Zero Autos / Autos < Workers / Autos ≥ Workers |
| **Geography** | Four levels, all joined from zone lookup via home TAZ: TAZ, small district, medium district, large district, super district (county) |
| **Person type** | Full-time worker, part-time worker, university student, driving-age student, non-driving student, retired, non-worker |
| **School segment** | Elementary, high school, college/university |
| **Major mode** | SOV, HOV, Transit, Non-Motorized, Ride Hail |
| **Time period** | EA (early AM), AM, MD (midday), PM, EV (evening) |
| **Distance bin** | 0.5-mile intervals (spaced_intervals, lower = 0) |

> **Geography segmentation:** Four levels are available for all geography-segmented submodels — TAZ, small district, medium district, large district, and super district (county). All four are joined from the zone lookup table via the home TAZ ID and available as columns in `trips_merged`, `tours_merged`, and `persons_merged`. The zone lookup table (`land_use.parquet` or a dedicated `zones.parquet`) must include columns `taz_id`, `small_district`, `medium_district`, `large_district`, `super_district` for this to work. For most calibration summaries, **super district (county)** is the appropriate geography level — TAZ-level segmentation is typically too granular for mode choice or auto ownership summaries and is reserved for spatial map panels.
