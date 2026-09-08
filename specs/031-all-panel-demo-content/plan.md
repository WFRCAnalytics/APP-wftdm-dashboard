# Implementation Plan: Expand Real ActivitySim Demo Content to All Ten Panel Types

**Branch**: `031-all-panel-demo-content` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/031-all-panel-demo-content/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Extend the real, already-working `026-activitysim-demo-content` pipeline
(`summarize.yaml`, the `wftdm-dashboard summarize` CLI, the three real
scenarios) so all ten panel types render real, non-fabricated data. Five
panel types (`observable-plot`, `recharts`, `graphic-walker`, `markdown`,
and `zonemap`) need only new `dashboard-*.yaml` content against metrics
that already exist. Two (`sankey`, `flowmap`) need one small new
`summarize.yaml` metric each, both computed from already-loaded real
columns. `flowmap`/`zonemap` additionally need a one-time, offline
geometry-sourcing step — a new standalone script that pulls real TAZ 1-25
polygon geometry directly from MTC's own public FeatureServer (confirmed
reachable and correspondence-verified in this session's own prior
research) and produces two real artifacts: a GeoParquet boundary file
(published to a new git-tracked `public/demo-geometry/` root) and a real
centroid lookup (pasted into `summarize.yaml` as a `sql_fragments` VALUES
table). No change to the post-processor's core engine code, and no
change to `030-sidebar-navigation`'s own work.

## Technical Context

