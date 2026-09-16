# Phase 0 Research: Hierarchical Chart Panels (Zoomable Treemap & Sunburst)

All findings below are confirmed directly against this codebase's own
installed dependencies, real live-queried demo data, and the real, current
Observable/D3 reference sources (fetched live this session, not recalled
from memory) — matching this project's own "confirmed, not assumed"
discipline.

## §1. Observable Plot has no treemap/sunburst composition path — confirmed

**Decision**: Build both new chart types on a custom D3 renderer. No
Observable Plot composition path is used or partially reused.

**Rationale**: A full-text search of the installed `@observablehq/plot`
package's own source (`node_modules/@observablehq/plot/src/`) for
"treemap"/"partition"/"pack" returns zero matches, and its own
`package.json` lists no `d3-hierarchy` dependency at all. Its one real
hierarchical capability, the `Plot.tree`/`Plot.cluster` compound marks
(`marks/tree.js`, `transforms/tree.js`), is built on `d3.tree`/`d3.cluster`
— a node-link "tidy tree" layout (dots + links + text) — which is a
different algorithm family from `d3.treemap` (area subdivision) and
`d3.partition` (radial/angular subdivision) entirely. There is no
documented or discoverable way to feed a `d3.treemap`/`d3.partition`
layout's own `x0/y0/x1/y1` output into any Plot mark and get a correct
treemap or sunburst rendering — Plot's marks assume Cartesian/linear scale
semantics, not the specific area- or angle-proportional geometry these two
diagrams need.

**Alternatives considered**: Composing `Plot.rect`/`Plot.cell` marks
directly against `d3.treemap`'s own `x0/y0/x1/y1` output was considered —
rejected because Plot's own scale/faceting system has no mechanism for
zoom-driven rescaling of a subset of already-laid-out rectangles (the core
interaction FR-005 requires), and because a sunburst's radial geometry has
no Plot mark equivalent at all (Plot has no polar/radial coordinate system
of any kind). This matches `057-observable-plot-conversion`'s own,
separately-confirmed finding for Sankey diagrams — a real, now-recurring
category of gap for diagram types outside Plot's Cartesian-chart design
center.

## §2. Real hierarchical data audit — a genuine dataset exists, no new pipeline work needed

**Decision**: `purpose_mode_flow` (already published for every real demo
scenario) is this feature's first real content — a genuine two-level
hierarchy, `primary_purpose` → `major_trip_mode`, sized by real `trips`
counts.

**Rationale**: Confirmed live via the `duckdb` CLI against
`public/demo-scenarios/activitysim-baseline/summary/purpose_mode_flow.parquet`:
10 distinct `primary_purpose` values, each splitting into up to 5 distinct
`major_trip_mode` values, 50 total rows, real non-degenerate `trips` counts
ranging from 3 to 5,878. This metric already exists, is already published
for every real demo scenario, and is already consumed by the real "Trip
Purpose to Mode Flow" `sankey` panel — zero new `summarize.yaml` metric is
needed to demonstrate both new chart types against genuinely real data.

**Alternatives considered**:
- **Geographic hierarchy** (`land_use_summary`'s `SD` → `DISTRICT` →
  `zone_id`) — investigated and rejected. A live `GROUP BY SD, DISTRICT`
  query against every real zone in the real demo scenarios returns exactly
  one row: `SD=1, DISTRICT=1, n_zones=25` — the synthetic `prototype_mtc`
  25-zone test system has no real district/superdistrict subdivision at
  all. A treemap/sunburst rooted on this data would show one meaningless
  top-level branch.
- **A deeper, real 3-level hierarchy** (`tour_category` →
  `primary_purpose` → `major_trip_mode`) — confirmed possible in principle
  (`tour_category` is a real column, already used as a `WHERE`-clause
  filter by several existing metrics) but not available without new
  data-pipeline work — no existing metric currently `SELECT`s/`GROUP BY`s
  it alongside purpose and mode together. Left as a real, available future
  extension (a new `summarize.yaml` metric), not built by this feature —
  the confirmed 2-level `purpose_mode_flow` hierarchy is sufficient to
  prove both chart types' own real mechanics.

## §3. The real, current canonical D3 zoomable-treemap/zoomable-sunburst techniques

Fetched directly from the real, current Observable D3 gallery notebooks
(`@d3/zoomable-treemap`, `@d3/zoomable-sunburst`) via their compiled
JavaScript export — the actual real source, not a paraphrase, and not the
much older (pre-`d3.hierarchy`) versions that circulate in older gists/
blog posts.

