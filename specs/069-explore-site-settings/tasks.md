---

description: "Task list for 069 Explore settings for the whole site"
---

# Tasks: Explore settings for the whole site

**Input**: Design documents from `/specs/069-explore-site-settings/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/explore-site-settings.md, quickstart.md

**Tests**: Included. The project's convention is unit tests for every pure `src/config` module and a Playwright spec per user-visible behaviour (as in 066 to 068).

**Organization**: Grouped by user story. The generated reference and JSON Schema are regenerated at the end of each story that changes the schema table (`npm run docs:config`), because a unit test fails when they drift.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 chart limits, US2 starting chart, US3 mistakes reported

## Path Conventions

Single web-app project: `src/`, `tests/`, `scripts/`, `project-docs/` at the repository root. `src/config/` stays pure (relative imports, no `import.meta.env`, no `@/` alias, no DOM).

---

## Phase 1: Setup

- [ ] T001 Confirm the baseline on branch `069-explore-site-settings`: `npx tsc --noEmit` and `npx vitest run` are green, and run the existing Explore and config unit tests once (`npx vitest run tests/unit/exploreOptions.test.ts tests/unit/configValidate.test.ts tests/unit/configCheck.test.ts tests/unit/configReference.test.ts tests/unit/configJsonSchema.test.ts`) so a later failure is ours

---

## Phase 2: Foundational (blocks all three stories; nothing user-visible changes)

**Purpose**: the one table of limits, the schema rows and the shared bounds, so each story only adds wiring. After this phase the app behaves exactly as before.

- [ ] T002 Create `src/config/exploreLimits.ts` (pure): `EXPLORE_LIMITS`, one entry per limit with the YAML key, default and range from data-model.md (the four existing: csv_rows 1 to 5 000 000, page_size 5 to 200 with no default, undo_steps 1 to 500 default 60, max_joins 1 to 8 default 4; the six new: chart_rows, scatter_sample, histogram_bins, legend_series, distinct_values, pivot_rows), `clampLimit(name, value)` returning `{ value, message? }` (nearest end plus the message `N is outside A to B, so M is used`; a non-number or non-finite value gives the default and `expected a whole number`) and `limitClean(name)` as a schema `clean` hook; export from `src/config/index.ts`
- [ ] T003 [P] Unit tests `tests/unit/configExploreLimits.test.ts`: the table (every default inside its range), `clampLimit` for inside, below, above, a fraction (rounded), a string, NaN and an infinite value, and that the ranges equal what `explore/options.ts` used before (4 existing limits)
- [ ] T004 In `src/config/schema.ts` replace the single `explore.limits` map row by one integer row per limit (`explore.limits.csv_rows` ... `explore.limits.pivot_rows`, `cascade: true`, `clean: limitClean(name)`, a description with the range and default); add the row `explore.charts.default` (type string, `cascade: true`, scalar replace). Run `npm run docs:config`. Extend `tests/unit/configValidate.test.ts` (each key accepted, out of range clamped with a message, a string reported, an unknown `explore.limits.foo` reported by path) and adjust `tests/unit/configReference.test.ts` / `configJsonSchema.test.ts` expectations if they list rows
- [ ] T005 Make `src/explore/options.ts` read `EXPLORE_LIMITS` (replace its private `BOUNDS`, `LIMIT_KEYS` and `DEFAULT_LIMITS`), add the six new fields to `ExploreLimits` (`chartRows`, `scatterSample`, `histogramBins`, `legendSeries`, `distinctValues`, `pivotRows`) with their defaults, and clamp them through `clampLimit` so a panel's value gets the same message as before. Extend `tests/unit/exploreOptions.test.ts`: defaults unchanged for the old four, the new six default and clamp, a panel value over a site value per key, an unknown `limits.foo` still warned

**Checkpoint**: `npx tsc --noEmit` and the unit tests above pass; the app behaves as before.

---

## Phase 3: User Story 1 - chart limits from the site file (Priority: P1) MVP

**Goal**: the six chart limits follow `explore.limits` at site, page or panel level, and the on-screen notes quote them.

**Independent Test**: set `chart_rows` and `legend_series` low in the site file; a chart past both is cut at the new values and says so with those numbers; removing the keys restores today's behaviour.

- [ ] T006 [US1] `src/charts/builder/specToSql.ts`: give `chartQuery` an optional `caps` argument `{ rowCap, scatterSample, histogramBins }` defaulting to `ROW_CAP`, `SCATTER_SAMPLE`, `HIST_BINS`, used in the `LIMIT`, `USING SAMPLE` and histogram expressions. Extend `tests/unit/chartBuilderSql.test.ts`: no caps gives the same SQL as before (existing assertions unchanged), each cap appears in the SQL when given
- [ ] T007 [P] [US1] `src/charts/builder/compile.ts` and `src/charts/builder/pivotDraw.ts`: an optional legend series limit (default `MAX_SERIES`) and an optional pivot row limit (default `MAX_ROWS`) through the existing options argument of each draw function; the pivot note quotes the limit in force. Extend `tests/unit/chartBuilderCompile.test.ts` and `chartBuilderPivot.test.ts`: default unchanged, a lower limit cuts and flags `limitedSeries` / writes the note
- [ ] T008 [US1] `src/explore/useChartData.ts` and `src/explore/ChartTabView.tsx`: pass `getExploreOptions().limits` as the caps and the draw options; the truncation flag uses the cap in force (`ROW_CAP` and `SCATTER_SAMPLE` re-exports stay for other importers); the notes read "first N groups", "first N values of a legend field" from the resolved numbers instead of the literals 50 000 (formatted) and 15
- [ ] T009 [P] [US1] `src/explore/useDistinct.ts`: the `LIMIT` and `pageSize` come from `distinctValues` (the column-summary list in `explore/profile/profile.ts` stays at 200). Unit test or extend an existing Explore test for the SQL text
- [ ] T010 [US1] Playwright `tests/integration/exploreSiteSettings.spec.ts` (same project as `exploreBuilderOptions.spec.ts`): with the site file served through `page.route` carrying low `chart_rows` and `legend_series`, a chart past both shows the notes with those numbers; a panel value overrides the site's for that panel; with no keys the notes read as before
- [ ] T011 [US1] Regenerate if the schema text changed (`npm run docs:config`) and run `npx vitest run` for the touched unit files plus the new spec

**Checkpoint**: US1 works alone: all six limits configurable at the site level.

---

## Phase 4: User Story 2 - starting chart (Priority: P2)

**Goal**: `explore.charts.default` set in the site file is the chart a new tab starts with; a panel's own value wins; a disallowed name falls back.

**Independent Test**: set it in the site file, open a new chart tab, see that chart; set another on a panel, that panel starts with its own.

- [ ] T012 [US2] `src/explore/options.ts#withSiteDefaults`: take `charts.default` from the resolved cascade like the other charts keys (a panel's value over the site's), then the existing check against the allowed list; the warning names the key path. Extend `tests/unit/exploreOptions.test.ts` (site only, panel over site, disallowed falls back to the first allowed with a message, not a string)
- [ ] T013 [US2] Extend `tests/integration/exploreSiteSettings.spec.ts`: a site default of `line` starts a new chart tab as a line chart; the panel's own default wins in that panel

