---

description: "Task list for Panel Expand-to-Dialog"
---

# Tasks: Panel Expand-to-Dialog

**Input**: Design documents from `/specs/004-panel-expand-dialog/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — all present

**Tests**: Included. `research.md`/`quickstart.md` explicitly name required
Playwright scenarios (not optional coverage), matching `003`'s established
practice of Playwright-only verification for anything that renders
(`research.md` §6).

**Organization**: Tasks are grouped by user story (spec.md's US1/US2/US3),
after a Foundational phase that builds the generic mechanism itself — the
portal-based single-instance relocation (research.md §1) is what makes
US2's no-reset guarantee and US3's resize correctness hold structurally,
so it is built once, before any story's tests can meaningfully run against
it, rather than re-derived per story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files/scopes, no dependency on an
  incomplete task)
- **[Story]**: US1, US2, or US3 (spec.md's priorities)
- All test tasks target the same file, `tests/integration/panelExpand.spec.ts`
  — marked `[P]` where the *scenarios themselves* are independent (no
  shared mutable fixture state between them), even though they land in one
  file; write each as its own `test(...)` block so they can be authored and
  reviewed independently.

## Path Conventions

Single-project web frontend (`src/`, `tests/` at repo root), per plan.md's
Project Structure — additive to `001`/`002`/`003`.

---

## Phase 1: Setup

**Purpose**: Add the one new dependency this feature needs.

- [x] T001 [P] Add `@radix-ui/react-dialog` (`^1.1.x`, matching the version
      line already pinned for `@radix-ui/react-tabs`/`@radix-ui/react-tooltip`
      — research.md §7) to `package.json`'s `dependencies`, then run
      `npm install` to update `package-lock.json`
      — **Done**: `^1.1.2` added, resolved to `1.1.23` installed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The generic expand mechanism itself — must exist, correctly,
before any user story's behavior can be tested against real panel cards.

**🚨 CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Create `src/components/ui/dialog.tsx` per
      `contracts/dialog-primitive.md` — hand-authored (matching
      `src/components/ui/tabs.tsx`/`tooltip.tsx`'s existing pattern, not CLI
      output): export `Dialog`, `DialogTrigger`, `DialogPortal`,
      `DialogOverlay`, `DialogContent`, `DialogClose`, `DialogTitle`,
      `DialogDescription`. `DialogContent` forwards `forceMount` (already
      covered by `ComponentPropsWithoutRef<typeof DialogPrimitive.Content>`,
      no extra plumbing needed) and sets `aria-describedby={undefined}` when
      no `DialogDescription` sibling is present, to avoid Radix's dangling-
      reference console warning
      — **Done, with a correction**: `aria-describedby` is left unset
      entirely rather than explicitly forced to `undefined` — reading
      Radix's actual source showed its own internal default already does
      this correctly, and forcing it would have broken the case where a
      `DialogDescription` *is* present (`contracts/dialog-primitive.md`).
- [x] T003 Add `data-[state=closed]:hidden` to `DialogContent`'s root
      `className` in `src/components/ui/dialog.tsx` (contracts/
      dialog-primitive.md, contracts/panel-expand-host.md) — a deliberately
      **separate, explicit task from T002**, not folded into "build the
      primitive": with `forceMount`, Radix never conditionally renders
      `Content` based on `open` at all, so without this class the
      bordered/shadowed box stays permanently visible and centered on the
      page for every panel card, whether ever expanded or not. Depends on
      T002
      — **Superseded, not simply done**: this fix was implemented and its
      dedicated test (T008) initially passed the *visibility* check, but a
      deeper problem surfaced empirically — `forceMount` on the MODAL
      `DialogContent` variant runs Radix's `hideOthers()` accessibility
      side effect unconditionally on mount (not gated on `open`),
      confirmed by reading `node_modules/@radix-ui/react-dialog/dist/
      index.mjs`, which broke every `getByRole` query for anything outside
      the currently-expanding dialog. Corrected: `forceMount` was dropped
      entirely (research.md §1a) — `DialogContent` now mounts/unmounts
      normally, so there is no permanently-present box to hide via CSS at
      all. T008's test still exists and still passes, now proving the
      simpler, actually-correct property ("no `DialogContent` in the DOM
      at all until expanded") rather than the CSS-hide property originally
      planned.
- [x] T004 Create `src/layout/panelExpandHost.tsx` per `contracts/
      panel-expand-host.md` — accepts `{ title: string; children: ReactNode }`
      (exactly one `<PanelComponent config={config} />` element, no
      awareness of panel types); local `expanded`/`inlineHost`/`dialogHost`
      state (callback refs, `useState`-backed so both slots are available
      synchronously once mounted); expand trigger `Button`
      (`variant="ghost" size="icon"`, `lucide-react`'s `Maximize2`,
      `aria-label="Expand {title}"`); `Dialog open={expanded}
      onOpenChange={setExpanded}` wrapping a `forceMount`-ed `DialogContent`
      (`w-[95vw] h-[90vh] max-w-[1600px]`) containing a visible `DialogTitle`
      and the `dialogHost` slot; portals `children` to
      `expanded ? dialogHost : inlineHost` via `ReactDOM.createPortal`.
      Depends on T002, T003
      — **Done, as a hook (`usePanelExpandHost`) returning `{ trigger,
      body }`, not a component** (contracts/panel-expand-host.md's shape
      correction) — required because the trigger belongs in `CardHeader`
      and the content in `CardContent`, two different tree locations one
      component invocation can't serve. **The portal mechanism itself was
      also corrected**: swapping `createPortal`'s target between renders
      (as originally planned) was empirically found to unmount/remount
      `children` on every expand/collapse — proven via a query-count log
      jumping on both transitions and a container-identity marker
      attribute being lost. Replaced with the proven technique (same one
      `react-reverse-portal` uses): `children` portals into one
      `document.createElement('div')` created once and never replaced;
      that node is imperatively `appendChild`-moved between two ordinary
      anchor elements in a `useLayoutEffect` (research.md §1b — the
      feature's most significant implementation-time correction). Also
      added: an `options.height` third parameter (sizes the inline anchor
      to `config.height`, a common `PanelConfig` field) and an explicit
      `onCloseAutoFocus` handler on `DialogContent` (Radix's own
      `triggerRef`-based focus-return no-ops here, since `trigger` isn't a
      `<DialogTrigger>`).

**Checkpoint**: The mechanism exists and is structurally correct (stable-
container relocation via imperative DOM move, no duplicate mount, no
forceMount) — not yet wired into any real panel card. All corrections
above were found and fixed *before* T010 wired it into `panelCard.tsx`,
verified via the full `panelExpand.spec.ts` suite passing (16/16), not
left for a later phase to discover.

---

## Phase 3: User Story 1 - Expand a panel to a large view (Priority: P1) 🎯 MVP

**Goal**: Any panel card — every current and future registry type — shows
an expand trigger that opens its content in a large, near-fullscreen,
fully-accessible dialog, closable three ways, with focus correctly managed.

**Independent Test**: Load a dashboard tab, click the expand control on any
panel (value box and chart both), confirm the same content renders large;
close it via Escape, outside-click, and the explicit close control in turn,
confirming focus returns to the trigger each time.

### Tests for User Story 1

> Write these first; they should fail against Phase 2's mechanism alone
> (nothing is wired into `panelCard.tsx` yet) and pass once T010 lands.

- [x] T005 [P] [US1] Playwright test in `tests/integration/panelExpand.spec.ts`:
      clicking a panel's expand trigger opens a dialog showing the same
      rendered content — covering both a `valuebox` panel and a `plotly`
      panel from the fixture data, asserting neither is treated as a
      special case (spec.md's explicit no-opt-out requirement)
- [x] T006 [P] [US1] Playwright test in `tests/integration/panelExpand.spec.ts`:
      each of Escape, clicking outside the dialog (on the backdrop), and
      activating the explicit close (×) control closes the dialog; after
      each, keyboard focus is back on that panel's expand trigger button
      (FR-004, FR-006)
      — split into 3 separate `test()` blocks (Escape/outside/close), each
      independently pinpointing which close path broke if one regresses.
      The outside-click test needed one addition: waiting for Radix's own
      focus-on-open to have actually landed inside the dialog before
      clicking outside — its outside-pointerdown listener attaches in a
      passive effect that can run one tick after the dialog is already
      visually visible.
- [x] T007 [P] [US1] Playwright test in `tests/integration/panelExpand.spec.ts`:
      while a dialog is open, repeated `Tab`/`Shift+Tab` cycles only through
      elements inside it (its own close control, whatever the panel's
      content renders) — focus never lands on anything behind the overlay
      (FR-005)
- [x] T008 [US1] Playwright test in `tests/integration/panelExpand.spec.ts`:
      on a dashboard tab where no panel has ever been expanded, assert via
      computed style or bounding box (not a screenshot-only check) that
      every `DialogContent` root is not visible/painted — quickstart.md
      scenario 9, verifying T003's fix directly rather than relying on any
      interaction-based test to incidentally catch a regression of it
      — **This test is what caught T003/T004's `forceMount` correction**:
      it initially passed against the CSS-hide fix, but once the deeper
      `hideOthers()` accessibility bug surfaced (via T005/T006 timing out),
      it was rewritten to assert the now-correct, simpler property —
      `role="dialog"` count is 0 — since `forceMount` was dropped and
      there's nothing left to CSS-hide.
- [x] T009 [P] [US1] Playwright test in `tests/integration/panelExpand.spec.ts`:
      expand a chart-type panel with a visible legend, click one legend
      entry, and assert (a) the corresponding trace's visibility actually
      toggled and (b) the dialog is still open afterward — research.md §2's
      required, not-assumed check of Radix's outside-click detection against
      Plotly's own in-tree click interactivity
      — **Confirmed safe, as predicted, with two real test-mechanics fixes
      needed along the way** (not the mechanism itself): Plotly's modebar
      visually overlaps the legend and physically intercepts the click at
      the browser's hit-testing level (removed via a test-only DOM
      cleanup, `.modebar-container`'s `.remove()`); and Plotly updates its
      internal trace-visibility state slightly after the click event fires,
      so the assertion polls rather than reading once immediately.

### Implementation for User Story 1

- [x] T010 [US1] Wire `PanelExpandHost` into `src/layout/panelCard.tsx` per
      `contracts/panel-card.md`: add the expand trigger to `CardHeader`
      alongside `CardTitle`; move `PanelErrorBoundary`/`PanelComponent`
      inside `PanelExpandHost`'s `children`; position the inline portal
      slot so it visually renders inside `CardContent`'s area even though
      `PanelExpandHost` itself is placed in `CardHeader` for the
      trigger/Dialog. **Completion requires an actual before/after
      screenshot comparison of a non-expanded panel card against its
      pre-`004` appearance** (contracts/panel-card.md's "Flagged for
      tasks.md" note) — a passing test suite alone does not close this
      task; the layout-mechanics change here is exactly the kind that can
      look correct in every assertion and still be visibly wrong (extra
      spacing, a shifted title baseline). Depends on T004
      — **Done**: `usePanelExpandHost(config.title, children, { height:
      config.height })` called once in `PanelCard`, `trigger` in
      `CardHeader`, `body` in `CardContent` — no CSS repositioning trick
      needed, since the hook shape (T004) already places each piece
      exactly where it belongs. **Screenshot comparison performed**:
      pre-`004` (`git stash` of the tracked source changes) vs. post-`004`
      (restored), same fixture data — identical card size, spacing, and
      title baseline; the only visible difference is the new expand icon
      in each header. Also required one small addition to `button.tsx`
      (an `icon` size variant — no existing variant fit a label-less
      trigger) and one to `PlotlyPanel.tsx` (container `height: '100%'`
      instead of a hardcoded pixel default, needed for FR-009 — see T019).

**Checkpoint**: User Story 1 is fully functional and independently
testable — every registered panel type expands/collapses correctly with
full Radix-inherited accessibility. **Verified**: 8/8 US1 tests pass
(T005-T009's scenarios, 9 tests total counting the split T006).

---

## Phase 4: User Story 2 - Return to the dashboard without losing panel state (Priority: P2)

**Goal**: Expanding or collapsing a panel never resets, reloads, or
duplicates that panel's query/data state.

**Independent Test**: Expand an already-loaded panel and close it —
confirm immediate identical data with no loading flash. Separately, expand
a panel while its query is still in flight — confirm the dialog shows the
same loading state and only one query ever resolves.

### Tests for User Story 2

- [x] T011 [P] [US2] Playwright test in `tests/integration/panelExpand.spec.ts`:
      expand-then-collapse round trip on a panel whose data already finished
      loading shows no loading state at any point, and identical data
      before/after (FR-007)
- [x] T012 [P] [US2] Playwright test in `tests/integration/panelExpand.spec.ts`:
      expanding a panel before its query resolves shows the same loading
      state in the dialog the card was already showing, and the panel's
      query call count (instrumented, e.g. via a counter on `services/
      duckdb.ts`'s `query()` for that panel's SQL) is exactly 1 across the
      whole interaction — never a second query triggered by expanding
      (FR-008)
      — **Rewritten from the "catch it mid-flight" approach originally
      planned**: delaying network responses to observe an in-flight
      loading state proved unreliable — DuckDB-WASM's httpfs fully caches
      these tiny fixture files after the first touch, so a panel's own
      query frequently resolves with no new network request at all,
      giving no observable window. Replaced with the deterministic
      approach the task description already flagged as an option: added
      `services/duckdb.ts`'s `__debugQueryLog()` (purely additive, no
      existing export changed) and assert the count for that panel's SQL
      is unchanged across the full expand→collapse round trip — this is
      also the test that caught T004's portal-mechanism correction (the
      count jumped by 2 on open and 2 more on close before the fix).
- [x] T013 [P] [US2] Playwright test in `tests/integration/panelExpand.spec.ts`:
      a panel in its error state, and separately a panel in its empty
      state, show that same state when expanded rather than attempting a
      reload or silently recovering
- [x] T014 [P] [US2] Playwright test in `tests/integration/panelExpand.spec.ts`:
      with a panel expanded, changing a global filter that panel depends on
      updates the expanded view the same way it would update the card —
      confirming expand/collapse doesn't suppress or interfere with the
      panel's normal filter-driven re-query

### Implementation for User Story 2

- [x] T015 [US2] Address any gap T011–T014 surface in `src/panels/
      ValueBoxPanel.tsx` or `src/panels/PlotlyPanel.tsx` (e.g. an
      unexpected dependency on mount/unmount timing in either panel's fetch
      effect). Expected to require **no changes** — research.md §1's
      portal-relocation design structurally guarantees single-instance,
      single-effect behavior — so treat any failure here as a signal the
      mechanism itself (T002–T004) has a bug, not as routine follow-up work
      — **No changes needed to either panel component**, confirmed: T012's
      failure before the fix was correctly diagnosed as a bug in the
      mechanism (T004's original `createPortal`-target-swap design), not
      in `ValueBoxPanel.tsx`/`PlotlyPanel.tsx` — exactly as this task
      anticipated. Once T004 was corrected (research.md §1b), all of
      T011-T014 passed with zero panel-component changes.

**Checkpoint**: User Stories 1 and 2 both hold, independently and
together. **Verified**: 4/4 US2 tests pass.

---

## Phase 5: User Story 3 - Charts render correctly sized inside the expanded view (Priority: P3)

**Goal**: A chart-type panel's Plotly rendering correctly fills the
expanded dialog's actual size in both directions of the transition.

**Independent Test**: Expand a chart panel and confirm it redraws to fill
the dialog (no blank region, no stale small-card sizing); collapse it and
confirm the card view is still rendered correctly afterward.

### Tests for User Story 3

- [x] T016 [P] [US3] Playwright test in `tests/integration/panelExpand.spec.ts`:
      expanding a chart panel results in its rendered chart's bounding box
      matching the dialog's actual container dimensions, not the original
      small-card dimensions (FR-009)
      — assertion adjusted from "dialog is wider AND taller than the card"
      to "dialog is taller, and fills its own dialog container's width" —
      this fixture's chart panel is configured `width: 1.0` (full row
      width), so the collapsed card can already be nearly viewport-wide,
      making "wider than before" not a meaningful claim in this specific
      case; "fills its actual container" is the real, always-meaningful one.
- [x] T017 [P] [US3] Playwright test in `tests/integration/panelExpand.spec.ts`:
      the chart's container DOM node (`PlotlyPanel`'s `containerRef.current`)
      has the same node identity before and after expanding — direct proof
      the mechanism relocates rather than remounts (research.md §1), not
      merely a visual/size check
      — **This is the test that first surfaced T004's portal-mechanism
      bug**: a marker attribute set on the container before expanding was
      gone after expanding, under the original `createPortal`-target-swap
      design — direct proof of an actual remount, not a false alarm.
      Passes cleanly after the T004 correction (research.md §1b).
- [x] T018 [P] [US3] Playwright test in `tests/integration/panelExpand.spec.ts`:
      collapsing an expanded chart panel leaves it correctly rendered at its
      original card size afterward — the round trip is symmetric, not just
      expand-direction-correct

### Implementation for User Story 3

- [x] T019 [US3] Address any gap T016–T018 surface. Expected to require
      **no changes** to `src/panels/PlotlyPanel.tsx` — `003`'s existing
      `ResizeObserver` effect already handles arbitrary container resizes
      generically (research.md §1 confirms the portal relocation triggers
      it the same way any other resize would); only touch this file if a
      test reveals it genuinely doesn't
      — **This expectation was wrong, found by T016**: the ResizeObserver
      correctly *detected* the resize and called `Plotly.Plots.resize()`
      as expected, but the container had nothing taller to resize *into*
      — its own `style` hardcoded `height: config.height ?? 350` (a fixed
      350/400px), unconditionally, regardless of which real container it
      was placed in. Fixed with a one-line change: `height: '100%'`, so
      the container fills whatever real ancestor it's currently in — the
      inline card slot (sized via `usePanelExpandHost`'s new
      `options.height`, T004/T010) or the dialog's own flex-driven height.
      This is the one place `PlotlyPanel.tsx` was actually touched — a
      sizing fix, not new awareness of the expand mechanism itself
      (`contracts/panel-card.md`).

**Checkpoint**: All three user stories are independently functional and
verified together on the same dashboard tab. **Verified**: 3/3 US3 tests
pass; full `panelExpand.spec.ts` is 16/16, and the complete pre-existing
suite (`boot.spec.ts` + `dashboardShell.spec.ts`, 10 tests) plus 53 unit
tests all still pass alongside it — 26 integration + 53 unit, no
regressions.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T020 [P] Update `CLAUDE.md`'s `src/` file-tree section to list
      `src/components/ui/dialog.tsx` and `src/layout/panelExpandHost.tsx`
      as real (no longer "not built yet") files, per plan.md's Project
      Structure
      — **Done**, and broadened slightly beyond this feature's own two new
      files: the whole `layout/`/`panels/`/`components/ui/` block was
      still marked wholesale "not built yet" from before `003` landed —
      corrected to reflect what's actually built (annotated per-file)
      versus genuinely still pending, since leaving it stale while adding
      only `004`'s two files would have left a misleading document behind.
- [x] T021 Run `quickstart.md`'s full validation pass end to end — the
      automated `npm run test:integration -- panelExpand` run plus every
      manual verification step, including the pre-`004` screenshot
      comparison (quickstart.md manual step 8)
      — **Done**: full suite (`npx playwright test`, no filter) — 26
      integration tests (10 pre-existing + 16 new) and 53 unit tests, all
      passing. Screenshot comparison performed via `git stash`/`pop` of
      the tracked source changes against the same fixture data — no visual
      regression, only the new expand icon.
- [x] T022 [P] Re-confirm plan.md's "Post-Phase 1 re-check" Constitution
      Check note against what was actually built — expected to still read
      PASS across all nine principles with no new entries needed in
      Complexity Tracking; update the note only if implementation revealed
      an actual deviation
      — **Done**: added a "Post-implementation re-check" note to plan.md —
      still PASS across all nine; the two implementation-time corrections
      (portal mechanism, `PlotlyPanel.tsx` height) are implementation-
      detail corrections to this plan, not new information bearing on any
      constitution principle. No Complexity Tracking entries needed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001, the new dependency
  must be installed before `dialog.tsx` can import it) — **BLOCKS all user
  stories**. T002 → T003 → T004, strictly sequential (each edits/depends on
  the prior task's output in the same small set of files).
- **User Stories (Phase 3-5)**: All depend on Foundational (Phase 2)
  completing. Story test tasks (T005-T009, T011-T014, T016-T018) can be
  authored in parallel with each other *within* a story (different
  `test()` blocks) but each story's implementation task (T010, T015, T019)
  depends on its own story's tests existing first, and T011-T014/T016-T018
  additionally depend on T010 (nothing to expand/collapse against until
  `panelCard.tsx` is wired).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational. This is the mechanism's
  first real integration point (`panelCard.tsx` wiring, T010) — US2 and
  US3's tests need T010 to exist to have anything to expand/collapse, so
  while US2/US3 are independently *specified*, they are not independently
  *runnable* before US1's implementation task lands. Sequential delivery
  (US1 → US2 → US3) is the realistic path, not parallel team assignment,
  despite the template's general "stories can proceed in parallel" note —
  named here explicitly since it departs from that default.
- **US2 (P2)**: Tests (T011-T014) can be written any time after Phase 2;
  they can only pass after T010.
- **US3 (P3)**: Tests (T016-T018) can be written any time after Phase 2;
  they can only pass after T010.

### Within Each User Story

- Tests written first, expected to fail until that story's implementation
  task lands (T010 for US1; US2/US3 have no new implementation expected —
  T015/T019 are conditional fix tasks, not scheduled work).
- Implementation task's own completion criteria (T010's screenshot
  comparison, T003's dedicated fix) are part of the task, not deferred to
  Polish.

### Parallel Opportunities

- T001 has nothing to parallelize against yet (first task).
- T002 has no same-file conflicts with anything else in Phase 2 but T003/
  T004 depend on it directly — effectively sequential despite no `[P]`
  after T002 itself being wrong; T002 is marked `[P]` only in the sense
  that no *other* Phase 2 task could run before it anyway.
- Within US1: T005-T009 (five independent test scenarios, one file) can
  be authored in parallel.
- Within US2: T011-T014 (four independent test scenarios) can be authored
  in parallel, once T010 exists to test against.
- Within US3: T016-T018 (three independent test scenarios) can be authored
  in parallel, once T010 exists to test against.
- T020/T022 (Polish) can run in parallel with each other.

---

## Parallel Example: User Story 1

```bash
# Once Phase 2 (T002-T004) is complete, author all US1 test scenarios together:
Task: "Playwright test: expand trigger opens dialog with same content (valuebox + plotly) in tests/integration/panelExpand.spec.ts"
Task: "Playwright test: Escape/outside-click/close-control all close, focus returns to trigger in tests/integration/panelExpand.spec.ts"
Task: "Playwright test: Tab/Shift+Tab focus trap while dialog open in tests/integration/panelExpand.spec.ts"
Task: "Playwright test: DialogContent root not visible when never expanded (quickstart.md scenario 9) in tests/integration/panelExpand.spec.ts"
Task: "Playwright test: Plotly legend click doesn't close the dialog in tests/integration/panelExpand.spec.ts"

