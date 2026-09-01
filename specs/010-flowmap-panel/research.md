# Phase 0 Research: FlowMapPanel

## §1. Dependency graph — confirmed sufficient with the four already-pinned packages, no further constitution amendment needed

Verified directly against each real package's published `package.json`
(`unpkg.com`), not assumed:

- **`@flowmap.gl/layers@9.3.0`** depends on `@flowmap.gl/data@^9.3.0`
  (a real, runtime-functional package — `d3-array`/`d3-geo`/`kdbush`/etc.
  as its own dependencies, not types-only) as a normal `dependencies`
  entry — npm installs it automatically; this app's own `package.json`
  never needs to name it explicitly, and this feature's own code never
  needs to `import` from it directly (`FlowmapLayerProps`' accessor
  types are consumed structurally — see §6 — not by name).
- **`@flowmap.gl/layers`**'s `peerDependencies` also name
  `@luma.gl/core`/`@luma.gl/engine`/`@luma.gl/shadertools` `^9.0.0` —
  not currently in the constitution's pinned list. Checked whether this
  is a real gap (like `@deck.gl/layers` was, constitution v2.3.0):
  **it isn't** — `@deck.gl/core@9.0.0`'s own real `dependencies` already
  include all three (`@luma.gl/core`/`@luma.gl/engine`/
  `@luma.gl/shadertools` `^9.0.6`, which satisfies flowmap.gl's `^9.0.0`
  peer requirement), so they resolve transitively via the
  already-pinned `@deck.gl/core`. No new explicit pin needed.
- **`@deck.gl/mapbox@9.0.0`**'s real exports confirm `MapboxOverlay` +
  `MapboxOverlayProps` exist exactly as `docs/SPEC.md`'s wiring snippet
  uses them; its own `peerDependencies` (`@deck.gl/core`, `@luma.gl/core`
  `^9.0.0`) are likewise already satisfied. No `maplibre-gl` peer
  dependency is declared on `@deck.gl/mapbox` itself — it's generically
  compatible with any Mapbox-GL-API-compatible map instance, confirmed
  by both real reference repos' own production use with MapLibre
  specifically.

**Decision**: `package.json` gains exactly the four dependencies the
constitution already pins — `maplibre-gl ^4.7.1`, `@deck.gl/core`/
`@deck.gl/layers`/`@deck.gl/mapbox ^9.0.0`, `@flowmap.gl/layers ^9.3.0`
— nothing more. `@types/*` check: none of these ship types-only
companion packages the way `d3-sankey`/`d3-scale-chromatic` needed
(`008-sankey-panel`'s own precedent) — every package here ships its own
`.d.ts` (`"types"` field confirmed present in each real `package.json`
fetched above).

## §2. Container resize handling

**Decision**: an explicit `ResizeObserver` on the map's container,
calling `map.resize()`, matching the real, production
`APP-Commute-Explorer` reference implementation's own `MapView.jsx`
exactly (`const ro = new ResizeObserver(() => { if (mapRef.current)
mapRef.current.resize() }); ro.observe(containerRef.current)`) — not
relying solely on MapLibre's native `ResizeObserver`-based auto-resize
(added in MapLibre GL JS 3.0+, confirmed present in this project's
pinned `^4.7.1`). The real reference app still adds its own explicit
handling despite the native behavior being available in its own pinned
version too — following that proven precedent rather than assuming the
native behavior alone is sufficient for this app's own specific
container-relocation mechanism (004's `appendChild`-based move — see
§3), which is a different trigger than the CSS-driven resize the native
feature was primarily built for.

The deck.gl `MapboxOverlay` itself needs no separate resize call — it's
registered as a MapLibre control (`map.addControl(overlay)`) and
follows the host map's own canvas dimensions automatically on the next
render after `map.resize()` runs; no evidence found (in either real
reference app or `@deck.gl/mapbox`'s own source) of a separate resize
step for the overlay.

## §3. Surviving 004's DOM relocation — resolved by mandated empirical verification, not research alone

Per spec.md's own Edge Cases/Assumptions (added specifically at the
user's instruction to apply the same rigor already used for §2):

- `panelExpandHost.tsx` never hands MapLibre a new container — it
  `appendChild`-moves a persistent *ancestor* node
  (`portalHostRef.current`) between an inline anchor and a dialog
  anchor, carrying the map's own unchanged container div (and
  everything inside it — canvas, WebGL context) along as one native DOM
  subtree move, entirely outside React's reconciliation.
- This is materially different from "point an existing map at a
  different container" — a real Mapbox GL JS GitHub issue (`#6165`,
  "Change the map container") confirms that's unsupported (a
  `setContainer()`-style API was requested, never built) — but that's
  not the operation 004 performs.
