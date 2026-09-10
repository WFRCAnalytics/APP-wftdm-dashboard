# Phase 1 Data Model: Six-Tab ActivitySim Demo Content

## §1. Submodel Summary Audit — full computability inventory

Status legend: **✅** computable now · **⚠** partially computable (caveat
noted) · **❌** not computable (real, confirmed gap — reported in
`project-docs/CALIBRATION-SUMMARIES.md`, not built). Evidence is the real source
checked directly (`research.md` §1-§2).

### Summary Tab

| Submodel Summary | Status | Target metric | Evidence |
|---|---|---|---|
| **Total households/persons/tours/trips** ★ | ✅ | `summary_kpis` (existing) | Already real, reused unmodified |
| **Average trip distance by purpose** ★ | ✅ | `trip_distance_by_purpose` (new) | Real haversine distance between real origin/destination zone centroids, averaged by `primary_purpose` — its own small per-purpose table, not a `summary_kpis` scalar |
| **Total trips by purpose** ★ | ✅ | `trip_purpose_share` (existing) | Already real, reused unmodified |
| **Total trips by mode** ★ | ✅ | `trip_mode_share` (existing) | Already real, reused unmodified |
| **VMT** ★ | ✅ | `summary_kpis` (extended) | NEW column: SUM(real centroid-distance × trip count) — a real, computed straight-line VMT proxy, disclosed as such |

### Person / Household Models Tab

| Submodel Summary | Status | Target metric | Evidence |
|---|---|---|---|
| **Auto Ownership** ★ | ✅ | `auto_ownership_summary` | `households.auto_ownership` (real column, values 0-4+) |
| **Work from Home** ★ | ❌ | — | `work_from_home` component absent from real `configs/settings.yaml` `models:` list; no such column in `final_persons.csv` |
| School Location | ✅ | `school_location_summary` | `persons.distance_to_school` + `school_segment` (both real columns), filtered to `is_student` |
| **Workplace Location** ★ | ✅ | `workplace_location_summary` + `workplace_od_flows` | `persons.distance_to_work` + `workplace_zone_id` (real); DISTRICT-to-DISTRICT flow via `land_use` join |
| Transit Pass Subsidy | ❌ | — | Component absent from real `models:` list; no such column anywhere in real output |
| Transit Pass Ownership | ❌ | — | Same as above |
| **Telecommute Frequency** ★ | ❌ | — | Component absent from real `models:` list; no such column in `final_persons.csv` |
| CDAP | ✅ | `cdap_summary` | `persons.cdap_activity` (real column: M/N/H) |

### Tour Models Tab

| Submodel Summary | Status | Target metric | Evidence |
|---|---|---|---|
| Mandatory Tour Frequency | ✅ | `mandatory_tour_freq_summary` | `persons.mandatory_tour_frequency` (real column) |
| Mandatory Tour Scheduling | ✅ | `mandatory_tour_scheduling` | `tours` filtered `tour_category='mandatory'`, real `start`/`end`/`duration` |
| Joint Tour Frequency and Composition | ✅ | `joint_tour_freq_summary` | `households.joint_tour_frequency` + `num_hh_joint_tours` (real) |
| Joint Tour Participation | ⚠ | `joint_tour_participation_summary` | Real `final_joint_tour_participants.csv` + `tours.number_of_participants` give participant counts, not a literal per-eligible-person binary choice table |
| Joint Tour Destination | ✅ | `joint_tour_destination_summary` | `tours` filtered `tour_category='joint'` + real centroid-distance computation |
| Joint Tour Scheduling | ✅ | `joint_tour_scheduling` | `tours` filtered `tour_category='joint'`, real `start`/`end`/`duration` |
| Non-Mandatory Tour Frequency | ✅ | `non_mandatory_tour_freq_summary` | `persons.non_mandatory_tour_frequency` + the real per-purpose `num_*_tours` columns |
| Non-Mandatory Tour Destination | ✅ | `non_mandatory_tour_destination_summary` | `tours` filtered `tour_category='non_mandatory'` + real centroid-distance |
| Non-Mandatory Tour Scheduling | ✅ | `non_mandatory_tour_scheduling` | `tours` filtered `tour_category='non_mandatory'`, real `start`/`end`/`duration` |
| At-Work Subtour Frequency | ✅ | `atwork_subtour_freq_summary` | `tours.atwork_subtour_frequency` (real, on parent work tours) |
| At-Work Subtour Destination | ✅ | `atwork_subtour_destination_summary` | `tours` filtered `tour_category='atwork'` + real centroid-distance |
| At-Work Subtour Scheduling | ✅ | `atwork_subtour_scheduling` | `tours` filtered `tour_category='atwork'`, real `start`/`end` |
| Stop Frequency | ✅ | `stop_frequency_summary` | `tours.stop_frequency` (real `"Nout_Min"`-pattern column, confirmed real values e.g. `"0out_0in"`..`"3out_3in"`) |

