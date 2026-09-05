# Feature Specification: Python Post-Processor — ActivitySim CSV to Parquet Pipeline

**Feature Branch**: `025-python-postprocessor`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Python post-processor — ActivitySim CSV to Parquet pipeline. Build python/wftdm_dashboard/ for the first time — currently empty (__init__.py only). Convert a real ActivitySim model run's raw output (final_*.csv tables) into the Parquet files + summarize.yaml-driven metrics this app's DuckDB-WASM frontend actually consumes, generically — no WFRC-specific special-casing — via a real CLI entry point that takes a raw ActivitySim output directory and a summarize.yaml as input and produces a ready-to-load scenario folder as output."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn raw model output into the metrics the dashboard reads (Priority: P1)

A modeler has a finished ActivitySim run sitting in a folder as raw tables
(`households`, `persons`, `tours`, `trips`, plus whatever else the run
produced) and a `summarize.yaml` written for their model version, describing
what each dashboard metric should compute. They need those raw tables turned
into one Parquet file per metric, in exactly the shape the dashboard's
`summary/` folder expects — without hand-writing any conversion or
aggregation code themselves.

**Why this priority**: This is the entire reason the post-processor exists.
Every other piece of this feature (the CLI, the manifest, the error
messages) is scaffolding around this one transformation. Without it, the
dashboard has no real data to load — it's the single gap standing between
"looks correct in fixture tests" and "loads a real model run."

**Independent Test**: Can be fully tested by providing a small set of raw
table files (CSV and/or Parquet) alongside a `summarize.yaml` naming those
sources and defining a handful of metrics that exercise every placeholder
kind (`$mappings`, `$bins` of each of the four types, `$sql`), then
verifying each declared metric produces a Parquet file with the expected
rows and columns — no CLI, no manifest, no dashboard needed to confirm this
works.

**Acceptance Scenarios**:

1. **Given** a `summarize.yaml` with a `sources:` block naming two CSV files
   and a `metrics:` entry that joins and aggregates them, **When** the
   pipeline runs against a folder containing those two CSV files, **Then**
   a Parquet file named after the metric is written containing the
   aggregated result, with column names and types matching the metric's
   `SELECT` list.
2. **Given** a metric's SQL containing a `$mappings.<name>` placeholder,
   **When** the pipeline runs, **Then** the placeholder is expanded into a
   `CASE ... WHEN 'raw value' THEN 'mapped value' ...` block built from that
   exact mapping's entries in `summarize.yaml` — not a hardcoded mapping.
3. **Given** a `bins:` entry of each of the four documented types
   (`manual_breaks`, `quantiles`, `spaced_intervals`, `equal_intervals`),
   **When** a metric references it via `$bins.<name>`, **Then** the
   resulting Parquet column groups rows into the correct buckets for that
   bin type, computed from the underlying data at run time where the type
   requires it (`quantiles`, `equal_intervals`).
4. **Given** a `sql_fragments:` entry defining a reusable join (e.g.
   `trips_merged`), **When** two different metrics both reference it via
   `$sql.<name>`, **Then** both metrics' generated SQL contain that exact
   join text, unchanged.
5. **Given** a `sources:` entry pointing at a file already in Parquet
   format (e.g. a pre-converted `zones.parquet`), **When** the pipeline
   runs, **Then** that source is read directly with no CSV-specific
   handling forced onto it.
6. **Given** two metrics with different real-world column names feeding the
   same `$bins`/`$mappings` mechanism, **When** the pipeline runs, **Then**
   no part of the post-processor's own code references a specific
   real-world table or column name — every name comes from the parsed
   `summarize.yaml`.

---

### User Story 2 - Run the whole conversion with one command (Priority: P2)

The same modeler, having confirmed the underlying transformation works,
wants to actually run it against their full model run without writing a
Python script of their own — a single command that takes "here's my raw
output, here's my summarize.yaml" and produces a finished scenario folder.

**Why this priority**: User Story 1 proves the transformation logic is
correct; this makes it something a modeler can actually use day to day.
It's the packaging layer, not a new capability — depends entirely on User
Story 1 already working.

**Independent Test**: Can be fully tested by invoking the command-line tool
against a fixture raw-output directory and a fixture `summarize.yaml`, then
confirming the named output directory contains the expected Parquet files —
no direct Python API calls needed to exercise this path.

**Acceptance Scenarios**:

1. **Given** a raw ActivitySim output directory and a `summarize.yaml`
   path, **When** the modeler runs the conversion command with both as
   arguments, **Then** the command completes and reports which metrics were
   written (and where) without requiring any other setup step.
