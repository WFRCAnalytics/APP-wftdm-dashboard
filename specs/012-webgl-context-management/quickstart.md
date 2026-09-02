# Quickstart: WebGL Context Management for Multi-Map Dashboards

Validation scenarios proving this feature end-to-end. Extends
`tests/integration/flowmapPanel.spec.ts`'s existing real-browser pattern
(real DuckDB-WASM, fixture Parquet, `dashboard-3-basemaps.yaml`'s
existing six-panel "Basemaps" fixture) rather than a separate test file
— same panel type, same fixture boot sequence 011 already established.

## Prerequisites

```bash
npm run build              # production build — REQUIRED for Scenario 2's
                            # capacity claim (research.md §5: StrictMode's
                            # dev-only 2x effect double-invocation would
                            # otherwise distort the measured context count)
npm run preview             # or equivalent static-serve of dist/
npm run test:unit           # no new unit-testable pure logic this feature
                             # adds (the layerRepopulateGeneration counter
                             # and context-loss handling are effect-
                             # internal, not extracted pure functions) —
                             # existing 011 unit tests
                             # (resolveEffectiveBasemap, loadBasemapStyle)
                             # must still pass unmodified, proving this
                             # feature didn't regress that logic
npm run test:integration    # Playwright, real browser, against the
                             # production build for Scenario 2 specifically
```

## Scenario 1 — Interleaved overlay survives a light/dark theme switch (US1 regression floor, research.md §2 — GATING)

