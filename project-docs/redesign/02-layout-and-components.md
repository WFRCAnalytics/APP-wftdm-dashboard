# 02 — Layout and components

Prototype reference: `prototype/corridor-pro.html` (open it) and `prototype/src/shell.template.html`
(all shell CSS and the render code). Section numbers below match the order a user meets things.

## 1. Page shell

```
┌────┬─────────────────────────────────────────────────────────────────────────────┐
│ ▣  │  Summary                                    ┌ control bar (glass, pinned) ─┐ │
│    │  Regional totals and calibration status     │ Year  Focus │Compare│ 3 sel  │ │
│ ▢  │                                             │ Reference   Values|Change|%  │ │
│ ▢  │                                             └──────────────────────────────┘ │
│ ▢  │  ┌ hero KPI band (5 cells) ─────────────────────────────────────────────┐   │
│ ▢  │  └──────────────────────────────────────────────────────────────────────┘   │
│ ▢  │  ┌ tile ───────────────────────┐ ┌ tile ────────────┐                        │
│    │  │ title · badges          ⤢   │ │                  │   12-column bento grid │
│ ⚙  │  │ [Group by ▾] [Compare as]   │ │                  │   gap 14px             │
│ ☾  │  │ [Treemap|Sunburst|Flow]     │ │                  │                        │
└────┴──│ legend · chart body         │─┴──────────────────┴────────────────────────┘
 nav     └─────────────────────────────┘
```

### 1.1 Floating navigation (left)
- `position: fixed; left: 14px; top: 14px; bottom: 14px;` glass tier (file 01 §4), radius 24, padding `12px 10px`.
- Width **68px** collapsed, **248px** on `:hover` or `:focus-within`, `transition: width .22s`. Content has
  `overflow: hidden`. Labels fade (opacity 0→1, .15s) when expanded. The main area does **not** reflow when
  the nav expands; it overlays the content.
- Top: brand block (38×38 mark with radius 13 filled with `--accent`, inset top highlight, soft accent glow
  `0 6px 14px -6px var(--accent)`; to the right the dashboard **title** (bold) and a small **subtitle**).
  Title, logo (`logoUrl` / `logoUrlDark`) and colors are deployer-configurable from `dashboard-config/index.json`
  exactly as today (`DashboardBranding` in `services/yamlLoader.ts`). If a logo image is configured, show it
  instead of the mark.
- Items: one button per dashboard tab (`dashboard-*.yaml`), 46px tall, radius 15, 20px icon + label, color
  `--mute`. Hover: `--ink` text + `ink 7%` background. Selected: background
  `color-mix(in srgb, var(--accent) 16%, var(--tile))`, `--ink` text, icon colored `--accent`.
  `role="tablist"` on the nav, `role="tab"` + `aria-selected` on items.
- **Sub-navigation (sections):** the selected tab shows its YAML `sections:` as an indented list
  (`margin-left: 33px`, 1px left border `--line`, items 30px tall, radius 8). Clicking scrolls the
  matching tile into view (`scrollIntoView({behavior:'smooth', block:'start'})`). Only the selected tab is expanded.
- Bottom group, separated by a 1px `--line` top border: **Settings** (gear, opens the settings modal) and
  **Light or dark** (toggles theme; the Settings > Appearance tab also offers *System*).
- `header.full_page: true` tabs (for example Explore) render with no tile chrome and no control bar, as today.
- **Below 760px wide** the nav is hidden and replaced by a hamburger button at the top-left of the header that
  opens the same list as a full-height sheet. (The prototype simply hides the nav; the real app must not.)

### 1.2 Header and control bar (top, pinned)
- `<header>` is `position: sticky; top: 0; z-index: 25`. Left: page title (h1) + subtitle. Right: the
  **control bar**. It wraps under the title when the viewport is narrower than ~1300px.
- When `scrollY > 70` add class `compact`: padding `10px 0`, background `color-mix(in srgb, var(--bg) 84%, transparent)`,
  `backdrop-filter: blur(14px)`, bottom hairline `0 1px 0 var(--glass-line)`, h1 21px, subtitle hidden.
- The control bar is a glass pill (radius 999; 22 when it wraps to two rows), padding `7px 8px`, items gap 8.

Control bar items, in order. Hide rules are in the third column.

