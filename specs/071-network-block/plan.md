# Implementation Plan: Control the outside calls (the `network` block)

**Branch**: `071-network-block` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/071-network-block/spec.md`

## Summary

Three optional site-only settings, each a row in the schema table (`src/config/schema.ts`): `network.fonts` (`bundled` | `any`), `network.basemaps.allow` (a list of `*` patterns on basemap ids) and `network.duckdb_extensions` (one `http`/`https` address). The pure rules (matching patterns, which ids a pattern list allows, what a mistake is, which hosts are left) live in one new module, `src/config/network.ts`, which takes the catalogue ids and hosts as arguments, as `checkDefault` does, so `src/config` stays pure and the same code serves the schema, the loader and `check`.

In the app, a small runtime policy module per concern keeps state in plain module variables (no Web Storage, like `assistantPolicy.ts`):

- **Basemaps** (`src/panels/basemap/basemapPolicy.ts`): holds the allow-list. `resolveEffectiveBasemap` (the one place every map resolves its basemap) passes its winner through the policy: a name that is not allowed is replaced by the first allowed catalogue entry, or by the blank background when nothing matches, and each distinct replacement is reported once through the configuration note. The Basemap tab's lists (built-in styles, Protomaps flavours, the raster dropdown) are filtered through the same policy, so a viewer can only pick what is allowed.
- **Fonts** (`src/services/networkPolicy.ts`): with `bundled` the Appearance tab offers only the default font and System UI, hides the custom-font inputs and the Google shortlist, loads no preview font, and `fontPreferenceState` refuses any other family.
- **Extensions** (`services/duckdb.ts`): after the site settings are read, the app runs `SET custom_extension_repository = '<address>'` on its own connection before any extension is installed or autoloaded. User SQL (the assistant, the Explore SQL tab) still goes through `sqlGuard`, which still refuses `SET`, `INSTALL` and `LOAD`; the guard is untouched.

`check` gets: the new row checks, the cross-key checks (a pattern that matches nothing known, a default basemap that is not allowed at the site, page or panel level) and, with `--explain`, a list of the outside hosts the configuration can still reach.

No new dependency, no change to the SQL guard, the assistant, or the demo flag.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18

**Primary Dependencies**: none new

**Storage**: none (module state; nothing in Web Storage)

**Testing**: Vitest for the pure rules (globs, allowed ids, mistakes, host listing), the basemap policy (the fallback rules and the filtered lists), the font filter and the extension setting; Playwright for the Basemap tab and the Appearance tab with a configured site file, and for the request log (no request to a host outside the lists) using `page.route`

**Target Platform**: browser, Node (`check`, the boot-skeleton plugin) through the pure `src/config` modules

**Project Type**: web app (static SPA)

**Performance Goals**: no extra request; the allow-list is applied once at boot

**Constraints**: `src/config` stays pure (relative imports, no alias, no DOM, no `import.meta.env`); a deployment that sets none of the new keys makes the same requests as today (FR-010); a wrong value never blocks boot; `sqlGuard` is not changed and no new SQL path exists; no secret enters the site file; the demo flag (070) is unrelated

**Scale/Scope**: 3 schema rows (plus the enum and url checks), 1 pure module, 2 policy modules, edits in `resolveEffectiveBasemap`, the Basemap tab, the Appearance tab, `fontPreferenceState`, `duckdb.ts`, `main.tsx`, `check.ts`, `scripts/check-config.ts`, `siteConfig.ts`, `toBranding.ts`

## Constitution Check

*GATE: passes. Re-checked after Phase 1.*

| Principle | Status |
|---|---|
| I TypeScript throughout | Pass |
| III No eval | Pass: patterns are matched by an escaped regular expression built from `*` only, never evaluated as code |
| IV YAML parsed at runtime | Pass |
| VI Fixed technology choices / no Web Storage | Pass: no dependency, module state only |
| VII Minimal fixed config file set (2.8.0) | Pass: keys in `dashboard-config.yaml`; the extension address is not a secret (an address, not a key) |
| X Delivery targets | Pass: plain YAML, one pure schema shared with `check` |
| Non-negotiables (DuckDB in a worker, one instance) | Pass: the setting is one statement on the existing connection |
| AI assistant (064) | Pass: `sqlGuard.authorize()` unchanged; the app's own `SET` does not pass through user SQL |

No violations, so no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/071-network-block/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── network-config.md
└── tasks.md                     # /speckit-tasks
```

