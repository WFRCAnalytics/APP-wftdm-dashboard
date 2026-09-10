---

description: "Task list for 016-fix-ugrc-dark-mode"
---

# Tasks: Fix UGRC map compositions rendering incorrectly in dark mode

**Input**: Design documents from `/specs/016-fix-ugrc-dark-mode/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — the feature spec's own SC-002/SC-006 require automated regression coverage, and SC-001/SC-004 require documented human verification on real hardware (plan.md Technical Context: Playwright/SwiftShader structurally cannot prove SC-001 itself, per research.md §1/§2).

**Organization**: Tasks are grouped by user story (spec.md: US1 P1, US2 P2, US3 P3). **This feature has an unusual, load-bearing gate not present in a typical feature**: which implementation path US1 takes is not knowable until the Phase 2 Foundational human-checkpoint tasks produce a Fix Branch Decision. Do not skip ahead to a branch's tasks before that decision is recorded in `diagnostic-results.md` — implementing the wrong branch wastes the whole task and risks contradicting research.md's own evidence trail.

**What actually happened, read this before the phases below**: `research.md` §7 originally planned for exactly three mutually-exclusive outcomes (`branch-a-scoped-css` / `no-fix-possible` / `branch-c-panel-fallback`). The real outcome was none of those — Phase 2 below correctly reached `branch-a-scoped-css`, Phase 3 implemented and then real-hardware-tested it, and it FAILED (T007). That failure triggered further investigation (reading deck.gl's real source, web research) that found a genuinely different root cause and produced a **fourth branch, `branch-e-missing-background-layer`**, never anticipated by the original three-branch plan. The phase/task structure below is kept as the accurate, sequential record of how the investigation actually unfolded — including the branch-a dead end — not rewritten to look like branch-e was the plan from the start. See `research.md` §7 (withdrawal) and §8 (the real fix) for the reasoning, `diagnostic-results.md` for the full evidence trail.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- **[HUMAN]**: Requires a person on real, hardware-accelerated WebGL — cannot be executed or verified by an automated agent alone (plan.md Constraints)

## Path Conventions

Single project (per plan.md's Structure Decision) — `src/`, `tests/`, `specs/016-fix-ugrc-dark-mode/` at repository root.

---

## Phase 1: Setup

**Purpose**: Confirm the environment this feature's tasks depend on is ready — no new project scaffolding needed (existing repo, existing panel types).

- [X] T001 Run `npm run dev:fixtures` then start `npx vite --port 5199 --strictPort --host 127.0.0.1`; confirm the Basemaps tab (`tests/fixtures/dashboard-config/dashboard-3-basemaps.yaml`) loads with both `Flowmap UGRC Composition` and `Flowmap UGRC Outdoors Composition` panels visible in light mode, as a clean baseline before any dark-mode diagnostic work begins

**Checkpoint**: Dev server running, baseline (light mode) confirmed working — matches the "no light-mode regression" requirement (FR-003) this whole feature must not violate.

---

## Phase 2: Foundational (Blocking Prerequisites) — Diagnostic Protocol

**Purpose**: Resolve the Fix Branch Decision (`data-model.md`) that every US1 task below is gated on. Sequenced exactly per research.md §5's reordering (§3a) — step 0 is already satisfied, do not re-run it.

**⚠️ CRITICAL**: No US1 implementation task may start until T005 records a Fix Branch Decision.

- [X] T002 [HUMAN] Execute research.md §5 step 1 (real-hardware `color-scheme` isolation, using the same-day standalone artifact — MapLibre from CDN, real UGRC endpoints, no app code) on the real hardware/browser where the defect is confirmed; record the three sub-step observations (absent / `dark` / `light`-override) in a new `specs/016-fix-ugrc-dark-mode/diagnostic-results.md` — **result: reproduced the corruption; `color-scheme` confirmed as the cause**
- [X] T003 [HUMAN] ~~IF T002 did not reproduce the defect~~ — not needed, T002 was conclusive (research.md §5 step 1's own stop condition)
- [X] T004 [HUMAN] ~~IF T002 and T003 both found nothing~~ — not needed, same reason
- [X] T005 [HUMAN] Based on T002, recorded the Fix Branch Decision **`branch-a-scoped-css`** as the concluding section of `specs/016-fix-ugrc-dark-mode/diagnostic-results.md`, with the three-sub-step isolation test cited as evidence (SC-003)

**Checkpoint**: Fix Branch Decision recorded in `specs/016-fix-ugrc-dark-mode/diagnostic-results.md`. Proceed only to the Phase 3 tasks matching that exact decision; skip the other branch's tasks entirely (do not implement more than one branch).

---

## Phase 3: User Story 1 - Correct dark-mode rendering of UGRC composition panels (Priority: P1) 🎯 MVP

**Goal**: Both UGRC composition panels render with correct, non-corrupted colors in dark mode on real hardware (FR-001, FR-002, FR-003).

**Independent Test**: On real hardware-accelerated WebGL, load the dashboard in dark mode, open the Basemaps tab, visually confirm both panels' map tiles render correctly (quickstart.md Scenario 2).

### Implementation for User Story 1 — pick the ONE sub-section matching T005's Fix Branch Decision

#### If T005 recorded `branch-a-scoped-css`: — **WITHDRAWN, see below**

- [X] T006 [US1] Add the scoped CSS rule from `contracts/map-canvas-color-scheme-scope.md` to `src/panels/mapControls.css`: `.maplibregl-canvas { color-scheme: light; }` with the explanatory comment specified in that contract, referencing this feature and research.md §5/§7 — **later reverted (below), rule confirmed non-functional**
- [X] T007 [US1] [HUMAN] Verify on the same real hardware as T002 (quickstart.md Scenario 2, steps 1–4): both UGRC panels now render correctly in dark mode, and still render correctly in light mode (no regression, FR-003); record the result in `specs/016-fix-ugrc-dark-mode/diagnostic-results.md` — **RESULT: FAILED.** Both panels still render broken in dark mode in the real app, despite Step 1's standalone artifact confirming `color-scheme` as causal.
- [X] T007a [US1] [HUMAN] Follow-up: confirmed via `getComputedStyle` on the real panel's actual `.maplibregl-canvas` element that the rule WAS applying (`colorScheme: "light"`) — rules out a selector/build bug, the rule is live and simply not the lever.
- [X] T007b [US1] [HUMAN] Follow-up: live root-level toggle (`document.documentElement.style.setProperty('color-scheme','light')`, post-load) — still broken. Inconclusive on its own (context-creation-time-locked effects can't be tested live), so:
- [X] T007c [US1] [HUMAN] Follow-up: root-scoped, static, present-from-page-load test — temporarily removed `.dark`'s `color-scheme: dark;` in `tokens.css` (matching the standalone artifact's own test discipline exactly), real hard reload, real hardware — **still broken.** This is the conclusive result: `color-scheme` is ruled out in every scoping variant tested.
- [X] T007d Reverted both temporary edits (`src/panels/mapControls.css`, `src/styles/tokens.css`) to their pre-016 state; confirmed via `git diff src/styles/tokens.css` showing zero net change. Removed the `.maplibregl-canvas { color-scheme: light }` rule and its explanatory comment from `mapControls.css` entirely, replaced with a note recording the ruled-out finding. Removed the now-moot SC-006 inert-under-SwiftShader test from `tests/integration/flowmapPanel.spec.ts` (asserted a rule that no longer exists); kept the NavigationControl-chrome regression test as standing baseline coverage independent of the map-tile fix.

**Fix Branch Decision `branch-a-scoped-css` is WITHDRAWN** (`diagnostic-results.md`).

#### `branch-e-missing-background-layer` — ROOT CAUSE FOUND, IMPLEMENTED

Not one of the three originally-enumerated branches (research.md §7) —
reached via further investigation into deck.gl's real interleaved-mode
source plus web research, per the user's own request to dig into that
angle. See `research.md` §8 and `diagnostic-results.md` for the full
record.

- [X] T006e [US1] Read `@deck.gl/mapbox`'s real installed interleaved-mode source directly — no color-scheme-aware code found (reuses MapLibre's own already-created WebGL context verbatim). Confirmed MapLibre's own WebGL context is created with `alpha: true`. Web research surfaced two directly relevant, cited MapLibre issues describing "missing `background` layer → alpha-blended regions composite incorrectly (as if blended toward black)" — connecting directly to this app's own pre-existing test assertion that the UGRC composition has no `background` layer.
- [X] T006f [US1] [HUMAN] Live causation test, real hardware, no reload: manually added an opaque white `background` layer to the already-running, already-broken `Flowmap UGRC Composition` map instance via `window.__flowmapTestMaps` — **immediately fixed it.**
- [X] T006g [US1] [HUMAN] Repeated on `Flowmap UGRC Outdoors Composition` — **also immediately fixed.** Root cause confirmed on both reported-broken panels independently.
- [X] T006h [US1] Implemented the real fix in `src/panels/basemap/loadBasemapStyle.ts`'s `composeStyles()`: injects `{ id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } }` at the bottom of the composed layer stack whenever none of the composed layers already has `type === 'background'` (checked by type, not id, so a real author's own namespaced background is respected and never double-covered). General across every composition with this gap (FR-010), not scoped to these two panels by name.
- [X] T006i [US1] Updated `tests/unit/loadBasemapStyle.test.ts`: fixed layer-index assertions in the two existing composition tests that previously expected no background layer (now shifted by one), and added a new test confirming the injection is skipped when a composed source already provides its own background layer. All 10 tests pass.
- [X] T006j [US1] Updated `tests/integration/flowmapPanel.spec.ts`: replaced the now-incorrect `not.toContain('background')` assertion in the existing UGRC composition test with assertions matching the new intentional behavior (exactly one background layer, at index 0, `#ffffff`); added a new data-level regression test confirming BOTH real UGRC panels get the injected layer (Playwright/SwiftShader can only prove the DATA fix, not the visual one — research.md §1/§2). All pass.
- [X] T006k `npx tsc --noEmit` clean; full `flowmapPanel.spec.ts` + `zonemapPanel.spec.ts` suite (59 tests) passes; full unit suite (209 tests) passes; `npm run build` clean.

