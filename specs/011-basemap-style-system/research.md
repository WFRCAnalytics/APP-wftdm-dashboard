# Research: Basemap Style System

Two items are treated as first-class research questions per explicit user
direction at `/speckit-plan` time, not secondary details folded into
implementation — §1 and §2 below. The remaining sections resolve
implementation-shape questions the spec's Assumptions section left at the
"what" level, down to a concrete, buildable "how."

---

## §1. `setStyle()` / `MapboxOverlay` survival — empirical Playwright test (FIRST-CLASS)

**Status entering this plan**: substantially de-risked by real production
evidence (`APP-WFRC-Commute-Patterns`' own `src/map.js`, fetched and quoted
verbatim in this session's prior research: `map.setStyle(STYLE_URLS[theme],
{ transformStyle: ... })`, a `MapboxOverlay` constructed once at init in
non-interleaved mode, never removed/re-added around `setStyle()`). **That
evidence is not treated as settled here** — it proves the pattern works on
*that* app's dependency versions, not this project's. This project pins
`maplibre-gl@^4.7.1` and `@deck.gl/mapbox@^9.0.0` (constitution Technology
Stack Reference); `APP-WFRC-Commute-Patterns`' own `package.json` pins the
same `@deck.gl/mapbox@^9.0.0` and `maplibre-gl@^4.7.1` (confirmed directly
in this session's earlier research, which is *why* the constitution's
2.3.0 amendment added the matching `@deck.gl/layers@^9.0.0` pin) — so the
versions genuinely match, which is exactly why an empirical test is
practical and worth running, not a reason to skip it. A caret range still
permits a minor/patch drift between what was tested there and what this
project actually resolves to in its own lockfile.

**Decision**: add a dedicated Playwright test, `flowmapPanel.spec.ts`
→ `describe('Basemap survives a light/dark theme switch')`, that:

1. Boots the app with a flowmap panel rendered and its basemap already
   loaded (a built-in preset — CARTO Positron by default, per FR-007).
2. Captures the `FlowmapLayer`'s render-count/flow-count `data-*`
   attributes (the same test-observability instrumentation
   `flowmapPanel.spec.ts` already uses — deck.gl renders to its own
   canvas, not individually inspectable DOM nodes) **before** the switch.
3. Triggers a theme change the same way `DesignTokenDemo.tsx` does today
   (`document.documentElement.classList.toggle('dark', true)` via
   `page.evaluate()`) — see §3 for why this, not a real UI toggle button,
   is the correct trigger mechanism for this feature's own scope.
4. Asserts, in order:
   - the MapLibre base canvas (`canvas.maplibregl-canvas`) and the deck.gl
     overlay canvas (`canvas#deckgl-overlay`) are **the same DOM node**
     before and after (element-handle identity, exactly like the existing
     "the map survives 004's DOM relocation" test already proves for a
     different kind of disruption) — a naive implementation that calls
     `map.remove()` + reconstructs on theme change would fail this
     immediately;
   - the render-count/flow-count attributes are **unchanged** — the
     `FlowmapLayer`'s own data was never touched by the style swap, so
     re-fetching/re-querying must not have been triggered;
   - a programmatic `map.panTo()` still fires a real `'moveend'` event
     afterward (via `window.__flowmapTestMaps`, the same live-interactivity
     proof the relocation test already uses) — proving the WebGL context
     is still genuinely alive, not a frozen last frame;
   - **the deck.gl overlay's own layer is still visibly rendered** after
     the switch — checked via `overlayRef`'s exposed test hook (see
     data-model.md's `__flowmapTestOverlays` addition) reporting
     `overlay.props.layers.length === 1` and a pixel-level canvas
     non-blankness check (`getImageData` on the deck.gl canvas showing
     non-uniform pixel data), since a duplicate-layer-id bug (the
     deck.gl#3763 failure mode this whole risk stems from) can leave the
     overlay technically "not removed" while silently failing to draw.
5. Separately (a distinct test case, not folded into the above): asserts
   **zero browser console errors/warnings matching `/duplicate|already
   exists/i`** across the theme switch — the specific symptom deck.gl#3763
   describes ("Multiple old layers with same id").

**Why this shape**: matches this project's own established empirical-proof
discipline for exactly this class of claim — `010-flowmap-panel`'s "the
map survives 004's DOM relocation" test didn't stop at "the canvas is
still visible," it proved same-node identity, correct resize, and live
interactivity, because a screenshot-plausible but functionally-dead map
would pass a weaker check. The same reasoning applies here: the risk isn't
"does anything render," it's "does the *specific* deck.gl-layer-survival
failure mode in deck.gl#3763 occur on this project's own pinned versions,"
which requires checking for that failure mode directly (duplicate-id
console errors, overlay layer count, actual pixel output) rather than
inferring it from React re-render count or a purely visual check.

**If the test fails** (i.e., this project's exact pinned versions hit
deck.gl#3763's duplicate-layer-id bug where `APP-WFRC-Commute-Patterns`
didn't): the fallback per constitution's own established pattern
(`FlowMapPanel.tsx`'s existing mount-once/`setProps()`-only lifecycle) is
to explicitly call `overlayRef.current.setProps({ layers: [] })`
immediately before `map.setStyle()` and re-set the real layers array
inside the post-`style.load` handler — the defensive remove/re-add pattern
originally inferred from the GitHub issues, now demoted from "default
assumption" to "documented fallback, built only if the empirical test
proves it's needed." This keeps the implementation from carrying
speculative defensive code the real evidence doesn't support, while not
leaving the plan without an answer if the evidence turns out to differ
from `APP-WFRC-Commute-Patterns`' own experience.

---

## §2. Three-level precedence + theme-switch resolution logic (FIRST-CLASS)

**The failure mode to design against** (stated explicitly by the user):
get this wrong and either (a) an explicit panel/tab pin silently stops
being respected — the app re-pairs it to the new theme anyway — or (b) the
app's own no-config default stops re-pairing on a real theme change. Both
are silent, hard-to-notice regressions (nothing crashes, nothing looks
broken until someone happens to compare against the configured intent),
which is exactly the class of bug a dedicated pure function with direct
unit test coverage is meant to prevent — "not folded implicitly into the
render effect," per the user's own explicit instruction.

**Decision**: `resolveEffectiveBasemap()` (full contract in
`contracts/resolve-effective-basemap.md`) is a pure function with this
signature:

```ts
export type BasemapSource = 'panel' | 'tab' | 'app-default'

export interface EffectiveBasemap {
  selection: BasemapSelection   // the resolved BasemapSelection value itself
  source: BasemapSource         // WHERE it came from — the pin-vs-default distinguisher
}

export function resolveEffectiveBasemap(
  panelBasemap: BasemapSelection | undefined,
  tabDefaultBasemap: BasemapSelection | undefined,
  theme: 'light' | 'dark',
): EffectiveBasemap
```

The truth table this function implements (identical to FR-006/FR-007/
FR-011, restated here as the literal test matrix
`resolveEffectiveBasemap.test.ts` asserts against):

| `panelBasemap` | `tabDefaultBasemap` | `theme` | `.selection` | `.source` |
|---|---|---|---|---|
| set (A) | — (ignored) | — (ignored) | A | `'panel'` |
| unset | set (B) | — (ignored) | B | `'tab'` |
| unset | unset | `'light'` | CARTO Positron | `'app-default'` |
| unset | unset | `'dark'` | CARTO Dark Matter | `'app-default'` |

**Where the `source` field is consumed — the actual "distinguish pin from
default" moment**: not inside `resolveEffectiveBasemap` itself (it has no
concept of "previous" state — it's a pure, stateless function of its three
inputs, called fresh on every relevant re-render) but in
`FlowMapPanel.tsx`'s basemap-application effect, whose dependency array is
keyed on a **stable, serializable identity** of the resolved value — not
object identity, and not `source` alone:

```ts
const effectiveBasemap = resolveEffectiveBasemap(config.basemap, config._tabDefaultBasemap, colorScheme)
const basemapKey = JSON.stringify(effectiveBasemap.selection) // stable across re-renders with an unchanged value

useEffect(() => {
  // ... loadBasemapStyle(effectiveBasemap.selection).then(style => mapRef.current?.setStyle(style, { transformStyle }))
}, [basemapKey])
```

This is the precise mechanism that resolves the failure mode: because
`resolveEffectiveBasemap` returns the *same* `.selection` value (by deep
content, hence the same `basemapKey`) for a pinned panel/tab regardless of
which theme is currently active, the effect's dependency **does not
change** when the theme flips — no redundant `setStyle()` call, no
re-pairing, matching FR-011's "not re-paired on theme change" for an
explicit pin. Conversely, for the no-config case, `.selection` genuinely
differs between `'light'`/`'dark'` (Positron vs. Dark Matter), so
`basemapKey` changes and the effect re-runs, correctly re-pairing.
**`source` itself doesn't gate anything at runtime** — it's there so the
resolver's own behavior is independently assertable in a unit test
("given no panel/tab override, source is `'app-default'`") without relying
on the indirect, harder-to-verify signal of "did the computed key happen
to change." Keeping `source` in the return value even though the effect
doesn't branch on it directly is deliberate: it makes the design's own
correctness argument ("only the app-default case changes value across a
theme flip") independently checkable, rather than an implicit property
nobody wrote down.

**Where `theme` itself comes from** — see §3; `colorScheme` above is
`useColorScheme()`'s return value, read once per `FlowMapPanel` render via
a hook subscription (`useSyncExternalStore`, same idiom as
`useFilterState`/`useActiveScenarios`), not derived inside the effect.

**Why a dependency-array key, not a `useRef`-tracked "previous theme"
comparison**: an earlier design considered storing the last-applied theme
in a ref and comparing it manually inside the effect body (`if (theme !==
lastTheme.current && source === 'app-default') { ...setStyle... }`). Rejected: it
reintroduces exactly the class of bug `010-flowmap-panel`'s own
`mapReady`-as-React-state (not a bare ref check) fix was about — a ref
mutation alone doesn't cause a re-render or reliably re-trigger an effect,
so "compare against a ref inside the effect" only works if something else
already guaranteed the effect re-runs at the right time, silently
re-deriving the same fragile-timing problem `research.md`'s prior
`mapReady` fix explicitly moved away from. Keying the effect's own
dependency array off the resolved value directly means React's normal
re-render-on-changed-dependency mechanism does the "did anything relevant
actually change" work, with no separate manual bookkeeping to keep in
sync.

---

## §3. Where "the dashboard's active theme" actually comes from — a real, confirmed gap

**Finding (not assumed — grep-verified)**: `document.documentElement
.classList.toggle('dark', dark)` exists in exactly one place in this
codebase today: `src/demo/DesignTokenDemo.tsx`, `002-design-tokens`'
**deliberately out-of-band, non-navigable demo page** (its own comment:
"no panel registry entry, no scenario-data dependency"). `src/layout/
shell.tsx` — the real, production dashboard shell — has **no theme-toggle
control and no theme-state module at all**. `tailwind.config.js`'s
`darkMode: ['class']` and `tokens.css`'s full `.dark { ... }` variant tier
are real and ready to be driven by *something*, but nothing in the actual
navigable app drives them yet.

**Scope decision**: this feature does **not** build a theme-toggle UI
control — spec.md never asks for one, and inventing one would be
unrequested scope expansion into a different, undelivered feature. **This
means the feature ships a real, correct theme-*reading* mechanism with no
real theme-*changing* trigger anywhere in the navigable app yet — see
plan.md's "Known gap this feature does NOT close" section, which any
completion report MUST state plainly, not leave implicit.** What
this feature *does* need is a way to **read** whichever theme is
currently active, however it came to be active (a future toggle feature,
a future OS-preference bridge, or — in the interim — direct DOM
manipulation, exactly as this plan's own Playwright test in §1 uses).
`useColorScheme()` (new, `src/hooks/useColorScheme.ts`) is a small,
generic read primitive: a `MutationObserver` on `document.documentElement`
watching for `class` attribute changes, exposed via `useSyncExternalStore`
— it doesn't care *how* the `.dark` class got toggled, only that it did,
which is exactly the right boundary for a feature that must be
theme-*aware* without being responsible for theme-*control*. This mirrors
the existing `useFilterState`/`useActiveScenarios` hook shape (external
mutable store, `useSyncExternalStore`, no bespoke subscription plumbing).

**Alternative considered and rejected**: reading `window.matchMedia('(prefers-
color-scheme: dark)')` instead of the DOM class. Rejected because
`tailwind.config.js` is explicitly configured `darkMode: ['class']`, not
the media-query strategy — building this feature against a media query
that the actual CSS tier doesn't key off of would silently diverge from
what `tokens.css` actually renders the moment a real toggle feature lands
and sets the class explicitly (which would then disagree with the OS
preference in exactly the cases a toggle exists to override). Reading the
class directly stays correct under both "no toggle yet" (today) and
"toggle exists" (later) without needing to change once that future
feature ships.

---

## §4. Raster provider catalog — avoiding a real, hidden Leaflet dependency

**Finding (fetched directly, not assumed)**: the real `leaflet-providers`
npm package's own `package.json`/source (`raw.githubusercontent.com/
leaflet-extras/leaflet-providers/master/leaflet-providers.js`, fetched
verbatim) is a UMD module whose CommonJS branch is literally
`module.exports = factory(require('leaflet'))`, and whose factory body
does `L.TileLayer.Provider = L.TileLayer.extend({...})` — it does not
export the `providers` data object as plain JSON; it's a real Leaflet
plugin that expects to attach itself to Leaflet's own class hierarchy at
load time. Installing and importing it as-is would either throw (no `L`
present) or, to make it work, require installing the real `leaflet`
package as a genuine runtime dependency — a second, unused full map
library, directly contrary to constitution Principle VI's MapLibre-only
technology choice, just to read a static configuration table.

**Decision**: extract the real `providers` object **at dev time only**, in
a small Node script (`scripts/extractLeafletProviders.mjs`) that installs
and executes the *real* `leaflet` + `leaflet-providers` packages as
**devDependencies** — never runtime/production dependencies. Since no
`src/` file ever imports either package, Vite's production build (`vite
build`, which only bundles what's actually imported by the app's own
module graph) never includes them — constitution Principle VI's
MapLibre-only rule is about the *shipped application*, and nothing here
changes what ships. This is deliberately chosen over a regex/`Function()`-
based text extraction of the object literal: parsing arbitrary upstream
JS as trusted-but-still-executed dynamic code either way, `new Function()`
reads as the same class of "equivalent dynamic code execution"
constitution Principle III's "no `eval()`" rule targets — even though that
principle's own rationale is scoped to *application* code executing
YAML/filter-influenced *runtime* content (a different risk class from a
one-off, developer-invoked, trusted-source dev script), avoiding the
ambiguity entirely by using the real, already-correct upstream parsing
logic (via real `require('leaflet')`/`require('leaflet-providers')`,
executed only inside this one Node script, at dev time, never shipped) is
strictly better than re-deriving a fragile hand-rolled extractor AND
sidesteps any Principle III review question. The script then serializes
`L.TileLayer.Provider.providers` to
`public/basemap/leaflet-providers.json`, fetched by the app at runtime
exactly like `public/dashboard-config/index.json` already is. This
directly satisfies FR-002 ("resolve ... dynamically by provider name
against that catalog's own provider-definition data, rather than shipping
a hand-picked subset") — the *data* is the real, complete upstream
catalog, dynamically indexed by name at runtime; only the *code paths*
that would otherwise require Leaflet in the shipped app are what's
avoided. Regenerating this file against a newer upstream commit (new
providers, corrected URLs) is a re-run of the script + republish, not an
app code change, matching FR-002's own "MUST NOT require an app code
change" requirement for adding provider support.

**Two more real gaps found only by actually running the extraction
script during implementation** (both fixed in `scripts/
extractLeafletProviders.mjs`, neither anticipated at plan time): (1)
`leaflet-src.js` references `window` at MODULE-LOAD time, not just at map
construction (`var requestFn = window.requestAnimationFrame || ...`,
evaluated the instant the module first runs) — a plain Node `import`
throws `ReferenceError: window is not defined` immediately. Fixed with a
`jsdom` shim (`jsdom` added as a devDependency too, same
devDependency-only/never-bundled status as `leaflet`/`leaflet-providers`)
setting `globalThis.window`/`document`/`navigator` before dynamically
importing `leaflet` — a plain-Node `navigator` assignment additionally
needed `Object.defineProperty` (Node ≥21 defines its own read-only
`navigator` global). (2) `leaflet-providers.js`'s own UMD wrapper checks
`typeof modules === 'object'` (plural) alongside `module.exports`
(singular) in the same condition — `modules` is never a real global, so
that check is always false and the CommonJS `require('leaflet')` branch
never actually fires, in any environment; it always falls through to
`factory(L)`, expecting a bare global `L`. Fixed by setting `globalThis.L`
to the real imported `leaflet` default export before importing
`leaflet-providers`. Both were found by running the script for real and
reading the exact thrown error, not by reasoning about the UMD wrapper's
source in the abstract.

**Alternative considered**: a runtime `fetch()` of the raw GitHub
source URL and a regex-based extraction in the browser at load time.
Rejected: this would be a live, uncontrolled network dependency on a third
party's raw file layout for something that changes rarely, and would
violate the "no internet required" constraint `wftdm-dashboard here` and
this feature's own FR-010 fallback discipline are built around — a
self-hosted, versioned snapshot (regenerated deliberately, on a real
schedule/PR, not fetched live) is the same self-hosting discipline already
applied to DuckDB-WASM's engine binaries (constitution Principle II) and
planned for its parquet extension (`memory/project-self-host-parquet-
extension.md`).

**`{s}`/{r}` template expansion (FR-003)**: a leaflet-providers raster
entry's `url` template (e.g. `'https://{s}.basemaps.cartocdn.com/
{variant}/{z}/{x}/{y}{r}.png'`) has no native MapLibre equivalent —
MapLibre's `raster` source `tiles` field takes a plain array of already-
expanded URL templates (`{z}/{x}/{y}` only). `resolveRasterProvider()`
expands `{s}` into one array entry per subdomain in `options.subdomains`
(e.g. `'abcd'` → 4 entries, load-balancing exactly like Leaflet's own
runtime subdomain rotation, just expressed as MapLibre's static
multi-URL-array mechanism instead) and `{r}` into an empty string (non-
retina; a future retina-aware variant is out of scope — no display-
density signal exists anywhere else in this app's config surface to
condition it on).

**A second, larger real gap found only by actually running the
extraction script and inspecting the real output (implementation phase,
not plan phase)**: the vast majority of practically-useful providers —
`CartoDB`, `Esri`, `Stadia`, `MapTiler`, `Thunderforest`, `HERE`, and 18
others of the real catalog's 36 top-level entries — are NOT flat,
individually-keyed entries at all. They're a single parent key (e.g.
`"CartoDB"`) holding a `variants` object, addressed via leaflet-
providers' own dotted convention (`"CartoDB.Positron"`) exactly as this
session's earlier research already quoted from `initialize()`'s real
source (`arg.split('.')`) — but that variant-resolution logic was never
actually carried into `resolveRasterProvider()`'s plan-phase contract,
which only did a flat `catalog[name]` lookup. Confirmed directly against
the real generated `public/basemap/leaflet-providers.json`: a plain
`catalog['CartoDB.Positron']` lookup returns `undefined`, and three
distinct real variant-value shapes exist and must each resolve correctly
— an empty object (`OpenStreetMap.Mapnik: {}`, meaning "no overrides, use
the parent as-is"), a plain string (`CartoDB.Positron: "light_all"`,
`OneMapSG.Night: "Night"`, substituted into `options.variant` for the
`{variant}` URL placeholder), and a full object with its own `url`/
`options` (`OpenStreetMap.HOT`, which overrides both). `resolveRasterProvider()`
was rewritten to split on `.`, look up the parent, and merge the variant
according to which of these three shapes it actually is — implemented and
verified against the real catalog, not the flat-lookup design the
plan-phase contract shipped with.

**Checked against the real, current extracted catalog, not assumed
safe — a real bug found and fixed during plan review**: does any real
provider entry have `{s}` in its `url` but no `options.subdomains`? Yes —
fetched `raw.githubusercontent.com/leaflet-extras/leaflet-providers/
master/leaflet-providers.js` directly (2026-09-02) and confirmed **five**
real, currently-published entries with exactly this shape:
`OpenStreetMap.France`, `OpenStreetMap.HOT`, `OpenTopoMap`,
`OpenRailwayMap`, and `OneMapSG`. An initial version of
`resolveRasterProvider()` defaulted a missing `subdomains` straight to
`''`, which would have shipped a literal, un-substituted `{s}` in the
tile URL for all five — a genuinely broken preset, not a hypothetical
edge case. Root cause, also confirmed directly (not assumed) against
Leaflet's own source (`leaflet/src/layer/tile/TileLayer.js`): `L.TileLayer`
carries a class-level default of `subdomains: 'abc'`, which
`leaflet-providers.js`'s per-provider `options` object only ever
*overrides* — a provider omitting `subdomains` still resolves to a real,
working `'abc'` at actual Leaflet runtime via prototype-chain option
merging, a fact this app's extracted JSON snapshot (raw provider objects
only) does not itself carry, since the default lives in Leaflet's class
code, not in the providers data. Fixed by reproducing that same default
in `resolveRasterProvider()` — `entry.options.subdomains ?? (usesSubdomainPlaceholder
? 'abc' : '')` — applied only when the template actually contains `{s}`,
so the majority of providers with no `{s}` at all don't get a padded,
duplicate-entry `tiles` array. Regression-tested directly against
`OpenTopoMap`'s real shape in `resolveRasterProvider.test.ts`
(`contracts/basemap-types-and-registry.md`), not just a synthetic case.

---

## §5. CARTO / OpenFreeMap style sources — confirmed, unchanged from prior research

No new research needed here — carried forward verbatim from this
session's earlier direct-fetch findings (spec.md's own Assumptions
section already documents the residual open questions):

- **CARTO**: `https://basemaps.cartocdn.com/gl/{style}-gl-style/style.json`
  for `positron`/`dark-matter`/`voyager` (confirmed real, current
  `version: 8` MapLibre-spec style documents, loading successfully without
  a visible API key in direct testing, despite CARTO's own docs stating a
  key is required for usage — an open, monitored assumption per spec.md,
  licensing/quota concerns explicitly out of this feature's scope).
- **OpenFreeMap**: `https://tiles.openfreemap.org/styles/{name}` (no
  `/style.json` suffix — confirmed that form 404s) for `liberty`/
  `bright`/`positron`/`dark`/`fiord`, all real `version: 8` style
  documents; `dark`/`fiord` self-flagged incomplete upstream, included
  anyway per spec.md's Assumptions.

Both are single hosted style documents — `registry.ts` stores their URLs
directly, and `loadBasemapStyle.ts` hands the URL string straight to
`map.setStyle()` for these (see §6 — this is the *simple* path; no
fetch/merge/rewrite needed since MapLibre resolves a URL-loaded style's
own relative `sprite`/`glyphs`/source paths natively).

---

## §6. Composition mechanism — how relative resource paths actually survive merging

**Refines spec.md's own Assumption**: the spec-phase Assumptions section
stated composed resources must be "loaded by URL, not as an inline
re-hosted object" to preserve relative paths — true as a constraint, but
not yet a mechanism. A **single**-style basemap (any built-in preset)
trivially satisfies this by handing `map.setStyle(url)` the URL string
directly — MapLibre fetches and resolves `sources`/`sprite`/`glyphs`
relative to that URL natively, zero extra code. A **composed**,
multi-source basemap cannot use that path at all, because MapLibre's
`setStyle()` accepts exactly one style document — composing three (e.g.
UGRC's VectorHillshade + LiteBase + LiteLabels) necessarily means
building one merged, in-memory `StyleSpecification` object in application
code, which is precisely the "detached inline object" the spec's
Assumption warned would break relative references, unless those
references are fixed before merging.

**Decision**: `loadBasemapStyle()`'s composition path, for each layer URL
in stacking order:
1. `fetch(layerUrl)` and parse the JSON style document.
2. Rewrite that document's own `sources[*].url`/`sprite`/`glyphs` fields —
   wherever they're relative (confirmed real shape from the UGRC
   `LiteBase` `root.json` fetched directly in prior research: `"url":
   "../../"`) — to **absolute URLs resolved against `layerUrl` itself**
   (`new URL(relativeValue, layerUrl).href`), using the same resolution
   base a browser would use if it had loaded that style document as its
   own top-level page — i.e. reproducing MapLibre's own native resolution
   rule in application code, once per layer, before any merging happens.
3. Namespace that layer's `sources` and `layers` object/array keys with a
   layer-index prefix (`layer0__`, `layer1__`, ...) to guarantee no id
   collision across independently-authored layers being stacked together
   — the real, concrete mechanism avoiding the "duplicate layer id"
   failure class at the *basemap-composition* level (a distinct concern
   from §1's deck.gl-layer-survival one, which is about `FlowmapLayer`,
   not these MapLibre style layers).
4. Concatenate all rewritten `layers` arrays in the given stacking order
   (bottom layer's array first) and merge all rewritten `sources` objects
   into one combined `StyleSpecification`, handed to `map.setStyle()` as
   an object (not a URL — there is no single URL for a composite).

Each fetch is independently try/caught; any single layer's failure
(FR-008's "fails to load" edge case, User Story 3's Acceptance Scenario
3) aborts the whole composition and falls back to `BLANK_STYLE` — never a
partially-rendered composite, matching FR-010's "uniformly across every
source category" requirement exactly (a composition is one basemap, not N
independently-fallback-able ones).

**Two more real gaps found only during implementation, running the real
UGRC proof case for real — not caught by the design, by TypeScript, or
by the mocked unit tests**:

1. **A source's `url` field, once resolved to an absolute URL, still
   didn't work** — it points to a TileJSON document, and that document's
   OWN `tiles` field is itself commonly a RELATIVE template (confirmed
   directly against the real UGRC `VectorTileServer` endpoint:
   `{"tiles":["tile/{z}/{y}/{x}.pbf"], ...}`). MapLibre resolves a
   source's TileJSON `tiles` relative to the STYLE's own origin URL when
   a style is loaded via `setStyle(url)` — but a composed, in-memory
   style object has no such origin, and MapLibre does **not** fall back
   to the source's own fetch URL either. This produced a real,
   reproducible runtime error (`Failed to construct 'Request': Failed to
   parse URL from tile/{z}/{y}/{x}.pbf undefined`), which then tripped
   `FlowMapPanel`'s own FR-010 error-fallback listener and silently
   reverted an otherwise-correctly-composed style back to `BLANK_STYLE`.
   Fixed by resolving this ourselves at composition time:
   `inlineTileJsonSource()` fetches each `url`-bearing source's own
   TileJSON, resolves its `tiles` template against ITS OWN fetch URL, and
   replaces the source's `url` field entirely with an absolute `tiles`
   array (plus `minzoom`/`maxzoom`/`bounds` if present) — so MapLibre
   never needs to perform this resolution itself for a composed style.

2. **`new URL(relative, base).href` percent-encodes `{`/`}`** — harmless
   for a plain source `url`, but genuinely wrong for `glyphs`, whose
   value is a template containing literal `{fontstack}`/`{range}` tokens
   MapLibre's style validator requires verbatim (it rejects an encoded
   token with `"glyphs url must include a {fontstack} token"`). A first
   version of the rewrite broke every composed style's glyphs this way,
   silently — the resulting validation error again tripped the same
   FR-010 fallback listener, again reverting an already-correct
   composition. Fixed with `resolveUrlPreservingTemplateTokens()`, which
   decodes just `%7B`/`%7D` back to `{`/`}` after resolution — no other
   real style field's value legitimately contains a literal
   percent-encoded brace this would incorrectly restore.

Both bugs manifested identically from the outside — a style that
genuinely composed correctly, then reverted to blank within roughly a
second — which is precisely why quickstart.md's own validation step (and
`flowmapPanel.spec.ts`'s real Playwright test) checks that the composed
state **stays stable** for a further ~1.5s after first appearing
non-empty, not just that it appears non-empty once.

---

## §7. Fallback detection — uniform across every source category (FR-010)

Two distinct failure surfaces exist and both need a path to `BLANK_STYLE`:

- **Composition path**: failures surface as rejected `fetch()` promises or
  JSON-parse errors — caught directly in `loadBasemapStyle()`, §6.
- **Single-preset-URL path** (`map.setStyle(url)`): MapLibre resolves this
  asynchronously inside the library itself, surfacing failures via the
  map instance's own `'error'` event, not a rejected promise.

**The plan-phase design for this listener was real, and really wrong —
found only by running the real UGRC proof case, not by any test written
in advance.** The original design (§ above, as first implemented)
attached `map.on('error', handler)` ONCE, for the map instance's entire
lifetime, reverting to `BLANK_STYLE` on any `'error'` event fired while a
non-blank style was active. This is too coarse in a way that isn't just
theoretically imprecise — it actively broke a real, correctly-composing
basemap: a real 569-layer composition emits ordinary, expected
individual-tile-fetch noise constantly once real rendering starts
(confirmed directly: disabling the listener entirely left an otherwise-
identical composition stable and correctly loaded), and the lifetime-
scoped listener treated that routine noise as "the basemap failed,"
reverting an already-successfully-loaded style within ~300ms of a normal
post-load tile event.

**Fixed by scoping the listener to only the window between one
`setStyle()` call and its own `'style.load'` event**: registered fresh
inside the basemap-application effect (not the mount effect), and
removed the moment `'style.load'` fires for that specific call —

```ts
const onLoadError = () => {
  map.off('error', onLoadError)
  const current = map.getStyle()
  if (current && JSON.stringify(current) !== JSON.stringify(BLANK_STYLE)) {
    map.setStyle(BLANK_STYLE)
  }
}
map.on('error', onLoadError)
map.once('style.load', () => map.off('error', onLoadError))
```

An error genuinely occurring before the style has finished loading (the
style document, its sprite/glyphs, or a source's TileJSON failing to
fetch/parse) still correctly triggers the fallback; an error occurring
after — ordinary tile-level runtime noise — no longer does. Confirmed
empirically against the real proof case, not assumed correct from the
code alone.

**A separate, genuinely out-of-scope finding, also only surfaced by this
scoped listener working correctly**: UGRC's real `VectorHillshade`
service's own vector tile data triggers a real, reproducible error deep
inside `maplibre-gl`'s own vendored `pbf` (Protocol Buffers) parser —
`"Unimplemented type: 3"`, traced directly to that library's own error
message (`grep`-confirmed in `node_modules/maplibre-gl/dist/maplibre-gl.js`)
for an unsupported, deprecated Protobuf wire type (group start/end).
Confirmed directly, not guessed: (1) `VectorHillshade`'s own style
document itself contains nothing unusual (22 plain `fill` layers,
fetched and inspected directly); (2) removing `VectorHillshade` alone
from the composition (keeping only `LiteBase` + `LiteLabels`) eliminates
the error entirely — the same two-layer composition renders and stays
stable indefinitely. This is a genuine, real incompatibility between
Esri's `VectorHillshade` tile encoding specifically and this project's
pinned `maplibre-gl` version's PBF parser — not a bug in `composeStyles()`,
not a bug in the error-scoping fix above, and not something this
feature's own scope extends to fixing (it would require either a
MapLibre upgrade with broader wire-type support, or Esri changing that
one service's tile encoding, neither of which this feature controls).
The proof case (quickstart.md Scenario 6, `tests/fixtures/dashboard-
config/dashboard-3-basemaps.yaml`) was updated to two layers
(`LiteBase`+`LiteLabels`) rather than the originally-planned three,
documented plainly rather than silently — the composition mechanism
itself (FR-006/FR-008/FR-012) is still fully proven against two real,
independently-hosted services; `VectorHillshade`'s exclusion is a real,
external limitation, not evidence the mechanism doesn't work.

A dedicated Playwright test (quickstart.md) exercises the fallback path
with a deliberately-unreachable preset URL, mirroring the existing "Flow
Map Broken Panel (intentional)" fixture pattern already used for
metric-query failures — same category of intentional-failure fixture,
applied to a basemap URL instead of a SQL metric.

---

## §8. File layout — why `panels/basemap/`, not `services/basemap.ts`

Grouped as a peer to `panels/panelQuery.ts` (shared cross-panel-type pure
logic) rather than under `services/` (which today holds only genuinely
singleton, stateful infrastructure — `duckdb.ts`'s one shared connection,
`yamlLoader.ts`'s fetch+parse, `sqlExpander.ts`'s string templating,
`scenarioDiscovery.ts`'s boot-time registration). Nothing in this feature
is a singleton or holds app-lifetime state; `resolveEffectiveBasemap` and
`loadBasemapStyle` are both called fresh per relevant render/effect, same
shape as `panelQuery.ts`'s `buildPanelQuery`. A dedicated `basemap/`
subdirectory (rather than flat files directly in `panels/`) reflects that
this is genuinely multi-file shared infrastructure for a *category* of
panel type (map-rendering), not one panel's own private transform module
(contrast `flowmapData.ts`, which stays flat in `panels/` because it's
`FlowMapPanel`-specific).