2. **Given** the same command run a second time against the same output
   directory (e.g. after re-running the model), **When** it completes,
   **Then** every metric's Parquet file reflects only the latest run's
   data — no stale file from a metric since renamed or removed in
   `summarize.yaml` is left behind.
3. **Given** the command is run with `--help` or no arguments, **When** it
   executes, **Then** it prints clear usage instructions rather than a
   stack trace.

---

### User Story 3 - Get a folder ready to publish, not just raw metric files (Priority: P3)

The modeler wants the pipeline's output to be something they can copy
straight into the dashboard's `public/scenarios/{name}/` folder per the
project's own publish workflow — meaning it needs a `manifest.yaml`
alongside the `summary/` folder, not just the Parquet files themselves.

**Why this priority**: Without a manifest, the output folder isn't actually
a loadable scenario — the modeler would still have to hand-write one file
every time. Real value, but strictly smaller than Users Stories 1-2, and
only meaningful once they exist.

**Independent Test**: Can be fully tested by running the pipeline and
inspecting the generated `manifest.yaml` for correct required fields,
independent of which metrics were configured.

**Acceptance Scenarios**:

1. **Given** a scenario name and run date supplied to the pipeline,
   **When** it completes, **Then** the output folder contains a
   `manifest.yaml` with `scenario_name`, `display_name`, `engine:
   activitysim`, and `run_date` populated from those inputs.
2. **Given** no explicit color is supplied, **When** the manifest is
   written, **Then** a color is auto-assigned from the Tableau10 palette
   rather than left blank.
3. **Given** no `pinned` value is supplied, **When** the manifest is
   written, **Then** it defaults to `pinned: false` (only the dashboard's
   own bundled `observed` manifest is hand-authored as `pinned: true`,
   unaffected by this pipeline).

---

### User Story 4 - Fail with a message a modeler can act on (Priority: P4)

When something in `summarize.yaml` or the raw data doesn't line up — a
missing source file, a placeholder referencing a mapping that doesn't
exist, an unrecognized bin type — the modeler (who authors `summarize.yaml`
but isn't necessarily a programmer, per the project's own documented
authoring model) needs to know exactly what's wrong and where, not just
that "something failed."

**Why this priority**: Real value on its own (turns a support burden into a
self-service fix), but it's a quality-of-life layer on top of a pipeline
that already works for the common case — lowest priority of the four.

**Independent Test**: Can be fully tested by running the pipeline against
deliberately broken fixture configs (missing source, undefined placeholder
reference, bad bin type) and confirming each produces a distinct, specific
error message naming the offending metric and key — no dashboard or CLI
polish needed to verify this.

**Acceptance Scenarios**:

1. **Given** a `sources:` entry naming a file that doesn't exist in the
   input directory, **When** the pipeline runs, **Then** it stops before
   attempting any metric SQL and reports which source and which file path
   was missing.
2. **Given** a metric's SQL referencing `$mappings.foo` where no `foo` key
   exists under `mappings:`, **When** the pipeline runs, **Then** it
   reports the metric name and the specific unresolved reference, before
   running any SQL for that metric.
3. **Given** a `bins:` entry with a `type:` value outside the four
   recognized types, **When** the pipeline runs, **Then** it reports the
   bin name and the unrecognized type value.
4. **Given** a metric's SQL that is syntactically valid YAML/text but
   produces a real SQL error at execution time (e.g. references a table
   never declared under `sources:`), **When** the pipeline runs, **Then**
   the reported error names the failing metric, not just a bare database
   error with no context.

---

### Edge Cases

- A `sources:` file exists but is empty (header row only, zero data rows) —
  the pipeline still produces a validly-structured (possibly empty) Parquet
  file for any metric built from it, not an error.
- A metric's SQL produces zero result rows — still writes a valid, empty
  Parquet file with the correct column schema, not a skipped file.
