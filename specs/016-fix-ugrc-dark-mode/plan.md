# Implementation Plan: Fix UGRC map compositions rendering incorrectly in dark mode

**Branch**: `016-fix-ugrc-dark-mode` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-fix-ugrc-dark-mode/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

The Flowmap UGRC Composition and Flowmap UGRC Outdoors Composition panels
(real ArcGIS VectorTileServer basemap compositions, `composeStyles()`) render
with corrupted/inverted-looking colors specifically in dark mode, on real
hardware-accelerated WebGL — never under Playwright's SwiftShader software
rendering. Five rounds of same-day investigation ruled out every app-level
CSS/JS mechanism this codebase controls (filters, opacity, stacking,
`setStyle()` re-application, `composeStyles()` itself, and — across two
precisely isolated variants — the `color-scheme` CSS property). **A critical
methodological gap drives this plan's approach**: every one of those
rule-out tests ran under Playwright/SwiftShader, an environment confirmed
incapable of reproducing the defect *regardless of any CSS state* — so none
of them are actually informative about the real, hardware-triggered
mechanism. This plan does not chase another CSS hypothesis inside that same
blind environment. Instead, Phase 0 research reframes the leading
hypothesis around a class of mechanism that fits every confirmed fact
better — a browser- or extension-level "force/auto dark mode for web
content" feature acting on the rendered canvas *after* this app's own CSS
and JS have already run — and Phase 1 produces a short, precise,
human-executable diagnostic protocol plus pre-built candidate fixes gated
on its outcome, since closing this investigation requires the user's real
hardware, not another automated test run.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3

**Primary Dependencies**: `maplibre-gl` `^4.7.1`, `@deck.gl/mapbox`/`core` `^9.0.0`, `@flowmap.gl/layers` `^9.3.0` — no new dependency anticipated; this is a rendering-correctness fix within the existing `panels/basemap/` + `mapControls.css` surface.

**Storage**: N/A — no data model changes; `composeStyles()`'s output and `BasemapSelection`/`EffectiveBasemap` types (`panels/basemap/types.ts`) are reused unmodified.

**Testing**: Vitest (unit, `tests/unit/`), Playwright (integration, `tests/integration/`) — but see Constraints below: Playwright/SwiftShader is confirmed **unable to reproduce this specific defect under any condition**, so it can only prove SC-006 (fix is inert where nothing was broken), never SC-001 (the fix actually works). Real-hardware verification is a manual, human-executed step, not an automated CI gate, for this feature only.

**Target Platform**: Browser (Chromium and Firefox confirmed affected; both on real hardware-accelerated WebGL, GPU/driver-dependent) — same target as every existing map panel.

**Project Type**: Single project — static web app (`src/`), no backend change.

**Performance Goals**: N/A — visual-correctness fix, no throughput/latency target.

