# 054-pool-consolidation-and-boot-unblock

Two independent fixes requested from `053`'s own findings. One shipped
as designed. The other was investigated, found to fix a problem that
doesn't actually exist (a real, self-caught mistake in `053`'s own
analysis), and reverted before being committed — reported honestly
below rather than silently dropped.

---

## Fix 1 — shared loader pool, not one-per-scenario (shipped)

**Confirmed the real, correct design before implementing, per the
request.** The concurrency-duplication bug lives entirely in
`services/scenarioDiscovery.ts`, not in `services/duckdbLoaderPool.ts`
itself: `registerFilesViaPool()` already accepts an arbitrary file list
and boots exactly one pool for whatever it's given — the bug was that
`registerPublishedScenarios()`/`registerDemoScenarios()` called it once
PER SCENARIO, inside their own `Promise.all(names.map(...))`, so N
scenarios registering concurrently produced N separate pools. **The
pool does not need to become an eternal, boot-sequence-lifetime
singleton** — `registerObserved()`/`registerPublishedScenarios()`/
`registerDemoScenarios()` already run strictly sequentially (a real,
documented ordering dependency for `appState`'s `order` field and
`getBaseline()`'s tie-break, unrelated to this fix and left untouched),
so there is never more than one GROUP's own scenarios registering
concurrently at a time. The fix only needs to share ONE pool across all
scenarios *within* one concurrent group — confirmed sufficient by
checking real request/response network evidence, not just reasoning
about it (see verification below).

**What changed**: `scenarioDiscovery.ts` gained
`fetchScenarioFileList()` (the cheap `index.json` → `PoolFileSpec[]`
resolution, split out so it can run per-scenario while registration
itself doesn't) and a new shared `registerScenarioGroupFiles()`,
replacing each group's own per-scenario `Promise.all()` body with a
three-phase sequence: (2a) fetch every scenario's own file list
concurrently — cheap, unchanged from before; (2b) **one combined
`registerFilesViaPool()` call across every scenario's files in the
group**; (2c) split the combined `{succeeded, failed}` result back out
per scenario by `viewName` prefix (`"{name}__"`, already
globally-unique) to set each scenario's own `status`/`failedFiles`/
`active` independently. `registerFilesViaPool()` and
`duckdbLoaderPool.ts` needed **zero code changes** — the whole fix is
in who calls it and with what combined input.
`registerObserved()`/`registerSummaryFolder()` (its own one-scenario
convenience wrapper) are unchanged — a single scenario has no sibling
to share a pool with, so there was never a bug there.

### Real, fresh-profile-adjacent verification

A local, controlled A/B (same 60ms-latency static server, same real 105
demo-content files, methodology matching every prior A/B this session)
comparing the currently-live tree (`0ee7875`) against this branch, 2
runs each, counting real `.wasm` response events (each one an
`instantiate()` call by some `AsyncDuckDB` instance — shared or
loader):

| | pre-054 (currently live) | post-054 (this branch) |
|---|---|---|
| `.wasm` response events | **19** (both runs) | **7** (both runs) |
| real data visible | 5917 / 6050 ms | 5830 / 5859 ms |
| Parquet registration span | ~1537 / 1723 ms | ~1595 / 1534 ms |

**19 → 7 is exactly the predicted fix**: pre-054's 3 real demo
scenarios registering concurrently, each spinning up its own pool of up
to 6 loaders, produced 1 (shared) + 3×6 (loaders) = 19 instantiate()
calls; post-054's ONE combined pool for the same 3-scenario group
produces 1 (shared) + 6 (one shared pool) = 7. Confirmed identically
across both runs — not a one-off. The overall timing win from this fix
alone is real but modest in this specific local test (a few hundred ms)
— removing 12 redundant WASM compilations reduces CPU contention, which
matters more on a lower-core real device than this test machine's own
CPU handles it; the honest, disclosed limitation is that a controlled
local A/B on one specific machine can't fully speak to how much this
helps on a genuinely resource-constrained real client, which is exactly
the CPU-bound nature of the cost this fixes.

**Regression check**: `npx tsc --noEmit` clean; `npm run test:unit`
471/471 (unchanged — nothing here is unit-testable in isolation,
Worker/WASM-dependent); `boot.spec.ts` + `dashboardShell.spec.ts`
(19/19), including the test that directly exercises "one failed
registration does not block the rest" — confirms the per-scenario
failure-isolation property `052` built is still intact after
`registerScenarioGroupFiles()`'s own combine-then-split restructuring.

---

## Fix 2 — investigated, found unnecessary, reverted (not shipped)

**A real mistake in `053`'s own analysis, caught before it was ever
committed.** `053`'s Part 1 claimed "the Shell doesn't render ANYTHING
(not even a loading skeleton) until `discoverScenarios()` fully
resolves," based on DOM sampling showing `#app`'s own `innerHTML`
staying at a flat, unchanging 3714 bytes for the whole pre-mount
period. That number was misread as "blank." **It isn't** — reading
`index.html` directly (something that trace never did) shows a real,
deliberately built, already-deployed static HTML skeleton baked
directly into the page — commit `138c75d` ("apply design system to
shell/nav (Phase 2) — page title role, boot skeleton, …"), present from
the very first paint with **zero JavaScript required at all**: a
shaped header+KPI-card+chart-card placeholder using this app's own
established `animate-pulse rounded-md bg-muted` shimmer treatment,
discarded automatically the instant `ReactDOM.createRoot(...).render()`
mounts the real `Shell` (`createRoot()` unconditionally replaces a
container's existing children on first render — no manual cleanup
needed, confirmed directly from that code's own comment).

`main.tsx`'s own structural fact — `discoverScenarios()` is fully
awaited before `ReactDOM.createRoot(...).render()` ever runs — is still
true and correctly described. What doesn't follow from it is "so
nothing is visible": a real loading UI already exists entirely outside
React's own render cycle, satisfying the actual requirement ("a real
skeleton/loading UI mounts immediately... not blocked on any async
work") as well as anything could — static HTML painted by the browser
before a single line of JavaScript executes is strictly faster than
any React-level render could be.

**What was built, then reverted**: a `BootSkeleton` React component
plus a restructured `main.tsx` that created the root early and rendered
`BootSkeleton` synchronously before the async boot chain, then
re-rendered with the real `Shell` once ready. Confirmed via real,
fresh-profile testing that this was **redundant, not broken** — both
the reverted version and the final, unchanged `main.tsx` show real
content at the same ~200–220ms mark (the pre-existing static skeleton),
because `index.html` was never touched by either version. Since the
React-level skeleton added an extra, unnecessary reconciliation cycle
(static skeleton → React `BootSkeleton` → React `Shell`, instead of the
existing static skeleton → React `Shell` directly) for zero real
benefit, it was reverted: `git checkout -- src/main.tsx` (confirmed
byte-identical to `main` afterward) and `src/layout/bootSkeleton.tsx`
deleted, never committed.

`specs/053-post-052-trace-and-consolidation/research.md` itself carries
a correction (not a silent rewrite) recording this — see that file's
own "Correction" block under Part 1, item 4.

**Net conclusion**: there is no real "boot-blocking" problem left to
fix here. The remaining ~5–6 second boot window (in this local test;
real, live-network numbers were consistently in the same range across
this whole session's own traces) is real async work — WASM
instantiation, scenario-file registration, config loading — already
covered by Fix 1 above and by `052`'s own prior fix, not a rendering
gap.

---

## Explicitly out of scope, per the request

The `.duckdb`-native-format consolidation researched in `053` Part 2 is
**not** pursued here — deliberately rejected for this pass, deferred
pending separate, dedicated scale-validation testing. Nothing in this
branch touches the CSV-vs-Parquet architecture question either way.
