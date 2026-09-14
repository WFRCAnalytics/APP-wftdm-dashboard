# 053-post-052-trace-and-consolidation — research

Two independent investigations, no implementation. (1) A granular,
phase-by-phase trace of the CURRENT (post-052) live site on a genuinely
fresh browser profile — real numbers, not assumed carryover from prior
sessions. (2) Whether the Python post-processor could emit far fewer
files per scenario, attacking the real root cause (too many small HTTP
round-trips) instead of continuing to optimize the client-side pool.

---

## Part 1 — granular phase trace, post-052, live site, fresh profile

Same methodology as every prior trace this session: a genuinely fresh,
never-used persistent browser profile (brand-new temp `userDataDir` per
run), against `https://wfrcanalytics.github.io/APP-wftdm-dashboard/`.
Confirmed first, independently, that `052` is actually the code running
live — `main` is at `0ee7875` ("rebuild docs/ to ship 050-052's
parallelized scenario registration"), pushed to `origin/main`, and a
fresh cache-disabled fetch of the live `index.html` is byte-identical to
the current committed `docs/index.html`.

**Two real Resource-Timing gotchas hit and resolved before the numbers
below were trustworthy** (both real findings in their own right, not
just harness bugs):

1. The page's own `performance.getEntriesByType('resource')` (Resource
   Timing API) does **not** include DuckDB-WASM's own Worker-issued
   fetches (the wasm binary, the parquet extension, every `.parquet`
   file) — Resource Timing is scoped per JS realm, and the Worker has
   its own separate `self.performance` timeline the main page never
   sees. Playwright's own page-level `request`/`response` events (used
   throughout this session already) DO observe them — cross-checked
   here again, not assumed to still work correctly on `052`'s code.
2. `.wasm` request/response EVENTS were 38, not 1 — investigated
   directly (not assumed to be "38 real network downloads") via
   response headers: every single one carries `fromCache: true` and an
   identical `content-length` (7,842,000 bytes) — real network transfer
   happened ONCE; every other "request" is the browser's HTTP cache
   satisfying a separate `fetch()` call. The real cause of 38 separate
   fetch CALLS, confirmed directly against this session's own
   `scenarioDiscovery.ts`/`duckdbLoaderPool.ts` source: `registerDemoScenarios()`
   runs all 3 real demo scenarios' `registerSummaryFolder()` calls
   CONCURRENTLY (`Promise.all(names.map(...))`), and each one spins up
   its OWN fresh pool of up to 6 loader instances — **up to 18
   concurrent `AsyncDuckDB` instances at peak, each independently
   calling its own `instantiate()` (which fetches — cache-hit after the
   first — and, critically, COMPILES its own copy of the ~35–39MB
   uncompressed wasm module) and independently installing/loading the
   parquet extension.** This is real, CPU-bound work that cannot be
   shared across instances the way HTTP bytes can be cached — a genuine
   cost `051`'s own scoping sweep never measured (it tested ONE pool in
   isolation, never multiple concurrent pools racing across scenarios,
   which is exactly what the real `registerPublishedScenarios()`/
   `registerDemoScenarios()` architecture does).

**Real phase breakdown**, 2 fresh-profile runs (all times ms from
navigation start; `t=0` is the very first, soon-to-be-discarded
pre-reload page load):

