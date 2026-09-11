# T001 — Integration-suite baseline

## Original capture (superseded — kept for history)

Captured 2026-09-10 on branch `040-test-suite-migration` @ `50847d5` (clean
tree, no WIP), before any Phase 2 work: `350 passed, 8 failed (9.6 min)`.
Stale as of this update — Phase 2's own atomic cutover (T011: `git rm -r
tests/fixtures/dashboard-config tests/fixtures/observed tests/fixtures/
scenarios tests/fixtures/geometry`) has since landed, along with Phase 3
(US1) and features 041/042, all of which change the real numbers
materially. Superseded by the real, freshly-captured baseline below.

## Real baseline, re-captured resuming this feature (before T014)

Captured via a full, untruncated `npx playwright test --reporter=list`
run (single invocation, no concurrent `npx playwright test` process — the
earlier lesson this project's own history already records about
cross-invocation `global-setup`/`global-teardown` collisions on the
shared `index.json` files was deliberately respected here).

```
79 passed, 299 failed (11.5 min)
```

The 299 failures are genuine, reproducible, NOT a concurrency artifact —
confirmed directly: most are real `ENOENT` errors reading
`tests/fixtures/dashboard-config/index.json`, which T011 already deleted
entirely as part of Phase 2's own atomic cutover. This is exactly the
"Foundational (Phase 2) is an atomic cutover... immediately after it, the
integration suite is red for every not-yet-migrated fixture-coupled spec"
state this file's own tasks.md "Green-checkpoint reality" section already
predicted — not a new regression.

Per-file failure counts (every `[ ]`-still-open Phase 4-7 task's own spec
file, confirming tasks.md's checkbox state is accurate — no incidental
drift found anywhere):

| Spec file | Failures |
|---|---|
| `flowmapPanel.spec.ts` | 41 |
| `settingsModal.spec.ts` | 31 |
| `zonemapPanel.spec.ts` | 30 |
| `graphicWalkerPanel.spec.ts` | 29 |
| `observablePlotPanel.spec.ts` | 24 |
| `tablePanel.spec.ts` | 23 |
| `scenarioManager.spec.ts` | 16 |
| `panelExpand.spec.ts` | 16 |
| `valueBoxPanel.spec.ts` | 14 |
| `dashboardShell.spec.ts` | 14 (fixed by T014 — see below) |
| `sankeyPanel.spec.ts` | 11 |
| `markdownPanel.spec.ts` | 10 |
| `scenarioColorOverride.spec.ts` | 8 |
| `rechartsPanel.spec.ts` | 8 |
| `scenarioAutoActivation.spec.ts` | 6 |
| `sectionSubNav.spec.ts` | 5 |
| `scenarioLabelDisplay.spec.ts` | 5 |
| `boot.spec.ts` | 5 |
| `metricStrip.spec.ts` | 2 |
| `switchControlsUnpinnedPanels.spec.ts` | 1 |

Every already-`[x]`-marked-done file (`sidebarNav`, `demoContentAllPanels`,
`demoMultiScenario`, `fullPagePanel`, `testTabInvisibility`,
`brokenPanelStates`, `formInputPrimitives`) shows **zero** failures —
confirms no regression in already-completed Phase 3 work.

## After T014 (dashboardShell.spec.ts migration) — real, confirmed

A second full, untruncated, isolated run (again a single invocation, no
overlap):

```
91 passed, 285 failed (11.0 min)
```

Real delta: **+12 passed, −14 failed** (`dashboardShell.spec.ts`'s own 14
failures dropped to 0 — its real test count changed slightly during the
rewrite, 13 tests now, all passing in isolation too). Every OTHER file's
failure count is **byte-for-byte identical** to the pre-T014 run above —
confirms this was a clean, isolated fix with zero regressions anywhere
else in the suite.

## Effective green target

`91 + 285 = 376` real, current total. Getting the remaining Phase 4-7
tasks done (T024/T025 in particular — the two largest remaining files,
41 + 30 = 71 of the 285 current failures) is the path to
`baseline.md`'s own original "full green" goal — see `tasks.md`'s T024/T025
entries for the precise, confirmed (not guessed) scope each now needs.
