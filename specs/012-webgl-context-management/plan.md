# Implementation Plan: WebGL Context Management for Multi-Map Dashboards

**Branch**: `012-webgl-context-management` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-webgl-context-management/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`FlowMapPanel.tsx` currently pairs a non-interleaved `MapboxOverlay` with
every panel's own `maplibregl.Map` — two independent WebGL contexts per
panel. A tab configured with enough flowmap panels (this project's own
"Basemaps" fixture, six panels) can exceed Chromium's real, source-
confirmed 16-concurrent-context-per-renderer-process ceiling, silently
evicting the oldest contexts with no visible error. Phase 0 research
(below) rules out deck.gl's own View system as a fix — it requires one
shared canvas rendering one shared scene, architecturally incompatible
with this app's independently-laid-out, individually 004-expandable
panels, and MapLibre has no equivalent native multi-map-single-context
mechanism either (both confirmed against primary sources, not assumed).
The chosen approach is **interleaved `MapboxOverlay` mode** (halves
context cost to 1/panel, confirmed via deck.gl's own source and docs),
paired with **MapLibre's and deck.gl's own already-built-in
`webglcontextlost`/`webglcontextrestored` event plumbing** (a real,
source-confirmed finding: this is wiring up existing library events, not
building context-loss detection from scratch) for the honest-status
requirement (FR-001/FR-002/FR-006). Viewport-gated mounting (the third
researched option) is deliberately NOT built — interleaved mode alone
raises the per-tab ceiling from ~8 to ~16 panels, comfortably clearing
this feature's SC-001 floor (6 panels) without incurring viewport-
gating's own novel, unvalidated interaction risk against 004's
persistent-DOM expand/collapse mechanism.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18

**Primary Dependencies**: `maplibre-gl` `^4.7.1`, `@deck.gl/core` /
`@deck.gl/mapbox` / `@deck.gl/layers` `^9.0.0`, `@flowmap.gl/layers`
`^9.3.0` — all already pinned in the constitution's Technology Stack
Reference; this feature changes how they're wired together
(`interleaved: true` on the existing `MapboxOverlay`), not which
versions are used.

**Storage**: N/A — this feature touches only client-side WebGL/map
rendering lifecycle; no Parquet/DuckDB/YAML surface is affected.

**Testing**: Vitest (unit, for any new pure logic), Playwright
(integration/empirical — the mandatory real-context, real-pinned-version
proof this project has required for every map-rendering feature to date:
004, 010, 011).

**Target Platform**: Browser (Chromium-family primary target, per the
already-confirmed `kMaxGLActiveContexts` research; this feature's own
detection mechanism — FR-001/FR-002 — is written generically against the
standard `webglcontextlost`/`webglcontextrestored` events, not a
Chromium-specific code path, so it degrades gracefully on any browser
enforcing its own, possibly different, context ceiling).

**Project Type**: Single-page web application (existing Vite + React
dashboard; no new project/package boundary).

**Performance Goals**: Every flowmap panel on a dashboard tab configured
with at least as many panels as this project's own "Basemaps" fixture
(`tests/fixtures/dashboard-config/dashboard-3-basemaps.yaml`, 6 panels)
renders a working basemap in a production build (SC-001); interleaved
mode's real per-panel context cost (1, confirmed via deck.gl's own
source/docs) against Chromium's real 16-context ceiling gives a ~16-panel
theoretical floor, a >2.5x margin over the 6-panel proof floor.

**Constraints**: MUST NOT regress 004's persistent-DOM-node expand/
collapse guarantee (FR-004) or 011's basemap precedence/theme-switch
guarantee (FR-005); MUST be proven via a real empirical Playwright test
against this project's own pinned versions (FR-007/SC-005), not assumed
safe from deck.gl/MapLibre documentation alone; MUST be measured against
a **production build** (`npm run build`), since React 18 StrictMode's
dev-only 2x effect double-invocation (confirmed this session, `main.tsx`)
would otherwise distort the measured context count.

