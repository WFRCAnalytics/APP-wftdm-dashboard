# Quickstart: Validating ObservablePlotPanel

**Feature**: `007-observable-plot-panel`

## Prerequisites

- `001`-`006` already in place — this feature adds a fifth panel type on top
  of `003`'s existing registry/`panelCard.tsx` and inherits `004`'s expand
  mechanism automatically.
- New dependency: `@observablehq/plot` (`^0.6.17`, research.md §5 — pulls in
  `d3` transitively, no peer dependencies, ships its own TypeScript types, no
  `@types/*` package needed). `npm install` required.
- Two shared, existing modules are modified, not just extended additively —
  verify both still typecheck and their existing unit tests still pass before
  building this panel type on top of them (research.md §1/§2):
  - `layout/types.ts`'s `DataBoundPanelConfigBase.filter` widens from
    `string?` to `string | Record<string,string> | undefined`.
  - `services/sqlExpander.ts`'s `expand()` gains a new optional 5th
    parameter (`inputState`) and a new `inputs` placeholder kind.
- Fixture data needs at least one `observable-plot` panel exercising:
  `mark: barY` bound to the existing `trip_mode_share` fixture (reusing
  `005`/`006`'s already-published columns — no new fixture table needed for
  this one), reactive to the existing global `purpose` filter; and a second
  panel exercising `mark: lineY` plus a panel-local `inputs:` control,
  mirroring `docs/GRAMMAR.md`'s own Trip Length Frequency Distribution
  example closely enough to need one small new fixture table
  (`trip_destination_dist`: `distance_bin`/`trips`/`purpose`/`mode`) — check
  `tests/fixtures/generate.py`/`dashboard-config/dashboard-1-summary.yaml`
  for what to add (tasks.md's concern, not decided here).

## Run the integration test

```bash
npm run test:integration -- observablePlotPanel
```

Boots the app for real (Playwright, real fixture data, real DuckDB-WASM
query) and asserts:

1. A `mark: barY` panel's rendered bars match a direct SQL query against the
   same fixture data (SC-001).
2. A `mark: lineY` panel renders real line-mark DOM elements — proves a
   second, structurally different mark type resolves correctly through
   `observablePlotEncoding.ts` (SC-001).
3. Changing the global filter an `observable-plot` panel's `filter:` map
   references re-queries and re-renders only the affected chart's data,
   without a full page reload (SC-002).
4. Expanding a panel via `004`'s dialog produces a correctly proportioned
   chart on both ends of the transition (not stretched/clipped/stale-sized),
   with **zero** additional query fired solely by that transition — verified
   directly (e.g. a query-count assertion), not inferred from visual
   inspection alone (SC-003, research.md §5's confirmed different resize
   model from `PlotlyPanel`).
5. A zero-row query renders `PanelEmptyState`; a rejected query (bad
   `metric`) renders `PanelErrorState` — neither an unhandled exception nor a
   blank chart area (SC-004).
6. A panel-local `select` input's `default` value is in effect before any
   interaction; changing it re-queries using `$inputs.<id>`'s new value
   (US2).
7. A panel-local `multiselect` input with multiple values selected includes
   rows matching any of them (US2).
8. Two `observable-plot` panels on the same tab (including one fixture pair
   deliberately sharing an input `id`) stay fully independent — changing one
   panel's input never changes the other panel's chart, input control state,
   or the global filter store (US2, research.md §3).
9. An input's non-default value survives an expand/collapse cycle through
   `004`'s dialog, with no query fired solely by that transition (US2).
10. A tab mixing `valuebox`/`plotly`/`table`/`markdown`/`observable-plot`
    panels renders all of them without error (SC-005).
11. A `select`/`multiselect` input's fetched option list is unaffected by
    that same input's own current value — options never narrow down to just
    the current selection (research.md §9).
12. A rebuild-count assertion around mount confirms exactly one
    `Plot.plot()` rebuild-and-swap occurs, not two — proving the
    render-and-swap effect's synchronous call and `ResizeObserver`'s
    spec-guaranteed initial callback don't each independently rebuild the
    chart (research.md §5b).

## Deliberately not automated

- The two mismatched-`default` outcomes (research.md §9: a `select`/
  `multiselect` input's query legitimately empties out; a `range` input's
  value is clamped by the browser) are exercised manually only (manual item
  10 below) — both are direct consequences of already-tested paths
  (`PanelEmptyState`'s existing zero-row test, and standard `<input
  type="range">` browser behavior) rather than new logic this feature owns,
  so a dedicated automated case would mostly be re-testing the browser/an
  already-covered empty-state path under a different label.

## Manually verify

```bash
npm run dev:fixtures && npm run dev
```

1. **Chart renders correctly** — confirm bar/line marks appear with values
   matching the fixture data, styled consistently with the rest of the
   dashboard's card chrome (not marked.js/Plotly-specific styling bleeding
   in).
2. **Global filter reactivity** — change the Trip Purpose sidebar value (or
   whatever fixture filter is wired up) and confirm the `observable-plot`
   panel's chart updates.
3. **Panel-local inputs render and work** — confirm the panel-local
   `select`/`multiselect` control(s) appear inside the panel card (not the
   sidebar), and that changing one updates only that panel's own chart.
4. **Resize correctness** — expand the panel into `004`'s dialog; confirm
   the chart visibly redraws at the larger size with correct proportions
   (not the small card-sized chart stretched or clipped). Resize the browser
   window itself with the panel inline (not expanded); confirm the chart
   redraws to fit, not stuck at its original size.
5. **Input state survives expand/collapse** — set a panel-local input to a
   non-default value, expand the panel, confirm the same value (and
   filtered chart) shows in the dialog, then collapse and confirm the value
   is still set inline — not reset to the input's `default`.
6. **Cross-panel isolation** — with two `observable-plot` panels on the same
   tab, change one panel's input; confirm the other panel's chart and any
   global-filter-driven panel (e.g. a `plotly` panel bound to the same
   global filter) are visually unaffected.
7. **Empty/error states show, not a blank card** — point a panel at a
   nonexistent metric (error) and a filter combination that legitimately
   returns zero rows (empty); confirm each shows the same empty/error visual
   language other panel types use.
8. **Expand inherits automatically** — confirm the panel's card shows the
   same expand icon every other panel type has.
9. **Visual consistency (SC-005)** — confirm the panel's card uses the same
   border/shadow/spacing tokens as every other panel card on the same tab.
10. **Mismatched input default (research.md §9)** — configure one fixture
    `select`/`multiselect` input's `default` to a value its bound column
    doesn't actually contain; confirm the panel shows `PanelEmptyState`, not
    a crash, and that the control itself still visibly displays that
    mismatched value rather than silently showing a different option as
    selected. Separately, configure a `range` input's `default` outside its
    column's actual min/max; confirm the slider simply starts clamped to
    the nearest bound (no empty state, no error — a different, more
    graceful outcome, not a bug if it differs from the select/multiselect
    case).

## Expected outcome

All of spec.md's SC-001 through SC-005 hold: rendered marks match direct
query results for at least two mark types (SC-001); filter/input changes
update only the affected chart with no unnecessary re-renders elsewhere
(SC-002); the `004` expand/collapse transition renders correctly with zero
data re-fetch triggered solely by that transition (SC-003); empty/error
states are handled, not crashes (SC-004); and a mixed-panel-type tab loads
cleanly (SC-005). The `filter:` common-key widening, the `$inputs.<id>`
placeholder extension to `sqlExpander.ts`, the confirmed-different Observable
Plot resize model (including the spec-verified `ResizeObserver` double-fire
guard), panel-local input state's isolation guarantee, and the unfiltered
input-options-query design are all resolved in research.md (§1-§3, §5, §5b,
§9) and directly exercised by the tests
above, not left for this feature's own code to improvise.
