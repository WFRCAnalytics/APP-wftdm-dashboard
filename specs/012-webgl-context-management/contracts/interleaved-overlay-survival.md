# Contract: Interleaved `MapboxOverlay` + `setStyle()` survival

Full-body code for `FlowMapPanel.tsx`'s changed sections, shown against
the file's real, current (post-`011-basemap-style-system`) content — not
a from-scratch sketch. **Revised from this contract's first draft**: the
original design used a standalone `reapplyCurrentLayer()` helper called
directly from two long-lived event-handler closures. Confirmed against
the real file structure (not assumed) that this has a genuine stale-
closure bug — see "Why not a standalone helper function" below. The
corrected design instead extends the **existing** data-update effect's
own dependency array, so the one already-correct, always-freshly-closed
`FlowmapLayer`-construction code path is reused instead of duplicated.

**Two further corrections made during actual implementation, both found
via direct instrumentation, neither anticipated by this contract's plan-
phase text below** (the `style.load` handler shown in the diffs that
follow is the ORIGINAL plan-phase design — the real, shipped code
differs; see `src/panels/FlowMapPanel.tsx` for the actual final form):

1. **`'style.load'` never fires a second time.** Confirmed empirically
   (a real instrumented Playwright run against this project's own pinned
   `maplibre-gl`) and against a real upstream report
   (`github.com/maplibre/maplibre-gl-js/discussions/2716`: "style.load
   only runs once"): it fires exactly once per `Map` instance's
   lifetime — on the first style becoming ready — never again on any
   subsequent `setStyle()` call. The `map.once('style.load', ...)` shown
   in the diff below therefore never actually ran on a second+ basemap
   switch in the real, shipped code — replaced with a `'styledata'`-
   driven check.
2. **That replacement's first version filtered on `getStyle().sources`
   being non-empty** (the same "simpler, race-free signal"
   `waitForBasemapApplied()` already relies on in the test suite) — this
   is itself a real bug, found only after implementation was believed
   complete, via a direct user question tracing the fixture's own
   "Unreachable Basemap" panel: `BLANK_STYLE` (`loadBasemapStyle()`'s own
   fallback for a genuinely unreachable preset,
   `panels/basemap/loadBasemapStyle.ts`'s `resolvePresetName()` catch
   block) legitimately has zero sources, so that filter never fired for
   it — the overlay's layers (cleared unconditionally just before every
   `setStyle()` call, per this contract's own §2 below) were silently
   wiped and never restored for any panel whose basemap falls back to
   blank, violating FR-010/SC-004's "a missing/unreachable basemap never
   prevents a panel's data-driven content from rendering" guarantee —
   011's own core promise, confirmed working for the OLD non-interleaved
   design and silently broken by this feature's own first fix attempt.
   Corrected to react to the FIRST `'styledata'` after each `setStyle()`
   call unconditionally, regardless of source count — safe because
   nothing else calls `setStyle()` on this map between listener
   registration and the call (single-threaded JS, only this effect ever
   calls `setStyle()` on its own map instance), and a repopulate
   triggered by an unchanged/blank style is a safe, cheap no-op-
   equivalent via the data-update effect's own guards.

## Mount-only effect — one-line change

```diff
     const map = new maplibregl.Map({
       container: el,
       style: BLANK_STYLE,
       center: config.center ?? DEFAULT_CENTER,
       zoom: config.zoom ?? DEFAULT_ZOOM,
     })
-    const overlay = new MapboxOverlay({ interleaved: false, layers: [] })
+    const overlay = new MapboxOverlay({ interleaved: true, layers: [] })
     map.addControl(overlay)
```

**Why this alone is enough to halve context cost, confirmed via deck.gl's
own docs/source (research.md §2)**: `interleaved: true` makes
`MapboxOverlay` render deck.gl's layers directly into MapLibre's own
`WebGL2RenderingContext` instead of creating a second, separate canvas/
context of its own — no other construction option changes.

**A second, decisive consequence of this one line, confirmed directly
against `@deck.gl/mapbox`'s real installed source
(`node_modules/@deck.gl/mapbox/src/mapbox-overlay.ts`), not assumed**:
interleaved mode's `_onAddInterleaved()` method reads `map.painter
.context.gl` (MapLibre's own existing context) and hands it straight to
`new Deck({ ..., gl })` — it returns a bare, unused
`document.createElement('div')` and creates **no canvas of its own**.
Contrast `_onAddOverlaid()` (today's non-interleaved path), which
constructs `new Deck({ parent: container, ... })` — `Deck`'s own internal
canvas creation (`canvas.id = props.id || 'deckgl-overlay'`, confirmed in
`@deck.gl/core/src/lib/deck.ts`) only happens on THAT path. Also
confirmed directly: `MapboxOverlay.getCanvas()`'s real implementation is
`return this._interleaved ? this._map.getCanvas() : this._deck!
.getCanvas()` — after this feature, **there is no `canvas#deckgl-overlay`
element in the DOM at all**; every existing and new test that currently
locates one (see "Existing 011 test must be updated" below) needs to
stop expecting it.

## Basemap-application effect — extended around the existing `setStyle()` call

The effect's existing shape (generation counter, `AbortController`,
scoped `error`→`BLANK_STYLE` listener — all from `011`, unchanged) gains
exactly one new step immediately before `map.setStyle(...)`, and one new
step inside the existing `style.load` handling:

