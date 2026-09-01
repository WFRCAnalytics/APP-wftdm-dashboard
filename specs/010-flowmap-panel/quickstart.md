# Quickstart: FlowMapPanel

## Prerequisites

- Install the four new dependencies: `npm install maplibre-gl@^4.7.1
  @deck.gl/core@^9.0.0 @deck.gl/layers@^9.0.0 @deck.gl/mapbox@^9.0.0
  @flowmap.gl/layers@^9.3.0` — no new devDependencies (research.md §1).
- New fixture data needed: `tests/fixtures/generate.py` gains an
  `od_flows`-shaped table with `orig_taz`/`orig_lat`/`orig_lon`/
  `dest_taz`/`dest_lat`/`dest_lon`/`trips` columns (matching the
  corrected `docs/GRAMMAR.md` grammar), including at least one duplicate
  (origin, destination) pair (summing coverage), one row with a
  non-positive `trips` value, and one row with a missing/null coordinate
  (exclusion coverage) — mirroring `008-sankey-panel`'s own
  `TOUR_MODE_TO_TRIP_MODE_ROWS` fixture-design discipline.
- `vite.config.ts`'s `manualChunks` gains a new entry for this feature's
  map libraries — checked the real current file (not `CLAUDE.md`'s own
  aspirational `vite.config.ts` sketch, which names a `maplibre` chunk
  that doesn't actually exist yet): today it only splits `duckdb` and
  `plotly` (the `plotly` entry's own comment: "split... unimplemented
  until now since nothing depended on it before this feature" — the same
  situation this feature is now in for `maplibre-gl`/`@deck.gl/*`/
  `@flowmap.gl/layers`). Exact chunk boundary (one combined chunk vs.
  split per package) is a planning/implementation-time call, not fixed
  here.

## Manual verification (dev server, real browser)

1. Load a dashboard tab with a `type: flowmap` panel. Confirm a map
   renders (a plain gray background — no basemap tiles, per research.md
   §9 — with visible flow lines connecting fixture locations).
2. Confirm flow line widths visually correspond to their `value` —
   the heaviest fixture flow should be visibly thicker than the
   lightest.
3. Change a bound global filter's value. Confirm the flow lines update
   without the map flashing/resetting (pan/zoom position preserved).
4. Expand the panel via 004's trigger. Confirm the map fills the dialog
   correctly, with no distortion and no re-fetch.
5. Collapse it. Confirm it returns to correct card-sized rendering.
6. Resize the browser window. Confirm the map canvas resizes to match.
7. Open the browser's DevTools Network tab and reload. Confirm zero
   requests to any tile server or external map-style host (research.md
   §9 — the base style is entirely self-contained).

## Automated integration test scenarios (Playwright)

1. Rendered locations/flows match a direct `GROUP BY origin, destination`
   / `SUM(value)` aggregation of the same fixture query result (SC-001).
2. Changing a bound global filter updates the flow lines (assert via the
   `MapboxOverlay`'s layer data, or a `data-*` attribute the layer's
   rendered picking info exposes) without a full page reload and without
   the map's canvas element being replaced (proves no instance
   recreation — SC-002).
3. **The FR-009 relocation-survival test the user specifically
   required** (research.md §3): expand a flowmap panel via 004's trigger
   and assert (a) `map.getCanvas()` is the same DOM node before and after
   the expand (proves no remount/recreation), (b) the canvas's rendered
   dimensions reflect the dialog's larger size (proves resize handling
   composes with the relocation), and (c) the map remains interactive
   afterward (a programmatic pan or a real pointer drag still produces a
   `moveend` event) — not merely that the panel "looks fine," which
   wouldn't catch a broken-but-still-painted-last-frame WebGL context.
4. Collapsing the panel returns it to correct card-sized rendering with
   zero re-fetch (SC-003).
5. A zero-row query result and a rejected/unresolvable configuration
   each show the shared empty/error state, with no partially-initialized
   map instance left in the DOM (SC-004).
6. A dashboard tab combining all seven now-built panel types renders
   without error in a single load (SC-005).
7. Duplicate (origin, destination) rows sum into one flow line, not
   duplicate overlapping lines.
8. A row with a non-positive `value` or a missing coordinate is excluded
   and logs exactly one scoped `console.warn` with the excluded count
   (research.md §5).
9. A plain browser window resize (not a 004 transition) also resizes the
   map canvas correctly (FR-008's second half).
10. **The `mapReady` race test the user specifically required**
    (research.md §11): set `window.__flowmapTestMapReadyDelayMs` to a
    real delay (e.g. 1000ms) via `page.addInitScript()` before
    navigation, deterministically forcing the data-fetch effect's query
    to resolve well before the map finishes initializing — not hoping
    real-world timing happens to cooperate. Assert the panel still ends
    up with `data-render-count`/`data-flow-count` reflecting the real
    fixture data once the artificial delay elapses (`expect.poll`, not a
    raw sleep-then-check) — proving the data-update effect actually
    re-runs once `mapReady` flips true, not stuck permanently empty from
    an early return with no re-trigger.

## Run the unit tests

- `flowmapData.test.ts` — location dedup by id (first-seen coordinates
  win); duplicate-pair summing; non-positive-value exclusion; missing-
  coordinate exclusion; `excludedCount` accuracy; the link-key regression
  test (multi-word ids, mirroring `008-sankey-panel`'s own regression
  test for the class of bug it caught — asserting exact `origin`/`dest`
  per flow, not just aggregate values).

```bash
npm run typecheck
npx vitest run
npx playwright test
```
