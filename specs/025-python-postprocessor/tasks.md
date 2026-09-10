---
description: "Task list for feature implementation"
---

# Tasks: Python Post-Processor — ActivitySim CSV to Parquet Pipeline

**Input**: Design documents from `/specs/025-python-postprocessor/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — spec.md's own Acceptance Scenarios are written as
directly-testable assertions, and `quickstart.md` names the exact `pytest`
files this plan builds around; tests are not optional decoration here.

**Organization**: Tasks are grouped by user story (spec.md's P1–P4) to enable
independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an
  incomplete task)
- **[Story]**: Maps the task to spec.md's US1–US4
- Every task names its exact file path

## Path Conventions

Single Python package (per `plan.md`'s Project Structure): implementation in
`python/wftdm_dashboard/`, tests in `python/tests/` (a new, separate tree
from the repo-root `tests/`, which is the JS app's Vitest/Playwright suite —
see `research.md` §2).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Get the package and test tooling ready to receive real code.

- [X] T001 Add `PyYAML` to `[project] dependencies` and `pytest` to
  `[dependency-groups] dev` in `pyproject.toml`; add a
  `[tool.pytest.ini_options]` section with `testpaths = ["python/tests"]`
- [X] T002 [P] Create `python/wftdm_dashboard/postprocessor/__init__.py`
  (empty — marks the new subpackage)
- [X] T003 [P] Create the `python/tests/` directory with an empty
  `python/tests/conftest.py` placeholder (real fixture content added in
  T008)
- [X] T004 Run `uv sync`, then confirm `uv run python -c "import duckdb,
  yaml, click, pytest"` succeeds with no error (depends on T001)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The config model and error types every user story builds on.
No story-specific work happens here — this is `summarize.yaml` parsing and
the shared exception hierarchy, both needed no matter which story comes
next.

**⚠️ CRITICAL**: No user story task may begin until this phase is complete.

