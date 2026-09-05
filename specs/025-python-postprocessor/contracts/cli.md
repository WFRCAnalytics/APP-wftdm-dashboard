# Contract: `wftdm-dashboard summarize` CLI

## Invocation

```
wftdm-dashboard summarize
  --input   <path>    # required — raw ActivitySim output directory (contains
                       #   the files summarize.yaml's sources: block names,
                       #   e.g. trips.csv, households.csv, zones.parquet)
  --config  <path>    # required — path to the summarize.yaml to run
  --output  <path>    # required — destination scenario directory; created
                       #   if it doesn't exist
  --scenario-name <str>  # required — becomes manifest.yaml's scenario_name
  --display-name  <str>  # optional — defaults to --scenario-name
  --run-date      <str>  # optional — ISO date (YYYY-MM-DD); defaults to
                          #   today's date at run time
  --model-version <str>  # optional — omitted from manifest.yaml if not given
  --color         <hex>  # optional — e.g. "#4e79a7"; auto-assigned from the
                          #   Tableau10 palette if omitted (research.md §5)
  --notes         <str>  # optional — omitted from manifest.yaml if not given
  --pinned                # optional flag — defaults to unset (pinned: false)
```

`wftdm-dashboard summarize --help` prints usage text and exits `0` (click's
own standard convention — requesting help is not an error); `wftdm-dashboard
summarize` with no arguments prints a `click`-generated usage/error message
(missing required options) and exits `2`. Both cases touch no file — FR-009
only requires "clear usage instructions, not a stack trace," which both
satisfy; a corrected earlier draft of this contract claimed `--help` also
exits non-zero, which is not click's real, standard behavior and was fixed
here before implementation, not after.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Every metric's Parquet file was written; `manifest.yaml` was written |
| `1` | A `PostprocessorError` occurred (missing source, unresolved placeholder, unknown bin type, duplicate metric name, or a metric SQL execution failure) — a single-line, human-readable message is printed to stderr naming the specific offending element (FR-010) |
| `2` | `click`'s own usage error (missing required option, unreadable `--config` path, etc.) — click's own standard behavior, unmodified |

## Side effects (on success)

1. `{output}/summary/` is deleted and recreated (research.md §8) — 100%
   replaced by the current run's metrics, never a merge with a prior run's
   files.
2. One `{output}/summary/{metric.name}.parquet` per entry in the config's
   `metrics:` list.
3. `{output}/manifest.yaml` is written (created or overwritten) per the
   `Manifest` shape in data-model.md.
4. Nothing is written or modified inside `--input` (the raw ActivitySim
   output directory is read-only from this command's point of view).
5. Stdout lists each metric name and its output path as it's written — a
   modeler running this interactively sees live progress, not silence
   until the process exits (supports SC-002's "no hand-written scripting
   step" experience — the tool's own console output is the confirmation
   step, not a separate manual check).

## Non-goals (explicitly not covered by this contract)

- No `--dry-run` mode in this feature — every invocation either fully
  succeeds or fails before writing anything (config/source validation
  happens before any file is written, per FR-010's ordering; there's no
  partial-write state to "preview").
- No batch/multi-scenario mode — one `--input`/`--output` pair per
  invocation (spec.md Scale/Scope).
- No progress bar/percentage — per-metric log lines are the only progress
  signal.
