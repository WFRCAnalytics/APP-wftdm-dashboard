# Phase 0 Research: Auto-fit map view to data extent, plus a reset-to-view button

All items below were resolved directly against real, installed source
(`node_modules/maplibre-gl/dist/maplibre-gl.d.ts`, this project's own
`FlowMapPanel.tsx`/`ZoneMapPanel.tsx`/`flowmapData.ts`/`zoneGeometry.ts`/
`zonemap3dControl.ts`/`resolveEffectiveBasemap.ts`) or a real, live fetch of
constitution Principle VIII's mandate-tier reference repositories — not
assumed from memory or from `docs/GRAMMAR.md`-style prose.

## 1. `maplibre-gl@4.7.1`'s real `fitBounds()`/`LngLatBounds` API surface

**Decision**: `map.fitBounds(bounds: LngLatBoundsLike, options?: FitBoundsOptions): this`.
`LngLatBoundsLike` accepts a bare `[west, south, east, north]` number array
directly — no `LngLatBounds` object construction needed. `FitBoundsOptions`
(extends `FlyToOptions`, which extends `AnimationOptions & CameraOptions`)
exposes `padding` (uniform number or per-edge `PaddingOptions`), `maxZoom`,
`linear` (`false`/default → `flyTo`-style easing; `true` → `easeTo`-style),
`offset`, and the inherited `duration`/`animate`/`easing` from
`AnimationOptions`.

**Rationale**: confirmed directly by reading the installed package's own
`.d.ts` (lines ~1689–1920 for `LngLatBounds`/`LngLatBoundsLike`, ~7217–7240
for `FitBoundsOptions`, ~7636 for the `fitBounds` method signature itself)
before designing anything — not assumed from a prior/different MapLibre
version's docs.

**Alternatives considered**: manually computing a center/zoom pair from a
bounding box and calling `easeTo()`/`jumpTo()` directly — rejected;
`fitBounds()` already does exactly this (via its own internal
`cameraForBounds()`), including correctly respecting the map's current
container size, and is the method every real reference implementation
found below actually uses.

## 2. Real, confirmed precedent: `WFRCAnalytics/APP-WFRC-Commute-Patterns`

This repository is already a Principle VIII mandate-tier reference for this
project (`MapboxOverlay` + `FlowmapLayer` + MapLibre wiring). A live fetch of
its real, current `src/map.js` (via `gh api`, not assumed) found it already
solves **both halves** of this feature, in production:

**Flow-bounds fitting** (a real, shipped function, confirmed verbatim):

```js
function fitToFlows(flows) {
  if (!map || !flows.length) return;
  const lons = flows.flatMap(d => [d.home_lon, d.work_lon]).filter(Boolean);
  const lats = flows.flatMap(d => [d.home_lat, d.work_lat]).filter(Boolean);
  if (!lons.length) return;
  map.fitBounds(
    [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: 60, duration: 800, maxZoom: 11 }
  );
}
```

**Reset-to-view control** (a real, shipped custom control, confirmed
verbatim):

```js
const _SVG_HOME = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
  stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  <polyline points="9 22 9 12 15 12 15 22"/></svg>`;

function _mapBtn(title, svgHtml, onClick) { /* creates a <button>, sets title/innerHTML, wires onClick */ }
function _makeCtrlGroup(...btns) {
  const el = document.createElement('div');
  el.className = 'maplibregl-ctrl maplibregl-ctrl-group';
  btns.forEach(b => el.appendChild(b));
  return { onAdd: () => el, onRemove: () => el.remove() };
}

