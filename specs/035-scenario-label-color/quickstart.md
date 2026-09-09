# Quickstart: Scenario Label Propagation & Color Override

Validation scenarios to run once implementation lands. Each maps directly
to an acceptance scenario in `spec.md`.

## Prerequisites

```bash
npm run dev:fixtures   # copies tests/fixtures/{scenarios,dashboard-config,observed} into public/
npm run dev            # starts the Vite dev server
```

Two active fixture scenarios (`observed`, `good_scenario`) are needed —
already the default `dev:fixtures` state.

## Scenario 1 — Label propagates to a Plotly legend (US1, AC1)

1. Open Settings > Scenarios, set `good_scenario`'s label to "Preferred
   Alternative".
2. Navigate to a tab with a multi-scenario Plotly panel (trace
   `color`/`name: $scenario`).
3. **Expect**: the legend entry for `good_scenario` reads "Preferred
   Alternative", not `good_scenario`. `observed`'s legend entry (no
   label set) is unchanged.

## Scenario 2 — Label propagates to Recharts/Observable Plot/Table (US1, AC2–4)

1. With the same label still set, open a Recharts panel with `series:
   scenario`, an Observable Plot panel with `fill: scenario` (or
   `stroke:`), and a Table panel with a `scenario` column.
2. **Expect**: Recharts tooltip/legend, Observable Plot legend/axis text,
   and every `good_scenario` table cell in the `scenario` column all read
   "Preferred Alternative". The table column's own HEADER still reads
   "scenario" — unaffected. Every other data value/position/color is
   pixel-for-pixel identical to before the label was set.

## Scenario 3 — Reactive update, no reload (US1, AC6)

1. With the panels from Scenario 1/2 already rendered, clear
   `good_scenario`'s label back to blank in Settings > Scenarios.
2. **Expect**: every already-open panel's display reverts to
   `good_scenario` immediately, with no page reload and no visible
   re-fetch/loading flash.

## Scenario 4 — Query/state keys unaffected (US1, AC7)

1. With a label set, open browser devtools and inspect
   `window.__wftdm.__debugQueryLog()` after a filter change.
2. **Expect**: every logged SQL statement still references
   `good_scenario` (never the label) in its view names/`UNION ALL`
   clauses.

## Scenario 5 — Manifest color renders consistently (US2, AC1)

1. With two scenarios of different manifest colors active (both
   `observed`/`good_scenario` have real `manifest.yaml` colors in the
   fixture set), open a Plotly, a Recharts, and an Observable Plot panel
   that each split by scenario.
2. **Expect**: each scenario renders in the SAME color across all three
   panel types (previously arbitrary/independent per chart library).

## Scenario 6 — No manifest color falls back cleanly (US2, AC2)

1. Load a local scenario folder with no `manifest.yaml` `color` field
   (or a manually-registered one via `window.__wftdm`).
2. **Expect**: that scenario still renders — some color from each panel
   type's own existing default cycling — never a missing/blank/error
   trace.

## Scenario 7 — Color override, swatch control, immediate propagation (US2, AC3–5)

1. Open Settings > Scenarios — confirm each row's trailing actions
   cluster shows a small color swatch (previewing the scenario's current
   effective color) before the baseline star.
2. Pick a new color for `good_scenario` from its swatch.
3. **Expect**: every already-rendered Plotly/Recharts/Observable Plot
   panel showing `good_scenario` updates to the new color immediately, no
   reload.
4. Click the swatch row's new "clear override" (X) button.
5. **Expect**: `good_scenario` reverts to its manifest color everywhere,
   immediately.

## Scenario 8 — No persistence (US2, AC6 / SC-005)

1. With a label and a color override both set, reload the page (a full
   browser refresh, not a SPA navigation).
2. **Expect**: `good_scenario` shows its real name and its manifest color
   (or default-cycled color) again — neither the label nor the override
   survived the reload.

## Automated coverage

- `npm run test:unit` — `tests/unit/scenarioDisplay.test.ts` (new),
  extended `plotlyTraces.test.ts`/`rechartsEncoding.test.ts`/
  `observablePlotEncoding.test.ts`.
- `npx playwright test tests/integration/scenarioLabelDisplay.spec.ts
  tests/integration/scenarioColorOverride.spec.ts
  tests/integration/settingsModal.spec.ts` — real-browser coverage of
  every scenario above.
