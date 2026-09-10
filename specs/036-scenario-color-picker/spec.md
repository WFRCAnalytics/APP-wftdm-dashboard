# Feature Specification: Deployer Scenario Palette & Redesigned Color Picker

**Feature Branch**: `036-scenario-color-picker`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Deployer-configurable default scenario palette, and a redesigned Scenarios tab with a proper hex/RGB/swatch color picker" — a deliberate revision of `035-scenario-label-color`'s own just-shipped Part B (not a bug fix): replace "manifest.yaml color is the automatic default" with a three-tier chain (viewer override → deployer-configured palette → shipped default palette), and replace the Scenarios tab's plain native swatch with a proper swatch+hex+RGB color-picker control, restructuring the row to fit it. **Amended** (same feature, additive Part C, folded in after Parts A/B had already shipped on this branch): a real UI/UX refinement of the Scenarios tab row itself — a genuinely prominent status treatment, a long-deferred active/inactive toggle wired to `009-scenario-manager`'s own existing `active`/`setActive()`, and a "Baseline" text badge replacing the star icon as the primary baseline indicator. Does not touch Parts A/B's own shipped mechanisms (palette resolution, the color picker) at all.

## Research performed before writing this spec

Per the request's own explicit instruction, every claim below was confirmed
against real, current source — this project's own installed packages, its
own already-shipped code, and shadcn's real, current registry — not
assumed.

**Part A — Recharts' vs Observable Plot's real default categorical
schemes, compared directly:**

- **Recharts has no real default categorical palette to compare.**
  Confirmed by reading the installed package directly:
  `node_modules/recharts/lib/cartesian/Line.js` defaults `stroke` to a
  single hardcoded `'#3182bd'` (one blue, never cycled); `Bar.js` defaults
  `fill` to `'#eee'`. The one real multi-color array in the package,
  `COLOR_PANEL` (`lib/util/Constants.js`, 24 colors starting `#1890FF`),
  is `Treemap`'s own internal fallback only — not a general Bar/Line/Area
  categorical scheme. This project's own `panels/rechartsEncoding.ts`
  already had to build its own `--chart-1..5` cycling logic for exactly
  this reason (`029-shadcn-chart-panel`) — Recharts genuinely provides
  nothing to fall back to here.
- **Observable Plot's `schemeObservable10`** (`d3-scale-chromatic`,
  already installed) is a real, complete 10-color categorical scheme,
  confirmed via direct read of `node_modules/d3-scale-chromatic/src/
  categorical/observable10.js`: `#4269d0` `#efb118` `#ff725c` `#6cc5b0`
  `#3ca951` `#ff8ab7` `#a463f2` `#97bbf5` `#9c6b4e` `#9498a0`.
- **Recommendation, and what this project already did with it**: this
  project's own `src/styles/tokens.css` `--chart-1..5` tokens (added by
  `029-shadcn-chart-panel`, confirmed by direct read) are ALREADY
  lightness-adjusted derivatives of `schemeObservable10`'s first 5 colors
  — WCAG-contrast-verified per token, per theme, by
  `tests/unit/tokenContrast.test.ts`'s own existing coverage. There is no
  real decision left to make between the two schemes: Recharts has no
  scheme to compete with `schemeObservable10` in the first place, and this
  project has already adopted (and verified) an accessible derivative of
  it. The shipped default palette is therefore `var(--chart-1)` through
  `var(--chart-5)`, reused as-is — not a new 10-color palette requiring
  new, unverified tokens.

**Part A — where deployer configuration lives:**

Confirmed via direct read of `services/yamlLoader.ts`/`src/main.tsx`: a
real, precedented deployer-configurable surface already exists —
`public/dashboard-config/index.json`'s richer object shape
(`028-dashboard-branding`), read by `loadDashboardBranding()` and merged
with the git-tracked demo root by per-field precedence
(`primaryBranding.X ?? demoBranding.X`) inside `main.tsx`'s boot sequence.
`title`/`logoUrl`/`logoUrlDark` are the three existing fields; all three
are optional, and an unconfigured deployment gets the code's own default
behavior. A new optional `scenarioPalette?: string[]` field on this exact
same JSON object is the natural fit — same file, same discovery mechanism,
same optional/fail-soft convention, no new config file or mechanism
(constitution Principle VII stays satisfied for the same reason
`028-dashboard-branding` itself did).

