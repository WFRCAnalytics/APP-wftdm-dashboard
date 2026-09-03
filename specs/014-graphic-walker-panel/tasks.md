---

description: "Task list template for feature implementation"
---

# Tasks: Graphic Walker Exploration Panel

**Input**: Design documents from `/specs/014-graphic-walker-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/graphic-walker-panel.md, quickstart.md — all present.

**Tests**: Included — every prior panel-type feature in this project (005 through 013) has included test tasks; this feature follows that established convention, not the template's own generic "optional" default.

**Organization**: Tasks are grouped by user story (spec.md's three priorities, P1–P3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Exact file paths are included in every task description

## Path Conventions

Single project — `src/`, `tests/` at repository root (plan.md's own Project Structure), unchanged from every prior panel-type feature. Unlike `013-zonemap-panel`, this feature adds no new top-level published-asset directory.

---

## Phase 1: Setup

- [X] T001 [P] Add `@kanaries/graphic-walker` to `package.json` dependencies. **Corrected during implementation**: `^0.4.82` is unsafe — a real, live finding, not merely a style choice — `npm install` resolved that range to `0.4.84`, which (confirmed directly, `npm error`) requires React `>=19.0.0`; the React-19 peer bump happened *within* the `0.4.x` line at `0.4.83`, so a caret range still spans it. Pinned to the **exact** version `"0.4.82"` (no range operator) instead; `npm install` then resolved cleanly with zero peer-dependency warning against this project's `react`/`react-dom` `^18.3.1` — confirmed via the installed `node_modules/@kanaries/graphic-walker/package.json` itself (`version: "0.4.82"`, `peerDependencies: {"react":">=17.0.0 <19.0.0", ...}`).
- [X] T002 [P] Add a `graphic-walker` `manualChunks` entry to `vite.config.ts`'s existing `rollupOptions.output.manualChunks` function (research.md §9), matching the `plotly`/`maps` entries' own existing pattern. Chunk-split verification confirmed after T012/T013 landed: `npx vite build` now produces a distinct `graphic-walker-*.js` chunk (~4.3MB, gzip ~1.25MB) — the earlier pre-T012 build correctly produced none, since nothing imported the package yet.
- [X] T003 [P] Add three `type: graphic-walker` panel entries to `tests/fixtures/dashboard-config/dashboard-2-detail.yaml`'s new `row_explore` — one bound to `dataset: trip_mode_share` (docs/GRAMMAR.md's own worked example dataset, already written by `generate.py`'s `good` scenario), one bound to a different existing dataset (`dataset: screenlines`, for US2's no-cross-contamination coverage), and one deliberately broken (`dataset: nonexistent_dataset`, matching the existing valuebox panel's own "(intentional)" convention). No `generate.py` change needed (research.md §8).

**Checkpoint**: Dependency installed and confirmed React-18-compatible; build chunking configured and verified; fixture panel entry exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The config type and both new pure modules every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Add `GraphicWalkerFieldOverride` + `GraphicWalkerPanelConfig` to `src/layout/types.ts` per data-model.md §1 — extends `PanelConfigBase` directly, **not** `DataBoundPanelConfigBase` (that base type requires a `metric` field this grammar never uses; a real correction caught during `/speckit-plan`, not assumed from the start). Added `GraphicWalkerPanelConfig` to the `PanelConfig` union; updated `UnknownPanelConfig`'s doc comment — every originally-listed panel type is now accounted for.
- [X] T005 [P] Write failing unit tests for `graphicWalkerFields.ts` in `tests/unit/graphicWalkerFields.test.ts` (new file) per contracts/graphic-walker-panel.md + research.md §5's mapping table — confirmed red (`Cannot find module '@/panels/graphicWalkerFields'`) before implementing.
- [X] T006 [US-shared] Implement `src/panels/graphicWalkerFields.ts` (`inferFields`) per contracts/graphic-walker-panel.md — makes T005 pass (11/11 green). Real apache-arrow `DataType.isInt`/`isFloat`/`isUtf8`/`isDate`/`isTimestamp`/`isBool` predicates confirmed directly against the installed package (`node -e` probe) before writing the mapping, not assumed from memory.
- [X] T007 [P] Write failing unit tests for `panelQuery.ts`'s new `buildGraphicWalkerQuery()` in `tests/unit/panelQuery.test.ts` (existing file, extended) — confirmed red (`buildGraphicWalkerQuery is not a function`, 5/5 new tests failing, 26/26 pre-existing still passing) before implementing.
- [X] T008 [US-shared] Implement `buildGraphicWalkerQuery()` in `src/panels/panelQuery.ts` per research.md §6/data-model.md — reuses the existing, **unmodified** `sqlExpander.expand()` `$scenario.` mechanism; no `sqlExpander.ts` change. Makes T007 pass (31/31 green, zero regressions in the file's existing 26).

**Checkpoint**: Config type parses; both pure modules implemented and tested (T005/T007 now pass). Fixture data exists (Phase 1). User story implementation can begin.

---

## Phase 3: User Story 1 - Freely build a chart from an existing dataset (Priority: P1) 🎯 MVP

**Goal**: A viewer drags fields onto shelves and picks a mark type to see their own chart of real, already-loaded scenario data — no dashboard YAML edit needed to produce that specific chart.

**Independent Test**: Per spec.md — load a scenario, open a dashboard tab containing a `graphic-walker` panel, drag a categorical field onto the x-shelf and a numeric field onto the y-shelf, confirm a chart renders using real rows from the configured dataset.

### Tests for User Story 1 ⚠️

> Write these first; confirm they fail against the not-yet-implemented `GraphicWalkerPanel.tsx` before proceeding to implementation below.

- [X] T009 [P] [US1] Integration test in `tests/integration/graphicWalkerPanel.spec.ts` (new file) — the panel renders `embedGraphicWalker`'s own field list/chart-type picker/encoding shelves, populated with the fixture dataset's real columns, with no chart pre-selected (Acceptance Scenario 1). **Real implementation finding**: the field list uses `react-beautiful-dnd` (confirmed via its own `data-rbd-draggable-id`/`data-rbd-droppable-id` DOM attributes) — its own real, confirmed-stable `${analyticType}_${fid}` draggable-id convention (e.g. `dimension_purpose`, `measure_share`) is what these assertions locate on, not fragile class/text selectors.
- [X] T010 [US1] Integration test — dragging a field onto a shelf and picking a mark type renders a real chart using real fixture rows, entirely client-side, with no dashboard configuration change (Acceptance Scenario 2). **Real implementation finding**: Playwright's native-HTML5-DnD `dragTo()` and raw mouse move/down/up sequences were both tried first and did NOT reliably land a drop against `react-beautiful-dnd` (it implements its own pointer sensor, not native DnD, confirmed via `draggable="false"` on every item). Its own documented keyboard drag alternative (focus, Space to lift, ArrowRight to cross into a neighboring droppable, Space to drop) works reliably and is what this test — and every other drag interaction in this suite — uses. The exact ArrowRight count to reach the "rows"/Y-Axis shelf (5, empirically confirmed) depends on this fixture's own panel width (spatial/proximity-based keyboard navigation, not DOM order) — a real, one-time verification cost, not assumed from any library doc.
- [X] T011 [US1] Integration test — repeated field/mark changes each re-render immediately from the same already-fetched snapshot; assert via `services/duckdb.ts`'s existing `__debugQueryLog()` that exactly one query fired for the whole interaction sequence (Acceptance Scenario 3, FR-002/FR-005). **Real, confirmed gap found and fixed while writing this test**: `queryArrow()` (which `GraphicWalkerPanel.tsx` calls, T012) never pushed to `debugQueryLog` — only `query()` did, since no panel type had ever called `queryArrow()` directly before this feature. Fixed in `services/duckdb.ts` (one line) so both exports are equally visible to this instrumentation.

### Implementation for User Story 1

- [X] T012 [US1] Implement `src/panels/GraphicWalkerPanel.tsx` (new file) per contracts/graphic-walker-panel.md in full: `status` state machine (`loading`/`ready`/`empty`/`error`); mount effect building the query via `buildGraphicWalkerQuery()` + `sqlExpander.expand()` (with the `NOOP_FILTER_STATE` stub — no `$filters.`/`$inputs.` placeholder is ever emitted), calling `queryArrow()`, computing `fields` via `inferFields()` from the *same* Arrow schema that produces `rows`, mounting `embedGraphicWalker` into `containerRef.current` (clearing it first so a config change never stacks a second instance); shared `PanelEmptyState`/`PanelErrorState` branches. Also imports `@kanaries/graphic-walker/dist/style.css` directly (same per-panel CSS-import convention `FlowMapPanel.tsx`/`ZoneMapPanel.tsx` already use for `maplibre-gl/dist/maplibre-gl.css`) — not called out in the original contract sketch, a real gap found while implementing. `npx tsc --noEmit` clean. Depends on: T004, T006, T008.
- [X] T013 [US1] Add `'graphic-walker': GraphicWalkerPanel` to `src/panels/registry.tsx`. Depends on: T012.

**Checkpoint**: User Story 1 fully functional and independently testable (T009–T011 pass). This is the MVP — the ninth and last originally-listed panel type has a real implementation, closing this project's panel-type roadmap.

---

## Phase 4: User Story 2 - Author points an Explore panel at a specific dataset (Priority: P2)

**Goal**: `dataset:`/`scenario:` config controls exactly which view a panel explores — multiple independently-configured panels coexist with no shared state; omitting `scenario:` reuses the existing multi-scenario union with a viewer-facing `scenario` field; setting it pins to one scenario.

**Independent Test**: Per spec.md — add a second `graphic-walker` panel to a test dashboard YAML pointing at a different `dataset:` value than the first, confirm each panel independently shows that dataset's own columns and rows with no cross-contamination.

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] Integration test — a panel configured with `dataset: trip_mode_share` shows only that dataset's own columns/rows from the currently active scenario(s) (Acceptance Scenario 1).
- [X] T015 [US2] Integration test — a second panel with a different `dataset:` value shows an independently different field list/rows on the same tab, with no cross-contamination between the two panel instances (Acceptance Scenario 2, FR-010).
- [X] T016 [US2] Integration test — with `scenario:` omitted and two fixture scenarios loaded, the panel's field list includes a `scenario` field. **Corrected during implementation**: verifying an exact summed row count by reading it back off the rendered chart UI has no reliable text-based hook in this library — the test instead verifies the concrete mechanism directly (the real generated SQL, via `__debugQueryLog()`, references both scenarios' own views in one `UNION ALL`), which is the same, stronger evidence the "row count" claim was actually trying to establish. Activating a second scenario for this test uses the app's own real `?s=` URL param mechanism (`applyURLParams()`), not a test-only shortcut — `good_scenario` is not globally active by default (only `observed` is pinned), a real, confirmed finding from a first, unpinned draft of this feature's own fixture panels (see T003).
- [X] T017 [US2] Integration test — with `scenario: <name>` set, the panel's rows come from only that one named scenario's view, with no `scenario` field present at all (Acceptance Scenario 4, FR-004).

**Checkpoint**: User Stories 1 and 2 both independently functional — no new implementation in this phase; `GraphicWalkerPanel.tsx` (T012) and `buildGraphicWalkerQuery()` (T008) already had to handle dataset/scenario binding correctly from construction, the same relationship `013-zonemap-panel`'s own US2 had to its US1.

---

## Phase 5: User Story 3 - Expand an Explore panel for more working room (Priority: P3)

**Goal**: `004`'s existing expand-to-dialog control enlarges an Explore panel without losing the viewer's in-progress chart.

**Independent Test**: Per spec.md — with an in-progress chart built in an Explore panel, trigger the expand control, confirm the same in-progress chart is still showing enlarged; collapse and confirm it's still showing back in the card.

### Tests for User Story 3 ⚠️

- [X] T018 [P] [US3] Integration test — with an in-progress viewer-built chart (a field already dragged onto a shelf), triggering `004`'s expand control relocates the *same* mounted panel (not a fresh mount) into the dialog with the in-progress chart still showing (Acceptance Scenario 1). Confirmed empirically before writing the final assertion: the state survives cleanly (no special handling needed in `GraphicWalkerPanel.tsx` at all).
- [X] T019 [US3] Integration test — collapsing the expanded panel returns it to the card with the same in-progress chart still showing, unchanged (Acceptance Scenario 2).

**Checkpoint**: All three user stories independently functional — no new implementation in this phase either; `panelCard.tsx`/`usePanelExpandHost` (`004`) are already fully generic (research.md §7, confirmed by direct read) and require zero change for this panel type.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Coverage for requirements that span all three user stories (error/empty states, field-override, filter-non-reactivity, the closing nine-panel-type regression check) plus final verification and documentation.

- [X] T020 [P] Integration test — a `dataset:`/`scenario:` combination that doesn't resolve to a registered view shows `PanelErrorState`; a resolvable-but-empty query shows `PanelEmptyState` — both the same shared components every other panel type's own query failure/empty result already uses (FR-009). The empty case uses `limit: 0` on a dedicated fixture panel — a real, deterministic way to force a genuine zero-row DuckDB result with no new fixture data needed at all.
- [X] T021 [P] Integration test — a `config.fields` override entry changes the inferred `semanticType`/`analyticType` for exactly the named `fid`, leaving every other column's auto-inferred type unchanged (FR-007). Verified via the same real `${analyticType}_${fid}` draggable-id convention T009 found — an override from dimension to measure is directly, concretely observable as `measure_purpose` replacing `dimension_purpose` in the rendered DOM.
- [X] T022 Integration test — a dashboard tab combining all nine now-built panel types (the original eight plus `graphic-walker`) renders without error in a single load — the closing regression check for this project's originally-listed panel-type roadmap (SC-005). Required adding one new row to `dashboard-1-summary.yaml` (the Summary/landing tab, which already hosts the other eight types) — this surfaced T022's own real regression, see T026.
- [X] T023 Integration test — changing a bound global sidebar filter's value elsewhere on the same tab triggers no additional query from the `graphic-walker` panel, confirmed via `__debugQueryLog()` — the concrete, assertable form of FR-005/"snapshot model."
- [X] T024 [P] Run `npm run typecheck` — zero errors across every new/modified file. Clean.
- [X] T025 [P] Run the full Vitest suite (`npx vitest run`) — zero regressions in every existing unit test file, confirming `graphicWalkerFields.test.ts` (T005) and `panelQuery.test.ts`'s new cases (T007) now pass. 22 files, 208 tests, all green.
- [X] T026 [P] Run the full Playwright suite (`npx playwright test`) — zero regressions in every existing integration spec alongside the new `graphicWalkerPanel.spec.ts`. **A real, confirmed regression was found and fixed**: `dashboardShell.spec.ts`'s pre-existing `page.getByRole('tab').allTextContents()` assertion (expecting exactly `['Summary', 'Detail', 'Basemaps']`) started failing once T022's new Summary-tab graphic-walker panel existed — `@kanaries/graphic-walker`'s own internal chart-navigation UI (its "Data"/"Visualization" switcher and "Chart 1" tab strip) genuinely uses `role="tab"` too, confirmed live. Fixed by scoping that query to `navBar.tsx`'s own `role="tablist"` region specifically (`page.getByRole('tablist').first()`) — the correct fix now that the app legitimately has two independent tablist regions on one page, not a workaround; re-confirmed passing in isolation before and after. Three additional single-test failures across repeated full-suite runs (two different `zonemapPanel.spec.ts` timing assertions, one `flowmapPanel.spec.ts` WebGL-context-loss assertion) each independently reproduced ONLY inside a long combined run and passed cleanly every time when re-run in isolation — the same pre-existing GPU/resource-contention flakiness pattern already documented in this project's own `012`/`013` implementation history, confirmed not a regression from this feature (none of the touched files are anywhere near those code paths). Final full-suite run: 167 total (153 pre-existing + 14 new) — 166 passed, the one remaining failure being the already-identified flaky WebGL-context-loss test, confirmed passing in isolation immediately after.
- [X] T027 Extend `docs/GRAMMAR.md`'s existing `type: graphic-walker` section to document the two new optional keys this feature adds beyond its already-documented example — `scenario:` (pins to one scenario, matching every other data-bound panel type's own key) and `fields:` (field-schema override list) — real text drafted against that section's actual current wording, not a duplicate block.
- [ ] T028 Run quickstart.md's manual verification steps 1–11 against a real browser session. **Not performed by the implementing agent** (no real browser to click through manually) — left unchecked honestly rather than marked done on an equivalence claim, matching `009-scenario-manager`'s/`010-flowmap-panel`'s/`013-zonemap-panel`'s own precedent for this exact situation. Every automated equivalent (T009–T023) does pass.
- [X] T029 Update `CLAUDE.md`'s Implementation Order — mark `GraphicWalkerPanel` done in item 10 (was "❌ not started"), noting this completes this project's originally-listed panel-type roadmap in full: all nine panel types (`valuebox`, `plotly`, `table`, `markdown`, `observable-plot`, `sankey`, `flowmap`, `zonemap`, `graphic-walker`) now have a real implementation. Also updated the `src/` file-tree comment block, the `package.json` sketch's version string, and a stray "graphic-walker remains the only panel type not yet built" line elsewhere in the file.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational completion. US2 and US3 depend on US1 (`GraphicWalkerPanel.tsx` must exist before either phase's tests can even target it) but are otherwise pure-verification phases with no new implementation of their own — the same relationship `013-zonemap-panel`'s own US2/US4 had to its US1.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each Phase

- Tests are written and confirmed failing before their corresponding implementation task (T005 before T006; T007 before T008; T009–T011 before T012).
- T013 (registry wiring) depends on T012 (the component must exist to register).
- T012 depends on T004 (config type), T006 (`inferFields`), and T008 (`buildGraphicWalkerQuery`) all being implemented first.

### Parallel Opportunities

- Setup tasks (T001–T003) are independent files with no code dependency between them — marked `[P]`. T001 should logically run first in practice so T002's build-verification and any later typecheck have `node_modules` actually populated, but nothing in this task list blocks T002/T003 from being authored before T001 completes.
- Within Foundational: T004/T005/T007 are `[P]` (different files, no inter-dependency); T006 depends on T005; T008 depends on T007.
- Within US1's test block: T009–T011 are all in the same new spec file (`graphicWalkerPanel.spec.ts`), so — matching `010`/`013`'s own precedent — `[P]` here means parallel-to-*author*, not parallel-at-Playwright-runtime (`playwright.config.js` sets `fullyParallel: false`).
- US2's and US3's test tasks are similarly same-file/author-parallel, runtime-serial.

---

## Parallel Example: Foundational

```bash
# T004/T005/T007 together (different files, no inter-dependency):
Task: "Add GraphicWalkerPanelConfig to layout/types.ts (T004)"
Task: "Write failing graphicWalkerFields.ts unit tests (T005)"
Task: "Write failing buildGraphicWalkerQuery() unit tests (T007)"