**Still needed** (real hardware, genuine page load — not the live console patch used above): T007/T009/T012 below, re-scoped to this branch.

- [X] T007 [US1] [HUMAN] On the same real hardware, do a genuine hard reload (not a live console patch) of the app with the SHIPPED fix in place, dark mode active from load; confirm both UGRC panels render correctly, and confirm light mode is still unaffected (FR-003); record in `diagnostic-results.md` — **RESULT: CONFIRMED.** Both UGRC panels render correctly in dark mode from a genuine reload of the shipped fix (not the live console patch); light mode unaffected.

#### If T005 recorded `no-fix-possible`:

- [ ] T006 [US1] Document the confirmed external cause (flag or OS filter, per T003/T004's evidence) in `specs/016-fix-ugrc-dark-mode/diagnostic-results.md` as the closing finding — no source file changes, since no code-level fix exists (research.md §4); this satisfies SC-003 (root cause documented with cited evidence) even though SC-001 cannot be met by a code change
- [ ] T007 [US1] Add a short caveat to `project-docs/ARCHITECTURE.md`, alongside its existing DuckDB-WASM/parquet-extension and spatial-extension network-fetch caveats, noting that these two UGRC panels can render incorrectly in dark mode under \[the confirmed external mechanism from T006], with a pointer to `specs/016-fix-ugrc-dark-mode/diagnostic-results.md` for the full finding — matching this repo's own established convention of recording confirmed, out-of-scope external limitations in that file rather than leaving them undocumented

#### If T005 recorded `branch-c-panel-fallback`:

- [ ] T006 [US1] In `src/panels/FlowMapPanel.tsx`'s basemap-application effect, add a narrow, named exception: when the resolved `effectiveBasemap`'s composition layers match either UGRC panel's known layer URL set (`tests/fixtures/dashboard-config/dashboard-3-basemaps.yaml`'s `LiteBase`+`LiteLabels` or `OutdoorsBase`+`Outdoors_Labels` pairs), pin the resolved style to its light-mode result regardless of `colorScheme`, matching the VectorHillshade PBF-encoding precedent's own narrowly-scoped, documented-limitation shape (not a silent behavior change) — comment must cite `specs/016-fix-ugrc-dark-mode/diagnostic-results.md` for why
- [ ] T007 [US1] [HUMAN] Verify on the same real hardware as T002 (quickstart.md Scenario 2): both UGRC panels now render correctly in dark mode (pinned to their light-mode appearance) and still render correctly in light mode; record the result in `specs/016-fix-ugrc-dark-mode/diagnostic-results.md`