**Part A — how this reaches `resolveScenarioColor()`'s fallback,
confirmed to be a small, surgical change:**

`035-scenario-label-color`'s `hooks/useScenarioDisplay.ts` already
iterates every registered scenario once, in a stable order, to build its
`ScenarioDisplayMap` — today resolving `color: s.colorOverride ?? s.color`
(the manifest field) in that same loop. The only change this feature makes
is to that one expression's fallback half: `s.color` (manifest) is
replaced with a palette lookup, cycled by each scenario's position in that
SAME already-existing iteration (the same "stable, first-seen-order index"
convention `panels/rechartsEncoding.ts`'s own `seriesKeys` cycling already
uses). `panels/scenarioDisplay.ts`'s `resolveScenarioColor()` itself,
`Scenario.colorOverride`/`setColorOverride()`/`clearColorOverride()`, and
all three chart panel types' own call sites (`plotlyTraces.ts`/
`rechartsEncoding.ts`/`observablePlotEncoding.ts`) are confirmed
UNCHANGED — none of them read `s.color` directly; they only ever consume
the hook's already-resolved `ScenarioDisplayMap.color`. `Scenario.color`
itself, `services/scenarioDiscovery.ts`'s manifest-fetching fix, and
`python/wftdm_dashboard/postprocessor/manifest.py`'s generation logic are
all confirmed untouched by this feature — the manifest color field simply
stops being the thing this ONE hook line reads, exactly as the feature
description scopes it.

**Part B — a real shadcn-ecosystem color picker exists, found after this
spec's own first draft wrongly concluded otherwise — corrected here
before planning began:**

- Initial research checked shadcn's own official `ui.shadcn.com` registry
  (no color-picker item) and this project's own established design-
  reference repo, `gropaul/dash-ui` (`docs/PIPELINE.md`'s on-record
  inspiration source — checked directly via its real GitHub file tree,
  confirmed no color-picker file). Both checks were real, but incomplete —
  they missed a third-party registry the user then pointed to directly:
  `shadcn.io` (a commercial "shadcn/ui component library" site,
  unaffiliated with the official project). Its `/r/color-picker.json`
  download endpoint is token-gated, but tracing its own GitHub repository
  link (`api.github.com/repositories/847167817`) resolved to the real,
  public, MIT-licensed OSS repo it's built from: `shadcnblocks/kibo`.
- Fetched and read that repo's real `packages/color-picker/index.tsx` and
  its own real usage example directly. It's a compound-component picker
  "modeled after the color picker in Figma" (the package's own
  description): `ColorPicker` (a context provider holding
  hue/saturation/lightness/alpha/mode state), `ColorPickerSelection` (a 2D
  drag canvas for saturation/lightness), `ColorPickerHue`/
  `ColorPickerAlpha` (Radix `Slider`-based sliders), `ColorPickerEyeDropper`
  (the browser's native `EyeDropper` API), `ColorPickerOutput` (a `Select`
  switching the display mode among hex/rgb/css/hsl), and
  `ColorPickerFormat` (the actual hex/RGB/etc. value display for the
  current mode).
- **A real, confirmed mismatch with this feature's own FR-009/FR-010**:
  every `ColorPickerFormat` `Input` in the real source is `readOnly` —
  kibo's own real picker is DISPLAY-only for hex/RGB text; a viewer sets
  color exclusively via the 2D canvas, the sliders, or the eyedropper,
  never by typing. This feature's own explicit ask (direct hex-code text
  entry AND RGB numeric entry, both editable and synchronized) is a real,
  deliberate extension beyond what kibo ships out of the box, not a
  drop-in adoption.
