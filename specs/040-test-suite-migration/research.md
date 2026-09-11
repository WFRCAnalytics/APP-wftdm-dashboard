# Phase 0 Research: Test-suite migration to real demo content

All findings confirmed by direct inspection of the working tree on 2026-09-10. The pre-spec audit (RF-1 … RF-6 in `spec.md`) is not repeated here; this file resolves the remaining design decisions the plan needs.

---

## D-1: `observed`'s fate in tests → registers `failed` (Q1)

**Decision**: Delete `tests/fixtures/observed/`. Stop copying it into `public/observed/`. In a test run `registerObserved()` fetches `public/observed/summary/index.json`, gets a 404, and `observed` registers with `status: 'failed'` — identical to a plain checkout and to the deployed GitHub Pages demo.

**Rationale**:
- Feature 038 established that a `failed` scenario "poisons nothing" — an unpinned `$scenario` union simply omits it; `getBaseline()` skips it (`status !== 'ready'`).
- The deployed demo already runs this way (`public/observed/` is gitignored, ships empty). Tests asserting `observed: ready` were asserting a state real users never see.
- Removing it makes `generate.py`'s Parquet output fully dead (D-2).

**Migration impact**: every spec asserting `observed` is `ready` / pre-loaded / deselectable is rewritten to expect `failed`, or to use one of the three real `ready` demo scenarios instead. Per RF-2 the concentrated cases are `settingsModal.spec.ts`, `scenarioAutoActivation.spec.ts`, `boot.spec.ts`, `scenarioManager.spec.ts`. A test that specifically needs "a scenario that failed to register" now asserts against `observed` directly (no synthetic `broken_scenario`).

**Alternatives considered**: keep a minimal synthetic `observed/summary/` (2–3 tiny Parquet files) so `observed` stays `ready`. Rejected — it perpetuates a test-only state that contradicts production, and keeps a slice of `generate.py` alive for no coverage gain.

---

## D-2: `generate.py`'s fate → deleted, with `all-placeholders-config.yaml` retained hand-maintained (Q2)

**Decision**: Delete `tests/fixtures/generate.py` **and** the `pretest:integration` npm hook (`"pretest:integration": "uv run python tests/fixtures/generate.py"`). Keep `tests/fixtures/all-placeholders-config.yaml` exactly where it is, as a hand-maintained artifact.

**Rationale** — every output of `generate.py` is now dead or replaced:

| `generate.py` output | Post-migration status |
|---|---|
| `observed/summary/*.parquet` | Dead — `observed` goes `failed` (D-1). |
| `scenarios/good_scenario/summary/*.parquet` | Dead — replaced by the 3 real demo scenarios. |
| `scenarios/broken_scenario/` (deliberately missing `index.json`) | Dead — "a failed registration" is now `observed`. |
| `geometry/*.geoparquet` | Dead — `public/demo-geometry/taz25.geoparquet` is real, git-tracked, already used by demo zonemap panels. |
| `all-placeholders-config.yaml` | **Retained.** Not Parquet, not part of `dashboard-config/`. Only consumer: `boot.spec.ts` (`yamlLoader.loadConfig('/APP-wftdm-dashboard/all-placeholders-config.yaml')`) + `tests/unit/sqlExpander.test.ts`. Hand-authorable; the file already lives at `tests/fixtures/all-placeholders-config.yaml` and is git-tracked. Its header comment (referencing old `.js` spec names) gets a light refresh; content stays.|

**Consequence**: `npm run test:integration` runs with **no** pre-step. `uv` / Python is no longer a test-suite dependency at all (the Python postprocessor tests under `python/tests/` are separate and unaffected).

**Alternatives considered**: keep `generate.py` but strip it to only emit `all-placeholders-config.yaml`. Rejected — a 200-line generator that writes one hand-authorable YAML file is worse than no generator. Q2 explicitly chose full deletion.

---

## D-3: `global-setup.js` / `global-teardown.js` redesign

The current `global-setup.js` does **two** jobs. Post-migration:

### Job A — fixture copy-in → almost entirely removed

Current `copies` array (5 entries) collapses to **one**:

| Copy | Post-migration |
|---|---|
| `tests/fixtures/observed` → `public/observed` | **Removed** (D-1). |
| `tests/fixtures/scenarios` → `public/scenarios` | **Removed** — real demo scenarios are the target. |
| `tests/fixtures/dashboard-config` → `public/dashboard-config` | **Removed** (FR-011). |
| `tests/fixtures/geometry` → `public/geometry` | **Removed** — demo geometry is real. |
| `tests/fixtures/all-placeholders-config.yaml` → `public/all-placeholders-config.yaml` | **Kept** — the one surviving line. `boot.spec.ts` fetches it from the served `public/` root. |

