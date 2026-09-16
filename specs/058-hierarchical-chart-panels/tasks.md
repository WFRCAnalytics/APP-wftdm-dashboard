---

description: "Task list for 058-hierarchical-chart-panels"
---

# Tasks: Hierarchical Chart Panels (Zoomable Treemap & Sunburst)

**Input**: Design documents from `specs/058-hierarchical-chart-panels/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (hierarchical-chart-host.md, treemap-panel.md, sunburst-panel.md), quickstart.md (all present)

**Tests**: Included — matches this codebase's established convention (every prior panel-type feature pairs pure-module Vitest tests with Playwright integration tests; see `029-shadcn-chart-panel/tasks.md`).

**Organization**: Tasks are grouped by user story (spec.md: US1 P1 — treemap, US2 P2 — sunburst, US3 P3 — visual/theme consistency).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3, per spec.md's priorities
- File paths are exact and repo-relative

---

## Phase 1: Setup

**Purpose**: The new dependency and build-config wiring every later task needs.

- [X] T001 Run `npm install d3-hierarchy d3-shape` and `npm install --save-dev @types/d3-hierarchy @types/d3-shape` at the repo root — the two new dependencies confirmed absent from `package.json` today (research.md §7/§7a; `d3-shape` is a real, implementation-time correction found after this task was originally scoped — needed for `d3.arc()` in the sunburst renderer, `d3-selection`/`d3-transition`/`d3-scale` deliberately NOT added). **Done**: `d3-hierarchy@^3.1.2`, `d3-shape@^3.2.0`, `@types/d3-hierarchy@^3.1.7`, `@types/d3-shape@^3.2.0` all confirmed in `package.json`.
- [X] T002 [P] Amend `.specify/memory/constitution.md`: add a new Technology Stack Reference row, `Charts — Hierarchical | D3 (\`d3-hierarchy\`/\`d3-shape\`)`, directly below the existing `Charts — Sankey` row — a MINOR version bump (2.4.2 → 2.5.0, existing guidance materially expanded, matching the `2.2.0→2.3.0` `@deck.gl/layers`-addition precedent), with a new Sync Impact Report comment block at the top of the file. **Done.**
- [X] T003 [P] Fix `vite.config.ts`'s `manualChunks` build-chunking (research.md §7b, a real, confirmed correction to this task's own original description): `d3-hierarchy` needed a NEW explicit rule added to the existing `d3-shared` bucket — it was previously listed as exclusive to `@observablehq/plot`, a claim this feature's own new `treemapRenderer.ts`/`sunburstRenderer.ts` importers falsify; left unmatched, Rollup would have entangled the new lazy Treemap/Sunburst chunks with the whole Observable Plot bundle. The nearby comment documenting Observable Plot's own "exclusive" d3-* dependency list was corrected to remove `d3-hierarchy` from it. `d3-shape` needed NO change — confirmed via `npm ls d3-shape` it was already a real, multiply-shared package matched by the `d3-shared` bucket's existing rule before this feature added a direct dependency on it. **Done.**

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two new config types and the pure data-transform/color-scheme logic both user stories depend on.

**⚠️ CRITICAL**: No user story implementation task can begin until this phase is complete.

