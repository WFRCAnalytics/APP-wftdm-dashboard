# Contract: Test harness redesign

Governs `tests/global-setup.js`, `tests/global-teardown.js`, `scripts/copy-fixtures.js`, `tests/integration/_sharedFixtureLock.ts`, and the `package.json` test scripts. Enforces FR-009, FR-012 … FR-016, SC-002, SC-003, SC-007.

## `tests/global-setup.js` — after

MUST do, in order:

1. `cpSync(tests/fixtures/all-placeholders-config.yaml → public/all-placeholders-config.yaml)`. If the source file is missing → throw `[global-setup] Missing tests/fixtures/all-placeholders-config.yaml` (no `generate.py` mention).
2. (Design reversal) `dashboard-8-test.yaml` is now a PERMANENT entry in `index.json` — `global-setup.js` does NOT touch `index.json` at all. No `.original-during-tests` backup, no append.

MUST NOT:
- Reference `tests/fixtures/dashboard-config`, `tests/fixtures/observed`, `tests/fixtures/scenarios`, `tests/fixtures/geometry`, `generate.py`, or `uv run`.
- Touch `public/demo-scenarios/index.json`, `public/observed`, `public/scenarios`, `public/dashboard-config`, `public/geometry`.
- Blank any `index.json` to `[]`.

## `tests/global-teardown.js` — after

MUST do:
1. `rmSync(public/all-placeholders-config.yaml, { force: true })` — the only thing to undo.

MUST NOT reference any removed fixture dir or `public/demo-scenarios/index.json`.

## `scripts/copy-fixtures.js` + `npm run dev:fixtures` (FR-015)

**Resolved — removed outright.** `scripts/copy-fixtures.js` + the `dev:fixtures` npm entry are deleted. A `scripts/dev-test-tab.js` helper was briefly added and then also removed by the design reversal — `dashboard-8-test.yaml` is now a permanent `index.json` entry, so `npm run dev` shows it with no helper. Nothing manual depends on synthetic fixtures.

## `_sharedFixtureLock.ts` (FR-009, D-4)

- Delete `tests/integration/_sharedFixtureLock.ts`.
- Remove `acquire`/`release` (and the import) from `dashboardShell.spec.ts`, `sidebarNav.spec.ts`, `fullPagePanel.spec.ts`, `demoContentAllPanels.spec.ts`, `demoMultiScenario.spec.ts`.
- Remove each spec's own `beforeAll`/`afterAll` `index.json` rewrite; assert against the harness-provided 8-tab structure instead.
- If implementation finds one spec genuinely still needs a per-file `index.json` variant not expressible as a static `dashboard-8-test.yaml` panel: keep the lock for that spec only, with a comment stating why (the FR-009 escape hatch). Expected: not needed.

## `package.json` scripts

| Script | After |
|---|---|
| `pretest:integration` | **deleted** (FR-014) |
| `test:integration` | unchanged (`playwright test`) |
| `dev:fixtures` | deleted (or repurposed per above) |

## Concurrency statement (spec Edge Case)

`globalSetup`/`globalTeardown` run once per `playwright test` invocation, outside worker parallelism. The `index.json` mutation needs **no** cross-worker lock. The only hazard — two concurrent `npx playwright test` invocations against one tree — is caught fail-loud by the `index.json.original-during-tests`-already-exists guard. This is unchanged in kind from today's harness.

## Verification (SC-002, SC-003, SC-007)

```
grep -rE "fixtures/dashboard-config|good_scenario|broken_scenario" tests/ scripts/   # → no matches
test ! -e tests/fixtures/dashboard-config                                            # → true
test ! -e tests/fixtures/generate.py                                                 # → true
git grep -n "pretest:integration" package.json                                       # → no match
npm run test:integration                                                             # green, no pre-step, no uv
wc -l tests/global-setup.js tests/global-teardown.js                                 # → both smaller than before
```
