# Quickstart: Validating the Data and State Layer Scaffold

**Feature**: `001-data-state-layer`

This slice has no UI. Validation means: run automated tests, and/or drive the
boot sequence from a browser console, and confirm the system reaches a
queryable "ready" state. See `contracts/` for the exact API being validated
and `data-model.md` for the entities referenced below.

## Prerequisites

- Node.js (LTS) and this repo's `package.json` installed (`npm install`) —
  created as part of this slice's implementation (no `package.json` exists
  yet at planning time).
- Test fixtures generated per `research.md` §2: `tests/fixtures/generate.py`
  run once via `uv run python tests/fixtures/generate.py` to produce the tiny
  observed + fixture-scenario Parquet files, `manifest.yaml`, and
  `public/scenarios/index.json` used by both test tiers.
- Playwright browsers installed (`npx playwright install`) for the
  integration tier.

## Run the unit tests (fast tier)

```bash
npm run test:unit    # vitest run
```

Covers, without a browser:
- `sqlExpander.js` — every placeholder kind expands; `'all'` filter omits its
  condition; an unresolved reference throws naming the specific placeholder
  (User Story 4, SC-004).
- `filterState.js` — subscribe/notify/unsubscribe semantics (User Story 5,
  SC-005).
- `yamlLoader.js` — runtime fetch+parse, error attribution on malformed YAML.

## Run the integration tests (real browser tier)

```bash
npm run test:integration   # playwright test
```

Serves the app (Vite preview or dev server) with the generated fixtures under
`public/`, then in a real browser:

1. **User Story 1** — load the app with no panel/layout code present; from
   the page context, call `query('SELECT 1')` (or equivalent) against the
   shared connection and assert it returns a result; assert the page never
   became unresponsive during `initDuckDB()` (e.g., a concurrent `requestIdleCallback`/interaction probe still fires).
2. **User Story 2** — after boot, assert `observed__summary_kpis` (or the
   fixture's equivalent view) is queryable and marked active; assert every
   name in the fixture's `public/scenarios/index.json` is independently
   queryable; assert the intentionally-broken fixture scenario does not
   prevent the others from being ready.
3. **User Story 3** — load the app with `?s=<fixture-scenario-name>` and
   assert exactly that scenario (plus nothing unexpected) ends up active;
   repeat with an unmatched `?s=` value and assert startup still completes.
4. **User Story 4** — feed the synthetic all-placeholder-types config fixture
   through `sqlExpander.expand()` in-page and assert the executed query
   against a registered view returns the expected row shape.
5. **User Story 5** — covered adequately by the unit tier; no browser-only
   behavior here, so no duplicate integration test is required.

## Manual/console spot-check (optional, matches the spec's own Independent Test framing)

```js
// In the browser devtools console, after the app has loaded:
await window.__wftdm.query('SELECT * FROM observed__summary_kpis LIMIT 1')
```

(`window.__wftdm` — or an equivalent debug hook — is an implementation detail
for `tasks.md` to define if useful; not a requirement of this spec.)

## Expected outcome

All of SC-001 through SC-007 hold: observed data queryable with zero setup,
published scenarios queryable within 5s, URL-driven scenario selection exact
and repeatable, placeholder expansion produces zero unresolved markers, filter
notification is 100%/0% correct, the full boot sequence completes and leaves
the system queryable with zero panel/layout code ever loaded, and one bad
scenario never reduces the others' success count.
