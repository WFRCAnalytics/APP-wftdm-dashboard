# Research: Settings Modal Visual Redesign

## §1. Raster preview does NOT need a new style-construction path

**Original assumption (from the feature request)**: "This does NOT go through
`loadBasemapStyle()`/`composeStyles()` — a raster provider selection isn't a
`BUILT_IN_PRESETS` entry — so this needs its own small, explicit
style-construction path."

**Finding**: This is incorrect for the code as it exists today. Read directly
(`src/panels/basemap/loadBasemapStyle.ts:96-150`), `resolvePresetName()` —
the same internal function `loadBasemapStyle()` already calls for every
vector-style entry — has a THIRD branch, after the built-in-preset checks,
that handles exactly this case:

```ts
const raster = await resolveRasterProvider(name, signal)
if (raster) {
  return { kind: 'style', style: { version: 8, sources: { basemap: { type: 'raster', tiles: raster.tiles, ... } }, layers: [...] } }
}
```

This branch was built for `Apply`-time resolution (so a raster selection
already renders correctly once committed as the global basemap) — it is
already fully exercised by production code, just never by the Basemap tab's
own live-preview effect. `basemapTab.tsx`'s preview effect
(`loadBasemapStyle.ts` consumer at `basemapTab.tsx:178-193`) explicitly
short-circuits before ever calling `loadBasemapStyle()` when the staged
selection is a raster provider:

```ts
if (!mapReady || !mapRef.current || isRasterProviderSelection(stagedSelection)) return
```

**Decision**: Remove the `isRasterProviderSelection(stagedSelection)` early
return from the preview effect and delete the "No live preview for raster
providers" placeholder branch in the render. `loadBasemapStyle()` needs zero
changes — the existing raster branch already IS the "small, explicit
style-construction path" the request asked for; it was simply never reached
from the preview effect. This satisfies FR-004/FR-005/FR-006 with no new
resolution logic and no risk of the preview ever diverging from what Apply
actually produces (they call the exact same function).

**Alternative considered**: building a second, preview-only raster style
constructor (duplicating the object shape at `loadBasemapStyle.ts:110-144`).
Rejected — this would create exactly the "two implementations that can
silently diverge" risk Constitution-adjacent project convention (e.g.
`panelQuery.ts`'s `buildComparisonDiffQuery()` reuse, `resolveRasterProvider()`
reuse across `composeStyles()`/`resolvePresetName()`) already avoids
elsewhere in this codebase, for no benefit.