map.addControl(_makeCtrlGroup(
  _mapBtn('Reset tilt & north', _SVG_NORTH, () => map.easeTo({ pitch: 0, bearing: 0, duration: 300 })),
  _mapBtn('Reset view',         _SVG_HOME,  () => map.flyTo({ ...INITIAL_VIEW, pitch: 0, bearing: 0 })),
), 'top-right');
```

**Decision**: adopt this real precedent directly, per Principle VIII's own
mandate for this exact category (MapLibre custom controls / camera fitting)
— not re-derive an independent design:
- The initial auto-fit call uses the SAME options shape:
  `padding: 60`, `maxZoom` (11 for flowmap, matching this reference exactly;
  the equivalent zonemap cap is a separately-considered value, §5 below,
  since no real reference repo has a geometry-bounds precedent — see §4),
  and an animated `duration` (this reference's own `800`ms), NOT an instant
  jump — correcting an earlier, unresearched assumption (see the
  now-superseded note in spec.md's own Assumptions) that the very first fit
  should be instant. The real production app animates it, and there is no
  reason this project's panels should look different.
- The reset control is a genuine custom `IControl`-shaped object
  (`{onAdd, onRemove}` — this project's own `ThreeDToggleControl` class
  already implements the identical interface with a class instead of a
  plain object literal, so the class form is kept for consistency with that
  existing in-house convention, not the reference's own plain-object form),
  added via `map.addControl()` into the SAME `'top-right'` corner cluster
  the existing `NavigationControl` (and, for zonemap, `ThreeDToggleControl`)
  already occupy — exactly matching this feature's own FR-007.
- The reset icon is the reference's own real, shipped home SVG
  (`stroke="currentColor"`) — reused verbatim, not redrawn. Using
  `currentColor` for the stroke means the icon automatically inherits the
  button's own `color: var(--foreground)` (`mapControls.css`) in both
  themes, with **no** dark-mode-specific CSS fix needed — unlike
  `NavigationControl`'s own hardcoded `#333` SVG data-URIs, which needed a
  `filter: invert(1)` workaround (`mapControls.css`'s own documented real
  bug). This is a strictly better outcome than either this project's
  existing icon approaches (`ThreeDToggleControl`'s plain '3D'/'2D' text, or
  `NavigationControl`'s dark-mode-hack icons), achieved by simply copying
  the reference's own icon technique.
- Reset also zeroes `pitch`/`bearing`, matching the reference's own
  `Reset view` button semantics (not just center/zoom) — a real, small
  scope addition over spec.md's literal wording, adopted because it's what
  the mandate reference actually does for its own "reset to starting view"
  affordance and a viewer who tilted/rotated a zonemap's 3D view away from
  its start reasonably expects a full reset, not a partial one.

**Alternatives considered**: designing the reset control and fit options
independently, then comparing against the reference only as a sanity check
— rejected; Principle VIII requires looking to the reference FIRST for this
exact category, not using it as an afterthought.

## 3. `APP-Commute-Explorer` — checked, no fitBounds precedent

A live GitHub code search (`gh api search/code?q=fitBounds+repo:
WFRCAnalytics/APP-Commute-Explorer`) returned zero results. This project's
other mandate-tier flowmap/MapLibre reference has no fitBounds usage to
check against — §2's `APP-WFRC-Commute-Patterns` precedent is the only real
one available, and is directly applicable regardless (both repos are close
siblings solving the same domain problem with the same library stack).

## 4. `ar-puuk/spatial-sql-explorer` — checked, no fitBounds/geometry-bounds precedent

A live GitHub code search (`gh api search/code?q=fitBounds+repo:
ar-puuk/spatial-sql-explorer`) — this project's own zonemap-choropleth/
basemap-switching mandate reference — returned zero results. There is no
real precedent to copy for "fit the map to a loaded zone-geometry cache's
extent" specifically. This half of the feature is therefore genuinely new,
independently-derived work (not a Principle VIII gap — the principle only
requires copying a pattern where the reference actually has one) — designed
to reuse the SAME `fitBounds()` call shape §2 established for flowmap
(padding/maxZoom/duration), just fed a bounding box computed from geometry
coordinates instead of flow point coordinates, for a consistent camera-
behavior feel across both map panel types.

## 5. Bounds computation — pure, DOM-free modules, mirroring existing precedent

**Decision**: a new `src/panels/mapBounds.ts`, pure and DOM-free (no
`maplibre-gl` import at all — only plain number tuples), mirroring the
existing `flowmapData.ts`/`zonemapColor.ts` split:

- `computeFlowBounds(locations: FlowLocation[]): BoundsTuple | null` —
  operates on `buildFlowmapData()`'s own already-deduplicated `locations`
  output (both origin and destination points, one entry per unique id) —
  this already IS "every point any flow touches" (spec.md FR-001), so no
  second pass over raw rows is needed; reduces to `[minLon, minLat, maxLon,
  maxLat]`, which is directly a valid `LngLatBoundsLike` (§1) with zero
  conversion.
- `computeGeometryBounds(features: ZoneFeature[]): BoundsTuple | null` — a
  generic recursive coordinate-array flattener (works uniformly across
  `Polygon`/`MultiPolygon`/any other GeoJSON geometry type without a
  type-specific switch, since every GeoJSON geometry's `coordinates` is
  just arbitrarily-nested arrays bottoming out in `[lon, lat]` pairs),
  reduced the same way.

Both return `null` for zero input (spec.md FR-004's "no data yet" case) —
the caller checks this before ever calling `fitBounds()`.

**Rationale**: matches this codebase's own established "pure, DOM-free
transform module + DOM-touching caller" split (`flowmapData.ts`,
`zonemapColor.ts`, `sankeyGraph.ts`), keeping the actual bounds arithmetic
independently unit-testable via Vitest without a real MapLibre instance —
the same reason those prior modules were split out in the first place.

**Alternatives considered**: importing `maplibregl.LngLatBounds` and using
its `.extend()` method inside this module — rejected; would make the module
depend on `maplibre-gl`'s runtime for no real benefit (a plain tuple reducer
is simpler and already directly consumable by `fitBounds()`, §1), and this
codebase's existing pure-transform modules deliberately avoid pulling in
their DOM/library-touching caller's own dependencies.

