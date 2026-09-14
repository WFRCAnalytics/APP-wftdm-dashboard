# Implementation Plan: Lazy, Tab-Scoped Data Loading

**Branch**: `056-lazy-tab-scoped-loading` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/056-lazy-tab-scoped-loading/spec.md`

## Summary

Replace this app's current eager-at-boot behavior — every active
scenario's every metric (~35 Parquet files each) registered before the
landing tab ever renders — with loading scoped to whatever the viewer's
current tab actually references, deduplicated within that tab, for
whichever scenarios are active. A new small dispatcher,
`services/tabDataLoader.ts`, computes each tab's real data requirement
(data-model.md entity 1) and lazily registers it (`ensureRegistered()`,
entity 4) the first time it's needed — on first tab visit, or when a
viewer activates a scenario while already viewing a tab that needs it.
`scenarioDiscovery.ts`'s boot-time registration shrinks to fetching each
scenario's real metric catalog (already fetched today, just newly retained
as `availableMetrics` — entity 3) without eagerly loading any of it. The
one deliberately hard case — GraphicWalker's dataset picker, whose whole
purpose is exposing every real dataset regardless of what's loaded — is
solved by pointing it at that same retained catalog instead of the live
DuckDB view registry, confirmed via real, live-browser verification not to
be currently regressed (research.md §4a). A real, measured sweep
(research.md §4) confirmed the existing multi-instance loader pool
(`duckdbLoaderPool.ts`, 052) is never faster than the single shared
DuckDB-WASM instance at any batch size this feature produces — it is
retired as part of this same plan, which also fully resolves a
pre-existing, unamended Constitution Principle II violation the pool had
introduced.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), existing app — no new
language/tooling.

**Primary Dependencies**: None new. Reuses `@duckdb/duckdb-wasm` (existing,
via `services/duckdb.ts`), React 18 (existing hook/effect patterns).
`duckdbLoaderPool.ts` is a dependency this feature *removes* (research.md
§4 — real measurement, not reused).

**Storage**: N/A — browser-side DuckDB-WASM views over Parquet fetched by
URL, no persistent storage (constitution Principle VI forbids
`localStorage`/`sessionStorage`; this feature's new in-memory load-state
map is session-lifetime only, same as every other piece of `appState.ts`).

**Testing**: Vitest (new pure-function unit tests for
`computeTabDataRequirement()`, mirroring `dashboardLayout.ts`'s existing
test file), Playwright (existing integration suite re-run for regression
per quickstart.md §5, plus new specs covering US1–US3's acceptance
scenarios).

**Target Platform**: Browser (unchanged) — no platform-specific concern
beyond what already exists.

**Project Type**: Single web app (existing `src/` structure) — not a new
project.

**Performance Goals**: Landing-tab time-to-interactive independent of
total deployment metric/scenario count (spec.md SC-001); total data loaded
in a session scales with tabs actually visited, not the full deployment
(SC-002).

**Constraints**: Zero change to query *results* for any existing
scenario/filter combination (spec.md FR-009) — this feature changes
loading timing only. No change to `$baseline`/comparison-diff resolution
(`panelQuery.ts#resolveComparisonScenarioName()`), `sqlExpander.ts`, or any
panel's rendered output shape.

**Scale/Scope**: This deployment's real current shape — 8 tabs, 3–13
distinct metrics per tab, 35 total metrics, up to ~3–5 scenarios typically
active. A real sweep at these sizes (research.md §4) confirmed the single
shared DuckDB-WASM instance beats the old multi-instance pool at every one
of them — no dispatch threshold exists; the pool is removed.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v2.4.1, principle by
principle:

| Principle | Status | Notes |
|---|---|---|
| I. TypeScript throughout, React permitted | ✅ Pass | No plain `.js` added; existing React panel pattern reused unmodified. |
| **II. DuckDB-WASM off main thread, ONE shared instance** | ✅ **Pass — pre-existing violation RESOLVED by this plan, not conditionally** | See below. Real measurement (research.md §4) settled this before Phase 1 design was finalized; no open question remains. |
| III. No `eval()` | ✅ Pass | No SQL construction changes; `buildPanelQuery()`/`sqlExpander.ts` untouched. |
| IV. YAML parsed at runtime | ✅ Pass | No dashboard-content pre-processing introduced; `computeTabDataRequirement()` reads the already-runtime-parsed `DashboardTabConfig`, same as `dashboardLayout.ts` already does. |
| V. Parquet-only browser I/O | ✅ Pass | Same file format, same `registerFileURL()` primitive — only *when* it's called changes. |
| VI. Fixed technology choices | ✅ Pass | No new dependency; new in-memory state, not Web Storage. |
| VII. Minimal, fixed config file set | ✅ Pass | No new config file type — `availableMetrics` is a runtime-derived `appState` field, not a config file. |
| VIII. Reuse proven references | ✅ Pass (N/A) | Neither mandated reference app (`APP-WFRC-Commute-Patterns`, `spatial-sql-explorer` — confirmed directly this session) implements per-tab lazy loading; both load their (much smaller) real datasets eagerly. No existing pattern to copy here — this is genuinely new design work for this app, which Principle VIII does not forbid (its mandate is scoped to DuckDB-WASM/Arrow wiring, map overlays, spatial-SQL, and coi-serviceworker setup, not application-level data-loading strategy). |
| IX. Fixed Python/JS source split | ✅ Pass | No Python package changes. |

### Principle II — the real, pre-existing finding

