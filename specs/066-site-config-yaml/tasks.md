# Tasks: Site configuration in dashboard-config.yaml

**Input**: Design documents from `/specs/066-site-config-yaml/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/dashboard-config.md, quickstart.md

**Tests**: Included. The spec requires them (SC-002, SC-005, SC-007) and the pure modules are built to be tested without a browser.

**Format**: `- [ ] [ID] [P?] [Story] Description with file path`. `[P]` = different files, no dependency on an incomplete task.

## Phase 1: Setup

- [X] T001 Create `src/config/` with an `index.ts` re-exporting the public API (`schema`, `validate`, `resolve`, `toBranding`); add a lint/tsc note at the top of each file that the folder is pure: relative imports only, no `import.meta.env`, no `@/` alias, no DOM
- [ ] T002 [P] (deferred to T032, where the script file it runs is created) Add an `npm run docs:config` script to `package.json` that runs `scripts/gen-config-reference.ts` (script itself in T032)

---

## Phase 2: Foundational (blocks every user story)

**Purpose**: the schema table, the validator, the resolver and the mapper, all pure and unit-tested.

- [X] T003 Define the `SettingDef` type and the full table of rows in `src/config/schema.ts` for every key in `contracts/dashboard-config.md`: `version`, `pages`, `title`, `logo.{light,dark}`, `mark.{light,dark}`, `colors.{primary,secondary,accent,brand}`, `scenario_palette`, `vocab.*`, `metrics`, `units.*`, `years.{list,base,default}`, `compare.{default,scenarios,focus,reference}`, `layout.mode`, `export.footer`, `assistant.enabled`, `basemap.default`, `basemap.protomaps.{pmtiles_url,api_key}` and the cascading `explore.*` rows; each with type, default, cascade rule and description
- [X] T004 [P] Unit test the table in `tests/unit/configSchema.test.ts`: paths unique, every row has a description, every enum has values, only the keys listed as cascading in the contract have `cascade` set, list rows state their merge rule
- [X] T005 Implement `validate(raw, { file, level })` in `src/config/validate.ts` returning `{ settings, problems }`: type-check each leaf against its row, report `unknown_key`, `wrong_type`, `invalid_value` (colour via a pure regex/keyword check passed in or a CSS-colour test helper with no DOM, URL shape), `not_allowed_here` for a site-only key at page/panel level, `duplicate` page entries; keep the default for each problem; `check` hooks for `vocab`, `metrics` and `years.list` reuse the shape code in `src/charts/vocab.ts` and `src/charts/lib/metrics.ts` through small pure helpers (extract them if they import browser code)
- [X] T006 [P] Unit tests for `validate` in `tests/unit/configValidate.test.ts`: empty and `version`-only files give no problems; unknown key, wrong type, invalid colour, camelCase old key, site-only key on a page, higher `version`; each keeps its default and names its path
- [X] T007 Implement `resolve({ site, page?, panel? })` in `src/config/resolve.ts` returning `{ values, source }`: scalars replace, maps merge per key, `replace` lists replace, `concat` lists concatenate higher level first, `false`/`[]` switch off, `null` is not special; accept an optional extra level so `panel_defaults` can be added later
- [X] T008 [P] Unit tests for `resolve` in `tests/unit/configResolve.test.ts`, one test per rule in FR-006 plus provenance (`source[path]`), and a test that an unknown level key is ignored
- [X] T009 Implement `toBranding(settings)` in `src/config/toBranding.ts` per the data-model mapping (`logo.light`→`logoUrl`, `years.{list,base,default}`→`years/baseYear/defaultYear`, `basemap.protomaps.*`→`protomapsPmtilesUrl/protomapsApiKey`, and so on), typed against `DashboardBranding` in `src/services/yamlLoader.ts`
- [X] T010 [P] Unit test `toBranding` in `tests/unit/configToBranding.test.ts` against a fixture YAML equal to the demo's former branding object (copy the values from `public/demo-dashboard-config/index.json`)

**Checkpoint**: the pure layer is complete and green; nothing in the app reads it yet.

---

## Phase 3: User Story 1 - A deployer configures the whole site in one YAML file (Priority: P1) MVP

**Goal**: the app boots from `dashboard-config.yaml` and looks and behaves as before.

**Independent Test**: load the demo from the new file and compare title, logos, pages, vocabularies, years and layout with the previous run; remove the file and see neutral defaults.

- [X] T011 [US1] Write `public/demo-dashboard-config/dashboard-config.yaml` carrying everything from `public/demo-dashboard-config/index.json` (pages list, title, logos, marks, protomaps key, layout, compare, units, metrics, vocab incl. districts, years)
- [X] T012 [P] [US1] Write `public/demo-synthetic/dashboard-config/dashboard-config.yaml` from its `index.json`
- [X] T013 [P] [US1] Write `tests/fixtures/legacy-demo/dashboard-config/dashboard-config.yaml` from its `index.json`; also add one for `tests/fixtures/dashboard-config/` if that fixture root carries site settings (check first)
- [X] T014 [US1] Implement `src/services/siteConfig.ts`: `loadSiteConfig(baseUrl)` fetches and parses `dashboard-config.yaml` (js-yaml, reusing `parseYAMLText` from `src/services/yamlLoader.ts`), runs `validate`, and returns `{ settings, problems }`; on a missing file returns defaults plus a `missing_file` problem; a syntax error returns a `syntax` problem with the parser's line
- [X] T015 [US1] Merge the two roots in `src/services/siteConfig.ts` (`loadSite()`): deployment root over demo root per key with the T007 merge rules, producing one settings tree and the ordered page list
- [X] T016 [US1] Change page loading in `src/services/yamlLoader.ts`: `loadDashboards(baseUrl, pages)` takes the `pages` list instead of reading `index.json`; keep `DashboardBranding` and delete `loadDashboardBranding` and its `parse*` helpers once T017 compiles
- [X] T017 [US1] Rewire the boot in `src/main.tsx` to call `loadSite()`, build `branding` with `toBranding`, and keep the existing `configureVocab/Metrics/Units/Layout/Export`, `setAssistantEnabled` and `bootCompareState` calls unchanged
- [X] T018 [US1] Delete `public/demo-dashboard-config/index.json`, `public/demo-synthetic/dashboard-config/index.json` and the legacy fixture `index.json` once their YAML replacements load; update `tests/global-setup.js`, `tests/global-teardown.js`, `scripts/viteLegacyDemoPlugin.ts` and `scripts/build-demo-redesign-data.py` where they name those files
- [X] T019 [US1] Add `tests/integration/_siteConfig.ts` with `routeSiteConfig(page, patch)` (fetch the real YAML, parse in Node with js-yaml, apply the patch, fulfil) and update `tests/integration/_testTab.ts` to append the Test tab to `pages`
- [X] T020 [US1] Migrate the specs that fake `index.json` to the helper, in groups, running each group after editing: boot/shell (`boot.spec.ts`, `dashboardShell.spec.ts`, `sidebarNav.spec.ts`, `fullPagePanel.spec.ts`), data and years (`modelYears.spec.ts`, `demoMultiScenario.spec.ts`, `scenarioAutoActivation.spec.ts`, `scenarioManager.spec.ts`, `scenarioColorOverride.spec.ts`), appearance/assistant/basemap (`appearanceSettings.spec.ts`, `aiChat.spec.ts`, `protomapsBasemap.spec.ts`, `settingsModal.spec.ts`), panels (`observablePlot*.spec.ts`, `valueBox*.spec.ts`, `tablePanel*.spec.ts`, `zonemapPanel.spec.ts`, `graphicWalkerPanel.spec.ts`, `exploreBuilderCustomKind.spec.ts`, `multiViewTile.spec.ts`, `demoContentAllPanels.spec.ts`, `testTabInvisibility.spec.ts`, `realDemo.spec.ts`)
- [X] T021 [US1] Add `tests/integration/siteConfig.spec.ts`: demo renders as before (title, logo, page order), a config with only `title` shows defaults elsewhere, no `dashboard-config.yaml` shows neutral defaults

**Checkpoint**: the app runs entirely from `dashboard-config.yaml`; the old JSON is gone; existing specs pass.

---

## Phase 4: User Story 2 - A mistake in the config is reported, never fatal (Priority: P1)

**Goal**: every failure case in FR-009 loads the app and is listed once in a note and in the console.

**Independent Test**: load a config with an unknown key, a wrong type and a site-only key on a page; the app renders and the three problems are listed.

- [X] T022 [US2] Add `src/state/configProblems.ts` (plain module state, subscribe and get, no Web Storage) and have `loadSite()` push all problems into it and `console.warn` each as `file › path: message`
- [X] T023 [US2] Implement `src/layout/configNotice.tsx`: one dismissible note listing problems (file, path, message), nothing when empty; mount it once in `src/layout/shell.tsx`; reuse the note styling the Explore options report uses
- [X] T024 [US2] Validate each page file's own keys at load (site-only key set on a page or panel, duplicate slugs from `assignSlugs` in `src/state/routeState.ts`, a listed page file that is missing or fails to parse) and add those problems in `src/services/yamlLoader.ts#loadDashboards`, skipping only the bad page
- [X] T025 [US2] When `dashboard-config.yaml` is missing, probe the deployment root's `index.json` once in `src/services/siteConfig.ts` and word the problem `moved` (old keys found) or `missing_file`; no probe on the success path
- [X] T026 [P] [US2] Playwright spec cases in `tests/integration/siteConfig.spec.ts`: unknown key, wrong type, site-only key on a page, invalid YAML, missing file with and without a legacy `index.json`; the app loads in all, defaults hold, the note lists exactly the expected paths, a clean config shows no note