- General WebGL/browser platform behavior treats a same-document canvas
  reparent as safe (context loss is normally tied to explicit
  `loseContext()` calls, GPU/driver resets, memory pressure, or a
  cross-document move — not a same-document `appendChild`), and no
  MapLibre-specific documentation or source was found either confirming
  or prohibiting this exact scenario.

**Decision**: proceed with the expectation that it survives cleanly
(grounded in the general-platform reasoning above), but this MUST be
confirmed by a real Playwright test performing the actual 004
relocation against a live map and asserting it still renders/responds
correctly afterward — not asserted from this research alone. Concretely
(quickstart.md's own scenario): expand a flowmap panel via its 004
trigger, then assert (a) the map's canvas element is the same DOM node
before and after (proves no remount), (b) `map.getCanvas().width`/
`height` reflect the dialog's larger size (proves resize handling
composes correctly with the relocation), and (c) the map remains
interactive (e.g., a programmatic `map.panTo()` or a real pointer
interaction still produces a `moveend` event) — the same category of
"prove it via actual measurement" `004-panel-expand-dialog`'s own
research required for its container-swap finding, not repeated as a
lesson without applying it here too.

## §4. Rows-to-flowmap pure module

**Decision**: `panels/flowmapData.ts` — pure, DOM-free, mirroring
`008-sankey-panel`'s `sankeyGraph.ts` precedent exactly (a genuinely new
data-transform problem each time: sankey's node/link graph, this
feature's location/flow lists). Deduplicates locations by id (first-seen
coordinates win — spec.md's own Edge Cases), sums `value` across rows
sharing an (origin, destination) pair, and excludes rows missing a
required coordinate or contributing a non-positive value — before any
`FlowmapLayer` prop is ever touched. The link-aggregation map is keyed
on a composite string (`originId + '|' + destId`) for lookup only,
storing the real `{origin, dest, value}` object as the map's value,
**never reconstructed from the key** — applying `008-sankey-panel`'s own
real, user-found bug (a link-key round-trip via `.split()`) as a
precedent to avoid, not relearn.

## §5. Non-positive-value/missing-coordinate exclusion visibility

**Decision**: `console.warn` with the excluded count, scoped to this
panel's own title/metric — identical precedent and reasoning to
`008-sankey-panel`'s own non-positive-value exclusion (`research.md`
§5 there): a calibration output producing a missing coordinate or a
zero/negative flow count is itself an anomaly worth surfacing, not
routine data shape an analyst should have to discover by noticing a
line is missing from the map.

## §6. `FlowmapLayer` prop mapping

Confirmed directly against the real, published `FlowmapLayerProps` type
(`unpkg.com/@flowmap.gl/layers@9.3.0/dist/FlowmapLayer.d.ts`), not
assumed from `docs/SPEC.md`'s illustrative snippet alone (whose
`getLocationLat`/`getFlowOriginId`/etc. accessor names are correct, but
which doesn't show the boolean/numeric option props at all):

| `docs/GRAMMAR.md` key | Real `FlowmapLayerProps` field |
|---|---|
| `clustering` | `clusteringEnabled: boolean` |
| `clustering_auto` | `clusteringAuto: boolean` |
| `animation` | `animationEnabled: boolean` |
| `max_flows` | `maxTopFlowsDisplayNum: number` |

