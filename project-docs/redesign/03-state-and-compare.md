# 03 — State model and the compare framework

This file defines what the dashboard remembers, how that turns into what each chart shows, and how
"compare" works for every chart family. It also says how to build each strategy on the **existing**
query architecture (`$scenario` unions, `scenario:`/`scenarios:` pins, `comparison: diff`), so nothing
needs to be invented at the SQL layer. Background research: `specs/062-comparison-framework-research/research.md`.

## 1. Global state

Keep state in plain in-memory TypeScript modules (the repo forbids `localStorage`). Extend the existing
`state/appState.ts` (it already owns `active`, `baseline`, label and color overrides, reorder) and add
`state/compareState.ts`. Use `useSyncExternalStore` hooks as the repo does today.

```ts
// state/compareState.ts  (new)
export type DisplayMode = 'val' | 'abs' | 'pct';          // Values · Change · % change
export type ReferenceSpec =
  | { kind: 'observed' }                                   // base year only
  | { kind: 'scenario'; name: string }                     // any scenario or calibration round
  | { kind: 'self-base-year' };                            // each scenario against itself in the base year

export interface CompareState {
  compare: boolean;            // global Compare mode
  focus: string;               // focus scenario name
  reference: ReferenceSpec;
  display: DisplayMode;        // only meaningful when compare is true
  year: number;                // model year, one of manifest.years[].year
}
// existing appState (keep): active: Set<string> (the compare set), baseline: string,
//   labelOverrides, colorOverrides, order, safePalette flag, etc.
```

Per-tile state (session only, keyed `pageId:tileId`; survives page switches, resets on reload):

```ts
export interface TileState {
  view?: string;        // chosen view key, default = first view in YAML
  group?: string;       // chosen group-by key, default = first group
  strategy?: Strategy;  // chosen compare strategy; default = view's first strategy
  scenario?: string;    // the local scenario for the 'switch' strategy
  page?: number;        // pager index for 'multi' / 'grid'
  mapGroup?: string;    // synced-map group id (generated once per tile)
}
```

### 1.1 Defaults
| Field | Default |
|---|---|
| `compare` | `true` if the deployment has ≥ 2 independent scenarios, else `false` |
| `focus` | the baseline scenario, or the first scenario if none is marked |
| `active` (compare set) | baseline plus up to two other scenarios (so the first Compare view is readable) |
| `reference` | `{kind:'observed'}` when Compare is off in the base year; `{kind:'scenario', name: baseline}` when Compare is turned on |
| `display` | `'val'` |
| `year` | the deployment's `default_year` (config), else the base year |

## 2. The view context passed to every tile

Never let a chart read the global state directly. Compute **one immutable context object** from the global
state and pass it to every tile. A chart may use only these fields.

```ts
export interface ViewContext {
  compare: boolean;
  focus: string;
  active: string[];            // ordered scenario names the chart should show (see rules)
  reference: string;           // resolved reference scenario name, or 'Observed'
  referenceKind: 'observed' | 'scenario' | 'self-base-year';
  display: DisplayMode;        // 'val' whenever compare is false
  year: number;
  baseYear: number;
  isBaseYear: boolean;
  pickScenario(name: string, additive: boolean): void;   // click / shift-click on round or year charts
  setYear(y: number): void;
}
```

Resolution rules (write them as one pure function `resolveViewContext(state, manifest)` and unit-test it):

1. If `compare` is **false**: `active = [focus]`, `display = 'val'`, and the reference line is
   `Observed` when `isBaseYear`, otherwise the baseline scenario. (Reason: Observed exists only for the base year.)
2. If `compare` is **true**: `active = order-filtered(compare set)`. `display` as chosen.
3. Observed rules: if `year !== baseYear`, `reference` can never be Observed. If the stored reference is
   Observed (or a calibration round) and the year changes to a non-base year, silently switch the reference to
   the baseline scenario.
4. Calibration rounds exist only in the base year. When the year changes to a non-base year: remove every
   round from the compare set; if the focus is a round, set the focus to the baseline.
5. `reference` of kind `self-base-year` is meaningful only when `year !== baseYear`; the option is hidden in
   the base year. Its per-scenario resolution is in §5.4.
6. If the compare set becomes empty, add the focus back. The set can never be empty.
7. The focus does not have to be in the compare set; single-scenario charts use the focus, overlay charts use the set.