**Checkpoint**: User Story 1 is independently testable now — SC-001 confirmed (or, for `no-fix-possible`, SC-001 explicitly and honestly not met, with SC-003 satisfied in its place).

---

## Phase 4: User Story 2 - No loss of existing dark-mode styling for these panels (Priority: P2)

**Goal**: Whatever US1 branch was implemented, these two panels' surrounding UI chrome (card background, heading, MapLibre NavigationControl) stays dark-mode-styled (FR-006).

**Independent Test**: With either UGRC panel visible in dark mode, confirm card/heading/nav-control styling still matches the app's dark theme (quickstart.md Scenario 2 step 5 extended to these two panels specifically).

- [X] T008 [US2] Extend the existing NavigationControl dark-mode regression test in `tests/integration/flowmapPanel.spec.ts` (the one currently targeting `FLOWMAP_TITLE` around line 401) with a second assertion block targeting the `Flowmap UGRC Composition` panel by title, confirming identical `groupBg`/`iconFilter`/`dividerColor` values — this is the first time that specific panel's own chrome (as opposed to its map-tile rendering) gets explicit regression coverage. Added as a new test in a `016-fix-ugrc-dark-mode` describe block, `tests/integration/flowmapPanel.spec.ts:~1198`. PASSES — re-confirmed passing after the `branch-e-missing-background-layer` fix landed (T006h+).
- [X] T009 [US2] [P] [HUMAN] On real hardware, with `branch-e-missing-background-layer` shipped, visually confirm both UGRC panels' card background, heading text color, and zoom/compass control styling remain dark-themed (not reverted to light-mode chrome) — record alongside T007's result — **RESULT: CONFIRMED.** Panel chrome (headers/nav controls) remains dark-themed on both panels.