### §3a. Zoomable treemap — the real technique

```js
// Layout: identical to a plain (non-zoomable) treemap.
const hierarchy = d3.hierarchy(data).sum(d => d.value).sort((a, b) => b.value - a.value)
const root = d3.treemap().tile(tile)(hierarchy)

// A custom tile() function: lay out at FULL canvas size every time
// (treemapBinary), then rescale the result into whatever [x0,y0,x1,y1]
// box this call was actually asked to fill. This is what lets "zoom in"
// reuse the exact same layout algorithm at every level, rather than
// re-computing a differently-shaped layout per zoom depth.
function tile(node, x0, y0, x1, y1) {
  d3.treemapBinary(node, 0, 0, width, height)
  for (const child of node.children) {
    child.x0 = x0 + child.x0 / width * (x1 - x0)
    // ...same for x1/y0/y1
  }
}

// Zoom state lives in two d3.scaleLinear() scales (x, y), NOT in the
// layout itself. Clicking a node sets the scales' DOMAIN to that node's
// own x0/x1 (and y0/y1) — the layout's absolute coordinates never change;
// only how they map onto the visible canvas does.
function zoomin(d) {
  x.domain([d.x0, d.x1])
  y.domain([d.y0, d.y1])
  // ...old DOM group fades out and is removed; a NEW DOM group is
  // rendered for d's own children and fades in, positioned via the
  // just-updated x/y scales.
}
```

The zoom-out affordance is a persistent thin "title bar" rendered for the
current root itself — clicking it calls the mirror-image `zoomout(d)`,
resetting the scale domains to `d.parent`'s own box.

### §3b. Zoomable sunburst — the real technique (a genuinely different mechanism)

```js
// Layout: d3.partition(), sized to [2π, hierarchy.height + 1] — x is
// ANGLE (radians, full circle), y is RADIAL DEPTH (integer ring index).
const root = d3.partition().size([2 * Math.PI, hierarchy.height + 1])(hierarchy)
root.each(d => d.current = d) // each node's OWN rendered-state copy

// d3.arc() maps the partition's x0/x1 (angle) and y0/y1 (depth) into a
// real radial arc, scaled by a fixed pixel radius-per-ring:
const arc = d3.arc()
  .startAngle(d => d.x0).endAngle(d => d.x1)
  .innerRadius(d => d.y0 * radius).outerRadius(d => d.y1 * radius)

// Click handler: recompute a TARGET x0/x1/y0/y1 for every node in the
// WHOLE tree (not just the clicked subtree) by renormalizing relative to
// the clicked node's own current range — this is what makes the clicked
// node's subtree expand to fill the whole circle. Then tween `d.current`
// from its old value to that target via d3.interpolate, redrawing the
// arc generator against the interpolated value on every animation frame.
function clicked(event, p) {
  root.each(d => d.target = {
    x0: clamp01((d.x0 - p.x0) / (p.x1 - p.x0)) * 2 * Math.PI,
    // ...x1 the same way; y0/y1 shifted by p.depth
  })
  path.transition(t).tween('data', d => {
    const i = d3.interpolate(d.current, d.target)
    return t => d.current = i(t)
  }).attrTween('d', d => () => arc(d.current))
}
```

A transparent center circle (radius = the innermost ring) is the zoom-out
click target, always bound to `p.parent ?? root`. Two small predicate
helpers (`arcVisible`, `labelVisible`) decide per-node whether an arc/label
should render at all, based on its depth-relative `y0/y1` and its angular
extent — directly reusable for this spec's own FR-009 (a
negligibly-small node's label must not render/overflow).

**Decision**: Reuse both techniques as directly as possible — same layout
functions (`d3.hierarchy`/`.sum()`/`.sort()`, `d3.treemap`/`d3.partition`),
same zoom-state mechanics (scale-domain remapping for the treemap;
`current`/`target` + `d3.interpolate` tweening for the sunburst), restyled
to this app's own tokens rather than the reference's hardcoded/rainbow
colors, and wrapped in this app's own panel lifecycle (query → render →
theme-reactive redraw) instead of a standalone notebook cell.

**Rationale**: These are Observable's own current, maintained, canonical
references for exactly these two diagrams — re-deriving the zoom mechanics
from scratch would risk reintroducing bugs (interpolation glitches,
incorrect angle/depth renormalization) these references already got right,
the same reasoning this project's constitution (Principle VIII) already
applies to its other "reuse a proven reference" cases, even though neither
of these two specific notebooks is one of that principle's five named
repos.

