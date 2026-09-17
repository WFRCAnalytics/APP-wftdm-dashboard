# Quickstart: Pie & Radar Chart Panels

## Prerequisites

- `npm install` already run (no new dependency added by this feature —
  `d3-shape`/`d3-scale-chromatic` are already installed).
- `npm run dev:fixtures` (populates `public/scenarios`,
  `public/dashboard-config`, `public/observed` from `tests/fixtures/` for
  local checks — the demo content itself lives at
  `public/demo-scenarios`/`public/demo-dashboard-config`, already
  git-tracked and present with no setup step).

## Validate the pie panel end-to-end

1. `npm run dev`
2. Open the app, activate at least the `activitysim-baseline` demo
   scenario (real demo content auto-activates every loaded scenario per
   `038-all-loaded-scenarios` — no manual step needed on a fresh boot).
3. Go to the **Trip Models** tab (or wherever the new pie panel lands —
   see data-model.md §7).
4. **Expected**: a real, proportioned pie chart — one wedge per real
   `primary_purpose` value from `trip_purpose_share`, a legend beneath it
   naming each purpose with a matching color swatch.
5. Hover a wedge — a tooltip appears near the cursor showing that
   purpose's real trip count/share.
6. Toggle the app's theme (Settings → Appearance) — confirm every wedge,
   legend swatch, and (on a fresh hover) tooltip stays legible in dark
   mode.
7. Expand the panel (the card's expand affordance) — confirm the chart
   redraws crisply at the dialog's larger size.

## Validate the radar panel end-to-end

1. Same dev server; go to the **Mode Choice** tab.
2. **Expected**: a real radar/spider chart — one axis per real
   `major_trip_mode` value from `trip_mode_share`, one polygon per loaded
   scenario (`series: scenario`), a legend naming each scenario.
3. Hover a vertex — a tooltip shows that mode's real share for that
   scenario.
4. Toggle the theme — same dual-theme legibility check as the pie chart.
5. Load a second/third real demo scenario (if not already active) and
   confirm an additional polygon appears without a page reload (this
   panel's fetch effect already re-runs on `activeScenarioNames` change,
   the same reactivity every other data-bound panel type has).

## Validate edge cases (via `dashboard-8-test.yaml`)

The permanent Test tab (near-invisible sidebar sliver, accessible name
"Test") gets one new broken-config panel per new type, matching every
prior panel type's own established coverage there:

- `type: pie` bound to a nonexistent metric → `PanelErrorState`
  ("Couldn't load…").
- `type: radar` bound to a nonexistent metric → `PanelErrorState`.
- (Optional, if a real demo metric naturally has one) a zero-value
  category on the real pie panel, confirmed still present in the legend.

## Run the automated checks

```bash
npm run typecheck
npm run test:unit -- pieData radarData
npm run test:integration -- pieChartPanel radarChartPanel
```

Expected: typecheck clean; both new unit test files passing; both new
Playwright specs passing, with no regression in the existing
`sankeyPanel.spec.ts`/`hierarchicalChart*.spec.ts` suites (neither new
panel type touches any file those tests exercise).
