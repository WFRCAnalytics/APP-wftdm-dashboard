# Contract: Per-spec migration

One row per integration spec file. "Real target" = the real demo tab/panel/scenario the happy-path assertions bind to. "→ dashboard-8" = the error/edge assertions that move to `dashboard-8-test.yaml`. Phase per `research.md` D-7.

## Phase 1 — panel-mechanic specs

| Spec | Real target | → dashboard-8 | Real value asserted (SC-005) |
|---|---|---|---|
| `valueBoxPanel.spec.ts` | Summary KPI strip `valuebox` | sparkline/baseline_trend missing-metric | `5,000` households / `15,212` VMT (baseline) |
| `tablePanel.spec.ts` | Mode Choice "Tour Mode Share by Segment" (`tour_mode_share_summary`, 2738 rows) | — | page-2 navigation, sort, search over real rows; `scenario` column values |
| `markdownPanel.spec.ts` | gap-note `markdown` panels (×5) | XSS / empty / whitespace `content:` | rendered heading text from a real gap-note |
| `observablePlotPanel.spec.ts` | Trip "Trip Destination Distance Distribution" (`trip_destination_summary`) | missing-metric | `barY` marks; `fill` legend = real `primary_purpose` values |
| `rechartsPanel.spec.ts` | Overview / Mode Choice `recharts` (×2) | `chart_type: pie`; empty-result filter | bars as `<path class="recharts-rectangle">`; theme-correct series color |
| `sankeyPanel.spec.ts` | Mode Choice `purpose_mode_flow` sankey | missing-metric | node labels from real `primary_purpose` / `major_trip_mode` |
| `flowmapPanel.spec.ts` | Network `od_flows` flowmap | unreachable basemap; broken composition; basemap precedence | flow lines render; base map host = `tiles.openfreemap.org/styles/positron` |
| `zonemapPanel.spec.ts` | Trip "SOV Trip Attractions by Zone" + Network zonemap | unreachable basemap | 25 zones tiled; `taz25.geoparquet`; auto-fit bounds |
| `graphicWalkerPanel.spec.ts` | Person & Households `person_household_profile`; Explore full-page `trip_mode_share` | bad fixed dataset; `dataset_picker` no-match; empty-result filter | `<GraphicWalker>` mounts; real field names in the schema |
| `panelExpand.spec.ts` | any expandable real demo panel (`table`/`plotly`/`sankey`/…) | — | expand → dialog → same panel instance preserved |
| `demoContentAllPanels.spec.ts` | already demo-based | — | **drop** `page.route(fixture→404)` + `_sharedFixtureLock`; still 7/7 |
| `demoMultiScenario.spec.ts` | already demo-based | — | **drop** `_sharedFixtureLock`; 3 per-scenario series in both themes |

## Phase 2 — shell/nav specs

| Spec | Real target | → dashboard-8 | Notes |
|---|---|---|---|
| `dashboardShell.spec.ts` | real 7 tabs (+ 8th "Test" during tests) | — | tab-count assertions → "7 in prod / 8 in tests" or named-tab checks; the 8th tab is queried by `getByRole('tab', { name: 'Test' })` (via `aria-label`), not by visible text; drop `index.json` rewrite + lock; the "value-box shows fixture number" test → real KPI |
| `sidebarNav.spec.ts` | real tab list + real `sections:` (demo `dashboard-2/3/5/6`) | — | drop `index.json` rewrite + lock; `role="tab"`/`aria-selected` checks unchanged; **new assertions for D-8**: the "Test" entry has no `<svg>` icon and no painted label text, its accessible name is `"Test"` via `aria-label`, and it is still focusable/activatable; the 7 real entries are unchanged |
| `sectionSubNav.spec.ts` | real `sections:` accordion (already real in demo) | — | `scrollIntoView` to a real section's first row |
| `fullPagePanel.spec.ts` | `dashboard-7-explore.yaml` (`full_page: true`, `icon: compass`) | `dashboard-8-test.yaml` misconfigured full-page (`full_page` + N panels → `console.warn` + ordinary render) | drop the 3 `index.json`-path refs + lock |
| `metricStrip.spec.ts` | a real all-`valuebox` demo row + a real mixed row | — | re-anchor from `data-testid="row_kpis"/"row_chart"` to real demo row ids (read from the demo yaml) |
| `boot.spec.ts` | real demo `index.json`; `all-placeholders-config.yaml` | — | assert auto-active set = `[activitysim-baseline, -density-variant, -transit-variant]`, `observed` = `failed`; keep the placeholder-grammar load |

## Phase 3 — scenario-manager family

| Spec | `good_scenario` → | `broken_scenario` → | Real value asserted |
|---|---|---|---|
| `scenarioManager.spec.ts` | a real demo scenario name | `observed` (failed) | local-folder-load path (`showDirectoryPicker`) confirmed fixture-independent |
| `scenarioColorOverride.spec.ts` | real demo names | — | manifest colors `#59A14F` / `#BAB0AC` / `#FF9DA7`; override + reset |
| `scenarioLabelDisplay.spec.ts` | real demo names | — | `display_name` "ActivitySim Baseline" etc. in legend/label surfaces |
| `scenarioAutoActivation.spec.ts` | real demo names | `observed` (failed) | 3 `ready` → auto-active (DA-1..DA-8); `failed` never auto-active |
| `switchControlsUnpinnedPanels.spec.ts` | real demo names | — | toggle a scenario off → an **unpinned** demo panel's series count drops; on → restored |
| `settingsModal.spec.ts` (largest, last) | real demo names (×69) | `observed` (×31) | full Scenarios-tab: reorder, label, color, baseline chip, active Switch — all against real demo rows |

## Untouched

| Spec | Reason |
|---|---|
| `formInputPrimitives.spec.ts` | Tests `demo.html` form primitives; no dashboard/scenario dependency (RF-2). |

## Global rules for every migrated spec

- Zero references to `good_scenario`, `broken_scenario`, `tests/fixtures/dashboard-config` (FR-008, SC-002).
- At least one assertion provably derived from real demo Parquet/manifest (FR-007, SC-005).
- Error/edge assertions bind to `dashboard-8-test.yaml` or `observed`-failed, never a synthetic construct (FR-004).
- `npm run test:integration` green at each phase boundary (FR-017, SC-006).
