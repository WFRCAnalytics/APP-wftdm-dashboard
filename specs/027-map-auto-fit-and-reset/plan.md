# Implementation Plan: Auto-fit map view to data extent, plus a reset-to-view button

**Branch**: `027-map-auto-fit-and-reset` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-map-auto-fit-and-reset/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Neither `FlowMapPanel.tsx` nor `ZoneMapPanel.tsx` fits its initial camera
view to the real data it renders today — both resolve a static
`config.center ?? DEFAULT_CENTER`/`config.zoom ?? DEFAULT_ZOOM` at Map
construction time, confirmed by direct code read (no `fitBounds`/`jumpTo`/
`easeTo` call exists in either panel's data path). This feature adds:
(1) a real `map.fitBounds()` call, computed from the flowmap's own loaded
flow-point extent or the zonemap's own loaded zone-geometry extent, that
runs exactly once per panel mount, only when the author has configured
neither `center` nor `zoom`; and (2) a shared, reusable reset-to-view
`IControl`, added to the same corner cluster as the existing
`NavigationControl`/3D-toggle, that returns the map to whichever view is
currently in effect (the author's config, or the auto-fitted bounds).

Both the `fitBounds()` call shape (padding/maxZoom/duration) and the
reset-control design are copied directly from a real, live-confirmed
precedent already shipped in `WFRCAnalytics/APP-WFRC-Commute-Patterns`
(constitution Principle VIII mandate tier) — see `research.md` §2 — not
independently re-derived.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), matching the rest of `src/`

**Primary Dependencies**: `maplibre-gl@^4.7.1` (already pinned — no new
dependency; this feature uses only its existing `fitBounds`/`IControl`/
`easeTo` API surface, confirmed directly against the installed package,
research.md §1)

**Storage**: N/A — no persisted data; all new state is in-memory
`useRef` values scoped to each panel's own mount lifetime (data-model.md)

**Testing**: Vitest (new `tests/unit/mapBounds.test.ts` for the pure
bounds-computation module) + Playwright (extends the existing
`tests/integration/flowmapPanel.spec.ts`/`zonemapPanel.spec.ts`, reading
`map.getZoom()`/`map.getCenter()` via each file's existing
`__flowmapTestMaps`/`__zonemapTestMaps` test-only registries)

**Target Platform**: Browser (Vite-built static web app), same as every
other panel type

**Project Type**: Single web app (this repository) — no separate
frontend/backend split

**Performance Goals**: N/A beyond "cheap" — bounds computation is a single
linear reduction over at most a few thousand points/polygon vertices,
called at most once per panel mount; no measurable performance goal beyond
not blocking the main thread (it doesn't touch DuckDB-WASM at all)

**Constraints**: No new npm dependency; MUST NOT alter the existing static-
default (`DEFAULT_CENTER`/`DEFAULT_ZOOM`) behavior for any panel that
already has an author-configured `center`/`zoom`, or for the loading/empty/
error states; MUST NOT touch `011`/`012`/`013`'s already-verified basemap-
switch, WebGL-interleaved-mode, or context-loss-recovery effect chains
beyond adding the new one-shot ref guard described in research.md §6

**Scale/Scope**: Two existing panel types (`FlowMapPanel.tsx`,
`ZoneMapPanel.tsx`); two new small shared modules
(`mapBounds.ts`, `resetViewControl.ts`); one CSS addition
(`mapControls.css`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed | ✅ PASS | All new/modified files are `.ts`/`.tsx`; no plain `.js` added |
| II. DuckDB-WASM off main thread, one shared instance | ✅ N/A | This feature never queries DuckDB — it consumes data/geometry already fetched by each panel's existing effects |
| III. No `eval()` | ✅ N/A | No SQL/dynamic code involved |
| IV. YAML parsed at runtime | ✅ PASS | Reuses the existing, already-runtime-parsed `config.center`/`config.zoom` fields — no new YAML grammar |
| V. Parquet-only browser data I/O | ✅ N/A | No new data format touched |
| VI. Fixed Technology Choices | ✅ PASS | MapLibre-only (`fitBounds`/`IControl`/`easeTo`, all native MapLibre API) — no Mapbox, no new charting/UI library |
| VII. Minimal, fixed config file set | ✅ PASS | No new config file type; no new `dashboard-*.yaml` grammar key (reuses existing `center`/`zoom`) |
| VIII. Reuse Proven Reference Implementations | ✅ PASS — actively exercised | A live, direct fetch of `WFRCAnalytics/APP-WFRC-Commute-Patterns`'s real, shipped `src/map.js` (mandate tier, "MapLibre + flowmap.gl/deck.gl overlays" category) found it already solves both halves of this feature in production; both the `fitBounds()` options shape and the reset-control design are copied from it directly (research.md §2), not re-derived. The zonemap-geometry half of the auto-fit has no reference-repo precedent (checked `ar-puuk/spatial-sql-explorer` directly — zero hits, research.md §4) and is therefore genuinely new work, which Principle VIII does not forbid when no reference actually covers it. |
| IX. Fixed Python/JS source split | ✅ N/A | No Python touched |

No violations — Complexity Tracking table below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/027-map-auto-fit-and-reset/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── map-auto-fit-and-reset.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── panels/
│   ├── mapBounds.ts            # NEW — pure, DOM-free bounds computation
│   ├── resetViewControl.ts     # NEW — shared IControl, both panel types
│   ├── mapControls.css         # MODIFIED — additive .wftdm-reset-view-button rules
│   ├── FlowMapPanel.tsx        # MODIFIED — auto-fit call + reset control wiring
│   └── ZoneMapPanel.tsx        # MODIFIED — auto-fit call + reset control wiring (+ 3D-reset)
tests/
├── unit/
│   └── mapBounds.test.ts       # NEW
└── integration/
    ├── flowmapPanel.spec.ts    # MODIFIED — additive scenarios
    └── zonemapPanel.spec.ts    # MODIFIED — additive scenarios
```

**Structure Decision**: Single web app, `src/panels/` — the same directory
every prior panel-type/map-feature (`010`, `011`, `012`, `013`, `015`) has
extended. No new top-level directory; `mapBounds.ts`/`resetViewControl.ts`
are new SIBLING files to the existing `flowmapData.ts`/`zoneGeometry.ts`/
`zonemap3dControl.ts`/`mapTooltip.ts`, following the exact same
"shared-across-both-map-panel-types plain `.ts` module" pattern
`mapTooltip.ts` already established (015-map-controls-polish).

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
