# Contract: `project-docs/CALIBRATION-SUMMARIES.md` Corrections

Three real corrections, all traced to `research.md` §2/§8. Applied as
direct edits to the existing document — no restructuring of its existing
tab/submodel organization, since that organization is exactly what the
new six-tab dashboard structure now mirrors for real.

## 1. Mark six submodels not computable, with real reasons

For each of the following headings, add a clearly-labeled note
immediately under the heading (not a footnote, not a removal of the
heading itself — the documented submodel stays visible as a submodel
ActivitySim *can* produce, with this project's own real configuration
noted as the reason it doesn't here):

- **Work from Home** (Person/Household Models Tab): *"Not computable from
  this project's real `prototype_mtc` configuration — the `work_from_home`
  component is absent from `configs/settings.yaml`'s `models:` list."*
- **Telecommute Frequency** (Person/Household Models Tab): same reason,
  `telecommute_frequency` component.
- **Transit Pass Subsidy** (Person/Household Models Tab): same reason,
  `transit_pass_subsidy` component.
- **Transit Pass Ownership** (Person/Household Models Tab): same reason,
  `transit_pass_ownership` component.
- **Screenline volumes vs observed AADT** (Network Tab): *"Not computable
  — this pipeline has no traffic-assignment step; ActivitySim's own
  `write_trip_matrices` output is zone-to-zone trip demand, not assigned
  link volumes, and no real observed-AADT dataset exists for this
  synthetic 25-zone system."*
- **VMT by facility type** (Network Tab): same reason — no link/
  facility-type assignment output exists anywhere in this pipeline.

## 2. Correct the "Person type" segmentation definition

Current text (Standard Segmentation Definitions table):
`Full-time worker, part-time worker, university student, driving-age
student, non-driving student, retired, non-worker`

Corrected text: add the real 8th ActivitySim `ptype` value this project's
own real output confirms exists — pre-school child — and note that these
8 map to real `ptype` values 1-8 respectively (matching
`mappings.person_type` in the new `summarize.yaml`, per `data-model.md`
§2).

## 3. Correct the "Geography" segmentation note

Current text describes four levels (TAZ, small/medium/large district,
super district/county) all joined via a zone lookup table with
`taz_id`/`small_district`/`medium_district`/`large_district`/
`super_district` columns.

Corrected text: state plainly that this project's real `land_use` output
provides only `zone_id` (TAZ), `DISTRICT`, and `SD`/`county_id` — not the
four-level set — and that every geography-segmented summary in the live
demo dashboard uses TAZ and `DISTRICT` only (`SD` treated as the closest
real equivalent of "super district" where a coarser rollup is used). The
four-level model stays documented as the general grammar's own design
(a real deployer's own `zones.parquet` MAY provide all four), but this
demo's own real data does not exercise the finer three.

## What does NOT change

- The document's own tab/submodel heading structure, order, or the
  ★/Level-1 vs Level-2 convention.
- The "Summary — All Parquet Files" inventory table's row count framing —
  it gains rows for this feature's new metrics (mechanical, per
  `data-model.md` §3) but keeps its existing column shape.
- Every submodel confirmed computable (34 of 40, `data-model.md` §1)
  needs no textual correction at all — its existing description already
  matches reality.