---

## Phase 5: User Story 3 - mistakes reported (Priority: P2)

**Goal**: every kind of mistake is listed once with its path in the note and in `check`, and the app loads.

**Independent Test**: a site file with an out-of-range limit, a text limit, an unknown limit key and an unknown default chart loads; each is listed once in the note and by `check`, which exits 1.

- [ ] T014 [US3] `tests/unit/configCheck.test.ts`: a site with each mistake gives one problem each with its path (`explore.limits.chart_rows`, `explore.limits.scatter_sample`, `explore.limits.foo`), and a clean site gives none; verify the site-level problem is not repeated when a panel opens (the clamped value reaches `options.ts` already in range)
- [ ] T015 [US3] Make `explore.charts.default` naming an unknown chart reach `check`: through the existing `panelCheck` (`resolveExploreOptions(panel, site).warnings` in `scripts/check-config.ts`) when an Explore panel exists, so no chart list enters `src/config`; unit test with a stub panel
- [ ] T016 [US3] Extend `tests/integration/exploreSiteSettings.spec.ts`: a site file with the four mistakes loads, the configuration note lists each with its path, and Explore still draws with the defaults

---

## Phase 6: Polish and cross-cutting

- [ ] T017 [P] Docs: `project-docs/CONFIGURATION.md` (Phase E step 11 done, section 4 draft, section 7 decision), `project-docs/GRAMMAR.md` (explore keys sentence), `CLAUDE.md` (Explore builder: the site-wide keys and the exploreLimits module), `project-docs/IMPLEMENTATION-HISTORY.md` ("069 Explore settings for the whole site"), `specs/065-chart-builder/contracts/deployer-options.md` (the new keys and the site level)
- [ ] T018 Regenerate `project-docs/CONFIG-REFERENCE.md` and `project-docs/dashboard-config.schema.json` (`npm run docs:config`); `npx tsc --noEmit`; `npx vitest run`
- [ ] T019 Full Playwright run (`npx playwright test`); compare failures with the known flakes in CLAUDE.md and re-run each alone with `--workers=1` before treating it as real
- [ ] T020 Walk `quickstart.md` and record the result at its foot; `npm run check -- public/demo-dashboard-config` is clean
- [ ] T021 Rebuild `docs/` with `npm run build:pages` (only when the user asks; not part of the implementation)

---

## Dependencies and Order

- Phase 1, then Phase 2 (T002 to T005 in order; T003 parallel to T004 once T002 exists).
- US1 (Phase 3) needs Phase 2. T006, T007 and T009 touch different files and can run together; T008 needs T006 and T007.
- US2 (Phase 4) needs T005 only, so it can follow Phase 2 directly; US3 (Phase 5) needs Phase 2 and the US2 option for T015.
- Polish after the stories. T021 only on request.

## MVP

Phase 1, Phase 2 and US1 (T001 to T011): the six chart limits configurable site-wide. Stop at the US1 checkpoint if asked.
