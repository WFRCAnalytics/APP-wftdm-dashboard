---

description: "Task list for 017-multi-sprite-support"
---

# Tasks: Multi-sprite support in composeStyles()

**Input**: Design documents from `/specs/017-multi-sprite-support/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — the feature spec's own SC-001–SC-005 all require automated test coverage, and (unlike `016-fix-ugrc-dark-mode`) none of this feature's verification needs real hardware (research.md §3, FR-007/SC-004) — every task below is executable and verifiable by an automated agent alone.

**Organization**: Tasks are grouped by user story (spec.md: US1 P1, US2 P2, US3 P3). Unusually for this project's own task-list convention, all three user stories exercise the SAME single code change (`composeStyles()`'s sprite/icon-image handling) rather than being independently shippable increments — Phase 2 (Foundational) is therefore the actual implementation, and Phases 3–5 are each a distinct angle of test coverage over that one change (icons resolve / no regression / mechanism generalizes), not three separate features. This is a deliberate, stated departure from the usual "each user story is its own slice," not an oversight.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single project (per plan.md's Structure Decision) — `src/`, `tests/`, `specs/017-multi-sprite-support/` at repository root.

---

## Phase 1: Setup

**Purpose**: Confirm the environment this feature's tests depend on is ready.

- [X] T001 Run `npm run dev:fixtures` (copies `tests/fixtures/{observed,scenarios,dashboard-config,geometry}` → `public/`) so the Basemaps tab's real UGRC composition panels are available for the integration tests this feature adds

**Checkpoint**: Fixtures ready.

---

## Phase 2: Foundational (Blocking Prerequisites) — the actual fix

**Purpose**: Implement the one code change every user story's own tests verify. Per `contracts/compose-styles-multi-sprite.md` and `data-model.md`.

**⚠️ CRITICAL**: No Phase 3–5 test can pass until this phase is complete.

- [X] T002 In `src/panels/basemap/loadBasemapStyle.ts`'s `composeStyles()`: declare a `spriteEntries: { id: string; url: string }[]` array outside the per-layer loop (alongside `merged`). Replace the existing `if (!merged.sprite && typeof raw.sprite === 'string') { merged.sprite = resolveUrlPreservingTemplateTokens(raw.sprite, layerUrl) }` block with unconditional collection: when `typeof raw.sprite === 'string'`, push `{ id: \`layer${i}\`, url: resolveUrlPreservingTemplateTokens(raw.sprite, layerUrl) }` onto `spriteEntries` for every layer that declares one (no `!merged.sprite` guard — every layer's own sprite is collected, not just the first). After the loop, set `merged.sprite = spriteEntries.length > 0 ? spriteEntries : undefined` (research.md §2 — always the array form, even for a single entry; `undefined` only when zero layers declare a sprite, unchanged from today). Implemented.
- [X] T003 In the same function's existing `rewrittenLayers` map (the one that already rewrites each layer's own `id`/`source`), extend the per-layer callback to also rewrite `layout['icon-image']` when present: if it's a literal string, prefix it with `` `layer${i}:` ``; if present but not a string (a style expression — confirmed to not exist in any real composed layer today, research.md §1), `console.warn` naming the layer's own `id` and the source `layerUrl`, and leave that one layer's `icon-image` value untouched (data-model.md's "Icon reference" section, contract's own table). Implemented.
- [X] T004 [P] Add the explanatory comment above T002/T003's new logic, citing `research.md` §1 (exhaustive real-layer check, zero expressions found), §2 (why always-array/always-prefix, no `"default"` id), and this feature's own spec FR-004 (no single-sprite fast path) — matching this codebase's own established dense-rationale-comment convention (see the existing `016-fix-ugrc-dark-mode` comment immediately above this code for the exact style to match). Done, inline with T002/T003.

**Checkpoint**: `composeStyles()`'s sprite/icon-image handling is fully implemented. Proceed to Phase 3.

---

## Phase 3: User Story 1 - Highway/route-shield icons render on UGRC composition panels (Priority: P1) 🎯 MVP

**Goal**: Both `Flowmap UGRC Composition` and `Flowmap UGRC Outdoors Composition` render their intended highway/route-shield icons (FR-001, FR-002).

**Independent Test**: `map.hasImage()` returns `true` for each real highway-shield icon name confirmed present in research.md §1, on both real panels.

- [X] T005 [US1] Extend `tests/unit/loadBasemapStyle.test.ts`'s existing `"rewrites a relative source url/sprite/glyphs against each layer's own URL and namespaces ids"` test fixture (or add a sibling test using the same two-layer fixture, each declaring its own `sprite`) to assert: `style.sprite` is an array of length 2 (`[{id: 'layer0', url: ...}, {id: 'layer1', url: ...}]`), and each layer's own `icon-image` (add one to each fixture layer's `layout`) is prefixed with its own layer's sprite id. Implemented as a new, dedicated test ("preserves and correctly resolves a SECOND composed layer's own sprite/icon-image — the real UGRC bug shape") mirroring the real bug's own asymmetric shape (only layer1 has icon-image layers) — PASSES.
- [X] T006 [US1] [P] Extend `tests/integration/flowmapPanel.spec.ts`'s existing `'011-basemap-style-system — US3: real UGRC multi-source composition'` test with `map.hasImage('layer1:Labels/Roads - Interstates and Ramps - white version/Interstates')`-style assertions (using the exact real icon names confirmed in research.md §1) for `Flowmap UGRC Composition`; add an equivalent new/extended test for `Flowmap UGRC Outdoors Composition`'s own confirmed icon names (`layer1:LABELS/Roads - LABELS/Interstates`, etc.). Also fixed that existing test's own `style.sprite`/spriteReachable assertions, which assumed a single-string sprite (now the array form). Added as a new `017-multi-sprite-support — US1` describe block with 2 tests (one per real panel) — PASSES, both real panels confirmed via `map.hasImage()` against the actual live UGRC endpoints.
- [X] T007 [US1] Run `npx vitest run tests/unit/loadBasemapStyle.test.ts` and `npx playwright test tests/integration/flowmapPanel.spec.ts -g "UGRC"` — confirm all pass (quickstart.md Scenario 1). **CONFIRMED**: 13/13 unit tests pass; both new `map.hasImage()` integration tests pass (part of the full 60/61 suite run, T012).

**Checkpoint**: User Story 1 independently verified — SC-001 confirmed.

---

## Phase 4: User Story 2 - No regression to existing single-sprite compositions (Priority: P2)

**Goal**: Every existing composition with 0 or 1 sprite-declaring layers renders its icons identically to before this feature (FR-003).

**Independent Test**: A single-sprite composition's *rendered* icon is unchanged, even though its *reference string* now carries a prefix (FR-004's own explicit distinction).

