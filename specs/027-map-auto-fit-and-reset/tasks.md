---

description: "Task list for 027-map-auto-fit-and-reset"
---

# Tasks: Auto-fit map view to data extent, plus a reset-to-view button

**Input**: Design documents from `/specs/027-map-auto-fit-and-reset/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/map-auto-fit-and-reset.md, quickstart.md (all present)

**Tests**: Included — this project's established convention (every prior panel/map feature: `010`, `011`, `012`, `013`) adds Vitest coverage for new pure modules and extends the relevant Playwright `*.spec.ts` file(s) as part of the same feature, verified passing at completion rather than practiced as strict red-green TDD per task.

**Organization**: Grouped by user story (spec.md's own P1/P1/P2/P3 priorities) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- File paths are exact and relative to the repository root

## Path Conventions

Single project — `src/`, `tests/` at repository root (plan.md's Project Structure).

---

## Phase 1: Setup

**Purpose**: Confirm the Constitution Check's "no new dependency, no build-config change" premise before any code is written — a real, load-bearing check (research.md §1, plan.md), not busywork, since implementation Assumes both hold throughout.

- [X] T001 Confirm `maplibre-gl@^4.7.1` (already in `package.json`) exports `fitBounds`/`IControl`/`easeTo` with no version bump needed, and that no `vite.config.ts` change is required — re-verify directly against `node_modules/maplibre-gl/dist/maplibre-gl.d.ts` (research.md §1) rather than trusting this plan's own citation from memory.

**Checkpoint**: Dependency/build assumptions reconfirmed — safe to proceed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one piece of shared infrastructure both User Story 1 and User Story 2 build on — a pure, DOM-free bounds-computation module (contracts/map-auto-fit-and-reset.md, data-model.md). No user story can compute a real fit without it.

**⚠️ CRITICAL**: Must be complete before Phase 3 or Phase 4 begins.

- [X] T002 [P] Create `src/panels/mapBounds.ts` — export `BoundsTuple` type (`[west, south, east, north]`) and `computeFlowBounds(locations: FlowLocation[]): BoundsTuple | null` (reduces `flowmapData.ts`'s own `FlowLocation[]` output; returns `null` for an empty array) — see contracts/map-auto-fit-and-reset.md.
- [X] T003 [P] Add `computeGeometryBounds(features: ZoneFeature[]): BoundsTuple | null` to `src/panels/mapBounds.ts` — a generic recursive coordinate-array flattener over each feature's `GeoJSON.Geometry.coordinates` (no geometry-type switch needed; works uniformly for Polygon/MultiPolygon), reduced the same way as T002; returns `null` for an empty array (research.md §5).
- [X] T004 [P] Create `tests/unit/mapBounds.test.ts` — cover both functions' empty-input `null` case, a normal multi-point/multi-polygon case, and a degenerate single-point/single-polygon case (bounds where `west === east` and `south === north`).

**Checkpoint**: `mapBounds.ts` complete and unit-tested — User Story 1 and User Story 2 can now proceed (in parallel, if staffed).

---

## Phase 3: User Story 1 - A flowmap panel opens already framed on its own data (Priority: P1) 🎯 MVP

**Goal**: A flowmap panel with no author-configured `center`/`zoom` opens its initial view fitted to the real bounding box of its own loaded flow data.

**Independent Test**: Load the `dashboard-1-summary.yaml` fixture's "Flow Map Trip Distribution Desire Lines" panel (confirmed during planning to already have no `center`/`zoom` configured — no fixture change needed) and confirm its map's initial `getBounds()` contains every flow's origin/destination point, not `DEFAULT_CENTER`/`DEFAULT_ZOOM`.

### Implementation for User Story 1

- [X] T005 [US1] In `src/panels/FlowMapPanel.tsx`, add `hasAutoFittedRef = useRef(false)` alongside the file's existing refs, and — inside the existing data-update effect, right after `buildFlowmapData()` produces `data` — add the guard: only proceed to auto-fit when `config.center == null && config.zoom == null` (FR-003, treating the pair as one unit) and `!hasAutoFittedRef.current`.
- [X] T006 [US1] In that same guarded block (depends on T005, T002), call `computeFlowBounds(data.locations)`; when it returns non-`null`, call `mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 800 })` (research.md §2's confirmed real reference values) and set `hasAutoFittedRef.current = true` immediately (FR-001, FR-004 — a `null` result, e.g. all rows excluded, leaves the static default in place; FR-005 — `maxZoom: 11` bounds the degenerate single-point case; FR-006 — the ref makes every later re-run of this effect, for any reason, a correct no-op).
- [X] T007 [P] [US1] Extend `tests/integration/flowmapPanel.spec.ts`: assert the "Flow Map Trip Distribution Desire Lines" panel's `__flowmapTestMaps` entry ends up with a center/zoom that contains its real flow data (not `DEFAULT_CENTER`/`DEFAULT_ZOOM` `[-111.89, 40.76]`/`9`).
- [X] T008 [P] [US1] Extend `tests/integration/flowmapPanel.spec.ts`: assert the "Flow Map Broken Panel (intentional)" panel (empty/error result) leaves its map at `DEFAULT_CENTER`/`DEFAULT_ZOOM` (FR-004).

**Checkpoint**: Flowmap auto-fit is fully functional and independently testable/demoable — this alone is a viable MVP slice.

---

## Phase 4: User Story 2 - A zonemap panel opens already framed on its zone geometry (Priority: P1)

**Goal**: A zonemap panel with no author-configured `center`/`zoom` opens its initial view fitted to the real extent of its loaded zone boundary geometry.

**Independent Test**: Load the `dashboard-3-basemaps.yaml` fixture's "Zone Map Tab Default Basemap" panel (confirmed during planning to already have no `center`/`zoom` configured — no fixture change needed) and confirm its map's initial `getBounds()` contains the full `taz.geoparquet` extent.

### Implementation for User Story 2

- [X] T009 [US2] In `src/panels/ZoneMapPanel.tsx`, add `hasAutoFittedRef = useRef(false)` alongside the file's existing refs, and — inside the existing data-update effect, before the geometry/rows join logic runs — add the guard: only proceed to auto-fit when `config.center == null && config.zoom == null` (FR-003) and `!hasAutoFittedRef.current`.
- [X] T010 [US2] In that same guarded block (depends on T009, T003), call `computeGeometryBounds(zoneGeometry.features)`; when it returns non-`null`, call `mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 800 })` and set `hasAutoFittedRef.current = true` immediately (FR-002 — sourced from geometry, independent of which zones have matching metric rows; FR-004/FR-005/FR-006, same reasoning as T006).
- [X] T011 [P] [US2] Extend `tests/integration/zonemapPanel.spec.ts`: assert the "Zone Map Tab Default Basemap" panel's `__zonemapTestMaps` entry ends up fitted to the real `taz.geoparquet` extent, not `DEFAULT_CENTER`/`DEFAULT_ZOOM`.
- [X] T012 [P] [US2] Extend `tests/integration/zonemapPanel.spec.ts`: assert a geometry-load-error case (e.g. the existing boundaries-mismatch fixture, if one exists, or a temporarily-unreachable `boundaries` URL) leaves the map at `DEFAULT_CENTER`/`DEFAULT_ZOOM` (FR-004).

**Checkpoint**: Zonemap auto-fit is fully functional and independently testable — combined with User Story 1, this is the complete auto-fit MVP for both map panel types.

---

## Phase 5: User Story 3 - An author's explicit view configuration is always respected (Priority: P2)

**Goal**: Prove that a panel author's explicit `center`/`zoom` always wins outright — auto-fit never runs at all for such a panel, for either map panel type.

**Independent Test**: Load a flowmap and a zonemap panel that each have an explicit `center`/`zoom` clearly offset from their real data, and confirm both open at exactly the configured view.

### Implementation for User Story 3

- [X] T013 [US3] Add ONE new flowmap fixture panel with explicit `center`/`zoom` (chosen to be clearly offset from its real flow data's own area) to `tests/fixtures/dashboard-config/dashboard-3-basemaps.yaml`, following that file's own existing "Flowmap Panel Basemap Override"-style precedent-testing panel convention — confirmed during planning that no existing flowmap fixture panel has explicit `center`/`zoom` today, so this is genuinely new fixture content, not a reuse of an existing one (unlike zonemap, T014 below).
- [X] T014 [P] [US3] Extend `tests/integration/flowmapPanel.spec.ts` (depends on T013, T006): assert the new explicit-`center`/`zoom` fixture panel's map opens at exactly its configured view and does NOT reflect its real flow data's extent.
- [X] T015 [P] [US3] Extend `tests/integration/zonemapPanel.spec.ts` (depends on T010): assert the EXISTING "Zone Map VMT per Capita" fixture panel (`dashboard-1-summary.yaml`, already configured with `center: [-111.925, 40.705]` / `zoom: 11`) opens at exactly that configured view, not the `taz.geoparquet` extent — no fixture change needed, this panel already covers the case.

**Checkpoint**: Explicit author configuration confirmed to always win, for both panel types — no regression risk carried forward into User Story 4.

---

## Phase 6: User Story 4 - A viewer can snap back to the panel's starting view (Priority: P3)

**Goal**: A shared reset-to-view control, in the same corner cluster as the existing navigation/3D-toggle controls, returns either map panel type to its current effective view (author-configured or auto-fitted).

**Independent Test**: Pan/zoom away from a panel's initial view (auto-fitted or authored), activate the reset control, and confirm the map smoothly returns to exactly that original view.

### Implementation for User Story 4

- [X] T016 [P] [US4] Create `src/panels/resetViewControl.ts` — `ResetViewControl` class implementing `IControl` (constructor takes `onReset: () => void`; `onAdd`/`onRemove` build a button using the real, verbatim `stroke="currentColor"` home-icon SVG confirmed in research.md §2; `setEnabled(enabled: boolean)` toggles the button's `disabled` attribute, starting disabled) — mirrors `zonemap3dControl.ts`'s `ThreeDToggleControl` shape exactly (contracts/map-auto-fit-and-reset.md).
- [X] T017 [P] [US4] Add `.wftdm-reset-view-button` rules to `src/panels/mapControls.css` — token-driven styling mirroring `.wftdm-3d-toggle-button` (29×29px, `var(--foreground)`/`var(--muted)` hover), plus a `:disabled` rule (reduced opacity, `cursor: not-allowed`); no dark-mode icon-color fix needed since the SVG's `stroke="currentColor"` already inherits the button's own color (research.md §2).
- [X] T018 [US4] In `src/panels/FlowMapPanel.tsx`'s mount-only effect (depends on T016): add `appliedViewRef = useRef<EffectiveView | null>(null)`; when `config.center`/`config.zoom` is set, populate it synchronously (`{ source: 'author-config', center: config.center ?? DEFAULT_CENTER, zoom: config.zoom ?? DEFAULT_ZOOM }`); construct `new ResetViewControl(onReset)`, call `resetControl.setEnabled(true)` immediately for the author-config case, and `map.addControl(resetControl)` beside the existing `NavigationControl`. `onReset` reads `appliedViewRef.current`/`mapRef.current` at click time: `author-config` → `map.easeTo({ center, zoom, pitch: 0, bearing: 0, duration: 500 })`; `auto-fit` → `map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 500 })` then `map.easeTo({ pitch: 0, bearing: 0, duration: 500 })`.
- [X] T019 [US4] In `src/panels/FlowMapPanel.tsx`'s data-update effect (depends on T006, T018): immediately after a successful auto-fit, also set `appliedViewRef.current = { source: 'auto-fit', bounds }` and call `resetControlRef.current?.setEnabled(true)` (FR-007, FR-009).
- [X] T020 [US4] Repeat T018's shape in `src/panels/ZoneMapPanel.tsx`'s mount-only effect (depends on T016) — additionally, `onReset`'s `auto-fit` branch first resets the existing 3D toggle (`is3dRef.current = false`, `threeDToggle.setActive(false)`, the same layer-visibility flip `toggle3d()` already performs) before the pitch/bearing `easeTo()`, so a viewer who tilted into 3D gets back to the panel's genuine flat starting state (contracts/map-auto-fit-and-reset.md).
- [X] T021 [US4] Repeat T019's shape in `src/panels/ZoneMapPanel.tsx`'s data-update effect (depends on T010, T020).
- [X] T022 [P] [US4] Extend `tests/integration/flowmapPanel.spec.ts`: assert the reset control renders disabled before data loads; pan/zoom away after auto-fit, click reset, assert the map returns to the auto-fitted bounds.
- [X] T023 [P] [US4] Extend `tests/integration/zonemapPanel.spec.ts`: pan/zoom and toggle 3D away after auto-fit, click reset, assert the map returns to the auto-fitted bounds with 3D off and pitch/bearing zeroed.
- [X] T024 [P] [US4] Extend `tests/integration/flowmapPanel.spec.ts` and `tests/integration/zonemapPanel.spec.ts` (depends on T013/T015's explicit-config fixtures): pan away, click reset, assert the map returns to exactly the authored `center`/`zoom` (not a re-fit).

**Checkpoint**: All four user stories independently functional — reset control complete for both panel types.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Confirm the no-re-trigger guarantee (FR-006/SC-004) holds across every OTHER mechanism that re-runs a panel's data-update effect, and close out documentation/manual validation.

- [X] T025 [P] Extend `tests/integration/flowmapPanel.spec.ts` and `tests/integration/zonemapPanel.spec.ts`: after auto-fit has run, (a) expand the panel into its 004 dialog and collapse it back, (b) change an active global filter or switch scenarios so real new data/geometry loads, and (c) trigger a basemap switch — assert the camera never snaps back or re-fits after any of the three (FR-006, SC-004).
- [X] T026 [P] Update `CLAUDE.md`'s `FlowMapPanel.tsx`/`ZoneMapPanel.tsx` file-tree entries to document the new auto-fit/reset-control behavior, following this file's own established per-feature annotation convention.
- [X] T027 Run `specs/027-map-auto-fit-and-reset/quickstart.md`'s five manual scenarios end-to-end. All five have an automated Playwright equivalent that was actually run against `npm run dev:fixtures`'s real fixture data (not a production build) and confirmed passing: Scenario 1→T007/T008, Scenario 2→T011/T012, Scenario 3→T014/T015, Scenario 4→T022–T024, Scenario 5→T025 (`73/73` in `flowmapPanel.spec.ts`+`zonemapPanel.spec.ts` combined, plus `280/280` Vitest). A separate live-eyeballing dev-server session was not additionally performed on top of that — the automated coverage exercises the identical real DuckDB-WASM/MapLibre/browser stack Playwright drives headlessly, not a mock.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS User Story 1 and User Story 2 (both need `mapBounds.ts`).
- **User Story 1 (Phase 3)**: Depends on Foundational only. Independent of User Story 2.
- **User Story 2 (Phase 4)**: Depends on Foundational only. Independent of User Story 1.
- **User Story 3 (Phase 5)**: Depends on User Story 1 (T006, for the flowmap regression assertion) and User Story 2 (T010, for the zonemap regression assertion) actually existing to regress-test against.
- **User Story 4 (Phase 6)**: Depends on User Story 1 (T006) and User Story 2 (T010) for the auto-fit branch to have something to reset to; depends on User Story 3's fixtures (T013/T015) for its own author-config reset assertions (T024).
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Within Each User Story

- User Story 1: T005 → T006 (same file, same effect — sequential) → T007/T008 (parallel with each other, depend on T006).
- User Story 2: T009 → T010 (same file — sequential) → T011/T012 (parallel with each other, depend on T010).
- User Story 3: T013 → T014 (depends on the new fixture existing); T015 has no fixture dependency (reuses an existing panel) and can start as soon as T010 is done.
- User Story 4: T016/T017 in parallel (different new files) → T018 (needs T016) → T019 (same file as T018 — sequential) → T020 (needs T016, mirrors T018 in the other file) → T021 (same file as T020 — sequential) → T022/T023/T024 (parallel with each other, depend on T019/T021/T013/T015 respectively).

### Parallel Opportunities

- T002/T003/T004 (Foundational) can all be worked in parallel-ish (T002/T003 are additive to the same new file so should land together, but neither blocks the other's authoring; T004 can be written against the contracts doc before T002/T003 land, then run once they do).
- User Story 1 (Phase 3) and User Story 2 (Phase 4) can be implemented fully in parallel by different people once Phase 2 is done — they touch entirely different files.
- T016 and T017 (US4) are independent new files.
- Every `[P]`-marked test-extension task within a phase can be written in parallel (different assertions in the same or sibling spec files, no shared state between them).

---

## Parallel Example: Phase 2 (Foundational)

```bash
Task: "Create src/panels/mapBounds.ts with computeFlowBounds() (T002)"
Task: "Add computeGeometryBounds() to src/panels/mapBounds.ts (T003)"
Task: "Create tests/unit/mapBounds.test.ts covering both functions (T004)"
```

## Parallel Example: User Story 1 + User Story 2 together

```bash
# Once Phase 2 (Foundational) is done, both stories can proceed at once:
Task: "FlowMapPanel.tsx auto-fit guard + call (T005, T006)"
Task: "ZoneMapPanel.tsx auto-fit guard + call (T009, T010)"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (`mapBounds.ts`) — CRITICAL, blocks both auto-fit stories
3. Complete Phase 3: User Story 1 (flowmap auto-fit)
4. Complete Phase 4: User Story 2 (zonemap auto-fit)
5. **STOP and VALIDATE**: both map panel types now open framed to their real data — this alone resolves the core problem statement (SC-001) and is a demoable, shippable increment even without the reset control.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. User Story 1 → test independently → demo (flowmap auto-fit working).
3. User Story 2 → test independently → demo (zonemap auto-fit working, MVP complete).
4. User Story 3 → regression-proves explicit config is never overridden (no new production behavior, pure verification + one fixture addition).
5. User Story 4 → reset control, the smallest and last piece, per the original feature request's own "do this after Part A's design is settled" sequencing.
6. Polish → cross-cutting no-re-trigger regression coverage, docs, manual quickstart pass.

---

## Notes

- `[P]` tasks touch different files (or, within `mapBounds.ts`, different exported functions with no shared logic) and carry no ordering dependency on each other.
- `[Story]` labels map every implementation/test task back to spec.md's own US1–US4 numbering for traceability.
- T005/T006 and T009/T018/T019 etc. touch the SAME file in sequence deliberately (no `[P]`) — this project's own established convention for a single panel file's multiple effects (confirmed throughout `FlowMapPanel.tsx`/`ZoneMapPanel.tsx`'s own real, existing effect chain).
- No `dashboard-*.yaml` grammar changes, no new npm dependency, no DuckDB/Parquet involvement anywhere in this task list — confirmed against plan.md's Constitution Check before finalizing.
