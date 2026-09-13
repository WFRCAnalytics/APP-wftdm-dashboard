# 050-scope-multi-connection — research

Scoping-only pass (no implementation) for the dominant remaining boot-time
cost identified by `048-post-042-perf-check`: DuckDB-WASM's single shared
connection serializing scenario-file registration. Every finding below is
from a real, direct trace or a real, reproducible empirical test — not
read off `project-docs/ARCHITECTURE.md` or assumed from prior write-ups.

---

## 1. SharedArrayBuffer / threaded-bundle dependency — confirmed, not assumed

**Bundle selection, confirmed by reading the installed library's own
source** (`node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser.mjs`,
de-minified around its `selectBundle` function):

```js
async function selectBundle(bundles) {
  const features = await getPlatformFeatures()
  if (features.wasmExceptions) {
    if (features.wasmSIMD && features.wasmThreads && features.crossOriginIsolated && bundles.coi)
      return { mainModule: bundles.coi.mainModule, mainWorker: bundles.coi.mainWorker, pthreadWorker: bundles.coi.pthreadWorker }
    if (bundles.eh)
      return { mainModule: bundles.eh.mainModule, mainWorker: bundles.eh.mainWorker, pthreadWorker: null }
  }
  return { mainModule: bundles.mvp.mainModule, mainWorker: bundles.mvp.mainWorker, pthreadWorker: null }
}
```

`services/duckdb.ts`'s `MANUAL_BUNDLES` supplies **only** `mvp` and `eh` —
no `coi` key at all. The first branch's `&& bundles.coi` check is
therefore **always false**, regardless of `crossOriginIsolated`,
`wasmThreads`, or anything else the browser reports — `selectBundle()`
can only ever return `eh` (virtually every real browser today) or `mvp`,
and **neither returned bundle ever has a non-null `pthreadWorker`**. This
app's DuckDB-WASM instance is unconditionally single-threaded today; the
`coi` (threaded, `SharedArrayBuffer`-based) bundle is architecturally
unreachable with the current bundle config, independent of cross-origin
isolation state.

**Is `crossOriginIsolated` actually `true` on a live load, and does it
stick across the coi-serviceworker's reload?** Traced directly against
the live, now-042-shipped site, 4 real runs, sampling `self.
crossOriginIsolated` every 500ms from navigation through boot:

| run | navigations | `crossOriginIsolated` before reload | after reload | stays `true` through boot |
|---|---|---|---|---|
| 1 | 2 | `false` | `true` | yes |
| 2 | 2 | `false` | `true` | yes |
| 3 | **3** (a real, observed extra reload cycle — two "COOP/COEP Service Worker registered" messages) | `false` | `true` | yes |
| 4 | 2 | `false` | `true` | yes |

4/4, isolation reliably activates after the reload and holds for the
rest of the session — including the one run that hit a second,
previously-undocumented reload cycle. It does **not** silently fail to
stick, in any observed run.

**Plain statement of viability:** hardening the coi-serviceworker step is
**not a prerequisite** for a multi-connection (or multi-instance) fix.
The two are genuinely independent, for two separate reasons: (a) cross-
origin isolation is already reliably active by the time boot-critical
work happens, and (b) — decisively — nothing in §3 below that actually
works requires it at all. Ordinary `Worker` instances and `db.connect()`
both function with no COOP/COEP/SharedArrayBuffer involvement whatsoever.
The `coi` threaded bundle remains a **separate, unexplored 4th option**
(see §4) that WOULD depend on the isolation step — but it is not what
"multi-connection" means, and this scoping pass does not need it to
reach a real answer.

---

## 2. Current registration flow — confirmed by a real trace, not the docs

Traced directly against the live (042-shipped) site with Playwright's
page-level `request`/`response` events (chosen over raw CDP specifically
because DuckDB-WASM's own httpfs fetches happen inside its dedicated
Worker — a `context.newCDPSession(page)` session is scoped to the page
target only and saw **zero** of these requests; Playwright's own
worker-inclusive page-level events saw all of them):

- **105 real `.parquet` requests** on a normal load (3 demo scenarios'
  `summary/` folders) — matches the count already on record from `042`'s
  own investigation, now independently re-confirmed post-deploy.
- **Zero overlap.** Sorted request-start and request-finish timestamps
  are the same list, offset by one position — request *N+1* does not
  start until request *N* finishes, every time, across all 105. This
  holds despite `042`'s own `Promise.all()` conversion of the
  registration loop (`scenarioDiscovery.ts`) — the JS-side call is
  concurrent; the resulting network traffic is not.
- **Real span: ~2.94 seconds**, first request start to last request
  finish (~28ms/file average) — this is the actual, current, dominant
  cost `048` identified, now measured directly rather than inferred.