**Alternatives considered**: A third-party React-D3 hierarchical-chart
library (e.g. `nivo`, `visx`) was considered and rejected — this project's
own established pattern for every prior D3-adjacent panel type (`sankey`)
is a direct, un-wrapped D3 implementation matching a canonical reference,
not a higher-level charting library; introducing one here would be a new,
inconsistent pattern for no confirmed benefit, and neither library's own
zoom interaction has been confirmed to match the specific, proven mechanics
above.

## §4. Grammar/config shape

**Decision**: Both new panel types extend the same existing
`DataBoundPanelConfigBase` (+ the existing shared `ComparisonCapablePanelConfig`
mixin, for grammar consistency with every other chart-rendering panel
type) and add exactly two new fields:

- `path: string[]` — an ordered list of real result-set column names,
  root to leaf (e.g. `[primary_purpose, major_trip_mode]`).
- `value: string` — the real result-set column supplying each leaf's
  sized value (e.g. `trips`).

An optional `color_scheme?: string` follows `SankeyPanelConfig`'s own
exact precedent (a named categorical scheme for discrete node/segment
coloring — the closest existing analog, both being discrete-category,
non-continuous-scale colorings).

**Rationale**: `path`/`value` follow this app's own established
"author-names-the-real-column, never a `$metric.`-prefixed placeholder"
convention (`SankeyPanelConfig.source/target/value`,
`ObservablePlotPanelConfig`'s `x/y/fill/stroke`,
`RechartsPanelConfig`'s `x/y/series`) — an ordered array is the natural
generalization of that same idea to an arbitrary hierarchy depth (2 levels
for this feature's own real content; FR-004 requires 3+ levels to also
render correctly). A client-side nesting transform (flat tidy rows ->
`d3.hierarchy`-ready nested object, grouped by `path` in order, leaves
summed/valued by `value`) runs once per query result, mirroring
`rechartsEncoding.ts`'s own established "pivot the universal tidy-row
query result into the shape this specific rendering library needs"
pattern — never a query that returns pre-nested JSON.

**Alternatives considered**: A query returning literally pre-nested
JSON (one row containing a nested `children` array) was considered and
rejected — every existing query-building mechanism in this app
(`panelQuery.ts`, `sqlExpander.ts`) produces flat, tidy rows; inventing a
nested-JSON query shape would be a new, one-off query mechanism serving
only these two panel types, breaking this app's own universal flat-row
contract for no real benefit over a small client-side grouping transform.

## §5. Theming/dark-mode — already solved, reused directly

**Decision**: Reuse the exact `getComputedStyle()`-against-a-mounted-element
technique already established by `SankeyPanel.tsx`/`sankeyColor.ts` (node/
link fill colors) and `ObservablePlotPanel.tsx` (the `--plot-background`
dark-mode tooltip fix) — resolve `--chart-1`..`--chart-5` (and any other
needed token) to a real, current computed color string at render time, and
set that resolved string directly as each node/arc's `fill` attribute.
Text uses `currentColor` (matching `SankeyPanel.tsx`'s own label-fill
approach) so it inherits this app's real, already-correct
`text-foreground` cascade with no separate resolution needed.

**Rationale**: This is a real, already-proven instance of exactly the risk
this feature's own design decisions flagged (a raw, unresolved
`var(--x)` reference is not guaranteed to resolve correctly on every
D3-managed SVG node in every browser) — it does not need to be re-solved
from scratch. Both new chart types redraw on a theme-scheme change the
same way `ObservablePlotPanel.tsx`/`PlotlyPanel.tsx` already do (a
dedicated redraw triggered by `useColorScheme()`, never re-querying data
for a theme-only change).

**Alternatives considered**: Relying on CSS custom-property inheritance
into the SVG via ordinary light-DOM cascade (no explicit resolution) was
considered — rejected as the same real, already-encountered risk class
`ObservablePlotPanel.tsx`'s own header comment documents in detail (a
self-targeting rule on the SVG element itself can defeat inherited custom
properties regardless of specificity); the explicit-resolution technique
is the one already proven safe in this codebase.

## §6. Shared "D3 chart host" architecture — what is actually shared vs. renderer-specific

**Decision**: One shared host component owns the parts common to any
D3-rendered panel (data fetch/query lifecycle, loading/empty/error state,
container ref + mount/redraw/unmount effect split, theme-token
resolution, tooltip presentation) — modeled on `ObservablePlotPanel.tsx`'s
own fetch-effect/render-effect/unmount-effect three-way split. Each chart
type (`treemap`, `sunburst`) supplies its own renderer function (the
actual D3 draw/zoom logic from §3a/§3b) that the host calls with a
resolved hierarchy and a container element — the same "host wraps a
non-React library via `useEffect`+`ref`; the library-specific logic is a
pluggable function" shape `ObservablePlotPanel.tsx` already uses for
`Plot.plot()`, generalized to accept more than one possible renderer.