- **Decision, presented to and confirmed by the user directly**: adopt
  kibo's real component as the structural/visual reference in full — the
  2D canvas, hue/alpha sliders, and eyedropper are real, valuable, already-
  built capability worth keeping, not stripped down to a smaller custom
  build — and additionally make `ColorPickerFormat`'s hex/RGB `Input`s
  genuinely editable (remove `readOnly`, wire `onChange` back through
  `setHue`/`setSaturation`/`setLightness`/`setAlpha`), a deliberate,
  documented adaptation on top of the real source, matching this project's
  own established precedent for adapting (not verbatim-copying) a fetched
  shadcn source when its default behavior doesn't fit
  (`029-shadcn-chart-panel`'s own `chart.tsx` polish-pass precedent).
  Real, necessary new dependencies this pulls in: `color` (the npm
  color-math library kibo's own source depends on for
  hex/rgb/hsl/alpha conversion) and `@radix-ui/react-slider` (via the
  unified `radix-ui` package kibo imports from, or the namespaced
  `@radix-ui/react-slider` package matching this project's own existing
  namespaced-import convention — a planning-phase decision, not fixed
  here). `components/ui/select.tsx` (`ColorPickerOutput`'s own dependency)
  and `components/ui/button.tsx`/`input.tsx` (`ColorPickerEyeDropper`/
  `ColorPickerFormat`'s own dependencies) already exist in this project —
  no new primitive needed for either.
- `components/ui/popover.tsx` is unaffected by this correction — kibo's
  own real usage example renders `<ColorPicker>` inline, with no Popover
  wrapping it at all in the reference source; THIS feature still needs a
  Popover to make it a compact, swatch-triggered control that fits inside
  a dense Scenarios-tab row rather than a permanently-expanded panel, so
  the Popover research below still applies, now wrapping kibo's real
  component rather than a self-built one.

Confirmed shadcn's own official registry still has no Popover of its own
in this project yet (`ls src/components/ui/` — no `popover.tsx`;
`package.json` — no `@radix-ui/react-popover`) — that part of the
original research stands.

**Part B — the Scenarios tab row today (confirmed via direct re-read,
`layout/settings/scenariosTab.tsx`, current post-`035` state):** leading
status dot → identity block (editable label `<input>` + monospace `path`)
→ trailing status word → a trailing actions cluster already packing five
controls at `h-6`/`w-6` scale (the `035` color swatch, its conditional
clear button, reorder up/down, baseline star, remove). This is confirmed,
directly, to already be the row's real visual ceiling — replacing the
5th-from-last control with a full swatch+hex+RGB popover trigger fits
without further restructuring (the TRIGGER is still one small swatch-sized
element; the richness lives inside the popover's own content, not inline
in the row), but the row's own conditional "clear override" button
(`035`'s own addition) needs a new home since a Popover-based picker's
own content is the more natural place for a "reset to default" action
than a second inline row button.

**Part C — the row's own real current structure, re-read directly before
designing anything (`layout/settings/scenariosTab.tsx`, current state
after both `035` and this feature's own Part B already touched it
twice):** leading status dot (`h-2 w-2`, `scenarioStatusTreatment()`'s
`dotClassName`) → a `flex-1` identity block (the label `<input>` on top,
monospace `path` below) → a trailing status word (`(ready)`/`(failed)`/
`(registering)`, plain `text-xs`) → a trailing actions cluster already
holding four elements at `h-6`/`w-6`/`h-4`/`w-5` scale: `ScenarioColorControl`
(Part B), a 2-button reorder stack, the baseline `Star` icon button, and a
conditional remove button (`source: 'handle'` only). Confirmed directly,
not assumed: `scenarioStatusColor.ts`'s existing `scenarioStatusTreatment()`
already resolves each of the three real `ScenarioStatus` values
(`'registering' | 'ready' | 'failed'`, no fourth "warning" tier — `024`'s
own already-recorded finding, re-confirmed here) to `--success`/
`--destructive`/`--muted-foreground` respectively — the SAME three tokens
this Part reuses for the row-level treatment below, per the
`wftdm-design-system` skill's own explicit "audited, not extended" color
token rule (no new token is added by this Part). The skill's own Color
tokens section was consulted directly (not assumed) for one more real,
load-bearing constraint: a Tailwind slash-opacity modifier against this
app's plain-hex custom properties (e.g. a hypothetical `bg-success/10`)
generates NO CSS AT ALL (confirmed, repeatedly, across this session's own
prior work) — a subtle background wash must use a real `color-mix(in
srgb, var(--token) X%, transparent)` value instead, the same established
technique `tableLogic.ts`/`zonemapColor.ts`/`PanelEmptyState.tsx` already
use.

`components/ui/switch.tsx` (`033-shadcn-default-theme`) and
`components/ui/badge.tsx` (`034-metric-panel-redesign`) are both
confirmed real, already-shipped, already-adapted primitives — this Part
is their reuse, not their creation. `state/appState.ts`'s `active` field
and `setActive(name, active)` function are confirmed real and already
exhaustively tested (`009-scenario-manager` onward) — `hooks/
useActiveScenarios.ts` already reactively reflects any `setActive()` call
into every `$scenario.`-driven query, the exact mechanism this Part reuses
verbatim, per the request's own explicit "do NOT build a new mechanism"
instruction.

**Row layout conclusion**: the identity block's own `flex-1` width has
real slack (today it holds only a label input + a path line, both
well short of the block's own available width in every real screenshot
checked) — the new "Baseline" badge fits there, inline with the label
input, without narrowing the actions cluster. The actions cluster itself
is already confirmed at its practical visual ceiling (Part B's own research
already reached this same conclusion once, for the color-picker trigger) —
the new Switch is added there anyway, at the same `sm`-scale already used
for other compact row controls, since "whether this scenario is even
included in any query" is a more fundamental, more frequently-used control
than color/reorder/baseline and belongs in the same actions region as
those, not off in a separate, newly-invented layout area. The row-level
status treatment (border + wash) applies to the OUTER row container itself
— it consumes no additional horizontal space in the flex layout at all,
so it adds zero crowding risk to either the identity block or the actions
cluster.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A deployer sets a consistent, on-brand scenario palette (Priority: P1)

A WFRC deployer wants every scenario's chart color to follow their own
agency's brand palette by default, without needing every viewer to
manually pick colors every session. They add a `scenarioPalette` list to
their `dashboard-config/index.json`, and from then on, every scenario
without a viewer override renders in that palette, consistently across
every chart type, for every viewer, out of the box.

**Why this priority**: This is the actual value driver of Part A — a
real, deployer-facing capability that didn't exist before. It also
resolves a real, confirmed gap `035` left behind (manifest-color-as-
default was only ever a Tableau10 auto-pick with no deployer say in it at
all).

**Independent Test**: Configure a `scenarioPalette` in a test
`dashboard-config/index.json`, load two scenarios with no color override,
confirm each renders in the configured palette (cycled by position)
consistently across Plotly/Recharts/Observable Plot. Fully testable
without Part B.

**Acceptance Scenarios**:

1. **Given** a deployer has configured `scenarioPalette: ["#111111",
   "#222222"]`, **When** two scenarios with no viewer override are
   rendered across the three chart types, **Then** the first-registered
   scenario renders in `#111111` and the second in `#222222`,
   consistently across all three.
2. **Given** no `scenarioPalette` is configured anywhere (neither the
   real deployment root nor the demo root), **When** scenarios render,
   **Then** they cycle through this app's own existing `--chart-1`
   through `--chart-5` tokens (the shipped default) — the exact colors
   already used for the sparkline/single-series case elsewhere in this
   app, so a fresh, unconfigured deployment still looks deliberately
   chosen, not random.
3. **Given** a scenario has a viewer-set `colorOverride`, **When** it
   renders, **Then** the override still wins outright over any
   deployer-configured or default palette entry (unchanged from `035`).
4. **Given** more scenarios are active than the configured palette has
   entries, **When** they render, **Then** the palette cycles (wraps
   around), matching this app's own existing `--chart-1..5` wraparound
   convention.
5. **Given** `manifest.yaml`'s own `color` field is inspected directly
   (e.g. via `appState.get(name).color`), **When** compared against a
   scenario's actually-rendered color, **Then** the two are confirmed
   independent — the manifest field is no longer consulted for this
   purpose at all, though it still exists on the `Scenario` object
   unmodified (`services/scenarioDiscovery.ts`'s own fetch is untouched).

---

### User Story 2 - A viewer picks an exact color via swatch, hex, or RGB (Priority: P2)

A viewer wants a specific, exact color for a scenario — maybe to match a
color from an external report — and finds a plain native swatch too
limited (no way to type a known hex code or RGB triple directly). They
open the new color picker from the Scenarios tab, type a hex code (or RGB
values) directly, and see every chart using that scenario update to the
exact color immediately.

**Why this priority**: A real, meaningful upgrade to the viewer-facing
control `035` shipped, but strictly additive polish on top of an already-
working override mechanism — independently valuable, but lower-stakes
than Part A's actual new capability.

**Independent Test**: Open the redesigned Scenarios tab, open a scenario's
color picker, enter a hex code directly, confirm the swatch/RGB fields
update to match and every rendered chart reflects it; separately enter RGB
values and confirm the hex field and swatch update to match. Fully
testable without Part A (the picker writes to the same
`colorOverride`/`setColorOverride()` `035` already built).

**Acceptance Scenarios**:

1. **Given** the Scenarios tab is open, **When** a viewer clicks a
   scenario's color swatch trigger, **Then** a popover opens showing the
   2D saturation/lightness selection area, hue/alpha sliders, an
   eyedropper button, and editable hex/RGB fields, all reflecting that
   scenario's current effective color.
2. **Given** the picker is open, **When** a viewer types a valid hex code
   (e.g. `#ff0000`) into the hex field, **Then** the selection area,
   sliders, and RGB fields update to match (`255, 0, 0`), and
   `appState.colorOverride` updates to the same value.
3. **Given** the picker is open, **When** a viewer instead changes one RGB
   numeric field (or drags the 2D selection area, or moves a slider),
   **Then** every other surface updates to match, and `colorOverride`
   updates identically regardless of which surface was used — all of them
   are confirmed to refer to and update the exact same single color
   value, never independently-drifting states.
4. **Given** an override is set, **When** a viewer resets it from within
   the picker, **Then** the scenario's color reverts to its currently-
   effective deployer/default palette color, and the picker's own fields
   update to reflect that reverted value.
5. **Given** the redesigned row, **When** it is compared against the
   existing label input, baseline star, reorder, and remove controls,
   **Then** all four are confirmed still present and behaviorally
   unchanged — this feature restructures the row's layout, not any of
   those controls' own logic.

---

### User Story 3 - A viewer scans scenario status at a glance, toggles one off, and finds the baseline immediately (Priority: P2)

A viewer with several scenarios loaded wants to (a) immediately tell which
ones are ready, failed, or still loading without reading text, (b)
temporarily exclude a scenario from every chart without removing it
outright, and (c) immediately spot which scenario is the baseline without
hunting for a small filled star among several other icons.

**Why this priority**: Real, valuable, standalone UI/UX polish — same
priority tier as Part B (an upgrade to an already-working mechanism, not a
new capability like Part A's palette), and fully independent of both
Parts A and B (touches only the row's own visual treatment and two
already-existing, already-tested store functions).

**Independent Test**: Load scenarios in each of the three real statuses
(ready/failed/registering — the fixture set's own `good_scenario`/
`broken_scenario`/a scenario mid-registration already cover this),
confirm each row shows a genuinely prominent, distinct treatment; toggle
a scenario's Switch off and confirm its own `$scenario.`-driven panels
stop including it, exactly like today's remove behavior; confirm the
current baseline scenario's row shows a "Baseline" badge and that
clicking another row's own baseline control still moves it.

**Acceptance Scenarios**:

1. **Given** a ready, a failed, and a registering scenario are all loaded,
   **When** the Scenarios tab renders, **Then** each row shows a visibly
   distinct treatment (a colored left border plus a subtle background
   wash, not just the existing small dot) — ready in `--success`, failed
   in `--destructive`, registering in `--muted-foreground` (the same three
   tokens `scenarioStatusTreatment()` already resolves per status, no new
   color).
2. **Given** an active, ready scenario, **When** a viewer toggles its
   Switch off, **Then** `appState.setActive(name, false)` is called, and
   every already-rendered `$scenario.`-driven panel immediately stops
   including that scenario in its query results — the same reactive
   effect removing a scenario already has today, with no panel needing to
   reload.
3. **Given** an inactive scenario, **When** a viewer toggles its Switch
   back on, **Then** `appState.setActive(name, true)` is called and every
   `$scenario.`-driven panel includes it again immediately.
4. **Given** the current baseline scenario's row, **When** the Scenarios
   tab renders, **Then** a "Baseline" text badge appears next to its name
   — visible without hovering or reading a small icon's fill state.
5. **Given** a non-baseline scenario's own baseline control, **When** a
   viewer clicks it, **Then** it becomes the new baseline (unchanged
   `appState.setBaseline()` call) — the badge moves to the newly-marked
   row, and the previously-marked row's own badge disappears.
6. **Given** the redesigned row, **When** compared against the label
   input, reorder controls, remove control, and Part B's own color
   picker, **Then** all are confirmed still present and behaviorally
   identical — this Part is a visual/structural addition, not a change to
   any of them.

### Edge Cases

- An invalid or partial hex code typed into the hex field (e.g. `#ff`,
  `zzz`): the field itself does not propagate an invalid value to
  `colorOverride` — the last valid color stays in effect until a complete,
  valid hex code (or a valid RGB triple) is entered.
- An RGB numeric field given a value outside 0-255: clamped to the valid
  range, matching standard numeric-input convention elsewhere in this
  codebase (no error dialog, no silent no-op).
- A deployer's `scenarioPalette` entry that isn't a valid CSS color
  string: skipped, falling through to the next tier the same way an
  entirely absent configuration would — never a broken/blank chart.
- Both the real deployment root and the demo root configure a
  `scenarioPalette`: the real deployment root wins per-field, the same
  precedence `title`/`logoUrl`/`logoUrlDark` already establish (not a new
  rule invented for this one field).
- Toggling a scenario's own Switch off while it's currently the resolved
  baseline: `getBaseline()`'s own existing resolution rule (an explicit
  baseline is kept regardless of active state; the automatic-default rule
  already excludes non-`ready` scenarios but not inactive ones — confirmed
  via direct re-read of `state/appState.ts`) is unmodified by this Part —
  no new special case is added for "baseline but inactive."
- A scenario with `source: 'handle'` (its own conditional remove button
  still present) is also toggleable via the new Switch — the two controls
  are independent; toggling off does not remove it, and removing it is
  still the only way to fully unregister it, matching the request's own
  explicit scope decision that the toggle replaces the need for a NEW
  removal capability for `url`-sourced (published) scenarios specifically,
  not the existing removal path for local ones.

## Requirements *(mandatory)*

### Functional Requirements

**Part A — deployer-configurable default palette**

- **FR-001**: The system MUST resolve each scenario's default (non-
  overridden) color through a deployer-configured palette when one is
  configured, replacing `035`'s "manifest.yaml `color` is the default"
  behavior entirely for this purpose.
- **FR-002**: `public/dashboard-config/index.json` (and, by the same
  existing precedence rule, `public/demo-dashboard-config/index.json`)
  MUST accept a new, optional `scenarioPalette` field — an array of CSS
  color strings — read by `services/yamlLoader.ts`'s existing
  `loadDashboardBranding()`/`DashboardBranding` mechanism, with the real
  deployment root winning over the demo root when both configure it
  (matching `title`/`logoUrl`/`logoUrlDark`'s existing precedence exactly).
- **FR-003**: When no `scenarioPalette` is configured anywhere, the system
  MUST fall back to this app's own existing `--chart-1` through
  `--chart-5` CSS tokens, cycled the same way, as the shipped default —
  no new, unverified color values introduced.
- **FR-004**: The palette (deployer-configured or shipped default) MUST
  cycle by each scenario's stable position among registered scenarios
  (first-seen/registration order), wrapping around when there are more
  scenarios than palette entries.
- **FR-005**: A viewer's `colorOverride` (`035`, unchanged) MUST continue
  to take precedence over the palette at every tier.
- **FR-006**: `state/appState.ts`'s `Scenario.color` field and
  `services/scenarioDiscovery.ts`'s manifest-fetching logic (`035`) MUST
  remain fully unmodified — this feature changes only which value
  `hooks/useScenarioDisplay.ts`'s own color-resolution line falls back to,
  not how or whether the manifest field itself is populated.
- **FR-007**: `panels/scenarioDisplay.ts`'s `resolveScenarioColor()`
  signature, `panels/plotlyTraces.ts`/`panels/rechartsEncoding.ts`/
  `panels/observablePlotEncoding.ts`'s own existing color-consuming
  branches (`035`), and `panels/PlotlyPanel.tsx`/`RechartsPanel.tsx`/
  `ObservablePlotPanel.tsx`'s own hook-call sites MUST remain unchanged —
  none of them read `Scenario.color` directly today, so none of them
  need to change for this feature.
- **FR-008**: An invalid entry within a configured `scenarioPalette`
  (not a valid CSS color string) MUST be skipped, never breaking chart
  rendering for the scenario that would have used it.

**Part B — redesigned color-picker control**

- **FR-009**: The system MUST provide a new, reusable color-picker UI
  component (`components/ui/color-picker.tsx`), adapted from the real
  `shadcnblocks/kibo` `color-picker` package (Research above) — a visual
  2D saturation/lightness selection area, hue and alpha sliders, an
  eyedropper trigger, and a mode-switchable hex/RGB/CSS/HSL value
  display — kept as a genuine, deliberate adaptation of that real source,
  not a from-scratch build.
- **FR-010**: Unlike the real source's own read-only value display, this
  project's hex and RGB fields MUST be directly editable — a viewer can
  type a hex code or individual R/G/B numbers to set the color directly,
  not only by dragging the 2D selection area or the sliders.
  FR-009/FR-010 together are this feature's own required minimum (swatch,
  hex text entry, RGB numeric entry, all synchronized); the sliders,
  eyedropper, and CSS/HSL modes are kept as real, already-built value
  from the adapted source, not additional requirements of their own.
- **FR-011**: Every one of the color picker's own input surfaces (2D
  selection area, hue slider, alpha slider, eyedropper, hex field, RGB
  fields) MUST refer to and update the exact same single underlying color
  value — changing it through any one surface updates every other
  surface to match, never leaving two surfaces showing contradictory
  values.
- **FR-012**: The Scenarios tab (`layout/settings/scenariosTab.tsx`) MUST
  present this color picker behind a small, swatch-sized Popover trigger
  consistent with the row's existing icon-button scale — the picker's own
  fuller controls live inside the popover's content, not inline in the
  row — writing to the exact same `appState.setColorOverride()`/
  `clearColorOverride()` calls `035` already built (no change to that
  write-side contract).
- **FR-013**: Every other existing row control (status dot, status word,
  label input, baseline star, reorder up/down, remove) MUST remain fully
  present and behaviorally unchanged — this is a layout/visual
  restructuring, not a functional change to any of them.
- **FR-014**: An invalid hex entry (incomplete/malformed) MUST NOT
  propagate to `colorOverride` — the last valid color stays in effect
  until a complete, valid value is entered via any input surface.
- **FR-015**: An RGB numeric field MUST clamp any out-of-range input
  (below 0 or above 255) to the valid range, rather than erroring or
  silently ignoring the input.
- **FR-016**: The color picker popover MUST offer a way to reset the
  scenario back to its currently-effective deployer/default palette color
  (clearing the override), replacing `035`'s own inline "clear override"
  row button — the reset action lives inside the picker's own popover
  content, not as a second separate row-level control.

**Part C — Scenarios tab row refinement (status treatment, active toggle, baseline badge)**

- **FR-017**: Each scenario row MUST show a genuinely prominent visual
  treatment reflecting its own `ScenarioStatus` — a colored left border
  plus a subtle background wash on the row itself, in addition to (not
  instead of) the existing small status dot and status-word text — using
  ONLY the three semantic tokens `scenarioStatusTreatment()` already
  resolves per status (`--success`/`--destructive`/`--muted-foreground`);
  no new color token is introduced.
- **FR-018**: The background wash MUST be produced via a real
  `color-mix(in srgb, var(--token) X%, transparent)` value (inline style
  or a dedicated class), never a Tailwind slash-opacity modifier against
  these custom properties — confirmed, per the `wftdm-design-system`
  skill's own established finding, to generate no CSS at all against this
  app's plain-hex tokens.
- **FR-019**: The system MUST let a viewer toggle any scenario (regardless
  of `source`) active or inactive directly from its own row, via a
  `components/ui/switch.tsx` control wired directly to `state/
  appState.ts`'s existing `active` field and `setActive(name, active)`
  function — no new state mechanism.
- **FR-020**: Toggling a scenario inactive MUST immediately stop every
  `$scenario.`-driven panel from including it in query results, and
  toggling it back active MUST immediately restore that inclusion — both
  via the existing `hooks/useActiveScenarios()` reactivity, with no panel
  reload and no code change to that hook or any panel type.
- **FR-021**: The current baseline scenario's row MUST show a
  `components/ui/badge.tsx` "Baseline" text badge, replacing the filled
  `Star` icon as the PRIMARY way a viewer identifies which scenario is
  currently baseline.
- **FR-022**: The existing click-to-mark-as-baseline interaction (the
  `Star` icon button, its `aria-label`/`aria-pressed`, and its
  `appState.setBaseline()` call) MUST remain fully functional and
  unchanged — this Part changes how the CURRENT baseline is INDICATED,
  not how a viewer SETS it.
- **FR-023**: Every other existing row control (status dot, status word,
  label input, reorder up/down, remove, and Part B's own color picker)
  MUST remain fully present and behaviorally unchanged by this Part.

### Key Entities

- **`DashboardBranding`** (existing entity, `services/yamlLoader.ts`):
  gains one new optional field, `scenarioPalette?: string[]`, alongside
  its existing `title`/`logoUrl`/`logoUrlDark`.
- **Scenario** (existing entity, `state/appState.ts`): unchanged by this
  feature — `color`/`colorOverride`/`active` all already exist (`025`/
  `035`/`009` respectively). Part C reads and writes `active` via the
  already-existing `setActive()`, adding no new field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deployer who configures a scenario palette sees every
  scenario without a viewer override render in that palette, consistently
  across every chart type on the dashboard, with zero per-panel
  configuration required.
- **SC-002**: A fresh, unconfigured deployment still shows a deliberate,
  already-accessible, already-used-elsewhere-in-the-app color scheme by
  default — never an arbitrary or newly-introduced one.
- **SC-003**: A viewer can set an exact, specific color for a scenario via
  typed hex code or RGB values, not only by visually eyeballing a native
  swatch picker.
- **SC-004**: All three color-entry modes (swatch, hex, RGB) stay in sync
  with each other at all times — a viewer switching between them never
  sees a stale or contradictory value in another field.
- **SC-005**: The Scenarios tab's existing controls (reorder, baseline,
  label, remove) remain fully discoverable and usable after the row
  redesign — no existing capability becomes harder to find or use.
- **SC-006**: A viewer can tell a scenario's ready/failed/registering
  status at a glance, without reading the small status-word text.
- **SC-007**: A viewer can exclude a scenario from every chart temporarily
  (toggle off) without losing its registration, and restore it, both in
  one click each, with no page reload.
- **SC-008**: A viewer can identify the current baseline scenario within
  one glance at the row list, without needing to know which small icon
  fill state means "baseline."

## Assumptions

- The shipped default palette reuses this app's own existing
  `--chart-1..5` tokens verbatim rather than introducing a new 10-color
  palette from raw `schemeObservable10` — informed by direct confirmation
  that Recharts has no comparable built-in scheme to weigh against it, and
  that this app has already adopted and WCAG-verified an accessible
  derivative of `schemeObservable10` for exactly this "categorical chart
  color" purpose.
- The color-picker component adapts the real `shadcnblocks/kibo`
  `color-picker` package (confirmed via direct source read, and per the
  user's own explicit confirmation after this exact trade-off was
  presented) — a richer, more capable result than a from-scratch swatch/
  hex/RGB build, at the cost of two new, real dependencies (`color`,
  `@radix-ui/react-slider`) this project didn't need before. Its own
  read-only hex/RGB display is deliberately made editable, a documented
  adaptation, not a verbatim port.
- A palette entry accepts any valid CSS color string (matching the exact
  shape `colorOverride`/manifest `color` already use) — not restricted to
  hex-only, since nothing else in this app's color handling makes that
  restriction either.
- This feature does not persist the deployer's palette choice anywhere
  new — `dashboard-config/index.json` is itself the deployer's own
  existing, already-persistent configuration surface (a static file they
  control), not a new runtime persistence mechanism.
- Part C's row-level background wash percentage (a subtle tint, not a
  solid fill) is a small, reasonable design judgment call within the
  `wftdm-design-system` skill's own token-reuse constraint — the skill
  names the token to use, not an exact opacity percentage for a row-level
  wash (a genuinely new application of those tokens, distinct from the
  dot/text uses the skill's own examples cover) — verified visually in
  both themes before finalizing, matching the skill's own non-negotiable
  dual-theme requirement.
- Toggling a scenario inactive via the new Switch does not change
  `getBaseline()`'s own resolution rule in any way — an explicit baseline
  stays baseline regardless of active state (already true, unmodified);
  the automatic-default rule already never checks `active` either
  (confirmed via direct re-read of `state/appState.ts`), so no new edge
  case is introduced by adding a viewer-facing way to change it.
- The Switch's own default (unchecked/checked) visual state matches
  `Scenario.active` directly — no additional "pending" state is
  introduced for the brief window between a click and `setActive()`
  actually applying, since that call is synchronous, in-memory, with no
  I/O (matching every other row control's own synchronous-write
  convention).
