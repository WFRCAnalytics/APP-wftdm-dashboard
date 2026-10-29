---

description: "Task list for 067 viewer-facing settings"
---

# Tasks: Viewer-facing settings (Settings tabs, documentation link, hidden pages)

**Input**: Design documents from `/specs/067-viewer-settings/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/viewer-settings.md, quickstart.md

**Tests**: Included. The project's convention is unit tests for every pure `src/config` module and a Playwright spec per user-visible behaviour (as in 066).

**Organization**: Grouped by user story. The generated reference and JSON Schema are regenerated at the end of each story (`npm run docs:config`), because a unit test fails when they drift from the schema table.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 documentation link, US2 Settings tabs, US3 hidden pages

## Path Conventions

Single web-app project: `src/`, `tests/`, `scripts/`, `project-docs/` at the repository root. `src/config/` stays pure (relative imports, no `import.meta.env`, no `@/` alias, no DOM).

---

## Phase 1: Setup

- [ ] T001 Confirm the baseline on branch `067-viewer-settings`: `npx tsc --noEmit` and `npx vitest run` are green before any change (so a later failure is ours)

---

## Phase 2: Foundational (blocks all three stories)

**Purpose**: the two generic extensions to the 066 schema machinery and the header parsing every story reads.

- [ ] T002 Extend `SettingDef` in `src/config/schema.ts` with `scope?: 'page'` (set in a page's `header:`, never in the site file, never cascades) and `clean?: (value) => { value: unknown; messages: string[] }`; document both in the interface comment
- [ ] T003 Teach `src/config/validate.ts` the two extensions: a `scope: 'page'` row is accepted when `level` is `page` and reported `not_allowed_here` ("belongs in a page's header") when it appears in the site file; after the type and `check` steps, run `clean`, report each message as `invalid_value` on that path and keep the returned value (leave the key unset when the value is `undefined`). The cascade resolver (`src/config/resolve.ts`) must skip `scope: 'page'` rows (a unit test proves it)
- [ ] T004 [P] Unit tests in `tests/unit/configValidate.test.ts` (and `tests/unit/configResolve.test.ts` for the skip) using a test-only schema: a page-scoped row is valid on a page and `not_allowed_here` on the site; `clean` keeps the good part and reports each dropped item; `clean` returning `undefined` leaves the key unset; a page-scoped row never reaches `resolve()`
- [ ] T005 [P] Extend `pageSettings()` in `src/config/levels.ts` so a page's `header.docs` and `header.hidden` (and only those header keys) are passed through as `{ header: { docs, hidden } }`; unit test in `tests/unit/configLevels.test.ts` (other header keys such as `tab` and `slug` are not passed, so they stay unchecked as today)
- [ ] T006 [P] Parse `header.hidden` (boolean) and `header.docs` (string) fail-soft into `DashboardTabConfig['header']` in `src/layout/types.ts#parseDashboardConfig` and document both fields on the type; extend the existing parser unit test (a non-boolean or non-string value is left unset)

**Checkpoint**: the table can describe a page-scoped key and a list that is cleaned instead of rejected. Nothing user-visible yet.

---

## Phase 3: User Story 1 - A deployer links the dashboard to its documentation site (Priority: P1) 🎯 MVP

**Goal**: `docs.url` / `docs.label` and an optional page `header.docs` produce a documentation link at the foot of the left sidebar.

**Independent Test**: set `docs.url`, load the app, click the icon, a new tab opens at that address; add `header.docs` to one page and the icon on that page opens the longer address only there.

