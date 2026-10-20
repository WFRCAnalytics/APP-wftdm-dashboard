# 07 — Implementation plan

Build in this order. Each phase ends in a working, shippable app (all existing tests pass or are updated on
purpose). Do not start a phase until the previous one's acceptance criteria pass. Commit at the end of each
numbered task with a message that names the phase (for example `redesign P3: compareState + resolveViewContext`).

Repo facts to keep in mind (from `CLAUDE.md`; verify before relying):
- React 18.3.1, TypeScript, Vite 6, Tailwind v4 through the `@config` bridge, shadcn `new-york-v4`, Vitest
  (`npm run test:unit`), Playwright (`npm run test:integration`), `npm run typecheck`, `npm run build`,
  `npm run build:pages` (writes the committed GitHub Pages copy into `docs/`).
- About eight Playwright specs were already failing before this work because they depend on a retired fixture
  mechanism (`CLAUDE.md` "Known gaps"). Do not treat those as regressions; do not "fix" them as part of this work
  unless asked. Record the failing list before you start so you can compare.
- `docs/` is built output, not documentation. Never hand-edit it. Run `npm run build:pages` only when asked to publish.
- `panels/registry.tsx` maps a `type` string to a lazy-loaded component. `layout/panelCard.tsx` and
  `layout/dashboardRenderer.tsx` wrap every panel in `PanelErrorBoundary` + `Suspense`. Keep that.
- Never use `localStorage`/`sessionStorage`. Never put DuckDB on the main thread. Keep lazy tab-scoped loading.

## Dependency map

```
P0 prep
 └─ P1 tokens + chart theme
     ├─ P2 shell (nav, header, settings relocation)
     └─ P3 state (compareState, ViewContext, years)
         └─ P4 tile chrome + multi-view wrapper
             ├─ P5 CompareHost (overlay / switch / multi / diff) + reference semantics
             │    ├─ P8 maps (grid, swipe, diff)
             │    └─ P9 calibration rounds
             ├─ P6 tooltip service + hover sync
             └─ P7 new and updated chart types (can run in parallel once P4 + P6 exist)
P10 settings restyle  (after P2)      P11 observed data (after P5)      P12 polish, docs, tests (last)
```

---