| # | Control | Behavior | Hide when |
|---|---|---|---|
| 1 | **Year** select, labeled "Year", options `2036 · End of RTP Phase I` etc. | Switches every chart to that model year (file 03 §6). | Only one model year exists. |
| 2 | **Focus** select, labeled "Focus". Groups: *Scenarios*, then *Calibration rounds* (base year only). | Sets the focus scenario. | never |
| 3 | divider, then **Compare** toggle button (track 34×20) | Turns Compare mode on or off (file 03 §3). | Fewer than 2 independent scenarios. |
| 4 | **Scenario picker button**: up to six overlapping color dots (14px, −4px overlap, 2px `--tile-hi` ring), the count in bold, the word "selected", a chevron | Opens the scenario picker (§1.3). | Compare is off. |
| 5 | **Reference** select, labeled "Reference". Options: *Observed* (base year only), each scenario (baseline marked "(baseline)"), calibration rounds (base year only), and *Same scenario in the base year* (see file 03 §5.4) | Sets the reference. | Compare is off. |
| 6 | **Show** segmented control: *Values · Change · % change* | Sets the global display mode. | Compare is off. |

Pill style: height 38, padding `0 6px 0 14px`, radius 999, 1px `--glass-line` border, background `--tile-hi`,
inset top highlight; a 12px `--mute` label then a native `<select>` with weight 500 and 2px focus offset.
Toggle on-state: border `--accent`, background `accent 14%`, knob moves 14px and turns `#04161A`.
Segmented: container padding 3px, background `ink 8%`; button padding `7px 13px`; pressed button gets
`--tile-hi` fill and a small shadow. All are real `<button>`/`<select>` elements with `aria-pressed` / labels.

Defaults on first load: Compare **on** when the deployment has two or more independent scenarios,
off otherwise. Year: the deployment's configured default (prototype: 2036). Reference when Compare is
turned on for the first time: the baseline scenario. Show: Values.

### 1.3 Scenario picker (popover under the control bar)
`position: fixed; top: 84px; right: 28px; width: min(580px, 100% − 24px); max-height: min(560px, 72vh);`
glass tier, radius 22, flex column, `role="dialog"`. Esc and the × button close it. Layout top to bottom:
1. Search field (36px pill) + buttons **All**, **Clear**, close. Placeholder "Search 15 scenarios and 50 rounds".
   *All* selects every independent scenario (not rounds). *Clear* keeps only the focus scenario.
2. Tag chips (28px pills), one per scenario tag plus "Calibration round" in the base year. A pressed chip
   filters the list. Tags come from the manifest.
3. Scrollable list. Each row (grid: checkbox · color dot · name + sub-line · **Focus** · **Reference**):
   - checkbox 20×20 radius 6, filled with the scenario color when checked;
   - sub-line `tag · 6.0% transit · 58.9M VMT` (12px `--mute`) — show the two metrics the deployer marks as
     `summary_metrics`;
   - *Focus* and *Reference* are mini buttons (28px pills), pressed state inverted (`--ink` fill).
   Selecting a focus scenario also adds it to the compare set.
4. **Calibration rounds block** (base year only, hidden when a tag filter excludes it): title, "50 rounds · N
   selected", shortcut buttons **Last**, **Best** (lowest mean error), **Every 10th** (rounds 1, 10, 20, 30, 40, 50),
   **Clear**; then a **strip of one tick per round**: flex row, 2px gap, each tick `flex: 1`, height 30px,
   radius 3, background by that round's worst submodel error status (`--ok`/`--warn`/`--fail`), opacity .4 when
   not selected, opacity 1 with a 2px `--ink` outline when selected. Each tick has `aria-label="Round 12"`
   and a `title` "Round 12: worst error 4.1%". Help text under it.
5. Footer: "3 of 65 compared" on the left; link-style button "Edit colours, names and order" on the right
   (opens Settings > Scenarios).

### 1.4 Hero KPI band (Summary page only, above the tiles)
- Container: background `--tile-hi`, radius 26, padding 6, 1px `--glass-line` border, shadow `--sh1`,
  five equal columns separated by 1px `--line` dividers. Below 1100px: two columns (the fifth spans both).
- Each cell (padding `16px 20px 14px`): label (13px `--mute`); value (mono, `clamp(30px,3vw,42px)`, 500, tracking
  −.04em, no wrap) with a small unit; then a row with a **delta pill**, a caption "vs Baseline" (the reference
  name), and a **sparkline** (64×22, stroke `--accent` 2px, no fill) pushed to the right.
