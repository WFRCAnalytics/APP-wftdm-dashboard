# Phase 1 Data Model: Lazy, Tab-Scoped Data Loading

## Entities

### 1. Tab Data Requirement

The distinct, deduplicated set of `{scenarioName, metric}` pairs a given
tab's real panels reference, for whichever scenarios are currently active.

**Derivation** (pure function, no I/O — same module category as
`layout/dashboardLayout.ts`'s existing `isMetricStripRow()`/
`findFullPagePanel()`): walk `tab.layout`'s panels. For each data-bound
panel (`DataBoundPanelConfigBase` — everything except `markdown` and plain
`graphic-walker`):

- `config.scenario` set → one pair: `{config.scenario, config.metric}`.
- `config.scenarios` set → one pair per listed name: `{name, config.metric}`
  for each `name` in `config.scenarios`.
- neither set → one pair per currently-*active* scenario name:
  `{activeName, config.metric}` for each `activeName` in
  `useActiveScenarios()`'s current result.
- `comparison` is a `ComparisonDiff` (`{type: 'diff', a, b, expr}`) → two
  pairs, `{resolvedA, config.metric}` and `{resolvedB, config.metric}`,
  where `resolvedA`/`resolvedB` reuse `panelQuery.ts`'s existing
  `resolveComparisonScenarioName()` (handles the `'$baseline'` sentinel) —
  **unchanged**, only *called* from this new derivation, never modified
  (spec.md's explicit "no change to the `$baseline`/comparison-diff
  mechanism").
- `type: 'valuebox'` with `sparkline` set → one additional pair for
  `sparkline.metric` (a separate, already-grouped metric — see
  `ValueBoxSparklineConfig`), resolved against the same scenario source as
  the panel's own primary metric.
- `type: 'graphic-walker'` → one pair for `config.dataset` against
  `config.scenario` if pinned, else every active scenario name — same
  shape as a plain metric reference, since `dataset:` and `metric:` name
  the same real `{scenario}__{name}` view convention.
- `type: 'graphic-walker'` with `dataset_picker: true` → **no additional
  pairs derived here** — the picker's own available choices come from the
  Dataset Catalog (entity 3 below), not the Tab Data Requirement; only the
  *currently selected* dataset (initially `config.dataset`, later whatever
  the viewer picks) ever becomes a real pair, resolved the same way as the
  plain case above at the moment of selection.

Pairs are deduplicated by `{scenarioName}__{metric}` (the same string
`registerFileURL()`/`buildPanelQuery()` already use as a view name) before
being handed to the loader — this is where the confirmed Network-tab
`od_flows` double-reference collapses to one real load.

**Recomputed** whenever the active tab changes, or the active-scenario set
changes while a tab is active (both already-observable via existing
`useActiveScenarios()`/the tab-selection state `shell.tsx` already holds —
no new subscription source needed).

### 2. Metric Load State

Per `{scenarioName}__{metric}` view name, one of:

| State | Meaning |
|---|---|
| `not-requested` | Never referenced by any panel visited this session |
| `loading` | A registration attempt is in flight |
| `loaded` | View exists and is queryable |
| `failed` | Registration was attempted and failed |

Tracked in a new, small, module-level map inside the loader module
(entity 4) — **not** on `state/appState.ts`'s per-scenario `Scenario`
object, because this state is keyed by `{scenario, metric}` pairs, a finer
grain than anything `appState.ts` currently models, and because nothing
outside the loader module needs to enumerate it directly (panels consult it
only indirectly, by awaiting `ensureRegistered()`, never by reading a raw
state value). A **failed** entry is retried on the next `ensureRegistered()`
call that names it (mirrors `registerSummaryFolder()`'s own existing
one-retry-on-the-same-instance convention from 051 — not indefinitely, but
not permanently given up on either, since a transient network blip
shouldn't permanently blacklist a metric for the rest of the session).

### 3. Dataset Catalog

Per scenario, the real list of metric filenames its `summary/index.json`
names — known independent of whether any of them have been loaded.

**Source**: `scenarioDiscovery.ts`'s `fetchScenarioFileList()` already
fetches this (`{folderUrl}/index.json`) during discovery, for every
registration path (`registerObserved`/`registerPublishedScenarios`/
`registerDemoScenarios`). Today the resulting filename list is consumed
immediately by `registerFilesViaPool()` and then discarded. This feature
retains it.

**New field on `Scenario`** (`state/appState.ts`):

```ts
availableMetrics: string[] // bare stems, e.g. "summary_kpis" — same
                            // convention stemFromViewName() already uses
```

Populated during Phase 1 of each registration function (the existing
sequential, `order`-preserving pass — see `scenarioDiscovery.ts`'s own
already-documented ordering-dependency comment, unaffected by this
feature), immediately after the existing manifest fetch, from the same
`fetchScenarioFileList()` call Phase 2 already makes — **moved earlier**,
not duplicated (today Phase 2 fetches it per scenario already; this
feature only changes *when* that result also gets written onto
`appState`, and *whether* Phase 2 still uses it to eagerly register
every file, per entity 4 below).

`panels/graphicWalkerDatasets.ts#listSelectableDatasets()` is re-pointed to
read `availableMetrics` off each active scenario's `appState` entry
instead of `services/duckdb.ts#listViews()` — same intersection-across-
scenarios logic (unchanged), different, cheaper, always-complete source.

### 4. Loader dispatch (`ensureRegistered`)

New exported function, `ensureRegistered(pairs: {scenario: string; metric:
string}[]): Promise<void>`, in a new module (`services/tabDataLoader.ts`).
For each pair not already `loaded` or currently `loading` (entity 2's map):

1. Mark `loading`.
2. Resolve the real file URL from the owning scenario's already-known
   `path` (`Scenario.path`, existing field) + `{metric}.parquet`.
3. Register it via `services/duckdb.ts#registerFileURL()` directly against
   the single shared instance — **always**, no dispatch, no pool. A real
   sweep (research.md §4) confirmed this is faster than
   `duckdbLoaderPool.ts`'s pool at every real batch size this feature
   produces (3–39 files, warm or cold cache); the pool and its only
   caller, `services/duckdb.ts#createLoaderInstance()`, are removed
   entirely by this feature, not conditionally kept.
4. Mark `loaded` or `failed` accordingly; a `failed` entry's promise
   rejects, letting the calling panel's own existing error-state branch
   catch it (no new error UI invented — spec.md FR-011).

Redundant/concurrent calls naming the same pair share the same in-flight
promise (a `Map<string, Promise<void>>`, the same "assign the pending
promise before its first `await`" idempotency shape `services/
duckdb.ts#initDuckDB()` already uses, for the identical race reason) — this
is what makes it safe for both `DashboardRenderer` (a tab-wide batch call
on activation) and each individual panel (its own narrower call, in its
existing effect) to call `ensureRegistered()` for overlapping pairs without
double-registering anything.

**`scenarioDiscovery.ts`'s own Phase 2 changes**: no longer calls
`registerFilesViaPool(allFiles)` for a scenario's *entire* file list at
boot. Instead, Phase 1 (already sequential, unaffected) also populates
`availableMetrics`; Phase 2 no longer registers any files at all during
discovery — it becomes a Phase 1-only function once this feature lands
(`setStatus(name, 'ready')`/`setActive(name, true)` still fire once the
scenario's own catalog fetch succeeds, matching today's "a scenario
participates once its data is genuinely present" rule from 038, just
redefined as "its catalog is known," not "every one of its files is
already registered" — a scenario is still not marked `ready` until its
`index.json` is confirmed fetchable, so a genuinely broken/missing summary
folder still fails exactly as it does today). The very first tab that
actually renders (the landing tab, on boot) still triggers a real
`ensureRegistered()` call immediately, the same way any other tab
activation does — so first paint is not literally zero-data, it is
scoped to the landing tab's own real fan-out (3 metrics), not the full
catalog, matching the app's own already-documented Navigation model intent
(CLAUDE.md: "Summary tab renders on scenario load ... other tabs load
progressively").

## State Transitions

```
not-requested --ensureRegistered()--> loading --success--> loaded
                                            \--failure--> failed
failed --ensureRegistered() (retry)--> loading --...
```

No transition ever moves a pair backward from `loaded` — this feature never
unloads/unregisters data once fetched (spec.md's Assumptions: "data already
loaded MAY remain available... no requirement to unload"); a deactivated
scenario's data simply stops being *referenced* by any panel's Tab Data
Requirement, which is enough to keep it out of query results (nothing new
needed here — `$scenario.` union expansion already excludes an inactive
scenario today, unchanged).
