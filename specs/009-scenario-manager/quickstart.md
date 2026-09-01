# Quickstart: Scenario Manager (local folder loading)

## Prerequisites

- Fixtures regenerated: `uv run python tests/fixtures/generate.py`
  (produces `tests/fixtures/scenarios/good_scenario/` — reused here as the
  local-folder-load fixture too; no new Python-side fixture data is
  needed for this feature).
- No new npm dependency — this feature uses only the browser's native
  `showDirectoryPicker()` API and already-installed `js-yaml`.
- Dev server: `npm run dev`, hosted on a non-`localhost` origin for manual
  testing of the WEB-mode path (e.g. via a local network IP or a deployed
  preview) — on plain `localhost` the control is hidden by design (FR-001).
  For automated tests, `isLocalDeployment()` is exercised directly rather
  than requiring a non-localhost Playwright `baseURL`.

## Manual verification (Chrome/Edge, non-localhost origin)

1. Load the dashboard. Confirm "Load Local Scenario" is visible near the
   tab bar.
2. Click it, pick `tests/fixtures/scenarios/good_scenario/` from the
   native dialog. Confirm the scenario appears in the loaded-scenario list
   as `good_scenario (ready)` (or its `manifest.yaml`-declared name).
3. Confirm an already-open, unpinned panel's data now includes the newly
   loaded scenario — without a page reload.
4. Confirm any panel with local UI state (e.g. a `TablePanel`'s sort/page,
   an `ObservablePlotPanel`'s `inputs:` selection) still shows that state
   unchanged after step 2 — this is FR-008's no-state-loss clause; a
   remount-based implementation would fail this check.
5. Click "Load Local Scenario" again, pick the same folder again. Confirm
   it re-registers cleanly (no duplicate entry, no error).
6. Click "Load Local Scenario", pick a folder whose `manifest.yaml`
   declares a `scenario_name` matching an already-published scenario
   (e.g. one from `public/scenarios/index.json`). Confirm the load is
   rejected with a visible message and the published scenario is
   untouched.
7. Remove the loaded local scenario via its list entry's `X` control.
   Confirm its data drops out of panel queries and every other scenario
   is unaffected.
8. On `localhost`, confirm the control does not render at all.

## Automated integration test scenarios (Playwright)

Per `research.md` §2 — a fake `window.showDirectoryPicker` injected via
`page.addInitScript()`, backed by real bytes read from
`tests/fixtures/scenarios/good_scenario/summary/*.parquet`:

1. Loading a valid local folder registers it, activates it, and an
   already-rendered unpinned panel's query results include its data
   without a reload.
2. **FR-008's core regression test**: a `TablePanel`'s search term and
   pagination survive a local-scenario load untouched — assert the
   **React state values** (search input's value, visible page number),
   not DOM-node identity: every panel type (established well before this
   feature) replaces its content with a loading skeleton on *any* refetch
   — `if (status === 'loading') return <skeleton/>` — including a
   legitimate filter-driven one, so the search `<input>`'s DOM node is
   destroyed/recreated on every refetch by design, unrelated to state
   loss. An earlier version of this scenario asserted DOM-node identity
   directly and failed even though the underlying values were, correctly,
   unchanged — corrected during implementation, not assumed here.
   Pair with a second scenario proving a *genuine* filter change still
   resets search/page as before — proves the fix's guard is selective
   (scenario-only refetches skip the reset), not simply disabled.
3. Loading the same folder twice re-registers cleanly, no duplicate entry.
4. Loading a folder whose name collides with a published scenario is
   rejected; the published scenario's views/metadata are provably
   untouched (re-query them, compare to their pre-attempt values).
5. Loading a folder with no `manifest.yaml` falls back to the folder's own
   name and still registers successfully.
6. Loading a folder with no `summary/` subfolder registers the entry but
   marks it `failed`, and does not activate it.
7. Two distinct local folders loaded in the same session are both active
   simultaneously; removing one leaves the other and every auto-discovered
   scenario unaffected.
8. Simulating `window.showDirectoryPicker` as `undefined` (unsupported
   browser) renders the control disabled with its explanatory tooltip, and
   every other dashboard capability still works.
9. Simulating `isLocalDeployment()`'s `localhost` condition hides the
   control entirely.

## Run the unit tests

- `manifestReader.test.ts` — valid manifest returns `{status: 'ok', ...}`;
  missing file returns `{status: 'missing'}` (not a throw); malformed YAML
  returns `{status: 'invalid', message}` (not a throw) **with a message
  string that actually reflects the parse error** — assert the two
  failure variants are distinguishable by `status`, not just that both are
  "falsy"/null-equivalent (the bug found during contract review — see
  `contracts/scenario-manager.md`'s header); partial manifest (some fields
  absent) parses the present ones under `status: 'ok'`.
- `scenarioManager.test.ts` (the pure decision logic only — collision
  classification, fallback-name selection — not the actual
  `showDirectoryPicker()` call, which is Playwright's concern per above):
  published-collision → `'collision'`; local-collision → proceeds;
  no-collision → proceeds.
- `appState.test.ts` (new) — `subscribe()` fires on
  `register`/`setStatus`/`setActive`/`unregister`; an unsubscribed
  callback stops firing. This part is plain pure logic (no React, no DOM),
  unlike the hook below — real Vitest coverage under `vitest.config.js`'s
  `environment: 'node'`.
- **No dedicated `useActiveScenarios.test.ts`.** `vitest.config.js`'s own
  header comment states its `environment: 'node'` is for "pure-logic unit
  tests only... no browser" — confirmed by `useFilterState.ts` (the
  established precedent this hook mirrors) having no unit test file of
  its own either, for the same reason: a `useSyncExternalStore`-based
  hook needs a real React renderer to exercise meaningfully, which this
  project's Vitest config deliberately doesn't provide. `useActiveScenarios`'s
  actual reactive behavior is verified the same way `useFilterState`'s
  is — indirectly, through the Playwright integration tests that exercise
  the panel components consuming it (scenario 2 above).

```bash
npm run typecheck
npx vitest run
npx playwright test
```