- [ ] T007 [US1] Add the rows `docs.url` (`url`, `check`: parses as a URL with protocol `http:` or `https:`), `docs.label` (`string`, default none; the app supplies "Documentation") and `header.docs` (`string`, `scope: 'page'`, `check`: a relative path, no scheme and not starting `//`) to `SETTINGS` in `src/config/schema.ts`, all with descriptions
- [ ] T008 [P] [US1] Create `src/config/viewer.ts` (pure) with `docsHref(url, path)` per research.md decision 4 (trim trailing slashes of the address and leading slashes of the path, keep `#fragment` and `?query`, return the address alone for an empty or refused path, `undefined` for no usable address) and `docsLabel(label)` (default "Documentation"); export from `src/config/index.ts`
- [ ] T009 [P] [US1] Unit tests `tests/unit/configViewer.test.ts` for `docsHref`: join with and without slashes (SC-002), fragment and query kept, a full address or `//host` path refused, `javascript:`/`ftp:`/`data:` addresses refused, an empty path returns the address
- [ ] T010 [US1] Map `docs.url` and `docs.label` onto `DashboardBranding` (`docsUrl`, `docsLabel`) in `src/config/toBranding.ts` and the interface in `src/services/yamlLoader.ts`; extend `tests/unit/configToBranding.test.ts`
- [ ] T011 [US1] Add the docs link to `src/layout/floatingNav.tsx` at the foot (above Settings): an `<a target="_blank" rel="noopener noreferrer">` carrying `NavButton`'s class string (extract the string into a shared constant in `src/layout/navButton.tsx`, no behaviour change to `NavButton`), `BookOpen` icon, label text hidden when collapsed like the other buttons, `title` and accessible name from the label; shown in the expanded, collapsed and mobile-sheet forms; only when `branding.docsUrl` is set
- [ ] T012 [US1] Pass the open page's `header.docs` from `src/layout/shell.tsx` to `FloatingNav` and compute the destination with `docsHref(branding.docsUrl, page.header.docs)` (chromeless pages use the address alone)
- [ ] T013 [US1] Report `header.docs` set while the site has no `docs.url` (`invalid_value`, path `header.docs`, "no documentation address is set; ignored") in the boot sequence (`src/main.tsx`, through `addProblems`) and in `checkSite` (`src/config/check.ts`); the link then ignores that page's path. Extend `tests/unit/configCheck.test.ts`
- [ ] T014 [P] [US1] Playwright spec `tests/integration/viewerSettings.spec.ts` (project `chromium`, `_siteConfig.ts` helpers plus a `page.route` on one page's header): no icon without `docs`; the icon exists with the label and opens the address (check the `href`, `target` and `rel`, not a real navigation); a page path appends only on that page; a `javascript:` address shows the note and no icon; the collapsed rail still exposes it by accessible name
- [ ] T015 [US1] Run `npm run docs:config` and commit the regenerated `project-docs/CONFIG-REFERENCE.md` and `project-docs/dashboard-config.schema.json`

**Checkpoint**: US1 delivers a working, safe documentation link. This is the MVP.

---

## Phase 4: User Story 2 - A deployer chooses which Settings tabs viewers see, and in what order (Priority: P2)

**Goal**: `settings.tabs` orders and filters the Settings window.

**Independent Test**: list two tabs in a chosen order, open Settings, only those two appear in that order and the first is open.

- [ ] T016 [US2] Add the row `settings.tabs` (`list`, `of: 'string'`, site-only) to `src/config/schema.ts` with a `clean` that drops unknown names and repeats (one message each, naming the tab) and, when nothing valid remains, returns `undefined` with the message "no usable tab, so all tabs are shown"; the valid names are `SETTINGS_TAB_NAMES`
- [ ] T017 [P] [US2] Add to `src/config/viewer.ts` the constant `SETTINGS_TAB_NAMES` (`appearance`, `scenarios`, `basemap`, `assistant`, `documentation`) and `resolveSettingsTabs(list, { assistantEnabled })` per data-model.md (order kept, `assistant` dropped when disabled, never empty); unit tests in `tests/unit/configViewer.test.ts` for every rule including "only `assistant`, switched off, gives the default list"
- [ ] T018 [US2] Map `settings.tabs` onto `DashboardBranding.settingsTabs` in `src/config/toBranding.ts` and `src/services/yamlLoader.ts`; extend `tests/unit/configToBranding.test.ts`; extend `tests/unit/configValidate.test.ts` for unknown, repeated and wholly-invalid lists (each reported with the `settings.tabs` path, valid names kept)
- [ ] T019 [US2] In `src/state/settingsState.ts` add `configureSettingsTabs(ids)` (config names converted, `assistant` to the internal `ai`), start `tab` as the first listed, and make `openSettings(tab)` / `setSettingsTab(tab)` fall back to the first listed tab when `tab` is not shown; call it once at boot in `src/main.tsx` after `setAssistantEnabled`. Unit test the fallback in `tests/unit/settingsState.test.ts`
- [ ] T020 [US2] Build the tab list in `src/layout/settingsModal.tsx` from the resolved list, in order (replacing the filter over `ALL_TABS`), keeping the roving-tabindex keyboard handling and the description text accurate for the listed tabs
- [ ] T021 [P] [US2] Playwright cases in `tests/integration/viewerSettings.spec.ts`: a two-tab list shows exactly those tabs in order with the first open; no list shows five; a list naming the Assistant tab with `assistant.enabled: false` hides it; an unknown name is reported in the note and the valid tabs still show; opening Settings from the scenario picker's link while the Scenarios tab is not listed opens the first listed tab
- [ ] T022 [US2] Run `npm run docs:config` and commit the regenerated reference and JSON Schema

**Checkpoint**: US1 + US2 both work and each can be shipped alone.

---

## Phase 5: User Story 3 - A deployer hides a page from the sidebar but keeps it reachable (Priority: P3)

**Goal**: `header.hidden` takes a page out of every form of the sidebar while keeping its address.

**Independent Test**: mark one of three pages hidden, the sidebar lists two, `#/<slug>` still opens the hidden one.

- [ ] T023 [US3] Add the row `header.hidden` (`boolean`, `scope: 'page'`) to `src/config/schema.ts`
- [ ] T024 [P] [US3] Create `src/config/pages.ts` (pure): `listedPages(headers)`, `landingIndex(headers)` and `allHidden(headers)` per data-model.md (hidden pages are not listed; when every page of several is hidden, all are listed; a single page is always listed); export from `src/config/index.ts`; unit tests `tests/unit/configPages.test.ts` for each rule and for index stability
- [ ] T025 [US3] In `src/layout/floatingNav.tsx` skip the entries that `listedPages` does not list while still iterating the full `tabs` array (indices stay unchanged), in all three forms; a hidden active page shows no selected item and keeps its sections list out of the nav
- [ ] T026 [US3] In `src/layout/shell.tsx` use `landingIndex` for the initial active index and for an address that names no page; an address that names a hidden page's slug opens it
- [ ] T027 [US3] Report "every page is hidden; all are shown" once (`invalid_value`, path `pages`) in the boot sequence (`src/main.tsx` through `addProblems`) and in `checkSite`; extend `tests/unit/configCheck.test.ts` (also covers a single hidden page: no problem)
- [ ] T028 [P] [US3] Playwright cases in `tests/integration/viewerSettings.spec.ts`: a hidden page is absent from the expanded and collapsed sidebar and from the mobile sheet; the landing page is the first non-hidden one; `#/<slug>` opens the hidden page with its own title; a single hidden page is the landing page; every page hidden lists all and shows the note
- [ ] T029 [US3] Run `npm run docs:config` and commit the regenerated reference and JSON Schema

**Checkpoint**: all three stories work independently.

---

## Phase 6: Polish & cross-cutting

- [ ] T030 [P] Update `project-docs/CONFIGURATION.md`: Phase C items 8 done (tabs, docs link, hidden), draft explicitly deferred, section 4's draft shape matches the built keys (`docs: { url, label }`, `settings.tabs`, `header.docs`, `header.hidden`)
- [ ] T031 [P] Update `project-docs/GRAMMAR.md` (the `header:` block: `docs`, `hidden`) and `CLAUDE.md` (config keys, the sidebar docs link, the hidden rule, the new `src/config/viewer.ts` and `pages.ts`); add a "067 viewer-facing settings" entry to `project-docs/IMPLEMENTATION-HISTORY.md`
- [ ] T032 Confirm FR-015 (no new key set, nothing changes): `npx tsc --noEmit`, `npx vitest run`, then the full Playwright run (`npx playwright test --reporter=line`); compare failures with the known ones in `CLAUDE.md` (`realDemo.spec.ts:19` and `:39`, load flakes) and re-run any other with `--workers=1` first
- [ ] T033 Walk `quickstart.md` by hand (steps 2 to 6 against the dev server and `npm run check`) and note the result at its foot
- [ ] T034 Rebuild `docs/` with `npm run build:pages` only after the user asks

---

## Dependencies and order

- Phase 1 → Phase 2 → the stories. T003 follows T002; T004 to T006 follow their module.
- **US1** depends on Phase 2 (T007 needs T002/T003/T005). T008 and T009 are independent of the rest. T011 needs T010; T012 needs T011; T013 needs T007.
- **US2** depends on Phase 2 only (and shares `src/config/viewer.ts` with US1: T017 edits the file T008 creates, so run them in order or create the file once).
- **US3** depends on Phase 2 only; T025 and T026 edit files US1 also edits (`floatingNav.tsx`, `shell.tsx`), so do them after T011 and T012 or merge carefully.
- Polish depends on the stories you ship.
- The three stories can otherwise proceed in any order after Phase 2; US1 is the MVP.

## Parallel examples

- Phase 2: T004, T005, T006 once T003 is done.
- US1: T008 and T009 together; T014 once T012 is done.
- US2: T017 alongside T016.
- US3: T024 alongside T023; T028 once T026 is done.
- Polish: T030 and T031 together.

## Implementation strategy

1. **MVP = Phase 1 + 2 + US1**: the documentation link works, safely, and the generated reference knows it. Stop and verify with quickstart steps 2 and 3.
2. Add **US2**, then **US3**, each ending with the regenerated reference.
3. Polish, then merge to `main` when asked; rebuild `docs/` only when asked.

## Notes

- `CONFIG-REFERENCE.md` and `dashboard-config.schema.json` are generated; never hand-edit them (`npm run docs:config`).
- Nothing is built for `draft` (deferred, nothing reserved).
- The `src/config` modules must stay pure; a Node `check` run is the quick proof that they are.
- Shell note: heredocs containing apostrophes break in the Bash tool here; write files with the Write tool.