```diff
         const map = mapRef.current
+
+        // Interleaved mode (this feature) inserts deck.gl's layers
+        // directly into MapLibre's own style/layer stack — setStyle()
+        // wipes them, a real, documented failure mode distinct from
+        // 011's non-interleaved case (research.md §2:
+        // github.com/visgl/deck.gl/discussions/7170, github.com/maplibre/
+        // maplibre-gl-js/issues/2587). Clearing layers before the style
+        // changes, then re-populating once the NEW style has finished
+        // loading, is deck.gl's own documented fix for exactly this.
+        overlayRef.current?.setProps({ layers: [] })

         const onLoadError = () => {
           map.off('error', onLoadError)
           const current = map.getStyle()
           if (current && JSON.stringify(current) !== JSON.stringify(BLANK_STYLE)) {
             map.setStyle(BLANK_STYLE)
           }
         }
         map.on('error', onLoadError)
-        map.once('style.load', () => map.off('error', onLoadError))
+        map.once('style.load', () => {
+          map.off('error', onLoadError)
+          // Do NOT reconstruct the FlowmapLayer here directly — see "Why
+          // not a standalone helper function" below. Instead, bump a
+          // state counter the EXISTING data-update effect's own
+          // dependency array now includes, so that effect's own,
+          // always-fresh closure does the actual reconstruction the
+          // next time it runs.
+          setLayerRepopulateGeneration((g) => g + 1)
+        })

         map.setStyle(styleArg, {
           transformStyle: (previous, next) => { /* unchanged */ },
         })
```

## Why not a standalone helper function (correction from this contract's first draft)

The first draft of this contract defined `reapplyCurrentLayer()` as a
plain function inside `FlowMapPanel`, called directly from both this
`style.load` handler and `context-loss-detection.md`'s
`webglcontextrestored` handler. **This is a real stale-closure bug, not
just a style preference** — confirmed by tracing the actual React
lifecycle, not assumed:

- The `style.load` callback is registered inside the basemap-application
  effect (`useEffect(..., [key, mapReady])`). That effect's closure is
  fresh *relative to the last time the effect itself ran* — but it only
  re-runs when `key`/`mapReady` change, not on every render. If
  `status`/`rows`/`config` change between when the effect last ran
  (registering the listener) and the moment `style.load` actually fires
  (asynchronously, after `setStyle()`), a directly-called
  `reapplyCurrentLayer()` reading `status`/`rows`/`config` from that
  closure would read **stale** values, not the panel's current data.
