# Contract: Protomaps flavor resolution

Governs `panels/basemap/registry.ts`, `panels/basemap/loadBasemapStyle.ts`, the new `panels/basemap/protomapsStyle.ts` and `panels/basemap/pmtilesProtocol.ts`. Enforces FR-002, FR-003, FR-008, FR-009, FR-010, FR-011, FR-012.

## New pure module: `panels/basemap/protomapsStyle.ts`

```ts
export const PROTOMAPS_FLAVOR_NAMES = [
  'protomaps-light', 'protomaps-dark', 'protomaps-white',
  'protomaps-grayscale', 'protomaps-black',
] as const

export const PROTOMAPS_ATTRIBUTION =
  '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © ' +
  '<a href="https://openstreetmap.org">OpenStreetMap</a>'

export function isProtomapsFlavorName(name: string): boolean

/** Pure — no MapLibre/browser API. flavorName MUST be one of
 * PROTOMAPS_FLAVOR_NAMES (caller's responsibility, matching every other
 * resolvePresetName() branch's own precondition style). */
export function buildProtomapsStyle(
  flavorName: (typeof PROTOMAPS_FLAVOR_NAMES)[number],
  pmtilesUrl: string,
): maplibregl.StyleSpecification
```

## New side-effecting module: `panels/basemap/pmtilesProtocol.ts`

```ts
import { Protocol } from 'pmtiles'
import maplibregl from 'maplibre-gl'

const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile)
// No exported function — importing this module IS the registration.
// ES module singleton caching makes this run exactly once regardless of
// import count (research.md R-2).
export {}
```

Imported once, at the top of `loadBasemapStyle.ts` — the one shared module every map-rendering surface (`FlowMapPanel.tsx`, `ZoneMapPanel.tsx`, `basemapTab.tsx`'s preview map) already funnels basemap resolution through, so no other file needs to import it directly.

## `resolvePresetName()` — new branch (in `loadBasemapStyle.ts`)

Existing dispatch order (unchanged): built-in preset (`kind: 'url'`) → built-in composition (`kind: 'composition'`) → raster-provider-name fallback. **New branch inserted before the raster-provider fallback**:

```ts
if (isProtomapsFlavorName(name)) {
  const source = resolveEffectivePmtilesSource() // R-4 precedence: viewer override ?? deployer default
  if (!source) return freshBlankStyle() // FR-010 — same fail-soft convention as every other unconfigured/unreachable case
  return buildProtomapsStyle(name, source)
}
```

## MUST

- All 5 flavor names MUST resolve against the exact same `resolveEffectivePmtilesSource()` call — never five independent lookups (FR-002).
- Switching the active preset from one Protomaps flavor to another MUST NOT re-open the underlying PMTiles archive — its header/root-directory (a fixed `bytes=0-16383` range read, confirmed against the real installed `pmtiles` package's own `getHeaderAndRoot()`) is cached by the `Protocol` instance itself (keyed by URL) across style changes referencing the same source (FR-012). **Confirmed during implementation**: the currently-visible TILE bytes are NOT covered by this guarantee — `map.setStyle()` recreates the vector source's own tile layer on every call (true for any basemap switch in this app, not Protomaps-specific), so in-view tiles are legitimately re-requested each time. Verified by asserting the header-range (`bytes=0-16383`) request count stays at exactly 1 across multiple flavor switches, not by asserting zero new requests of any kind.
- An unresolvable/unreachable configured source MUST fall back the same way any other unreachable basemap already does today (`freshBlankStyle()` + the panel's own data content still renders) — MUST NOT throw up to the panel (FR-011).
- The generated style's source `attribution` MUST be exactly `PROTOMAPS_ATTRIBUTION` (FR-009) — verified via MapLibre's own `AttributionControl`, already present on every map instance in this app, requiring no new wiring.

## MUST NOT

- MUST NOT add a `kind: 'protomaps'` member to `BUILT_IN_PRESETS` (research.md R-6) — the 5 names are resolved via the name-check branch above, not a static registry entry, since their real value depends on a runtime-configured source unknown at module load time.
- MUST NOT re-register the `pmtiles` protocol more than once, and MUST NOT register it lazily per-panel (`pmtilesProtocol.ts`'s own module-load side effect is the only registration site).

## Verification

```
grep -n "addProtocol" src/panels/basemap/pmtilesProtocol.ts   # exactly one call, at module scope
grep -rn "addProtocol" src/                                    # only the one file above
npx vitest run tests/unit/protomapsStyle.test.ts               # buildProtomapsStyle() pure-output assertions
```
