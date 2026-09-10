---

description: "Task list for left sidebar navigation, accordion sub-sections, and a chromeless full-page panel mode"
---

# Tasks: Left Sidebar Navigation, Accordion Sub-Sections, and a Chromeless Full-Page Panel Mode

**Input**: Design documents from `/specs/030-sidebar-navigation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — this project's own established convention (every prior feature in this repo's history ships real Vitest + Playwright coverage; plan.md's own Technical Context already names both explicitly, and quickstart.md pre-designed the exact scenarios below) is treated as a standing request for tests, not skipped as "optional."

**Organization**: Tasks are grouped by user story (spec.md: US1 P1, US2/US3 both P2, US4 P3). Per spec.md's own "Why this priority" text: US2 and US3 each explicitly depend on US1's sidebar already existing as their own delivery surface — this is a REAL dependency, not just phase ordering. US4 is fully independent (spec.md: "changes only `dashboardRenderer.tsx`'s row-layout math... independently testable and shippable on its own, including before or after any of the other three stories") and could be done first, last, or in parallel with any of US1–US3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

## Path Conventions

Single project (existing repo structure) — no new top-level directory. All paths below match `plan.md`'s own Source Code tree exactly.

## ⚠️ Shared-file caution (read before parallelizing across stories)

Three files are touched by tasks in MORE than one user story phase. Even
though the STORIES are independent (per spec.md), these specific tasks are
**not** safely parallel with each other — run them in task-ID order, not
concurrently, regardless of which stories are otherwise being worked on
in parallel:

- **`layout/types.ts`**: T009 (US1, adds `header.icon?`) → T014 (US2, adds
  `header.full_page?`) → T022 (US3, adds `sections?`/`SectionConfig`).
- **`layout/dashboardLayout.ts`**: T015 (US2, creates the file with
  `findFullPagePanel()`) → T023 (US3, adds `resolveSections()`) → T030
  (US4, adds `isMetricStripRow()`). T015 is the file's real creation
  point — T023/T030 each add one more export to an already-existing file.
- **`layout/dashboardRenderer.tsx`**: T016 (US2, full-page branch) → T025
  (US3, section-id DOM anchors) → T031 (US4, Metric Strip branch).

---

## Phase 1: Setup

**Purpose**: The one real new dependency this feature needs (research.md §2 — confirmed the *only* one).

- [X] T001 Add `@radix-ui/react-separator` as an explicit `package.json` dependency (already present transitively, but every other `components/ui/*.tsx` file declares its own Radix package explicitly — research.md §2); run `npm install` to lock it.

---

## Phase 2: Foundational (blocks US1, US2, US3 — NOT US4)

**Purpose**: The two new, hand-authored UI primitives every sidebar-surface story needs before its own wiring can begin (research.md §1).

**⚠️ CRITICAL**: T002–T003 MUST complete before Phase 3 (US1), Phase 4 (US2), or Phase 5 (US3) begin. Phase 6 (US4) has no dependency on this phase and may proceed immediately after Phase 1.

- [X] T002 [P] Create `src/components/ui/sidebar.tsx` — hand-authored against shadcn's real `Sidebar` structure/API surface (`SidebarProvider`, `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`, `useSidebar`; `collapsible="icon"` mode) using THIS repo's own individual `@radix-ui/react-*` import convention and Tailwind v3 class syntax — NOT a verbatim port of shadcn's `new-york-v4` source (research.md §1). `open`/`setOpen` is plain in-memory `useState`, reset on every load — no `document.cookie` write (shadcn's own real default, confirmed via source read), no `localStorage`/`sessionStorage` (research.md §3). No `Slot`/`Collapsible`/`Sheet`/`Skeleton`/`Input` sub-components (research.md §2/§4 — none needed for this app's real scope). Below a chosen narrow-viewport breakpoint, applies the SAME icon-collapsed state the manual toggle produces — no separate off-canvas/`Sheet` interaction (research.md §4).
- [X] T003 [P] Create `src/components/ui/separator.tsx` — small, generic Radix `Separator` wrapper, this feature's one genuinely new primitive (research.md §2).

**Checkpoint**: Both new primitives exist and typecheck cleanly in isolation. US1/US2/US3 may now proceed; US4 already could have.

---

## Phase 3: User Story 1 - Navigate the dashboard via a left sidebar instead of top tabs (Priority: P1) 🎯 MVP

**Goal**: Every discovered dashboard tab is reachable from a left sidebar; the sidebar collapses/expands only on manual trigger, never on scroll.

**Independent Test**: Load the dashboard with the existing (or an expanded) tab set; confirm every tab is reachable with no horizontal overflow, confirm collapse/expand never reacts to scroll, confirm brand/logo and Settings are visually distinct from the tab list.

### Tests for User Story 1

- [X] T004 [P] [US1] Playwright test in `tests/integration/sidebarNav.spec.ts` — quickstart.md Scenario 1 (every discovered tab renders as a sidebar item in discovery order, re-verified against a SECOND, differently-sized fixture `dashboard-config/index.json` with zero code change — proves FR-003 directly, not just the default-size case) and Scenario 2 (collapse is manual-only; `page.mouse.wheel()` on a long tab leaves `data-state="collapsed"` unchanged).

### Implementation for User Story 1

- [X] T005 [US1] Rewrite `src/layout/shell.tsx` — compose `SidebarProvider`/`Sidebar`/`SidebarInset` (T002), replacing the `position: fixed <header>` + `<main style={{ paddingTop }}>` structure entirely. DELETE the `ResizeObserver`/`headerHeight`/`paddingTop` measurement machinery in full — not adapted, structurally unneeded once nothing overlaps page content (research.md §5). `DashboardBrand` moves into `SidebarHeader`; the existing `SettingsModal` trigger moves into `SidebarFooter`. `SidebarContent` renders `sidebarNav.tsx` (T010/T011).
- [X] T006 [US1] Delete `src/layout/navBar.tsx` — superseded by `sidebarNav.tsx`, not kept as a reusable primitive (it's a bespoke composition tied to the removed horizontal shell, not a generic primitive like `dropdown-menu.tsx` — research.md §6).
- [X] T007 [P] [US1] Delete `src/hooks/useNavBarVisibilityMode.ts`, `src/state/navBarVisibilityState.ts`, and `src/hooks/useScrollDirection.ts` (FR-006 — Hide-on-Scroll removed entirely, not adapted; `useScrollDirection.ts` has exactly one caller, `shell.tsx`, and becomes dead code the moment T005's rewrite removes that wiring).
- [X] T008 [US1] Remove the "Top Bar Behavior" control from `src/layout/settings/appearanceTab.tsx` (FR-006 — its own underlying mode no longer exists after T007).
- [X] T009 [US1] Add `header.icon?: string` to `DashboardTabConfig` in `src/layout/types.ts`, with fail-soft parsing in `parseDashboardConfig()` matching `header.description`'s existing optional-string pattern (`typeof x === 'string' ? x : undefined` — a wrong-type value parses as absent, never throws) (data-model.md §1, FR-007). See Shared-file caution above.
- [X] T010 [US1] Create `src/layout/sidebarNav.tsx` — one `SidebarMenuItem` per entry in the same `DashboardTabConfig[]` array `shell.tsx` holds, in array order (no tab name/count/order hardcoded — provably the same mechanism `navBar.tsx`'s own `{tabs.map(...)}` already used, per FR-003/contracts/sidebar-shell.md's Primary navigation section). Shows `tab.header.icon` via the same `iconComponentFor()`-style lookup `ValueBoxPanel.tsx` already uses when present; no icon configured → no icon rendered. Clicking calls the same `onTabChange`/`setActiveTab` callback `navBar.tsx`'s `Tabs.onValueChange` already called. Active item visually distinguished matching `components/ui/tabs.tsx`'s existing `data-[state=active]:bg-accent data-[state=active]:text-accent-foreground` convention.
- [X] T011 [US1] Wire `src/layout/sidebarNav.tsx` (T010) into `src/layout/shell.tsx`'s `SidebarContent` (depends on T005, T010 both existing).
- [X] T012 [P] [US1] Author/confirm fixture content in `tests/fixtures/dashboard-config/` — at least one tab with `header.icon:` set, per quickstart.md's own Prerequisites list (needed by T004).

**Checkpoint**: User Story 1 fully functional and independently testable — sidebar replaces top nav, every tab reachable, collapse/expand manual-only.

---

## Phase 4: User Story 2 - Explore data on a dedicated, edge-to-edge page (Priority: P2)

**Goal**: A tab flagged `full_page: true` with exactly one panel renders that panel edge-to-edge, with real viewport-tracking height — no redundant page title, no `Card` chrome, no expand-to-dialog control.

**Independent Test**: Navigate to a full-page-configured tab; measure the panel's rendered content area against the viewport, confirming near-zero unused chrome and a height that tracks real available space.

**Depends on**: Phase 3 (US1) — `SidebarInset` (T005) is this story's own render surface.

### Tests for User Story 2

- [X] T013 [P] [US2] Playwright test in `tests/integration/fullPagePanel.spec.ts` — quickstart.md Scenario 3 (no redundant heading, no `Card` chrome, no expand trigger, content area >90% of viewport height — SC-002) and Scenario 4 (rendered height changes when the viewport is resized shorter — proves it tracks real space, not the library's fixed 635px default).

### Implementation for User Story 2

- [X] T014 [US2] Add `header.full_page?: boolean` to `DashboardTabConfig` in `src/layout/types.ts`, fail-soft parsing matching T009's pattern (data-model.md §1, FR-008). See Shared-file caution above.
- [X] T015 [P] [US2] Create `src/layout/dashboardLayout.ts` with `findFullPagePanel(tab: DashboardTabConfig): PanelConfig | null` — flattens every row in `tab.layout`, returns the single panel only when the flattened list has exactly one entry, else `null` (data-model.md §3). See Shared-file caution above — this task is this file's real creation point.
- [X] T016 [US2] Add a full-page branch to `src/layout/dashboardRenderer.tsx` (or a new sibling component it delegates to) — checks `findFullPagePanel()` (T015) before the normal row-rendering path. A non-null result: `header.title`/`.description` are never consulted (not blanked — absent from that render path entirely); the resolved panel renders via the SAME `registry[config.type]` lookup + `PanelErrorBoundary` every other panel uses, but WITHOUT `Card`/`CardHeader`/`CardTitle`/`CardContent` and WITHOUT `usePanelExpandHost`'s expand trigger (FR-008/FR-010/FR-011, contracts/sidebar-shell.md's Chromeless full-page mode section). `null` (0 or 2+ panels) falls back to ordinary `Card`-chromed rendering with a `console.warn` naming the problem — never a blank/broken page. The rendered panel's own outer container gets a REAL, definite CSS height from the `SidebarInset`/full-page-branch ancestor chain (not `auto`, not an indeterminate percentage) (FR-009). See Shared-file caution above.
- [X] T017 [US2] Empirically verify the `src/panels/GraphicWalkerPanel.tsx` height-resolution chain against the new full-page ancestor from T016 (research.md §7 — a design-time EXPECTATION, not yet confirmed: `src/panels/graphicWalkerPanel.css`'s own `.graphic-walker-panel-host { height: 100%; ... }` should resolve correctly with zero change to either file, now that the ancestor has a real height). Use the same live-measurement technique spec.md's own Research Findings used (real dev server, real viewport, measure rendered height). **If the ancestor-only fix is insufficient**, add a small, explicit height rule scoped to the full-page case specifically, in `src/panels/graphicWalkerPanel.css` — never a general change to `GraphicWalkerPanel.tsx`'s existing inline/dialog behavior.
- [X] T018 [US2] **FR-012a — explicit, standalone task, not to be folded into T016/T017 or improvised during either**: relocate `public/demo-dashboard-config/dashboard-5-explore.yaml`'s existing "About This Demo" `markdown` panel content into `public/demo-dashboard-config/dashboard-1-overview.yaml` (the Overview tab — already introduces the same three real scenarios this content describes). Leave `dashboard-5-explore.yaml` with exactly one panel (`graphic-walker`). Then author `header.full_page: true` and `header.icon: compass` on `dashboard-5-explore.yaml` (FR-012 — `Compass` is this app's own already-established graphic-walker/explore icon, reused per `GraphicWalkerPanel.tsx`'s own existing empty-state icon choice, not independently re-picked). Verify against the corrected illustrative example in `contracts/dashboard-grammar.md` and the corrected quickstart.md Scenario 3 (both already updated to reflect this tab's real, post-relocation shape — `header.tab: Explore`, not "Explore Data").
- [X] T019 [P] [US2] Author a SEPARATE fixture full-page tab in `tests/fixtures/dashboard-config/` — a single `graphic-walker` panel, `full_page: true`, per quickstart.md's own Prerequisites (independent of T018's real-content fix; needed by T013).
- [X] T020 [P] [US2] Document `header.full_page` in `project-docs/GRAMMAR.md` per `contracts/dashboard-grammar.md`'s own corrected example (FR-019's twelfths convention is a separate, US4 doc addition — T032).

**Checkpoint**: User Story 2 fully functional and independently testable once US1 is complete — real, published Explore tab genuinely renders full-page, height verified empirically against real viewport space.

---

## Phase 5: User Story 3 - Jump directly to a submodel section within a long tab (Priority: P2)

**Goal**: While a tab with `sections:` is active, its sidebar item shows an expandable list of that tab's sections; selecting one scrolls to its content. Switching tabs immediately hides the previous tab's sections.

**Independent Test**: Author a tab with two or more `sections:` entries; confirm the sidebar shows them only while that tab is active, confirm each scrolls to the right content, confirm switching tabs hides the first tab's sections with no residual entries.

**Depends on**: Phase 3 (US1) — the accordion sub-list attaches directly beneath each primary `sidebarNav.tsx` item (T010), which must already exist.

### Tests for User Story 3

- [X] T021 [P] [US3] Playwright test in `tests/integration/sectionSubNav.spec.ts` — quickstart.md Scenario 5 (sections shown only for the active tab, hidden immediately on switch — SC-004), Scenario 6 (clicking a section scrolls its DOM anchor near the viewport top, no full navigation), and Scenario 7 (collapsed sidebar shows no section sub-items regardless of active tab).

### Implementation for User Story 3

- [X] T022 [US3] Add `sections?: SectionConfig[]` to `DashboardTabConfig` and the new `SectionConfig` interface (`{ id: string; label: string; rows: string[] }`) to `src/layout/types.ts`; permissive parsing (`Array.isArray(obj.sections) ? ... : []`, malformed entries filtered later, not at parse time) (data-model.md §1/§2, FR-013). See Shared-file caution above.
- [X] T023 [P] [US3] Add `resolveSections(tab: DashboardTabConfig): ...` to `src/layout/dashboardLayout.ts` (already created by T015) — a `sections[].rows[]` entry naming a row absent from `tab.layout` is dropped with a `console.warn` naming the missing row and section (the section still renders with its remaining valid rows, or is omitted if left with zero); a `layout` row referenced by no section renders normally with no sub-nav entry (data-model.md §2's Validation rules). See Shared-file caution above.
- [X] T024 [US3] Add accordion sub-navigation rendering to `src/layout/sidebarNav.tsx` (T010) — while `tab.header.tab === activeTab` and that tab has one or more resolved sections (T023), show a sub-list directly beneath its `SidebarMenuItem`. Plain conditional rendering with manually-applied `aria-expanded`/`role="group"` attributes — NOT a Radix Collapsible/Accordion primitive (research.md §2's explicit reasoning: single source of truth already tracked via `activeTab`, no independent per-item toggle state needed).
- [X] T025 [US3] Add a stable DOM `id` (`section-${section.id}`) to each section's own row-group wrapper in `src/layout/dashboardRenderer.tsx`, and a click handler on each sidebar section sub-item calling `document.getElementById(...)?.scrollIntoView({ behavior: 'smooth', block: 'start' })` (research.md §8, FR-016) — native browser API, no new dependency. See Shared-file caution above.
- [X] T026 [US3] In `src/layout/sidebarNav.tsx` (T010/T024), ensure section sub-items render nothing when the sidebar is in its collapsed icon-only state, regardless of which tab is active (FR-017) — consistent with every primary item also losing its text label in that state.
- [X] T027 [P] [US3] Author a fixture tab with 2+ `sections:` entries spanning multiple real rows in `tests/fixtures/dashboard-config/`, per quickstart.md's own Prerequisites (needed by T021).

**Checkpoint**: User Story 3 fully functional and independently testable once US1 is complete.

---

## Phase 6: User Story 4 - See KPI values and chart/table rows as a coherent, aligned grid (Priority: P3)

**Goal**: An all-`valuebox` row lays out as an auto-filling minimum-card-width grid ("Metric Strip"); panels authored with twelfths-based `width:` fractions align across rows.

**Independent Test**: Render a tab whose one row is all `valuebox` panels; confirm it lays out as a distinct card grid. Render a tab with multiple rows using simple-fraction widths; confirm column boundaries align.

**Depends on**: Nothing — fully independent of US1/US2/US3 (spec.md's own explicit framing). May be done first, last, or in parallel with any other story.

### Tests for User Story 4

- [X] T028 [P] [US4] Vitest test in `tests/unit/dashboardLayout.test.ts` — quickstart.md Scenario 8's three cases for `isMetricStripRow()` (all-valuebox → true; mixed types → false; empty → false).
- [X] T029 [P] [US4] Playwright test — a real rendered Metric Strip row (`display: grid`; first card's `boundingBox().width >= 200`, per quickstart.md's own min-width assertion rather than a fixed column count, since auto-fill column count varies by viewport width).

### Implementation for User Story 4

- [X] T030 [P] [US4] Add `isMetricStripRow(panels: PanelConfig[]): boolean` to `src/layout/dashboardLayout.ts` (already created by T015) — `panels.length > 0 && panels.every(p => p.type === 'valuebox')` (data-model.md §5, FR-018). See Shared-file caution above.
- [X] T031 [US4] Branch `src/layout/dashboardRenderer.tsx`'s per-row rendering on `isMetricStripRow()` (T030): `true` → `grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6` (the 200px minimum and `gap-6` anchor both taken directly from `project-docs/UX-REDESIGN-PROPOSAL.md`'s own research, per research.md §10); `false` → the existing fraction-based `gridTemplateColumns` math, completely unchanged (FR-018/FR-020). See Shared-file caution above.
- [X] T032 [P] [US4] Document the twelfths-based `width:` authoring convention in `project-docs/GRAMMAR.md` (FR-019) — documentation only, zero change to `dashboardRenderer.tsx`'s existing fraction-to-`fr`-unit math, which already produces this alignment for any two rows sharing a fraction set (research.md §9).

**Checkpoint**: User Story 4 fully functional and independently testable — no dependency on any other story's completion.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Full-suite verification and documentation, after all four stories are complete.

- [X] T033 [P] Dual-theme (light + dark) `getComputedStyle()`-based verification pass across every new/changed surface — sidebar shell, full-page mode, accordion sub-nav, Metric Strip (FR-021/SC-006) — matching this project's existing dual-theme testing discipline, not a visual spot-check alone.
- [X] T034 Confirm FR-022 directly: `git diff` (or equivalent) on `src/panels/FlowMapPanel.tsx`/`src/panels/ZoneMapPanel.tsx` across this entire feature is empty — no WebGL/map-lifecycle code touched by anything in this feature.
- [X] T035 Run `npm run typecheck`, `npm run test:unit`, `npm run test:integration` — confirm the full existing suite passes at its pre-feature rate (SC-007); any new failure traced to a real regression via isolated re-run / `git stash` comparison (this project's own established discipline), not accepted as incidental.
- [X] T036 Take before/after screenshots (both themes) measuring the Explore tab's real content-area-to-viewport ratio against SC-002's 90% bar, for the completion report.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup (T001, for `sidebar.tsx`'s own `Separator` import in T003); blocks Phase 3 (US1), Phase 4 (US2), and Phase 5 (US3) only — Phase 6 (US4) does NOT depend on Phase 2 and may start immediately after Phase 1.
- **User Story 1 (Phase 3)**: Depends on Phase 2. Blocks Phase 4 (US2) and Phase 5 (US3) — both explicitly depend on US1's sidebar/`sidebarNav.tsx` already existing (spec.md's own stated reasoning), not just on Phase 2's primitives.
- **User Story 2 (Phase 4)**: Depends on Phase 3 (US1).
- **User Story 3 (Phase 5)**: Depends on Phase 3 (US1). Independent of Phase 4 (US2) — may run before, after, or in parallel with it, subject to the Shared-file caution above (`layout/types.ts`, `layout/dashboardLayout.ts`, `layout/dashboardRenderer.tsx`).
- **User Story 4 (Phase 6)**: No dependency on any other phase. May run at any point, subject to the same Shared-file caution for `layout/dashboardLayout.ts`/`layout/dashboardRenderer.tsx`.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Parallel Opportunities

- T002/T003 (Foundational) are `[P]` — different files, no shared state.
- T007 (US1, three file deletions) is `[P]` relative to T006/T008/T009 within the same story.
- T015/T019/T020 (US2) are `[P]` relative to each other; T023/T027 (US3) are `[P]` relative to each other; T028–T030/T032 (US4) are `[P]` relative to each other — all subject to the Shared-file caution when a task from a DIFFERENT story also touches the same file.
- US4 (Phase 6) can run fully in parallel with US1/US2/US3 by a different team member, from the very start.

---

## Parallel Example: User Story 1

```bash
# Once Phase 2 is done, T004 (test) and T012 (fixture content) can start
# alongside T005-T009 (all touch different files from each other):
Task: "Playwright test for sidebar tab discovery/collapse in tests/integration/sidebarNav.spec.ts"
Task: "Author fixture tab with header.icon: in tests/fixtures/dashboard-config/"
Task: "Delete useNavBarVisibilityMode.ts/navBarVisibilityState.ts/useScrollDirection.ts"
```

---

## Implementation Strategy

### MVP First

Phase 1 → Phase 2 → Phase 3 (US1) is the smallest complete, independently
valuable increment — a working sidebar replacing the top nav, with no
accordion sub-sections and no chromeless full-page mode yet. This matches
spec.md's own explicit priority ordering (US1 is the sole P1 story).

### Incremental Delivery

1. Phase 1 (Setup) → Phase 2 (Foundational) → real sidebar primitives ready.
2. Phase 3 (US1) → sidebar replaces top nav → **MVP**, independently shippable.
3. Phase 4 (US2) and Phase 5 (US3), in either order (both P2, both depend
   only on US1) → Explore tab goes full-page; long tabs get section
   sub-nav.
4. Phase 6 (US4) — independent, could have shipped at any point above.
5. Phase 7 (Polish) → full regression + dual-theme verification +
   completion report, once all four stories are in.

### If a Design-Time Expectation Turns Out Wrong (research.md §7)

T017's own height-chain verification is explicitly NOT assumed correct
from research.md §7's reasoning alone — if the ancestor-only fix proves
insufficient once measured live, the fallback (a small, explicit,
full-page-scoped height rule) is already named in T017 itself, not a
surprise to be improvised.
