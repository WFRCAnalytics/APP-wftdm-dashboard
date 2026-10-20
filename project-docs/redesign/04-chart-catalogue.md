# 04 — Chart catalogue

One entry per chart. Each entry gives: where it is used, the library, the data it needs (table names are
defined in file 06 §3), the exact visual rules, the legend, the interaction, the tooltip content, how it
behaves in Compare mode, and the prototype function to read for the details (all in
`prototype/src/`; `core2.js` = single-scenario D3/Plot charts, `core3.js` = compare-aware charts).

Global rules for **every** chart (file 01 §6 and file 05 apply on top):
- Read colors/fonts from `readChartTheme()` at draw time. Transparent background. 11.5px `--mute` axis text.
- Fill the tile body exactly; redraw when the body resizes.
- Tooltips use the shared tooltip (file 05). Do not use Plot's built-in `tip` marks or per-chart tooltip divs.
- Every mark that can be hovered carries `data-key` / `data-title` / `data-val` / `data-num` attributes when
  the chart can appear side by side (file 05 §4).
- In Compare mode the tile header carries the compare strategy chips (file 03 §4). The chart itself only
  needs to know `ViewContext` and (for `multi`) that it may be drawn small.
- Provide a Table view, or make sure the same numbers appear in the tooltip, for non-visual access.

Mode order everywhere: Drive alone, Shared ride, Transit, Walk, Bike, School bus. Purpose order: Work,
School, Shopping, Other, Non-home. Income order: Under $35k, $35k to $75k, $75k to $125k, Over $125k.

---

## 1. Mode share — Bars  (`modeBars`)
- **Library:** Observable Plot (`barY` faceted by mode).
- **Data:** `mode_share (scenario, mode, share)`; for Compare-by Purpose/Income: `mode_share_by_purpose`, `mode_share_by_income`.
- **Visual:** facets (`fx`) = the six modes (padding .14), inside each facet one bar per series (`x` band, paddingInner .1,
  paddingOuter .08). Margins `l40 b30 t14 r4`. y gridlines, 5 ticks, labels `NN%`. Bar radius `--chart-r`. Series colors:
  scenario colors (group *Scenario*), purpose `cat(i)` (group *Purpose*), income ramp (group *Income*).
- **Reference:** Values mode: a dashed ink line (1.6px, `4 3`) per facet at the reference value; if the reference is
  Observed and a margin of error exists, also a shaded ink 12% band (value ± moe). Change mode: bars diverge from a zero
  line; y ticks signed (`+1`, `−2`, with `%` in % mode).
- **Legend:** scenario / purpose / income chips + `Reference: <name>` with a dashed sample.
- **Tooltip (one per facet, lists every series):** title = mode; sub-title "share of trips" (or "change in points"/"percent change");
  rows sorted by value descending, hovered bar bold: swatch, name, value, and a muted delta vs reference
  (Values mode) or the underlying value (Change mode); then a bold reference row (`Observed 63.8% ±1.4`); footer
  with the observed source and sample size when the reference is Observed; "N more not shown" beyond 8 rows.
- **Compare:** `overlay`. Group-by (*Scenario / Purpose / Income*) changes what the series are.
- **Edge:** Change mode with only the reference selected → empty-state message (file 03 §9.2).

## 2. Mode share — Gap  (`gapDots`)
- **Library:** Observable Plot (`dot` on a band y-scale).
- **Visual:** y = the six modes (padding .5), x = difference from the reference, domain symmetric `±L` where
  `L = max(4, ceil(maxAbs/2)·2)`; ticks signed, axis title "Percentage points vs Observed" (or "Percent change…").
  A zero rule (ink, 55%); faint row rules (`--grid`). When reference is Observed and mode is Change: a shaded ±1 point band
  (`--ok` 12%). Dots r=5.5 with a 2px `--surface` ring.
- **Tooltip:** same shape as §1 (all series for that mode), sorted by absolute gap; each row flags "within error" in `--ok`
  when |gap| ≤ the observed margin of error.
- **Compare:** `overlay`; always a difference chart (Values mode is treated as Change).

