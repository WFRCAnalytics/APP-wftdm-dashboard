---

description: "Task list for 071 Control the outside calls (the network block)"
---

# Tasks: Control the outside calls (the `network` block)

**Input**: Design documents from `/specs/071-network-block/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/network-config.md, quickstart.md

**Tests**: Included. Unit tests for every pure rule and policy module, and a Playwright spec that watches the real requests of a configured site.

**Organization**: Grouped by user story. The generated reference and JSON Schema are regenerated whenever the schema table changes (`npm run docs:config`), because a unit test fails when they drift.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 basemap allow-list, US2 bundled fonts, US3 extension mirror, US4 outside hosts in `check --explain`, US5 mistakes reported

## Path Conventions

Single web-app project: `src/`, `scripts/`, `tests/`, `project-docs/` at the repository root. `src/config/` stays pure (relative imports, no `import.meta.env`, no `@/` alias, no DOM). `sqlGuard` and the assistant are never touched.

---

## Phase 1: Setup

- [X] T001 Confirm the baseline on branch `071-network-block`: `npx tsc --noEmit` and `npx vitest run` are green; run the existing basemap and appearance specs once (`npx vitest run tests/unit/resolveEffectiveBasemap.test.ts`) so a later failure is ours

---

## Phase 2: Foundational (blocks all stories; nothing user-visible changes)

**Purpose**: the pure rules, the three schema rows and the branding fields, so each story only adds wiring.

- [X] T002 Create `src/config/network.ts` (pure): `NETWORK_FONT_MODES = ['bundled','any']`; `globToRegExp(pattern)` (only `*` is a wildcard, everything else escaped, case-insensitive, whole-string); `matchesAny(patterns, id)`; `isAllowed(patterns, id)` (an empty or absent list allows everything); `allowedIds(patterns, ids)` (keeps the catalogue order); `unmatchedPatterns(patterns, ids)`; `outsideHosts(input)` returning sorted unique `{ host, why }` (input: fonts mode, extension address, the allowed catalogue entries with their hosts, hosts of styles written in pages); export from `src/config/index.ts`. Unit tests `tests/unit/configNetwork.test.ts`: every glob rule (literal, `*` at either end, in the middle, special regex characters in an id such as `.`, mixed case), empty/absent list, order kept, unmatched patterns, host listing (dedupe, reasons, nothing when all is self-hosted)
- [X] T003 In `src/config/schema.ts` add rows `network.fonts` (`enum`, values from `NETWORK_FONT_MODES`, `cascade: false`), `network.basemaps.allow` (`list` of `string`, `cascade: false`) and `network.duckdb_extensions` (`url`, `check` using `isWebAddress`, `cascade: false`), each with a description stating values and the default; no schema `default` (research.md decision 9). Run `npm run docs:config`. Extend `tests/unit/configValidate.test.ts`: each key accepted, an unknown font mode reported by path, a non-list allow-list reported, a non-http address reported and dropped, a `network` key on a page reported as a site setting
- [X] T004 [P] `src/config/toBranding.ts` and `src/services/yamlLoader.ts`: `DashboardBranding.network?: { fonts?: 'bundled'|'any'; basemapsAllow?: string[]; duckdbExtensions?: string }` mapped from the settings tree; extend `tests/unit/configToBranding.test.ts` (set, unset, partial)
- [X] T005 [P] Create `src/services/networkPolicy.ts` (module state, no React): `configureNetwork(input?)`, `fontsBundled()`, `getBasemapAllowList()`, `getExtensionRepository()`, `resetNetworkPolicy()`; unset gives today's behaviour. Unit tests `tests/unit/networkPolicy.test.ts` (defaults, configured, reset)

**Checkpoint**: `npx tsc --noEmit` clean and the new unit tests pass; the app behaves as before.

---

## Phase 3: User Story 1 - Basemap allow-list (Priority: P1) MVP

**Goal**: a configured allow-list limits what the Basemap tab offers and what every map shows, and no request goes to a basemap host outside it.

**Independent Test**: set `network.basemaps.allow`; the tab lists only matches, a map uses the first allowed entry when the default is not on the list, and the network log shows no request to the other basemap hosts.

- [X] T006 [US1] `src/panels/basemap/registry.ts`: export `listCatalogueIds()` (built-in preset names, Protomaps flavour names, and the raster providers as `Provider` or `Provider.Variant`, from a loaded catalogue passed in or read through the existing cached loader) and a pure `catalogueHosts(...)` that derives hosts with `new URL` from preset URLs, composition layers and the provider file's tile templates. Unit test in `tests/unit/basemapCatalogue.test.ts` with a small provider fixture
- [X] T007 [US1] Create `src/panels/basemap/basemapPolicy.ts` (module state): `configureBasemapPolicy(patterns)`, `isBasemapAllowed(selection)` (a catalogue name is checked against the list; a composition object or an `http(s)` style URL is deployer-authored and always allowed), `firstAllowed(ids)`, `applyPolicy(selection)` (returns the selection, or the first allowed catalogue entry, or the blank background selection), a once-per-selection report through `addProblems` (message names the key path and the replacement), `resetBasemapPolicy()`. Unit tests `tests/unit/basemapPolicy.test.ts`: allowed passes, not allowed falls to the first allowed, nothing allowed gives the blank background, composition and URL pass, the report happens once per selection, no list changes nothing
- [X] T008 [US1] `src/panels/basemap/resolveEffectiveBasemap.ts`: pass the cascade winner through `applyPolicy` (the `source` is kept); with no list it is the identity. Extend `tests/unit/resolveEffectiveBasemap.test.ts`: the app default replaced when not allowed, a panel, page and site default replaced, a stale viewer pick replaced, no list unchanged
- [X] T009 [US1] `src/layout/settings/basemapTab.tsx`: list only allowed built-in styles, Protomaps flavours and raster providers (the dropdown filtered by the same policy through `isBasemapAllowed`), hide a section that has no allowed entry, and make sure the staged and the in-use selection cannot be a hidden entry. No new control
- [X] T010 [US1] `src/main.tsx` (done through `configureNetwork`, which `basemapPolicy` reads; no separate `configureBasemapPolicy` was needed): after the site is loaded and before any page renders, `configureNetwork(branding.network)` and `configureBasemapPolicy(branding.network?.basemapsAllow)`
- [X] T011 [US1] Playwright `tests/integration/networkBlock.spec.ts` (chromium project, site file served through `page.route`, basemap hosts routed so a request can be counted): with an allow-list of two entries the Basemap tab lists only those, a zone map uses the first allowed one and no request goes to `openfreemap` or `cartocdn`, the configuration note says the default was replaced; with no list the tab lists everything. Run it three times to confirm it is stable

**Checkpoint**: US1 works alone; fonts and extensions are untouched.

---

## Phase 4: User Story 2 - Bundled fonts (Priority: P2)

**Goal**: `network.fonts: bundled` offers only the bundled fonts and makes no font request.

**Independent Test**: set it; the Appearance tab has two cards and no custom inputs, and the network log has no request to a font host.

- [X] T012 [US2] `src/state/fontPreferenceState.ts` and `src/layout/settings/appearanceTab.tsx`: with `fontsBundled()`, render only the default and System UI cards, do not render the custom-font inputs or the shortlist, skip the effect that loads the two preview fonts, make `setFont` refuse a family that is not offered, and ignore (do not apply) a stored preference for a hidden family. Unit tests added to `tests/unit/networkPolicy.test.ts` for the filter and the refusal
- [X] T013 [US2] Extend `tests/integration/networkBlock.spec.ts`: with `fonts: bundled` two cards, no custom inputs, no request to `fonts.googleapis.com`; without it the four cards and the inputs are there

---

## Phase 5: User Story 3 - Extension mirror (Priority: P2)

**Goal**: the app asks the deployer's address for extensions.

**Independent Test**: set an address routed in the browser; a zone map's extension request goes there.

- [X] T014 [US3] `src/services/duckdb.ts`: `setExtensionRepository(url)` runs one `SET custom_extension_repository = '<url>'` on the shared connection (single quotes doubled; only an `http`/`https` address is accepted, otherwise it does nothing); `src/main.tsx`: load the site first, call it with `getExtensionRepository()` before `discoverScenarios()` so it precedes any extension use. Unit test for the statement text and the refusal of a non-web address (mock the connection)
- [X] T015 [US3] Confirm `sqlGuard` still refuses `SET`, `INSTALL`, `LOAD` (existing tests) and add one assertion in `tests/unit/` that the guard source is unchanged in behaviour for `SET custom_extension_repository`; no code change to the guard
- [X] T016 [US3] Extend `tests/integration/networkBlock.spec.ts`: an extension address routed to a local fake that answers 404 (the request itself is the assertion); open a zone map; the first extension request goes to that address and none to `extensions.duckdb.org`. Recorded: the parquet autoload DOES use the address (the spec saw `<address>/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm`, and nothing went to `extensions.duckdb.org`); the spatial install goes through the same setting

---

## Phase 6: User Story 5 - Mistakes reported (Priority: P2)

**Goal**: every kind of mistake is listed once with its path in the note and in `check`, and the app loads.

**Independent Test**: a site with one of each mistake loads, behaves as today for each, and each is listed once in the note and by `check`.

- [ ] T017 [US5] `src/config/check.ts` and `scripts/check-config.ts`: pass the catalogue ids to `checkSite` (an option like `panelCheck`); report a pattern that matches no known id, an allow-list that matches nothing, and a `basemap.default` (site, page, or a panel's `basemap`) that is a catalogue name not allowed; reuse `unmatchedPatterns` and `isAllowed`. Unit tests in `tests/unit/configCheck.test.ts` with a small id list: each mistake once with its path, a clean site gives none
- [ ] T018 [US5] `src/services/siteConfig.ts`: report the site-level cross-key problems the app can know at boot (the site `basemap.default` not allowed); the unmatched-pattern report waits for the raster catalogue to load (Basemap tab) and is reported once. Extend `tests/unit/siteConfigDemo.test.ts` or a new test for the site-level report
- [ ] T019 [US5] Extend `tests/integration/networkBlock.spec.ts`: a site file with an unknown font mode, a bad extension address and an allow-list matching nothing loads, the note lists each path, and the maps draw the blank background with no basemap request

---

## Phase 7: User Story 4 - Outside hosts in `check --explain` (Priority: P3)

**Goal**: one run of `check --explain` lists what is left.

**Independent Test**: `check --explain` on a site with some outside hosts left and on one with none.

- [ ] T020 [US4] `src/config/check.ts#explain` takes the catalogue hosts (and the hosts of styles written in pages, read from the page files) and appends the `outside hosts` block from `outsideHosts` (data-model.md format) only when asked; `scripts/check-config.ts` builds the catalogue (preset URLs, composition layers, `public/basemap/leaflet-providers.json` tile templates). Unit tests: fonts not bundled adds Google, no extension address adds the DuckDB host, a self-hosted-only configuration says `no outside host is known`, the exit code is unchanged
- [ ] T021 [US4] Run `npm run check -- public/demo-dashboard-config --explain` and on a scratch site with fonts bundled, an extension address and a PMTiles-only allow-list; record both outputs in the quickstart