### Mode Choice Tab

| Submodel Summary | Status | Target metric | Evidence |
|---|---|---|---|
| **Tour Mode Choice** ★ | ✅ | `tour_mode_share_summary` | `tours.tour_mode` (real, all tour categories) |
| At-Work Subtour Mode Choice | ✅ | `atwork_subtour_mode_summary` | `tours` filtered `tour_category='atwork'`, real `tour_mode` |
| **Trip Mode Choice** ★ | ✅ | `trip_mode_share`/`mode_share_by_period` (existing) + `purpose_mode_flow` (existing, now published) | Already real, reused unmodified |

### Trip Models Tab

| Submodel Summary | Status | Target metric | Evidence |
|---|---|---|---|
| **Trip Purpose** ★ | ✅ | `trip_purpose_share` (existing) | Already real, reused unmodified |
| **Trip Destination** ★ | ✅ | `trip_destination_summary` | `trips.origin`/`destination` (real) + real centroid-distance |
| **Trip Scheduling** ★ | ✅ | `trip_scheduling` | `trips.depart` (real) + `tours.start`/`end`/`duration` (real) |
| Zone Trip Ends by Mode (spatial) | ✅ | `trip_ends_by_zone_mode` | Rollup of real `trips.origin`/`destination` × `$mappings.major_trip_mode`, by `zone_id`/`DISTRICT` |

### Network Tab

| Submodel Summary | Status | Target metric | Evidence |
|---|---|---|---|
| Screenline volumes vs observed AADT | ❌ | — | No traffic-assignment step anywhere in this pipeline's real output (`write_trip_matrices` produces zone-to-zone trip demand, not assigned link volumes); no real observed-AADT dataset exists for this synthetic system |
| VMT by facility type | ❌ | — | Same real gap — no link/facility-type assignment output exists |
| VMT by home TAZ (zone map) | ✅ | `vmt_by_home_taz` | Real trip distance (centroid-based) summed by real `households.home_zone_id` |
| O-D desire lines | ✅ | `od_flows` (existing, was pending publication) | Already real and correct; published for the first time by this feature |
| Home-workplace flows (county-to-county) | ✅ | `workplace_od_flows` | Real `home_zone_id`/`workplace_zone_id` joined to `land_use.DISTRICT` twice |
| Land Use / Socioeconomics | ✅ | `land_use_summary` | Real `final_land_use.csv` columns + real household aggregates (avg income, avg auto ownership) joined by `home_zone_id` |
| Accessibility | ✅ | `accessibility_summary` | Real `final_accessibility.csv` columns, zone-level |

**Result**: 34 of 40 documented summary rows are genuinely computable (one
with a stated partial-computability caveat); 6 are real, confirmed gaps —
2 of them Level-1/starred (Work from Home, Telecommute Frequency).

## §2. New `summarize.yaml` mechanisms (existing grammar only)

