# Implementation Plan: Migrate the test suite from synthetic fixtures to real demo-dashboard-config content

**Branch**: `040-test-suite-migration` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/040-test-suite-migration/spec.md`

## Summary

Delete `tests/fixtures/dashboard-config/` (5 synthetic dashboard files) and its supporting synthetic-data machinery, and rewrite the ~24 Playwright integration specs that depend on it to assert against `public/demo-dashboard-config/`'s seven real ActivitySim tabs and the three real demo scenarios. Error/edge-case coverage (~25 deliberately-broken panels + the `broken_scenario` role) moves to a new git-tracked `public/demo-dashboard-config/dashboard-8-test.yaml`, registered as an eighth tab **only during test runs** by inverting the existing `tests/global-setup.js` `index.json`-manipulation mechanism (add an entry for tests instead of hiding demo entries from them). The test tab's sidebar entry renders visually blank (no icon, no visible label, `aria-label` only) via a new opt-in `header.blank_nav` flag — the one deliberate, documented `src/` touch (2 files, ~8 lines; an optional `header` key, like `030`'s `icon`/`full_page`). `tests/fixtures/generate.py` and the synthetic Parquet it produced become dead and are deleted; `observed` registers `failed` in tests exactly as it does in the real deployed demo. Delivered in four phases (foundation → panel-mechanic specs → shell/nav specs → scenario-manager family), each ending with a green `npm run test:integration`.

## Technical Context

**Language/Version**: TypeScript (Playwright `*.spec.ts`, plus a ~8-line touch to `src/layout/sidebarNav.tsx` + one optional field in `src/layout/types.ts` — see Structure Decision), JavaScript ESM (test harness: `tests/global-setup.js` / `global-teardown.js` / `scripts/copy-fixtures.js`), YAML (`dashboard-8-test.yaml`).

**Primary Dependencies**: `@playwright/test` (existing), `js-yaml` (existing, via the app's own runtime `dashboard-*.yaml` loader). No new dependency.

**Storage**: N/A — git-tracked files only. `dashboard-8-test.yaml` is discovered at runtime via `public/demo-dashboard-config/index.json`, the same mechanism as the seven real tabs.

**Testing**: The Playwright integration suite (`tests/integration/`, 25 spec files) is the subject of this feature. The Vitest unit suite (`tests/unit/`) is untouched. Verification = `npm run test:integration` green after every phase and at completion.

**Target Platform**: Chromium via Playwright (`playwright.config.js` `webServer` = raw `vite` dev server on `127.0.0.1:5199`); Node ≥ 20 for the harness.

**Project Type**: Web application — this feature operates on its test-infrastructure layer.

**Performance Goals**: Full suite green with **no data-generation pre-step** (the `pretest:integration` hook running `generate.py` is removed). Suite wall-clock is not a target of this feature.

**Constraints**:
- `dashboard-8-test.yaml` MUST be absent from the `index.json` that ships in a production build — real users never see an eighth tab (FR-002).
- The seven real demo tabs and the demo data/pipeline (features 025/026/031/032) MUST NOT change (spec Out of Scope).
- The harness mutates the shared `public/demo-dashboard-config/index.json` for every run; must be safe under Playwright's observed 10-worker cross-spec-file parallelism, or explicitly locked (spec Edge Cases).
- "Trace and remove completely, don't leave orphaned code" (constitution-adjacent discipline, feature 012 precedent) — no dead copy-in logic, variables, imports, or comments after removal.

**Scale/Scope**: 25 integration spec files (24 migrated, 1 — `formInputPrimitives.spec.ts` — unchanged); ~25 deliberately-broken test panels relocated to `dashboard-8-test.yaml`; 3 harness files redesigned; 2 fixture generators/dirs deleted; 4 delivery phases.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still PASS.*

| Principle | Assessment |
|---|---|
| **I. TypeScript Throughout, React Permitted When Needed** | PASS. The only `src/` change is TypeScript in existing `.tsx`/`.ts` files (`sidebarNav.tsx`, `types.ts`) — no new `.js` in `src/`. The "no new plain `.js`" rule does not reach `tests/` harness files, which are already `.js` and stay `.js`. Playwright specs stay `.ts`. |
| **II. DuckDB-WASM off main thread, one shared instance** | PASS — not touched. Tests continue to exercise the app's single `services/duckdb.ts` instance against real Parquet; no test constructs its own DuckDB. |
| **III. No eval()** | PASS — not touched. |
| **IV. YAML parsed at runtime** | PASS, and reinforced. `dashboard-8-test.yaml` is a `dashboard-*.yaml` file parsed at runtime by `js-yaml` via the same `loadDashboards()` path as the seven real tabs — no build-time inlining. |
| **V. Parquet-only browser I/O** | PASS, and improved. The feature *removes* synthetic Parquet generation; the browser reads only the real demo Parquet/GeoParquet. |
| **VI. Fixed Technology Choices** | PASS — no new framework, component library, icon set, or dependency. |
| **VII. Minimal, Fixed Config File Set** | PASS. `dashboard-8-test.yaml` is **another instance of the existing `dashboard-*.yaml` type**, not a new config file type — exactly like `tests/fixtures/dashboard-config/dashboard-4-sidebar-demo.yaml` already is today (a test-only `dashboard-*.yaml` not listed in the shipped `index.json`). The new `header.blank_nav` key is an **optional field on an existing type**, added the same way `030-sidebar-navigation` added `header.icon` and `header.full_page` — not a new config file, not a new discovery file. `index.json` remains the sole discovery list. |
| **VIII. Reuse Proven Reference Implementations** | N/A — no DuckDB/MapLibre/deck.gl/Vite wiring in scope. |
| **IX. Fixed Python/JS Source Split** | PASS. `generate.py` lives under `tests/fixtures/`, not `python/wftdm_dashboard/` or `src/`; deleting it does not touch either fixed tree. |

**Result: PASS, no violations, no Complexity Tracking entries required.** The `src/` touch (below) is a deliberate, documented deviation from the spec's "no `src/` changes" preference — not a constitution violation — justified exactly as feature 032's `shell.tsx`/`sidebarNav.tsx` fix was (serving a real, confirmed need surfaced by otherwise-in-scope work).

## Project Structure

### Documentation (this feature)

```text
specs/040-test-suite-migration/
├── spec.md              # /speckit-specify output (done)
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── dashboard-8-test.md        # what dashboard-8-test.yaml MUST contain + the invisible-in-prod rule
│   ├── test-harness.md            # global-setup.js / global-teardown.js / copy-fixtures.js redesigned behavior
│   └── spec-migration.md          # per-file migration contract: real demo target + real values per panel-type spec
├── checklists/
│   └── requirements.md            # /speckit-specify output (done)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

