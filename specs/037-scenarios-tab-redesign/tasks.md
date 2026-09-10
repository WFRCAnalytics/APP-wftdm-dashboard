---

description: "Task list for 037-scenarios-tab-redesign"
---

# Tasks: Scenarios Tab Redesign — Drag Reorder, Baseline Chip, Verified Active Toggle

**Input**: Design documents from `/specs/037-scenarios-tab-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/scenarios-tab-row.md, quickstart.md

**Tests**: Included — the feature description explicitly requires "real evidence (pixel-position screenshots for the reorder relocation, a real drag-interaction test, both themes throughout)".

**Organization**: By user story. US1 (P1) = Parts B + C (leading-edge reorder controls + drag-and-drop). US2 (P2) = Part D (single baseline chip). US3 (P3) = Part E (Switch tooltip). Part A (verification, no code change) lives in Foundational as FR-001's regression test. All three user stories edit the same one or two files (`scenariosTab.tsx`, new `scenarioRow.tsx`), so despite being conceptually independent they are implemented **sequentially** US1 → US2 → US3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 (reorder), US2 (baseline chip), US3 (Switch tooltip)
- Paths are repo-relative from `D:\GitHub\APP-wftdm-dashboard`

---

## Phase 1: Setup

- [X] T001 Install drag-and-drop dependencies: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` (and, recommended, `npm install @dnd-kit/modifiers`) — confirm the pinned versions land as `@dnd-kit/core ^6.3.x`, `@dnd-kit/sortable ^10.x`, `@dnd-kit/utilities ^3.2.x` in `package.json`, and `package-lock.json` updates.
- [X] T002 [P] Confirm clean baseline — run `npm run typecheck`, `npm run test:unit`, and `npx playwright test tests/integration/settingsModal.spec.ts` once; record the passing counts as this feature's pre-change baseline.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The reorder data mutator both drag AND the relocated arrows funnel through (FR-004) must exist before US1; the FR-001 regression test formalizes Part A's "no bug" finding.

- [X] T003 Add `reorderScenario(name: string, targetIndex: number): void` to `src/state/appState.ts` per `data-model.md` §2 — full re-sequence of every scenario's `order` to `0,1,2,…` across the new arrangement; `targetIndex` clamped to `[0, count-1]`; same-index move is a `notify()`-only no-op; `throw` on an unregistered name. Never touches `active`/`label`/`color`/`status`/the baseline pointer.
- [X] T004 Reimplement `moveScenario(name, 'up'|'down')` in `src/state/appState.ts` per `data-model.md` §3 to delegate to `reorderScenario(name, currentIndex ± 1)` — same signature, same observable behavior (boundary move stays a `notify()`-only no-op after clamping).
- [X] T005 [P] Unit-test `reorderScenario` + the `moveScenario` reimplementation in `tests/unit/appState.test.ts` (create the file if it does not exist; extend if it does): move down, move up, move to first, move to last, no-op to same index, throw on unregistered name; every pre-existing `moveScenario` behavior still holds; `getBaseline()` result is unchanged by any reorder (the automatic-baseline guarantee).
- [X] T006 [P] FR-001 regression test in `tests/integration/settingsModal.spec.ts` (new "User Story (037) — Part A" describe block): on a plain `/` boot, assert the active/inactive Switch's `aria-checked`/`data-state` equals `appState.get(name).active` for BOTH `observed` (active) and an inactive scenario (`good_scenario`), asserted together, in light AND dark theme. Comment the block with the Part A finding (no bug; only `observed` is force-active by default — `registerPublishedScenarios()` never calls `setActive()`).

**Checkpoint**: `appState` reorder path exists and is unit-tested; Part A locked in. US1 can begin.

---

## Phase 3: User Story 1 — Reorder by drag or keyboard, from a leading-edge control (Priority: P1) 🎯 MVP

**Goal**: Move the up/down arrows to the row's leading edge (Part B) and add pointer + keyboard drag-and-drop reordering (Part C), both funnelling through `appState.reorderScenario` (FR-004), with the arrows remaining a complete keyboard-accessible fallback (FR-005) and drag providing screen-reader announcements (FR-006).

**Independent Test**: Load 3+ scenarios; drag row 3 above row 1 with the mouse and confirm the order + `appState.listByDisplayOrder()` update immediately; separately, using only the keyboard (drag handle → Space → Arrow → Space, and separately the move-up button), achieve the identical reorder.

