# Implementation Plan: Real ActivitySim scenario content — summarize.yaml, post-processed scenarios, and dashboard panels

**Branch**: `026-activitysim-demo-content` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-activitysim-demo-content/spec.md`

## Summary

Author one `summarize.yaml` against ActivitySim's real, confirmed `final_*.csv` column shape and run it, unmodified, three times through the already-built `wftdm-dashboard summarize` CLI (025-python-postprocessor) — once each against the baseline, land-use-density-variant, and transit-service-variant raw ActivitySim outputs already sitting in scratch storage from this session's earlier work. Publish the three resulting scenario folders, plus three new `dashboard-*.yaml` tabs that visualize both documented causal stories (TAZ 1 destination-choice pull; AM/PM `WALK_LOC` mode-share shift) and exercise the existing `$baseline` diff mechanism for the first time against real data. Per explicit user decision, this content is published to a **new, separate, git-tracked top-level root** (`public/demo-scenarios/`, `public/demo-dashboard-config/`) rather than the existing `public/scenarios/`/`public/dashboard-config/` paths, which stay reserved for the ephemeral, gitignored fixture-copy workflow. Discovery of the new root is wired into the boot sequence via small, additive code (a second `loadDashboards()` call already supported by its existing `baseUrl` parameter with no code change; one new parallel function in `scenarioDiscovery.ts` mirroring the existing `registerPublishedScenarios()`).

## Technical Context

**Language/Version**: YAML (config authoring only) + existing TypeScript (ES2022, additive boot-sequence code) + existing Python 3.11+ (post-processor, unmodified — this feature is a consumer of it, not a change to it)

**Primary Dependencies**: `wftdm-dashboard summarize` CLI (025-python-postprocessor, already built/tested — invoked as-is); `services/scenarioDiscovery.ts` / `services/yamlLoader.ts` (already built — extended additively, not modified); no new npm or PyPI dependency

**Storage**: Files only — Parquet (post-processor output) + YAML (`summarize.yaml` authored once; `dashboard-*.yaml` × 3 authored; `manifest.yaml` × 3 auto-generated) + JSON (2 new `index.json` discovery files)

**Testing**: Manual/visual verification per `quickstart.md` (this is authored content + a small additive code change, not a new capability needing new unit/integration test coverage of its own — the existing Vitest/Playwright suite is explicitly untouched per FR-009); the two new `scenarioDiscovery.ts`/`main.tsx` lines get the same manual boot-sequence smoke check every prior additive discovery change in this project has used

**Target Platform**: Browser (Vite dev server / static build) — same as the rest of the app; content generation itself runs offline via the existing CLI, already proven cross-platform in 025

**Project Type**: Web application (existing single-repo TS frontend + Python post-processor package) — this feature adds config/data content plus ~15–20 lines of additive TS, no new project

**Performance Goals**: N/A — three small scenario folders (25-zone `prototype_mtc` scale: ~5,000 households, ~8,200 persons, ~9,800 tours, ~23,600 trips per scenario), well within DuckDB-WASM's already-proven capacity for the existing fixture scenarios

**Constraints**: MUST NOT modify `tests/fixtures/`, the automated test suite, `copy-fixtures.js`, or the existing `public/observed/`/`public/scenarios/`/`public/dashboard-config/` registration behavior (FR-009/FR-010); MUST NOT introduce new `summarize.yaml`/`dashboard-*.yaml` grammar (FR-012); no `zonemap` panel (FR-007, no real usable zone geometry — Research Finding #5)

**Scale/Scope**: 1 `summarize.yaml` (5 metrics), 3 scenario folders (post-processor output only, not hand-authored), 3 `dashboard-*.yaml` files + 2 `index.json` files, ~15–20 lines of new TypeScript across 2 existing files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. TypeScript Throughout | ✅ PASS | The only new code is TypeScript, added to existing `.ts` files (`scenarioDiscovery.ts`, `main.tsx`) — no new `.js` files. |
| II. DuckDB-WASM off main thread, one shared instance | ✅ PASS | Unaffected — new content registers through the existing `registerFileURL()`/`AsyncDuckDB` singleton, no new instance. |
| III. No `eval()` | ✅ PASS | No SQL assembly logic is added at all; `summarize.yaml`'s SQL uses only the existing `$mappings`/`$bins`/`$sql` string-templated placeholders. |
| IV. YAML parsed at runtime | ✅ PASS | The 3 new `dashboard-*.yaml` files are fetched/parsed at runtime by the existing, unmodified `loadConfig()`/`js-yaml` path — nothing is baked in at build time. |
| V. Parquet-only browser I/O | ✅ PASS | The browser only ever reads the post-processor's Parquet output; the raw `final_*.csv` files are read exclusively by the offline `wftdm-dashboard summarize` CLI, never fetched by the browser. |
| VI. Fixed technology choices | ✅ PASS | No map panel is used (FR-007) — MapLibre/Mapbox is a non-issue for this feature. No `localStorage`, no new build tool, no new CSS/component library. |
| VII. Minimal, fixed config file set | ✅ PASS | Only the 3 existing config types are used (`summarize.yaml`, `dashboard-*.yaml`, `manifest.yaml`); the 2 new `index.json` files are discovery metadata, the same already-established category as `public/scenarios/index.json` (constitution does not count these as a 4th config type; the project's own docs already draw this line). |
| VIII. Reuse proven reference implementations | ✅ PASS (N/A) | No DuckDB-WASM/MapLibre/spatial-SQL wiring is touched by this feature — nothing in this principle's scope applies. |
| IX. Fixed Python/JS source split | ✅ PASS | No new Python package code is added — the existing `python/wftdm_dashboard/postprocessor/` is invoked via its existing CLI, unmodified. |

No violations. No entries needed in Complexity Tracking.

**Post-design re-check** (after Phase 1 `data-model.md`/`contracts/`): unchanged — the finished design introduces no new panel type, no new config file type, no new SQL-expander grammar, no new dependency, and confirms (rather than merely assumes) `loadDashboards()`/`registerPublishedScenarios()` require zero modification (research.md #4). All 9 principles remain ✅ PASS.

## Project Structure

### Documentation (this feature)

```text
specs/026-activitysim-demo-content/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── summarize-config.md
│   └── discovery.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
# Authored config content (this feature's actual deliverable)
summarize.yaml                          # authored once, at repo root alongside model
                                         # scripts per CLAUDE.md's documented convention
                                         # (never published to the browser)