- Cells, in order: **Daily trips** (M), **Transit boardings** (k), **Vehicle miles** (M), **Average trip length** (mi),
  **Calibration** ("5 of 8" = submodels within tolerance, plus eight 14px status squares; no sparkline).
- Values are for the **focus** scenario in the **selected year**. The delta is against the **active reference**
  (Compare off: Observed in the base year, the baseline in other years).
- Delta pill colors: when the focus scenario is being *calibrated against observed* (base year, reference
  Observed) use status colors (≤3% `--ok`, ≤5% `--warn`, else `--fail`). In every other case use the neutral
  pill (`ink 10%` background, `--ink` text). Never color a difference red or green when two scenarios are
  compared; a bigger number is not automatically bad.
- Sparkline (spec, the prototype uses fake data): the metric at each model year for the focus scenario,
  6 points, the current year marked with a 3px dot.

## 2. The tile

A tile is one card. Structure (top to bottom), all inside `<section class="tile">`:

1. **Header row** (padding `16px 18px 0`, flex, space-between): left = title (15.5px/600) with inline
   **badges**, below it the subtitle (12.5px `--mute`); right = **expand** icon button (30px circle).
2. **Control row** (padding `10px 18px 0`, flex wrap, gap 10): in this order
   - **Group by** select pill (only if the tile defines groups). Label is tile-specific ("Group by",
     "Compare by", "Metric").
   - **Compare as** segmented control (only in Compare mode and only if the active view offers ≥ 2 strategies).
     If it offers exactly one non-default strategy, show a read-only badge instead (for example "Side by side").
   - **Scenario** select (only for the *one at a time* strategy): lists the compare set, defaults to the focus.
   - **View** segmented control (chart types), pushed right with `margin-left: auto`. Hidden if one view.
3. **Legend row** (padding `8px 18px 0`, 12.5px `--mute`, min-height 26px, max-height 70px, scrolls). Contents
   depend on the view (file 04). Hidden when empty.
4. **Body**: fixed height from the page layout, padding `8px 14px 14px`. Charts measure the *content box*
   (`clientWidth/Height` minus padding) and redraw on resize. The body never changes its own height.

Badges (inline after the title):
| Badge | When | Style |
|---|---|---|
| `Change vs Baseline` / `% change vs Baseline` | The view supports differences, Compare is on, Show ≠ Values, and the strategy is not *side by side* | mono 11.5px, background `accent 16%`, text `--accent`, radius 999 |
| `Same in every scenario` | Compare is on and the tile's data does not vary by scenario | neutral: `ink 9%` background, `--mute` text, 11.5px |
| `Measured on the base year` | Tile is flagged *base-year only* and the current year is not the base year | neutral |

**Expand overlay:** a full-screen scrim (`rgba(5,7,10,.62)` + 6px blur, padding 3vh 3vw, z 50). The tile renders
at `min(1400px, 100%)` wide and `min(88vh, 100%)` high with `--surface` background; the body height is
`calc(100% − 170px)`. All tile controls keep working. The expand icon becomes ×. Esc or a click on the
scrim closes it. The chart redraws at the larger size.

Tiles that only make sense in Compare mode (scorecard, ranking) are **not rendered** when Compare is off.
Tiles flagged *calibration family* (the calibration progress tile) are not rendered outside the base year.

## 3. Pages and layouts

Pages are the existing dashboard tabs. Tile positions are expressed as `span` (of 12 columns) and body
`height` (px, at ~1500px viewport width). Below 1100px every tile is full width.

**Summary** (Compare off):
| Tile | span × height |
|---|---|
| Calibration progress (base year only) | 12 × 400 |
| Across model years | 12 × 360 |
| Trips by purpose and mode | 7 × 430 |
| Mode share | 5 × 430 |
| Calibration fingerprint | 4 × 410 |
| Trips through the day | 8 × 410 |
| Where transit grows (map) | 6 × 420 |
| District flows | 6 × 420 |