### Tests for User Story 1

- [X] T007 [P] [US1] Playwright test in `tests/integration/settingsModal.spec.ts` — a stepped pointer drag (`mouse.move`/`down`/intermediate `move`s/`up`, per `research.md` §8) of a row's drag handle past another row reorders the list; the rendered row order AND `appState.listByDisplayOrder()` names both reflect it, no reload.
- [X] T008 [P] [US1] Playwright test — focus a row's drag handle, `Space` to lift, `ArrowDown` to move, `Space` to drop → same reorder; assert a live-region (`[aria-live]`) element receives a non-empty, position-based announcement during the sequence.
- [X] T009 [P] [US1] Playwright test — the relocated leading-edge move-up/move-down buttons still reorder one step (identical outcome to a drag); each stays visibly present but `disabled` at the top/bottom boundary; `aria-label` text (`Move ${name} up`/`down`) unchanged.
- [X] T010 [P] [US1] Playwright test — a drag released outside the row list leaves `appState.listByDisplayOrder()` in its original order (no partial state); and reordering several rows never changes `appState.getBaseline()`.
- [X] T011 [P] [US1] Playwright test — measure `getBoundingClientRect().x` for the status dot, identity block, Switch, color swatch, and (post-US2 this also covers the chip, but for US1 assert the pre-US2 set) across all rows in BOTH themes; every control's `x` is identical across rows (sub-pixel tolerance) after the Part B relocation (FR-015).

### Implementation for User Story 1

- [X] T012 [US1] Create `src/layout/settings/scenarioRow.tsx` — extract one row as its own presentational component taking `{ scenario, index, total, baselineName }` (and whatever callbacks/derived values the current `.map()` body uses), rendering byte-equivalent markup to today's row (no behavior change yet). Update `src/layout/settings/scenariosTab.tsx` to render `<ScenarioRow …/>` per item. Run the full `settingsModal.spec.ts` to confirm zero change.
- [X] T013 [US1] In `src/layout/settings/scenariosTab.tsx` — wrap the row list in `<DndContext>` + `<SortableContext items={orderedNames} strategy={verticalListSortingStrategy}>`; configure `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`; pass a position-based `announcements` object to `DndContext` (per `research.md` §2 / `@dnd-kit` docs).
- [X] T014 [US1] In `src/layout/settings/scenarioRow.tsx` — call `useSortable({ id: scenario.name })`; render a `GripVertical` (`lucide-react`) icon button at the row's LEADING edge with `{...attributes} {...listeners}`, `aria-label={`Reorder ${name}`}`, `cursor-grab`/`active:cursor-grabbing`; MOVE the existing `ChevronUp`/`ChevronDown` arrow column from the trailing actions cluster to immediately after the drag handle (before the status dot). Arrows still call `appState.moveScenario(name, 'up'|'down')`, still `disabled` at `index === 0` / `index === total - 1`, `aria-label` unchanged.
- [X] T015 [US1] In `src/layout/settings/scenariosTab.tsx` — wire `DndContext onDragEnd={({active, over}) => { if (over && active.id !== over.id) appState.reorderScenario(String(active.id), orderedNames.indexOf(String(over.id))) }}`; in `scenarioRow.tsx` apply `style={{ transform: CSS.Transform.toString(transform), transition }}` (from `@dnd-kit/utilities`) to the row container, plus a subtle raised affordance (`shadow`/`opacity`/`z-10`) while `isDragging`; optionally add `modifiers={[restrictToVerticalAxis, restrictToParentElement]}` from `@dnd-kit/modifiers`.
- [X] T016 [US1] Run T007–T011; fix until green; manually verify a real drag + a real keyboard drag in both themes via `npm run dev`.

**Checkpoint**: Reordering works by drag and by keyboard, arrows relocated and still functional, alignment verified. US1 independently shippable.

---

## Phase 4: User Story 2 — One self-explanatory baseline chip (Priority: P2)

**Goal**: Replace the Star / Star+"Baseline"-text control entirely with ONE chip in the identity block beside the name (Part D): filled non-interactive "Baseline" on the baseline row, outline clickable "Set as baseline" elsewhere, no tooltip.

**Independent Test**: Confirm the baseline row shows a filled non-clickable "Baseline" chip beside the name; every other row shows an outline clickable "Set as baseline" chip; click one and confirm the filled state + text move to it and the old baseline row reverts to the outline state; confirm no `Star` icon or separate `Badge` remains anywhere.

