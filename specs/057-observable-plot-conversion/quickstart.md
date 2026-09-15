# Quickstart: Validating the Observable Plot Chart Consolidation

Prerequisites: repo dependencies already installed (`npm install`); this
feature adds no new dependency.

## 1. Visual spot-check (manual, dev server)

```bash
npm run dev
```

Open the app and, for each tab below, confirm the named panel renders a
chart (not a blank/error state) with the same figures it showed before
conversion, and that it looks visually consistent with this app's other
Observable Plot panels (same font size, same tooltip-on-hover behavior,
same automatic legend when a color channel is set):

- **Summary**: "Total Trips by Mode", "Average Trip Distance by Purpose"
- **Tour**: "Non-Mandatory Tour Frequency by Purpose"
- **Mode Choice**: "At-Work Subtour Mode Share by Purpose", "Trip Mode
  Share by Time-of-Day Period (WALK_LOC)" — and confirm "Trip Purpose to
  Mode Flow" (the Sankey panel, same tab) still renders correctly,
  unaffected
- **Trip**: "Trip Departure Hour (Work Trips)"

Toggle a scenario off/on via the Scenarios tab Switch (Settings modal)
against "Total Trips by Mode" or "Average Trip Distance by Purpose" and
confirm the chart's per-scenario bars/legend update live, matching
`switchControlsUnpinnedPanels.spec.ts`'s own existing coverage pattern.

Toggle dark mode and confirm every converted panel's background matches
the surrounding card (no white box) — this reuses the already-proven
`--plot-background` fix (research.md §8), so it should need no new work,
only confirmation.

Open the Explore/Test area is not applicable here — instead, open
Settings → verify a value-box panel configured with `sparkline:` (or the
existing `dashboard-8-test.yaml` broken-sparkline entry, for its
error-state behavior only) renders correctly at its small, existing size.

## 2. Automated verification

```bash
npx tsc --noEmit
npm run test:unit
```

Expect a clean typecheck and the full unit suite passing — this feature
does not change any pure module's exported behavior (research.md §4/§7),
so no unit test should need updating unless the sparkline gains a new,
directly-testable pure helper.

```bash
npx playwright test tests/integration/dashboardShell.spec.ts \
  tests/integration/panelExpand.spec.ts \
  tests/integration/scenarioColorOverride.spec.ts \
  tests/integration/scenarioLabelDisplay.spec.ts \
  tests/integration/switchControlsUnpinnedPanels.spec.ts \
  tests/integration/lazyTabLoading.spec.ts \
  tests/integration/demoMultiScenario.spec.ts \
  tests/integration/markdownPanel.spec.ts \
  tests/integration/metricStrip.spec.ts \
  --workers=1
```

Every one of these files (contracts/test-migration.md) must pass after
its own required changes are applied — a real regression, not a
pre-existing flake, if any fails after this feature's changes land.

```bash
npx playwright test tests/integration/observablePlotPanel.spec.ts \
  tests/integration/sankeyPanel.spec.ts --workers=1
```

Confirms the five already-existing Observable Plot panels and the
untouched Sankey panel are both unaffected (research.md §7/§1).

## 3. Confirm the deliberately-broken test tab is untouched

```bash
git diff --stat -- public/demo-dashboard-config/dashboard-8-test.yaml
```

Expect no output (zero changes) — FR-010.

## 4. Confirm no query-layer code changed

```bash
git diff --stat -- src/panels/panelQuery.ts src/services/sqlExpander.ts
```

Expect no output (zero changes) — FR-005/FR-011.

## Expected outcome

- SC-001: `git grep -l "type:.*plotly\|type:.*recharts" public/demo-dashboard-config/dashboard-1-summary.yaml public/demo-dashboard-config/dashboard-3-tour-models.yaml public/demo-dashboard-config/dashboard-4-mode-choice.yaml public/demo-dashboard-config/dashboard-5-trip-models.yaml` returns nothing (the Sankey panel's own `type: sankey` is a separate, intentional exception — not a leftover Plotly/Recharts panel).
- SC-002/SC-003: manual spot-check in step 1 confirms unchanged figures.
- SC-004: the Sankey panel and its tab are visually and functionally unaffected.
- SC-005: `observablePlotPanel.spec.ts` passes unchanged; no code diff in `observablePlotEncoding.ts`/`ObservablePlotPanel.tsx` unless a real defect was found and fixed (research.md §7).
- SC-006: every Playwright file in contracts/test-migration.md passes.
