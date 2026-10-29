# Implementation Plan: Explore settings for the whole site

**Branch**: `069-explore-site-settings` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/069-explore-site-settings/spec.md`

## Summary

The 066 cascade already carries `explore.limits`, `features`, `columns`, `presets`, `charts.allow` and the table globs from the site file to every Explore panel (`explore/options.ts#withSiteDefaults`). Two things are missing: `explore.charts.default` is not a schema row (so it cannot be set site-wide), and six chart limits are constants in the code. The site-level `explore.limits` is today one `map` row checked only for being a map, so a wrong number there is found only when a panel opens.

The change: replace the single `explore.limits` row by one integer row per limit (the four existing and the six new), each `cascade: true` with a `clean` hook that pulls an out-of-range number to its nearest end with a message (the behaviour the Explore limits already have). The bounds live in one new pure module, `src/config/exploreLimits.ts`, read by the schema rows and by `explore/options.ts` (which today owns a private `BOUNDS` table). Add the `explore.charts.default` row (a string; the cross-check against the allowed charts stays in `options.ts`, because the chart list lives behind the `@/` alias and `src/config` is pure). The chart core takes the new limits as an optional argument that defaults to today's constants, and the Explore panel passes `getExploreOptions().limits`.

No new dependency, no new file for state, no change to the SQL guard, the query time limit or the Data tab's column summaries.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18

**Primary Dependencies**: none new

**Storage**: none (static files fetched at runtime; no Web Storage)

**Testing**: Vitest for the pure bounds and rows (clamp, type, unknown key, cascade), `explore/options` resolution (site, panel, both) and the chart query/compile limits; Playwright (`chromium` or `redesign` project, whichever already holds the Explore specs) for the on-screen notes with a lowered site limit

**Target Platform**: Browser plus Node (`check`, the boot-skeleton plugin) through the pure `src/config` modules

**Project Type**: Web app (static SPA)

**Performance Goals**: no extra request; limits only bound work further or loosen it inside documented maxima

**Constraints**: `src/config` stays pure (relative imports, no `@/` alias, no DOM); with none of the new keys, every Explore view and note is identical (FR-008); a wrong value never blocks boot; the SQL guard, the builder's read-only behaviour and `RUN_TIMEOUT_MS` are untouched (FR-009); the custom dashboard tile (`kind: custom`) keeps the constants (it has no Explore panel to configure it)

**Scale/Scope**: 11 schema rows (10 limits + `explore.charts.default`, replacing 1), 1 new pure module, changes in about 8 existing files

## Constitution Check

*GATE: passes. Re-checked after Phase 1.*

| Principle | Status |
|---|---|
| I TypeScript throughout | Pass |
| III No eval | Pass |
| IV YAML parsed at runtime | Pass |
| VI Fixed technology choices / no Web Storage | Pass: no dependency, no storage |
| VII Minimal fixed config file set (2.8.0) | Pass: keys in `dashboard-config.yaml` and the existing panel keys, no new file |
| X Delivery targets | Pass: plain YAML, one pure schema shared with `check` |
| Explore builder (065) | Pass: SQL still goes through `sqlGuard.authorize`; the new limits only bound result size and display |

No violations, so no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/069-explore-site-settings/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── explore-site-settings.md
└── tasks.md                     # /speckit-tasks
```

### Source Code (repository root)

```text
src/config/
├── exploreLimits.ts     # NEW, pure: EXPLORE_LIMITS (key -> yaml name, default, min, max), clampLimit(), limitClean(name)
├── schema.ts            # explore.limits (map) -> 10 integer rows explore.limits.*; + explore.charts.default
└── index.ts             # export exploreLimits

src/explore/options.ts            # BOUNDS and LIMIT_KEYS read EXPLORE_LIMITS; ExploreLimits gains the six new fields; DEFAULT_LIMITS
src/charts/builder/specToSql.ts   # chartQuery(..., caps?): rowCap, scatterSample, histogramBins (defaults = ROW_CAP, SCATTER_SAMPLE, HIST_BINS)
src/charts/builder/compile.ts     # legend series limit as an option (default MAX_SERIES); the note text reads it back
src/charts/builder/pivotDraw.ts   # pivot row limit as an option (default MAX_ROWS)
src/explore/useChartData.ts       # passes the caps; truncation flag uses them
src/explore/ChartTabView.tsx      # notes quote the configured numbers (rows, legend)
src/explore/useDistinct.ts        # LIMIT and page size from distinct_values

tests/unit/
├── configExploreLimits.test.ts   # NEW: bounds, clamp, rows, cascade, unknown key, schema/reference
├── exploreOptions.test.ts        # (extended: new keys, site + panel, charts.default site-wide)  [name per existing file]
├── configValidate.test.ts, configCheck.test.ts, configReference.test.ts   # (extended or adjusted for the new rows)
└── builder specs for specToSql/compile/pivot                              # (extended: caps default and override)  [names per existing files]
tests/integration/exploreSiteSettings.spec.ts   # NEW
project-docs/CONFIG-REFERENCE.md, dashboard-config.schema.json   # regenerated (`npm run docs:config`)
```

**Structure Decision**: single web-app project as in 066 to 068. Pure bounds in `src/config`, the Explore panel keeps its own resolution, the chart core stays free of stores (limits arrive as arguments).

## Phase 0: Research

See [research.md](research.md). Decisions: one integer row per limit with a clamping `clean` hook; the bounds in one pure module shared with `options.ts`; `charts.default` as a plain string row checked against the allowed list in `options.ts`; the chart core takes optional caps; the histogram setting changes the chart builder only; label lengths, column-summary sizes and `RUN_TIMEOUT_MS` stay fixed.

## Phase 1: Design

- [data-model.md](data-model.md): the limits table, the resolution order and the problem catalogue.
- [contracts/explore-site-settings.md](contracts/explore-site-settings.md): the YAML keys, ranges, defaults and every reported problem.
- [quickstart.md](quickstart.md): end-to-end validation.

Constitution re-check after design: unchanged, still passes.

## Complexity Tracking

None.
