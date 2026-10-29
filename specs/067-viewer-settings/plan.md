# Implementation Plan: Viewer-facing settings (Settings tabs, documentation link, hidden pages)

**Branch**: `067-viewer-settings` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/067-viewer-settings/spec.md`

## Summary

Add three deployer-controlled, viewer-facing behaviours to the site configuration built in 066, each as rows in the one schema table (`src/config/schema.ts`) so the reference, JSON Schema, validator and `check` command know them with no extra edit:

1. **Documentation link**: site `docs.url` / `docs.label` and a page `header.docs` path produce a link at the foot of the left sidebar (`layout/floatingNav.tsx`), opened in a new tab with `rel="noopener noreferrer"`. A pure helper (`src/config/viewer.ts#docsHref`) builds the destination (one `/` between address and path) and refuses anything that is not `http`/`https`.
2. **Settings tabs**: site `settings.tabs` orders and filters the tabs of `layout/settingsModal.tsx`. A pure helper (`resolveSettingsTabs`) cleans the list (unknown, repeated, empty) and applies the assistant switch; the modal and `openSettings()` fall back to the first listed tab when asked for one that is not shown.
3. **Hidden pages**: page `header.hidden` removes a page from every form of the sidebar. A pure helper (`src/config/pages.ts`: `listedPages`, `landingIndex`) decides which pages are listed and which is the landing page, shared by the shell, the nav and `check`.

Two small, generic extensions to the 066 machinery carry this: a schema row may be **page-scoped** (`scope: 'page'`: set in a page's `header:`, not in the site file, never cascades), and a row may carry a **`clean` hook** that returns the usable part of a value plus messages, so one bad tab name does not discard the good ones. Draft pages are deferred; nothing is reserved for them.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18

**Primary Dependencies**: none new (`js-yaml`, Radix Dialog, lucide-react already in use)

**Storage**: Static files fetched at runtime; no Web Storage (the open Settings tab and the active page stay in module state as today)

**Testing**: Vitest for the pure helpers, the new schema rows (validate, JSON Schema and reference drift), `toBranding` and `check`; Playwright (`chromium` project, which has several pages and the sidebar) for the icon, the tab list and hidden pages, with the site file and a page file rewritten through the existing `_siteConfig.ts` helpers

**Target Platform**: Browser (static bundle) plus Node (`check`, the Vite boot-skeleton plugin) through the pure `src/config` modules

**Project Type**: Web app (static SPA)

**Performance Goals**: No extra network request; nothing on the data path changes

**Constraints**: `src/config` stays pure (relative imports, no `import.meta.env`, no `@/` alias, no DOM); a deployment that sets none of the new keys renders exactly as before (FR-015); a wrong value never blocks boot; a document address is only ever `http` or `https` (a `javascript:` address must never reach an `href`)

**Scale/Scope**: 5 new settings rows (`docs.url`, `docs.label`, `settings.tabs`, `header.docs`, `header.hidden`); ~6 files edited in `src/layout` and `src/state`, 2 new pure modules, one new Playwright spec

## Constitution Check

*GATE: passes. Re-checked after Phase 1.*

| Principle | Status |
|---|---|
| I TypeScript throughout | Pass |
| III No eval | Pass |
| IV YAML parsed at runtime | Pass: the new keys are read from the runtime-fetched files |
| VI Fixed technology choices / no Web Storage | Pass: no dependency, no storage |
| VII Minimal fixed config file set (2.8.0) | Pass: new keys go in `dashboard-config.yaml` (and a page's own `header:`), nothing in `index.json`; no fifth file |
| X Delivery targets | Pass: plain YAML, rules live in pure TypeScript the `check` command and wrappers reuse |
| Security (external links) | Pass: scheme allow-list, `rel="noopener noreferrer"`, no deployer text rendered as HTML (label is text) |

No violations, so no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/067-viewer-settings/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── viewer-settings.md
└── tasks.md                     # /speckit-tasks
```

### Source Code (repository root)

```text
src/config/
├── schema.ts            # + SettingDef.scope?: 'page', SettingDef.clean?; 5 new rows
├── validate.ts          # page-scoped rows (allowed on a page, not_allowed_here on the site); apply `clean`
├── levels.ts            # pageSettings(): also passes header.docs and header.hidden
├── viewer.ts            # NEW, pure: docsHref(), resolveSettingsTabs(), SETTINGS_TAB_NAMES
├── pages.ts             # NEW, pure: listedPages(), landingIndex(), allHidden()
├── toBranding.ts        # + docsUrl, docsLabel, settingsTabs
├── check.ts             # + cross-file problems (header.docs without docs.url, every page hidden)
└── index.ts             # re-exports

src/state/settingsState.ts   # tab list (set once at boot); openSettings/setSettingsTab fall back to the first listed
src/layout/
├── floatingNav.tsx      # skip hidden pages (keep original index); docs link at the foot
├── settingsModal.tsx    # tabs from the resolved list, in order
├── shell.tsx            # landing page = landingIndex; pass the page's docs path; report all-hidden once
├── types.ts             # header.hidden, header.docs parsed fail-soft in parseDashboardConfig
└── navButton.tsx        # (unchanged) the docs link reuses its classes through a small anchor variant
src/services/yamlLoader.ts   # DashboardBranding: docsUrl, docsLabel, settingsTabs; page header problems reported
src/main.tsx                 # configure the Settings tab list and the docs address at boot

tests/unit/
├── configViewer.test.ts     # docsHref, resolveSettingsTabs
├── configPages.test.ts      # listedPages, landingIndex
├── configValidate.test.ts   # (extended) new rows, page scope, clean hook
├── configToBranding.test.ts # (extended)
└── configCheck.test.ts      # (extended)
tests/integration/viewerSettings.spec.ts   # NEW (chromium project)
project-docs/CONFIG-REFERENCE.md, dashboard-config.schema.json   # regenerated (`npm run docs:config`)
```

**Structure Decision**: single web-app project as in 066. Pure rules in `src/config` (shared with Node), thin wiring in the existing layout and state files, no new folder outside `src/config`.

## Phase 0: Research

See [research.md](research.md). Decisions: page-scoped schema rows rather than a second table; a `clean` hook rather than splitting list validation; `docs.url` scheme allow-list; `assistant` is the config name for the internal `ai` tab; hidden is filtered where the nav maps pages (indices stay stable); all-hidden falls back to listing all; the docs link is an anchor styled like `NavButton`.

## Phase 1: Design

- [data-model.md](data-model.md): the five settings, the resolved Settings tab list, the listed-pages result and the problem catalogue.
- [contracts/viewer-settings.md](contracts/viewer-settings.md): the YAML keys, defaults, accepted values and every reported problem.
- [quickstart.md](quickstart.md): how to validate it end to end.

Constitution re-check after design: unchanged, still passes.

## Complexity Tracking

None.
