# Quickstart: Multi-sprite support in composeStyles()

Unlike `016-fix-ugrc-dark-mode`, every scenario below is fully
automatable — no real-hardware human verification step is required
for this feature (research.md §3, FR-007/SC-004).

## Prerequisites

- `npm run dev:fixtures` (copies `tests/fixtures/{observed,scenarios,
  dashboard-config,geometry}` → `public/`)
- A dev server or the Playwright `webServer` config already wired for
  this repo's integration suite

## Scenario 1 — Both UGRC panels' highway-shield icons resolve (US1)

1. Run `npx vitest run tests/unit/loadBasemapStyle.test.ts` — confirms,
   at the data level, that composing `LiteBase`+`LiteLabels` (and
   `OutdoorsBase`+`Outdoors_Labels`) produces a `sprite` array with one
   entry per layer, and that `LiteLabels`'/`Outdoors_Labels`' own
   highway-shield `icon-image` values are prefixed with their own
   layer's sprite id.
2. Run `npx playwright test tests/integration/flowmapPanel.spec.ts -g
   "UGRC"` — confirms, against the real UGRC endpoints and a real
   (headless is fine — research.md §3) MapLibre instance, that
   `map.hasImage('layer1:<icon name>')` returns `true` for each real
   highway-shield icon name confirmed present in research.md §1, for
   BOTH panels.

**Expected outcome**: SC-001 confirmed — both panels' highway-shield
icons are present and resolvable, zero `styleimagemissing` console
messages for these icon names.

## Scenario 2 — No regression to single/zero-sprite compositions (US2)

Run the existing composition tests unaffected in scope by this feature
(`Flowmap UGRC Vector Hybrid` — one raster layer with no sprite, one
vector layer with a sprite; `Flowmap Broken Composition Layer
(intentional)` — a failing composition, unrelated to sprites at all)
and confirm they still pass unchanged, plus the new single-sprite unit
test case (`tests/unit/loadBasemapStyle.test.ts`) confirming the
*rendered* icon is unaffected even though the *reference string* now
carries a prefix (FR-003/FR-004).

**Expected outcome**: SC-002/SC-003 confirmed — 100% of the existing
suite passes, and the single-sprite case is explicitly covered, not
just incidentally unbroken.

## Scenario 3 — The mechanism generalizes (US3)

Run the new synthetic two-sprite unit test (`tests/unit/
loadBasemapStyle.test.ts`, non-UGRC-specific fixture URLs, two
composed layers each declaring a distinct sprite with non-overlapping
icon names) and confirm both layers' own icons resolve to their own
sprite specifically — not the first one only.

**Expected outcome**: SC-005 confirmed — general, not hardcoded to the
two UGRC panels.

## Done when

- Scenario 1 passes — both real UGRC panels' highway-shield icons
  resolve, confirmed via `map.hasImage()`, no human verification step.
- Scenario 2 passes — zero regression to any existing single/zero-
  sprite composition.
- Scenario 3 passes — the mechanism is confirmed general via a
  synthetic, non-UGRC fixture.
- `npx tsc --noEmit` clean; `npm run build` clean.