- Two `metrics:` entries share the same `name` — this is a `summarize.yaml`
  authoring error (they'd overwrite the same output filename) and is
  reported the same way as any other config problem (User Story 4), not
  silently resolved by "last one wins."
- A `sources:` file extension isn't `.csv`, `.parquet`, or `.geoparquet` —
  reported as an unsupported source format, naming the source key and file.
- `summarize.yaml` itself fails to parse as YAML, or is missing a required
  top-level key (`sources`, `metrics`) — reported before any source is
  touched.
- The output directory already contains a `summary/` folder from a
  previous run using a different `summarize.yaml` (with different metric
  names) — the previous run's now-unreferenced Parquet files do not
  persist alongside the new ones (see User Story 2, Scenario 2).
- A metric's SQL references a table name that was never declared under
  `sources:` (including a fragment pulled in via `$sql.<name>`) — this
  surfaces as a normal execution-time error (User Story 4, Scenario 4);
  `sources:` is the single registry of what's queryable, with no implicit
  fallback that guesses a file exists just because a name is mentioned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The pipeline MUST parse a `summarize.yaml` file into its four
  documented sections — `sources`, `mappings`, `bins`, `sql_fragments` — plus
  a `metrics` list, matching the grammar already documented in
  `docs/GRAMMAR.md`, with no new top-level section invented.
- **FR-002**: For each entry under `sources:`, the pipeline MUST load the
  named file (resolved relative to a caller-supplied raw-data directory)
  into a queryable table, selecting how to read it purely from the file's
  own extension (`.csv` vs. `.parquet`/`.geoparquet`) — never from a
  hardcoded list of expected source names.
- **FR-003**: The pipeline MUST expand every `$mappings.<name>` reference
  found in a metric's SQL into a `CASE ... WHEN 'raw' THEN 'mapped' ... END`
  fragment built from that mapping's own key/value entries in
  `summarize.yaml` — generic over the mapping's name and contents.
- **FR-004**: The pipeline MUST expand every `$bins.<name>` reference
  according to that bin's declared `type`, supporting all four documented
  types (`manual_breaks`, `quantiles`, `spaced_intervals`, `equal_intervals`)
  with the same bucket semantics already specified for each type in
  `docs/GRAMMAR.md`.
- **FR-005**: The pipeline MUST expand every `$sql.<name>` reference to the
  literal text of that fragment from `sql_fragments:`, substituted verbatim
  (no re-interpretation of its contents).
- **FR-006**: For each entry in `metrics:`, the pipeline MUST execute that
  metric's fully-expanded SQL and write the result as a single Parquet file
  at `{output-scenario-dir}/summary/{metric.name}.parquet`.
- **FR-007**: No part of the pipeline's own logic (as opposed to a parsed
  `summarize.yaml`'s content) may reference a specific real-world
  table, column, mapping, or bin name — every such reference must flow
  through the parsed config, the same discipline already confirmed for this
  project's TypeScript frontend.
- **FR-008**: The pipeline MUST generate a `manifest.yaml` in the output
  scenario folder, populating `scenario_name`, `display_name`, `engine:
  activitysim`, and `run_date` from caller-supplied values; auto-assigning
  `color` from the Tableau10 palette when none is supplied; and defaulting
  `pinned: false` when none is supplied.
- **FR-009**: The pipeline MUST be runnable as a single command-line
  invocation, accepting (at minimum) a raw-data input directory, a
  `summarize.yaml` path, and an output scenario directory, and MUST print
  usage help when invoked with no arguments or `--help`.
- **FR-010**: On any of the following, the pipeline MUST stop and report an
  error naming the specific offending element before running unrelated
  work: a missing `sources:` file, an unresolved `$mappings`/`$bins`/`$sql`
  reference, an unrecognized `bins.type`, or a metric SQL execution failure
  — never a bare, unattributed stack trace as the only signal.
- **FR-011**: Re-running the pipeline against the same output scenario
  directory MUST leave that scenario's `summary/` folder containing exactly
  the current `summarize.yaml`'s metrics — no Parquet file left over from a
  metric since renamed or removed in a prior run.
- **FR-012**: The pipeline MUST perform both reading (CSV/Parquet) and
  writing (Parquet) through DuckDB's own engine, without introducing a
  pandas dependency for this transformation.

### Key Entities

- **Source**: one named raw input table (`sources.<name>`), pointing at a
  CSV or (Geo)Parquet file relative to the raw-data input directory —
  ActivitySim's own `households`/`persons`/`tours`/`trips` outputs, plus any
  other file a modeler's `summarize.yaml` names (`zones`, `skims`, or
  anything else a metric's SQL joins against).
- **Mapping**: a named set of raw-value → display-value pairs
  (`mappings.<name>`), expanded into a SQL `CASE` block wherever
  `$mappings.<name>` appears.
- **Bin**: a named bucketing rule (`bins.<name>`) with one of four types,
  each producing a different SQL shape, expanded wherever `$bins.<name>`
  appears.
- **SQL Fragment**: a named, reusable piece of SQL text
  (`sql_fragments.<name>`), substituted verbatim wherever `$sql.<name>`
  appears — most commonly a join across several sources.
- **Metric**: one named, fully-specified SQL query (`metrics[].name` +
  `.sql`) whose expanded result becomes exactly one output Parquet file.
- **Scenario output**: the folder this pipeline produces — a `summary/`
  subfolder of one Parquet file per metric, plus a generated
  `manifest.yaml` — matching the shape `docs/GRAMMAR.md` already documents
  as what the dashboard frontend expects to find in a scenario folder.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Given a valid `summarize.yaml` and a matching raw ActivitySim
  output folder, running the pipeline once produces one Parquet file per
  declared metric, each loadable by the existing dashboard frontend with no
  further transformation of any kind.
- **SC-002**: A modeler converts a full model run (all of its declared
  metrics) to a loadable scenario folder with a single command, with no
  hand-written scripting step in between.
- **SC-003**: A modeler pointed at a misconfigured `summarize.yaml` (a
  missing source, a bad placeholder reference, or an unrecognized bin type)
  can identify and fix the specific problem from the pipeline's own output,
  without needing to read a Python stack trace or ask a developer for help.
- **SC-004**: The pipeline's output folder can be copied directly into the
  dashboard's `public/scenarios/{name}/` location and loaded by the running
  dashboard with no manual editing of any generated file.
- **SC-005**: Running the pipeline twice in a row against the same raw data
  and config produces the same set of metric files both times, with no
  stale file surviving from a metric that no longer exists in the current
  config.

## Assumptions

- **Raw ActivitySim output format**: confirmed directly against
  ActivitySim's own current example configuration
  (`github.com/ActivitySim/activitysim`, `develop` branch,
  `prototype_mtc/configs/settings.yaml`) that its real, standard output is
  CSV (optionally `final_`-prefixed, one file per table — `households`,
  `persons`, `tours`, `trips`, `land_use`, `accessibility`, `checkpoints`,
  `joint_tour_participants`), never Parquet natively. This pipeline reads
  whichever filename a modeler's own `sources:` entry names (matching
  `docs/GRAMMAR.md`'s own example, which shows plain names like
  `trips.csv` with no enforced prefix) — it does not assume or require
  ActivitySim's `final_` prefix convention specifically.
