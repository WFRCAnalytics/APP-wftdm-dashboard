# Implementation Plan: Appearance Settings Expansion

**Branch**: `061-appearance-controls` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/061-appearance-controls/spec.md`

## Summary

Four independent, additive additions to the Appearance settings tab.
(1) Consolidate three near-duplicate categorical color-resolution modules
(`sankeyColor.ts`/`hierarchyColor.ts`/`polarChartColor.ts` — confirmed
byte-for-byte identical lookup tables, research.md §1) into one
`panels/chartColor.ts`, add five real ColorBrewer schemes already exported
by the already-pinned `d3-scale-chromatic` (research.md §2), and add a
"prefer colorblind-safe palettes" toggle that changes only the *default*
tier of both the new category resolver and the pre-existing, untouched
scenario-color chain (`panels/scenarioDisplay.ts`, research.md §3).
(2) Two-tier (deployer `DashboardBranding` field + viewer session
override) Primary/Secondary/Accent color pickers, reusing
`components/ui/color-picker.tsx` and its exact `scenarioColorControl.tsx`
wiring pattern verbatim (research.md §6), with an automatically computed
legible foreground via the already-installed `color` package's real
`.isLight()`/`.isDark()` (research.md §4) — no separate "brand" entity,
per spec.md's own explicit terminology decision. (3) A font picker
(body/heading/monospace) defaulting to the existing self-hosted Geist
typefaces, optionally overridable via a dynamically-loaded Google Font —
empirically confirmed safe under this app's dev-only COEP policy
(research.md §7-§8) and populated via free-text entry plus a small bundled
shortlist rather than a live, API-key-gated catalog fetch (research.md
§9). (4) A continuous text-size slider scaling `document.documentElement`'s
root font size, which every Tailwind `rem`-based utility in this app
already scales against with zero per-component change. **No new npm
dependency is added by this feature** — `d3-scale-chromatic`, `color`,
`@radix-ui/react-slider`, `@radix-ui/react-popover`, and
`@fontsource-variable/geist(-mono)` are all already installed.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), matching this app's
existing `src/` codebase — no new language/runtime.

**Primary Dependencies**: React 18 (existing); `d3-scale-chromatic`
(existing — five new named-scheme exports already present in the pinned
version, research.md §2); `color` (existing — `.isLight()`/`.isDark()`
for auto-foreground, research.md §4); `@radix-ui/react-slider` (existing,
already used inside `color-picker.tsx`; this feature's text-size slider is
its second, first standalone `components/ui/slider.tsx` consumer);
`@radix-ui/react-popover` (existing, already used by
`scenarioColorControl.tsx`). No new dependency for any of the four pieces.

**Storage**: N/A directly — no DuckDB/Parquet involvement of any kind
(spec.md Assumptions: presentation-layer only). Every new preference is
in-memory module state (session-only, no `localStorage`/`sessionStorage`
per constitution Principle VI — research.md §11); the deployer-configured
Primary/Secondary/Accent defaults live in the existing
`dashboard-config/index.json` discovery file (extending
`DashboardBranding`, research.md §5), not a new file.

**Testing**: Vitest (unit — the consolidated `chartColor.ts`'s scheme/
fallback resolution, `scenarioDisplay.ts`'s extended colorblind-safe
cases, the new `interfaceColor.ts`/`colorPreferenceState.ts`/
`textSizeState.ts`/`fontPreferenceState.ts`/`googleFontLoader.ts` pure
modules) + Playwright (integration — live toggle/slider/picker
interaction, dual-theme legibility, an offline-simulated font-load
fail-soft check, matching this project's established per-feature test
convention).

**Target Platform**: Browser (Chromium, matching this app's existing
Playwright test target). Google Font loading confirmed safe, empirically,
under both this app's actual production posture (no COEP at all — the
`coi-serviceworker.js` this app's own `CLAUDE.md` describes does not
exist in this checkout, research.md §7, a real pre-existing documentation
staleness this feature is not in scope to fix) and its dev-only
`Cross-Origin-Embedder-Policy: require-corp` (both `fonts.googleapis.com`
and `fonts.gstatic.com` already send `Cross-Origin-Resource-Policy:
cross-origin`, confirmed via a live `curl` check, research.md §8).

**Project Type**: Existing single-repo web dashboard application — this
feature adds/modifies files within the existing `src/panels/`,
`src/state/`, `src/hooks/`, `src/layout/settings/`, and
`src/services/yamlLoader.ts` structure; no new project, service, or
top-level directory.

**Performance Goals**: No numeric SLA beyond this app's own existing,
established interaction responsiveness — a colorblind-safe toggle,
text-size slider drag, color-picker change, or font selection should feel
as immediate as this app's existing theme-mode toggle (a single inline
style/property write per change, no query, no re-fetch).

**Constraints**: No `eval()` (Principle III — not applicable here in any
case, no dynamic SQL/code path touched). No `localStorage`/
`sessionStorage` (Principle VI) — every new preference is confirmed
session-only, module-level state, matching `state/themeState.ts`'s
already-established, already-audited pattern exactly (research.md §11).
The category-color consolidation must not visibly change any existing
panel that already specifies an explicit `color_scheme:` (spec.md FR-003)
— confirmed achievable by preserving each of the four current consumers'
own exact fallback-token-count behavior (research.md §1's table) rather
than forcing them to a single shared count.

**Scale/Scope**: Deletes 3 files (`sankeyColor.ts`/`hierarchyColor.ts`/
`polarChartColor.ts`), adds 1 replacement (`panels/chartColor.ts`) plus 4
new small state modules, 2 new hooks, 1 new resolution module
(`panels/interfaceColor.ts`), 1 new loader module
(`panels/googleFontLoader.ts`), 1 new shared UI component
(`components/ui/slider.tsx`), 1 new settings-tab component
(`interfaceColorControl.tsx`), and expands the existing
`appearanceTab.tsx` with four new control groups. Extends
`DashboardBranding` (3 new optional fields) and its `main.tsx`
consumption. Four independent pieces — spec.md's own Assumptions confirm
none blocks another, so each may land as its own, separately verifiable
slice.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (TypeScript Throughout, React Permitted When Needed)** —
  PASS. New code is TypeScript `.ts`/`.tsx`, following the established
  panel/settings-tab pattern; React is already adopted.
- **Principle II (DuckDB-WASM off main thread, one shared instance)** —
  PASS, not applicable. No DuckDB/query involvement anywhere in this
  feature (spec.md Assumptions).
- **Principle III (No `eval()`)** — PASS. No dynamic code execution of
  any kind; the only "dynamic" behavior is DOM-standard `<link>` tag
  creation for a chosen Google Font URL (plain string interpolation into
  a URL, not code execution) and inline CSS custom-property writes.
- **Principle IV (YAML parsed at runtime)** — PASS, not directly
  applicable — this feature reads three new optional fields from the
  ALREADY-runtime-parsed `dashboard-config/index.json` (which is JSON, not
  YAML, and already falls outside the three-YAML-file-type principle by
  precedent — `title`/`logoUrl`/`scenarioPalette`/`protomapsPmtilesUrl`
  are the existing analogues, research.md §5). No `dashboard-*.yaml`
  grammar changes.
- **Principle V (Parquet-only browser I/O)** — PASS, not applicable. No
  data-format path touched.
- **Principle VI (Fixed Technology Choices)** — PASS. No new UI
  framework/library — `Tailwind CSS`/`shadcn/ui` (Radix)/`lucide-react`
  remain the only UI stack; every dependency this feature uses
  (`d3-scale-chromatic`, `color`, `@radix-ui/react-slider`,
  `@radix-ui/react-popover`, `@fontsource-variable/geist(-mono)`) is
  already pinned and already in use elsewhere in this app for the same
  general purpose. No `localStorage`/`sessionStorage` — every new
  preference is confirmed session-only module state (research.md §11).
  No Mapbox/Webpack involvement. **No Technology Stack Reference
  amendment is needed** — unlike `058`/`060`'s own precedent (a genuinely
  new charting *capability* naming a technology for the first time), this
  feature reuses already-documented, already-pinned dependencies for new
  call sites within the same UI layer the constitution already names
  generically ("Tailwind CSS... shadcn/ui... `lucide-react`") — there is
  no new named capability row this project's own established
  one-row-per-charting-capability convention would apply to (this is not
  a new panel type or charting engine).
- **Principle VII (Minimal, fixed config file set)** — PASS. No new
  config file type. The three new deployer fields
  (`primaryColor`/`secondaryColor`/`accentColor`) are new FIELDS on the
  existing `dashboard-config/index.json` discovery file, following the
  exact precedent `028-dashboard-branding`/`036-scenario-color-picker`/
  `041-protomaps-pmtiles-basemap` already established for this same file
  (research.md §5) — not a new file, and this discovery file is already
  established as outside the three-YAML-config-type count (CLAUDE.md's
  own "Config file set" section).
- **Principle VIII (Reuse proven reference implementations)** — PASS, not
  applicable. No DuckDB-WASM/MapLibre/spatial-SQL/Vite-setup work
  involved.
- **Principle IX (Fixed Python/JS source split)** — PASS. This feature
  touches only `src/`; no Python package changes.

**Result**: No violations, no constitution amendment needed. Every
dependency this feature relies on is already pinned; every state pattern
it introduces already has an in-repo precedent it mirrors exactly.

**Post-Phase-1 re-check**: re-verified against the concrete design in
`data-model.md`/`contracts/` — nothing in the four new state modules, the
two new hooks, `panels/chartColor.ts`, `panels/interfaceColor.ts`, or
`panels/googleFontLoader.ts` introduces a gate concern the pre-research
pass above didn't already anticipate. All new state remains session-only
module state (Principle VI intact); the deployer color fields remain
plain new fields on the existing discovery-file JSON (Principle VII
intact); no `eval()`/dynamic code execution anywhere (Principle III
intact). PASS, unchanged from the pre-research gate above.

## Project Structure

### Documentation (this feature)

```text
specs/061-appearance-controls/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── category-color-resolution.md
│   ├── interface-color-roles.md
│   ├── text-size-preference.md
│   └── font-preference.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

