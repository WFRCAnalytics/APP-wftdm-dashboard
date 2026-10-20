# P0 baseline: Playwright integration results

Recorded 2026-10-20 on branch `063-ui-redesign` (commit 4aa4127), before any redesign code.
Environment: Windows 11, Node v26.8.1, Playwright 1.62.1, Chromium via Playwright.

## Summary

| | Count |
|---|---|
| Tests in the suite | 447 |
| Passed in the full pass (all specs except the 059 file) | 379 of 443 |
| Failed in the full pass | 64 |
| Of those 64, passed on an immediate retry (flaky under full-suite load) | 14 |
| **Stable failures (failed in both runs)** | **50** |
| 059 server-side pagination spec, run on its own | 4 of 4 passed |
| **Overall at baseline** | **397 passed (14 of them failed once under load and passed on retry), 50 stable failures** |

Treat the 50 stable failures as the baseline: after a redesign phase, any failure **not** on
`baseline-stable-failures.txt` is a regression. The 14 flaky tests may fail at random under load; rerun
them on their own (`npx playwright test <file> -g "<title>"`) before calling them regressions.

## Stable failures by spec file

| Spec file | Stable failures |
|---|---|
| `settingsModal.spec.ts` | 31 |
| `scenarioAutoActivation.spec.ts` | 3 |
| `zonemapPanel.spec.ts` | 3 |
| `hierarchicalChartTheming.spec.ts` | 2 |
| `sankeyPanel.spec.ts` | 2 |
| `brokenPanelStates.spec.ts` | 1 |
| `flowmapPanel.spec.ts` | 1 |
| `graphicWalkerPanel.spec.ts` | 1 |
| `lazyTabLoading.spec.ts` | 1 |
| `observablePlotPanel.spec.ts` | 1 |
| `rechartsPanel.spec.ts` | 1 |
| `sunburstPanel.spec.ts` | 1 |
| `tablePanel.spec.ts` | 1 |
| `treemapPanel.spec.ts` | 1 |

