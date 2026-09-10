# Implementation Plan: Python Post-Processor — ActivitySim CSV to Parquet Pipeline

**Branch**: `025-python-postprocessor` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-python-postprocessor/spec.md`

## Summary

Build the first real code in `python/wftdm_dashboard/`: a generic engine that
parses a `summarize.yaml` (the grammar already documented in
`project-docs/GRAMMAR.md`), loads whatever CSV/Parquet `sources:` it names, expands
`$mappings`/`$bins`/`$sql` placeholders into literal DuckDB SQL, runs each
`metrics:` entry, and writes one Parquet file per metric to
`{output}/summary/{name}.parquet` — plus an auto-generated `manifest.yaml` —
exposed as a new `wftdm-dashboard summarize` CLI subcommand. Built entirely
against DuckDB's own Python API (no pandas), with zero real-world
table/column names anywhere in the engine's own code — every reference flows
through the parsed config, mirroring the discipline already confirmed in this
project's TypeScript frontend (`services/sqlExpander.ts`, `panels/
panelQuery.ts`).

## Technical Context

**Language/Version**: Python 3.10+ (matches `pyproject.toml`'s
`requires-python = ">=3.10"` and `ruff`'s `target-version = "py310"` — no
change needed)

**Primary Dependencies**: `duckdb` (already declared, `>=1.0`) for all
reading/querying/writing; `click` (already declared, `>=8.0`) for the CLI
subcommand; **`PyYAML` — new dependency**, needed to parse `summarize.yaml`
(no YAML library is declared in `pyproject.toml` today; this is the first
feature that needs one)

**Storage**: Files only — CSV/(Geo)Parquet inputs, Parquet outputs, a
generated `manifest.yaml`; no database server, no persistent DuckDB file
(each pipeline run uses a fresh in-process/in-memory DuckDB connection)

**Testing**: `pytest` — **new dev dependency** (only `ruff` is declared under
`[dependency-groups] dev` today)

**Target Platform**: Cross-platform CLI (Windows/Linux/macOS) — runs via
`uv run` on a modeler's own machine, alongside their ActivitySim run; no
server component

**Project Type**: Single Python package + CLI (existing `python/
wftdm_dashboard/`, per constitution Principle IX — `src/` stays JS-only)

**Performance Goals**: No hard target specified by the feature; a full
model-run conversion (all declared metrics) should complete as one CLI
invocation without requiring the modeler to babysit multiple steps (spec
SC-002) — DuckDB's own vectorized CSV/Parquet engine is expected to handle
realistic ActivitySim output sizes (tens of thousands to low millions of
trip/tour rows) well within that expectation with no special tuning

**Constraints**: No pandas dependency (FR-012); no hardcoded real-world
table/column/mapping/bin name anywhere in the engine's own logic (FR-007);
must not break `python/wftdm_dashboard/`'s existing (currently vacuous)
package import

**Scale/Scope**: One scenario (one raw-output directory) per invocation;
`summarize.yaml` metric counts in the dozens (the documented example lists
~25); no multi-scenario batch mode in this feature (a modeler re-runs the
command once per scenario, matching the project's existing one-scenario-
folder-at-a-time publish workflow in `project-docs/GRAMMAR.md`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed | No | This feature is entirely Python; no `src/` (JS) files are touched |
| II. DuckDB-WASM Off Main Thread, One Shared Instance | No | Scoped to the browser's `AsyncDuckDB` instance in `services/duckdb.ts`. This feature uses DuckDB's separate, native **Python** API (already the documented "Query — offline" stack choice) — a different binding of the same engine, not a second browser instance |
| III. No eval() — String Replacement Only | **Yes** | The `$mappings`/`$bins`/`$sql` expansion engine (research.md, data-model.md) is plain string templating into SQL text, mirroring `sqlExpander.ts`'s own approach exactly — no `eval()`/`exec()` of any kind, and no dynamic Python code generation |
| IV. YAML Parsed at Runtime | **Yes** | `summarize.yaml` is parsed at pipeline-run time (`PyYAML`, new dependency) — never pre-processed or baked in at any build step; this is a runtime CLI tool, not a build artifact |
| V. Parquet-Only Browser Data I/O | N/A (offline side) | This principle scopes the *browser*. This feature is precisely the offline conversion step the principle's own rationale names ("Any conversion from those formats happens offline in the Python post-processor before results are published") |
| VI. Fixed Technology Choices | **Yes** | No Mapbox/Webpack/Web Storage/non-Tailwind UI touched (none apply — this is a backend CLI tool with no UI). No new charting/mapping library introduced |
| VII. Minimal, Fixed Config File Set | **Yes** | Reads the existing `summarize.yaml` grammar verbatim, per `project-docs/GRAMMAR.md` — no new config file type is introduced; writes `manifest.yaml`, an existing documented output, not a new file type |
| VIII. Reuse Proven Reference Implementations | N/A | None of the named reference repos (DuckDB-WASM/Arrow wiring, MapLibre/flowmap.gl, spatial-SQL/GeoParquet, Vite/coi-serviceworker) apply to a server-side Python CSV→Parquet pipeline |
| IX. Fixed Python/JS Source Split | **Yes** | All new code lives under `python/wftdm_dashboard/`; nothing is added to `src/`; `src/wftdm_dashboard/` is not recreated |

**Result**: PASS. No violations, no Complexity Tracking entries needed. Two
new dependencies (`PyYAML`, `pytest`) are additive, not deviations from any
fixed choice — the constitution's Technology Stack Reference already names
"Query — offline | Python DuckDB (`uv run`)" as the stack for this exact
layer; neither `PyYAML` nor `pytest` is a competing choice for anything the
constitution already fixes.

## Project Structure

### Documentation (this feature)

```text
specs/025-python-postprocessor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── cli.md
│   └── summarize-yaml-grammar.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
python/wftdm_dashboard/
├── __init__.py                # unchanged (still the package marker)
├── cli.py                     # NEW — click-based CLI; `main` entry point
│                               # (pyproject.toml's existing
│                               # [project.scripts] wftdm-dashboard =
│                               # "wftdm_dashboard.cli:main" already points
│                               # here — this file doesn't exist yet). Adds
│                               # one subcommand: `summarize`. `serve`/
│                               # `here`/`init` (CLAUDE.md's other two
│                               # documented subcommands) are NOT built by
│                               # this feature — out of scope, separate work.
└── postprocessor/             # NEW package — the actual pipeline
    ├── __init__.py
    ├── config.py               # parse summarize.yaml -> typed
    │                           # SummarizeConfig (sources/mappings/bins/
    │                           # sql_fragments/metrics), matching
    │                           # project-docs/GRAMMAR.md's documented grammar
    ├── expand.py                # $mappings.x / $bins.x / $sql.x ->
    │                           # literal SQL text, one function per
    │                           # placeholder kind - Python-side
    │                           # counterpart to services/sqlExpander.ts's
    │                           # expandMappings/expandBins/
    │                           # expandSqlFragment (independent
    │                           # implementation, same target SQL shape -
    │                           # no cross-language code sharing)
    ├── sources.py               # load one `sources:` entry into DuckDB by
    │                           # file extension (csv -> read_csv_auto,
    │                           # parquet/geoparquet -> read_parquet)
    ├── pipeline.py               # orchestration: load every source, run
    │                           # every metric's expanded SQL, write
    │                           # summary/{name}.parquet, clear stale
    │                           # metric files from a previous run
    ├── manifest.py               # generate manifest.yaml (Tableau10
    │                           # palette auto-assignment, pinned: false
    │                           # default)
    └── errors.py                 # PostprocessorError subclasses used for
                                # FR-010's specific, attributable error
                                # messages (SourceNotFoundError,
                                # UnresolvedPlaceholderError,
                                # UnknownBinTypeError,
                                # MetricExecutionError, DuplicateMetricError)