Principle II's literal text: *"exactly one shared `AsyncDuckDB` instance
MUST serve the whole app... no other module may construct its own
`AsyncDuckDB` or `Worker` instance."* `services/duckdb.ts#
createLoaderInstance()` **already does exactly that** — its own header
comment documents, plainly, that it creates fresh, independent `AsyncDuckDB`
instances for `duckdbLoaderPool.ts`'s pool, "NEVER the shared singleton."
This was built by `052-option3-implementation` and is live on `main` today.
Checked the constitution's own Sync Impact Report history (every amendment
back to v1.0.0, read in full) — no amendment covering this exists. This is
a **real, already-shipped violation of Principle II's literal text**,
predating this plan, not something this plan introduces.

This plan does not paper over it — and, as of this revision, does not
leave it conditional either. A real empirical sweep was run directly
against the live app (research.md §4, both a warm-cache and a genuinely
cold-cache pass, real `page.evaluate()` calls into the actual, unmodified
`registerFileURL()`/`registerFilesViaPool()` exports): **the single shared
instance is faster than the pool at every real batch size this feature
produces (3–39 files), under both cache conditions, by 43–99%.** This is
not a close call resolved by tuning a threshold — the pool's cheapest
measured cost (~870ms, dominated by spinning up fresh `AsyncDuckDB`
instances on every call) exceeds the single instance's most expensive
measured cost (593ms, cold cache, the largest real single-tab batch).

**Resolution: `services/duckdbLoaderPool.ts` and `services/duckdb.ts#
createLoaderInstance()` are retired as part of this feature — no
dispatcher, no threshold, `ensureRegistered()` always uses the single
shared instance.** This is reinforced independent of the sweep: this
feature's own redesign of `scenarioDiscovery.ts` (data-model.md entity 4)
removes the ~105-file eager-boot event the pool was built for in the first
place (052) — after this feature ships, nothing in the app calls
`registerFilesViaPool()` at all. Removing the pool removes Principle II's
violation at its source. **No constitution amendment is needed** — the
conditional Complexity Tracking entry that would have named one below is
retracted; see that section.

## Project Structure

### Documentation (this feature)

```text
specs/056-lazy-tab-scoped-loading/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   ├── tab-data-loader.md
│   └── graphic-walker-dataset-catalog.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

Existing single-web-app structure (`src/`), no new top-level directories.
Real files this feature touches or adds:

```text
src/
├── services/
│   ├── tabDataLoader.ts        # NEW — computeTabDataRequirement(),
│   │                            #   ensureRegistered(), getMetricLoadState()
│   │                            #   (contracts/tab-data-loader.md)
│   ├── scenarioDiscovery.ts    # MODIFIED — Phase 2 stops eagerly
│   │                            #   registering files; Phase 1 additionally
│   │                            #   populates availableMetrics
│   ├── duckdb.ts                # MODIFIED — createLoaderInstance()
│   │                            #   REMOVED (research.md §4: no caller
│   │                            #   after this feature); registerFileURL()
│   │                            #   itself unchanged, new caller only
│   └── duckdbLoaderPool.ts     # REMOVED entirely — research.md §4's real
│                                #   sweep confirmed it is never faster at
│                                #   this feature's batch sizes, and this
│                                #   feature removes its only real caller
│                                #   (scenarioDiscovery.ts's old eager
│                                #   full-scenario registration)
├── state/
│   └── appState.ts              # MODIFIED — Scenario gains
│                                #   availableMetrics: string[]
├── layout/
│   └── dashboardRenderer.tsx    # MODIFIED — computes/triggers the active
│                                #   tab's Tab Data Requirement on tab
│                                #   activation / active-scenario change
├── panels/
│   ├── graphicWalkerDatasets.ts # MODIFIED — listSelectableDatasets()
│   │                            #   reads availableMetrics, not listViews()
│   │                            #   (contracts/graphic-walker-dataset-
│   │                            #   catalog.md)
│   ├── GraphicWalkerPanel.tsx   # MODIFIED — one ensureRegistered() call
│   │                            #   added to its existing fetch effect
│   ├── ValueBoxPanel.tsx        # MODIFIED — same one-call addition
│   ├── PlotlyPanel.tsx          # MODIFIED — same
│   ├── TablePanel.tsx           # MODIFIED — same
│   ├── ObservablePlotPanel.tsx  # MODIFIED — same
│   ├── SankeyPanel.tsx          # MODIFIED — same
│   ├── RechartsPanel.tsx        # MODIFIED — same
│   ├── FlowMapPanel.tsx         # MODIFIED — same
│   └── ZoneMapPanel.tsx         # MODIFIED — same
│                                # (MarkdownPanel.tsx: no change — not
│                                #   data-bound, per spec.md Edge Cases)
tests/
├── unit/
│   └── tabDataLoader.test.ts    # NEW — computeTabDataRequirement() pure-
│                                #   function coverage
└── integration/
    └── lazyTabLoading.spec.ts   # NEW — US1–US3 acceptance scenarios
```

**Structure Decision**: no structural change to the existing single-app
layout — this feature adds one new `services/` module and touches existing
files at their established layer (`services/`/`state/`/`layout/`/
`panels/`), following the same "split pure logic into its own testable
module" convention this codebase already uses throughout (`dashboardLayout.ts`,
`tableLogic.ts`, `sankeyGraph.ts`, etc. — CLAUDE.md's own documented
pattern).

## Complexity Tracking

**Empty — no violation requiring justification.** The conditional entry
this section would have carried (a sanctioned exception for
`duckdbLoaderPool.ts`'s multiple `AsyncDuckDB` instances) does not apply:
research.md §4's real sweep confirmed the pool is never faster than the
single shared instance at any batch size this feature produces, so this
plan retires the pool instead of carrying a justified violation. Principle
II is satisfied cleanly, not by exception.