## 3. Compare mode

**Off:** every tile shows the focus scenario only. Nothing else about the scenario set matters. This also
covers deployments with a single scenario (the Compare toggle and everything after it are hidden).

**On:** the scenario picker, reference and display mode appear. Every tile now answers the comparison
question in the way that suits it (§4). The toggle itself never changes the compare set.

Turning Compare on for the first time sets the reference to the baseline. Turning it off hides the picker
popover, keeps the compare set and reference in memory, and restores them when it is turned on again.

## 4. Compare strategies (per tile, per view)

A **strategy** says how a tile draws a comparison. Each *view* of a tile declares the strategies it supports,
the first being the default. The user can switch among them with the tile's *Compare as* control.

| Strategy | What the user sees | Typical cap |
|---|---|---|
| `overlay` | All compared scenarios drawn on the same axes (grouped bars, lines, dots, table columns). The reference is a dashed line or a zero line. | Colors for all; readable to ~15 |
| `diff` | One panel for the focus scenario, colored/sized by its difference from the reference. | 1 |
| `multi` | Side-by-side small multiples: the reference first, then compared scenarios, with shared scales. Paged. | 4 panels per page (3 + the reference) |
| `grid` | Same as `multi` but for maps, with **linked zoom and pan**. | 4 per page |
| `switch` | One chart, with a local *Scenario* select (defaults to the focus). | 1 |
| `swipe` | Two maps overlaid with a draggable divider: reference on the left, focus on the right. | 2 |

Why not one pattern for everything (evidence from the research):
- Pies and Sankeys do not work as small multiples (angle judgements across circles; Sankey layouts differ per
  scenario). They use `switch`. A donut turns into a difference bar chart in Change mode.
- A sunburst's ring depth already carries meaning, so a difference color competes with it: sunbursts offer
  `multi` only. A treemap offers `multi` and `diff`.
- Maps are separate WebGL contexts; browsers evict contexts past ~16. Cap side-by-side maps at 4 per page.
- Radar polygons become unreadable beyond ~4–6; cap overlay at 6.

### 4.1 Strategy matrix (the demo content; copy for YAML defaults)

| Tile | View | Strategies (first = default) | Supports Change / % change |
|---|---|---|---|
| Trips by purpose and mode | Treemap | `multi`, `diff` | yes (diff colors cells) |
| | Sunburst | `multi` | no |
| | Flow (Sankey) | `switch` | no |
| | 100% bars | `multi` | no |
| Mode share | Bars | `overlay` | yes |
| | Gap | `overlay` | yes (always a difference chart) |
| | 100% bars | `overlay` (one bar per scenario + Observed) | no |
| | Slope | `switch` | no |
| | Donut | `switch`, `diff` (diff = bars) | yes |
| | Table | `overlay` | no |
| Calibration fingerprint | Radar, Table | `overlay` (≤ 6) | no |
| Trips through the day | Lines | `overlay` | yes (lines of differences) |
| | Stream | `switch`, `multi` | no |
| | Heatmap | `overlay` (one row per scenario) | no |
| Where transit grows (map) | Values | `grid`, `switch` | no |
| | Difference | `diff` (compare only) | yes |
| | Swipe | `swipe` (compare only) | n/a |
| District flows | Chord, Table | `switch` | no |
| Auto ownership | Waffle, Sunburst, Treemap, 100% bars | `multi` | no |
| | Dumbbell | `overlay` | no |
| Population by age and sex | Pyramid | none (same in every scenario) | n/a |
| Trip length distribution | Ridgeline | `multi` | no |
| Mode share by household income | 100% bars | `multi` | no |
| Purpose→mode→distance | Flow | `switch` | no |
| Transit boardings by line | Dumbbell | `overlay` | no |
| Average speed by hour | Heatmap | `multi` | no |
| Vehicle miles | Treemap, Sunburst | `multi` | no |
| Scenario scorecard (compare only) | Matrix | `overlay` | yes |
| Ranked by metric (compare only) | Bars | `overlay` | yes |
| Across model years | Lines | `overlay` | yes |
| Calibration progress (base year only) | Difference, Values, Heatmap | none (it already shows every round) | n/a |

If the user picks Change or % change and a view does not support it, **do not blank the chart.** Keep showing
values, and the tile header shows the neutral badge from file 02 §2 ("Side by side" etc.).

### 4.2 How to build each strategy on the existing architecture

