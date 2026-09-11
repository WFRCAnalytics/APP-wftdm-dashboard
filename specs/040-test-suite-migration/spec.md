# Feature Specification: Migrate the test suite from synthetic fixtures to real demo-dashboard-config content

**Feature Branch**: `040-test-suite-migration`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "Migrate the test suite from synthetic fixtures to real demo-dashboard-config content — remove `tests/fixtures/dashboard-config/` entirely and migrate every test that depends on it to test against `public/demo-dashboard-config/`'s real, seven-tab ActivitySim content. Preserve error/edge-case coverage via a new, test-only `dashboard-8-test.yaml`. `tests/fixtures/generate.py`'s fate to be determined by research."

---

## Pre-Specification Research Findings

The feature description required a real, itemized audit before requirements could be written. All findings below were confirmed by direct inspection of the current working tree (not estimated).

### RF-1: The current fixture mechanism

`tests/fixtures/dashboard-config/` contains **5 files**:

| File | Size | Tab (`header.tab`) | Role |
|---|---|---|---|
| `dashboard-1-summary.yaml` | 41 KB | `Summary` | The main test dashboard — one row per panel type, ~30 happy-path panels **and** ~20 deliberately-broken panels |
| `dashboard-2-detail.yaml` | 11 KB | `Detail` | Second tab — graphic-walker + a few broken panels + metric-strip valuebox row |
| `dashboard-3-basemaps.yaml` | 15 KB | `Basemaps` | Bespoke basemap precedence/composition matrix (panel/tab/global/app-default, raster presets, UGRC compositions, **unreachable/broken basemaps**) |
| `dashboard-4-sidebar-demo.yaml` | 828 B | `Explore Fixture` | Full-page chromeless-panel test tab — **not in `index.json`**, added by specs that rewrite `index.json` at runtime |
| `index.json` | 484 B | — | Lists dashboards 1–3; `title: "Fixture Test Dashboard"`; data-URI logos |

**Delivery into the running app** (three code paths, all must be redesigned):

1. `tests/global-setup.js` — before every Playwright run, `cpSync`s `tests/fixtures/{observed,scenarios,dashboard-config,geometry}` and `all-placeholders-config.yaml` into `public/`, **and** blanks `public/demo-scenarios/index.json` + `public/demo-dashboard-config/index.json` to `[]` so the real demo content is *not* discovered during tests.
2. `tests/global-teardown.js` — the exact inverse: `rmSync`s the copied `public/` dirs, restores the two blanked demo `index.json` files from `*.original-during-tests` backups.
3. `scripts/copy-fixtures.js` (`npm run dev:fixtures`) — the same copy-in, for a manual `npm run dev` check.

Plus `tests/integration/_sharedFixtureLock.ts` — a cross-worker-process lock file guarding the 5 specs that additionally rewrite a shared `index.json` in their own `beforeAll`/`afterAll`.

### RF-2: Test-file audit — all 25 integration spec files

Coupling to the fixture content, by count of references to the synthetic scenario names (`good_scenario` / `broken_scenario`), the fixture `dashboard-config` path, and `tests/fixtures/` in general:

| Spec file | `good_scenario` | `broken_scenario` | dash-config path | Category | Migration target |
|---|---|---|---|---|---|
| `settingsModal.spec.ts` | 69 | 31 | 0 | **(mixed, largest)** | demo scenarios + `dashboard-8-test.yaml` |
| `scenarioManager.spec.ts` | 29 | 0 | 1 | scenario-manager | demo scenarios (local-folder-load path largely unaffected) |
| `scenarioColorOverride.spec.ts` | 27 | 0 | 2 | scenario-manager | demo scenarios + real manifest colors |
| `graphicWalkerPanel.spec.ts` | 21 | 0 | 2 | panel-mechanic + (b) | demo dataset + `dashboard-8-test.yaml` for no-match/broken |
| `scenarioLabelDisplay.spec.ts` | 16 | 0 | 1 | scenario-manager | demo scenarios + real `display_name` |
| `boot.spec.ts` | 13 | 3 | 0 | boot/discovery | demo `index.json` + `all-placeholders-config.yaml` (see RF-4) |
| `scenarioAutoActivation.spec.ts` | 12 | 7 | 0 | scenario-manager + (b) | demo scenarios + `observed`(failed) + `dashboard-8-test.yaml` |
| `switchControlsUnpinnedPanels.spec.ts` | 12 | 0 | 0 | scenario-manager | demo scenarios + an unpinned demo panel |
| `dashboardShell.spec.ts` | 1 | 0 | 11 | shell/nav | demo tabs; drops the `index.json`-rewrite dance |
| `zonemapPanel.spec.ts` | 5 | 0 | 2 | panel-mechanic + (b) | demo `dashboard-6-network.yaml` zonemap + `dashboard-8-test.yaml` for unreachable basemap |
| `tablePanel.spec.ts` | 7 | 0 | 2 | panel-mechanic | a real demo `table` panel + real column values |
| `valueBoxPanel.spec.ts` | 4 | 0 | 2 | panel-mechanic | real demo `valuebox` + real KPI values (RF-5) |
| `observablePlotPanel.spec.ts` | 3 | 0 | 2 | panel-mechanic + (b) | demo `observable-plot` + `dashboard-8-test.yaml` |
| `rechartsPanel.spec.ts` | 2 | 0 | 2 | panel-mechanic + (b) | demo `recharts` + `dashboard-8-test.yaml` for invalid `chart_type` |
| `flowmapPanel.spec.ts` | 1 | 0 | 2 | panel-mechanic + (b) | demo `dashboard-6-network.yaml` flowmap + `dashboard-8-test.yaml` for basemap-precedence/broken-composition |
| `sankeyPanel.spec.ts` | 1 | 0 | 2 | panel-mechanic + (b) | demo `dashboard-4-mode-choice.yaml` sankey + `dashboard-8-test.yaml` |
| `markdownPanel.spec.ts` | 0 | 0 | 2 | panel-mechanic + (b) | demo `markdown` panels + `dashboard-8-test.yaml` for XSS/empty/whitespace |
| `sidebarNav.spec.ts` | 0 | 0 | 5 | shell/nav | demo tabs + demo `sections:` |
| `sectionSubNav.spec.ts` | 0 | 0 | 1 | shell/nav | demo `sections:` (already real in demo `dashboard-2`/`3`/`5`/`6`) |
| `fullPagePanel.spec.ts` | 0 | 0 | 3 | shell/nav | demo `dashboard-7-explore.yaml` (already `full_page: true`) |
| `metricStrip.spec.ts` | 0 | 0 | 0 | shell/nav | a real all-`valuebox` demo row + a real mixed row (couples via `data-testid="row_kpis"`/`row_chart"`) |
| `panelExpand.spec.ts` | 0 | 0 | 1 | panel-mechanic | any expandable demo panel |
| `demoContentAllPanels.spec.ts` | 1 | 0 | 8 | **already demo-based** | light touch — it currently `page.route()`s fixture endpoints to 404; simplifies once the fixture is gone |
| `demoMultiScenario.spec.ts` | 0 | 0 | 2 | **already demo-based** | same as above |
| `formInputPrimitives.spec.ts` | 0 | 0 | 0 | **independent** | **no change** — tests `demo.html`, not any dashboard |