This is an **update to 011's own existing empirical-survival test**
(`tests/integration/flowmapPanel.spec.ts`'s "US1: setStyle()/MapboxOverlay
empirical survival" block), not a new parallel test — confirmed against
the real file that this test's own `canvas#deckgl-overlay` locator no
longer matches any element once `interleaved: true` ships
(`contracts/interleaved-overlay-survival.md`'s "Existing 011 test must be
updated" section has the full before/after). Full assertion list there;
summarized here as the quickstart checklist:

- [ ] `canvas.maplibregl-canvas` (the ONE canvas that now exists — no
      separate `canvas#deckgl-overlay` to check) is the same DOM node
      before/after the theme flip.
- [ ] `data-render-count` after the flip equals `data-render-count`
      before the flip **plus exactly one** (not unchanged — a repopulate
      is now required and expected; not more than one — no redundant
      extra repopulate) — a corrected, stronger version of 011's own
      original "unchanged" assertion.
- [ ] `data-flow-count`/`data-location-count` are byte-for-byte unchanged
      (the underlying data itself was never re-fetched — 011's original
      intent, still true and still asserted).
- [ ] `overlay.props.layers.length === 1` after the flip (via
      `window.__flowmapTestOverlays`) — proves the
      `layerRepopulateGeneration`-triggered data-update-effect re-run
      actually happened, not left at the pre-`style.load` empty state.
- [ ] `canvas.maplibregl-canvas` is not blank after the flip
      (`getImageData` non-uniformity check) — proves the re-populated
      layer is actually drawing, not just technically present in
      `overlay.props`.
- [ ] A programmatic `map.panTo()` still fires a real `'moveend'`.
- [ ] Zero console messages matching `/duplicate|already exists/i`
      across the flip.

If any assertion fails: apply `contracts/interleaved-overlay-survival.md`'s
documented fallback (a short delay or `'idle'`-event-adjacent re-populate
instead of `style.load` directly) and re-run before proceeding — gating,
not a nice-to-have, same discipline `011`'s own Scenario 2 established.

## Scenario 2 — Every panel on the existing 6-panel fixture renders a working basemap, in a production build (US1, SC-001 — GATING)

1. `npm run build && npm run preview` (or equivalent) — **not** `npm run
   dev`, per the Prerequisites note above.
2. Load `dashboard-3-basemaps.yaml`'s "Basemaps" tab (all 6 existing
   panels: Tab Default Basemap, Panel Basemap Override, Raster Provider
   Preset, Unreachable Basemap, UGRC Composition, Broken Composition
   Layer).
3. For each of the panels expected to succeed (all but the two
   intentionally-broken ones, whose correct behavior is still 011's own
   documented `BLANK_STYLE` fallback, unchanged by this feature): assert
   a real, non-blank basemap renders (same `getImageData` non-uniformity
   check as Scenario 1) and `contextLost` is `false` for every one of
   them.
4. Assert zero browser console warnings matching `/too many active
   webgl contexts/i` across the whole page load — the literal, real
   Chromium warning string this feature's own bug investigation
   confirmed (research.md's prior-session finding), now expected to
   never fire for this fixture's real panel count under interleaved
   mode's halved cost.

## Scenario 3 — Expand/collapse never regresses a working basemap (US3, FR-004)

1. On the same 6-panel Basemaps tab, expand one panel into 004's dialog
   view.
2. Assert its basemap and `FlowmapLayer` remain visible inside the
   dialog (same canvas-node-identity + non-blank pixel check).
3. Collapse it back.
4. Assert every one of the 6 panels — the one just collapsed, and every
   other one — still renders correctly (no side effect from one panel's
   expand/collapse cycle on its siblings' own contexts/state).

## Scenario 4 — A lost context shows an honest, distinct status (US2, SC-002)

Full assertion list in `contracts/context-loss-detection.md`; summarized:

- [ ] Forcing a real context loss (`WEBGL_lose_context.loseContext()`,
      not a synthetic DOM event) on one panel shows the distinct
      "Map context lost" banner, while the panel's own container `<div>`
      stays mounted (element-handle identity check).
- [ ] That banner is visibly and textually different from 011's own
      "unreachable basemap" fixture panel (which shows no banner — a
      genuinely blank canvas, per 011's documented, unchanged fallback).
- [ ] Calling `WEBGL_lose_context.restoreContext()` on the same panel
      clears the banner, and the panel's correct effective basemap
      (whichever one that fixture panel resolves to per 011's own
      precedence) is visibly present again.

## Scenario 5 — A pinned basemap recovers to itself, not the app default (Edge Cases, FR-006)

1. Using the fixture's "Panel Basemap Override" panel (an explicit
   `basemap:` pin, per 011's own fixture), force a real context loss
   (Scenario 4's mechanism) then restore it.
2. Assert the recovered style is still the SAME pinned preset — not the
   app's theme-paired default — proving `resolveEffectiveBasemap()`'s
   existing three-level precedence (011, unchanged by this feature) is
   correctly what the recovery path relies on (research.md §6, MapLibre's
   own already-restored style plus the `layerRepopulateGeneration`-
   triggered data-update-effect re-run), not silently bypassed.

## Scenario 6 — Existing 011 scenarios still pass, Scenario 2 UPDATED not skipped

Re-run 011's own `quickstart.md` Scenarios 1, 3, 4, 5, 6, 7 (default
theme pairing, precedence, pin-no-repair, raster preset, UGRC
composition, offline fallback) against this feature's changed
`FlowMapPanel.tsx` **unmodified** — none of that logic changed, only how
the overlay draws and how style-load/context-loss events are handled
around it; this scenario is the explicit regression check FR-005
requires, not assumed passing because the diff "looks additive." 011's
own Scenario 2 (the empirical `setStyle()`/`MapboxOverlay` survival test)
is deliberately excluded from this "unmodified" list — it's the same
test this document's own Scenario 1 above updates in place (not a
separate, still-passing-as-written test to merely re-run); running it
literally as 011 wrote it would fail, for the confirmed, expected reasons
Scenario 1 above and `contracts/interleaved-overlay-survival.md` both
document (no `canvas#deckgl-overlay` element exists under interleaved
mode; `data-render-count` legitimately increments by one across a theme
switch now).