`clusteringLevel` (a real prop) has no documented grammar key — left
unset (`undefined`) when `clusteringAuto` is true, matching the
documented example's own `clustering_auto: true` always accompanying
`clustering: true`, letting the library auto-determine the level rather
than this feature inventing an author-facing key the grammar doesn't
have.

## §7. Color

`FlowmapLayerProps` does have a real `colorScheme?: string | string[]`
prop — but `docs/GRAMMAR.md`'s `type: flowmap` grammar has no
corresponding author-facing key (Grammar findings #5, spec.md). Decision
unchanged from the spec's own Assumption: this prop is left unset,
letting flowmap.gl's own internal default apply — the same honestly-
documented precedent `008-sankey-panel`'s own research established
(neither `PlotlyPanel` nor `ObservablePlotPanel` sets an explicit
categorical palette either; sankey's own token-derived fallback was the
grammar-driven exception, not the rule). Inventing a new `color_scheme`-
style key for flowmap without it being documented grammar would be
scope creep this feature doesn't need.

## §8. `maplibre-gl`'s own CSS

**Decision**: `import 'maplibre-gl/dist/maplibre-gl.css'` at the top of
`FlowMapPanel.tsx` itself — required for MapLibre's controls/canvas to
render correctly at all (a real, load-bearing requirement, not
optional). No existing precedent in this codebase for importing a
third-party library's own CSS from within a panel component (every
prior panel type draws its own DOM/SVG, needing no external stylesheet)
— confirmed against the real reference app's own pattern instead:
`APP-Commute-Explorer`'s `MapView.jsx` imports this CSS colocated with
the map component itself, not at the app's entry point — followed here
for the same reason (the styles are meaningless anywhere a map isn't
rendered).

## §9. Base map style — no external CDN, real basemap tiles deferred

**Decision**: the map is constructed with a minimal, self-contained
MapLibre style object (`version: 8`, no `sources`, a single solid-color
`background` layer) — zero external network requests. Found and
corrected while writing this feature's own contract: an initial draft
used a hardcoded public demo tile-server URL
(`demotiles.maplibre.org/style.json`) as a stand-in default, which would
have violated constitution Principle II's no-CDN discipline (established
for DuckDB-WASM specifically — "self-hosted bundle... never a CDN" — but
the same `wftdm-dashboard here`-must-not-require-internet reasoning
applies to any external dependency this app adds, not just that one).

**Found during implementation, confirmed by an actual `page.on('request')`
capture, not assumed**: DuckDB-WASM itself lazy-loads its own parquet
extension from `extensions.duckdb.org` on any panel that queries
Parquet — a real, pre-existing external request this app already makes
on *every* panel type's own page load, not something `FlowMapPanel`
introduces or could avoid. This feature's own no-CDN claim above is
specifically about the map's base style/tiles, not a (never-true)
blanket "zero external requests anywhere on the page" guarantee — the
integration test verifying this (quickstart.md scenario 7's automated
form) is scoped to map/tile-host request patterns specifically, not

**Follow-up investigation (post-implementation, at the user's own
request)**: confirmed via git history that this has been true since
`001-data-state-layer`'s first `read_parquet()` call (commit `0a2cd55`,
`2026-08-30`) — this feature only *noticed* it, via the first test in
this codebase to actually check external requests at all, not
introduced it. Confirmed against DuckDB's own real docs that a genuine
fix exists (`SET custom_extension_repository` redirecting to a
same-origin, locally bundled mirror of the extension `.wasm` file,
mirroring `services/duckdb.ts`'s existing self-hosting of the DuckDB-WASM
engine binaries themselves) but is not implemented — out of scope for
this feature to build. `docs/ARCHITECTURE.md`'s own "no internet
required" claim for `wftdm-dashboard here` was overstated by exactly
this gap and has been corrected with the same finding, not left silently
inconsistent with what this research file already knew.
every external request the page happens to make.

