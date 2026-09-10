# Phase 0 Research: Six-Tab ActivitySim Demo Content

All findings below were resolved directly against real, already-existing
artifacts from this same session — not assumed, and not re-derived from
`project-docs/GRAMMAR.md`/`CLAUDE.md` prose alone.

## 1. The three real ActivitySim runs already exist in this session — reused, not re-run

**Decision**: Reuse the real raw ActivitySim `prototype_mtc` output already
produced earlier this same session, at
`<scratchpad>/wftdm-scenario-outputs/{baseline,density-variant,transit-variant}/output/`,
rather than re-running ActivitySim from scratch.

**Rationale**: Directly confirmed, not assumed:

- All three scenarios' `final_checkpoints.csv` have exactly **33 rows**
  each — identical checkpoint counts, confirming all three runs completed
  every step in `configs/settings.yaml`'s real `models:` list
  (`initialize_landuse` through `write_tables`/`summarize`) with no
  truncated run.
- All three share the same synthetic population base (5,000 households,
  8,212 persons) — tour/trip counts differ slightly between scenarios
  (9,806/9,807/9,811 tours; 23,583/23,583/23,599 trips) exactly as expected
  from a real behavioral response to the two applied edits, not from a
  different population.
- **Density-variant edit, directly re-confirmed** by comparing TAZ 1's real
  `final_land_use.csv` row between `baseline` and `density-variant`:
  `TOTEMP` 27,318 → 38,245 (+40.0%), `RETEMPN` 224 → 314 (+40.2%),
  `FPSEMPN` 21,927 → 30,698 (+40.0%), `HEREMPN` 2,137 → 2,992 (+40.0%),
  `OTHEMPN` 2,254 → 3,156 (+40.0%), `AGREMPN` 18 → 25 (+38.9%, rounding),
  `MWTEMPN` 758 → 1,061 (+40.0%) — the exact edit `spec.md` FR-005 requires,
  confirmed present, not assumed carried over.
