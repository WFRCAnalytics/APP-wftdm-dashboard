# Phase 0 Research: Python Post-Processor — ActivitySim CSV to Parquet Pipeline

## 1. YAML parsing library

**Decision**: `PyYAML` (`import yaml`), added as a new runtime dependency in
`pyproject.toml`.

**Rationale**: Confirmed directly — no YAML library is declared anywhere in
the current `pyproject.toml` (`click`, `duckdb`, `flask`, `openmatrix` only).
This feature is the first Python code that needs to parse YAML at all.
`PyYAML` is the de facto standard, zero-config choice (`yaml.safe_load(path)`
is all that's needed — this config has no custom tags/anchors requirements)
and is what the constitution's own JS-side equivalent (`js-yaml`, Principle
IV) mirrors in spirit: a plain, boring YAML parser, not a schema-validation
framework.

**Alternatives considered**: `ruamel.yaml` — round-trip preserving (comments,
key order), useful for a tool that *writes back* YAML a human hand-edited.
Rejected: this feature only ever *reads* `summarize.yaml` (never rewrites
it) and only *writes* `manifest.yaml` fresh each run (no round-trip need
there either) — `ruamel.yaml`'s extra complexity buys nothing here.

## 2. Test runner and test tree location

**Decision**: `pytest`, added as a new dev dependency; tests live in a new
`python/tests/` directory, sibling to `python/wftdm_dashboard/` — not the
existing repo-root `tests/`.