This confirms `042`'s own already-documented explanation (PIPELINE.md
§"DuckDB-WASM's single shared connection serializes query execution
internally") holds in production, not just in the earlier local
diagnostic. §3 below locates **exactly** where the serialization point
is — it is not where a first guess would put it.

---

## 3. Does `db.connect()` actually parallelize anything? — tested directly, answer: no

Confirmed from the type surface first (`async_bindings.d.ts`):
`registerFileURL`/`registerFileBuffer`/etc. are methods on **`AsyncDuckDB`
itself** (the one shared instance), never per-connection — file
registration is DB-instance-scoped no matter how many connections exist.
`AsyncDuckDBConnection.query()` funnels through `AsyncDuckDB.postTask()`,
which `postMessage()`s to the **one** underlying `Worker` regardless of
which connection issued the call.

That structural fact was then tested empirically — a standalone harness
(the real, installed `@duckdb/duckdb-wasm` package, bundled via esbuild
to sidestep bare-specifier resolution, served locally with a real 60ms
injected per-request latency, 16 real published demo Parquet files,
each test group given its **own distinct set of file URLs** — necessary
because an early attempt reusing the same URLs across test groups was
confounded by DuckDB-WASM's own internal fetch cache making every test
after the first look implausibly instant):

| test | shape | total (16 files) |
|---|---|---|
| A | 1 connection, sequential (`for` loop) | 1685 ms |
| B | 1 connection, `Promise.all()` (**current app's own pattern**) | 1220 ms |
| C(2) | 2 connections via `db.connect()`, `Promise.all()` | 1191 ms |
| C(4) | 4 connections | 1205 ms |
| C(8) | 8 connections | 1180 ms |
| D(2) | **2 separate `AsyncDuckDB` instances** (own Workers) | 1097 ms |
| D(4) | **4 separate `AsyncDuckDB` instances** (own Workers) | **477 ms** |

B/C(2)/C(4)/C(8) are all statistically the same (~1.18–1.22s),
**regardless of connection count** — and the per-file completion
timeline for every one of them is an identical, evenly-spaced staircase
(each file waits for the previous one, one at a time), confirming what
the type surface predicted: **more connections on the same
`AsyncDuckDB` instance buy zero additional throughput.** They let a
caller issue queries without blocking on a prior call's *return*, but
the single Worker still processes every task — from every connection —
strictly one at a time, because there is exactly one single-threaded
WASM engine instance underneath them all (§1: no `coi`/pthread bundle in
play).

D(2)/D(4) — genuinely separate `AsyncDuckDB` instances, each its own
`Worker` — show the opposite: real, scaling parallelism. D(4)'s own
per-file timeline shows near-simultaneous completions across all 4
instances at each "round" (243ms → 320ms → 406ms → 477ms, four rounds of
four files each), a clean parallel-lockstep signature, and lands at
**477ms total — roughly 2.5× faster than the single-instance baseline**,
using no `SharedArrayBuffer`/cross-origin isolation at all (§1).
D(2)'s smaller, less-clean win (1097ms) is consistent with a real,
separate finding worth carrying into design: each fresh instance pays a
non-trivial one-time warm-up cost before its first file resolves (~500ms
for D(2) at 8 files/instance vs ~240ms for D(4) at 4 files/instance) —
that fixed cost is paid **concurrently** across instances, but dilutes
the benefit more heavily the fewer instances you split across.

**Answer to the core question:** concurrent connections against one
`AsyncDuckDB` instance do **not** parallelize file registration or HTTP
fetches — they only allow concurrent query *issuance*, with registration
(and everything else) still serializing underneath, exactly as deep as
the shared single Worker. Real parallelism requires genuinely separate
`AsyncDuckDB` instances (separate Workers), not more connections on one.

---

## 4. Implementation options

*(Design only — nothing below is built. Effort is rough, relative
sizing, not estimated hours.)*

### Option 1 — Do nothing further to the connection model; batch/pipeline within one connection
Keep the current single-instance, single-connection design; instead of
`Promise.all()`-firing every `registerFileURL()`+view-creation query at
once (which — per §3 — doesn't help and adds no clarity), just accept
the ~2.9s registration cost as a floor and look for wins elsewhere (e.g.
overlapping registration with other genuinely-independent boot work,
lazy-registering a scenario's files only when a panel actually needs
them instead of eagerly registering all 105 upfront).
**Effort: trivial** (mostly deletion/simplification of `042`'s own
`Promise.all()`, which this finding shows was never buying real
parallelism — though it's harmless to leave, since it doesn't hurt to
keep the call-site shape ready for a future connection model). **Win:
~0** on the 2.9s registration cost itself; a lazy-registration variant
could cut it substantially for a real user who never opens most tabs,
but that's a different, separately-scoped change (deferred-loading
behavior, not a connection-model fix).

### Option 2 — Worker-per-scenario: one `AsyncDuckDB` instance per registered scenario
Give each scenario (`observed`, and each published/demo scenario) its
own `AsyncDuckDB` instance/Worker at registration time, instead of one
shared instance for the whole app. `registerSummaryFolder()`'s existing
per-scenario grouping in `scenarioDiscovery.ts` already has a real,
natural instance boundary to key on — this fits Phase 2 of `042`'s own
two-phase restructuring (manifest/registration sequencing stays
Phase 1; per-scenario file registration becomes Phase 2, now genuinely
parallel across scenario-scoped instances rather than `Promise.all()`
inside one).
**Real, confirmed cost this option must design around:** every SQL
query in this app (`panelQuery.ts`, `sqlExpander.ts`'s `$scenario` UNION,
comparison-diff cross-scenario joins) currently assumes **one** shared
connection/instance can see every registered view across every
scenario — a real, structural assumption, not a small config knob.
Splitting instances per scenario means a query spanning scenarios (any
`$scenario` union, any `comparison: diff`, the Graphic Walker dataset
picker's cross-scenario schema check) can no longer run as one SQL
statement against one instance; it would need either (a) a query-
splitting/merge layer that fans a cross-scenario query out to N
instances and combines results in JS, or (b) a secondary "query"
instance that stays single/shared while N "loader" instances exist only
transiently for registration and get their file mappings/data merged
into the shared instance afterward (e.g. via `copyFileToBuffer()` +
`registerFileBuffer()` on the shared instance — real APIs, both already
confirmed to exist).
**Effort: substantial** — this is the one real architectural change of
the three options, touching the connection-sharing assumption baked
into `sqlExpander.ts`/`panelQuery.ts`, not just `scenarioDiscovery.ts`.
**Win: large and directly evidenced** — §3's D(4) result (2.5× on 16
files, 4 instances) scales naturally to the real 105-file/3-scenario
shape (3 scenario-scoped instances registering ~35 files each,
concurrently, is a closer match to D(3)-equivalent behavior than
anything tested, but the trend through D(2)→D(4) supports a real,
multi-second-to-sub-second-class win on the registration phase
specifically).

### Option 3 — A small, fixed-size pool of "loader" instances, decoupled from scenario count
Instead of one instance per scenario (which ties instance count to
however many scenarios happen to be loaded — 1 today, potentially many
more in a real WFRC deployment), spin up a fixed pool (e.g. 3–4,
matching §3's D(4) result) of throwaway `AsyncDuckDB` "loader" instances
purely for the registration phase — each grabs the next unregistered
file off a shared queue, fetches/registers it, then hands the resolved
buffer to the ONE real, shared, query-serving instance via
`copyFileToBuffer()`/`registerFileBuffer()` (both real, confirmed APIs),
and is torn down (`terminate()`, also real/confirmed) once the queue is
empty. All real query-time SQL keeps running against the single shared
instance exactly as today — **zero** change to `sqlExpander.ts`,
`panelQuery.ts`, or any cross-scenario query shape.
**Effort: medium** — new code only in the registration path
(`services/duckdb.ts` gains a pool-management layer + a buffer-handoff
step), no change to how any panel or query-building module talks to the
database. This is the option that most cleanly isolates "make
registration fast" from "how querying works," matching this app's own
existing service-layer boundary (`services/duckdb.ts` as the sole
DuckDB touchpoint).
**Win: comparable to Option 2 on the registration phase** (same
underlying multi-instance parallelism, same D(4)-class evidence),
without Option 2's query-time complexity — the pool's own fixed size
(not scenario-count-dependent) also means it scales predictably as a
real deployment adds more scenarios, where Option 2's "one instance per
scenario" would keep growing instance count unboundedly.

### Option 4 (not requested, flagged for completeness) — Adopt the `coi` threaded bundle
Add a real `coi` entry to `MANUAL_BUNDLES` and let `selectBundle()`
actually pick it when `crossOriginIsolated` is true (§1 confirms it
reliably is). This gives ONE `AsyncDuckDB` instance genuine internal
multi-threading (pthreads) rather than solving the problem via multiple
instances — a fundamentally different mechanism from anything above,
untested here, and the one option that genuinely *does* depend on the
coi-serviceworker step staying solid. Flagged only so it's on record as
a considered-but-out-of-scope alternative; no evidence gathered on
whether duckdb-wasm's threaded bundle actually parallelizes httpfs
fetches across threads any better than the single-thread case (a real
open question, not assumed either way) — would need its own,
separate investigation before being comparable to Options 2/3 above.

---

## Recommendation for the next decision point

Options 2 and 3 are the only two with real evidence behind them (§3);
Option 3 is very likely the better starting point — same class of win,
far smaller blast radius (no change to any existing query-building
code), and a fixed, tunable pool size instead of an unbounded
one-instance-per-scenario count. Option 2 becomes worth revisiting only
if Option 3's buffer-handoff step turns out to cost more than expected,
or if a future feature specifically wants per-scenario instance
isolation for an unrelated reason.