**Summary** (Compare on):
| Tile | span × height |
|---|---|
| Calibration progress (base year only) | 12 × 400 |
| Across model years | 7 × 430 |
| Ranked by metric | 5 × 430 |
| Scenario scorecard | 12 × `min(560, 120 + 40 × rows)` |
| Mode share | 7 × 440 |
| Trips through the day | 5 × 440 |
| Trips by purpose and mode | 7 × 440 |
| Calibration fingerprint | 5 × 440 |
| Where transit grows (map) | 8 × 430 |
| District flows | 4 × 430 |

**Other pages** (identical in both modes):
| Page | Tiles (span × height) |
|---|---|
| Person and household | Auto ownership 7×450 · Population by age and sex 5×450 · Mode share by household income 12×300 |
| Tour models | Trip length distribution 7×440 · District flows 5×440 · Trips through the day 12×330 (default view Heatmap) |
| Mode choice | Mode share 6×420 · Mode share by income 6×420 · Purpose→mode→distance flow 12×460 · Trips through the day 7×400 (default view Stream) · Trips by purpose and mode 5×400 (default view Sunburst) |
| Network | Where transit grows 7×500 · Transit boardings by line 5×500 · Average speed by hour 7×340 · Vehicle miles by county and road type 5×340 |
| Explore | Graphic Walker, full page, unchanged |

A tile's default view and default group come from the YAML (file 06). The tables above are the demo content.

## 4. Settings modal

Opened from the nav bottom or from the picker footer link. `role="dialog"`, scrim z 60. Size
`min(1040px, 100%) × min(720px, 94vh)`, radius 26, background `--surface`. Two columns: a 210px left rail
(`--tile-hi`, tabs as 40px rows with 17px icons, a "Close" row at the bottom) and a scrolling body (padding
`24px 28px 28px`). Esc or scrim click closes. Below 900px the rail becomes a horizontal tab row.

Tabs:

### 4.1 Appearance
Rows (label + helper text on the left, control on the right, 1px `--line` between rows):
1. **Theme**: segmented *Light · Dark · System*.
2. **Colour-blind-safe scenario palette**: switch. Swaps the default scenario palette (file 01 §5.2). Does not
   touch user colors or overrides.
3. **Interface colours**: three color inputs (Primary, Secondary, Tertiary) each with a hex readout, four
   preset swatches, and Reset. Changes apply live and redraw every chart.
4. **Type**: four radio cards (Schibsted Grotesk, Geist, IBM Plex Sans, System UI), each a large "Aa" in that font.
5. **Text size**: range 85–125% step 5, shows the percentage; redraw on release.
6. **Reset appearance**: button; restores deployment defaults.
Helper text at the top: "These choices apply only to you, for this session. A deployment can set its own defaults."
(Reminder: no `localStorage`; session state only.)

### 4.2 Scenarios
A list of the **independent** scenarios (calibration rounds are not listed here). Each row is a draggable card:
`[grip] [color swatch] [display-name input + "tag · 6.0% transit" caption] [Include switch] [Baseline chip | "Set as baseline"] [↑] [↓]`
- Grip drag-and-drop reorders (HTML5 DnD or `@dnd-kit`, which the repo already has). Up/down buttons are the
  keyboard-accessible fallback; both call one `reorderScenario(name, targetIndex)`.
- Color swatch is a 30px circle wrapping a native `<input type="color">`. Changing it stores a viewer override.
- The name input shows the original name as its placeholder; entering text stores a viewer label override.
- *Include* is the same as the picker checkbox. *Set as baseline* moves the Baseline chip; if the reference
  was the old baseline it follows to the new one.
- Buttons above the list: **Reset colours and names**, **Compare all**.
Overrides feed `scenarioDisplay.ts` (viewer override → deployer palette → default).

### 4.3 Basemap
Keep the existing catalog and the stage → Apply flow (UGRC Vector, CARTO Vector, OpenFreeMap, Protomaps, Raster
Tiles). New look only: two columns, left a grid of style cards (thumbnail 76px tall, name, optional
"In use" / "Needs a PMTiles source" captions), right a sticky preview card (220px map, name, source group,
**Apply** primary button, **Revert**, "Applied now: …"). Nothing changes on the map until Apply. A style that
needs a PMTiles source with none configured shows an amber note and falls back to the blank style, exactly
as today. The first card is "Zones only" (no basemap). The prototype draws fake thumbnails; the real
thumbnails render each style's own preview.

