# Quickstart: Validating Hierarchical Chart Panels (Zoomable Treemap & Sunburst)

Validation scenarios proving this feature works end-to-end against real
data — not implementation code. See `contracts/` for the exact grammar/
component shapes and `data-model.md` for the underlying entities.

## Prerequisites

- This feature's implementation tasks complete: `d3-hierarchy` installed
  (research.md §7), `layout/types.ts` gains `TreemapPanelConfig`/
  `SunburstPanelConfig` (data-model.md), `panels/registry.tsx` gains the
  two new lazy entries, and `dashboard-8-test.yaml` gains the two new
  real demo panels (both against `purpose_mode_flow`, per
  `treemap-panel.md`/`sunburst-panel.md`'s own example config).
- Local dev environment already set up per `CLAUDE.md` (`npm install`,
  demo/fixture Parquet content present via `npm run dev:fixtures` or the
  real `public/demo-scenarios/` root).

## Setup

```bash
npm install                 # picks up the new d3-hierarchy dependency
npm run dev                  # or `npm run dev:fixtures && npm run dev`
```

Open the app, navigate to the **Test** tab (the permanent
`dashboard-8-test.yaml` venue this project's own `040-test-suite-
migration` already established for exercising a panel type's own
mechanics against real, non-fabricated data).

## Scenario 1 — Treemap renders and is zoomable (User Story 1)

1. Locate the new "Trip Purpose to Mode Breakdown" treemap panel.
2. **Expect**: a rectangle subdivided into ~10 regions (one per real
   `primary_purpose`), each sized in proportion to its real total `trips`
   (cross-check: the largest region should correspond to `work`, the
   real purpose with the highest total trips — confirm via
   `duckdb -c "SELECT primary_purpose, SUM(trips) FROM
   read_parquet('public/demo-scenarios/activitysim-baseline/summary/
   purpose_mode_flow.parquet') GROUP BY 1 ORDER BY 2 DESC"`).
3. Click the `work` region. **Expect**: the view zooms to fill the panel
   with `work`'s own mode breakdown (up to 5 regions: SOV/HOV/Transit/
   Non-Motorized/Ride Hail), each independently colored and sized.
4. Click the zoom-out affordance (the title bar at top). **Expect**:
   returns to the full, root-level view from step 2.
5. Hover any region. **Expect**: its real underlying value is shown
   (FR-013) — cross-check against the same live query technique as step
   2, narrowed to that region's own path.

## Scenario 2 — Sunburst renders and is zoomable (User Story 2)

1. Locate the new "Trip Purpose to Mode Breakdown (Sunburst)" panel.
2. **Expect**: an inner ring of ~10 arcs (one per real `primary_purpose`,
   angular width proportional to its real total), an outer ring showing
   each purpose's own real mode breakdown.
3. Click a non-leaf arc. **Expect**: it becomes the new center, its own
   children arranged around it — same click-to-zoom outcome as the
   treemap, radial instead of rectangular.
4. Click the center circle. **Expect**: returns to the full root view.

## Scenario 3 — Visual/theme consistency (User Story 3)

1. With both new panels visible on the same tab as an existing
   Observable Plot panel, toggle the app's theme (Settings → Appearance).
2. **Expect** (verified via a real `getComputedStyle()` check, matching
   this project's own established dual-theme verification technique —
   see `SankeyPanel.tsx`'s/`ObservablePlotPanel.tsx`'s own existing
   integration tests for the exact pattern to mirror): every fill color
   on both new panels resolves to one of the app's real, current
   `--chart-1..5` values in BOTH themes; no hardcoded/unthemed color
   anywhere.

## Scenario 4 — Shared states and non-regression

1. Configure a broken variant (e.g. `metric: __no_such_metric__`) of each
   new panel type on `dashboard-8-test.yaml`. **Expect**: the shared
   `PanelErrorState` renders, and sibling panels on the same tab are
   unaffected (FR-008).
2. Configure a zero-row variant (a `filter:` matching no real rows).
   **Expect**: the shared `PanelEmptyState` renders.
3. Run the full existing Playwright suite. **Expect**: zero regressions
   in any pre-existing panel type's own test coverage (SC-004) — compare
   against the current baseline the same way every prior panel-type
   feature in this project's history already has (an isolated run of the
   new specs, then a full-suite run, then a `git stash` A/B if any
   unrelated failure count looks different from the pre-existing,
   already-documented baseline).

## Scenario 5 — No re-fetch on zoom (FR-014)

1. Open the browser devtools Network tab (or use this app's own
   `window.__wftdm` debug hook to count queries, matching
   `services/duckdb.ts`'s existing `__debugQueryLog` instrumentation).
2. Zoom in and out of either new panel several times.
3. **Expect**: zero new DuckDB queries fired by the zoom interaction
   itself — only the panel's own initial data fetch.