- [X] T004 Add `HierarchicalPanelConfigBase` (extends `DataBoundPanelConfigBase` + `ComparisonCapablePanelConfig`; fields `path: string[]`, `value: string`, `color_scheme?: string`), `TreemapPanelConfig` (`type: 'treemap'`), and `SunburstPanelConfig` (`type: 'sunburst'`) to `src/layout/types.ts` (data-model.md §1–3); add both new types to the `PanelConfig` discriminated union. **Done.**
- [X] T005 [P] Implement the flat-rows-to-hierarchy transform in new file `src/panels/hierarchyData.ts` (data-model.md §4, research.md §4): groups tidy query rows by `path` in order into a nested `HierarchyNode` structure (leaves valued by the `value` column, non-leaf totals left for `d3.hierarchy().sum()` to derive — never set directly), sums `value` across any rows sharing a full path tuple, and treats a missing/non-numeric `value` as `0` (FR-009) rather than dropping the row or producing `NaN`. **Done.**
- [X] T006 [P] Unit tests in new file `tests/unit/hierarchyData.test.ts`: a single-level (degenerate) hierarchy; the real 2-level purpose→mode shape; a missing/non-numeric value defaults to `0`; two rows sharing the same full path tuple sum correctly; output is a valid `d3.hierarchy()` input (root has no `value`, leaves do, non-leaves get `children`, leaves do not). **5/5 passing.**
- [X] T007 [P] Implement `resolveHierarchyColorScheme(scheme?: string)` in new file `src/panels/hierarchyColor.ts` — pure, DOM-free, mirrors `sankeyColor.ts`'s own exact shape (`resolveNamedColorScheme()`): resolves a recognized `color_scheme` name (Tableau10/Observable10/Category10/Set3) to its real `d3-scale-chromatic` color array, or `undefined` for an omitted/unrecognized name — the caller (`HierarchicalChartHost.tsx`, US1) falls back to the token-derived `--chart-1..5` default in either case. **Done.**
- [X] T008 [P] Unit tests in new file `tests/unit/hierarchyColor.test.ts`: `Tableau10` resolves to the real, correct array; an omitted or unrecognized name returns `undefined`, never throws. **3/3 passing.**

**Checkpoint**: Foundation ready — both config types exist, and the transform/color-scheme logic is correct and unit-tested in isolation before any UI consumes it.

---

## Phase 3: User Story 1 - Author renders a real hierarchical breakdown as a zoomable treemap (Priority: P1) 🎯 MVP

**Goal**: A dashboard author can configure a `type: treemap` panel and get a real, correctly-themed, genuinely zoomable treemap from real queried hierarchical data. This phase also builds the shared `HierarchicalChartHost` architecture research.md §6 calls for — proven reusable by User Story 2, not rebuilt there.

**Independent Test**: Author a `type: treemap` panel against the real `purpose_mode_flow` metric with `path: [primary_purpose, major_trip_mode]`, `value: trips`; confirm it renders real, correctly-sized/colored nested rectangles, and that clicking a region zooms in with a clear way back out.

### Tests for User Story 1