## 3. 100% stacked bars  (`stacked`, used by `stackedTrips`, `stackedInc`, `stackedAuto`, `stackedScn`)
- **Library:** D3 (hand-rolled rects).
- **Data:** rows × categories of shares; row labels on the left (right-aligned, width `ml` 86–124px).
- **Visual:** bar height `min(38, rowStep·0.66)`, segment radius 5, 2px gap between segments, vertical guides at 25/50/75%.
  Segment label (`NN%`, or `N.N%` under 10) only when the segment is wider than 38px, text color by fill luminance.
  Segments < 0.4% are skipped.
- **Variants:** purpose×mode (colored by mode), income×mode (colored by mode), income×vehicles (ramp), scenario×mode
  (one row per compared scenario, the first row is the reference/Observed).
- **Interaction:** hovering a mode segment cross-highlights that mode in every other mode-colored chart (file 05 §3).
- **Tooltip:** title `Row · Category`; rows: Share (bold, swatch), "Of: <population>".
- **Compare:** `multi` (single-scenario variants) or `overlay` (the scenario×mode variant).

## 4. Slope  (`slope`)
- **Library:** Observable Plot (`line` + `dot` + `text`), y on a **log** scale (domain .8–90) so small modes stay readable.
- **Visual:** two columns: Observed and the focus scenario (if the focus is Observed, use the baseline). One line per mode in the
  mode color, width 3, round caps; dots r=5.5; labels left `Mode  63.8%` and right `61.2%  Mode`, `--ink`. Margins `l120 r120`.
- **Tooltip:** title = mode with swatch; rows for both columns.
- **Compare:** `switch`.

## 5. Donut with ranked list  (`donut`)
- **Library:** D3 (`pie`, `arc`). Inner radius 0.64·R, pad angle .012, corner radius 5.
- **Visual:** center shows `9.81M daily trips`; hover swaps to `61.2% Drive alone`. When the body is wider than 420px, a ranked list to the
  right: swatch, mode, share (bold), and a colored gap vs observed (`--ok` ≤1, `--warn` ≤2.5, else `--fail`) with the caption "vs observed, pts".
- **Interaction:** arc and list rows both cross-highlight the mode.
- **Compare:** `switch`, and `diff`: in Change mode the donut is **replaced** by the Mode share Bars chart showing the differences for the focus scenario.

## 6. Treemap  (`treemap`; kinds `trips`, `hh`, `vmt`)
- **Library:** D3 (`hierarchy`, `treemap`).
- **Data:** trips by purpose×mode; households by income×vehicles; VMT by county×road type.
- **Visual:** squarified, `paddingInner 3`, group header row of 22px (group name bold + muted total when ≥110px wide),
  leaf radius 6, leaf label (name + value) only when ≥ 66×40px. Group-by changes nesting: *Purpose › Mode*, *Mode › Purpose*
  (leaves colored by purpose `cat`), *Income › Mode*. Leaf colors: mode colors / purpose cats / ramps.
- **Difference (strategy `diff`, Change or % change):** geometry from the focus scenario; fill = diverging color by % change vs the
  reference cell (`clamp(change/25%, −1, 1)`); label gains a third item `+3.2%`.
- **Tooltip:** title `Group · Leaf`; rows: Total (bold, swatch) · Share of group · (diff) Change vs reference.
- **Compare:** `multi` (default) and `diff`. Cap 4 panels; shared color mapping across panels.

## 7. Sunburst  (`sunburst`)
- **Library:** D3 (`partition`, `arc`). Center radius 0.34·R. Pad angle .012, corner radius 4.
- **Visual:** two rings (group, leaf). Group ring in neutral shades (`neutral(i) = mix(--surface, --ink, .2 + .08·i)`), leaf ring in leaf colors.
  Group labels rotated along the arc when the arc is wider than .32 rad. Center: total + unit ("daily trips").
- **Interaction:** click a group arc to zoom into it (single ring); click the center to go back ("… · tap to go back"). Keep the existing tween.
- **Tooltip:** same as Treemap; group arcs say "Click to zoom in".
- **Compare:** `multi` only. Never apply a difference color here.

## 8. Sankey: purpose → mode → distance  (`sankey`)
- **Library:** D3 + `d3-sankey` (already a dependency). Node width 12, padding 10, extent inset 2/6px.
- **Visual:** three columns. Purpose nodes and distance-band nodes neutral (`mix(--surface,--ink,.5)`), mode nodes in mode colors. Links colored by mode at 40% opacity (75% on hover),
  link width = trips. Node labels with a 3px `--surface` halo; hide labels for nodes shorter than 9px. Links smaller than 5k trips are dropped.