**Language/Version**: TypeScript ES2022 (dashboard content/loader change); Python 3 (the new one-time geometry script, matching `python/wftdm_dashboard/postprocessor/`'s existing `duckdb`-based conventions) — both unchanged from this project's existing stack.

**Primary Dependencies**: `duckdb` (Python, native — already a dependency of `python/wftdm_dashboard/postprocessor/pipeline.py`; the new script additionally uses its `spatial` extension, the same `INSTALL spatial; LOAD spatial;` pattern `panels/zoneGeometry.ts` already uses browser-side, now on the native/offline side) and Python's standard-library `urllib`/`requests`-equivalent HTTP client for the one-time MTC FeatureServer pull. No new JS/TS dependency.

**Storage**: New real, git-tracked static assets — `public/demo-geometry/taz25.geoparquet` (new root, mirroring `026`'s own `public/demo-scenarios/`/`public/demo-dashboard-config/` precedent) — plus `summarize.yaml`'s own existing `sql_fragments`/`metrics` blocks gaining new real entries. No database/service storage.

**Testing**: `python/tests/` (pytest) for the new metrics' SQL, exercised the same way `025`'s own existing `test_pipeline.py` already does (a real, small raw-CSV fixture in, a real Parquet out); Playwright for the new/changed panels rendering real data; a real, reproducible re-run of the actual `wftdm-dashboard summarize` CLI against the three real raw scenario directories (this project's own established end-to-end verification standard, per `025`'s/`026`'s own completion records).

**Target Platform**: Browser (unchanged) for panel rendering; native desktop Python (not WASM) for the new one-time geometry script — this is the offline side of Constitution Principle V's browser/offline split, run once by a developer, never by an end user or the deployed app.

**Performance Goals**: No new runtime performance target — the new metrics are small (25 zones, a handful of purpose/mode categories) and the geometry file is a one-time, static asset, not a per-request computation.

**Constraints**: FR-001's hard, non-negotiable constraint governs every other decision in this plan: zero fabricated/placeholder/synthetic data anywhere; any panel type whose real-data requirement proves unachievable is reported, not faked.

**Scale/Scope**: 3 real scenarios (unchanged), 25 real zones, 7 panel types gaining real demo content (3 already have it), 2 new `summarize.yaml` metrics, 1 new one-time geometry script, 1 new git-tracked content root.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against every one of the constitution's nine principles directly:

| Principle | Check | Result |
|---|---|---|
| I. TypeScript throughout, React permitted | The one TS change (`zoneGeometry.ts`'s fallback path) stays `.ts`; no new React usage | ✅ Pass |
| II. DuckDB-WASM off main thread, one instance | Not touched — the new geometry script runs NATIVE DuckDB offline, never in the browser/WASM at all | ✅ Pass (N/A) |
| III. No `eval()` | Not touched — new metric SQL is plain templated text via the existing `$sql.x`/`$mappings.x` mechanism, same as every existing metric | ✅ Pass |
| IV. YAML parsed at runtime | The new `sql_fragments`/`metrics` entries are ordinary `summarize.yaml` content, parsed by the existing, unmodified `config.py` at CLI-run time (post-processor side) — no browser-side YAML shape changes beyond what `030` already covers, out of scope here | ✅ Pass |
| V. Parquet-only browser I/O; offline geometry conversion | Directly on-point — the new geometry script is exactly this principle's own "conversion happens offline" pattern applied to a genuinely new source (a live MTC FeatureServer instead of a local shapefile), producing a real GeoParquet the browser only ever reads, never converts | ✅ Pass |
| VI. Fixed technology choices | MapLibre/DuckDB/Vite/Tailwind unchanged; the new script's own HTTP fetch is a one-time, developer-run, offline step — never a runtime browser network call, so it doesn't introduce a new browser-side dependency | ✅ Pass |
| VII. Minimal, fixed config file set | No new config file TYPE — `summarize.yaml` gains new entries within its existing grammar; the new GeoParquet is a data artifact (like every other `summary/*.parquet` output), not a config file | ✅ Pass |
| VIII. Reuse proven reference implementations | Not applicable — no DuckDB-WASM/MapLibre/Vite-setup pattern is being newly implemented; the new script's DuckDB-spatial usage reuses THIS project's own already-proven `zoneGeometry.ts`/`tests/fixtures/generate.py` conventions (WKB output shape), not a new external reference | ✅ Pass (N/A) |
| IX. Fixed Python/JS source split | The new one-time script lives at `scripts/build-demo-zone-geometry.py` (repo root, mirroring `scripts/copy-fixtures.js`'s existing convention), NOT under `src/wftdm_dashboard/` — no re-creation of the forbidden path | ✅ Pass |

**No violations found. Complexity Tracking table below is intentionally
empty.**

## Project Structure

### Documentation (this feature)

```text
specs/031-all-panel-demo-content/
├── plan.md                          # This file
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   ├── new-metrics.md               # Sankey/FlowMap SQL contract
│   └── geometry-pipeline.md         # One-time geometry script + zonemap loader fallback contract
└── tasks.md                         # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

Single-project layout (existing structure, unchanged). This feature
touches four existing areas plus one new script — no new top-level
directory beyond the new content root:

```text
summarize.yaml                        # MODIFIED — repo-root, never published
                                       # (unchanged fact). Gains:
                                       #  - sql_fragments.zone_centroids
                                       #    (new — a real (zone_id, lat, lon)
                                       #    VALUES table, pasted in from the
                                       #    new script's own output)
                                       #  - metrics: purpose_mode_flow (new,
                                       #    Sankey)
                                       #  - metrics: od_flows (new, FlowMap)

scripts/
└── build-demo-zone-geometry.py       # NEW — one-time, offline. Pulls real
                                       # TAZ 1-25 geometry from MTC's public
                                       # FeatureServer, writes
                                       # public/demo-geometry/taz25.geoparquet
                                       # (WKB, matching the browser's
                                       # existing ST_GeomFromWKB read
                                       # contract) and prints the real
                                       # centroid VALUES block for
                                       # summarize.yaml. Run once by a
                                       # developer via
                                       # `uv run python scripts/
                                       # build-demo-zone-geometry.py` —
                                       # mirrors tests/fixtures/generate.py's
                                       # own invocation convention, but
                                       # produces permanent, git-tracked
                                       # content instead of a regenerated
                                       # test fixture.

public/
└── demo-geometry/                    # NEW — real, git-tracked, permanent
    └── taz25.geoparquet              # (never gitignored, never touched by
                                       # copy-fixtures.js) — mirrors
                                       # public/demo-scenarios/'s own
                                       # 026-established precedent

src/panels/
└── zoneGeometry.ts                   # MODIFIED — resolveGeometryUrl()
                                       # gains a second candidate URL
                                       # (public/demo-geometry/{boundaries}),
                                       # tried only if the primary
                                       # public/geometry/{boundaries} fetch
                                       # fails — no new PanelConfig field,
                                       # no threading of "which content
                                       # root" through dashboardRenderer.tsx

public/demo-dashboard-config/         # MODIFIED/NEW files — real panels for
├── dashboard-1-overview.yaml         # the 7 newly-covered panel types,
├── dashboard-2-destination-choice.yaml # using the 3 existing real
├── dashboard-3-transit-service.yaml  # scenarios throughout (data-model.md
├── dashboard-4-flows.yaml            # decides exact new-vs-existing-file
├── dashboard-5-explore.yaml          # placement)
└── index.json                        # MODIFIED — lists any new files

python/tests/
└── test_pipeline.py                  # MODIFIED — real fixture coverage for
                                       # the two new metrics (purpose_mode_flow,
                                       # od_flows), same pattern every
                                       # existing metric already has
```

**Structure Decision**: Single-project layout, existing conventions
throughout — the one new top-level addition (`public/demo-geometry/`)
follows `026-activitysim-demo-content`'s own already-established
"new, separate, git-tracked content root" pattern exactly; the one new
script (`scripts/build-demo-zone-geometry.py`) follows the existing
`scripts/`-directory convention (`copy-fixtures.js`, `postinstall.js`)
for one-off repo tooling that isn't part of either the installable
`python/wftdm_dashboard` package or the `src/` app.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this table is intentionally empty (see Constitution Check
above).

## Constitution Check — post-Phase-1 re-evaluation

Re-checked against Phase 0/1's actual design output:

- **Principle V (offline geometry conversion)**: confirmed still clean —
  `contracts/geometry-pipeline.md` (Phase 1) keeps the MTC FeatureServer
  fetch entirely inside the one-time, developer-run script; the shipped
  app/pipeline never makes that network call.
- **Principle VII (fixed config file set)**: confirmed still clean — the
  new `summarize.yaml` entries are additive content within its existing
  grammar (`data-model.md` §1); no fourth config file type appears
  anywhere in the design.
- **No new violation surfaced by Phase 1 design.** Gate still passes;
  Complexity Tracking remains empty.