**Rationale**: §3a/§3b confirm the two chart types' own zoom mechanics are
genuinely different D3 idioms (scale-domain remapping + DOM-group
fade-in/out for the treemap; per-node `current`/`target` state +
`d3.interpolate` tweening for the sunburst) — forcing them through one
shared *rendering* function would be artificial. What genuinely
generalizes across both is everything ABOVE the rendering step: query
resolution, the flat-rows-to-hierarchy transform (§4), loading/empty/error
handling, and theme-token resolution (§5) — all identical regardless of
which of the two chart types is chosen. This matches the feature's own
Success Criteria (SC-006: a third future hierarchical chart type, e.g. an
icicle diagram, should not require rebuilding the theming/interaction/
data-binding foundation) without forcing a false equivalence at the
rendering layer specifically.

**Alternatives considered**: One fully monolithic component per chart
type (no shared host at all) was considered and rejected — it would
duplicate the query/loading/theming logic ObservablePlotPanel.tsx already
proves is substantial and error-prone to get right twice (see that file's
own extensive real-bug history). Registering both chart types as the
SAME literal panel type with a `chart_type: 'treemap' | 'sunburst'`
discriminator (mirroring `RechartsPanelConfig.chart_type`) was also
considered — rejected in favor of two distinct `type:` values
(`treemap`/`sunburst`), matching `sankey`'s own precedent of naming a
panel type after the specific diagram it produces, since (unlike
Recharts' bar/line/area, which share one visual grammar and literally
one Recharts component swapped by a prop) a treemap and a sunburst are
different SVG structures end-to-end, not one component with a variant
prop.

## §7. New dependency and build-chunking consideration

**Decision**: Add `d3-hierarchy` as a new npm dependency. Chunk it
alongside the existing `d3-sankey`/`d3-scale-chromatic` (a shared "d3"
bucket), and ensure both new panel types are registered as
`React.lazy()` entries in `panels/registry.tsx`, matching every other
panel type's own established convention.

**Rationale**: `package.json` confirmed directly — `d3-hierarchy` is not
currently present; `d3-sankey`/`d3-scale-chromatic` are the only `d3-*`
packages already in this tree, both already used by `sankey`. Lazy
registration matches this app's own hard-won, already-documented lesson
from `042-boot-performance-fix` (PIPELINE.md) about eager registry
imports silently pulling a panel type's whole dependency graph into every
page load regardless of whether any viewer ever opens that tab.

**Alternatives considered**: None materially different — this is a
direct application of an already-settled, already-proven convention, not
a new design question.

### §7a. Real, implementation-time correction: `d3-shape` is a second, necessary new dependency — `d3-selection`/`d3-transition`/`d3-scale` are deliberately NOT added

Found while starting implementation, not anticipated when §7 above was
first written: the real reference implementations quoted in full in §3a/
§3b use `d3.select`/`.selectAll().data().join()` (`d3-selection`),
`.transition().duration()` (`d3-transition`), `d3.interpolate`
(`d3-interpolate`), `d3.scaleLinear` (`d3-scale`), and `d3.arc`
(`d3-shape`) — none of which are `d3-hierarchy` itself, and none of which
§7's own dependency analysis accounted for.

**Decision**: Add `d3-shape` (for `d3.arc()` only) as a second new
dependency. Do NOT add `d3-selection`, `d3-transition`, or `d3-scale` —
reimplement what they'd provide as plain functions/raw DOM manipulation
instead.

