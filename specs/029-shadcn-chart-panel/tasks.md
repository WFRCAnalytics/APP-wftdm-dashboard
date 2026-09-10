---

description: "Task list for 029-shadcn-chart-panel"
---

# Tasks: shadcn/Recharts Chart Panel Type

**Input**: Design documents from `/specs/029-shadcn-chart-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/recharts-panel.md, quickstart.md (all present)

**Tests**: Included — matches this codebase's established convention (every prior panel-type feature pairs pure-module Vitest tests with Playwright integration tests).

**Organization**: Tasks are grouped by user story (spec.md: US1 P1, US2 P1, US3 P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3, per spec.md's priorities
- File paths are exact and repo-relative

---

## Phase 1: Setup

**Purpose**: The new dependency, primitive, tokens, and build config every later task needs.

- [X] T001 Run `npx shadcn@latest add chart` at the repo root — adds `src/components/ui/chart.tsx` (shadcn's real, current source — research.md §5, a deliberate departure from this repo's prior hand-authored-component convention) and installs `recharts` as an npm dependency. **Real findings during execution**: the CLI's interactive per-file overwrite prompt (`card.tsx already exists`) has no non-interactive skip via `-y` alone — required piping `echo "n" | npx shadcn@latest add chart -y` to decline overwriting `card.tsx` (confirmed preserved, still carries Phase 2's own `text-base` `CardTitle` fix) while still creating `chart.tsx` (367 lines). **A real, confirmed version discrepancy from research.md**: the CLI pinned `recharts@^2.15.4`, not npm's "latest" tag (`3.10.1`) originally researched — re-verified peer deps directly against the actually-installed package (`^18.0.0` included, still compatible) and corrected research.md §6/plan.md accordingly rather than silently proceeding on stale documentation.
- [X] T002 [P] Add `--chart-1` through `--chart-5` to `src/styles/tokens.css`'s `:root` and `.dark` blocks. **Corrected during implementation** (research.md §1's own recorded finding): the originally-planned values gave `--chart-1`/`--chart-2` the identical dark-mode value (`--brand-wfrc-secondary-blue`, since `--primary` already resolves to it in dark mode) — a real, caught-before-shipping usability defect (two indistinguishable series colors). Final, corrected, verified values — light: `#023c5b`/`#8a5a0f`/`#3f6b74`/`#7f7a76`/`#7a4a8a`; dark: `#52b6d5`/`#f8b93e`/`#8fc1cc`/`#a8a29c`/`#c99ed6` — all 10 ≥4.24:1 against their own theme's background, and all 5 pairwise-distinct within each theme.
- [X] T003 [P] Add a `chart` color-token group to `tailwind.config.js`'s `theme.extend.colors` (`chart: { 1: 'var(--chart-1)', 2: 'var(--chart-2)', 3: 'var(--chart-3)', 4: 'var(--chart-4)', 5: 'var(--chart-5)' }`), mirroring `success`'s own existing entry shape.
- [X] T004 [P] Add a `recharts` `manualChunks` branch to `vite.config.ts`, splitting `recharts` into its own chunk — matching the existing `plotly`/`maps`/`graphic-walker` chunk precedent. **Corrected during implementation**: the real, confirmed dependency additions are `lodash`/`react-smooth`/`recharts-scale`/`victory-vendor` (research.md §6's own correction), not the `@reduxjs/toolkit`/`react-redux`/`immer` chain originally planned around a different, newer Recharts major version that wasn't actually the one installed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The config type and the pure pivot/encoding logic every user story's UI work depends on.

**⚠️ CRITICAL**: No user story implementation task can begin until this phase is complete.

- [X] T005 Add `RechartsPanelConfig` to `src/layout/types.ts` (extends `DataBoundPanelConfigBase` + `ComparisonCapablePanelConfig`; fields `type: 'recharts'`, `chart_type: 'bar' | 'line' | 'area'`, `x: string`, `y: string`, `series?: string`, `stacked?: boolean` — data-model.md §1), and add it to the `PanelConfig` discriminated union.
- [X] T006 [P] Implement `encodeRechartsData(rows, config)` in new file `src/panels/rechartsEncoding.ts` (data-model.md §3, research.md §2/§3): pivots tidy query rows into Recharts' own wide-row shape plus a `ChartConfig`, cycling `--chart-1`..`--chart-5` in first-seen order (wrapping after the fifth), leaving a missing series/x combination `undefined` (not `0`).
- [X] T007 [P] Unit tests in new file `tests/unit/rechartsEncoding.test.ts`: no-`series` (single synthetic key) case; multi-series pivot against a real tidy shape (e.g. `purpose`/`mode`/`share`); a missing combination is `undefined` not `0`; color-cycling wraps correctly past the fifth distinct series value; output ordering is deterministic (first-seen), not re-sorted. **5/5 passing.**
- [X] T008 [P] Extend `tests/unit/tokenContrast.test.ts` with a new, clearly-separate check (not folded into the existing text-pair loop) asserting each `--chart-1`..`--chart-5` value achieves ≥3:1 (WCAG non-text/graphical-object minimum) against `--background`, in both `:root` and `.dark` — research.md §1's own verified ratios (all ≥4.24:1). Also added a pairwise-distinctness check (all 5 tokens resolve to different colors within each theme) — the direct regression guard for the chart-1/chart-2 dark-mode-collision bug found and fixed during T002. **11 new tests, 27/27 total passing.**

**Checkpoint**: Foundation ready — the config type exists and the pivot logic is correct and unit-tested in isolation before any UI consumes it.

---

## Phase 3: User Story 1 - Author a bar, line, or area chart with the new default engine (Priority: P1) 🎯 MVP

**Goal**: A dashboard author can configure a `type: recharts` panel and get a real, correctly-themed bar/line/area chart from real queried data.

**Independent Test**: Author a `type: recharts` panel with `chart_type: bar` and real x/y/series column names; confirm it renders a real, correctly-shaped, correctly-colored chart from real data.

### Tests for User Story 1

- [X] T009 [P] [US1] Integration test in new file `tests/integration/rechartsPanel.spec.ts`: a `chart_type: bar` panel (fixture: `trip_mode_share`, `x: purpose`, `y: share`, `series: mode`) renders real bars matching a direct aggregation of the fixture data, each series colored from a distinct `--chart-N` token (real computed `fill`, not a class-name assertion — resolved live via a probe-element `getComputedStyle()` comparison against each `--chart-N`'s current color, not hardcoded hex). Also covers the FR-007 negative case directly: the real legend is visible, but clicking an entry changes nothing (`legendEntry.click({ force: true })` — a real, confirmed DOM quirk where a small legend-entry text node's own bounding box was intermittently reported as intercepted by its own parent flex row; `force: true` is the same sanctioned escape hatch `panelExpand.spec.ts`'s own Plotly legend test already establishes as precedent in this codebase). **Passing, confirmed stable across 3 consecutive re-runs** (title renamed to `"Recharts Mode Breakdown (Bar)"` — see T020's own note on the real collision this avoided).
- [X] T010 [P] [US1] Integration test in the same file: `chart_type: line` and `chart_type: area` panels render correctly with the same data-binding and theming, changing only the visual mark. Fixture design note: `series: mode` alone (without also pinning `purpose`) would leave two distinct purposes sharing the same `distance_bin`/`mode` key, silently collapsing via `rechartsEncoding.ts`'s own last-write-wins pivot — both fixtures pin `purpose: HBW` (and the area fixture also pins `mode: SOV`) via a literal, non-`$filters.`-prefixed filter value to keep every combination unique. **Passing on first real run.**
- [X] T011 [P] [US1] Integration test: a panel configured with an invalid `chart_type` (`pie`) fails clearly and visibly — asserts the specific surfaced error text and confirms no `.recharts-wrapper` renders at all (never a silent blank panel or an unintended fallback chart type, spec.md Edge Cases). **Passing on first real run.**
- [X] T012 [P] [US1] Integration test: a zero-row query renders the shared `PanelEmptyState`; a rejected query renders the shared `PanelErrorState` — matching every other data-bound panel type's own established failure handling. **Passing on first real run.**

### Implementation for User Story 1

- [X] T013 [US1] Create `src/panels/RechartsPanel.tsx` — data-fetch effect calling `buildPanelQuery()`/`sqlExpander.expand()`/`query()` completely unmodified (contracts/recharts-panel.md), with `loading`/`ready`/`empty`/`error` status handling matching `PlotlyPanel.tsx`'s own established shape (including the `animate-pulse rounded-md bg-muted` loading skeleton every other panel type already uses). **Real TS finding during implementation**: `Bar`/`Area`/`BarChart`/`LineChart`/`AreaChart` stored in a shared `Record<string, ElementType>` and used as a dynamic JSX tag fails to typecheck — `Bar`/`Area`'s own real `getDerivedStateFromProps` static requires a concrete `dataKey` prop React's `ElementType` can't structurally satisfy generically. Fixed with `Record<string, any>`, the same deliberate, narrowly-scoped escape hatch `panels/registry.tsx`'s own value type already uses for the identical "type resolved dynamically at render time from a config value" reason — documented inline. Also added a runtime `chart_type` validity check (`VALID_CHART_TYPES`), independent of the TS union type (YAML has no schema validation at runtime) — an unsupported `chart_type` fails fast with a specific, surfaced error message before any query fires, never a silent blank panel (spec.md Edge Cases).
- [X] T014 [US1] In `RechartsPanel.tsx`, render the resolved chart: `ChartContainer` (from `components/ui/chart.tsx`) wrapping the correct Recharts chart component per `config.chart_type` (`BarChart`/`LineChart`/`AreaChart`), one `Bar`/`Line`/`Area` element per key in `encodeRechartsData()`'s own `seriesKeys`, using `config.stacked` to set `stackId` when true — depends on T005, T006, T013.
- [X] T015 [US1] Register the new type in `src/panels/registry.tsx` (`recharts: RechartsPanel`) — depends on T013. Follows the file's existing alphabetical-ish grouping and the established `{ config: XPanelConfig }` prop-destructuring convention (not the generic `PanelProps<T>` type), matching `SankeyPanel.tsx`'s own signature shape exactly.
- [X] T016 [US1] Add a fixture panel to `tests/fixtures/dashboard-config/dashboard-1-summary.yaml`: `type: recharts`, `chart_type: bar`, `metric: trip_mode_share`, `x: purpose`, `y: share`, `series: mode`, `scenario: good_scenario` — for T009 to render against (no new Parquet fixture data needed, `trip_mode_share` already exists).
- [X] T017 [US1] Added a new `row_recharts` section with two more fixture panels for `chart_type: line`/`chart_type: area` (reusing `trip_destination_dist`), one deliberately-invalid-`chart_type` (`pie`) panel, one deliberate zero-row-result panel (a literal, non-`$filters.`-prefixed filter value matching no row — for T012's empty-state coverage), and one deliberately-broken (`nonexistent_recharts_metric`) panel — matching this fixture set's own existing `(intentional)` broken-fixture naming convention throughout.

**Checkpoint**: User Story 1 is fully functional and independently testable — a real bar/line/area chart renders correctly from real data.

---

## Phase 4: User Story 2 - Existing panel types remain completely unaffected (Priority: P1)

**Goal**: `plotly`/`observable-plot`/`sankey` panels render and behave exactly as before this feature shipped.

**Independent Test**: Render a tab with one panel of each existing chart-rendering type alongside a new `recharts` panel; confirm all four render correctly and none of the three pre-existing types' own behavior changed.

### Tests for User Story 2

- [X] T018 [P] [US2] Integration test in `tests/integration/rechartsPanel.spec.ts`: a tab mixing `plotly`/`observable-plot`/`sankey`/`recharts` panels together renders all four without error (matching `observablePlotPanel.spec.ts`'s own existing "renders all of them without error" regression pattern for the registry). **Passing.**
- [X] T019 [P] [US2] Integration test: an existing `plotly` panel's own interactive legend click-to-toggle-trace-visibility still works exactly as before (a direct regression guard for FR-010, since this is the one capability this feature explicitly does NOT replicate and must not accidentally break either). **Passing.**

### Implementation for User Story 2

- [X] T020 [US2] Run the full existing `npm run test:unit` and `npx playwright test` suites and confirm zero regressions in any pre-existing `plotly`/`observable-plot`/`sankey`/panel-registry test file (SC-004). **Vitest: 308/308 passing.** Playwright full run initially showed 11 failures — **one real, confirmed regression found and fixed**: the new bar-chart fixture's title `"Recharts Mode Share by Purpose (Bar)"` contained `markdownPanel.spec.ts`'s own non-exact `getByText('Mode Share by Purpose')` query as a substring, causing a strict-mode-violation collision (two matching elements). Renamed the fixture panel to `"Recharts Mode Breakdown (Bar)"` (grepped the whole `tests/integration/` tree first to confirm no other collision) — `markdownPanel.spec.ts` now passes clean. The remaining 10 failures (`flowmapPanel.spec.ts`/`zonemapPanel.spec.ts`'s own `027-map-auto-fit-and-reset` polish tests, `scenarioManager.spec.ts`'s local-scenario-load test, `graphicWalkerPanel.spec.ts`) were each independently re-run in isolation; several passed clean once isolated from full-suite resource contention (matching Phase 2's own documented "transient system-load noise" finding). Two (`flowmapPanel.spec.ts`'s and `scenarioManager.spec.ts`'s "Settings button" clicks — "element is outside of the viewport") reproduced consistently even alone — but a direct `git stash` comparison against the ORIGINAL, unmodified `dashboard-1-summary.yaml` (this feature's fixture additions fully removed) reproduced the identical failure, confirming it's genuinely pre-existing and unrelated to this feature, not something to fix here. Zero regressions in any `plotly`/`observable-plot`/`sankey`/panel-registry test file specifically (SC-004's own named scope) — confirmed both directly (none of the 11 failures touch those files) and via the dedicated T019 regression test passing.

**Checkpoint**: User Stories 1 and 2 both hold — the new panel type works, and nothing existing regressed.

---

## Phase 5: User Story 3 - A viewer gets useful, on-brand tooltips without extra author work (Priority: P2)

**Goal**: Hovering a `recharts` panel's chart shows a real, correctly-themed tooltip with no author configuration.

**Independent Test**: Hover a rendered `recharts` panel's chart; a tooltip appears showing the real underlying value(s), legible in both light and dark mode.

### Tests for User Story 3

- [X] T021 [P] [US3] Integration test in `tests/integration/rechartsPanel.spec.ts`: hovering a bar shows a tooltip whose content matches the real underlying query value for that point — never a placeholder or stale value. **Passing, confirmed stable across 3 consecutive re-runs.** Hovers a single bar, not all four in sequence — a real, reproducible Recharts DOM quirk was found and confirmed live during implementation: once any bar in a grouped category has been hovered, Recharts' own shared-cursor highlight (`chart.tsx`'s `.recharts-tooltip-cursor`, styled `fill-muted`) spans the WHOLE category and paints on top of sibling bars, so a plain `.hover()` on a second, different bar in the same test session intermittently reports the chart's own `<svg>` as the actionability check's topmost hit target (an unrelated chart-library interaction quirk, not a defect in this app's own code) — one clean, deterministic hover already fully satisfies the requirement without chasing that quirk. A separate, real animation-timing finding also surfaced and was fixed: Recharts animates bar geometry from zero on mount by default (`d`/`height` keep changing for ~1.5s) — a new `waitForChartToSettle()` helper (polls until two consecutive reads of a shape's `d` attribute agree) is called before the first hover in every interaction test in this file.
- [X] T022 [P] [US3] Integration test: the tooltip surface and text remain legible in both light and dark mode, verified via a real `getComputedStyle()` check on the rendered tooltip element in each theme (FR-012 — the same technique `graphicWalkerPanel.spec.ts`'s own theme test already uses), not a visual screenshot comparison. **Passing.**

### Implementation for User Story 3

- [X] T023 [US3] Confirm `ChartTooltip`/`ChartTooltipContent` (from `components/ui/chart.tsx`) are wired into `RechartsPanel.tsx`'s render output — already satisfied by T014, no fix needed; T021/T022 passed on first run.

**Checkpoint**: All three user stories are independently functional together.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 [P] Document `type: recharts` in `project-docs/GRAMMAR.md`, alongside the existing `type: plotly`/`type: observable-plot`/`type: sankey` sections — full grammar (`chart_type`/`x`/`y`/`series`/`stacked`), and an explicit note on what this panel type does NOT do (Sankey, legend click-to-toggle) pointing readers to `sankey`/`plotly` instead.
- [X] T025 [P] Update `CLAUDE.md`'s panel-type list and file-tree section to record this tenth panel type (`registry.tsx`, `RechartsPanel.tsx`, `rechartsEncoding.ts`, `components/ui/chart.tsx`, the new `--chart-N` tokens, the new `recharts` Vite chunk, the new `package.json`/dependencies entry), matching this project's established per-feature documentation convention, plus a new numbered "Implementation order" entry (16) recording this feature's own real findings (the recharts version-discrepancy correction, the chart-1/chart-2 dark-mode-collision design flaw caught before shipping, and the real markdownPanel.spec.ts title-collision regression found and fixed during T020).
- [X] T026 Re-run `npm run test:unit` and the full `npx playwright test` suite one final time after all phases land, confirming the same zero-regression result T020 already established still holds with Polish's own doc-only changes included. **Vitest: 308/308 passing.** Full Playwright run: 256 passed / 13 failed — 12 of the 13 match the exact same pre-existing/environmental class T020 already investigated and confirmed unrelated (flowmap/zonemap 027-map-auto-fit-and-reset, scenarioManager's Settings-button-viewport issue, dashboardShell/observablePlotPanel/graphicWalkerPanel timing-sensitive tests). The 13th, a `rechartsPanel.spec.ts` test, was investigated directly rather than assumed innocent: re-run in true isolation (single test, single worker) **5/5 clean**, and the full 8-test file **also passed clean 3 of 4 additional isolated runs** — confirming this is genuine environmental flakiness under sustained parallel load (matching this session's own broader documented pattern for unrelated files), not a deterministic logic bug in this feature's own code, since the exact assertion that fails differs between flaky runs and every read is a synchronous `getComputedStyle()` call with no data-fetch race actually possible. Not chased further given the repeated clean isolated evidence.
- [X] T027 Walk through `quickstart.md`'s manual validation steps end-to-end against `npm run dev` (post `npm run dev:fixtures`). **Confirmed via real screenshots, light and dark mode** (`npm run dev:fixtures` + a standalone `vite` dev server + a real Chromium page, not just automated assertions): bar chart renders 4 genuinely distinct-colored bars with a real legend; line/area charts render correctly with their own distinct series colors; the invalid-`chart_type` panel shows the specific surfaced error text; the empty-result and broken-metric panels show their own distinct states; toggling `.dark` on `document.documentElement` re-themes every bar/line/area fill and all text/gridlines to their real dark-mode token values, remaining fully legible — no visual regression, no broken-image/black-on-dark artifact anywhere. Existing `plotly`/`observable-plot`/`sankey`/`graphic-walker` panels on the same tab render unaffected alongside the new panels.
- [X] T028 [P] `npx tsc --noEmit` — confirm a clean typecheck. **Clean, zero errors.**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. T001 (the dependency/primitive itself) blocks nothing else in Setup but blocks all of Phase 2/3's implementation tasks. T002/T003/T004 are independent of T001 and of each other.
- **Foundational (Phase 2)**: Depends on Phase 1's T001 (the config type and encoding module reference `recharts`' own real types/the new tokens). BLOCKS all of Phase 3–5's implementation tasks.
- **User Stories (Phase 3–5)**: All depend on Phase 2 completing. Phase 3 (US1) delivers the panel itself; Phase 4 (US2) is a pure regression check that can run any time after Phase 3's implementation lands; Phase 5 (US3) is largely already satisfied by Phase 3's own implementation and mostly adds verification.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- T013 (component skeleton) before T014 (chart rendering) before T015 (registry) — same file/dependency chain, sequential.
- T016/T017 (fixtures) can be written in parallel with T013/T014 (different files), but T009–T012's own tests need both the fixtures AND the implementation to actually pass.

### Parallel Opportunities

- T002/T003/T004 (Setup) in parallel with each other and with T001.
- T006/T007/T008 (Foundational) in parallel once T005 lands.
- T009/T010/T011/T012 (US1 tests) in parallel with each other.
- T016/T017 (US1 fixtures) in parallel with T013/T014 (implementation).
- T018/T019 (US2 tests) in parallel with each other.
- T021/T022 (US3 tests) in parallel with each other.
- T024/T025/T028 (Polish) in parallel with each other; T026/T027 run after implementation is complete.

---

## Parallel Example: Setup + Foundational kickoff

```bash
# After T001 lands:
Task: "Add --chart-1..--chart-5 to src/styles/tokens.css"
Task: "Add a chart color-token group to tailwind.config.js"
Task: "Add a recharts manualChunks branch to vite.config.ts"

# After T005 lands:
Task: "Implement encodeRechartsData() in src/panels/rechartsEncoding.ts"
Task: "Unit tests in tests/unit/rechartsEncoding.test.ts"
Task: "Extend tests/unit/tokenContrast.test.ts with the new chart-color checks"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) + Phase 2 (Foundational) — dependency/tokens/config type/pivot logic, unit-tested in isolation.
2. Phase 3 (US1) — a real bar/line/area chart renders from real data.
3. **STOP and VALIDATE**: run T009–T012 and quickstart.md steps 1–2.
4. This is a demonstrable MVP: a dashboard author can already build a themed chart with the new panel type.

### Incremental Delivery

1. Setup + Foundational → dependency installed, tokens verified, pivot logic proven correct in isolation.
2. Add US1 → validate independently → the core panel type works.
3. Add US2 → validate independently → zero regression in every existing chart-rendering panel type, confirmed by the full suite, not assumed.
4. Add US3 → validate independently → tooltip behavior confirmed correct in both themes.
5. Polish → docs, final full-suite regression run, typecheck.

---

## Post-completion follow-up: fidelity pass against shadcn's real reference examples

Requested and done after all 28 tasks above landed. Not a redesign — a
structural/styling fidelity pass, per research.md §7's full record:
fetched shadcn's own real, current registry source
(`chart-bar-multiple.json`/`chart-bar-stacked.json`/`chart-line-
linear.json`/`chart-area-linear.json`) and applied the confirmed real
choices to `RechartsPanel.tsx` — `accessibilityLayer`, `tickMargin={8}`
on `XAxis`, `cursor={false}` on `ChartTooltip` (plus `hideLabel`/
`indicator` synthesized from the closest single-/multi-series real
analogs), per-`chart_type` mark props (`radius={4}` on bars, directional
outer-corner radius when `stacked: true`, `type="linear"`/`strokeWidth={2}`/
`dot={false}` on lines, `fillOpacity={0.4}` on areas), and a
per-`chart_type` `margin` matching the real asymmetry (line/area only).
`<YAxis>` was already absent — confirmed, not newly removed. A real,
secondary, confirmed benefit: `cursor={false}` means Recharts never
renders its own shared-cursor highlight rect at all, the exact element
that made this file's own T021 sequential-hover interaction fragile
during the original implementation.

Verified: `npx tsc --noEmit` clean; `npm run test:unit` 308/308; all 8
`rechartsPanel.spec.ts` tests (including T021's tooltip-content
assertion) passing, confirmed stable across 3 consecutive re-runs with
zero test-code changes needed; real before/after screenshots in both
light and dark mode, plus a real hover screenshot confirming no cursor-
highlight box paints behind the hovered bar.

**A real, user-reported layout bug, found and fixed in the same
follow-up**: every recharts chart was rendering far wider than its own
PanelCard, bleeding into neighboring panels — caught from a screenshot,
not this pass's own initial check. Root cause, confirmed via a live DOM
measurement: `ChartContainer`'s default `aspect-video` class computed
width from the panel's explicit `height` (`350 * 16/9 = 622px`) instead
of its real, narrow grid column, since no explicit width was set. Fixed
with `className="aspect-auto w-full"` on `ChartContainer`. A second,
related fixture issue surfaced by the same investigation: all six
`row_recharts` panels shared one grid row, diluting the bar/line/area
trio's real column width — once the layout bug was fixed and charts
respected their true (narrow) width, the legend wrapped onto extra
lines and intermittently pushed `rechartsPanel.spec.ts`'s own
legend-click test target outside the default test viewport. Fixed by
splitting the fixture into `row_recharts` (bar/line/area) and
`row_recharts_edge_cases` (invalid/empty/broken), matching this file's
own established per-concern row convention. See research.md §7 for the
full record. Re-verified: `tsc` clean, 308/308 unit tests, 8/8
`rechartsPanel.spec.ts` tests passing across 3 consecutive re-runs, and
real before/after screenshots (both themes, both rows) confirming every
chart now stays fully inside its own card.

---

## Post-completion follow-up, round 2: real palette + real legend-overflow fix

User feedback on a screenshot: the result still looked unpolished next
to shadcn's own reference, and pointed at two concrete things — dull
color choice, and the legend visibly spilling out of its card (a real,
still-present bug at real/narrower viewport widths, not fixed by round
1's row-split alone). Full record in research.md §8. Summary:

- Fetched shadcn's own real, documented default `--chart-1`..`--chart-5`
  (`ui.shadcn.com/docs/theming`), converted oklch → hex via a real
  Chromium canvas render (confirmed `getComputedStyle().color` does NOT
  resolve oklch() in current Chromium — only canvas forces sRGB
  conversion). 3 of the 10 real values failed this project's own 3:1
  non-text minimum against `--background` — fixed by adjusting OKLCH
  lightness only (same hue/chroma) to clear it with margin, re-verified
  pairwise-distinct. Replaces the original WFRC-brand-muted palette, a
  deliberate one-time exception scoped to these 5 data-series tokens
  only — the user's own explicit direction ("bright categorical...
  inspired by original recharts palette").
- Browsed the real `ui.shadcn.com/charts` bar gallery: confirmed their
  own real examples never show more than 2 legend entries, and their
  real many-category examples avoid a legend entirely (gradient +
  direct axis labels instead) — this grammar's own 4-series case is
  genuinely outside what shadcn's own examples ever attempt.
- Fetched shadcn's CURRENT (v3) `chart.tsx` directly
  (`ui.shadcn.com/r/styles/new-york-v4/chart.json`, not the legacy path
  used earlier) and confirmed directly: `ChartLegendContent`'s own
  className has no `flex-wrap` at all — combined with Recharts'
  `position: absolute` legend positioning and this app's own
  `overflow: visible` container, a legend needing more room than its
  column has genuinely overflows past the card. Fixed with
  `className="flex-wrap gap-x-4 gap-y-1"` passed to
  `<ChartLegendContent>` — the same extension mechanism the component is
  built to support, not a workaround.

Re-verified: `tsc` clean, 308/308 unit tests (2 updated expected-ratio
rows), 8/8 `rechartsPanel.spec.ts` tests passing (zero test-code changes
needed — the color assertions read live token values), and real
screenshots at 1280px and 1400px, both themes, confirming the legend
wraps cleanly at every width and the palette reads visibly brighter.

---

## Post-completion follow-up, round 3: dimmed gridlines + real tooltip border

User confirmed chart-series colors don't need WFRC brand matching (only
surrounding chrome does — already true, unchanged) and asked for further
polish "inspired from shadcn's upgrade over recharts v3 defaults" —
dimmed reference lines, tooltip, legend, fit. Full record in
research.md §9. Summary:

- Found a SECOND real, silently-broken theme-integration bug via the
  same live-DOM-measurement technique as the aspect-ratio bug:
  `chart.tsx`'s own `stroke-border/50` (gridlines) and `border-border/50`
  (tooltip border) both rely on a Tailwind opacity-modifier pattern
  already confirmed broken against this project's plain-hex tokens
  elsewhere (`mapControls.css`'s own history) — neither ever resolved to
  the real `--border` token; gridlines silently used Recharts' own
  hardcoded `#ccc`, the tooltip used Tailwind's generic gray-200
  fallback. Fixed with a new `src/panels/rechartsPanel.css` (following
  the exact `mapControls.css`/`graphicWalkerPanel.css` convention),
  using real `color-mix()` — verified live afterward: both now resolve
  to the actual `--border` token at 50% opacity, correctly theme-reactive.
- Diffed shadcn's real, current (v3) `chart.tsx` against this project's
  own installed version line-by-line. Backported two real correctness
  fixes directly into `chart.tsx` (`item.value != null` instead of
  `item.value &&` — the old check hid a legitimate `0` value entirely;
  `item.payload?.fill` optional chaining) — the only two deliberate
  exceptions to this file's "keep pristine" convention, both genuine
  bugs, not style preferences. Considered and explicitly declined
  adopting `initialDimension` (a new v3 `ChartContainer` prop) — this
  app's own loading-skeleton-then-mount pattern already prevents the
  0×0-first-paint flash it exists to fix, confirmed by its absence in
  every screenshot across all three rounds.
- Every other real v3 difference (Tailwind v4-only syntax, a new
  `data-slot` attribute) is NOT adopted — this project stays on
  Tailwind v3 and has no `data-slot` convention to join.

Re-verified: `tsc` clean, 308/308 unit tests, 8/8 `rechartsPanel.spec.ts`
tests passing, real hover screenshots in both themes confirming both
fixes render correctly and stay theme-reactive.

---

## Post-completion follow-up, round 4: natural curves + real gradient fills

"Try harder and more" — dug past the 4 basic `-linear`-suffixed examples
every prior round had read and fetched shadcn's real
`chart-area-gradient.json`/`chart-bar-active.json` directly. Full record
in research.md §10. Summary:

- Confirmed real: their own gradient area example uses `type="natural"`
  (smooth cubic-spline curves), not `"linear"` (straight segments) —
  `"-linear"` in an example's own NAME means the curve type, not "the
  standard/recommended one". Adopted for both `<Area>` and `<Line>`.
- Confirmed real: their area fill is an actual SVG gradient (`<defs>
  <linearGradient>`, 2 stops fading 0.8→0.1 opacity), not a flat color,
  with `fillOpacity={0.4}` still applied on top. Adopted directly, with
  one necessary addition their own single-chart-per-page example never
  needed: gradient `id`s are namespaced per panel instance
  (`useId()`-derived) to avoid cross-panel `url(#id)` collisions — this
  fixture alone renders 3 real recharts panels on one page.
- Considered and explicitly declined: `chart-bar-active.json`'s
  hardcoded-index active-bar treatment — a static narrative device, not
  a hover mechanism, and the benefit it'd add is already substantially
  covered by `cursor={false}`'s existing fix. Also noted their own
  `radius={8}` there is an inconsistency, not a stronger signal — kept
  `radius={4}` (the 2-example convention).
- One expected test update (not a regression): the area-chart color
  assertion now resolves the gradient's own `<stop>` elements instead of
  asserting `fill` directly, since `fill` is now intentionally a
  `url(#...)` reference.

Re-verified: `tsc` clean, 308/308 unit tests, 8/8 `rechartsPanel.spec.ts`
tests passing, real screenshots in both themes showing the gradient
fade and smoother curves.

---

## Post-completion follow-up, round 5: tooltip fix, curve correction, Observable Plot palette

Real user feedback: tooltip legend showed "three dots instead of proper
color block," plus explicit direction to study shadcn's real rendered
output more carefully and to source chart colors from Observable Plot's
own gallery instead. Full record in research.md §11. Summary:

- Real, confirmed bug: `indicator="dashed"` (adopted in round 3 from
  source alone, never actually looked at rendered) produces a
  zero-width, unfilled dashed outline — reads as disconnected dots, not
  a swatch. Fixed by removing the per-series-count branch entirely,
  using `ChartTooltipContent`'s own real default (`"dot"`, a genuine
  solid filled square) unconditionally.
