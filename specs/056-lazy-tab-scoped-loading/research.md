# Phase 0 Research: Lazy, Tab-Scoped Data Loading

All five items from the feature's own "REQUIRED RESEARCH" list, resolved
against this app's real, current source — not assumed.

## 1. Granularity — traced directly against the real `dashboard-*.yaml` files

Counted distinct `metric:`/`dataset:` references per tab directly
(`public/demo-dashboard-config/*.yaml`):

| Tab | Distinct metrics/dataset referenced |
|---|---|
| 1 — Summary (landing) | 3 |
| 2 — Person/Household | 5 metrics + 1 dataset (`person_household_profile`, GraphicWalker) |
| 3 — Tour Models | 13 |
| 4 — Mode Choice | 4 |
| 5 — Trip Models | 4 |
| 6 — Network | 6 (one, `od_flows`, referenced by **two** panels on this same tab) |
| 7 — Explore | 0 metrics; 1 default dataset (`trip_mode_share`) but a picker that must offer all 35 |
| 8 — Test (fixture) | 7, including two deliberately nonexistent references |

Total real distinct metrics across the whole deployment: **35** (confirmed
against `public/demo-scenarios/activitysim-baseline/summary/*.parquet` —
36 files minus `index.json`). All 35 are referenced by at least one panel
somewhere across the 8 tabs (`person_household_profile`'s only reference is
via `dataset:`, not `metric:` — confirmed by re-checking after an initial
grep pass missed it).

