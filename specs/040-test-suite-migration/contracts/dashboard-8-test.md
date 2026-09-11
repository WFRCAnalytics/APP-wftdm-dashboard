# Contract: `dashboard-8-test.yaml`

> **Design reversal (2026-09-10):** `dashboard-8-test.yaml` is a **permanent 8th entry** in the real `index.json`, not test-only-injected. `header.blank_nav` is retired — replaced by `header.tab: " "` (single space) + omitted `header.icon` + `header.aria_label: "Test"`. The "Invisibility contract" below is superseded by the "Sidebar entry contract"; the injection rows no longer apply.

The test-only broken-panel tab. Authored in existing `dashboard-*.yaml` grammar; binds to real demo scenarios/metrics; produces every error/empty state through config shape alone.

## Invisibility contract (FR-002, SC-001)

| Requirement | Verification |
|---|---|
| **Permanent** entry in `public/demo-dashboard-config/index.json` | `index.json`'s `dashboards` array ends with `dashboard-8-test.yaml`, in every build |
| Present in every build output | `docs/demo-dashboard-config/dashboard-8-test.yaml` and `dist/demo-dashboard-config/dashboard-8-test.yaml` exist after a build (it is git-tracked static content) |
| Discoverable in every build | `global-setup.js`/`global-teardown.js` do NOT touch `index.json`; a plain `npm run dev` shows 8 sidebar tabs (7 real + the sliver) |

## `header` block (FR-019 – FR-021, D-8)

```yaml
header:
  tab: " "                      # single space — valid non-empty string; renders as a sliver
  title: "Test / Broken Panels" # shown as the content <h1> when the tab is opened
  aria_label: "Test"            # the sidebar button's aria-label (accessible name)
  full_page: true               # + >1 panel below ⇒ the full-page misconfiguration case
# `icon:` intentionally OMITTED (no glyph)
```

## Sidebar entry contract (FR-019 – FR-021, SC-008)

