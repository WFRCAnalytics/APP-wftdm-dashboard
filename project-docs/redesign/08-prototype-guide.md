# 08 — Prototype guide

The prototype is a **reference for behavior and look**, not production code. It is plain JavaScript with
D3 and Observable Plot loaded from CDNs, sample data generated in code, and fake maps. This file says how to
run it, where everything is, what is deliberately fake, and the pitfalls discovered while building it.

## 1. Run it
- Easiest: open `prototype/corridor-pro.html` in a browser (internet required for the CDNs and Google Fonts).
  It is a single self-contained file, already built.
- Rebuild from source (Python 3): from `prototype/src/` run `python build2.py shell.template`. It reads
  `shell.template.html`, inlines `scen.js`, `core.js`, `tt.js`, `core2.js`, `core3.js`, `pages.js`, and writes
  `pub-shell.template.html` (no doctype; for publishing as an artifact) and `out-shell.template.html`
  (with a doctype; open this one locally).
- Quick tour (do this before reading code): toggle **Compare**; open the **scenario picker** and use the round strip;
  change **Year** (2023 shows rounds and Observed; 2036 shows alternatives differing); switch **Show** to Change;
  hover bars, a waffle in side-by-side mode, a map zone; zoom one map in the side-by-side set; try each **view**
  switch and **Group by**; open **Settings** (bottom of the left nav) and visit every tab; toggle light/dark.

## 2. Files

| File | Role |
|---|---|
| `src/shell.template.html` | All shell CSS, the page markup, and the render code: nav, control bar, picker, hero, tile chrome, expand overlay, Settings modal (4 tabs), docs text. Section order in the file: CSS tokens → components → markup → script (state `S`, `LAY` layouts, `render()`). |
| `src/scen.js` | Sample data: 15 scenarios (definition rows: share deltas, trips, VMT, boardings multipliers, trip length, zero-car factor, zone effects, speed, time-of-day effect, flow factor), 50 calibration rounds (decaying noise), milestone years and growth/effect-ramp factors, observed metadata (`OBS`), `setYear()`, `valAt()`, default and colour-blind-safe palettes. **Fake data; replace with Parquet.** |
| `src/core.js` | Shared helpers and legacy charts: tokens reader `tok()`, scenario color/label overrides (`scColor`, `lab`, `setSafe`), `legendHTML`, basemap stand-ins (`BM`, `baseLayer`), `zoneMap` (+ linked camera registry `MS`/`mapSync`), `calRows`, `themeEditor`, `accents()`. Old `modeBars/gapDots/todLine` here are unused; use `core3.js` versions. |
| `src/tt.js` | The tooltip service: `html`, `show`, `hide`, `arm` (Plot), `cross` (crosshair). Translate to `src/services/tooltip.ts` + `src/panels/plotInteraction.ts`. |
| `src/core2.js` | Single-scenario charts and data builders: `treemap`, `sunburst`, `sankey`, `donut`, `stacked*`, `radar`, `chord`, `ridge`, `pyramid`, `waffle`, `heat` (speed/purpose), `stream`, `slope`, `dumbbell`, `htmlTable`, `modeTbl`, `calTbl`; helpers `K()` (color system), `PM()` (purpose×mode matrix by iterative proportional fitting), `modeHour`, `autoRow`, `speed`. |
| `src/core3.js` | Compare-aware charts: `modeBars`, `gapDots`, `timeLines`, `streamT`, `heatT`, `diffMap`, `swipeMap`, `scoreTable`, `rank`, `stackedScn`, `yearsTrend`, `traceLines/Values/Heat` + `traceMeta`; helpers `dv` (difference), `fD` (format), `METRICS`. |
| `src/pages.js` | Tile catalogue (`WF.TILES`: views, groups, compare strategies, parquet names, about text), `NAV`, `PAGE_TILES`, legends (`legendFor`), scenario isolation (`hiScn`), `renderMulti` (side-by-side + synced hover + linked map controls), `mountTile`. This is the best single file for understanding how a tile is configured. |
| `src/build2.py` | Tiny concatenation script (see §1). |

The prototype's tile definitions map one-to-one onto the YAML `multi-view` grammar in file 06 §7.

## 3. Where to look for each behavior