**Checkpoint**: US1 + US2 deliver a safe, observable config load.

---

## Phase 5: User Story 3 - A setting can be overridden lower down (Priority: P2)

**Goal**: the cascading keys actually resolve through `resolve()` at page and panel level.

**Independent Test**: site layout `tabs`, one page `scroll`: that page scrolls, the rest tab; a panel's Explore list overrides or concatenates by its declared rule.

- [X] T027 [US3] Adapt the existing page and panel spellings into schema paths in one place (`src/config/levels.ts`: `header.layout_mode`→`layout.mode`, tab or panel `default_basemap`→`basemap.default`, panel Explore option keys→`explore.*`) with a unit test in `tests/unit/configLevels.test.ts`
- [X] T028 [US3] Resolve the page layout mode through `resolve()` in `src/state/layoutState.ts` (replacing its hand-written site/page precedence), keeping the viewer override above the cascade
- [X] T029 [P] [US3] Resolve the default basemap through `resolve()` in `src/panels/basemap/loadBasemapStyle.ts` / `src/panels/basemap/registry.ts` (replacing the panel > tab > app chain), same precedence as today
- [X] T030 [US3] Resolve the Explore options in `src/explore/options.ts`: site and page `explore` defaults under the panel's own keys using each key's declared list rule; wrong values still reported under the panel title
- [X] T031 [US3] Playwright cases in `tests/integration/siteConfig.spec.ts` (or `layoutTabs.spec.ts`): page layout beats site layout; an Explore `charts.allow` set at site is replaced by the panel's, a `tables.exclude` is concatenated

