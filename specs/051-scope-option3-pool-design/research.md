# 051-scope-option3-pool-design — research

Tightens `050`'s Option 3 (fixed loader-instance pool + buffer handoff to
the shared query instance) to an implementation-ready design. Still no
implementation — every number below is from a real, direct, reproducible
test against real published Parquet files (`public/demo-scenarios/`), not
reused from `050`'s synthetic 16-file harness.

---

## 1. Pool size — swept against the real 105-file shape, and against
simulated growth

**Harness**: the same real, installed `@duckdb/duckdb-wasm` (esbuild-
bundled, served locally with a real 60ms injected per-request latency —
`050`'s own methodology), against the REAL 105 published demo Parquet
files (`activitysim-baseline`/`-density-variant`/`-transit-variant`, 35
files each, confirmed by direct count — matches the live app's own real
number exactly). Growth was simulated by duplicating one scenario's 35
files under two new scenario-name prefixes (`synth-scenario-4`/`-5`),
giving 140- and 175-file sets — real file bytes, synthetic scenario
count, which is the honest way to test "more scenarios" without
fabricating fake Parquet content.

Every `(fileCount, poolSize)` combination got its **own distinct set of
file URLs** (a lesson carried over from `050`: reusing URLs across test
groups let DuckDB-WASM's own fetch cache make later tests implausibly
fast). Reported below: `bootMs` (all pool instances' `instantiate()`,
run concurrently via `Promise.all`), `registrationMs` (wall time for the
whole file set once instances are warm), `totalMs` (their sum — the
real, honest end-to-end cost a viewer would feel).

| pool | 105 files (today, 3 scenarios) | 140 files (4 scenarios) | 175 files (5 scenarios) |
|---|---|---|---|
| 1 | 8912 ms (485 boot + 8427 reg) | 11289 ms | 13808 ms |
| 2 | 4789 ms (561 + 4228) | 5992 ms | 7356 ms |
| 3 | 3458 ms (626 + 2832) | 4403 ms | 5232 ms |
| 4 | 3023 ms (715 + 2308) | 3633 ms | 4282 ms |
| 6 | 2474 ms (891 + 1582) | 2996 ms | 3353 ms |
| 8 | 2471 ms (1116 + 1355) | 2718 ms | 2992 ms |

**Warm-up cost, made explicit (not folded into a single opaque total, per
the request):** `bootMs` — every pool instance's `instantiate()`, run
concurrently — grows roughly linearly with pool size regardless of file
count (485ms at pool=1 → 1116ms at pool=8, ~90ms/instance marginal cost).
This is a real, unavoidable per-instance fixed cost, paid once,
concurrently, before any file registration starts.

**Does the "optimal" pool size shift with file count?** Yes, but slowly
across the realistic near-term range:

- At **105 files (today's real shape)**, pool=6 and pool=8 are
  effectively **tied** (2474ms vs 2471ms — a 3ms difference, noise).
  Going from 6→8 instances buys ~227ms less registration time but costs
  ~225ms more boot time — a wash. There's no reason to run 8 loader
  instances for the workload that actually exists today.
- At **140 files**, pool=8 pulls ahead of pool=6 by a real, if modest,
  margin (2718ms vs 2996ms, ~9.3% faster).
- At **175 files**, the gap widens slightly further (2992ms vs 3353ms,
  ~10.8% faster).

So the sweet spot does move upward as file count grows — but slowly: a
**fixed pool size of 6** stays within ~11% of the 8-instance total even
at simulated 5-scenario scale (nearly double today's real scenario
count), while using 2 fewer concurrent Workers (real browser memory/CPU
cost, not free). This is the recommendation: **pool size = 6**, a plain
fixed constant, not an adaptive formula — the sweep doesn't justify the
added complexity of scaling pool size with scenario count for any
realistic near-term deployment size. If a real deployment's scenario
count grows enough to meaningfully change this balance (rough guide:
somewhere past ~200 files / ~6 scenarios, extrapolating the trend), that
is a real, re-testable question for whenever it actually happens — not
something to design around speculatively now.

**A sensible defensive cap, not evidenced by this sweep but worth
building in regardless:** clamp the pool size to
`navigator.hardwareConcurrency` (when available) so a low-core viewer
device never gets more concurrent Workers than it has cores for, e.g.
`Math.min(6, navigator.hardwareConcurrency || 6)`. Not tested here (this
sweep ran on one real machine) — a real, separate, cheap safety measure,
not a substitute for the sweep-backed default of 6.

---

## 2. Failure handling — confirmed real behavior, not assumed

**What does `AsyncDuckDB` actually do today on a fetch failure inside
`registerFileURL`?** Tested directly: register a file whose URL 404s,
then query a view over it.

- `registerFileURL()` itself **never throws** on a bad path — confirmed
  directly, matching `services/duckdb.ts`'s own existing comment
  (`registerFileURL()` "only registers a virtual filename -> URL
  mapping; it does no fetching itself"). The failure surfaces only at
  query time.
- The query (`CREATE VIEW ... AS SELECT * FROM read_parquet(...)`)
  **does throw**, and it's catchable with an ordinary `try/catch`.
- **The error message itself is not usable as-is**: `"_setThrew is not
  defined"` — a low-level Emscripten/Asyncify internal string, not
  anything resembling "404" or "file not found." Any UI-facing failure
  message must be authored by the catching code (a generic "this file
  could not be loaded" per-file message), never surfaced from
  `err.message` directly.
- **The connection/instance is not corrupted by the failure** —
  confirmed directly: the same connection successfully creates a
  *different* view and queries it correctly immediately after the
  failed query. A per-file failure is fully isolated; there is no need
  to recreate the connection or the instance after one.

**What does the app do with this today?** Read directly, not assumed:
`scenarioDiscovery.ts`'s `registerSummaryFolder()` wraps its *entire*
per-scenario `Promise.all(filenames.map(...))` in **one** `try/catch` at
the caller (`registerObserved()`/`registerPublishedScenarios()`/
`registerDemoScenarios()`), with no per-file catch at all. **Today, one
bad file out of a scenario's ~35 fails the ENTIRE scenario** — marked
`'failed'`, `console.warn`'d, and never activated — with no distinction
surfaced anywhere between "every file failed" and "34 of 35 loaded
fine." This is the real gap to close, not a hypothetical one.

**Design to build** (still not implemented):
- Each file's registration (`registerFileURL` + view-creation query)
  gets its **own** `try/catch`, inside the per-scenario loop — a failure
  in file *i* does not abort files *i+1..n*, and does not need to abort
  the whole loader-pool run.
- A failed file can be retried on **the same** loader instance
  (transient network blips are the realistic failure mode for a real
  deployment's HTTP-served Parquet; there's no reason to believe a
  different DuckDB-WASM instance would succeed where the first one's
  own `read_parquet()` failed against the identical URL) — a small,
  bounded retry count (e.g. 1 retry) is reasonable; do not build cross-
  instance retry routing, it adds real complexity for no evidenced
  benefit.
- `appState`'s scenario status gains real, honest partial-failure
  information instead of a binary `ready`/`failed`: track which
  specific files failed (by metric/view name) alongside the scenario's
  own status, so a scenario that mostly loaded can say so (e.g. a
  scenario stays `'ready'` if **any** file registered, but carries a
  list of failed metric names a panel-error-boundary-adjacent UI
  surface can report — "2 of 35 files failed to load for this
  scenario" — rather than the current all-or-nothing `'failed'`). The
  exact UI surface (a toast, a scenario-row badge, a console-only log)
  is a product decision outside this scoping pass's remit — the DATA
  needed to build any of those (a per-scenario list of failed file/
  metric names) is the concrete, buildable piece this research
  identifies.

---

## 3. Buffer-handoff cost — measured, and a real false alarm caught and
corrected before it could shape the design wrong

**First measurement** (one fresh "shared" instance per file, matching a
naive "everything is freshly booted" test): `copyFileToBuffer()` ~0.3–
0.6ms regardless of size (413B/1164B/89937B all alike); `registerFileBuffer()`
~46–50ms; `createView` ~63–65ms. Taken at face value, that's ~110ms of
handoff overhead per file — multiplied across 105 files, **~11.7
seconds** of new serialized work on the shared instance, which would
have **erased** the pool's entire parallelism win.

**That number was wrong, and re-tested before it could shape anything**:
the first test booted a brand-new "shared" instance for every single
file, so every measurement was really measuring the shared instance's
own **first-call warm-up**, not steady-state cost. Re-tested with ONE
shared instance receiving 15 sequential handoffs from 15 different
loader-produced buffers:

| handoff # | registerFileBuffer | createView |
|---|---|---|
| 1st (cold) | 37.3 ms | 65.0 ms |
| 2nd–15th | 0.0–0.4 ms | 1.3–2.7 ms |

**Real, steady-state cost: ~2–3ms per file**, not ~110ms — a one-time
~102ms warm-up on the shared instance's very first handoff, then flat.
For 105 files: ~102ms (once) + 104 × ~2.5ms ≈ **~360ms total** for the
entire handoff phase — a small, easily-absorbed addition on top of the
pool's own registration time (§1), nowhere near eroding it.

**A separate, confirmed mechanism worth documenting for whoever
implements this**: `registerFileBuffer()` **transfers** (detaches) the
underlying `ArrayBuffer` to the target instance's Worker rather than
copying it — confirmed directly (`buffer.byteLength` reads the correct
real size immediately after `copyFileToBuffer()`, then reads `0`
immediately after the buffer is passed to `registerFileBuffer()` on a
different instance). This is a real, zero-copy handoff — consistent
with, and the likely reason for, the flat, size-independent cost above.
**Implementation consequence**: a loader's own copy of a buffer is gone
(unusable) the instant it's hand off — never try to reuse or re-read a
buffer after handing it to the shared instance.

---

## 4. Teardown timing — confirmed safe, no race

Tested the exact scenario asked about: one loader instance assigned a
single file (finishes almost immediately), a sibling loader assigned 5
files (still working), and a third "shared" instance as the handoff
target. The fast loader registers its one file, hands its buffer off to
the shared instance, confirms the resulting view is queryable, **then
terminates itself immediately** — before the slow sibling has even
started its own 5 files.

Result: `handoffStillValid: true`, correct row count (441), and the slow
sibling's own 5 files completed normally afterward, unaffected.
**Terminating a loader instance the moment its own queue slice is empty
— not waiting for the rest of the pool — is safe, provided the handoff
(`copyFileToBuffer` → `registerFileBuffer` → the shared instance's own
view-creation query) is awaited to completion before that loader's
`terminate()` call.** This is the natural, correct sequencing any real
implementation would already use (you would never terminate a loader
mid-handoff) — confirmed here rather than assumed.

---

## Implementation-ready summary

- **Pool size: 6**, a plain fixed constant (not scenario-count-adaptive
  — the sweep doesn't justify that complexity for any realistic near-
  term deployment size), optionally clamped to
  `navigator.hardwareConcurrency` as an untested-but-sensible defensive
  floor/ceiling.
- **Failure handling**: per-file `try/catch` inside the registration
  loop (not one `try/catch` around the whole scenario, as today); one
  bounded retry on the SAME loader instance for a failed file; scenario
  status carries a real list of failed file/metric names instead of a
  binary ready/failed, so a partially-loaded scenario can be reported
  honestly. Never surface `err.message` directly to a viewer — it's a
  low-level Emscripten string, not a real error description.
- **Handoff mechanism**: `copyFileToBuffer()` (loader) →
  `registerFileBuffer()` (shared instance) → the shared instance's own
  `CREATE VIEW ... AS SELECT * FROM read_parquet(...)` — confirmed
  cheap in steady state (~2–3ms/file after a one-time ~102ms warm-up),
  confirmed zero-copy (transfers, doesn't clone, the underlying buffer).
- **Teardown**: terminate each loader instance as soon as its own queue
  slice empties (not batched at the end of the whole pool run) —
  confirmed safe as long as that loader's own handoffs are awaited
  first.

Nothing above has been built. This is the design a real implementation
task (a future `052`, or wherever this is picked up next) can start
from directly.
