# Research: Basemap Catalog Redesign and Settings Modal Visual Polish

All items the spec's own "Pre-Specification Research Findings" section
already resolved (UGRC endpoints incl. the third "Vector Outdoors" entry,
OpenFreeMap's real catalog, MapTiler's key requirement, the leaflet-
providers preview URL, Radix Tabs' native vertical orientation, and the
Appearance tab's already-correct form) are **not** re-derived here — see
`spec.md` for the full record. This file covers the remaining
implementation-shape decisions Phase 0 needs to settle before Phase 1
design.

**Revision note**: §3–§6 below REPLACE this file's own original design
entirely — an earlier draft had each catalog entry open its own
independent `Popover` containing its own on-demand preview map, applying
immediately on click. That design is discarded, not merely amended: it
had a real, confirmed gap (multiple simultaneous previews were possible,
since each `Popover` was uncontrolled) whose fix (a single shared
"which preview is open" value) turned out to be the wrong layer to fix it
at — the actual product decision, made explicit only after review, is
that there should never have been more than one preview surface to begin
with. The `@radix-ui/react-popover` dependency, `components/ui/popover.tsx`,
and every per-entry-preview-trigger design element are removed by this
revision, not deprecated.

## 1. How a UGRC preset name resolves through the registry

**Decision**: Generalize `registry.ts`'s `BUILT_IN_PRESETS` map from
`Record<BasemapPresetName, UrlPreset>` to
`Record<BasemapPresetName, UrlPreset | CompositionPreset>`, where
`CompositionPreset = { kind: 'composition'; layers: string[] }` — the
exact same `layers` shape `BasemapComposition` (`types.ts`) already uses.
`loadBasemapStyle.ts`'s `resolvePresetName()` gains one new branch before
its existing raster-provider fallback:

```ts
const builtIn = resolveBuiltInPreset(name)
if (builtIn?.kind === 'url') return { kind: 'url', url: builtIn.url }
if (builtIn?.kind === 'composition') return { kind: 'style', style: await composeStyles(builtIn.layers, signal) }
```

The three UGRC entries are added to `BUILT_IN_PRESETS` as:

```ts
'ugrc-vector-lite':     { kind: 'composition', layers: [LITEBASE_URL, LITELABELS_URL] },
'ugrc-vector-hybrid':   { kind: 'composition', layers: ['Esri.WorldImagery', VECTOR_OVERLAY_URL] },
'ugrc-vector-outdoors': { kind: 'composition', layers: [OUTDOORSBASE_URL, OUTDOORS_LABELS_URL] },
```

using the exact URLs already proven in `dashboard-3-basemaps.yaml`
(spec.md Finding 1).

**Rationale**: `composeStyles()` is called with the identical `layers`
array shape whether it came from an author's own `dashboard-*.yaml`
`basemap: { layers: [...] }` or from a built-in preset name — satisfying
FR-009 (removing a UGRC alias from the registry must not break an
author's own hand-written equivalent) structurally, not by convention:
both paths terminate in the exact same function call with the exact same
argument shape, so there is no "preset version" of `composeStyles()` to
diverge from the "manual" version. `isBasemapComposition()` (`types.ts`)
is unchanged and untouched — it still only ever sees a real
`BasemapComposition` object passed directly as `config.basemap`/
`config._tabDefaultBasemap`/the global pick; a UGRC preset NAME (a
string) never reaches it, exactly like every other preset name today.

**Alternatives considered**:
- *A new, parallel `UGRC_PRESETS` map, checked before `BUILT_IN_PRESETS`* —
  rejected: would create two separate "built-in preset" catalogs with
  different shapes for `listBuiltInPresetNames()`/`listCuratedRasterProviders()`-
  style enumeration to reconcile, for no benefit over one map with a
  tagged-union value type.
- *Storing the UGRC layers as literal `BasemapComposition` objects
  directly in `BUILT_IN_PRESETS`'s values, keyed by the SAME
  `BasemapSelection` union `types.ts` already exports* — rejected:
  `BUILT_IN_PRESETS` is keyed by `BasemapPresetName` (a plain string) and
  looked up via a string preset name (`resolvePresetName(name: string)`);
  a `BasemapComposition` object was never going to arrive there as a
  lookup key, only as a resolved lookup VALUE — the `kind: 'composition'`
  tag on the value is what the code actually needs, not a different key
  shape.

## 2. Curated raster provider list — computed, not hand-copied

**Decision**: `registry.ts` gains a new exported async function:

```ts
export interface CuratedRasterProvider {
  name: string       // the dotted PARENT provider name, e.g. "OpenStreetMap"
  variants: string[] // e.g. ["Mapnik", "DE", ...]; empty if the provider has no variants (selectable bare)
}

export async function listCuratedRasterProviders(signal?: AbortSignal): Promise<CuratedRasterProvider[]>
```

It fetches the same cached `leaflet-providers.json` catalog
`resolveRasterProvider()` already loads (reusing `loadProvidersCatalog()`,
made non-`function`-local so both can share it), then, for each top-level
provider, computes every EFFECTIVE URL the provider can produce (its own
parent `url`, plus each variant's own `url` override if it has one) and
excludes the whole provider if:

1. any effective URL contains an API-key/token placeholder
   (`{apikey}`, `{api_key}`, `{key}`, `{accessToken}`, `{access_token}`,
   `{subscriptionKey}`, `{app_id}`, `{app_code}`, `{token}` — case
   insensitive), OR
2. any effective URL is `http://` (not `https://`), OR
3. any effective URL contains a `{token}` placeholder outside the set
   this project's raster-resolution code already substitutes
   (`{s}`, `{r}`, `{variant}`, `{z}`, `{x}`, `{y}`).

Plus one small, explicit, hand-maintained exclusion list —
`CURATED_RASTER_EXCLUDE = ['CartoDB']` — for the one deliberate editorial
call (spec.md Assumptions: avoid a second, lower-fidelity "Positron"/
"Dark Matter"/"Voyager" raster option duplicating the CARTO Vector Tiles
section).

Applying this filter against the real, current
`public/basemap/leaflet-providers.json` during Phase 0 research produced
exactly the 17-provider set already named in spec.md Finding 4
(`OpenStreetMap`, `OpenSeaMap`, `OPNVKarte`, `OpenTopoMap`,
`OpenRailwayMap`, `SafeCast`, `CyclOSM`, `Esri`, `FreeMapSK`, `HikeBike`,
`nlmaps`, `NLS`, `OneMapSG`, `USGS`, `WaymarkedTrails`, `OpenSnowMap`,
`SwissFederalGeoportal`).

**Rationale**: This project's own established convention for this exact
catalog is dynamic, runtime resolution against the fetched JSON
(`resolveRasterProvider()`, 011/012's own design) — never a hand-copied
snapshot of provider names baked into application code. A hand-maintained
static list of 17 provider names would silently drift the moment
`public/basemap/leaflet-providers.json` is ever regenerated (a newer
leaflet-providers release, a provider gaining a new key-requiring
variant, a URL scheme changing from `http` to `https` or vice versa) —
nothing would force a re-audit. Computing the filter against the live
catalog means the curated list self-corrects the next time the catalog
file is regenerated, with only the one small, genuinely-editorial
exclusion (`CartoDB`) needing a human decision at all.

**Alternatives considered**:
- *A fully hand-curated static array of 17 provider names, written once
  from this session's research* — rejected for the staleness risk above;
  also duplicates logic `resolveRasterProvider()` already has for
  "does this provider/variant resolve" without reusing it.
- *Filtering by an allowlist of provider NAMES instead of inspecting URL
  templates* — rejected: it's exactly the fragile, non-mechanical
  approach that requires manual re-auditing on every catalog update; the
  three URL-template conditions above are directly computable from the
  data already being fetched, with no extra network cost.

## 3. One persistent shared preview, not one per entry

**Decision**: The Basemap tab renders exactly ONE `maplibregl.Map`
instance, in a fixed-height preview area above the four catalog sections.
It is created once in `basemapTab.tsx`'s own mount effect (the same
two-effect create-once/cleanup-on-unmount shape this project's Panel
pattern already establishes) and destroyed in that effect's cleanup —
which, because Radix `TabsContent`/`DialogContent` do not force-mount
(already confirmed real behavior in this codebase — 020-settings-modal's
own quickstart.md notes "Radix Dialog/Tabs don't mount any tab's content
until opened"), happens automatically and exactly whenever the viewer
switches away from the Basemap tab OR closes the Settings modal. There is
no separate "is the tab still active" bookkeeping to write — ordinary
React mount/unmount already IS the map's create/destroy lifecycle.

Every UGRC/CARTO/OpenFreeMap entry is a plain selectable button (a label
+ a small, static, per-section icon — never a photographic thumbnail;
see §4's assumption). Clicking one sets `basemapTab.tsx`'s own
`stagedSelection` state to that entry's preset name; a `setStyle()`
effect keyed on `stagedSelection` (the SAME "resolve via
`loadBasemapStyle()`, then `map.setStyle()`" shape 011-basemap-style-
system's own `FlowMapPanel.tsx`/`ZoneMapPanel.tsx` basemap-application
effects already use, reused here rather than re-derived per constitution
Principle VIII) re-styles the ONE persistent map — never recreates it.
Selecting a Raster Tiles entry also sets `stagedSelection`, but a second
condition on the same effect skips the `setStyle()` call whenever the
staged value is a raster provider name (FR-008/FR-013's "no live preview
for raster" carried forward unchanged from the original design intent —
see §5 for how the preview area actually communicates this state to the
viewer instead of silently doing nothing).

**Rationale**:
- **Removes the entire "how many previews can be open" question, not
  just its worst symptom.** An earlier draft of this file (superseded)
  gave every entry its own independent, uncontrolled `Popover` and a
  matching preview map, discovered on review to allow more than one
  simultaneously open, then "fixed" with a single shared
  `openPreviewName` value gating N popovers. That fix was real but was
  patching a symptom of the deeper design mistake: there was never a
  product reason for more than one preview SURFACE to exist at all. One
  persistent preview area, with clicking an entry simply re-styling it,
  removes the multiplicity (and the WebGL-context-multiplication risk
  that came with it) at its root — there is exactly one `maplibregl.Map`
  this feature ever creates, full stop, not "at most one, enforced by a
  gating value."
- **Reuses `loadBasemapStyle()` directly**, same as the superseded
  design's own reasoning — the preview can never show something a real
  panel would resolve differently, including the UGRC compositions' own
  multi-layer/sprite handling (017-multi-sprite-support) and the
  dark-background fix (016-fix-ugrc-dark-mode).
- **No new Radix dependency.** `@radix-ui/react-popover` and
  `components/ui/popover.tsx` are no longer needed anywhere in this
  feature — removed from Technical Context/Project Structure (plan.md).
  A plain, always-rendered `<div>` container for the map, inside
  `basemapTab.tsx`'s own JSX, is all the "preview surface" needs to be.
- **Bounded WebGL cost, addressed structurally**: exactly one
  `maplibregl.Map` instance exists for the lifetime of this feature's own
  UI, mount-scoped to the Basemap tab being the active Settings tab —
  never more, never fewer, with no shared/gating state required to make
  that true.

**Alternatives considered**:
- *Keep the per-entry `Popover`-preview design, fixed with the
  `openPreviewName` gating value* — this was this file's own prior
  decision (superseded). Rejected on reflection: it solved the
  "simultaneously open" symptom but not the actual product question this
  redesign settles instead — a viewer comparing candidates benefits far
  more from ONE stable preview area they can glance at repeatedly while
  clicking through different catalog entries than from opening and
  closing a new popover per candidate.
- *A shared, single always-mounted preview map, re-styled per hover* —
  rejected, same reasoning as before: "stage on click, apply on a
  separate explicit action" (this feature's actual new flow) makes
  hover-preview unnecessary complexity — a click already commits to
  "show me this one," no additional hover-vs-click distinction needed.

## 4. Vector-style entries are plain labeled options, not thumbnails

**Decision**: Each UGRC/CARTO/OpenFreeMap catalog entry renders as a
name/label plus one small, static, per-SECTION icon (e.g. one icon for
"this is a UGRC composition," a different one for "this is a CARTO
style," etc. — not a unique icon per preset, and never a rendered map
thumbnail). What a selection actually looks like is answered entirely by
the shared preview area (§3), not by anything on the entry itself.

**Rationale**: This project has no existing precedent or asset pipeline
for shipping bundled preview images (`public/` holds only Parquet/
GeoParquet data and the `coi-serviceworker` script) — carried forward
from the superseded design's own reasoning against static thumbnails.
With a single shared live preview area now doing the actual "what does
this look like" job, a per-entry visual only needs to communicate
CATEGORY (which section/kind of basemap this is), which a small static
icon does perfectly well and cheaply.

**Alternatives considered**:
- *A unique static thumbnail per preset* — rejected for the asset-
  pipeline/staleness reasons already established; also now strictly
  redundant given the shared live preview area exists.
- *No icon at all, label text only* — rejected as a minor UX regression
  for negligible savings; a small per-section icon costs nothing new
  (this project already uses `lucide-react` icons throughout its UI,
  constitution Principle VI) and helps the section groupings read faster
  at a glance.

## 5. Stage → Apply flow, and what the preview shows before any click

**Decision**: `basemapTab.tsx` holds one piece of local state,
`stagedSelection: BasemapPresetName | undefined`, initialized — on
mount, i.e. every time the Basemap tab becomes active — to
`useGlobalBasemap() ?? APP_DEFAULT` (FR-011: the preview must show the
currently-applied basemap, never blank, the instant the tab opens). The
preview area's `setStyle()` effect (§3) is keyed on `stagedSelection`
from the very first render, so it renders that starting value
immediately, before any click.

Clicking any UGRC/CARTO/OpenFreeMap entry sets `stagedSelection` to that
entry's preset name (updating the preview). Selecting a Raster Tiles
entry ALSO sets `stagedSelection` (FR-013 — the raster section
participates in the identical stage/apply flow, resolved explicitly
below), but the preview's `setStyle()` effect skips actually re-styling
the map for a raster selection; instead, the preview area's UI swaps to a
small, fixed-footprint placeholder message ("No live preview for raster
providers — Apply to use it") in place of the map canvas, so the viewer
is never shown a stale/misleading render that doesn't match what Apply
would actually do. An explicit "Apply" `Button`, rendered next to the
preview area, calls `setGlobalBasemap(stagedSelection)` — the ONLY
interaction anywhere on this tab that touches `state/basemapState.ts`
(FR-012). Every catalog entry's own "is this the staged one" visual
marking (a `variant="secondary"`/checkmark treatment, matching this
project's existing selected-state convention from the pre-redesign
`basemapTab.tsx`) compares itself against `stagedSelection` directly —
no separate "is this applied" vs. "is this staged" distinction is needed
on the entries themselves, since `stagedSelection` already starts equal
to the applied value and only diverges once the viewer actually clicks
something else.

**Resolved explicitly, per the four open questions this revision was
asked to settle**:

1. **Does Raster Tiles use the same stage-then-apply flow, or a separate
   immediate-apply one?** — The SAME flow (FR-013). Two different
   interaction models on one tab (three sections that require an
   explicit Apply, one that applies immediately) would be a real,
   confusing inconsistency for no benefit — a viewer would have to
   remember which category of entry behaves which way. The only
   DIFFERENCE for Raster Tiles is the already-existing "no live preview"
   rule (FR-008), which is a rendering decision, not an interaction-model
   one.
2. **What does the preview show on first open?** — The currently-applied
   global basemap, or the resolved app-default if none is set (FR-011).
   Never blank, and never an arbitrary "first catalog entry" default —
   the viewer's whole point in opening this tab is to compare a candidate
   against what's real right now, which requires the preview to start
   from that real, current state.
3. **What happens to a staged-but-unconfirmed selection if the modal
   closes?** — It is discarded (FR-014), with no code needed to make this
   true beyond NOT lifting `stagedSelection` anywhere more durable than
   `basemapTab.tsx`'s own component state: the moment that component
   unmounts (modal close, or switching to a different Settings tab —
   both real, already-established unmount triggers per §3), the state
   simply ceases to exist. This is the same "impossible state has no
   representation" property this project already prefers elsewhere
   (013-zonemap-panel's `boundaries_id` mismatch rejection,
   019-baseline-diff-consumption's `$baseline` sentinel resolution) — a
   staged value surviving past its own component's lifetime isn't a rule
   being followed, it is a thing that cannot happen given where the state
   lives. Consistent with 020-settings-modal's own no-persistence
   philosophy (constitution Principle VI), extended one step further:
   not just "never written to disk," but "never even reaches
   `state/basemapState.ts` — the one piece of state this whole feature IS
   allowed to mutate — until Apply is clicked."
4. **Loading state for the async Raster Tiles section** (carried forward
   from the prior round's open item, resolved alongside the above) — see
   the dedicated treatment below; unchanged in substance from the prior
   round's decision, restated here because `stagedSelection`/Apply now
   also apply to whatever the raster dropdown eventually renders once
   loaded.

### Loading state for the async Raster Tiles section

**Real gap, unchanged from the prior round**: `listCuratedRasterProviders()`
returns a `Promise` — its result is not available on `basemapTab.tsx`'s
first render. Left unaddressed, the Raster Tiles section would render
nothing at all until that promise resolves: a silent blank gap, which
this project's own established convention (`PanelEmptyState.tsx`/
`PanelErrorState.tsx`) explicitly treats as a defect to avoid.

**Decision**: `basemapTab.tsx` tracks a `'loading' | 'ready' | 'error'`
status for the Raster Tiles section specifically (the other three
sections need no such state — their entries are synchronous, already-
in-memory `BUILT_IN_PRESETS` keys), fetched once in a mount effect:

- `'loading'` — an inline `animate-pulse` skeleton placeholder, matching
  this project's own established convention (`ValueBoxPanel.tsx`/
  `PlotlyPanel.tsx`'s existing inline skeletons) rather than introducing
  a new shared `PanelLoadingState` component — `003-dashboard-shell-
  navigation`'s own research.md already documents this as a deliberate,
  considered choice (no reusable loading pattern existed to port, unlike
  error/empty), not an inconsistency this feature should break by adding
  a fourth, different loading treatment.
- `'error'` — `listCuratedRasterProviders()`'s underlying fetch can
  reject (network failure fetching `leaflet-providers.json`, the exact
  same failure `resolveRasterProvider()` already has to handle) — renders
  the EXISTING, already-generic `PanelErrorState` component (it takes
  only a `message` prop; nothing about it is panel-specific despite its
  name/location) with a message naming the Raster Tiles section
  specifically.
- `'ready'` with zero providers (a real, if currently hypothetical, edge
  case: a future `leaflet-providers.json` regeneration could in principle
  leave nothing passing the filter) — renders the existing
  `PanelEmptyState` component rather than an empty, unexplained section.
- `'ready'` with ≥1 providers — the dropdown, as already designed.

**Rationale**: Reusing `PanelEmptyState`/`PanelErrorState` directly (both
are plain, generic, presentation-only components — icon + message,
nothing tied to DuckDB queries or panel config) avoids inventing a
second, parallel error/empty vocabulary for a Settings-modal tab when
this project already has one. The loading state alone gets a fresh,
inline treatment rather than reusing either of those two, matching
003's own already-documented reasoning exactly (loading has never had a
shared component in this codebase, deliberately).

**Alternatives considered** (stage/apply flow):
- *Two different interaction models (immediate-apply for Raster Tiles,
  stage-then-apply for the other three)* — rejected explicitly per
  question 1 above: a real, avoidable inconsistency the user asked not to
  leave silently unresolved.
- *Show the LAST vector-rendered style in the preview area while a raster
  entry is staged, rather than a placeholder message* — rejected: leaves
  the viewer looking at a render that does not match what Apply would
  actually do if clicked right now, a real, confusing mismatch between
  what's shown and what's staged.

**Alternatives considered** (loading state):
- *Render nothing until the promise resolves* — rejected: the exact
  silent-blank-section outcome this project's own established convention
  exists to prevent.
- *A brand-new `PanelLoadingState` shared component, introduced by this
  feature* — rejected: would contradict 003's own already-recorded
  decision not to have one, for a single, narrow use site (one section of
  one Settings tab) that doesn't itself justify revisiting that decision.

## 6. `resolveEffectiveBasemap()` signature change

**Decision**: Drop the `theme: ColorScheme` parameter entirely.
New signature:

```ts
export function resolveEffectiveBasemap(
  panelBasemap: BasemapSelection | undefined,
  tabDefaultBasemap: BasemapSelection | undefined,
  globalBasemap?: BasemapPresetName,
): EffectiveBasemap
```

The bottom fallback branch becomes `{ selection: APP_DEFAULT, source:
'app-default' }` unconditionally — no branch reads a theme value anywhere
in the function body once this change lands. `registry.ts`'s
`APP_DEFAULT_LIGHT`/`APP_DEFAULT_DARK` pair collapses into one exported
`APP_DEFAULT: BasemapPresetName = 'carto-voyager'` constant (FR-016).

**Confirmed real, additional consequence** (not itself a new requirement,
but load-bearing for the tasks that follow): `FlowMapPanel.tsx` and
`ZoneMapPanel.tsx` are `resolveEffectiveBasemap()`'s only two callers
(confirmed via a project-wide search), and in BOTH files `useColorScheme()`
/ the resulting `colorScheme` variable is used for NOTHING else — every
other reference to `colorScheme` in either file is inside a comment, not
live code. Once the 3rd positional argument (`colorScheme`) is removed
from both call sites, `useColorScheme()`'s import and call become dead
code in both files and MUST be deleted, not merely left unused (this
project's TypeScript/ESLint conventions do not tolerate an unused import,
and leaving it would misleadingly suggest these two panels still have a
theme dependency they no longer have).

**Rationale**: The spec (FR-018) explicitly requires confirming, not
assuming, that no branch needs `theme` once the theme-paired fallback is
gone — verified directly against the function body above: `theme` was
consumed by exactly one ternary, which this change removes entirely.
`resolveEffectiveBasemap.test.ts`'s entire test suite needs its call
signature updated (drop the `theme` argument from every call), and its
"falls back to the theme-paired app default" test and the
"`basemapKey` is stable... but not for the app default" theme-flip test
are removed outright — the behavior they asserted (the app-default
selection differs by theme) no longer exists to test.

**Alternatives considered**:
- *Keep `theme` as an unused, backward-compatible parameter* — rejected:
  the spec explicitly asks to confirm whether it's still needed and act
  on the answer, and an unused parameter with two real call sites still
  threading a now-pointless `colorScheme` value through is exactly the
  kind of stale signature this project's own file-tree history
  (`CLAUDE.md`) has repeatedly flagged and corrected elsewhere (e.g.
  `getBaseline()`'s deliberately-no-caching design, `useBaseline.ts`'s
  primitive-return no-cache shape) — a real, avoidable inconsistency to
  introduce on purpose.

## 7. Settings modal fixed sizing and vertical tabs

**Decision**: `settingsModal.tsx`'s `DialogContent` changes from
`max-h-[85vh] w-[95vw] max-w-[720px]` to
`h-[600px] max-h-[85vh] w-[95vw] max-w-[720px]` — adding a fixed target
height while KEEPING the existing viewport-relative caps, so the modal's
size is a pure function of the viewport (never of which tab is active):
on any viewport tall enough for 600px, every tab renders at exactly
600px; on a short viewport, `max-h-[85vh]` still caps it, but identically
for every tab, since the cap is viewport-driven, not content-driven.

`Tabs` (`components/ui/tabs.tsx`) already forwards all Radix `Root`
props, so `<Tabs orientation="vertical">` requires zero primitive changes
— only `settingsModal.tsx`'s own layout classes change (`flex-row`
instead of `flex-col` on `Tabs`, `TabsList` becomes a vertical rail via
`flex-col` + a fixed width, `TabsContent`'s existing `overflow-y-auto`
is kept exactly as-is, now correctly bounded by the fixed-height flex
parent instead of a shrink-to-fit one). `tabs.tsx`'s own `TabsList`/
`TabsTrigger` classes gain `data-[orientation=vertical]:` Tailwind
variants (Radix sets `data-orientation` on both elements automatically,
confirmed via the installed `@radix-ui/react-tabs` source) so the SAME
component continues to serve `navBar.tsx`'s existing horizontal usage
unchanged.

**New in this revision**: the Basemap tab's own content now has a fixed-
height preview area (§3) ABOVE its four sections, inside the SAME
`overflow-y-auto` `TabsContent` box every other tab already uses. The
preview area itself is given a fixed pixel height (not `overflow-y-auto`
— it's a map, not scrollable text) and does not grow/shrink with content;
the four sections below it remain within the same scrollable region
`TabsContent` already provides. No change to the fixed-height-modal
mechanism itself is needed to accommodate this — the Basemap tab's total
content (preview area + four sections) simply becomes one of the tabs
whose content can exceed the fixed modal height and therefore scroll
internally (FR-021), exactly the same as the pre-redesign version of this
tab already could once its catalog grew past four unsectioned entries.

**Rationale**: `TabsContent`'s `overflow-y-auto` (FR-021's internal
scrolling) already exists from 020-settings-modal — it just had nothing
correctly bounding it, since the parent `DialogContent` could shrink to
fit the shortest tab's content. A fixed height is the minimal change that
makes the already-present scroll mechanism actually take effect for a
long tab while leaving a short tab with visible empty space, exactly as
FR-021 specifies — no new scroll-container component needed.

**Alternatives considered**:
- *A fixed pixel height with no viewport-relative cap at all* — rejected:
  would overflow a genuinely short viewport (e.g. a small laptop or a
  narrow embedded window), a real regression 020-settings-modal's
  existing `max-h-[85vh]` was already guarding against.
- *`orientation="vertical"` plus a brand-new bespoke vertical-tabs
  component* — rejected once Radix's native support was confirmed
  (spec.md Finding 6) — would duplicate keyboard-navigation behavior
  (arrow-key direction flips automatically under `orientation="vertical"`)
  Radix already provides for free.
- *Make the preview area itself scroll/resize with the map's own aspect
  ratio* — rejected: a fixed pixel height for the preview area is simpler
  and matches how every other fixed-size UI element in this modal already
  behaves; a map's own internal pan/zoom, not the container size, is
  the normal way to interact with more of it.

## 8. A REAL bug found during implementation — `transformStyle` preserved the OLD basemap's own content, not just a hypothetical future app-owned layer

**Not planned, found empirically while implementing and testing T019/T024**:
`FlowMapPanel.tsx`'s and `ZoneMapPanel.tsx`'s `setStyle()` calls both
carried a `transformStyle` option (011-basemap-style-system's own
original mechanism, reused verbatim through 012/016/017) whose stated
intent — per its own long-standing comment — was to preserve "this
project's own future custom MapLibre-native layers" (e.g. a later
zonemap's choropleth fill) across a basemap switch, by carrying forward
any `previous`-style layer id the `next` style didn't already have. This
was believed to be a safe no-op for `FlowMapPanel.tsx` specifically
("FlowMapPanel adds none of its own"), and correctly scoped for
`ZoneMapPanel.tsx`'s own real `zonemap-zones`/`zonemap-fill` layer need
— confirmed passing by every prior feature's own test coverage (011,
012, 016, 017).

**The real gap**: none of that prior coverage ever exercised a switch
FROM a real, already-applied vector style (e.g. `carto-voyager`, with
dozens of its own real text/symbol layers) TO a raster preset — every
prior raster-preset test set `basemap: OpenTopoMap` (or similar)
STATICALLY in a panel's own YAML config, meaning that panel's very FIRST
`setStyle()` call had `previous === null` (this `transformStyle`'s own
documented no-op case, returning `next` untouched). This feature's own
User Story 1 is the first thing in this codebase's history that makes a
**live** vector-to-raster switch actually reachable at all: before this
feature, the Settings modal's global-basemap picker only ever offered
built-in vector presets (`listBuiltInPresetNames()`) — there was no
Raster Tiles option, so a viewer could never trigger this transition
through the UI. The moment T019's own integration test exercised it
(stage a raster provider via the new dropdown, click Apply), the panel's
basemap-application effect correctly resolved to the real raster style
(confirmed directly via instrumentation: `resolveRasterProvider()`
returned real, correct tile URLs) — but the panel visibly, silently
reverted to `BLANK_STYLE` immediately after. Traced directly (temporary
`console.log` instrumentation on `onLoadError`, `resolveEffectiveBasemap`,
and the basemap-application effect itself, then removed): MapLibre fired
a real `'error'` event —
`layers[N].layout.text-field: use of "text-field" requires a style
"glyphs" property` — because `transformStyle` had carried forward
`carto-voyager`'s own real text/symbol layers (they weren't already in
the new raster style's `next.layers`, so the existing, unscoped
`!nextIds.has(l.id)` filter kept them), but only merged `sources`/
`layers`, never `next.glyphs` — the new raster style has no `glyphs` URL
at all, so MapLibre correctly rejected the whole merged style as invalid,
and the already-existing `onLoadError` handler (correctly, per its own
design) reverted to `freshBlankStyle()`.

**Fix**: `FlowMapPanel.tsx` — removed the `transformStyle` option
entirely (confirmed, not assumed, that this panel adds zero
MapLibre-native layers of its own; the deck.gl overlay lives outside
this mechanism, per 011's own already-documented finding — so the
preservation this option provided was already a no-op for every real
case, and removing it is strictly simpler than trying to special-case
which previous layers are "safe"). `ZoneMapPanel.tsx` — narrowed
`transformStyle` from "preserve any previous layer id not already in
next" to "preserve only `previous` layers whose `source` is this panel's
own `SOURCE_ID` (`zonemap-zones`)" — its real preservation need
(`FILL_LAYER_ID`/`EXTRUSION_LAYER_ID`) is satisfied exactly, while a
third-party basemap's own real content is never eligible for
preservation at all, regardless of what the next style does or doesn't
provide. Both fixes verified against the full `flowmapPanel.spec.ts`/
`zonemapPanel.spec.ts`/`settingsModal.spec.ts` suites (89/90 passing on
first full re-run after the fix; the one unrelated failure — see below —
was a test-fragility issue in a brand-new test this feature added, not a
regression from this fix).

**A second, smaller real finding from the same debugging session**: the
integration test written to prove "a theme flip issues no new basemap
request" (T024) initially counted the page's TOTAL network request count
before/after toggling `dark`, and intermittently failed by a handful of
requests unrelated to basemap resolution — confirmed, empirically, that a
`dark` class toggle can shift page layout enough to trigger MapLibre's
own legitimate resize-driven re-tiling of an ALREADY-CORRECTLY-APPLIED
style (real sprite/glyph/tile requests, not a re-pairing bug). Fixed by
switching to the exact same `map.setStyle()` call-count instrumentation
the pre-existing, already-reliable "explicit pin is not re-paired" test
uses — a direct test of the actual claim (no new `setStyle()` call),
immune to MapLibre's own unrelated internal tile-refresh behavior.
