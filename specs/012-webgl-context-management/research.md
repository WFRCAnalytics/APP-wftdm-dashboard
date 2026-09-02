# Research: WebGL Context Management for Multi-Map Dashboards

The feature description names four candidate directions in an explicit
priority order and requires each to be checked against real
documentation/source, not assumed. This document resolves all four, in
that order, then the two derived design questions (capacity math and
recovery semantics) needed to write FR-003/FR-006 down as concrete,
buildable decisions.

---

## §1. deck.gl's View system — investigated FIRST, RULED OUT (not a fix for this architecture)

**The lead** (from the feature description): kepler.gl's own maintainers
have said "In a perfect world, kepler.gl would obviously not be using two
contexts but rather adopt the deck.gl View system," with the caveat "there
are other cases where we have two contexts, like when using multiple 3rd
party basemaps."

**What the View system actually is, confirmed directly against deck.gl's
own docs and a maintainer's own words** (`deck.gl/docs/developer-guide/
views`, `github.com/visgl/deck.gl/discussions/7412`):

- "deck.gl has a view system to let you draw multiple views into a single
  canvas" — the system is designed for **splitting ONE canvas into
  multiple viewports of the SAME underlying scene/data** (split-screen of
  one dataset, a minimap inset, stereoscopic left/right-eye rendering) —
  not for hosting N independently-authored, independently-laid-out
  dashboard panels each showing different data.
- deck.gl maintainer `ibgreen`, asked directly about single-vs-multiple
  `Deck` instances: "there are no practical advantages to having two
  DeckGL instances **other than if you absolutely need to draw into two
  separate canvases**." That "unless" clause is exactly this project's
  situation — every flowmap panel is its own React-mounted `<div>`,
  independently laid out in `dashboardRenderer.tsx`'s CSS grid, and
  individually relocatable into `panelExpandHost.tsx`'s dialog (004) —
  genuinely separate canvases by design, not an accident of
  implementation this feature could undo.
- Confirmed further: "when using `MapboxOverlay` with multiple views
  passed to the `views` prop, only one of the views can match the base
  map and receive interaction," and "deck.gl's multi-view system cannot
  be used when relying on Mapbox's interleaved rendering mode" — the View
  system and interleaved-with-a-base-map mode are not even composable
  with each other, let alone across N independent base maps.

**MapLibre's own side of the caveat, checked directly (not assumed)**:
does MapLibre have anything comparable to consolidate multiple *base map*
instances into one shared context? No. `github.com/maplibre/
maplibre-gl-js/discussions/3065` ("Too many active webgl contexts," a
real user hitting exactly this project's own failure mode — "after 8
maps are created, error warnings appear," matching the ~8-panel ceiling
this project's own non-interleaved 2-context/panel math already
predicted) — MapLibre maintainer `HarelM`'s own response: "You can get
the html canvas from the map and get the webgl context, the rest is up
to you and the browser basically" — i.e., no built-in mechanism exists;
MapLibre "delegates WebGL context management to browser limitations and
individual developer implementation." Confirms the kepler.gl maintainer's
own caveat exactly: even a hypothetical deck.gl-side consolidation would
leave each panel's separate MapLibre base map needing its own context
regardless, because MapLibre has never added — and has no plans visible
in this research to add — an equivalent.

**Conclusion**: not viable for this codebase, for two independent
reasons, either one sufficient on its own: (1) deck.gl's View system
requires one shared canvas/scene, which conflicts with this app's
already-committed independent-panel architecture and 004's per-panel
relocation mechanism specifically; (2) even setting that aside, MapLibre
itself has no native multi-map-single-context mechanism, so the base-map
half of the per-panel context cost would be untouched regardless of what
deck.gl's side does. This resolves the research question the feature
description posed and rules the option out with primary-source evidence,
not by assumption.

---

## §2. Interleaved mode — CHOSEN — halves context cost, needs its own new empirical proof

**Cost confirmed directly**: "mapbox and deck.gl will share a single
canvas and WebGL context, saving system resources" (`deck.gl/docs/
api-reference/mapbox/overview`) — interleaved mode reduces this
project's per-panel cost from 2 contexts (MapLibre's own + deck.gl's own
non-interleaved overlay canvas) to 1 (deck.gl renders directly into
MapLibre's own `WebGL2RenderingContext`). Against Chromium's real,
already-confirmed `kMaxGLActiveContexts = 16` (desktop), this raises the
per-tab theoretical ceiling from ~8 panels to ~16 — a >2.5x margin over
this feature's SC-001 floor (the existing 6-panel "Basemaps" fixture).

**The reopened risk, confirmed real and distinct from what 011 already
proved**: 011's own empirical test (`research.md` §1 there) proved
non-interleaved `MapboxOverlay` survives `map.setStyle()` on this
project's pinned versions — but that proof is specific to non-interleaved
mode, where "a non-interleaved overlay's canvas lives outside the base
map renderer's own style/layer lifecycle" (011 research.md's own words).
Interleaved mode inserts deck.gl's layers directly into MapLibre's own
style/layer stack, which IS wiped by `setStyle()` — confirmed via a real,
documented failure/fix pattern (`github.com/visgl/deck.gl/discussions/
7170`, MapLibre's own `github.com/maplibre/maplibre-gl-js/issues/2587`,
and the general Mapbox-lineage pattern at `github.com/mapbox/
mapbox-gl-js/issues/7576`): "layers can't be reused — they need to be
recreated when working with MapboxOverlay in interleaved mode," fixed by
`overlay.setProps({layers: []})` before the style changes, then
`overlay.setProps({layers: [...]})` again once the new style has finished
loading. This is genuinely the same defensive shape 011 already
documented as its own "if the test fails" fallback for the non-interleaved
case (never needed there) — here it's the expected, always-needed
behavior, not a fallback.

**Decision**: `FlowMapPanel.tsx`'s `MapboxOverlay` construction gains
`interleaved: true`. The existing basemap-application effect (011,
`FlowMapPanel.tsx`) is extended: immediately before calling
`map.setStyle(newStyle, {transformStyle})`, call
`overlayRef.current.setProps({layers: []})`; inside the existing
`style.load` handler (where 011 already removes its scoped `error`
listener), re-set the real, current `FlowmapLayer` array via
`overlayRef.current.setProps({layers: [...]})`. This reuses 011's already
-correct `style.load`-scoped timing rather than inventing a new one.

**New empirical Playwright test required (this feature's own gating
checkpoint, mirroring 011's §1 discipline exactly, not an extension of
011's existing "Basemap survives a light/dark theme switch" test — that
test is non-interleaved and stays as-is)**: `describe('Interleaved
overlay survives a light/dark theme switch')` in `flowmapPanel.spec.ts`,
asserting the same evidence class 011's test already established (same
canvas-node identity — trivially true here since interleaved mode has
only one canvas — live `moveend` interactivity, zero `duplicate|already
exists` console errors) PLUS the interleaved-specific assertion 011 never
needed: the `FlowmapLayer`'s render-count/flow-count `data-*`
instrumentation attribute is present and correctly non-empty
**after** the switch, proving the `setProps({layers: []})` →
`style.load` → `setProps({layers: [...]})` sequence actually re-populates
the layer rather than leaving it silently empty (the failure mode
`discussions/7170`/`issues/2587` describe).