**Remaining real work for FR-007** (preview failure state): confirmed
`loadBasemapStyle()` already catches any non-abort failure and resolves to
`freshBlankStyle()` rather than rejecting (`loadBasemapStyle.ts:74-93`) — so
a raster fetch/tile failure during preview will silently show a blank
background today, not a distinct failure message, once the guard above is
removed. The preview effect needs its own thin failure-detection layer (e.g.
a MapLibre `'error'` listener scoped to the current generation, mirroring
`FlowMapPanel.tsx`'s own basemap-application `'error'` handling) to satisfy
FR-007's "distinct failure indication" requirement — `loadBasemapStyle()`'s
own coarse "fall back to blank" contract is correct for a real panel (FR-010
of 011) but not expressive enough on its own for a preview surface whose job
is specifically to show the viewer whether a selection works.

## §2. Semantic status color — no "warning" tier exists in the real data model

Confirmed directly (`src/state/appState.ts:17`): `ScenarioStatus = 'registering' | 'ready' | 'failed'`. Two real, existing values map directly to
this feature's "green for ready, red for error" request. No third value
exists to color yellow.

**Decision**: `ready` → new success/green token; `failed` → existing
`--destructive` (already used for the scenario-load error text at
`scenariosTab.tsx:111`); `registering` → neutral/pending treatment (muted
tone, optionally a subtle pulse/spinner), not a new color. See spec.md's own
Assumptions section — this is recorded there, not as a scope change.

**Token gap**: `src/styles/tokens.css` defines `--primary`, `--accent`,
`--destructive` (plus their `-foreground` pairs) in both the `:root` (light)
and `.dark` blocks, but no green/success token exists anywhere in the file
(confirmed via direct read of both blocks). This feature adds one new pair —
`--success` / `--success-foreground` — to both blocks, following the exact
existing pattern (a light value in `:root`, a dark-mode-adjusted value in
`.dark`), the same way `--destructive` already does. No Tailwind config
changes needed beyond what already maps CSS custom properties to utility
classes for the existing tokens (confirmed the existing pattern is plain CSS
custom properties consumed via arbitrary-value Tailwind classes, e.g.
`text-destructive`/`bg-destructive`, not a `tailwind.config` color-key
addition per token — `--success` slots into the same mechanism with zero
config changes).

## §3. Appearance tab Tabs rebuild — nested `role="tablist"` collision, confirmed and scoped

Confirmed (`src/layout/settingsModal.tsx:50-56`) the Settings modal's own
outer navigation is already a `Tabs`/`TabsList`/`TabsTrigger` region
(`orientation="vertical"`, shipped by 021) — meaning it already renders as a
real `role="tablist"` containing four `role="tab"` elements ("Appearance",
"Scenarios", "Basemap", "Documentation"). Rebuilding the Appearance tab's
System/Light/Dark selector with the same `Tabs` primitive creates a SECOND
`role="tablist"` region, nested inside the first one's own active
`TabsContent`, while the modal is open on the Appearance tab.

**Confirmed via direct grep of `tests/integration/settingsModal.spec.ts`**:
every existing test that queries the outer tab strip does so by accessible
name (`page.getByRole('tab', { name: 'Appearance' })`, etc.) — none use an
unscoped, name-less `page.getByRole('tablist')`/`page.getByRole('tab')`
query against this modal. Since "Appearance"/"Scenarios"/"Basemap"/
"Documentation" (outer) and "System"/"Light"/"Dark" (inner, planned) are
disjoint accessible names, these existing by-name queries are NOT at risk of
collision and need no change.

**What DOES break, confirmed by direct read of the current
`appearanceTab.tsx` and its tests**: today's System/Light/Dark control is a
plain `<Button>` row (`role="button"`, `aria-pressed`), not a `Tabs`
instance — `settingsModal.spec.ts` has (at minimum) two assertions written
against that shape: `page.getByRole('button', { name: 'Dark' })` +
`toHaveAttribute('aria-pressed', 'true')` (and the equivalent for `'Light'`/
`'System'`). Once rebuilt as a `Tabs` instance, these become `role="tab"`
elements exposing `aria-selected` (Radix's own attribute for the active tab
in a `Tabs.Trigger`), not `aria-pressed`. These assertions MUST be migrated
to `page.getByRole('tab', { name: 'Dark' })` +
`toHaveAttribute('aria-selected', 'true')` as part of this feature — this is
expected, in-scope test maintenance, not a regression to avoid.

**Decision — disambiguation approach for any FUTURE query that does need to
tell the two `tablist` regions apart** (FR-013): give each `TabsList` an
explicit `aria-label` distinguishing it by name — the outer
`settingsModal.tsx` `TabsList` gets `aria-label="Settings sections"`, the
new inner Appearance `TabsList` gets `aria-label="Theme"` (reusing the exact
label the current plain `<div role="group" aria-label="Theme">` wrapper
already uses today, so the accessible name a screen-reader user or an
automated test sees for this control does not change across the rebuild).
This needs no change to the shared `components/ui/tabs.tsx` primitive itself
— `TabsList` already spreads arbitrary props (including `aria-label`) onto
the underlying Radix `TabsPrimitive.List`. A new regression test asserts
`page.getByRole('tablist', { name: 'Settings sections' })` and
`page.getByRole('tablist', { name: 'Theme' })` each resolve to exactly one
element while the Appearance tab is open, directly proving FR-013/SC-005
rather than assuming the `aria-label` addition is sufficient.

**Alternative considered**: scoping every test query through
`page.getByRole('dialog')` (the fix already used for the UNRELATED
GraphicWalkerPanel-vs-page-level collision, per this project's own prior
history). Rejected as the primary mechanism here — that fix disambiguates
"inside the Settings dialog" from "elsewhere on the page," which does
nothing to distinguish the modal's OWN two nested tablists from each other.
It remains valid, unrelated hygiene for any query that isn't already scoped
to the dialog, but is not what solves FR-013.

## §4. Basemap tab visual polish — confirmed no accordion, no thumbnails, no mechanism change

Confirmed via direct read of `basemapTab.tsx` (current, 021-shipped): the
catalog is already a flat, sectioned list (`SECTIONS.map(...)` rendering
`role="radiogroup"` per section, `role="radio"` `<Button>` per entry) with a
single shared preview map above it and a stage-then-Apply flow. No
accordion/collapse behavior exists to remove, and no thumbnail-per-entry
rendering exists to add. This item is scoped purely to the visual treatment
of the existing `Button`/heading markup (spacing, sizing, typography,
hover/active/staged states) — no data shape, no new section, no new state
variable. Confirmed this is a strictly additive/restyling change: every
existing `data-testid`, `role`, and `aria-*` attribute this component's own
tests depend on (`role="radio"`, `aria-checked`, `data-staged`,
`data-testid="basemap-sections-scroll"`, `data-testid="raster-loading-skeleton"`)
must be preserved unchanged.

## §5. No new dependency required

- Raster preview: MapLibre GL (already pinned, `^4.7.1`) supports
  `type: 'raster'` sources natively — already proven by
  `loadBasemapStyle.ts`'s own existing raster branches (§1 above) and by
  `composeStyles()`'s raster+vector UGRC-hybrid composition path. No new
  package needed.
- Appearance tab rebuild: `components/ui/tabs.tsx` (Radix `@radix-ui/
  react-tabs`, already installed and already used both by `navBar.tsx`
  (horizontal) and `settingsModal.tsx` (vertical)) already supports a
  plain, default-orientation (horizontal) instance with no further
  primitive changes — confirmed the existing `data-[orientation=vertical]:`
  variants added by 021 are additive Tailwind variants alongside, not
  instead of, the pre-existing horizontal classes, so an Appearance-tab
  instance that passes no `orientation` prop (or explicitly
  `orientation="horizontal"`) renders exactly as `navBar.tsx`'s own strip
  already does.
- Scenario/basemap visual polish, semantic status coloring: pure Tailwind
  utility classes plus the one new `--success` token pair (§2) — no new
  dependency.
