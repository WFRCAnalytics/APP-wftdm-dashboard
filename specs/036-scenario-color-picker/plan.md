# Implementation Plan: Deployer Scenario Palette & Redesigned Color Picker

**Branch**: `036-scenario-color-picker` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/036-scenario-color-picker/spec.md`

## Summary

**Part A** replaces `035-scenario-label-color`'s "manifest color is the
default" behavior with a three-tier chain (viewer override → deployer-
configured palette → shipped `--chart-1..5` default), surgically changing
only `hooks/useScenarioDisplay.ts`'s own color-resolution line — every
other piece of `035`'s propagation machinery (`resolveScenarioColor()`,
the three chart panel types' call sites, `Scenario.color`,
`scenarioDiscovery.ts`'s manifest fetch) stays untouched. The deployer
palette is a new optional `scenarioPalette` field on the existing
`dashboard-config/index.json` branding mechanism (`028`), reaching the
hook via a new module-level setter in `panels/scenarioDisplay.ts`, called
once at boot from `main.tsx`.

**Part B** adopts the real `shadcnblocks/kibo` `color-picker` package
(confirmed via direct source read, and the user's own explicit choice
after a real trade-off was presented) as `components/ui/color-picker.tsx`
— a 2D saturation/lightness canvas, hue/alpha sliders, an eyedropper, and
a mode-switchable value display — with its own real `readOnly` hex/RGB
fields made genuinely editable, a deliberate, documented adaptation. A new
`components/ui/popover.tsx` (real shadcn source) wraps it behind a small
swatch trigger inside a new, focused
`layout/settings/scenarioColorControl.tsx`, replacing `035`'s plain
native `<input type="color">` in the Scenarios tab's row.

**Part C** (amended into this same feature after Parts A/B had already
shipped on this branch) is a real UI/UX refinement of the Scenarios tab
row itself, additive and independent of Parts A/B: (1) a genuinely
prominent per-row status treatment (a colored left border + subtle
background wash, `wftdm-design-system`'s own already-established
`--success`/`--destructive`/`--muted-foreground` tokens, no new color);
(2) an active/inactive `Switch` (`components/ui/switch.tsx`, `033`) wired
directly to `state/appState.ts`'s existing, already-tested `active`/
`setActive()` — no new mechanism; (3) a "Baseline" text `Badge`
(`components/ui/badge.tsx`, `034`) replacing the filled `Star` icon as the
primary baseline indicator, with the existing click-to-mark interaction
unchanged.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3 (constitution v2.2.0)

**Primary Dependencies**: Two new, real, necessary additions — `color`
(npm color-math library; hex/RGB/HSL/alpha conversion, required by the
adapted kibo source) and `@radix-ui/react-slider` (the 2D-canvas/hue/alpha
controls' own Radix primitive). Both used exactly once, inside the new
`components/ui/color-picker.tsx` — no other file needs either. Everything
else this feature touches (`services/yamlLoader.ts`, `panels/
scenarioDisplay.ts`, `hooks/useScenarioDisplay.ts`, `hooks/
useColorScheme.ts`, `state/appState.ts`, `layout/settings/scenariosTab.tsx`)
already exists.

**Storage**: N/A — the deployer palette lives in the deployer's own
already-existing `dashboard-config/index.json` static file; a viewer's
color override stays in-memory only (`035`'s existing, unmodified
`colorOverride` mechanism)

**Testing**: Vitest (pure-logic unit tests for the new palette-resolution
functions in `panels/scenarioDisplay.ts`, and for the color-picker's own
hex/RGB parsing helpers where DOM-free) + Playwright (real-browser
integration tests for palette rendering, the popover/picker interaction,
and reactive theme-flip behavior)

**Target Platform**: Browser (Chromium/Firefox via Playwright) — the
eyedropper control specifically degrades gracefully where the browser
`EyeDropper` API is unavailable (matches kibo's own real try/catch, no
new handling needed)

**Project Type**: Single web application (`src/` — no backend/mobile split)

**Performance Goals**: No new query — Part A is a pure client-side
resolution-chain change; Part B is a UI-only control; Part C reuses an
existing, already-reactive mechanism (`setActive()`/
`useActiveScenarios()`) for its own toggle. No measurable performance
impact expected from any part.

**Constraints**: Must not modify `services/scenarioDiscovery.ts`'s
manifest fetch, `Scenario.color`, `python/wftdm_dashboard/postprocessor/
manifest.py`, or `035`'s own core label-propagation logic (spec.md's
explicit exclusions); a deployer-configured palette entry that isn't a
valid CSS color string must never break rendering (FR-008); an invalid
hex/out-of-range RGB entry in the picker must never corrupt
`colorOverride` (FR-014/FR-015); Part C must not build a new active/
inactive mechanism, introduce a new color token, or change how a
scenario's baseline is SET (FR-019/FR-018/FR-022)

**Scale/Scope**: 2 new shared UI primitives (`popover.tsx`,
`color-picker.tsx`, Part B); 1 new feature-specific composition component
(`scenarioColorControl.tsx`, Part B); small, surgical edits to 5 existing
files (`yamlLoader.ts`, `scenarioDisplay.ts`, `useScenarioDisplay.ts`,
`main.tsx` — Part A/B — and `scenariosTab.tsx`, touched by both Part B and
now Part C); one small extension to an existing pure module
(`scenarioStatusColor.ts`, Part C); 2 new npm dependencies (Part B only —
Part C introduces none, reusing `switch.tsx`/`badge.tsx` verbatim)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. TypeScript Throughout, React Permitted | All new/changed files `.ts`/`.tsx`, matching the existing split (pure logic `.ts`, JSX `.tsx`) | PASS |
| II. DuckDB-WASM off main thread, one shared instance | Zero changes to `services/duckdb.ts` or any query path | PASS |
| III. No `eval()` | No dynamic code execution anywhere in this feature | PASS |
| IV. YAML parsed at runtime | `scenarioPalette` is read from the existing runtime-fetched `dashboard-config/index.json` JSON (not YAML, matching `title`/`logoUrl`/`logoUrlDark`'s own existing JSON discovery-file precedent — index.json was never YAML) — no new grammar, no build-time baking | PASS |
| V. Parquet-only browser I/O | No new data read path | PASS |
| VI. Fixed technology choices | The 2 new dependencies are a Radix primitive (`@radix-ui/react-slider`, squarely inside "shadcn/ui built on Radix UI primitives") and a plain color-math utility (`color`, the same category as already-present utility deps like `d3-scale-chromatic`/`js-yaml` — not a CSS framework/component library/icon set, so it doesn't compete with anything Principle VI fixes) | PASS |
| VII. Minimal, fixed config file set | `scenarioPalette` is an additive optional field on the EXISTING `dashboard-config/index.json` discovery file (`028`'s own precedent, itself already confirmed not a new config file type) — no new file, no new mechanism | PASS |
| VIII. Reuse proven reference implementations | N/A — this feature touches none of the DuckDB-WASM/MapLibre/spatial-SQL/Vite-setup surfaces those references cover | PASS (not applicable) |
| IX. Fixed Python/JS source split | Zero Python changes — explicitly excluded by spec.md | PASS |

No violations. Complexity Tracking table is not needed.

**Post-Phase-1 re-check**: Phase 1 design (data-model.md/contracts/
quickstart.md) introduced no additional dependency or config-file-type
beyond what's listed above — all nine gates still PASS unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/036-scenario-color-picker/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── scenario-color-resolution.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── components/ui/
│   ├── popover.tsx           # NEW — adapted from shadcn's real,
│   │                          # current new-york-v4 registry source
│   │                          # (matching this project's established
│   │                          # forwardRef/@radix-ui-namespaced-import/
│   │                          # cn/single-quote convention)
│   └── color-picker.tsx      # NEW — adapted from the real
│                              # shadcnblocks/kibo color-picker package:
│                              # ColorPicker (context provider),
│                              # ColorPickerSelection (2D canvas),
│                              # ColorPickerHue/-Alpha (sliders, using
│                              # @radix-ui/react-slider directly inline —
│                              # matching the real source's own structure,
│                              # not extracted into a separate shared
│                              # slider.tsx primitive), ColorPickerEyeDropper,
│                              # ColorPickerOutput (mode Select, reuses
│                              # existing components/ui/select.tsx),
│                              # ColorPickerFormat (hex/RGB/CSS/HSL value
│                              # — its own Inputs made genuinely editable,
│                              # the one deliberate behavior change from
│                              # the real source)
├── services/
│   └── yamlLoader.ts         # EXTEND: DashboardBranding gains
│                              # scenarioPalette?: string[];
│                              # loadDashboardBranding() parses/validates
│                              # it the same way as title/logoUrl/
│                              # logoUrlDark
├── panels/
│   └── scenarioDisplay.ts    # EXTEND: new DEFAULT_PALETTE constant
│                              # (['var(--chart-1)'..'var(--chart-5)']),
│                              # setDeployerScenarioPalette()/
│                              # resolveDefaultScenarioColor(index) —
│                              # still fully DOM-free/pure, resolves a
│                              # palette ENTRY by index, never touches
│                              # getComputedStyle() itself
├── hooks/
│   └── useScenarioDisplay.ts # EXTEND: the ONE surgical change —
│                              # replaces `s.color` (manifest) with
│                              # `resolveDefaultScenarioColor(index)` in
│                              # its existing color-resolution line
│                              # (research.md §3's own "small, surgical
│                              # fallback-branch change" framing, now
│                              # concretely located); also calls
│                              # useColorScheme() internally and factors
│                              # it into its own cache-invalidation check,
│                              # so a var(--chart-N) default color
│                              # re-resolves correctly on a theme flip
│                              # (research.md §4 — a real reactivity gap
│                              # found during planning, not in the
│                              # original spec)
├── main.tsx                  # EXTEND: after resolving `branding`,
│                              # validates scenarioPalette entries via
│                              # CSS.supports('color', entry) (FR-008)
│                              # and calls setDeployerScenarioPalette()
│                              # once, at boot
└── layout/settings/
    ├── scenariosTab.tsx       # EXTEND (Part B, then Part C): Part B
    │                          # replaced the native <input type="color">
    │                          # swatch + inline clear button with
    │                          # <ScenarioColorControl scenario={s} />;
    │                          # Part C adds a row-level status
    │                          # border/wash (className/style on the
    │                          # existing row div, from
    │                          # scenarioStatusColor.ts's extended return
    │                          # shape), a Switch wired to
    │                          # appState.setActive() in the actions
    │                          # cluster, and a conditional "Baseline"
    │                          # Badge in the identity block — the
    │                          # existing Star button/aria-label/
    │                          # aria-pressed/onClick are UNCHANGED
    │                          # (FR-022)
    ├── scenarioColorControl.tsx # NEW (Part B) — Popover + swatch trigger +
    │                            # <ColorPicker> + a reset-to-default
    │                            # action inside the popover content
    │                            # (replacing 035's own inline clear
    │                            # button, FR-016); the only place that
    │                            # converts the picker's own RGBA
    │                            # onChange callback to a hex string via
    │                            # the `color` package before calling
    │                            # appState.setColorOverride()
    └── scenarioStatusColor.ts   # EXTEND (Part C) — scenarioStatusTreatment()'s
                                  # return shape gains `rowBorderClassName`
                                  # (a Tailwind border-l-4 border-l-{token}
                                  # utility — these DO generate real CSS,
                                  # unlike the opacity-modifier form) and
                                  # `rowBackgroundStyle` (a color-mix()
                                  # inline-style object, FR-018) — still
                                  # fully DOM-free/pure, same file, same
                                  # convention its own header comment
                                  # already documents

tests/
├── unit/
│   ├── scenarioDisplay.test.ts   # EXTEND (existing file, 035) — new
│   │                              # cases for resolveDefaultScenarioColor()/
│   │                              # the palette cycling/validation logic
│   └── scenarioStatusColor.test.ts # EXTEND (existing file, 024) — new
│                                    # cases for the row border/background
│                                    # treatment per status (Part C)
└── integration/
    ├── scenarioColorOverride.spec.ts # EXTEND (existing file, 035) —
    │                                  # new cases for palette-default
    │                                  # rendering + the redesigned picker
    └── settingsModal.spec.ts         # EXTEND (existing file) — the
                                       # redesigned row/popover/picker
                                       # interaction (Part B), plus the
                                       # new status treatment/Switch/
                                       # Badge coverage (Part C)
```

**Structure Decision**: Single project, existing `src/`/`tests/` layout.
Two genuinely new shared primitives (matching this project's own
established `components/ui/` pattern for every prior shadcn-sourced
control), one new small feature-specific composition component (matching
`panels/graphicWalkerDatasetPicker.tsx`'s own precedent for extracting a
complex per-row control out of its parent), and surgical edits everywhere
else — no file is rewritten wholesale.

## Complexity Tracking

*No Constitution Check violations — this table is intentionally empty.*
