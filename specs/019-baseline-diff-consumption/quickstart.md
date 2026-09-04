# Quickstart: $baseline consumption across panel types

All scenarios below are fully automatable (Vitest for the pure query-builder/resolver/null-handling functions, Playwright for real per-panel-type reactivity) — no manual/real-hardware step, matching `018-baseline-scenario-designation`'s own precedent.

## Prerequisites

```powershell
npm run dev:fixtures
npm run dev            # or npx vitest / npx playwright test directly
```

## Scenario 1 — Absolute difference against `$baseline`, correctly resolved (User Story 1)

```ts
// tests/unit/panelQuery.test.ts
const sql = buildComparisonDiffQuery('trip_mode_share', 'abm_2026', 'base_tbm', ['mode'], 'b.share - a.share')
expect(sql).toContain('FROM "abm_2026__trip_mode_share" a')
expect(sql).toContain('JOIN "base_tbm__trip_mode_share" b ON a."mode" = b."mode"')
expect(sql).toContain('(b.share - a.share) AS diff_value')
```

```ts
expect(resolveComparisonScenarioName('$baseline', 'abm_2026')).toBe('abm_2026')
expect(resolveComparisonScenarioName('base_tbm', 'abm_2026')).toBe('base_tbm') // pass-through, unaffected
expect(resolveComparisonScenarioName('$baseline', undefined)).toBeUndefined()
```

**Done when**: the generated SQL correctly resolves `$baseline` on either side, and a real, running `plotly`/`table`/`observable-plot`/`zonemap` panel configured with `a: '$baseline'` shows correct per-row `diff_value`s against whichever scenario is currently baseline.

## Scenario 2 — Percent difference, zero-baseline degenerate case (User Story 2)

```ts
// Author's own expr, using the existing NULLIF idiom (research.md §6, spec FR-013):
const expr = "(b.value - a.value) * 1.0 / NULLIF(a.value, 0)"
```

Real integration check (Playwright, `tests/integration/tablePanel.spec.ts`): a fixture row whose baseline value is `0` renders `'N/A'` in that cell (not `Infinity`/`NaN`/the literal string `'null'`), with the dedicated "not computable" color — not the diverging scale's normal color range. A sibling row with a non-zero baseline renders a correctly computed percentage.

**Done when**: 0% of zero-baseline rows show anything other than the distinct "N/A"/dedicated-color state; non-zero-baseline rows are unaffected and correctly computed.

## Scenario 3 — One shared mechanism across all four panel types (User Story 3)

```ts
// The SAME buildComparisonDiffQuery() call, varying only which fixture
// metric/columns are used, produces a `diff_value` column consumed
// identically by plotly (y: diff_value), table (field: diff_value),
// observable-plot (y: diff_value), and zonemap (implicit — its own
// existing valueField branch already reads 'diff_value' literally).
```

**Done when**: a side-by-side read of all four panel types' own `comparison`/`compare_on` config confirms identical field names and shapes, and each produces `diff_value` the same way — confirmed by this shared function's own single, unified test suite rather than four separate ad-hoc query-builders.

## Scenario 4 — Baseline unresolved, then resolves (User Story 4)

```ts
// Real Playwright check: a $baseline-referencing panel, loaded before any
// non-observed scenario exists.
await expect(panelErrorState).toBeVisible() // FR-011 — no query attempted

// Load a real scenario (018's own automatic-default rule kicks in):
await loadAndWait(page, 'some_scenario')
await expect(panelErrorState).not.toBeVisible()
await expect(panelContent).toBeVisible() // recovers with no reload
```

**Done when**: the panel never attempts a query built from an unresolved baseline, and recovers automatically (FR-016's reactive dependency) the moment a baseline resolves.

## Regression check — `013-zonemap-panel`'s existing hardcoded-name tests (FR-005/SC-004)

```powershell
npx vitest run tests/unit/panelQuery.test.ts
npx playwright test tests/integration/zonemapPanel.spec.ts
```

**Done when**: every existing `comparison: diff` test (no `$baseline` involved) passes completely unchanged — confirmed via `research.md` §7's identity-transformation migration (the generalized `buildComparisonDiffQuery()` produces byte-for-byte identical SQL to the pre-existing zonemap-only version for these cases).

## Full regression

```powershell
npx tsc --noEmit
npx vitest run
npx playwright test
npm run build
```