| Behavior | Read |
|---|---|
| Control bar and picker | `shell.template.html`: `dock()`, `picker()`, `rounds()`, `setYear()` |
| Hero KPI band | `hero()`, `WF.kpis()` in `core3.js` |
| Tile header, view/group/compare-as controls | `tile()`, `wire()` |
| Strategy selection per view | `WF.TILES[...].views[].cmp` in `pages.js`; `mountTile()` applies the strategy |
| Side-by-side + synced hover + linked map camera | `renderMulti()` in `pages.js`; `zoneMap` camera registry in `core.js` |
| Reference semantics and Change formulas | `dv`, `fD`, `modeSeries`, `ref` in `core3.js` |
| Scenario colors, overrides, safe palette, rounds ramp | `scColor`, `palette`, `defColor` in `core.js` |
| Tooltip anatomy and sync | `tt.js`; `renderMulti` mousemove block |
| Basemap stand-ins and catalog | `BM`, `baseLayer` in `core.js`; `tabBm()` in the shell |
| Calibration progress | `traceMeta`, `traceLines`, `traceHeat` in `core3.js` |
| Across model years | `yearsTrend` in `core3.js`, `SCN.valAt` in `scen.js` |
| Settings modal | `openSettings`, `tabApp`, `tabScn`, `tabBm`, `tabDocs` in the shell |

## 4. What is fake (do not copy)
- All numbers (scenarios, rounds, years, observed margins, survey sizes) are made up.
- Zones are a Voronoi drawing; "basemaps" are drawn shapes; the rail line is a polyline. Real: GeoParquet + MapLibre + basemap catalog.
- Time-of-day curves, trip-length gamma fits, population pyramid, speeds are formulas.
- Sparklines in the hero use made-up arrays. Spec: metric at each model year.
- Year growth factors and the "alternatives differ more as the plan builds out" ramp are illustrative.
- Only five pages are built; Explore is a placeholder.

## 5. Known deviations from this spec (the spec wins)
1. Light-mode `--ok` / `--warn` are lighter than the spec (they fail 4.5:1 on white). Use the spec values.
2. `cat(i)` for i ≥ 6 is buggy in `K()` (mixes an undefined color). Use the list in file 01 §5.4.
3. The nav is hidden below 760px instead of becoming a hamburger sheet.
4. The reference option "Same scenario in the base year" does not exist in the prototype (file 03 §5.4).
5. Radar caps at 6 series with no on-chart note beyond the tile subtitle.
6. The ridgeline has no tooltip; time-axis panels in side-by-side mode do not share a crosshair.
7. Tooltips show original scenario names in a few places even when the viewer set a custom label (use `scenarioDisplay` everywhere).
8. Chord panels do not link across side-by-side panels (they use `switch`).
9. No keyboard crosshair navigation; the swipe handle is keyboard-operable.
10. The observed margin-of-error band exists on mode share bars only.

## 6. Pitfalls found while building (read before you implement)
- **Resize feedback loop.** A chart inserted into a container whose height is not fixed grows the container, which
  triggers another measure and redraw. Fix: fixed-height body, measure `clientWidth/Height` minus padding, never the border box.
- **Animation replays.** Fading chart children on every draw makes charts flicker on resize and makes full-page
  screenshots look half-transparent. Animate the tile element once.
- **Plot specifics.** Per-datum `ariaLabel` is ignored (use `title` then convert to `data-wf`); function-valued `dx`/`textAnchor` on
  `Plot.text` give NaN; `inset` belongs on the scale; a `Plot.rect` with only `y1/y2` spans the facet width.
- **D3 specifics.** `d3.color()` cannot parse `color-mix()`/`oklch()`; resolve CSS variables to hex first.
  `hierarchy.sort(null)` throws (omit the call). `d3.zoom` filter must exclude the swipe handle so dragging it does not pan.
- **Zoom sync.** Re-entrancy: programmatic `zoom.transform` calls fire the zoom handler; use a `silent` flag per map so updates do not echo.
- **Tooltip in grids.** Per-chart tooltips must be suppressed inside `.wf-multi`; the grid owns the synced one.
- **Quirks mode.** If a prototype page lacks a doctype, tables stop inheriting font size. Production has one.
- **Colors on glass.** `backdrop-filter` needs a semi-transparent background; tooltips use the same glass tier.
- **Testing with screenshots.** Playwright `fullPage` temporarily resizes the viewport, which redraws charts; wait for redraw
  before capturing and prefer viewport shots for chart checks. Hover tests should move the mouse away from the
  expanding nav first (it intercepts pointer events when expanded).

## 7. How the prototype was verified
Headless Chromium (Playwright) with colorScheme dark/light: no console errors on any page; hover screenshots for bars, treemap, line
crosshair, waffle and map sync; computed transforms of all maps equal after one zoom; Settings tabs rendered; round strip and
year switch exercised. Reproduce with a small script like the one in `07-implementation-plan.md` P0 task 4 (viewport shots, `page.hover`,
`page.mouse.wheel`).
