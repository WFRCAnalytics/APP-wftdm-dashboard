---

description: "Task list for 011-basemap-style-system"
---

# Tasks: Basemap Style System

**Input**: Design documents from `/specs/011-basemap-style-system/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — this project's established convention (every prior
feature: `003`–`010`) always pairs implementation with Vitest unit tests
for pure logic and Playwright integration tests for real-browser
behavior; `quickstart.md`'s 7 scenarios are the source of truth for the
Playwright tasks below, and `contracts/`'s own test blocks are the source
of truth for the Vitest tasks.

**Organization**: Grouped by user story (spec.md's US1/US2/US3), per this
project's own established task-generation convention.

**One deliberate deviation from strict per-story test isolation**:
`resolveEffectiveBasemap.test.ts` is built as ONE task in the Foundational
phase (T008), not split across US1/US2, because `contracts/resolve-
effective-basemap.md` designed it as a single, indivisible truth-table
contract covering all three precedence levels at once — splitting it
would mean either duplicating the app-default rows in two files or
leaving US1 with an untested implementation until US2 lands. Every other
test task maps to exactly one story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 — Setup/Foundational/Polish tasks carry no story label

## Path Conventions

Single project (existing `src/`/`tests/` layout) — see plan.md's Project
Structure for the full new-file tree.

---

## Phase 1: Setup

**Purpose**: Get the raster-provider data pipeline in place before any
code depends on it (research.md §4).

- [X] T001 Add `leaflet` `^1.9.4` and `leaflet-providers` `^2.0.0` to `package.json`'s `devDependencies` (NOT `dependencies` — research.md §4's Principle VI/III reasoning) per `contracts/basemap-types-and-registry.md`
- [X] T002 [P] Create `scripts/extractLeafletProviders.mjs` per `contracts/basemap-types-and-registry.md` — real `leaflet`/`leaflet-providers` `require()`, no `Function()`/`eval()`. Required two real, run-confirmed fixes beyond the original contract: a `jsdom` shim (Leaflet references `window` at module-load time) and setting `globalThis.L` before importing `leaflet-providers` (its own UMD wrapper's CJS-detection check is a real upstream typo that never fires) — both documented in research.md §4, `jsdom` added as a devDependency.
- [X] T003 Ran `npm install && node scripts/extractLeafletProviders.mjs` — generated `public/basemap/leaflet-providers.json` (36 real providers). Spot-checked: `OpenTopoMap` confirmed `{s}`-in-url with no `options.subdomains` (the regression case). **Found an additional, larger gap while spot-checking**: most practically-useful providers (`CartoDB`, `Esri`, `Stadia`, 21 others) are nested under a parent key with a `variants` object addressed by leaflet's own dotted convention (`"CartoDB.Positron"`), not flat keys — `resolveRasterProvider()`'s design (T017) was corrected accordingly; research.md §4 documents the three real variant-value shapes confirmed (empty object, string, full object).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared resolution pipeline every user story renders
through — types, the pure precedence resolver, the theme-read hook, the
URL-preset happy path, and the one integration point in `FlowMapPanel.tsx`
itself. Nothing in US1/US2/US3 can be meaningfully tested until this
phase renders *something* other than `BLANK_STYLE`.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Create `src/panels/basemap/types.ts` (`BasemapSelection`, `BasemapComposition`, `isBasemapComposition`, `BasemapSource`, `EffectiveBasemap`) per `data-model.md` / `contracts/basemap-types-and-registry.md`
- [X] T005 [P] Create `src/panels/basemap/registry.ts` with `BUILT_IN_PRESETS` (3 CARTO + 5 OpenFreeMap URLs), `APP_DEFAULT_LIGHT`/`APP_DEFAULT_DARK`, `resolveUrlPreset()` per `contracts/basemap-types-and-registry.md`. **Written together with T017's `resolveRasterProvider()`** — the corrected dotted-name/variant-merge design (found necessary while spot-checking T003's real output) was already fully worked out, so splitting it into a stub-then-extend pass across two tasks would have meant shipping a known-wrong flat lookup first.
- [X] T006 [P] Create `src/hooks/useColorScheme.ts` (`MutationObserver` on `document.documentElement`'s `class`, `useSyncExternalStore`) per `contracts/flowmap-panel-basemap-integration.md`
- [X] T007 Create `src/panels/basemap/resolveEffectiveBasemap.ts` (3-level precedence + `basemapKey()`) per `contracts/resolve-effective-basemap.md`
- [X] T008 [P] Write `tests/unit/resolveEffectiveBasemap.test.ts` — full precedence truth table + the `basemapKey` theme-flip stability/instability assertions — 6/6 passing
- [X] T009 Create `src/panels/basemap/loadBasemapStyle.ts` — `BLANK_STYLE` export, `resolvePresetName()` (URL + raster branches, both wired), and `composeStyles()`. **Written together with T026** (composition mechanism was already fully designed in `contracts/load-basemap-style.md`; no reason to stub and revisit).
- [X] T010 Modify `src/layout/types.ts` — added `default_basemap?: BasemapSelection` to `DashboardTabConfig` (+ `parseBasemapSelection()` in `parseDashboardConfig`, needed since that function reconstructs the tab object field-by-field — not in the original contract, found while implementing), `basemap?`/`_tabDefaultBasemap?: BasemapSelection` to `FlowMapPanelConfig`, `MapRenderingPanelConfig` + `isMapRenderingPanel()`
- [X] T011 Modify `src/layout/dashboardRenderer.tsx` — subscribe to `useColorScheme()`, add `withTabDefaultBasemap()` injecting `_tabDefaultBasemap` onto every map-rendering panel's config. Required a `PanelConfig` cast TS's structural typing needed (spreading within a union return position) — confirmed real via `npm run typecheck`, not assumed fine.
- [X] T012 Modify `src/panels/FlowMapPanel.tsx` — added `useColorScheme()` subscription, `effectiveBasemap`/`key` computation, the new basemap-application effect (`loadBasemapStyle` + `map.setStyle(..., { transformStyle })`), the `map.on('error')` fallback listener, and the `__flowmapTestOverlays` test hook. `npm run typecheck` and the full `npm run test:unit` suite (149/149) both green after this phase.

**Checkpoint**: Foundation ready — a flowmap panel with no `basemap:` config now renders a real, theme-paired CARTO basemap instead of `BLANK_STYLE`. User Story 1 work can begin.

---

## Phase 3: User Story 1 - Recognizable basemap by default (Priority: P1) 🎯 MVP

**Goal**: Every flowmap panel renders a real, theme-matched basemap with
zero author configuration, and survives a live theme toggle without
losing its data overlay.

**Independent Test**: Load a dashboard tab with a flowmap panel and no
`basemap:` key. Confirm a real basemap renders, matches the current
theme, and toggling `.dark` on `<html>` swaps it correctly while the flow
lines stay intact.

### Tests for User Story 1

- [X] T013 [P] [US1] Write Playwright test — default basemap renders + re-pairs on a live theme toggle (`quickstart.md` Scenario 1) — PASSING.
- [X] T014 [US1] Write Playwright test — **the `setStyle()`/`MapboxOverlay` empirical survival test** — PASSING (confirmed stable across repeated runs). Required two real fixes beyond the original design, both found by actually running this test, not assumed: (1) a real regression in `dashboardRenderer.tsx` where the tab-default-basemap injection allocated a fresh panel-config object on every render (not just theme-relevant ones), breaking `FlowMapPanel`'s existing config-referential-stability assumption and causing spurious `FlowmapLayer` re-applications on a theme toggle — fixed with `useMemo` keyed on `tab` alone; (2) `research.md` §1's own documented contingency was NOT needed — the empirical test passed against the plain non-interleaved `MapboxOverlay` pattern once (1) was fixed, confirming the de-risking evidence from `APP-WFRC-Commute-Patterns` held for this project's own pinned versions.
- [X] T015 [US1] Add a deliberately-unreachable-preset fixture panel — added to `tests/fixtures/dashboard-config/dashboard-3-basemaps.yaml` ("Flowmap Unreachable Basemap (intentional)"), not `dashboard-1-summary.yaml` as originally planned — consolidated with the other new basemap-specific fixture panels on the dedicated "Basemaps" tab rather than further overloading the already-large summary fixture.
- [X] T016 [US1] Write Playwright test — an unreachable default/preset basemap falls back to `BLANK_STYLE` while the flow-line overlay still renders — PASSING.

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.

---

## ⛔ GATING CHECKPOINT — read before starting Phase 4/5

T014's empirical survival test **must pass** before any US2/US3 task that
adds more `setStyle()`-triggering config (raster presets, compositions,
pinned overrides) is implemented. If T014 fails, apply `research.md` §1's
documented contingency in `FlowMapPanel.tsx` (explicit
`overlayRef.current.setProps({ layers: [] })` before `setStyle()`,
re-populate inside the post-`style.load` handler) and re-run T014 before
resuming Phase 4/5 — every later story's own basemap-switch tests
(T022, T029) inherit whatever survival guarantee T014 actually
establishes, not the one `research.md` assumed going in.

---

## Phase 4: User Story 2 - Choose a specific named basemap style (Priority: P2)

**Goal**: An author can pin any built-in preset (CARTO/OpenFreeMap/raster)
per panel or per tab, with panel overriding tab overriding the app
default, and a pinned choice never gets silently re-paired on a theme
change.

**Independent Test**: Configure three fixture panels — no override, tab
default only, panel override — and confirm each resolves to the correct
style; toggle theme on the panel-pinned one and confirm it does not
change and `setStyle()` is not called again.

### Tests for User Story 2

- [X] T017 [P] [US2] Add `resolveRasterProvider()` to `src/panels/basemap/registry.ts` — done together with T005 (see its note). Implements the REAL dotted provider/variant lookup (`resolveProviderEntry()`, splitting on `.`, merging one of three real variant shapes) plus the `{s}`/`{r}`/`{variant}` expansion and the confirmed Leaflet-class `'abc'` subdomains default.
- [X] T018 [P] [US2] Write `tests/unit/resolveRasterProvider.test.ts` — rewritten against the real dotted-name/variant catalog shape (string/empty-object/full-object variant cases), the `OpenTopoMap` subdomains-default regression case, the no-`{s}` case, unrecognized-name/variant cases, and a failed-catalog-fetch case. Required a new `__resetProvidersCacheForTests()` test hook in `registry.ts` (found necessary: the module-level catalog cache would otherwise serve an earlier test's success to the fetch-failure test). 8/8 passing.
- [X] T019 [US2] Wire `resolveRasterProvider()` into `loadBasemapStyle.ts`'s `resolvePresetName()` — done together with T009 (already wired, no stub was ever shipped).
- [X] T020 [P] [US2] Add fixture panels + fixture tab exercising panel/tab/app-default precedence — `tests/fixtures/dashboard-config/dashboard-3-basemaps.yaml` (new tab "Basemaps", `default_basemap: openfreemap-bright`; "Flowmap Tab Default Basemap" + "Flowmap Panel Basemap Override" panels).
- [X] T021 [US2] Write Playwright test — three-level precedence resolves correctly — PASSING.
- [X] T022 [US2] Write Playwright test — an explicit pin does NOT re-pair on a theme change, and `setStyle()` is NOT called a second time (spy on the live map instance's own `setStyle` method, not the prototype — simpler and equally direct) — PASSING.
- [X] T023 [P] [US2] Add a raster-provider-preset fixture panel — "Flowmap Raster Provider Preset" (`basemap: OpenTopoMap`, confirmed present in the real extracted catalog) on `dashboard-3-basemaps.yaml`.
- [X] T024 [US2] Write Playwright test — a raster-provider preset renders its tiles correctly as the basemap — PASSING.
- [X] T025 [US2] Update `project-docs/GRAMMAR.md`'s `type: flowmap` section and the `dashboard-*.yaml` top-level-structure section with the real `basemap:`/`default_basemap:` grammar — done, including a new "Basemap style system" subsection covering all three preset categories, the composition shape, and the precedence/theme-repair rules.

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Compose a custom multi-layer basemap (Priority: P3)

**Goal**: A downstream author can stack multiple independently-hosted
style resources into one basemap via config, validated against UGRC's
real 3-layer Vector Lite Base Map without that case ever appearing in the
shipped registry.

**Independent Test**: Configure a fixture panel with UGRC's real
VectorHillshade/LiteBase/LiteLabels URLs and confirm all three render
correctly stacked, with resolved absolute sprite/glyph URLs; configure a
second fixture panel with one deliberately-broken layer URL and confirm
the whole basemap (not a partial composite) falls back to `BLANK_STYLE`.

### Tests for User Story 3

- [X] T026 [US3] Add `composeStyles()` to `src/panels/basemap/loadBasemapStyle.ts` — done together with T009 (see its note): per-layer `fetch()`, relative `sources[*].url`/`sprite`/`glyphs` rewrite against each layer's own URL, `layerN__`-prefixed namespacing, ordered merge.
- [X] T027 [P] [US3] Write `tests/unit/loadBasemapStyle.test.ts` — mocked-`fetch` composition merge/rewrite tests (relative-URL rewrite, id namespacing, whole-composition failure fallback) + URL-preset/raster-preset resolution cases. 5/5 passing.
- [X] T028 [P] [US3] Add the real UGRC composition fixture panel ("Flowmap UGRC Composition", `dashboard-3-basemaps.yaml`) — confirmed the string never appears in `src/panels/basemap/registry.ts` (FR-012). **Two real layers (`LiteBase`+`LiteLabels`), not the originally-planned three** — `VectorHillshade` was found, during implementation, to trigger a genuine `maplibre-gl`-internal PBF-parser incompatibility unrelated to this feature's own code (research.md §7's new finding); documented plainly in the fixture's own comments, quickstart.md, and research.md rather than silently dropped.
- [X] T029 [US3] Write Playwright test — the real UGRC composition renders both layers correctly stacked with genuinely-fetchable resolved sprite/glyph URLs, and **stays stable** (not just non-empty once) — PASSING. This test is what actually surfaced both real bugs documented in research.md §6/§7 (a naive TileJSON `url` resolution and an overly-broad map-lifetime error listener), neither of which any unit test or the plan-phase design caught.
- [X] T030 [P] [US3] Add a fixture panel with a composition containing one deliberately-unreachable layer URL — "Flowmap Broken Composition Layer (intentional)" on `dashboard-3-basemaps.yaml`.
- [X] T031 [US3] Write Playwright test — one broken composition layer falls back the WHOLE basemap to `BLANK_STYLE`, never a partial composite — PASSING.

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T032 [P] Write Playwright test — fully offline (route-block CARTO/OpenFreeMap/OpenTopoMap/`tiles.arcgis.com`/`leaflet-providers.json`) still renders every source category (default, tab default, panel override, raster, composition) on `BLANK_STYLE` with flow lines intact — PASSING.
- [X] T033 [P] Update `CLAUDE.md`'s File structure tree — done (see below).
- [X] T034 [P] Draft a Principle VIII amendment adding `WFRCAnalytics/APP-WFRC-Commute-Patterns` — done (see below); draft only, not merged.
- [X] T035 Full suite green: `npm run typecheck` clean, `npm run test:unit` 162/162, full `npx playwright test` (all spec files, not just this feature's) 122/122 — including a real, pre-existing test (`dashboardShell.spec.ts`'s tab-set assertion) that needed updating for the new fixture tab, found and fixed, not left broken.
- [X] T036 Manually verified against the real dev server throughout implementation (T014's and T029's own real-browser runs against real, un-mocked CARTO/OpenFreeMap/OpenTopoMap/ArcGIS endpoints, re-run repeatedly while diagnosing three real bugs) — this substantially exceeds a single walkthrough; the UGRC composition (adjusted to two real layers, research.md §7) was directly, empirically confirmed rendering correctly, not just assertion-passing.
- [X] T037 [P] Confirmed the plan.md "Known gap this feature does NOT close" is stated plainly in this task list's own completion report below, not left implicit.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup (T009/T012 don't strictly need T003, but T017 in Phase 4 does) — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2/US3.
- **⛔ Gating checkpoint**: T014 must pass (or its documented fallback applied and re-verified) before Phase 4/5 implementation tasks that add more `setStyle()` call sites.
- **User Story 2 (Phase 4)**: Depends on Foundational + the gating checkpoint. Independently testable from US3.
- **User Story 3 (Phase 5)**: Depends on Foundational + the gating checkpoint. Independently testable from US2 — T026 (composeStyles) touches the same file as T019 (raster wiring) but not the same functions; both can proceed in parallel once Foundational is done, gated only by T014.
- **Polish (Phase 6)**: Depends on whichever of US1/US2/US3 are in scope for this delivery (T035/T036 assume all three; T032/T033/T034/T037 do not).

### Within Each User Story

- Fixture additions before the Playwright tests that read them.
- `registry.ts`/`loadBasemapStyle.ts` extensions before the tests that exercise them.
- Unit tests (`[P]`, different files) can run alongside fixture/Playwright work in the same story.

### Parallel Opportunities

- T001/T002 in parallel (different files).
- T004/T005/T006 in parallel (different files, no shared dependency).
- T008 in parallel with T009 (both depend on earlier foundational tasks but not on each other).
- Within US2: T017/T018 pair, then T020/T023 fixture additions, all `[P]`-marked, can proceed alongside each other.
- Within US3: T026 blocks T027/T028's dependents, but T027 (unit test) and T028 (fixture) can be drafted in parallel once T026 lands.
- US2 and US3 implementation work (T017–T025 vs. T026–T031) can proceed in parallel by different people once the gating checkpoint passes — they touch `loadBasemapStyle.ts` in different functions (`resolvePresetName`'s raster branch vs. `composeStyles`), not the same lines.

---

## Parallel Example: Foundational Phase

```bash
# Launch the three independent foundational files together:
Task: "Create src/panels/basemap/types.ts per data-model.md"
Task: "Create src/panels/basemap/registry.ts (CARTO/OpenFreeMap presets) per contracts/basemap-types-and-registry.md"
Task: "Create src/hooks/useColorScheme.ts per contracts/flowmap-panel-basemap-integration.md"
```

## Parallel Example: User Story 2

```bash
Task: "Add resolveRasterProvider() to src/panels/basemap/registry.ts"
Task: "Write tests/unit/resolveRasterProvider.test.ts"
# (both depend on T005 but not on each other's output until T019 wires them together)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. **STOP at T014** — the empirical `setStyle()`/overlay survival test is
   the single highest-value checkpoint in this whole feature; validate it
   for real before treating anything past it as safe to build on.
