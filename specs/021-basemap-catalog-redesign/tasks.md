---

description: "Task list for 021-basemap-catalog-redesign"
---

# Tasks: Basemap Catalog Redesign and Settings Modal Visual Polish

**Input**: Design documents from `/specs/021-basemap-catalog-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included throughout — this project's established convention (every prior feature's own tasks.md, e.g. 020-settings-modal) writes real Vitest/Playwright coverage as part of implementation, not as an optional add-on.

**Organization**: Tasks are grouped by user story (US1/US2/US3, priorities P1/P2/P3 per spec.md) so each can be implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on another incomplete task in the same batch)
- **[Story]**: Which user story this task belongs to
- Every task names its exact file path

## Path Conventions

Single project — `src/`, `tests/` at repository root (per plan.md's Structure Decision).

---

## Phase 1: Setup

**Purpose**: Establish a real regression baseline before any change, per this project's established git-stash-comparison discipline (used repeatedly in 012/019/020's own tasks.md to separate real regressions from pre-existing flakiness).

- [X] T001 Run the full existing suite (`npx vitest run` and `npx playwright test`) on the current branch tip with no changes made yet; record the exact pass/fail counts (and any already-failing/flaky test names) as this feature's baseline for T029's later comparison.

**Checkpoint**: Baseline recorded — safe to start Foundational work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one piece of state both User Story 1 (preview's initial/fallback value) and User Story 2 (the resolver's bottom fallback tier) require to exist before either can be considered complete. Kept deliberately minimal — everything that serves only ONE story (the UGRC aliases, the curated raster list, the resolver signature change itself) is scoped to that story's own phase below, not hoisted here.

**⚠️ CRITICAL**: Neither US1 nor US2 can be verified complete until this phase is done. US3 has no dependency on this phase at all and MAY be implemented before, after, or concurrently with it.

- [X] T002 In `src/panels/basemap/registry.ts`: replace the exported `APP_DEFAULT_LIGHT`/`APP_DEFAULT_DARK` constants with a single exported `APP_DEFAULT: BasemapPresetName = 'carto-voyager'` (data-model.md "single static app-default").
- [X] T003 Create `tests/unit/registry.test.ts` (new file) with a first case asserting `APP_DEFAULT === 'carto-voyager'` and that the module no longer exports `APP_DEFAULT_LIGHT`/`APP_DEFAULT_DARK` (a `// @ts-expect-error` import check is sufficient — depends on T002).

**Checkpoint**: `APP_DEFAULT` exists — User Story 1 and User Story 2 can now both proceed, independently and in either order.

---

## Phase 3: User Story 1 - Browse, preview, and apply a basemap from organized, named catalog sections (Priority: P1) 🎯 MVP

**Goal**: Four labeled catalog sections (UGRC Vector Tiles ×3, CARTO Vector Tiles ×3, OpenFreeMap ×5, Raster Tiles — curated), one persistent shared live preview above them, and a stage-then-Apply interaction: clicking any UGRC/CARTO/OpenFreeMap/Raster entry only stages a candidate (updating the preview for vector entries only); a separate Apply action is the only thing that changes the live global basemap.

**Independent Test**: Open Settings → Basemap; confirm every built-in preset (8 pre-existing + 3 new UGRC) appears exactly once under one of the four sections; confirm clicking a UGRC/CARTO/OpenFreeMap entry updates the shared preview live without changing what's applied; confirm clicking Apply — and only Apply — changes the live global basemap.

### Data layer for User Story 1