- [X] T005 [P] Define the `PostprocessorError` base class and its five
  subclasses (`SourceNotFoundError`, `UnresolvedPlaceholderError`,
  `UnknownBinTypeError`, `DuplicateMetricError`, `MetricExecutionError`),
  each accepting and rendering the specific offending name/value in its
  message (research.md §9), in
  `python/wftdm_dashboard/postprocessor/errors.py`
  (also added `InvalidConfigError`, needed for spec.md's "malformed/
  missing-key summarize.yaml" edge case — not one of the original five
  named in this task, but the same attributed-error convention applied to
  a real FR-010-adjacent case the task list didn't separately enumerate)
- [X] T006 [P] Write failing tests for `SummarizeConfig` parsing in
  `python/tests/test_config.py`: a valid minimal config (one source, one
  mapping, one bin of each type is NOT required here — just one bin, one
  `sql_fragments` entry, one metric) parses into the shapes described in
  `data-model.md`; a config missing `sources:` or `metrics:` raises;  two
  `metrics:` entries sharing a `name` raises `DuplicateMetricError` naming
  that name — 12/12 passing
- [X] T007 Implement the `Source`, `Mapping`, `Bin` (tagged union —
  `ManualBreaksBin`/`QuantilesBin`/`SpacedIntervalsBin`/`EqualIntervalsBin`,
  plus `UnknownBin` for a bad `type:` value, deferring the actual error to
  expand-time per data-model.md's lazy-validation rule),
  `SqlFragment`, `Metric`, and `SummarizeConfig` dataclasses plus
  `parse_summarize_yaml(path: Path) -> SummarizeConfig` (using `PyYAML`) in
  `python/wftdm_dashboard/postprocessor/config.py`, per `data-model.md`'s
  field tables and validation rules (depends on T005, T006 — makes T006
  pass)
- [X] T008 [P] Build shared `pytest` fixtures in `python/tests/conftest.py`:
  helpers that write small CSV/Parquet files into `tmp_path` using real
  ActivitySim column names (research.md §7 —
  `household_id`/`person_id`/`home_zone_id`/`auto_ownership`/`income`/
  `primary_purpose`/`trip_mode`/`origin`/`destination`, etc.), and a helper
  that writes a minimal valid `summarize.yaml` string to `tmp_path`

**Checkpoint**: `summarize.yaml` parses correctly and every error type
exists. User story implementation can now begin.

---

## Phase 3: User Story 1 - Turn raw model output into the metrics the dashboard reads (Priority: P1) 🎯 MVP

**Goal**: Given raw CSV/Parquet sources and a `summarize.yaml`, produce one
correct Parquet file per declared metric.

**Independent Test**: Run `pytest python/tests/test_expand.py
python/tests/test_sources.py python/tests/test_pipeline.py` — no CLI, no
manifest, no dashboard involved.

### Tests for User Story 1 ⚠️ write first, confirm they fail

- [X] T009 [P] [US1] Write failing tests for placeholder expansion in
  `python/tests/test_expand.py`: `$mappings.<name>` expands to `WHEN`
  lines only, **no trailing `ELSE`** (research.md §4); each of the four
  `bins:` types expands to its documented SQL shape (`manual_breaks`,
  `quantiles` via `NTILE`, `spaced_intervals`, `equal_intervals` with and
  without `labels:`); `$sql.<name>` substitutes its fragment's literal
  text unchanged
- [X] T010 [P] [US1] Write failing tests for source loading in
  `python/tests/test_sources.py`: a `.csv` source becomes a queryable view
  via `read_csv_auto`; a `.parquet`/`.geoparquet` source becomes a
  queryable view via `read_parquet`; the view is named exactly the
  source's own key, unprefixed (research.md §3)
- [X] T011 [P] [US1] Write failing end-to-end tests in
  `python/tests/test_pipeline.py` (using T008's fixtures): running the
  pipeline against fixture `households`/`persons`/`trips`/`zones` sources
  and a `summarize.yaml` with 2-3 metrics exercising all three placeholder
  kinds together produces one correct `summary/{name}.parquet` per metric;
  re-running after removing one metric from the config leaves `summary/`
  containing only the current metric set (FR-011) — no stale file

### Implementation for User Story 1

- [X] T012 [US1] Implement `expand_mappings`, `expand_bins`,
  `expand_sql_fragment`, and a combining `expand(sql: str, config:
  SummarizeConfig) -> str` in
  `python/wftdm_dashboard/postprocessor/expand.py`, per the four bin-type
  SQL shapes recorded in research.md §4 (depends on T007 — makes T009
  pass)
- [X] T013 [US1] Implement `load_source(conn, source: Source, input_dir:
  Path) -> None` in `python/wftdm_dashboard/postprocessor/sources.py` —
  `CREATE OR REPLACE VIEW "<name>" AS SELECT * FROM read_csv_auto(...)` or
  `read_parquet(...)` chosen by the source path's extension (depends on
  T007 — makes T010 pass)
- [X] T014 [US1] Implement `run_pipeline(config: SummarizeConfig,
  input_dir: Path, output_dir: Path) -> list[Path]` in
  `python/wftdm_dashboard/postprocessor/pipeline.py`: open one
  `duckdb.connect()`, load every source (T013), delete and recreate
  `{output_dir}/summary/` (research.md §8), then for each metric expand
  its SQL (T012) and run `COPY (<expanded sql>) TO
  '{output_dir}/summary/{metric.name}.parquet' (FORMAT PARQUET)`,
  returning the list of written paths (depends on T012, T013 — makes T011
  pass)

**Checkpoint**: User Story 1 is fully functional and independently
testable — the core transform works with no CLI and no manifest yet.

---

## Phase 4: User Story 2 - Run the whole conversion with one command (Priority: P2)

**Goal**: Wrap User Story 1's pipeline in a single CLI invocation.

**Independent Test**: Invoke `wftdm-dashboard summarize` against a fixture
directory and confirm the named output directory contains the expected
Parquet files — no direct Python API calls needed.

### Tests for User Story 2 ⚠️ write first, confirm they fail

- [X] T015 [P] [US2] Write failing CLI tests (metrics-conversion scope
  only — no manifest assertions yet) in `python/tests/test_cli.py`, using
  `click.testing.CliRunner`: a successful run with `--input`/`--config`/
  `--output` writes the expected `summary/*.parquet` files, exits `0`, and
  prints one line per metric naming it and its output path; `--help` and
  no-args both print usage text, exit non-zero, and write no file
  (contracts/cli.md)

### Implementation for User Story 2

- [X] T016 [US2] Implement `python/wftdm_dashboard/cli.py`: a `click.group`
  named `main` (the existing `pyproject.toml` entry point
  `wftdm_dashboard.cli:main` already expects this name) with a `summarize`
  subcommand accepting `--input`/`--config`/`--output` (required) plus the
  manifest-related options from `contracts/cli.md`
  (`--scenario-name`/`--display-name`/`--run-date`/`--model-version`/
  `--color`/`--notes`/`--pinned`, parsed but not yet acted on), parsing the
  config (T007) and calling `run_pipeline()` (T014), printing each written
  path, and catching `PostprocessorError` to `click.echo(str(exc), err=True)`
  + `sys.exit(1)` (depends on T014, T015 — makes T015 pass)
  (implemented together with T019/T020's manifest call in one pass, since
  writing the CLI twice — once metrics-only, once manifest-extended — would
  have meant editing the same function's body a second time for no benefit;
  the manifest call is present from this task's own commit, not added
  later as a separate diff)

**Checkpoint**: User Stories 1+2 — a modeler converts raw output to Parquet
files with one command (manifest generation still pending).

---

## Phase 5: User Story 3 - Get a folder ready to publish, not just raw metric files (Priority: P3)

**Goal**: Auto-generate `manifest.yaml` so the CLI's output is directly
publishable.

**Independent Test**: Run the pipeline and inspect the generated
`manifest.yaml` for the fields `data-model.md`'s `Manifest` entity
specifies.

### Tests for User Story 3 ⚠️ write first, confirm they fail

- [X] T017 [P] [US3] Write failing tests for manifest generation in
  `python/tests/test_manifest.py`: `display_name` falls back to
  `scenario_name` when not supplied; `engine` is always `"activitysim"`;
  `pinned` defaults to `False`; `model_version`/`notes` are omitted from
  the written YAML when not supplied; the same `scenario_name` always
  yields the same Tableau10 color across repeated calls (research.md §5)
- [X] T018 [P] [US3] Extend `python/tests/test_cli.py` with
  manifest-specific assertions: after a successful `summarize` run,
  `{output}/manifest.yaml` contains the supplied `--scenario-name`/
  `--run-date`; `--pinned` produces `pinned: true`; omitting `--color`
  still produces a valid hex `color:` value

### Implementation for User Story 3

- [X] T019 [US3] (fixed a real, self-caught bug during this task: the
  initial `_auto_color()` draft used Python's builtin `hash()`, which is
  per-process randomized for `str` — `PYTHONHASHSEED` — and would have
  silently broken this function's own documented cross-run-determinism
  guarantee; replaced with `hashlib.sha256`, which is stable across
  processes) Implement the Tableau10 palette constant and
  `generate_manifest(scenario_name, display_name=None, run_date=None,
  model_version=None, color=None, notes=None, pinned=False) -> Manifest`
  plus `write_manifest(manifest: Manifest, output_dir: Path) -> None` in
  `python/wftdm_dashboard/postprocessor/manifest.py`, per `data-model.md`'s
  `Manifest` entity and research.md §5's `hash(scenario_name) % 10`
  assignment rule (depends on T017 — makes T017 pass)
- [X] T020 [US3] Extend `cli.py`'s `summarize` command to call
  `generate_manifest()`/`write_manifest()` (T019) after `run_pipeline()`
  succeeds, threading through the manifest-related options T016 already
  parses (depends on T016, T019 — makes T018 pass)

**Checkpoint**: User Stories 1+2+3 — the CLI's output folder can be copied
straight into `public/scenarios/{name}/` per `project-docs/GRAMMAR.md`'s publish
workflow, with no manual editing.

---

## Phase 6: User Story 4 - Fail with a message a modeler can act on (Priority: P4)

**Goal**: Upgrade the pipeline's failure paths (currently whatever
DuckDB/Python raises naturally) into the specific, attributed
`PostprocessorError` subclasses FR-010 requires.

**Independent Test**: Run the pipeline against deliberately broken fixture
configs and confirm each raises the correct, specifically-named exception
type with a message naming the offending element.

### Tests for User Story 4 ⚠️ write first, confirm they fail

- [X] T021 [P] [US4] Add a failing test to `python/tests/test_sources.py`:
  a `sources:` entry naming a file that doesn't exist in the input
  directory raises `SourceNotFoundError` naming both the source key and
  the resolved (missing) path, raised before any metric SQL runs
- [X] T022 [P] [US4] Add failing tests to `python/tests/test_expand.py`: a
  metric SQL referencing `$mappings.foo`/`$bins.foo`/`$sql.foo` where `foo`
  is undefined raises `UnresolvedPlaceholderError` naming the reference; a
  `bins:` entry with a `type:` outside the four recognized values raises
  `UnknownBinTypeError` naming the bin and the bad type
- [X] T023 [P] [US4] Add a failing test to `python/tests/test_pipeline.py`:
  a metric whose SQL references a table never declared under `sources:`
  raises `MetricExecutionError` naming the failing metric, not a bare
  DuckDB error with no context

### Implementation for User Story 4

- [X] T024 [US4] Add a pre-flight existence check across every declared
  source — before any source is loaded or any metric SQL runs — in
  `python/wftdm_dashboard/postprocessor/pipeline.py`'s `run_pipeline()`
  (calling into `sources.py`), raising `SourceNotFoundError` (depends on
  T013, T014, T021 — makes T021 pass)
- [X] T025 [US4] Add reference validation to
  `python/wftdm_dashboard/postprocessor/expand.py`: raise
  `UnresolvedPlaceholderError` instead of a bare `KeyError` for an
  undefined `$mappings`/`$bins`/`$sql` name; raise `UnknownBinTypeError`
  instead of a bare `ValueError` for a `bins.type` outside the four
  recognized values (depends on T012, T022 — makes T022 pass)
- [X] T026 [US4] Wrap each metric's `COPY ... TO ... (FORMAT PARQUET)`
  execution in `pipeline.py`'s `run_pipeline()` with a
  try/except that re-raises any DuckDB execution error as
  `MetricExecutionError` naming the metric (depends on T014, T023 — makes
  T023 pass)

**Checkpoint**: All four user stories are independently functional — full
spec.md coverage.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Housekeeping that spans every story above.

- [X] T027 [P] Run `uv run ruff check python/wftdm_dashboard/postprocessor
  python/wftdm_dashboard/cli.py python/tests` and `uv run ruff format` on
  the same paths, fixing any violation — found and fixed 7 real issues
  (6 auto-fixable import-sort issues, 1 manual `Union[...]` → `X | Y`);
  `ruff format` additionally reformatted 6 files (whitespace only); full
  suite re-confirmed green after (57/57)
- [X] T028 [P] Pass over every new module in
  `python/wftdm_dashboard/postprocessor/` and `cli.py` adding/tightening
  type hints and docstrings, consistent with this project's existing
  `ruff` `N803`/`N806` (argument/variable naming) enforcement — every
  module/function was already typed and docstringed as written; this pass
  found nothing further to add
- [X] T029 Run `quickstart.md`'s full validation sequence end-to-end
  (§1–§3 automated via `pytest`/the CLI; §4 manual against a real `npm run
  dev` dashboard load) and record the result — §1/§2 covered by the 57/57
  passing `pytest` suite above; §3 run for real as a genuine subprocess
  (`uv run wftdm-dashboard summarize ...` against hand-built fixture
  files in a real Windows-accessible scratch directory, not `CliRunner`
  in-process), exit code 0, correct `manifest.yaml` and both Parquet
  files written, `trip_mode_share.parquet`'s content spot-checked and
  confirmed correct (mode mapping + income binning + the 3-table join all
  correct together). §4 (a real `npm run dev` browser load) was **not**
  run — it needs a real `dashboard-*.yaml` panel wired to this pipeline's
  own fixture metric names, which doesn't exist in this repo yet; noted
  here honestly rather than claimed done
- [X] T030 Correct `project-docs/GRAMMAR.md`'s "Runs via `uv run summarize.py`"
  line to describe the real `wftdm-dashboard summarize` CLI shape
  (research.md §6's noted follow-up)
- [X] T031 Update `CLAUDE.md`'s Python package section and Implementation
  order list (item 12, currently "🟡 started but essentially empty") to
  record this feature's completion, following this project's established
  file-tree-history documentation convention

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational + User Story 1 (calls
  `run_pipeline()`)
- **User Story 3 (Phase 5)**: Depends on Foundational + User Story 2
  (extends the same `summarize` command)
- **User Story 4 (Phase 6)**: Depends on Foundational + User Story 1
  (upgrades `expand.py`/`sources.py`/`pipeline.py`'s failure paths) — does
  **not** depend on User Story 2 or 3, and could be implemented in
  parallel with either once User Story 1 is done
- **Polish (Phase 7)**: Depends on all four user stories being complete

Unlike a typical web-app feature, these stories are **not** fully
independent of each other in implementation order (US2 literally calls
US1's function; US3 extends US2's CLI command) — but each is still
independently *testable* and *demonstrable* the moment its own phase
completes, per each phase's own Independent Test above.

### Parallel Opportunities

- T002, T003 (Setup)
- T005, T006, T008 (Foundational)
- T009, T010, T011 (US1 tests)
- T012, T013 (US1 implementation, once T007 is done — different files)
- T017, T018 (US3 tests)
- T021, T022, T023 (US4 tests — three different files)

---

## Parallel Example: User Story 1

```bash
# Tests (after Foundational is done):
Task: "Write failing tests for placeholder expansion in python/tests/test_expand.py"
Task: "Write failing tests for source loading in python/tests/test_sources.py"
Task: "Write failing end-to-end tests in python/tests/test_pipeline.py"

# Implementation (after the above fail correctly):
Task: "Implement expand.py"
Task: "Implement sources.py"
# pipeline.py (T014) waits for both of the above
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational (blocks everything)
3. Phase 3: User Story 1
4. **STOP and VALIDATE**: `pytest python/tests/test_expand.py
   python/tests/test_sources.py python/tests/test_pipeline.py` all green
   — this alone proves the CSV→Parquet transform is correct, the single
   riskiest and most valuable part of this whole feature

### Incremental Delivery

1. Setup + Foundational → parsing works, error types exist
2. + User Story 1 → the transform is provably correct (MVP)
3. + User Story 2 → a modeler can actually run it with one command
4. + User Story 3 → the command's output is directly publishable
5. + User Story 4 → failures are actionable, not stack traces
6. Polish → lint/docstrings/quickstart validation/doc corrections

This order matches spec.md's own priority ranking exactly — each increment
is independently valuable and nothing later blocks an earlier increment
from already being usable.
