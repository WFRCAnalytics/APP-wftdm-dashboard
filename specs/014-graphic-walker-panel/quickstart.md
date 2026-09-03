# Quickstart: GraphicWalkerPanel

## Prerequisites

- New `package.json` dependency: `@kanaries/graphic-walker@^0.4.82` —
  pinned specifically (last React-18-compatible release, confirmed to
  include two named bug fixes `0.4.80` lacks — research.md §2, spec.md
  Assumptions). Confirm `npm install` resolves it against this project's
  existing `react`/`react-dom` `^18.3.1` with no peer-dependency warning
  before writing any component code — a real, not-hypothetical
  compatibility check, not just a version-string read.
- `apache-arrow` (`^18.0.0`) is already a dependency — no addition needed
  for field inference (research.md §5).
- No new fixture data — `dataset: trip_mode_share` already exists in
  `tests/fixtures/generate.py`'s `good` scenario output (research.md §8).
- `vite.config.ts` gains a `graphic-walker` `manualChunks` entry
  (research.md §9) before the dev/build bundle size becomes the thing
  under test — verify the chunk actually splits out (`npm run build`,
  inspect `dist/assets/` for a distinct `graphic-walker-*.js`) rather
  than assuming the `id.includes(...)` match works on the first try.
- Add a `type: graphic-walker` panel to a fixture dashboard config
  (e.g. `tests/fixtures/dashboard-config/dashboard-2-detail.yaml`,
  binding `dataset: trip_mode_share`) so the Playwright suite has a real
  panel to exercise.

## Manual verification (dev server, real browser)

1. Load a dashboard tab with the fixture `graphic-walker` panel. Confirm
   the free-form field list, chart-type picker, and encoding shelves
   render, populated with `trip_mode_share`'s own real column names — no
   chart pre-selected.
2. Drag a categorical column onto the x-shelf and a numeric column onto
   the y-shelf, pick a bar mark. Confirm a real chart renders from real
   fixture rows.
3. Open DevTools → Network, reload, repeat step 2's interactions several
   times. Confirm exactly one query against `trip_mode_share` fired at
   panel mount and no further DuckDB-WASM query fires from any
   subsequent field/shelf/mark interaction (FR-005 — snapshot model).
4. Change a global sidebar filter's value elsewhere on the same tab.
   Confirm the `graphic-walker` panel's own chart/field list is
   completely unaffected (FR-005) — unlike every other data-bound panel
   type on the same tab, which DO react.
5. Configure a second `graphic-walker` panel with a different `dataset:`
   value. Confirm each panel independently shows only its own dataset's
   columns/rows (FR-010).
6. With more than one scenario loaded and `scenario:` omitted, confirm
   the panel's field list includes a `scenario` field, and that dragging
   it onto color/facet groups the chart by scenario correctly (FR-004).
7. Set `scenario: <name>` on a panel config. Confirm its rows come from
   only that one scenario, with no `scenario` field present.
8. Build an in-progress chart, then trigger `004`'s expand control.
   Confirm the same in-progress chart is still showing, enlarged.
   Collapse it. Confirm it's still showing, back in the card.
9. Configure a `dataset:` naming a view that doesn't exist. Confirm
   `PanelErrorState` renders, not a blank panel or a thrown console
   error that breaks other panels on the tab.
10. Configure `scenario:` naming a scenario that isn't currently loaded
    (so the query resolves with zero rows). Confirm `PanelEmptyState`
    renders.
11. Inspect the rendered chart's own DOM node (or check
    `document.querySelectorAll('canvas')` vs `svg`) after building a
    typical bar/line/point chart from the fixture data. Confirm no
    WebGL-backed `<canvas>` appears — SVG/Canvas2D only (research.md §4's
    "verify empirically" item).

## Automated integration test scenarios (Playwright)

1. A `graphic-walker` panel renders `<GraphicWalker>`'s own field
   list/shelves/chart-picker UI, populated with the fixture dataset's
   real columns (US1, FR-002).
2. Dragging a field onto a shelf and picking a mark renders a real chart
   from already-fetched rows, with `services/duckdb.ts`'s
   `__debugQueryLog()` showing exactly one query for the whole panel
   lifecycle up to that point (US1, FR-002/FR-005).
3. Two panels with different `dataset:` values each show only their own
   columns/rows — no shared/leaked state (US2, FR-010).
4. Omitting `scenario:` with two fixture scenarios loaded produces a
   `scenario` field and a row count equal to the sum of both scenarios'
   own matching rows (US2 Scenario 3, FR-004).
5. Setting `scenario: <name>` restricts rows to that one scenario, with
   no `scenario` field present (US2 Scenario 4, FR-004).
6. Expand/collapse via `004`: assert the panel's mounted DOM subtree
   is the same node before and after — not a fresh mount — and
   any in-progress chart selection is still visually present afterward
   (US3, FR-008).
7. An unresolvable `dataset:`/`scenario:` combination shows
   `PanelErrorState`; a resolvable-but-empty one shows `PanelEmptyState`
   (FR-009).
8. A `config.fields` override changes the inferred `semanticType`/
   `analyticType` for exactly the named `fid`, leaving every other
   column's auto-inferred type unchanged (FR-007).
9. A dashboard tab combining all nine now-built panel types (the
   original eight plus `graphic-walker`) renders without error in a
   single load — the closing regression check for this project's
   originally-listed panel-type roadmap (SC-005).
10. Global sidebar filter changes elsewhere on the tab do not trigger any
    additional query from the `graphic-walker` panel (confirmed via the
    same `__debugQueryLog()` instrumentation as #2) — the concrete,
    assertable form of FR-005.
11. Unmounting a `graphic-walker` panel (a tab switch) disposes its
    `<GraphicWalker>` subtree via React's own normal unmount
    reconciliation — no leaked global `document`/`window` listeners
    accumulate across repeated mount/unmount cycles (research.md §3,
    found and fixed post-completion: the original
    `embedGraphicWalker`-based draft created an undisposable, independent
    React root).

## Run the unit tests

- `graphicWalkerFields.test.ts` (new) — `inferFields()`'s Arrow-type →
  `semanticType`/`analyticType` mapping (research.md §5's table) for
  int/float/utf8/date/timestamp/bool columns; a `config.fields` override
  entry replaces its matching `fid`'s inferred entry wholesale, leaving
  unrelated entries untouched; an override naming a `fid` absent from the
  actual query result is simply never applied (no error) — the query
  result, not the override list, defines which fields exist at all.
- `panelQuery.test.ts` (additions) — `buildGraphicWalkerQuery()` produces
  a `$scenario.<dataset>` template when `scenario:` is unset, and a
  literal `"<scenario>__<dataset>"` FROM-clause when it's set; `limit:`
  defaults to `100000` when omitted and otherwise appears verbatim in the
  generated `LIMIT` clause.

```bash
npm run typecheck
npx vitest run
npx playwright test
```