**Checkpoint**: User Stories 1 AND 2 both independently verified.

---

## Phase 5: User Story 3 - No regression to other map panels' dark-mode rendering (Priority: P3)

**Goal**: Every other flowmap/zonemap panel's already-correct dark-mode rendering is unaffected by whatever US1 fix was applied (FR-007).

**Independent Test**: Full existing dark-mode regression suite passes unchanged; at least one non-UGRC flowmap panel and one zonemap panel spot-checked on real hardware.

- [X] T010 [US3] Run `npx playwright test tests/integration/flowmapPanel.spec.ts tests/integration/zonemapPanel.spec.ts` and confirm 100% pass with zero new failures (SC-002) — this is the baseline regression gate regardless of which US1 branch was implemented. **Re-run after `branch-e-missing-background-layer` landed (T006h–j): 59/59 passed**, including the previously-flaky pre-existing test and both new T006j tests.
- [X] T011 [US3] [P] SC-006 is not applicable to this branch — `branch-e-missing-background-layer` changes `composeStyles()`'s DATA output (the composed style object), not app CSS, so there is no "inert under SwiftShader" CSS-property claim to prove here the way Branch A would have needed. T006j's new data-level assertions (background layer present on both real panels) already run, and pass, under SwiftShader — that IS this branch's own equivalent no-regression-where-nothing-was-broken proof.
- [X] T012 [US3] [P] [HUMAN] On real hardware, spot-check at least one other flowmap panel (e.g. `Flowmap Dark Matter Preset`) and the zonemap panel(s) on another tab in dark mode — confirm no new corruption was introduced; record alongside T007/T009's results — **RESULT: CONFIRMED.** Spot-checked another flowmap panel and a zonemap panel in dark mode — no regression.

