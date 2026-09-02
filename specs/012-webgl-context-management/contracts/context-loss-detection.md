# Contract: `webglcontextlost`/`webglcontextrestored` detection and honest status

Full-body code for `FlowMapPanel.tsx`'s new state, new listeners, and
new render branch — shown as a diff against the file's real, current
content. `contracts/interleaved-overlay-survival.md` covers the shared
`layerRepopulateGeneration` mechanism this contract's recovery handler
also triggers, and explains why a standalone helper function was
rejected (a real stale-closure bug, found and corrected during this
feature's own plan review) — not duplicated here.

## New state

```diff
   const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
   const [rows, setRows] = useState<Record<string, unknown>[]>([])
   const [mapReady, setMapReady] = useState(false)
+  // Independent of `status` — see data-model.md's "Map Panel Rendering
+  // State" section for why these are two separate pieces of state, not
+  // one merged enum. Only meaningfully becomes true once a real
+  // map/overlay exists to lose its context (i.e. after `status` has
+  // already reached 'ready' at least once) — never reset by the
+  // data-fetch effect, only by webglcontextrestored below or by this
+  // whole component unmounting.
+  const [contextLost, setContextLost] = useState(false)
```

(`layerRepopulateGeneration` is declared in
`contracts/interleaved-overlay-survival.md`, alongside this state — one
declaration, read by both this contract's handler and that contract's
`style.load` handler.)

## Mount-only effect — two new listeners, registered and torn down alongside the existing ones

```diff
     const overlay = new MapboxOverlay({ interleaved: true, layers: [] })
     map.addControl(overlay)
     mapRef.current = map
     overlayRef.current = overlay
     window.__flowmapTestMaps ??= {}
     window.__flowmapTestMaps[config.title] = map
     window.__flowmapTestOverlays ??= {}
     window.__flowmapTestOverlays[config.title] = overlay
+
+    // MapLibre's own Map class already listens for the standard
+    // canvas-level webglcontextlost/webglcontextrestored events,
+    // already calls event.preventDefault() (the one action required for
+    // the browser to ever consider restoring the context later — see
+    // research.md §3), already aborts any in-flight frame request so no
+    // crash/hang occurs, and already rebuilds its own internal
+    // painter/GL resources on restore — then re-fires both as its own
+    // real, public Map events. This is wiring up events the library
+    // already produces, not building new low-level instrumentation.
+    const onContextLost = () => setContextLost(true)
+    const onContextRestored = () => {
+      setContextLost(false)
+      // MapLibre has already rebuilt ITS OWN resources by the time this
+      // fires (research.md §3's _setupPainter()/_update() sequence runs
+      // before MapLibre re-fires its own event) — but deck.gl's own
+      // interleaved-mode GPU resources (buffers/programs) are a
+      // separate concern layered on top of the same now-restored
+      // context, not rebuilt by MapLibre's own recovery.
+      //
+      // Deliberately does NOT construct a FlowmapLayer or read
+      // status/rows/config directly in this closure — this whole effect
+      // is useEffect(..., []), so this closure is fixed at first mount
+      // forever; reading those values here would read permanently-stale
+      // ones (contracts/interleaved-overlay-survival.md's "Why not a
+      // standalone helper function" traces this exact bug and its fix).
+      // setProps({ layers: [] }) needs no external state — a constant
+      // empty array — so it stays safe to call directly here. The real
+      // reconstruction is deferred to the SAME layerRepopulateGeneration-
+      // triggered re-run of the existing data-update effect that
+      // contracts/interleaved-overlay-survival.md's style.load handler
+      // also triggers: one shared mechanism, two real triggers, always
+      // executed with a genuinely fresh closure over the panel's CURRENT
+      // state (FR-006's "re-apply the panel's correct effective basemap"
+      // is satisfied because MapLibre's own restored style IS the
+      // panel's already-resolved effective basemap; nothing about
+      // basemapKey/resolveEffectiveBasemap needs to re-run, since
+      // neither the panel's pin nor its tab default nor the current
+      // theme changed just because the context was lost).
+      overlayRef.current?.setProps({ layers: [] })
+      setLayerRepopulateGeneration((g) => g + 1)
+    }
+    map.on('webglcontextlost', onContextLost)
+    map.on('webglcontextrestored', onContextRestored)

     const observer = new ResizeObserver(() => {
       mapRef.current?.resize()
     })
     observer.observe(el)
```

```diff
     return () => {
       window.clearTimeout(readyTimer)
       observer.disconnect()
+      map.off('webglcontextlost', onContextLost)
+      map.off('webglcontextrestored', onContextRestored)
       delete window.__flowmapTestMaps?.[config.title]
       delete window.__flowmapTestOverlays?.[config.title]
       overlayRef.current = null
       mapRef.current = null
       map.remove()
     }
   }, [])
```

**Why `contextLost` isn't gated behind a check for "was this context
actually evicted for the context-budget reason, vs. some other cause
(driver crash, GPU reset, tab backgrounded on mobile)"**: the standard
`webglcontextlost` event carries no reliable, cross-browser-guaranteed
reason field distinguishing these causes (confirmed via the WebGL spec
research this feature's research.md §3/§6 already did — Chromium's own
forced-eviction path uses the same synthetic-loss mechanism a real
driver crash would trigger). FR-001/FR-002 don't require distinguishing
*why* the context was lost, only that it WAS lost, distinctly from
011's own blank-basemap fallback — this handler is deliberately
cause-agnostic, matching the Edge Cases section's own "on a device or
browser with a lower context ceiling... the same context-loss detection
and honest status reporting MUST apply uniformly" requirement (not just
uniform across devices — uniform across causes too, since a user can't
tell the difference from the outside either).