### Every stable failure
- `brokenPanelStates.spec.ts:52` 040 US1 — dashboard-8-test.yaml reproduces every error/empty state › a panel whose metric names nothing shows the shared error state (one per panel type)
- `flowmapPanel.spec.ts:679` 027-map-auto-fit-and-reset — User Story 4: reset-to-view control › for an author-configured panel, returns exactly to the configured center/zoom after a manual pan
- `graphicWalkerPanel.spec.ts:393` Polish & cross-cutting › an unresolvable dataset shows PanelErrorState
- `hierarchicalChartTheming.spec.ts:46` User Story 3 - A viewer cannot tell these charts use a different rendering technology › light mode: every fill on both new panel types resolves to a real --chart-1..5 value
- `hierarchicalChartTheming.spec.ts:75` User Story 3 - A viewer cannot tell these charts use a different rendering technology › dark mode: every fill remains resolved to the current (dark) --chart-1..5 values, and stays legible
- `lazyTabLoading.spec.ts:25` User Story 1 - Fast landing on the tab a viewer actually opens › the landing tab registers only its own real referenced metrics, not the full deployment catalog
- `observablePlotPanel.spec.ts:436` User Story 2 - Author adds panel-local reactive input controls › a select/multiselect input's fetched option list is unaffected by its own current value
- `rechartsPanel.spec.ts:121` User Story 1 - Author renders a bar, line, or area chart with the new default engine › chart_type: bar renders one bar per distinct series value, each a genuinely distinct real --chart-N color
- `sankeyPanel.spec.ts:228` User Story 1 - Author renders a two-column flow metric as a Sankey diagram › a rejected/unresolvable config renders PanelErrorState
- `sankeyPanel.spec.ts:253` User Story 2 - Sankey panel responds to real, live reactive changes › a literal filter matching zero rows shows PanelEmptyState
- `scenarioAutoActivation.spec.ts:128` 038 auto-activation (discovery-activation.md DA-1..DA-8) › DA-3: an unpinned $scenario panel spans exactly the ready scenarios, with no failed-scenario error
- `scenarioAutoActivation.spec.ts:177` 038 auto-activation (discovery-activation.md DA-1..DA-8) › DA-8: toggling every scenario off leaves unpinned panels in an empty/error state, no crash
- `scenarioAutoActivation.spec.ts:222` 038 auto-activation (discovery-activation.md DA-1..DA-8) › DA-2: a failed observed registration is not activated and poisons nothing
- `settingsModal.spec.ts:165` User Story 1 - One place to manage dashboard-wide settings › Scenarios tab shows each loaded scenario's real file path and status (FR-005)
- `settingsModal.spec.ts:207` User Story 1 - One place to manage dashboard-wide settings › a "ready" and a "failed" scenario render a visually distinct row treatment (FR-001)
- `settingsModal.spec.ts:268` User Story 1 - One place to manage dashboard-wide settings › rest of the dashboard renders normally alongside the new control
- `settingsModal.spec.ts:552` User Story 1 - Sectioned basemap catalog with stage-then-Apply › Apply — and only Apply — commits the staged selection to the live global basemap (FR-010, FR-012)
- `settingsModal.spec.ts:573` User Story 1 - Sectioned basemap catalog with stage-then-Apply › closing the modal with a staged, unapplied selection discards it (FR-014)
- `settingsModal.spec.ts:784` User Story 1 - Sectioned basemap catalog with stage-then-Apply › the preview map carries the same NavigationControl/attribution/default view state as FlowMapPanel/ZoneMapPanel
- `settingsModal.spec.ts:827` User Story 1 - Sectioned basemap catalog with stage-then-Apply › picking a global preset re-renders an unconfigured panel, with no page reload (SC-003)
- `settingsModal.spec.ts:851` User Story 1 - Sectioned basemap catalog with stage-then-Apply › a global pick never overrides a panel with its own configured basemap (SC-004, FR-017)
- `settingsModal.spec.ts:895` User Story 3 - Reorder loaded scenarios › moving a scenario up changes display order, boundary buttons stay correctly disabled (FR-007)
- `settingsModal.spec.ts:921` User Story 3 - Reorder loaded scenarios › reordering never changes the automatic-default baseline (FR-008)
- `settingsModal.spec.ts:942` User Story 4 - Custom scenario label › typing a label in the Scenarios tab displays it in place of the real name (FR-009)
- `settingsModal.spec.ts:967` User Story 4 - Custom scenario label › a label is display-only — resolution still uses the real name; label is gone after reload (FR-010, FR-015)
- `settingsModal.spec.ts:1031` User Story 2 (036-scenario-color-picker) - Redesigned color picker › the swatch previews the current effective (shipped-default) color, before any override
- `settingsModal.spec.ts:1050` User Story 2 (036-scenario-color-picker) - Redesigned color picker › typing a hex code in the picker calls through to appState.setColorOverride, and Reset to default appears
- `settingsModal.spec.ts:1077` User Story 2 (036-scenario-color-picker) - Redesigned color picker › changing an RGB field updates the same underlying color, identically to the hex path
- `settingsModal.spec.ts:1098` User Story 2 (036-scenario-color-picker) - Redesigned color picker › a color override is gone after reload
- `settingsModal.spec.ts:1136` User Story 3 (036-scenario-color-picker Part C) - Row status treatment, active toggle, baseline indicator › a "ready" and a "failed" row show distinct, non-transparent border/background treatment, in both themes (FR-017/FR-018)
- `settingsModal.spec.ts:1168` User Story 3 (036-scenario-color-picker Part C) - Row status treatment, active toggle, baseline indicator › toggling a scenario's Switch off immediately excludes it from a $scenario.-driven panel, and back on restores it (FR-019/FR-020)
- `settingsModal.spec.ts:1235` User Story (037-scenarios-tab-redesign) › FR-001: the active/inactive Switch's checked state equals the real `active` value for both an active and an inactive scenario (dark)
- `settingsModal.spec.ts:1235` User Story (037-scenarios-tab-redesign) › FR-001: the active/inactive Switch's checked state equals the real `active` value for both an active and an inactive scenario (light)
- `settingsModal.spec.ts:1299` User Story (037-scenarios-tab-redesign) › T007: a pointer drag of a row handle past another row reorders the list, no reload
- `settingsModal.spec.ts:1323` User Story (037-scenarios-tab-redesign) › T008: a keyboard drag (Space to lift, arrows to move, Space to drop) reorders the list, with position-based live announcements (FR-006)
- `settingsModal.spec.ts:1375` User Story (037-scenarios-tab-redesign) › T008b: a keyboard drag cancelled with Escape leaves the order unchanged (FR-007)
- `settingsModal.spec.ts:1390` User Story (037-scenarios-tab-redesign) › T009: the relocated leading-edge arrows still reorder one step; boundary arrows are disabled
- `settingsModal.spec.ts:1413` User Story (037-scenarios-tab-redesign) › T010: reordering the list never changes the resolved baseline (FR / Edge Case)
- `settingsModal.spec.ts:1429` User Story (037-scenarios-tab-redesign) › T011: every non-reorder control is pixel-aligned across all rows, both themes (FR-015)
- `settingsModal.spec.ts:1459` User Story (037-scenarios-tab-redesign) › T011b: the colour swatch is vertically centred against the WHOLE name+path identity block, both themes
- `settingsModal.spec.ts:1516` User Story (037-scenarios-tab-redesign) › T018: a non-baseline row shows an outline clickable "Set as baseline" chip; clicking it moves the baseline
- `settingsModal.spec.ts:1544` User Story (037-scenarios-tab-redesign) › T019: no Star icon / no separate Badge remains; the chip is the only baseline control, fixed width, both themes
- `settingsModal.spec.ts:1582` User Story (037-scenarios-tab-redesign) › T024: hovering the active/inactive Switch shows an explanatory tooltip; the baseline chip has none (dark)
- `settingsModal.spec.ts:1582` User Story (037-scenarios-tab-redesign) › T024: hovering the active/inactive Switch shows an explanatory tooltip; the baseline chip has none (light)
- `sunburstPanel.spec.ts:54` User Story 2 - Author renders the same real hierarchy as a zoomable sunburst › renders real purpose/mode arcs, angular width proportional to real totals, cross-checked against a direct query
- `tablePanel.spec.ts:494` 019-baseline-diff-consumption › User Story 1: $baseline resolves and computes the correct absolute diff, reactively
- `treemapPanel.spec.ts:36` User Story 1 - Author renders a real hierarchical breakdown as a zoomable treemap › renders one region per real primary_purpose, sized/colored correctly, cross-checked against a direct query
- `zonemapPanel.spec.ts:250` User Story 1 - Author renders a zone-level metric as a choropleth › auto-fits its initial view to the real loaded zone geometry (no author-configured center/zoom)
- `zonemapPanel.spec.ts:347` User Story 1 - Author renders a zone-level metric as a choropleth › an explicit domain is honored verbatim, not replaced by auto-compute
- `zonemapPanel.spec.ts:1253` User Story 4 - Registry consistency › a broken zonemap panel config shows the shared error state, not an unhandled exception