---

## §3. Context-loss detection — CHOSEN, unconditional — wiring up events the libraries already fire, not building new instrumentation

**A materially better finding than assumed at spec time**: this is not
"build WebGL context-loss detection." MapLibre's own `Map` class already
does the low-level work, confirmed directly in this project's own
installed `node_modules/maplibre-gl/dist/maplibre-gl.js`:

```js
this._contextLost = t => {
  t.preventDefault()
  this._frameRequest && (this._frameRequest.abort(), this._frameRequest = null)
  this.fire(new e.k("webglcontextlost", { originalEvent: t }))
}
this._contextRestored = t => {
  this._setupPainter()
  this.resize()
  this._update()
  this.fire(new e.k("webglcontextrestored", { originalEvent: t }))
}
```

Three things this confirms, directly from the shipped library code, not
assumed: (1) MapLibre already calls `event.preventDefault()` on context
loss — the one action the WebGL spec requires for the browser to ever
consider restoring that context later (confirmed independently via the
Khronos WebGL wiki/MDN: "by default when a WebGL program loses the
context it never gets it back" unless `preventDefault()` was called); (2)
MapLibre already cleanly aborts any in-flight frame request, so a lost
context does not crash or hang the panel; (3) MapLibre already rebuilds
its own internal painter/GL resources and re-triggers a normal render
pass on restoration, automatically. And these are real, documented,
**public** `Map` events — confirmed against MapLibre's own official API
docs (`maplibre.org/maplibre-gl-js/docs/API/classes/Map/`), listed
alongside every other event `map.on()` accepts.

**deck.gl's own default behavior is the opposite, and matters less once
interleaved mode is adopted**: deck.gl's own internal default
`onContextLost` handler (confirmed in this project's own installed
`node_modules/@deck.gl/core/dist/dist.dev.js`) does **not** call
`event.preventDefault()`, and resolves with `reason: "destroyed", message:
"Entered sleep mode, or too many apps or browser tabs are using the
GPU."` — a real, deck.gl-authored message naming this exact failure
class. In **non-interleaved** mode (today's shipped behavior) this would
matter: deck.gl's own separate canvas/context, if evicted, would never
qualify for automatic browser-side restoration at all. In **interleaved**
mode (§2's decision), deck.gl draws into MapLibre's own shared context —
there is no longer a second, separately-fated canvas to worry about; the
one canvas that exists is the one MapLibre already handles correctly.
This is an additional, independent reason interleaved mode is the right
choice here, beyond the raw context-count halving §2 already
established.

**Decision**: `FlowMapPanel.tsx`'s mount effect adds
`map.on('webglcontextlost', ...)` / `map.on('webglcontextrestored', ...)`
listeners directly on the `maplibregl.Map` instance it already owns and
controls — no new low-level `canvas.addEventListener` code, no
`preventDefault()` call of this feature's own (MapLibre already performs
it). On `webglcontextlost`: set a new piece of panel-local React state
(`contextLost`) that renders a status distinct from both a working map
and 011's existing blank-basemap fallback (data-model.md defines the
exact shape, reusing `PanelErrorState.tsx`'s visual language with
distinct copy/icon per FR-002 — not a wholly new shared component
category). On `webglcontextrestored`: MapLibre has already rebuilt its
own base-map resources by the time this event fires (per the source
above); the handler clears `contextLost` and re-runs the exact same
basemap-application logic §2 already extends (`setProps({layers: []})`
→ current style's already-loaded state → `setProps({layers: [...]})`) to
restore the panel's `FlowmapLayer`, satisfying FR-006's "re-apply the
panel's correct effective basemap" using the SAME three-level precedence
already resolved and cached for that panel (no new resolution logic —
the existing `resolveEffectiveBasemap()`/`basemapKey()` machinery from
011 is reused verbatim; a pinned panel's basemap key hasn't changed just
because its context was lost, so it recovers to the same pin, not the
app default — satisfying the Edge Cases section's own explicit
requirement).

---

## §4. Viewport-gated mounting — researched, deliberately NOT built

**Real, confirmed risk against 004, checked directly against
`panelExpandHost.tsx`'s actual implementation** (not assumed from its
name): the hook's inline anchor is hidden via `display: none` while
expanded — **never removed from the DOM** — and the persistent
`portalHostRef` node is moved between the inline and dialog anchors via a
synchronous `appendChild` inside a `useLayoutEffect`. A panel's own
`IntersectionObserver`, watching its own subtree (which lives inside that
same persistently-moved node), would in principle continue to reflect
real, current visibility correctly across a 004 expand/collapse — DOM
moves via `appendChild` are transparent to `IntersectionObserver`, and
the observer's callback is asynchronous/batched (not fired synchronously
per DOM mutation, confirmed via `IntersectionObserver`'s own standard,
MDN-documented design), so a momentary same-frame relocation shouldn't
itself trigger a spurious teardown. But this reasoning is exactly the
class of claim this project's own established discipline (004, 010, 011)
requires empirical proof for, not analysis alone — a **new**, dedicated
Playwright test would be needed proving specifically: a panel scrolled
off-screen tears down its map (freeing its context budget), and
expanding that same panel via 004's trigger while off-screen-and-torn-
down correctly remounts it inside the dialog with no visible failure.