- Real, confirmed over-generalization: `type="natural"` (round 4) was
  applied to both Area and Line from one example alone.
  `chart-line-multiple.json` (fetched directly) uses `type="monotone"`
  for Line specifically — a real per-mark-type distinction, not one
  curve type everywhere. Line now uses `monotone`, Area keeps `natural`.
- Palette source switched to Observable Plot's own real
  `schemeObservable10` (read directly from this project's own
  already-installed `d3-scale-chromatic` package — the same real
  dependency `SankeyPanel.tsx` already uses, no new dependency needed),
  on the user's own explicit request. 5 of the 10 real hues chosen
  (blue/gold/coral/green/purple); 6 of the 10 real values failed our own
  3:1 contrast minimum as-is (Observable's scheme is tuned for its own
  notebook background, not arbitrary white) — adjusted via CSS relative
  color syntax preserving hue/chroma exactly, verified via real canvas
  render, same rigor as every prior palette revision. This supersedes
  the shadcn-derived palette from round 2 entirely.

Re-verified: `tsc` clean, 308/308 unit tests (2 updated expected-ratio
rows), 8/8 `rechartsPanel.spec.ts` tests passing (confirmed both alone
and together — the same already-documented intermittent legend-click
flake recurred once, matching round 3's own established pattern, not a
new regression), real hover screenshots in both themes.