The current app already has the primitives. Use them; do not add a parallel data path.

**`overlay`.** An unpinned panel (no `scenario:`/`scenarios:` key) reads `$scenario.<metric>`, which expands
to a `UNION ALL` of every *active* scenario with a literal `scenario` column
(`sqlExpander.ts#expandScenario`). Observable Plot marks with `fill: scenario` or `stroke: scenario` already
group by that column and resolve per-scenario color and label (`observablePlotEncoding.ts#isScenarioColor`,
`scenarioDisplay.ts`). The redesign changes what "active" means: it is `ViewContext.active`, not the raw
`appState.active`. Implement by making `useActiveScenarios()` return `ctx.active`.
Hazard found in the research: Treemap, Sunburst, Sankey and Pie **silently sum across scenarios** if left
unpinned with several active (their builders ignore the `scenario` column). The `CompareHost` below must
therefore *never* hand them an unpinned multi-scenario union: use `multi` or `switch` for those types.

**`switch`.** Pin the panel: pass `config={{...config, scenario: localScenario}}`. The pin bypasses the active
set (`panelQuery.ts#resolveActiveScenarios`). The tile header shows the *Scenario* select.

**`multi` / `grid`.** Render N copies of the same panel component, each pinned to a different scenario
(`scenario: name`), the reference first. Use one shared color/size resolver so categories keep identical
colors in every copy (compute `buildColorResolver()` once, from the union of categories). Split work client
side where possible: one query returning all scenarios, split by the `scenario` column, avoids N queries.
Paging: cap = 4 panels (reference + 3). The pager shows "Scenarios 1–3 of 8" with ‹ › buttons.
Cell chrome: a 14px-radius box with a caption chip at the top-left (color dot, scenario label, and the word
"reference" on the first cell). Panels share scale domains (same max for sizes and colors).
For maps (`grid`): create one `maplibregl.Map` per cell and link cameras: on `move` of any map call
`jumpTo` on the others with a re-entrancy guard (`silent` flag). Add one shared control group (zoom in, zoom
out, reset, and the label "Zoom and pan are linked") on the tile. Hover sync: see file 05.

**`diff`.** Use the existing `comparison: { type: 'diff', a, b, expr }` query (wired for Observable Plot, Table,
ZoneMap, and structurally for Treemap/Sunburst through `resolveQueryAndPairs()`): `a` is the reference
scenario, `b` is the focus. `expr` is `b.value - a.value` for Change and
`(b.value - a.value) / NULLIF(a.value, 0) * 100` for % change; the global display mode picks which expr.
New work required (small): (1) `observablePlotEncoding.ts`: a bar/dot `fill` bound to the difference column
needs a **diverging, zero-anchored** color scale (Plot `color: {type:'diverging', pivot:0}`), because today
numeric color detection is limited to cell/rect marks; (2) `hierarchyData.ts` + treemap renderer: color each
leaf by percent change from the reference while the **geometry** comes from the focus (areas must never be
negative); (3) ZoneMap diff already exists; style it with the diverging ramp in file 01 §5.4.

**`swipe`.** Two maps (reference, focus) in one container; the top map is clipped by a movable x position.
Use `maplibre-gl-compare` (maintained, MapLibre-native) or the equivalent CSS clip-path. Verify with
`MapboxOverlay({interleaved:true})` before relying on it (the research flagged this as unverified).
The handle is a 28px-wide drag target with a round grip, `role="slider"`, arrow keys move it by 24px. Labels
top-left (reference) and top-right (focus). Zoom and pan are shared.

### 4.3 The `CompareHost` wrapper (new)

Create `panels/CompareHost.tsx`. Every data-bound panel is rendered through it. Responsibilities:
1. Read `ViewContext`, the tile config and `TileState`.
2. Decide the strategy: `tileState.strategy ?? view.compare[0]`, but force `none` when `compare` is off or the
   tile is flagged `scenario_independent`.
3. Render according to §4.2 and hand the real panel component a plain `PanelConfig` (with `scenario` pins
   already applied), so panel components need no compare logic.
4. Render the tile chrome pieces that depend on the strategy (compare-as control, local scenario select, badges).
5. Own the pager and the synced-map group.
Panel components stay ignorant of Compare. This keeps the 14 existing panel types intact.

## 5. Reference, Values, Change, % change

