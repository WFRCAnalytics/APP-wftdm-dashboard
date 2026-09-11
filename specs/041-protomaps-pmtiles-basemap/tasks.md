---

description: "Task list for Protomaps PMTiles Basemap Support"
---

# Tasks: Protomaps PMTiles Basemap Support

**Input**: Design documents from `/specs/041-protomaps-pmtiles-basemap/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — this project's own established convention (every prior feature ships real Vitest + Playwright coverage; `quickstart.md`/`contracts/` already name the specific test files) treats this as the default, not an opt-in.

**Organization**: Grouped by user story per spec.md's priorities: US1 (P1, select a flavor), US2 (P1, deployer configures the shared source), US3 (P2, viewer session override). US1's own Independent Test explicitly assumes "a deployer default PMTiles source already configured" — so the config-field plumbing that makes that true is a **shared Foundational prerequisite**, not exclusive to US2; US2's own phase covers what's specific to it (both source forms, the "not configured" state).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3
- File paths are exact, relative to repo root

## Phase 1: Setup

- [X] T001 Add `@protomaps/basemaps` (`^5.7.2`) and `pmtiles` (`^4.5.0`) to `package.json` dependencies; run `npm install`. Versions confirmed real via `npm view` during planning (research.md R-1/R-2) — do not substitute `^latest` or a different pin without re-confirming.
- [X] T002 [P] Add `pmtiles`/`@protomaps/basemaps` to the existing `maps` `manualChunks` bucket in `vite.config.ts`, alongside `maplibre-gl` (research.md R-8) — do not create a new dedicated chunk.
- [X] T003 [P] Source a small, real, git-trackable PMTiles archive at `tests/fixtures/protomaps/tiny-test-area.pmtiles` (research.md R-7) via Protomaps' own real `pmtiles`/`planetiler` tooling against a deliberately tiny area — a test-only fixture, NEVER a hotlinked Protomaps-hosted URL. Document the exact generation command in a short comment/README alongside the file so it can be regenerated.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared plumbing every user story depends on — style generation, protocol registration, source-precedence state, and the deployer config field. No user-story-specific UI yet.

**⚠️ CRITICAL**: No user story task below may start until this phase is complete.

- [X] T004 [P] Create `src/panels/basemap/protomapsStyle.ts`: export `PROTOMAPS_FLAVOR_NAMES` (the 5 literal names from data-model.md E-1), `PROTOMAPS_ATTRIBUTION` (the exact confirmed string), `isProtomapsFlavorName(name)`, and pure `buildProtomapsStyle(flavorName, pmtilesUrl)` returning a `StyleSpecification` per contracts/basemap-resolution.md and data-model.md E-4 (source, `layers()` output, sprite, glyphs).
- [X] T005 [P] Create `src/panels/basemap/pmtilesProtocol.ts`: import `Protocol` from `pmtiles`, call `maplibregl.addProtocol('pmtiles', protocol.tile)` as a module-load side effect (no exported function) per contracts/basemap-resolution.md.
- [X] T006 [P] Create `src/state/protomapsSourceState.ts`: `setDeployerPmtilesUrl(url)` (plain module-level value, set once at boot, mirrors `panels/scenarioDisplay.ts`'s `setDeployerScenarioPalette()` shape), `setViewerPmtilesOverride(url)` / `clearViewerPmtilesOverride()` + `subscribe(fn)` / `notify()` (mirrors `state/basemapState.ts`'s shape — reactive, session-only, never persisted per Constitution Principle VI), and `getEffectivePmtilesSource()` returning `viewerOverride ?? deployerDefault ?? undefined` per research.md R-4 / data-model.md E-2.
- [X] T007 [P] Create `src/hooks/useProtomapsSource.ts`: a `useSyncExternalStore` wrapper over T006's `subscribe`/`getEffectivePmtilesSource`, mirroring `hooks/useGlobalBasemap.ts`'s existing no-cache primitive-return shape exactly.
- [X] T008 Add `protomapsPmtilesUrl?: string` to `DashboardIndexJson`'s object variant and to the `DashboardBranding` interface in `src/services/yamlLoader.ts`, plus the corresponding fail-soft parse line in `loadDashboardBranding()`, per contracts/deployer-config.md.
- [X] T009 In `src/main.tsx`, resolve the deployer default the same precedence way `scenarioPalette`/`title`/`logoUrl` already are (`primaryBranding.protomapsPmtilesUrl ?? demoBranding.protomapsPmtilesUrl`) and call `setDeployerPmtilesUrl()` (T006) once, at boot, alongside the existing `setDeployerScenarioPalette(...)` call. *(depends on T006, T008)*
- [X] T010 Add a new branch to `resolvePresetName()` in `src/panels/basemap/loadBasemapStyle.ts`: if `isProtomapsFlavorName(name)` (T004), resolve `getEffectivePmtilesSource()` (T006) — if undefined, return the existing `freshBlankStyle()` fallback (FR-010); otherwise return `buildProtomapsStyle(name, source)` (T004). Insert before the existing raster-provider-name fallback branch, per contracts/basemap-resolution.md. Import `pmtilesProtocol.ts` (T005) at the top of this file so registration happens before any resolution runs. *(depends on T004, T005, T006)*
- [X] T011 [P] `tests/unit/protomapsStyle.test.ts` — assert `isProtomapsFlavorName()` membership for all 5 names and rejects arbitrary strings; assert `buildProtomapsStyle()`'s returned `sources.protomaps.url` is `pmtiles://${url}`, `attribution` equals `PROTOMAPS_ATTRIBUTION` exactly, `sprite`/`glyphs` equal the confirmed stable asset paths, and `layers` is a non-empty array. *(depends on T004)*

