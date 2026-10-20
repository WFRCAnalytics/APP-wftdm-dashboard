# 05 — Tooltips and interaction

One tooltip for every chart, one hover vocabulary, three kinds of sync. The reference code below is the
prototype's `tt.js` and the sync block of `pages.js`, translated to TypeScript. Port it; do not redesign it.

## 1. Anatomy

```
┌──────────────────────────────────────────┐
│ ● Walk                       share of trips│   title (swatch optional) + sub-title (muted, right)
│ ● Infill density      11.8%      +2.6 pts  │   row: swatch · label · VALUE (mono) · delta (mono, muted)
│ ● Frequent transit     8.6%      +0.6 pts  │   hovered row is bold
│ ● Baseline             8.0%                │
│   Observed             8.4% ±0.9           │   bold reference row
│ ──────────────────────────────────────────│
│ Observed: 2023 household travel survey …   │   footer (muted, 12px)
└──────────────────────────────────────────┘
```

Spec object (the only thing a chart hands to the tooltip):

```ts
export interface TipRow {
  k: string;        // label
  v: string;        // value, already formatted
  c?: string;       // swatch color (hex or CSS var); omit for no swatch (a blank 8px slot keeps alignment)
  b?: boolean;      // bold row (the hovered series, or the reference)
  d?: string;       // delta text, muted
  dc?: string;      // delta color (CSS color); default var(--mute)
}
export interface TipSpec {
  title?: string;
  swatch?: string;  // color dot before the title
  sub?: string;     // muted text at the right of the title row
  rows?: TipRow[];
  foot?: string;    // muted footer, separated by a 1px line
}
```
Escape every string you inject (`& < > "`). Values are pre-formatted by the chart (units, signs, decimals per
file 03 §5.1).

Style:

```css
.wf-tip { position: fixed; z-index: 300; pointer-events: none; min-width: 168px; max-width: 320px;
  padding: 11px 13px 10px; border-radius: 14px; background: var(--glass);
  backdrop-filter: blur(16px) saturate(1.3); border: 1px solid var(--glass-line); box-shadow: var(--sh2);
  font-size: 12.5px; line-height: 1.35; opacity: 0; transition: opacity .08s; }
.tt-h { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.tt-h i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.tt-h em { font-style: normal; font-weight: 400; color: var(--mute); margin-left: auto; padding-left: 12px; }
.tt-r { display: grid; grid-template-columns: 10px 1fr auto auto; gap: 4px 8px; align-items: center; padding: 2px 0; }
.tt-r i { width: 8px; height: 8px; border-radius: 50%; } .tt-r i.n { background: transparent; }
.tt-k { color: var(--mute); } .tt-r.b .tt-k { color: var(--ink); }
.tt-v { font: 500 12.5px var(--mono); text-align: right; } .tt-d { font: 12px var(--mono); font-style: normal; }
.tt-f { margin-top: 7px; padding-top: 7px; border-top: 1px solid var(--line); color: var(--mute); font-size: 12px; }
```

## 2. The service (`src/services/tooltip.ts`, plain TS, no React)

```ts
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
let el: HTMLDivElement | null = null;
const node = () => (el ??= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'wf-tip', role: 'tooltip' }));

export function tipHtml(o: TipSpec): string { /* build the markup exactly as in the anatomy above */ }

export const tooltip = {
  show(spec: TipSpec | string, e: { clientX: number; clientY: number; target?: EventTarget | null }) {
    // Suppress per-chart tooltips inside a side-by-side grid: the grid shows a synced one instead (section 4).
    if (e.target instanceof Element && e.target.closest('.wf-multi')) return;
    const t = node(); t.innerHTML = typeof spec === 'string' ? spec : tipHtml(spec); t.style.opacity = '1';
    const pad = 16, r = t.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;     // flip left near the right edge
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;  // flip up near the bottom edge
    t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
  },
  hide() { if (el) el.style.opacity = '0'; },
};
```
Rules: the tooltip follows the pointer with a 16px offset, flips at viewport edges, never takes pointer
events, hides on `mouseleave` of the chart, fades in 80ms. Only one exists in the document. It is outside the
`zoom` container so it does not scale with the text-size setting. Touch: a tap shows it, a tap elsewhere hides it.

## 3. Cross-highlight (hover a mode, trace it everywhere)

Purpose: in compare and analysis, hovering "Transit" in any chart makes every transit-colored mark in every
other visible chart stand out.

- Every mark colored by *mode* carries `data-m="<Mode name>"` (treemap leaf group, sunburst leaf arc, stacked
  segment group, Sankey link and mode node, donut arc, donut list row, stream band if drawable).
- Legend chips for modes carry `data-lm="<Mode>"`.
- `highlightMode(mode | null)`: for every element in the document with `data-m`, set
  `opacity = (!mode || el.dataset.m === mode) ? '' : '.2'` and `transition: opacity .15s`.