python/tests/                  # NEW — pytest suite, sibling to
│                               # wftdm_dashboard/ itself (uv's
│                               # module-root is already "python"; the
│                               # existing tests/ at repo root is the JS
│                               # Vitest/Playwright tree exclusively -
│                               # mixing a different language/runner into
│                               # it would be the wrong split, see
│                               # research.md)
├── conftest.py                 # shared fixture-building helpers (tiny
│                               # CSV/Parquet fixtures written to tmp_path)
├── test_expand.py
├── test_config.py
├── test_sources.py
├── test_pipeline.py
├── test_manifest.py
└── test_cli.py
```

**Structure Decision**: Single-project layout (Option 1), scoped entirely to
the existing `python/wftdm_dashboard/` package per constitution Principle
IX. A new `postprocessor/` subpackage holds the pipeline; `cli.py` (which
`pyproject.toml` already references but which doesn't exist yet) becomes the
thin CLI wrapper around it. Tests live in a new `python/tests/` — not the
repo-root `tests/` tree, which is exclusively the JS app's Vitest/Playwright
suite (different language, different runner, different fixture shape;
see research.md for the rejected alternative).

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*

## Post-Design Constitution Re-check

Re-evaluated after Phase 1 (`data-model.md`, `contracts/`, `quickstart.md`
written): no new violation introduced. The two new dependencies remain
additive (`PyYAML`, `pytest`); the `postprocessor/` module split
(`config.py`/`expand.py`/`sources.py`/`pipeline.py`/`manifest.py`/
`errors.py`) stays entirely inside `python/wftdm_dashboard/` (Principle IX);
no `eval()`/dynamic code execution appears anywhere in the expansion design
(Principle III — `expand.py` is pure string templating, mirroring
`sqlExpander.ts`'s own approach); no new config file type is introduced
(Principle VII — `summarize.yaml` and `manifest.yaml` are both pre-existing,
documented types). **Result: PASS, unchanged from the pre-design check.**