- **OMX skim and geometry conversion are separate, upstream concerns**:
  `docs/GRAMMAR.md`'s own `sources:` section already documents skims and
  zone geometry as arriving pre-converted to Parquet/GeoParquet by their
  own separate conversion paths ("OMX skims: converted via DuckDB h5db
  extension"; "Geometry: converted to GeoParquet via DuckDB spatial or
  GeoPandas") — this feature's generic, extension-based source loader
  (FR-002) reads whatever Parquet/GeoParquet files those steps produce, but
  building the OMX-to-Parquet or geometry-to-GeoParquet conversion itself
  is out of scope here; it is a separate, not-yet-built feature.
- **CLI shape**: implemented as a new subcommand of the existing
  `wftdm-dashboard` CLI (`wftdm-dashboard summarize ...`), joining the
  already-documented `serve`/`here`/`init` subcommands in one discoverable
  entry point, rather than a separate standalone script. `docs/GRAMMAR.md`
  currently says summarize.yaml "runs via `uv run summarize.py`" — that
  line will need a documentation correction once this ships; it is not a
  functional requirement of this feature.
- **Template scaffolding is out of scope**: `wftdm-dashboard init`'s job of
  scaffolding a default `summarize.yaml` and default `dashboard-*.yaml`
  files (`python/wftdm_dashboard/templates/`) is a separate, not-yet-built
  feature — this pipeline consumes a `summarize.yaml` a modeler already has,
  it does not generate one.
- **No cross-file validation against `dashboard-*.yaml`**: this pipeline
  validates `summarize.yaml`'s own internal consistency (sources exist,
  placeholders resolve) but does not check that its output columns satisfy
  any specific `dashboard-*.yaml`'s panel field references — those two
  files are authored independently per the project's existing model.
- **Downloading real ActivitySim sample data is a separate, subsequent
  step** (explicitly named out of scope in the feature request) — this
  feature is validated against small, hand-built fixtures modeled on
  ActivitySim's real column-naming conventions, not a full real dataset.
- **`python/wftdm_dashboard/__init__.py` starting point**: the package is
  genuinely empty today (confirmed directly) — this feature is the first
  real code in `python/wftdm_dashboard/`, alongside `pyproject.toml`'s
  already-declared dependencies (`click`, `duckdb`, `flask`, `openmatrix`;
  no `pandas`), which this feature does not need to add to.
