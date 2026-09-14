# Quickstart: validating lazy, tab-scoped data loading

## Prerequisites

- `npm run dev:fixtures` (populates `public/{scenarios,dashboard-config,
  observed}` from `tests/fixtures/`) or use the real, git-tracked
  `public/demo-scenarios/`/`public/demo-dashboard-config/` content directly
  — either works, since this feature changes *when* data loads, not which
  content exists.
- `npm run dev`

## 1. Confirm the landing tab no longer waits on the full catalog

Open the app with the browser's network panel open, on a real multi-
scenario deployment (the demo content — 3 scenarios × 35 metrics).

**Expected**: only the Summary tab's own 3 metrics' worth of Parquet
requests fire before the landing tab renders — not all ~35 × 3 scenarios.
Confirms spec.md SC-001/US1.

## 2. Confirm tab-switch loading + reuse

Click through to the Tour Models tab (13 distinct metrics — the largest
real tab) for the first time.

**Expected**: a real loading indicator appears on that tab's panels, then
correct data renders once each panel's own `ensureRegistered()` +
`query()` resolves. Switch away and back to the same tab.

**Expected**: no repeated network requests for that tab's metrics on the
second visit — instant render from already-loaded state. Confirms US1
acceptance scenarios 3–4.

## 3. Confirm scenario-toggle-after-arrival

On any tab with more than one real scenario available, deactivate all but
one scenario via the Settings modal's Scenarios tab, navigate to a
metric-bound tab, then activate a second scenario while remaining on that
tab.

**Expected**: every affected panel shows a loading indicator, then updates
to include the newly active scenario's series/rows — never a result that
looks complete but silently omits the new scenario. Confirms US2.

## 4. Confirm the Explore tab's picker stays complete

Note: the real Explore tab (`dashboard-7-explore.yaml`) does not itself
set `dataset_picker: true` today — to exercise the picker at all, use a
config with it enabled (`dashboard-8-test.yaml`'s own broken-picker panel,
or inject one via `page.route()` as this plan's own research.md §4a did).
`tests/integration/graphicWalkerPanel.spec.ts` is currently 29/29 failing
for reasons unrelated to the picker itself (research.md §4a) — do not rely
on it as a working regression check until `tasks.md`'s own coverage-repair
task lands.

Load the app fresh, navigate **directly** to a picker-enabled tab first
(before visiting any other tab), open its dataset picker.

**Expected**: the full real catalog (35 entries in the demo content) is
listed, identical to what it would show if every other tab had already
been visited first. Select one that has not been loaded elsewhere yet.

**Expected**: a loading indicator, then correct rendering — no error, no
missing data. Confirms US3, and the specific hard case research.md §3
identifies.

## 5. Confirm no query-result regression

Run the existing Playwright suite unmodified against this feature's
branch:

```
npx playwright test
```

**Expected**: every existing assertion about panel *content* (values,
row counts, chart series) still passes — this feature changes loading
timing only (spec.md FR-009). Any pre-existing, already-documented
unrelated flake (the dark-mode Plotly re-query-count off-by-one; the
deck.gl hover-tooltip real-hardware-timing flake — both recorded in
`CLAUDE.md`) is expected and not this feature's concern; a *new* failure
category is not.

## 6. The loader-dispatch sweep — already run, DONE, not a pending task

Already completed during planning (research.md §4), not deferred to
implementation: a real sweep (fresh dev server, `page.evaluate()` calls
into the actual `registerFileURL()`/`registerFilesViaPool()` exports, both
warm- and cold-cache conditions, real batch sizes 3/6/13/39) confirmed the
single shared instance beats the pool at every size tested, by 43–99%.
`duckdbLoaderPool.ts` and `services/duckdb.ts#createLoaderInstance()` are
retired as part of this feature's own implementation (`tasks.md`) — no
dispatch threshold exists, and no further measurement is needed before
that removal proceeds. This section is kept only as a record of the
methodology, for anyone re-verifying after a future architecture change.