- **Transit-variant edit, directly re-confirmed** via real trip-level
  aggregation of `final_trips.csv` (not the config file, which is not
  present in the retained raw-output tree — the *effect* is the same
  verification signal `026`/`031` already established as sufficient):
  real WALK_LOC mode share among AM-period trips (`depart` in `[5,9)`) rose
  from 19.55% (baseline) to 20.56% (transit-variant); PM-period
  (`depart` in `[15,18)`) rose from 19.34% to 20.52% — the same real,
  directionally-correct AM/PM increase this project's own prior demo-
  content features already established and rely on for their causal
  story (`CLAUDE.md`'s `026-activitysim-demo-content` entry).

Re-running ActivitySim from scratch (a multi-minute-to-multi-hour process
depending on the environment) would risk landing on *different* real
numbers without changing the underlying causal story at all — the spec's
own Assumptions section already accepts this (exact reproduction of prior
values isn't required). Reusing the already-verified, already-real output
sitting in this session's own scratchpad is strictly safer and faster,
with zero loss of authenticity: every number in it is still a genuine
ActivitySim output, just not re-computed a second time for no benefit.

**Alternatives considered**: Re-run ActivitySim fresh, from a clean
install. Rejected — no new information would result (same config, same
edits, same synthetic population), and it introduces real risk (a fresh
run could hit a transient environment issue, take a long time, or --
since ActivitySim's mode/destination choice components are stochastic --
produce a materially different random draw that, while still valid, would
need re-verifying from scratch for no gain over output already sitting
on disk and already directly re-confirmed above).

## 2. Real submodel computability audit — methodology and headline findings

**Decision**: Audited every submodel `project-docs/CALIBRATION-SUMMARIES.md`
documents against three real, directly-inspected sources: (a) the real
`configs/settings.yaml` `models:` list (which submodels actually ran at
all), (b) real CSV column headers from `final_households.csv`/
`final_persons.csv`/`final_tours.csv`/`final_trips.csv`/
`final_land_use.csv`/`final_accessibility.csv`/
`final_joint_tour_participants.csv`, and (c) real column *values* where a
column's presence alone didn't settle computability (e.g. `tour_category`
distinct values, `ptype` range, zone-id coverage).

**Full computability inventory**: see `data-model.md` §1 for the
complete, per-submodel table. Headline results:

- **6 real, confirmed gaps** — submodels genuinely not computable from
  this run, because the underlying ActivitySim component never executed
  (confirmed absent from `settings.yaml`'s real `models:` list) or the
  needed output category doesn't exist at all in this pipeline:
  **Work from Home★**, **Telecommute Frequency★** (both Level-1/starred —
  flagged prominently, not silently dropped), **Transit Pass Subsidy**,
  **Transit Pass Ownership**, **Screenline volumes vs observed AADT**,
  **VMT by facility type** (the last two: no network/traffic-assignment
  step exists anywhere in this pipeline — ActivitySim's own
  `write_trip_matrices` step produces zone-to-zone trip *demand* matrices,
  never link-level assigned volumes, and no `observed_counts`-equivalent
  reference dataset exists for this synthetic 25-zone system).
- **1 partial-computability nuance**: Joint Tour Participation's
  documented "chooser: Tours, alternatives: participate / not participate"
  framing describes a per-eligible-person binary choice that isn't stored
  as such in the real output — only the realized participant list
  (`final_joint_tour_participants.csv`) and each tour's
  `number_of_participants` count are. Computable at the
  participant-count/aggregate level; not as a literal per-eligible-person
  binary table. Documented as a caveat, not a full exclusion.
- **Everything else documented** — all remaining submodels across all six
  tabs — **is genuinely computable** from real columns already present in
  this run's output, confirmed column-by-column in `data-model.md` §1.
- **Geography segmentation is narrower than documented**: real
  `final_land_use.csv` has `DISTRICT`, `SD`, and `county_id` — not the
  four-level `small_district`/`medium_district`/`large_district`/
  `super_district` set `CALIBRATION-SUMMARIES.md`'s own "Standard
  Segmentation Definitions" section describes. Every geography-segmented
  summary in this feature uses `zone_id` (TAZ) and `DISTRICT` only
  (treating `SD` as the closest real equivalent of "super district" where
  a coarser rollup is wanted) — the finer small/medium/large-district
  distinction this pipeline's real land use data doesn't carry is
  reported as a gap, not fabricated.
- **A real, minor doc gap, found incidentally**: `CALIBRATION-SUMMARIES.md`'s
  own "Person type" segmentation list (Full-time worker, part-time worker,
  university student, driving-age student, non-driving student, retired,
  non-worker — 7 categories) omits the real 8th ActivitySim `ptype` value
  actually present in this output (pre-school child, `ptype` 8, confirmed
  via direct value inspection: `ptype` ranges 1-8 in real `final_persons.csv`).
  Corrected in the same `project-docs/CALIBRATION-SUMMARIES.md` update this feature
  already makes for the 6 real gaps above.

**Rationale for auditing this way, not by category assumption**: this
project's own established discipline (`025`/`026`/`031`) is to confirm
column-level reality directly rather than trust the reference doc's prose
— the doc itself was written before any real ActivitySim run existed and
was already found to contain at least one illustrative-only convention
(`026`'s own Research Finding #3). The same discipline applies here.

**Alternatives considered**: Attempting to *enable* the four missing
Level-2 components (Transit Pass Subsidy/Ownership) or even the two
missing Level-1 ones (Work from Home, Telecommute Frequency) by adding
the necessary extra ActivitySim config/spec assets. Rejected for this
feature — confirmed directly that none of these four appear anywhere in
the real, installed `configs/settings.yaml` `models:` list, meaning
enabling them requires locating (or authoring) each component's own
model-spec CSV/YAML files, a nontrivial and open-ended research task with
no guarantee prototype_mtc's example bundle even ships them, that would
also require a fresh multi-scenario ActivitySim re-run afterward. The
non-negotiable "report plainly, don't invent a substitute" constraint
(spec.md's Hard Constraint) is satisfied by documenting the real gap, not
by expanding this feature's scope to chase four additional submodels with
uncertain feasibility.

## 3. Zone/geometry coverage is exact, not partial

**Decision**: No new zone-geometry work is needed. `31-all-panel-demo-
content`'s existing `public/demo-geometry/taz25.geoparquet` and
`summarize.yaml`'s existing `sql_fragments.zone_centroids` (25 rows,
zones 1-25) already cover **100%** of this model's real zone system.

**Rationale**: Directly confirmed — `final_land_use.csv` has exactly 25
real zone rows (zone IDs 1-25) in all three scenarios, and every real
trip's `origin`/`destination` value in `final_trips.csv` falls within that
same 1-25 range (confirmed by extracting the full distinct set of touched
zone IDs from real trip data: exactly `{1..25}`, no zone outside it). This
`prototype_mtc` configuration is genuinely a small, 25-zone example system
in its entirety — not a subset the earlier features carved out of a much
larger real region. Every distance-dependent summary this feature adds
(trip/tour destination distance, VMT-by-home-TAZ, O-D flows) can therefore
use real straight-line distance between real zone centroids for **every**
real origin/destination pair, with no coverage gap and no need to extend
the geometry script or re-fetch anything from MTC's FeatureServer.

**Alternatives considered**: Re-running `scripts/build-demo-zone-
geometry.py` against a wider zone range "just in case." Rejected —
directly disproven as necessary by the zone-coverage check above.

## 4. Distance computation for submodels with no precomputed distance column

**Decision**: `final_persons.csv` already carries precomputed
`distance_to_school`/`distance_to_work` columns (real ActivitySim logsum-
adjacent outputs) — used directly, unchanged, for School Location and
Workplace Location. No other real output table (tours, trips) carries a
precomputed distance column. For every other distance-dependent summary
(Joint/Non-Mandatory/At-Work Subtour Destination, Trip Destination, VMT by
home TAZ), distance is computed as the real great-circle distance between
the real origin and destination zone centroids already in
`sql_fragments.zone_centroids` — the same join shape `od_flows` already
uses (two aliased references to the same fragment), with a standard
haversine expression over each pair's real `lat`/`lon`.

**Rationale**: This is a real, honestly-computed value from real
coordinates — not a fabricated placeholder — but it IS a straight-line
proxy, not a network-path distance (this pipeline has no traffic
assignment / path-building step in its output, per §2's network-tab
findings). Every panel and `CALIBRATION-SUMMARIES.md` entry that uses this
computation says so explicitly (a one-line "straight-line distance between
zone centroids" note), so a reader never mistakes it for a modeled network
distance.

**Alternatives considered**: Reading distance from the real OMX skim
matrices (`trips_am.omx`, etc.) sitting alongside each scenario's raw
output. Rejected — those are real, but they are *trip* matrices (a
`write_trip_matrices` step output — the number of trips by mode/period
between zone pairs), not level-of-service distance skims; the actual
distance/time skims ActivitySim's own choice models consumed live further
upstream, in `data/` input skims not carried into any scenario's `output/`
folder, and pulling them in would mean reading yet another real artifact
outside this feature's already-confirmed-available scope for uncertain
benefit over the already-real, already-available centroid-distance
approach.

## 5. New segmentation mechanisms needed (existing `$mappings`/`$bins` grammar, no new engine code)

**Decision**: Two new `summarize.yaml` entries, both using existing,
unmodified grammar:

- `mappings.person_type` — maps the real numeric `ptype` (1-8) to the 8
  real ActivitySim person-type labels (the 7 `CALIBRATION-SUMMARIES.md`
  already names, plus the real 8th value found in §2's audit: pre-school
  child) — same shape as the existing `mappings.major_trip_mode`.
- `bins.income_group` — a new `manual_breaks` bin over real household
  `income` (or `income_in_thousands`), boundaries matching
  `CALIBRATION-SUMMARIES.md`'s own already-documented income-group
  definition (<$25k / $25-50k / $50-75k / $75-100k / >$100k) — same shape
  as the existing `bins.time_of_day_period`.

**Rationale**: Both are direct instances of this project's existing,
already-proven `$mappings`/`$bins` grammar (`FR-010`) — no new
post-processor engine code, matching `025`'s own confirmed generic design.

## 6. Dashboard file renumbering — six new/rewritten tabs, Explore untouched by filename too

**Decision**:
- Delete `dashboard-1-overview.yaml`, `dashboard-2-destination-choice.yaml`,
  `dashboard-3-transit-service.yaml` outright (FR-001).
- Author `dashboard-1-summary.yaml`, `dashboard-2-person-household.yaml`,
  `dashboard-3-tour-models.yaml`, `dashboard-4-mode-choice.yaml`,
  `dashboard-5-trip-models.yaml` as five new files.
- **Rename+rewrite** the existing `dashboard-4-network.yaml` (031's
  narrower Network tab) to `dashboard-6-network.yaml`, with the full,
  much larger Network tab content this feature adds — its old content is
  superseded, not preserved, matching FR-001's "no preservation" framing
  extended consistently to this file too since its own scope is being
  entirely redefined by the new six-tab structure.
- Dissolve `dashboard-6-flows.yaml` (031's unpublished sankey/flowmap
  staging file) — delete it; its two panels are folded into
  `dashboard-4-mode-choice.yaml` (sankey) and `dashboard-6-network.yaml`
  (flowmap) respectively (FR-011).
- **`dashboard-5-explore.yaml` keeps its exact current filename**, left
  byte-for-byte unmodified, even though its real position in the new
  `index.json` order becomes 7th (last), not 5th. `index.json`'s array
  order — not any filename's numeric prefix — is what actually controls
  tab display order (`CLAUDE.md`'s own Navigation model section: "an
  array of `dashboard-*.yaml` filenames, in display order"), so this is a
  purely cosmetic filename/position mismatch, not a functional one.
  Renaming the file (even with byte-identical content) was considered and
  rejected as an unnecessary literal change to a file the spec explicitly
  says to leave "exactly as-is" (FR-004) — a `git mv` is still a change
  to the file's identity that the safest reading of that requirement
  avoids entirely.

**Rationale**: Keeps every real file's name aligned with its real content
and position wherever the content is genuinely new/rewritten, while
taking the most literal, safest interpretation of "leave Explore exactly
as-is" for the one file that's explicitly out of scope.

**Alternatives considered**: Renumbering Explore to
`dashboard-7-explore.yaml` for cosmetic filename/position consistency.
Rejected — not worth even a content-preserving rename against an explicit
"exactly as-is" instruction, when the app's actual behavior doesn't depend
on the filename number at all.

## 7. Panel-type-to-submodel assignment (FR-012/FR-013)

**Decision**: All ten registered panel types are used at least once across
the six tabs, each chosen for a genuine data-shape fit:

| Panel type | Tab | Real data it renders |
|---|---|---|
| `valuebox` | Summary | Total households/persons/tours/trips, VMT (KPI cards) |
| `recharts` | Summary | Total trips by mode (bar) |
| `table` | Person/Household Models | Auto Ownership distribution by segment |
| `observable-plot` | Person/Household Models | School/Workplace Location distance distribution (histogram, reactive by segment) |
| `markdown` | Person/Household Models | Honest note on the 4 real gaps in this tab (Work from Home, Telecommute, Transit Pass ×2) |
| `plotly` | Tour Models | Mandatory/Non-Mandatory/Joint tour scheduling (start/end time distributions) |
| `sankey` | Mode Choice | `purpose_mode_flow` — real purpose × grouped-mode flow |
| `graphic-walker` | Person/Household Models | Open-ended exploration of a new real, rich `person_household_profile` dataset |
| `zonemap` | Network | VMT by home TAZ (choropleth) |
| `flowmap` | Network | `od_flows` — real O-D desire lines |

**Rationale**: Every assignment maps to a real, already-audited-computable
summary from `data-model.md` §1 — none is a quota-filler. `plotly`,
`table`, and `recharts` recur across more than one tab beyond the single
instance each needs for FR-013 (e.g. `table` also appears on Trip Models
for the Trip Purpose breakdown) — reuse across tabs is expected and fine;
FR-013 only requires *at least one* real instance of each type somewhere
in the six tabs, which this table already satisfies for all ten.

## 8. `project-docs/CALIBRATION-SUMMARIES.md` corrections needed (FR-016)

**Decision**: Three real corrections, all traced directly to §2's audit:

1. Mark **Work from Home★**, **Telecommute Frequency★**, **Transit Pass
   Subsidy**, **Transit Pass Ownership**, **Screenline volumes vs observed
   AADT**, and **VMT by facility type** as *not computable from this
   project's real `prototype_mtc` configuration* — each with its specific
   real reason (component not enabled in `settings.yaml`, or no network-
   assignment step exists in this pipeline).
2. Correct the "Person type" segmentation definition to include the real
   8th `ptype` value (pre-school child).
3. Correct the "Geography" segmentation note — this pipeline's real zone
   lookup data provides `TAZ`/`DISTRICT`/`SD` (used as "super district"),
   not the documented four-level small/medium/large/super district set;
   every geography-segmented summary in the six-tab structure is
   TAZ/DISTRICT-level only.