**Every reference vector, not just paths:** tests couple to the fixture via scenario name, tab name (`Summary`/`Detail`/`Basemaps`/`Explore Fixture`), panel title (`Total Households`, `Broken Panel (intentional)`, `Flowmap Tab Default Basemap`, …), row `data-testid` (`row_kpis`, `row_chart`, …), **and specific synthetic data values** (`1500` households, `9200` trips, from `generate.py`'s `SUMMARY_KPIS_ROWS`).

**Net: 24 of 25 spec files require real changes.** Only `formInputPrimitives.spec.ts` is genuinely independent.

### RF-3: Category (b) — the deliberately-broken panels that move to `dashboard-8-test.yaml`

~25 "(intentional)" panels exist across the 3 fixture dashboards. Every one is a **config-shape error**, not a data-value error:

- Panel `metric:` names a table no scenario publishes → Catalog Error (`Broken Panel`, `Broken Table Panel`, `Sankey/Flow Map/Zone Map/Recharts/Observable Plot Broken Panel`).
- `chart_type: <not bar/line/area>` → runtime validation error (`Recharts Invalid Chart Type`).
- `basemap: totally-made-up-preset-name` → blank-style fallback (`Flowmap/Zone Map Unreachable Basemap`).
- A composition `layers:` entry pointing at an unreachable URL (`Flowmap Broken Composition Layer`).
- A `graphic-walker` `dataset:` no scenario publishes (`Explore Panel Broken`, `… (Dataset Picker, No Match)`).
- `markdown` `content:` that is an XSS payload / empty / whitespace-only.
- `valuebox` `sparkline`/`baseline_trend` referencing a missing metric or resolving to a same-scenario no-op.
- `comparison: diff` whose `a`/`b` names an unresolvable scenario.
- A filter value matching zero rows → empty-state (`Recharts Empty Result`, `Free-form Visual Analytics Empty`).

All of these can be expressed with this app's **existing** panel/scenario grammar against the **real** demo metrics/scenarios. None require malformed data that real ActivitySim output lacks.

### RF-4: `tests/fixtures/generate.py`'s fate (research item 2)

`generate.py` produces: `observed/` Parquet, `scenarios/good_scenario/` Parquet, `scenarios/broken_scenario/` (deliberately missing `summary/index.json` → a `failed` scenario), `geometry/*.geoparquet`, and `all-placeholders-config.yaml`.

Concrete assessment against `dashboard-8-test.yaml`'s needs (RF-3):

- **`good_scenario` Parquet → dead.** The 3 real demo scenarios replace it. No `dashboard-8-test.yaml` panel needs it.
- **`broken_scenario` → replaceable by `observed`.** In a plain checkout the demo's `observed` already registers `failed` (no `public/observed/` content). Feature 038 established a `failed` scenario "poisons nothing." A test needing "a scenario that failed to register" can assert against `observed`.
- **`geometry/*.geoparquet` → dead.** `public/demo-geometry/taz25.geoparquet` is real, git-tracked, and already used by demo `dashboard-6-network.yaml`'s zonemap panels.
- **`observed/` Parquet → decision required (see Q1).** Today it is copied in so `observed` is `ready`/pre-loaded/deselectable during tests. If dropped, `observed` is `failed` during tests (matching production), and every test asserting `observed:ready` must be rewritten.
- **`all-placeholders-config.yaml` → keep, but it is not part of `dashboard-config/`.** It is a standalone config-grammar artifact used only by `boot.spec.ts:137` (`yamlLoader.loadConfig(...)`). It is hand-authorable; it does not require Parquet.

**Provisional conclusion:** if Q1 resolves to "`observed` goes `failed` in tests," then `generate.py`'s **Parquet generation is entirely dead** and the file reduces to (or is replaced by) a hand-maintained `all-placeholders-config.yaml`. If Q1 resolves to "keep a minimal `observed`," a small slice of `generate.py` survives. The plan phase confirms.

### RF-5: Real demo-content values migrated tests will assert against (research item 4)

Read directly from `public/demo-scenarios/*/summary/summary_kpis.parquet` and the manifests:

| | `activitysim-baseline` | `activitysim-density-variant` | `activitysim-transit-variant` |
|---|---|---|---|
| `display_name` | ActivitySim Baseline | ActivitySim: TAZ 1 Density +40% | ActivitySim: AM/PM Transit Service Increase |
| manifest `color` | `#59A14F` | `#BAB0AC` | `#FF9DA7` |
| `total_households` | 5000 | 5000 | 5000 |
| `total_persons` | 8212 | 8212 | 8212 |
| `total_trips` | 23583 | 23583 | 23599 |
| `total_tours` | 9806 | 9807 | 9811 |
| `total_vmt` | 15212.34 (shows `15,212`) | 15293.18 | 15241.33 |
| `trips_per_household` | 4.7166 | 4.7166 | 4.7198 |

`trip_mode_share.parquet` columns: `major_trip_mode` (HOV / Transit / Non-Motorized / SOV / Ride Hail), `trips`, `share` — 5 rows. **Note:** these differ from the old `good_scenario` fixture shape (`purpose`/`mode`/`share`).

**Constraint for the plan:** the three demo scenarios' headline KPIs are near-identical (households/persons identical; trips/tours/VMT within ~0.5 %). Tests that need a *visible* cross-scenario difference must target a metric where the variants actually diverge (e.g. `land_use_summary` for TAZ 1 under the density variant; `mode_share_by_period` WALK_LOC under the transit variant), not a headline KPI.

### RF-6: Honest scope estimate & proposed phasing (research item 5)

This is a **large** rewrite — ~24 spec files, several 500–1500 lines. Proposed order (also the User Story priority order below):

- **Phase 0 — foundation (blocking):** author `dashboard-8-test.yaml` and add it permanently to `index.json`; redesign `global-setup.js` / `global-teardown.js` / `copy-fixtures.js`; resolve `observed` + `generate.py`; delete `tests/fixtures/dashboard-config/`.
- **Phase 1 — panel-mechanic specs (MVP):** the 10 single-panel-type specs + the 2 already-demo-based specs. Mechanical; proves the migration pattern.
- **Phase 2 — shell/nav specs:** `dashboardShell`, `sidebarNav`, `sectionSubNav`, `fullPagePanel`, `metricStrip`, `boot`.
- **Phase 3 — scenario-manager family:** `scenarioManager`, `scenarioColorOverride`, `scenarioLabelDisplay`, `scenarioAutoActivation`, `switchControlsUnpinnedPanels`, and last of all `settingsModal` (the single largest, ~100 fixture references).

---

## Clarifications

### Session 2026-09-10

- Q1: Should the test suite keep a synthetic `observed` dataset (so `observed` is `ready`/pre-loaded during tests), or drop it so `observed` registers `failed` during tests exactly as it does in the real deployed demo? → A: **Drop it — `observed` registers `failed` in tests, matching production.** `generate.py`'s Parquet generation becomes entirely dead; every test asserting `observed:ready`/pre-loaded is rewritten to expect `failed` (or to activate a real demo scenario instead). This maximizes "tests exercise what real users get."
- Q2: What is `tests/fixtures/generate.py`'s disposition once its Parquet output is dead? → A: **Delete `generate.py` and the `pretest:integration` hook that runs it; relocate the one still-needed artifact, `all-placeholders-config.yaml`, to a hand-maintained `tests/fixtures/all-placeholders-config.yaml` (already its location) kept verbatim.** No generator script remains.
- Q3: Must the full migration land in one PR/branch, or may it land phase-by-phase with a temporarily mixed suite? → A: **Phase-by-phase is allowed and expected**, provided the suite is green after every phase. Phase 0 must not leave `tests/fixtures/dashboard-config/` half-removed; Phases 1–3 each migrate a self-contained group and must pass `npm run test:integration` before the next begins.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A permanent, inconspicuous broken-panel dashboard preserves error-state coverage (Priority: P1)

A maintainer needs somewhere to put deliberately-broken panels (missing metric, invalid `chart_type`, unreachable basemap, XSS markdown, …) so error-state UI stays covered — but a real visitor to `wfrcanalytics.github.io/APP-wftdm-dashboard/` must never see a tab full of broken panels.

**Why this priority**: Everything else depends on this. Error/edge coverage cannot be dropped, and it cannot ship to production. This is the foundational deliverable.

**Independent Test**: Load any build (local dev or the deployed Pages demo) and confirm the sidebar shows seven normal tabs plus an 8th, near-invisible sliver entry (no icon, single-space label) that resolves to `getByRole('tab', { name: 'Test' })` and, when clicked, renders the deliberately-broken panels in their error/empty states.

**Acceptance Scenarios**:

1. **Given** the app is built and served from the production `public/demo-dashboard-config/index.json`, **When** a user opens it, **Then** the sidebar contains the seven real tabs and no `dashboard-8-test.yaml` tab.
2. **Given** a Playwright test run, **When** the app boots, **Then** `dashboard-8-test.yaml` is discoverable as an eighth tab, registered by the same real `index.json`-manipulation mechanism the test harness already uses for demo content (inverted: an entry is *added* for tests instead of demo entries being *hidden* from them).
3. **Given** `dashboard-8-test.yaml`, **When** its panels render, **Then** every previously-covered error/edge case (per RF-3) is reproduced using only this app's existing panel/scenario grammar against the real demo scenarios/metrics — with no synthetic Parquet.
4. **Given** a `dashboard-8-test.yaml` change, **When** the production build runs, **Then** the file is present in the build output (it is git-tracked demo content) but absent from the shipped `index.json`.
5. **Given** the test tab is registered (a Playwright run, or a manual local dev check), **When** the sidebar renders its entry, **Then** the entry shows **no icon glyph and no visible label text** — it never looks like a real, polished navigation item — while still exposing an accessible name ("Test") so keyboard and assistive-technology navigation to it works and `getByRole('tab', { name: 'Test' })` resolves it.

---

### User Story 2 - Panel-type behavior is verified against real ActivitySim panels (Priority: P2)

A maintainer changing a panel component (`table`, `valuebox`, `markdown`, `observable-plot`, `recharts`, `sankey`, `flowmap`, `zonemap`, `graphic-walker`) needs the integration test for that panel type to exercise a **real** demo panel bound to **real** ActivitySim summary data, so a regression that only manifests with real column shapes/values is caught.

**Why this priority**: The largest group of specs, and the clearest win from the migration — synthetic panel shapes were convenient but did not resemble production data. Independently valuable and mechanical.

**Independent Test**: For each panel type, its spec loads the real demo tab that contains that panel type, asserts the panel renders, and asserts at least one concrete value/label derived from the real Parquet (per RF-5).

**Acceptance Scenarios**:

1. **Given** the `valueBoxPanel.spec.ts` migration, **When** it runs, **Then** it asserts against a real demo `valuebox` panel showing a real KPI (e.g. `5,000` households on the Summary tab) — not the retired synthetic `1,500`.
2. **Given** any panel-mechanic spec, **When** it runs, **Then** it contains zero references to `good_scenario`, `broken_scenario`, or `tests/fixtures/dashboard-config/`.
3. **Given** a panel-type spec that also covered an error case (e.g. `recharts` invalid `chart_type`), **When** migrated, **Then** the happy-path assertions target a real demo panel and the error-case assertions target a `dashboard-8-test.yaml` panel.
4. **Given** the two already-demo-based specs (`demoContentAllPanels`, `demoMultiScenario`), **When** the fixture is gone, **Then** their `page.route(...→404)` workarounds for fixture endpoints are removed and they still pass.

---

### User Story 3 - Shell, navigation, and boot behavior is verified against the real seven-tab structure (Priority: P3)

A maintainer changing the sidebar, sub-nav accordion, full-page mode, metric-strip layout, or boot sequence needs those specs to assert against the **real** seven-tab demo IA (tab names, `sections:`, `full_page`), not the synthetic three-tab "Summary/Detail/Basemaps" fixture.

**Why this priority**: Medium coupling, medium effort. Depends on Phase 0's `global-setup` redesign (these specs currently rewrite `index.json` themselves).

**Independent Test**: `dashboardShell`/`sidebarNav`/`sectionSubNav`/`fullPagePanel`/`metricStrip`/`boot` each run against the unmodified real demo `index.json` (which now permanently includes the 8th `dashboard-8-test.yaml` entry) and assert real tab names / real section labels / the real `dashboard-7-explore.yaml` full-page tab.

**Acceptance Scenarios**:

1. **Given** the shell/nav specs, **When** migrated, **Then** none of them writes to `public/dashboard-config/index.json` or `public/demo-dashboard-config/index.json` in a `beforeAll`, and `_sharedFixtureLock.ts` is removed or its remaining scope is explicitly justified.
2. **Given** `dashboardShell.spec.ts`'s "exactly N primary tabs" assertion, **When** migrated, **Then** it asserts the seven real tab names in order (plus the eighth test tab during test runs), not "Summary/Detail/Basemaps".
3. **Given** `fullPagePanel.spec.ts`, **When** migrated, **Then** it targets `dashboard-7-explore.yaml` (already `full_page: true`, `icon: compass`) and a deliberately-misconfigured full-page tab lives in `dashboard-8-test.yaml`.
4. **Given** `boot.spec.ts`, **When** migrated, **Then** it asserts the real auto-activated scenario set on a plain boot (the three `ready` demo scenarios; `observed` `failed`), and still exercises `all-placeholders-config.yaml` for the placeholder-grammar path.

---

### User Story 4 - Scenario-manager and Settings behavior is verified against the real demo scenarios (Priority: P4)

A maintainer changing the Scenarios tab, Settings modal, scenario auto-activation, label/color display, or the active/inactive Switch needs those specs to assert against the **real** demo scenarios (`activitysim-baseline` / `-density-variant` / `-transit-variant`, plus a `failed` `observed`) with their **real** `display_name`s and manifest colors.

**Why this priority**: Highest coupling, highest effort, done last. `settingsModal.spec.ts` alone has ~100 fixture references and is the single biggest file.

**Independent Test**: The scenario-manager family runs green against the real demo scenario set with zero `good_scenario`/`broken_scenario` references; error/edge cases (a `failed` registration, an unresolvable baseline diff) assert against `observed` or a `dashboard-8-test.yaml` panel.

**Acceptance Scenarios**:

1. **Given** `settingsModal.spec.ts` / `scenarioManager.spec.ts`, **When** migrated, **Then** every `good_scenario` reference becomes a real demo scenario name and every `broken_scenario` reference becomes `observed` (or a `dashboard-8-test.yaml` construct), with no synthetic-scenario names remaining.
2. **Given** `scenarioColorOverride.spec.ts` / `scenarioLabelDisplay.spec.ts`, **When** migrated, **Then** they assert against the real manifest values from RF-5 (`display_name` "ActivitySim Baseline", color `#59A14F`, etc.).
3. **Given** `scenarioAutoActivation.spec.ts` / `switchControlsUnpinnedPanels.spec.ts`, **When** migrated, **Then** they assert the real auto-activation behavior for `ready` demo scenarios and the `failed` behavior for `observed`, using a real unpinned demo panel to observe the Switch's effect.
4. **Given** the local-folder-load path in `scenarioManager.spec.ts`, **When** migrated, **Then** it is confirmed to already be independent of fixture dashboard content (it loads a `FileSystemDirectoryHandle`), or is adjusted minimally.

---

### User Story 5 - The fixture machinery is fully removed, with no orphaned code (Priority: P5)

A future maintainer reading `tests/` must find no dead references to `tests/fixtures/dashboard-config/`, no half-removed copy-in logic, and no generator script for data that is no longer used.

**Why this priority**: Cleanup/correctness. Trails the migrations but must be complete before the feature is "done" — matches the project's "trace and remove completely, don't leave orphaned code" discipline (feature 012).

**Independent Test**: `grep -r "fixtures/dashboard-config" tests/ scripts/` returns nothing; `tests/fixtures/dashboard-config/` does not exist; `tests/global-setup.js` / `global-teardown.js` / `scripts/copy-fixtures.js` contain no reference to it; `generate.py` and the `pretest:integration` hook are gone (per Q2); `npm run test:integration` passes from a clean checkout with no pre-step.

**Acceptance Scenarios**:

1. **Given** the completed feature, **When** a maintainer greps the repo, **Then** there is no reference to `tests/fixtures/dashboard-config`, `good_scenario`, or `broken_scenario` anywhere under `tests/`.
2. **Given** `global-setup.js` / `global-teardown.js`, **When** read, **Then** they contain only logic that is still needed: adding/removing the `dashboard-8-test.yaml` entry to/from `public/demo-dashboard-config/index.json` (and `all-placeholders-config.yaml` if still copied), with every fixture-copy line removed.
3. **Given** a clean checkout, **When** a developer runs `npm run test:integration` directly, **Then** it succeeds with no `uv run python …` pre-step and no missing-fixture error.
4. **Given** `scripts/copy-fixtures.js` (`npm run dev:fixtures`), **When** the fixture is gone, **Then** the script is removed or repurposed to only add the test tab for a manual `npm run dev` check, and its `package.json` entry is updated or deleted accordingly.

---

### Edge Cases

- **A migrated test needs a visible cross-scenario difference, but the three demo scenarios' headline KPIs are near-identical (RF-5).** → The test must target a metric where the variants genuinely diverge (`land_use_summary` TAZ 1 density; `mode_share_by_period` WALK_LOC transit), or assert on scenario *identity* (name/label/color) rather than value.
- **The eighth test tab collides in tab-count assertions with specs that assert "exactly seven tabs".** → Every tab-count assertion must be written as "seven in production / eight during tests" explicitly, or scoped to named tabs rather than a raw count.
- **A previous test run was killed and left `public/demo-dashboard-config/index.json.original-during-tests` on disk** (the existing fail-loud check). → The redesigned `global-setup.js` must keep an equivalent fail-loud guard for its new inverse operation.
- **Two `npx playwright test` invocations run concurrently against the same working tree** (a hazard this project has hit repeatedly). → If `global-setup` now mutates `public/demo-dashboard-config/index.json` for *every* run, the existing `_sharedFixtureLock` concern may still apply at the global-setup level; the plan must state whether a lock is still needed.
- **`all-placeholders-config.yaml` references grammar (`$inputs`, all placeholder kinds) that must stay valid** as the app's grammar evolves. → It stays a hand-maintained fixture, exercised by `boot.spec.ts`; it is explicitly not migrated into `dashboard-8-test.yaml` (different purpose: config-parse unit-style coverage, not a rendered tab).
- **A `dashboard-8-test.yaml` panel that expects an *empty result* depends on a filter value matching zero real rows.** → Must be verified against the real demo data that the chosen filter value genuinely matches nothing (real data has many real values; a nonexistent purpose/mode string is safe).
- **The 8th tab still needs a non-empty `header.tab` and `header.title`.** → `parseDashboardConfig` throws on an empty string for either. `header.tab` is therefore a literal single space `" "` (length 1 — passes the check), which renders as a barely-visible sliver. `header.title` ("Test / Broken Panels") shows as the content-area `<h1>` once the tab is opened — acceptable, since the tab is now a genuine, permanently-navigable part of the demo.
- **The 8th tab in the sidebar's collapsed icon-only rail.** → With no icon and only a space for a label, the entry is effectively invisible when collapsed — matching `sidebarNav.tsx`'s existing behavior for any icon-less tab. It stays keyboard-reachable via its `aria-label` ("Test").
- **A real user opening the deployed demo now sees an 8th, near-empty sidebar entry.** → Accepted, deliberate trade-off (the design reversal): the entry is a thin sliver with no icon and no readable label, clearly not a real content tab; clicking it reveals the broken-panel test dashboard. Judged preferable to maintaining test-only injection machinery.

## Requirements *(mandatory)*

### Functional Requirements

**Broken-panel dashboard (permanent 8th tab)**

> **Design reversal — 2026-09-10, confirmed directly by the user.** The
> original design made `dashboard-8-test.yaml` invisible in production and
> test-only-injected. That is retired. It is now a **permanent, always-shipped
> 8th entry** in the real `public/demo-dashboard-config/index.json`, present
> in every build (local dev, production, GitHub Pages) — kept out of the way
> purely by a near-invisible sidebar label, not by conditional registration.
> FR-002/FR-003/FR-019–FR-021 below are rewritten accordingly; the retired
> `header.blank_nav` mechanism and the `global-setup.js` injection machinery
> are removed.

- **FR-001**: The system MUST provide `public/demo-dashboard-config/dashboard-8-test.yaml`, git-tracked, authored entirely in this app's existing dashboard/panel/scenario grammar, holding the deliberately-broken and edge-case panels enumerated in RF-3.
- **FR-002**: `dashboard-8-test.yaml` MUST be a permanent, real entry in `public/demo-dashboard-config/index.json` — present in every build (local dev, production, GitHub Pages), never conditionally injected. It is kept unobtrusive for real users by its sidebar rendering (FR-019–FR-021), not by being hidden from the discovery list.
- **FR-003**: No test-run-only registration mechanism MAY exist for `dashboard-8-test.yaml`. `tests/global-setup.js` / `tests/global-teardown.js` MUST NOT add, remove, or restore any `index.json` entry for it, and no dev-only helper script (`scripts/dev-test-tab.js`, `npm run dev:test-tab*`) MAY exist — all such machinery is removed with no orphaned code (the project's "trace and remove completely" precedent, feature 012).
- **FR-004**: Every error/edge case currently covered by a fixture "(intentional)" panel or by `broken_scenario` MUST have an equivalent in `dashboard-8-test.yaml` or an equivalent assertion against the `failed` `observed` scenario — no error-state coverage is lost.
- **FR-005**: `dashboard-8-test.yaml`'s panels MUST NOT require any synthetic Parquet data — they bind to the real demo scenarios/metrics and produce their error/empty states via config shape alone.

**Unobtrusive-but-permanent sidebar rendering of the 8th tab**

- **FR-019**: `dashboard-8-test.yaml`'s sidebar entry MUST be visually inconspicuous among the seven real tabs — `header.tab` is a literal single space `" "` (satisfies `parseDashboardConfig`'s non-empty-string check; renders as a barely-visible sliver, NOT a fully CSS-hidden element), and `header.icon` is omitted entirely (no glyph). It MUST NOT resemble a normal, polished navigation item, but it IS genuinely present and clickable.
- **FR-020**: The entry MUST carry a real, separate accessible name ("Test") via an `aria-label` on the sidebar button, so keyboard/assistive-technology navigation resolves to something meaningful and `getByRole('tab', { name: 'Test' })` works, even though the visible text is only a space. The accessible name is sourced from a new optional `header.aria_label?: string` field — chosen over deriving it (there is no non-space value left to derive from) and over a bespoke labeling system (it is one optional `header` key, parsed fail-soft exactly like `header.icon`/`header.full_page`).
- **FR-021**: The retired `header.blank_nav` boolean field and its `visibility:hidden`-label / forced-no-icon rendering branch in `src/layout/sidebarNav.tsx` MUST be removed entirely. `sidebarNav.tsx`'s only remaining `dashboard-8`-relevant behavior is the generic `aria-label={tab.header.aria_label}` on every sidebar button (undefined ⇒ no attribute, so all seven real tabs are byte-for-byte unaffected).

**Migration of existing tests**

- **FR-006**: Every integration spec that currently depends on `tests/fixtures/dashboard-config/` (all except `formInputPrimitives.spec.ts`, per RF-2) MUST be rewritten to test against `public/demo-dashboard-config/`'s real content or `dashboard-8-test.yaml`.
- **FR-007**: Happy-path assertions MUST use real demo values (RF-5) — e.g. real KPI numbers, real `display_name`s, real manifest colors, real metric column names — not retired synthetic values.
- **FR-008**: No integration spec (except where it is the explicit subject, e.g. a test *of* the harness) MAY reference the names `good_scenario` or `broken_scenario` after migration.
- **FR-009**: Specs that currently rewrite a shared `index.json` in `beforeAll`/`afterAll` MUST stop doing so where Phase 0's centralized registration makes it unnecessary; `_sharedFixtureLock.ts` MUST be removed if it becomes unused, or its remaining necessity documented.
- **FR-010**: The `demoContentAllPanels.spec.ts` / `demoMultiScenario.spec.ts` `page.route(...→404)` workarounds for fixture discovery endpoints MUST be removed once the fixture is gone, and those specs MUST still pass.

**Harness redesign & fixture removal**

- **FR-011**: `tests/fixtures/dashboard-config/` (all 5 files) MUST be deleted.
- **FR-012**: `tests/global-setup.js` and `tests/global-teardown.js` MUST have every line whose sole purpose was the `dashboard-config` copy-in/out removed, with no orphaned variables, imports, or comments — matching the project's "trace and remove completely" precedent.
- **FR-013**: `tests/global-setup.js` MUST stop blanking `public/demo-dashboard-config/index.json` to `[]` (the real demo tabs are now the test target) and instead add the `dashboard-8-test.yaml` entry; `tests/global-teardown.js` MUST restore the original verbatim, keeping a fail-loud guard for a leftover backup from a killed run.
- **FR-014**: `tests/fixtures/generate.py` and the `pretest:integration` npm hook that runs it MUST be deleted (Q1/Q2); `tests/fixtures/all-placeholders-config.yaml` MUST remain as a hand-maintained fixture.
- **FR-015**: `scripts/copy-fixtures.js` (`npm run dev:fixtures`) MUST be removed or repurposed to only register `dashboard-8-test.yaml` for a manual `npm run dev` check, with its `package.json` script entry updated accordingly.
- **FR-016**: Whatever of `tests/fixtures/{observed,scenarios,geometry}` and `all-placeholders-config.yaml` becomes unused after Q1/Q2 MUST be deleted; `observed` fixture Parquet is removed (Q1 — `observed` registers `failed` in tests).

**Delivery discipline**

- **FR-017**: The migration MAY land phase-by-phase (Phase 0 → 1 → 2 → 3, per RF-6), but `npm run test:integration` MUST pass at the end of each phase; Phase 0 MUST NOT leave `tests/fixtures/dashboard-config/` partially removed.
- **FR-018**: After the full feature, `npm run test:integration` MUST pass from a clean checkout with no data-generation pre-step.

### Key Entities *(include if feature involves data)*

- **`dashboard-8-test.yaml`**: A git-tracked dashboard config file under `public/demo-dashboard-config/`, holding only test panels. A **permanent** entry in `index.json`, present in every build. `header.tab` is a single space `" "`, `header.icon` is omitted, `header.aria_label` is `"Test"` — an inconspicuous but genuinely-present 8th sidebar entry (FR-019 – FR-021).
- **`header.aria_label`**: A new optional `string` key on `DashboardTabConfig.header` (`src/layout/types.ts`), parsed fail-soft like `header.icon`. Read only by `src/layout/sidebarNav.tsx`, which sets `aria-label={tab.header.aria_label}` on the sidebar button (undefined ⇒ attribute omitted ⇒ all seven real tabs unaffected). Replaces the retired `header.blank_nav` boolean.
- **Real demo scenarios**: `activitysim-baseline`, `activitysim-density-variant`, `activitysim-transit-variant` — the three `ready` ActivitySim runs (RF-5), plus `observed` which registers `failed` in a plain checkout. The migration's new source of truth for scenario-bound assertions.
- **Fixture dashboard-config**: The retired `tests/fixtures/dashboard-config/` synthetic 3-tab set — deleted by this feature.
- **`all-placeholders-config.yaml`**: A standalone, hand-maintained config-grammar fixture (not a rendered tab), retained for `boot.spec.ts`'s placeholder-parsing coverage.
- **Test harness (`global-setup.js` / `global-teardown.js` / `_sharedFixtureLock.ts` / `copy-fixtures.js`)**: The machinery redesigned to add-rather-than-hide the test tab and to drop all fixture copy-in.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user opening any build sees seven normal sidebar tabs plus one near-invisible 8th sliver entry (no icon, single-space visible label); the 8th never carries an icon or readable label in 100 % of builds.
- **SC-002**: `tests/fixtures/dashboard-config/` no longer exists, and a repo-wide search for that path, `good_scenario`, and `broken_scenario` under `tests/` returns 0 results (except in the harness code that is the explicit subject of a harness test, if any).
- **SC-003**: `npm run test:integration` passes from a clean checkout with **no** `uv run python tests/fixtures/generate.py` or `npm run dev:fixtures` pre-step.
- **SC-004**: 100 % of the error/edge cases catalogued in RF-3 have a passing assertion after migration — no reduction in error-state coverage (verified by mapping each old "(intentional)" panel / `broken_scenario` assertion to its new home).
- **SC-005**: Every migrated spec asserts at least one value or identifier that is provably derived from the real demo Parquet/manifests (RF-5), not a synthetic constant.
- **SC-006**: After each phase (0–3), the full integration suite is green; the feature is not "done" until all four phases are complete and green together.
- **SC-007**: `tests/global-setup.js` + `tests/global-teardown.js` line count decreases (dead copy-in logic removed), and neither file references `dashboard-config`, `generate.py`, or the fixture `scenarios`/`observed`/`geometry` dirs after the feature.
- **SC-008**: In every build, the sidebar has exactly 8 `role="tab"` elements; the 8th has 0 icon glyphs, a visible label that is whitespace-only, and an accessible name of exactly "Test" (`getByRole('tab', { name: 'Test' })` resolves one element); the other 7 keep their real icon and label unchanged from before this feature.

## Assumptions

- The seven real demo tabs in `public/demo-dashboard-config/` are correct and complete as-is; this feature does not touch them (explicit out-of-scope).
- The demo scenario data and pipeline (features 025 / 026 / 031 / 032) are untouched; the three real ActivitySim scenarios and `public/demo-geometry/taz25.geoparquet` are the fixed inputs the tests migrate onto.
- The real `index.json`-manipulation mechanism in `global-setup.js`/`global-teardown.js` (established by 026) is a sound, reusable pattern — this feature inverts its direction, not its approach.
- Playwright runs the whole suite with cross-spec-file parallelism (10 workers observed); any shared-file mutation the redesigned harness performs must be safe under that, or explicitly locked.
- `formInputPrimitives.spec.ts` genuinely has no fixture dependency (confirmed in RF-2) and needs no change.
- The local-folder-load path (`showDirectoryPicker`) exercised by `scenarioManager.spec.ts` is largely independent of dashboard-config fixtures (it registers a `FileSystemDirectoryHandle`), so its migration is small.
- The plan phase will confirm, against the real demo panel inventory, that every panel type has at least one suitable real demo panel for its happy-path spec; if a gap exists (e.g. no real `table` panel with a searchable/paginated shape), the plan documents adding a minimal real panel to an existing demo tab rather than reviving a fixture — but only if genuinely unavoidable and consistent with the out-of-scope constraint.
- The 8th-tab sidebar requirement (FR-019 – FR-021) needs one small, explicit `src/` change — a new optional `header.aria_label` string field in `src/layout/types.ts` plus one line in `src/layout/sidebarNav.tsx` (`aria-label={tab.header.aria_label}` on the sidebar button). The near-invisible label is achieved purely by `header.tab: " "` (a real, valid non-empty string) with no rendering branch at all. This is a deliberate, documented deviation from "no `src/` changes", the same class of decision feature 032 made. It adds one optional key to an existing type, exactly as `030` added `header.icon`/`header.full_page` — not a new config file type. (Supersedes the earlier `header.blank_nav` boolean, now removed.)

## Out of Scope

- Any change to `public/demo-dashboard-config/`'s seven real tabs (content, panels, sections, order).
- Any change to the demo data or the post-processor pipeline (025 / 026 / 031 / 032).
- Any change to `tests/unit/` (Vitest) — this feature is about the Playwright integration suite.
- Adding new *product* features or panel types; `dashboard-8-test.yaml` uses only existing grammar.
- Re-deploying or re-committing the `docs/` GitHub Pages build (a separate concern); this feature's `dashboard-8-test.yaml` must simply be excluded from the shipped `index.json` by the same discipline that already keeps it out.
