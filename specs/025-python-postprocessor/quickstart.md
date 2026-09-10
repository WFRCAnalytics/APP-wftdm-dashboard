# Quickstart: Validating the Python Post-Processor

Prerequisites: this feature implemented per `plan.md`'s Project Structure
(`python/wftdm_dashboard/postprocessor/`, `python/wftdm_dashboard/cli.py`),
`PyYAML` and `pytest` added to `pyproject.toml`, `uv sync` run.

## 1. Unit-level validation (no CLI, no real files) — proves User Story 1

```
uv run pytest python/tests/test_expand.py -v
```

Expected: passing cases for each placeholder kind —
- a `$mappings.<name>` reference expands to the exact `WHEN`-line set from a
  hand-written `mappings:` dict, no `ELSE`.
- each of the four `bins:` types (`manual_breaks`, `quantiles`,
  `spaced_intervals`, `equal_intervals`) expands to its documented SQL
  shape (research.md §4) from a hand-written `Bin`.
- a `$sql.<name>` reference expands to the fragment's literal text,
  unchanged.
- a reference to an undefined mapping/bin/fragment name raises
  `UnresolvedPlaceholderError` naming that reference.

## 2. End-to-end pipeline validation, in-process — proves User Stories 1 and 4

```
uv run pytest python/tests/test_pipeline.py -v
```

Fixture shape (built by `conftest.py`, in a `tmp_path`):
- `households.csv`, `persons.csv`, `trips.csv` — a handful of rows each,
  using real ActivitySim column names (research.md §7): `household_id`,
  `person_id`, `home_zone_id`, `auto_ownership`, `income`; `primary_purpose`,
  `trip_mode`, `origin`, `destination`.
- `zones.parquet` — a tiny pre-built Parquet file (`taz_id`,
  `super_district`).
- A `summarize.yaml` declaring: one `mappings:` entry, one `bins:` entry
  (any type), one `sql_fragments:` entry joining trips/persons/households/
  zones, and 2–3 `metrics:` entries exercising all three placeholder kinds
  together (mirroring the real `trip_mode_share`/`summary_kpis` shape from
  `project-docs/GRAMMAR.md`, at fixture scale).

Expected:
- Running the pipeline function against this fixture produces one
  `.parquet` file per declared metric in a `summary/` subfolder, each
  openable via `duckdb.read_parquet(...)` with the expected columns/row
  counts.
- Re-running with a `summarize.yaml` that has one fewer metric than before
  leaves `summary/` containing only the current metric set — the removed
  metric's old file is gone (FR-011, User Story 2 Scenario 2).
- A deliberately broken fixture (a `sources:` entry pointing at a
  nonexistent file) raises `SourceNotFoundError` before any metric SQL
  runs, naming the missing source and path (FR-010, User Story 4).

## 3. CLI validation, real subprocess — proves User Story 2

```
uv run wftdm-dashboard summarize \
  --input   python/tests/fixtures/raw_activitysim/ \
  --config  python/tests/fixtures/summarize.yaml \
  --output  /tmp/scenario-out \
  --scenario-name test_scenario \
  --run-date 2026-09-05
```

Expected:
- Exit code `0`.
- Console output lists each metric name as it's written.
- `/tmp/scenario-out/summary/*.parquet` matches the fixture's declared
  metric set.
- `/tmp/scenario-out/manifest.yaml` contains `scenario_name:
  test_scenario`, `engine: activitysim`, `run_date: 2026-09-05`,
  `pinned: false`, and a `color:` from the Tableau10 palette.
- `wftdm-dashboard summarize` (no args) and `wftdm-dashboard summarize
  --help` both print usage and exit non-zero, touching no file.

## 4. Manual validation against the real dashboard frontend — proves SC-001/SC-004

1. Run the CLI (step 3) with `--output public/scenarios/test-scenario`.
2. Add `"test-scenario"` to `public/scenarios/index.json`.
3. `npm run dev`, load the dashboard, select `test-scenario`.
4. Confirm any dashboard panel bound to one of the fixture's metric names
   renders using the generated Parquet file — no manual edit to any
   generated file was needed to make this work (SC-004).

This step is exploratory/manual (it depends on a real `dashboard-*.yaml`
panel referencing the fixture's specific metric names) — not part of this
feature's own automated test suite, but the concrete proof that the output
shape this pipeline produces is exactly what the existing, unmodified
frontend already expects.
