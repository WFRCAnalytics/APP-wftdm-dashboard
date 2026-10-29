# Implementation Plan: Demo content only when asked for

**Branch**: `070-demo-build-flag` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/070-demo-build-flag/spec.md`

## Summary

One build-time constant, `DEMO_CONTENT`, decides whether the demo folders exist and are read. It is **on for the dev server** (`vite` serve) and for the build run in Vite's `demo` mode (`vite build --mode demo`, used by `build:pages` and a new `build:demo`), and **off for every other build** (`npm run build`, which feeds the packages). Vite's `define` sets `import.meta.env.VITE_WFTDM_DEMO` from the command and mode, so no environment variable has to be set (the project is developed on Windows, where `VAR=1 cmd` does not work). The Playwright projects start `npx vite`, so they keep the demo with no change.

Three kinds of change:

1. **Run time** (`src/`): `services/demoContent.ts` exports `DEMO_CONTENT`. `loadSite` reads the demo root only when it is on (otherwise only the deployment's root, no fallback); `scenarioDiscovery` registers `demo-scenarios` only when it is on; `zoneGeometry`'s fallback to `demo-geometry` and the rail file path (`mapGeometry`) use `demo-geometry` only when it is on (the rail otherwise resolves under `geometry/`, like zone boundaries). A new **first-run state** replaces the app when no page could be loaded: a small pure function (`services/firstRun.ts`) names the case (no site file, or a site file that lists no pages) and what was searched; `layout/firstRun.tsx` shows it (no console error); `main.tsx` renders it instead of the shell.
2. **Build time** (`scripts/`, `vite.config.ts`): a `demoContentPlugin` removes `demo-*` from the output folder of a build that is not in demo mode (Vite copies all of `public/`; deleting after the copy is simpler and safer than a second public directory), and the boot-skeleton plugin reads the demo root only in demo mode, so the first paint never shows demo tabs.
3. **Scripts and docs**: `build:pages` becomes `vite build --mode demo --outDir docs --emptyOutDir` (same output as today), a `build:demo` script builds the demo into `dist/`, and the docs say how to turn the demo on and that fallbacks to demo values are gone.

No setting is added to the schema (the flag is a build choice, not site configuration). `src/config` is untouched, and `npm run check` already reads one folder at a time.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18, Vite

**Primary Dependencies**: none new

**Storage**: none

**Testing**: Vitest for the first-run decision, the plugin's removal rule and `loadSite` with and without the demo root; a build check (`npm run build`, list `dist/`, assert no `demo-*`; compare `build:pages` output with `docs/`); Playwright for the first-run page on a normal build served by `vite preview`, plus the existing suites unchanged

**Target Platform**: browser, Node (build scripts), Windows development shell

**Project Type**: web app (static SPA)

**Performance Goals**: a normal build output is about 12 MB smaller than the demo build; no new request in demo mode

**Constraints**: `src/config` stays pure (no flag there); the demo content files are not touched (FR-012); the Pages output stays as it is today (SC-003); dev server and the three Playwright projects keep the demo with no change to their start commands; `import.meta.env.MODE` is not used by the app, so Vite's `demo` mode name is free

**Scale/Scope**: 2 new modules in `src`, 1 new component, 1 new plugin, 5 edited files in `src`, 2 build files, 2 scripts, docs

## Constitution Check

*GATE: passes. Re-checked after Phase 1.*

| Principle | Status |
|---|---|
| I TypeScript throughout | Pass (the plugin and the new modules are `.ts`/`.tsx`) |
| IV YAML parsed at runtime | Pass: content is still read at run time; only the demo folders' presence changes |
| VI Fixed technology choices / no Web Storage | Pass: no dependency, no storage |
| VII Minimal fixed config file set (2.8.0) | Pass: no new config file or key; the flag is not configuration |
| X Delivery targets | Pass: this is what makes the package bundle neutral |
| Principle 3 (neutral by default) | Pass: this feature is its remaining step |
| `docs/` build (Deployment section of CLAUDE.md) | Pass: `build:pages` output is unchanged; still a local build, no workflow file |

No violations, so no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/070-demo-build-flag/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── demo-flag.md
└── tasks.md                     # /speckit-tasks
```

### Source Code (repository root)

```text
vite.config.ts                       # defineConfig(({ command, mode })): demo = command === 'serve' || mode === 'demo'; define VITE_WFTDM_DEMO; plugins get the flag
scripts/
├── viteDemoContentPlugin.ts         # NEW: closeBundle removes <outDir>/demo-* when demo is off
└── viteBootSkeletonPlugin.ts        # takes { demo } and reads public/demo-dashboard-config only when on
package.json                         # build:pages --mode demo; + build:demo
src/vite-env.d.ts (or env d.ts)      # type the new env var
src/services/
├── demoContent.ts                   # NEW: export const DEMO_CONTENT
├── firstRun.ts                      # NEW, pure: firstRunState({ siteFound, pageCount, searched }) -> state | null
├── siteConfig.ts                    # loadSite: demo root only when DEMO_CONTENT; the "no site configuration" message
└── scenarioDiscovery.ts             # registerDemoScenarios only when DEMO_CONTENT
src/panels/zoneGeometry.ts           # demo-geometry fallback only when DEMO_CONTENT; resolveRailUrl(file)
src/charts/lib/mapGeometry.ts        # rail file through resolveRailUrl
src/layout/firstRun.tsx              # NEW: the first-run screen
src/main.tsx                         # render FirstRun when no page loaded

tests/unit/
├── firstRun.test.ts                 # NEW
├── siteConfigDemo.test.ts           # NEW: loadSite with and without the demo root
└── demoContentPlugin.test.ts        # NEW: removal rule
tests/integration/firstRun.spec.ts   # NEW: a build without the demo and without a deployment folder, served by preview (own project or own spec setup)
project-docs/CONFIGURATION.md, CLAUDE.md, IMPLEMENTATION-HISTORY.md, GRAMMAR.md (only if it names the demo fallback)
```

**Structure Decision**: single web-app project as in 066 to 069. The flag lives in the build tooling and one tiny module; the app reads it through that module only, so a later move to profiles (CONFIGURATION.md topic 5) replaces one constant and one plugin.

## Phase 0: Research

See [research.md](research.md). Decisions: Vite mode plus `define` (no environment variable); the dev server is always demo; remove `demo-*` after the public copy; first run is a screen, not a toast; rail geometry follows the flag; `demo-synthetic` stays in the Pages output as today.

## Phase 1: Design

- [data-model.md](data-model.md): the flag, what it gates, and the first-run states.
- [contracts/demo-flag.md](contracts/demo-flag.md): the scripts, what each output contains, and what a viewer sees.
- [quickstart.md](quickstart.md): end-to-end validation.

Constitution re-check after design: unchanged, still passes.

## Complexity Tracking

None.
