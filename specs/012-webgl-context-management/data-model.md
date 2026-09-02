# Data Model: WebGL Context Management for Multi-Map Dashboards

This feature adds no new YAML config entity, no new DuckDB view, and no
new persisted state — everything here is client-side rendering-lifecycle
state, scoped to `FlowMapPanel.tsx` (and, per spec.md's Key Entities,
intended to be replicated the same way by a future `ZoneMapPanel.tsx`,
not centralized into a new shared module this feature doesn't otherwise
need).

## Map Panel Rendering State (conceptual, spec.md Key Entity)

Not a single new TypeScript type — the existing `status` state
(`'loading' | 'ready' | 'empty' | 'error'`, data-fetch-scoped) and the
new `contextLost` boolean (WebGL-runtime-scoped) are two **orthogonal**
pieces of state, not one merged enum. They stay separate because they
answer different questions and can each change independently of the
other: `status` answers "did this panel's query return data?";
`contextLost` answers "is this panel's map currently able to render at
all, right now, regardless of whether it has data?" A panel can be
`status === 'ready'` with `contextLost === true` (had data, was
rendering fine, then its context was evicted) — collapsing these into
one enum would require inventing a `'context-lost-but-was-ready'` /
`'context-lost-but-was-empty'` cross-product that duplicates information
already available by keeping the two independent.

```ts
// New local state in FlowMapPanel.tsx, alongside the existing `status`:
const [contextLost, setContextLost] = useState(false)
```

**Precedence when rendering** (data-model, not just a UI detail — this
is what makes FR-002's "distinct from a working basemap AND from 011's
blank-basemap fallback" concrete):

| `status` | `contextLost` | What renders |
|---|---|---|
| `'loading'` | (irrelevant — context is never lost before the map is even constructed) | existing skeleton pulse |
| `'empty'` | (irrelevant — `PanelEmptyState` early-returns, no map ever mounts for this data outcome, unchanged from today) | existing `PanelEmptyState` |
| `'error'` | (irrelevant — `PanelErrorState` early-returns, unchanged from today; a query error, not a rendering-context error) | existing `PanelErrorState` |
| `'ready'` | `false` | the map canvas (interleaved overlay drawing into it), unchanged from today |
| `'ready'` | `true` | the map canvas's container stays mounted (never unmounted — see "Why the container must stay mounted" below) with a `PanelErrorState`-styled banner overlaid on top of it |

**Why `contextLost` can only meaningfully become `true` while `status`
is `'ready'`**: the `webglcontextlost` listener is attached inside the
mount-only effect, which only runs once real map/overlay construction
has happened — by the time a context CAN be lost, the panel's own data
fetch has necessarily already resolved to `'ready'` for the map/overlay
to have had anything to lose in the first place (an empty/error early
return never even renders the container `<div>` the map lives in).
`contextLost` is not reset to `false` by the data-fetch effect (it has
an independent lifecycle — see below), so if a later filter/scenario
change re-triggers the data-fetch effect while `contextLost` is still
`true`, `status` can cycle back through `'loading'` without
`contextLost` itself changing; the skeleton (status-driven) correctly
takes rendering precedence in that moment per the table above, and
`contextLost`'s own banner reappears once `status` returns to `'ready'`
if the context is still genuinely lost.

**Why the container must stay mounted while `contextLost` is `true`**
(the one genuinely new constraint this feature adds to the existing
render-branching pattern): MapLibre's own automatic restoration
(research.md §3 — `_setupPainter()`/`resize()`/`_update()`, run
internally by MapLibre itself on `webglcontextrestored`) rebuilds
resources against the **same canvas element**, not a newly-created one.
If `contextLost === true` caused an early return that omitted the
`<div ref={containerRef} />` (the same pattern `'empty'`/`'error'`
already use), React would unmount that div, MapLibre's own canvas would
be destroyed along with it, and a later `webglcontextrestored` event —
even if the browser did fire one — would have nothing to restore into.
This is why `contextLost`'s banner is rendered as an overlay alongside
the still-mounted container (see `panelCard.tsx`-relative layout below),
not as a fourth early-return branch matching `'empty'`/`'error'`'s
existing shape.

## Context Budget (conceptual, spec.md Key Entity — not app state)

Not a value this feature tracks, stores, or exposes anywhere in code —
explicitly a property of the running browser (Chromium's real,
source-confirmed `kMaxGLActiveContexts`, research.md §5/§6) combined
with this feature's own per-panel context cost (1, after §2's
interleaved-mode decision — down from 2 today). Documented here only so
the concept named in spec.md has one canonical explanation: "how many
panels can render at once" is never computed or asserted by this
feature's own code at runtime; it's an emergent property the empirical
Playwright test (research.md §2, quickstart.md Scenario 2) measures
directly against real browser behavior, not a number the app calculates
or displays to a user.