**Scale/Scope**: One panel type (`FlowMapPanel.tsx`) and its supporting
`panels/basemap/` module; no new panel type, no ZoneMapPanel work
(explicitly out of scope per spec.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. TypeScript Throughout, React Permitted When Needed** — PASS. All
  new/changed code is `.tsx`/`.ts` inside the existing React panel layer;
  no new plain `.js` file is introduced.
- **II. DuckDB-WASM Query Execution Off the Main Thread** — N/A. This
  feature touches no DuckDB/query code path at all.
- **III. No `eval()`** — PASS. No dynamic code execution is introduced;
  interleaved-mode wiring and context-loss listeners are ordinary
  library API calls.
- **IV. YAML Parsed at Runtime** — N/A. No new YAML config surface (no
  new `dashboard-*.yaml` key) — this is a rendering-lifecycle fix, not a
  new author-facing capability. Existing `basemap:`/`default_basemap:`
  keys (011) are consumed exactly as before.
- **V. Parquet-Only Browser Data I/O** — N/A. No data-format change.
- **VI. Fixed Technology Choices** — PASS. MapLibre stays MapLibre (no
  library swap, explicitly out of scope per spec.md); no new CSS
  framework/component library/icon set is introduced. The new
  context-lost status reuses the existing `PanelErrorState.tsx`/
  `PanelEmptyState.tsx` visual language (see data-model.md), not a new
  ad hoc UI pattern.
- **VII. Minimal, Fixed Config File Set** — PASS. No new config file
  type, no new key in any of the three existing types.
- **VIII. Reuse Proven Reference Implementations** — PASS, and
  extended by this feature's own Phase 0 research: `WFRCAnalytics/
  APP-Commute-Explorer` and `WFRCAnalytics/APP-WFRC-Commute-Patterns`
  remain the reference implementations for `MapboxOverlay`/MapLibre
  wiring; this feature's research.md documents, from primary sources
  (deck.gl's own docs/source, MapLibre's own source, real GitHub
  issues/discussions), why interleaved mode plus the libraries'
  already-built-in context-loss events is the correct pattern here,
  rather than re-deriving from scratch.
- **IX. Fixed Python/JS Source Split** — N/A. No Python package changes.

No violations requiring Complexity Tracking — every changed file lives
inside `src/panels/` and `src/panels/basemap/`, the same location 010/011
already established for this exact class of work.

**Post-Phase-1 re-check** (per this command's own "re-check after Phase
1 design" requirement): data-model.md and both contracts files add no
new dependency, no new config file/key, no new component library, and no
new DuckDB/YAML surface — every gate above still reads PASS/N/A exactly
as it did pre-research. One design correction made during this same
re-check, worth naming explicitly: an earlier draft of
`contracts/interleaved-overlay-survival.md` proposed a standalone
`reapplyCurrentLayer()` helper called directly from two long-lived event
handlers — confirmed, by tracing the real effect lifecycles, to read
permanently-stale `status`/`rows`/`config` from at least one call site
(a real stale-closure bug, not a style question). Corrected to route
both triggers through a new `layerRepopulateGeneration` state counter
added to the **existing** data-update effect's own dependency array,
reusing its already-correct, always-fresh `FlowmapLayer` construction
instead of duplicating it — see that contract's "Why not a standalone
helper function" section for the full trace. No Constitution gate is
affected by this correction (no new file, dependency, or pattern; if
anything it removes code duplication the first draft would have
introduced).

## Project Structure

### Documentation (this feature)

```text
specs/012-webgl-context-management/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── interleaved-overlay-survival.md
│   └── context-loss-detection.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Single project — this existing Vite + React dashboard app. No new
directory; every change lands inside a file 010/011 already created.

```text
src/
└── panels/
    └── FlowMapPanel.tsx    # MODIFIED — interleaved: true, contextLost
                             # state, webglcontextlost/restored listeners,
                             # a layerRepopulateGeneration state counter
                             # feeding the EXISTING data-update effect's
                             # own dependency array (not a new standalone
                             # helper — see contracts/interleaved-overlay-
                             # survival.md's "Why not a standalone helper
                             # function"), one new render branch.
                             # panels/basemap/,
                             # panels/flowmapData.ts, hooks/useColorScheme.ts
                             # are all UNCHANGED — this feature's own
                             # research.md §6 confirms recovery reuses
                             # 011's existing resolveEffectiveBasemap()/
                             # basemapKey() machinery verbatim, no new
                             # resolution logic to add there.

tests/
├── integration/
│   └── flowmapPanel.spec.ts   # MODIFIED — two new describe blocks
│                               # (contracts/interleaved-overlay-survival.md,
│                               # contracts/context-loss-detection.md);
│                               # 011's existing non-interleaved-mode
│                               # survival test stays unmodified
└── fixtures/
    └── dashboard-config/
        └── dashboard-3-basemaps.yaml   # UNCHANGED — this feature's own
                                          # SC-001 floor is measured
                                          # against 011's existing
                                          # 6-panel "Basemaps" fixture
                                          # as-is, no new fixture panel
                                          # needed
```

**Structure Decision**: Single project, no new top-level directory or
package boundary. This is a targeted fix to one existing panel type's
implementation, consistent with 010/011's own placement — every touched
file already exists; the only new files are this feature's own spec-kit
documentation artifacts.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