Files this feature **adds**:

```text
public/demo-dashboard-config/
└── dashboard-8-test.yaml          # NEW — git-tracked, test-only tab of deliberately-broken panels
```

Files this feature **deletes**:

```text
tests/fixtures/
├── dashboard-config/              # DELETE — all 5 files (dashboard-1-summary/-2-detail/-3-basemaps/-4-sidebar-demo.yaml, index.json)
├── generate.py                    # DELETE — synthetic Parquet generator (Q2)
├── observed/                      # DELETE — observed registers `failed` in tests now (Q1)
├── scenarios/                     # DELETE — good_scenario/broken_scenario synthetic Parquet
└── geometry/                      # DELETE — demo uses public/demo-geometry/taz25.geoparquet
# KEPT: tests/fixtures/all-placeholders-config.yaml (hand-maintained; NOT part of dashboard-config/)
```

Files this feature **redesigns**:

```text
tests/global-setup.js              # remove all fixture copy-in; ADD dashboard-8-test.yaml to demo index.json; keep the 1 all-placeholders-config.yaml copy
tests/global-teardown.js           # remove all fixture rm; restore demo index.json verbatim
scripts/copy-fixtures.js           # remove or reduce to "add dashboard-8-test.yaml for a manual npm run dev check"
tests/integration/_sharedFixtureLock.ts   # DELETE if unused after centralizing dashboard-8 registration (confirm in tasks)
package.json                       # remove "pretest:integration" (generate.py hook); update/remove "dev:fixtures"
tests/integration/*.spec.ts        # 24 of 25 rewritten (see contracts/spec-migration.md)
```

Files this feature **minimally extends** (`src/` — the one deliberate deviation):

```text
src/layout/types.ts                # + optional `header.blank_nav?: boolean` on DashboardTabConfig.header;
                                   #   parsed in parseDashboardConfig() fail-soft, identical to `full_page`
src/layout/sidebarNav.tsx          # ~8 lines: when tab.header.blank_nav === true → render no icon, render the
                                   #   header.tab label span with `invisible` (keeps row height, no paint),
                                   #   set aria-label={tab.header.tab} on SidebarMenuButton. Real tabs: no change
                                   #   (aria-label stays undefined, label stays `truncate`).
```

**Structure Decision**: Almost entirely a test-infrastructure change confined to `tests/`, `scripts/`, `package.json`, and one new file under the git-tracked `public/demo-dashboard-config/` root (`dashboard-8-test.yaml`, beside the seven real demo tabs). The single exception is the blank-sidebar requirement (FR-019 – FR-021): `src/layout/types.ts` was confirmed (Phase 0) to throw on an empty `header.tab`, and `header.tab` is rendered as visible sidebar text — so a visually-blank entry with a real accessible name is only reachable via a small render-time flag, not a grammar-only trick. The addition is one optional `header` key + a conditional in the one component that reads it (`sidebarNav.tsx`), mirroring `030-sidebar-navigation`'s own `header.icon`/`header.full_page` additions. No new module, no new directory, no new dependency.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