## Flaky (failed in the full pass, passed on retry)
- `flowmapPanel.spec.ts:1610` 017-multi-sprite-support — US1: both UGRC panels' highway/route-shield icons resolve › Flowmap UGRC Composition — LiteLabels' own highway-shield icons are present
- `rechartsComboChart.spec.ts:84` chart_type: combo (Trip tab, "Trip Volume vs. Average Distance by Purpose") › the line layer uses its own independent right-axis scale, not the bar layer's left-axis range
- `rechartsPanel.spec.ts:241` User Story 1 - Author renders a bar, line, or area chart with the new default engine › chart_type: line and chart_type: area render correctly with the same data-binding and theming, changing only the visual mark
- `rechartsPanel.spec.ts:300` User Story 1 - Author renders a bar, line, or area chart with the new default engine › a zero-row query renders PanelEmptyState; a rejected query renders PanelErrorState
- `rechartsPanel.spec.ts:324` User Story 2 - Existing panel types remain completely unaffected › plotly, recharts, observable-plot, and sankey panels each render without error, including two side by side on one tab
- `rechartsPanel.spec.ts:395` User Story 3 - A viewer gets useful, on-brand tooltips without extra author work › hovering a bar shows a real tooltip matching the underlying query value(s) for that point
- `rechartsPanel.spec.ts:442` User Story 3 - A viewer gets useful, on-brand tooltips without extra author work › the tooltip surface and text remain legible in both light and dark mode
- `sunburstPanel.spec.ts:88` User Story 2 - Author renders the same real hierarchy as a zoomable sunburst › clicking a non-leaf arc zooms so it becomes the center; clicking the center circle zooms back out
- `treemapPanel.spec.ts:92` User Story 1 - Author renders a real hierarchical breakdown as a zoomable treemap › hovering any region shows its real underlying value, cross-checked against a direct query
- `treemapPanel.spec.ts:107` User Story 1 - Author renders a real hierarchical breakdown as a zoomable treemap › a zero-row query renders the shared PanelEmptyState; a broken-metric config renders the shared PanelErrorState
- `treemapPanel.spec.ts:124` User Story 1 - Author renders a real hierarchical breakdown as a zoomable treemap › zooming in and back out fires zero new DuckDB queries beyond the initial fetch
- `treemapPanel.spec.ts:181` User Story 1 - Author renders a real hierarchical breakdown as a zoomable treemap › a degenerate single-branch hierarchy renders sensibly, never an error
- `zonemapPanel.spec.ts:495` User Story 1 - Author renders a zone-level metric as a choropleth › a zone with no matching metric row under a real filter shows the no-data treatment
- `zonemapPanel.spec.ts:535` User Story 2 - Resize and basemap inheritance › a zonemap panel with no basemap: picks up the tab default; a panel-level override wins

