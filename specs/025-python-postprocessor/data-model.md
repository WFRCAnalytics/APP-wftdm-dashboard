# Phase 1 Data Model: Python Post-Processor — ActivitySim CSV to Parquet Pipeline

All entities below are parsed from `summarize.yaml` (per `project-docs/GRAMMAR.md`'s
already-documented grammar) or are pipeline-internal representations built
from it — no entity here introduces a new YAML key or file type
(constitution Principle VII).

## `SummarizeConfig`

The parsed, in-memory form of one `summarize.yaml` file.

| Field | Type | Notes |
|---|---|---|
| `version` | `int` | Informational only in this feature — no version-specific behavior branches on it yet; a mismatch from the expected value is not an error (forward-compatible by design, matching how `summarize.yaml`'s own `version: 2` has never changed across any real feature to date) |
| `sources` | `dict[str, Source]` | Keyed by source name (e.g. `trips`, `zones`) |
| `mappings` | `dict[str, Mapping]` | Keyed by mapping name (e.g. `major_trip_mode`) |
| `bins` | `dict[str, Bin]` | Keyed by bin name (e.g. `income_category`) |
| `sql_fragments` | `dict[str, str]` | Keyed by fragment name (e.g. `trips_merged`); value is the literal SQL text |
| `metrics` | `list[Metric]` | Order-preserving — written in the order declared, though output filenames (not order) are what the frontend actually depends on |

**Validation rules** (checked at parse time, before any source is loaded or
any SQL runs):
- `sources` and `metrics` MUST both be present and non-empty — a
  `summarize.yaml` with no sources or no metrics can produce no output,
  which is always a config error, never a valid empty run.
- Every `metrics[].name` MUST be unique (`DuplicateMetricError` otherwise —
  spec.md Edge Cases).

## `Source`

One entry under `sources:`.

| Field | Type | Notes |
|---|---|---|
| `name` | `str` | The dict key itself — becomes the DuckDB view name this source is queryable as (unprefixed — see research.md §3) |
| `path` | `str` | Relative path, resolved against the caller-supplied raw-data input directory at load time — never resolved or validated at parse time (a config can be parsed successfully even if referenced files don't exist yet; existence is checked when that source is actually loaded, per FR-010's "before running unrelated work" ordering — all sources are validated as a batch before any metric SQL runs, but after the config itself parses) |
| `format` | `'csv' \| 'parquet'` (derived) | Derived purely from `path`'s file extension at load time — `.csv` → `read_csv_auto`, `.parquet`/`.geoparquet` → `read_parquet`; never declared explicitly in YAML, never inferred from content |

## `Mapping`

One entry under `mappings:`.

| Field | Type | Notes |
|---|---|---|
| `name` | `str` | The dict key itself |
| `entries` | `dict[str, str]` | Raw value → mapped value, e.g. `{"DRIVEALONEFREE": "SOV", ...}` — order-preserving (affects only the order of generated `WHEN` lines, never their meaning) |

## `Bin`

One entry under `bins:`. A tagged union on `type`, matching
`services/sqlExpander.ts`'s own four-variant `BinConfig` union exactly
(research.md §4):

| Variant | Fields |
|---|---|
| `manual_breaks` | `column: str`, `breaks: list[float]`, `labels: list[str]` |
| `quantiles` | `column: str`, `bins: int` (default `4`) |
| `spaced_intervals` | `column: str`, `interval: float`, `lower: float` (default `0`) |
| `equal_intervals` | `column: str`, `n: int` (default `4`), `labels: list[str] \| None` |

**Validation rule**: a `type` value outside these four raises
`UnknownBinTypeError` naming the bin's own name and the bad `type` value —
checked when the bin is first referenced by a metric (not eagerly for every
declared bin, matching `sqlExpander.ts`'s own lazy-resolution convention:
$bins.x` is only ever resolved when a metric's SQL actually contains it).

## `SqlFragment`

One entry under `sql_fragments:` — just a `name` (dict key) and its literal
`text: str`. No further structure; substituted verbatim wherever
`$sql.<name>` appears (research.md §4).

## `Metric`

One entry in `metrics:`.

| Field | Type | Notes |
|---|---|---|
| `name` | `str` | Becomes the output filename: `summary/{name}.parquet` |
| `description` | `str \| None` | Carried through for potential future use (e.g. a manifest/catalog listing); not consumed by this feature beyond being parsed |
| `sql` | `str` | Raw SQL text containing zero or more `$mappings.x`/`$bins.x`/`$sql.x` placeholders, expanded before execution |

**Derived at run time** (not stored on the parsed entity): `expanded_sql:
str` — the result of running `sql` through the expansion engine
(research.md §4) against this config's own `mappings`/`bins`/
`sql_fragments`.

## `ScenarioOutput`

The pipeline's own output — not parsed from anything, but the entity this
whole feature exists to produce.

| Field | Type | Notes |
|---|---|---|
| `output_dir` | `Path` | Caller-supplied; created if it doesn't exist |
| `summary_files` | `list[Path]` | `{output_dir}/summary/{metric.name}.parquet`, one per `Metric` — the *only* files in `summary/` after a run (research.md §8) |
| `manifest` | `Manifest` | Written to `{output_dir}/manifest.yaml` |

## `Manifest`

The generated `manifest.yaml` content — field names and defaults match
`project-docs/GRAMMAR.md`'s already-documented `manifest.yaml` grammar exactly, no
new fields introduced.

| Field | Type | Default when not supplied |
|---|---|---|
| `scenario_name` | `str` | Required — no default (used as the DuckDB view prefix once loaded by the browser, `{scenario_name}__*`) |
| `display_name` | `str` | Falls back to `scenario_name` |
| `engine` | `str` | Always `"activitysim"` for this pipeline (FR-008) |
| `model_version` | `str \| None` | No default — omitted from the written YAML if not supplied |
| `run_date` | `str` (ISO date) | Required — no default |
| `color` | `str` (hex) | Auto-assigned from the Tableau10 palette, deterministic per `scenario_name` (research.md §5) |
| `notes` | `str \| None` | No default — omitted if not supplied |
| `pinned` | `bool` | `False` |

## Relationships

```
SummarizeConfig
├── sources:        dict[str, Source]
├── mappings:        dict[str, Mapping]
├── bins:            dict[str, Bin]
├── sql_fragments:  dict[str, SqlFragment]
└── metrics:         list[Metric]
                        │
                        │ each Metric.sql references zero or more
                        ▼
                  Mapping / Bin / SqlFragment (by name, via $-placeholders)
                        │
                        │ expansion produces
                        ▼
                  Metric.expanded_sql
                        │
                        │ executed against views built from
                        ▼
                  Source (one DuckDB view per source, loaded once per run)
                        │
                        │ result written to
                        ▼
                  ScenarioOutput.summary_files[i]

ScenarioOutput.manifest = Manifest (independent of any Source/Metric —
built entirely from CLI-supplied values + the Tableau10 palette)
```

No entity here has a lifecycle/state-machine — every run is a single,
stateless pass from `SummarizeConfig` + raw files to `ScenarioOutput`, with
no persisted intermediate state between runs (research.md §8's
full-replacement rule is what makes this true).
