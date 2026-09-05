# Phase 1 Data Model: Auto-fit map view to data extent, plus a reset-to-view button

No Parquet/DuckDB schema, no `dashboard-*.yaml` grammar change, no new
persisted entity — this feature is purely in-memory panel state and a pure
geometry-math module. Documented here per the template's own "state
transitions if applicable" guidance, since the ref-based state machine is
the actual design.

## `BoundsTuple`

```ts
// src/panels/mapBounds.ts
export type BoundsTuple = [west: number, south: number, east: number, north: number]
```

A plain, `LngLatBoundsLike`-compatible number tuple (research.md §1) — the
sole output of both bounds-computation functions, and the sole input
`fitBounds()` needs. Never wraps a real `maplibregl.LngLatBounds` instance
(research.md §5).

## `EffectiveView` (exported from `resetViewControl.ts` — shared by both panel types)

```ts
export type EffectiveView = { center: [number, number]; zoom: number }
```

A single concrete shape, not a discriminated union — research.md §7a
records the real, empirically-confirmed finding that led here: an earlier
design stored `{ source: 'auto-fit', bounds: BoundsTuple }` for the
auto-fit case and re-ran `fitBounds()` against that tuple on every reset
click, but this project's own Playwright coverage caught `map.
cameraForBounds()`'s predicted destination measurably disagreeing with
where `map.fitBounds()` itself actually animated to for the identical
bounds/options, called back-to-back from the same untouched transform.
Storing the REAL, already-landed `{center, zoom}` — read via a one-time
`map.once('moveend', ...)` listener once the initial fit genuinely
finishes, rather than a value predicted ahead of time — removes the
disagreement at its root and lets both the author-config and auto-fit
branches share one shape and one `onReset` code path (`map.easeTo({
center, zoom, pitch: 0, bearing: 0 })`).

- **author-config source**: captured synchronously in the panel's
  mount-only effect, directly from `config.center`/`config.zoom`, whenever
  either is present (spec.md FR-003 — set as a unit). Never recomputed
  afterward.
- **auto-fit source**: captured once, via the `moveend` listener above,
  the first time `fitBounds()`'s animation actually completes (spec.md
  FR-006 — at most once per mount). Never recomputed afterward, even if
  the panel's underlying data/geometry later changes.
- **Neither yet present** (`appliedViewRef.current === null`): the panel
  has no author config AND auto-fit's initial animation hasn't finished
  yet (still loading/empty/error, or still mid-transition) — the reset
  control stays disabled during this window (spec.md FR-009).

Exactly one write per panel instance, at most once — there is no third
"which one wins" resolution step at runtime; whichever branch runs first
(mount-time synchronous check for the author-config source, or the
data-ready effect's auto-fit `moveend` listener) is unconditionally final
for that mount, matching spec.md FR-003's "either one disables auto-fit
entirely" rule (the author-config branch, when it applies, makes the
auto-fit branch's own guard condition — no `center`/`zoom` configured —
false from the very first render, so the two are mutually exclusive by
construction, not by an extra check).

## State per panel instance (new refs — additive to each file's existing ref set)

| Ref | Type | Written | Read |
|---|---|---|---|
| `hasAutoFittedRef` | `boolean` (init `false`) | Set `true` immediately before the one `fitBounds()` call | Guards that call — research.md §6 |
| `appliedViewRef` | `EffectiveView \| null` (init `null`) | Once, per the table above (auto-fit source written from the `moveend` listener, not synchronously) | `ResetViewControl`'s click callback, at click time — research.md §7/§7a |

Both are plain `useRef`, not React state — neither drives a render;
`ResetViewControl`'s own enabled/disabled visual state is pushed
imperatively via `.setEnabled(true)` the moment `appliedViewRef` is first
populated (mount-effect's synchronous author-config branch, or the
data-ready effect's auto-fit branch), not read reactively.

## Inputs to the two bounds functions (already-existing types, unmodified)

- `FlowLocation` (`flowmapData.ts`, existing): `{ id: string; lat: number; lon: number }` — `computeFlowBounds()` consumes the array `buildFlowmapData()` already produces.
- `ZoneFeature` (`zoneGeometry.ts`, existing): `{ zoneId: string; geometry: GeoJSON.Geometry }` — `computeGeometryBounds()` consumes `ZoneGeometry.features` directly.

No field on either existing type changes.
