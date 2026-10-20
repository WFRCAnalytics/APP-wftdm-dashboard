# 01 — Visual language

Everything here is exact. Copy values; do not "improve" them. All colors are written as hex so JavaScript
(D3 cannot parse `color-mix()` or `oklch()`) can read them from CSS variables.

## 1. Principles

1. **Dark first, light equal.** The default look is dark. Light mode is a full peer, never an afterthought.
   Both must be checked for every change. A theme toggle and a "system" option both exist.
2. **Depth without color gradients.** Surfaces are layered with soft shadows and a 1 px inner highlight.
   The only gradients allowed are (a) data legends (color ramps) and (b) one *neutral* top-light vignette
   behind the page. No accent-colored gradients, no gradient borders, no gradient text.
3. **Boldness lives in type and data, not decoration.** Large tabular numerals for headline numbers, tight
   tracking on headings, generous radius. Charts are the color. Chrome stays quiet.
4. **One accent family.** Three user-adjustable colors (primary, secondary, tertiary) drive interface
   highlights and the semantic colors for transit, walking and biking. Scenario identity colors are a
   *separate* palette (section 5).
5. **Color means something.** Gray = driving. Teal/amber/violet (defaults) = transit/walk/bike. Status
   colors (green/amber/red) are reserved for calibration status and never reused for series.
6. **Numbers align.** All numerals in tables, tooltips and KPIs use the mono face with tabular figures.

## 2. Tokens (CSS custom properties)

Define these on `:root` (dark, default), then override for light under both
`@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { … } }` and `:root[data-theme="light"] { … }`.
The two light blocks must contain identical values. Never define a token only inside a media or
`[data-theme]` block.

### 2.1 Dark (default)

```css
:root {
  --bg: #090C11;          /* page background */
  --bg2: #0E1218;         /* hairline between table rows on tiles */
  --surface: #151A23;     /* popovers, modals, inputs */
  --tile: #141922;        /* tile background */
  --tile-hi: #1A202B;     /* raised controls inside a tile, hero band */
  --ink: #EEF1F5;         /* primary text */
  --mute: #8F99A9;        /* secondary text, axis labels */
  --line: #272F3C;        /* borders and dividers */
  --grid: #1F2632;        /* chart gridlines, row separators */
  --glass: rgba(18,23,31,.84);          /* floating panels (nav, control bar, picker) */
  --glass-line: rgba(255,255,255,.09);  /* border of glass and tiles */
  --hi: rgba(255,255,255,.06);          /* 1px inner top highlight */
  --ok: #41C98F; --warn: #E8A93D; --fail: #F36B68;   /* calibration status only */
  --primary: #3DD6C6; --secondary: #FFB454; --tertiary: #B58CFF;   /* user colors, defaults */
  --c-1: #3DD6C6; --c-2: #FFB454; --c-3: #B58CFF;    /* user colors after dark-mode adaptation (see 5.1) */
  --c-obs: #EEF1F5;       /* the color of "Observed" lines (dashed ink) */
  --accent: #3DD6C6;      /* = --c-1 */
  --chart-fs: 11.5;       /* chart text size in px, unitless on purpose (read by JS) */
  --chart-r: 5;           /* bar corner radius in px, unitless */
  --zoom: 1;              /* text-size setting, 0.85 .. 1.25 */
  --sh1: 0 1px 0 var(--hi) inset, 0 1px 2px rgba(0,0,0,.4), 0 10px 28px -14px rgba(0,0,0,.65);
  --sh2: 0 1px 0 var(--hi) inset, 0 24px 60px -16px rgba(0,0,0,.7), 0 4px 12px rgba(0,0,0,.35);
  --font: 'Schibsted Grotesk', system-ui, sans-serif;
  --mono: 'DM Mono', ui-monospace, monospace;
  color-scheme: dark;
}
```

### 2.2 Light

```css
/* identical values in both light selectors */
{
  --bg: #E6EAF0; --bg2: #EEF1F6; --surface: #FFFFFF; --tile: #FFFFFF; --tile-hi: #F6F8FB;
  --ink: #0E131A; --mute: #586376; --line: #DBE1E9; --grid: #E8ECF1;
  --glass: rgba(255,255,255,.88); --glass-line: rgba(14,19,26,.10); --hi: rgba(255,255,255,.90);
  --ok: #167A4A; --warn: #95600F; --fail: #D13E3B;   /* darker than the prototype's #1B8D5C / #AD6F18, which measured 4.19:1 and 4.15:1 on white */
  --c-obs: #0E131A;
  --sh1: 0 1px 0 var(--hi) inset, 0 1px 2px rgba(20,30,45,.08), 0 12px 28px -16px rgba(20,30,45,.28);
  --sh2: 0 1px 0 var(--hi) inset, 0 26px 60px -18px rgba(20,30,45,.4), 0 4px 12px rgba(20,30,45,.12);
  color-scheme: light;
}
```
`--primary/--secondary/--tertiary` keep the user's values in both themes. `--c-1..3` and `--accent` are
recomputed by JavaScript whenever the theme or the user colors change (section 5.1).