**Decision: not built in this feature.** §2's interleaved-mode fix alone
raises the real per-tab ceiling to ~16 panels — well above the 6-panel
SC-001 floor this project's own existing fixture sets, with no dashboard
in this project (or named in the feature description) actually needing
more than that today. Building viewport-gated mounting now would add a
second, independent capacity-increasing mechanism, its own genuinely new
004-interaction risk, and its own dedicated empirical test — real cost
with no current requirement it's needed for. This is not "ruled out" the
way §1 is (§1 is architecturally incompatible; viewport-gated mounting is
merely unneeded right now) — it's an explicitly deferred, revisitable
option, recorded here so a future feature that genuinely needs a higher
ceiling than interleaved mode alone provides doesn't have to re-derive
this research. If ever revisited, this section's own risk analysis is
the starting point, not a blocker discovered fresh.

---

## §5. Capacity math and the production-build measurement discipline

| Mode | Contexts/panel | Panels at Chromium's real 16-context ceiling |
|---|---|---|
| Non-interleaved (today, unfixed) | 2 | ~8 |
| Interleaved (this feature) | 1 | ~16 |

This project's own confirmed finding from the prior session's bug
investigation (fully resolved, not re-litigated here per the feature
description's own instruction) — React 18 StrictMode's dev-only 2x
effect double-invocation inflates apparent context creation during
`npm run dev`/a Playwright run against the dev server, an artifact
**entirely absent** from `npm run build` output (confirmed against
`react-dom`'s own separate `.development.js`/`.production.min.js`
builds and this project's own unmodified `vite build` script). SC-001
and the new §2 empirical test are therefore both measured against a
**production build** specifically — `vite build` + `vite preview` (or
equivalent), not `vite dev` — so the ~16-panel theoretical ceiling isn't
mistaken for an ~8-panel one by an artifact of the dev tooling, the same
mistake this project's own bug investigation already made once and
corrected.

---

## §6. Recovery semantics — why FR-006/SC-002's hedge is real, not defensive wording

Confirmed directly against Chromium's own source
(`webgl_rendering_context_base.cc`, `ForciblyLoseOldestContext`/
`RestoreEvictedContext`): a context evicted for exceeding the ceiling is
added to an internal "forcibly evicted" list with `restore_allowed_`
effectively true (`kWhenAvailable`), and **is** eligible for automatic
restoration later — but only opportunistically, checked when
`ActiveContexts().size() < max_gl_contexts` becomes true again (i.e.,
some other context on the same tab is destroyed/released) and a new
context creation request triggers the check. There is "no automatic
timer or background mechanism that attempts restoration independently."

This confirms, from the browser's own real mechanism, exactly the hedge
the spec (FR-006/SC-002) already states: recovery is real and possible —
this project doesn't need to invent it, and §3's `webglcontextrestored`
handler correctly reacts when it happens — but it is not something this
feature can *cause* to happen on any guaranteed timeline. It happens if
and when the browser's own opportunistic mechanism finds room (e.g., the
Edge Cases section's own "analyst navigates away from the tab and back,"
which unmounts the whole prior tab's panels — `shell.tsx` renders only
the active tab — freeing every one of their contexts and giving
Chromium's own restoration check a real opportunity to fire). This
project's own §2/§3 decisions are exactly and only "correctly react when
it happens" (FR-006's actual, narrower guarantee), matching the spec's
own explicit rejection of "recovery always happens" as an overclaim this
plan should not encode.

---

## Summary of decisions

1. deck.gl View system: **ruled out**, architecturally incompatible (§1).
2. Interleaved `MapboxOverlay` mode: **built**, with a new dedicated
   empirical Playwright test (§2).
3. `webglcontextlost`/`webglcontextrestored` detection: **built**,
   wiring up MapLibre's own already-existing public events rather than
   new low-level instrumentation (§3).
4. Viewport-gated mounting: **researched, deliberately deferred** — not
   needed to clear SC-001's floor, carries its own unvalidated 004-
   interaction risk (§4).