**Checkpoint**: All three user stories independently functional and verified — SC-001/SC-002/SC-004 satisfied; SC-003 satisfied via `research.md` §8/`diagnostic-results.md`; SC-006 (Branch A's own "inert under SwiftShader" requirement) is not applicable to the branch that actually shipped — see T011.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close out documentation and build-health checks matching this repo's own established per-feature convention (CLAUDE.md's extensive historical-comment trail on every prior map-panel feature).

- [X] T013 [P] Updated `CLAUDE.md`'s `FlowMapPanel.tsx` entry with the full, confirmed resolution (root cause, citations, fix) — re-written three times across this feature's lifecycle: Branch A implemented, Branch A withdrawn, `branch-e-missing-background-layer` confirmed and fixed. **Final pass**: closed out the one remaining "pending real-hardware confirmation" line now that T007/T009/T012 are confirmed — note now reads RESOLVED, nothing further needed.
- [X] T014 [P] Updated `specs/016-fix-ugrc-dark-mode/spec.md`'s Status field. **Final pass**: rewritten to state RESOLVED, citing SC-001–SC-004 as satisfied (SC-005 N/A, SC-006 addressed in spirit per T011) now that real-hardware confirmation of the shipped fix is in — nothing further needed here.
- [X] T015 Run `npm run build` and confirm it completes with no new errors/warnings. **Re-run with the real fix in place: clean build** (pre-existing chunk-size warnings only, unrelated to this feature). **Re-confirmed after the T007/T009/T012 close-out edits (docs-only, no source change): still clean.**
- [X] T016 Run `quickstart.md` Scenarios 1–3 end to end as the final, complete validation pass; confirm every "Done when" item is satisfied — **all three scenarios complete: Scenario 1 (diagnostic protocol) recorded a Fix Branch Decision with cited evidence, Scenario 2 (real-hardware verification) confirmed via T007/T009/T012, Scenario 3 (automated SC-006-equivalent check) confirmed via T010/T011. Feature complete.**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001) — BLOCKS all of Phase 3 (T002–T005 must produce a recorded Fix Branch Decision before any T006+ task starts)
- **User Story 1 (Phase 3)**: Depends on Phase 2's Fix Branch Decision — implement ONLY the sub-section matching that decision
- **User Story 2 (Phase 4)**: Depends on Phase 3 being complete (verifying chrome around whatever was just implemented)
- **User Story 3 (Phase 5)**: Depends on Phase 3 being complete (T010's regression run needs the real diff, if any, to exist first); T011/T012 can run in parallel with each other and with Phase 4's tasks
- **Polish (Phase 6)**: Depends on Phases 3–5 all complete

### Within Phase 3

T006 before T007 (can't verify a fix that doesn't exist yet) — both `no-fix-possible` and the code-change branches follow this same order (T006 = the finding/change, T007 = the verification/documentation of it).

### Parallel Opportunities

- T008 (automated) and T009 (human, real hardware) can run in parallel — different execution contexts, no shared file
- T011 (automated, CI-only) and T012 (human, real hardware) can run in parallel
- T013/T014 (documentation) can run in parallel with each other and with T015 (build check)

---

## Parallel Example: Phase 5 (User Story 3)

```bash
# Automated (CI/agent) and human checks can proceed at the same time:
Task: "Run npx playwright test tests/integration/flowmapPanel.spec.ts tests/integration/zonemapPanel.spec.ts"
Task: "[HUMAN] Spot-check Flowmap Dark Matter Preset and a zonemap panel in dark mode on real hardware"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — **this is the actual hard part of this feature**; everything after it is comparatively mechanical once the Fix Branch Decision exists
3. Complete Phase 3 (the one matching T005's decision)
4. **STOP and VALIDATE**: quickstart.md Scenario 2 on real hardware
5. This alone satisfies the feature's primary reported defect (SC-001) or, for `no-fix-possible`, honestly closes the investigation (SC-003)

### Incremental Delivery

1. Setup + Foundational → Fix Branch Decision known (the point every prior investigation round in this feature's history was trying to reach)
2. User Story 1 → real-hardware-verified fix (or documented non-fix) → this IS the deliverable users care about
3. User Story 2 → confirms nothing else broke on these same two panels
4. User Story 3 → confirms nothing else broke anywhere else
5. Polish → documentation trail matches this repo's own established standard for closing out a map-panel feature

### Human-Checkpoint Tasks — a note for whoever executes this list

Every `[HUMAN]` task (T002–T005, T007, T009, T012) requires real,
hardware-accelerated WebGL and cannot be completed or verified by an
automated agent working alone — per `plan.md`'s Technical Context, this
is a structural property of this specific defect, not a process
shortcut being skipped. An agent executing this task list should stop
at each `[HUMAN]` task, ask the user to run it, and wait for the
reported result before proceeding — never fabricate or assume a
`[HUMAN]` task's outcome.