- Handlers: `mouseenter`/`mousemove` on a marked element → `highlightMode(el.dataset.m)`; `mouseleave` → `highlightMode(null)`.
- Scenario legend chips carry `data-sc="<scenario>"`. Hovering one calls `isolateScenario(tileBody, name)`:
  find every SVG descendant whose `fill` or `stroke` attribute equals a scenario color (compare lowercase hex),
  and set `opacity: .14` on those belonging to *other* scenarios; `null` restores. (Works for Plot output because
  Plot writes fill/stroke as attributes.)
- Charts must **not** also add their own tooltips on legend chips.

## 4. Synced hover across side-by-side panels

Applies to `multi` and `grid` strategies (waffle, treemap, sunburst, stacked bars, maps).

Mark contract — every hoverable mark inside a side-by-side panel sets:

| Attribute | Meaning | Example |
|---|---|---|
| `data-key` | Identity of the item, **identical across panels** | `"2 cars"`, `"Work|Drive alone"`, `"1413"` |
| `data-title` | Tooltip title | `"2 cars"`, `"Work · Drive alone"`, `"TAZ 1413"` |
| `data-val` | The panel's formatted value | `"40.7%"`, `"1.10M"` |
| `data-num` | The same value as a number | `40.7` |
| `data-rel` | `"1"` if differences are relative (%), omit for absolute | treemap/sunburst: `"1"` |
| `data-unit` | Unit text appended to absolute differences | `" pts"` |

The grid container has class `wf-multi`. Each panel (cell) has `data-s="<scenario>"` and `data-c="<color>"`.
The first cell is the reference. Implementation (put it in `CompareHost` after drawing the cells):

```ts
grid.addEventListener('mousemove', (e) => {
  const t = (e.target as Element).closest('[data-key]') as HTMLElement | null;
  if (!t || !grid.contains(t)) return clear();
  const key = t.dataset.key!;
  const hits = cells.map((cell) => [...cell.querySelectorAll<HTMLElement>('[data-key]')].filter((x) => x.dataset.key === key));
  grid.classList.add('syncing');
  grid.querySelectorAll('.sync').forEach((x) => x.classList.remove('sync'));
  hits.forEach((arr) => arr.forEach((x) => x.classList.add('sync')));          // highlight in every panel
  const ref = hits[0]?.[0], refNum = ref ? Number(ref.dataset.num) : NaN, rel = t.dataset.rel === '1', unit = t.dataset.unit ?? '';
  const rows = cells.map((cell, i) => {
    const m = hits[i]?.[0]; if (!m) return null;
    const num = Number(m.dataset.num);
    const d = i > 0 && isFinite(refNum) ? (rel ? (refNum ? (num / refNum - 1) * 100 : 0) : num - refNum) : null;
    return { k: label(cell.dataset.s!) + (i === 0 ? ' · reference' : ''), v: m.dataset.val!, c: cell.dataset.c, b: i === 0,
             d: d == null ? '' : (d > 0.005 ? '+' : d < -0.005 ? '−' : '') + Math.abs(d).toFixed(1) + (rel ? '%' : unit) };
  }).filter(Boolean) as TipRow[];
  tooltip.show({ title: t.dataset.title, sub: `${rows.length} scenarios`, rows }, { clientX: e.clientX, clientY: e.clientY, target: document.body });
});
grid.addEventListener('mouseleave', clear);   // clear(): remove 'syncing' + '.sync', tooltip.hide()
```
CSS:
```css
.wf-multi .sync { stroke: var(--ink) !important; stroke-width: 2.4px !important; }
.wf-multi g.sync rect { stroke: var(--ink); stroke-width: 2.4px; }
.wf-multi.syncing [data-key]:not(.sync) { opacity: .5; }
```
Result: hover "2 cars" in one waffle → the same squares light up in every panel and one tooltip lists each
scenario's value with its change from the reference. Cap the tooltip to 8 rows (reference + 7) and add
"N more not shown" if there are more panels than that.

Maps: also link the **camera** (file 03 §4.2 `grid`). Time-axis charts in side-by-side panels should share a
crosshair: not built in the prototype; implement as a custom event `wf-x` carrying the snapped x value that
every `cross()` instance listens to (P6, optional).

## 5. Shared crosshair for continuous axes (lines, streams, trend, rounds)

Used by: Trips through the day (Lines, Stream), Across model years, Calibration progress (Difference/Values).
Contract:

```ts
interface CrossOptions {
  ml: number; mr: number; mt: number; mb: number;     // the plot margins you passed to Plot (px)
  w: number; h: number;                               // plot size
  x0: number; x1: number;                             // domain endpoints
  snap?: (raw: number) => number;                     // default: Math.round clamped to [x0,x1]; years use nearest milestone
  bg: string;                                         // ring color for the dots (surface)
  spec: (x: number) => TipSpec;                       // tooltip content at the snapped x
  ys?: (x: number) => { y: number; c: string }[];     // pixel y and color of each series' dot (use plot.scale('y').apply(value))
  click?: (x: number, e: MouseEvent) => void;         // makes the plot clickable (cursor: pointer)
}
```
Behavior: append a non-interactive `<g>` to the Plot `<svg>`; on `mousemove` convert the pointer's x (relative to the
svg) to the data domain (`x0 + (px − ml)/(w − ml − mr)·(x1 − x0)`), snap, draw a 1px dashed vertical guide
(`currentColor`, 40%), draw one 4.5px dot per series with a 2px `bg` ring, show the tooltip; hide when the pointer
leaves the plot area or the svg. `click` receives the snapped x.
Do **not** use Plot's `pointer` transform or `Plot.tip` for these charts.

