# Contract: Map auto-fit-to-data-extent + reset-to-view control

Mirrors `013-zonemap-panel`'s own `contracts/zonemap-panel.md` structure —
one section per new/modified file, signatures and behavioral guarantees
only, no full implementation bodies.

## `src/panels/mapBounds.ts` (NEW — pure, DOM-free)

```ts
export type BoundsTuple = [west: number, south: number, east: number, north: number]

/**
 * Computes the bounding box covering every flow location — reduces the
 * array `buildFlowmapData()` already produces (deduplicated origin AND
 * destination points, one entry per unique id). Returns `null` for an
 * empty array (spec.md FR-004 — caller must not attempt fitBounds against
 * no data).
 */
export function computeFlowBounds(locations: FlowLocation[]): BoundsTuple | null

/**
 * Computes the bounding box covering every zone feature's polygon
 * geometry, via a generic recursive coordinate-array flattener — works
 * uniformly across Polygon/MultiPolygon/any other GeoJSON geometry type
 * without a type-specific switch (research.md §5). Independent of which
 * zones have matching metric data (spec.md FR-002). Returns `null` for an
 * empty array.
 */
export function computeGeometryBounds(features: ZoneFeature[]): BoundsTuple | null
```

Both functions are pure reducers with no MapLibre/DOM dependency — a
`BoundsTuple` is already a valid `LngLatBoundsLike` (research.md §1), so the
caller passes it directly to `map.fitBounds()` with no conversion step.

## `src/panels/resetViewControl.ts` (NEW — thin `IControl`, shared by both panel types)

```ts
// A single concrete shape, not a discriminated union with a raw
// BoundsTuple for the auto-fit case — research.md §7a: an earlier design
// stored the bounds and re-ran fitBounds() on every reset click, but a
// real, empirically-confirmed MapLibre finding (map.cameraForBounds()'s
// predicted destination measurably disagreeing with where
// map.fitBounds() itself actually animates to, for the identical
// bounds/options, called back-to-back from the same untouched transform)
// ruled that out. Both sources resolve to this one shape instead.
export type EffectiveView = { center: [number, number]; zoom: number }

export class ResetViewControl implements IControl {
  constructor(onReset: () => void)
  onAdd(map: MapLibreMap): HTMLElement
  onRemove(): void
  /** Toggles the button's own disabled attribute — called by the owning
   * panel the moment its appliedViewRef is first populated (spec.md
   * FR-009). Starts disabled. */
  setEnabled(enabled: boolean): void
}
```

Mirrors `zonemap3dControl.ts`'s `ThreeDToggleControl` shape exactly (a thin,
presentation-only class with no application state of its own — the owning
panel's `appliedViewRef`/`mapRef` are read by `onReset`'s closure at click
time, not captured by this class). The icon is the real, verbatim
`stroke="currentColor"` home SVG confirmed in `WFRCAnalytics/
APP-WFRC-Commute-Patterns`'s own shipped `src/map.js` (research.md §2) — no
dark-mode-specific CSS override needed as a result (unlike
`NavigationControl`'s own hardcoded-color icons). A NEW shared module, not
zonemap-only like `zonemap3dControl.ts` — both `FlowMapPanel.tsx` and
`ZoneMapPanel.tsx` construct one, in their respective mount-only effects,
added via `map.addControl()` into the same `'top-right'` cluster
`NavigationControl` already occupies.

## `src/panels/mapControls.css` (MODIFIED — additive)

New rules for `.wftdm-reset-view-button`, following the exact token-driven
convention already established for `.wftdm-3d-toggle-button` (`var(--card)`/
`var(--border)`/`var(--muted)`/`var(--foreground)`, 29×29px button box) —
minus that button's `aria-pressed`-keyed active-state rules (a reset button
has no persistent pressed state, only a transient `:hover`/`:disabled`), and
plus a `:disabled` rule (reduced opacity, `cursor: not-allowed`) for the
FR-009 not-yet-established-view window.

## `src/panels/FlowMapPanel.tsx` (MODIFIED)

- New refs: `hasAutoFittedRef = useRef(false)`, `appliedViewRef =
  useRef<EffectiveView | null>(null)`, `resetControlRef =
  useRef<ResetViewControl | null>(null)`.
- Mount-only effect (the one building `maplibregl.Map`, unmodified
  otherwise): if `config.center` or `config.zoom` is set, populate
  `appliedViewRef.current = { center: config.center ?? DEFAULT_CENTER,
  zoom: config.zoom ?? DEFAULT_ZOOM }` synchronously and call
  `resetControl.setEnabled(true)` immediately after construction.
  Construct `new ResetViewControl(onReset)` and `map.addControl
  (resetControl)` alongside the existing `NavigationControl`. `onReset`
  reads `appliedViewRef.current`/`mapRef.current` at call time and always
  performs the SAME single call regardless of source — `map.easeTo({
  center, zoom, pitch: 0, bearing: 0, duration: 500 })` (no branch; this
  panel has no 3D tilt of its own today, so the pitch/bearing reset is a
  cheap no-op in practice, kept for symmetry with `ZoneMapPanel.tsx` and
  for forward-compatibility).
- Data-update effect (unmodified guards, one addition at the end): if
  `!hasAutoFittedRef.current` AND `appliedViewRef.current === null` (i.e.
  no author config was set) AND `computeFlowBounds(data.locations)` returns
  non-`null`, set `hasAutoFittedRef.current = true` and call
  `map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 800 })`
  (research.md §2's real, confirmed reference values). Immediately after
  that call, attach `map.once('moveend', () => { ... })` — NOT a
  synchronous read — which reads the map's own REAL post-animation
  `getCenter()`/`getZoom()` once the fit genuinely finishes, sets
  `appliedViewRef.current` to that value, and calls `resetControlRef.
  current?.setEnabled(true)` (research.md §7a — a real, confirmed
  correction from an earlier design that predicted this value via
  `map.cameraForBounds()` ahead of time instead, found to disagree
  measurably with where the animation actually lands).

## `src/panels/ZoneMapPanel.tsx` (MODIFIED)

Same shape as `FlowMapPanel.tsx` above, with two differences:
- The auto-fit check reads `zoneGeometry.features` via
  `computeGeometryBounds()`, inside the existing data-update effect (the
  one already gated on `status === 'ready' && geometryStatus === 'ready' &&
  mapReady && zoneGeometry`) — independent of `rows`/metric data, matching
  spec.md FR-002. Same `moveend`-capture shape as `FlowMapPanel.tsx` above.
- `onReset` also resets the existing 3D toggle FIRST
  (`is3dRef.current = false`, `threeDToggle.setActive(false)`, the layer
  visibility flip already in `toggle3d()`) before the single
  `easeTo({center, zoom, pitch: 0, bearing: 0})` call — a viewer who
  tilted into 3D and then hits reset gets back to the panel's genuine
  starting (flat) state, not a tilted view of the correct bounds.
  `ResetViewControl` is added alongside the existing
  `NavigationControl`/`ThreeDToggleControl` cluster, after `ThreeDToggleControl`.

## `package.json` (UNCHANGED)

No new dependency — `maplibre-gl` (`010`) already provides everything this
feature needs (`fitBounds`/`IControl`/`easeTo`).
