# Quickstart: Validating the Dashboard Shell, Navigation, and First Two Panel Types

**Feature**: `003-dashboard-shell-navigation`

Unlike `002-design-tokens`' throwaway demo page, this feature *is* the real
dashboard entry point (`index.html`/`main.ts`) — validation means actually
booting the app against fixture data and interacting with it, plus the new
Playwright spec that automates the same flow.

## Prerequisites

- `001-data-state-layer` and `002-design-tokens` already in place.
- `npm install` run after this feature adds `plotly.js-dist-min` to
  `package.json`.
- `tests/fixtures/dashboard-shell-config.yaml` present (research.md §1) and
  `tests/fixtures/generate.py`'s existing Parquet fixtures generated
  (`uv run python tests/fixtures/generate.py`, or automatically via
  `npm run pretest:integration`).
- No real `public/scenarios/`/`public/dashboard-config/` data exists in
  this repo yet (spec.md's Assumptions) — manual verification below uses
  the test fixtures directly, not a "real" deployed scenario.

## Run the unit tests

```bash
npm run test:unit -- panelQuery dashboardConfigTypes
```

Verifies `buildPanelQuery`'s SQL-template construction and
`parseDashboardConfig`'s typed parsing — both pure functions, no browser
(research.md §5).

## Run the integration test

```bash
npm run test:integration -- dashboardShell
```

Boots the app for real (Playwright, real DuckDB-WASM, fixture Parquet),
loads `dashboard-shell-config.yaml`'s tabs, and asserts:

1. The rendered tab set matches the fixture's tab count/names (SC-001).
2. Switching tabs changes visible content without a full page reload
   (FR-002).
3. The value-box panel's displayed number matches the fixture's
   `summary_kpis` data (SC-002).
4. Changing the `purpose` filter re-queries and redraws the Plotly panel
   without a page reload (SC-003).
5. A deliberately-broken panel config (used only in this test, not the
   main fixture) shows a scoped error without affecting sibling panels
   (SC-006).

## Manually verify

```bash
npm run dev
# open the app's normal entry point (index.html) — this feature IS main.ts's
# real UI now, not a separate demo route
```

1. **Tab set matches config** — confirm the visible tabs exactly match
   `dashboard-shell-config.yaml`'s `header.tab` entries, in order.
2. **Navigation works** — click between tabs; content changes with no
   full-page reload (check the browser's network panel — no navigation
   entry, only XHR/fetch activity if any).
3. **Value-box panel renders real data** — confirm the displayed number
   matches the corresponding fixture Parquet column.
4. **Plotly panel renders and is filter-reactive** — confirm the chart
   renders real data; change the `purpose` filter (via `state/
   filterState.ts`'s `set()`, e.g. from the browser console during manual
   verification, since no filter-control UI is part of this feature) and
   confirm the chart redraws in place (no flash/rebuild).
5. **Visual quality (SC-004)** — inspect the rendered DOM: every panel
   card carries `shadow-md`/`border`; spacing uses Tailwind's token-driven
   scale, not arbitrary pixel values; navigation is `002`'s shadcn `Tabs`,
   not raw HTML; text elements carry the correct `font-heading`/
   `font-body` class per `002`'s established mapping.
6. **Panel error isolation (SC-006)** — temporarily point one panel's
   `metric` at a nonexistent view, reload, confirm only that panel shows
   an error state and every other panel still renders correctly, then
   revert.
7. **Unmount safety (FR-011)** — switch away from a tab with a slow query
   in flight (throttle network in devtools if needed) before it resolves;
   confirm no console error about setting state on an unmounted component.

## Expected outcome

All of spec.md's SC-001 through SC-006 hold: the tab set is genuinely
config-driven; both panel types render real, correct data; the chart is
filter-reactive without a reload; the visual properties SC-004 lists are
all present and checkable; a panel's failure never takes down its
siblings.