## Render output — one new overlay block, container never unmounts

```diff
   return (
     <>
       {status === 'loading' && (
         <div className="animate-pulse rounded-md bg-muted" style={{ height: config.height ?? 500 }} />
       )}
-      <div
-        ref={containerRef}
-        className="flowmap-chart"
-        style={{
-          width: '100%',
-          height: '100%',
-          display: status === 'ready' ? undefined : 'none',
-        }}
-      />
+      <div style={{ position: 'relative', height: '100%', width: '100%' }}>
+        {status === 'ready' && contextLost && (
+          <div
+            style={{ position: 'absolute', inset: 0, zIndex: 1 }}
+            className="flex items-center justify-center bg-background/80"
+          >
+            <PanelErrorState message="Map context lost — too many maps are open at once. It may recover automatically; try closing other panels or reloading if not." />
+          </div>
+        )}
+        <div
+          ref={containerRef}
+          className="flowmap-chart"
+          style={{
+            width: '100%',
+            height: '100%',
+            display: status === 'ready' ? undefined : 'none',
+          }}
+        />
+      </div>
     </>
   )
```

**Every branch of this render function is driven by `status` and
`contextLost` alone, both plain `useState` values read directly in the
same render pass that produces this JSX** — there is no derived,
separately-memoized "banner visible" value computed anywhere else and no
async step between a state change and this JSX re-evaluating. This is
what makes the sequence traced below hold without any additional
synchronization: whenever either `status` or `contextLost` changes,
React re-renders the whole component function in one synchronous call,
this whole `return` block is re-evaluated fresh against BOTH values'
current, already-updated states together, and React commits the
resulting DOM change as one atomic update — there is no intermediate
paint where only one of the two conditions has been applied.

