# Implementation Plan: Basemap Style System

**Branch**: `011-basemap-style-system` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-basemap-style-system/spec.md`

## Summary

Replace `FlowMapPanel`'s hardcoded `BLANK_STYLE`-only basemap with a shared, theme-aware basemap system reusable by every current and future map-rendering panel type. A built-in registry ships three source categories (CARTO vector styles, OpenFreeMap vector styles, leaflet-providers raster tiles resolved dynamically from self-hosted provider-definition data, never from a live-executed Leaflet-dependent module) plus a generic multi-source composition mechanism, validated during development against UGRC's real 3-layer Vector Lite Base Map without shipping it as a preset. Basemap selection resolves through a three-level precedence — panel `basemap:` → tab `default_basemap:` → app's light/dark theme-paired default — computed by one pure, independently unit-tested function (`resolveEffectiveBasemap`) that also distinguishes an explicit pin from the app default, so a live theme toggle re-pairs only the latter. `setStyle()`'s survival of `MapboxOverlay`/`FlowmapLayer` across that toggle — substantially de-risked by real production evidence from `APP-WFRC-Commute-Patterns`, but not yet proven against this project's own pinned `maplibre-gl@^4.7.1`/`@deck.gl/mapbox@^9.0.0` — is verified by a new, dedicated empirical Playwright test before being relied upon anywhere else in this plan.

## Known gap this feature does NOT close — flag in completion reporting

**There is currently no user-facing way to trigger a light/dark theme
change anywhere in the running app.** `useColorScheme()` (research.md §3)
is a real, working *read* mechanism — it correctly reports whichever
theme is active and correctly drives `resolveEffectiveBasemap`/`setStyle()`
when that theme changes — but nothing in the navigable app can *cause* it
to change today. The only two things that can flip the `.dark` class are
`src/demo/DesignTokenDemo.tsx` (a deliberately out-of-band demo page, not
part of dashboard navigation) and this feature's own Playwright tests
(`page.evaluate(() => document.documentElement.classList.toggle('dark'))`,
quickstart.md Scenarios 1/2/4) — direct DOM manipulation, not a UI a
person could click.

This means SC-001/SC-002/User Story 1's "toggling the dashboard's
light/dark theme" acceptance criteria are provably correct as a
mechanism, end to end, but not yet *reachable* by an actual analyst using
the real app. This is not a defect in this feature's own scope — building
a theme-toggle control was never part of spec.md, and adding one here
would have been unrequested scope expansion into a different feature —
but it is the **same category of gap** `CLAUDE.md`'s own implementation-
order tracking already names explicitly for `services/duckdb.ts`'s
`registerScenario()`: "a receiving API with zero callers" until
`009-scenario-manager` built the picker UI that actually called it. This
feature is `registerScenario()`'s situation again, one layer up: a real,
correct *receiving* mechanism (`useColorScheme` / basemap resolution) with
no caller yet. Any completion report for this feature MUST say this
plainly — not "theme-aware basemaps are done," but "basemap theme-pairing
is done and correct; a real theme toggle is a separate, not-yet-built
feature this one is ready to consume the moment it exists." Whoever scopes
that future toggle feature should be pointed at `useColorScheme()` as the
already-built read side, the same way `009`'s own spec pointed at
`registerScenario()` as the already-built receiving side it needed to
call.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18 function components — no new language/runtime.

**Primary Dependencies**: `maplibre-gl` `^4.7.1` (already pinned — `setStyle()`/`Map` constructor `style:` accepts a URL string, used here for native relative-URL resolution on single-style presets), `@deck.gl/mapbox` `^9.0.0` (`MapboxOverlay`, already pinned) — no new *runtime* npm dependency for the raster-provider catalog. `leaflet`/`leaflet-providers` are added as **devDependencies only** (research.md §4), executed exclusively by a one-off Node extraction script; no `src/` file imports either, so Vite's production bundle stays MapLibre-only (constitution Principle VI unaffected).

**Storage**: A new self-hosted static data file (`public/basemap/leaflet-providers.json`), generated once by a dev-only extraction script and fetched at runtime the same way `public/dashboard-config/index.json` already is — not a new config file type under constitution Principle VII (it's discovery/reference data, same category as `public/scenarios/index.json`, not one of the three YAML config types).

**Testing**: Vitest (`resolveEffectiveBasemap`, the raster-provider `{s}`/`{r}` template transform, and the composition style-merge/relative-URL-rewrite logic — all pure, DOM-free) + Playwright (`tests/integration/`) for the real-browser `setStyle()`/overlay-survival empirical test (research.md §1) and every basemap-rendering acceptance scenario, extending `flowmapPanel.spec.ts`'s existing patterns (real DuckDB-WASM, fixture Parquet, fixture dashboard-config).

**Target Platform**: Browser (Chrome/Edge primary, per `README.md`'s existing cross-origin-isolation requirement) — no platform change.

**Project Type**: Single web app (existing `src/` structure) — no new project.

**Performance Goals**: A basemap style swap (theme toggle) completes with the flow-line overlay continuously visible — no target framerate/latency number specified in spec.md (SC-002 is a correctness, not performance, criterion); no new goal introduced here.

**Constraints**: `wftdm-dashboard here` must remain usable with zero built-in-preset network reachability (spec.md's offline edge case) — every source category falls back to the existing zero-network `BLANK_STYLE` uniformly (FR-010). No new external CDN dependency may be *required* (built-in presets are reachable-when-online conveniences, exactly like the existing DuckDB-WASM parquet-extension caveat `docs/ARCHITECTURE.md` already documents honestly rather than overstates).

**Scale/Scope**: One new panel-facing config surface (`basemap:` on `FlowMapPanelConfig`, `default_basemap:` on `DashboardTabConfig`) consumed today by the one existing map panel type (`flowmap`); designed for a future `zonemap` to adopt unchanged, not built here (spec.md's own explicit exclusion).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. TypeScript throughout, React permitted | All new modules are `.ts` (pure logic) or `.tsx` (the one modified component, `FlowMapPanel.tsx`) — no plain `.js` added to `src/`. | PASS |
| II. DuckDB-WASM off main thread, one shared instance | Untouched — this feature adds no DuckDB-WASM usage of its own. | PASS (N/A) |
| III. No `eval()` | The composition mechanism parses/merges JSON style documents (`fetch()` + object spread), never `eval()`/`Function()` on fetched content. | PASS |
| IV. YAML parsed at runtime | `basemap:`/`default_basemap:` are ordinary `dashboard-*.yaml` keys, parsed at runtime by the existing `js-yaml` pipeline — no build-time baking. | PASS |
| V. Parquet-only browser data I/O | Untouched — basemap style documents are JSON (a map-rendering config format, not application data), fetched the same way `manifest.yaml`/`dashboard-*.yaml` already are over HTTP; no CSV/OMX/GeoJSON is read as *data*. | PASS |
| VI. Fixed technology choices | MapLibre GL only (no Mapbox GL token/library introduced by any preset — CARTO/OpenFreeMap styles are plain MapLibre-spec `version: 8` JSON, confirmed by direct fetch in prior research); Vite only; no `localStorage`/`sessionStorage` (basemap resolution is derived fresh each render from config + live theme state, nothing persisted client-side). | PASS |
| VII. Minimal, fixed config file set | No fourth config file type. `basemap:`/`default_basemap:` are new *keys* inside the existing `dashboard-*.yaml` type, precedented by `header:`/`filters:`'s own tab scope (spec.md's confirmed grammar quote) — not a new file. `public/basemap/leaflet-providers.json` is discovery/reference data, same category as `public/scenarios/index.json`/`public/dashboard-config/index.json`, not a new config file type. | PASS |
| VIII. Reuse proven reference implementations | The `setStyle()`+`transformStyle` mechanism and non-interleaved `MapboxOverlay` survival pattern are reused directly from `APP-WFRC-Commute-Patterns`' real `src/map.js` (fetched and quoted verbatim in this session's prior research), per this principle's own designated-reference-repository discipline — though `APP-WFRC-Commute-Patterns` is not yet in the constitution's named table (see Complexity Tracking: not a violation, a documentation gap to flag for a future constitution amendment, not something this plan resolves itself). | PASS (see note) |
| IX. Fixed Python/JS source split | No Python package touched; all new files live under `src/`. | PASS |

No violations requiring justification — Complexity Tracking is empty.

**Re-checked after Phase 1 design** (research.md + data-model.md +
contracts/ complete): still PASS on every row. The one design decision
worth a second look against Principle III (no `eval()`/equivalent dynamic
execution) — `scripts/extractLeafletProviders.mjs`'s handling of the real
`leaflet-providers` UMD module — was resolved during Phase 0 by using the
real `leaflet`/`leaflet-providers` packages as devDependencies executed
via ordinary `require()`/`import`, specifically to avoid a `Function()`/
`eval()`-based text extraction that would have raised exactly this
question (research.md §4). No other new design element (the composition
merge/rewrite logic, `useColorScheme`'s `MutationObserver`, the
`resolveEffectiveBasemap` pure function) touches any gated principle.

## Project Structure

### Documentation (this feature)

```text
specs/011-basemap-style-system/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── basemap-types-and-registry.md
│   ├── resolve-effective-basemap.md
│   ├── load-basemap-style.md
│   └── flowmap-panel-basemap-integration.md
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── panels/
│   ├── basemap/                        # NEW — shared across flowmap now, zonemap later
│   │   ├── types.ts                    # BasemapSelection, BasemapPreset ref, BasemapComposition, EffectiveBasemap
│   │   ├── registry.ts                 # built-in CARTO/OpenFreeMap style URLs; resolveRasterProvider()
│   │   ├── resolveEffectiveBasemap.ts  # pure 3-level precedence + pin-vs-default resolver (research.md §2)
│   │   └── loadBasemapStyle.ts         # async: EffectiveBasemap -> maplibregl.StyleSpecification | URL | BLANK_STYLE
│   ├── FlowMapPanel.tsx                # MODIFIED — consumes resolveEffectiveBasemap/loadBasemapStyle, setStyle() on theme change
│   └── flowmapData.ts                  # unchanged
├── layout/
│   ├── types.ts                        # MODIFIED — DashboardTabConfig.default_basemap, FlowMapPanelConfig.basemap
│   └── dashboardRenderer.tsx           # MODIFIED — resolves + injects each map panel's EffectiveBasemap before render
└── hooks/
    └── useColorScheme.ts               # NEW — observes document.documentElement's Tailwind `.dark` class (research.md §3)