### 5.1 Definitions
For a displayed number `a` (a scenario's value) and a reference value `r` (the same quantity for the reference):

```
Values   : a
Change   : a − r                       (same unit as the metric; shares in percentage points)
% change : (a / r − 1) × 100           (if r = 0 or missing → show "n/a", draw nothing)
```
These apply to **whatever the chart measures**: mode-share points, trips, VMT, boardings, trip length,
per-zone transit share, per-hour trips, cell values in a treemap. There is no single "the metric".

Formatting (`formatDelta(v, mode, decimals)`): sign `+` for positive, `−` (U+2212) for negative, nothing
for zero (|v| < 0.005); `%` suffix for % change; for share charts append ` pts` in tooltips and axis
titles read "Percentage points"; one decimal by default (`dec` per metric: trips 2, share 1, VMT 1, boardings 0, trip length 1).
Axes in Change mode are **centered on zero** with a visible zero line. Never color differences as good/bad.

### 5.2 Reference = Observed
Available only in the base year. Observed values are aggregates with a source and sample size and,
where known, a margin of error (file 06 §6). Tooltips and legends say "Observed". Charts draw the observed
value as a **dashed ink line** and, if a margin of error exists, a shaded band (ink 12%) around it.
Zone-level observed data does not exist yet: maps fall back to the baseline scenario as reference and say so
in their caption chip. When observed zone data is added later, remove the fallback.

### 5.3 Reference = a scenario
Any independent scenario, or (base year) any calibration round. The reference itself is excluded from
Change/% change charts (it would be zero) except where it provides the zero line. It is still shown first in
side-by-side views and as the first row of the scorecard.

### 5.4 Reference = same scenario in the base year ("growth view")
New. For each compared scenario `s` at model year `y ≠ base`, the reference value is `value(s, base)` — that
scenario's own base-year run. It answers "how much did this alternative grow or shrink since the base year?"
for **any chart's metric** (mode share in points, VMT in percent, a zone's share, an hour's trips).
- Needs the base-year run of the same alternative. The data layer therefore keys runs by
  `(alternative, year)` (file 06 §4). If a base-year run is missing for an alternative, that alternative shows
  values only and a small "no base-year run" caption.
- Growth and decline both occur; the two-direction diverging scale handles both. Because every alternative is
  usually identical in the base year, this reference is mostly informational, but it is the right way to see growth.
- Not implemented in the prototype. Implement it in P5 (file 07). The control-bar option appears only when
  `year !== baseYear`.

### 5.5 Scorecard
Columns are fixed headline metrics (daily trips, drive-alone share, transit share, walk+bike share, daily VMT,
transit boardings, average trip length; deployer-configurable). Rows: the reference first (bold, with a
"Reference" tag), then the compared scenarios (sortable by clicking a column header; `aria-sort` set).
Cell text per display mode: Values = the value; Change = `a − r`; % change = `(a/r − 1)·100`. Cell **shading**
always shows the % distance from the reference, scaled per column to that column's max absolute % (so each
column uses its full color range): `color-mix(in srgb, <secondary if negative else primary> N%, transparent)`
with `N = round(|x| × 38)`. Neutral, not good/bad.

## 6. Model years

### 6.1 Concept
Every alternative has one run for each model year. Milestones for WFRC (configure per deployment):
2023 Base year · 2027 Opening year · 2032 End of STIP · 2036 End of RTP Phase I · 2046 End of RTP Phase II ·
2055 Horizon year. Most alternatives are identical in the base year; a few may differ. **Never hard-code
"identical in the base year" — detect it from the data** (file 02 §6).

### 6.2 UI
- The **Year** select in the control bar changes the year for the whole dashboard at once.
- All tiles re-query for the selected year. Observed data and calibration rounds belong to the base year and
  disappear from selectors outside it (rules in §2).
- **Across model years** tile (file 04 §25): lines per compared scenario over the milestone years, a vertical
  dashed rule at the current year, a hollow ink dot for observed at the base year, a crosshair that snaps to
  milestones, a tooltip listing every scenario, and **click to switch the whole dashboard to that year**.
  Group-by here is the *metric* (any scorecard metric; default transit share). It honors Change / % change
  with the reference resolved per year (`reference scenario at the same year`, or `self-base-year`).
- Sparklines in the hero show the focus scenario's values at each milestone year.