## 6. Observable Plot marks (bars, dots, cells, links)

Plot has no per-mark DOM events, so use its **`title` channel** to tag each element, then convert the tags:

```ts
// 1. when building the mark:   Plot.barY(rows, { …, title: (d, i) => 'wfa:' + i })     // 'a' = store key, i = index in `rows`
// 2. after Plot.plot():
export function armPlot(plot: SVGElement, store: Record<string, unknown[]>, spec: (d: any, key: string) => TipSpec | null,
                        click?: (d: any, key: string, e: MouseEvent) => void) {
  plot.querySelectorAll('title').forEach((t) => { t.parentElement!.setAttribute('data-wf', t.textContent!); t.remove(); }); // removes native browser tooltips
  plot.addEventListener('mousemove', (e) => {
    const n = (e.target as Element).closest('[data-wf]'); if (!n) return tooltip.hide();
    const [k, i] = n.getAttribute('data-wf')!.slice(2).split(':');
    const d = store[k]?.[+i]; const s = d && spec(d, k); s ? tooltip.show(s, e) : tooltip.hide();
  });
  plot.addEventListener('mouseleave', tooltip.hide);
  if (click) plot.addEventListener('click', (e) => { /* same lookup, then click(d, k, e) */ });
}
```
Use several store keys (`'wfa:'`, `'wfb:'`) when one chart has marks over different arrays (dumbbell: dots vs
observed circles). Because one tooltip can list **all series for the same category** (for example every
scenario for the "Transit" facet), build the row list from the whole `rows` array filtered by the hovered
datum's category, not from the hovered datum alone.

Things that do **not** work in Plot 0.6 (found the hard way):
- `ariaLabel` as a per-datum channel (not applied). Use `title`.
- `Plot.text` with function-valued `dx` or `textAnchor` (renders NaN). Split into two marks with constants.
- `Plot.rect` with only `y1,y2` (and `fx`) spans the facet's full width — that is how the margin-of-error band is drawn.
- Passing CSS variables or `color-mix()` as colors to anything D3 touches. Resolve to hex first.

## 7. D3 marks

Call `tooltip.show(spec, event)` from `mousemove` and `tooltip.hide()` from `mouseleave`. Build the `TipSpec`
yourself; do not create per-chart tooltip elements. Add the `data-*` attributes from §3/§4 where relevant.
If a chart already highlights on hover (waffle dims other categories to 18%; chord dims other ribbons to 8%),
keep that behavior and add the tooltip.

## 8. Click and drag behavior (summary)

| Where | Action | Result |
|---|---|---|
| Round strip tick (picker) | click | toggle the round in the compare set |
| Calibration progress chart | click / shift-click | focus that round / toggle it in the compare set |
| Across model years chart | click | switch the dashboard's year |
| Sunburst group arc | click | zoom into that group; click the center to go back |
| Zone map zone | click | pin an outline on the zone (and, in the real app, open the zone inspector if configured) |
| Scorecard column header | click | sort (toggle direction); `Enter` works |
| Swipe handle | drag / arrow keys | move divider / ±24px |
| Legend scenario chip | hover | isolate that scenario in the tile |
| Legend mode chip | hover | cross-highlight that mode everywhere |
| Tile title area | none | (reserved) |
| Expand icon | click | open the expand overlay |
| Scenario picker row | click Focus / Reference | set focus / reference |
| Nav sub-item | click | scroll to that tile |

## 9. Keyboard and assistive tech

- Tab order follows visual order: nav → control bar → tiles (header controls, then chart region).
- All segmented controls: arrow keys move between buttons, Enter/Space activates (native buttons give Enter/Space;
  add Left/Right roving focus if time allows).
- Swipe handle: `role="slider"`, `aria-valuenow` = percent, Left/Right arrows move it.
- Crosshair charts: when the chart region has focus, Left/Right arrows move the crosshair one step and the tooltip
  shows (spec; the prototype is mouse-only). Provide this in P8.
- The Table view of each chart is the supported non-visual path. Every chart container has `role="img"` with an
  `aria-label` like "Mode share for Baseline, Frequent transit and Infill density, base year".
- Tooltips are supplementary; no information may exist *only* in a tooltip that is not also reachable in a table.

## 10. Tests for this layer
- Unit: `tipHtml` escapes `<script>` in labels; row layout renders with and without swatch/delta/foot.
- Unit: `armPlot` removes all `<title>` nodes and maps `data-wf` to the right datum for a faceted chart.
- Playwright: hover a bar → tooltip lists all scenarios for that mode; hover a waffle square in side-by-side →
  `.sync` appears in every panel and one tooltip is visible; hover a legend scenario → other series fade.
- Playwright: zooming one map in a `grid` changes the transform of all maps to the same value.
- Playwright: tooltip flips left at the right viewport edge and up at the bottom edge.
