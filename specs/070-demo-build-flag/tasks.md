---

description: "Task list for 070 Demo content only when asked for"
---

# Tasks: Demo content only when asked for

**Input**: Design documents from `/specs/070-demo-build-flag/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/demo-flag.md, quickstart.md

**Tests**: Included. Unit tests for each pure rule (first-run decision, plugin removal rule, `loadSite` with and without the demo root), build checks for the output contents, and a Playwright spec for the first-run screen on a normal build.

**Organization**: Grouped by user story. Foundational work makes the flag exist and keeps the demo mode identical to today, so every story starts from a green suite.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 a normal build has no demo, US2 first-run screen, US3 demo one switch away, US4 `check` on any folder

## Path Conventions

Single web-app project: `src/`, `scripts/`, `tests/`, `project-docs/` at the repository root. `src/config/` is not touched (the flag is a build choice, not a schema setting). The demo content folders under `public/` are never edited (FR-012).

---

## Phase 1: Setup

- [X] T001 Confirm the baseline on branch `070-demo-build-flag`: `npx tsc --noEmit` and `npx vitest run` are green. Record the "before" numbers for later comparison in a scratch note: run `npm run build` into a temp folder (`npx vite build --outDir <scratchpad>/before-dist --emptyOutDir`), then list its top-level entries and `du -sh` it, and list `docs/` top-level entries (expected: four `demo-*` folders in both, about 12 MB of them)

---

## Phase 2: Foundational (blocks all stories; the demo behaves exactly as today after it)

**Purpose**: the one constant and the two scripts that set it.

- [X] T002 `vite.config.ts`: change `defineConfig({...})` to `defineConfig(({ command, mode }) => ({...}))`; `const demo = command === 'serve' || mode === 'demo'`; add `define: { 'import.meta.env.VITE_WFTDM_DEMO': JSON.stringify(demo ? '1' : '') }`; keep every existing option (base, plugins, worker, alias, build, server) unchanged; pass `{ demo }` to the plugins that need it in later tasks (leave the call sites ready). `package.json`: `build:pages` becomes `tsc --noEmit && vite build --mode demo --outDir docs --emptyOutDir`; add `build:demo`: `tsc --noEmit && vite build --mode demo`. Add the env type to the Vite env declaration file (`src/vite-env.d.ts`, or create `src/env.d.ts`) as `readonly VITE_WFTDM_DEMO?: string`
- [X] T003 Create `src/services/demoContent.ts`: `export const DEMO_CONTENT: boolean = import.meta.env.VITE_WFTDM_DEMO === '1'` with a short comment (what it gates, where it is set, that vitest reads it as false). Confirm with `npx tsc --noEmit`

**Checkpoint**: `npx tsc --noEmit` clean; `npm run dev` still starts (the constant is not used yet).

---

## Phase 3: User Story 1 - A normal build has no demo (Priority: P1) MVP

**Goal**: a build without the flag contains no demo files and the app uses no demo root, setting, run or geometry.

**Independent Test**: build without the flag with a small deployment folder; only the deployer's title, page and run appear; `dist/` has no `demo-*`.

- [X] T004 [P] [US1] Create `scripts/viteDemoContentPlugin.ts`: `demoContentPlugin({ demo })` (`apply: 'build'`) with a pure exported helper `demoFolders(entries: string[]): string[]` (names starting `demo-`) and a `closeBundle` hook that, when `demo` is false, deletes each such folder under the resolved `build.outDir` (never anything else); register it in `vite.config.ts`. Unit test `tests/unit/demoContentPlugin.test.ts`: the helper picks only `demo-*`, keeps `assets`, `basemap`, `index.html`, `demonstration` is NOT removed (the rule is the `demo-` prefix with a hyphen), and the plugin is a no-op when `demo` is true (test the hook against a temp directory)
- [X] T005 [US1] `src/services/siteConfig.ts`: `loadSite(deploymentUrl, demoUrl)` reads the demo root only when `DEMO_CONTENT` (default the demo URL to `undefined` otherwise; an explicit argument still wins, so tests can pass it); with the demo off the settings are the deployment's alone and `pageSources` has one entry; the missing-file message becomes `no site configuration was found` (drop "showing defaults") when no site file exists. Unit test `tests/unit/siteConfigDemo.test.ts` with a mocked `fetch`: deployment only gives the deployment's values and pages; with an explicit demo URL the demo fills the gaps and its pages follow (today's behaviour); neither gives the missing-file problem; an unrelated key of the demo never appears without the demo URL
- [X] T006 [P] [US1] `src/services/scenarioDiscovery.ts`: call `registerDemoScenarios()` only when `DEMO_CONTENT` (the three groups keep their order). No demo request is made otherwise
- [X] T007 [P] [US1] `src/panels/zoneGeometry.ts` and `src/charts/lib/mapGeometry.ts`: the retry against `demo-geometry/` only when `DEMO_CONTENT`; add `resolveRailUrl(file)` (`demo-geometry/<file>` when on, `geometry/<file>` when off) and use it in `loadRail`. Keep `resolveDemoGeometryUrl` exported for the demo path. Extend an existing unit test or add `tests/unit/resolveGeometry.test.ts` for the two URL rules
- [X] T008 [P] [US1] `scripts/viteBootSkeletonPlugin.ts`: accept `{ demo }`; read `public/demo-dashboard-config` only when on (otherwise an empty root), so the skeleton tabs and the assistant button come from the deployment's folder alone. Wire the option in `vite.config.ts`. Extend `tests/unit/` skeleton test if one exists (search for `viteBootSkeleton`), else a small test of the tab concatenation with the flag off
- [X] T009 [US1] Verify a normal build: `npm run build` into a scratch folder with no `public/dashboard-config`; assert the output has no `demo-*` folder (`ls`), is about 12 MB smaller than the T001 "before" size, and `grep -r "demo-scenarios\|demo-dashboard-config\|demo-geometry" <outDir>/assets` finds nothing (dead code removed). If a path still appears, find the code that keeps it and gate it on `DEMO_CONTENT`. Record the numbers

**Checkpoint**: US1 works alone; the dev server and demo mode are unchanged.

---

## Phase 4: User Story 2 - First-run screen (Priority: P1) MVP

**Goal**: with no site file, or a site file with no pages, a normal build shows what is missing and what to do, with no console error and no demo content.

**Independent Test**: serve a normal build with no deployment folder; the first-run screen appears; the network log has no `demo-` request.

- [X] T010 [P] [US2] Create `src/services/firstRun.ts` (pure): `firstRunState({ siteFound, pageCount, searched }): { kind: 'no_site' | 'no_pages'; searched: string; message: string; hint: string } | null` per data-model.md (null when `pageCount > 0`). Unit test `tests/unit/firstRun.test.ts`: the three cases, the folder echoed, no HTML in the text
- [X] T011 [P] [US2] Create `src/layout/firstRun.tsx`: a small centred screen (title, the message, the folder searched, a list of next steps: add `dashboard-config.yaml` listing pages; or try the demo with `npm run build:demo`), using the existing tokens and `components/ui` primitives, no new colours; works in light and dark; `role="status"`, a `data-testid="first-run"`
- [X] T012 [US2] `src/main.tsx`: after loading the site and pages, `firstRunState(...)` decides; when it returns a state, render `FirstRun` instead of `Shell` (skip the later seeding that needs pages if it would throw), without throwing. `loadSite` exposes whether the deployment site file was found (add `siteFound` and the searched folder to `Site`), reused from `loadSiteRoot`'s `found`. A page that fails to parse keeps today's per-file console error and the app renders what parsed
- [X] T013 [US2] Playwright `tests/integration/firstRun.spec.ts` on a normal build: add a small server setup (a script `scripts/firstRunServer.ts` or a `globalSetup` helper) that builds with `vite build --outDir test-results/firstrun-dist --emptyOutDir`, removes `dashboard-config` from that output so no deployment folder exists, and serves it with `vite preview --outDir test-results/firstrun-dist --port 5197`; the spec opens it and asserts the first-run text and folder, `data-testid="first-run"`, no `pageerror`, no console error, and no request whose URL contains `demo-`. Register the server and a `firstrun` project in `playwright.config.js` without changing the existing three projects. A second case: a `dashboard-config.yaml` with `pages: []` placed in that output gives the "lists no pages" message

**Checkpoint**: US1 and US2 together are the MVP (a normal build is neutral and says so).

---

## Phase 5: User Story 3 - The demo is one switch away (Priority: P2)

**Goal**: the Pages build, the dev server and every test project still show the demo, exactly as before.

**Independent Test**: the Pages output has the same files and the same behaviour as `docs/`; the existing Playwright suites pass.

- [X] T014 [US3] Build `npm run build:demo` into a scratch folder and compare with `docs/`: the same top-level entries (all four `demo-*` folders, `index.html`, `assets`, service worker, basemap), the demo content files byte-identical to `public/demo-*`; only `assets/*` hash names and the bundle may differ. Do not touch `docs/` (the rebuild waits for the user's request)
- [X] T015 [US3] Confirm the demo mode in the browser: `npm run dev`, open it, check the demo title, tabs and runs appear and the first-run screen does not; run `npx playwright test --project=real tests/integration/realDemo.spec.ts tests/integration/exploreBuilderSite.spec.ts` and one spec from each of `chromium` and `redesign`; compare with the known flakes in CLAUDE.md (re-run a failure with `--workers=1`)

---

## Phase 6: User Story 4 - `check` on any folder (Priority: P3)

**Goal**: `npm run check` is unaffected by the flag.

**Independent Test**: `check` gives its old results on the demo folder and on a small deployer folder.

- [X] T016 [US4] Run `npm run check -- public/demo-dashboard-config` (clean) and on a scratch folder with one deliberate mistake (reports only that folder's problem, exit 1) with the flag off (the default for `vite-node`); the existing `tests/unit/configCheck.test.ts` still passes. No code change is expected; if `scripts/check-config.ts` fails because `import.meta.env.VITE_WFTDM_DEMO` is undefined, make `DEMO_CONTENT` read it safely

---

## Phase 7: Polish and cross-cutting

- [ ] T017 [P] Docs: `project-docs/CONFIGURATION.md` (Phase A step 1 done: what the flag is, the scripts, that demo fallbacks are gone; section 2 table "Demo content is always mixed in" resolved; section 7 decision), `CLAUDE.md` (the Deployment section: `build` vs `build:demo` vs `build:pages`; the dev server is always the demo; a normal build has no demo; first-run screen), `project-docs/IMPLEMENTATION-HISTORY.md` ("070 Demo content only when asked for": mode plus define, the post-copy removal, the geometry change, the first-run screen, gotchas such as vitest reading the flag as off), `README`/deployment notes if they say how to build, and the `Makefile` comment on `build`
- [ ] T018 `npx tsc --noEmit`; `npx vitest run`; `npm run docs:config` (no schema change, so no diff expected)
- [ ] T019 Full Playwright run (`npx playwright test`) including the new `firstrun` project; compare failures with the known flakes in CLAUDE.md and re-run each alone with `--workers=1` before treating it as real
- [ ] T020 Walk `quickstart.md` and record the result at its foot (sizes before and after, the grep result, the first-run screenshot path)
- [ ] T021 Rebuild `docs/` with `npm run build:pages` (only when the user asks; not part of the implementation)

---

## Dependencies and Order

- Phase 1, then Phase 2 (T002 then T003).
- US1 (Phase 3) needs Phase 2. T004, T006, T007, T008 touch different files and can run together; T005 is on its own file too, but T009 needs all of them.
- US2 (Phase 4) needs T005 (the site-found information) and T003; T010 and T011 can start right after Phase 2.
- US3 and US4 verify; they need US1 and the build scripts.
- Polish after the stories. T021 only on request.

## Parallel example (US1)

T004, T006, T007 and T008 (four different files), then T005 and T009.

## MVP

Phases 1 and 2 plus US1 and US2 (T001 to T013): a normal build is neutral and says so when empty. Stop at the US2 checkpoint if asked; US3 and US4 are verification, and polish is last.