| Property | Required result when the test tab is registered |
|---|---|
| Icon glyph | none rendered (no `<svg>` inside the tab's `SidebarMenuButton`) |
| Visible label text | a single space — the `header.tab` `" "` renders as a thin, barely-perceptible sliver; 0 readable characters (`.textContent().trim() === ''`) |
| Accessible name | exactly `"Test"` — from `aria-label` on the `SidebarMenuButton` |
| `getByRole('tab', { name: 'Test' })` | resolves **exactly one** element |
| Keyboard / AT navigation | works — `role="tab"`, `aria-selected`, `onClick`, focusability all unchanged from a normal tab |
| Collapsed icon-only rail | shows nothing (no icon, label hidden) — consistent with any icon-less tab |
| Applies when | always — the tab is a permanent part of every build |
| Real tabs (1–7) | **unchanged** — no `aria_label` ⇒ no `aria-label` attribute, label `truncate`, icon rendered as before |

## Panel inventory (FR-001, FR-004, FR-005)

Every row below reproduces a fixture "(intentional)" panel or `broken_scenario` assertion from RF-3. Panels bind to `activitysim-baseline` and real metric names unless the case *is* a nonexistent binding. Sentinel values must be confirmed absent from the real Parquet / `panels/basemap/registry.ts` before authoring.

| Row / panel | Type | Broken mechanism | Expected UI state | Replaces (fixture) |
|---|---|---|---|---|
| `row_missing_metric` #1 | `table` | `metric: __nonexistent_metric__` | "Couldn't load…" error state | `Broken Table Panel` |
| `row_missing_metric` #2 | `plotly` | `metric: __nonexistent_metric__` | error state | `Broken Panel` |
| `row_missing_metric` #3 | `sankey` | `metric: __nonexistent_metric__` | error state | `Sankey Broken Panel` |
| `row_missing_metric` #4 | `flowmap` | `metric: __nonexistent_metric__` | error state (map chrome may still mount) | `Flow Map Broken Panel` |
| `row_missing_metric` #5 | `zonemap` | `metric: __nonexistent_metric__` | error state | `Zone Map Broken Panel` |
| `row_missing_metric` #6 | `recharts` | `metric: __nonexistent_metric__` | error state | `Recharts Broken Panel` |
| `row_missing_metric` #7 | `observable-plot` | `metric: __nonexistent_metric__` | error state | `Observable Plot Broken Panel` |
| `row_bad_chart_type` | `recharts` | `chart_type: pie` | runtime validation error, surfaced before query | `Recharts Invalid Chart Type` |
| `row_bad_basemap` #1 | `flowmap` | `basemap: totally-made-up-preset-name` | blank-style fallback; **flow lines still render** (FR-010/SC-004 of 011) | `Flowmap Unreachable Basemap` |
| `row_bad_basemap` #2 | `zonemap` | `basemap: totally-made-up-preset-name` | blank-style fallback; **choropleth still renders** | `Zone Map Unreachable Basemap` |
| `row_broken_composition` | `flowmap` | `basemap: { layers: [ { url: "https://invalid.example/nope.json" } ] }` | blank-style fallback; data content still renders | `Flowmap Broken Composition Layer` |
| `row_bad_gw_dataset` #1 | `graphic-walker` | `dataset: __nonexistent__` (fixed) | error state, dataset picker absent | `Explore Panel Broken` |
| `row_bad_gw_dataset` #2 | `graphic-walker` | `dataset_picker: true`, `dataset: __nonexistent__` | error state, picker still usable to pick a working dataset | `… (Dataset Picker, No Match)` |
| `row_markdown_edge` #1 | `markdown` | `content:` contains `<script>` + `onerror=` payload | rendered sanitized (no script execution, no `on*` attrs) | markdown XSS fixture |
| `row_markdown_edge` #2 | `markdown` | `content: ""` | empty-state / blank render, no crash | markdown empty fixture |
| `row_markdown_edge` #3 | `markdown` | `content: "   "` (whitespace only) | same as empty | markdown whitespace fixture |
| `row_valuebox_edge` #1 | `valuebox` | `sparkline: { metric: __nonexistent__, x: …, y: … }` | scalar value renders; sparkline shows its own error/empty, panel not blocked | 034 sparkline missing-metric |
| `row_valuebox_edge` #2 | `valuebox` | `baseline_trend: { expr: "a.__missing_col__ - b.total_persons" }` | scalar renders; trend badge shows neutral/`Minus` or error, not a false arrow | 034 baseline_trend no-op |
| `row_bad_diff` | `table` | `comparison: { diff: { a: __nope_a__, b: __nope_b__ } }` | error / "no data" state, no crash | `comparison: diff` unresolvable fixture |
| `row_empty_result` #1 | `recharts` | `filter: { primary_purpose: __no_such_purpose__ }` | empty-state (`PanelEmptyState`) | `Recharts Empty Result` |
| `row_empty_result` #2 | `graphic-walker` | `filter: { primary_purpose: __no_such_purpose__ }` | empty-state | `Free-form Visual Analytics Empty` |
| `row_basemap_precedence` #1 | `flowmap` | no panel `basemap:`; tab has `default_basemap: <preset X>` | resolves to tab default X (panel > **tab** > global > app-default) | `dashboard-3-basemaps.yaml` precedence matrix |
| `row_basemap_precedence` #2 | `flowmap` | panel `basemap: <preset Y>` overriding the tab default | resolves to Y | same |

## Misconfigured full-page tab (fullPagePanel.spec.ts case)

`dashboard-8-test.yaml`'s own `header.full_page: true` **with more than one panel/row** → the app MUST `console.warn` and fall back to ordinary (card-grid) rendering, never a blank page. This is the static replacement for `fullPagePanel.spec.ts`'s former runtime `index.json` rewrite.

## Grammar-only guarantee

No panel above requires a data value that real ActivitySim output lacks. Every "broken" state is: a name that resolves to nothing (`metric`/`dataset`/`basemap`/scenario), an out-of-enum literal (`chart_type`), a filter value with zero matches, a malformed `content:` string, or a structural misconfiguration (`full_page` + N panels). All expressible today.
