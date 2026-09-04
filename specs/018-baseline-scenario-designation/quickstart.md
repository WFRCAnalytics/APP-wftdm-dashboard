# Quickstart: Baseline scenario designation (foundation)

All scenarios below are fully automatable (Vitest for `appState.ts`/`sqlExpander.ts`, Playwright for `scenarioLoader.tsx`) — no real-hardware or manual step required, unlike `016-fix-ugrc-dark-mode`'s GPU-specific defect.

## Prerequisites

```powershell
npm run dev:fixtures   # copies tests/fixtures/* into public/{observed,scenarios,dashboard-config}
npm run dev            # dev server, or npx vitest / npx playwright test directly
```

## Scenario 1 — Explicit marking is mutually exclusive (User Story 1 / FR-001)

```ts
// tests/unit/appState.test.ts
import * as appState from '@/state/appState'

appState.register('a', { source: 'url' })
appState.register('b', { source: 'url' })
appState.setBaseline('a')
expect(appState.getBaseline()).toBe('a')

appState.setBaseline('b')
expect(appState.getBaseline()).toBe('b')   // moved

appState.setBaseline('b')
expect(appState.getBaseline()).toBe('b')   // idempotent re-mark
```

**Done when**: at no point does any sequence of `setBaseline()` calls leave `getBaseline()` ambiguous or pointing at more than one scenario — there is only ever one string result.

## Scenario 2 — Automatic default excludes `observed`, doesn't move (User Story 2 / FR-003, FR-004)

```ts
appState.register('observed', { source: 'url', pinned: true })
appState.setStatus('observed', 'ready')
expect(appState.getBaseline()).toBeUndefined()   // no real scenario yet

appState.register('abm_2026', { source: 'url' })
appState.setStatus('abm_2026', 'ready')
expect(appState.getBaseline()).toBe('abm_2026')  // first eligible, not observed

appState.register('base_tbm', { source: 'url' })
appState.setStatus('base_tbm', 'ready')
expect(appState.getBaseline()).toBe('abm_2026')  // default doesn't move
```

**Done when**: `observed` never appears as `getBaseline()`'s result unless a viewer explicitly `setBaseline('observed')`'d it themselves, and loading further scenarios never silently moves an already-resolved automatic default.

## Scenario 3 — Removing the explicit baseline falls back cleanly (User Story 3 / FR-005, FR-006)

```ts
appState.register('abm_2026', { source: 'handle' })
appState.setStatus('abm_2026', 'ready')
appState.register('base_tbm', { source: 'url' })
appState.setStatus('base_tbm', 'ready')

appState.setBaseline('base_tbm')
expect(appState.getBaseline()).toBe('base_tbm')

appState.unregister('base_tbm')             // the removed scenario WAS explicit baseline
expect(appState.getBaseline()).toBe('abm_2026')  // falls back to the automatic-default rule

// Removing a scenario that is NOT the current baseline is a no-op on baseline:
appState.setBaseline('abm_2026')
appState.register('extra', { source: 'handle' })
appState.setStatus('extra', 'ready')
appState.unregister('extra')
expect(appState.getBaseline()).toBe('abm_2026')  // unaffected
```

Also exercise via the real UI (Playwright, `tests/integration/scenarioLoader.spec.ts`): load a local scenario, mark it baseline via the new control, remove it via the existing `X` button, confirm the baseline badge moves to whichever scenario the automatic-default rule now selects (or disappears if none remain).

**Done when**: removing the current explicit baseline never leaves `getBaseline()` returning a name no longer in `appState.list()`, and the result after removal always matches Scenario 2's own automatic-default rule applied to what's left.

## Scenario 4 — `$baseline.<metric>` resolves correctly, fails clearly when unset (User Story 4 / FR-007–FR-009)

```ts
// tests/unit/sqlExpander.test.ts
const sql = sqlExpander.expand(
  'SELECT * FROM $baseline.trip_mode_share',
  EMPTY_SUMMARIZE_CONFIG,
  filterState,
  [],
  undefined,
  'abm_2026',            // 6th param — the resolved baseline scenario name
)
expect(sql).toBe('SELECT * FROM "abm_2026__trip_mode_share"')

// baseline changes — same template, different result:
const sql2 = sqlExpander.expand(
  'SELECT * FROM $baseline.trip_mode_share',
  EMPTY_SUMMARIZE_CONFIG,
  filterState,
  [],
  undefined,
  'base_tbm',
)
expect(sql2).toBe('SELECT * FROM "base_tbm__trip_mode_share"')

// unresolved baseline:
expect(() =>
  sqlExpander.expand('SELECT * FROM $baseline.trip_mode_share', EMPTY_SUMMARIZE_CONFIG, filterState, []),
).toThrow(/unresolved placeholder "baseline\.trip_mode_share/)
```

**Done when**: the expanded SQL text references exactly the correct `{scenario}__{metric}` view in every case, and an unresolved baseline fails with a clear, identifiable error rather than producing SQL referencing a nonexistent or empty view.

## Regression check (FR-010)

```powershell
npx vitest run tests/unit/panelQuery.test.ts
npx playwright test tests/integration/zonemapPanel.spec.ts
```

**Done when**: every existing `013-zonemap-panel` `comparison: diff` test still passes unchanged — this feature adds a second, additive way to reference a scenario; it does not touch `buildComparisonDiffQuery()` or any `a`/`b`-based test fixture.

## Full regression

```powershell
npx tsc --noEmit
npx vitest run
npx playwright test
npm run build
```

**Done when**: all four are clean — no existing `sqlExpander.expand()` call site (nine real call sites, verified in `research.md` §5) needs to change or breaks.