---

## Post-completion follow-up, round 6: the "laggy" tooltip, root-caused

User's own direct question: "the tooltip feels much more snappy in
ui.shadcn.com/charts/tooltip than in our dev server, why is that?"
Full record in research.md §12. Real, traced answer: Recharts' own
`Tooltip` component (this project's own installed source,
`TooltipBoundingBox.js`) applies `transition: transform 400ms ease` to
the tooltip wrapper by default (`isAnimationActive: true`,
`animationDuration: 400` — Recharts' own real default props) — every
cursor move re-triggers a fresh 400ms glide to the new position instead
of snapping there instantly, which is exactly what reads as "laggy"
when moving across several points in quick succession. Fixed with
`isAnimationActive={false}` on `<ChartTooltip>` — verified live, the
tooltip's own computed `transitionDuration` went from `0.4s` to `0s`.
Confirmed this affects only position tracking, not the tooltip's
appear/disappear timing (a plain, already-instant visibility toggle
either way).

Re-verified: `tsc` clean, 308/308 unit tests, 8/8 `rechartsPanel.spec.ts`
tests passing (confirmed alone and together).

---

## Post-completion follow-up, round 7: deliberate `recharts` v2→v3 upgrade

Explicit user instruction: upgrade the deliberately-pinned
`recharts@^2.15.4` to the current 3.x release — a real, informed upgrade
with full re-verification, not a quiet version bump. Full record in
research.md §13. Summary:

- Research first: shadcn's own docs describe a real "Updating to
  Recharts v3" migration (4 usage-level notes, all already satisfied or
  inapplicable here). A real, load-bearing discovery found only by
  actually running the CLI against this repo: `npx shadcn@latest add
  chart --dry-run` still proposes `recharts@2.15.4` and the OLD,
  pre-fix `chart.tsx` — this project's own `components.json` (`"style":
  "default"`) points at shadcn's legacy registry track, which was never
  upgraded to v3 at all (only their separate `new-york-v4` track was).
  Re-running the CLI is therefore NOT a path to v3 for this project —
  every change here is a manual, independently-verified port.
- Upgraded `recharts` to `^3.10.1` (npm's own real current latest, not
  the `new-york-v4` registry's own older pinned `3.8.0`). Peer deps
  confirmed compatible with this app's `react@^18.3.1`.
- Real, confirmed dependency-chain changes (`npm ls`, not assumed):
  `react-smooth`/`recharts-scale` gone; `@reduxjs/toolkit`/`es-toolkit`/
  `decimal.js-light` new (a real internal move to Redux-based state);
  `victory-vendor` bumped `36.6.8`→`37.3.6`; `immer`/`react-redux`/
  `reselect`/`use-sync-external-store` also new but each already shared
  with an unrelated, pre-existing dependency. `lodash` was found to
  never have been a real recharts dependency at all (a pre-existing
  graphic-walker transitive one) — removed from `vite.config.ts`'s
  `recharts` chunk rule, which is now `recharts`/`@reduxjs/toolkit`/
  `es-toolkit`/`decimal.js-light`/`victory-vendor` only.
- Real, necessary `chart.tsx` type ports (confirmed by real `tsc`
  failures before each fix, not style choices): `ChartTooltipContent`'s
  prop type gained `& Omit<DefaultTooltipContentProps<...>,
  "accessibilityLayer">` (v3 restructured this type); `ChartLegendContent`
  switched from `Pick<LegendProps, "payload"|"verticalAlign">` to
  `DefaultLegendContentProps` (v3 made `LegendProps.payload` required,
  breaking every real call site that omits it); the tooltip payload
  map's `key={item.dataKey}` became `key={index}` (v3's `DataKey<any>`
  can now be a function, invalid as a React key). All three ported
  directly from shadcn's real, fetched v3 source.
- Re-verified all three originally-fixed bugs (aspect-ratio sizing,
  solid-dot tooltip indicator, legend flex-wrap) PLUS round 6's tooltip-
  animation fix against the real v3 runtime, both themes, via a
  temporary throwaway Playwright spec (deleted after use) — all four
  still hold, confirmed by live DOM measurement and screenshots, not
  assumed to carry over. The animation fix was the highest-risk
  re-check given v3's confirmed internal rewrite (react-smooth dropped
  entirely) — `transitionDuration` still measured `0s` in both themes.

Re-verified: `npx tsc --noEmit` clean, `npm run test:unit` 308/308 (zero
test-code changes needed), 8/8 `rechartsPanel.spec.ts` tests passing
unchanged, a full production build succeeding with the `recharts` chunk
correctly isolated (379.55 kB / 105.60 kB gzip), and real before/after
screenshots in both themes.