public/
├── demo-scenarios/                     # NEW — git-tracked, real content root
│   ├── index.json                      # ["activitysim-baseline", "activitysim-density-variant",
│   │                                    #  "activitysim-transit-variant"] — baseline FIRST,
│   │                                    #  so it resolves as the automatic diff baseline (FR-006)
│   ├── activitysim-baseline/
│   │   ├── manifest.yaml               # auto-generated by `wftdm-dashboard summarize`
│   │   └── summary/*.parquet           # 5 metric Parquet files
│   ├── activitysim-density-variant/
│   │   ├── manifest.yaml
│   │   └── summary/*.parquet
│   └── activitysim-transit-variant/
│       ├── manifest.yaml
│       └── summary/*.parquet
└── demo-dashboard-config/              # NEW — git-tracked, real content root
    ├── index.json                      # ["dashboard-1-overview.yaml",
    │                                    #  "dashboard-2-destination-choice.yaml",
    │                                    #  "dashboard-3-transit-service.yaml"]
    ├── dashboard-1-overview.yaml        # landing page: KPIs, overall mode share, trip purpose
    ├── dashboard-2-destination-choice.yaml  # Story 1 + Story 3 ($baseline diff)
    └── dashboard-3-transit-service.yaml     # Story 2

# Additive TypeScript changes (existing files, small diffs only)
src/
├── services/
│   └── scenarioDiscovery.ts            # + registerDemoScenarios(), called from
│                                        #   discoverScenarios() alongside the existing
│                                        #   registerObserved()/registerPublishedScenarios()
└── main.tsx                            # + a second loadDashboards() call against
                                         #   `${base}demo-dashboard-config/`, concatenated
                                         #   with the existing dashboards array
```

**Structure Decision**: No new project or package. This feature is (a) one authored `summarize.yaml` run three times through the existing, unmodified post-processor CLI to produce three scenario folders, (b) three authored `dashboard-*.yaml` files, (c) two new discovery `index.json` files, all published under a new, git-tracked `public/demo-*/` root per the explicit user decision recorded in spec.md, and (d) the minimum additive TypeScript needed for the boot sequence to also discover that new root — two existing files gain a few lines each; nothing existing is rewritten or behaviorally changed for its current callers.