### Tests for User Story 2

- [X] T017 [P] [US2] Playwright test in `tests/integration/settingsModal.spec.ts` — the current baseline's row shows exactly one filled chip (`Badge variant="default"` computed style) reading exactly `Baseline`, in the identity block beside the name; it has no `onClick` effect (clicking is a no-op) and shows no tooltip on hover.
- [X] T018 [P] [US2] Playwright test — a non-baseline row shows an outline chip reading exactly `Set as baseline`, clickable; clicking it makes that scenario `appState.getBaseline()` and moves the filled `Baseline` chip + text to that row; the previously-baseline row now shows the outline `Set as baseline` chip.
- [X] T019 [P] [US2] Playwright test — no element with the old Star `aria-label` (`… as baseline scenario` on a Star `<button>` in the actions cluster) and no standalone `Badge` exists outside the identity-block chip; and the identity block's own `getBoundingClientRect().width`/the name input's `x` is identical between a baseline row and a non-baseline row (the chip's reserved width is fixed), in BOTH themes.

### Implementation for User Story 2

- [X] T020 [US2] In `src/layout/settings/scenarioRow.tsx` — remove the entire Star / Star+"Baseline"-text control (the `(() => { const baselineControl = … })()` block) from the trailing actions cluster; drop the now-unused `Star` import if nothing else uses it.
- [X] T021 [US2] In `src/layout/settings/scenarioRow.tsx` — in the identity block line 1, make the name `<input>` `flex-1 min-w-0 truncate` and add a `shrink-0` baseline chip sibling per `contracts/scenarios-tab-row.md`: `isBaseline` → `<Badge variant="default">Baseline</Badge>` (no wrapping button, no tooltip); else → `<button onClick={() => appState.setBaseline(name)} aria-label={`Mark ${name} as baseline scenario`}><Badge variant="outline" className="cursor-pointer hover:bg-muted">Set as baseline</Badge></button>`. Give the chip a fixed reserved width sized to the wider "Set as baseline" label using this session's proven "identical markup, vary only visibility/style" technique (see `research.md` §6) so the identity block width never shifts between baseline and non-baseline rows.
- [X] T022 [US2] Update pre-existing `tests/integration/settingsModal.spec.ts` assertions that referenced the removed Star control — any `getByRole('button', { name: /… as baseline scenario/ })` on a Star, any `getByText('Baseline')` `toHaveCount`/visibility check tied to the old control — retarget them to the new chip (matching the `036` Part C pattern: `getByText` existence → visibility/role assertions on the chip).
- [X] T023 [US2] Run T017–T019 and the full `settingsModal.spec.ts`; fix until green; verify both themes via `npm run dev`.

**Checkpoint**: The baseline indicator is one self-explanatory chip; no Star/Badge elsewhere; alignment preserved. US2 independently shippable.

---

## Phase 5: User Story 3 — Discoverable Switch tooltip (Priority: P3)

**Goal**: Add a hover/focus tooltip on the active/inactive Switch explaining it controls which scenarios are included in comparisons/queries (Part E). No change to the Switch's wiring; the baseline chip stays tooltip-free.

**Independent Test**: Hover a row's active/inactive Switch and confirm a tooltip with the explanatory text appears; confirm the baseline chip shows no tooltip; both themes.

### Tests for User Story 3

- [X] T024 [P] [US3] Playwright test in `tests/integration/settingsModal.spec.ts` — hovering a row's active/inactive Switch shows a `role="tooltip"` element whose text names the effect (inclusion in comparisons/queries); the Switch's `aria-label` / `aria-checked` are unchanged; the baseline chip shows no tooltip on hover; both themes.

### Implementation for User Story 3

- [X] T025 [US3] In `src/layout/settings/scenarioRow.tsx` — wrap the `<Switch>` in a per-row-scoped `<TooltipProvider><Tooltip><TooltipTrigger asChild>…</TooltipTrigger><TooltipContent>…</TooltipContent></Tooltip></TooltipProvider>` (matching this file's existing scoped-provider convention), with a one-sentence `TooltipContent` naming the effect (e.g. "Include this scenario in comparisons and queries"). Do not alter the Switch's `aria-label`, `checked`, or `onCheckedChange` (FR-013).
- [X] T026 [US3] Run T024 and the full `settingsModal.spec.ts`; fix until green; verify both themes.

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T027 [P] Run `npm run typecheck` — **DONE**, clean.
- [X] T028 [P] Run `npm run test:unit` — **DONE**, 457/457 (up from 447 — 11 new `reorderScenario`/`moveScenario`-reimpl cases in `tests/unit/appState.test.ts`, minus a small count reconciliation).
- [X] T029 Run `npm run build` — **DONE**, clean. `@dnd-kit/*` (4 packages) added ~48 KB to the main `index` chunk (~1423 KB → ~1471 KB, ~3%). Not worth a dedicated `manualChunks` entry — left in the main chunk (T033 → N/A).
- [X] T030 Run the FULL `tests/integration/` Playwright suite — **DONE**, single invocation. First run: 10 failed — 6 were REAL regressions from this feature and were fixed (`scenarioManager.spec.ts`'s `018-baseline-scenario-designation` `baselineStar()` helper targeted the removed Star's `aria-label`, ×4; `<TooltipTrigger asChild>` on the Switch clobbered its `data-state`, ×2, caught by the FR-001 tests). 4 were pre-existing flakes. Clean re-run: 341 passed, 4 failed — `flowmapPanel:551`, `graphicWalkerPanel:278`, `settingsModal:497` each pass in isolation (multi-worker contention); `flowmapPanel:713` is the same already-documented deck.gl hover-tooltip real-hardware-timing flake. Zero real regressions in the clean run.
- [X] T031 [P] Add a `037-scenarios-tab-redesign` entry to `CLAUDE.md` — **DONE** (item 24), covering the Part A finding, the `@dnd-kit` adoption + Principle VI analysis, `reorderScenario`/`moveScenario`, the new `scenarioRow.tsx`, the `sortableKeyboardCoordinates`-in-a-transformed-dialog finding, and the two real bugs found during the full-suite pass.
- [X] T032 Capture 037 screenshots (rows both themes, mid-drag, Switch tooltip) — **DONE**, via a temporary since-deleted spec, saved to the scratchpad directory (NOT the repo) and sent to the user. Pixel-alignment is separately proven by the passing T011/T019 `getBoundingClientRect()` assertions.
- [X] T033 [P] **N/A** — T029 showed `@dnd-kit` adds only ~48 KB (~3%) to the main chunk; no dedicated `manualChunks` rule added, no `vite.config.ts` change.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. `reorderScenario` (T003) blocks all of US1; `moveScenario` reimplementation (T004) depends on T003; T005/T006 depend on T003/T004 landing but can be written in parallel with each other.
- **US1 (Phase 3)**: depends on Foundational (needs `reorderScenario`).
- **US2 (Phase 4)**: conceptually independent of US1, but edits the same `scenarioRow.tsx` — sequenced AFTER US1.
- **US3 (Phase 5)**: same file again — sequenced AFTER US2.
- **Polish (Phase 6)**: depends on all three user stories.

### Within each user story

- Tests (T007–T011 / T017–T019 / T024) are written before / alongside the implementation and must fail first, then pass.
- T012 (row extraction, zero behavior change) before T013–T015 (which build on the extracted component).
- T013 (DndContext wrapper) before T014–T015 (the per-row handle + onDragEnd wiring that need the context).
- T020 (remove Star) before T021 (add chip) — same file region.

### Parallel opportunities

- T002 alongside T001's `npm install` finishing.
- T005 and T006 in parallel (different files: `tests/unit/appState.test.ts` vs `tests/integration/settingsModal.spec.ts`).
- All `[P]` test tasks within a single user story (T007–T011; T017–T019) — they add independent `test(...)` blocks to the same spec file, so in practice write them in one pass, but they have no ordering dependency on each other.
- T027, T028, T031, T033 in the Polish phase.

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 + Phase 2 (deps, `reorderScenario`, `moveScenario` reimpl, Part A test).
2. Phase 3 — leading-edge arrows + drag-and-drop.
3. **STOP and VALIDATE**: quickstart scenarios 1–6, 11 (both themes). A viewer can now reorder scenarios by drag or keyboard — the feature's highest-value capability — with Parts D/E not yet done.

### Incremental delivery

1. Setup + Foundational → reorder path exists, Part A locked in.
2. US1 → validate → ship (drag + keyboard reorder MVP).
3. US2 → validate → ship (single baseline chip).
4. US3 → validate → ship (Switch tooltip).
5. Polish → full regression, `CLAUDE.md`, quickstart, screenshots.