**Decision**: load at **tab granularity**, deduplicated across that tab's own
panels, crossed with whichever scenarios are currently active. **Rationale**:
no tab approaches the full 35-metric catalog (max 13), so tab-level loading
is a real, large reduction from today's full-scenario eager load; and the
Network tab's own two panels both referencing `od_flows` is real, confirmed
proof that within-tab deduplication is a genuine requirement, not
theoretical — panel-level granularity (one load per panel, no
deduplication) would issue a real duplicate load in a case that already
exists in this deployment today. **Alternatives considered**: per-panel
granularity (rejected — loses the confirmed `od_flows` dedup case, and adds
per-panel loading-orchestration complexity for no real benefit given how
small tab-level batches already are); per-scenario-whole-catalog granularity
(rejected — this is just today's eager behavior, defeats the feature).

## 2. Interaction with 038's active-scenario union

`state/appState.ts` already has a working `subscribe()`/`notify()` pub/sub
(`hooks/useActiveScenarios.ts` wraps it with `useSyncExternalStore`) that
every data-bound panel already re-renders from when the active-scenario set
changes — confirmed by reading `useActiveScenarios.ts` directly. Today, a
panel's own effect re-runs on that change and immediately calls `query()`,
because eager boot already registered every scenario's every metric, so
there was never a gap between "scenario just became active" and "its data
is queryable."

Under lazy loading that gap becomes real: a scenario activating after a
viewer is already on a tab may not have that tab's needed metric(s)
registered yet.

**Decision**: every data-bound panel's existing fetch effect gains one
`await ensureRegistered(viewNames)` call (see §4/data-model.md) immediately
before its existing `query()`/`queryArrow()` call, inside the *same* effect
that already re-runs on `useActiveScenarios()` change — no new effect, no
new re-render trigger, just one additional awaited step ahead of the
existing query. Each panel type already has its own inline loading-state
render branch (CLAUDE.md's documented Panel pattern) which naturally covers
this: the panel is already "loading" for the duration of that effect, now
it's loading for `ensureRegistered()` **and** `query()` instead of `query()`
alone — same visible behavior, one step longer when the step is needed, a
no-op (see §4) when it isn't. **Rationale**: reuses the exact reactivity
mechanism and loading-state UI that already exists for every panel type,
rather than inventing a second, parallel "is my data ready" signal.
**Alternatives considered**: a new hook that panels must call to *block*
render until ready (rejected — would touch every panel's render logic, not
just its effect, for no behavioral difference); a global "tab is loading"
gate that hides all panels until every one of the tab's metrics is loaded
(rejected for the scenario-toggle case specifically — hiding already-
rendered, still-valid panels while only a subset waits on new data would be
a real, visible regression from today's per-panel reactivity; used instead,
narrowly, only for the very first activation of a not-yet-visited tab — see
data-model.md's `DashboardRenderer` behavior).

## 3. GraphicWalker's dataset picker — the hardest real case

Read `panels/graphicWalkerDatasets.ts` and `panels/GraphicWalkerPanel.tsx`
directly. `listSelectableDatasets()` derives its offered choices from
`services/duckdb.ts`'s `listViews()` — the set of views **already
registered**. Under eager boot this is trivially the full catalog (every
scenario's every metric registers at boot). Under lazy loading it would
shrink to only whatever tabs have actually been visited — a real,
confirmed regression against 028's own stated design intent ("every dataset
genuinely queryable against the active scenario(s)"), and exactly the
tension the feature description flagged.

**Decision**: introduce a **Dataset Catalog** — the list of real metric
filenames each scenario's `summary/index.json` already names, fetched once
during scenario discovery (this is the *exact same* `index.json` fetch
`scenarioDiscovery.ts`'s `fetchScenarioFileList()` already performs — it
already knows every real metric name before registering anything; today it
simply discards that list immediately after feeding it to the pool). Retain
it on each scenario's `appState` entry as `availableMetrics: string[]`.
`listSelectableDatasets()` is re-pointed from `listViews()` to this new
catalog (same intersection-across-scenarios logic, same exclusion of
non-metric view families — unaffected, since the catalog only ever contains
real per-scenario metric filenames to begin with, never a
`zonemap-geom__*`-style non-metric view). Selecting a catalog entry that
isn't registered yet calls the same `ensureRegistered()` used everywhere
else in this feature, before the dataset's query runs. **Rationale**: the
catalog is already being fetched today for a different purpose (feeding the
pool) — retaining it costs one small field on an already-existing object,
not a new network request or a new fetch pattern. **Alternatives
considered**: eagerly load every metric the instant a viewer opens the
Explore tab (rejected — defeats lazy loading for the one tab whose own
panel count is smallest but whose real data need, if taken literally, would
be the deployment's full catalog); have the picker fall back silently to
"only what's loaded so far" (rejected outright — this is the literal
regression FR-007 exists to prevent).

## 4. Whether `duckdbLoaderPool.ts` (052) still has real purpose

Read `duckdbLoaderPool.ts` and `services/duckdb.ts#createLoaderInstance()`
directly. Two real, confirmed facts ground this:

- 051's own empirical sweep (`specs/051-scope-option3-pool-design/
  research.md §1`) found pool sizes 6 and 8 **statistically tied** at the
  real ~105-file/3-scenario scale (2474ms vs 2471ms) — the pool's own
  marginal benefit was already flattening out well before 105 files, not
  scaling linearly with file count.
- 053/054 independently confirmed the *cost* side: each additional loader
  instance pays a real, non-cache-shareable WASM-instantiation compile cost
  (053's "up to 19 concurrent instances" finding; 054's fix reduced this to
  7 for the *old* eager-boot shape). This cost does not shrink with fewer
  files per instance — instantiating the engine costs the same whether that
  instance goes on to register 1 file or 20.

Under this feature, the largest realistic single lazy-load batch is no
longer "every scenario's every metric" (today's ~105-file worst case) —
it's bounded by one tab's own real fan-out (§1: max 13 metrics) times
however many scenarios are active at that moment (this deployment: up to
3). Worst case ≈ 13 × 3 = 39 files, for the single most demanding real tab;
typical case is far smaller (3–6 files × 1–3 scenarios).

**Decision — RESOLVED by real measurement, not left conditional.** A real
sweep was run (2026-09-14, same session), directly against a live dev
server, using `page.evaluate()` to call the actual, unmodified
`services/duckdb.ts#registerFileURL()` and
`services/duckdbLoaderPool.ts#registerFilesViaPool()` exports — no mocks,
no synthetic timing model. Two passes, both real:

**Pass 1 — warm HTTP cache** (the app's own eager boot, unmodified in this
pre-056 tree, had already fetched every real metric file before the sweep
ran; 3 trials per size, alternating single/pool order to cancel ordering
bias):

| N (files) | single-instance sequential (avg) | pool (avg) | winner |
|---|---|---|---|
| 3 | 7ms | 571ms | single, 99% faster |
| 6 | 13ms | 877ms | single, 99% faster |
| 13 | 27ms | 926ms | single, 97% faster |
| 39 | 89ms | 876ms | single, 90% faster |

**Pass 2 — genuinely cold cache**, run separately to close the real
methodological gap Pass 1 has (both paths benefited equally from an
already-warm cache, which doesn't bias the *comparison* but does understate
absolute cost): a fresh, empty-cache browser context **and** a
cache-busting query string per trial, at N=13 (the largest real single-tab
batch), 3 trials each:

| Path | Trials (ms) | avg |
|---|---|---|
| single-instance sequential | 585, 599, 595 | 593ms |
| pool | 1089, 1088, 955 | 1044ms |

Single instance still wins decisively (43% faster) even with zero cache
advantage — the pool's cost is dominated by WASM-instantiation compile time
(53/054's own already-confirmed, cache-independent cost), not network fetch
time, so cold-cache conditions narrow the gap (cold network fetch now also
costs the single-instance path something) but never close it.

**The pool is never faster at any real batch size this feature produces —
3 through 39 files, warm or cold cache.** This is not a close call requiring
a tuned threshold: the smallest tested pool cost (~870ms, dominated by
spinning up fresh `AsyncDuckDB` instances every call — confirmed by reading
`duckdbLoaderPool.ts` directly: it boots an entirely new pool on every
`registerFilesViaPool()` call, with no warm-instance reuse across calls)
exceeds the LARGEST tested single-instance cost (593ms cold, 89ms warm) at
every size measured. **Decision: retire `duckdbLoaderPool.ts` and
`services/duckdb.ts#createLoaderInstance()` entirely — no threshold, no
dispatcher, `ensureRegistered()` always uses the single shared instance.**
Retiring the pool is further justified independent of this sweep: this
feature's own redesign of `scenarioDiscovery.ts` (data-model.md entity 4)
removes the ~105-file eager-boot registration event the pool was
originally built for (052) — after this feature ships, no code path in the
app calls `registerFilesViaPool()` at all, sweep result or not.

This directly and fully resolves the Constitution Principle II tension
(see `plan.md`'s Constitution Check) — not conditionally, not pending a
future amendment: `createLoaderInstance()`'s deliberate departure from
"exactly one shared instance" is removed at its source, along with the
pool module that was its only real caller.

## 4a. Pre-condition check: does 028's dataset picker actually still work?

Verified directly (2026-09-14) before proceeding, since this plan's User
Story 3 / Dataset Catalog design assumes 028's picker is a working
capability whose behavior must be preserved — not assumed from its own
source comments alone.

**Real, confirmed finding: `tests/integration/graphicWalkerPanel.spec.ts`
is 29/29 failing**, entirely pre-existing and unrelated to this feature —
every test times out looking for a `role=tab name=Detail` tab and fixture
panel titles (`"Free-form Visual Analytics (Dataset Picker)"`, etc.) that
no longer exist anywhere in real content. `tests/fixtures/dashboard-config/`
was deleted by `040-test-suite-migration` (confirmed via `git log`/direct
`ls` — the directory genuinely does not exist); this spec file was never
migrated to the real `public/demo-dashboard-config/` content the way
`tests/global-setup.js`'s own header comment says the rest of the suite
was. This is a third, previously-unnamed instance of the exact gap
`CLAUDE.md`'s own Protomaps entry already documents for
`flowmapPanel.spec.ts`/`zonemapPanel.spec.ts` ("both still reference a
fixture-only … tab and panel titles … that no longer exist in the real
demo content at all, an apparent gap left by 040-test-suite-migration's
own incomplete scope"). **This is a real, separate, pre-existing bug,
confirmed here for the first time by name — not caused by 056, not caused
by this session's coi-serviceworker/boot-skeleton work, and not something
this plan is in scope to fix**, but it does mean 028's own automated
coverage is not actually running today, which is exactly why this couldn't
be taken on faith.

**Independent, real-browser verification against the live app's actual,
unmodified code** (a fresh dev server, real screenshots, delivered to the
user):

- The real, deployed Explore tab (`dashboard-7-explore.yaml`) renders
  correctly — confirmed no picker control appears, which is *correct*: that
  tab does not set `dataset_picker: true` in its real, current config
  (only `dashboard-8-test.yaml`'s one deliberately-broken fixture panel
  and the deleted test fixtures ever did).
- The real, shipped `dashboard-8-test.yaml` panel ("Explore Panel Broken
  (Dataset Picker, No Match)", `dataset: __nonexistent_dataset__`, no
  `scenario:` pin) renders a working picker trigger alongside the correct
  per-panel error state for its invalid default selection — confirmed live.
- A synthetic panel injected via `page.route()` (the same technique
  `dashboardShell.spec.ts` already established) against real,
  unmodified data — `dataset_picker: true`, `scenario:
  activitysim-baseline`, no dataset override — correctly lists all 35 real
  metrics in the dropdown, and selecting a different one
  (`accessibility_summary`) correctly loads and renders its real columns,
  no error.

**Conclusion: 028's dataset picker is not regressed — it works correctly
against real, live app code and data today.** The stale test file is a
real, separate, pre-existing gap worth its own follow-up, and this
feature's own `tasks.md` should account for it directly: since 056
modifies `graphicWalkerDatasets.ts` (contracts/graphic-walker-dataset-
catalog.md), landing that change with zero real Playwright coverage
watching it would be a genuine regression risk this plan should not
accept silently. A task to either restore minimal real coverage for the
picker (pointed at real content, not the deleted fixture tree) or at least
extend this session's own manual verification into a permanent spec
belongs in `tasks.md`, flagged for `/speckit-tasks`.

## 5. Compatibility with existing eager-registration assumptions

Grepped for any code path that reads scenario data (queries a
`{scenario}__{metric}` view) without going through a panel's own
`useEffect`-gated fetch:

- `services/duckdb.ts#registerFileURL()`/`registerScenario()` are already
  idempotent, safe-to-call-again primitives (`CREATE OR REPLACE VIEW`) —
  calling them lazily instead of eagerly changes *when* a view starts
  existing, not their own contract.
- `hooks/useActiveScenarios.ts`, `state/appState.ts`'s `getBaseline()`, and
  every scenario-level `status`/`active` field are **scenario-level**
  state, unaffected by this feature — this feature's new `Metric Load
  State` (data-model.md) is a distinct, *finer-grained* tracking concept
  sitting one level below "is this scenario ready at all," confirmed by
  reading `appState.ts` directly: nothing there assumes a ready scenario's
  *metrics* are already registered, only that the scenario's own top-level
  registration succeeded.
- `panels/panelQuery.ts#buildPanelQuery()` only ever builds a SQL
  *template* string (`"${scenario}__${metric}"` or a `$scenario.` union
  placeholder) — it never itself assumes the referenced view exists; that
  assumption lives entirely in whichever caller runs `query()` against the
  resulting SQL, which is exactly where `ensureRegistered()` inserts.
- `panels/graphicWalkerDatasets.ts` is the one real place that *does*
  assume "registered so far" already equals "available" (§3) — the only
  code this feature must change beyond adding `ensureRegistered()` calls.

**No other code path assumes universal eager registration.** This confirms
the feature is additive at the call-site level (one new awaited step per
panel's existing effect, one data-source swap in the dataset picker) rather
than requiring changes to the scenario-state model, the SQL-building layer,
or the query-execution layer itself.
