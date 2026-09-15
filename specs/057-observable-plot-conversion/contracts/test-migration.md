# Contract: Test Suite Migration

Satisfies SC-006 (no chart panel that worked before this feature is
broken after it). Confirmed by direct read of every listed file
(research.md §10) — not a guess at which files might be affected.

## Files requiring a change

| File | Current assertion | Required change |
|---|---|---|
| `tests/integration/dashboardShell.spec.ts` | `.js-plotly-plot` visibility (×2); `page.evaluate` reads `gd.data.length` to assert 3 Plotly traces; dark-mode test reads `.js-plotly-plot .bg` computed style | Swap visibility checks to `.observable-plot-chart svg[viewBox]`; replace the trace-count check with a count of distinct `fill`/legend-swatch entries (e.g. `.observable-plot-chart [class*="-swatches"] >* ` count, or a `rect[fill]` distinct-color count — confirm exact selector against the live rendered DOM during implementation); rewrite the dark-mode assertion to check the `--plot-background`/`--card` mechanism (research.md §8) instead of Plotly's `.bg` element |
| `tests/integration/demoMultiScenario.spec.ts` | Comments name "recharts"/"plotly" for these two panels; uses the shared `panelCard()` helper (title-based, likely engine-agnostic) | Update comments to name Observable Plot; confirm (do not assume) no engine-specific assertion is buried further in the file |
| `tests/integration/lazyTabLoading.spec.ts` | `chart.locator('svg').getByText(scenarioName)` — legend text search scoped *inside* `<svg>` | Rewrite per research.md §9: target `.observable-plot-chart [class*="-swatches"]` instead, since Plot's legend swatches render as a sibling of the chart `<svg>`, not nested inside it |
| `tests/integration/markdownPanel.spec.ts` | Title-only visibility checks; `// recharts`/`// plotly` are comments only | Comment update only |
| `tests/integration/metricStrip.spec.ts` | Title-only visibility check | No change required — verify only |
| `tests/integration/panelExpand.spec.ts` | `CHART_TITLE = 'Average Trip Distance by Purpose'`; ~10 assertions on `.js-plotly-plot` across inline and 004-expand-dialog states, including a DOM-identity check (same node moves between anchors) | Full selector rewrite to `.observable-plot-chart svg[viewBox]`; preserve the same inline-vs-dialog DOM-identity assertions — Observable Plot's `ObservablePlotPanel.tsx` already participates in the same generic `usePanelExpandHost()` mechanism as every other expandable panel type, so the expand/collapse behavior itself needs no change, only the locator |
| `tests/integration/scenarioColorOverride.spec.ts` | Explicit `.js-plotly-plot`/`.recharts-wrapper` visibility (line ~194/197); trace-color and series-color assertions tied to each engine's own internal representation | Rewrite visibility checks to `.observable-plot-chart svg[viewBox]`; rewrite color assertions to read the resolved `fill`/`stroke` on the rendered `rect`/swatch elements, per the already-existing, already-correct color-resolution logic (research.md §7) — this is a locator rewrite proving existing behavior, not new behavior to build |
| `tests/integration/scenarioLabelDisplay.spec.ts` | Same shape as above, for label text | Same rewrite approach, targeting legend swatch label text per research.md §9 |
| `tests/integration/switchControlsUnpinnedPanels.spec.ts` | `panelCard()` lookups by title for both converted panels | Verify no embedded engine-specific selector; update only if one is found |

## Files added after the initial audit (found during `/speckit-tasks` — research.md §10a)

| File | Current assertion | Required change |
|---|---|---|
| `tests/integration/valueBoxPanel.spec.ts` | Fixture-based sparkline-mechanism coverage: `.recharts-bar-rectangle, .recharts-bar rect` (chart renders); `.recharts-wrapper` ×2 (a "no sparkline configured" negative check, and a "sparkline + baseline_trend together" positive check) | Rewrite all three to Observable Plot's own rendered output (e.g. `.observable-plot-chart svg[viewBox] rect`/`path`, and an absence check on `.observable-plot-chart` itself for the negative case) — this is the primary regression coverage for `panels/valueBoxSparkline.tsx` |
| `tests/integration/demoContentAllPanels.spec.ts` | `032-six-tab-demo-content`'s "all ten panel types render real, non-empty content" test asserts `.js-plotly-plot` and `svg path.recharts-rectangle` visible on the Summary tab | Deliberate rewrite (not a quiet deletion): after this feature, real content covers 8 of 10 types on the six primary tabs; replace the two failing assertions with the Summary tab's new `observable-plot` output, and adjust the test's own name/comment to state that `plotly`/`recharts` remain supported types exercised via `dashboard-8-test.yaml`'s error-state coverage rather than real Summary-tab data |

## Files confirmed unaffected (no engine-specific assertion found)

`tests/integration/rechartsPanel.spec.ts` and
`tests/integration/sankeyPanel.spec.ts` both matched a broad
`js-plotly-plot`/`recharts-wrapper`/`observable-plot-chart` grep but were
individually read and confirmed unaffected (research.md §10a): every
selector in both files targets a *fixture*-only panel
(`tests/fixtures/dashboard-config/`), structurally separate from
`public/demo-dashboard-config/` and none among this feature's six
conversion targets or the sparkline mechanism.

## Non-negotiable invariant

Every rewritten assertion must prove the same underlying fact the
original assertion proved (a chart is visible and shows real data; a
scenario's label/color propagates to what the viewer sees; expand/
collapse preserves DOM identity) — never merely delete a case that's
inconvenient to port. Where research.md flags a selector as "confirm
during implementation" (the exact swatches-count selector for
`dashboardShell.spec.ts`'s trace-count check), that confirmation happens
against the real, live rendered DOM before the test is considered done,
not left as a guess.