| Entry | Kind | Shape |
|---|---|---|
| `mappings.person_type` | `mappings` | Maps real `ptype` (1-8) to the 8 real ActivitySim person-type labels (7 `CALIBRATION-SUMMARIES.md` already names + the real 8th, pre-school child) |
| `bins.income_group` | `bins`, `manual_breaks` | Real household `income`, boundaries matching `CALIBRATION-SUMMARIES.md`'s existing income-group definition |
| `sql_fragments.trip_distance_miles` (or inlined per-metric) | `sql_fragments` | Haversine expression over two `zone_centroids` references — real straight-line distance in miles between two real zone centroids |

## §3. New metrics — one row per new Parquet output

Each reuses `sources`/`sql_fragments.trips_merged`/`sql_fragments.zone_centroids`
already in `summarize.yaml`; none needs a new `sources:` entry.

| Metric name | Tab | Grain | Key real columns used |
|---|---|---|---|
| `trip_distance_by_purpose` | Summary | purpose | `trips.primary_purpose` + centroid-distance |
| `auto_ownership_summary` | Person/HH | household × segment | `auto_ownership`, `hhsize`, `income_group` (new bin), `num_workers`, `home DISTRICT` |
| `school_location_summary` | Person/HH | student × segment | `distance_to_school`, `school_segment` |
| `workplace_location_summary` | Person/HH | worker | `distance_to_work`, `workplace_zone_id` |
| `workplace_od_flows` | Person/HH + Network | home DISTRICT × workplace DISTRICT | `home_zone_id`, `workplace_zone_id` joined to `land_use.DISTRICT` twice |
| `cdap_summary` | Person/HH | person × segment | `cdap_activity`, `ptype` (via new `person_type` mapping), auto-sufficiency (derived from `auto_ownership`/`num_workers`), `hhsize` |
| `person_household_profile` | Person/HH (`graphic-walker`) | one row per person | `auto_ownership`, `hhsize`, `income_group`, `ptype`→`person_type`, `sex`, `age`, home `DISTRICT`, `workplace_zone_id`, `school_zone_id`, `cdap_activity`, `mandatory_tour_frequency`, `num_workers` |
| `mandatory_tour_freq_summary` | Tour | person × purpose | `mandatory_tour_frequency` |
| `mandatory_tour_scheduling` | Tour | tour (mandatory) | `start`, `end`, `duration`, `primary_purpose` |
| `joint_tour_freq_summary` | Tour | household × purpose | `joint_tour_frequency`, `num_hh_joint_tours` |
| `joint_tour_participation_summary` | Tour | tour (joint) | `final_joint_tour_participants` count + `tours.number_of_participants` |
| `joint_tour_destination_summary` | Tour | tour (joint) | `destination` + centroid-distance |
| `joint_tour_scheduling` | Tour | tour (joint) | `start`, `end`, `duration` |
| `non_mandatory_tour_freq_summary` | Tour | person × purpose | `non_mandatory_tour_frequency`, `num_escort_tours`, `num_eatout_tours`, `num_shop_tours`, `num_maint_tours`, `num_discr_tours`, `num_social_tours` |
| `non_mandatory_tour_destination_summary` | Tour | tour (non-mandatory) | `destination` + centroid-distance, `primary_purpose` |
| `non_mandatory_tour_scheduling` | Tour | tour (non-mandatory) | `start`, `end`, `duration`, `primary_purpose` |
| `atwork_subtour_freq_summary` | Tour | tour (mandatory, parent) | `atwork_subtour_frequency` |
| `atwork_subtour_destination_summary` | Tour | tour (atwork) | `destination` + centroid-distance |
| `atwork_subtour_scheduling` | Tour | tour (atwork) | `start`, `end` |
| `stop_frequency_summary` | Tour | tour × purpose | `stop_frequency`, `primary_purpose` |
| `tour_mode_share_summary` | Mode Choice | tour × segment | `tour_mode`, `primary_purpose`, auto-sufficiency, `person_type`, `sex`, `income_group` |
| `atwork_subtour_mode_summary` | Mode Choice | tour (atwork) | `tour_mode`, `primary_purpose` |
| `trip_destination_summary` | Trip | trip × purpose | `origin`/`destination` + centroid-distance, `primary_purpose` |
| `trip_scheduling` | Trip | trip/tour × purpose | `trips.depart`, `tours.start`/`end`/`duration` |
| `trip_ends_by_zone_mode` | Trip | zone/DISTRICT × mode × P/A end | `origin`, `destination`, `$mappings.major_trip_mode` |
| `land_use_summary` | Network | zone/DISTRICT | `final_land_use` columns + household aggregates (avg income, avg auto ownership) |
| `accessibility_summary` | Network | zone | `final_accessibility` columns, unmodified |
| `vmt_by_home_taz` | Network | home zone/DISTRICT | `home_zone_id` + centroid-distance × trip count |

