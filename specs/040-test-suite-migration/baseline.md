# T001 — Integration-suite baseline

## History (superseded captures — kept for record)

- 2026-09-10, before any Phase 2 work: `350 passed, 8 failed (9.6 min)`.
- Resuming after Phase 3 (US1) + features 041/042, before T014: real,
  fresh capture — `79 passed, 299 failed (11.5 min)`.
- After T014 (`dashboardShell.spec.ts`): `91 passed, 285 failed (11.0 min)`
  — confirmed clean, isolated win (+12/−14, every other file's failure
  count byte-for-byte unchanged).

Each superseded by real drift since capture (further migrations, and
genuine full-suite multi-worker flakiness this project's own history
already extensively documents — see "Full-suite run-to-run variance"
below, new to this update).

## Real baseline, this session (before metricStrip/panelExpand/boot)

Captured via a full, untruncated, single (no concurrent invocation)
`npx playwright test --reporter=list` run:

```
89 passed, 287 failed (11.6 min)
```

Per-file failure counts (every `[ ]`-still-open file):

| Spec file | Failures |
|---|---|
| `flowmapPanel.spec.ts` | 41 |
| `settingsModal.spec.ts` | 32 |
| `zonemapPanel.spec.ts` | 30 |
| `graphicWalkerPanel.spec.ts` | 29 |
| `observablePlotPanel.spec.ts` | 24 |
| `tablePanel.spec.ts` | 23 |
| `scenarioManager.spec.ts` | 16 |
| `panelExpand.spec.ts` | 16 |
| `valueBoxPanel.spec.ts` | 14 |
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
| `demoContentAllPanels.spec.ts` | 1 (pre-existing flake, see below — not in any `[ ]`-open file) |

## After metricStrip.spec.ts + panelExpand.spec.ts + boot.spec.ts

Each re-read directly and re-confirmed fully fixture-coupled before
touching (per the resuming session's own instruction — not assumed
still-accurate from an earlier line-count/grep pass). One real, minimal
content addition (`expandable: false` on one already-real
`dashboard-8-test.yaml` panel, for `panelExpand.spec.ts`'s override
test — NOT new-content-authoring in the `flowmapPanel.spec.ts` sense);
one real fixture-column fix (`tests/fixtures/all-placeholders-config.yaml`
— see T031's own tasks.md entry for the full real-column story); one
real DuckDB identifier-quoting bug found and fixed live (a hyphenated
view name needs `"..."` quoting, confirmed via a real Parser Error before
the fix).

**Isolated verification** (the three files together, single worker):
`24/24 passing` — twice, byte-identical.

**Full-suite run-to-run variance — a real, confirmed finding worth
recording explicitly this time**: two full-suite confirmation runs
(matching T014's own two-run standard) produced `109 passed, 265 failed`
and `102 passed, 272 failed` — NOT identical to each other. Investigated
directly rather than assumed benign: the second run's own failure list
showed `boot.spec.ts`, `dashboardShell.spec.ts`, `demoContentAllPanels.
spec.ts`, `demoMultiScenario.spec.ts`, and `graphicWalkerPanel.spec.ts`
(the last three untouched by this session) all failing at the **identical
30.6s mark** — the shared `waitForFunction(..., { timeout: 30_000 })`
boot-wait ceiling every test uses, hit simultaneously across unrelated
files under full 10-worker load. A genuine resource-contention signature,
not a logic regression — confirmed by re-running the exact same file in
isolation immediately after (`brokenPanelStates.spec.ts` 9/9, `boot.spec.ts`
6/6, both clean). This project's own CLAUDE.md history already documents
this exact class of flakiness repeatedly; this is the first time this
migration's own `baseline.md` records a concrete, investigated instance
of it rather than treating a single run's numbers as ground truth.

**The stable, trustworthy signal** (not the noisy pass/fail total, which
this project's own history already establishes varies run-to-run under
full-suite load): `metricStrip.spec.ts` and `panelExpand.spec.ts` show
**zero** failures in both full-suite runs. `boot.spec.ts` shows zero in
run 1 and one (the confirmed 30.6s contention timeout, not a real
failure) in run 2 — its own isolated 6/6-passing-twice result is the
real, trustworthy state. No other already-`[x]`-done file's underlying
correctness regressed — every non-30.6s-timeout failure in both runs
maps to an already-open `[ ]` task's own pre-existing, unrelated gap.

## Effective green target

`89 + 287 = 376` (this session's own starting total; unchanged by these
migrations, since no new tests were added — only fixture references
removed). `flowmapPanel.spec.ts`/`zonemapPanel.spec.ts` (T024/T025, 71 of
the remaining 265 failures) are the two largest remaining files, still
deferred as their own dedicated future session — see their own tasks.md
entries for the precise, confirmed new-content scope each needs.