**Rationale**: `pytest` is the Python ecosystem's de facto standard test
runner (parametrized fixtures make the four-bin-type/placeholder-kind test
matrix in spec.md's acceptance scenarios straightforward) and is not yet a
project dependency (only `ruff` exists under `[dependency-groups] dev`
today) — confirmed directly, not assumed. On location: the repo-root
`tests/` tree (`tests/unit/`, `tests/integration/`, `tests/fixtures/`) is
Vitest/Playwright-only — every existing file in it is a `.test.ts`/
`.spec.ts` file or a JS-consumed fixture (confirmed via `Glob`). Mixing
`.py` test files into that tree would put two unrelated languages and test
runners in one directory with no existing convention for how they'd
coexist (a shared `conftest.py` next to a Vitest `setup.ts`, a pytest run
needing an `--ignore` for the entire JS tree, etc.). `uv`'s own
`module-root = "python"` setting (already in `pyproject.toml`) already
establishes `python/` as the self-contained root of the Python package;
`python/tests/` continues that boundary cleanly, matching how a typical
standalone Python project lays out `<package>/` + `tests/` as siblings.

**Alternatives considered**: `tests/python/` (a subfolder of the existing
JS tree) — rejected for the reason above (wrong split, no existing
precedent for a mixed-language subtree). `python/wftdm_dashboard/tests/`
(tests inside the package itself) — rejected: would ship test code inside
the installable package unless explicitly excluded from packaging, adding
avoidable build-config complexity for no benefit.

## 3. DuckDB Python API: reading and writing without pandas

**Decision**: Use DuckDB's own relational/SQL API directly for every step —
`duckdb.connect()` for an in-process, in-memory (no on-disk `.duckdb` file
needed) connection; `CREATE OR REPLACE VIEW "<name>" AS SELECT * FROM
read_csv_auto('<path>')` (CSV sources) or `... FROM read_parquet('<path>')`
(Parquet/GeoParquet sources) to register each `sources:` entry as a
queryable view; `COPY (<expanded metric SQL>) TO '<output path>' (FORMAT
PARQUET)` to write each metric's result.

**Rationale**: Confirms the feature request's own research question #4 —
DuckDB's Python API needs no pandas at any step; `read_csv_auto`/
`read_parquet` are native DuckDB table functions, and `COPY ... TO ...
(FORMAT PARQUET)` is native DuckDB DDL, matching `pyproject.toml`'s existing
dependency list (`duckdb` already declared, `pandas` never declared and not
needed). This also gives a deliberate, useful parallel to the browser side:
`services/duckdb.ts`'s `createViewOverParquet()` already does exactly this
same "wrap a raw file in a `CREATE OR REPLACE VIEW` so it's queryable by
name" pattern for the browser's own DuckDB-WASM connection — this feature's
`sources.py` is an independent Python implementation of the identical idea,
not shared code (a different language, a different DuckDB binding), but the
same architectural shape.

**A real, load-bearing consequence of registering sources as plain,
unprefixed views**: unlike the browser side (which prefixes every scenario's
views as `{scenario}__{metric}` because multiple scenarios' views coexist in
one shared connection), this pipeline processes exactly one scenario's raw
data per run, in its own fresh connection — so a source named `trips` in
`summarize.yaml` becomes a view literally named `trips`, with no prefix.
This is required, not just simpler: every metric's SQL in the real
`project-docs/GRAMMAR.md` grammar already references sources this way
unprefixed (`FROM trips t`, `FROM tours t`, `$sql.trips_merged`'s own body
also referencing bare `trips`/`persons`/`households`/`zones`) — a prefixed
scheme would break every existing documented example.

**Alternatives considered**: pandas + `pyarrow.parquet.write_table` —
rejected per FR-012 and the project's own existing dependency set; would
add a large, unnecessary dependency purely to shuttle data DuckDB can
already read and write natively. DuckDB's Python `.df()`/`.arrow()`
relation methods were considered as an intermediate step — unnecessary,
since `COPY ... TO ... (FORMAT PARQUET)` writes directly from a SQL result
with no intermediate materialization into Python at all.

## 4. Placeholder expansion semantics — parity with `services/sqlExpander.ts`

**Decision**: Reimplement the same four expansion functions in Python,
targeting byte-for-byte the same SQL shapes already implemented and
documented in `services/sqlExpander.ts`'s `expandMappings`/`expandBins`/
`expandSqlFragment` (read directly from that file this session, not
assumed from `project-docs/GRAMMAR.md`'s prose alone):

- `$mappings.<name>` → `WHEN '<raw>' THEN '<target>'` lines only, one per
  entry, **no trailing `ELSE`** — confirmed directly against
  `sqlExpander.ts`'s real `expandMappings()` body, which emits no `ELSE`
  clause. (`project-docs/GRAMMAR.md`'s own "How placeholders expand" worked example
  shows an `ELSE 'Other'` line — that line is the author's own addition to
  the surrounding `CASE` block in that illustration, not something
  `expandMappings()` itself generates. Python's version matches the real
  code, not the doc's illustrative text — a minor, pre-existing docs
  inaccuracy, out of scope to fix here.)
- `$bins.<name>` → dispatches on the bin's `type`:
  - `manual_breaks`: chained `WHEN "<column>" < <break> THEN '<label>'`
    lines wrapped in `CASE ... ELSE '<last label>' END`.
  - `quantiles`: `NTILE(<bins>) OVER (ORDER BY "<column>")` — field name is
    `bins` (the quantile count), not `n`.
  - `spaced_intervals`: `(FLOOR(("<column>" - <lower>) / <interval>) *
    <interval> + <lower>)`.
  - `equal_intervals`: data-driven `MIN`/`MAX` window functions feeding a
    `LEAST(<n> - 1, FLOOR(...))` bucket expression, optionally wrapped in a
    `CASE <bucket> WHEN <i> THEN '<label>' ... END` when `labels:` is given.
- `$sql.<name>` → the fragment's literal text, substituted verbatim (no
  reinterpretation).

**Rationale**: `summarize.yaml`'s own header comment (`project-docs/GRAMMAR.md`)
states "The same SQL dialect runs unchanged in DuckDB-WASM in the browser"
— the *SQL* is portable, but the *expansion mechanism* that produces it is
necessarily two independent implementations (Python here, TypeScript in the
browser), since `summarize.yaml` (Python-only, per Principle VII/
`project-docs/GRAMMAR.md`'s own "never published, never read by the browser") and
`dashboard-*.yaml` (browser-only) are different files serving different
placeholder sets that only partially overlap (both use `$mappings`/`$bins`/
`$sql`; only `dashboard-*.yaml` uses `$filters`/`$scenario`/`$inputs`/
`$baseline`). Matching the JS side's exact SQL output for the shared
placeholder kinds means a modeler's mental model of "what does `$bins.x`
expand to" stays one concept, not two subtly different ones depending on
which file they're editing.

**Alternatives considered**: Shelling out to Node/the existing
`sqlExpander.ts` via a subprocess — rejected outright: adds a Node.js
runtime dependency to a Python package explicitly meant to run standalone
alongside a modeler's ActivitySim run (which itself has no Node
dependency), and violates the project's own Python/JS source split
(Principle IX) in spirit even if not its letter.

## 5. Tableau10 palette for `manifest.yaml`'s auto-assigned `color`

**Decision**: The standard 10-color "Tableau 10" categorical palette:
`#4E79A7, #F28E2B, #E15759, #76B7B2, #59A14F, #EDC948, #B07AA1, #FF9DA7,
#9C755F, #BAB0AC`. When no `color:` is supplied to the CLI, pick
`PALETTE[hash(scenario_name) % 10]` — deterministic per scenario name (the
same scenario re-run twice gets the same color), with no dependency on
knowing what colors sibling scenarios already use (this pipeline processes
one scenario folder per run and has no visibility into
`public/scenarios/`'s other already-published manifests).

**Rationale**: `project-docs/GRAMMAR.md`'s own worked `manifest.yaml` example uses
`color: "#4e79a7"` — exactly Tableau 10's first color (case aside) —
confirming this is the actual intended source palette, not a guess.
Hashing the scenario name (rather than, say, always picking the first
color) avoids every scenario converted independently defaulting to the
identical color, which would defeat the color's own purpose (distinguishing
scenarios in overlaid chart series) the moment two scenarios are loaded
together without either explicitly setting `color:`.

**Alternatives considered**: Sequential assignment (first run gets color 0,
second gets color 1, ...) — rejected: would require persistent state
tracking across independent CLI invocations (which scenario "used" which
index already), a real complexity this feature has no other reason to
carry. An explicit `--color` CLI flag remains available for a modeler who
wants full control; auto-assignment is only the no-flag fallback (FR-008).

## 6. CLI framework and command shape

**Decision**: `click` (already declared in `pyproject.toml`), adding a
`summarize` subcommand to a new `cli.py`'s `main` group — the same file
`pyproject.toml`'s existing `[project.scripts] wftdm-dashboard =
"wftdm_dashboard.cli:main"` entry point already names, which doesn't exist
yet. Command shape:

```
wftdm-dashboard summarize --input <raw-output-dir> --config <summarize.yaml> --output <scenario-dir> [--scenario-name NAME] [--display-name NAME] [--run-date DATE] [--color HEX] [--pinned]
```

**Rationale**: `click` is already a project dependency with no other
consumer yet (confirmed: `cli.py` doesn't exist, so nothing currently uses
it) — it's clearly the intended CLI library, not a new choice this feature
introduces. A `click.Group` with subcommands (`main` as the group, `summarize`
as the first real subcommand) matches `CLAUDE.md`'s own documented shape for
this exact entry point (`wftdm-dashboard serve|here|init`) — `summarize`
joins that family as a fourth subcommand rather than a competing, separate
executable.

**Alternatives considered**: `argparse` (stdlib, no new dependency) —
rejected only because `click` is already the declared, presumably
deliberate choice; introducing a second CLI-parsing approach in the same
package for one new subcommand would be inconsistent for no benefit.

## 7. Real ActivitySim raw CSV schema — fixture design

**Decision**: Build `python/tests/` fixtures (small, hand-written CSVs) using
column names confirmed for real in this session directly against
ActivitySim's own current example configuration
(`github.com/ActivitySim/activitysim`, `develop` branch,
`prototype_mtc/configs/settings.yaml`) and the column names already relied
on throughout `project-docs/GRAMMAR.md`'s own metric SQL (`household_id`,
`person_id`, `home_zone_id`, `auto_ownership`, `income`, `primary_purpose`,
`trip_mode`, `tour_mode`, `tour_purpose`, `tour_category`, `origin`,
`destination`, `depart`, `arrive`, `start_time`, `end_time`,
`number_of_participants`, `is_worker`, `work_from_home`,
`telecommute_frequency`, `transit_pass_ownership`, `transit_pass_subsidy`,
`cdap_activity` — all real, current ActivitySim column names from its
household/person/tour/trip models).

**Rationale**: The pipeline's own logic must stay fully generic (FR-007) —
fixture realism doesn't change what code gets written, only what proves it
works against something resembling a real run rather than an arbitrary toy
schema. Confirming these are ActivitySim's real column names (not simply
copying `project-docs/GRAMMAR.md`'s example verbatim without checking) also
surfaces, for the record, one likely naming mismatch worth flagging for
whoever authors a *real* `summarize.yaml` against a *real* ActivitySim run
later: `project-docs/GRAMMAR.md`'s `auto_ownership` metric SQL aliases
`h.num_persons AS household_size`, but ActivitySim's own households table
uses `hhsize`, not `num_persons`, for that column. This is a
`project-docs/GRAMMAR.md` example-accuracy question, not something this feature's
generic engine needs to special-case — a real `summarize.yaml` author
writes `h.hhsize AS household_size` themselves; the engine doesn't know or
care what the real column is named. Noted here so it isn't silently lost,
not treated as an in-scope fix.

**Alternatives considered**: Downloading and using ActivitySim's real
`prototype_mtc` example output directly as test fixtures — rejected per
spec.md's own explicit exclusion ("downloading/preparing actual real
ActivitySim sample scenario data" is a separate, subsequent feature); also
impractically large for a unit-test fixture.

## 8. Idempotent re-runs (FR-011) — output directory handling

**Decision**: On each run, the pipeline deletes and recreates
`{output}/summary/` in full before writing any metric's Parquet file, then
writes `manifest.yaml` fresh at `{output}/manifest.yaml`. Both are scoped
strictly to those two paths — nothing else under `{output}` is touched.

**Rationale**: The simplest rule that actually satisfies FR-011 ("no
Parquet file left over from a metric since renamed or removed") without
tracking which metrics existed on a *previous* run — full-directory
replacement is correct by construction, not by diffing.

**Alternatives considered**: Tracking a manifest of previously-written
filenames and deleting only the difference — rejected as needless
complexity; `summary/` is described in `project-docs/GRAMMAR.md` itself as "written
by the post-processor" (i.e., wholly owned output, never a place a modeler
hand-edits a file into), so full replacement carries no risk of destroying
anything the tool doesn't itself own.

## 9. Error reporting shape (FR-010)

**Decision**: A small `PostprocessorError` exception hierarchy in
`errors.py` (`SourceNotFoundError`, `UnresolvedPlaceholderError`,
`UnknownBinTypeError`, `DuplicateMetricError`, `MetricExecutionError`), each
carrying the specific offending name (source key, metric name, placeholder
reference, bin type). `cli.py` catches `PostprocessorError` at the top level
and prints `str(exc)` via `click.echo(..., err=True)` followed by
`sys.exit(1)` — a clean, single-line, human-readable message, never a raw
Python traceback for an *expected* configuration problem. Genuinely
unexpected exceptions (a real bug, not a config problem) are allowed to
propagate as an ordinary traceback — FR-010 scopes "clear, attributed
errors" to the specific config-validation cases it lists, not a blanket
guarantee against ever seeing a traceback for a real defect.

**Rationale**: Matches `services/sqlExpander.ts`'s own `missing()` helper
convention (a small, named error function raised with the specific
unresolved reference in its message) — the same "name the exact thing that
went wrong" philosophy, adapted to Python's exception model instead of JS's
throw-a-string-message-Error one.

**Alternatives considered**: A single generic `PostprocessorError(str)` with
no subclasses — rejected: subclassing lets `python/tests/` assert on
*which* failure occurred (`pytest.raises(SourceNotFoundError)`), not just
that *some* error occurred, which is worth the small amount of extra
structure.
