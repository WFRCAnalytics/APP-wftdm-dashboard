# Zero-step summarization — proposal (deferred)

Recorded 2026-10-22. **Status: deferred.** Revisit once a proper set of real
scenario runs exists; trying it before then would be premature.

## Goal

A user does nothing except (1) author the SQL (`summarize.yaml`) and (2) point at
a scenario folder. No separate "run summarize, then load the output" step, and no
stale output left on disk.

## Where the idea started, and why it changed

Original idea: summarize raw ActivitySim CSVs straight into a native DuckDB
table, and have the dashboard read from that connection. DuckDB is fast enough
(~150 MB of CSV summarizes in seconds natively, and the post-processor is already
DuckDB). Speed is not the problem. The gain is removing the manual step.

The open question was *where the summary tables live*. Options weighed:

| | Approach | Verdict |
|---|---|---|
| A | Browser DuckDB-WASM summarizes raw CSVs | WASM is single-threaded (no cross-origin isolation in the shipped app) with a ~2–4 GB heap; several scenarios + observed, each with trips/tours/persons/households, will hit it. Chromium-only folder access; re-summarizes on every load. Fine as an optional "quick look at one run" mode, not the main path. |
| B | Native DuckDB process; dashboard queries it | Either a second query backend over HTTP/Arrow (breaks the static, browser-DuckDB model; every panel `query()` needs a second path) or the browser attaches a `.duckdb` file read-only (storage format is version-locked; Python and WASM versions must match exactly — fragile). |
| **C** | **Native DuckDB summarizes on launch, writes temp Parquet; browser reads Parquet as today** | **Chosen direction.** Dashboard unchanged; lazy per-tab loading, the GitHub Pages demo and the published-scenario flow keep working. |

## Decision: C

Parquet stays the single contract between post-processor and dashboard. That
boundary is what lets the static demo, the published deployment and a local tool
run the same front end. Replacing it with a live DuckDB connection would add a
runtime dependency on a server; only worth it if we later need ad-hoc SQL over
raw trip records from the browser.

Intended shape (builds on the not-yet-built `here`/`serve` CLI subcommands, see
CLAUDE.md "Not yet started"):

```
wftdm-dashboard here ./runs/*      # summarize on launch into a temp dir, serve, open
wftdm-dashboard publish ...        # explicit: write Parquet to a folder for hosting
```

- `here` runs the existing post-processor (`python/wftdm_dashboard/postprocessor/`)
  against the given folders, writing Parquet to a temp location, then serves the
  dashboard pointed at it. No output is left behind.
- Keep an explicit **publish** path. A shared dashboard must not depend on one
  machine being up, and published summaries are an audit record of what the
  numbers were.
- Re-summarize only when inputs or `summarize.yaml` change (hash/mtime check), so
  relaunch is instant.

## Local and hosted must both work (decided 2026-10-22)

The zero-step behavior is required in **both** modes: a local analyst and a hosted
dashboard on WFRC's server. Same user contract either way: author the SQL, point
at a scenario folder.

C covers both because the summarizer is server-side Python and the front end
only ever sees Parquet:

- **Local:** `here` summarizes into a temp dir and serves on localhost.
- **Hosted:** `serve` runs the same summarizer on WFRC's server against a
  configured scenario root, writing to a managed (persistent) output dir. Staff
  open a URL and install nothing.
  - Re-summarize automatically when a scenario folder or `summarize.yaml`
    changes (watch, or a trigger at the end of a model run), using the same
    hash/mtime skip as local.
  - Summarize per scenario, so adding one run does not redo the others.
  - Write to a staging dir and swap atomically so viewers never see
    half-written Parquet.
  - Surface summarize status/errors in the UI (a run that failed to summarize
    should say so, not silently vanish).
- The static GitHub Pages demo stays as is: pre-built Parquet, no server.

The one difference is lifecycle: local output is disposable, hosted output is
persistent and cached. Both share one code path.

## Before building

- Measure with real runs: total CSV size per scenario, summarize time, peak memory.
- Confirm the post-processor can run incrementally / skip unchanged inputs.
- Decide temp-dir location and cleanup on Windows (local) and the persistent
  output dir plus change-detection mechanism (hosted).
- Hosted: access control on the scenario root, and concurrency if two
  summarize jobs target the same scenario.