- The `webglcontextrestored` callback is registered inside the
  mount-only effect (`useEffect(..., [])`), which runs **exactly once**.
  A directly-called `reapplyCurrentLayer()` from inside it would forever
  read whatever `status`/`rows`/`config` were at first mount (`'loading'`,
  `[]`, the initial config) — never the panel's real, current state. This
  is the more severe of the two cases: every recovery, for the entire
  lifetime of the panel, would silently reapply stale/empty data instead
  of whatever the panel is actually showing.

`useState` **setter functions** are the one thing from a render that
stays valid and correctly-behaved no matter how old the closure holding
a reference to them is — React guarantees the same setter function
identity across every render of a given component instance, and the
updater-function form (`setX((prev) => next)`) never needs to read a
current value from the stale closure at all. This is exactly why
`setContextLost`, `setLayerRepopulateGeneration`, etc. are safe to call
from any of these long-lived handlers, while *computing new layer data*
from `status`/`rows`/`config` inside those same handlers is not.

**The fix**: neither handler computes anything from `status`/`rows`/
`config` directly. Each only calls a state setter (always fresh-safe).
The actual `FlowmapLayer` reconstruction stays exactly where it already
correctly happens — the existing data-update effect — which is
guaranteed to have a fresh closure over the CURRENT render's
`status`/`rows`/`config` at the moment it actually executes, because
React creates that effect's callback anew on every render and only its
*invocation* is deferred to when a dependency changes (React's standard
effect-closure guarantee, the same mechanism 011's own `mapReady`-as-
state fix already relies on, per research.md §11's cited reasoning).

## Data-update effect — one dependency added, body unchanged

```diff
   useEffect(() => {
     if (status !== 'ready' || !mapReady || !overlayRef.current || !containerRef.current) return

     const data = buildFlowmapData(config, rows)
     if (data.excludedCount > 0) { /* unchanged */ }

     const layer = new FlowmapLayer({ /* unchanged */ })
     overlayRef.current.setProps({ layers: [layer] })

     renderCountRef.current += 1
     containerRef.current.dataset.renderCount = String(renderCountRef.current)
     containerRef.current.dataset.flowCount = String(data.flows.length)
     containerRef.current.dataset.locationCount = String(data.locations.length)
-  }, [config, rows, status, mapReady])
+  }, [config, rows, status, mapReady, layerRepopulateGeneration])
```

New state, declared alongside the existing `status`/`rows`/`mapReady`
state:

```ts
const [layerRepopulateGeneration, setLayerRepopulateGeneration] = useState(0)
```

**Behavior when a repopulate is requested while `status` isn't `'ready'`**
(e.g., a filter change is mid-flight when `style.load` or
`webglcontextrestored` fires): the effect still runs (its dependency
changed) but immediately returns at the existing guard — a correct
no-op, since there's nothing to draw yet. When `status` later reaches
`'ready'` (the data-fetch effect's own, separately-triggered resolution),
this SAME effect re-runs again anyway (`status` is already in its own
deps) and draws the real, current data — so a repopulate request is
never lost, only deferred to whenever real data is actually available,
which is the same "recovery happens when it can, not on this feature's
own guaranteed timeline" hedge FR-006 already documents.

## `webglcontextrestored`'s own repopulate trigger (full detail in `contracts/context-loss-detection.md`)

Uses the exact same `layerRepopulateGeneration` mechanism — one shared
trigger, two real callers (a `style.load` after `setStyle()`, and
`webglcontextrestored`) — not two independently-written copies that
could drift, and not the duplicated-`FlowmapLayer`-construction helper
this contract's first draft proposed.

## Existing 011 test must be UPDATED, not left alone (correction from this contract's first draft)

The first draft of this contract assumed 011's existing
`test.describe('011-basemap-style-system — US1: setStyle()/MapboxOverlay
empirical survival ...')` block (`tests/integration/flowmapPanel.spec.ts`,
current lines ~535-635) "stays as-is... remains valid since non-
interleaved mode's own survival proof doesn't depend on this feature's
changes." **This is wrong, confirmed against the real, current test
file, not assumed.** That test's own body:

- Locates `const overlayCanvas = container.locator('canvas#deckgl-overlay')`
  and asserts `.toBeVisible()`, takes an `.elementHandle()` before/after
  the switch, and reads pixels via `overlayCanvas.evaluate(...)` — **this
  element no longer exists once `interleaved: true` ships** (confirmed
  above). Every one of these assertions needs to target
  `canvas.maplibregl-canvas` instead — the one canvas that now exists,
  which deck.gl draws into directly.
- Asserts `expect(await container.getAttribute('data-render-count'))
  .toBe(renderCountBefore)` (an EXACT-unchanged check). Under interleaved
  mode, this feature's own `style.load` → `layerRepopulateGeneration`
  bump → data-update-effect-re-run sequence is REQUIRED (it's the fix for
  the interleaved-mode setStyle-wipe risk, research.md §2) — meaning
  `renderCount` now legitimately increments by exactly one across a
  theme switch. This assertion must change to `expect(Number(await
  container.getAttribute('data-render-count'))).toBe(Number(renderCountBefore)
  + 1)` — a stronger, more precise check than simply removing the
  assertion: it proves the repopulate happened exactly once (not zero —
  silently missing — and not more than once — a redundant extra
  `setProps` call), while `flowCount`/`locationCount` (checked
  separately, unaffected by this change) still assert the underlying
  DATA is byte-for-byte the same as before the switch, preserving
  011's actual original intent ("the FlowmapLayer's own data was never
  touched by the style swap, so re-fetching/re-querying must not have
  been triggered" — still true; the data-FETCH effect, gated on
  `[config, filters, activeScenarioNames]`, is never re-triggered by any
  of this feature's changes, only the already-fetched data's client-side
  re-application to the overlay).
- The `overlayLayerCount` check (`window.__flowmapTestOverlays![title]
  ._props.layers.length === 1`) is unaffected — `_props` is a property of
  the `MapboxOverlay` JS object itself, not DOM/canvas-dependent, and
  stays correct under interleaved mode without modification.
- The `moveend`-liveness check and the `/duplicate|already exists/i`
  console check are both unaffected — neither depends on which canvas
  element deck.gl happens to draw into.

This is one test file requiring real, targeted edits (not a new
parallel describe block) — tracked as its own task in tasks.md, not
folded silently into "add new tests."

## New empirical Playwright test (gating checkpoint, research.md §2)

A NEW, separate test — genuinely additive, not a duplicate of the
now-updated 011 test above — specifically proving the repopulate
COUNT/TIMING claim precisely (the updated 011 test above proves survival
across ONE theme switch; this one additionally proves the mechanism is
correct across a RAPID back-to-back double switch, the case most likely
to expose an off-by-one or race in `layerRepopulateGeneration`'s
handling):

```ts
test.describe('012-webgl-context-management — interleaved overlay repopulates exactly once per style change', () => {
  test('two rapid theme switches produce exactly two repopulates, no duplicate/missing layer', async ({ page }) => {
    // 1. Boot, reach 'ready' with basemap+layer visible, capture
    //    renderCountBefore.
    // 2. Toggle dark, wait for style.load (via window.__flowmapTestMaps),
    //    IMMEDIATELY toggle back to light (no settle delay between the
    //    two — the adversarial case for a generation-counter race).
    // 3. Wait for the SECOND style.load to fire.
    // 4. Assert: data-render-count === renderCountBefore + 2 (exactly —
    //    not 1, which would mean one repopulate was dropped; not 3+,
    //    which would mean a redundant extra repopulate fired).
    // 5. Assert: overlay.props.layers.length === 1 (still exactly one
    //    layer, no duplicate accumulation across the two repopulates).
    // 6. Assert: flowCount/locationCount match renderCountBefore's own
    //    values (data genuinely unchanged, only re-applied).
  })
})
```

**If this test fails** with a repopulate count off by one: the most
likely real cause (per the same GitHub-documented pattern this fix
already comes from) is `style.load` firing before interleaved mode has
actually finished re-inserting deck.gl's render slot into MapLibre's
layer stack — the documented next step is a short delay or the `'idle'`
event instead of `style.load` directly, not a different overall
strategy. Recorded here so a real failure has a next step, matching
`011`'s own "if the test fails" pattern.
