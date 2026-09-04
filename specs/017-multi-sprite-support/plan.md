# Implementation Plan: Multi-sprite support in composeStyles()

**Branch**: `017-multi-sprite-support` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-multi-sprite-support/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`composeStyles()` (`src/panels/basemap/loadBasemapStyle.ts`) currently
keeps only the first composed layer's `sprite` field ("first sprite
wins") and never rewrites `icon-image` references, so a symbol layer
from any layer *other* than the first can never resolve its own icons
— confirmed as the exact cause of both UGRC composition panels'
missing highway/route-shield icons (016's own investigation surfaced
this as a distinct, separate defect). `maplibre-gl@^4.7.1` (confirmed
directly against the installed package's real types and runtime
bundle) natively supports a multi-sprite array (`sprite: string |
{id, url}[]`, colon-prefixed `icon-image` lookup, `"default"` id
special case) — this plan replaces "first wins" with collecting every
composed layer's sprite into that array form, and uniformly rewrites
every symbol layer's own literal-string `icon-image` value with its
originating layer's own namespaced prefix (FR-004's own "no
special-cased single-sprite skip" requirement). Phase 0 research
directly, exhaustively resolves the one open question the spec
carried forward (does any real, currently-composed layer's
`icon-image` use an expression, not a literal?) against all five real
UGRC services this app currently composes — answer: no, zero of 39
symbol layers with `icon-image` use anything but a literal string —
and confirms the fix is verifiable entirely via Playwright (no GPU/
real-hardware dependency), unlike 016.

## Technical Context

**Language/Version**: TypeScript (ES2022 target)

**Primary Dependencies**: `maplibre-gl` `^4.7.1` (no new dependency — its own already-present multi-sprite support is what this feature uses); no other package touched.

**Storage**: N/A — no data model changes; this is a pure in-memory style-composition transform inside `composeStyles()`.

**Testing**: Vitest (`tests/unit/loadBasemapStyle.test.ts`, already covers `composeStyles()` extensively) + Playwright (`tests/integration/flowmapPanel.spec.ts`) — both fully sufficient for this feature. Unlike `016-fix-ugrc-dark-mode`, this defect and its fix are confirmed **not** GPU/color-management-dependent: sprite/icon resolution is a data-lookup process (fetch sprite JSON, match icon-image string against its keys) that Playwright's SwiftShader software rendering performs identically to real hardware — MapLibre's own public `map.hasImage(id): boolean` API (confirmed present in the installed `.d.ts`) gives a precise, real, automatable assertion with no visual/pixel inspection needed.

**Target Platform**: Browser (any — this fix has no hardware/GPU dependency, a deliberate contrast with 016).

**Project Type**: Single project — static web app (`src/`), no backend change.

**Performance Goals**: N/A — correctness fix, not a performance feature. One additional consideration: today's single `merged.sprite` (a string, when present) becomes an array — negligible additional payload (a handful of `{id,url}` objects) and no additional network requests beyond what already-fetched (MapLibre fetches each declared sprite's own `.json`/`.png` regardless of whether it's the single-string or array form).

**Constraints**:
- `composeStyles()` is a general, shared function — every composition, current and future, flows through it (`FR-006`). This fix must not special-case the two UGRC panels by name, URL, or title.
- Zero regression to any composition with only one (or zero) sprite-declaring layers (`FR-003`, `User Story 2`) — the *rendered* icon must be identical; the *reference string* is explicitly allowed to change (`FR-004`).
- `composeStyles()`'s existing `layer${i}__` source/layer-id prefix convention already exists and should inform, but not necessarily equal, the new sprite-id convention — MapLibre's own sprite `id` and this function's own source/layer prefixes are different namespaces serving different purposes (Phase 0 research settles the exact string used).

**Scale/Scope**: Five real, currently-composed UGRC services today (`LiteBase`, `LiteLabels`, `OutdoorsBase`, `Outdoors_Labels`, `Vector_Overlay`) across three real compositions (`Flowmap UGRC Composition`, `Flowmap UGRC Outdoors Composition`, `Flowmap UGRC Vector Hybrid`); the fix must generalize beyond these (`FR-006`/`User Story 3`), not be scoped to only what exists today.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle VI (Fixed Technology Choices)** — MapLibre GL only: unaffected; this fix uses MapLibre's own already-present, already-pinned-version style-spec capability, no library swap.
- **Principle VIII (Reuse Proven Reference Implementations)** — not implicated; this is a MapLibre style-spec-level capability (documented in MapLibre's own spec/docs, confirmed against the installed package directly), not a pattern one of the designated reference repos demonstrates. No violation — the principle names specific technology areas (DuckDB-WASM/Arrow, MapLibre+deck.gl overlays, spatial-SQL/GeoParquet, Vite+coi-serviceworker), and sprite composition isn't one of the areas requiring a reference-repo pattern.
- **No new config file types, no `eval()`, no localStorage, no main-thread DuckDB** — none implicated by an in-memory style-object transform.
- **Development Workflow (panel pattern)** — no new panel type or component; `FlowMapPanel.tsx`/`ZoneMapPanel.tsx` consume `composeStyles()`'s output unchanged (both already handle a `sprite` field being either shape, since that's MapLibre's own concern, not this app's — no panel-level code change anticipated).

**Result**: PASS. No amendment needed. Re-checked after Phase 1 below.

**Post-Phase-1 re-check**: PASS, unchanged. Phase 1's `data-model.md`/
`contracts/` describe an in-memory transform inside one existing
function's return value — no new dependency, config file type, panel
pattern, or technology choice. No gate is newly implicated by the
design artifacts.

## Project Structure

### Documentation (this feature)

```text
specs/017-multi-sprite-support/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── compose-styles-multi-sprite.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
└── panels/
    └── basemap/
        └── loadBasemapStyle.ts   # composeStyles() — the ONLY file this
                                   # feature changes. The existing
                                   # per-layer loop (lines ~271-324)
                                   # already computes `prefix` (the
                                   # `layer${i}__` source/layer-id
                                   # namespace) at exactly the point
                                   # sprite collection and icon-image
                                   # rewriting both need to happen —
                                   # both slot into the SAME loop
                                   # iteration, no new pass over the
                                   # data required. Replaces the
                                   # existing `if (!merged.sprite && ...)
                                   # merged.sprite = ...` block (lines
                                   # 316-320) with unconditional
                                   # collection into an array; extends
                                   # the existing `rewrittenLayers`
                                   # `.map()` (lines 309-314) to also
                                   # rewrite `layout['icon-image']`
                                   # when present and a literal string.

tests/
├── unit/
│   └── loadBasemapStyle.test.ts  # extend with: multi-sprite array
│                                  # collection, icon-image rewrite
│                                  # (literal case), single-sprite case
│                                  # (still gets the array form + prefix,
│                                  # per FR-004's own no-special-case
│                                  # requirement), zero-sprite case
│                                  # (unchanged — nothing to collect)
└── integration/
    └── flowmapPanel.spec.ts      # extend the existing UGRC composition
                                   # tests with `map.hasImage(...)`
                                   # assertions for the specific
                                   # highway-shield icon names
                                   # confirmed present in research.md —
                                   # this IS the automated proof this
                                   # feature's own FR-007/SC-004 asks
                                   # for, no real-hardware step needed
```

**Structure Decision**: Single project, single file touched
(`loadBasemapStyle.ts`) plus its own existing test files extended — no
new modules, no new directories. This is a narrowly-scoped, general
bug fix within one already-well-tested function, not a new feature
surface.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
