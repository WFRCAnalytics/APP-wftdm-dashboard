# Research: Pie & Radar Chart Panels

## §1. Observable Plot genuinely has no pie/polar support — confirmed, not assumed

Direct source inspection of the installed `@observablehq/plot@0.6.17`
package (`node_modules/@observablehq/plot/src/marks/`) lists every real
mark module: `area`, `arrow`, `auto`, `axis`, `bar`, `bollinger`, `box`,
`cell`, `contour`, `crosshair`, `delaunay`, `density`, `difference`,
`dot`, `frame`, `geo`, `hexgrid`, `image`, `line`, `linearRegression`,
`link`, `raster`, `rect`, `rule`, `text`, `tick`, `tip`, `tree`, `vector`,
`waffle`. No `arc`/`pie` mark exists, and no polar/radial coordinate
system exists anywhere in the package (the same "full source search
returns zero matches" technique `058-hierarchical-chart-panels` already
used to confirm the treemap/sunburst gap). This rules out a `mark:` value
addition to the existing `type: observable-plot` grammar as a viable path
— pie and radar MUST be new registry panel types with dedicated
rendering, matching the precedent already set twice (Sankey, `d3-sankey`;
treemap/sunburst, `d3-hierarchy`/`d3-shape`).

## §2. `RechartsPanelConfig`'s own prior, explicit non-goal

`layout/types.ts`'s `RechartsPanelConfig.chart_type` comment states:
"bar/line/area only in this first version — pie/radar/radial are a
deliberate, explicit non-goal (spec.md FR-004): no dashboard anywhere in
this project authors one today." This feature does not reverse that
decision by extending `RechartsPanelConfig.chart_type` — it adds two
independent, dedicated `pie`/`radar` panel TYPES instead, leaving
`029-shadcn-chart-panel`'s own scope decision for Recharts specifically
untouched. Recharts does have real `PieChart`/`RadarChart` components,
but reusing them would mean pulling the full Recharts runtime in for two
chart shapes it wasn't chosen for (`029`'s own scope was bar/line/area),
and would leave this app inconsistent with its own established "reach for
D3 directly when the gap is in Observable Plot's polar/arc coverage"
precedent (Sankey, hierarchical). D3 is already a fixed dependency family
for exactly this reason.

## §3. Pie-chart geometry — `d3.pie()` + `d3.arc()`, both already installed

`d3-shape@^3.2.0` is already a direct, pinned dependency (added by
`058-hierarchical-chart-panels` for the sunburst renderer's `d3.arc()`
calls) and exports both `pie()` and `arc()` — confirmed directly against
the installed package's real `d3-shape.d.ts`. `d3.pie<T>()` takes a
`value` accessor and returns an array of `PieArcDatum<T>` (each carrying
`startAngle`/`endAngle`/`data`); `d3.arc<PieArcDatum<T>>()` configured
with `innerRadius(0)` and a fixed `outerRadius(R)` turns each arc datum
into a real SVG path `d` string. This is the textbook, canonical D3 pie
chart pattern (Observable's own "Pie chart" example notebook uses this
exact pair) — no ambiguity, no alternative library evaluation needed.
`innerRadius(0)` (never a donut) matches spec.md's Assumptions.

## §4. Radar-chart geometry — hand-rolled polar math, no D3 layout package

Unlike pie charts, D3 has no dedicated "radar chart" layout module (no
`d3-radar`, and `d3-shape` itself has no radial-polygon helper beyond the
generic `d3.lineRadial()`/`d3.areaRadial()` curve generators, which exist
but require the caller to already have computed each point's own angle/
radius — they don't discover axes or compute a value-to-radius scale on
their own). Two options were considered:

- **`d3.lineRadial()`** — takes an array of `[angle, radius]`-ish
  accessor-driven points and produces a closed path string. Genuinely
  useful, but it doesn't change the actual work needed: this app's own
  `radarData.ts` still has to compute each axis's angle (evenly spaced
  around the circle) and each series' per-axis radius (linear scale from
  0 to the shared max value across all series) before `d3.lineRadial()`
  has anything to draw. Using it would add a `d3-shape` import for
  something a handful of `Math.cos`/`Math.sin` calls already does exactly
  as correctly, with the exact same "plain math, no DOM" character this
  project's own `hierarchyTween.ts` (058) already established for
  reimplementing D3's `d3-transition` behavior by hand.