## Concrete shape changes

### `FlowMapPanel.tsx` — new local state and effect (extends the existing component; no new file)

```ts
const [contextLost, setContextLost] = useState(false)
```

Added inside the existing mount-only effect (`useEffect(..., [])`,
`FlowMapPanel.tsx` lines ~134-181 today), immediately after
`map.addControl(overlay)`:

```ts
const onContextLost = () => setContextLost(true)
const onContextRestored = () => setContextLost(false)
map.on('webglcontextlost', onContextLost)
map.on('webglcontextrestored', onContextRestored)
```

...and removed in that same effect's existing cleanup (alongside the
existing `observer.disconnect()` / `map.remove()` calls):

```ts
map.off('webglcontextlost', onContextLost)
map.off('webglcontextrestored', onContextRestored)
```

**`contextLost` is deliberately NOT itself a dependency of the basemap-
application effect** (`useEffect(..., [key, mapReady])`, lines ~198-303
today) — recovery does not re-run `setStyle()` (unnecessary — the
resolved `key`/`effectiveBasemap` haven't changed, and MapLibre has
already restored its own current style internally per research.md §3;
calling `setStyle()` again would be redundant work, not a no-op). FR-006's
re-apply-on-recovery behavior is instead satisfied by a NEW dependency on
the **existing data-update effect** — see
`contracts/interleaved-overlay-survival.md`'s "Data-update effect — one
dependency added" section: `onContextRestored` (and, independently, the
interleaved-mode `style.load` handler) each call `overlayRef.current
?.setProps({ layers: [] })` directly (safe — needs no external state)
then bump a new `layerRepopulateGeneration` state counter, which the
data-update effect's own dependency array now includes. This is a
correction from this document's first draft, which proposed a standalone
`reapplyCurrentLayer()` helper called directly from both long-lived
handlers — confirmed, by tracing the real effect lifecycles, to read
permanently-stale `status`/`rows`/`config` from at least one of those two
call sites (the mount-only effect's closure never refreshes after first
render). Routing through the existing data-update effect's own
dependency array instead guarantees a genuinely fresh closure every time,
using React's ordinary re-render-on-changed-dependency mechanism rather
than a hand-rolled one — see that contract's "Why not a standalone helper
function" section for the full trace.

### `MapboxOverlay` construction — one-line change

```diff
- const overlay = new MapboxOverlay({ interleaved: false, layers: [] })
+ const overlay = new MapboxOverlay({ interleaved: true, layers: [] })
```

### Basemap-application effect — extended, not restructured

The existing effect (`useEffect(..., [key, mapReady])`) gains the
`setProps({layers: []})` / re-populate sequence around its existing
`map.setStyle(...)` call — full before/after shown in
`contracts/flowmap-panel-basemap-integration.md` (updated) and
`contracts/interleaved-overlay-survival.md` (new).

### Render output — one new conditional block

```tsx
return (
  <>
    {status === 'loading' && (
      <div className="animate-pulse rounded-md bg-muted" style={{ height: config.height ?? 500 }} />
    )}
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {status === 'ready' && contextLost && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }} className="flex items-center justify-center bg-background/80">
          <PanelErrorState message="Map context lost — too many maps are open at once. It may recover automatically; try closing other panels or reloading if not." />
        </div>
      )}
      <div
        ref={containerRef}
        className="flowmap-chart"
        style={{ width: '100%', height: '100%', display: status === 'ready' ? undefined : 'none' }}
      />
    </div>
  </>
)
```

The `position: relative` wrapper is new; `PanelErrorState`'s own message
copy is feature-specific (distinct from its other two existing callers'
generic "Couldn't load this map" / query-error copy) — reusing the
component (FR-002's "visually and textually different... " is satisfied
by the copy itself and by this being an overlay atop a visible-but-inert
canvas, not the component's own generic error styling being mistaken for
011's blank-style fallback, which shows no banner of any kind).