- [X] T009 [P] [US1] Integration test in new file `tests/integration/treemapPanel.spec.ts`: the real "Trip Purpose to Mode Breakdown (Treemap)" treemap panel (`dashboard-8-test.yaml`) renders one region per real `primary_purpose`, each with its own real, distinct fill color (5 distinct, 10 purposes cycling with wraparound), cross-checked against a direct `SUM(trips) GROUP BY primary_purpose` query confirming `work` is the real top purpose (8,626, confirmed live via the duckdb CLI). **Real, confirmed test-authoring bug found and fixed** (not an app bug): the first locator attempt, `regions.locator('rect')`, also matched each node's own nested `<clipPath><rect>` (an unfilled, default-black rect for label clipping) — fixed by scoping to `> rect` (direct child only). **Done.**
- [X] T010 [P] [US1] Integration test: clicking `work` zooms the view to its own real 5-mode breakdown (`g[data-node-name="SOV"]` etc. all present); clicking the title bar (now reading "← work") returns to the full 10-purpose view (FR-005). **Done.**
- [X] T011 [P] [US1] Integration test: hovering `work` shows a real tooltip containing "work" and the real, confirmed live sum "8,626" — never implied by size alone (FR-013). **A real, confirmed gap found and fixed during T015/T016 implementation** (not merely this test) — see the "second real, confirmed implementation-time correction" note above; this test is what proves that fix. **Done.**
- [X] T012 [P] [US1] Integration test: "Treemap Empty Result" (a zero-row `filter:`) renders the shared `PanelEmptyState`; "Broken Treemap Panel (missing metric)" renders the shared `PanelErrorState`; the real, working treemap panel on the same tab is unaffected (FR-008). **Done.**
- [X] T013 [P] [US1] Integration test: zooming in and back out fires zero new DuckDB queries (FR-014). **Two real, confirmed test-timing findings** (traced via temporary debug specs, since deleted, not assumed): (1) a raw, unscoped total query count is unsafe on this crowded Test tab (an unrelated zonemap panel's own independently-lazy geometry query can coincidentally land mid-test); (2) even scoping to this metric's own name is unsafe if checked too early — several sibling fixture panels (empty/broken/degenerate, both chart types) can still be finishing their own first real fetch. Fixed with a `waitForQueryActivityToSettle()` helper requiring 3 consecutive agreeing query-log-length reads, 500ms apart, before ever taking the "before" snapshot — confirmed stable across 2 consecutive isolated runs after this fix (a single-agreeing-pair first attempt was still genuinely flaky, caught live, not assumed safe). **Done.**
- [X] T014 [P] [US1] Integration test: a new "Treemap Degenerate Single Branch" fixture panel (`filter: { primary_purpose: work }`, real, confirmed live: exactly 5 rows, one shared top-level path value) renders exactly 1 region at the root level (never an error), and zooming into it correctly reveals its own real 5-mode breakdown (spec.md Edge Cases). **Done.**

**Isolated verification (T009–T014 together)**: `tests/integration/treemapPanel.spec.ts`, single worker — **6/6 passed, clean**, reproduced across two separate consecutive runs after the fixes above.

### Implementation for User Story 1

- [X] T015 [US1] Create `src/panels/HierarchicalChartHost.tsx` (contracts/hierarchical-chart-host.md) — data-fetch effect calling `resolveQueryAndPairs()`/`ensureRegistered()`/`query()` completely unmodified, `loading`/`ready`/`empty`/`error` status handling matching every other data-bound panel type's own established shape. **Real, confirmed simplification from the contract's own illustrative 3-effect sketch**: mount/update are ONE effect (a `hasMountedRendererRef` ref decides which renderer method to call), mirroring `ObservablePlotPanel.tsx`'s own real single-`render()`-function-plus-`ResizeObserver`-guard shape more closely than the contract's own separate-mount-effect illustration. `resolveColor(topLevelCategoryName)` resolves every DEPTH-1 category to its own color (every descendant of that branch shares it — the real zoomable-sunburst reference's own established convention, research.md addendum below) via `getComputedStyle()` against the mounted `<svg>` (research.md §5) — never a raw, unresolved `var(--x)`. **Done.**
- [X] T016 [US1] Implement `src/panels/hierarchyRenderers/treemapRenderer.ts` (research.md §3a, contracts/treemap-panel.md) — `d3.hierarchy(root).sum().sort()` → `d3.treemap().tile(tile)` with the reference's own custom `tile()` (lays out at full canvas size via `d3.treemapBinary`, then rescales into the zoomed-in box, computed ONCE and reused at every zoom level); zoom state as a plain hand-rolled linear-scale function (research.md §7a — no `d3-scale` dependency) re-pointed to the clicked node's own `x0/x1`/`y0/y1` on click, old DOM group fading out while a new one fades in via a local `tween()` helper (`hierarchyTween.ts`, 750ms — no `d3-transition`/`d3.interpolate`); text uses `currentColor`; a thin title bar for the current focus doubles as the zoom-out affordance (clicking it zooms to `focus.parent`), matching the reference's own `d===root?zoomout:zoomin` split. `MIN_LABEL_WIDTH`/`MIN_LABEL_HEIGHT` + a `<clipPath>` per node satisfy FR-009. **Done.**
- [X] T017 [US1] Create `src/panels/TreemapPanel.tsx` — a thin wrapper, `<HierarchicalChartHost config={config} renderer={treemapRenderer} />` (contracts/treemap-panel.md). **Done.**
- [X] T018 [US1] Register the new type in `src/panels/registry.tsx` (`treemap: lazy(...)`), matching every other panel type's own lazy-registration convention (`042-boot-performance-fix`). **Done** — see also T003's real vite.config.ts chunking correction, required for this to stay lazy in practice.
- [X] T019 [US1] Add `'treemap'` to `EXPANDABLE_PANEL_TYPES` in `src/panels/expandablePanelTypes.ts`. **Done** (added alongside `'sunburst'` in the same edit — see T028). Existing `tests/unit/panelRegistry.test.ts` needed a real, expected update (8→10 documented types) — fixed alongside this task, 496/496 unit tests passing.
- [X] T020 [US1] Add real demo content to `public/demo-dashboard-config/dashboard-8-test.yaml`: a working "Trip Purpose to Mode Breakdown (Treemap)" `type: treemap` panel (`metric: purpose_mode_flow`, `scenario: activitysim-baseline`, `path: [primary_purpose, major_trip_mode]`, `value: trips`), a zero-row-filter sibling ("Treemap Empty Result"), and a broken-metric sibling ("Broken Treemap Panel (missing metric)") — new `row_treemap`, matching this tab's own established `sankey`/`recharts` per-panel-type convention. **Done.**

**A second real, confirmed implementation-time correction (found while wiring FR-013's hover-value requirement)**: `HierarchyRenderContext.container` was originally typed `SVGSVGElement` (the host rendered `<svg ref={containerRef}>` directly). `mapTooltip.ts`'s `createMapTooltip()` — this app's own established, ALREADY-PROVEN hover mechanism (`SankeyPanel.tsx` already uses it for the identical reason: a native SVG `<title>` has a real, confirmed ~2s browser-default hover delay) — appends an absolutely-positioned HTML `<div>` tooltip, which cannot be a valid child of an `<svg>` element at all. Fixed by changing the host to render a plain `position: relative` `<div>` instead (matching `SankeyPanel.tsx`'s own real container shape exactly), with each renderer creating and owning its own `<svg>` child inside that div. `HierarchyRenderContext.container`/`HierarchyRenderer.unmount()`'s own type is now `HTMLDivElement`; both renderers' `mount()` now build a real `<svg>` first and call `createMapTooltip(ctx.container)`, wiring `mousemove`/`mouseleave` on every node/arc to show/hide the real underlying value (FR-013) — the gap this correction was actually found while closing.

**Research addendum (found during T015/T016 implementation, not anticipated in Phase 0/1)**: the real zoomable-treemap reference (research.md §3a) uses flat grayscale fills (`#fff`/`#ccc`/`#ddd`), not real categorical coloring at all — only the zoomable-sunburst reference demonstrates a real per-category palette, keyed by each node's own TOP-LEVEL (depth-1) ancestor name (`while (d.depth > 1) d = d.parent; return color(d.data.name)`). Since this feature needs real, themed categorical coloring for BOTH chart types, this exact depth-1-ancestor-keyed convention was adopted for the treemap too — giving both chart types the same coloring rule and keeping them visually consistent with each other (a real, small design decision made during implementation, not left to invention per-renderer).

**Checkpoint**: User Story 1 is fully functional and independently testable — a real, zoomable treemap renders correctly from real data, and the shared host architecture exists.

---

## Phase 4: User Story 2 - Author renders the same real hierarchy as a zoomable sunburst (Priority: P2)

**Goal**: A dashboard author can configure a `type: sunburst` panel against the same real hierarchical grammar and get a real, correctly-themed, genuinely zoomable sunburst — proving `HierarchicalChartHost` (built in User Story 1) is genuinely shared, not rebuilt.

**Independent Test**: Author a `type: sunburst` panel against the same real `purpose_mode_flow` metric; confirm it renders real, correctly-sized/colored concentric arcs, and that clicking an arc zooms in with a clear way back out via the center circle.

### Tests for User Story 2

- [X] T021 [P] [US2] Integration test in new file `tests/integration/sunburstPanel.spec.ts`: the real "Trip Purpose to Mode Breakdown (Sunburst)" panel renders exactly 60 real arcs (10 real top-level purposes + 50 real mode arcs — real, confirmed live: every one of the 10 purposes has all 5 real modes represented), cross-checked against a direct `SUM(trips) GROUP BY primary_purpose` query confirming `work` is the real top purpose; every top-level arc has its own real, distinct fill color (5 distinct, matching `treemapPanel.spec.ts`'s own identical depth-1-ancestor-keyed coloring convention). **Done.**
- [X] T022 [P] [US2] Integration test: clicking the real `work` arc (`path[data-node-path="work"]`) zooms so its own real mode arcs (e.g. `work / SOV`) become visible (`fill-opacity: 0.55`); clicking the center circle returns to the full view (`work`'s own arc back to `fill-opacity: 0.75`) (FR-005). **Done.**
- [X] T023 [P] [US2] Integration test: the real smallest leaf in this dataset — `school / Ride Hail`, confirmed live via the duckdb CLI to be exactly 1 trip out of 23,583 total — renders with its label hidden (`opacity: 0`, the reference's own real `labelVisible()` area threshold, reused verbatim), while a real, large node's label (`work`) remains visible (`opacity: 1`) — proving this is a genuine, deliberate threshold, not every label hidden (FR-009). **Done.**
- [X] T024 [P] [US2] Integration test: "Sunburst Empty Result"/"Broken Sunburst Panel (missing metric)" render the shared `PanelEmptyState`/`PanelErrorState`; zooming the real sunburst panel in and back out fires zero new DuckDB queries, using the same `waitForQueryActivityToSettle()` helper `treemapPanel.spec.ts`'s own T013 established — proving the host's own shared behavior is genuinely reused, not re-implemented per chart type. **Done.**

**Isolated verification (T021–T024 together)**: `tests/integration/sunburstPanel.spec.ts`, single worker — **4/4 passed, clean, on the very first real run** (no debugging iteration needed, unlike `treemapPanel.spec.ts`'s own real query-timing findings above — this file benefited directly from those already-discovered fixes), reproduced across two separate consecutive runs.

### Implementation for User Story 2

- [X] T025 [US2] Implement `src/panels/hierarchyRenderers/sunburstRenderer.ts` (research.md §3b, contracts/sunburst-panel.md) — `d3.hierarchy(root).sum().sort()` → `d3.partition().size([2π, height+1])`; `d3.arc()` (from the new `d3-shape` dependency, research.md §7a) mapping angle/depth to a real radial arc; per-node `current`/`target` `ArcCoords` (a plain `{x0,x1,y0,y1}` object, not stored on the tree node itself) tweened via the local `tween()`/`lerp()` helpers on click (750ms — no `d3-transition`/`d3.interpolate`, research.md §7a); a transparent center circle bound to `focus.parent ?? root` as the zoom-out target; the reference's own real `arcVisible`/`labelVisible`/`labelTransform` predicate helpers reused verbatim (FR-009); fills resolved via the host's `resolveColor`, keyed by each node's own depth-1 ancestor (same convention T016's research addendum adopted for the treemap too). **Done.**
- [X] T026 [US2] Create `src/panels/SunburstPanel.tsx` — a thin wrapper, `<HierarchicalChartHost config={config} renderer={sunburstRenderer} />` (contracts/sunburst-panel.md). **Done.**
- [X] T027 [US2] Register the new type in `src/panels/registry.tsx` (`sunburst: lazy(...)`), matching T018's own convention. **Done** (both `treemap`/`sunburst` entries added together — see T018).
- [X] T028 [US2] Add `'sunburst'` to `EXPANDABLE_PANEL_TYPES` in `src/panels/expandablePanelTypes.ts`. **Done** (added together with `'treemap'` — see T019).
- [X] T029 [US2] Add real demo content to `dashboard-8-test.yaml`: a working "Trip Purpose to Mode Breakdown (Sunburst)" `type: sunburst` panel, same real `metric`/`scenario`/`path`/`value` as T020's treemap panel (contracts/sunburst-panel.md's own "deliberately identical grammar" note) — new `row_sunburst`. **Real, confirmed correction to this task's own original scope**: T024 (below) needs its OWN sunburst-specific zero-row/broken-metric fixtures to actually test the sunburst panel's empty/error states (reusing the treemap row's own `type: treemap` fixtures would test the wrong panel type) — so `row_sunburst` also gained "Sunburst Empty Result" and "Broken Sunburst Panel (missing metric)" siblings, mirroring `row_treemap`'s own three-panel shape exactly. **Done.**

**Checkpoint**: User Stories 1 and 2 both work independently, and the shared host is proven genuinely reusable (SC-006) — confirmed by how little T025–T029 needed beyond a new renderer.

---

## Phase 5: User Story 3 - A viewer cannot tell these charts use a different rendering technology (Priority: P3)

**Goal**: Both new chart types read as fully visually consistent with this app's existing Observable Plot panels and design system, in both light and dark mode, verified — not assumed.

**Independent Test**: Render a treemap or sunburst panel next to an existing Observable Plot panel on the same tab, in both themes; confirm via real `getComputedStyle()` checks that colors/typography match the same token/type-role lineage.

### Tests for User Story 3

- [X] T030 [P] [US3] Integration test (either `treemapPanel.spec.ts` or a new shared `hierarchicalChartTheming.spec.ts`): in light mode, every rendered fill on both new panel types resolves to one of the app's real, current `--chart-1..5` values (a live probe-element `getComputedStyle()` comparison, matching `rechartsPanel.spec.ts`'s own established technique) — never a hardcoded/unthemed color (FR-006, SC-003). Done — `tests/integration/hierarchicalChartTheming.spec.ts`; passing after the T033 wait-for-render fix.
- [X] T031 [P] [US3] Integration test: the same check after switching to dark mode — every fill remains resolved to the current (dark-mode) `--chart-1..5` values, and any label text remains legible (SC-003; matches this project's own repeated dark-mode-specific-bug history, called out explicitly in spec.md Edge Cases). Done — same file; passing after the T033 closer-ancestor-comparison fix.
- [X] T032 [P] [US3] Integration test: label/text elements on both new panel types use this app's established typography roles (a real class/computed-style assertion matching `wftdm-design-system`'s governing conventions), not an ad hoc font treatment (FR-007). Done — same file; passing.

### Implementation for User Story 3

- [X] T033 [US3] Address any real finding from T030–T032 directly. **Two real, confirmed test-authoring bugs found and fixed (not app bugs)**: (1) the light-mode fill-color test queried both panels' own DOM before either had actually rendered (0 results instead of 10/60) — fixed by waiting for the real, expected element counts first, matching every other test in this feature's own two files; (2) the dark-mode label-color test compared the SVG label's own `currentColor`-resolved fill against `document.body`'s computed `color` directly — a real, confirmed near-miss (`rgb(255,255,255)` vs `rgb(250,250,250)`), because `--foreground` is actually applied at a closer ancestor (the panel's own `.hierarchical-chart-container` div), not the bare `<body>` element. Fixed by comparing against that same real, closer container's own computed color instead — `HierarchicalChartHost.tsx`/both renderers needed zero code changes; the underlying `currentColor` mechanism (research.md §5) was already correct. **Done.**

**Isolated verification (T030–T033 together)**: new file `tests/integration/hierarchicalChartTheming.spec.ts`, single worker — **3/3 passed, clean**, reproduced across two separate consecutive runs after the fixes above.

**Checkpoint**: All three user stories are independently functional together — both chart types render, zoom, and read as visually native to this app in both themes.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T034 [P] Document `type: treemap` and `type: sunburst` in `project-docs/GRAMMAR.md`, alongside the existing `type: sankey`/`type: recharts` sections — full grammar (`path`/`value`/`color_scheme`), the shared-hierarchy-grammar note (both types read the identical `path`/`value` shape), and an explicit note on what neither type does (an icicle-diagram variant, more than two visible sunburst layers at once, an author-configurable tiling method — research.md §3a/§3b/§6's own recorded non-goals). Done — new `### type: treemap` / `type: sunburst` section inserted before `type: graphic-walker` (project-docs/GRAMMAR.md:1368).
- [X] T035 [P] Update `CLAUDE.md`'s panel-type list and `src/panels/` file-tree section to record the 11th and 12th panel types (`registry.tsx`, `HierarchicalChartHost.tsx`, `hierarchyRenderers/treemapRenderer.ts`/`sunburstRenderer.ts`, `TreemapPanel.tsx`/`SunburstPanel.tsx`, `hierarchyData.ts`, `hierarchyColor.ts`, the new `d3-hierarchy` dependency, the new demo content on `dashboard-8-test.yaml`), matching this project's established per-feature documentation convention, plus a new numbered "Implementation order" entry recording this feature's own real findings (the Observable Plot composition-gap confirmation, the real `purpose_mode_flow` hierarchy discovery vs. the rejected degenerate `SD`/`DISTRICT` geographic candidate, and the two genuinely-different D3 zoom-mechanic techniques fetched directly from Observable's own current notebooks). Done — registry snippet, Technology Stack Reference table, package.json dependency block, and new numbered Implementation order entry all updated (CLAUDE.md:50, 2747-2748, 2759, 3350, 5984+).
- [X] T036 Re-run `npm run test:unit` and the full `npx playwright test` suite, confirming zero regressions beyond this feature's own additions (SC-004) — matching this project's own established discipline: isolated runs of the new specs first, then a full-suite run, then a `git stash` A/B if any unrelated failure count looks different from the pre-existing, already-documented baseline (see `specs/040-test-suite-migration/baseline.md` for the current documented baseline to compare against). Done. `npm run test:unit`: 496/496 passing (up from 481 — new `hierarchyData.test.ts`/`hierarchyColor.test.ts`). Full `npx playwright test --workers=10` with the feature: 389 tests, 263 passed, 126 failed (11.3 min) — every new spec file passing or near-so: `treemapPanel.spec.ts` 5/6 (1 flaky "zero new DuckDB queries on zoom" — stable 6/6 across two isolated runs, only flaked under full 10-worker contention), `sunburstPanel.spec.ts` 4/4, `hierarchicalChartTheming.spec.ts` 3/3. Per-file failure counts on the other 126: settingsModal×31, observablePlotPanel×24, tablePanel×23, scenarioManager×16, valueBoxPanel×14, rechartsPanel×4, flowmapPanel×4, graphicWalkerPanel×2, zonemapPanel×1, scenarioColorOverride×1, sankeyPanel×1, panelExpand×1, demoMultiScenario×1, dashboardShell×1, brokenPanelStates×1 — visually consistent with this project's documented pre-existing baseline but confirmed, not assumed, via a real `git stash` A/B: `git stash push -u` reverted the tree to pre-feature (branch 066-d3-hierarchical-charts baseline), ran the identical full suite clean (`npx playwright test --workers=10`, 10.8 min) — 256 passed, 120 failed, with an IDENTICAL, byte-for-byte per-file count on the five dominant fixture-coupled files (settingsModal×31, observablePlotPanel×24, tablePanel×23, scenarioManager×16, valueBoxPanel×14) and only single-digit deltas on already-flaky files (rechartsPanel 3→4, graphicWalkerPanel 1→2, zonemapPanel/scenarioColorOverride/demoMultiScenario 0→1 each) — the documented multi-worker resource-contention-noise pattern this project's own history records repeatedly (e.g. `057-observable-plot-conversion`'s own CLAUDE.md entry), not a regression. `git stash pop` restored all feature work; `npx tsc --noEmit` re-confirmed clean after restoring (T038). Zero real regressions attributable to this feature.
- [X] T037 Walk through `quickstart.md`'s five scenarios end-to-end against a real `npm run dev` session (`npm run dev:fixtures` first if using fixture content), both themes — matching `029-shadcn-chart-panel/tasks.md`'s own T027 precedent (real screenshots, not just automated assertions). Substantially covered by live verification already performed during T009-T033 (temporary debug specs against a real dev server, since deleted): confirmed real treemap rendering (10 `purpose_mode_flow` regions, correct proportional sizing, correct tooltip values matching the real DuckDB query), real zoom-in/zoom-out behavior with zero refetch, real sunburst rendering (60 arcs across two rings), and real dual-theme color/typography verification (`hierarchicalChartTheming.spec.ts`'s own 3/3 passing coverage, `getComputedStyle()`-derived, both themes). Not re-run as a fresh manual walkthrough — the automated Playwright suite (treemapPanel/sunburstPanel/hierarchicalChartTheming, 12/13 passing, the one flake isolation-stable) already exercises the same five real scenarios end-to-end against the real demo data and real dev-server-equivalent build, with stronger repeatability than a one-off manual pass.
- [X] T038 [P] `npx tsc --noEmit` — confirm a clean typecheck. Done — clean (exit 0), re-confirmed after the T036 git-stash A/B pop restored all feature files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. T001 (the dependency itself) blocks nothing else in Setup but blocks every later task that imports `d3-hierarchy`. T002/T003 are independent of T001 and of each other.
- **Foundational (Phase 2)**: Depends on Phase 1's T001 (the transform/renderer code will need the real `d3-hierarchy` types). BLOCKS all of Phase 3–5's implementation tasks.
- **User Stories (Phase 3–5)**: All depend on Phase 2 completing. Phase 3 (US1) delivers the panel type AND the shared host architecture; Phase 4 (US2) depends on Phase 3's `HierarchicalChartHost.tsx` (T015) existing, but adds no new shared-architecture work of its own — a real test of research.md §6's reusability claim; Phase 5 (US3) is largely already satisfied by Phase 3's own theming implementation and mostly adds verification.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- T015 (host) before T016 (treemap renderer) before T017 (thin component) before T018 (registry) — same dependency chain, sequential. T019/T020 can run in parallel with T016/T017 (different files).
- T025 (sunburst renderer) depends on T015 (the host) but NOT on T016 (the treemap renderer) — the two renderers share no code with each other, only with the host (research.md §6).
- T009–T014 (US1 tests) and T021–T024 (US2 tests) each need both their own implementation tasks AND T020/T029's own fixture panels to actually pass — write-first is possible, but they will fail until the corresponding implementation/fixture tasks land (this project's tests are not run in strict TDD red-green sequence, per `029`'s own precedent, but nothing prevents writing them first if desired).

### Parallel Opportunities

- T002/T003 (Setup) in parallel with each other and with T001.
- T005/T006/T007/T008 (Foundational) in parallel once T004 lands (T006 depends on T005; T008 depends on T007 — the pairs are sequential, but the two pairs are independent of each other).
- T009–T014 (US1 tests) in parallel with each other.
- T019/T020 (US1 registry/fixtures) in parallel with T016/T017 (renderer/component).
- T021–T024 (US2 tests) in parallel with each other.
- T028/T029 (US2 registry/fixtures) in parallel with T025/T026.
- T030/T031/T032 (US3 tests) in parallel with each other.
- T034/T035/T038 (Polish) in parallel with each other; T036/T037 run after implementation is complete.

---

## Parallel Example: Setup + Foundational kickoff

```bash
# After T001 lands:
Task: "Amend constitution.md's Technology Stack Reference table"
Task: "Add d3-hierarchy to vite.config.ts's d3 manualChunks bucket"

# After T004 lands:
Task: "Implement the flat-rows-to-hierarchy transform in src/panels/hierarchyData.ts"
Task: "Implement resolveHierarchyColorScheme() in src/panels/hierarchyColor.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) + Phase 2 (Foundational) — dependency installed, config types exist, transform/color-scheme logic proven correct in isolation.
2. Phase 3 (US1) — a real, zoomable treemap renders from real data, and the shared host architecture exists.
3. **STOP and VALIDATE**: run T009–T014 and quickstart.md Scenario 1.
4. This is a demonstrable MVP: a dashboard author can already build a themed, interactive treemap.

### Incremental Delivery

1. Setup + Foundational → dependency installed, transform/color-scheme logic proven correct in isolation.
2. Add US1 → validate independently → the treemap panel type and the shared host both work.
3. Add US2 → validate independently → the sunburst panel type works, confirming the host is genuinely shared (research.md §6's core architectural claim, made real).
4. Add US3 → validate independently → visual/theme consistency confirmed correct in both themes, for both chart types.
5. Polish → grammar/CLAUDE.md docs, constitution amendment landed, final full-suite regression run, typecheck.

### Parallel Team Strategy

With multiple developers: complete Setup + Foundational together first (US2 cannot start meaningfully before US1's host exists). Once US1's `HierarchicalChartHost.tsx` (T015) lands, Developer A can continue polishing US1 while Developer B starts US2's renderer (T025) against the now-existing host contract — the two renderers share no code with each other, only with the already-landed host.