- **Hand-rolled** (chosen): compute each axis's angle as
  `-π/2 + i * (2π / axisCount)` (starting at 12 o'clock, matching every
  real-world radar chart convention, including Recharts' own
  `RadarChart` and Chart.js's `RadarController`), a linear radius scale
  (`value / maxValue * R`, clamped to `[0, R]`), and each vertex's
  Cartesian point via `x = cx + r * cos(angle)`, `y = cy + r * sin(angle)`.
  A closed polygon is then a plain SVG `<path d="M x0,y0 L x1,y1 ... Z">`
  string, built the same way `SankeyPanel.tsx` already hand-builds path
  data. This keeps the radar renderer at "plain math + `document.
  createElementNS()`", matching `SankeyPanel.tsx`/`HierarchicalChartHost.
  tsx`'s established convention exactly, and needs zero new dependency.

**Decision**: no D3 layout package for radar geometry; `radarData.ts`
computes angles/radii/points directly. `d3.pie()`/`d3.arc()` (existing
`d3-shape`) for the pie chart.

## §5. Sharing a color-scheme resolution module between the two new types

`sankeyColor.ts` and `hierarchyColor.ts` are already two near-byte-
identical files (`058`'s own header comment: "Mirrors sankeyColor.ts's
own exact shape") — the project's established convention has so far been
one small dedicated module per panel type rather than a shared one. This
feature considered continuing that (a third `pieColor.ts`, a fourth
`radarColor.ts`, each an identical ~25-line copy) against consolidating
the two NEW modules this feature adds into one shared `polarChartColor.ts`.

**Decision**: one shared `polarChartColor.ts`, used by both `pieData.ts`'s
caller (`PieChartPanel.tsx`) and `radarData.ts`'s caller
(`RadarChartPanel.tsx`) — introducing a third and fourth near-identical
copy of the same 10-line lookup table within a SINGLE feature (as opposed
to across separate, independently-shipped features, which is how the
first two copies came to exist) is the kind of avoidable duplication
CLAUDE.md's own "reuse, simplify" guidance flags, without touching either
pre-existing file (`sankeyColor.ts`/`hierarchyColor.ts` are left exactly
as they are — no retroactive consolidation of prior features' own
choices, which is out of scope here).

## §6. Legend — a new, small shared presentational component

Neither `SankeyPanel.tsx` nor `HierarchicalChartHost.tsx` renders a
legend today (a Sankey's own node labels ARE its legend; a
treemap/sunburst's own segment labels serve the same role) — so there is
no existing legend component to reuse. `RechartsPanel.tsx`'s legend comes
from shadcn's `ChartLegendContent` (`components/ui/chart.tsx`), which is
Recharts-payload-shaped and not reusable by a hand-built D3/SVG chart.
`ObservablePlotPanel.tsx`'s legend is Observable Plot's own internal
DOM-generated swatches element — also not reusable outside Plot's own
render pipeline.

**Decision**: a new, small, genuinely shared presentational component,
`ChartLegend.tsx` — a plain flex-wrap row of `{color swatch, label}`
pairs, styled to match this app's existing `text-muted-foreground`/
`font-body` legend-adjacent typography (`RechartsPanel`'s own
`ChartLegendContent` swatch sizing/spacing as the closest visual
reference, per `wftdm-design-system`). Both `PieChartPanel.tsx` (legend
entries = distinct categories) and `RadarChartPanel.tsx` (legend entries
= distinct series) compute their own `{label, color}[]` array from
already-resolved chart data and pass it to this one shared component —
this is the one piece of UI genuinely identical between the two new
panel types, unlike their underlying chart geometry.

## §7. Hover tooltip — reuse `mapTooltip.ts` unmodified

`mapTooltip.ts` is already a fully framework/library-agnostic, plain-DOM
`show(x, y, html)`/`hide()`/`destroy()` API, with three existing callers
(`FlowMapPanel.tsx`, `ZoneMapPanel.tsx`, `SankeyPanel.tsx`) already
confirming its "shared across panel types" design intent, per that
module's own header comment. Both new panel types reuse it exactly the
way `SankeyPanel.tsx` does: `createMapTooltip(container)` in a mount-only
effect, `tooltip.show(clientX - rect.left, clientY - rect.top, html)` on
each wedge/vertex's own `mousemove` listener. No changes needed to
`mapTooltip.ts` itself.

## §8. Fetch/query lifecycle — reuse `buildPanelQuery()` + `sqlExpander.
expand()` directly, not `resolveQueryAndPairs()`

`resolveQueryAndPairs()` (`panelQuery.ts`) exists specifically to share
the `comparison: diff` branch across the four panel types that opt into
`ComparisonCapablePanelConfig`. Neither `PieChartPanelConfig` nor
`RadarChartPanelConfig` extends that mixin (spec.md Assumptions — no
diff/baseline-comparison mode for either chart type in this feature), so
there is no diff branch to share. `SankeyPanelConfig` is the closest
existing precedent for a `DataBoundPanelConfigBase`-only panel type with
no comparison mixin, and its fetch effect calls `buildPanelQuery(config,
filters)` + `sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG,
filterState, activeScenarios)` directly — both new panel types' fetch
effects mirror this exactly, including `ensureRegistered()` before the
query and the identical loading/empty/error state machine.

## §9. Real demo content — two already-published metrics, zero new
`summarize.yaml` metric needed

- **Pie**: `trip_purpose_share` (`summarize.yaml`, real columns
  `primary_purpose`, `trips`, `share`) — already published, currently
  consumed unpinned (multi-scenario `$scenario` union) by a `table` panel
  on `dashboard-5-trip-models.yaml`. A pie chart, by definition (spec.md
  Assumptions — "exactly one series"), needs a single-scenario view; the
  new pie panel pins `scenario: activitysim-baseline` explicitly, the
  same "some panels legitimately stay pinned when a single-series view is
  structurally required" precedent `038-all-loaded-scenarios`' own
  Part 2 already established for value-box/zonemap/flowmap panels bound
  to the same underlying metrics.
- **Radar**: `trip_mode_share` (`summarize.yaml`, real columns
  `major_trip_mode`, `trips`, `share`) — already published, already
  unpinned (a real `$scenario` union) and already consumed with
  `fill: scenario` by an `observable-plot` panel on
  `dashboard-1-summary.yaml` ("Total Trips by Mode"). The new radar panel
  reuses the identical unpinned query shape with `axis: major_trip_mode`,
  `value: share`, `series: scenario` — a genuine, real "compare each
  loaded scenario's overall mode-share shape at a glance" use case,
  demonstrating User Story 2's multi-series requirement with real,
  non-fabricated data.

Both metrics already exist and are already published in every real demo
scenario's `summary/` output — no `python/wftdm_dashboard/postprocessor`
change, no pipeline re-run, no new Parquet file.

## §10. Chunking — no `vite.config.ts` change needed

`panels/registry.tsx`'s existing `React.lazy()` convention (`042-boot-
performance-fix`) already means a new registry entry's own module (and
whatever it imports, including `d3-shape`) is only fetched the first time
a panel of that type actually renders — confirmed by inspecting
`vite.config.ts`'s `manualChunks` function: it has no explicit rule
naming `d3-hierarchy`/`d3-shape`/`d3-sankey`/`d3-scale-chromatic` at all,
meaning Rollup's automatic chunking already places them correctly
relative to their lazy-loaded consumers (the sankey/treemap/sunburst
panels today) with no eager-leak observed. The two new panel types follow
the identical lazy-registration shape, so no chunking change is
warranted — confirmed by the same reasoning `058`'s own research
concluded for its own two new panel types (which also introduced no
`vite.config.ts` change).

## §11. Testing conventions confirmed against existing precedent

- Unit: `pieData.test.ts`/`radarData.test.ts` follow `sankeyGraph.
  test.ts`'s existing shape (pure function input/output assertions,
  including the duplicate-aggregation and non-positive-value-exclusion
  cases, and — new to this feature — the missing-axis-value-defaults-to-
  zero case for radar).
- Integration: `pieChartPanel.spec.ts`/`radarChartPanel.spec.ts` follow
  `sankeyPanel.spec.ts`'s existing shape (real render against
  `dashboard-8-test.yaml` fixture panels — see quickstart.md — hover
  producing real tooltip content via `.map-tooltip`, dual-theme computed-
  style legibility checks, panel-expand-to-dialog redraw).
