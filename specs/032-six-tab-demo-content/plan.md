# Implementation Plan: Six-Tab ActivitySim Demo Content

**Branch**: `032-six-tab-demo-content` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/032-six-tab-demo-content/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Replace the demo dashboard's current narrow three-tab structure (Overview,
Destination Choice, Transit Service) with the full six-tab ActivitySim
calibration outline `project-docs/CALIBRATION-SUMMARIES.md` already documents
(Summary, Person/Household Models, Tour Models, Mode Choice, Trip Models,
Network), backed entirely by real ActivitySim output from the same three
scenarios (baseline, TAZ-1 density variant, transit-service variant)
already produced this session. Phase 0 research directly audited every
documented submodel against real, installed `configs/settings.yaml` and
real CSV column headers/values from that output: 34 of 40 documented
summaries are genuinely computable using only this project's existing
`$mappings`/`$bins`/`$sql_fragments` post-processor grammar; 6 (including
two Level-1/starred ones — Work from Home, Telecommute Frequency) are
real, confirmed gaps because their ActivitySim components never ran in
this configuration. Explore (`dashboard-5-explore.yaml`) is untouched.
Every one of the ten registered panel types is used at least once,
chosen for genuine data-shape fit (`research.md` §7). `project-docs/CALIBRATION-
SUMMARIES.md` itself is corrected to reflect the 6 real gaps and two
smaller, incidentally-found documentation inaccuracies (`research.md`
§8/`contracts/calibration-summaries-corrections.md`).

## Technical Context

**Language/Version**: TypeScript (ES2022, `src/`) + Python 3.10 (`python/wftdm_dashboard/`, via `uv run`)

**Primary Dependencies**: Existing only — `js-yaml`, DuckDB-WASM (browser), native DuckDB + PyYAML (offline post-processor), the ten already-shipped `panels/*.tsx` components. No new npm or PyPI dependency.

**Storage**: Parquet files under `public/demo-scenarios/{scenario}/summary/`, written by the existing `wftdm-dashboard summarize` CLI; `public/demo-geometry/taz25.geoparquet` (already published by `031`, reused unmodified — `research.md` §3).

**Testing**: `python/tests/test_pipeline.py` (pytest, new cases per new metric's real-data invariant), `tests/unit/` (Vitest, if any new pure logic module is needed — none anticipated, since this feature is content-only), `tests/integration/` (Playwright, extending `demoContentAllPanels.spec.ts` for the new tab filenames and full ten-panel-type coverage).

**Target Platform**: Same as the rest of this project — static web app (GitHub Pages / self-hosted) + offline Python CLI. No new platform surface.

**Project Type**: Web application content/config authoring — no new source module, only `summarize.yaml` metric additions, `dashboard-*.yaml` authoring, `project-docs/CALIBRATION-SUMMARIES.md` corrections, and republished Parquet output.

**Performance Goals**: Unchanged from the existing demo dashboard — Summary tab's value boxes still load first from the smallest real Parquet file, other panels load progressively (`CLAUDE.md`'s Boot sequence).