## 6. Timing — extending, not replacing, each panel's existing gate/guard machinery

**Decision**: no new effect. The auto-fit call is added directly inside each
panel's existing, already-fully-gated effect that only runs once every real
precondition is met:
- **FlowMapPanel.tsx**: inside the existing data-update effect (the one
  already gated on `status === 'ready' && mapReady && overlayRef.current`),
  immediately after `buildFlowmapData()` produces `data`.
- **ZoneMapPanel.tsx**: inside the existing data-update effect (already
  gated on `status === 'ready' && geometryStatus === 'ready' && mapReady &&
  zoneGeometry`), reading `zoneGeometry.features` directly.

A new `hasAutoFittedRef = useRef(false)` per panel is the ONLY new state
needed for the "at most once per mount, never re-triggered" rule (spec.md
FR-006, resolved): both existing effects already re-run for reasons other
than a genuine first data load (a `layerRepopulateGeneration` bump from a
basemap switch or WebGL context recovery, a later real data/geometry change
from a filter or scenario switch) — the ref guard, checked and set
immediately before the `fitBounds()` call, makes every one of those re-runs
a correct no-op with no new dependency-array engineering required.

**Rationale**: this is the exact "run something once per genuine data
change, not per re-render" problem `FlowMapPanel.tsx`'s own
`warnedForRowsRef` already solves for its exclusion-count warning (same
file, same effect) — confirmed by direct read, not assumed, before treating
it as the precedent to extend. Adding a second, purpose-built ref beside an
existing one already doing the identical class of "run once, guard against
redundant re-run" job is the lowest-risk change: it touches neither effect's
dependency array, so none of `011`/`012`/`013`'s already-verified
basemap-switch/context-recovery/geometry-cache correctness guarantees are
disturbed.

**Alternatives considered**: a new, dedicated `useEffect` for auto-fit,
keyed on `[data.locations]`/`[zoneGeometry]` — rejected; would need its own
separate `mapReady`/`status` re-derivation (duplicating guards the existing
effect already has) and would still need the same one-shot ref to satisfy
FR-006, for no actual benefit over adding one call+guard to the effect that
already has every precondition proven true at the point it runs.

## 7. Reset control state — a ref, not React state, for the same reason `is3dRef` is a ref

**Decision**: the resolved "effective view to reset to" is stored in a ref
(`appliedViewRef`), not React state, as a single concrete shape — `{
center: [number, number]; zoom: number }` — regardless of whether it came
from the author's literal `config.center`/`config.zoom` (captured
synchronously at mount) or from auto-fit (captured once the auto-fit
animation genuinely finishes, §7a below). The `ResetViewControl` instance
(created once, in each panel's mount-only effect, alongside
`NavigationControl`) is handed a stable callback that reads
`appliedViewRef.current` and `mapRef.current` at CLICK time, not at
control-construction time, and always performs a single `map.easeTo({
center, zoom, pitch: 0, bearing: 0 })` — one code path for both sources,
not a branch.

## 7a. Real, empirically-confirmed correction: storing a resolved camera, not a raw bounds tuple

**What was originally planned** (superseded by this finding, not by
assumption): store `{ source: 'auto-fit', bounds: BoundsTuple }` for the
auto-fit case, and have `onReset` re-run `map.fitBounds(bounds, {...})`
against that stored tuple on every click.

**What broke, found via this feature's own Playwright coverage, not
assumed**: the very first end-to-end reset test for `ZoneMapPanel.tsx`
failed — after clicking reset, the map settled at a center roughly
0.02°–0.03° away from the original auto-fitted position (zoom matched
exactly; only center drifted). Root-caused via a dedicated debug script,
each step confirmed directly against the real browser, not guessed:

