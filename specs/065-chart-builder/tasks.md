---

description: "Task list for the Chart Builder (Explore v2)"
---

# Tasks: Chart Builder (Explore v2)

**Input**: `specs/065-chart-builder/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md, spec.md. Read `project-docs/CHART-BUILDER-PROPOSAL.md`, `project-docs/redesign/09-chart-kind-guide.md` and
the `wftdm-design-system` skill before UI or chart work.

**Tests**: Included. The spec does not ask for TDD, but the repo requires unit tests for any chart that computes values
(`09-chart-kind-guide.md` §1), the guard is security-relevant, and the plan lists Vitest and Playwright. Write each test
first and see it fail where the task says so.

**Organization**: grouped by user story. Phases 1–2 block everything; stories after that are independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US7 from spec.md
- Paths are repository-relative. Rules that apply to every task: TypeScript only; palette tokens only (no hard-coded
  colours); no Web Storage; DuckDB only through `src/services/duckdb.ts`; no new dependency; check light and dark.

---

## Phase 1: Setup and spikes

**Purpose**: skeleton and the six spikes in research.md. Record each result in `specs/065-chart-builder/spikes/<ID>.md`
(question, method, outcome, decision), then update the research.md table in T008.

- [ ] T001 Create the empty source folders and index files: `src/charts/builder/`, `src/explore/{dataTab,vizTab,sql}/`, `tests/unit/` naming `chartBuilder*.test.ts` and `exploreSql*.test.ts`; confirm `npx tsc --noEmit` still passes
- [ ] T002 [P] Spike S1: in the running dev app, run `SELECT json_serialize_sql('select a, sum(b) from t join u using (k) where c > 1 group by a order by a limit 5')`; watch the network panel for an extension fetch; save the JSON for select, where, join, group, order, limit, union all, CTE, window, and a non-SELECT into `tests/fixtures/builder-ast/*.json`; write `specs/065-chart-builder/spikes/S1.md`
- [ ] T003 [P] Spike S2: in the dev app console, test `CREATE OR REPLACE TEMP VIEW`, `CREATE TEMP TABLE`, `DESCRIBE <select>`, `DROP … temp."x"` on the shared connection; confirm a temp name shadows an app view; record memory behaviour of a 1M-row TEMP TABLE in `specs/065-chart-builder/spikes/S2.md`
- [ ] T004 [P] Spike S3: build a throwaway harness (not committed under `src/`) that draws bars with an identity colour scale whose fills are `url(#xb-hatch-k)` plus an inserted `<defs><pattern>`, and lines as one mark per series with distinct `strokeDasharray`; run the result through `cardToSvg` and `svgToPng` from `src/services/exportTile.ts`; write `specs/065-chart-builder/spikes/S3.md` naming approach A or B
- [ ] T005 [P] Spike S4: run `npm ls @observablehq/plot`; verify in a small script that `fx`/`fy` facets, the `symbol` channel, `stackY` normalize/center, `rectY`+`binX`, and `boxY` behave as `contracts/chart-spec.md` assumes; write `specs/065-chart-builder/spikes/S4.md`
- [ ] T006 [P] Spike S5: run a deliberately long query on the shared connection, call `cancelRunning()` from `src/services/duckdb.ts`, time how soon a dashboard query then runs; write `specs/065-chart-builder/spikes/S5.md` with the timeout value to use
- [ ] T007 [P] Spike S6: prototype a throwaway `kind` whose `loadExtra` runs a query and whose `exportRows` returns the rows; confirm the tile Export menu (`src/layout/tileExport.tsx`) offers them; write `specs/065-chart-builder/spikes/S6.md`
- [ ] T008 Update the spikes table in `specs/065-chart-builder/research.md` with each outcome, and adjust `plan.md` Delivery phases if S1 or S3 failed (fallback paths are already described)

**Checkpoint**: every spike has a recorded decision.

---

## Phase 2: Foundational (blocks all user stories)

**Purpose**: the pure core types, validation, state and an empty builder panel the stories fill in.

- [ ] T009 [P] Write failing unit tests for the channel/mark table and spec defaults in `tests/unit/chartBuilderSpec.test.ts`, then implement `ChartSpec`, `FieldDef`, channel list (13), mark list, size scale (`xs`..`xl`), and the channel acceptance table in `src/charts/builder/spec.ts` per `contracts/chart-spec.md`
- [ ] T010 [P] Write failing tests in `tests/unit/chartBuilderSchema.test.ts` (valid spec, one test per validation rule 1–6, unknown key, "coming soon" mark), then implement the JSON Schema and `validateSpec(spec, columns)` with path-qualified errors in `src/charts/builder/schema.ts`
- [ ] T011 [P] Write failing tests in `tests/unit/chartBuilderColumnTypes.test.ts` (every DuckDB type family, `*_id`/`taz` to nominal, nested to complex, geometry-named BLOB to geo, override wins), then implement `src/charts/builder/columnTypes.ts`
- [ ] T012 [P] Implement the in-memory session store in `src/state/exploreState.ts` (tabs, active tab, browse selection, My tables, data-tab state, undo/redo stacks capped at 50, `subscribe`/`getSnapshot` pub/sub like `src/state/tileState.ts`, no Web Storage) with tests in `tests/unit/exploreState.test.ts`
- [ ] T013 Implement `src/explore/relations.ts`: list source tables per scenario from `buildCatalog()` in `src/services/ai/catalog.ts`, intersect across selected scenarios and report "missing in: …", `describeRelation()` using `describeView` from `src/services/ai/sqlRunner.ts` plus `columnTypes.ts`; unit-test the intersection and missing-in logic with fake catalogs
- [ ] T014 Add `ExploreBuilderPanelConfig` (`type: 'explore-builder'`) to `src/layout/types.ts`, register a lazy `ExploreBuilderPanel` in `src/panels/registry.tsx`, and add the type to any panel-type validation in `src/services/yamlLoader.ts`; confirm an unknown-type error is not raised
- [ ] T015 Create the shell skeleton `src/explore/ExploreBuilderPanel.tsx` (top bar placeholders, `role="tablist"` with a fixed Data tab, one viz tab, a `+` button) using shadcn `tabs`, wired to `exploreState`; no data yet
- [ ] T016 Add the builder as an extra tab for local review without replacing Explore: `public/demo-dashboard-config/dashboard-7b-explore-builder.yaml` (`full_page: true`, single `explore-builder` panel, icon `chart-no-axes-combined`) and list it in `public/demo-dashboard-config/index.json`; copy the same pair into `tests/fixtures/` as the repo's fixture convention requires
- [ ] T017 Playwright smoke spec `tests/integration/explore-builder-shell.spec.ts`: the new tab opens, shows Data + one chart tab + `+`, adding and closing tabs works, no console errors; run with `--workers=1`

**Checkpoint**: `npx tsc --noEmit`, Vitest and the smoke spec pass; the builder tab opens with an empty shell.

---

## Phase 3: User Story 1 - Browse the raw data (Priority: P1) 🎯 MVP

**Goal**: pick scenarios and a table; see a paged preview and typed columns.

**Independent Test**: choose a scenario and a table; a paged preview and a column list with types appear.

- [ ] T018 [P] [US1] Write failing tests in `tests/unit/exploreBrowse.test.ts` for the page-size calculation (container height to rows, min 5) and page window maths, then implement `src/explore/dataTab/paging.ts`
- [ ] T019 [US1] Implement the Scenario multi-select and Table select in `src/explore/ExploreBuilderPanel.tsx` using `exploreState.browse`; tables not in every selected scenario are disabled with "missing in: …" (uses `relations.ts` from T013)
- [ ] T020 [US1] Implement `src/explore/dataTab/PreviewTable.tsx`: runs `SELECT * FROM "<view>" LIMIT n+1 OFFSET m` through `queryArrow` after `ensureRegistered` (`src/services/tabDataLoader.ts`), Arrow cells converted as in `sqlRunner.ts#toCell`, Prev/Next and "Rows x–y", empty and loading states using `PanelEmptyState`/`PanelLoadingState`
- [ ] T021 [P] [US1] Implement `src/explore/dataTab/SchemaStrip.tsx`: column name, type chip (glyph + label, neutral tokens), `complex` greyed, per-column type override menu writing `override` to the relation in `exploreState`
- [ ] T022 [US1] Compose `src/explore/dataTab/DataTab.tsx` (schema strip + preview), mounted as the first tab; resize observer recomputes page size; keyboard operable paging
- [ ] T023 [US1] Playwright `tests/integration/explore-builder-data-browse.spec.ts`: scenario + table select, preview rows, page forward/back is contiguous, schema types shown, multi-scenario "missing in" disabled state, light and dark screenshots

**Checkpoint**: User Story 1 works alone (read-only data browser).

---

## Phase 4: User Story 2 - Define the data with SQL or a query builder (Priority: P1)

**Goal**: guarded read-only SQL, the form with two-way sync, My tables.

**Independent Test**: run a join in the Data tab, save it, see it under My tables and previewed.

- [ ] T024 [P] [US2] Write failing guard tests in `tests/unit/exploreSqlGuard.test.ts`: refuses INSTALL, LOAD, ATTACH, COPY, SET, PRAGMA, remote URL, DROP, CREATE, ALTER, INSERT, multi-statement abuse; accepts WITH/SELECT/DESCRIBE; `xb_` names protected from the assistant's modify mode
- [ ] T025 [US2] Update `src/services/ai/catalog.ts#protectedNames` (or its call site) and `src/services/ai/sqlRunner.ts#resetSessionData` so names starting `xb_` are protected from the assistant and skipped by reset, per `contracts/query-and-guard.md`; add tests to `tests/unit/exploreSqlGuard.test.ts`; fix any gap from spike S2 in `src/services/ai/sqlGuard.ts` with a test
- [ ] T026 [P] [US2] Write failing tests in `tests/unit/exploreSqlRun.test.ts` for the paging wrapper (strips trailing `;` and comments, `n+1` rows, offsets), the no-`ORDER BY` warning, slug rules (`[a-z0-9_]`, ≤48, unique, not a protected name) and `Use in query` text for one and several scenarios (UNION ALL with `scenario` column, "missing in" exclusion); then implement `src/explore/sql/queries.ts`
- [ ] T027 [US2] Implement `src/explore/sql/runUserSql.ts`: `authorize(sql,'read-only',protectedNames())`, optional `json_serialize_sql` second opinion, module mutex (queue), timeout from S5 calling `cancelRunning()`, `queryArrow` result mapping to `UserQueryResult`, `ensureRegistered` of referenced views; tests with injected fakes for outcomes ok/refused/error/cancelled/timed-out
- [ ] T028 [P] [US2] Implement `src/explore/sql/describe.ts`: `DESCRIBE` of an authorized SELECT or a relation, mapped through `columnTypes.ts`
- [ ] T029 [US2] Implement save/rename/delete of My tables in `src/explore/sql/myTables.ts`: app-generated `CREATE OR REPLACE TEMP VIEW|TABLE "xb_<slug>"`, size warning above 1M rows, delete only session-owned `xb_` objects, `ready`/`broken` status by re-describe; unit tests for statement text and delete restriction
- [ ] T030 [US2] Implement `src/explore/dataTab/SqlEditor.tsx` (textarea behind the seam, monospace token font, Ctrl/Cmd+Enter) and `SqlPanel.tsx` (Run, Cancel, status, error with position from `json_serialize_sql`, "Use in query", Save as…) wired to `runUserSql`
- [ ] T031 [US2] Implement `src/explore/dataTab/MyTables.tsx`: list with status badge, rows, view/table, rename, delete, "Chart this" (sets the source of the active viz tab); selecting one previews it in the Data tab
- [ ] T032 [P] [US2] Write failing fixture tests in `tests/unit/exploreSqlModel.test.ts` using `tests/fixtures/builder-ast/*.json` (from T002): `astToModel` for each supported construct and `null` for five unsupported ones; property test `parse(modelToSql(m)) == m`; then implement `src/explore/sql/modelToSql.ts` and `src/explore/sql/astToModel.ts` (types from `data-model.md` QueryModel). If S1 failed, implement the `-- builder:v1` marker fallback instead and say so in the file header
- [ ] T033 [US2] Implement `src/explore/dataTab/QueryBuilderForm.tsx`: select columns, filters (AND-list), join (relation, type, equality keys), scenario union, group by + aggregates, sort, limit; edits regenerate SQL; text edits go through `parseToModel` and either update the form or show "edited as SQL" (disabled, nothing lost)
- [ ] T034 [US2] Playwright `tests/integration/explore-builder-sql.spec.ts`: run a join, refused statement message, cancel returns promptly, 60 s timeout path (use a fake slow query hook if available), save then list then delete, form to text to form round trip, CTE detaches the form, assistant "Reset session data" leaves My tables

**Checkpoint**: User Stories 1 and 2 both work; a user can browse, query, and save data.

---

## Phase 5: User Story 3 - Build a chart by dragging columns (Priority: P1)

**Goal**: viz tabs with field list, shelves, drag + keyboard, live chart from the relation, all v1 marks.

**Independent Test**: with a table chosen, drag a nominal and a quantitative column onto x and y; a bar chart that matches curated charts appears.

### Core (pure)

- [ ] T035 [P] [US3] Write failing tests in `tests/unit/chartBuilderSql.test.ts` (aggregate+group by, bin, time unit, filter ops, facets as group keys, count without field, sort, stack-independent SQL, 50,000 row cap for raw marks, identifier quoting and literal escaping, no injection through field names), then implement `src/charts/builder/specToSql.ts`
- [ ] T036 [P] [US3] Implement `src/charts/builder/patterns.ts` (hatch pattern definitions drawn with theme tokens, `fillFor(i)` values) and `src/charts/builder/dash.ts` (dash array list, one-mark-per-series split) following the approach chosen in S3; tests in `tests/unit/chartBuilderPatterns.test.ts`
- [ ] T037 [P] [US3] Implement `src/charts/builder/legend.ts` producing a `LegendSpec` (`src/charts/types.ts`) that includes colour, dash, symbol and pattern swatches (extend `src/charts/ChartLegend.tsx` for dash/pattern/symbol swatches if it lacks them), with tests
- [ ] T038 [US3] Write failing tests in `tests/unit/chartBuilderCompile.test.ts` per mark (mark counts, one mark per dash series, pattern defs present, facet keys, categories order, empty and error states), then implement bar, line and scatter in `src/charts/builder/compile.ts` (`renderChart(el, {spec, rows, theme, width, height, state})`; `title: (_d,i)=>'wfa:'+i` + `armPlot` from `src/panels/plotInteraction.ts`; no Plot `tip`; transparent background; theme tokens only; returns `{legend,label,dispose}`)
- [ ] T039 [P] [US3] Extend `compile.ts` with area (stacked, normalize), histogram, box and heatmap, with tests added to `tests/unit/chartBuilderCompile.test.ts`
- [ ] T040 [P] [US3] Implement `src/charts/builder/pieDonut.ts` (d3-shape, per `src/charts/kinds/donut.ts`; refuse negatives and over 12 slices with an in-chart message) and tests in `tests/unit/chartBuilderPie.test.ts`
- [ ] T041 [P] [US3] Implement `src/charts/builder/axisFormat.ts` (number and date formats, scale type/domain/zero/reverse/nice, label angle) and refLine marks used by `compile.ts`; tests

### UI

- [ ] T042 [US3] Implement `src/explore/BuilderChartHost.tsx`: reads the theme via `readChartTheme`, runs `specToSql` (debounced 250 ms, "Updating…" overlay keeps previous rows), queries through `services/duckdb.ts`, calls `renderChart` on resize/theme/data change, legend in the tile legend slot (`useTileLegendSlot`), `aria-label`, error and empty states
- [ ] T043 [P] [US3] Implement `src/explore/vizTab/FieldList.tsx` (relation columns grouped by type, search, type glyphs, `complex` not draggable, chips as `@dnd-kit` drag sources)
- [ ] T044 [US3] Implement `src/explore/vizTab/Shelves.tsx` and `FieldChip.tsx`: only channels valid for the mark, required ones marked, accepted-type hints, drop validation from `spec.ts` with the refusal reason in a polite live region
- [ ] T045 [US3] Implement `src/explore/useAssignByKeyboard.ts` and wire the field-chip "Assign to…" menu and arrow-key reorder; returns focus to the chip after assignment
- [ ] T046 [US3] Implement the chip popover in `src/explore/vizTab/FieldChip.tsx` (aggregate, bin, time unit, sort, stack on the measure channel, discrete/continuous type override, remove), re-query vs view-only changes separated per `contracts/builder-ui.md`
- [ ] T047 [US3] Implement `src/explore/vizTab/VizTab.tsx`: field list + shelves + chart + right rail container, relation picker (source table or My table), toolbar (undo/redo, swap x/y, clear, duplicate tab), per-tab state from `exploreState`
- [ ] T048 [P] [US3] Implement `src/explore/vizTab/FiltersPanel.tsx`, `AxesPanel.tsx` and a reference-lines editor in `src/explore/vizTab/RefLinesPanel.tsx`
- [ ] T049 [US3] Implement tab management in `ExploreBuilderPanel.tsx`: add, rename (double-click/F2), duplicate, close with confirm when customised, unique names, each tab keeps its own relation and spec
- [ ] T050 [US3] Implement the `custom` chart kind in `src/charts/kinds/custom.ts` (config `spec`, `tables: () => []`, `loadExtra` runs the compiled SQL, `draw` calls `renderChart`, `exportRows` returns the rows) following spike S6; add a unit test and a Test-tab-style fixture in `tests/fixtures/test-tab/` (not in `index.json`)
- [ ] T051 [US3] Playwright `tests/integration/explore-builder-chart.spec.ts`: drag x and y gives bars; the same via keyboard only; refused drop shows a reason; aggregate/bin/sort change the chart; colour + dash + shape + pattern legends; facets; each v1 mark renders; two tabs keep separate charts; hover shows the shared tooltip; expand dialog; light and dark screenshots compared with a curated chart (SC-005)

**Checkpoint**: User Stories 1–3 together deliver the core builder.

---

## Phase 6: User Story 4 - Chart suggestions (Priority: P2)

**Goal**: ranked chart types from selected columns, and slot guidance from a chosen chart.

**Independent Test**: one category + one number ranks bar first and offers pie only when appropriate; choosing scatter first marks two quantitative slots required.

- [ ] T052 [P] [US4] Write failing tests in `tests/unit/chartBuilderRules.test.ts` for every row of the selection table in `contracts`/proposal (1 Q; 1 N; 1 T; N+Q; T+Q; 2 Q; 2 N; 2 N+Q; N+T+Q; N+2 Q; 3 Q; 2 T/O+Q; ≥4 columns), the tie-breaks (colour over 8 categories, pie ≤ 6 and parts-of-whole, stack only when summable, log only above ~100×) and the not-viable reason strings; then implement `src/charts/builder/rules.ts` (rule table as data, score, rank, slots, reasons)
- [ ] T053 [US4] Implement `src/explore/vizTab/ChartPicker.tsx`: icon buttons with states viable (ranked, "Suggested" on first), not viable (greyed with reason tooltip), coming soon (disabled, "Coming soon" tooltip) for density, tick, text, rule, waffle, treemap, sunburst, radar, sankey, chord, maps, trail, errorbar
- [ ] T054 [US4] Implement chart-first behaviour: choosing a mark shows required and optional shelves with accepted types; changing the mark keeps compatible encodings and shows a dismissible notice listing dropped ones; unit test the encoding-carry function in `tests/unit/chartBuilderCarry.test.ts`
- [ ] T055 [US4] Hook "selected columns → suggestions": columns present on shelves (or ticked in the field list) feed `rules.ts` live; Playwright `tests/integration/explore-builder-suggest.spec.ts` covers viable, greyed-with-reason, coming-soon hover, chart-first slots

**Checkpoint**: suggestions work in both directions.

---

## Phase 7: User Story 5 - Titles and notes (Priority: P2)

**Goal**: title, subtitle, source, note with size and weight/italic only.

**Independent Test**: large bold title and small italic source render and appear in PNG and SVG exports.

- [ ] T056 [P] [US5] Write failing tests in `tests/unit/chartBuilderText.test.ts` (size scale to theme font size, weight, italic, empty blocks omitted, no family/colour keys accepted), then implement `src/charts/builder/textBlocks.ts` building the HTML blocks above and below the plot using theme tokens
- [ ] T057 [US5] Implement `src/explore/vizTab/StylePanel.tsx` (text input + size select + bold + italic per block; nothing for family or colour) and render blocks in `BuilderChartHost.tsx` and the `custom` kind so exports capture them
- [ ] T058 [US5] Playwright `tests/integration/explore-builder-text.spec.ts`: set title/source styling, toggle theme and see text follow tokens, confirm there is no font or colour control

**Checkpoint**: charts are presentable.

---

## Phase 8: User Story 6 - Export and import (Priority: P2)

**Goal**: configuration JSON (importable, includes data source), PNG, SVG, CSV; YAML parity.

**Independent Test**: export a configuration, reload, import, and get an identical chart.

- [ ] T059 [P] [US6] Write failing tests in `tests/unit/exploreImportExport.test.ts` (round trip byte-identical after key normalisation, invalid file reports each path, missing scenarios listed, no overwrite before confirm, `data.source` re-creates the relation), then implement `src/explore/importExport.ts`
- [ ] T060 [US6] Wire the Export menu in `BuilderChartHost.tsx` to `src/layout/tileExport.tsx` (`ExportMenu`/`useRegisterTileExport`) for PNG, SVG, CSV of the charted rows, and add Export/Import configuration entries; image includes text blocks, legend and hatch patterns
- [ ] T061 [US6] Implement the Import dialog (file or paste): per-path error list, missing scenarios/tables with Remap or Cancel, imports open as a new tab; `src/explore/ImportDialog.tsx`
- [ ] T062 [P] [US6] YAML parity: add schema validation of `spec:` in `src/services/yamlLoader.ts` for `kind: custom`, plus a Vitest case that a spec exported from the builder loads from YAML and a bad spec shows a path-qualified error in the tile
- [ ] T063 [US6] Playwright `tests/integration/explore-builder-export.spec.ts`: PNG/SVG/CSV downloads non-empty and SVG contains pattern defs and title; export, reload, import gives an identical chart for each v1 mark (SC-006); invalid file message

**Checkpoint**: work can be saved and shared.

---

## Phase 9: User Story 7 - Replace the old Explore tab (Priority: P3)

**Goal**: builder replaces Graphic Walker; its code and weight are gone.

**Independent Test**: the Explore tab opens the builder and no Graphic Walker chunk is requested.

- [ ] T064 [US7] Only after the user accepts the builder: point `public/demo-dashboard-config/dashboard-7-explore.yaml` at `explore-builder`, remove the temporary `dashboard-7b-…yaml` and its index entry (and fixtures)
- [ ] T065 [US7] Delete `src/panels/GraphicWalker*.tsx`/`.ts`/`.css` (panel, fields, datasets, dataset picker, theme, shadow style), the `graphic-walker` registry entry, `GraphicWalkerPanelConfig` and related query code in `src/panels/panelQuery.ts`, the `graphic-walker` manual chunk in `vite.config.ts`, and the `@kanaries/graphic-walker` dependency in `package.json`; remove or port tests that targeted it
- [ ] T066 [US7] Amend `.specify/memory/constitution.md` (Technology Stack Reference "Explore tab" row; add a Sync Impact Report comment; version 2.6.0 to 2.7.0) and update `CLAUDE.md` (stack table, panel types, file structure, Explore tab notes)
- [ ] T067 [US7] Playwright `tests/integration/explore-builder-replace.spec.ts`: Explore opens the builder; no request for a graphic-walker chunk; other tabs never request the builder chunk (SC-010); `npm run build` chunk listing shows no graphic-walker

**Checkpoint**: old tool removed.

---

## Phase 10: Polish and cross-cutting

- [ ] T068 [P] Accessibility pass against `contracts/builder-ui.md` (names for all controls, live regions, focus return, contrast in both themes, reduced motion); run the `web-design-guidelines` skill on `src/explore/`
- [ ] T069 [P] Performance check: 100k-row relation re-renders within 2 s and the page stays responsive during a long query (SC-004); record numbers in `specs/065-chart-builder/quickstart.md` Notes
- [ ] T070 [P] Bundle check: builder is one lazy chunk, absent from the entry graph; add a `manualChunks` rule in `vite.config.ts` only if the build report shows a leak
- [ ] T071 Side-by-side visual parity review (built chart vs curated chart, light and dark, Compare off) and fix differences (SC-005)
- [ ] T072 [P] Docs: add an item to `project-docs/IMPLEMENTATION-HISTORY.md`, update `project-docs/ARCHITECTURE.md`/`GRAMMAR.md` for `explore-builder` and `kind: custom`, mark `project-docs/CHART-BUILDER-PROPOSAL.md` as implemented with deviations
- [ ] T073 Run the full quickstart (`specs/065-chart-builder/quickstart.md`), `npx tsc --noEmit`, `npx vitest run`, and Playwright for the new specs with `--workers=1`; fix failures; when asked, `npm run build:pages` and commit the rebuilt `docs/`

---

## Dependencies and order

- Phase 1 → Phase 2 → stories. Spikes S1/S3/S5 feed T032/T036/T027 respectively.
- US1 (Phase 3) has no story dependency. US2 depends on US1's data tab shell (T022) and relations (T013).
- US3 needs Phase 2 and a data source: raw tables from US1 are enough; "Chart this" from My tables needs US2 (T031).
- US4 needs US3's shelves (T044). US5 needs US3's host (T042). US6 needs US3's host and `custom` kind (T050). US7 needs everything accepted.
- Within a phase: tests before implementation; pure modules before UI; `compile.ts` tasks T038 → T039/T040/T041 → T042.

## Parallel examples

- Spikes: T002–T007 run together (each writes its own file).
- Foundational: T009, T010, T011, T012 touch different files.
- US3 core: T035, T036, T037, T040, T041 in parallel; then T038, T039; UI T043, T048 in parallel with `compile`.
- US4/US5/US6 can run in parallel with each other once US3 is done (different folders): T052 ‖ T056 ‖ T059.

## Implementation strategy

- **MVP = Phases 1–3 (US1)**: a working raw-data browser, shippable on the branch.
- Then US2 and US3 (both P1) to reach the core builder; US4–US6 add polish and sharing; US7 only when accepted.
- Re-check Constitution gates at T014 (panel registration), T025 (assistant interplay) and T066 (amendment).

---

## Phase 11: Prototype alignment (added 2026-10-27, see "Updates agreed while prototyping" in spec.md)

These tasks supersede or extend the ones above where they overlap. Build order: T074-T081 (pure core), then T082-T090 (Data tab UI and wiring), then the chart phases above.

- [X] T074 [P] [US1] Replace the 4-type column model with the 10 data types and chart roles in `src/charts/builder/columnTypes.ts` (inference from the DuckDB type, name, distinct count and text length), with `tests/unit/chartBuilderColumnTypes.test.ts`; update T011 accordingly
- [X] T075 [P] [US1] Column profile SQL builders (rows, nulls, distinct, quantiles, histogram bins, top values, text length) in `src/explore/profile/profileSql.ts` plus a pure `shapeProfile()` in `src/explore/profile/profileShape.ts`, with `tests/unit/exploreProfile.test.ts`
- [X] T076 [P] [US2] Query model with joins in `src/explore/sql/queryModel.ts` (`planQuery`, `buildSql`: union across scenarios, up to 4 joins, key renaming, group, where, order, limit) with `tests/unit/exploreQueryModel.test.ts`; supersedes the QueryModel part of T032/T033
- [X] T077 [P] [US2] SQL syntax tokenizer for the editor overlay in `src/explore/sql/highlight.ts` (reuse `--sql-*` tokens), with tests
- [X] T078 [US2] `src/explore/relations.ts`: tables common to the selected scenarios, scenario-union relation names, lazy registration through `ensureRegistered`
- [X] T079 [US2] `src/explore/sql/runUserSql.ts`: guard (`authorize`), mutex, 60 s timeout through `cancelRunning`, paged execution, Arrow cell conversion
- [X] T080 [US2] `src/state/exploreState.ts`: scenarios, table, query model, SQL text and detached flag, run status, My tables, profile selection, tabs
- [X] T081 [US2] Join suggestions (`suggestJoins`) and starter queries in `src/explore/sql/starters.ts`, with tests
- [X] T082 [US1] Explore styles `src/explore/explore.css` (prototype rules mapped to the app tokens, light and dark)
- [X] T083 [US1] Shell: top bar with scenario picker (searchable, 10-15 scenarios), table select, tabs; `src/explore/ExploreBuilderPanel.tsx`, `ScenarioPicker.tsx`, generic `SearchPopover.tsx`
- [X] T084 [US1] Data tab: `ColumnsPanel.tsx` (search, present-type filters, sparkline rows, detail card), `PreviewTable.tsx` (sticky first column, per-type cells, paging to fit)
- [X] T085 [US2] Query box: `QueryBox.tsx` with Builder and SQL tabs, step cards (`StepTable`, `StepJoin`, `StepFilter`, `StepSummarize`, `StepColumns`), `SqlEditor.tsx` with gutter and highlight, shared Run and Save footer, pinned `MyTables.tsx`
- [X] T086 Register `explore-builder` (lazy) in `src/panels/registry.tsx` and `src/layout/types.ts`; point the demo Explore tab (`public/demo-dashboard-config/dashboard-7-explore.yaml`) at it and remove Graphic Walker from navigation (code kept)
- [X] T087 Unit tests for T074-T081 pass and `npx tsc --noEmit` is clean
- [X] T088 Playwright `tests/integration/explore-builder-data.spec.ts`: open Explore, pick scenarios, browse, profile a column, run a join, save a table, in light and dark
