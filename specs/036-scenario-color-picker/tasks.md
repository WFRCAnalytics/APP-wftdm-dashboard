---

description: "Task list for 036-scenario-color-picker"
---

# Tasks: Deployer Scenario Palette & Redesigned Color Picker

**Input**: Design documents from `/specs/036-scenario-color-picker/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/scenario-color-resolution.md, quickstart.md

**Tests**: Included throughout, matching this project's established convention (every prior feature ships unit + Playwright coverage as a normal part of implementation).

**Organization**: Part A (US1) and Part B (US2) are unusually independent this time — confirmed during planning that they touch almost entirely disjoint files (US1: `yamlLoader.ts`/`scenarioDisplay.ts`/`useScenarioDisplay.ts`/`main.tsx`; US2: two new `components/ui/` primitives + a new composition component + `scenariosTab.tsx`). The one shared touchpoint is `useScenarioDisplay()` itself, which US2's swatch reads from but does not modify — so Foundational is intentionally thin (baseline confirmation only), and either story can be built and shipped first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (deployer palette) or US2 (redesigned picker)
- Paths are repo-relative from `D:\GitHub\APP-wftdm-dashboard`

---

## Phase 1: Setup

- [X] T001 Confirm clean baseline — **DONE**. `npm run typecheck` clean; `npm run test:unit` 426/426 passing (31 files) before any change.

---

## Phase 2: Foundational

**Purpose**: Deliberately thin — per plan.md's own confirmation, US1 and US2 share no real blocking infrastructure beyond what `035-scenario-label-color` already built. This phase exists only to record that baseline is already sufficient.

- [X] T002 Confirm `035`'s existing color infrastructure works — **DONE**. `npx playwright test tests/integration/scenarioColorOverride.spec.ts` 3/3 passing, recorded as this feature's own pre-change baseline.

**Checkpoint**: Both stories can now proceed, in either order or in parallel.

---

## Phase 3: User Story 1 - A deployer sets a consistent, on-brand scenario palette (Priority: P1) 🎯 MVP

**Goal**: Replace `035`'s "manifest color is the default" with a three-tier chain — viewer override → deployer-configured `scenarioPalette` → shipped `--chart-1..5` default — via one surgical change to `hooks/useScenarioDisplay.ts`'s own resolution line.

**Independent Test**: Configure `scenarioPalette` in a test `dashboard-config/index.json`, load two scenarios with no override, confirm each renders the configured palette color (cycled by registration order) consistently across Plotly/Recharts/Observable Plot; remove the config and confirm the shipped `--chart-1..5` default takes over. Fully testable without any US2 work.

### Tests for User Story 1

- [X] T003 [P] [US1] Extend `tests/unit/scenarioDisplay.test.ts` — **DONE**. 5 new tests (11 total in file): cycles by index; wraps around; falls back to `DEFAULT_PALETTE` when unset; empty-array palette also falls back (no crash); clearing back to `undefined` restores the default. `afterEach` resets the module-level palette state between tests.
- [X] T004 [US1] Extend `tests/integration/scenarioColorOverride.spec.ts` — **DONE**, with substantial real rework beyond the original plan. A real, confirmed finding while writing this: `035`'s own 3 existing tests in this file asserted the RETIRED "manifest color is the default" behavior — this is Part A's own EXPLICIT, deliberate revision (spec.md's own framing), so those 3 tests were rewritten, not left stale. 8 tests total: 6 new US1 cases (quickstart Scenarios 1/2/5, override-still-wins, wraparound, theme-flip reactivity) using a new `bootWithScenarioPalette()` helper (real `page.route()` interception of `dashboard-config/index.json`, mirroring `dashboardShell.spec.ts`'s own established precedent for the identical file/coi-serviceworker-collision reason) and a new `resolveCssColor()` probe helper (browser-computed color resolution, never a hardcoded/guessed rgb string); 2 retained/updated US2 (`035`) cases confirming cross-panel consistency and override-then-clear still work end-to-end through the new resolution chain. One real test-design correction made live: a first draft of the wraparound test hardcoded an assumed registration index (`2 % 2`) that didn't match the real fixture's actual index (3, since `broken_scenario` also registers) — fixed by reading the live index via a new `scenarioIndex()` helper instead of asserting a guessed value, and simplifying to a single-entry palette that forces wraparound for any index `>= 1` without needing to know the exact value.

### Implementation for User Story 1

- [X] T005 [US1] Extend `src/services/yamlLoader.ts` — **DONE**, exactly as planned.
- [X] T006 [US1] Extend `src/panels/scenarioDisplay.ts` — **DONE**, exactly as planned.
- [X] T007 [US1] Extend `src/hooks/useScenarioDisplay.ts` — **DONE**, exactly as planned (data-model.md §3, research.md §4).
- [X] T008 [US1] Extend `src/main.tsx` — **DONE**, exactly as planned (research.md §3).
- [X] T009 [US1] Run `npx vitest run tests/unit/scenarioDisplay.test.ts` — **DONE**, 11/11 passing.
- [X] T010 [US1] Run `npx playwright test tests/integration/scenarioColorOverride.spec.ts` — **DONE**, 8/8 passing. Also spot-checked `settingsModal.spec.ts`'s 3 existing `035` swatch tests: still pass, but a real, expected, temporary inconsistency was confirmed and noted for US2 to resolve — `scenariosTab.tsx`'s own current native swatch reads `s.colorOverride ?? s.color` DIRECTLY (bypassing `useScenarioDisplay()` entirely, a pre-existing `035` implementation detail), so until US2 replaces it, the Settings-tab swatch still shows the retired manifest color while every chart already shows the new palette-resolved color. Expected and acceptable given the two stories' own confirmed independence (plan.md's Summary) — not a regression to fix within US1.

**Checkpoint**: User Story 1 fully functional and independently testable/shippable.

---

## Phase 4: User Story 2 - A viewer picks an exact color via swatch, hex, or RGB (Priority: P2)

**Goal**: Replace `035`'s plain native `<input type="color">` swatch with a proper popover-hosted color picker (adapted from the real `shadcnblocks/kibo` package) offering a 2D selection area, hue/alpha sliders, an eyedropper, and genuinely editable hex/RGB fields, all synchronized to the same `colorOverride` value.

**Independent Test**: Open the redesigned Scenarios tab, open a scenario's picker, type a hex code, confirm every surface (2D area, sliders, RGB fields) updates to match and every chart reflects it; separately change an RGB field and confirm the same in reverse. Fully testable without any US1 work (writes to the same `colorOverride` `035` already built).

### Tests for User Story 2

- [X] T011 [P] [US2] Create `tests/unit/colorFormat.test.ts` — **DONE**. 12 tests: clampByte (in-range/below-0/above-255/fractional-rounds/NaN-treated-as-0), parseHexColor (6-digit with/without `#`, 3-digit shorthand, case-insensitive, null for incomplete/invalid/empty).
- [X] T012 [US2] Extend `tests/integration/settingsModal.spec.ts` — **DONE**. Replaced the entire prior `035` "Custom scenario color" describe block (its own native-`<input type="color">`-specific assertions, now testing a control that no longer exists) with 4 new tests for the redesigned picker: swatch preview via the shipped-default resolution chain, hex-entry + Reset-to-default, RGB-field entry, and gone-after-reload. Existing US3 (reorder)/US4 (label) blocks confirmed untouched and still passing.
- [X] T013 [US2] Extend `tests/integration/scenarioColorOverride.spec.ts` — **DONE** (folded into T004's own rework rather than a separate pass, since both touch the same file in the same session) — invalid-hex and RGB-clamp coverage landed as dedicated `colorFormat.test.ts` unit cases (T011) instead, a more precise, faster place to prove FR-014/FR-015 than a full browser round-trip; the integration suite's own job (confirmed via T012 above) is proving the valid-input path reaches `appState` correctly.

### Implementation for User Story 2

- [X] T014 [US2] `npm install color @radix-ui/react-slider @radix-ui/react-popover` (+ `@types/color` dev) — **DONE**. One real addition beyond the original task list: `@radix-ui/react-popover` itself was missing from this task's own dependency list (a planning oversight, not a discovery mid-build) — installed alongside the other two, confirmed in `package.json`.
- [X] T015 [P] [US2] Create `src/lib/colorFormat.ts` — **DONE**, exactly as planned.
- [X] T016 [US2] Create `src/components/ui/popover.tsx` — **DONE**, exactly as planned.
- [X] T017 [US2] Create `src/components/ui/color-picker.tsx` — **DONE**, with two real, confirmed bugs found and fixed via direct runtime verification before they ever reached a test: (1) `Color.hsl(h, s, l, alpha/100)`'s 4-arg form silently DROPS alpha (confirmed via a live Node REPL check against the actual installed `color` package — always returns `alpha() === 1` regardless of the 4th argument) — the real source's own chained `.hsl(h,s,l).alpha(a)` form is the only one that works; my own first draft introduced the broken 4-arg form in `ColorPickerFormat` specifically (the real source's `onChange` effect already used the correct chained form, faithfully copied) — fixed to match. (2) A genuine circular-update bug in the fully-round-tripped `value`+`onChange` usage this project's own `scenarioColorControl.tsx` needs (the real kibo source never does this — its own example renders `<ColorPicker>` uncontrolled) — found live via three iterations of Playwright reproduction, not assumed: committing a local edit fires `onChange` → the caller writes to `appState` → the resolved color echoes back as a new `value` prop → the sync effect re-derives hue/saturation/lightness FROM that echo, which (a) re-fires `onChange` with the same value, instantly undoing a "Reset to default" click by re-creating the override it just cleared, and (b) for RAPID sequential edits (R then G then B), a STALE echo of an EARLIER edit can overwrite a newer one before it commits. Fixed with two complementary refs: `lastEmittedHex` (skip the value-sync entirely when the incoming value matches what this component itself most recently emitted — an echo, not a genuine external change) and `isSyncingFromValue` (suppress `onChange` firing as a REACTION to any value-driven sync, echo or genuine reset alike). Verified stable across 3 consecutive full test runs, not just one passing attempt.
- [X] T018 [US2] Create `src/layout/settings/scenarioColorControl.tsx` — **DONE**, exactly as planned.
- [X] T019 [US2] Extend `src/layout/settings/scenariosTab.tsx` — **DONE**, exactly as planned. Confirmed `X` (lucide icon) import still needed elsewhere in the file (the remove-scenario button) — not removed.
- [X] T020 [US2] Run `npx vitest run tests/unit/colorFormat.test.ts` — **DONE**, 12/12 passing.
- [X] T021 [US2] Run `npx playwright test tests/integration/settingsModal.spec.ts tests/integration/scenarioColorOverride.spec.ts` — **DONE**, 50/50 passing (full files, both US1-036 and US2-035/036 content, zero regressions).

**Checkpoint**: Both user stories independently functional. Neither modified the other's own acceptance path — re-run T010 to confirm US1 still passes after US2's `scenariosTab.tsx` edit.

---

## Phase 5: User Story 3 - A viewer scans scenario status at a glance, toggles one off, and finds the baseline immediately (Priority: P2)

**Goal**: A real, additive UI/UX refinement of the Scenarios tab row itself (Part C, folded into this same feature after Parts A/B had already shipped) — a genuinely prominent per-row status treatment, an active/inactive `Switch` wired directly to `state/appState.ts`'s existing `active`/`setActive()`, and a "Baseline" text `Badge` replacing the `Star` icon as the primary baseline indicator. Does not touch Parts A/B's own shipped mechanisms (palette resolution, the color picker) at all.

**Independent Test**: Open the redesigned Scenarios tab; confirm each row shows a distinct border/background treatment for `ready`/`failed`/`registering`, verified in both themes; toggle a scenario's `Switch` off and confirm a `$scenario.`-driven panel's query immediately excludes it (via existing `useActiveScenarios()` reactivity), then toggle back on and confirm it's included again; confirm the baseline scenario shows a "Baseline" badge next to its name, and that clicking another row's own baseline control moves the badge. Fully testable without any Part A/B work (reuses `switch.tsx`/`badge.tsx`/`appState.ts` verbatim, extends `scenarioStatusColor.ts` only).

### Tests for User Story 3

- [X] T028 [P] [US3] Extend `tests/unit/scenarioStatusColor.test.ts` — **DONE**. 4 new cases in a nested "row-level status treatment (Part C)" describe block: `rowBorderClassName`/`rowBackgroundStyle` for `ready`/`failed`/`registering`, plus a guard confirming no `rowBorderClassName` ever contains a slash-opacity modifier.
- [X] T029 [US3] Extend `tests/integration/settingsModal.spec.ts` — **DONE**. New "User Story 3 (036-scenario-color-picker Part C)" describe block, 3 tests: (a) `getComputedStyle()` border/background assertions in both themes (toggling `document.documentElement.classList` directly, matching this file's own established pattern) confirming ready vs. failed rows are visually distinct and neither is fully transparent; (b) the active-toggle round-trip against `row_scenario_display`'s table panel (4→2→4 rows); (c) the Baseline badge's presence and movement, with the `Star` button's own `aria-pressed` re-confirmed unchanged.

### Implementation for User Story 3

- [X] T030 [US3] Extend `src/layout/settings/scenarioStatusColor.ts` per data-model.md §6 — **DONE**, exactly as planned.
- [X] T031 [US3] Extend `src/layout/settings/scenariosTab.tsx` — **DONE**, exactly as planned, plus one real, minor layout correction found live: the identity block's label `<input>` needed `min-w-0 flex-1` added (it previously relied on the parent's own `min-w-0 flex-1` alone) once it became a flex sibling of the new conditional `Badge`, so a long label still truncates correctly instead of pushing the badge off-row.
- [X] T032 [US3] Run `npx vitest run tests/unit/scenarioStatusColor.test.ts` — **DONE**, 8/8 passing (4 existing + 4 new).
- [X] T033 [US3] Run `npx playwright test tests/integration/settingsModal.spec.ts -g "036-scenario-color-picker Part C"` — **DONE**, 3/3 passing. One real, confirmed test-design correction made live, not assumed: the active-toggle test's first draft assumed `good_scenario` was already active by default (it isn't — `registerPublishedScenarios()` never calls `setActive()` at all, only `observed` is forced active at registration) and needed `?s=good_scenario` to reach the expected 4-row baseline, matching `scenarioColorOverride.spec.ts`'s own already-established convention for this exact fixture panel. A second correction: locating the `Switch` by its own aria-label text broke immediately after the first click (the label flips between "Exclude..."/"Include..." with the toggle's own state) — fixed by locating it via row identity (the status dot's parent) instead.

**Checkpoint**: User Story 3 fully functional and independently testable/shippable. Re-run T010/T021 to confirm Parts A/B are unaffected by this row-layout change.

### User Story 3, refinement — real research-grounded redesign (folded in immediately after, same phase)

Direct research (GitHub's own default-branch indication, Stripe's own `default_payment_method` convention, both fetched directly) found the Badge-based baseline indicator above still ambiguous — a separate Badge and a plain Star in two different places both claiming to indicate the same thing. Real cross-industry precedent: icon+text together, one unit, never an icon alone or a label floating elsewhere.

- [X] T036 [US3] Extend `src/layout/settings/scenariosTab.tsx` — **DONE**. Removed the separate `Badge`; the baseline row now renders one `Button` (filled Star + "Baseline" text, one unit) in the Star's own existing location; every other row keeps an outline Star wrapped in a `Tooltip` reading "Set as baseline" (no persistent text). Dropped the redundant trailing `"(ready)"`/`"(failed)"` text entirely (the row border/background treatment already communicates it); `"registering"` gained a visible `treatment.label` ("Loading…") text shown inline beside the dot, since a pulsing dot alone was judged not loud enough for an in-progress state. The click-to-mark interaction itself (`onClick`/`aria-label`/`aria-pressed`) is byte-for-byte unchanged.
- [X] T037 [US3] Update `tests/integration/settingsModal.spec.ts` — **DONE**. Fixed `scenarioRow()`'s locator (the dot gained one more wrapper level for the new inline "Loading…" text); rewrote the FR-005 test's status assertion from literal `'(ready)'` text to the dot's `aria-label`; rewrote the baseline test to assert the label lives inside the same button as the Star; added a new test for the non-baseline row's outline-Star-plus-tooltip state.
- [X] T038 [US3] Before/after screenshots — **DONE**, both themes, via a temporary, since-deleted spec file and a `git apply -R`/`git apply` round-trip of this refinement's own diff (never a Part-A/B revert) to render the prior Badge-based UI for comparison. Two real findings during this step, documented in CLAUDE.md's own Part C refinement entry: a live `'registering'` row is not reliably producible via a delayed network fetch (fixed with a direct `window.__wftdm.appState.register()` call instead); a `Tooltip`'s portal-rendered content is never captured by a `locator.screenshot()` scoped to an ancestor-only container (fixed with a full-page screenshot for that one case).
- [X] T039 [US3] Full regression — **DONE**. `npm run typecheck` clean; `npm run test:unit` 447/447 (unchanged); `npm run build` clean; `settingsModal.spec.ts` 46/46; `scenarioColorOverride.spec.ts` 8/8. Full `tests/integration/` suite run twice — both runs' failures individually triaged, all traced to genuine multi-worker resource-contention flakiness or the already-documented deck.gl hover-tooltip flake (one run's own 18-failure spread was further traced to a real, self-inflicted cause: two concurrent `playwright test` invocations racing the same shared `public/` fixture files via independent `global-setup`/`global-teardown` runs — not a code regression). Zero real regressions.