public/
└── basemap/
    └── leaflet-providers.json          # NEW — self-hosted, dev-extracted provider-definitions data (research.md §4)

scripts/
└── extractLeafletProviders.mjs         # NEW — dev-only, one-time/refresh extraction script (not a runtime dependency)

tests/
├── unit/
│   ├── resolveEffectiveBasemap.test.ts # NEW — pure precedence/pin-vs-default logic (research.md §2)
│   ├── resolveRasterProvider.test.ts   # NEW — {s}/{r} template expansion
│   └── loadBasemapStyle.test.ts        # NEW — composition merge + relative-URL rewrite (DOM-free parts only)
└── integration/
    └── flowmapPanel.spec.ts            # MODIFIED — adds basemap default/override/fallback/theme-switch scenarios,
                                         # including the empirical setStyle()/overlay-survival test (research.md §1)
```

**Structure Decision**: Single existing web app (`src/`) — no new project or workspace. New logic is a peer directory to the existing `panels/` pure-module pattern (`panelQuery.ts`, `flowmapData.ts`, `sankeyGraph.ts`), grouped under `panels/basemap/` since it's shared infrastructure rather than one panel type's own transform, mirroring how `services/` already groups cross-panel infrastructure. `FlowMapPanel.tsx` and `dashboardRenderer.tsx` are the only two existing files modified; every other new file is additive.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. One documentation gap noted under Principle VIII above (`APP-WFRC-Commute-Patterns` used as a reference implementation but not yet listed in the constitution's Principle VIII table, which currently names `APP-Commute-Explorer`, `omx-viewer`, `spatial-sql-explorer`, and `parquet-viewer`) is flagged for a future constitution amendment — it does not block this plan, since Principle VIII requires *looking to* proven references, not exclusively the four currently named ones, and this session's own research already confirmed `APP-WFRC-Commute-Patterns` as real, active, and directly on-point.