- **Interaction:** hovering a link or mode node cross-highlights the mode everywhere.
- **Tooltip:** `Source → Target`; rows: Daily trips, Share of mode.
- **Compare:** `switch`. Never draw an unpinned multi-scenario union (the builder would sum scenarios silently).

## 9. Radar — calibration fingerprint  (`radar`)
- **Library:** D3 (hand-rolled polar geometry).
- **Visual:** one axis per submodel (8). Rings at thirds of the max; max = `max(6.5, ceil(maxError/2)·2 + 1)`. A dashed `--ok` polygon at 3% (the tolerance), filled `--ok` 8%.
  Series polygons: single series = `--c-1` at 22% fill; several = scenario/round colors at 12% fill, 2px stroke. Vertices r=5 (single series, colored by
  status) or r=4 (several). Axis labels outside the outer ring, colored `--warn`/`--fail` when the first series exceeds tolerance. Ring labels sit at the angle halfway between axes (so they never overlap axis labels).
- **Interaction:** a transparent 26px-wide hit line per axis shows the tooltip.
- **Tooltip:** title = submodel with the measure as sub-title; one row per compared series: error (bold for the first) and "within 3%" / "review" / "off target" in status color.
- **Compare:** `overlay`, up to 6 series. Forecast scenarios share base-year errors; rounds each have their own.

## 10. Trips through the day — Lines  (`timeLines`)
- **Library:** Observable Plot (`line`, `areaY`, `ruleY`) + the shared crosshair (file 05 §5).
- **Data:** `trips_by_hour (scenario, hour, trips)` and the group variants (mode, purpose, income) from file 06.
- **Visual:** x = 0–23 (ticks every 3 hours, labels `12a 3a … 9p`), y = thousand trips per hour (`200k`), 4 ticks. Group *Scenario*: one line per compared scenario,
  width 2.25, `monotone/catmull-rom` curve, round caps. Reference: dashed ink line with a faint ink 6% area under it. Change mode: lines of the
  difference, zero rule instead of the reference line, y ticks signed.
- **Group-by:** *Scenario* (default), *Mode*, *Purpose*, *Income*, *All trips*. Non-scenario groups plot the **focus** scenario only.
- **Tooltip:** one crosshair tooltip: title `6 AM`, sub-title "trips per hour"; one row per series sorted by value with swatch and value, plus the bold reference row.
- **Compare:** `overlay`; supports Change and % change.

## 11. Trips through the day — Stream  (`streamT`)
- **Library:** Observable Plot (`areaY` with `offset: 'wiggle'`, `order: 'inside-out'`, `curve: 'basis'`, 0.8px `--surface` stroke).
- **Visual:** no y axis; x like Lines. Group *Scenario* falls back to *Mode* (stacking scenarios is meaningless).
- **Tooltip:** crosshair; rows per band sorted by value with its % of the hour; footer "Total 812k trips in this hour".
- **Compare:** `switch`, `multi`.

## 12. Trips through the day — Heatmap  (`heatT`)
- **Library:** Observable Plot (`cell`, `sqrt` color 0–16%, `rx 4`, padding .08).
- **Visual:** rows = the group members (scenarios, modes, purposes or income groups); columns = 24 hours; fill = the **share of that row's trips** in that hour. Color from `mix(--surface, --c-1, .1)` to `--c-1`.
- **Tooltip:** row name, hour, "Share of its trips 8.4%".
- **Compare:** `overlay` (rows = scenarios when grouped by scenario).

## 13. Average speed — Heatmap  (`heat` kind `speed`)
- **Library:** Observable Plot (`cell`), rows = Freeway, Arterial, Collector, Local; columns = hours; linear color 10→62 mph from `--c-1` (slow) to a faint tint (fast).
- **Tooltip:** facility, hour, "Average speed 33 mph". **Compare:** `multi`.

## 14. District flows — Chord  (`chord`)
- **Library:** D3 (`chord`, `ribbon`, `arc`). Radius = min(w,h)/2 − 58, pad angle .05, ribbons 55% opacity (80% on hover), arc thickness 10, labels outside.
- **Data:** `od_district (origin, destination, trips)`. Trips that stay inside a district are **left out** (they dominate).
- **Interaction:** hovering a district dims all ribbons not touching it. Districts colored with `cat(i)`.
- **Tooltip:** `A → B`; rows: Daily trips (bold, swatch), In return.
- **Compare:** `switch`. A Table view shows the full matrix.