1. Ruled out the reset design's own `pitch`/`bearing` handling first (a
   REAL, separate bug found and fixed along the way): calling a second,
   independent `map.easeTo({ pitch: 0, bearing: 0 })` immediately after
   `map.fitBounds(bounds, {...})` INTERRUPTS the in-flight `fitBounds()`
   animation — a second camera-animation call issued while the first is
   still running takes over immediately, freezing center/zoom at whatever
   they happened to be at that instant rather than ever reaching the
   fitted destination. Fixed by folding `pitch`/`bearing` into the SAME
   call (`FitBoundsOptions`/`EaseToOptions` both extend `CameraOptions`,
   which already includes both — confirmed directly against the installed
   `.d.ts`) — but the center drift persisted even after this fix, proving
   it was a second, independent issue.
2. Ruled out object mutation: logged the raw `BoundsTuple` array's own
   `JSON.stringify()` before/after both `cameraForBounds()` and
   `fitBounds()` calls — byte-for-byte identical every time.
3. Ruled out a stale/duplicate map instance (a real, live possibility in
   this codebase: React 18 StrictMode is enabled in `main.tsx`, which
   double-invokes mount effects in dev, and this project's own
   `FlowMapPanel.tsx` comments already document exactly this class of
   double-mount hazard): tagged each constructed `maplibregl.Map` with a
   random debug id — confirmed the "resolved" and "landed" values being
   compared both came from the SAME single surviving instance, not a
   discarded first-mount's zombie listener.
4. Confirmed the actual, narrowed-down fact: calling `map.cameraForBounds
   (bounds, opts)` and then, immediately afterward in the same
   synchronous tick, calling `map.fitBounds(bounds, opts)` on the SAME
   live map instance — even though `fitBounds()`'s own real, installed
   source (`_fitInternal(this.cameraForBounds(bounds, options), ...)`)
   calls the exact same public method with the same bounds/options — the
   position `fitBounds()` actually animates to and lands at can differ
   measurably (not floating-point noise) from what the explicit
   `cameraForBounds()` call predicted a moment earlier. Reproduced
   identically across three separate real fixture panel instances sharing
   the same `boundaries` file (byte-for-byte the same resolved value,
   byte-for-byte the same landed value, on every one) — ruling out a
   per-instance fluke. The exact internal reason inside MapLibre's own
   `_cameraForBoxAndBearing`/animation pipeline was not fully traced
   further once a clean, robust fix was in hand (see below) — recorded
   here as a confirmed, reproducible fact about this library version's
   real behavior, not a fully explained root cause.

**Decision**: stop predicting the destination ahead of time entirely.
`appliedViewRef` is populated from GROUND TRUTH instead — a one-time
`map.once('moveend', () => { const c = map.getCenter(); appliedViewRef.
current = { center: [c.lng, c.lat], zoom: map.getZoom() } })` listener
attached immediately after the initial `fitBounds()` call. Reading the
map's own real post-animation state has nothing left to disagree with —
there is no separate prediction to drift from reality. This also
simplified `EffectiveView` itself from a discriminated union
(`{source:'author-config',...} | {source:'auto-fit', bounds}`) down to one
concrete shape (`{center, zoom}`) shared by both branches, since both are
now, structurally, "a resolved camera position to `easeTo()` back to" —
removing an entire branch from `onReset` in both panel files.

**Alternatives considered**: keeping the `cameraForBounds()`-predicted
value but widening the test tolerance to absorb the drift — rejected;
papering over an unexplained, real discrepancy with a looser assertion
would silently accept incorrect production behavior (a viewer's "reset"
landing somewhere subtly different from where the panel actually opened)
for the sake of making a test pass, the opposite of what the test caught
correctly.

**Rationale**: matches `ZoneMapPanel.tsx`'s own existing `is3dRef`
precedent exactly (a ref specifically because the control itself is not
part of React's render tree, so nothing about its own lifecycle should
depend on a React re-render) — confirmed by direct read of that file's own
comment explaining why `is3dRef` is a ref and not state. A closure reading a
ref's `.current` at call time is always fresh, avoiding the exact
stale-closure failure mode `FlowMapPanel.tsx`'s own
`layerRepopulateGeneration` comment already documents as a real,
previously-corrected mistake in this codebase (a long-lived closure that
tried to read `status`/`rows`/`config` directly instead of routing through
a fresh re-render).

**Alternatives considered**: React state for the applied view, driving the
control's enabled/disabled appearance via a re-render — rejected for the
same reason `is3dRef` isn't state: the control's own DOM (button
enabled/disabled attribute) is imperative MapLibre-owned chrome, updated via
a direct `setEnabled()` call the moment the ref is populated, not through
React's render cycle.