### User Story 3, second refinement — a real, confirmed baseline-row alignment bug

- [X] T040 [US3] Fix `src/layout/settings/scenariosTab.tsx` — **DONE**. The Star+"Baseline"-text control is wider than a plain Star, and with the actions cluster right-aligned and the identity block absorbing the difference (`flex-1`), that width delta shifted the Switch/swatch/reorder-arrows LEFT on the baseline row specifically. Fixed by rendering the identical markup (Star + a `"Baseline"` `<span>`) on every row, with the span gaining Tailwind's `invisible` class (not conditional omission) on a non-baseline row — reserves the exact same layout width without rendering visually, deliberately avoiding a hardcoded pixel width.
- [X] T041 [US3] Update `tests/integration/settingsModal.spec.ts` — **DONE**. Two Part C tests asserted the "Baseline" text had `toHaveCount(0)` on a non-baseline row — now false, since the text node always exists (just invisible). Fixed both to assert `.not.toBeVisible()` instead, matching what they actually meant to prove.
- [X] T042 [US3] Pixel-alignment verification — **DONE**, via a temporary, since-deleted Playwright spec measuring `getBoundingClientRect()`-derived `x` positions for the Switch/swatch/first-reorder-arrow/Star across all three real fixture rows, in both themes — every value matched to sub-pixel precision, baseline row included. Screenshots confirmed the same visually.
- [X] T043 [US3] Full regression — **DONE**. `npm run typecheck` clean; `npm run test:unit` 447/447; `npm run build` clean; `settingsModal.spec.ts` 46/46. Full `tests/integration/` suite: first two attempts were corrupted by the same self-inflicted concurrent-invocation hazard T039 already documents; a clean single-invocation run returned 5 failures, all individually triaged — 1 is the same dark-mode Plotly re-query flake, the other 4 (three `flowmapPanel.spec.ts`, one `zonemapPanel.spec.ts`) passed cleanly in isolation. A separate isolated `flowmapPanel.spec.ts` run surfaced 4 different, real-UGRC-network-dependent failures — confirmed via direct `curl` that UGRC's own endpoint was genuinely unreachable at that moment (vs. a control CARTO endpoint's real `200`), an external condition, not a code regression. Zero real regressions.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 [P] Run `npm run typecheck` — **DONE**, clean.
- [X] T023 [P] Run `npm run test:unit` — **DONE**, 443/443 passing (32 files, up from 426).
- [X] T024 Run `npm run build` — **DONE**, clean, no new warning categories (the main JS chunk grew ~70KB from the 3 new dependencies, an expected size change, not a new warning class beyond the project's existing documented ones).
- [X] T025 Run the full `tests/integration/` Playwright suite — **DONE**. 321 passed, 9 failed on the full run, spread across `flowmapPanel.spec.ts` (×3), `graphicWalkerPanel.spec.ts` (×2), `observablePlotPanel.spec.ts` (×2), `rechartsPanel.spec.ts` (×1), `sankeyPanel.spec.ts` (×1). Every failure investigated individually, per this project's own "confirm before concluding" discipline: 8 of 9 passed cleanly on isolated re-run (none of these five files are touched by this feature — `useScenarioDisplay.ts`'s broader reach into every chart panel type was specifically considered a risk worth checking carefully, and confirmed clean). The 9th (`flowmapPanel.spec.ts:713`, the deck.gl hover-tooltip test) is the SAME already-documented, real-hardware-timing-sensitive flake this session's own `035` work already rigorously confirmed pre-existing via a 3-run-each comparison (2/3 pass on that branch vs. 0/3 on a clean tree) — `FlowMapPanel.tsx`/`flowmapData.ts`/`mapTooltip.ts` are untouched by this feature too, so that finding still applies unchanged. Zero real regressions found.
- [X] T026 [P] Add a `036-scenario-color-picker` implementation-order entry to `CLAUDE.md` — **DONE**, including all three real bugs found and fixed during implementation (the alpha-dropping 4-arg `Color.hsl()` call, and the two circular-update races).
- [X] T027 Run `quickstart.md`'s 8 validation scenarios end-to-end — **DONE**, via the passing automated suites that directly exercise each one (same mapping convention `035`'s own T036 used): Scenario 1 → `scenarioColorOverride.spec.ts` "a configured scenarioPalette applies consistently..."; Scenario 2 → "no scenarioPalette configured falls back..."; Scenario 3 → "a viewer override still wins outright..."; Scenario 4 → "the palette wraps around..."; Scenario 5 → "manifest color is confirmed independent..."; Scenario 6 → `settingsModal.spec.ts`'s hex-entry and RGB-field tests (swatch/hex/RGB sync); Scenario 7 → the same file's "Reset to default" coverage (folded into the hex-entry test); Scenario 8 → the existing US3 (reorder)/US4 (label) blocks, confirmed still passing unchanged in the full 50/50 run. The theme-flip edge case → `scenarioColorOverride.spec.ts`'s dedicated "a theme flip re-resolves..." test.
- [X] T034 [P] Extend the `036-scenario-color-picker` `CLAUDE.md` entry with a Part C addendum — **DONE**, including the two real test-design corrections and the reactivity non-finding (useScenarioList() already covered `active`, no fix needed).
- [X] T035 Re-run the full `tests/integration/` Playwright suite after Part C — **DONE**. 327 passed, 6 failed on the full run (333 total), spread across `dashboardShell.spec.ts` (×1), `flowmapPanel.spec.ts` (×2), `observablePlotPanel.spec.ts` (×1), `rechartsPanel.spec.ts` (×1), `zonemapPanel.spec.ts` (×1) — none in `settingsModal.spec.ts`/`scenarioColorOverride.spec.ts`/any file this Part C touches. Every failure re-run individually: 4 of 6 passed cleanly in isolation (genuine multi-worker resource-contention flakiness, not a regression); the other 2 are the SAME already-extensively-documented pre-existing flakes this project's own CLAUDE.md history already records — the dark-mode Plotly re-query-count off-by-one (`dashboardShell.spec.ts`, `Expected: 111, Received: 112`) and the deck.gl hover-tooltip real-hardware-timing-sensitive flake (`flowmapPanel.spec.ts:713`), neither touched by any Part C file (`scenarioStatusColor.ts`, `scenariosTab.tsx`). Zero real regressions.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — thin, confirms `035`'s own infrastructure is the correct starting point
- **User Story 1 (Phase 3)** and **User Story 2 (Phase 4)**: Both depend on Foundational only — confirmed independent of each other (plan.md's own Summary), can be built in either order or in parallel by separate contributors
- **User Story 3 (Phase 5)**: Depends on Foundational only, not on US1/US2 — reuses `useScenarioDisplay()`'s existing swatch resolution read-only and touches a disjoint set of files (`scenarioStatusColor.ts`, the row-level parts of `scenariosTab.tsx`) from both. Sequenced after US1/US2 here only because it was folded in later, on the same branch, after both had already shipped — not because of a real dependency.
- **Polish (Phase 6)**: Depends on all three stories being complete

### Within Each User Story

- Tests before implementation (T003–T004 before T005–T008; T011–T013 before T014–T019; T028–T029 before T030–T031)
- `scenarioDisplay.ts` (T006) before `useScenarioDisplay.ts` (T007), since the hook calls the new palette functions
- The new dependency install (T014) and pure helper (T015) before `color-picker.tsx` (T017), which needs both
- `popover.tsx` (T016) and `color-picker.tsx` (T017) before `scenarioColorControl.tsx` (T018), which composes them
- `scenarioColorControl.tsx` (T018) before the `scenariosTab.tsx` edit (T019) that renders it
- `scenarioStatusColor.ts` (T030) before the `scenariosTab.tsx` edit (T031) that consumes its new return fields

### Parallel Opportunities

- T003 (US1 unit tests) can be written alongside T011 (US2 unit tests) and T028 (US3 unit tests) — different files, different stories
- T015 (`colorFormat.ts`) and T016 (`popover.tsx`) — different files, no dependency on each other
- T022/T023/T026/T034 (Polish) — independent checks/docs

---

## Parallel Example: Cross-story

```bash
Task: "Extend tests/unit/scenarioDisplay.test.ts for palette cycling (US1)"
Task: "Create tests/unit/colorFormat.test.ts for hex/RGB parsing (US2)"
```

## Parallel Example: User Story 2 groundwork

```bash
Task: "Create src/lib/colorFormat.ts (US2)"
Task: "Create src/components/ui/popover.tsx (US2)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational)
2. Complete Phase 3 (User Story 1) — the deployer palette, fully independent of any picker UI work
3. **STOP and VALIDATE**: run quickstart.md Scenarios 1–5 manually, confirm T010 passes
4. A deployer can already set a consistent, on-brand scenario palette — the actual new capability this feature exists to deliver — with zero Part B work done

### Incremental Delivery

1. Setup + Foundational → confirmed thin, `035`'s infrastructure is sufficient
2. User Story 1 → validate independently → ship (deployer palette MVP)
3. User Story 2 → validate independently → ship (richer picker UI)
4. Polish → full regression, CLAUDE.md record, quickstart re-validation
