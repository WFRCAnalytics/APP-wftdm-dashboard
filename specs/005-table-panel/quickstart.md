# Quickstart: Validating TablePanel

**Feature**: `005-table-panel`

## Prerequisites

- `001`-`004` already in place — this feature adds a third panel type on
  top of `003`'s existing registry/`panelCard.tsx` and inherits `004`'s
  expand mechanism automatically.
- No new dependency, no `npm install` needed beyond what's already
  installed (research.md §1).
- Fixture data needs at least one `table`-typed panel exercising both a
  `columns:`-configured case and a no-`columns:` (derived) case, plus a
  result set large enough to exceed the default page size (20+ rows) to
  exercise pagination and cross-page search meaningfully — check whether
  `tests/fixtures/dashboard-config/`'s existing fixture files need a new
  panel entry or a new fixture file added as part of implementation
  (tasks.md's concern, not decided here).

## Run the unit tests

```bash
npm run test:unit -- tableLogic formatValue
```

Verifies `resolveColumns`/`sortRows`/`filterRows`/`cellColor` and the
extracted `formatValue` — all pure functions, no browser (research.md
§5). Specifically confirms:
- Columns resolve correctly both from `columns:` config and derived from
  a query result's own shape.
- Sorting a numeric column produces numeric order, not lexicographic.
- Search matches against rendered (formatted), not raw, values.
- The diverging color-scale midpoint is fixed at `0`, tested against an
  asymmetric domain specifically (not only symmetric ones) — the direct
  proof research.md §4's decision is actually implemented.

## Run the integration test

```bash
npm run test:integration -- tablePanel
```

Boots the app for real (Playwright, real DuckDB-WASM, fixture data) and
asserts:

1. A `table` panel with `columns:` configured renders exactly those
   fields, labeled/formatted/colored as configured.
2. A `table` panel with no `columns:` renders one column per field in the
   query result.
3. Clicking a column header re-sorts visibly, with no network activity.
4. A panel with `pagination: <n>` (or the default 20) shows only one
   page's rows at a time, with working pagination controls.
5. A panel with `searchable: true` finds a row that exists on a page
   other than the one currently displayed.
6. The panel gets `004`'s expand trigger with no panel-specific setup,
   and its sort/search/page state survives an expand → collapse round
   trip unchanged.
7. Loading/empty/error states render via the same `PanelEmptyState`/
   `PanelErrorState` components the other two panel types already use.

## Manually verify

```bash
npm run dev:fixtures && npm run dev
```

1. **Columns match config** — for a `columns:`-configured table panel,
   confirm headers show the configured `label`s (not raw field names),
   in the configured order.
2. **Formatting applied** — confirm any `format:`-configured column
   renders formatted values (e.g. `+.1%` shows a signed percentage), not
   raw numbers.
3. **Color scale renders, and stays legible** — for a `color_scale:
   diverging` column, confirm cells shade toward the app's existing blue
   (negative) or red (positive) brand tones, fading to neutral near zero
   — and that text in every cell, including the most strongly colored
   ones, is still readable (research.md §4's capped-blend decision).
4. **Sort works** — click a numeric column's header; confirm ascending
   order; click again, confirm descending; click a different column,
   confirm it resets to ascending on the new column.
5. **Pagination works** — for a table with more rows than the page size,
   confirm only one page renders at a time and pagination controls reach
   every row.
6. **Search finds off-page rows** — type a value known to exist only on
   a later page; confirm it appears in the filtered, re-paginated result.
7. **Expand inherits automatically** — confirm the table panel's card
   shows the same expand icon every other panel type has, with no visual
   or functional difference in how it opens/closes; confirm sort/search/
   page state is unchanged after closing and reopening the dialog.
8. **Visual consistency (SC-004)** — confirm the table panel's card uses
   the same border/shadow/spacing/typography tokens as every other panel
   card on the same tab — not framework-default table styling.

## Expected outcome

All of spec.md's SC-001 through SC-005 hold: a table panel renders
immediately on query resolution; sort is instant with no network
activity; a user can find any row in a large result set by search alone,
regardless of which page it's on; the panel is visually indistinguishable
in styling language from every other panel card; and it gains the
expand-to-large-view behavior with zero panel-specific implementation
work. The color-scale question spec.md flagged before planning is no
longer open — research.md §4's decision is implemented and directly
tested, not left for this feature's own code to improvise.