| phase | run 1 | run 2 | what it measures |
|---|---|---|---|
| coi-serviceworker reload dead time | 271 | 202 | before the SW-triggered reload fires |
| DuckDB wasm+extension activity span | 523 → 4063 | 437 → 4027 | first instantiate() call → last one settles (cache-hit fetches + real CPU-bound compilation across up to ~19 concurrent engine instances) |
| config fetches (manifest.yaml/index.json/dashboard-*.yaml) | 720 → 5219 | 887 → 4176 | blocked until `discoverScenarios()` resolves — `main.tsx` awaits it before `loadDashboards()` even starts |
| **real Parquet file registration (105 files)** | 3887 → 4630 (**743ms**) | 3786 → 4192 (**406ms**) | the ACTUAL network file-fetch phase |
| eager JS bundle (8 main-thread chunks) | 55 → 5305 | 55 → 4202 | ends right when `discoverScenarios()` finally resolves (React can't mount before that) |
| React mounts, panel-type chunks load | 5229 → 5461 | 4186 → 4277 | `ValueBoxPanel`/`recharts`+`RechartsPanel`/`plotly`+`PlotlyPanel`/`MarkdownPanel` — confirmed exactly matching the Summary tab's real config, nothing else |
| **total (`window.__wftdm` ready / real data visible)** | **5690 / 5679** | **4986 / 4913** | |

**Answering the user's own five numbered items directly:**

1. **DuckDB-WASM binary download+init**: real network download happens
   ONCE (~7.8MB gzipped, cached thereafter), but the full "activity
   span" (fetch + compile, across up to ~19 instances) stretches to
   ~4000ms — the single largest concurrent-with-everything-else block.
2. **Summary tab's own panel types, confirmed directly from the real,
   live config** (`public/demo-dashboard-config/dashboard-1-summary.yaml`):
   5 `valuebox` panels (all `summary_kpis`, pinned to
   `activitysim-baseline` only — ONE file), 1 `recharts` panel
   (`trip_mode_share`, unpinned — up to 3 real-scenario files), 1
   `plotly` panel (`trip_distance_by_purpose`, unpinned — up to 3 real-
   scenario files), 1 `markdown` panel (no query at all). **Yes, the
   first tab DOES include a Plotly panel** — confirmed directly, not
   assumed — and the trace confirms `plotly-BbWPiKc9.js` (4.68MB/
   1.4MB gzipped) genuinely loads, but only AFTER React mounts (~4186–
   5229ms), taking a further ~91–232ms alongside the other needed panel
   chunks — small in absolute terms, but real, and unavoidable for this
   specific tab's real content regardless of any registration-phase fix.
3. **Scenario-file registration, real current cost: ~406–743ms** for
   all 105 files — genuinely fast now, confirming `052`'s fix works in
   production, not just in the controlled local A/B.
4. **Panel-rendering query phase**: real, but small — DOM sampling
   shows the Shell doesn't render ANYTHING (not even a loading skeleton)
   until `discoverScenarios()` fully resolves (`main.tsx` awaits it
   before `ReactDOM.createRoot(...).render()` is ever called — confirmed
   directly from source, not assumed) — `appInnerHTMLLength` stays at a
   flat, unchanging 3714 bytes for the ENTIRE pre-mount period, then
   jumps to 17442 bytes (Shell mounted, panels still loading/querying),
   then to a final value once "Households" appears. That final query
   phase (mount → real data) is **~91–488ms** — DuckDB's confirmed
   single-connection query serialization (050) does add SOME real
   serial cost here (7 panels' worth of queries on one connection,
   sequential), but it's a small fraction of the total, not a second
   multi-second bottleneck.
5. **coi-serviceworker reload cost, this specific test: ~202–271ms** —
   consistent with every prior measurement this session, small and
   bounded.

**Correction (`054-pool-consolidation-and-boot-unblock`, found while
scoping a fix for item 4 above, before writing any code — real, self-
caught, not shipped wrong):** item 4's own claim that "the Shell doesn't
render ANYTHING (not even a loading skeleton)" is **wrong**. The
`appInnerHTMLLength` staying flat at 3714 bytes for the whole pre-mount
period was misread as "blank" — it is in fact a real, deliberately
built, already-deployed **static HTML skeleton** baked directly into
`index.html` itself (`138c75d`, "apply design system to shell/nav
(Phase 2) — page title role, boot skeleton, …"), present from the very
first paint with zero JavaScript required at all: a shaped
header+KPI-card+chart-card placeholder using this app's own established
`animate-pulse rounded-md bg-muted` shimmer treatment, replaced
wholesale the instant `ReactDOM.createRoot(...).render()` mounts the
real `Shell` (that component unconditionally replaces a container's
existing children on first render — no manual cleanup needed, per its
own code comment). `main.tsx`'s own boot sequence genuinely still gates
`ReactDOM.createRoot(...).render()` on `discoverScenarios()` resolving
— that structural fact is unchanged and correctly described — but the
IMPLICATION drawn from it here ("so nothing is visible") does not
follow, because a real loading UI exists entirely outside React's own
render cycle. A React-level "mount a skeleton immediately" fix was
drafted in response to this section's own wrong claim, confirmed
redundant against the already-deployed static skeleton (same content,
same timing, an unnecessary extra reconciliation cycle on top of an
already-solved problem), and reverted before ever being committed — see
`specs/054-pool-consolidation-and-boot-unblock/research.md` for the
full record of that dead end.

**The real, corrected headline finding — direct answer to "don't
assume registration is still dominant":** it isn't, anymore. `052`
fixed the actual file-transfer cost (105 files now register in well
under a second). But that fix **surfaced a new bottleneck it didn't
previously need to compete with**: real, CPU-bound WASM engine
instantiation, multiplied by running up to ~19 separate loader/shared
instances concurrently (an architecture gap `051`'s own scoping sweep
never tested, since it only ever measured one pool in isolation). This
new cost — together with React's own inability to mount ANYTHING until
`discoverScenarios()` fully resolves — is what now occupies the bulk of
the ~4–4.2 second middle stretch of a ~5–5.7 second total boot. This is
a genuine, real, actionable finding for a future fix (e.g., cap TOTAL
concurrent loader instances across ALL scenarios, not per-scenario;
or, per Part 2 below, eliminate most of the per-file registration need
entirely) — not proposed or built here, per this investigation's own
scope.

---

## Part 2 — could the post-processor emit far fewer files per scenario?

**Direct answer to the literal question ("one Parquet file, multiple
named tables"): no.** Parquet is a single flat columnar format — one
schema, one set of row groups, no multi-table concept at all. There is
no way to make ONE `.parquet` file hold 35 independently-schemaed
tables the way an Excel workbook or a real database file can.

**But a real, confirmed, working alternative exists: DuckDB's own
native database file format (`.duckdb`) genuinely does support many
named tables with different schemas in one file — and DuckDB-WASM can
`ATTACH` a remote, HTTP-registered `.duckdb` file the exact same way it
already does `read_parquet()` on a registered Parquet file.** Verified
empirically, not assumed from documentation: wrote a real 3-table
`.duckdb` file via the Python `duckdb` package (v1.5.4, the same
library this project's post-processor already uses natively — no new
dependency), served it over real HTTP with byte-range support, and
successfully `registerFileURL()` + `ATTACH '...' AS sdb (READ_ONLY)` +
queried each table (`sdb.summary_kpis`, `sdb.trip_mode_share`,
`sdb.vmt_by_home_taz`) from DuckDB-WASM in a real browser — all three
returned correct data, `ATTACH` itself took ~42ms, each individual
table query 4–11ms.

**Confirmed this genuinely reduces network round-trips, not just file
count on disk**: counted real HTTP requests during the probe — **1**
request total for the whole `.duckdb` file (no `Range` header; DuckDB
fetched it in one shot, reasonable for a file this small), versus up
to 35 separate requests today (one `registerFileURL()` + view-creation
round-trip per metric). Since this whole investigation (048 through
052) has repeatedly found **per-request latency**, not bandwidth, to be
the dominant real cost, going from 35 round-trips to 1 attacks that
root cause directly rather than parallelizing around it.

### What would actually need to change

**Python post-processor (`python/wftdm_dashboard/postprocessor/
pipeline.py`)** — real, but localized: instead of `COPY (...) TO
'{output}/summary/{metric}.parquet' (FORMAT PARQUET)` per metric, open
one persistent DuckDB connection per scenario and `CREATE TABLE
{metric} AS (...)` for each — the same library, the same generated SQL
per metric (`expand.py`/`config.py`/`sources.py` untouched), just a
different terminal write step. `manifest.py`'s own `summary/index.json`
discovery file becomes SIMPLER, not harder — either unnecessary
entirely (post-ATTACH, `information_schema.tables` already reports
what's available) or reduced to naming the one `.duckdb` file instead
of enumerating 35 Parquet filenames.

**`services/duckdb.ts`** — real, but narrow: a new function alongside
the existing `registerFileURL()`/`registerScenario()`, e.g.
`attachScenarioDatabase(name, url)`, doing `registerFileURL()` +
`ATTACH ... (READ_ONLY)` + (cheaply, locally, no network) `CREATE VIEW
"{name}__{table}" AS SELECT * FROM {attachmentName}.{table}` for each
table `information_schema.tables` reports. That last step is the key
design choice: it preserves the EXISTING `{scenario}__{metric}` view
naming convention exactly, which means **`sqlExpander.ts`'s own
view-per-metric assumption needs ZERO changes** — every `$scenario`
union, every `comparison: diff`, every existing panel query continues
resolving against a view named exactly what it already expects; only
what's UNDER that view (an `ATTACH`ed table instead of a
`read_parquet()` call) changes.

**A real, disclosed version-compatibility risk, not a blocker but worth
flagging**: DuckDB's own on-disk storage format has historically had
real breaking changes across some version boundaries — unlike Parquet,
which has no such version-lock-in at all. This probe's own cross-version
pairing (Python `duckdb` 1.5.4 writer, the installed `@duckdb/duckdb-wasm`
package's ~1.4.3 engine reader) worked correctly here, consistent with
DuckDB's own public commitment to a stable storage format across 1.x
minor versions — but this is a real, ongoing constraint this approach
introduces that the current all-Parquet design simply doesn't have: both
the Python post-processor's `duckdb` version and `@duckdb/duckdb-wasm`'s
bundled engine version would need to be deliberately tracked/pinned
together, with compatibility re-verified on any future bump on either
side.

### Net assessment

This is a more fundamental fix than any further pool-tuning — it
eliminates ~34 of every 35 real HTTP round-trips per scenario instead
of parallelizing them, and Part 1's own trace confirms per-request
overhead (not bandwidth) is still the real, recurring theme across
every phase measured this session. It is also a larger, cross-cutting
change than `052`'s own loader pool: real changes to the Python
post-processor's output format, a new client-side registration path,
and — though not strictly required, since the compatibility-view
approach avoids it — a genuine opportunity to simplify
`services/scenarioDiscovery.ts`'s own per-file registration/failure-
handling logic considerably (a single ATTACH either succeeds or fails
for a whole scenario, which is arguably a CLEANER failure model than
today's per-file partial-failure tracking, at the cost of losing the
"2 of 35 metrics failed, the rest are fine" granularity `052` just
built). Not proposed as a concrete plan here, per this investigation's
own scope — reported so a real decision can be made with real evidence
behind it, matching every prior step this session.