**Checkpoint**: the cascade is live for the three keys that cascade today.

---

## Phase 6: User Story 4 - A maintainer adds a setting by editing one place (Priority: P2)

**Goal**: the schema table is the only source for loading, validation, skeleton and reference.

**Independent Test**: add a test-only row; it loads, validates, cascades and appears in the generated reference with no other source edit.

- [X] T032 [US4] Implement `src/config/reference.ts` (schema → Markdown table: path, type, default, cascade rule, description) and `scripts/gen-config-reference.ts` writing `project-docs/CONFIG-REFERENCE.md`; run `npm run docs:config` and commit the output
- [X] T033 [P] [US4] Unit test `tests/unit/configReference.test.ts`: regenerate in memory and fail when it differs from the committed `project-docs/CONFIG-REFERENCE.md`; fail when a schema path is missing from it (SC-007)
- [X] T034 [US4] (done early in T018: the plugin already reads `dashboard-config.yaml` through `src/config`; only its header comment and a unit check remain) Replace the hand-written parser in `scripts/viteBootSkeletonPlugin.ts` with the pure `src/config` modules (title, page count, assistant on/off); delete its duplicated `index.json` reading and update its header comment
- [X] T035 [P] [US4] Unit test the "one place" property in `tests/unit/configExtensible.test.ts`: build a temporary schema with one extra row and show `validate`, `resolve` and `reference` handle it without other changes (the functions take the table as a parameter, default the real one)

