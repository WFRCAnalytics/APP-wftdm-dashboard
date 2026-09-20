# 062-comparison-framework-research — research

Research-only pass (no implementation) on how this dashboard should let a
viewer compare 2+ ActivitySim scenarios — single-scenario, pairwise, and
an 8-10+-run 2023–2050 No-Build-vs-Build time-series stream — across every
chart family, plus maps. Renumbered from a queued `052` (that number was
since claimed by a real implementation branch); scope is otherwise
unchanged from the original request. Same standard as `050`/`051`: every
finding below is read directly from this repo's own current source
(confirmed by file:line), not assumed from `project-docs/`, plus real,
cited prior art for the genuinely open design questions.

---

## A. Audit — what actually compares scenarios today, panel type by panel type

### A1. The one real working example: `$scenario`'s UNION-ALL + a `series`/`fill` channel (bar/line/area via Recharts, also Observable Plot)

The entire mechanism is two independent, already-generic pieces that
happen to compose into "comparison" for any chart type willing to read a
`scenario` column — nothing bar-chart-specific exists anywhere:

1. **`sqlExpander.ts#expandScenario()`** (`src/services/sqlExpander.ts:233-248`).
   An unpinned `$scenario.<metric>` placeholder (no `config.scenario`/
   `config.scenarios` on the panel) expands to:
   ```sql
   SELECT *, 'activitysim-baseline' AS scenario FROM "activitysim-baseline__mode_share"
     UNION ALL
   SELECT *, 'activitysim-density-variant' AS scenario FROM "activitysim-density-variant__mode_share"
     UNION ALL
   SELECT *, 'activitysim-transit-variant' AS scenario FROM "activitysim-transit-variant__mode_share"
   ```
   Every active scenario's rows land in ONE tidy result set, tagged by a
   literal `scenario` discriminator column. This is the single mechanism
   every multi-scenario chart in this app either already uses or could use
   — there is no second "comparison query" code path.
2. **`RechartsPanel`'s `series: scenario`** wiring
   (`src/panels/rechartsEncoding.ts#encodeRechartsData`, `src/panels/RechartsPanel.tsx:306`).
   When an author sets `series: scenario` on a `type: recharts` panel,
   `encodeRechartsData()` pivots the tidy `(x, scenario, y)` rows into one
   wide row per `x` value with one column per distinct `scenario` — an
   ordinary long-to-wide groupby, not comparison-specific logic — and
   returns `seriesKeys` (scenario names, first-seen order). `RechartsPanel`
   then renders one `<Bar>`/`<Line>`/`<Area>` per `seriesKeys` entry,
   grouped side-by-side by default or stacked when `stacked: true`
   (`RechartsPanel.tsx:487-503`). **Recharts' own native multi-series
   rendering is doing 100% of the "comparison" visual work** — the app
   code's only job is getting a `scenario` column into the tidy rows (free,
   from `$scenario`) and pivoting it into Recharts' wide-row contract.

Color/label resolution for that "comparison" **is** scenario-aware,
uniquely among all panel types: `encodeRechartsData()` takes an optional
`scenarioDisplay: ScenarioDisplayMap` and, when `config.series ===
'scenario'`, calls `resolveScenarioColor()`/`resolveScenarioLabel()`
(`src/panels/scenarioDisplay.ts:29-43`) so a viewer's Settings→Scenarios
tab label override/color override (`035-scenario-label-color`,
`036-scenario-color-picker`) is reflected directly in the chart legend —
falling back to the ordinary `--chart-N` token cycle only when unresolved.
**No other chart type in this app reads `scenarioDisplay` at all** (§A2-A5
below) — this is the one piece of "comparison, done right" that exists
nowhere else yet.

A second, structurally separate mechanism, **`comparison: diff`**
(`019-baseline-diff-consumption`), answers a different question — "the
delta between exactly two named scenarios" rather than "all active
scenarios side by side." `panelQuery.ts#buildComparisonDiffQuery()`
(`:281-297`) joins two named scenario views on `compare_on` columns and
emits one `expr`-computed `diff_value` column, no `scenario` discriminator
at all (single row per compare-key, not one row per scenario). Resolved
via the shared `resolveQueryAndPairs()` (`panelQuery.ts:441-471`), which
also resolves `'$baseline'` sentinels against `appState.getBaseline()`
(`useBaseline()`). Per its own type (`ComparisonCapablePanelConfig`,
`src/layout/types.ts:412-415`), this is wired into **five** panel types:
Plotly, Table, ObservablePlot, Recharts, and ZoneMap — confirmed by grep,
not the "one working example" the task's own framing assumed. Sunburst
and Treemap ALSO structurally receive it (§A2) — Radar, Pie, and Sankey do
not (§A3-A5).