### 2.3 Mapping onto the existing shadcn tokens

The repo's `src/styles/tokens.css` defines shadcn roles. Keep those names so shadcn components keep working,
but point them at the new tokens:

| shadcn token | New value |
|---|---|
| `--background` | `var(--bg)` |
| `--foreground` | `var(--ink)` |
| `--card`, `--popover` | `var(--tile)` / `var(--surface)` |
| `--card-foreground`, `--popover-foreground` | `var(--ink)` |
| `--muted`, `--secondary` | `var(--tile-hi)` |
| `--muted-foreground` | `var(--mute)` |
| `--border`, `--input` | `var(--line)` |
| `--ring` | `var(--accent)` |
| `--primary` (shadcn button fill) | `var(--accent)`; `--primary-foreground`: `#04161A` |
| `--destructive` | `var(--fail)` |
| `--sidebar-*` | follow `--glass`, `--ink`, `--mute`, `--line` |

Important: the redesign's `--primary` is the **user color** (default teal). In shadcn, `--primary` was a
near-black button color. Introduce `--accent` as the stable alias and make shadcn's `--primary` use it.
Keep Tailwind's `@config` bridge. Add the new names to `tailwind.config.js` under `theme.extend.colors`
(`tile`, `tile-hi`, `ink`, `mute`, `line`, `grid`, `ok`, `warn`, `fail`, `accent`).

### 2.4 The page backdrop

```css
body { background: var(--bg); color: var(--ink); font: 14px/1.45 var(--font); }
body::before { /* the one allowed gradient: neutral, subtle */
  content: ""; position: fixed; inset: 0; pointer-events: none;
  background: radial-gradient(1100px 600px at 30% -12%, var(--hi), transparent 70%);
}
```

## 3. Typography

Fonts load from Google Fonts: Schibsted Grotesk 400/500/600/700 and DM Mono 400/500. Optional user
choices (Settings > Appearance): Geist, IBM Plex Sans, System UI. The user's font choice replaces `--font`
only; `--mono` never changes. Always declare a fallback stack.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Page title (h1) | `clamp(28px, 3.2vw, 40px)` | 700 | letter-spacing −0.025em, line-height 1.08. Shrinks to 21px when the header is pinned and scrolled. |
| Page subtitle | 15px | 400 | `--mute`. Hidden when the header is compact. |
| Tile title | 15.5px | 600 | letter-spacing −0.01em |
| Tile subtitle | 12.5px | 400 | `--mute`, max 72ch |
| Hero KPI number | `clamp(30px, 3vw, 42px)` | 500 | `--mono`, tracking −0.04em, tabular figures, no wrapping |
| KPI unit | 14px | 400 | `--font`, `--mute`, 6px left margin |
| KPI label | 13px | 400 | `--mute` |
| Body / controls | 14px | 400–500 | |
| Small / badges | 11.5–12.5px | 400–500 | |
| Chart text | `--chart-fs` = 11.5px | 400 | `--mute`; direct labels use `--ink` |
| Table numerals | 13px | 400 | `--mono` |
| Tooltip title | 13px | 600 | |
| Tooltip rows | 12.5px | 400 / 500 | values in `--mono` |

Rules:
- `font-variant-numeric: tabular-nums` on every number that sits in a column.
- Never use all caps for labels. Never tint a single word in a heading.
- Line length: running text ≤ 72 characters.
- The user's text-size setting scales the main content area only (`zoom: var(--zoom)` on `.main`). The
  navigation and tooltips do not scale. Charts re-measure and redraw on change.

## 4. Shape, spacing, elevation

| Element | Radius |
|---|---|
| Tile | 24px |
| Hero band | 26px |
| Settings modal | 26px |
| Floating nav | 24px |
| Pills, segmented controls, chips | 999px |
| Picker panel | 22px |
| Inner cells (side-by-side panels, round strip block) | 14px |
| Inputs, small buttons | 8–10px |
| Chart bars | `--chart-r` (5px); stacked segments 5px; treemap cells 6px; waffle squares ≈ 20% of cell |