**Constraints**: Zero fabricated/placeholder/synthetic data anywhere (spec.md's Hard Constraint); no new post-processor engine code (FR-010); Explore tab untouched byte-for-byte (FR-004); every new metric expressed through existing `$mappings`/`$bins`/`$sql_fragments` grammar only.

**Scale/Scope**: 6 dashboard YAML files (5 new/rewritten + `index.json` update), ~27 new `summarize.yaml` metrics + 2 new segmentation mechanisms (`data-model.md` §2-§3), 3 corrections to `project-docs/CALIBRATION-SUMMARIES.md`, 3 real scenario re-publications (existing CLI, unmodified invocation shape).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed | No new source files of any kind — this feature is YAML/doc/Parquet content only | ✅ N/A, no violation possible |
| II. DuckDB-WASM off main thread, one shared instance | Unchanged — no new query path, panels reuse existing `services/duckdb.ts` | ✅ Pass |
| III. No `eval()` — SQL via string replacement only | Every new metric's SQL uses only existing `$mappings`/`$bins`/`$sql` substitution (`sqlExpander.ts`/`expand.py`), confirmed unmodified (FR-010) | ✅ Pass |
| IV. YAML parsed at runtime | New `dashboard-*.yaml` files are fetched/parsed the same way as every existing one — no build-time inlining | ✅ Pass |
| V. Parquet-only browser I/O | Every new metric publishes Parquet via the existing CLI; browser never reads the raw ActivitySim CSVs | ✅ Pass |
| VI. Fixed Technology Choices | No new library, no new chart engine — all ten panel types already exist | ✅ Pass |
| VII. Minimal, Fixed Config File Set | Only `summarize.yaml` (metrics) and `dashboard-*.yaml` (tabs) are touched — both already-existing config types; no fourth type introduced | ✅ Pass |
| VIII. Reuse Proven Reference Implementations | No new map/DuckDB-WASM/Vite wiring — `zonemap`/`flowmap` panels in the Network tab reuse `panels/basemap/`/`panels/zoneGeometry.ts` completely unmodified | ✅ Pass |
| IX. Fixed Python/JS Source Split | No new Python or JS source file — `python/wftdm_dashboard/postprocessor/` gains zero new modules (FR-010) | ✅ Pass |

**Gate result**: PASS. No amendment needed, no complexity to justify.

## Project Structure

### Documentation (this feature)

```text
specs/032-six-tab-demo-content/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — real ActivitySim reuse decision,
│                         # full submodel computability audit, distance-
│                         # computation approach, file renumbering decision
├── data-model.md        # Phase 1 output — the full 40-row computability
│                         # inventory (§1), new $mappings/$bins entries (§2),
│                         # 27 new metric schemas (§3), six-tab structure (§4)
├── quickstart.md         # Phase 1 output — 6 runnable validation scenarios
├── contracts/            # Phase 1 output
│   ├── summarize-metrics.md              # shared metric shape rules
│   ├── dashboard-tab-structure.md        # index.json + per-tab grammar
│   └── calibration-summaries-corrections.md  # exact doc edits required
├── checklists/
│   └── requirements.md   # spec quality checklist (all pass)
└── tasks.md              # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

This feature touches **content and configuration only** — no new
TypeScript, Python, or test-harness module. The real, concrete paths
affected:

```text
summarize.yaml                              # +2 mappings/bins entries, +27 metrics
project-docs/CALIBRATION-SUMMARIES.md               # 3 corrections (contracts/calibration-summaries-corrections.md)

public/demo-dashboard-config/
├── index.json                              # rewritten: 6 new/renamed tabs + unchanged Explore entry
├── dashboard-1-overview.yaml               # DELETED
├── dashboard-2-destination-choice.yaml     # DELETED
├── dashboard-3-transit-service.yaml        # DELETED
├── dashboard-4-network.yaml                # RENAMED + REWRITTEN -> dashboard-6-network.yaml
├── dashboard-6-flows.yaml                  # DELETED (panels folded into 4/6 below)
├── dashboard-1-summary.yaml                # NEW
├── dashboard-2-person-household.yaml       # NEW
├── dashboard-3-tour-models.yaml            # NEW
├── dashboard-4-mode-choice.yaml            # NEW
├── dashboard-5-trip-models.yaml            # NEW
├── dashboard-6-network.yaml                # NEW (see rename above)
└── dashboard-5-explore.yaml                # UNTOUCHED (byte-for-byte)

public/demo-scenarios/
├── activitysim-baseline/summary/*.parquet          # republished (existing CLI, expanded summarize.yaml)
├── activitysim-density-variant/summary/*.parquet   # republished
└── activitysim-transit-variant/summary/*.parquet   # republished

python/tests/test_pipeline.py                # + new cases, one per new metric's real-data invariant
tests/integration/demoContentAllPanels.spec.ts  # updated for new tab filenames + full 10-panel-type coverage
```

No file under `src/` or `python/wftdm_dashboard/postprocessor/` changes —
confirmed by the Constitution Check above (Principles I/IX).

**Structure Decision**: Single-project structure (this repo already is
one) — a pure content/config feature layered entirely on top of already-
shipped code (`025`'s post-processor engine, `030`'s sidebar/section
mechanism, all ten `panels/*.tsx` types). No new source directory, no new
test directory; existing `python/tests/` and `tests/integration/` gain
cases, nothing new is scaffolded.

## Complexity Tracking

*No entries — the Constitution Check above found zero violations to
justify.*
