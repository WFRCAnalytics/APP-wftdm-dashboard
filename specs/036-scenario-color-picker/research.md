# Research: Deployer Scenario Palette & Redesigned Color Picker

Technical Context carried no `NEEDS CLARIFICATION` markers. spec.md's own
"Research performed before writing this spec" already resolved the WHAT/
WHERE for both parts (including the real `shadcnblocks/kibo` correction).
This document covers implementation-shape decisions found during planning
— including one genuinely new reactivity gap (§4) not visible until the
exact code paths were traced.

## §1. `DEFAULT_PALETTE`'s exact values

**Decision**: `['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
'var(--chart-4)', 'var(--chart-5)']` — CSS custom-property REFERENCES, not
resolved hex literals, stored in `panels/scenarioDisplay.ts`.

**Rationale**: These 5 tokens are this app's own real, WCAG-verified,
already-shipped default categorical palette (spec.md's own research) —
referencing them by name (not copying their current hex values into a
second location) means a future retheme of `tokens.css` automatically
carries through to the scenario-color default too, with nothing in this
feature needing to change. `panels/rechartsEncoding.ts`'s own existing
fallback (`` `var(--chart-${tokenNumber})` ``) already proves this exact
string shape is the established convention for "the default categorical
color, by reference" in this codebase.

**Alternatives considered**: Hardcoding the 5 current hex values directly.
Rejected — would silently drift from `tokens.css` the moment either
theme's values are ever revised, a real, avoidable maintenance trap the
reference form doesn't have.

## §2. Where index-based cycling happens

**Decision**: `panels/scenarioDisplay.ts` gains a new, still fully
DOM-free, pure function: `resolveDefaultScenarioColor(index: number):
string`, returning `(deployerPalette ?? DEFAULT_PALETTE)[index %
palette.length]`. `deployerPalette` is a module-level variable, set once
via a new `setDeployerScenarioPalette(palette: readonly string[] |
undefined)` export — mirroring `panels/basemap/registry.ts`'s own
module-level-cache-set-once shape, not a reactive store (the deployer's
own configuration is fixed at boot, never changes mid-session).

`hooks/useScenarioDisplay.ts`'s own existing scenario-iteration loop
already visits every registered scenario in one pass (§4 below covers its
full, corrected shape) — the array index from that SAME pass is what
`resolveDefaultScenarioColor()` receives, matching
`rechartsEncoding.ts`'s own "first-seen/registration order" cycling
convention exactly (spec.md FR-004).

**Rationale**: Keeps `panels/scenarioDisplay.ts` importable from a
plain-Node Vitest test with zero new risk (matching `034`'s own
`panels/expandablePanelTypes.ts` precedent, cited again here since this
module has the identical constraint) — `resolveDefaultScenarioColor()`
itself never touches `getComputedStyle()` or any other browser API; it
returns the raw string (a literal hex a deployer configured, OR a
`var(--chart-N)` reference for the shipped default) unresolved, deferring
resolution to wherever it's actually safe to do so (§4).

## §3. `main.tsx` — validating and wiring the deployer palette

**Decision**: After `main.tsx`'s existing `branding` object resolves
(the `primaryBranding.X ?? demoBranding.X` precedence block, `028`'s
already-shipped shape), add `scenarioPalette:
primaryBranding.scenarioPalette ?? demoBranding.scenarioPalette` to it,
filter out any entry that isn't a valid CSS color via the real, standard
`CSS.supports('color', entry)` browser API (FR-008 — no new validation
library, no regex-based hex-only check that would incorrectly reject a
legitimate `rgb(...)`/named-color entry), and call
`setDeployerScenarioPalette(validEntries.length > 0 ? validEntries :
undefined)` once.

**Rationale**: `CSS.supports()` is the correct, standard way to ask "is
this a real CSS value" without constructing a DOM element or writing a
hand-rolled color-format parser — a real, already-available browser API,
zero new dependency. `services/yamlLoader.ts`'s `loadDashboardBranding()`
itself stays a thin, format-only parse (mirroring how it already leaves
`title`/`logoUrl`/`logoUrlDark` completely unvalidated beyond "is this a
string") — semantic validation (is this a real color) belongs at the
boot-sequence call site, matching where `main.tsx` already does its own
`branding.title`-driven `document.title` side effect, not buried inside
the fetch/parse layer.

## §4. A real reactivity gap found during planning: the shipped default must re-resolve on a theme flip

**Finding**: `DEFAULT_PALETTE` entries are `var(--chart-N)` REFERENCES
(§1), but every real color consumer downstream — `plotlyTraces.ts`'s
`marker.color`, `rechartsEncoding.ts`'s `chartConfig[key].color`,
`observablePlotEncoding.ts`'s `plotOptions.color.range` — ultimately needs
a CONCRETE color value, not a raw CSS variable reference. Confirmed
directly: `PlotlyPanel.tsx`'s own existing `resolveThemeLayout()` already
resolves every token color it needs via `getComputedStyle(el)` rather than
ever handing Plotly a raw `var(--x)` string — the established, proven
pattern in this exact codebase for "a CSS token needs to reach a
rendering library that doesn't sit inside the normal DOM/CSS cascade the
way a plain styled `<div>` does." `rechartsEncoding.ts`'s own EXISTING
`` `var(--chart-${n})` `` fallback is the one case that already works
un-resolved (Recharts renders through ordinary React-owned DOM elements
with a real inherited CSS cascade) — but `observablePlotEncoding.ts`'s
`range` array is new territory for this exact string shape (035 never put
a raw CSS-var string there before, only real resolved hex values from
`Scenario.color`), and Plotly's own SVG-attribute rendering path is
confirmed NOT to reliably honor `var()` the same way.

**Decision**: Resolve `var(--chart-N)` to a concrete value in exactly one
place — `hooks/useScenarioDisplay.ts` itself — before it ever reaches any
panel-type-specific code. The hook already has real DOM access (it's a
React hook, not a pure module); resolving centrally here means
`plotlyTraces.ts`/`rechartsEncoding.ts`/`observablePlotEncoding.ts` all
keep receiving an already-concrete value exactly as they do today, with
zero changes to any of the three (matching spec.md FR-007's own explicit
requirement that none of them change). Resolution: if
`resolveDefaultScenarioColor()`'s return value starts with `'var('`,
extract the token name and call
`getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim()`
— `document.documentElement` (not a specific panel's own container) is
correct because `--chart-1..5` are real `:root`-scoped tokens, and dark
mode toggles via a `.dark` class on that exact same element (confirmed via
`hooks/useColorScheme.ts`'s own already-established convention).

**The reactivity half of this finding**: a pure `getComputedStyle()` call
only returns the CURRENT theme's value — it does not itself trigger a
re-render when the theme later flips. `useScenarioDisplay()`'s own
`useSyncExternalStore` subscribes to `appState.subscribe` only, which
never fires on a theme change (a completely separate store,
`state/themeState.ts`). Without a fix, a scenario's default color would go
stale across a light/dark toggle — resolved once, at whatever theme was
active on first render, never refreshed. Fixed by having
`useScenarioDisplay()` also call `useColorScheme()` internally (already a
plain, real hook — `011-basemap-style-system`) and factoring its return
value into the hook's own existing cache-invalidation comparison (the
same `changed` check that already compares `label`/`color` per scenario)
— `useColorScheme()`'s own `useSyncExternalStore` already forces a
re-render of whatever component calls it on every real theme flip, which
is what makes `useScenarioDisplay()`'s own `getSnapshot()` run again on
that same render pass, this time correctly detecting the theme change and
rebuilding the map with a freshly-resolved concrete value.

**Alternatives considered**: Resolving `var()` independently inside each
of the three panel components (mirroring `PlotlyPanel.tsx`'s own existing
per-component `getComputedStyle()` call). Rejected — would triplicate the
same resolution/reactivity logic three times (once per panel type), each
needing its own theme-flip handling, versus doing it once, correctly, at
the one shared point every panel type already reads from.

## §5. `components/ui/color-picker.tsx` — file structure matches the real source, not this project's usual per-primitive-file convention

**Decision**: `@radix-ui/react-slider` is used directly, inline, inside
`ColorPickerHue`/`ColorPickerAlpha` within this ONE file — no separate
`components/ui/slider.tsx` wrapper is created.

**Rationale**: This deliberately mirrors `shadcnblocks/kibo`'s own real,
confirmed source structure exactly (`packages/color-picker/index.tsx`
imports `Slider` from `radix-ui` and uses `<Slider.Root>` etc. directly,
with no separate shared Slider primitive of its own) — the Slider styling
here is specific to this control (hue-gradient track, alpha checkerboard
track) and isn't a general-purpose primitive any other part of this app
currently needs. Matches this project's own precedent for "adapt the real
source's actual structure, don't impose an unrelated convention on it"
(`029-shadcn-chart-panel`'s `chart.tsx`, fetched and kept close to shadcn's
own real file shape rather than split up).

**Alternatives considered**: Extracting a general `components/ui/
slider.tsx` anyway, for consistency with every other Radix-backed control
in this project having its own dedicated primitive file. Rejected as
premature abstraction — no second consumer exists yet; if one arises
later, extracting `slider.tsx` out of `color-picker.tsx` at that point is
a small, safe refactor, not a reason to do it preemptively now.

## §6. Converting the picker's RGBA callback into `colorOverride`'s hex-string contract

**Decision**: The new `layout/settings/scenarioColorControl.tsx` (not
`color-picker.tsx` itself) owns the one conversion: `ColorPicker`'s
`onChange` hands back `[r, g, b, a]`; `scenarioColorControl.tsx` converts
via `Color.rgb(r, g, b).hex()` (the SAME `color` package `color-picker.tsx`
already depends on — no new dependency for this) and calls
`appState.setColorOverride(name, hex)`, preserving `035`'s existing
hex-string contract for `Scenario.colorOverride` unchanged.

**Rationale**: Keeps `components/ui/color-picker.tsx` a generic, reusable
primitive with no scenario-specific knowledge (it doesn't know about
`appState` or hex-string storage conventions at all — a real, worthwhile
separation, since a future, unrelated feature could reuse the picker
against a differently-shaped store) — the adaptation/glue code belongs in
the feature-specific composition component, not the shared primitive.

## §7. The "reset to default" action's exact placement

**Decision**: Inside `scenarioColorControl.tsx`'s own Popover content,
above or below the `<ColorPicker>`, a small text/ghost button ("Reset to
default") — shown only when `s.colorOverride` is set (same conditional-
visibility convention `035`'s own inline clear button already used) —
calling `appState.clearColorOverride(s.name)` and closing the popover.

**Rationale**: `035`'s inline row-level clear button (a second `Button`
next to the native swatch) no longer fits once the swatch becomes a
popover TRIGGER rather than the editable surface itself — putting the
reset action where the rest of the color-editing UI now lives (inside the
popover) is the natural new home, and avoids a redundant SECOND
always-visible affordance sitting in the already-dense action cluster row
(spec.md FR-016, FR-013's "every other row control remains present and
unchanged" is satisfied since this is a genuinely NEW placement for an
action `035` itself introduced, not a removal of a pre-existing,
independently-shipped row control).