## 15. Trip length distribution — Ridgeline  (`ridge`)
- **Library:** D3 (`area`, `line`, `curveBasis`). One ridge per purpose, ridge height 1.75× row height, overlapping.
- **Data:** `trip_length_frequency (scenario, purpose, distance_bin, share)`; the prototype fits gamma curves.
- **Visual:** x 0–30 mi (ticks every 5; last labeled "mi"); modeled fill = `mix(--c-1, --surface, .12 + .05·i)` with a 1.5px `--surface` stroke; observed = dashed ink line (1.3px). Mean markers `12.2 mi avg` drawn in a **second pass** (so later ridges do not cover them), with a surface halo; hidden when rows are shorter than 46px.
- **Tooltip (spec; prototype has none):** purpose, mean distance modeled vs observed, share under 2 miles.
- **Compare:** `multi`.

## 16. Population pyramid  (`pyramid`)
- **Library:** Observable Plot (`barX`, `tickX`, `ruleX`). 17 age bands, males negative.
- **Visual:** bars = synthetic population (`--c-1` males, `--c-2` females), a 1.6px ink tick at the census estimate. x ticks `100k 50k 0k`.
- **Tooltip:** `Age 25-29`; rows: sex value (bold), Census estimate, Difference.
- **Compare:** none (same in every scenario) — shows the "Same in every scenario" badge.

## 17. Auto ownership — Waffle  (`waffle`)
- **Library:** D3. 10×10 grid of rounded squares (gap 3, radius ≈ 20%), filled bottom-up in category order using the **largest-remainder** method so counts sum to exactly 100. Colors: the vehicle ramp (secondary, 5 steps).
- **Legend (when body > 380px):** to the right, one row per category: swatch, label, percent (bold). Caption "Each square is 1% of 912k households".
- **Interaction:** hover a square or a legend row: dim all other categories to 18%. **Side by side:** hovering a category highlights it in every panel and one tooltip lists all scenarios (file 05 §4).
- **Compare:** `multi`.

## 18. Dumbbell  (`dumbbell`; kinds `boards`, `hh`)
- **Library:** Observable Plot (`ruleY`, `link`, `dot`).
- **Visual:** rows = transit lines (or income groups), x = value (`k` or `%`); a light 5px rounded connector from min to max across Observed and the compared scenarios; scenario dots r=6 with a 2px surface ring; **Observed = open circle** (r 7.5, ink stroke 2.2, surface fill).
- **Tooltip:** one per row listing every scenario sorted by value with its difference from Observed; bold Observed row; footer with the observed source and sample size.
- **Compare:** `overlay`.

## 19. Zone map — Values  (`zoneMap`)
- **Library:** MapLibre GL in the product (prototype fakes it with D3). Zones are a GeoParquet choropleth drawn by `ST_GeomFromWKB()` → GeoJSON as today. Never use `ST_Read()`.
- **Visual:** sequential fill from `--surface` to `--c-1`, domain 0–14% transit share; zone outlines 0.6px `--line`; the rail line 2.2px ink with 4px station dots (surface fill, ink stroke 2px). Basemap underneath at 80% zone opacity (zones are fully opaque when the basemap is "Zones only").
- **Controls (top-right):** + / − / reset in a 30px-wide bordered group. **Legend (bottom-left):** gradient bar 150×7px with `0%` and `14%+ transit share`. **Caption chip (top-left):** scenario name.
- **Interaction:** hover shows the zone tooltip and outlines the zone; click pins/outlines it; scroll zooms.
- **Tooltip:** `TAZ 1413`; rows: Transit share (bold, swatch with the fill color), Residents.
- **Compare:** `grid` (default) and `switch`. `grid` = §22.

## 20. Zone map — Difference  (`diffMap`)
- Fill = difference between the focus and the reference scenario per zone (Change in points, or % change), diverging (secondary ← mid → primary), domain `±` the 96th percentile of absolute values. If the reference is Observed, use the baseline and say so in the caption. Caption chip: "Frequent transit minus Baseline". Legend: gradient with `−4.1 pts · 0 · +4.1 pts`.
- **Tooltip:** `TAZ`; rows: Change vs <ref> (bold, swatch), focus value, reference value.
- **Compare-only view.**

