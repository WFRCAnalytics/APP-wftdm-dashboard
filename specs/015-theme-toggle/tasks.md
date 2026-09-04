---

description: "Task list template for feature implementation"
---

# Tasks: Light/Dark Theme Toggle

**Input**: Design documents from `/specs/015-theme-toggle/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/theme-toggle.md, quickstart.md — all present.

**Tests**: Included — every prior feature in this project has included test tasks; this feature follows that established convention, not the template's own generic "optional" default.

**Organization**: Tasks are grouped by user story (spec.md's three priorities, P1–P3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Exact file paths are included in every task description

## Path Conventions

Single project — `src/`, `tests/` at repository root (plan.md's own Project Structure), unchanged from every prior feature. No new top-level directory, no new dependency.

---

## Phase 1: Setup

- [X] T001 [P] Verify no new `package.json` dependency is needed: confirm the installed `lucide-react` package exports `Monitor`, `Sun`, and `Moon`, and that `src/components/ui/tabs.tsx` already exists (research.md §6). No file change expected — a verification step, not implementation. Confirmed: `node_modules/lucide-react/dist/esm/icons/{monitor,sun,moon}.js` all present; `src/components/ui/tabs.tsx` already exports `Tabs`/`TabsList`/`TabsTrigger` (Radix `@radix-ui/react-tabs`, `data-[state=active]` styling already wired).

**Checkpoint**: Confirmed the entire feature can be built from already-installed dependencies.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pre-mount flash fix every user story's "boot matches OS preference, no visible flash" claim (SC-001/SC-002) depends on — independent of whether `themeToggle.tsx` exists yet (research.md §3).

**⚠️ CRITICAL**: No user story's boot-time acceptance scenario can be verified as flash-free until this phase is complete.

- [X] T002 Add the pre-mount flash-prevention line to `src/main.tsx`, before the first `await` (`await initDuckDB()`) — reads `window.matchMedia('(prefers-color-scheme: dark)')` and applies/removes the `dark` class on `document.documentElement` synchronously (research.md §3, contracts/theme-toggle.md). This is a one-shot application only — it establishes no ongoing tracking of its own; that's `themeToggle.tsx`'s job (Phase 3).

**Checkpoint**: The real, confirmed pre-mount flash gap (research.md §3) is closed. User story implementation can begin.

---

## Phase 3: User Story 1 - Dashboard opens matching the viewer's system theme (Priority: P1) 🎯 MVP

**Goal**: A viewer's OS-level `prefers-color-scheme` is reflected automatically on load, with no manual action, and continues tracking live while no manual override is active.

**Independent Test**: Per spec.md — with `prefers-color-scheme` emulated `dark`, load fresh, confirm every dark-mode token pairing is in effect with no interaction; repeat with `light`; confirm a live OS-preference change updates the app without a reload.

### Tests for User Story 1 ⚠️

> Write these first; confirm they fail (no control exists yet, and — before T002 — no pre-mount application exists either) before proceeding to implementation below.

- [X] T003 [P] [US1] Integration test in `tests/integration/themeToggle.spec.ts` (new file) — using `page.emulateMedia({ colorScheme: 'dark' })` before navigation, boot the app fresh and assert `document.documentElement` carries the `dark` class; repeat with `colorScheme: 'light'` and assert it's absent (Acceptance Scenarios 1–2, FR-003). Confirmed red before T005 existed (`themeToggle.tsx`/`ThemeToggle` not found); green after.
- [X] T004 [US1] Integration test — boot with `colorScheme: 'light'`, then call `page.emulateMedia({ colorScheme: 'dark' })` again post-load while the control remains in its default System mode; assert the `dark` class appears without a reload (Acceptance Scenario 3, FR-004). **Empirically confirmed** (quickstart.md's flagged item): the pinned Playwright/Chromium version DOES fire `matchMedia`'s `'change'` event for a post-load `emulateMedia()` call — this test passed on the first real run against the implementation (T005), no alternative verification technique was needed.

### Implementation for User Story 1

- [X] T005 [US1] Implement `src/layout/themeToggle.tsx` (new file) per contracts/theme-toggle.md in full: exported `ThemeMode` type (`'system' | 'light' | 'dark'`); `useState<ThemeMode>('system')`; the single effect that both resolves+applies the effective theme and manages the `matchMedia` `'change'` listener's lifecycle, scoped to `mode` via the dependency array and the effect's own cleanup function (research.md §5 — attached only while `mode === 'system'`, torn down on every transition away, never a long-lived listener with an internal no-op guard); `Tabs`/`TabsList`/`TabsTrigger` UI (`components/ui/tabs.tsx`) with one trigger per mode, each carrying a `lucide-react` icon (`Monitor`/`Sun`/`Moon`) and a visible text label. Makes T003 pass for both boot directions and T004 pass for the live-tracking case. `npx tsc --noEmit` clean. Depends on: T001 (confirms icons/Tabs available). One addition beyond the contract sketch: `aria-label="Theme"` on `TabsList` — needed so tests (and any future a11y tooling) can disambiguate this tablist from `navBar.tsx`'s own unlabeled one, the same two-independent-`role="tablist"`-regions situation `014-graphic-walker-panel`'s `dashboardShell.spec.ts` fix already established a precedent for.
- [X] T006 [US1] Mount `<ThemeToggle />` in `src/layout/shell.tsx`'s header: replace the bare `<ScenarioLoader />` in the header's right-hand slot with `<div className="flex items-center gap-3"><ScenarioLoader /><ThemeToggle /></div>` (research.md §7) — `NavBar` stays the header's left-hand child, `justify-between` unchanged. Depends on: T005.

**Checkpoint**: User Story 1 fully functional and independently testable (T003–T004 pass). This is the MVP — the primary gap named in the feature request (the app is always light regardless of OS) is closed.

---

## Phase 4: User Story 2 - Viewer manually overrides the theme (Priority: P2)

**Goal**: A viewer can force Light or Dark regardless of OS preference, and that choice holds priority over any subsequent OS-level change, with no loss of any panel's in-progress local state.

**Independent Test**: Per spec.md — with any OS preference active, select the opposite explicit mode via the control, confirm the whole app (chrome and every open panel, including a `graphic-walker` panel) restyles immediately and stays on that choice even if the OS preference changes afterward.

### Tests for User Story 2 ⚠️

- [X] T007 [P] [US2] Integration test — with `colorScheme: 'dark'` emulated (system default applied), select "Light" via the control; assert the `dark` class is removed immediately, overriding the emulated OS preference (Acceptance Scenario 1, FR-005).
- [X] T008 [US2] Integration test — with "Dark" manually selected, call `page.emulateMedia({ colorScheme: 'light' })` afterward; assert the `dark` class remains present (the manual choice holds, and — per research.md §5 — no listener is attached to react to the change at all while `mode !== 'system'`) (Acceptance Scenario 2, FR-005).
- [X] T009 [US2] Integration test — on a tab with a `graphic-walker` panel, drag a field onto a shelf (reusing `graphicWalkerPanel.spec.ts`'s own real, confirmed rbd-keyboard-drag technique, duplicated locally rather than imported since the original helper isn't exported) to create in-progress local state, then toggle the theme mode via the control; assert the panel's chrome restyles (light↔dark) AND the field is still on the shelf — no remount, no state loss (Acceptance Scenario 3, FR-009/FR-011).

### Implementation for User Story 2

No new implementation — `themeToggle.tsx`'s single effect (T005) already has to handle the Light/Dark branches correctly from construction, since Theme Mode's three branches are not separable into independent increments (the same relationship `014-graphic-walker-panel`'s US2/US3 had to its own US1's implementation). Confirmed: T007–T009 all passed against the unmodified T005 implementation.

**Checkpoint**: User Stories 1 and 2 both independently functional (T003–T004 and T007–T009 all pass).

---

## Phase 5: User Story 3 - Viewer returns to following the system automatically (Priority: P3)

**Goal**: A viewer who previously forced a specific appearance can select "System" again and immediately resume OS-preference tracking.

**Independent Test**: Per spec.md — after manually selecting "Light" or "Dark", select "System" again and confirm the dashboard's appearance immediately reflects the current OS preference and resumes tracking it live.

### Tests for User Story 3 ⚠️

- [X] T010 [P] [US3] Integration test — with "Dark" manually selected under an emulated `light` OS preference, select "System" again; assert the app immediately switches back to light, and that a subsequent `page.emulateMedia({ colorScheme: 'dark' })` call is now tracked live again (Acceptance Scenario 1) — confirms a fresh listener was actually re-attached (research.md §5), not just that the class briefly matched by coincidence.
- [X] T011 [US3] Integration test — at each of the three states (System/Light/Dark), assert exactly one `TabsTrigger` shows the active-state indicator (`data-state="active"`) matching the current mode (Acceptance Scenario 2, FR-008).

### Implementation for User Story 3

No new implementation — same reasoning as Phase 4: re-entering System mode is the same effect branch (T005) exercised in the opposite direction, and `Tabs`' own active-trigger styling already satisfies FR-008 for free (research.md §6). Confirmed: T010–T011 both passed against the unmodified T005 implementation.

**Checkpoint**: All three user stories independently functional — no new implementation since Phase 3; Phases 4–5 are pure verification, confirming behavior `themeToggle.tsx`'s single effect already had to get right.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Coverage for the edge cases and constraints that span all three user stories (no-persistence-across-reload, no-cross-tab-sync, tab-switch survival) plus final verification and documentation.

- [X] T012 [P] Integration test — with "Dark" manually selected, reload the page; assert the control resets to "System" and the app reflects whatever the emulated OS preference currently is — the manual override does not survive (Edge Cases, FR-006/FR-007, constitution Principle VI). This is the feature's one real, accepted limitation — the test confirms the reset happens, not that it doesn't.
- [X] T013 [P] Integration test — using two separate `BrowserContext`s (or pages), manually override the theme in one; assert the other is unaffected (Edge Cases — no cross-tab synchronization).
- [X] T014 [P] Integration test — with a manual override active, switch dashboard tabs (a real mount/unmount of `DashboardRenderer`); assert the theme stays as selected (`ThemeToggle` lives in `shell.tsx`'s header, outside `DashboardRenderer`, so it never unmounts on a tab switch).
- [X] T015 Run the existing `dashboardShell.spec.ts` suite to confirm zero regression from the `shell.tsx` header layout change (T006 — `ScenarioLoader` and `ThemeToggle` now share one wrapper `div`) — verify empirically rather than assume no existing assertion depends on the header's exact child structure. Confirmed: 4/4 pass unchanged.
- [X] T016 [P] Run `npx tsc --noEmit` — zero errors across every new/modified file. Clean.
- [X] T017 [P] Run the full Vitest suite (`npx vitest run`) — zero regressions (no new unit tests are expected for this feature per plan.md's own Testing note — this feature has no non-trivial DOM-free logic to isolate — but the full existing suite must stay green). 22 files, 208 tests, all green — identical count to before this feature, confirming no unit-level regression.
- [X] T018 [P] Run the full Playwright suite (`npx playwright test`) — zero regressions across every existing integration spec alongside the new `themeToggle.spec.ts`. Full run: 179 total (168 pre-existing + 11 new) — 177 passed, 2 failed on first pass (`flowmapPanel.spec.ts`'s WebGL-context-loss test, `zonemapPanel.spec.ts`'s choropleth-fill-color test) — both re-run in isolation immediately after (with a stray-`chrome.exe`-process cleanup first, this project's own documented flakiness mitigation) and passed cleanly, confirming the same pre-existing GPU/resource-contention flakiness pattern already documented in `012`/`013`'s own implementation history, not a regression: neither failing test's file is anywhere near `themeToggle.tsx`/`main.tsx`/`shell.tsx`, the only files this feature touches.
- [X] T019 Update `CLAUDE.md`: `useColorScheme.ts`'s file-tree comment block currently states "No real theme-toggle UI exists in the app yet — only `src/demo/DesignTokenDemo.tsx` ... sets the class today" — now stale; update it to name `layout/themeToggle.tsx` as the real write-side consumer this hook anticipated. Add `layout/themeToggle.tsx` and the `main.tsx` pre-mount line to the `src/` file-tree block; note the `shell.tsx` header regrouping (T006).
- [ ] T020 Run quickstart.md's manual verification steps 1–11 against a real browser session. **Expected to remain unchecked by an implementing agent with no real browser access** — left honestly unchecked rather than marked done on an equivalence claim, matching `009-scenario-manager`'s/`010-flowmap-panel`'s/`013-zonemap-panel`'s/`014-graphic-walker-panel`'s own precedent for this exact situation. Every automated equivalent (T003–T014) does pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS the boot-time (flash-free) portion of every user story's acceptance criteria, though not the manual-override logic itself.
- **User Stories (Phase 3–5)**: All depend on Foundational completion. US2 and US3 depend on US1 (`themeToggle.tsx` must exist before either phase's tests can target it) but are otherwise pure-verification phases with no new implementation of their own — the same relationship `014-graphic-walker-panel`'s US2/US3 had to its US1.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each Phase

- Tests are written and confirmed failing before their corresponding implementation task (T003–T004 before T005).
- T006 (shell.tsx mount) depends on T005 (the component must exist to mount).
- T005 depends on T001 (confirms the icons/Tabs primitive it imports are actually available).

### Parallel Opportunities

- T003 and T004 are both new additions to the same new file (`themeToggle.spec.ts`) — matching `010`/`013`/`014`'s own precedent, `[P]` here means parallel-to-*author*, not parallel-at-Playwright-runtime (`playwright.config.js` sets `fullyParallel: false`).
- T007–T009 (US2) and T010–T011 (US3) are similarly same-file/author-parallel, runtime-serial.
- T016–T018 (typecheck/Vitest/Playwright) can run in parallel with each other and with T019 (documentation) — different processes, no shared file.

---

## Parallel Example: User Story 1

```bash
# Author T003 and T004 together (same new file, no inter-dependency):
Task: "Boot-matches-OS-preference test, both directions (T003)"
Task: "Live OS-preference-change tracking test (T004)"