**Checkpoint**: adding a key is one row plus the code that uses it.

---

## Phase 7: User Story 5 - The old index.json settings are gone (Priority: P3)

**Goal**: nothing reads the old keys, and the docs say so.

**Independent Test**: grep the source for the old keys; none is read; the demo behaves as before.

- [X] T036 [US5] Remove the remaining readers of the old keys (any left in `src/services/yamlLoader.ts`, `src/state/assistantAvailability.ts`, `src/state/compareState.ts`, `src/state/layoutState.ts`, `src/state/exportState.ts`, `src/layout/dashboardBrand.tsx`, `src/layout/floatingNav.tsx`, `src/charts/vocab.ts`, `src/services/runResolution.ts` comments and code that name `index.json` settings) and update their comments to point at `dashboard-config.yaml`
- [X] T037 [P] [US5] Add a unit test `tests/unit/noLegacyKeys.test.ts` that scans `src/` and `scripts/` for the old flat keys (`logoUrl` as a config read, `scenarioPalette`, `protomapsApiKey`, `dashboards:` index reads) outside the `toBranding` mapping and `DashboardBranding` type, failing on a hit (SC-006)
- [X] T038 [US5] Update `python/wftdm_dashboard/observed.py` and `python/tests/test_observed.py` only if they read `dashboard-config/index.json` (they list `observed/summary/index.json`, which stays); otherwise leave untouched and note it in the PR
- [X] T039 [US5] Confirm `scenarios/index.json` and `observed/summary/index.json` discovery is unchanged (`src/services/scenarioDiscovery.ts`, `src/state/appState.ts`) with the existing `scenarioAutoActivation.spec.ts`

---

## Phase 8: Polish & cross-cutting

- [X] T040 [P] Update `project-docs/CONFIGURATION.md`: mark Phase B steps 4, 5 and 7 done, point to `CONFIG-REFERENCE.md`, record the two-root precedence note
- [X] T041 [P] Update `CLAUDE.md` (Config file set, the `index.json` paragraph, File structure, Do not) and the constitution references to `index.json` settings; add the new `src/config/` and `siteConfig.ts` to the file structure; record the feature in `project-docs/IMPLEMENTATION-HISTORY.md`
- [X] T042 [P] Update `project-docs/GRAMMAR.md` for `header.slug` and a pointer to `CONFIG-REFERENCE.md`
- [ ] T043 Run `npx tsc --noEmit`, `npx vitest run`, then the Playwright projects (`chromium`, `redesign`, `real`); compare failures with the known flakes in `CLAUDE.md` and `realDemo.spec.ts:19`/`chartMaps.spec.ts:189` (pre-existing), re-running with `--workers=1` first
- [ ] T044 Walk `quickstart.md` by hand, including the `WFTDM_BASE=./` build still loading its config from a nested folder
- [ ] T045 Rebuild `docs/` with `npm run build:pages` only after the user asks

---

## Dependencies and order

- Phase 1 → Phase 2 (T003 first; T004, T006, T008, T010 follow their module) → everything else.
- **US1 (MVP)** depends on Phase 2. T011–T013 precede T014; T014–T015 precede T016–T017; T018 only after T017 passes; T019 precedes T020.
- **US2** depends on US1 (T014, T016). **US3** depends on Phase 2 and US1 (T017). **US4** depends on Phase 2 only (T034 also needs T017 so the plugin and app agree). **US5** depends on US1 and US4.
- US3 and US4 can run in parallel after US1; US2 can run in parallel with US4.

## Parallel examples

- Phase 2 tests: T004, T006, T008, T010 can be written in parallel with their modules (different files).
- US1 data files: T011, T012, T013 in parallel.
- Docs in Polish: T040, T041, T042 in parallel.

## Implementation strategy

1. **MVP = Phase 1 + 2 + US1**: the app boots from YAML, the demo is identical, the old JSON is gone. Stop and verify with the quickstart.
2. Add **US2** next (safety net), then **US3** and **US4**, then **US5** and Polish.
3. Commit per phase on `066-site-config-yaml`; rebuild `docs/` and merge only when asked.

## Notes

- `CONFIG-REFERENCE.md` is generated; never hand-edit it.
- The unit tests assert provenance and rules without a browser, so most regressions show up before any Playwright run.
