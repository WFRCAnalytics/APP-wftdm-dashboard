# Implementation Plan: Basemap Catalog Redesign and Settings Modal Visual Polish

**Branch**: `021-basemap-catalog-redesign` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-basemap-catalog-redesign/spec.md`

## Summary

Reorganize the Settings modal's Basemap tab catalog (020-settings-modal's
flat preset list) into four labeled sections — UGRC Vector Tiles (three
named composition aliases, extending `registry.ts`'s preset shape to
accept compositions, not just URLs), CARTO Vector Tiles, OpenFreeMap
(re-grouped, unchanged presets), and Raster Tiles (a curated,
programmatically-filtered subset of `leaflet-providers.json` containing
no key-requiring, HTTP-only, or unsupported-URL-token entries) — with one
persistent, shared live preview area above the sections and an explicit
stage-then-Apply interaction (clicking a UGRC/CARTO/OpenFreeMap/Raster
entry only stages a candidate and, for vector entries, updates the shared
preview; a separate Apply action is the only thing that actually changes
the live global basemap). Replace `resolveEffectiveBasemap()`'s
theme-paired fallback tier (`APP_DEFAULT_LIGHT`/`APP_DEFAULT_DARK`) with
one static `APP_DEFAULT` constant, dropping the now-unused `theme`
parameter and its only two callers' now-dead `useColorScheme()`
subscriptions. Give the Settings modal a fixed height/width and switch
its tab strip from horizontal to vertical (Radix Tabs' native
`orientation="vertical"`, no new primitive).

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3

**Primary Dependencies**: `@radix-ui/react-tabs` (already installed,
`orientation` prop used for the first time), `maplibre-gl` (already
installed — reused for the ONE shared preview map, no new map library, no
new UI-primitive dependency), Tailwind CSS (existing token/utility
classes only)

**Storage**: N/A — no persistence added; the global basemap pick remains
in-memory-only (constitution Principle VI, unchanged from 020-settings-modal)

**Testing**: Vitest (unit — `registry.ts`'s new catalog-curation logic,
`resolveEffectiveBasemap.ts`'s updated truth table), Playwright
(integration — `settingsModal.spec.ts`'s Basemap-tab and modal-sizing
coverage)

**Target Platform**: Browser (Vite-built static app, same as the rest of
this project)

**Project Type**: Single-project web frontend (no backend split)

**Performance Goals**: Exactly one preview-related WebGL context exists
for this whole feature — one persistent `maplibregl.Map`, created when
the Basemap tab becomes the active Settings tab and destroyed when it
stops being active (tab switch or modal close), re-styled via
`setStyle()` on every staged-selection change rather than recreated;
catalog curation (the raster-provider filter) reuses the already-cached
`leaflet-providers.json` fetch, no new network cost beyond what
`resolveRasterProvider()` already pays once per session.

**Constraints**: Zero catalog entries may require a viewer-supplied API
key (FR-006, hard constraint); no new persistence (constitution
Principle VI) — including the tab's own staged-but-unapplied selection,
which must never reach `state/basemapState.ts` until Apply is clicked
(FR-014); the panel-level/tab-level `basemap:` precedence tiers in
`resolveEffectiveBasemap()` must not change their relative order
(FR-017); the Settings modal's fixed size must still fit inside a short
viewport (existing `max-h-[85vh]`-style viewport-relative cap retained
alongside the new fixed target height).

**Scale/Scope**: 4 catalog sections; 3 new UGRC composition aliases; 8
already-shipped vector presets re-grouped, unchanged; ~17 curated raster
providers (several with multiple named variants) out of the real
36-provider `leaflet-providers.json` catalog; 1 modal layout change
(orientation + fixed sizing) affecting all 4 existing Settings tabs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. TypeScript Throughout, React Permitted | All new/changed files are `.ts`/`.tsx` inside the already-React-adopted `layout/settings/`, `panels/basemap/`, `panels/` trees. No new framework. | PASS |
| II. DuckDB off main thread | Untouched — this feature has no DuckDB interaction at all. | N/A |
| III. No `eval()` | No dynamic code execution introduced. | PASS |
| IV. YAML parsed at runtime | No `dashboard-*.yaml`/`summarize.yaml`/`manifest.yaml` grammar change — `basemap:` config parsing in dashboard YAML is completely unaffected (spec Assumptions). | N/A |
| V. Parquet-only browser I/O | Untouched — no data-file format involved. | N/A |
| VI. Fixed Technology Choices | MapLibre GL reused (no Mapbox); no Webpack; no `localStorage`/`sessionStorage` (global basemap pick, AND the tab's own staged selection, stay in-memory, per spec Assumptions); no new UI-primitive dependency at all — no Popover, no new Radix package. | PASS |
| VII. Minimal, Fixed Config File Set | No new config file type; no change to `summarize.yaml`/`dashboard-*.yaml`/`manifest.yaml`. | N/A |
| VIII. Reuse Proven Reference Implementations | UGRC composition endpoints are the exact ones already fixture-proven by 011/016/017 (no re-derivation); the shared preview map reuses this project's own already-established create-once/cleanup-effect map lifecycle pattern AND its `setStyle()`-based basemap-application effect shape (`FlowMapPanel.tsx`/`ZoneMapPanel.tsx`), not a new pattern. | PASS |
| IX. Fixed Python/JS Source Split | No Python changes. | N/A |

No violations. Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/021-basemap-catalog-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   ├── basemap-catalog.md
│   └── settings-modal-layout.md
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── panels/
│   └── basemap/
│       ├── types.ts                    # UNCHANGED — BasemapSource/
│       │                                # BasemapComposition/BasemapSelection
│       │                                # all unaffected by this feature
│       ├── registry.ts                 # CHANGED — BUILT_IN_PRESETS gains
│       │                                # composition-shaped entries (UGRC ×3);
│       │                                # APP_DEFAULT_LIGHT/APP_DEFAULT_DARK
│       │                                # collapse into one APP_DEFAULT; new
│       │                                # CuratedRasterProvider type +
│       │                                # listCuratedRasterProviders() export
│       ├── resolveEffectiveBasemap.ts  # CHANGED — drops the `theme` parameter
│       │                                # and the theme-paired fallback branch
│       └── loadBasemapStyle.ts         # UNCHANGED — already resolves both
│                                         # preset names and BasemapComposition
│                                         # objects; the 3 new UGRC aliases need
│                                         # nothing new here
├── panels/
│   ├── FlowMapPanel.tsx                # CHANGED — drop useColorScheme()/
│   │                                    # colorScheme (now unused once the
│   │                                    # resolver no longer takes a theme
│   │                                    # argument) and the now-3-argument
│   │                                    # resolveEffectiveBasemap() call
│   └── ZoneMapPanel.tsx                # CHANGED — same two changes as
│                                         # FlowMapPanel.tsx above
├── layout/
│   ├── settingsModal.tsx               # CHANGED — fixed-size DialogContent,
│   │                                    # vertical Tabs orientation/layout
│   └── settings/
│       └── basemapTab.tsx              # CHANGED — renders the four sections
│                                         # (plain labeled entries, no per-
│                                         # entry preview trigger), the ONE
│                                         # shared persistent preview map,
│                                         # stagedSelection state, the Apply
│                                         # button, the raster dropdown +
│                                         # loading/error/empty states, and
│                                         # the "Explore options" link
├── components/
│   └── ui/
│       └── tabs.tsx                    # CHANGED — vertical-orientation-aware
│                                         # styling (data-[orientation=...])
tests/
├── unit/
│   ├── registry.test.ts                # CHANGED/NEW cases — UGRC alias
│   │                                    # resolution, curated raster list
│   │                                    # filtering (key/HTTP/token checks)
│   └── resolveEffectiveBasemap.test.ts # CHANGED — updated truth table,
│                                         # 3-argument call signature throughout
└── integration/
    └── settingsModal.spec.ts           # CHANGED/NEW cases — sectioned
                                          # catalog, stage-then-Apply flow,
                                          # shared preview map's real
                                          # mount/unmount lifecycle, raster
                                          # dropdown + loading/error states,
                                          # fixed modal size across tab
                                          # switches, vertical tab layout
```