**Rationale**: `SankeyPanel.tsx` — this app's own only prior D3-adjacent
panel, confirmed by direct read before deciding this — already
establishes and proves out exactly this split for the identical class of
feature: it depends on `d3-sankey` for its own genuinely-complex LAYOUT
algorithm, but builds and updates its SVG via plain
`document.createElementNS()` calls, with zero `d3-selection`/
`d3-transition` dependency at all. The user's own original feature
request phrase — "raw SVG/D3 for rendering and interaction" — reads
directly as this same split (raw SVG DOM manipulation; D3 for the
layout/math), not as a mandate to adopt D3's own DOM/animation
sub-libraries. A `d3.scaleLinear()` equivalent (linear interpolation
between two known domain/range pairs) is a few lines of arithmetic, not a
meaningfully complex algorithm — reimplementing it locally carries none
of the "re-deriving a proven algorithm risks reintroducing bugs" risk
Principle VIII's own rationale warns against. The same is true of
`d3.interpolate`/`d3-transition`'s own core job for this feature's
specific, narrow use (tweening a handful of known numeric fields over a
fixed duration) — a small local `requestAnimationFrame`-driven tween
helper, easing included, is straightforward and auditable. `d3.arc()` is
different in kind: real SVG arc-path generation with `padAngle`/
`padRadius`/inner-vs-outer-radius corner handling is genuinely intricate
math this project has no reason to re-derive when a small, focused,
purpose-built package already gets it right — confirmed via `npm ls
d3-shape` that it is ALREADY present transitively three times over
(via `@kanaries/graphic-walker`'s own `vega-scenegraph` dependency, via
`@observablehq/plot`'s own bundled `d3` meta-package, and via
`d3-sankey` itself) — but relying on transitive resolution for a direct
import is fragile and dishonest about this project's own real dependency
contract (matching this app's own established discipline of declaring
every directly-imported package explicitly in `package.json`, never
assuming a transitive one will keep resolving), so it is added as its
own explicit, direct dependency instead. `@types/d3-hierarchy` and
`@types/d3-shape` are added as devDependencies for the same reason
`@types/d3-sankey`/`@types/d3-scale-chromatic` already are — neither
ships its own types.

**Alternatives considered**: Adding `d3-selection`/`d3-transition`/
`d3-scale` to match the reference notebooks' own code as literally as
possible was considered and rejected — it would be the first
D3-DOM-manipulation-library dependency in this project, breaking
`SankeyPanel.tsx`'s own real, working precedent for no confirmed benefit
(this feature's actual DOM/animation needs are narrow enough that the
reference's own convenience-layer calls translate directly to a small
amount of equivalent plain code).

### §7b. Real, implementation-time build-chunking fix: `d3-hierarchy` needed an explicit `vite.config.ts` rule; `d3-shape` did not

Found immediately after installing both new dependencies, by directly
re-reading `vite.config.ts`'s own `manualChunks` function before writing
any component code (matching this project's own established discipline
of checking a shared, sensitive file's current state before assuming
old comments still describe it correctly): that function's own comment
above the `d3-shared` bucket rule explicitly listed `d3-hierarchy` as
one of `@observablehq/plot`'s exclusive dependencies, "confirmed... to
have no other real importer anywhere in this app," deliberately left
OUTSIDE the shared bucket for that reason.

This feature's own `treemapRenderer.ts`/`sunburstRenderer.ts` (reachable
only via the new, separately-lazy `TreemapPanel`/`SunburstPanel` registry
entries) are a real, second, independent importer of `d3-hierarchy` —
falsifying that exclusivity claim. Left unmatched, Rollup's own
automatic placement would put `d3-hierarchy` in whichever chunk it judged
best (most likely the pre-existing `observable-plot` chunk), forcing a
viewer who opens only a treemap/sunburst panel to also eagerly/lazily
pull in the ENTIRE Observable Plot bundle just to reach it — the exact
class of leak `042-boot-performance-fix`'s own extensive, already-
documented investigation exists to prevent, and the same class this
file's own `d3-shared` bucket was originally created to fix for
`d3-array`/`d3-scale`/etc.

**Decision**: Add `d3-hierarchy` to the existing `d3-shared` bucket's
match condition (alongside `d3-array`/`d3-scale`/`d3-shape`/etc.), and
correct the now-stale comment on `@observablehq/plot`'s own "exclusive"
dependency list to remove `d3-hierarchy` from it.

**`d3-shape` needed no change at all** — confirmed via `npm ls d3-shape`
BEFORE adding it as a direct dependency that it was already a real,
multiply-shared package (`@kanaries/graphic-walker`'s own
`vega-scenegraph` dependency, `@observablehq/plot`'s own bundled `d3`,
and `victory-vendor`), and the `d3-shared` bucket's existing match
condition (`id.includes('node_modules/d3-shape/')`) matches by physical
module path, not by which `package.json` declares it — so it was already
correctly bucketed before this feature's own new top-level dependency
declaration existed at all.

**Rationale**: This is a direct, mechanical application of the same
"multiply-shared d3-* package must be explicitly bucketed, or Rollup's
own chunk-graph heuristic will silently entangle two otherwise-
independent lazy chunks" lesson `vite.config.ts`'s own extensive comment
history (042, 057) already teaches — confirmed to apply here by directly
re-checking the file's current real state rather than assuming a new
dependency is automatically safe.