This is an existing single-repo web dashboard application (`src/` =
TypeScript app, `python/` = post-processor, per constitution Principle
IX) — this feature adds/modifies files following the exact existing
`state/`/`hooks/`/`panels/`/`layout/settings/` layout convention every
prior settings/preference feature already uses (see `CLAUDE.md`'s own
`src/` tree); it does not introduce a new top-level structure:

```text
src/
├── services/
│   └── yamlLoader.ts             # MODIFIED: DashboardBranding gains
│                                  #   primaryColor?/secondaryColor?/
│                                  #   accentColor? (research.md §5)
├── main.tsx                      # MODIFIED: merges the 3 new fields
│                                  #   real-then-demo (existing `??`
│                                  #   pattern), CSS.supports()-validates
│                                  #   each, calls
│                                  #   setDeployerInterfaceColor(role, v)
├── state/
│   ├── colorPreferenceState.ts   # NEW — colorblindSafe boolean, mirrors
│   │                              #   themeState.ts exactly
│   ├── textSizeState.ts          # NEW — scale number (80-150, default
│   │                              #   100), same shape
│   ├── interfaceColorState.ts    # NEW — { primary?, secondary?, accent? }
│   │                              #   viewer session overrides, same shape
│   └── fontPreferenceState.ts    # NEW — { body?, heading?, mono? }
│                                  #   viewer session selections, same shape
├── hooks/
│   ├── useColorblindSafePreference.ts # NEW — useSyncExternalStore over
│   │                                   #   colorPreferenceState.ts,
│   │                                   #   mirrors useThemeMode.ts
│   ├── useTextSize.ts            # NEW — same shape, over textSizeState.ts
│   ├── useInterfaceColors.ts     # NEW — useSyncExternalStore + memoized
│   │                              #   cache, mirrors useScenarioDisplay.ts
│   │                              #   (resolves all 3 roles + computed
│   │                              #   foregrounds, re-keyed on override/
│   │                              #   deployer-default change)
│   └── useFontPreference.ts      # NEW — over fontPreferenceState.ts
├── panels/
│   ├── chartColor.ts             # NEW — replaces sankeyColor.ts/
│   │                              #   hierarchyColor.ts/polarChartColor.ts;
│   │                              #   resolveNamedColorScheme() +
│   │                              #   resolveCategoryFallbackColors()
│   ├── sankeyColor.ts            # DELETED
│   ├── hierarchyColor.ts         # DELETED
│   ├── polarChartColor.ts        # DELETED
│   ├── SankeyPanel.tsx           # MODIFIED: import chartColor.ts instead;
│   │                              #   passes its own existing 4-token
│   │                              #   fallback list unchanged
│   ├── HierarchicalChartHost.tsx # MODIFIED: same import swap, existing
│   │                              #   5-token fallback list unchanged
│   ├── PieChartPanel.tsx         # MODIFIED: same import swap
│   ├── RadarChartPanel.tsx       # MODIFIED: same import swap
│   ├── scenarioDisplay.ts        # MODIFIED: resolveDefaultScenarioColor()
│   │                              #   gains optional colorblindSafe param
│   │                              #   + new COLORBLIND_SAFE_DEFAULT_PALETTE
│   ├── interfaceColor.ts         # NEW — resolveInterfaceColor(role),
│   │                              #   computeForegroundFor(hex),
│   │                              #   setDeployerInterfaceColor(role, v)
│   └── googleFontLoader.ts       # NEW — ensureGoogleFontLoaded(role, name)/
│                                  #   clearGoogleFont(role); owns the 3
│                                  #   stable-id <link> elements
├── hooks/
│   └── useScenarioDisplay.ts     # MODIFIED: + useColorblindSafePreference()
│                                  #   call folded into cache-invalidation
├── components/ui/
│   └── slider.tsx                # NEW — shadcn-pattern wrapper over the
│                                  #   already-installed
│                                  #   @radix-ui/react-slider (its second
│                                  #   real consumer; color-picker.tsx's
│                                  #   own inline Hue/Alpha sliders stay
│                                  #   untouched, kept pristine per that
│                                  #   file's established convention)
└── layout/settings/
    ├── appearanceTab.tsx         # MODIFIED: + 4 new control groups
    │                              #   (colorblind-safe toggle, text-size
    │                              #   slider, 3 interface-color swatches,
    │                              #   3 font pickers), existing
    │                              #   theme-mode control unchanged
    └── interfaceColorControl.tsx # NEW — mirrors scenarioColorControl.tsx
                                   #   exactly, parameterized by role
                                   #   instead of Scenario

tests/
├── unit/
│   ├── chartColor.test.ts        # NEW
│   ├── scenarioDisplay.test.ts   # MODIFIED: + colorblind-safe cases
│   ├── interfaceColor.test.ts    # NEW
│   ├── colorPreferenceState.test.ts # NEW
│   ├── textSizeState.test.ts     # NEW
│   ├── fontPreferenceState.test.ts  # NEW
│   └── googleFontLoader.test.ts  # NEW
└── integration/
    ├── appearanceSettings.spec.ts        # NEW — Playwright, all 4 pieces
    └── categoryColorConsolidation.spec.ts # NEW — Playwright, confirms
                                            #   SC-001 (zero regression for
                                            #   panels with an explicit
                                            #   color_scheme) across all 4
                                            #   category-colored panel types
```

**Structure Decision**: Existing single-project layout, unchanged. This
feature is purely additive/consolidating within `src/state/`, `src/hooks/`,
`src/panels/`, `src/layout/settings/`, and `src/services/yamlLoader.ts` —
the same shape every prior settings/preference feature (015, 020, 021,
024, 035, 036, 041) has already used; no new directory root, no new build
target, no new test runner.

## Complexity Tracking

*No entries — no Constitution Check violation requires justification, and
no constitution amendment is needed (see Constitution Check above).*