**Reused, unmodified except one new scalar column**: `summary_kpis`
(gains one new `total_vmt` scalar column — the average-trip-distance-by-
purpose summary is its own new metric, `trip_distance_by_purpose`, listed
above, not a `summary_kpis` column, since it's a per-purpose table rather
than a single scalar), `trips_by_destination_zone`, `mode_share_by_period`,
`trip_mode_share`, `trip_purpose_share`, `purpose_mode_flow`, `od_flows`
(the last two: SQL unchanged from `031`, simply run and published for the
first time by this feature).

**Validation rules** (apply project-wide, matching `031`'s own established
conventions):
- Every `*_summary`/`*_share` metric's grouped counts sum to the real
  total row count of its filtered population (no silent row loss).
- Every centroid-distance computation joins `sql_fragments.zone_centroids`
  by exact `zone_id` equality — a trip/tour referencing a zone ID outside
  1-25 would silently drop from that metric (per §3 of `research.md`, this
  is proven to never occur in this model's real data, but the join shape
  itself doesn't newly assume it).
- `land_use_summary`'s household-derived aggregates (avg income, avg auto
  ownership) are computed by joining `households.home_zone_id` back to
  `land_use.zone_id`, not read directly from `land_use` (which carries no
  income/auto-ownership columns of its own).

## §4. Dashboard Tab entity (six tabs, real content only)

| Tab (file) | Sections (sidebar sub-nav, per `030-sidebar-navigation`) | Panel types used |
|---|---|---|
| `dashboard-1-summary.yaml` | none (single flat KPI + chart row, matching the existing Summary-tab convention) | `valuebox`, `recharts`, `plotly` |
| `dashboard-2-person-household.yaml` | Auto Ownership, Work from Home (gap note), School Location, Workplace Location, Transit Pass (gap note), Telecommute Frequency (gap note), CDAP | `table`, `observable-plot`, `markdown`, `graphic-walker`, `plotly` |
| `dashboard-3-tour-models.yaml` | Mandatory Tour Frequency/Scheduling, Joint Tour Frequency/Participation/Destination/Scheduling, Non-Mandatory Tour Frequency/Destination/Scheduling, At-Work Subtour Frequency/Destination/Scheduling, Stop Frequency | `plotly`, `table`, `observable-plot` |
| `dashboard-4-mode-choice.yaml` | Tour Mode Choice, At-Work Subtour Mode Choice, Trip Mode Choice | `sankey`, `plotly`, `recharts`, `table` |
| `dashboard-5-trip-models.yaml` | Trip Purpose, Trip Destination, Trip Scheduling, Zone Trip Ends by Mode | `table`, `observable-plot`, `plotly`, `zonemap` |
| `dashboard-6-network.yaml` | Screenline/VMT-by-facility (gap note), VMT by Home TAZ, O-D Desire Lines, Home-Workplace Flows, Land Use, Accessibility | `markdown`, `zonemap`, `flowmap`, `table`, `valuebox` |

`dashboard-5-explore.yaml` is unaffected — not listed above (`research.md`
§6). Sections use the real `030-sidebar-navigation` `sections:` grammar —
jump-navigation labels over rows already in normal top-to-bottom layout
order, not a collapsing/hiding mechanism (matching how that mechanism
already works today, per `spec.md`'s own Assumptions).

Every "gap note" section above is a `markdown` panel stating the specific
real reason a documented submodel isn't shown (per FR-009) — it is a
section with content explaining an absence, never an empty/fabricated
panel standing in for the missing submodel itself.