**Checkpoint**: Style generation, protocol registration, source precedence, and deployer config parsing all exist and are unit-tested. User story work can now begin.

---

## Phase 3: User Story 1 - Select a Protomaps flavor as the active basemap (Priority: P1) 🎯 MVP

**Goal**: A viewer can pick any of the 5 Protomaps flavors in the Basemap tab and see it render correctly, using whichever PMTiles source is configured.

**Independent Test**: With a deployer default already configured (Foundational phase, or the test fixture routed in for a test), open the Basemap tab, select each of the 5 flavors, confirm each renders distinctly with labels/roads and correct attribution (quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T012 [US1] Add a "Protomaps" section to `src/layout/settings/basemapTab.tsx`, positioned directly above the existing Raster Tiles section (after UGRC) per contracts/basemap-tab-ui.md: 5 tiles from `PROTOMAPS_FLAVOR_NAMES` (T004), same tile-grid visual treatment as the existing UGRC/CARTO/OpenFreeMap sections, wired into the existing `stagedSelection`/Apply/live-preview mechanism unmodified.
- [X] T013 [US1] In `src/panels/FlowMapPanel.tsx`, add `useProtomapsSource()` (T007) to the existing basemap-application effect's dependency array, alongside the existing `useGlobalBasemap()` call, so a source becoming available/changing re-resolves an already-active Protomaps flavor without a panel remount.
- [X] T014 [US1] In `src/panels/ZoneMapPanel.tsx`, make the identical addition as T013.
- [X] T015 [US1] In `src/layout/settings/basemapTab.tsx`'s own shared preview-map effect, add the same `useProtomapsSource()` dependency so the live preview updates immediately when a source becomes available. *(depends on T007, T012)*
- [X] T016 [US1] `tests/integration/protomapsBasemap.spec.ts` — Scenario 1 from quickstart.md: route/configure the T003 test fixture as the deployer default, open Settings → Basemap, confirm the "Protomaps" section appears above "Raster Tiles", select each of the 5 flavors and assert distinct rendered styling + attribution text is visible, and assert no second network request to the fixture URL fires between two flavor switches (FR-012/SC-005). *(depends on T009, T010, T012, T013, T014, T015)*

**Checkpoint**: User Story 1 is fully functional and independently testable (given a configured source).

---

## Phase 4: User Story 2 - Deployer configures their own regional PMTiles source (Priority: P1)

**Goal**: A deployer can point the whole Protomaps section at their own regional extract — bundled relative path or external URL, identically — with one config value and no code change; an unconfigured deployment shows an honest "not configured" state instead of broken tiles.

**Independent Test**: Set `protomapsPmtilesUrl` to a bundled relative path, confirm all 5 flavors render; repeat with a full external URL, confirm identical behavior; remove the field entirely, confirm the "not configured" state (quickstart.md Scenarios 2 and 3).

### Implementation for User Story 2

- [X] T017 [US2] Add the "not configured" state to the Protomaps section in `src/layout/settings/basemapTab.tsx`: when `getEffectivePmtilesSource()` (T006) is undefined, render the 5 tiles disabled (non-clickable, visually muted) plus an inline explanatory message, per contracts/basemap-tab-ui.md. *(depends on T012)*
- [X] T018 [US2] `tests/integration/protomapsBasemap.spec.ts` — Scenario 2 from quickstart.md: configure `protomapsPmtilesUrl` as a full external URL pointing at the same fixture content (or an equivalent small externally-hosted test file) and confirm rendering is identical to the relative-path case in T016. *(depends on T009, T016)*
- [X] T019 [US2] `tests/integration/protomapsBasemap.spec.ts` — Scenario 3 from quickstart.md: with no `protomapsPmtilesUrl` configured, open the Protomaps section and assert the 5 tiles are disabled and the "not configured" message is shown (distinct wording from any error state). *(depends on T017)*
- [X] T020 [US2] Confirm `public/demo-dashboard-config/index.json` does not set `protomapsPmtilesUrl` (the real demo deployment ships genuinely unconfigured per contracts/deployer-config.md / research.md R-7) and run the `grep` verification from that contract to confirm no Protomaps-hosted demo/build/API URL exists anywhere under `src/` as a default.

**Checkpoint**: User Stories 1 AND 2 both work independently — a deployer can configure either source form, and an unconfigured deployment fails honestly.

---

## Phase 5: User Story 3 - Viewer supplies their own PMTiles source for the current session (Priority: P2)

**Goal**: A viewer without (or wanting to preview past) a deployer default can enter their own PMTiles URL for their session only, validated before use, never persisted.

**Independent Test**: With no deployer default, enter a valid URL into the override field, confirm the 5 flavors become usable; reload and confirm the override is gone (quickstart.md Scenario 4). Enter an invalid/unreachable URL and confirm a distinct, graceful error (quickstart.md Scenario 5).

### Implementation for User Story 3

- [X] T021 [US3] Add the viewer override text-entry field, a "reset to default" affordance, and validation/error-message UI to the Protomaps section's "not configured" state in `src/layout/settings/basemapTab.tsx`, per contracts/basemap-tab-ui.md. *(depends on T017)*
- [X] T022 [US3] Wire the override field's commit handler to: (a) attempt to open the entered URL via the `pmtiles` client library's own archive/metadata read (data-model.md E-2 validation rule) before accepting it; (b) on success, call `setViewerPmtilesOverride()` (T006); (c) on failure, show the distinct error state from T021 and leave any prior state untouched. Wire the "reset to default" affordance to `clearViewerPmtilesOverride()`. *(depends on T006, T021)*
- [X] T023 [US3] `tests/integration/protomapsBasemap.spec.ts` — Scenario 4 from quickstart.md: from the not-configured state, commit the T003 fixture's URL as an override, confirm the 5 tiles become usable with no reload, then reload the app and confirm the section reverts to "not configured" (or the deployer default, if any). *(depends on T022)*
- [X] T024 [US3] `tests/integration/protomapsBasemap.spec.ts` — Scenario 5 from quickstart.md: enter an unreachable/invalid URL, confirm a distinct error message (different wording from "not configured"), confirm the tiles remain in their prior state, and confirm no other basemap section or panel is affected. *(depends on T022)*

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T025 [P] Run `npm run typecheck` — confirm clean, no new errors.
- [X] T026 [P] Run `npx vitest run` — confirm `protomapsStyle.test.ts` (T011) passes and the full existing unit suite has zero regressions.
- [X] T027 Run the full `tests/integration/` Playwright suite once. Triage any failure individually (re-run in isolation) before concluding a regression, per this project's established discipline — do not assume a failure is pre-existing flakiness without confirming it reproduces (or doesn't) against a clean `git stash`.
- [X] T028 [P] Update `CLAUDE.md`'s `src/panels/basemap/` file-tree section to record the new `protomapsStyle.ts`/`pmtilesProtocol.ts` modules and `state/protomapsSourceState.ts`, matching this repo's own established per-feature documentation density.
- [X] T029 Manually run through `quickstart.md`'s 5 scenarios end-to-end via `npm run dev`, in both light and dark app themes (per the `wftdm-design-system` skill's dual-theme verification standard), before considering the feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (needs the npm packages from T001). BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2/US3 implementation, but its own Independent Test needs a source configured — satisfied by Foundational's T009 (deployer-default wiring) alone; US2's UI work is not required to prove US1 works.
- **User Story 2 (Phase 4)**: Depends on Foundational. T017 depends on US1's T012 (extends the same section). Otherwise independent of US1/US3.
- **User Story 3 (Phase 5)**: Depends on Foundational + US2's T017 (extends the "not configured" state built there). Independent of US1's rendering-specific tasks (T013–T016).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T001–T003 (Setup) can all run in parallel.
- T004, T005, T006, T007 (Foundational) can all run in parallel — different files, no cross-dependencies among them.
- T008 can run in parallel with T004–T007 (different file).
- T011 can run in parallel with T008/T009/T010 once T004 is done.
- T013 and T014 (US1) can run in parallel — different files.
- T025, T026, T028 (Polish) can run in parallel.