**Real basemap tiles are explicitly out of this feature's scope, not
silently assumed away**: `docs/GRAMMAR.md`'s `type: flowmap` grammar has
no `style:`/`basemap:` key at all — there is no author-facing way to
configure a real tile source today. Both real reference apps use their
own external tile providers (CARTO GL vector tiles, AGRC hillshade) with
their own hosting/API-key arrangements this project hasn't made an
equivalent decision about yet. Settling that (a self-hosted style/tile
approach, or a documented grammar addition naming an acceptable source)
is future work — this feature ships with flow lines rendered over a
plain background, which fully satisfies its own stated purpose (O-D
desire-line visualization) without requiring that decision to be made
first.

## §10. `MapboxOverlay` non-interleaved mode

Confirmed via `docs/SPEC.md`'s own wiring snippet
(`new MapboxOverlay({ interleaved: false, layers: [] })`) — non-
interleaved mode renders deck.gl layers in their own canvas, composited
above the MapLibre canvas, rather than interleaved into MapLibre's own
WebGL draw calls. Simpler and sufficient for this panel type (no need
for deck.gl layers to render *underneath* MapLibre's own vector labels/
features, which interleaved mode exists for) — matches both real
reference apps' own usage.

## §11. Effect-ordering fix — `mapReady` state, found during contract review

The map-creation effect (`[]`, mount-only) and the data-update effect
(originally `[config, rows, status]`) were independent, with the latter
checking `overlayRef.current` — a bare ref read with no mechanism to
re-trigger the effect once that ref becomes non-null after an early
return, since a ref mutation alone never causes a React re-render. Fixed
by adding `mapReady` (React state, set `true` at the end of the
map-creation effect) to the data-update effect's own dependency array —
option (a) from the two offered, chosen because it's the smaller, more
localized change and keeps each effect's own single responsibility
intact, rather than merging both effects' concerns together.

**Honest reachability analysis, not overstated**: reasoning through the
original code, the specific failure mode described (the overlay
permanently stuck unavailable) is not actually reachable under the
contract *as originally written* — `new maplibregl.Map(...)`/
`new MapboxOverlay(...)` are synchronous constructors (the ref
assignments happen synchronously, regardless of the map's own internal
async initialization after that point), the DuckDB-WASM `query()` call
is always asynchronous (Promise-based, resolves via the microtask queue
strictly after the current synchronous call stack — which includes every
effect from the initial mount — has already run), and React runs a
component's own effects in declaration order within one commit. Given
the map-creation effect was declared before the data-update effect, the
ref was therefore always populated before `status` could first become
`'ready'`, in every version of React's documented effect-ordering
behavior (including under StrictMode's development-only double-invoke,
which completes synchronously too). The fix is still correct and worth
making regardless: it converts an implicit, undeclared dependency
between two effects into an explicit, React-reactive one, protects
against a reasonable future refactor breaking that implicit invariant
(e.g., anything making map setup itself asynchronous), and — concretely
useful right now — makes the ordering *testable*: `mapReady` is a real
state transition a test can force independently of the data fetch via
`window.__flowmapTestMapReadyDelayMs`, rather than a timing coincidence
a test could only ever observe, never control.

**Test-observability additions** (contracts/flowmap-panel.md): a
`window.__flowmapTestMapReadyDelayMs` hook (same category as
`services/duckdb.ts`'s own `__debugQueryLog()` — test-only, additive,
zero production behavior change when unset) lets a Playwright test
deterministically delay `mapReady` well past when the query resolves,
forcing the exact adversarial ordering rather than hoping real-world
timing happens to cooperate. `data-render-count`/`data-flow-count`/
`data-location-count` attributes (mirroring `007`/`008`'s own
`data-render-count` precedent) give that test something concrete to
assert against — deck.gl renders to its own canvas, not individually
inspectable DOM nodes the way `SankeyPanel`'s SVG elements are, so
without this instrumentation there would be no way to distinguish "stuck,
never updated" from "successfully updated" at all.
