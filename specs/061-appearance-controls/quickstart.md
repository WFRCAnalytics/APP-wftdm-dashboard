# Quickstart: Appearance Settings Expansion

## Prerequisites

- `npm install` already run (no new dependency added by this feature —
  `d3-scale-chromatic`, `color`, `@radix-ui/react-slider`,
  `@radix-ui/react-popover`, `@fontsource-variable/geist(-mono)` are all
  already installed — research.md §§2, 4, 6).
- `npm run dev:fixtures` (for real dashboard-config/scenario fixture
  content, only needed if validating against fixture panels rather than
  the always-present demo content).

## US1 — Category color consolidation & colorblind-safe preference

1. `npm run dev`
2. Load a tab with at least one Sankey, one treemap/sunburst, and one
   pie or radar panel with no explicit `color_scheme:` configured (e.g.
   the Test tab, or any real demo tab).
3. **Expected**: all render using the same underlying default color set.
4. Open Settings → Appearance, enable "Prefer colorblind-safe palettes."
5. **Expected**: every one of those panels' colors visibly shift, live,
   to the `Set2` colorblind-safe set — no reload. A sibling panel with an
   explicit `color_scheme:` configured is unaffected.
6. Load a tab with an unpinned, multi-scenario chart (e.g. a `recharts`
   or `observable-plot` panel with `series: scenario` and no scenario
   color override/deployer palette configured).
7. **Expected**: with colorblind-safe mode on, that chart's default
   per-scenario colors also shift to `Set2`; a scenario with its own
   color override (Settings → Scenarios tab swatch) keeps that exact
   color regardless of the toggle.
8. Disable the toggle — confirm every affected panel reverts live.

## US2 — Text size

1. Open Settings → Appearance, find the text-size slider.
2. Drag it — confirm interface text (headings, panel titles, table
   content, form labels) resizes smoothly and immediately across the
   whole app, not just inside the Settings modal.
3. Drag to each extreme — confirm every control stays reachable and
   legible.
4. Reload the page — confirm the slider (and rendered text) is back at
   its default.

## US3 — Primary / Secondary / Accent colors

1. In `public/demo-dashboard-config/index.json`'s sibling config (or a
   local test fixture's `dashboard-config/index.json`), set
   `"primaryColor": "#1447e6"` (or any valid CSS color).
2. `npm run dev`, load the app with no viewer override set.
3. **Expected**: every `bg-primary`/`text-primary`/`border-primary`
   surface in the app (buttons, active nav state, etc.) reflects the
   configured color, with legible text automatically.
4. Open Settings → Appearance, click the Primary swatch, pick a different
   color via the picker (2D area, hue/alpha sliders, hex field, or RGB
   fields).
5. **Expected**: the whole app updates live to the viewer's own choice,
   overriding the deployer default from step 1.
6. Click "Reset to default" — confirm it reverts to the deployer-
   configured color from step 1, live.
7. Reload the page — confirm the viewer override from step 4 is gone
   (back to the deployer default), while the deployer default itself
   (from `index.json`) is still applied.
8. Repeat for Secondary and Accent independently.

## US4 — Fonts

1. Open Settings → Appearance, open the font picker for "Body."
2. Type or pick a real Google Font family name (e.g. "Merriweather").
3. **Expected**: body text across the app visibly switches to that font,
   live, with no reload; headings and monospace text are unaffected.
4. Open browser devtools → Network, disable network access (or use
   offline mode), then select a different body font.
5. **Expected**: the dashboard continues rendering body text legibly
   (falls through to the browser's own default sans-serif, then reverts
   to the self-hosted Geist default once cleared/reloaded) — no broken or
   invisible text anywhere.
6. Reload the page — confirm the font selection is gone (back to the
   self-hosted Geist default).

## Run the automated checks

```bash
npm run typecheck
npm run test:unit -- chartColor scenarioDisplay interfaceColor colorPreferenceState textSizeState fontPreferenceState googleFontLoader
npm run test:integration -- appearanceSettings categoryColorConsolidation
```

Expected: typecheck clean; all new/modified unit test files passing
(including `scenarioDisplay.test.ts`'s extended colorblind-safe cases);
new Playwright coverage passing with no regression in
`sankeyPanel.spec.ts`, `hierarchicalChart*.spec.ts`,
`pieChartPanel.spec.ts`, `radarChartPanel.spec.ts`, `settingsModal.spec.ts`,
or `scenarioColorOverride.spec.ts` — none of which this feature changes
the query/data behavior of, only (for the color-related specs) which
module their color values now resolve through.