**Traced sequence (contextLost stays true across a status round-trip
through 'loading')**: start at `status === 'ready'`, `contextLost ===
true` — banner renders, container `display: undefined` (visible, but
inert underneath the banner). A filter change re-triggers the data-fetch
effect (`useEffect(..., [config, filters, activeScenarioNames])`), whose
body calls `setStatus('loading')` **synchronously**, as the very first
statement in that effect, before the async `query(sql)` call. This
schedules a re-render. In that next render: `status === 'loading'`,
`contextLost` is **unchanged** (`true` — nothing in the data-fetch effect
touches it, per data-model.md's "never reset by the data-fetch effect").
Evaluating the JSX above with these values: the loading skeleton renders
(`status === 'loading'`); inside the wrapper, `status === 'ready' &&
contextLost` evaluates to `false && true = false` — banner does NOT
render; the container's `display` becomes `'none'` (`status !== 'ready'`)
— hidden, but still mounted (its own JSX line is unconditional inside
this always-present wrapper; only its `display` style changes, exactly
as it already did before this feature for the `'loading'` case). So at
this instant: skeleton visible, banner absent, container hidden — a
fully consistent, non-misleading state (nothing claims a lost-context
map is visible, because nothing map-related is visible at all right
now). When `query(sql)` resolves, the effect's `.then()` handler calls
`setStatus('ready')` — the ONLY state change in that call. The next
render evaluates the SAME JSX again: `status === 'loading'` is now
false (skeleton hidden); `status === 'ready' && contextLost` evaluates
to `true && true = true` (contextLost was never touched, so it's still
the same `true` value it was at the very start of this trace) — banner
renders again; the container's `display` becomes `undefined` (visible)
in that exact same render. Both the banner's reappearance and the
container's re-reveal are read from the SAME render's SAME two state
values, computed and committed together — there is no render in this
whole sequence where the container is visible (`display: undefined`)
while the banner is absent and `contextLost` is genuinely still `true`.
The only way to reach "container visible, no banner" is the one this
feature is specifically designed to produce: `contextLost` actually
becoming `false` (via a real `webglcontextrestored` event) — a
distinct, separate state change with its own separate render, not a
race condition within this one.

The `'empty'`/`'error'` early returns above this block (unchanged) still
skip rendering the container entirely — unaffected by this contract,
since a context can only be lost after a map has already been
successfully constructed, which only happens once `status` reaches
`'ready'` (data-model.md).

## New Playwright test — forcing a real context loss, not simulating one

`tests/integration/flowmapPanel.spec.ts`, a new `describe` block:

```ts
test.describe('012-webgl-context-management — WebGL context loss is reported honestly', () => {
  test('a lost context shows a distinct status, distinguishable from a blank basemap', async ({ page }) => {
    // 1. Boot the app, load a flowmap panel to 'ready' with its basemap
    //    visible (same setup as the interleaved-survival test).
    // 2. Force a REAL context loss via the standard WebGL testing
    //    extension, not a synthetic DOM event dispatch (a raw
    //    `canvas.dispatchEvent(new Event('webglcontextlost'))` would not
    //    exercise MapLibre's real internal state — e.g. it would not
    //    actually invalidate GL objects the way a genuine loss does).
    //    Reads getCanvas() — the SAME canvas MapLibre and deck.gl both
    //    now share under interleaved mode (contracts/interleaved-
    //    overlay-survival.md), NOT a separate deck.gl canvas (none
    //    exists to select):
    //    page.evaluate((title) => {
    //      const map = window.__flowmapTestMaps![title]
    //      const gl = map.getCanvas().getContext('webgl2')
    //      const ext = gl!.getExtension('WEBGL_lose_context')
    //      ext!.loseContext()
    //    }, FLOWMAP_TITLE)
    // 3. Assert the contextLost banner (a specific, stable test id/role,
    //    not just text matching) appears, AND that it is visually
    //    distinct from the existing "blank basemap" case (a separate
    //    assertion: load a second panel with an unreachable basemap
    //    per 011's own existing fixture, confirm ITS banner — none,
    //    since 011's fallback shows no banner at all, just a blank
    //    canvas — genuinely differs from this one, satisfying SC-002
    //    directly rather than by inspection alone).
    // 4. Assert the container <div> (containerRef) is STILL present in
    //    the DOM (element-handle identity check, same pattern 004's own
    //    relocation test already uses) — proving this feature's own
    //    render branch did NOT unmount it, per data-model.md's
    //    "container must stay mounted" requirement.
    // 5. Call ext.restoreContext() (same extension, standard API) and
    //    assert: the contextLost banner disappears, overlay.props.layers
    //    again has length 1 (the layerRepopulateGeneration-triggered
    //    data-update-effect re-run, contracts/interleaved-overlay-
    //    survival.md, actually ran), and the panel's basemap-key-
    //    resolved style (pinned or default, per whichever fixture panel
    //    is under test) is visibly present again via a getImageData()
    //    non-blank check on canvas.maplibregl-canvas (the shared
    //    canvas — no separate overlay canvas to check) — proving FR-006's
    //    "IF a panel recovers... re-apply that panel's correct effective
    //    basemap" holds for a real, extension-driven recovery.
  })
})
```

**Why `WEBGL_lose_context` and not a real 17th-panel-triggered eviction**:
both are valid, but the extension gives a deterministic, single-panel
test independent of exactly how many panels a CI run happens to be able
to mount — the SAME underlying browser mechanism (confirmed via
research.md §6's Chromium source read: `ForceLostContext` uses the
identical `kSyntheticLostContext` path a real ceiling eviction uses), so
this is not a weaker proxy, it's the same failure mode triggered
directly rather than via indirect over-provisioning. SC-001's own
"at least as many panels as the existing fixture" claim is proven
separately, by the interleaved-mode capacity math (research.md §5) plus
a real multi-panel Playwright run against a **production build**
(quickstart.md Scenario 2) — that test proves capacity; this one proves
honest reporting when capacity is exceeded regardless of cause.