## 21. Zone map — Swipe  (`swipeMap`)
- Two maps, one container. Reference on the left of the divider, focus on the right, both with the *Values* ramp. Divider: 3px ink line with a 30px round grip (arrows); draggable; focusable `role="slider"`, arrow keys ±24px, clamp 24px from each edge. Labels top-left/top-right. Wheel zooms both; dragging the handle must not pan the map.
- **Compare-only view.** Use `maplibre-gl-compare` (file 03 §4.2).

## 22. Zone maps — side by side with linked camera  (`grid`)
- Up to 4 panels per page: the reference first, then compared scenarios. All panels share one zoom/pan; any wheel/drag on one moves all. One shared control group top-right with the caption "Zoom and pan are linked". The camera survives redraws and paging.
- Hover sync: hovering a zone highlights the same zone in all panels (ink outline 2.4px) and shows **one** tooltip with every scenario's value and the change vs the reference (file 05 §4).

## 23. Scenario scorecard  (`scoreTable`)  — compare only
- HTML table in the tile body (scrolls; sticky header). Columns: Scenario (dot, name, tag chip) + the headline metrics (file 03 §5.5). Reference row first, bold, tagged "Reference". Numerals mono right-aligned, header cells two-line (label + unit). Shaded cells (file 03 §5.5). Header click sorts; `aria-sort`; keyboard Enter works.
- Height of the tile body: `min(560, 120 + 40 × rows)`.

## 24. Ranked by metric  (`rank`)  — compare only
- **Library:** Observable Plot (`barX`, `text`, `ruleX`). Bars sorted descending, scenario colors, radius 4, value label at the bar end (6px offset; negative values labelled on the left), `x.inset: 40` so labels never touch axis text. Values mode: a dashed ink rule at the reference value. Change modes: bars diverge from zero.
- **Group-by = Metric** (the scorecard metrics). Guard: do not draw below 320px width.
- **Tooltip:** scenario (swatch) with the metric value (bold) and the reference value.

## 25. Across model years  (`yearsTrend`)
- **Library:** Observable Plot (`line` monotone-x, `dot`, `ruleX`) + shared crosshair with a **snap** function.
- **Visual:** x = 2023–2055 numeric with ticks at the milestone years only (as strings, no thousands separator), inset 8; one line per compared independent scenario (rounds excluded), width 2.4, dots r=4.5 with a surface ring; dashed ink vertical rule at the current year; hollow ink dot at the base year for the Observed value when the metric has one.
- **Group-by = Metric** (default transit share). Change modes plot `scenario − reference` per year (reference resolved at the same year; Observed becomes the baseline).
- **Interaction:** crosshair snaps to milestones; **click switches the dashboard's year**.
- **Tooltip:** title `2036`, sub-title the milestone name (`End of RTP Phase I`); rows per scenario sorted by value; bold reference row; footer "Click to switch the dashboard to 2036."

## 26. Calibration progress  (`traceLines`, `traceValues`, `traceHeat`)  — base year only
- **Library:** Observable Plot + the shared crosshair (lines) / `arm()` (heatmap).
- **Metric group-by:** Mode share · Volumes · Boardings by line · Submodel error (file 03 §7.3).
- **Difference view:** x = round 1…50 (ticks 1, 10, 20, 30, 40, 50), y = difference from observed (points or %, signed ticks; for submodel error plain `%`). A target band (`--ok` 9%) with dashed edges. One line per series (1.9px, `monotone-x`). Selected rounds: vertical rules in their ramp colors (the focused round in `--ink`), 2px, 75%.
- **Values view:** raw values; per series a dashed observed line in the series color.
- **Heatmap view:** rows = series, columns = rounds (`rx 3`, padding .06); diverging fill (negative `--c-2`, positive `--c-1`); for submodel error a green→amber→red scale on 0/3/6/12%.
- **Legend:** series chips (colors per metric group) + a `--ok` chip with the tolerance text ("±1 point of observed").
- **Interaction:** crosshair snaps to integer rounds. **Click focuses that round; shift-click toggles it in the compare set.**
- **Tooltip:** title `Round 10`, sub-title ("vs observed" / "worst-segment error"); rows per series sorted by absolute gap with value and gap; footer "7 of 8 within ±1 point of observed. Click to focus this round, shift-click to compare."

## 27. Hero sparkline
64×22 SVG path, `monotone` curve, stroke `--accent` 2px, round caps, no fill, no axes. See file 02 §1.4.