# Then, once both are confirmed red:
Task: "Implement themeToggle.tsx (T005)"
Task: "Mount ThemeToggle in shell.tsx (T006)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational — CRITICAL, the flash fix).
2. Complete Phase 3 (US1: T003–T006).
3. **STOP and VALIDATE**: run T003–T004, independently confirming the app now opens matching the OS preference with no flash and tracks it live.
4. This is a legitimate, demoable MVP — the primary gap named in the feature request ("the app is always light regardless of OS") is closed.

### Incremental Delivery

1. Setup + Foundational → the pre-mount flash fix is in place.
2. Add US1 → validate independently → MVP.
3. Add US2 → validate independently (no new code — `themeToggle.tsx`'s single effect already had to handle the manual branches correctly from construction).
4. Add US3 → validate independently (no new code — re-entering System mode is the same effect exercised in the opposite direction).
5. Polish → edge-case coverage (reload reset, no cross-tab sync, tab-switch survival), full-suite verification, `CLAUDE.md` audit, manual quickstart.

Unlike `013-zonemap-panel` (where US3 added real new implementation) but very much like `014-graphic-walker-panel` (whose US2/US3 were both pure verification), this feature's entire implementation surface is concentrated in Phase 2 (Foundational) and Phase 3 (US1) — Theme Mode's three branches are one small, atomic effect that cannot be meaningfully built as separate increments; splitting the *tests* by user story still gives each priority level an independently-checkable slice even though the *code* does not split the same way.

---

## Completion

Feature complete when all 20 tasks are checked and Phase 6's three
automated-suite tasks (T016–T018) pass with zero regressions. T020
(manual quickstart walkthrough) is expected to remain unchecked by an
implementing agent with no real browser access — a human reviewer
completes it before merge, matching established project precedent.

## Post-completion revision: control shape changed from `Tabs` to icon-only `DropdownMenu`

Raised, after all 20 tasks above were already complete and verified: the
originally-shipped three-always-visible-button `Tabs` control sits next to
`ScenarioLoader`, which is variable-width in WEB deployment mode (grows by
one chip per locally-loaded scenario) — three permanently-reserved buttons
next to it was flagged as a real header-crowding risk, not hypothetical.
The user also asked for a dropdown or switch shape specifically.

**Resolved**: a true Radix `Switch` was checked and rejected first — it's
strictly binary, with no way to represent "System" as a third state at all
(dropping it would undo the whole three-state rationale spec.md's
Assumptions already committed to). Rebuilt as a compact, icon-only
`DropdownMenu` trigger (new `components/ui/dropdown-menu.tsx` primitive,
`@radix-ui/react-dropdown-menu`) instead — the trigger button shows the
current mode's icon at a glance; opening it lists System/Light/Dark with a
checkmark on the active one. Full reasoning and rejected alternatives (a
cycling single-button toggle, icon-only `Tabs`, `Tooltip`-on-trigger)
recorded in research.md §6.

**What changed**:
- `T005`/`T006`'s deliverable (`src/layout/themeToggle.tsx`) rewritten —
  the single resolve/track effect (research.md §5) is byte-for-byte
  unaffected; only the returned JSX changed.
- New file: `src/components/ui/dropdown-menu.tsx` (hand-authored, matching
  `dialog.tsx`/`tabs.tsx`/`tooltip.tsx`'s existing pattern — not shadcn CLI
  output).
- New `package.json` dependency: `@radix-ui/react-dropdown-menu` (`^2.1.2`)
  — confirmed already present transitively and React-18-compatible before
  adding it directly; `npm install` resolved cleanly, no peer warning.
- `T003`/`T004`/`T007`–`T014` (all of `themeToggle.spec.ts`) rewritten to
  target the dropdown's real ARIA roles (`menu`/`menuitemradio`) and the
  trigger's `aria-label` instead of `Tabs`' `data-state`/`aria-selected` —
  same 11 assertions in substance, same coverage per acceptance scenario,
  new locators only.
- `shell.tsx` (T006) and `main.tsx` (T002) — **unaffected**, no change from
  this revision; placement and the pre-mount flash fix are both independent
  of the control's own visual shape.

**Re-verification after the revision**: `npx tsc --noEmit` clean;
`themeToggle.spec.ts` 11/11 green (same count as before — same scenarios,
new locators); `dashboardShell.spec.ts` 4/4 green (header layout structure
unaffected — still one wrapper `div`, just a different child inside it);
`npx vitest run` 208/208 unchanged; full `npx playwright test`: 179 total
(168 pre-existing + 11 revised) — 177 passed on the first run, 2 failed
(`flowmapPanel.spec.ts`'s WebGL-context-loss test,
`zonemapPanel.spec.ts`'s choropleth-fill-color test) and both passed
cleanly when re-run in isolation immediately after (with the same stray-
`chrome.exe` cleanup this project already documents as a mitigation) —
confirmed the same pre-existing GPU/resource-contention flakiness pattern
`012`/`013` already established, not a regression: neither failing test's
file is anywhere near any file this revision touched.

Updated to match: `research.md` §6 (full finding, retitled, original
`Tabs` decision kept as historical record per this project's own
precedent of documenting a real reversal rather than rewriting history —
`014-graphic-walker-panel`'s `embedGraphicWalker` → `<GraphicWalker>` JSX
reversal), `contracts/theme-toggle.md` (shape sketch + two Given/When/Then
bullets + Non-goals), `quickstart.md` (Prerequisites + steps 4/8/9 +
Automated coverage bullets), `plan.md` (Primary Dependencies, Project
Structure, a new "Post-shipping re-check" Constitution Check paragraph),
`CLAUDE.md` (the `themeToggle.tsx` tree entry, the `components/ui/` tree
entry).

## Post-completion micro-revision: trigger button `variant="ghost"`, not `variant="outline"`

Following the `DropdownMenu` revision above, five real, interactive
prototypes of the trigger/menu shape were built as a standalone HTML
comparison artifact (real WFRC tokens, real `shell.tsx` header context
including `ScenarioLoader`'s own scenario chips, one shared Theme Mode
driving all five) so the choice was made by comparing working
interactions, not screenshots or guesses — a ghost icon dropdown, an
icon+label dropdown, an icon-only segmented group, a sliding pill switch,
and a single cycling button. One real bug was found and fixed during that
comparison itself: the artifact's own card container had `overflow:
hidden` (to keep a child's corners visually rounded), which was clipping
the dropdown menu positioned inside it before it could render at all —
fixed by moving the corner-rounding onto the header element instead of
the card, the same category of "child needs to render outside the
parent's box" fix `panelExpandHost.tsx` (004) already had to solve once
for a different, unrelated reason.

**Picked**: the ghost icon dropdown — `Button` `variant="ghost"` in
`themeToggle.tsx`'s trigger, replacing the originally-sketched
`variant="outline"`. No structural change (`DropdownMenu`/
`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuRadioGroup`/
`DropdownMenuRadioItem`, `aria-label`, icon-per-mode trigger all
unchanged) — a single Tailwind variant prop.

Re-verified: `npx tsc --noEmit` clean; `themeToggle.spec.ts` 11/11 green
unchanged (none of the 11 assertions target CSS variant); `npx vitest run`
208/208 unchanged. Full Playwright suite not re-run for this specific
change — a single, statically-typed variant-prop string with no ARIA/DOM-
structure/behavioral surface, already exercised unchanged by the same
11 tests that passed against the `DropdownMenu` revision immediately
before it.

Updated to match: `research.md` §6 (a new "Final trigger styling chosen"
closing note), `contracts/theme-toggle.md` (the code sketch's `variant`
prop).
