# Quickstart: Six-Tab ActivitySim Demo Content

See `contracts/summarize-metrics.md`, `contracts/dashboard-tab-structure.md`,
and `contracts/calibration-summaries-corrections.md` for the full
behavioral contracts each scenario below checks against; not duplicated
here.

## Prerequisites

The three real ActivitySim raw output directories already exist in this
session (`research.md` §1) — no ActivitySim install/run is needed unless
that raw output is genuinely unavailable when implementation begins, in
which case fall back to the exact same three-scenario process
`026-activitysim-demo-content`/`031-all-panel-demo-content` already
established and this feature's own `research.md` §1 re-confirms.

```powershell
# Only if the raw output from research.md §1 is no longer available:
#   1. Re-run prototype_mtc unmodified -> baseline
#   2. Re-apply the TAZ 1 employment +40% edit -> density-variant
#   3. Re-apply the AM/PM WLK_LOC_WLK edit -> transit-variant
# (exact edits: spec.md FR-005; verification: research.md §1)

uv run wftdm-dashboard summarize --input <raw-baseline-dir> --config summarize.yaml --output public/demo-scenarios/activitysim-baseline --scenario-name activitysim-baseline --display-name "Baseline"
uv run wftdm-dashboard summarize --input <raw-density-variant-dir> --config summarize.yaml --output public/demo-scenarios/activitysim-density-variant --scenario-name activitysim-density-variant --display-name "Density Variant"
uv run wftdm-dashboard summarize --input <raw-transit-variant-dir> --config summarize.yaml --output public/demo-scenarios/activitysim-transit-variant --scenario-name activitysim-transit-variant --display-name "Transit Variant"

npm run dev
```

## Scenario 1 — Every new metric's real-data invariant holds (data-model.md §3)

```powershell
uv run pytest python/tests/test_pipeline.py -k "summary" -v
```

**Done when**: every new metric has at least one passing test asserting
its grouped counts sum to its filtered population's real row count (no
silent row loss), and every centroid-distance-based metric has a test
asserting no `NULL` distance value exists (the join never silently drops
a zone outside 1-25, since `research.md` §3 already confirms none exist
in this model's real data — a real test that would fail loudly if that
ever became false).

## Scenario 2 — The full computability audit is honestly reflected (SC-003, SC-005)

```powershell
# Manual spot-check: pick 10 random submodel headings from
# docs/CALIBRATION-SUMMARIES.md and, for each, open the live dashboard
# tab/section it belongs to.
npm run dev
```

**Done when**: each of the 6 real gaps (`data-model.md` §1) shows its own
`markdown` gap-note panel with the exact real reason, not an empty panel
and not a missing section; each of the 34 computable summaries shows a
real, populated panel.

## Scenario 3 — All ten panel types render real data across the six tabs (SC-004)

```powershell
npm run test:integration -- demoContentAllPanels
```

**Done when**: a Playwright pass over the six tabs confirms at least one
live, non-error, non-empty instance of every registered panel type
(`research.md` §7's table) — extending the existing
`tests/integration/demoContentAllPanels.spec.ts` pattern
`031-all-panel-demo-content` already established, updated for the new
tab filenames.

## Scenario 4 — The two previously-pending metrics are now real and published (FR-011)

```powershell
uv run duckdb -c "SELECT COUNT(*) FROM read_parquet('public/demo-scenarios/activitysim-baseline/summary/purpose_mode_flow.parquet')"
uv run duckdb -c "SELECT COUNT(*) FROM read_parquet('public/demo-scenarios/activitysim-baseline/summary/od_flows.parquet')"
```

**Done when**: both return a non-zero row count for all three scenarios,
and `dashboard-4-mode-choice.yaml`'s `sankey` panel / `dashboard-6-
network.yaml`'s `flowmap` panel both render real data from them in a live
browser load.

## Scenario 5 — Old tabs are gone, new tabs are discovered, Explore is untouched (SC-001, US1)

```powershell
npm run dev
# open the app, inspect the sidebar
```

**Done when**: exactly six primary tabs appear (Summary, Person/Household
Models, Tour Models, Mode Choice, Trip Models, Network) in that order,
followed by Explore; "Overview"/"Destination Choice"/"Transit Service" no
longer exist anywhere; `dashboard-5-explore.yaml`'s content is
byte-identical to before this feature (`git diff` shows no changes to
that file).

## Scenario 6 — `docs/CALIBRATION-SUMMARIES.md` matches the live dashboard (SC-005)

Manual review against `contracts/calibration-summaries-corrections.md` —
confirm all three corrections were applied and no other text in the
document was altered.
