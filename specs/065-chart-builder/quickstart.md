# Quickstart: validating the Chart Builder

Prerequisites: `npm install`; fixtures for local runs (`npm run dev:fixtures`) or the real demo content under
`public/demo-*`. Branch `065-chart-builder`.

## 0. Spikes (before building on them)

Run each spike in research.md (S1–S6) on a scratch page or the browser console against `npm run dev`; record results in
`research.md` under each ID. Do not start the dependent phase until it is recorded.

## 1. Pure core (no browser)

```
npx vitest run tests/unit/chartBuilder*.test.ts tests/unit/exploreSql*.test.ts
npx tsc --noEmit
```
Expect: spec validation (valid + each rule violation), spec→SQL (aggregate, bin, time unit, filter, facets, row cap),
compile output for each v1 mark (mark counts, dash arrays per series, pattern defs present), rules ranking (the table in
the proposal, including pie only when ≤ 12 and parts-of-whole), guard refusals, `xb_` protection, AST fixtures.

## 2. Explore in the app

```
npm run dev      # open http://localhost:5173/APP-wftdm-dashboard/ , Explore (builder)
```
1. Pick one scenario and a table → paged preview and typed columns appear (US1). Page size fills the height.
2. Select two scenarios, **Use in query** → UNION with `scenario` column; Run; Save as `compare_mode_share` (US2).
3. Edit the form (add a filter) → SQL text updates; type a CTE in the text → form shows "edited as SQL" (US2.3).
4. Run a long query; Cancel → returns promptly; dashboard tabs still load (FR-009).
5. New viz tab → source `compare_mode_share` → drag `mode` to x, `share` to y (sum), `scenario` to color → grouped bars.
   Repeat using only the keyboard (FR-011). Assign `scenario` to `pattern` → hatch bars with legend (US3.6).
6. Pick chart first: choose *scatter* → two quantitative slots marked required; hover a "Coming soon" type (US4).
7. Set title bold large, source italic small (US5); toggle light/dark → text and chart follow the theme.
8. Export PNG/SVG/CSV; Export configuration; reload; Import → identical chart (US6, SC-006).

## 3. YAML parity

Add to a test dashboard tab (never commit to demo content without review):
```yaml
- type: chart
  kind: custom
  title: Custom chart
  spec: { version: 1, data: { source: { sql: "SELECT …" } }, mark: bar, encoding: { … } }
```
Expect a normal tile with the standard Export menu and the same drawing as in Explore.

## 4. Regression and weight

- Opening any other tab does not request the builder chunk (network panel) (SC-010).
- The AI assistant's **Reset session data** leaves My tables intact; the assistant cannot drop `xb_*`.
- Playwright: `npx playwright test explore-builder --workers=1` in dark and light projects (specs follow the repo's
  shared-fixture lock rule if they mutate shared index.json).

## 5. Done means

`npx tsc --noEmit` clean; Vitest and Playwright specs pass; side-by-side screenshots of a built chart and the equivalent
curated chart in light and dark match in fonts, palette, legend, tooltip and spacing (SC-005); no console errors.
