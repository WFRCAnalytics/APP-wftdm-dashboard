# Observable Plot — Visual Theming Parity with Recharts

**Status: IMPLEMENTED — all five items (§5a/§5b/§5c plus the two originally-deferred items, §5b's swatch corner-radius and §5e's non-scenario categorical color), per direct, explicit user instruction to implement the full plan in the same session this document was written.** Every claim in the research below (§§1–4) was verified directly against this app's own real, current source and against `@observablehq/plot`'s own real, installed source in `node_modules/@observablehq/plot/src/` before writing the plan — never assumed from the public docs site or from memory of how Plot "usually" behaves. This mirrors the research-only process already used for `UX-REDESIGN-PROPOSAL.md`/`BASEMAP-PICKER-PROPOSAL.md`/`TABLE-PANEL-PROPOSAL.md`. **Two real, confirmed corrections were found during implementation, not anticipated by the plan below — see §6 (Implementation Record) for the full story; §5c/§5b's own text is the ORIGINAL plan and is kept unedited above the record, not silently rewritten to look right in hindsight.** All existing CLAUDE.md non-negotiables, the `057-observable-plot-conversion` decision to make Observable Plot this app's primary chart engine, and every rule in the `wftdm-design-system` skill remain in force.

**Date:** 2026-09-16.
**Scope:** `src/panels/ObservablePlotPanel.tsx` + `src/panels/observablePlotEncoding.ts` + `src/panels/valueBoxSparkline.tsx` (the sparkline reuses the same Plot.plot() call shape, per `057`'s own note that it "reuses `ObservablePlotPanel.tsx`'s own already-proven dark-mode fix verbatim"). Compared against `src/panels/RechartsPanel.tsx` + `src/components/ui/chart.tsx` + `src/panels/rechartsPanel.css` as the proven reference for what "shadcn-consistent" already means in this specific codebase. No grammar change proposed (`project-docs/GRAMMAR.md`'s `type: observable-plot` section is unaffected either way — every fix below is theming-layer only, not a new author-facing key).

---

## 1. The starting clue, confirmed and root-caused

The user's report — "an earlier fix increased the plot body's text size, but the legend's text size did not follow" — is correct, and the reason is a real, confirmed structural fact about how `@observablehq/plot` builds its own DOM, not a bug in this app's fix.

**The earlier fix**, `observablePlotEncoding.ts:64`:
```ts
plotOptions.style = { fontSize: '12px' }
```
This is spread into `Plot.plot({ ...plotOptions, ... })`. Plot's own `plot.js` applies it exactly once, to exactly one element — `node_modules/@observablehq/plot/src/plot.js:251-278`:
```js
select(svg)
  .attr("class", className)
  .attr("fill", "currentColor")
  .attr("font-family", "system-ui, sans-serif")
  .attr("font-size", 10)
  ...
  .call(applyInlineStyles, style)   // ← this app's {fontSize:'12px'} lands HERE, on <svg> only
```
`applyInlineStyles` (`style.js:446-454`) is `Object.assign(element.style, style)` on the `<svg>` element alone. Because `font-size` is CSS-inherited, every `<text>` *inside* that `<svg>` (axis ticks, tick labels, the tip mark's own text) correctly inherits the 12px override. **The legend is not inside that `<svg>`.**

Confirmed directly from `plot.js:329-340` — when a color legend is present, Plot wraps the chart in a `<figure>` and does this:
```js
const legends = createLegends(scaleDescriptors, context, options);
...
figure = document.createElement("figure");
figure.append(...legends, svg);   // ← legend div(s) are SIBLINGS of <svg>, appended BEFORE it
```
The legend is a wholly separate DOM subtree — a `<div class="plot-XXXXXX-swatches">` — never touched by the `applyInlineStyles(svg, style)` call above, and CSS inheritance does not flow sideways between siblings. Worse, that legend div carries **its own, self-contained, hardcoded `<style>` block**, confirmed directly from `node_modules/@observablehq/plot/src/legends/swatches.js:150-164`:
```js
div.insert("style", "*").text(
  `:where(.${className}-swatches) {
  font-family: system-ui, sans-serif;
  font-size: 10px;
  margin-bottom: 0.5em;
}
...`
)
```
This is where the mismatch actually lives: the legend is permanently pinned to Plot's own hardcoded `10px` / `system-ui, sans-serif` defaults, completely independent of the `plotOptions.style` fix — not because that fix was written wrong, but because it targeted the only element Plot's `style` option is documented to affect, and the legend simply isn't inside it.

**This also answers research question 4 directly: no, the main chart body does not render in this app's real Nova/Geist font stack either**, and the earlier fix never touched font-family at all. `plot.js:254` sets `.attr("font-family", "system-ui, sans-serif")` as an SVG presentation attribute directly on `<svg>`. An SVG presentation attribute establishes the *specified value* for that property on the element it's set on — `body`'s own CSS `font-family: var(--font-body)` (`tokens.css:130,147`, resolving to `"Geist Variable", sans-serif`) would normally inherit down into the SVG's descendants, but because the `<svg>` element itself has its own specified value (`system-ui, sans-serif`) for that same property, descendants inherit *from the `<svg>`*, not from `body` past it. Confirmed: every real Observable Plot panel in this app today — axis text, tick labels, the tip tooltip, and the legend — renders in the browser's `system-ui` font stack, never `"Geist Variable"`. This has been true since `007-observable-plot-panel` shipped; the 12px fix never changed it because it only ever set `fontSize` in the `style` object, never `fontFamily`.

---

## 2. Full inventory: what's customized today vs. left at Plot's defaults

Read directly from `ObservablePlotPanel.tsx` and `observablePlotEncoding.ts`, line by line.

| Target | Customized today? | Real mechanism | Plot's own default (uncustomized) |
|---|---|---|---|
| Chart-body font size | ✅ Yes | `plotOptions.style = { fontSize: '12px' }` (matched to Plotly's 12px default) | `10px` |
| Chart-body font family | ❌ No | — | `system-ui, sans-serif` (SVG attribute, `plot.js:254`) |
| Legend font size | ❌ No | — | `10px` (`legends/swatches.js:155`, own scoped stylesheet) |
| Legend font family | ❌ No | — | `system-ui, sans-serif` (same stylesheet) |
| Legend swatch size | ❌ No | — | `15×15px` (`legendItems`'s own `swatchSize = 15` default) |
| Legend text/swatch color | ❌ No | — | Inherited browser default text color (no `fill`/`color` set on the legend div at all — confirmed no `text-foreground`/`text-muted-foreground` class reaches `.observable-plot-chart`'s DOM) |
| Legend layout | ❌ No | — | `display:flex; flex-wrap:wrap; min-height:33px`, `margin-right:1em` per swatch, `margin-bottom:0.5em` on the whole legend block |
| Legend visibility | ✅ Yes | `plotOptions.color = { legend: true }` whenever `config.fill`/`config.stroke` is set | Off by default |
| Tooltip (tip mark) background | ✅ Yes (dark mode only) | Post-render `svgEl.style.setProperty('--plot-background', card)` DOM patch, resolving the real `--card` token | `fill: "var(--plot-background)"`, and Plot's own generated stylesheet hardcodes `--plot-background: white` |
| Tooltip text color | ✅ Yes (incidentally) | `fill="currentColor"` (Plot's own default) already correctly inherits this app's `text-foreground` | — |
| Tooltip border | ❌ No | — | `stroke: "currentColor"` — a full-opacity 1px border in the *text* color, not a subtle token-derived hairline |
| Tooltip corner radius | ❌ No | — | **None.** `tip.js`'s `getPath()` builds the box from straight `h`/`v`/`l` SVG path commands only — no curve command anywhere. Square corners, confirmed by direct source read. |
| Tooltip padding | ❌ No | — | `textPadding = 8` (px) |
| Tooltip shadow | ❌ No | — | `pathFilter = "drop-shadow(0 3px 4px rgba(0,0,0,0.2))"` — a fixed literal, not theme-aware (same visual weight in light and dark mode) |
| Tooltip pointer mode (hover precision) | ✅ Yes | `resolveTipMode()` — `"x"` for `barY`, `"xy"` (Plot's own `true` default) otherwise | — |
| Bar/point fill color (no explicit scenario color) | Partially | Falls through to Plot's own default ordinal scheme | `"observable10"` (`schemeObservable10`) for an implicitly-typed categorical channel — confirmed in `scales/ordinal.js:42`. This is the **same underlying palette family** `tokens.css`'s own `--chart-1..5` were derived from (per this app's own recorded history), but not byte-identical — this app's tokens were separately lightness-adjusted for WCAG contrast, Plot's raw `schemeObservable10` was not. |
| Scenario-resolved fill/stroke color | ✅ Yes | `resolveObservablePlotEncoding()`'s `domain`/`range` branch (035-scenario-label-color) | — |
| Null-value row filtering | ✅ Yes | Rows with a null `y` value are dropped before Plot ever sees them | Plot would otherwise render a real `height="0"` rect indistinguishable from a genuine 0 |
| Grouped-facet x-axis label suppression | ✅ Yes | `plotOptions.x = { axis: null }` when facet + x-matches-color-channel | Axis renders, producing an illegible repeated-label smear |
| Grid lines | Author-controlled | `config.grid` passed through verbatim | Off |
| Mark geometry (bar radius, line width, dot radius, area opacity) | ❌ No | — | Plot's own per-mark defaults (sharp-cornered bars, 1.5px lines, etc.) |

**Summary**: of everything a viewer can see, this app customizes exactly two things globally (chart-body font size, dark-mode tooltip background) plus two narrow correctness fixes (null filtering, grouped-facet axis suppression). Every other visual property — legend typography/size/color/layout, tooltip border/radius/padding/shadow, mark geometry, and the chart body's own font *family* — is Plot's stock, un-themed default.

---

## 3. shadcn/Recharts reference — what "polished" already looks like in this app

Read directly from `components/ui/chart.tsx` and `RechartsPanel.tsx`, cross-checked against shadcn's own real `ui.shadcn.com/docs/components/chart` registry source (already this app's own primary reference per `029-shadcn-chart-panel`'s CLAUDE.md record, re-confirmed here rather than re-fetched, since `chart.tsx` is a verbatim CLI-sourced copy of that exact registry file with only two documented, line-level exceptions).

**Font.** `ChartContainer`'s own default className (`chart.tsx:62`) includes bare `text-xs` on the outer wrapping `<div>` — Tailwind's `0.75rem` (**12px**) `font-size` with `1rem` line-height. Nothing in `chart.tsx` sets an explicit `font-family` anywhere — it inherits the ordinary CSS cascade from `body { font-family: var(--font-body) }`, meaning **every Recharts panel in this app already renders in real `"Geist Variable"`**, axis ticks, tooltip, and legend alike, with zero special-casing needed, simply because Recharts never opts any element out of inheritance the way Plot's SVG presentation attributes do.

**Color.** Axis tick text: `[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground` — resolves to `--muted-foreground` (`#737373` light / `#a1a1a1` dark, `tokens.css`). Tooltip value text: `text-foreground`. Tooltip label/legend label text: `text-muted-foreground`.

**Legend** (`ChartLegendContent`, `chart.tsx:345-402`): swatch is `h-2 w-2 shrink-0 rounded-[2px]` — an **8×8px** square with a **2px** corner radius, `gap-1.5` (6px) between swatch and label, `gap-4` (16px) between entries, `pt-3`/`pb-3` (12px) from the chart body. No border, solid `backgroundColor: item.color` fill.

**Tooltip** (`ChartTooltipContent`, `chart.tsx:159-329`): `rounded-lg` (**8px** radius) `border border-border/50` (this app's own `rechartsPanel.css` fix resolves that opacity-modifier to a real `color-mix(in srgb, var(--border) 50%, transparent)`, since a Tailwind slash-opacity modifier generates no CSS at all against this app's plain-hex tokens) `bg-background px-2.5 py-1.5` (**10px/6px** padding) `text-xs shadow-xl`. Indicator swatch inside the tooltip: `h-2.5 w-2.5` (**10px**) `rounded-[2px]`, solid-filled (`indicator="dot"`, this app's own confirmed choice per `029`'s round-5 correction — a filled square, not `dashed`'s hollow outline).

**Side-by-side, put plainly**: Recharts renders one consistent 12px `Geist Variable` typeface everywhere, muted-foreground-toned secondary text, small (8–10px) rounded-corner color swatches, and an 8px-radius soft-shadowed tooltip with a faint half-opacity border. Observable Plot today renders 12px `system-ui` in the chart body only, 10px `system-ui` in the legend, an un-rounded, solidly-bordered, fixed-shadow tooltip, and 15px square swatches with no color/typography styling applied at all. A viewer switching tabs between a `recharts` panel and an `observable-plot` panel — both real, adjacent content today per `057`'s own conversion — can tell which is which at a glance, which is exactly the gap `057`'s own stated "shouldn't be able to tell them apart" goal left open.

---

## 4. Confirmed: Plot's real API surface for every fix below

This matters because it changes the *shape* of the fix. This app's existing dark-mode `--plot-background` fix uses post-render DOM patching (`svgEl.style.setProperty(...)`) — necessary there because nothing in Plot's declarative options can express "resolve a live CSS custom property from `getComputedStyle()` at render time." Legend/tooltip typography is different: it doesn't need that pattern at all.

Traced the real call chain from `plotOptions.color = { legend: true }` through to the legend's own render function:

1. `plot.js:330` → `createLegends(scaleDescriptors, context, options)`
2. `legends.js:73-81` `createLegends()` → for the `"color"` key, calls `legendColor(scales.color, legendOptions(context, defaults.color, options.color))` — `options.color` here is **exactly this app's own `plotOptions.color` object**, passed through whole.
3. `legends.js:46` `legendColor(color, {legend, ...options})` → `...options` (everything in `plotOptions.color` except the `legend` key itself) is forwarded verbatim to `legendSwatches(color, options)`.
4. `legends/swatches.js:73-86` `legendItems(scale, options, swatch)` destructures `style`, `swatchSize`, `swatchWidth`, `swatchHeight`, `columns`, `marginLeft` **directly off that same object**, and (`swatches.js:168`) ends with `.call(applyInlineStyles, style)` on the legend's own container div.
5. `options.js:583-595` `inherit(options, ...defaults)` — the merge function `legendOptions()` uses — only fills in keys the caller's object doesn't already have; it never strips or rejects an unrecognized key.

**Conclusion, confirmed not assumed: `plotOptions.color = { legend: true, style: {...}, swatchSize: N }` is Plot's own official, documented-shape configuration surface for exactly this gap** — no DOM patching required for the legend fix, unlike the dark-mode background fix. This is the cleanest, most idiomatic path available.

The chart-body font-family gap (§1) is fixed the same way the font-size half already is — add `fontFamily` to the existing `plotOptions.style` object; both land on the same `applyInlineStyles(svg, style)` call already in place.

The tooltip border/radius/shadow gap has **no equivalent declarative option** — `tip.js`'s `defaults` object only exposes `fill`/`stroke` as mark-level *options* (confirmed `tip.js:15-19`; `stroke` genuinely is author-settable per-panel through the standard mark-options path, since `Tip` extends `Mark` and inherits `applyDirectStyles`), but corner radius, padding, and the drop-shadow filter are hardcoded in `getPath()`/`defaults.pathFilter` with no config knob exposed at all. A real fix here has two options: (a) pass `stroke: 'var(--border)'` (or a resolved value, same `getComputedStyle()` pattern the dark-mode fix already uses) as a mark option to soften the border color/opacity — reachable today, no new mechanism; or (b) accept the square corners and fixed drop-shadow as an acceptable, minor Plot-vs-Recharts difference not worth a DOM-patching workaround, since (per `tip.js`'s own construction) there is no `rx` parameter anywhere to intercept. Recommendation: (a) only — see §5.

---

## 5. Itemized customization plan

Every item below is scoped to `ObservablePlotPanel.tsx`'s existing `render()` function (the `plotOptions`/`options` object construction, already the single place all current customization lives) and/or `observablePlotEncoding.ts`'s `resolveObservablePlotEncoding()`. No new file, no new dependency, no grammar change.

### 5a. Chart-body typography — extend the existing fix, don't replace it

```diff
- plotOptions.style = { fontSize: '12px' }
+ plotOptions.style = { fontSize: '12px', fontFamily: 'var(--font-body)' }
```
`Object.assign(svg.style, style)` (confirmed §4) accepts a raw CSS custom-property reference exactly like any other inline-style value — no `getComputedStyle()` resolution needed here, unlike the dark-mode background fix, because CSS custom properties resolve natively wherever they're referenced; `--font-body` is already defined on `:root` (`tokens.css:130`) and this SVG is a descendant of it. **Before**: `system-ui, sans-serif`. **After**: `"Geist Variable", sans-serif` — matching `RechartsPanel`'s inherited body font exactly.

### 5b. Legend typography, color, and swatch size — one new key, using Plot's own confirmed API

```diff
  if (config.fill || config.stroke) plotOptions.color = {
    legend: true,
+   style: { fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)' },
+   swatchSize: 9,
  }
```
- **Font**: `system-ui 10px` → `"Geist Variable" 12px`, matching both the chart body (5a) and Recharts' legend text exactly.
- **Color**: currently unset (inherits whatever ambient text color the panel's ancestors happen to have — unverified/uncontrolled); set explicitly to `--muted-foreground`, matching `ChartLegendContent`'s own label color exactly.
- **Swatch size**: `15×15px` → `9×9px`. Recharts' own legend swatch is 8px; Plot's swatches are real rendered `<svg><rect></rect></svg>` elements (not CSS `border-radius`-capable the way a plain `<div>` is) — `9px` is the closest practical match without introducing a fractional/asymmetric size, and the visual delta between 8px and 9px is not perceptible at this scale, unlike 15px vs 8px today (nearly 2×). A `swatchWidth`/`swatchHeight` override could round-trip through the same `style`-adjacent options object if a future pass wants a non-square swatch; not needed here.
- **Not changed**: the `domain`/`range`/`legend: true` mechanism itself (`035-scenario-label-color`'s own resolution) — this is additive to the existing object, not a restructuring.

One further gap this same object cannot close: Plot's own legend swatches are plain rectangles with no `rx` — `legendSwatches()` (`swatches.js:16-30`) hardcodes `.append("rect")` with no corner-radius parameter anywhere in its own signature. Recharts' 2px-rounded swatch has no Plot-native equivalent reachable through the documented options surface; closing this specific sub-pixel gap would require the same post-render DOM-patching pattern this file already uses for `--plot-background` (reach into the legend's own rendered `<rect>` elements and set `rx="2"` directly). Given the size difference (15px→9px) already does the bulk of the visual-parity work, and a corner-radius mismatch on a 9px square is close to imperceptible, this is flagged as a candidate future refinement, not part of this proposal's core recommendation.

### 5c. Tooltip border and padding

```diff
  if (config.tip) options.tip = resolveTipMode(config.mark)
+ options.stroke = options.stroke ?? undefined  // no change — see below
```
Confirmed via `tip.js:15-19` that `stroke: "currentColor"` is a *mark default*, overridable the same way any Plot mark option is — but doing so here is riskier than the two fixes above: `stroke` on the Tip mark is *also* the channel that would bind a data column to variable per-tooltip border color, if this grammar ever wanted that (it doesn't today — `observablePlotEncoding.ts` never sets `options.stroke` from `config.stroke` for the tip; that binding is for the *data* mark, a separate mark in the same plot). Setting a literal string here is safe (a literal, non-channel value is exactly how `fill`/`stroke` mark options already work when not bound to data — same as `resolveTipMode()`'s own literal-string convention). Recommended:
```ts
if (config.tip) {
  options.tip = resolveTipMode(config.mark)
  options.stroke = 'var(--border)'   // was: "currentColor" (Plot's own default)
}
```
**Before**: a full-opacity 1px border in the tooltip's own text color (`currentColor`) — a bold, high-contrast outline. **After**: a 1px border in `--border` (`#d8d5d2` light / `#23394a` dark), matching the *intent* of Recharts' `border-border/50` (this app has no CSS `color-mix()`-in-SVG-attribute equivalent readily available inline here the way `rechartsPanel.css` does for an HTML element, so a full-opacity `--border` reference — rather than a manually pre-mixed 50%-transparent hex per theme — is the pragmatic match; still a visually softer, token-derived border than today's `currentColor`). Padding (`textPadding = 8`) and the drop-shadow filter are left as Plot's own defaults — see §4's own reasoning for why corner radius and the shadow specifically are not practical to chase further without DOM patching, and are judged not worth it at tooltip scale (a floating, transient element, unlike the always-visible legend).

### 5d. Mark geometry — confirmed NOT a gap worth closing

Checked directly, not assumed: `barY`'s own default corner radius is `0` (sharp), vs. Recharts' `radius={4}` on `<Bar>`. This is a real, visible difference on a bar chart specifically. **Not recommended for this pass** — `RechartsPanel.tsx`'s own `radius: 4` was tuned against shadcn's own real reference examples (`029`'s own research.md §7 record) as a Recharts-specific idiom; Observable Plot's own real, current reference examples (the ones `057-observable-plot-conversion` based its own conversions on) consistently use sharp-cornered bars — introducing a rounded-corner override here would be *diverging from Plot's own idiom* to chase Recharts, the opposite of what typography/legend/tooltip parity is doing (those are fixing this app's own *unintentional* defaults, not overriding a deliberate upstream design choice). Left alone.

### 5e. Categorical fill/stroke color, non-scenario case

Confirmed (§2 table) Plot's implicit-ordinal default scheme is already `schemeObservable10` — the same palette family `--chart-1..5` derive from. A pixel-exact match (setting an explicit `range: ['var(--chart-1)', ...]` for every non-scenario categorical channel) is possible but was not pursued as part of this proposal: it would need to run only when `config.fill`/`config.stroke` isn't `'scenario'` (the `035` branch already owns that case), covers a narrower real surface (categorical-but-not-scenario columns, e.g. `primary_purpose`/`tour_mode` fills already listed in `057`'s own real content), and the visual delta between raw `schemeObservable10` and this app's lightness-adjusted `--chart-1..5` is a contrast/WCAG-tuning nuance, not a "looks like a different app" gap the way the legend/tooltip/font issues are. Flagged as a real, minor, lower-priority follow-up, not bundled into this recommendation.

---

## 6. Recommendation

Implement 5a, 5b, and 5c as one small, additive change to `observablePlotEncoding.ts`'s `resolveObservablePlotEncoding()` (the `plotOptions.style`/`plotOptions.color`/tip `options` construction already lives there) — no new file, no DOM-patching addition beyond what already exists for `--plot-background`, no grammar change, and each fix independently verified against Plot's own real source to use a genuinely supported option, not a guess. Together they close every *structural* gap found in §3's side-by-side comparison (font family/size, legend color/size, tooltip border) with the two remaining items (legend swatch corner-radius, tooltip corner-radius/shadow) explicitly named and deferred as real but minor, and 5d/5e explicitly evaluated and rejected/deferred with reasoning rather than silently left out.

**Not recommended, and why**: pursuing full pixel parity (swatch `rx`, tooltip `rx`, matching the exact `drop-shadow` value per theme) via post-render DOM patching on top of the existing `--plot-background` patch. That pattern is justified today only because it fixes a genuine dark-mode *correctness* bug (invisible white-on-white text) with no declarative alternative; extending it purely for sub-pixel cosmetic parity on elements Plot's own API already lets this app reach 90% of the way to (5a–5c) would add real, ongoing DOM-inspection fragility (the same class of `:scope > svg` scoping bug this file's own comments already record fixing once) for a shrinking marginal visual return.

---

## 7. Implementation Record (all five items, including both originally-deferred ones)

Per direct, explicit user instruction, all five items — 5a/5b/5c plus the two items §5b/§5e explicitly deferred above — were implemented in the same session this proposal was written. Two real, confirmed corrections were found during implementation, neither anticipated by the plan above; both are recorded here rather than silently edited into §4/§5's own text, so the document keeps an honest record of what was planned vs. what was actually true.

### 7a. Shipped as planned

- **§5a (chart-body font-family)** — `plotOptions.style = { fontSize: '12px', fontFamily: 'var(--font-body)' }` in `observablePlotEncoding.ts`. Exactly as planned.
- **§5b (legend typography/color/swatch-size)** — `plotOptions.color = { legend: true, style: {...}, swatchSize: 9 }`. Exactly as planned; §4's traced call chain (`plot.js` → `legends.js` → `legends/swatches.js`) was confirmed correct live.
- **§5e (non-scenario categorical `--chart-1..5` color)** — a new `else` branch alongside `035`'s own `isScenarioColor` branch in `resolveObservablePlotEncoding()`, explicitly gated on `colorField !== 'scenario'` so it can never fire for a scenario-colored channel even when `scenarioDisplay` is `undefined` (preserving `035`'s FR-008 "unresolved falls back to Plot's own default" contract exactly). Cycles `distinctValues.map((_, i) => CHART_COLOR_TOKENS[i % 5])` — verified live against a real 10-category demo panel (Mode Choice tab, "At-Work Subtour Mode Share by Purpose", `fill: tour_mode`) that the cycle wraps correctly. Audited every real `fill:`/`stroke:` usage across all 6 real `public/demo-dashboard-config/*.yaml` files with fill/stroke channels before writing this branch — confirmed the non-scenario real content (`tour_mode`, `primary_purpose` ×3, `school_segment`) is exactly what this branch now colors, and confirmed no real panel's `fill: scenario` usage is touched.

### 7b. Real, confirmed correction #1 — §5c's own plan was wrong about *where* `stroke` needed to be set

§5c's own text above (and §4's "(a) pass `stroke: 'var(--border)'`... as a mark option") assumed `options.stroke` — the same options object passed to `mark(data, options)`, e.g. `Plot.barY(data, options)` — would reach the auto-inferred Tip mark. **Traced the real call chain before writing any code, and it's wrong**: `mark.js`'s `maybeTip()` only normalizes `config.tip` (`true`/`'x'`) into a pointer string stored as `this.tip` on the PRIMARY mark. `plot.js`'s `inferTips(marks)` then builds the companion `Tip` mark via `derive(mark, tipOptions)`, where `tipOptions` starts as `{pointer: this.tip}` ONLY — every other option the primary mark was given, `stroke` included, is discarded. Setting `options.stroke` in `observablePlotEncoding.ts` would therefore have tinted the **bar/line mark's own stroke**, never reached the tooltip at all — a real, silent, wrong-target bug had it shipped as originally planned. Confirmed via direct source read (`node_modules/@observablehq/plot/src/plot.js`'s `inferTips()`/`derive()`) before implementing, not discovered by testing after the fact.

### 7c. Real, confirmed correction #2 — a DOM patch cannot reach the tooltip box at all; §5b's own swatch-rx patch needed the same fix for consistency

Fixed #1 above by DOM-patching `path[filter]` (confirmed unique to the Tip mark across every mark type this app renders) the same way `--plot-background` already works — but **this DID NOT WORK either**, and the reason is a second, deeper, empirically-traced finding: unlike the legend (present in the DOM immediately, part of `Plot.plot()`'s own synchronous initial build), **the Tip mark's own `<path filter="...">` box does not exist in the DOM at all until the viewer's first real pointer interaction.** Confirmed live via a throwaway Playwright script against the real dev server: `document.querySelectorAll('path[filter]')` returned zero elements immediately after mount, after scroll-into-view, and after a 1.5s settle wait — reaching exactly one element only after synthetically dispatching a real `pointermove` event, and even then that freshly-created element carried none of the attributes a one-time post-`render()` patch had set on an earlier, discarded build. A one-time imperative DOM patch, run once per `render()` call, structurally cannot reach a node Plot itself creates lazily, on its own schedule, decoupled from `render()`.

Fixed by moving BOTH the tooltip-border fix and the (already-working) legend-swatch-`rx` fix out of `ObservablePlotPanel.tsx`'s imperative `render()` function entirely, into a new external stylesheet, `src/panels/observablePlotPanel.css` (imported once, at the top of `ObservablePlotPanel.tsx`, matching `RechartsPanel.tsx`/`rechartsPanel.css`'s own established convention):

```css
.observable-plot-chart path[filter] { stroke: var(--border); }
.observable-plot-chart > figure > div rect { rx: 2px; }
```

A plain CSS rule has no timing problem at all — it applies to any matching element the instant it enters the DOM, regardless of when or how many times Plot (re)creates it, and needs no `!important`: Plot sets both `stroke` (`tip.js`'s `applyIndirectStyles()`) and the swatch `rect`'s implicit no-`rx` (`legends/swatches.js`'s bare `.append("rect")`) as SVG **presentation attributes**, which occupy the lowest-priority cascade origin — any real author-stylesheet rule targeting the element directly already wins, and a value set directly on an element always beats one it would otherwise have inherited from an ancestor's own attribute-level value. `rx` is used as a genuine, standards-track CSS Geometry Property for `<rect>` (not just a presentation attribute), confirmed working directly in this app's own target browser (Chromium, via Playwright).

`§5b`'s own swatch-`rx` fix had originally been implemented as a working DOM patch (inside the same `hasLegend` block `render()` already had, re-applied correctly on every render since the legend IS present at initial build) — moved to CSS too, during this same correction, purely for consistency (one technique for both related fixes, not two), not because it was broken.

### 7d. Verification — real, dual-theme, against the live dev server, not assumed from code review alone

`tests/integration/observablePlotPanel.spec.ts` and `tests/integration/valueBoxPanel.spec.ts` (the two specs covering this panel type and its sparkline) were both found, via a `git stash` A/B comparison, to be **entirely pre-existing broken in this environment** — both depend on `tests/fixtures/dashboard-config/`'s on-disk fixture-copy mechanism, which `tests/global-setup.js`'s own header comment confirms `040-test-suite-migration` already retired (the suite now targets real, git-tracked `public/demo-dashboard-config/` content directly) — the same class of large, pre-existing test-infrastructure gap this project's own `CLAUDE.md` history already documents at length (items 27/28's own "eight files... apparently never migrated" findings) and confirmed here, again, unrelated to this feature.

Verified instead directly against the real, git-tracked demo content via a throwaway Playwright script driving a real `npm run dev` server (deleted after use, never committed):

- **`npm run typecheck`** clean. **`npm run test:unit`** 536/536 passing (`tests/unit/observablePlotEncoding.test.ts` extended from 26 to 31 cases — the new §5e-dedicated `describe` block, plus every pre-existing assertion whose expected `plotOptions.style`/`plotOptions.color` shape genuinely changed, updated to match, never weakened to paper over the diff).
- **Real DOM/computed-style measurements**, both themes, against the Summary tab's real "Total Trips by Mode" panel (`fill: scenario`, real legend) and the Mode Choice tab's real "At-Work Subtour Mode Share by Purpose" panel (`fill: tour_mode`, §5e's own branch):

  | Property | Light | Dark | Expected token |
  |---|---|---|---|
  | Chart-body `font-family` | `"Geist Variable", sans-serif` | same | `--font-body` |
  | Legend `font-family` | `"Geist Variable", sans-serif` | same | `--font-body` |
  | Legend `font-size` | `12px` | same | matches chart body |
  | Legend text color | `rgb(115,115,115)` = `#737373` | `rgb(161,161,161)` = `#a1a1a1` | `--muted-foreground` |
  | Legend swatch width | `9` | same | matches plan |
  | Legend swatch `rx` (computed) | `2px` | same | matches Recharts' `rounded-[2px]` |
  | Tooltip `stroke` (computed, on the real, hover-created `path[filter]`) | `rgb(229,229,229)` = `#e5e5e5` | `rgba(245,255,255,0.1)` = `#f5ffff1a` | `--border`, exactly |
  | 10-category `tour_mode` fill colors | cycles `--chart-1..5` twice, in first-seen order | same colors, same order | matches `CHART_COLOR_TOKENS` |

  Every one of the 7 rows matched its real, live token value exactly, in both themes — none assumed from reading the CSS alone.
- **Real screenshots**, both themes, of the Summary tab's Observable Plot panel side by side (in sequence, same viewport) with the Test tab's real, working "Recharts Mode Breakdown (Bar)" panel (`dashboard-8-test.yaml` — confirmed the only real, non-broken Recharts panel left in this app's real content after `057-observable-plot-conversion`'s own near-total conversion) — legend swatch size/shape, font, and overall polish now read as the same design system at a glance, in both themes, closing the gap `057`'s own "shouldn't be able to tell them apart" goal left open. A real hover screenshot (Summary tab, dark mode) confirms the softened tooltip border renders correctly and legibly in the live, interactive UI, not just in a computed-style check.

No regression to `035-scenario-label-color`'s own scenario-color branch: confirmed live that "Total Trips by Mode" (a real `fill: scenario` panel) still resolves its 3 real scenario colors/labels correctly, unaffected by the new `else` branch.