**State flow, end to end, for a `series: scenario` recharts panel:**
`appState.active` (viewer's Scenarios-tab `Switch` toggles) → `useActiveScenarios()` →
`resolveQueryAndPairs()`'s `activeScenarioNames` param → `resolveActiveScenarios()`
(`panelQuery.ts:207-213`, `config.scenario`/`config.scenarios` bypass this
entirely — see next paragraph) → `sqlExpander.expand()`'s `$scenario`
placeholder → the UNION-ALL query → tidy rows with a real `scenario`
column → `encodeRechartsData()`'s pivot + `scenarioDisplay` color/label
resolution → Recharts' own multi-series render.

**Explicit escape hatch, load-bearing for every recommendation below**: a
panel with `scenario:` (singular) or `scenarios:` (list) in its config
bypasses the active-set entirely (`resolveActiveScenarios()`,
`panelQuery.ts:211-212`, and `panelQuery.ts:93-95`'s own `config.scenario`
branch in `buildPanelQuery()`) — this is how a **scenario-switcher**
pattern (§B) would be implemented for any panel type today: an
author/viewer-set `scenario: <name>` config value, not a new query
mechanism.

### A2. Sunburst & Treemap (`058-hierarchical-chart-panels`) — comparison-diff IS structurally wired, but the hierarchy builder cannot consume its output

`TreemapPanelConfig`/`SunburstPanelConfig` both extend
`HierarchicalPanelConfigBase`, which extends `ComparisonCapablePanelConfig`
(`src/layout/types.ts:484-490`) — and `HierarchicalChartHost.tsx:122`
(the shared host both `TreemapPanel.tsx`/`SunburstPanel.tsx` render
through) calls `resolveQueryAndPairs()` completely unmodified, identically
to Recharts. **This is real, confirmed latent scaffolding**: set
`comparison: { type: 'diff', a: 'scenario-a', b: 'scenario-b', expr: '...' }`
on a treemap/sunburst panel today and the query layer resolves it
correctly, no code change needed.

What is NOT wired: `buildHierarchy()` (`src/panels/hierarchyData.ts:29-77`)
groups rows strictly by `config.path` (an ordered column list) and sums
`config.value` at the leaf — it has no concept of a `diff_value` column,
no sign-aware color mapping, and no `scenario` discriminator handling at
all. Practical consequence: pointing `value:` at `diff_value` would
"work" mechanically (the diff query's `compare_on` columns would need to
exactly match `path`, and `d3.hierarchy().sum()` would sum signed
deltas — for a treemap, a negative-signed slice has no valid rectangle
area; `d3.hierarchy().sum()` doesn't clamp negatives). Multi-scenario
overlay is unsupported entirely: an unpinned `$scenario` union reaching
`buildHierarchy()` would silently double/triple-count every leaf's
`value` across scenarios (the `scenario` column plays no role in
`groupLevel()`'s grouping key at all) — a real, confirmed bug-shaped gap
if anyone ever left `scenario`/`scenarios` unset on a hierarchical panel
today while 2+ scenarios were active.

**Groundwork exists (query layer); the drawing/aggregation layer does
not** — any Part B recommendation for these two types is new work in
`hierarchyData.ts` and the renderers (`hierarchyRenderers/`), not the
query plumbing.

### A3. Radar (`060-radar-pie-charts`) — the one panel type with a REAL, deliberate, already-shipped multi-scenario overlay (via `series`, not `comparison`)

`RadarChartPanelConfig` deliberately extends `DataBoundPanelConfigBase`
ONLY — no `ComparisonCapablePanelConfig` mixin, confirmed by the type's
own comment (`src/layout/types.ts:513-515`: "no comparison: diff/baseline
mode for this panel type, spec.md Assumptions"). `RadarChartPanel.tsx`
calls `buildPanelQuery()`/`resolveActiveScenarios()`/`sqlExpander.expand()`
directly (`:220-222`), not `resolveQueryAndPairs()` — `comparison: diff`
genuinely does not reach this panel type at all.

But `060-radar-pie-charts`' own spec (`specs/060-radar-pie-charts/spec.md:75-119`,
User Story 2) **explicitly designed** a multi-scenario case: `series?:
string` on `RadarChartPanelConfig` (`types.ts:548`), documented "e.g.
`series: scenario` against an unpinned `$scenario` union — the same real
column every other scenario-colored chart panel type already reads."
`radarData.ts#aggregateRadarSeries()` (`:38-80`) groups rows by
`config.series` (falling back to one implicit series when unset) into
`RadarSeries[]`, each a complete `Map<axis, value>` with every axis
explicitly zero-filled so multiple series never desync their shared axis
order — a real, working "one polygon per scenario, same axes" overlay,
confirmed by Acceptance Scenario 2 of that spec. **This is the closest
thing to a second working comparison pattern in the whole codebase.**

The real gap: unlike Recharts, `RadarChartPanel.tsx` never imports
`useScenarioDisplay()`/`scenarioDisplay.ts` at all. Colors come from
`resolveNamedColorScheme()`/`resolveCategoryFallbackColors()`
(`chartColor.ts`) purely by series index (`renderSvg()`,
`RadarChartPanel.tsx:110`), and the legend (`ChartLegend`,
`:111`/`301`) shows the raw `scenario` column value, not a viewer's
custom label. A radar panel using `series: scenario` today visually
disagrees with every Recharts panel on the same dashboard about a given
scenario's color and display name — a real, confirmed cross-panel-type
inconsistency, not hypothetical.

### A4. Pie (`060-radar-pie-charts`) — no scaffolding, deliberately

`PieChartPanelConfig` has no `series`/`scenarios` field of any kind
(`types.ts:521-531`) and no `ComparisonCapablePanelConfig` mixin. If an
author leaves `scenario`/`scenarios` unset with 2+ scenarios active, the
unpinned `$scenario` union's rows reach `aggregatePieSlices()`
(`pieData.ts:37-60`), which groups by `config.category` ONLY —
**scenario is invisible to it**, and every scenario's values for the same
category get silently summed into one slice (the identical
"scenario-blind aggregation" bug-shape as Sunburst/Treemap's real gap in
§A2, and Sankey's in §A5). Zero latent scaffolding; a real pie-chart
comparison feature is a green-field addition.

### A5. Sankey (`008-sankey-panel`, unmodified since) — no scaffolding, and the SAME scenario-blind aggregation gap as pie

`SankeyPanelConfig` extends `DataBoundPanelConfigBase` only
(`types.ts:236`) — no comparison mixin, confirmed; `008-sankey-panel`'s
own spec has zero comparison/multi-scenario framing anywhere (grep
confirmed). `SankeyPanel.tsx` calls `buildPanelQuery()`/
`resolveActiveScenarios()`/`sqlExpander.expand()` directly, identically to
Radar's non-comparison path (§A3) — but `buildFlowGraph()`
(`sankeyGraph.ts:51-77`) reads only `config.source`/`target`/`value` per
row; **`scenario` is never referenced anywhere in that file** (confirmed
by direct read). An unpinned Sankey panel with 2+ active scenarios today
silently sums flow volumes across every scenario into one indistinguishable
diagram — a real, live, confirmed-by-reading-the-code gap in the current
app, independent of anything this research proposes. Zero latent
scaffolding for real comparison.

### A6. Summary table

| Panel type | `comparison: diff` wired? | Multi-scenario overlay today? | Scenario-aware color/label? |
|---|---|---|---|
| Recharts (bar/line/area) | Yes (query layer) | **Yes, real, shipped** (`series: scenario`) | **Yes** (`scenarioDisplay.ts`) |
| Plotly / Table / ObservablePlot / ZoneMap | Yes (query layer) | Varies per type (out of this pass's chart-type list) | Plotly only, partially (not audited further — out of scope) |
| Treemap / Sunburst | Yes (query layer only — `hierarchyData.ts` can't consume it) | **No** — scenario-blind aggregation bug-shape if left unpinned | No |
| Radar | No | **Yes, real, shipped** (`series: scenario`) | **No** — real, confirmed gap |
| Pie | No | No — scenario-blind aggregation bug-shape if left unpinned | No |
| Sankey | No | No — scenario-blind aggregation bug-shape if left unpinned | No |

Every recommendation in Part B is explicit about which of these three
states (query-layer-only, real-but-uncolored, green-field) it's building
from.

---

## B. Per-chart-type comparison pattern

Constraint carried through every recommendation: Observable Plot primary,
D3 direct only where Observable Plot has no native support, no other
charting library — per `CLAUDE.md`'s own stack table and this task's
explicit scope boundary. Colors/tokens: reuse `chartColor.ts`'s
`resolveNamedColorScheme()`/`resolveCategoryFallbackColors()` and
`scenarioDisplay.ts`'s `resolveScenarioColor()`/`resolveScenarioLabel()` —
every recommendation below is additive to those, never a new palette
mechanism.

### B1. Treemap — synced small multiples, one instance per scenario

**Pattern**: one treemap per active/selected scenario, laid out in a CSS
grid inside the panel, sharing one color scale (top-level category →
color, resolved once against the FIRST scenario's hierarchy so category
colors stay identical across instances) and one size scale (so a
scenario with a smaller total doesn't visually read as "the whole
treemap shrank" — rectangle area should encode share-of-that-scenario's-
total, consistently scaled, not raw absolute value, unless the metric is
genuinely meant to show absolute-magnitude change, which is what B1b's
diff mode is for).

**Cited precedent**: this is the textbook "small multiple" (Tufte;
Wikipedia's own definition — "a series of similar graphs... using the
same scale... so they can be easily compared," https://en.wikipedia.org/wiki/Small_multiple)
applied to treemaps specifically — Observable's own `@d3/nested-treemap`
example (https://observablehq.com/@d3/nested-treemap) demonstrates the
identical "same layout algorithm, multiple data slices, one visual
grammar" composition this recommends, just for hierarchy depth rather
than scenario; the composition principle (shared scale, repeated layout)
is the same one this task's own framing already names as acceptable for
"some chart types." A controlled empirical comparison
(arXiv:1907.03919, "small multiples... completed trend comparison tasks
more quickly and more accurately than... animated design") is direct
evidence for small multiples over any single-view "switcher" pattern
specifically for the comparison task this dashboard needs, not merely a
stylistic preference — reused again in Part C's time-series
recommendation.

**Implementation notes**: `HierarchicalChartHost` gains a
`scenarios: string[]` variant of its current single-`root` state (an
array of `{ scenarioName, root }`, one `buildHierarchy()` call per
scenario over that scenario's own slice of the tidy rows — split the
already-fetched `$scenario`-union rows by their `scenario` column client-
side, rather than N separate queries, since the query already returns all
of them together). Each grid cell renders through the EXISTING
`treemapRenderer.ts` unmodified (`HierarchyRenderer.mount()`/`update()`
per cell) — no D3/Observable Plot code changes, only a new outer grid +
multi-root data layer in the host. Color resolution: compute
`buildColorResolver()` ONCE against the first scenario's root (or a
category set unioned across all scenarios, more robust if scenarios don't
share identical top-level categories) and pass the same resolver function
to every cell — this is the one place a genuine shared-scale requirement
exists structurally, not optional polish. Synced hover: a cell's
`mouseenter` on a given top-level category name broadcasts (a small
shared React context or module-level pub/sub, matching `state/
filterState.ts`'s own established pub/sub shape) to every other cell,
which highlights the same category name if present (dim/opacity the rest)
— cross-instance sync, not cross-instance re-render.

**B1b — diff mode**: for exactly 2 selected scenarios, a SEPARATE toggle
state (not simultaneous with small-multiples) renders ONE treemap whose
rectangle geometry comes from scenario A (or the union of both scenarios'
categories) and whose FILL COLOR encodes percent-change of `value` for B
vs. A per leaf (a diverging color scale — red/blue, magnitude by
saturation) — this is exactly the shape `comparison: diff`'s query already
produces (`diff_value`, keyed by `compare_on`) if `compare_on` is set to
`config.path`'s full tuple. This DOES require a `hierarchyData.ts` change
(§F) — a new `buildHierarchyFromDiff()` (or a `diffValue?` field per leaf,
consumed by a new diverging-color mode in `treemapRenderer.ts`) — flagged
explicitly as new code, not the small-multiples path above.

### B2. Sunburst — same small-multiples pattern as treemap; diff mode is a worse fit here than for treemap

Sunburst shares `HierarchicalPanelConfigBase`/`HierarchicalChartHost`
with treemap (§A2) — the small-multiples recommendation, synced-hover
mechanism, and shared color resolver are IDENTICAL in implementation to
B1, just swapping which renderer (`sunburstRenderer.ts`) each grid cell
mounts. No additional prior-art search needed beyond B1's — the pattern
generalizes directly because the host already generalizes the two chart
types (`research.md` of `058` itself frames this as "the same real
hierarchy, two ways").

Diff mode is explicitly a WORSE fit for sunburst than treemap: a treemap
rectangle's area is a direct, easily-perceived encoding a viewer can
additionally recolor without losing the size read; a sunburst wedge's
ANGLE plays the same role, but a sunburst's ring-radius (depth) already
carries meaning (hierarchy level) that a diff color scale would compete
with visually at the SAME ring a treemap doesn't have to worry about
(treemap has no depth-encoded visual channel beyond nesting). Recommend
B1b's diff mode for treemap only; sunburst comparison stays small-
multiples-only unless a future pass finds real evidence otherwise.

### B3. Radar — extend the ALREADY-SHIPPED overlay; the comparison pattern here is "finish it," not "invent it"

Per §A3, radar's `series: scenario` overlay already IS the comparison
pattern per real, standard radar-chart precedent (this is the "polygon
overlay" convention Chart.js/Highcharts/every real radar-chart library
ships as their default multi-series behavior — no external citation
needed beyond noting this app's OWN `060` spec already made this the
intended design, Acceptance Scenario 2). The only real work is closing
§A3's confirmed gap: wire `useScenarioDisplay()` into `RadarChartPanel.tsx`
exactly the way `RechartsPanel.tsx` already does, and pass the resolved
`ScenarioDisplayMap` into `aggregateRadarSeries()`'s caller so
`renderSvg()`'s per-series `color`/legend label resolve through
`resolveScenarioColor()`/`resolveScenarioLabel()` when `config.series ===
'scenario'` — same conditional shape as `encodeRechartsData()`
(`rechartsEncoding.ts:92-102`), copied, not reinvented. A diff mode for
radar has no clean encoding (a radar axis has no natural "second
color/texture" channel the way a treemap cell's fill does) — not
recommended; overlay-of-2 (both scenarios' polygons, semi-transparent
fills already at `fill-opacity: 0.25`, `RadarChartPanel.tsx:118`) already
reads as a comparison for exactly 2 series without any new mode.

### B4. Pie — scenario switcher + diff view; NOT small multiples

Real, cited reasoning against small multiples specifically for pie:
multiple pie charts side by side is one of the most consistently
criticized patterns in the data-vis literature for exactly the
comparison task this app needs — angle/area judgments across separate
circles are hard to compare precisely, which is why "don't chain or nest
pie charts" / "avoid multiple pies for comparison" is a recurring,
independently-arrived-at rule across sources found in this pass
(Highcharts' own guidance, https://www.highcharts.com/blog/best-
practices/what-chart-to-use-when-your-data-adds-up-to-100/, and
https://medium.com/@addtwo/rule-11-dont-chain-or-nest-pie-charts-2e840173ed98)
— a genuine, cited counter-example to defaulting every chart type to
small multiples, matching this task's own explicit instruction not to
force one paradigm everywhere.

**Recommendation**: scenario switcher (a `<Select>` — `components/ui/
select.tsx` already exists and is this app's established dropdown
primitive — listing active scenarios, defaulting to the first/baseline)
that re-points the SAME single pie at one scenario at a time via the
already-real `scenario:` singular-pin escape hatch (§A1) — no query-layer
change, this is a pure UI-state wrapper around `PieChartPanelConfig`
picking which scenario name to pass through. **Diff view**: for exactly 2
scenarios, a bar-of-differences is a better-evidenced alternative to any
pie-shaped diff (a diverging horizontal bar per category, `value_B -
value_A` or percent-change) — this is realistically a `type: recharts`
panel with `chart_type: bar` fed by `comparison: diff`'s existing query
shape (already fully wired, §A1), not new pie-specific code at all.
Flagged explicitly: the "diff view" affordance for pie effectively hands
off to the ALREADY-WORKING bar-chart comparison path rather than building
a new pie-diff renderer — the most direct application of this task's own
"extend the one thing that already works" framing.

### B5. Sankey — scenario switcher (default) + a genuine diff-Sankey mode, cited from a real, close analog

Small multiples is a poor fit for Sankey specifically: two side-by-side
Sankey diagrams have independently-computed node positions/vertical
orderings (d3-sankey's own layout has no cross-instance coordination), so
even the SAME node label can land at a different vertical position in
each instance — defeating the visual alignment small multiples depends on
for comparison to work at all (unlike treemap/sunburst, whose layouts
ARE deterministic per input and thus stay comparably positioned across
instances for the same category).

**Default: scenario switcher**, same `scenario:` singular-pin mechanism
as B4, reusing the identical `<Select>` pattern — this ALSO fixes §A5's
real, confirmed scenario-blind-aggregation bug as a side effect (a
switcher always pins to exactly one scenario, so the union-of-all-active
case that currently silently merges flows would no longer be reachable
through the switcher's own default state; an author could still
misconfigure an unpinned multi-scenario Sankey outside switcher mode —
worth a defensive `console.warn` when `buildFlowGraph()` receives rows
whose `scenario` column has more than one distinct value, independent of
this whole comparison feature, since it's a real live bug today).

**Diff mode — cited real prior art**: exact "diff Sankey" precedent is
thin (confirmed by this pass's own search — general Sankey literature
covers TIME-based flow evolution via alluvial diagrams, duplicating nodes
per time-step, e.g. https://technickle.medium.com/thinking-differently-
about-sankey-95eae229a82d and the time-series-viz survey at
arXiv:2507.14920 — a real pattern, but for the "many timestamps" case,
not "exactly 2 scenarios," and explicitly out of one of the two use
cases here). The closer, genuinely-real analog for two-scenario
comparison is this app's OWN existing `comparison: diff` pattern applied
to link width/color instead of node position: render Sankey A's topology
(source/target node set, since `compare_on` for Sankey would naturally be
`[source, target]`) with **link width representing scenario B's flow
minus scenario A's flow's absolute value**, and **link color/stroke
representing the SIGN** (e.g. `--chart-1`-family for growth,
diverging-scheme red for shrinkage) rather than the usual single
categorical fallback. A link whose flow existed in one scenario but not
the other is a real, valid diff row (`compare_on` join produces `NULL`
on one side — treat as 0, matching `buildFlowGraph()`'s own existing
"non-positive value excluded" convention extended to "half-missing
counts as zero, not excluded, so a genuinely-new flow still renders").
This needs new code in `sankeyGraph.ts` (a `buildDiffFlowGraph()`
sibling to `buildFlowGraph()`) and a color/stroke branch in
`SankeyPanel.tsx`'s `renderSvg()` — flagged as real new work, not a
config-only change (§F).

---

## C. Time-series stream (2023–2050, 8-10+ runs, No-Build vs Build) — recommendation: trend chart as the primary always-visible view, drilling into 1-2-year small multiples/switcher

**Recommendation, stated directly (not a menu)**: a `type: recharts`
line/area chart (already real, already shipped, `x: year`, `series:
scenario` or a synthesized `<scenario_family>-<year>` series key) is the
PRIMARY, always-visible view for the stream case — every other chart type
(sunburst/treemap/radar/pie/sankey) only ever renders 1-2 SELECTED years
at a time, chosen via direct interaction with the trend chart (a click on
a year's x-position, or a paired "Year A / Year B" `<Select>` pair sitting
alongside the trend chart, matching B4/B5's own switcher affordance
exactly), not a continuously-scrubbing time slider driving live redraws
of every panel on the tab.

**Justification against the specific use case**: the real comparison task
here is "how did the Build-vs-No-Build GAP evolve over 27 years," which is
fundamentally a TREND question — a single always-visible line/area chart
already answers "which years are interesting" (a widening gap, a
crossover point, a plateau) at a glance, across all ~10 runs at once,
something no other chart type in this task's list can do (treemap/
sunburst/radar/pie/sankey all require picking specific years BEFORE they
can render anything meaningful — none of them has a native "time" axis).
A continuous scrubber, by contrast, forces the viewer to hunt for the
interesting year(s) by dragging rather than seeing them directly on a
trend line, and would force every other panel on the tab to re-fetch/
re-render on every scrub tick (a real, if modest, DuckDB-WASM query cost
per frame at up to ~10Hz+ scrub rates — genuinely worse than "pick a year,
then render once"). Milestone small multiples (fixed 2023/2030/2040/2050
panels) lose exactly the resolution a real "when did the gap start
appearing" question needs, and doesn't scale — the task's own framing
explicitly warns against treating this as "a couple of picked years."

The controlled small-multiples-vs-animation evidence cited in B1
(arXiv:1907.03919) applies here too, in the opposite direction from how
it's usually read: it's evidence FOR a static, always-rendered trend view
over a live-scrubbing "animated" one for a trend-comparison task
specifically — reinforcing (not just permitting) the always-visible-line-
chart recommendation over a scrubber.

**Composition with Part B, per chart type**:
- **Sunburst/Treemap small multiples (B1/B2)**: the Year-A/Year-B
  selection (driven by clicking the trend chart or the paired `<Select>`)
  determines WHICH 2 scenario-year combinations populate the small-
  multiples grid — the grid's own scenario axis (today: 2-3 published
  demo scenarios) and the stream's own year axis compose as two
  INDEPENDENT selectors feeding the same grid (e.g. "No-Build 2040" and
  "Build 2040" as the 2 grid cells, or "Build 2030" vs "Build 2050" to see
  one scenario's own evolution) — the grid was already built to accept an
  arbitrary `scenarios: string[]` (§B1's implementation note); a stream
  year is just another dimension of what string gets resolved into that
  array (a `scenario` name in this app's real data model already has to
  be a full `{run-family}-{year}` identity for the stream case — see the
  one real data-layer dependency flagged in §F).
- **Radar (B3)**: identical composition — `series: scenario` becomes
  `series: <the resolved run identity>`, filtered to exactly the 2 (or a
  small N) selected years/scenarios before the query runs, not the
  currently-implicit "every active scenario" default (which would be
  unreadable at 8-10+ overlaid polygons — a real, evidenced reason to cap
  radar's own overlay count independent of anything else in this
  document; recommend capping at ~4 simultaneous polygons before legend/
  visual legibility degrades, consistent with this app's own existing
  5-token `--chart-1..5` categorical palette ceiling before color reuse
  starts).
- **Pie/Sankey switchers (B4/B5)**: the switcher's `<Select>` options list
  simply becomes "every resolved run identity," not "every scenario" —
  same component, same escape hatch, no new mechanism; a year becomes
  just another entry in the same dropdown a bare scenario name would be
  today.

---

## D. Maps — swipe, synced grid, absolute-diff, percent-diff, within the existing MapLibre/deck.gl stack

### D1. Swipe comparison (exactly 2 scenarios)

**Recommendation**: `maplibre-gl-compare` (https://github.com/maplibre/
maplibre-gl-compare) — a real, maintained, MapLibre-native fork of the
original `mapbox-gl-compare` pattern (confirmed via direct search; the
Mapbox original: https://docs.mapbox.com/mapbox-gl-js/example/mapbox-gl-
compare/), doing exactly the swipe/clip-reveal-between-two-map-instances
mechanism this task describes, with zero new library risk — it operates
on two ordinary `maplibregl.Map` instances via CSS clip-path, entirely
independent of whatever deck.gl overlay is attached to each one. This
app's `FlowMapPanel.tsx`/`ZoneMapPanel.tsx` both already construct
`maplibregl.Map` + (for FlowMap) `MapboxOverlay({ interleaved: true })`
in a mount-only effect (`FlowMapPanel.tsx:242,344`) — a swipe-comparison
component would mount TWO such map+overlay pairs (one per scenario, using
each scenario's already-existing data-fetch path unmodified) and hand
both `maplibregl.Map` instances to `maplibre-gl-compare`'s constructor;
no confirmed incompatibility was found between it and `MapboxOverlay`
interleaved mode (this pass's own search turned up no evidence either
way for that SPECIFIC combination — flagged as the one real thing to
verify empirically before implementation, not assumed safe purely from
this research).

### D2. Synced grid (2-4+ scenarios, zoom/pan locked together)

**Mechanism**: MapLibre's own `map.on('move', ...)` / `map.jumpTo()` (no
deck.gl involvement needed for the sync itself — just camera-state
mirroring across N `maplibregl.Map` instances, a well-established,
library-native pattern, not something requiring a new dependency).

**Evidenced practical ceiling — real, cited number, not a guess**: each
`maplibregl.Map` instance owns its own WebGL context; **Chromium enforces
a hard limit of 16 live WebGL contexts per page (8 on mobile browsers)**
— confirmed via this pass's own search of the real, current browser
behavior (multiple independently-reported sources: Chromium's documented
context-eviction behavior when the limit is exceeded, e.g. discussion
threads on the enso-org/esri/VTK issue trackers, all describing the
identical "oldest context lost" eviction once past the limit). Because
`FlowMapPanel.tsx` already uses `interleaved: true`
(`FlowMapPanel.tsx:344`, confirmed real per `012-webgl-context-
management`'s own already-shipped fix), a deck.gl overlay does NOT add a
second WebGL context per map — `CLAUDE.md`'s own non-negotiable notes
("interleaved: true alone is what keeps context count sustainable") — so
the real, structural ceiling for a synced FlowMap grid is genuinely ~16
MapLibre instances before the BROWSER starts evicting contexts, not 8.
**The PRACTICAL ceiling is lower than the structural one**: screen space
alone makes a useful map cell shrink below readable-flow-line-width
around 4-6 cells on an ordinary desktop viewport, and each additional
live MapLibre instance carries real, non-trivial tile-fetch/paint/raster
cost even before hitting the WebGL cap — **recommend a hard UI cap of 4
scenarios in synced-grid mode** (a 2×2 grid), independent of the ~16
structural ceiling, as the actually-usable number; the WebGL limit is
real headroom, not the binding constraint.

**Reconciling with the 8-10+ stream case**: a synced grid caps at 4 by
the above — the stream case (§C) does NOT feed the grid with all 8-10+
runs simultaneously; the SAME Year-A/Year-B (or Year-A/B/C/D, up to the
4-cell cap) selection pattern from §C composes identically here — the
trend chart (or a paired multi-`<Select>`) picks which ≤4 run-identities
populate the grid's cells, exactly mirroring how §C composes with the
small-multiples chart types.

### D3/D4. Absolute-diff and percent-diff choropleth layers

Both are a **pure ZoneMapPanel data/color change, not a new map
mechanism** — `ZoneMapPanelConfig` already extends
`ComparisonCapablePanelConfig` and `resolveQueryAndPairs()` already
resolves its `comparison: diff` query today (§A1's confirmed 5-panel-type
list includes ZoneMap) producing a `diff_value` column per zone,
consumed by whatever `zonemapColor.ts` color-scale logic already exists
for `color_scale: sequential | diverging` (`types.ts:427`) — **this part
of the request is already fully built for ZoneMap**, confirmed by the
type surface and `resolveQueryAndPairs()`'s own existing behavior; percent-
diff specifically is just an `expr` choice in the panel author's own
`comparison.diff.expr` string (`(b.value - a.value) / NULLIF(a.value, 0)
* 100` vs. absolute `b.value - a.value`) — a config-only difference, zero
code change either way. Nothing new to design here; flagged so this
research doesn't invent work that isn't needed.

---

## E. Shared "comparison mode" UI affordance

**Recommendation**: a small segmented control (2-3 options depending on
chart type) living in each comparison-capable panel's `CardHeader`
(`layout/panelCard.tsx:3`, `Card`/`CardHeader`/`CardTitle` already the
established chrome every panel renders through), immediately adjacent to
the existing scoped-expand trigger — the same chrome slot, not a new
panel-wide UI location. Concretely: `components/ui/select.tsx` (this
app's one existing dropdown primitive, already used for the Basemap tab's
raster-provider picker per `CLAUDE.md`'s Basemap-catalog section) styled
small/inline for the switcher case (B4/B5/D1's "which scenario/pair"
control), or a compact 2-button `radio-group.tsx`-based toggle (this
app's existing primitive for exclusive-choice controls) for the binary
"Small multiples / Diff" mode switch (B1b/D3-D4's cases) — no new
component primitive needs to be built; both already exist in
`components/ui/`.

This mirrors the closest existing cross-panel, scenario-facing precedent
in the app: the Scenarios-tab's own `Switch`-per-row +
"Baseline"/"Set as baseline" chip pattern (`037-scenarios-tab-redesign`,
CLAUDE.md's "Scenario activation" section) — a small, consistent,
un-modal control living right next to the thing it affects, not a
separate settings surface. The comparison-mode control proposed here is
the panel-level analog: it affects THIS panel's own rendering only (never
`appState.active`), so it belongs in `panelCard.tsx`'s header chrome, not
the global Settings modal.

**What differs per chart type, underneath the same control shape**:
switcher options list scenario/run names (B4/B5/D1); small-multiples-vs-
diff toggle options are `'Compare' | 'Diff'` (B1b/D3-D4); radar/recharts
need no control at all in the MVP sense — their comparison is already
"just render every active/selected scenario," no separate mode to pick
(though a future pass could still add the same toggle purely for a diff-
bar overlay on top of the existing grouped view, out of scope here).

---

## F. Relative effort, and required `panelQuery.ts`/`sqlExpander.ts` changes

| Recommendation | Relative effort | `panelQuery.ts`/`sqlExpander.ts` change needed? |
|---|---|---|
| B1 Treemap small multiples | Medium — new multi-root state + grid in `HierarchicalChartHost.tsx`, synced-hover pub/sub; renderer itself unchanged | **No** — client-side split of the already-unioned `$scenario` rows |
| B1b Treemap diff mode | Medium — new `hierarchyData.ts` diff-aware builder + diverging-color renderer branch | No — `comparison: diff` query already resolves; only consumption is new |
| B2 Sunburst small multiples | Small — identical mechanism to B1, same host | No |
| B3 Radar scenarioDisplay wiring | Small — port `RechartsPanel.tsx`'s existing `useScenarioDisplay()` call | No |
| B4 Pie switcher + diff-via-bar | Small — `<Select>` UI state + `scenario:` pin; diff view reuses the EXISTING recharts diff path unmodified | No |
| B5 Sankey switcher (default) | Small — same `<Select>` pattern as B4 | No |
| B5 Sankey diff mode | **Large** — new `buildDiffFlowGraph()` + width/sign-color renderer branch, genuinely new geometry logic | **Yes, narrow** — needs `compare_on: [source, target]` support to already flow correctly through `resolveQueryAndPairs()`; confirm `buildComparisonDiffQuery()`'s existing JOIN shape handles a 2-column `compare_on` correctly for Sankey's node-pair identity (likely already works — `compareOn: string[]` is already general, `panelQuery.ts:285`, `290`-`291` — flag for verification, not a structural gap) |
| C Trend-chart-drives-drilldown | Medium — new click/select interaction wiring on an existing recharts line/area panel, cross-panel "selected year(s)" shared state (a new small pub/sub store, `state/`-pattern) | No — reuses `scenario:`/`scenarios:` pins throughout |
| D1 Map swipe | Medium — new component wrapping 2× existing FlowMap/ZoneMap mount logic + `maplibre-gl-compare` (new dependency — confirmed real/maintained, not evaluated for the interleaved-mode interaction empirically in this pass) | No |
| D2 Map synced grid | Medium — N-instance camera-sync wiring, reuses existing panel mount logic per cell | No |
| D3/D4 Map abs/pct diff | **Trivial** — already fully built; config-only | No |
| E Shared control | Small — one new shared component, reuses `select.tsx`/`radio-group.tsx` | No |

**One real, structural data-layer dependency, flagged per this task's own
instruction not to design it here**: the time-series stream case (§C)
assumes a "run identity" that is genuinely `{scenario-family}-{year}` (an
axis this app's current `manifest.yaml`/scenario-name model treats as one
flat scenario name, e.g. `activitysim-baseline` — there is no first-class
"year" or "run family" dimension anywhere in `services/scenarioDiscovery.ts`
or the manifest schema today, confirmed by this pass not finding one).
Every §C/§B/§D-composition recommendation above that says "resolves to a
`scenario:` pin" is only as clean as that identity actually being a real,
individually-addressable scenario name at data-publish time — which is
already true today (each published run IS its own scenario folder) but
means a real WFRC deployment publishing 8-10+ timestamped runs will have
8-10+ literal scenario-name entries in `manifest.yaml`/`dashboard-*.yaml`
picker configs, with no automatic "this family of scenarios shares a
year axis" grouping metadata for the trend chart's own x-axis or the
switcher's own dropdown to organize by. This is NOT a blocker for
anything recommended above (flat scenario names work today, mechanically)
but is a real UX/authoring-ergonomics gap for a future, separately-scoped
data-layer pass to pick up if scenario COUNT in the stream case grows
past what a flat, ungrouped dropdown/legend stays legible at — flagged
per this task's own instruction, not designed further here.

---

## Summary

The bar chart's "comparison" is not bespoke — it's a `scenario` column
that already falls out of `$scenario`'s UNION-ALL for free, plus an
ordinary long-to-wide pivot Recharts' own multi-series rendering already
handles. That pattern already generalizes almost for free to Radar
(already shipped, just missing scenario-color wiring) and, with real new
work, to Treemap/Sunburst (small multiples, query layer already wired via
`comparison: diff`) and Pie/Sankey (scenario switcher, reusing the
already-real `scenario:` pin — diff mode for Sankey is the one genuinely
new, non-trivial piece of geometry logic in this whole document). Maps
reuse this app's existing MapLibre/deck.gl stack with one new, real,
low-risk dependency (`maplibre-gl-compare`) for swipe; grid-sync and
diff-color layers need no new library at all, and diff-color for ZoneMap
specifically is already fully built. The stream case is answered by a
single always-visible trend chart drilling into whichever 1-4 selected
years/scenarios feed every other chart type's own comparison mode from
Part B — one shared selection concept composing consistently across
every recommendation in this document, not five independent designs.