# Then, once tests exist and fail as expected:
Task: "Wire PanelExpandHost into panelCard.tsx + before/after screenshot comparison"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational — the mechanism
   itself, including the closed-state-hidden fix).
2. Complete Phase 3 (US1): trigger, dialog, accessibility, `panelCard.tsx`
   wiring with its required screenshot check.
3. **STOP and VALIDATE**: run T005-T009 and confirm they pass; do the
   quickstart.md manual pass for just the US1-relevant steps.
4. This alone is a demoable, mergeable increment — every panel expands to
   a large, fully-accessible view. US2/US3 harden guarantees the mechanism
   already provides structurally (research.md §1) but haven't been proven
   with dedicated tests yet.

### Incremental Delivery

1. Setup + Foundational → mechanism ready, nothing user-visible yet.
2. Add US1 → test independently → demoable MVP (expand/collapse works,
   accessible, no permanently-visible empty dialog box bug).
3. Add US2 → test independently → data/query-state guarantees proven, not
   just assumed from the design.
4. Add US3 → test independently → chart-resize correctness proven.
5. Polish → docs, full quickstart pass, Constitution Check re-confirmation.

---

## Notes

- [P] tasks touching the same file (`tests/integration/panelExpand.spec.ts`)
  are parallel at the *authoring* level (independent `test()` blocks, no
  shared mutable state between them) — not a claim that concurrent writes
  to the same file are conflict-free; coordinate accordingly if split
  across multiple people/agents.
- T003 and T008 are a deliberate pair — the fix and its dedicated
  regression test are two separate, separately-trackable tasks, per this
  feature's explicit instruction not to let this specific bug class get
  silently bundled into "build the dialog primitive."
- T010 is likewise deliberately scoped to require a screenshot comparison
  as part of its own completion, not deferred to Phase 6 Polish — the risk
  it guards against (a subtly-wrong but functionally-passing layout change)
  is specific to that task's own change, not a general cross-cutting
  concern to sweep up later.
- Commit after each task or logical group; verify each story's tests fail
  before implementing, pass after.