### 6.3 Data loading
Registering a scenario means registering its run for the current year. On a year change, call
`ensureRegistered()` for the visible tiles' `(scenario, year, metric)` triples (lazy, as today) and clear any
cached results keyed by year. Keep the per-tile cache key `(metric, scenarios, year, reference, display)`.

## 7. Calibration rounds

### 7.1 Concept
Rounds are an **ordered series of base-year runs** (50 or more) that converge on the observed data. They are
not independent scenarios. They have their own tag ("Calibration round"), their own **sequential** color
ramp (file 01 §5.3), and their own selector (the round strip in the picker). They participate in comparisons
exactly like scenarios once selected, so every chart, the scorecard and the radar can compare Round 1, 10 and 50.

### 7.2 Selecting rounds
- Picker strip: click a tick to toggle a round in the compare set. Shortcuts: Last, Best, Every 10th, Clear.
  *Best* = the round with the lowest mean of its submodel errors; it is only a convenience, the dashboard
  never shows that mean as a headline number (the team tracks mode share, volumes etc. in their own charts).
- Calibration progress tile: click a round to **focus** it; shift-click to **add or remove it from the
  compare set**. Selected rounds are marked by vertical rules colored with their ramp color (the focused round in `--ink`).
- The Focus and Reference selects list rounds in an *optgroup* after the scenarios.

### 7.3 What the progress tile plots
The user chooses the **Metric** (group-by): *Mode share* (one line per mode), *Volumes* (trips, VMT,
boardings, trip length, as percent difference from observed), *Boardings by line* (percent difference per
line), *Submodel error* (worst-segment error per submodel). Views: **Difference** (gap to observed with the
target band shaded), **Values** (raw lines with a dashed observed line per series), **Heatmap** (round × series,
diverging color; for submodel error a green→amber→red scale). Target bands: mode share ±1 pt, volumes ±5%,
boardings ±10%, submodel error 3%. (Prototype values; make them deployer-configurable `tolerance:` per metric.)

### 7.4 Data
Do not load 50 scenario folders to draw the trace. Publish one roll-up Parquet for the family
(`calibration_by_round.parquet`: `round, series, metric_group, value, observed`) and load individual round
folders lazily only when a round is selected. See file 06 §5.

## 8. Data flow in one picture

```
user action ──► compareState / appState ──► resolveViewContext() ──► ViewContext
                                                                  │
                    ┌─────────────────────────────────────────────┤
                    ▼                                             ▼
              ControlBar, picker                          every Tile → CompareHost
                                                            │  picks strategy
                                                            ├─ overlay → unpinned $scenario union (ctx.active)
                                                            ├─ switch  → scenario: pin
                                                            ├─ multi   → N pinned copies + synced hover
                                                            ├─ grid    → N MapLibre maps, linked cameras
                                                            ├─ diff    → comparison: diff query
                                                            └─ swipe   → 2 maps + clip
                                                          panel redraws; tooltip system handles hover (file 05)
```
Redraw policy: a tile redraws when its inputs change (view, group, strategy, context fields it uses, theme,
fonts, size, container resize). A chart redraw must be a pure function of its inputs. Debounce container
resize at one animation frame. Never loop: measuring must use the content box of a fixed-height container.

## 9. Edge cases (each needs a test)

1. One scenario only: no Compare, no Reference, no picker. Everything shows the focus.
2. Compare on with the compare set equal to `{focus}`: overlay charts show one series; Change mode shows an
   empty-state line "Choose a scenario other than the reference to see differences."
3. Reference equals the only compared scenario: same message.
4. Focus not in the compare set: single-scenario views use the focus; overlay views use the set.
5. Year change while a calibration round is focused or referenced: reset as in §2 rule 3–4.
6. 15 scenarios selected: overlay charts stay readable (bar widths ≥ 8px), tooltips show the top 8 rows plus the
   hovered one and "N more not shown", the scorecard scrolls, the legend scrolls (max 70px).
7. 50 rounds: only selected rounds are loaded; the trace tile uses the roll-up file.
8. Reference value 0: % change shows "n/a" and draws nothing for that item.
9. Missing run for (scenario, year): tile shows "No data for {Scenario} in {year}."; others continue.
10. Theme/color/font/text-size change: everything redraws; scenario colors are recomputed.
11. Expand overlay open while state changes: the overlay re-renders its tile.
12. Browser window narrower than 480px body: side-by-side stacks to one column.