- [X] T008 [US2] Add a new unit test in `tests/unit/loadBasemapStyle.test.ts`: compose a fixture with exactly ONE layer declaring a sprite (a second layer with none) — assert `style.sprite` is STILL the array form (`[{id: 'layer0', url: ...}]`, length 1 — not a plain string) and that layer's `icon-image` values ARE prefixed (`layer0:...`) — directly enforcing FR-004's "no special-cased skip" for the single-sprite case, not merely leaving it incidentally uncovered. Implemented by extending the existing hillshade/base fixture test directly (it already had exactly this one-sprite shape) rather than adding a duplicate — added an `icon-image` layer to the sprite-declaring fixture layer and asserted the array form + `layer0:peak` prefix — PASSES.
- [X] T009 [US2] [P] Run the existing, unrelated-to-sprites-in-scope integration tests unchanged: `Flowmap UGRC Vector Hybrid` (`011-basemap-style-system` mixed raster+vector composition test) and `Flowmap Broken Composition Layer (intentional)` — confirm both still pass with zero modification needed (quickstart.md Scenario 2). **CONFIRMED** — both pass unchanged, part of the full 60/61 suite run (T012).

**Checkpoint**: User Stories 1 AND 2 both independently verified.

---

## Phase 5: User Story 3 - The fix generalizes to any future multi-sprite composition (Priority: P3)

**Goal**: The mechanism works for any composition with 2+ sprite-declaring layers, not just the two named UGRC panels (FR-006).

**Independent Test**: A synthetic, non-UGRC two-sprite composition resolves both layers' own icons correctly.