# Then, once their own dependency is satisfied:
Task: "Implement graphicWalkerFields.ts (T006)"
Task: "Implement buildGraphicWalkerQuery() (T008)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational — CRITICAL, blocks everything).
2. Complete Phase 3 (US1: T009–T013).
3. **STOP and VALIDATE**: run T009–T011, independently confirming the core drag-fields-build-a-chart capability.
4. This is a legitimate, demoable MVP — the ninth and last originally-listed panel type renders a real free-form exploration UI, closing out this project's panel-type roadmap.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. Add US1 → validate independently → MVP.
3. Add US2 → validate independently (no new code, only new guarantees verified — dataset/scenario binding, multi-panel independence).
4. Add US3 → validate independently (no new code — `004`'s existing expand mechanism inherited for free).
5. Polish → cross-cutting error/empty/override/regression coverage, typecheck/full suites, `docs/GRAMMAR.md` extension, manual quickstart, `CLAUDE.md` audit.

Unlike `013-zonemap-panel`, where US3 added real new implementation
(`comparison: diff`), this feature's US2 and US3 are both pure
verification — `GraphicWalkerPanel.tsx` (T012) and `buildGraphicWalkerQuery()`
(T008) already had to be built correctly for dataset/scenario binding
and 004-compatibility from the start, since neither is separable from
"the panel renders at all." All of this feature's genuinely new
implementation surface is concentrated in Phase 2 (Foundational) and
Phase 3 (US1).

---

## Completion

Feature complete when all 29 tasks are checked and Phase 6's three
automated-suite tasks (T024–T026) pass with zero regressions. T028
(manual quickstart walkthrough) is expected to remain unchecked by an
implementing agent with no real browser access — a human reviewer
completes it before merge, matching established project precedent.

## Post-completion finding: T012's `embedGraphicWalker` choice reversed — real disposal bug

Asked, after all 29 tasks above were already complete: does
`embedGraphicWalker()` expose a disposal handle, and is not calling one
a real risk or genuinely harmless? Checked directly against the real,
installed source (`node_modules/@kanaries/graphic-walker/dist/
vanilla.js`, not the `.d.ts`, which types the return as uninformative
`any`): it calls `ReactDOM.createRoot(dom)` and keeps that root in a
fully local variable — never returned, never exposed. No caller of this
public API can ever call `.unmount()` on it. Confirmed real, not
theoretical: the compiled bundle registers 38 real `document`/
`window.addEventListener` calls (`grep -c`), mostly the standard React
`useEffect`-cleanup-on-unmount idiom, plus a MobX `VizSpecStore`
(`makeAutoObservable`) — none of it gets torn down when the container is
merely removed from the DOM, since that doesn't trigger a *different,
independent* React root's own unmount lifecycle. `shell.tsx` mounts only
the active tab's `DashboardRenderer` (confirmed by reading it), so every
tab switch is a real, repeated mount/unmount cycle for any
`graphic-walker` panel — a real, accumulating leak over an ordinary
session.

**Fixed**: `src/panels/GraphicWalkerPanel.tsx` now renders the plain
`<GraphicWalker>` component directly as JSX in its own tree, not via
`embedGraphicWalker`. `embedGraphicWalker`'s own source proves this is
exactly equivalent in rendered output once `data`/`fields` are provided
(no extra wrapping) — so the fix changes nothing observable except
disposal correctness, which the existing test suite couldn't directly
assert (no listener-count instrumentation exists) but did indirectly
confirm: the entire `graphicWalkerPanel.spec.ts` suite (14 tests) and
`dashboardShell.spec.ts` both pass **unchanged**, byte-for-byte the same
assertions, against the new component — proving the rendered DOM is
identical, exactly as the source predicted. A repeated tab-switch
mount/unmount smoke test (4 cycles) also produced no new console errors
beyond two pre-existing, unrelated ones (a Plotly resize warning and a
COEP resource-loading notice, neither touching GraphicWalker).

Updated to match: `research.md` §3 (full finding, section retitled),
`data-model.md`, `contracts/graphic-walker-panel.md` (shape + Given/
When/Then + `inferFields` sketch), `quickstart.md` (scenario 1, 6, new
scenario 11), `CLAUDE.md` (item 10, the `src/` tree comment, the
"Graphic Walker panel" sketch section, the Stack table row),
`docs/ARCHITECTURE.md`, and `.specify/memory/constitution.md` (a real
PATCH amendment, 2.4.0 → 2.4.1 — a Technology Stack Reference table cell
corrected to match reality, no principle touched).

Full re-verification after the fix: `npx tsc --noEmit` clean;
`graphicWalkerPanel.spec.ts` + `dashboardShell.spec.ts` 18/18 green.