Spacing: tile grid gap **14px**. Tile header padding `16px 18px 0`. Control row `10px 18px 0`. Legend row
`8px 18px 0`. Chart body padding `8px 14px 14px`. Page padding: `26px 28px 60px 14px`, left margin 96px
(room for the collapsed nav). Max content width 1760px.

Elevation tiers:
- **Tier 0** page background.
- **Tier 1** tile, hero band: background `--tile` (or `--tile-hi` for the hero), 1px border `--glass-line`,
  shadow `--sh1`.
- **Tier 2** floating glass (nav, control bar, picker, tooltip): background `--glass`,
  `backdrop-filter: blur(20px) saturate(1.3)`, 1px border `--glass-line`, shadow `--sh2`.
- **Tier 3** modal: background `--surface`, border `--glass-line`, shadow `--sh2`, with a full-screen scrim
  `rgba(5,7,10,.6)` and `backdrop-filter: blur(6px)`.

z-index scale: header 25, nav 30, picker 45, expand overlay 50, settings modal 60, tooltip 300.

## 5. Color systems

### 5.1 User colors and dark-mode adaptation

Defaults: primary `#3DD6C6`, secondary `#FFB454`, tertiary `#B58CFF`. Presets offered in Settings:
WFRC blue `#2457D6 / #D98A00 / #7A4FD8`, Wasatch `#0E7C7B / #E4572E / #5C6BC0`, Slate `#334E68 / #E0A100 / #2F9E8F`,
Plum `#6D3FC8 / #0C8F6F / #D9534F`.

Algorithm `applyAccents()` (run on theme change and on any user color change):
```
for i in 1..3:
  base = user color i                      (hex)
  c_i  = isDark ? mix(base, '#FFFFFF', 0.28) : base     (RGB interpolation)
  set --c-i to hex(c_i)
set --accent = --c-1
```
Everything that needs "the primary color" in JavaScript reads `--c-1`, never `--primary`.

### 5.2 Scenario identity palette

Each scenario has a **stable default color**: `palette[scenarioIndex % 15]`, where `scenarioIndex` is the
scenario's position in the manifest order at load time (not its current display order). Reordering the list
never changes a color.

Default (15):
```
#8A94A6  #4C8BF5  #F2994A  #2FBF8A  #EB5757  #A66CFF  #18B4C8  #E8C547
#E26BA6  #9C7A5B  #7BC043  #5865F2  #B5179E  #00897B  #8E9E2A
```
Index 0 (slate) is meant for the baseline so alternatives stand out.

Colour-blind-safe (15), used when the user turns the Settings switch on:
```
#8C8C8C  #0072B2  #E69F00  #009E73  #D55E00  #CC79A7  #56B4E9  #F0E442
#4D4D4D  #004B7A  #B37700  #00694D  #9E4400  #A5548A  #99D3F5
```
(First eight are Okabe–Ito based. The rest are lightness variants. Validate any change with a CVD simulator.)

Theme adaptation of default colors (not of user overrides): convert to HCL; in dark mode force
`L = max(L, 62)`; in light mode force `L = min(L, 60)`; convert back to hex.

Resolution order for a scenario's color (matches the existing `scenarioDisplay.ts`):
`viewer override` → `deployer scenarioPalette` → `default palette (above)`. The same order applies to
the display label (`viewer label` → `manifest label` → `scenario name`).

More than 15 scenarios: indexes wrap (`% 15`). The design assumes at most 12–15; beyond that, tell the
user in the picker footer that colors repeat and point them to the scorecard.

### 5.3 Calibration rounds (ordered series)

Rounds use a **sequential ramp**, not the categorical palette. For round `r` of `N` (1-based):
```
start = mix(--surface, --c-1, isDark ? 0.55 : 0.40)
color = mix(start, --c-1, (r - 1) / (N - 1))
```
Early rounds are dim, the last round is the full accent. A viewer color override still wins.

### 5.4 Semantic category colors

| Meaning | Color |
|---|---|
| Drive alone | `mix(--surface, --ink, 0.34)` |
| Shared ride | `mix(--surface, --ink, 0.58)` |
| Transit | `--c-1` (primary) |
| Walk | `--c-2` (secondary) |
| Bike | `--c-3` (tertiary) |
| School bus | `mix(--c-2, --c-3, 0.5)` |

`mix(a, b, t)` is plain sRGB interpolation, returned as hex.

