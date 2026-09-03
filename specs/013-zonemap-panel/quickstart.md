# Quickstart: ZoneMapPanel

## Prerequisites

- No new `package.json` dependency (research.md §1, §8) — `maplibre-gl` and `d3-scale-chromatic` are both already installed.
- New fixture data needed, and of a kind this project has never had before (this project's first geometry fixture): `tests/fixtures/generate.py` gains a synthetic zone-boundary GeoParquet (~6-8 simple adjacent rectangular polygons, a hand-authored zone id per polygon — research.md §5) plus a `vmt_by_home_taz`-shaped metric table keyed to the same zone ids, including at least one zone id present in geometry but absent from the metric table (the "no data" treatment, FR-012) and at least one metric row whose zone id has no matching geometry (the excluded-row case, FR-012).
- `public/geometry/` is a new top-level published-asset directory (data-model.md); the fixture/dev dashboard config points a `type: zonemap` panel's `boundaries:` at the synthetic file published there.
- Run `INSTALL spatial; LOAD spatial;` at least once in a real browser session before relying on `ST_GeomFromWKB`/`ST_AsGeoJSON` — DuckDB-WASM's `spatial` extension is not bundled/autoloaded (research.md §2); `loadZoneGeometry()`'s own `ensureSpatialExtensionLoaded()` does this automatically, but a manual DuckDB-WASM console session (e.g. while iterating on the fixture) needs the same two statements run explicitly first.

## Manual verification (dev server, real browser)

1. Load a dashboard tab with a `type: zonemap` panel. Confirm every zone in the fixture geometry renders, shaded per its joined metric value.
2. Confirm a zone with no matching metric row (the fixture's deliberate "no data" case) renders with a visibly distinct treatment — not the color scale's minimum-value color, and not missing from the map.
3. Hover a zone. Confirm its zone id and value appear (research.md §6 — no deck.gl, plain MapLibre `mousemove`/`mouseleave`).
4. Change a bound global filter's value. Confirm the choropleth re-colors without the map flashing/resetting (pan/zoom position preserved).
5. Expand the panel via 004's trigger. Confirm the map fills the dialog correctly, with no distortion and no re-fetch.
6. Collapse it. Confirm it returns to correct card-sized rendering, and the choropleth is still correctly colored (research.md §9's `setData()`-after-relocation check).
7. Set the tab's `default_basemap:` (no panel-level `basemap:` override). Confirm the zonemap panel picks it up, and the choropleth fill is still visible and correctly colored on top of it (research.md §9's `transformStyle` layer-preservation check).
8. Configure a deliberately unreachable `basemap:`. Confirm the choropleth still renders (falls back to the blank background) — a basemap failure never blocks the panel's own data.
9. Configure a second zonemap panel with `comparison: diff` naming two fixture scenarios and a simple `expr` (e.g. `"b.vmt_per_capita - a.vmt_per_capita"`). Confirm it renders a diverging-scale choropleth of the computed difference.
10. Open the browser's DevTools Network tab and reload with a `zonemap` panel present. Confirm a real request to `extensions.duckdb.org` for the `spatial` extension occurs exactly once per session (research.md §2 — this is the CONFIRMED, expected, now-documented exception, not a bug to fix) and a real request to `public/geometry/<boundaries file>` occurs exactly once regardless of how many zonemap panels reference it (research.md §4's cache).

## Automated integration test scenarios (Playwright)

1. Rendered per-zone fill colors match a direct join + color-scale computation of the same fixture geometry + metric data, for both `color_scale: sequential` and `color_scale: diverging` (SC-001).
2. A zone with a value at the domain's non-zero geometric center does NOT render the scale's "neutral" midpoint color — the diverging midpoint is anchored at literal zero (User Story 3, Scenario 2, extending `005-table-panel`'s own established test).
3. `comparison: diff` renders the correct computed per-zone diff value on a diverging scale, matching a direct `b - a` computation of the fixture rows (SC-001); an unresolvable `a`/`b` scenario pair shows the shared error/empty state (User Story 3, Scenario 4).
4. Changing a bound global filter re-colors the choropleth via `setData()` — assert the underlying `maplibregl.Map`/`GeoJSONSource` are the same objects before and after (proves no instance recreation — SC-002).
5. Expand/collapse via 004: assert `map.getCanvas()` is the same DOM node before and after, the canvas's rendered dimensions reflect the dialog's larger size, and the choropleth fill is still present and correctly colored afterward — the `setData()`-survives-relocation check research.md §9 specifically calls for, not merely "looks fine."
6. A basemap `setStyle()` switch (tab `default_basemap:` present, or a manual theme toggle) leaves `zonemap-zones`/`zonemap-fill` present and correctly colored afterward (research.md §9's `transformStyle` check) — assert via `map.getStyle().layers` containing the expected layer id, not just a visual screenshot.
7. An unreachable/misconfigured basemap still renders the choropleth (SC-004).
8. A zero-row metric result and a rejected/unresolvable configuration (bad `boundaries`/`boundaries_id`/`metric_id`/`column`, or an unresolvable `comparison: diff` pair) each show the shared empty/error state, with no partially-initialized map instance left in the DOM (SC-006).
9. A metric row with no matching zone geometry is excluded; a zone with no matching metric row renders with the "no data" treatment (FR-012).
10. Multiple zonemap panels referencing the same `boundaries` file trigger exactly one `registerFileURL()`/geometry query, not one per panel instance (research.md §4's cache, Edge Cases).
11. A live network capture (mirroring `010`'s own zero-external-request base-style check, inverted here) confirms the `spatial` extension fetch to `extensions.duckdb.org` happens exactly once per session regardless of how many zonemap panels mount (research.md §2).
12. A dashboard tab combining all eight now-built panel types renders without error in a single load (SC-005).
13. A plain browser window resize (not a 004 transition) also resizes the map canvas correctly (FR-011).

## Run the unit tests

- `zonemapColor.test.ts` — sequential/diverging + domain color-mix() output matches `tableLogic.ts`'s own established formula exactly when `color_ramp` is omitted; a recognized `color_ramp` name resolves to the matching `d3-scale-chromatic` interpolator; an unrecognized name falls back to the token-derived default; `steps` quantizes into the correct discrete bands; out-of-domain values clamp to the nearest extreme; `value: null` returns the dedicated "no data" color, never the scale's minimum/zero color.
- `panelQuery.test.ts` (additions) — `buildComparisonDiffQuery()` substitutes `expr` verbatim (never evaluates it) and interpolates `a`/`b` as literal view-name prefixes with no upfront validation (research.md §7's correction) — an unresolvable pair is a query-time SQL failure, not a JS-side throw, so this is verified via the integration suite (T027), not a unit-test assertion.
- `zoneGeometry.test.ts` (the cache-key/mismatch-detection logic, isolated from the real DuckDB connection via a stubbed/mocked query path) — `resolveGeometryUrl()` mapping; repeat calls to `loadZoneGeometry()` with the same `boundaries` AND the same `boundariesId` return the same pending/resolved promise (the cache-hit path); a repeat call with the same `boundaries` but a DIFFERENT `boundariesId` rejects immediately with a descriptive error, without disturbing the original entry — a subsequent correctly-matching call still resolves normally (research.md §11, added after a real gap was caught in this contract's first draft — see `tests/unit/zoneGeometry.test.ts`, written now against the not-yet-implemented module).

```bash
npm run typecheck
npx vitest run
npx playwright test
```