- [X] T004 [US1] In `src/panels/basemap/registry.ts`: generalize `BUILT_IN_PRESETS` from `Record<BasemapPresetName, UrlPreset>` to `Record<BasemapPresetName, UrlPreset | CompositionPreset>` (add `interface CompositionPreset { kind: 'composition'; layers: string[] }`, tag every existing entry `kind: 'url'`); replace the exported `resolveUrlPreset()` with `resolveBuiltInPreset(name: BasemapPresetName): BuiltInPreset | undefined` returning the tagged-union value directly (research.md §1, data-model.md).
- [X] T005 [US1] In `src/panels/basemap/registry.ts`: add the three UGRC composition preset entries to `BUILT_IN_PRESETS` — `'ugrc-vector-lite'` (`LiteBase` + `LiteLabels`), `'ugrc-vector-hybrid'` (`Esri.WorldImagery` + `Vector_Overlay`), `'ugrc-vector-outdoors'` (`OutdoorsBase` + `Outdoors_Labels`) — using the exact endpoint URLs in data-model.md (org `99lidPhWCzftIe9K`) (depends on T004).
- [X] T006 [US1] In `src/panels/basemap/registry.ts`: export `interface CuratedRasterProvider { name: string; variants: string[] }` and `async function listCuratedRasterProviders(signal?: AbortSignal): Promise<CuratedRasterProvider[]>`, reusing the existing (now non-`function`-local) `loadProvidersCatalog()`. For each top-level provider, compute every effective URL (parent `url` + each variant's own `url` override) and exclude the whole provider if any effective URL (a) contains an API-key/token placeholder (`{apikey}`, `{api_key}`, `{key}`, `{accessToken}`, `{access_token}`, `{subscriptionKey}`, `{app_id}`, `{app_code}`, `{token}`, case-insensitive), (b) is `http://` not `https://`, or (c) contains a URL-template token outside `{s}`/`{r}`/`{variant}`/`{z}`/`{x}`/`{y}` — plus one explicit exclusion, `CartoDB` (research.md §2).
- [X] T007 [US1] In `src/panels/basemap/loadBasemapStyle.ts`: `resolvePresetName()` gains a new branch, checked before the existing raster-provider fallback: `const builtIn = resolveBuiltInPreset(name); if (builtIn?.kind === 'url') return { kind: 'url', url: builtIn.url }; if (builtIn?.kind === 'composition') return { kind: 'style', style: await composeStyles(builtIn.layers, signal) }` (depends on T004/T005; imports `resolveBuiltInPreset` in place of the now-removed `resolveUrlPreset`).
- [X] T008 [P] [US1] In `tests/unit/registry.test.ts`: add cases for `resolveBuiltInPreset()` — an existing `'url'`-kind preset (e.g. `'carto-voyager'`) unchanged, and each of the 3 new `'composition'`-kind UGRC presets returning the exact expected `layers` arrays (depends on T004/T005).
- [X] T009 [P] [US1] In `tests/unit/resolveRasterProvider.test.ts`: add a `listCuratedRasterProviders` describe block — extend the file's existing `FIXTURE_CATALOG` with one entry per disqualifying condition (an `{apikey}`-style placeholder, an `http://`-only URL, an unhandled `{ext}`-style token) plus a `CartoDB` entry, and assert all four are excluded while a genuinely keyless/HTTPS/fully-substitutable entry is included (depends on T006).
- [X] T010 [P] [US1] In `tests/unit/loadBasemapStyle.test.ts`: add a case asserting `loadBasemapStyle('ugrc-vector-lite')` resolves via `composeStyles()` to output identical to calling `loadBasemapStyle()` with the equivalent ad hoc `{ layers: [...] }` object directly (proving FR-009's alias guarantee structurally) (depends on T007).

### UI layer for User Story 1

*(All in `src/layout/settings/basemapTab.tsx` — sequential, no `[P]`, to avoid same-file conflicts.)*

- [X] T011 [US1] In `src/layout/settings/basemapTab.tsx`: replace the existing flat radio-list implementation's data with a static, ordered module-level constant listing each UGRC/CARTO/OpenFreeMap entry's preset name, display label (e.g. `'ugrc-vector-lite'` → `"Vector Lite"`), and one small per-SECTION `lucide-react` icon (not per-entry, not a thumbnail — research.md §4) (depends on T005).
- [X] T012 [US1] In `src/layout/settings/basemapTab.tsx`: implement the ONE persistent preview map — a mount-once effect creating a non-interactive `maplibregl.Map` (`interactive: false`, initial style `freshBlankStyle()`), a `mapReady` boolean state set via the map's `'load'` event, a cleanup effect calling `map.remove()`, and `window.__basemapPreviewTestMap` assigned on mount / deleted on cleanup (contracts/basemap-catalog.md test-instrumentation contract).
- [X] T013 [US1] In `src/layout/settings/basemapTab.tsx`: implement `stagedSelection` state initialized via `useState(() => useGlobalBasemap() ?? APP_DEFAULT)`; an `isRasterProviderSelection(name)` helper (`resolveBuiltInPreset(name) === undefined`); and a re-style effect keyed on `[mapReady, stagedSelection]` that, for a non-raster selection, resolves via `loadBasemapStyle(stagedSelection, signal)` and calls `map.setStyle(...)` (with an `AbortController` + generation-counter guard against a stale/superseded invocation, matching `FlowMapPanel.tsx`/`ZoneMapPanel.tsx`'s own basemap-application effect shape — research.md §3), and does nothing for a raster-provider selection (depends on T012, T007).
- [X] T014 [US1] In `src/layout/settings/basemapTab.tsx`: render the UGRC Vector Tiles / CARTO Vector Tiles / OpenFreeMap sections from T011's data as labeled buttons (icon + label), each `onClick={() => setStagedSelection(presetName)}`, each visually marked (e.g. `variant={stagedSelection === presetName ? 'secondary' : 'outline'}`, a `data-staged` attribute for testability) when it is the current `stagedSelection` (depends on T011, T013).
- [X] T015 [US1] In `src/layout/settings/basemapTab.tsx`: implement the Raster Tiles section's own `rasterStatus: {kind:'loading'} | {kind:'error', message} | {kind:'ready', providers: CuratedRasterProvider[]}` state and a mount effect calling `listCuratedRasterProviders()` with an `AbortController`; render an inline `animate-pulse` skeleton (`data-testid="raster-loading-skeleton"`) for `'loading'`, the existing `panels/PanelErrorState.tsx` for `'error'`, the existing `panels/PanelEmptyState.tsx` for a `'ready'` empty result, or a grouped `<select>`/dropdown (one option per provider variant, or the bare provider name if it has none) for `'ready'` with ≥1 provider (depends on T006).
- [X] T016 [US1] In `src/layout/settings/basemapTab.tsx`: wire the Raster Tiles dropdown's `onChange` to `setStagedSelection(dottedNameOrBareProviderName)` (same staging path T014 uses); render the shared preview area's placeholder message ("No live preview for raster providers — Apply to use it") in place of the map canvas whenever `isRasterProviderSelection(stagedSelection)` is true (depends on T013, T015).
- [X] T017 [US1] In `src/layout/settings/basemapTab.tsx`: add an "Explore options" link/button (`target="_blank" rel="noopener noreferrer"`, matching `MarkdownPanel.tsx`'s existing external-link convention) opening `https://leaflet-extras.github.io/leaflet-providers/preview/` near the Raster Tiles section (depends on T015).
- [X] T018 [US1] In `src/layout/settings/basemapTab.tsx`: add the Apply `Button`, whose `onClick` is the ONLY call to `setGlobalBasemap(stagedSelection)` anywhere in this component (depends on T013).
- [X] T019 [US1] In `tests/integration/settingsModal.spec.ts`: replace/extend the Basemap-tab coverage per quickstart.md Scenarios 1–9 — four sections + three UGRC entries render; clicking a UGRC/CARTO/OpenFreeMap entry stages it (visually marked) and live-updates the shared preview (real network request for the entry's own URL(s)) without changing the applied basemap; Apply — and only Apply — commits the staged selection, verified against the actually-applied value; closing the modal or switching Settings tabs with an unapplied staged selection discards it, and reopening starts fresh from the unchanged applied value; the preview shows the currently-applied basemap (or `APP_DEFAULT`) the instant the tab opens, before any click; selecting a raster provider stages it without updating the live preview or firing a new tile/style request; the curated raster dropdown contains no key-requiring provider; the Raster Tiles section shows a loading skeleton / `role="alert"` error / dropdown but never a blank gap, both while its fetch is pending and if it fails; `window.__basemapPreviewTestMap` exists only while the Basemap tab is the active Settings tab (depends on T011–T018).

**Checkpoint**: User Story 1 fully functional and independently testable — the sectioned catalog with full stage → preview → Apply flow works end-to-end.

---

## Phase 4: User Story 2 - A single, predictable app-default basemap (Priority: P2)

**Goal**: `resolveEffectiveBasemap()`'s bottom fallback tier is one static value (`APP_DEFAULT`), never theme-dependent; its two callers' now-dead theme plumbing is removed.

**Independent Test**: With no panel/tab/global basemap configured, toggle Light/Dark and confirm the resolved basemap never changes; confirm a deployer-changed `APP_DEFAULT` changes what every unconfigured panel resolves to, independent of theme.

- [X] T020 [US2] In `src/panels/basemap/resolveEffectiveBasemap.ts`: remove the `theme: ColorScheme` parameter entirely; the bottom fallback branch becomes `{ selection: APP_DEFAULT, source: 'app-default' }` unconditionally; delete the now-unused exported `ColorScheme` type (research.md §6, depends on T002).
- [X] T021 [P] [US2] In `src/panels/FlowMapPanel.tsx`: remove the `useColorScheme()` import and the `const colorScheme = useColorScheme()` line (confirmed dead — no other use in this file); drop the now-removed 3rd positional argument from the `resolveEffectiveBasemap(config.basemap, config._tabDefaultBasemap, colorScheme, globalBasemap)` call, leaving `resolveEffectiveBasemap(config.basemap, config._tabDefaultBasemap, globalBasemap)` (depends on T020).
- [X] T022 [P] [US2] In `src/panels/ZoneMapPanel.tsx`: identical two changes as T021 (depends on T020).
- [X] T023 [P] [US2] In `tests/unit/resolveEffectiveBasemap.test.ts`: drop the `theme` argument from every existing call; delete the "falls back to the theme-paired app default" test and the "`basemapKey` is stable... but not for the app default" theme-flip test outright (the behavior they asserted no longer exists); add the new `APP_DEFAULT`-based bottom-tier row and confirm a global override still wins over it (depends on T020).
- [X] T024 [US2] In `tests/integration/flowmapPanel.spec.ts`: add an assertion that toggling `document.documentElement`'s `dark` class produces no new basemap tile/style network request for a panel with no panel/tab/global basemap configured (quickstart.md Scenario 10's live-network check) (depends on T020–T022).

**Checkpoint**: User Stories 1 AND 2 both independently functional.

---

## Phase 5: User Story 3 - A settings modal that doesn't resize or rearrange itself (Priority: P3)

**Goal**: The Settings modal renders at one fixed height/width regardless of active tab, with its tab list running vertically down the left edge.

**Independent Test**: Open Settings, measure the modal's rendered height/width, switch through all four tabs, confirm the measurement never changes; confirm the tab triggers stack vertically to the left of the active tab's content.

- [X] T025 [US3] In `src/components/ui/tabs.tsx`: add `data-[orientation=vertical]:` Tailwind variants to `TabsList` (vertical rail — `flex-col`, a fixed width, full height of its flex parent) and `TabsTrigger` (full-width, left-aligned instead of centered) alongside their existing horizontal-row classes (Radix sets `data-orientation` automatically; `navBar.tsx`'s own horizontal usage is unaffected since it never sets `orientation`).
- [X] T026 [US3] In `src/layout/settingsModal.tsx`: add a fixed target height to `DialogContent`'s className alongside its existing `max-h-[85vh] w-[95vw] max-w-[720px]` viewport-relative caps (e.g. `h-[600px] max-h-[85vh] ...`); add `orientation="vertical"` to `Tabs` and switch its own container from `flex-col` to `flex-row`; keep every `TabsContent`'s existing `overflow-y-auto` class unchanged (research.md §7, depends on T025).
- [X] T027 [US3] In `tests/integration/settingsModal.spec.ts`: add the "modal's measured height/width is identical across all four tabs" test and the "tab triggers' bounding boxes stack vertically, to the left of the active `TabsContent`" layout test (quickstart.md Scenario 12); confirm 020-settings-modal's existing Appearance-tab assertions (Scenario 13) still pass unmodified (depends on T026).

**Checkpoint**: All three user stories independently functional — feature complete.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T028 [P] Run `npx tsc --noEmit` project-wide — confirm no stale reference remains anywhere to `APP_DEFAULT_LIGHT`/`APP_DEFAULT_DARK`, `resolveUrlPreset`, the deleted `ColorScheme` export, or an unused `useColorScheme` import in either map panel.
- [X] T029 Run the full Vitest + Playwright suite and compare against T001's recorded baseline — for any newly-failing test, use the established git-stash-comparison discipline (already applied in 012/019/020's own work) to confirm whether it is a real regression or pre-existing/flaky before concluding either way.
- [X] T030 [P] Update `CLAUDE.md`'s file-tree history entries for `panels/basemap/registry.ts`, `resolveEffectiveBasemap.ts`, `loadBasemapStyle.ts`, `layout/settings/basemapTab.tsx`, `layout/settingsModal.tsx`, `components/ui/tabs.tsx`, `panels/FlowMapPanel.tsx`, and `panels/ZoneMapPanel.tsx` with this feature's real implementation-time findings, matching this project's established documentation convention.
- [X] T031 Execute `quickstart.md`'s full scenario list end-to-end against the dev server as a final validation pass, correcting any real drift found in that document itself (matching 020-settings-modal's own quickstart-correction precedent, T035) before declaring the feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS User Story 1 and User Story 2 (both need `APP_DEFAULT`). Does NOT block User Story 3 (fully independent of `registry.ts`).
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational only — NOT on User Story 1 (its own registry.ts/loadBasemapStyle.ts changes are additive and don't touch `resolveEffectiveBasemap.ts` or either map panel).
- **User Story 3 (Phase 5)**: No dependency on Foundational, User Story 1, or User Story 2 — may be implemented at any point, including before Phase 1 finishes elsewhere.
- **Polish (Final Phase)**: Depends on whichever of Phases 3–5 are in scope for this delivery.

### Real, same-file conflicts across stories (read before parallelizing)

- `src/panels/basemap/registry.ts` is written by T002 (Foundational), then T004–T006 (US1), and read (not written) by T020 (US2) — **T002 must land before T004–T006 and T020 both start**; T004–T006 and T020 may then proceed in either order or in parallel (different concerns within the same file — still coordinate to avoid a merge conflict if worked by different people/agents at once).
- `tests/integration/settingsModal.spec.ts` is written by T019 (US1), T027 (US3) — **not by T024**, which was deliberately placed in `flowmapPanel.spec.ts` instead specifically to avoid a third writer of this same file. T019 and T027 still MUST be applied sequentially (whichever story's implementation finishes first goes first) even though their underlying production code has no dependency on each other — do not mark these `[P]` against each other, and do not run them as literal concurrent edits.

### Parallel Opportunities

- Within Foundational: none (T002 → T003, strictly sequential, only two tasks).
- Within User Story 1: T008/T009/T010 (three different test files) — parallel, once their respective implementation tasks (T004/T005, T006, T007) land. T011–T018 (all `basemapTab.tsx`) are strictly sequential — never mark these `[P]`.
- Within User Story 2: T021/T022/T023 (different files: the two map panels, the resolver's own unit test) — parallel, once T020 lands.
- Across stories: User Story 3 (T025–T027) can be developed by a separate person/agent at any time relative to User Story 1/2, with the one caveat above about `settingsModal.spec.ts` (T019/T027) needing sequential application.

---

## Parallel Example: User Story 1's data-layer tests

```bash
# Once T004/T005 (registry.ts preset generalization), T006 (curated raster
# list), and T007 (loadBasemapStyle.ts composition branch) have all landed:
Task: "Add resolveBuiltInPreset() cases to tests/unit/registry.test.ts"
Task: "Add listCuratedRasterProviders() cases to tests/unit/resolveRasterProvider.test.ts"
Task: "Add a UGRC composition-preset case to tests/unit/loadBasemapStyle.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001).
2. Phase 2: Foundational (T002–T003) — CRITICAL, blocks US1.
3. Phase 3: User Story 1 (T004–T019).
4. **STOP and VALIDATE**: run quickstart.md Scenarios 1–9 against a dev server; confirm the sectioned catalog + stage → preview → Apply flow works end-to-end with no US2/US3 changes present.
5. Deploy/demo if ready — US1 alone already replaces 020-settings-modal's flat, immediate-apply picker with the full redesign's primary value.

### Incremental Delivery

1. Setup + Foundational → foundation ready (`APP_DEFAULT` exists).
2. Add User Story 1 → validate independently → deploy/demo (MVP).
3. Add User Story 2 → validate independently (theme flips no longer re-pair the basemap) → deploy/demo.
4. Add User Story 3 → validate independently (modal never resizes, tabs run vertically) → deploy/demo.
5. Final Phase: typecheck, full regression comparison against T001's baseline, `CLAUDE.md` update, quickstart re-validation.

### Parallel Team Strategy

With multiple developers, after Foundational (T002–T003) lands:
- Developer A: User Story 1 (T004–T019) — the largest, highest-priority story.
- Developer B: User Story 2 (T020–T024) — small, fully independent of US1's registry.ts additions.
- Developer C: User Story 3 (T025–T027) — fully independent of both; only needs to coordinate with whichever of A/B finishes first on the shared `settingsModal.spec.ts` file (see the same-file-conflicts note above).
