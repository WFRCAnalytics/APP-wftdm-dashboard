# Contract: Scenario Color Resolution & Picker

Internal UI/resolution contract (no external API/CLI surface) — governs
the three-tier color chain and how the redesigned Scenarios-tab control
reads/writes it.

## Read path — every chart panel and the Scenarios tab swatch alike

**Given** `hooks/useScenarioDisplay.ts`'s `ScenarioDisplayMap`, built once
per relevant render

**When** any consumer (a chart panel's pure encoding function, or
`scenarioColorControl.tsx`'s own swatch) reads `display.get(name)?.color`

**Then** the value is ALWAYS already fully resolved and concrete — never
a raw `var(--x)` reference, never a manifest-color fallback — per this
precedence, evaluated once per scenario, in order:

1. `Scenario.colorOverride`, if set (`035`, unchanged).
2. The deployer-configured palette (`DashboardBranding.scenarioPalette`),
   cycled by the scenario's registration-order index, if configured.
3. The shipped default palette (`--chart-1..5`, resolved to a concrete
   value via `getComputedStyle(document.documentElement)`), cycled the
   same way.

`Scenario.color` (the manifest-sourced field, `025`/`035`) is NEVER
consulted in this chain — confirmed still populated by
`services/scenarioDiscovery.ts`'s unmodified manifest fetch, simply
unread by this resolution.

**Given** the resolved theme (light/dark) changes while a chart or the
Scenarios tab is already rendered

**When** the deployer/shipped-default tier's own concrete value differs
between themes (only the shipped `--chart-N` tokens do — a deployer's own
literal hex entries do not change by theme)

**Then** every consumer re-resolves to the new theme's value automatically
— no reload, no manual re-fetch (research.md §4's `useColorScheme()`
integration).

## Write path — the redesigned picker

**Given** a scenario row's color swatch trigger

**When** a viewer clicks it

**Then** a `Popover` opens (`components/ui/popover.tsx`) containing the
adapted `ColorPicker` (`components/ui/color-picker.tsx`), initialized to
that scenario's current effective color (the same value the read path
above resolves).

**Given** the picker is open

**When** a viewer changes the color via ANY of its surfaces (2D
selection area, hue slider, alpha slider, eyedropper, hex field, RGB
fields)

**Then** `scenarioColorControl.tsx`'s own `onChange` handler converts the
picker's `[r, g, b, a]` callback value to a hex string (`Color.rgb(r, g,
b).hex()`) and calls `appState.setColorOverride(scenario.name, hex)` —
identical downstream effect regardless of which surface was used, and
identical to what `035`'s own native-swatch `onChange` already did (no
change to the write-side contract itself, FR-012).

**Given** the picker is open and `scenario.colorOverride` is currently set

**When** a viewer clicks "Reset to default"

**Then** `appState.clearColorOverride(scenario.name)` is called — the
swatch, the picker's own fields, and every chart showing that scenario
all revert to the deployer/default-palette tier's color, immediately.

**Given** a viewer types an incomplete or invalid hex code, or an
out-of-range RGB number

**When** the input is not yet a valid, complete color

**Then** `colorOverride` is NOT updated — the last valid color stays in
effect (FR-014); an RGB number outside `[0, 255]` is clamped rather than
rejected outright (FR-015).

## Non-goals (explicitly unchanged by this contract)

- `panels/scenarioDisplay.ts`'s `resolveScenarioLabel()`/
  `resolveScenarioColor()` function signatures — unchanged (FR-007).
- `panels/plotlyTraces.ts`/`rechartsEncoding.ts`/
  `observablePlotEncoding.ts`'s own color-consuming branches (`035`) —
  unchanged; they still just read `ScenarioDisplayMap.color`.
- `services/scenarioDiscovery.ts`'s manifest-fetch fix, `Scenario.color`,
  and `python/wftdm_dashboard/postprocessor/manifest.py` — all untouched.
- `035`'s label-propagation logic (Part A of that feature) — entirely
  separate, unaffected by this feature.
