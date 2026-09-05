# Quickstart: Validating auto-fit + reset-to-view

Prerequisites: `npm run dev:fixtures` (copies `tests/fixtures/` into
`public/`), then `npm run dev`. Uses this project's existing flowmap/zonemap
fixture panels — no new fixture data required unless a fixture with no
`center`/`zoom` configured doesn't already exist (check
`tests/fixtures/dashboard-config/*.yaml` first; add one only if genuinely
missing).

## Scenario 1 — Flowmap auto-fits (User Story 1)

1. Open a dashboard tab containing a flowmap panel whose YAML config has no
   `center`/`zoom` key.
2. **Expected**: once the panel's query resolves, the map animates
   (~800ms) into a view containing every flow's origin/destination point —
   not the static Wasatch Front default.
3. Confirm via the panel's own `data-flowCount`/`data-locationCount`
   instrumentation (already exposed, `FlowMapPanel.tsx`) that real data
   rendered, then visually confirm no flow endpoint sits outside the
   viewport.

## Scenario 2 — Zonemap auto-fits (User Story 2)

1. Open a dashboard tab containing a zonemap panel with no `center`/`zoom`.
2. **Expected**: once zone geometry loads, the map animates into a view
   containing the full boundary extent — independent of whether every zone
   has matching metric data.

## Scenario 3 — Author config wins outright (User Story 3)

1. Open a flowmap or zonemap panel with an explicit `center`/`zoom` in its
   YAML config, whose real data is visibly elsewhere on the map.
2. **Expected**: the map opens at exactly the configured `center`/`zoom` —
   no animation, no fit attempt at all.

## Scenario 4 — Reset control (User Story 4)

1. On either an auto-fitted or author-configured panel, manually pan/zoom
   (and, for zonemap, toggle 3D and rotate/tilt) away from the initial view.
2. Click the new reset control (home icon, same cluster as the zoom/compass
   controls, top-right).
3. **Expected**: a smooth transition back to the exact original view — the
   auto-fitted bounds, or the authored `center`/`zoom` — with pitch/bearing
   zeroed and (zonemap) 3D turned back off.
4. Before any data has loaded (reload the page and check immediately),
   confirm the reset control renders disabled — clicking it does nothing.

## Scenario 5 — No re-trigger (FR-006, SC-004)

1. On an auto-fitted flowmap or zonemap panel, pan away from the fitted
   view.
2. Expand the panel into its dialog view (004), then collapse it back.
3. Change an active filter or switch scenarios so the panel's underlying
   data/geometry genuinely changes.
4. Trigger a basemap switch (Settings → Basemap tab → Apply) or force a
   WebGL context loss/restore if testing that path.
5. **Expected**: after every one of steps 2–4, the camera stays exactly
   where the viewer left it after step 1 — no snap-back, no re-fit.

## Automated coverage (implementation-time — not run as part of this guide)

- `tests/unit/mapBounds.test.ts` (new) — `computeFlowBounds()`/
  `computeGeometryBounds()` against synthetic location/geometry arrays,
  including the empty-input `null` case and a degenerate single-point/
  single-polygon case.
- Extends `tests/integration/flowmapPanel.spec.ts` and
  `tests/integration/zonemapPanel.spec.ts` with the five scenarios above,
  using each file's own existing `__flowmapTestMaps`/`__zonemapTestMaps`
  registries to read `map.getZoom()`/`map.getCenter()` directly rather than
  relying on pixel-level visual assertions.