---

## Phase 8: Polish and cross-cutting

- [ ] T022 [P] Docs: `project-docs/CONFIGURATION.md` (Phase D step 10 done, the draft shape in section 4, the proposal in section 7 marked decided with the answers), `project-docs/GRAMMAR.md` (the `network` block sentence), `CLAUDE.md` (the site settings list, the policy modules, that the app default basemap is an outside host), `project-docs/IMPLEMENTATION-HISTORY.md` ("071 Control the outside calls": the choke point, the catalogue ids, deployer-authored styles not blocked, the extension setting, gotchas)
- [ ] T023 `npm run docs:config`; `npx tsc --noEmit`; `npx vitest run`
- [ ] T024 Full Playwright run (`npx playwright test`); compare failures with the known flakes in CLAUDE.md and re-run each alone with `--workers=1` before treating it as real
- [ ] T025 Walk `quickstart.md` and record the result at its foot
- [ ] T026 Rebuild `docs/` with `npm run build:pages` (only when the user asks; not part of the implementation)

---

## Dependencies and Order

- Phase 1, then Phase 2 (T002, T003 in order; T004 and T005 in parallel once T003 exists).
- US1 (Phase 3) needs Phase 2: T006 then T007, T008 and T009 (T009 needs T007), T010, then T011.
- US2 (Phase 4) and US3 (Phase 5) need Phase 2 and T010; they are independent of US1 and of each other.
- US5 (Phase 6) needs T006 (the catalogue ids) and T007; US4 (Phase 7) needs T017's catalogue wiring.
- Polish after the stories. T026 only on request.

## Parallel example

After Phase 2: T012 (fonts) and T014 (extension) can run beside T006 to T009 (basemaps), since they touch different files; the Playwright spec tasks edit one file, so they run in order.

## MVP

Phases 1 and 2 plus US1 (T001 to T011): the basemap allow-list, the part that changes what a viewer can reach. Stop at the US1 checkpoint if asked.