Categorical series that are *not* modes or scenarios (trip purposes, submodels, volume metrics, districts):
`cat(i)` for i = 0…7:
```
cat0 = c1;  cat1 = c2;  cat2 = c3;
cat3 = mix(c1, c2, .5);  cat4 = mix(c2, c3, .5);  cat5 = mix(c3, c1, .5);
cat6 = mix(c1, '#FFFFFF', .35);  cat7 = mix(c2, '#FFFFFF', .35)
```
(The prototype's formula for i ≥ 6 is buggy. Use this list.) Neutral series (for example "all other")
use `mix(--surface, --ink, 0.5)`.

Ramps:
- **Sequential single-hue** `ramp(color, n, lo)`: colors from `mix(color, --surface, k)` to `color`, where
  `k = isDark ? 0.5 : lo (default 0.72)`. Used for income groups (primary, `lo = .55`, n = 4), vehicle
  ownership (secondary, `lo = .8`, n = 5) and facility types (primary, `lo = .75`, n = 4).
- **Map choropleth (values)**: `interpolateRgb(--surface → --c-1)`, domain 0…14 (percent transit share).
- **Diverging (differences)**: negative = `--c-2` (secondary), mid = `mix(--surface, --ink, .16)`,
  positive = `--c-1` (primary). Domain symmetric around 0, clamped at the 96th percentile of absolute
  values (maps) or ±25% (treemap cells). *Direction, not judgement:* up is primary, down is secondary.
  Never use green/red here.
- **Status** (calibration only): `--ok` ≤ 3%, `--warn` ≤ 5%, `--fail` above. Always pair color with a word
  ("Within 3%", "Review", "Off target") or an icon.

Text on a colored fill: use `#0C1118` if the fill's HCL lightness > 62, otherwise `#FFFFFF`.

## 6. Chart theme (applies to every Observable Plot and D3 chart)

All charts must read these from CSS variables at draw time (never hard-code). Create `src/panels/chartTheme.ts`:

```ts
export interface ChartTheme {
  ink: string; mute: string; grid: string; surface: string; line: string;
  font: string; fontSize: number; barRadius: number; ok: string; warn: string; fail: string;
}
export function readChartTheme(): ChartTheme { /* getComputedStyle(document.documentElement) → trimmed values */ }
export function plotBase(t: ChartTheme, width: number, height: number, extra: object): object {
  return { width, height, ...extra,
    style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: t.fontSize + 'px', overflow: 'visible' } };
}
```

Rules for every chart:
- Transparent background. Axis text `--mute`, 11.5px. Gridlines `--grid`, horizontal only, 1px.
- No axis domain lines. Tick marks are short. Axis labels only when the unit is not obvious.
- Marks never have outlines except a 2px `--surface` ring on dots so they separate from lines.
- Dashed ink line (`strokeDasharray: '4 3'`, 1.5–1.6px) = Observed / the reference.
- Target bands: `--ok` at 9–12% opacity with a dashed `--ok` edge.
- Direct labels use `--ink` with a 3px `--surface` halo (`paint-order: stroke`).
- Redraw on theme change, color change, font change, text-size change and container resize.
- Use `d3` color helpers on **hex** values only. Resolve variables to hex before passing them to D3.

## 7. Motion

- Tile entrance: opacity 0→1 and `translateY(6px)→0`, 0.4s ease, once per page render, on the **tile
  element only** (never on chart children, because charts redraw on resize and the animation would replay).
- Hover/pressed transitions 0.15s. Navigation width 0.22s. Cross-highlight opacity 0.15s.
- Respect `prefers-reduced-motion: reduce`: no entrance animation, no transitions longer than 0.01s.
- Chart draws are instant (no tweens) except hierarchical zoom (existing `hierarchyTween.ts`, keep).

## 8. Iconography

Stroke icons on a 24×24 grid, stroke width 1.8, round caps and joins, `currentColor`. Use the existing
`lucide-react` set. Sizes: nav 20px, buttons 15–17px, tile tools 15px. Never use emoji.

## 9. Accessibility of color

- Text contrast ≥ 4.5:1 against its surface in both themes. Measured with the WCAG formula:
  dark `--ink` on `--tile` 15.6:1, dark `--mute` on `--tile` 6.1:1, light `--ink` on `--tile` 18.6:1,
  light `--mute` on `--tile` 6.1:1 (5.0:1 on the page background), `--fail` in light 4.7:1, `--ok` in light
  (`#167A4A`) 5.4:1, `--warn` in light (`#95600F`) 5.3:1. Re-measure if you change any token.
- Status text on the page background in light mode (not on a tile) is large or bold only.
- Chart colors are not the only carrier of meaning: legends name every series, tooltips name values, and
  hovering a legend entry isolates that series.
- Focus ring: 2px solid `--accent`, 2px offset, on every interactive element.
- Provide a Table view for every chart family (see file 04) as the non-visual alternative.