3. Deploy/demo: every flowmap panel now has a real, theme-aware default
   basemap — the feature's core value — with zero YAML authoring required
   anywhere.

### Incremental Delivery

1. Setup + Foundational → theme-aware default basemap works.
2. US1 → validated, gated, demoable MVP.
3. US2 → authors can pin/override at panel or tab scope; raster catalog live.
4. US3 → the generic composition escape hatch, proven against a real
   multi-source case (UGRC) without ever naming it in the shipped registry.
5. Polish → offline hardening, docs, constitution-reference flag, full
   suite green.

### Parallel Team Strategy

Once Foundational + the T014 gate both pass: one person on US2 (raster
catalog + precedence fixtures), one on US3 (composition mechanism) — they
touch the same two files (`registry.ts`, `loadBasemapStyle.ts`) but
different functions within them, so conflicts are limited to merge
ordering, not logic collisions.

---

## Notes

- `[P]` tasks = different files (or, within `loadBasemapStyle.ts`,
  different functions with no call-graph overlap yet), no blocking dependency.
- Every implementation task cites the exact `contracts/`/`data-model.md`
  section it must match — full-body code already exists there per this
  project's established contract discipline; these tasks are "transcribe
  and adapt to the real codebase state," not "design from scratch."
- Commit after each task or logical group, matching this project's
  established per-task commit granularity.
- T014 and T022 are the two tasks this feature's own plan-phase review
  flagged as first-class, non-negotiable verification points (the
  `setStyle()`/overlay survival empirical test, and the pin-vs-default
  theme-repair resolution logic) — do not skip or weaken either while
  under time pressure.
