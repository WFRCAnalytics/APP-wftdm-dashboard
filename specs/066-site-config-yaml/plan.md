# Implementation Plan: Site configuration in dashboard-config.yaml

**Branch**: `066-site-config-yaml` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/066-site-config-yaml/spec.md`

## Summary

Move the site settings out of `public/dashboard-config/index.json` into a `dashboard-config.yaml`, described once by a table-driven schema (`src/config/schema.ts`). Three pure, browser-free modules read that table: a validator (`validate.ts`: typing, unknown keys, "not allowed here", problem list), a cascade resolver (`resolve.ts`: site → page → panel with the agreed merge rules and provenance) and a mapper to today's `DashboardBranding` shape (`toBranding.ts`), so the many consumers of branding do not change. A thin loader fetches and parses the YAML at boot, and a small notice surfaces problems in the page and the console. The boot-skeleton Vite plugin reads the title and page list through the same pure modules instead of its own parser. The demo, synthetic and legacy-fixture roots each get a `dashboard-config.yaml`; the site-setting keys in `index.json` are no longer read.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18 for the notice

**Primary Dependencies**: `js-yaml` (already used for pages); no new dependency

**Storage**: Static files fetched at runtime; no Web Storage

**Testing**: Vitest for schema, validator, resolver and mapper (browser-free); Playwright (`chromium`, `redesign`, `real` projects) for the loaded app and the notice; a unit test that the generated reference is current

**Target Platform**: Browser (static bundle) plus Node (the Vite plugin imports the pure modules)

**Project Type**: Web app (static SPA) with a Python post-processor (untouched)

**Performance Goals**: Config load adds no extra request on the happy path (one YAML fetch replaces one JSON fetch per root)

**Constraints**: Pure modules must not import `import.meta.env`, `@/` aliases or DOM so Node can load them; wrong values never block boot; unset keys keep today's behaviour

**Scale/Scope**: ~21 setting groups (about 45 leaf paths); ~30 Playwright specs that fake `index.json` move to a shared helper

## Constitution Check

*GATE: passes. Re-checked after Phase 1.*

| Principle | Status |
|---|---|
| I TypeScript throughout | Pass: all new code is `.ts`; the notice is `.tsx` |
| III No eval | Pass |
| IV YAML parsed at runtime | Pass: `dashboard-config.yaml` is fetched and parsed in the browser |
| V Parquet-only browser data | Not affected |
| VI Fixed technology choices / no Web Storage | Pass: no new dependency, no storage |
| VII Minimal fixed config file set (2.8.0) | Pass: `dashboard-config.yaml` is the fourth permitted file; `index.json` stays discovery-only (scenarios), no new settings go in it |
| X Delivery targets | Pass: plain YAML and a pure resolver the Python and R packages can rely on; no app logic in the wrappers |

No violations, so no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/066-site-config-yaml/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── dashboard-config.md      # the YAML contract (keys, types, defaults, cascade)
└── tasks.md                     # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── config/                       # NEW: pure, no DOM, no import.meta.env, relative imports only
│   ├── schema.ts                 # the one table of setting definitions
│   ├── validate.ts               # raw YAML object -> { settings, problems }
│   ├── resolve.ts                # site/page/panel cascade -> { values, source }
│   ├── toBranding.ts             # resolved settings -> DashboardBranding (today's consumer shape)
│   └── reference.ts              # schema -> Markdown (docs generator)
├── services/
│   ├── siteConfig.ts             # fetch + parse dashboard-config.yaml (one or two roots), probe legacy index.json
│   └── yamlLoader.ts             # loadDashboards()/loadDashboardBranding() reduced to page loading; DashboardBranding type kept
├── state/configProblems.ts       # session-only list of problems (plain module state)
├── layout/configNotice.tsx       # one visible note listing problems; nothing when empty
└── main.tsx                      # boot uses siteConfig instead of the two index.json reads

scripts/
├── viteBootSkeletonPlugin.ts     # reads title/pages through src/config
└── gen-config-reference.ts       # writes project-docs/CONFIG-REFERENCE.md

public/
├── demo-dashboard-config/dashboard-config.yaml        # NEW (index.json removed)
├── demo-synthetic/dashboard-config/dashboard-config.yaml
└── (fixtures) tests/fixtures/{legacy-demo,...}/dashboard-config/dashboard-config.yaml

project-docs/CONFIG-REFERENCE.md   # generated from the schema; CONFIGURATION.md and CLAUDE.md updated

tests/
├── unit/config*.test.ts           # schema, validate, resolve, toBranding, reference-current
└── integration/
    ├── _siteConfig.ts             # route helper: fetch real YAML, patch, fulfil (replaces the index.json faking)
    ├── _testTab.ts                # appends the Test tab to `pages`
    └── siteConfig.spec.ts         # notice, defaults, wrong value, missing file
```

**Structure Decision**: One new pure module folder (`src/config/`) importable from both the browser and Node; the loader and the notice are the only impure parts. `DashboardBranding` stays as the consumer-facing shape for now so no chart, layout or state module changes in this feature.

## Complexity Tracking

None.
