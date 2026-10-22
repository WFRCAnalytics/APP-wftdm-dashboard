# 09 — Chart kind guide (how to add a chart)

Every chart of the catalogue (file 04) is a **kind**: one module in `src/charts/kinds/`, drawn by the single `chart`
panel (`src/panels/ChartPanel.tsx`). The panel resolves which runs to show from the view context, loads their Parquet
tables, builds a `ChartEnv` and calls your `draw`. A kind never reads a store and never queries DuckDB.

## 1. Files and naming
- `src/charts/kinds/<camelName>.ts` — default export a `ChartKind`. The kind name is the kebab-case file name
  (`modeBars.ts` is `mode-bars`). Nothing needs registering: `kinds/index.ts` globs the folder.
- Helpers shared by several kinds go in `src/charts/lib/<name>.ts` (never in `kinds/`, every file there is a kind).
- Pure data builders get a Vitest file `tests/unit/<name>.test.ts`. A chart that computes anything (aggregation,
  scales, label rules, the largest-remainder waffle, ranking) must have its numbers unit-tested.
- Use the existing `modeBars.ts` as the template.

## 2. The contract (`src/charts/types.ts`)
```ts
const kind: ChartKind = {
  tables: (plan) => ['trip_mode_share'],        // Parquet metric tables read for every shown run
  extraRuns?: (plan) => string[],               // runs beyond scenarios + references (e.g. every year)
  draw(el, env) { …; return { legend, dispose, label } },   // replace el's children; return a legend + aria label
  destroy?(state) { … },                        // once, on unmount (e.g. map.remove())
}
```
`env` = `ChartPlan` + `{ width, height, data, theme, state, redraw, setYear, focusAlternative }`:
- `env.scenarios` — the runs to draw, in order: `{ run, alternative, label, color, isFocus }`. With Compare off (or when the
  tile is one cell of a side-by-side grid, `env.pinned`) it is just one run. Never include Observed here.
- `env.focus`, `env.reference` (`{kind, run?, label, isObserved}`), `env.refRunFor(run)` (the reference run for a shown
  run; for "same scenario in the base year" it is that run's own base-year run), `env.display` (`'val'|'abs'|'pct'`),
  `env.year/baseYear/isBaseYear`, `env.years` (milestones), `env.runFor(alternative, year)`, `env.observedRun`,
  `env.group` (the tile's group-by id), `env.config` (kind-specific options, e.g. `variant`).
- `env.data.rows(run, table)` — `SELECT *` rows (numbers are JS numbers). `[]` if the run lacks the table.
- `env.theme` — `ink mute line grid surface font fs r`, `mode(name)`, `cat(i)`, `ramp(color,n)`, `neutral(i)`,
  `diverge(t)` (−1..1, c2 ← neutral → c1, never green/red), `mix`, `onColor`. **Never hard-code a colour in a chart**
  (palette tokens only). Resolve everything to hex before giving it to D3 (`theme.*` already does).
- `env.state` — scratch object that survives redraws (sort order, camera, selection); call `env.redraw()` after changing it.
- Differences: `deltaValue(a, ref, env.display)` / `formatDelta(v, display, {share})` from `src/panels/compareMath.ts`
  (Values = a; Change = a − ref; % change = (a/ref − 1)·100, null when ref is 0 → draw "n/a", never a bar/infinity).
  A chart offers Change only if it says so in its `compare` list; with Change/% on a chart that cannot show it, keep
  showing values (the tile shows a "Shows values" badge). When the reference scenario is itself in `env.scenarios`
  and `display !== 'val'`, leave it out (its difference is zero).
- Categories always in the order of `src/charts/vocab.ts` (modes, purposes, incomes, …), including categories with no rows.
- Empty/no-data: `emptyNote(el, 'text')` from `src/charts/util.ts`; say what to do, never draw empty axes.

## 3. Hover, tooltips, legends (file 05)
- One tooltip for everything: `tooltip.show(spec, event)` / `tooltip.hide()` from `src/services/tooltip.ts`
  (`TipSpec {title, swatch?, sub?, rows:[{k,v,c?,b?,d?,dc?}], foot?}`; strings pre-formatted; values mono).
  **No** Plot `tip`, no per-chart tooltip elements, no native `<title>`/`title=` tooltips.
- Observable Plot marks: give each mark `title: (_d, i) => 'wfa:' + i` and call `armPlot(plot, {a: rows}, spec, click?)`
  from `src/panels/plotInteraction.ts` after `Plot.plot()`. Time axes: `crosshair(svg, opts)` (same file) — snaps,
  draws dots, one tooltip, optional `click`.
- D3 marks: call `tooltip.show` in `mousemove`, `hide` in `mouseleave`.
- Mode cross-highlight: marks coloured by mode carry `data-m="<Mode>"`; call `wireModeHover(el)` from
  `src/panels/crossHighlight.ts` after drawing.
- Side-by-side cells (`env.pinned`): every hoverable mark also carries `data-key` (identical across cells),
  `data-title`, `data-val`, `data-num`, optional `data-rel="1"` and `data-unit`. The grid (CompareHost) shows ONE synced
  tooltip; `tooltip.show` is automatically suppressed inside `.wf-multi`.
- Legend: return `{ legend: { items: [{label, color?, run?, mode?, dash?}], diverge? } }`; `run` chips isolate that run on
  hover, `mode` chips cross-highlight the mode. It renders in the tile's legend row — do not draw your own.
- Every chart region needs a useful `aria-label` (return `label`).

## 4. Rules of the road
- Fill `env.width × env.height` exactly; the panel redraws on resize/theme/data change (don't observe size yourself).
- Transparent background; axis text `theme.fs` px `theme.mute`; font `theme.font`; radii `theme.r`.
- Both themes, light and dark, must look right (check both).
- No new dependencies. Allowed: Observable Plot (`@observablehq/plot`), D3 submodules already in package.json
  (`d3-selection d3-scale d3-array d3-shape d3-hierarchy d3-sankey d3-chord d3-zoom d3-format d3-interpolate d3-transition`),
  MapLibre (+ deck.gl overlay already used by FlowMap) for maps.
- Prototype reference (behaviour and look, not code to paste): `project-docs/redesign/prototype/src/core2.js`
  (single-scenario D3/Plot charts), `core3.js` (compare-aware charts), `pages.js` (tile catalogue, `renderMulti`).
  Port the **look** exactly: margins, radii, tick formats, label rules, colours, legend, tooltip content (file 04).
- Demo content: the pages are already written in `public/demo-dashboard-config/dashboard-*.yaml` and refer to your kinds
  by name; options such as `variant` are keys on the view. Run the dev server and open the page to see your chart in its
  real tile (Compare on/off, years, group-by, view switch, Change/% change, light/dark).

## 5. Demo data (Parquet tables per run; synthetic; shares are fractions 0–1)
See the header of `scripts/build-demo-redesign-data.py` for every table and column. Category labels are those in
`src/charts/vocab.ts`. Runs: 15 alternatives × 6 model years (`<slug>` for 2023, `<slug>-<year>` otherwise), an
`observed-2023` run (reference data, with `moe` columns where the contract says), 50 `round-NN` runs (base year).

## 6. Done means
`npx tsc --noEmit` clean; your Vitest tests pass; a screenshot of the chart in its tile next to the prototype's
(dark and light, Compare off and on where it differs) matches closely; no console errors; resizing doesn't loop.