### Source Code (repository root)

```text
src/config/
├── network.ts            # NEW, pure: NETWORK_FONT_MODES, matchesAny(), allowedIds(), unmatchedPatterns(), isAllowed(), outsideHosts()
├── schema.ts             # + rows network.fonts (enum), network.basemaps.allow (list of string), network.duckdb_extensions (url, web address)
├── toBranding.ts         # + DashboardBranding.network { fonts, basemapsAllow, duckdbExtensions }
├── check.ts              # + cross-key checks; explain() takes the catalogue and lists outside hosts
└── index.ts              # export network

src/services/
├── networkPolicy.ts      # NEW: fontsBundled(), configureNetwork(); module state
├── yamlLoader.ts         # DashboardBranding.network
├── siteConfig.ts         # report the site-level cross-key problems
└── duckdb.ts             # setExtensionRepository(url): one SET on the shared connection
src/panels/basemap/
├── basemapPolicy.ts      # NEW: configureBasemapPolicy(), isBasemapAllowed(), firstAllowed(), allowedNames(); once-only reporting
├── registry.ts           # catalogue helpers for the policy and check (all ids, hosts of a preset)
└── resolveEffectiveBasemap.ts   # pass the winner through the policy
src/layout/settings/
├── basemapTab.tsx        # lists filtered by the policy
└── appearanceTab.tsx     # cards, inputs and previews follow the font mode
src/state/fontPreferenceState.ts # refuse a family that is not offered when fonts are bundled
src/main.tsx              # configure the policies from the site; set the extension repository before discovery
scripts/check-config.ts   # build the catalogue (ids and hosts) for check and --explain

tests/unit/
├── configNetwork.test.ts       # NEW: pure rules
├── basemapPolicy.test.ts       # NEW
├── networkPolicy.test.ts       # NEW (fonts mode, font preference filter)
├── configValidate.test.ts, configCheck.test.ts, configToBranding.test.ts   # (extended)
└── resolveEffectiveBasemap.test.ts   # (extended: the allow-list)
tests/integration/networkBlock.spec.ts   # NEW (chromium project; real basemap requests blocked by route)
project-docs/CONFIG-REFERENCE.md, dashboard-config.schema.json   # regenerated (`npm run docs:config`)
```

**Structure Decision**: single web-app project as in 066 to 070. Pure rules in `src/config`, one policy module beside each concern (basemaps, fonts and the extension setting), wiring at the existing single choke points: `resolveEffectiveBasemap` for maps, the Basemap tab and Appearance tab for viewer choices, `duckdb.ts` for the setting.

## Phase 0: Research

See [research.md](research.md). Decisions: the allow-list is applied in `resolveEffectiveBasemap` (one choke point for panel, tab, viewer and app default); catalogue ids are built-in preset names, Protomaps flavour names and the curated raster providers (`Provider` or `Provider.Variant`); a deployer-authored composition object or a full style URL is the deployer's explicit choice and is not blocked, but is listed by `check --explain`; the blank background when nothing matches; fonts hide rather than disable; the repository setting is one `SET` on the app's own connection before discovery; hosts for `--explain` come from the catalogue.

## Phase 1: Design

- [data-model.md](data-model.md): the three settings, the catalogue ids and hosts, the fallback rules and the problem catalogue.
- [contracts/network-config.md](contracts/network-config.md): the YAML keys, values, defaults and every reported problem.
- [quickstart.md](quickstart.md): end-to-end validation.

Constitution re-check after design: unchanged, still passes.

## Complexity Tracking

None.