The `existsSync` "Missing fixture directory — run generate.py" guard is reduced to a single check for the one remaining file, with the `generate.py` mention removed.

### Job B — demo `index.json` manipulation → inverted for dashboard-config, dropped for demo-scenarios

| File | Current (026) | Post-migration |
|---|---|---|
| `public/demo-scenarios/index.json` | Blanked to `[]` (hide the 3 real scenarios). | **Left untouched** — the 3 real demo scenarios are now the test scenario set (they auto-activate per 038; `boot.spec.ts` asserts them). |
| `public/demo-dashboard-config/index.json` | Blanked to `[]` (hide the 7 real tabs). | **Mutated in place**: parse JSON, append `"dashboard-8-test.yaml"` to the `dashboards` array, write back. Original saved to `…/index.json.original-during-tests`. `title`/`logoUrl*` fields untouched. |

`global-teardown.js` restores `public/demo-dashboard-config/index.json` verbatim from the `.original-during-tests` backup and deletes the backup; removes the one `public/all-placeholders-config.yaml` copy. It no longer touches `public/demo-scenarios/index.json`, `public/observed`, `public/scenarios`, `public/dashboard-config`, `public/geometry`.

### Fail-loud guard — kept, re-pointed

The existing "`…original-during-tests` already exists → a previous run's teardown didn't fire → stop" check stays, now guarding only `public/demo-dashboard-config/index.json`. Same fail-loud spirit as FR-013 requires.

### Concurrency

`globalSetup` runs **once**, before any worker, and `globalTeardown` **once** after all workers exit (`playwright.config.js` — single `globalSetup`/`globalTeardown`, `fullyParallel: false`, `reuseExistingServer: !CI`). The index.json mutation is therefore not subject to the 10-worker cross-spec-file race that `_sharedFixtureLock.ts` was built for. The only real hazard is **two separate `npx playwright test` invocations against the same tree** — already a known, documented operational hazard this project hits repeatedly — and the `.original-during-tests`-already-exists guard is exactly the fail-loud protection for it. **No lock is needed at the global-setup level.** (This resolves the spec Edge Case "if `global-setup` now mutates `index.json` for every run, is a lock still needed" → No.)

---

## D-4: `_sharedFixtureLock.ts` → deleted

**Decision**: Delete `tests/integration/_sharedFixtureLock.ts` and remove its `beforeAll`/`afterAll` `acquire`/`release` calls from all 5 consumers (`dashboardShell`, `sidebarNav`, `fullPagePanel`, `demoContentAllPanels`, `demoMultiScenario`).

**Rationale**: The lock exists solely because those 5 specs each rewrite a shared `index.json` in their own `beforeAll` to stage a bespoke tab structure. Post-migration:
- `dashboardShell` / `sidebarNav` / `fullPagePanel` assert against the **real** 7-tab (+ 8th test tab) structure that `global-setup` now establishes once, globally — no per-file rewrite.
- `fullPagePanel`'s "deliberately-misconfigured full-page tab" case moves to a **static** panel in `dashboard-8-test.yaml` (a `full_page: true` tab with two panels → `console.warn` + ordinary render), not a runtime rewrite.
- `demoContentAllPanels` / `demoMultiScenario` drop their `page.route(fixture-endpoint → 404)` workarounds (FR-010) and their own `index.json` manipulation — `global-setup` owns that file's test-time state.

If, during implementation, one spec is found to genuinely still need a per-file `index.json` variant that cannot be expressed as a static `dashboard-8-test.yaml` panel, the lock stays for that one spec with a comment (FR-009 escape hatch). Expected outcome: full deletion.

---

## D-5: Panel-type happy-path targets — confirmed, no gap

Direct scan of all 7 real demo `dashboard-*.yaml` files. Every registered panel type has ≥ 1 real demo panel:

| Panel type | Real demo panel (tab · row · title) | Bound metric | Concrete real value/shape a migrated spec can assert |
|---|---|---|---|
| `valuebox` | Summary · KPI strip · "Total Households" etc. (×6) | `summary_kpis` | `5,000` households, `8,212` persons, `15,212` VMT (baseline, RF-5) |
| `plotly` | Trip · `row_trip_scheduling` · "Trip Departure Hour (Work Trips)" (×4 total) | `trip_scheduling` | one `bar` trace per active scenario, `barmode: group` |
| `table` | Mode Choice · "Tour Mode Share by Segment" | `tour_mode_share_summary` (**2738 rows**) | pagination past page 1, sort, search; a prepended `scenario` column |
| `markdown` | Summary / gap-note panels (×5) | — (`content:`) | rendered sanitized HTML |
| `observable-plot` | Trip · `row_trip_destination` · "Trip Destination Distance Distribution" (×5 total) | `trip_destination_summary` | `barY` marks, `fill` = `primary_purpose` |
| `recharts` | Overview / Mode Choice (×2) | real share metric | bars render as `<path class="recharts-rectangle">` (v3) |
| `sankey` | Mode Choice · `purpose_mode_flow` panel | `purpose_mode_flow` | nodes for `primary_purpose` → `major_trip_mode` |
| `flowmap` | Network · `od_flows` panel | `od_flows` | flow lines; base map = OpenFreeMap Positron (post-`APP_DEFAULT` change) |
| `zonemap` | Trip · "SOV Trip Attractions by Zone"; Network (×2) | `trip_ends_by_zone_mode` | 25 zones, `taz25.geoparquet`, `YlOrRd` ramp |
| `graphic-walker` | Person & Households · `person_household_profile` (fixed dataset); Explore · full-page `trip_mode_share` (×2) | those datasets | `<GraphicWalker>` mounts; `dataset_picker` **not** present on either → the picker path is a `dashboard-8-test.yaml` panel |