**Constraints**:
- The defect is confirmed to require real, hardware-accelerated WebGL (NVIDIA Quadro RTX 4000 + current driver, in the one machine it's been confirmed on) — it has never reproduced under Playwright's bundled SwiftShader software renderer, on either browser engine tested.
- Because of the above, **root-cause confirmation and fix verification both require a human running a documented protocol on real hardware and reporting results back** — this plan cannot close on green CI alone the way every prior feature in this repo has. `tasks.md` (next command) MUST include explicit human-checkpoint tasks, not just automated ones.
- Any fix touching `color-scheme` MUST NOT regress the native `<select>`/form-control dark-mode styling that property exists for (`tokens.css`, `015-theme-toggle`) — scoping, not removal, is the only acceptable shape for that branch.
- Any fix MUST NOT regress any other flowmap/zonemap panel's already-correct dark-mode rendering (FR-007) or these two panels' own already-correct dark-mode chrome (card/heading/nav controls, FR-006).

**Scale/Scope**: Two named panels today (`Flowmap UGRC Composition`, `Flowmap UGRC Outdoors Composition`, `tests/fixtures/dashboard-config/dashboard-3-basemaps.yaml`); FR-010 prefers a fix that generalizes to any future composition with the same sensitivity, not one hardcoded to these two titles.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle VI (Fixed Technology Choices)** — MapLibre GL only, no Mapbox: unaffected: this fix reads/writes CSS and `panels/basemap/` code, no map library swap considered or needed.
- **Principle VIII (Reuse Proven Reference Implementations)** — no new pattern is being introduced that has a proven reference to copy from; the relevant references (`APP-Commute-Explorer`, `APP-WFRC-Commute-Patterns`) were already consulted while building `010`/`011`/`012` and don't cover a browser-extension/force-dark class of defect. No violation — this principle doesn't mandate a reference for every fix, only for the listed technology areas (DuckDB-WASM/Arrow wiring, MapLibre+deck.gl overlays, spatial-SQL/GeoParquet, Vite+coi-serviceworker setup), none of which this fix touches.
- **No new config file types, no `eval()`, no localStorage, no main-thread DuckDB** — none of these are implicated by a CSS/canvas rendering fix.
- **Development Workflow (panel pattern)** — no new panel type or panel component; `FlowMapPanel.tsx`'s existing effect structure is unchanged regardless of which fix branch is taken (a CSS-scope fix needs no component change at all; the FR-008 fallback, if it comes to that, would add a config-read inside the existing basemap-effect, not a new pattern).

**Result**: PASS. No amendment needed. Re-checked after Phase 1 below.

**Post-Phase-1 re-check**: PASS, unchanged. Phase 1's `contracts/` define
a CSS-only, scoped selector addition (Branch A) and a documentation-only
protocol (the diagnostic contract) — neither introduces a new
dependency, config file type, panel pattern, or technology choice.
Branch C (if selected) stays inside `FlowMapPanel.tsx`'s existing effect
structure per `plan.md`'s Project Structure section above. No gate is
newly implicated by the design artifacts.

## Project Structure

### Documentation (this feature)

```text
specs/016-fix-ugrc-dark-mode/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── diagnostic-protocol.md
│   └── map-canvas-color-scheme-scope.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── panels/
│   ├── mapControls.css           # candidate location for a scoped CSS fix
│   │                              # (Branch A) — already imported by both
│   │                              # FlowMapPanel.tsx and ZoneMapPanel.tsx,
│   │                              # already the file that carries every
│   │                              # other MapLibre-default-override in
│   │                              # this app
│   ├── FlowMapPanel.tsx          # candidate location for a per-panel
│   │                              # fallback (Branch C, FR-008) if no
│   │                              # general fix is confirmed — the
│   │                              # existing basemap-application effect
│   │                              # already reads `effectiveBasemap`/
│   │                              # `colorScheme`; a fallback would gate
│   │                              # a narrow, named exception there
│   └── basemap/
│       ├── loadBasemapStyle.ts   # composeStyles() — confirmed
│       │                          # theme-blind already; no change
│       │                          # expected unless Branch C names
│       │                          # specific compositions
│       └── types.ts              # BasemapSelection/EffectiveBasemap — no
│                                  # change expected
└── styles/
    └── tokens.css                 # color-scheme declarations (015) — no
                                    # change expected under Branch A/B;
                                    # touched only if a hypothesis
                                    # specifically implicates the global
                                    # declaration itself, not a map-scoped
                                    # override

tests/
├── integration/
│   ├── flowmapPanel.spec.ts       # existing dark-mode regression
│   │                                coverage (NavigationControl etc.) —
│   │                                extended with an inert-on-SwiftShader
│   │                                check (SC-006), not a
│   │                                reproduces-the-bug check (SC-001,
│   │                                which this suite structurally cannot
│   │                                perform — see Technical Context)
│   └── zonemapPanel.spec.ts       # same, for zonemap's own dark-mode
│                                    coverage (FR-007 no-regression)
└── unit/
    └── loadBasemapStyle.test.ts   # unchanged unless Branch C touches
                                    composeStyles()
```

**Structure Decision**: Single project, existing `src/panels/` + `src/panels/basemap/` layout — no new directories. This is a targeted fix within the existing map-panel/basemap-system code, not a new feature surface.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
