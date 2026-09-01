# Quickstart: Validating SankeyPanel

**Feature**: `008-sankey-panel`

## Prerequisites

- `001`-`007` already in place — this feature adds the sixth and final
  originally-listed panel type on top of `003`'s existing registry/
  `panelCard.tsx` and inherits `004`'s expand mechanism automatically.
- New dependencies (research.md §1): `d3-sankey` (`^0.12.3`) and
  `d3-scale-chromatic` (`^3.1.0`, already present transitively via
  `@observablehq/plot`'s own `d3` dependency, but declared explicitly here
  rather than relied on as a phantom dependency), plus `@types/d3-sankey`
  (`^0.12.5`) and `@types/d3-scale-chromatic` (`^3.1.0`) as devDependencies
  — neither library ships its own TypeScript types. `npm install` required.
  `d3-sankey` pulls its own nested `d3-array`/`d3-shape` copies (older
  majors than this repo's existing `d3@7.9.0`-derived copies) — real, small
  duplicate-code bundling, not a version conflict; no action needed beyond
  awareness (research.md §1).
- No shared/existing module is modified this time (unlike 007's
  `DataBoundPanelConfigBase.filter` widen or `sqlExpander.ts`'s `inputs`
  addition) — `layout/types.ts`'s `PanelConfig` union gains one new member
  additively, and `panels/registry.tsx` gains one new entry. Verify both
  still typecheck after the addition, same baseline check every prior panel
  type feature has done.
- Fixture data needs at least one `sankey` panel exercising: a metric whose
  query result has distinct `source`/`target`/`value`-mappable columns,
  including rows where the mapped `source` and `target` values are equal
  (the corrected "no self-loop" case, research.md §4 — this must render as
  a normal link between two distinct same-labeled nodes, not be dropped),
  reactive to the existing global `purpose` filter (or similar), plus at
  least one row with a non-positive mapped value (to exercise the
  `excludedCount`/`console.warn` path, research.md §5). Reusing this
  project's existing `tour_mode_to_trip_mode`-shaped fixture data
  (`docs/GRAMMAR.md`'s own worked example) is the natural fit — check
  `tests/fixtures/generate.py`/`dashboard-config/dashboard-1-summary.yaml`
  for what to add (tasks.md's concern, not decided here).

## Run the integration test

```bash
npm run test:integration -- sankeyPanel
```

Boots the app for real (Playwright, real fixture data, real DuckDB-WASM
query) and asserts:

1. A sankey panel's rendered nodes/links match a `GROUP BY source, target` /
   `SUM(value)` aggregation of the same fixture query result (SC-001) —
   including confirming a same-value row (e.g. `tour_mode == trip_mode ==
   "SOV"`) produces two distinct visible nodes and a real link between them,
   not an excluded/missing row (the corrected self-loop reasoning,
   research.md §4).
2. Changing the global filter a sankey panel's `filter:` map references
   re-queries and re-renders only the affected diagram's data, without a
   full page reload (SC-002).
3. Expanding a panel via `004`'s dialog produces a correctly proportioned
   diagram on both ends of the transition (not stretched/clipped/
   stale-sized), with **zero** additional query fired solely by that
   transition — verified via the same `data-render-count`-style
   instrumentation 007 used to prove its ResizeObserver guard actually
   prevents a duplicate rebuild (research.md §3).
4. A deliberately broken panel config (a `source`/`target`/`value` column
   name absent from the query result) renders `PanelErrorState`, not an
   unhandled exception (SC-004).
5. A `color_scheme: Tableau10` panel shows node/link colors matching
   `d3-scale-chromatic`'s real `schemeTableau10` values; a panel with
   `color_scheme` omitted shows colors matching the token-derived fallback
   palette instead (research.md §6) — both checked against real rendered
   `fill`/`stroke` attribute values, not just "some color is present."
6. A fixture row with a non-positive mapped `value` is excluded from the
   rendered diagram, and triggers exactly one `console.warn` mentioning the
   excluded count — captured via Playwright's `page.on('console', ...)`,
   not just inferred from the diagram's absence of that link (research.md
   §5).
7. A dashboard tab combining all six built panel types (`valuebox`,
   `plotly`, `table`, `markdown`, `observable-plot`, `sankey`) renders
   without error in a single load (SC-005).
8. **Filter change without any resize** (regression coverage for the
   `useRef`-vs-local-variable resize-guard bug found and fixed in
   `contracts/sankey-panel.md`): change a bound global filter's value while
   the panel's container size stays fixed, and confirm the diagram's
   *rendered content* actually changes (different node labels/link
   widths/`path` attribute values before vs. after) — not merely that a
   new query fired. A guard that persists across the component's lifetime
   would pass a weaker "a query re-ran" assertion while still silently
   failing to redraw; this test must inspect the rendered SVG itself.

## Run the unit tests

```bash
npm run test:unit -- sankeyGraph
```

Exercises `panels/sankeyGraph.ts`'s `buildFlowGraph`/`layoutFlowGraph` (and
`panels/sankeyColor.ts`'s `resolveNamedColorScheme`) directly, with no DOM
— `environment: 'node'` is sufficient (research.md §2/§7, confirmed
`d3-sankey`'s own layout computation touches no DOM API). At minimum:

- `buildFlowGraph` produces two distinct nodes (not one) for a same-value
  row, with the correct `side` on each (research.md §4's namespacing —
  the single most important behavior this module has to get right).
- `buildFlowGraph` sums `value` across duplicate (source, target) pairs
  rather than producing duplicate links.
- **Regression coverage for the link-key aggregation bug found and fixed in
  `contracts/sankey-panel.md`**: `buildFlowGraph` given rows spanning 3+
  distinct nodes on the `source` side and 3+ on the `target` side —
  including at least one raw source/target value containing a space (e.g.
  `"Drive to Transit"`) — asserts each resulting link's `sourceId`/
  `targetId` *exactly* match the correct originating node ids, not just
  that the aggregate link `value`s are correct. A key-encoding bug that
  silently misaligns which node a link actually points to would still
  produce numerically-correct total values, so an assertion that only
  checks `value` would not catch it — this test must check identity.
- `buildFlowGraph` excludes non-positive-`value` rows and reports the
  correct `excludedCount`.
- `layoutFlowGraph` throws a real `Error` for a graph deliberately
  constructed to be cyclic (bypassing `buildFlowGraph`'s own namespacing to
  prove the defensive catch has something real to catch — research.md §4's
  "structurally unreachable through valid config, but still caught"
  reasoning needs a test that actually exercises the catch, not just an
  assumption it would work).
- `resolveNamedColorScheme('Tableau10')` returns the real, correct 10-color
  array; an omitted or unrecognized name returns `undefined` (the caller's
  fallback signal).

## Manual check

1. `npm run dev`, load a dashboard tab containing the sankey panel above.
2. Confirm nodes/links render, colored per `color_scheme` (or the
   token-derived fallback if omitted), with hover/labels legible.
3. Resize the browser window — confirm the diagram relayouts to the new
   size without distortion (not just a scaled/stretched SVG).
4. Expand the panel via its `004` dialog trigger, confirm the diagram
   redraws correctly sized with no visible re-fetch flicker; collapse and
   confirm it returns to the inline card correctly sized too.
5. Open dev tools' console before interacting — confirm no `console.warn`
   fires for a normally-configured panel with no non-positive-value rows,
   and does fire (once, with a sensible message) for one that has some.