## Investigation of the eight files `CLAUDE.md` does not list

`CLAUDE.md` names about eight spec files as already failing (settingsModal, observablePlotPanel, tablePanel,
scenarioManager, valueBoxPanel, sankeyPanel, rechartsPanel, scenarioAutoActivation). At this baseline six of those fail
and `scenarioManager` and `valueBoxPanel` pass. Eight other files also had stable failures (11 tests). Each was rerun alone:

| Result when run alone | Tests |
|---|---|
| **Pass** (they fail only inside the full suite, so they are load or ordering dependent, not code defects) | brokenPanelStates:52, flowmapPanel:679, graphicWalkerPanel:393, hierarchicalChartTheming:46 and :75, sunburstPanel:54, treemapPanel:36, zonemapPanel:250 and :347 |
| **Fail alone: stale expectation** | `lazyTabLoading.spec.ts:25` expects the Summary tab to register 9 views (3 metrics × 3 scenarios). The Summary KPI value boxes are pinned to `activitysim-baseline` in `dashboard-1-summary.yaml`, so `summary_kpis` registers once, giving 1 + 3 + 3 = **7**. The app is right; the test's number is out of date. |
| **Fail alone: timing** | `zonemapPanel.spec.ts:1253` waits 5 s for the broken zone map to show its error. Measured on this machine the error appears after **5.3 to 6.3 s** (three runs), because the panel first fetches the DuckDB spatial extension over the network. The panel is correct; the test's limit is too tight here. |

Conclusion: no product regression among them. Nine are load-sensitive, one test has a stale count, one has a tight timeout.
Nothing was changed to fix them (out of scope for P0). They stay on `baseline-stable-failures.txt` so a later phase can tell
them apart from new failures; treat the nine load-sensitive ones as flaky when a phase touches nearby code, and rerun them alone first.

## How the baseline was recorded (read this before re-running)

**Do not run plain `npx playwright test` on this machine and trust the result.** Twice the full suite appeared to
produce 200+ failures. Cause: `tablePanelServerSidePagination.spec.ts` copies a temporary Parquet file into
`public/demo-scenarios/.../summary/` while other specs run; Vite's file watcher then throws
`EBUSY: resource busy or locked, watch '..._059_scale_test_small.parquet'` (Windows with Node v26) and the dev server
exits. Every later test fails with `net::ERR_CONNECTION_REFUSED`. Those runs say nothing about the code. Setting
`CHOKIDAR_USEPOLLING=1` avoids the crash but triggers page reloads mid-test and made things worse (313 failures), so it
is not a fix.

What works (three runs, each launched as the single tracked command so nothing reaps the server):
1. `npx playwright test --grep-invert "059-server-side-pagination"`  (443 tests)
2. `npx playwright test --last-failed`  (retries the failures of run 1 to separate stable from flaky)
3. `npx playwright test tests/integration/tablePanelServerSidePagination.spec.ts`  (that file alone; it passes)

Check any run for validity: it must contain **no** `EBUSY` and **no** `ERR_CONNECTION_REFUSED` lines.

## Notes

- Nothing was changed to get these results. `git status` shows only the new P0 files.