- [X] T010 [US3] Add a new synthetic unit test in `tests/unit/loadBasemapStyle.test.ts`: two fixture layers (non-UGRC URLs, e.g. `https://example.test/...`), each declaring a distinct sprite with non-overlapping icon names — assert both layers' own `icon-image` values resolve to their OWN sprite id specifically (`layer0:iconA`, `layer1:iconB`), not both collapsing onto the first (quickstart.md Scenario 3). Implemented ("resolves each composed layer's own icon-image against its own sprite when BOTH layers declare one...", generic `roadsigns`/`shops` fixture, deliberately non-UGRC-shaped) — PASSES. Also added, beyond the original task list: a synthetic test for FR-005's non-literal `icon-image` (expression) branch, confirmed via research.md §1 to not exist in any real layer today — `console.warn` + untouched value both asserted.

**Checkpoint**: All three user stories independently functional and verified — SC-001–SC-005 all satisfied.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close out documentation and build-health checks matching this repo's own established per-feature convention.

- [X] T011 [P] Run `npx tsc --noEmit` — confirm clean. **CONFIRMED clean**, twice (after Phase 2, and again after all test additions).
- [X] T012 [P] Run the FULL existing suite (`npx vitest run` + `npx playwright test tests/integration/flowmapPanel.spec.ts tests/integration/zonemapPanel.spec.ts`) — confirm 100% pass, zero regressions anywhere in the app, not just this feature's own new tests (SC-002). **Result: 212/212 unit tests pass; 60/61 integration tests pass.** The one failure (`012-webgl-context-management — WebGL context loss is reported honestly`) reproduces as a pre-existing timing flake unrelated to this feature — confirmed by re-running it alone, where it passes (this environment's WebGL-context-simulation tests have shown this same flakiness pattern repeatedly, across unrelated features, this session).
- [X] T013 Run `npm run build` — confirm clean. **CONFIRMED clean** (only the pre-existing, unrelated chunk-size warnings).
- [X] T014 [P] Update `CLAUDE.md`'s `loadBasemapStyle.ts`/`composeStyles()` history entry with this feature's resolution (one concise note, matching the file's own established convention of recording each numbered feature's real, confirmed findings inline — see the adjacent `016-fix-ugrc-dark-mode` entry for the exact style).
- [X] T015 [P] Update `specs/017-multi-sprite-support/spec.md`'s Status field to record completion.
- [X] T016 Run `quickstart.md`'s three scenarios end to end as the final validation pass; confirm every "Done when" item is satisfied.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001, though largely independent since it's a pure code change) — BLOCKS all of Phases 3–5 (no test can pass without T002/T003 implemented).
- **User Story 1 (Phase 3)**: Depends on Phase 2. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Phase 2 only — independently testable from US1 (different fixtures/assertions), though naturally run after since it shares the same implementation.
- **User Story 3 (Phase 5)**: Depends on Phase 2 only — same independence as US2.
- **Polish (Phase 6)**: Depends on Phases 3–5 all complete.

### Parallel Opportunities

- T004 can run in parallel with T005+ once T002/T003 land (it's a comment-only addition).
- T006 (integration) and T005 (unit) can run in parallel — different files.
- T008/T009 (US2) and T010 (US3) can all run in parallel with each other and with US1's own tasks, once Phase 2 is complete — no shared file conflicts, no cross-story dependency.
- T011/T014/T015 can run in parallel with each other.

---

## Parallel Example: Phases 3–5 together

```bash
# Once Phase 2 (T002/T003) lands, every remaining test task across all
# three user stories can be written/run in parallel — no story depends
# on another's own test outcome:
Task: "Extend tests/unit/loadBasemapStyle.test.ts with the two-sprite UGRC-shaped fixture (T005)"
Task: "Extend tests/integration/flowmapPanel.spec.ts with map.hasImage() assertions (T006)"
Task: "Add the single-sprite-still-gets-array-form unit test (T008)"
Task: "Add the synthetic two-sprite-non-UGRC unit test (T010)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — the actual fix
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: `npx vitest run tests/unit/loadBasemapStyle.test.ts` + the targeted Playwright run
5. This alone satisfies the feature's primary reported defect (SC-001)

### Incremental Delivery

1. Setup + Foundational → the fix exists
2. User Story 1 → the two real, currently-broken panels are confirmed fixed
3. User Story 2 → confirms nothing else in the app regressed
4. User Story 3 → confirms the fix is genuinely general, not a two-panel special case
5. Polish → full-suite confirmation + documentation trail matching this repo's own standard

### No human-checkpoint tasks

Unlike `016-fix-ugrc-dark-mode`, every task in this list is executable
and verifiable by an automated agent alone (research.md §3) — there is
no `[HUMAN]` tag anywhere in this file, and none is expected to become
necessary.