### 4.4 Documentation
Static content: how Focus/Compare/Reference work; a table "How each chart compares" (copy it from file 03 §4);
model years; calibration rounds; observed data; reading many scenarios; shortcuts; about the data. Keep it
in `src/layout/documentationModal.tsx`'s content source, updated.

## 5. Shared controls (build once, reuse)

| Component | Spec |
|---|---|
| `Segmented` | `role="group"`; buttons `aria-pressed`; container `ink 7–8%` background, pill radius, padding 3; pressed = `--tile-hi` + 1px inset highlight + small drop shadow. Variants: *chart type* (neutral) and *compare as* (pressed fill `accent 22%` mixed into `--tile-hi`). |
| `PillSelect` | Native `<select>` inside a pill with a muted label. Options in `--surface` with `--ink` text. |
| `MiniButton` | 28px pill, 12.5px, border `--glass-line`, text `--mute`; hover `--ink`; pressed = `--ink` background, `--bg` text; disabled opacity .4. |
| `Button` | 38px pill. Primary: `--accent` fill, `#04161A` text. Default: transparent with `--line` border. |
| `Switch` | 42×24, knob 18px, on = `--accent` track and `#04161A` knob. `role="switch"`. |
| `Checkbox` (scenario) | 20×20 radius 6, 1.5px `--mute` border; checked = scenario color fill + dark tick. |
| `Legend` | Items 12.5px `--mute`, 10px round swatch, 7px gap, 14px between items. Variants: scenario, mode, purpose, income, diverging ramp, calibration-metric (file 04). |
| `Badge` | see §2. |
| `Tooltip` | file 05. |
| `Table` | Header 12.5px `--mute`, 1px `--line` under header, row separators `--grid`, numerals mono 13px right-aligned. `pill` status chips: dot + word, background `status 13%`. |

Reuse existing shadcn primitives (`select`, `switch`, `checkbox`, `radio-group`, `slider`, `dialog`,
`popover`, `color-picker`, `sidebar`, `tabs`) and restyle with the tokens. Create new small components only
for what does not exist: `Segmented`, `PillSelect`, `ControlBar`, `ScenarioPicker`, `RoundStrip`, `Tile` header
parts, `ChartTooltip`.

## 6. Loading, empty and error states

- **Loading:** keep `PanelLoadingState`. Restyle: a muted skeleton the size of the body with a slow 1.2s
  opacity pulse (disabled for reduced motion).
- **No data:** centered text in the body: "No data for {Scenario} in {year}." plus one line saying what to do
  ("Choose another year or scenario."). Never show an empty axis.
- **Error:** keep `PanelErrorState` behavior; restyle to a bordered `--fail`-tinted note inside the body
  with the message and a "Try again" button. Errors never leak raw SQL.
- **Needs a different mode:** a chart that cannot show differences keeps showing values and shows the neutral
  badge (see §2). It never shows a blank panel.
- **Identical scenarios note:** on Summary, when Compare is on and every compared independent scenario has
  identical results for the current year, show a one-line note above the hero: "The compared scenarios have
  identical results for this year, so there is nothing to compare yet. Pick another year or add different
  scenarios." Detect it from the data (compare share vector, trips, VMT, boardings), not from the year.

## 7. Responsive behavior

| Width | Behavior |
|---|---|
| ≥ 1100px | 12-column grid, hero 5 across. |
| 900–1099px | Tiles full width, hero 2 across, picker unchanged. |
| < 900px | Control bar wraps with radius 22; modal becomes one column with a top tab row. |
| < 760px | Nav becomes a hamburger sheet; main margin-left 0; tiles stacked; picker is a bottom sheet. |
Charts always fill their tile body. Side-by-side panels fall back to one column when the body is narrower
than 480px (cells stack and the body scrolls).

## 8. Accessibility checklist for every component
- Every control is a real `button`, `select` or `input`; every icon-only control has `aria-label`.
- Tabs: `role="tablist"/"tab"`, `aria-selected`. Toggles: `aria-pressed`/`role="switch"` + `aria-checked`.
- Dialogs: `role="dialog"`, focus moves in on open and returns to the opener on close, Esc closes.
- Visible focus ring everywhere (file 01 §9). Never remove outlines.
- Each chart container has `role="img"` and an `aria-label` that states the title and the scenario(s). The
  Table view (or an adjacent data table) is the screen-reader alternative.
- Motion respects `prefers-reduced-motion`.