## P0 — Preparation (size S)
1. Create branch `063-ui-redesign` from `main` (or the branch you are told to use).
2. Read files 00–06 of this folder completely. Open `prototype/corridor-pro.html` and click every control.
3. Run `npm install`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`. Save the output of
   the Playwright run to `specs/063-ui-redesign/baseline-test-results.txt` (list of failing specs).
4. Take baseline screenshots of every dashboard tab in light and dark (Playwright script in
   `tests/integration/_redesignShots.spec.ts`, kept out of the default run). You will compare against them.
5. Acceptance: the repo builds and the baseline results are saved.

## P1 — Tokens, theme, chart theme (size M)
Goal: the **existing** layout looks like the new visual language. No layout change yet.
1. Rewrite `src/styles/tokens.css` using file 01 §2 (dark default, two identical light blocks). Keep the
   Tailwind `@import "tailwindcss"; @config "../../tailwind.config.js";` header lines and the `tw-animate-css` import.
2. Map the shadcn semantic tokens to the new tokens (file 01 §2.3). Add the new color names to `tailwind.config.js`.
3. Load fonts: add Schibsted Grotesk and DM Mono (Fontsource or the existing `googleFontLoader.ts`). Keep Geist, IBM Plex Sans as the
   optional choices; wire `--font` to the existing `useFontPreference`. `--mono` is fixed.
4. Implement `applyAccents()` (file 01 §5.1) in `src/panels/interfaceColor.ts` or a new `src/services/theme.ts`, and call it from
   `useThemeMode` and `useInterfaceColors` whenever theme or colors change. It must write `--c-1..3` and `--brand`.
5. Create `src/panels/chartTheme.ts` (`readChartTheme`, `plotBase`) per file 01 §6. Replace every hard-coded chart color/font in
   `observablePlotEncoding.ts`, `ObservablePlotPanel.tsx`, `HierarchicalChartHost.tsx`, `SankeyPanel.tsx`, `RadarChartPanel.tsx`,
   `PieChartPanel.tsx`, `chartColor.ts` with values from it. Consolidate palette helpers into `chartColor.ts` (it already
   consolidates named schemes): add `scenarioPalette15`, `scenarioPaletteSafe15`, `modeColors`, `cat(i)`, `ramp()`, `diverging()` exactly as in file 01 §5.
6. Update `scenarioDisplay.ts`: default palette = the new 15 colors (stable by manifest index); colour-blind-safe switch swaps to the safe 15;
   resolution order unchanged. Add the HCL clamp for default colors (file 01 §5.2). Unit-test: stable color after reorder; override wins; safe palette swap.
7. Replace the old body backdrop and add the glass/tier utility classes (`.glass`, tier shadows) in `src/styles/global.css`.
8. Acceptance: all tabs readable in both themes; `chartTheme` is the only source of chart colors (grep finds no hex literals in panels except palette
   definitions); contrast numbers in file 01 §9 hold; existing Vitest tests updated for changed color values; Playwright appearance spec passes.

## P2 — Shell: floating nav, pinned header, settings relocation (size M)
1. Replace `layout/shell.tsx` structure with: `FloatingNav` + `main` containing `PageHeader` (sticky) and the page.
2. Rework `sidebarNav.tsx` per file 02 §1.1: 68→248px, tabs, sub-navigation from `sections:`, bottom group (Settings, Light or dark).
   Keep `header.full_page` chromeless behavior, `header.tab/icon/aria_label`, and the YAML-driven tab list. Keep `dashboardBrand.tsx` for title/logo.
3. Add `PageHeader` with the compact-on-scroll behavior (file 02 §1.2). Put a `ControlBar` placeholder in it (filled in P3–P5).
4. Add the hamburger sheet for < 760px (file 02 §7).
5. Move the Settings and theme entry points from the old top-right/sidebar spots to the nav bottom. The settings modal content is untouched in this phase.
6. Acceptance: nav keyboard-operable; expands on hover and on focus; sub-nav scrolls to tiles; header shrinks after 70px scroll; no layout shift when the nav expands;
   Playwright `dashboardShell.spec.ts` updated for new selectors and passing; both themes.

## P3 — State, view context, years (size M)
1. Add `src/state/compareState.ts` (file 03 §1). Pub/sub store + `useCompareState()`.
2. Add `src/services/viewContext.ts` with `resolveViewContext(state, manifest)` implementing file 03 §2 exactly. Pure, no React.
3. Extend `services/scenarioDiscovery.ts` + `hooks/useScenarioList.ts` with alternatives/years/rounds (file 06 §1, §4): `resolveRun`, `alternatives`, `rounds`, tags.
   Existing manifests must still work (no years ⇒ single-year).
4. Change `hooks/useActiveScenarios.ts` to return `ctx.active` (the resolved names for the current year). Keep the hook's signature.
5. Add `hooks/useViewContext.ts`.
6. Build the **Year** select and the **Focus** select in `ControlBar` (file 02 §1.2 items 1–2). Compare toggle, picker button, Reference and Show appear in P5.
7. On a year change: clear caches keyed by year, call `ensureRegistered` for visible tiles.
8. Unit tests (Vitest) for `resolveViewContext`: every rule in file 03 §2 and every edge case in §9 (write a table-driven test).
9. Acceptance: switching Year re-queries and redraws the existing tiles for that year using demo data (add a second demo year to `public/demo-scenarios` by copying and
   slightly modifying data, clearly marked demo); Observed/rounds hidden outside the base year; unit tests green.

## P4 — Tile chrome and the `multi-view` wrapper (size L)
1. Create `layout/Tile.tsx` (replaces `panelCard.tsx` visually, keeps the error boundary/Suspense/expand logic): header, badges, control row, legend row, body (file 02 §2).
2. Create the shared controls: `Segmented`, `PillSelect`, `MiniButton`, `Badge` in `components/ui/` (file 02 §5).
3. Implement `TileState` store (file 03 §1) keyed `pageId:tileId`.
4. Implement the `multi-view` panel type: loader/validator (file 06 §7), registry entry, view switching, `group_by` with `$group.` substitution, legend row hosting, per-view `compare`.
   Add unit tests for the substitution and validation rules (unknown strategy, unknown `$group` field, duplicate ids).
5. Expand overlay (file 02 §2) — reuse `panelExpandHost.tsx`; restyle and make all controls work inside it.
6. Convert demo content: rewrite `public/demo-dashboard-config/dashboard-1…6-*.yaml` to use `multi-view` for the tiles listed in file 02 §3. Keep `dashboard-8-test.yaml` untouched (permanent broken-panel tab).
7. Acceptance: every tile shows view/group controls where configured; switching views works; expand works; `brokenPanelStates.spec.ts` still passes; both themes.

## P5 — CompareHost, strategies, reference semantics (size L)
1. Add `panels/CompareHost.tsx` (file 03 §4.3). All data-bound panels render through it.
2. Implement `overlay` and `switch` (pin via `scenario:`), then `multi` (N pinned copies, shared color resolver, pager, cap 4), then `diff` (file 03 §4.2).
3. Control bar: Compare toggle, scenario picker button + popover (file 02 §1.3 without the round strip), Reference select, Show segmented.
4. Reference semantics: Observed, scenario, **self-base-year** (file 03 §5). Unit-test `formatDelta` and the Values/Change/% formulas, including reference = 0.
5. `observablePlotEncoding.ts`: add the diverging zero-anchored color scale for difference fills on bars/dots (file 03 §4.2). `hierarchyData.ts` + treemap renderer: percent-change coloring with focus geometry.
6. Compare-only tiles: `scorecard`, `ranked-bars` panel types; hide when Compare is off.
7. Never hand Treemap/Sunburst/Sankey/Pie an unpinned multi-scenario union: add a development-time `console.warn` and a guard that forces a strategy.
8. Acceptance: with 3 and with 15 demo scenarios, every demo tile responds to Compare as in the strategy matrix (file 03 §4.1); Change/% change formulas verified on three tiles; Observed disabled outside the base year; the "identical results" note shows only when data are identical.

## P6 — Tooltip service and hover sync (size M)
1. Add `src/services/tooltip.ts` and the CSS (file 05 §1–2). Add `armPlot` and `crosshair` helpers (file 05 §5–6) in `src/panels/plotInteraction.ts`.
2. Migrate every panel to the shared tooltip: remove Plot `tip: true` from the encoder (or map it to `armPlot`), remove `mapTooltip.ts`'s own element (keep its content builders, turning them into `TipSpec`), update Sankey/Hierarchy/Radar/Pie renderers.
3. Mode cross-highlight and scenario legend isolation (file 05 §3).
4. Synced hover for `multi`/`grid` (file 05 §4): add the `data-*` contract to treemap, sunburst, waffle, stacked bars and maps; implement the grid handler in `CompareHost`.
5. Acceptance: Playwright tests listed in file 05 §10 pass; no native browser tooltips appear (`title` nodes removed); tooltip flips at edges; text size and theme changes do not break it.

## P7 — New and updated chart types (size L; split across several PRs)
Order by value. For each, follow its entry in file 04 and add a Vitest test for the pure data builder and a Playwright smoke test.
1. Trips through the day: Lines with group-by, Stream, Heatmap (file 04 §10–12). 2. Across model years (`trend`, §25). 3. Mode share Bars/Gap with reference line, margin-of-error band, tooltips (§1–2).
4. Stacked bars, Slope, Donut with list (§3–5). 5. Dumbbell (§18). 6. Waffle (§17). 7. Ridgeline (§15). 8. Pyramid (§16). 9. Chord (§14). 10. Radar overlay + table (§9).
11. Speed heatmap (§13). 12. Sunburst/treemap/Sankey compare behavior (§6–8). 13. Hero KPI band and sparklines (file 02 §1.4).
Acceptance per chart: both themes; resize; tooltips; compare behavior from the matrix; Table view or equivalent; no console errors.

## P8 — Maps (size L)
1. `grid` strategy: N MapLibre instances with linked cameras (`move` → `jumpTo` with a re-entrancy guard); shared control group; camera survives redraws and paging; hover sync (file 05 §4).
2. Cap at 4 per page; confirm with `performance.getEntriesByType` and a WebGL context count check that paging disposes old maps (`map.remove()`).
3. `diff` map: restyle `ZoneMapPanel` diff with the diverging ramp, domain at the 96th percentile; caption chip; Observed → baseline fallback note.
4. `swipe`: integrate `maplibre-gl-compare`; verify with `MapboxOverlay({interleaved:true})` first. If incompatible, implement the clip-path divider manually (file 04 §21).
5. Restyle the basemap tab (file 02 §4.3); keep the existing catalog and Apply flow.
6. Acceptance: demo maps behave as in file 04 §19–22; no WebGL context-loss warnings with 4 maps; zoom sync verified by test.

## P9 — Calibration rounds (size L)
1. Manifest `kind: round`, `family`, `family_index`; discovery returns the family; roll-up file loader (file 06 §5).
2. Round strip in the picker (file 02 §1.3 item 4); Focus/Reference optgroups; round color ramp (file 01 §5.3).
3. `trend` panel with `x: round` and the four metric groups; Difference/Values/Heatmap views; click focus, shift-click compare (file 04 §26).
4. Calibration fingerprint overlay for rounds.
5. Demo data: generate 50 small demo rounds for `public/demo-scenarios` (script in `python/` or `tests/fixtures`, clearly marked as synthetic) so tests can run.
6. Acceptance: with 50 demo rounds, only selected rounds load; the trace tile loads one roll-up file; strip ticks colored by status; selecting rounds compares them in every tile.

## P10 — Settings (size M)
1. Restyle modal and tabs (file 02 §4). Appearance: add Theme *System* option, colour-blind-safe palette switch (exists as `useColorblindSafePreference`), fonts, text size (exists as `useTextSize`; implement via `zoom` on `.main`), reset.
2. Scenarios tab: swatch + label + switch + baseline chip + reorder (existing `@dnd-kit`) — restyle only; add "Compare all" and "Reset colours and names".
3. Documentation tab: update content (file 02 §4.4).
4. Acceptance: `appearanceSettings.spec.ts`, `settingsModal` specs updated and passing; all settings apply live and redraw charts.

## P11 — Observed data (size M)
1. Observed registry loader (`public/observed/index.json`, `source.yaml`) and metric→source mapping (file 06 §6).
2. Draw the dashed reference line and margin-of-error band on Mode share, Dumbbell and Calibration progress; tooltip rows and footer with source/sample.
3. `wftdm-dashboard validate-observed` CLI command + pytest tests (suppression, schema, registry consistency) in `python/tests`.
4. Acceptance: demo observed folder with synthetic values passes validation; a table with `n < min_cell_n` fails with a clear message; charts show bands only when `moe/lo/hi` exist.

## P12 — Polish, accessibility, documentation (size M)
1. Accessibility pass (file 02 §8, file 05 §9): roles, labels, focus, reduced motion, keyboard crosshair, Table views.
2. Performance pass: measure with 15 scenarios and 50 rounds; confirm resize does not loop; lazy-load heavy chart code (keep `manualChunks`).
3. Update `CLAUDE.md` (stack, navigation, panel types, new tokens, the new "Do not" items), `project-docs/ARCHITECTURE.md`, `GRAMMAR.md` (file 06 §7), and the `wftdm-design-system` skill (replace the WFRC-blue rules with file 01).
4. Run the global checklist below at 1280, 1500 and 1920 px, both themes, with 1, 3 and 15 scenarios.
5. Only when asked: `npm run build:pages` and commit `docs/`.

---

## Global acceptance checklist

Visual
- [ ] No accent-colored gradients anywhere. Only the neutral page vignette and data ramps.
- [ ] Every surface follows the elevation tiers; radii match file 01 §4.
- [ ] Both themes correct on every screen, including modal, picker, tooltip, maps, every chart.
- [ ] Numerals are mono and aligned in KPIs, tables, tooltips.
- [ ] Charts use only theme variables; no hex literals in chart code except palette definitions.

Compare
- [ ] Compare on by default with ≥ 2 independent scenarios; off and hidden with 1.
- [ ] Focus, compare set, reference, Values/Change/% change behave per file 03.
- [ ] Every tile in the strategy matrix behaves as listed; unsupported Change falls back to values with a badge.
- [ ] Side-by-side panels share scales and linked hover; maps share one camera.
- [ ] Observed only in the base year; rounds only in the base year; reference auto-switches on year change.
- [ ] Scorecard and ranking only in Compare mode.

Interaction
- [ ] One tooltip, same anatomy everywhere; flips at edges; no native tooltips.
- [ ] Mode cross-highlight and scenario legend isolation work.
- [ ] Round click/shift-click, year click, sunburst zoom, swipe drag/keys work.

Data
- [ ] Old-style config (no years, no families) still renders.
- [ ] Lazy loading intact: only visible tiles' files are registered; rounds load on demand.
- [ ] No `localStorage`/`sessionStorage`; DuckDB still in a Worker.

Quality
- [ ] `npm run typecheck`, `npm run test:unit` pass. Playwright: no new failures versus the P0 baseline; new specs pass.
- [ ] No console errors on any tab at any width.
- [ ] Keyboard-only walkthrough of nav, control bar, picker, a tile, settings succeeds.

## Risks and how to handle them

| Risk | Mitigation |
|---|---|
| Scenario-blind aggregation (treemap/sunburst/sankey/pie sum across scenarios) | `CompareHost` never passes them an unpinned union; add a warning guard (P5). |
| WebGL context limits with many maps | Cap 4 per page; dispose maps when paging; `interleaved: true` overlays. |
| `maplibre-gl-compare` + deck.gl overlay incompatibility | Verify first (P8 task 4); fall back to a manual clip divider. |
| Redraw loops from ResizeObserver | Fixed-height body, measure the content box, animate tiles not chart children (file 01 §7). |
| Plot quirks (no per-datum `ariaLabel`, `text` dx functions, color-mix) | Use `title` + `armPlot`, constants, hex resolution (file 05 §6). |
| Year × alternative data volume | Lazy per-tile registration; trend tile loads only `summary_kpis` per milestone. |
| Observed data policy undecided | Contract in file 06 §6 works for any source; Observed is optional everywhere. |
| shadcn `--primary` meaning change | Introduce `--brand` alias; audit uses of `bg-primary` (buttons keep working because primary now equals accent). |

## What NOT to do
- Do not add a charting library, a UI framework, or a state library.
- Do not hard-code "the base year equals every alternative". Detect identical results from data.
- Do not color differences green/red. Do not use the status colors for series.
- Do not show a single "calibration score". The team tracks the real metrics.
- Do not build per-chart tooltips. Do not use Plot's `tip`.
- Do not store anything in `localStorage`. Do not register every Parquet file at boot.
- Do not edit `docs/` by hand.