**Row-count targets for pagination/sort/search** (real, confirmed): `tour_mode_share_summary` 2738, `mandatory_tour_scheduling` 387, `mode_share_by_period` 48, `mandatory_tour_freq_summary` 14, `land_use_summary` 25, `accessibility_summary` 25, `trip_purpose_share` 10, `trip_distance_by_purpose` 10. More than enough > 20-row tables exist; **no fixture revival needed** (satisfies the spec Assumption's contingency).

**Cross-scenario visible-difference targets** (headline KPIs are near-identical, RF-5): `land_use_summary` TAZ 1 under the density variant (`TOTEMP` 27,318 → 38,245); `mode_share_by_period` WALK_LOC AM/PM under the transit variant (19.55 % → 20.56 %). Specs needing a visible diff use these, not `total_trips`.

---

## D-6: `dashboard-8-test.yaml` panel catalog — every RF-3 case, existing grammar only

Each deliberately-broken fixture panel maps to a concrete `dashboard-8-test.yaml` panel bound to a **real** demo scenario/metric, producing its error/empty state through **config shape alone** (FR-005). Full inventory in `contracts/dashboard-8-test.md`. Summary of mechanisms:

| Error/edge class (RF-3) | `dashboard-8-test.yaml` mechanism |
|---|---|
| Missing metric → Catalog Error | `metric: __nonexistent__` on `table` / `plotly` / `sankey` / `flowmap` / `zonemap` / `recharts` / `observable-plot` (one panel each) |
| Invalid `chart_type` | `recharts` panel with `chart_type: pie` |
| Unreachable basemap → blank-style fallback | `flowmap` + `zonemap` panel each with `basemap: totally-made-up-preset-name` |
| Broken composition layer | `flowmap` panel with a `basemap: { layers: [...] }` pointing at an unreachable URL |
| `graphic-walker` bad dataset | one fixed `dataset: __nonexistent__`; one `dataset_picker: true` + `dataset: __nonexistent__` (no-match) |
| Markdown XSS / empty / whitespace | 3 `markdown` panels: `<script>`-bearing `content:`, `content: ""`, `content: "   "` |
| `valuebox` sparkline / baseline_trend missing metric | `valuebox` with `sparkline: { metric: __nonexistent__ }`; `valuebox` with `baseline_trend` `expr` referencing a missing column / resolving same-scenario |
| `comparison: diff` unresolvable a/b | `table` (or `zonemap`) with `comparison: { diff: { a: __nope__, b: __nope__ } }` |
| Zero-row filter → empty state | `recharts` + `graphic-walker` panel each with `filter: { primary_purpose: __no_such_purpose__ }` (verified against real data: no real row has that value) |
| Misconfigured full-page tab | `dashboard-8-test.yaml` itself carries `header.full_page: true` **and** two panels → app `console.warn`s and falls back to ordinary rendering (the `fullPagePanel.spec.ts` misconfiguration case) |
| Basemap precedence matrix | tab-level `default_basemap:` + panels with/without a panel-level `basemap:` to exercise panel > tab > global > app-default resolution |

Real filter sentinel values (e.g. `__no_such_purpose__`) are confirmed absent from the real Parquet before use (spec Edge Case).

---

## D-7: Phasing (RF-6, confirmed) — suite green after each

1. **Phase 0 — foundation (blocking)**: author `dashboard-8-test.yaml`; redesign `global-setup.js` / `global-teardown.js`; delete `generate.py` + `pretest:integration` + `tests/fixtures/{dashboard-config,observed,scenarios,geometry}`; delete `_sharedFixtureLock.ts` (+ deconstruct its 5 call sites); repurpose/remove `copy-fixtures.js` + `dev:fixtures`. Suite must be green (the already-demo-based specs + any spec not yet touched still pass; specs that break are migrated in-phase or in Phase 1 immediately after).
2. **Phase 1 — panel-mechanic specs (MVP)**: the 10 single-panel-type specs + `demoContentAllPanels` + `demoMultiScenario` + `panelExpand`.
3. **Phase 2 — shell/nav specs**: `dashboardShell`, `sidebarNav`, `sectionSubNav`, `fullPagePanel`, `metricStrip`, `boot`.
4. **Phase 3 — scenario-manager family**: `scenarioManager`, `scenarioColorOverride`, `scenarioLabelDisplay`, `scenarioAutoActivation`, `switchControlsUnpinnedPanels`, then `settingsModal` last.

`formInputPrimitives.spec.ts` is untouched throughout.

---

## D-8: Blank sidebar entry for the test tab (FR-019 – FR-021)

**Requirement**: the test tab's sidebar entry must render with no icon glyph and no visible label text, whenever it is registered (Playwright run or a manual local dev check), while keeping a minimal real `aria-label` for keyboard/AT navigation.

**Findings from direct code inspection** (`src/layout/sidebarNav.tsx`, `src/layout/types.ts`, `src/lib/iconComponentFor.ts`, `src/components/ui/sidebar.tsx`):

1. **Missing/empty icon is already graceful.** `sidebarNav.tsx`: `const Icon = tab.header.icon ? iconComponentFor(tab.header.icon) : undefined`; `{Icon && <Icon … />}`. Omitting `header.icon` renders nothing — no empty box, no broken-icon placeholder (the code comment there documents exactly this). `iconComponentFor()` also returns `undefined` for an unresolvable name. **No new "no-icon" handling path is needed** — just omit the field.
2. **`header.tab` cannot be empty.** `parseDashboardConfig()` throws `"missing required header.tab"` when `typeof header.tab !== 'string' || header.tab.length === 0` (same for `header.title`). And `header.tab` IS rendered as visible text: `{state === 'expanded' && <span className="truncate">{tab.header.tab}</span>}`. So a blank entry **cannot** be achieved with an empty value — it must be a render-time treatment while `header.tab` stays a real non-empty string. `header.tab` is sidebar-only; the content-area page heading uses `header.title`.
3. **No `aria-label` today.** `SidebarMenuButton` (`role="tab"`) takes its accessible name from its visible `<span>` text. `SidebarMenuButton`'s own class is `flex w-full … px-2.5 py-2 …` (no fixed height) — so a hidden-but-layout-occupying label keeps normal row height; a childless button would be a thin `py-2`-only strip.

**Decision**: add one optional `header.blank_nav?: boolean`, parsed fail-soft in `parseDashboardConfig()` exactly like `full_page` (`typeof header.blank_nav === 'boolean' ? … : undefined`). In `sidebarNav.tsx`, when `tab.header.blank_nav === true`:
- `Icon` is forced `undefined` (no glyph);
- the `header.tab` label span still renders (in both expanded and collapsed state, for consistent row height) but with `className="truncate invisible"` — `visibility: hidden` keeps the layout box, paints nothing;
- `aria-label={tab.header.tab}` is set on `SidebarMenuButton` — this is what provides the accessible name (`visibility: hidden` text is excluded from the accname computation), so `getByRole('tab', { name: 'Test' })` still resolves exactly one element and keyboard nav still works.

Every real tab is byte-for-byte unaffected: `blank_nav` absent ⇒ `aria-label` stays `undefined`, label stays `truncate`, icon logic unchanged.

**Why a boolean flag, not the requirement's floated `header.ariaLabel` string field**: that design assumed `header.tab` could be empty and `ariaLabel` would fill in. Finding 2 disproves the premise — `header.tab` is always a real non-empty string and is already the label. What's actually needed is a flag that changes *rendering*, not a second label string. A boolean is the minimal fit and cannot drift into a parallel labeling system.

**Scope note**: this is the one `src/` change in an otherwise test-infrastructure feature — a deliberate, documented deviation (plan.md Structure Decision), the same class of call feature 032 made. Two files, ~8 lines, an optional `header` key exactly like `030` added twice.

## Constitution re-check (post-research)

No decision above introduces a new config file type, a new dependency, a framework, `eval`, main-thread DuckDB, or a non-Parquet browser read. `dashboard-8-test.yaml` is a `dashboard-*.yaml` instance (Principle VII — precedent: `dashboard-4-sidebar-demo.yaml`). D-8's `header.blank_nav` is an optional field on an existing type (precedent: `030`'s `header.icon`/`header.full_page`), added in TypeScript to an existing `.ts`/`.tsx` file — no new `.js` in `src/` (Principle I). **PASS, unchanged.**
