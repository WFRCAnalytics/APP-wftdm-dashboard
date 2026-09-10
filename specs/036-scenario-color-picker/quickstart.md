# Quickstart: Deployer Scenario Palette & Redesigned Color Picker

Validation scenarios to run once implementation lands. Each maps to an
acceptance scenario in `spec.md`.

## Prerequisites

```bash
npm run dev:fixtures   # copies tests/fixtures/{scenarios,dashboard-config,observed} into public/
npm run dev            # starts the Vite dev server
```

## Scenario 1 — Deployer palette applies consistently (US1, AC1)

1. Edit `public/dashboard-config/index.json` (or the fixture copy under
   `tests/fixtures/dashboard-config/index.json` before running
   `dev:fixtures`) to add `"scenarioPalette": ["#111111", "#222222"]`.
2. Reload with two active scenarios, no color override on either.
3. **Expect**: the first-registered scenario renders `#111111`, the
   second `#222222`, consistently across a Plotly, a Recharts, and an
   Observable Plot panel splitting by scenario.

## Scenario 2 — Shipped default with no deployer config (US1, AC2)

1. Remove `scenarioPalette` from `dashboard-config/index.json` entirely
   (or use a fresh fixture copy that never had it).
2. Reload with two scenarios, no override.
3. **Expect**: each renders one of `--chart-1`/`--chart-2` (inspect via
   `getComputedStyle()` — should match the token's real current value in
   whichever theme is active).

## Scenario 3 — Override still wins (US1, AC3)

1. With a deployer palette configured, set a viewer override on one
   scenario via the redesigned picker (Scenario 6 below).
2. **Expect**: that scenario ignores the palette entirely, rendering the
   override color everywhere.

## Scenario 4 — Palette wraps around (US1, AC4)

1. Configure a 2-entry `scenarioPalette`, activate 3+ scenarios.
2. **Expect**: the 3rd scenario reuses the 1st palette entry (index `2 %
   2 = 0`).

## Scenario 5 — Manifest color confirmed unconsulted (US1, AC5)

1. Inspect `window.__wftdm.appState.get('good_scenario').color` (still a
   real manifest-sourced hex, `035`'s own fetch unchanged) alongside that
   scenario's actual rendered color.
2. **Expect**: the two are independent — changing the fixture's own
   manifest `color` value has zero effect on what renders, once a
   deployer palette or the shipped default is in play.

## Scenario 6 — Picker: swatch, hex, RGB all synchronized (US2, AC1–3)

1. Open Settings > Scenarios, click a scenario's color swatch.
2. **Expect**: a popover opens with the 2D selection area, hue/alpha
   sliders, an eyedropper button, and hex/RGB fields, all reflecting the
   current effective color.
3. Type a hex code (`#ff0000`) into the hex field.
4. **Expect**: the 2D area's own indicator, the sliders, and the RGB
   fields all update to match (`255, 0, 0`); every chart showing that
   scenario updates immediately.
5. Change one RGB number field instead.
6. **Expect**: the hex field and every other surface update to match,
   identically to the hex-entry path.

## Scenario 7 — Reset to default (US2, AC4)

1. With an override set (Scenario 6 above), open the picker again and
   click "Reset to default."
2. **Expect**: the swatch, the picker's own fields, and every chart revert
   to the deployer/default-palette color immediately.

## Scenario 8 — Existing row controls unaffected (US2, AC5)

1. With the redesigned row, confirm the label input, baseline star,
   reorder up/down buttons, and remove button are all still present and
   functional, unchanged from `035`'s own behavior.

## Edge cases

- Type an incomplete hex (`#ff`) — confirm `colorOverride` does NOT
  update until a complete, valid value is entered.
- Type an RGB value like `300` into a numeric field — confirm it clamps
  to `255`.
- Configure a `scenarioPalette` entry that isn't a valid CSS color (e.g.
  `"not-a-color"`) — confirm it's skipped and rendering never breaks.
- Toggle Settings > Appearance between light/dark with no override and no
  deployer palette set — confirm the shipped-default-colored scenario's
  rendered color updates to match the new theme's `--chart-N` value, with
  no reload.

## Automated coverage

- `npm run test:unit` — extended `tests/unit/scenarioDisplay.test.ts`.
- `npx playwright test tests/integration/scenarioColorOverride.spec.ts
  tests/integration/settingsModal.spec.ts` — real-browser coverage of
  every scenario above.