**Structure Decision**: Existing single-project layout, unchanged. All
work lands inside the already-established `src/panels/basemap/`,
`src/layout/settings/`, and `src/components/ui/` directories this
project's panel/registry conventions already define — no new top-level
directory, no new project.

## Complexity Tracking

*No Constitution Check violations — this section is not needed.*

## Post-Design Constitution Check

*Re-evaluated after Phase 1 (research.md, data-model.md, contracts/,
quickstart.md).*

Design decisions made during Phase 0/1 that could plausibly have
introduced a new violation, checked explicitly:

- **`listCuratedRasterProviders()` fetches `leaflet-providers.json`** —
  reuses the SAME cached fetch `resolveRasterProvider()` already performs
  (no new network dependency, no new "config file type" under Principle
  VII — this JSON file already exists and is already fetched by this
  project since 011-basemap-style-system). PASS.
- **One shared, persistent preview `maplibregl.Map`** — MapLibre only,
  matching Principle VI; bounded lifetime (mount-while-Basemap-tab-active
  only, exactly one instance ever), so it does not reintroduce the
  concurrent-WebGL-context risk 012-webgl-context-management addressed —
  in fact strictly less exposure than the per-entry-preview design an
  earlier draft of this plan considered and discarded (research.md's own
  revision note). PASS.
- **`BUILT_IN_PRESETS`'s generalized tagged-union shape** — an internal
  type change to an already-existing, already-React-adopted module; no
  new file category, no new principle implicated. PASS.
- **No new dependency of any kind** — this revision REMOVED the one new
  dependency (`@radix-ui/react-popover`) an earlier draft had introduced;
  the design now adds zero new packages, a strictly smaller footprint
  than what Phase 1 originally proposed. PASS, and more conservatively so
  than the prior draft.

No new violations introduced by the design. Constitution Check remains
fully passing.
