# 052-option3-implementation — implementation notes

Real implementation of `051-scope-option3-pool-design`'s own now-complete
design: a fixed pool of loader `AsyncDuckDB` instances registering
scenario Parquet files in parallel, each handing its resolved buffer off
to the app's one shared query-serving instance. Branched from `051`
(not `main`) so this branch's own git history carries the full `050`→
`051`→`052` scoping trail, matching this project's own established
convention of building visibly on prior in-repo work.

---

## Pre-implementation: real first-visit trace confirms the bottleneck

Before writing any code, re-confirmed (rather than assumed from `050`'s
own already-recorded findings) which of two real candidate costs
dominates on an actual fresh visit: the coi-serviceworker double-reload,
or the DuckDB-WASM registration serialization. Full write-up in
`project-docs/PIPELINE.md`'s own "Boot-performance findings deferred by
042-boot-performance-fix" section (`1.`'s new "Real first-visit
confirmation" addendum) — summary: **DuckDB-WASM registration dominates,
consistently 58–66% of total boot time, 10–25× larger in absolute terms
than the reload's ~120ms–435ms cost**, confirmed via a genuinely fresh,
never-used persistent browser profile (not just a cache-disabled
Playwright context on an already-visited dev machine — see that doc's
own disclosed limitation about OS-level DNS/CDN-edge state this
environment couldn't fully reset). This confirms building the pool fix
first, ahead of any coi-serviceworker hardening, was the right call.

---

## What was built

**`services/duckdb.ts`** — two additions, both keeping direct
`AsyncDuckDB`/`AsyncDuckDBConnection` access for the SHARED singleton
encapsulated in this one file (its own stated role: "sole owner"):
- `createLoaderInstance()` — a fresh, independent `AsyncDuckDB` (its own
  `Worker`), using the identical bundle-selection logic `initDuckDB()`
  uses for the shared instance, but never touching `dbPromise`/
  `connectionPromise`.
- `registerBufferOnSharedInstance(viewName, buffer)` — hands a
  loader-produced buffer to the shared instance
  (`db.registerFileBuffer()`) and creates a view over it, reusing the
  existing `createViewOverParquet()` helper (same view-creation SQL,
  same `allViews` bookkeeping the single-file `registerFileURL()` path
  already uses).

**`services/duckdbLoaderPool.ts`** (new) — the pool itself:
`registerFilesViaPool(files)`, a fixed pool of loader instances (size 6,
`051`'s own swept sweet spot, clamped to
`navigator.hardwareConcurrency` as an untested-but-sensible defensive
cap) pulling files off a shared queue, each file getting its own
register→validate→copy→handoff sequence with one bounded retry (2
attempts total) on the SAME loader instance. Never throws — a failed
file is reported in the returned `failed` list, never surfaced as a
rejected promise, so one bad file can't abort the rest of the pool's
run.

**A real bug avoided by design, not found the hard way**: a retry
reuses a FRESH, attempt-suffixed loader-local name
(`${viewName}::attempt${n}`), not the same name — this exact codebase
already has a documented, confirmed instance of the alternative going
wrong (`031-all-panel-demo-content`'s own `zoneGeometry.ts` fallback:
reusing a view name after a failed `registerFileURL()` leaves it
"already registered," and the retry's own call throws `File already
registered`). Applying that lesson here up front, rather than
rediscovering it, avoided writing a real bug into new code.

**`services/scenarioDiscovery.ts`** — `registerSummaryFolder()` now
calls `registerFilesViaPool()` instead of
`Promise.all(files.map(registerFileURL))`, and returns
`{ failedStems: string[] }` instead of `void`. Throws only when EVERY
file in a scenario failed (nothing to be "partial" relative to) —
matching the OLD all-or-nothing behavior exactly for that one case; a
scenario with at least one successful file now stays `'ready'` with its
specific failures recorded, rather than the OLD behavior where a single
bad file failed the entire scenario (a real, confirmed gap in the
previous code, not a hypothetical one — see `051`'s own research.md §2
for the direct read of the old `Promise.all()`-with-no-per-file-catch
code that produced this gap). All three call sites
(`registerObserved`/`registerPublishedScenarios`/`registerDemoScenarios`)
updated identically: on partial failure, `appState.setFailedFiles(name,
failedStems)` alongside the existing `setStatus(name, 'ready')`.

**`state/appState.ts`** — new optional `Scenario.failedFiles?: string[]`
field (metric/file stems, e.g. `"mode_share_by_period"`, not the full
namespaced view name) and a `setFailedFiles()` setter mirroring
`setColorOverride()`'s exact shape. Undefined (never an empty array)
when nothing failed, matching every other optional field on this
interface. **Data layer only** — per `051`'s own explicit scoping, no
new UI surfaces this field; a real viewer-facing display ("2 of 35
files failed to load") is a separate, deferred product decision.

**`hooks/useScenarioList.ts`** — added `failedFiles` to its existing
change-detection comparison (the same class of gap this file's own
header comment already documents twice, for `label` and
`colorOverride`), via a cheap `join(',')` content comparison rather than
reference equality (which would either always mismatch, forcing a
re-render on every store notification, or never usefully mismatch
against a memoized snapshot).

---

## Verification

- `npx tsc --noEmit`: clean.
- `npm run test:unit`: 471/471 passing, unchanged count — expected;
  nothing in this feature is unit-testable in isolation (Worker/WASM-
  dependent, matching this codebase's own established convention of
  testing this class of behavior via real-browser Playwright specs, not
  jsdom).
- `tests/integration/boot.spec.ts`: **6/6 passing**, including the
  User Story 2 test that directly exercises "one failed registration
  does not block the rest" end-to-end against the real demo scenarios,
  through a real browser and real Workers — the most direct real-world
  confirmation the pool mechanism works correctly, not just compiles.
- `tests/integration/dashboardShell.spec.ts`: all passing (real panel
  rendering after registration, unaffected).
- `tests/integration/scenarioManager.spec.ts`: 16 failures — confirmed,
  via a direct `git stash` A/B comparison, to be **entirely pre-existing
  and unrelated**: `tests/fixtures/scenarios/` (the `good_scenario`/
  `broken_scenario` fixture tree these specific tests depend on) does
  not exist anywhere in this checkout, on the clean tree OR this
  feature's own changes — `git log` confirms `tests/fixtures/
  generate.py` and that whole fixture tree were deleted by
  `040-test-suite-migration`'s own real, intentional retirement of
  synthetic fixtures. This is the same already-documented class of gap
  CLAUDE.md records for `flowmapPanel.spec.ts`/`zonemapPanel.spec.ts`
  before their own later migration — `scenarioManager.spec.ts` is
  simply one more file in that same known, not-yet-migrated set, and
  migrating it is explicitly out of scope for this feature.
- `tests/integration/settingsModal.spec.ts`: 32 failures, 26 passed —
  same root cause, confirmed by reading the actual saved
  `error-context.md` for several failures spanning different areas of
  the file (a basic FR-005 row-content check, a drag-reorder test, an
  active/inactive Switch test, a `$scenario`-driven-panel test): every
  one expects `good_scenario`/`broken_scenario` or a fixture-only panel
  title (`"Scenario Split (Table)"`) that does not exist in this
  checkout — the real, rendered Scenarios tab correctly shows
  `observed`/`activitysim-baseline`/`activitysim-density-variant`/
  `activitysim-transit-variant` (real demo content) instead. Confirmed
  `tests/global-setup.js` has no fixture-copy step for
  `tests/fixtures/scenarios/` at all (nothing to have broken). Larger in
  raw count than `scenarioManager.spec.ts` only because this file is
  larger (58 tests total) — the SAME class of gap, not a new one this
  feature introduced. The 26 tests that DID pass (real-demo-content-
  based ones) confirm the file is in a genuine mixed-migration state,
  not wholesale broken.

No implementation detail deviated from `051`'s own design during this
pass — pool size 6, the retry/failure-isolation shape, and the
buffer-handoff mechanism all matched what was scoped, with no new
empirical surprises requiring a design change.