---

## Parallel Example: Foundational Phase

```bash
# Launch T004-T007 together — four independent new files:
Task: "Create src/panels/basemap/protomapsStyle.ts per contracts/basemap-resolution.md"
Task: "Create src/panels/basemap/pmtilesProtocol.ts per contracts/basemap-resolution.md"
Task: "Create src/state/protomapsSourceState.ts per research.md R-4"
Task: "Create src/hooks/useProtomapsSource.ts mirroring hooks/useGlobalBasemap.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) — this already includes the deployer-config plumbing (T008/T009) US1's own Independent Test relies on.
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: run quickstart.md Scenario 1 manually.
4. This is a demonstrable MVP — a deployer with a configured source, all 5 flavors selectable and rendering correctly.

### Incremental Delivery

1. Setup + Foundational → foundation ready (source-precedence plumbing exists, but no UI yet).
2. + User Story 1 → viewer can select and see flavors (assuming a source) → validate → MVP.
3. + User Story 2 → deployer configurability (both source forms) + honest "not configured" state → validate.
4. + User Story 3 → viewer session override → validate.
5. + Polish → typecheck/test/doc pass, dual-theme manual walkthrough.

## Notes

- [P] tasks touch different files with no unmet dependency.
- Every task names its exact file path — no task should require guessing where code goes.
- Commit after each task or logical group, per this project's established workflow.
- T012/T017/T021 all touch `src/layout/settings/basemapTab.tsx` sequentially (not `[P]`) — each depends on the previous one's markup existing (configured tiles → not-configured state → override field).
