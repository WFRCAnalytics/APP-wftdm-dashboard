# Quickstart / Validation: Test-suite migration

Runnable checks that prove the feature works end to end. Run from repo root.

## Prerequisites

- `npm ci` done.
- No Python / `uv` needed (that dependency is removed by this feature).
- No concurrent `npx playwright test` invocation against this tree (harness mutates `public/demo-dashboard-config/index.json` once per run).

## V-1: Production build shows exactly 7 tabs (SC-001, FR-002)

```
npm run build:pages
npx serve -p 5055 -L <tmp>   # with docs/ copied to <tmp>/APP-wftdm-dashboard/
# open http://localhost:5055/APP-wftdm-dashboard/
```

Expected: sidebar has **7** tabs (Summary, Person & Households, Tour, Mode Choice, Trip, Network, Explore). **No** "Test" / 8th tab. Browser console: no data 404s.

Also: `git show HEAD:public/demo-dashboard-config/index.json` — the `dashboards` array has 7 entries, no `dashboard-8-test.yaml`.

## V-2: Test run adds the 8th tab and covers error states (FR-003, FR-004, SC-004)

```
npm run test:integration
```

While running (or via a focused spec): the app boots with an 8th "Test" tab; its panels render error/empty states per `contracts/dashboard-8-test.md` (missing-metric → "Couldn't load…", `chart_type: pie` → validation error, unreachable basemap → blank style with data still drawn, XSS markdown → sanitized, zero-row filter → empty state).

After the run: `public/demo-dashboard-config/index.json` is back to 7 entries; no `index.json.original-during-tests` left on disk; no `public/all-placeholders-config.yaml`.

## V-2b: The 8th tab's sidebar entry is blank (FR-019 – FR-021, SC-008)

With the test tab registered (a focused `sidebarNav.spec.ts` run, or `npm run dev` after manually appending `dashboard-8-test.yaml` to `public/demo-dashboard-config/index.json`):

- The sidebar has an 8th entry, but it shows **no icon** and **no readable label** — visually an empty slab, not a polished nav item.
- `getByRole('tab', { name: 'Test' })` resolves exactly one element; it is focusable and clicking/Enter activates the tab.
- Collapse the sidebar rail → the entry shows nothing at all (no icon to fall back on).
- The seven real entries are unchanged (real icons, real labels).

## V-3: No pre-step, no synthetic data (SC-003, FR-018)

```
git clean -xdn public/               # dry run — confirm nothing under public/ needed
npm run test:integration             # from a clean checkout
```

Expected: passes with **no** `uv run python tests/fixtures/generate.py`, **no** `npm run dev:fixtures`. `package.json` has no `pretest:integration`.

## V-4: Fixture machinery fully gone (SC-002, SC-007)

```
test ! -e tests/fixtures/dashboard-config      && echo OK
test ! -e tests/fixtures/generate.py           && echo OK
test ! -e tests/fixtures/observed              && echo OK
test ! -e tests/fixtures/scenarios             && echo OK
test ! -e tests/fixtures/geometry              && echo OK
test ! -e tests/integration/_sharedFixtureLock.ts && echo OK
grep -rE "fixtures/dashboard-config|good_scenario|broken_scenario" tests/ scripts/   # → nothing
```

`tests/global-setup.js` / `global-teardown.js`: fewer lines than before; no reference to `dashboard-config`, `generate.py`, `observed`, `scenarios`, `geometry`, or `demo-scenarios/index.json`.

`tests/fixtures/` retains only `all-placeholders-config.yaml`.

## V-5: Per-phase green (SC-006, FR-017)

After each phase (0 → 1 → 2 → 3):

```
npm run test:integration     # green
npm run typecheck            # clean
```

Phase 0 additionally: `tests/fixtures/dashboard-config/` is fully deleted (not half-removed).

## V-6: Real values asserted, not synthetic (FR-007, SC-005)

Spot-check a migrated spec (e.g. `valueBoxPanel.spec.ts`): it asserts `5,000` / `15,212` (real baseline KPIs, RF-5), not the retired `1,500` / `9,200`. `scenarioColorOverride.spec.ts` asserts `#59A14F` (real manifest color), not a fixture constant.

## Cross-references

- Panel-by-panel error inventory: [contracts/dashboard-8-test.md](./contracts/dashboard-8-test.md)
- Harness before/after: [contracts/test-harness.md](./contracts/test-harness.md)
- Per-spec targets & phases: [contracts/spec-migration.md](./contracts/spec-migration.md)
- Real demo values: [data-model.md](./data-model.md) E-3
