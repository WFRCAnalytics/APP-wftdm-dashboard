# Phase 0 Research: shadcn/Recharts Chart Panel Type

No `[NEEDS CLARIFICATION]` markers remained in the Technical Context. This
document records the concrete decisions made resolving the spec's own
deferred design questions (exact chart-color values, exact grammar field
names, dependency/version compatibility) into an implementable design.

## §1. The five new `--chart-1`..`--chart-5` tokens — exact values

**Decision**:

| Token | Light value | Dark value |
|---|---|---|
| `--chart-1` | `#023c5b` (= `--brand-wfrc-blue`) | `#52b6d5` (= `--brand-wfrc-secondary-blue`) |
| `--chart-2` | `#8a5a0f` (new — darker amber/gold, same hue family as the yellow accent) | `#f8b93e` (= `--brand-wfrc-yellow`) |
| `--chart-3` | `#3f6b74` (new — muted teal-slate) | `#8fc1cc` (new — lighter teal-slate) |
| `--chart-4` | `#7f7a76` (= `--brand-wfrc-gray`) | `#a8a29c` (new — lighter gray for dark-mode legibility) |
| `--chart-5` | `#7a4a8a` (new — muted purple, rounds out the family) | `#c99ed6` (new — lighter purple) |

**Rationale**: `panels/SankeyPanel.tsx`'s own real `FALLBACK_TOKEN_VARS`
(`--primary`, `--brand-wfrc-secondary-blue`, `--brand-wfrc-yellow`,
`--brand-wfrc-gray`) establishes a proven categorical sequence built
entirely from existing WFRC brand hues — the starting point for this
design, directly satisfying the spec's own FR-006 ("visually consistent
with — not a clash against — this app's existing WFRC brand blue") by
construction, not by approximation.

**A second real design flaw, caught and fixed during implementation, not
shipped**: an earlier draft of this table set `--chart-2`'s DARK value to
`--brand-wfrc-secondary-blue` as well — copying Sankey's own fallback
sequence's first two entries (`--primary`, `--brand-wfrc-secondary-blue`)
directly, without noticing that `--primary` itself already RESOLVES to
`--brand-wfrc-secondary-blue` in dark mode. The result: `--chart-1` and
`--chart-2` would have rendered as the exact same color in dark mode —
harmless for Sankey's own 4-color fallback list (never depended on by
anything that assumes 2 adjacent entries are visually distinct), but a
real, confirmed usability defect for a 5-series categorical chart palette
specifically, where two indistinguishable series colors defeats the
entire point of a legend. Caught before implementation continued past the
tokens themselves — no component ever shipped with the broken pair.
Fixed by keeping `--brand-wfrc-yellow` (light/dark) as `--chart-2`
instead (already the second-most-recognizable WFRC brand hue after blue,
and — once its own light-mode contrast gap below is also fixed —
genuinely distinct from `--chart-1` in both themes), and giving the
now-freed teal-slate hue to `--chart-3` and a new muted purple to
`--chart-5`, verified pairwise-distinct in both themes, not just
individually contrasted against the background.

**A real, confirmed gap found while verifying this, not assumed safe**:
computing real WCAG contrast ratios (the same relative-luminance formula
`tests/unit/tokenContrast.test.ts` already uses) against a white light-mode
background found that two of Sankey's own raw fallback values fail even
the relaxed WCAG non-text/graphical-object minimum (3:1) in LIGHT mode
specifically: `--brand-wfrc-secondary-blue` (`#52b6d5`) computes to
**2.33:1** against `#ffffff`, and `--brand-wfrc-yellow` (`#f8b93e`)
computes to **1.75:1** — both real fails. This has been invisible for
Sankey itself (its nodes/links are filled, bordered shapes on a
`bg-card` surface, not thin, borderless strokes), but a `recharts` line
chart's own thin stroke, or an unbordered bar fill, would make this a
real, visible legibility problem in light mode specifically. Reusing the
raw values verbatim for `--chart-2`/`--chart-3` was therefore rejected;
`--chart-2`/`--chart-3`'s LIGHT-mode values are new, deliberately darker
variants within the same hue (following the exact same light/dark-
lightness-inversion pattern `tokens.css` already uses for `--primary`
itself: a darker value for light mode, a lighter one for dark), while
their DARK-mode values reuse the existing brand hex exactly (already
well-contrasted against the dark background, confirmed below).

**Verified, real computed contrast ratios** (relative-luminance formula,
matching `tokenContrast.test.ts`'s own implementation; light background
`#ffffff`, dark background `#081b26`):

| Token/theme | Value | vs. background | Ratio |
|---|---|---|---|
| chart-1 light | `#023c5b` | `#ffffff` | 11.67 |
| chart-1 dark | `#52b6d5` | `#081b26` | 7.54 |
| chart-2 light | `#8a5a0f` | `#ffffff` | 5.92 |
| chart-2 dark | `#f8b93e` | `#081b26` | 10.04 |
| chart-3 light | `#3f6b74` | `#ffffff` | 5.89 |
| chart-3 dark | `#8fc1cc` | `#081b26` | 8.93 |
| chart-4 light | `#7f7a76` | `#ffffff` | 4.24 |
| chart-4 dark | `#a8a29c` | `#081b26` | 6.96 |
| chart-5 light | `#7a4a8a` | `#ffffff` | 6.62 |
| chart-5 dark | `#c99ed6` | `#081b26` | 7.82 |

All five are also verified pairwise-distinct from each other within each
theme independently (blue/amber/teal-slate/gray/purple in light mode;
their brighter dark-mode counterparts in dark mode) — the specific defect
the flaw above would otherwise have reintroduced.

Every value clears 4.5:1 (this app's own established text-pair bar,
`tokenContrast.test.ts`'s existing `WCAG_AA_MIN_CONTRAST`), a stricter bar
than the 3:1 non-text/graphical-object minimum that's actually the
relevant WCAG criterion for a chart fill/stroke color (not text) — chosen
deliberately, not because the stricter bar is required, but because it
gives real, comfortable margin rather than exactly grazing the minimum.

**Alternatives considered**:
- A generic default palette (e.g. shadcn's own docs example values,
  `oklch(0.646 0.222 41.116)` etc.) — rejected outright per the spec's own
  FR-006 and the `wftdm-design-system` skill's own Brand Identity section:
  this app's own real brand hues exist and must be the basis, not a
  generic starting point.
- Reusing Sankey's raw fallback values unchanged for all five — rejected
  once the real light-mode contrast failure above was found; would have
  shipped a real, confirmed legibility regression for exactly the panel
  type this feature exists to add.

**Test-verification approach**: `tokenContrast.test.ts` gains a new,
clearly-separate check (not folded into the existing `-foreground`/base
pairing loop, which checks true text-contrast pairs at the stricter 4.5:1
bar) asserting each `--chart-N` value achieves at least 3:1 against both
`--background` values, in both `:root` and `.dark` — the correct WCAG
criterion for a graphical fill color, stated honestly as its own,
distinct check rather than conflated with the text-contrast one.

## §2. Grammar field names

**Decision**:

```yaml
- type:       recharts
  title:      Mode Share by Purpose
  metric:     trip_mode_share
  chart_type: bar          # 'bar' | 'line' | 'area'
  x:          purpose      # category/axis column — a real, literal
                            # result-set column name
  y:          share        # value column
  series:     mode         # optional — a column whose distinct values
                            # split the data into multiple named,
                            # separately-colored series
```

`x`/`y`/`series` are plain literal column names, following
`ObservablePlotPanelConfig`'s own already-established precedent
(`x`/`y`/`fill`/`stroke`) exactly — never a `$metric.`-prefixed
placeholder string (`PlotlyTraceConfig`'s older convention). `series` is
named distinctly from Observable Plot's own `fill`/`stroke` (which name a
literal SVG visual channel, Observable-Plot-specific vocabulary) because
Recharts' own real API has no equivalent single-channel concept — a
Recharts chart is composed of one `<Bar>`/`<Line>`/`<Area>` element PER
series, each needing its own literal `dataKey`. `series` names the
SOURCE COLUMN whose distinct values become those separate elements — the
transform in `rechartsEncoding.ts` (§3 below) is what actually produces
the one-`dataKey`-per-distinct-value shape Recharts needs from it.

**Rationale**: matches the spec's own Assumptions section directly
(precedent-based field naming, no `$metric.` prefix) — `x`/`y` are
immediately recognizable from `observable-plot`'s own grammar; `series` is
a new but self-explanatory name for a genuinely new concept (Recharts'
own per-series `dataKey` composition has no direct Observable Plot
equivalent to borrow a name from).

**Alternatives considered**:
- `fill`/`color` (borrowing Observable Plot's own name) — rejected: would
  imply a single visual-channel mapping, but Recharts' real API needs a
  literal per-series `dataKey`, a structurally different mechanism the
  transform module has to build regardless of what the config field is
  named; `series` names the actual role (which column defines the
  series) more accurately than borrowing a name from a different
  library's own different mechanism.

## §3. The tidy-to-wide transform (`rechartsEncoding.ts`)

**Decision**: SQL query results stay in this app's own universal tidy/long
format (one row per `x`/`series` combination, one shared `y` value
column) — the same shape every other panel type's own query already
returns. A new, pure, DOM-free module, `panels/rechartsEncoding.ts`,
pivots that tidy result into the wide-row shape Recharts' own
`<BarChart>`/`<LineChart>`/`<AreaChart>` actually require (`{ x: 'HBW',
SOV: 0.62, HOV: 0.18, ... }`, one column per distinct `series` value),
and builds the accompanying shadcn `ChartConfig` object (one entry per
distinct series value, naming its label and `var(--chart-N)` color,
cycling through the five tokens in order and wrapping after the fifth).

**Rationale**: matches this project's own repeated, established pattern
of a pure transform module adapting tidy SQL rows to whatever shape a
specific charting library's own API needs —
`panels/sankeyGraph.ts` (rows → node/link graph),
`panels/flowmapData.ts` (rows → locations/flows),
`panels/observablePlotEncoding.ts` (rows → mark/options) — this is the
same class of problem, not a new architectural pattern.

**Alternatives considered**:
- Querying wide-format data directly (a `PIVOT`-shaped SQL query) —
  rejected: every other panel type's own query stays in tidy form; adding
  a SQL-level pivot would be inconsistent with the established convention
  and would need to be redone per distinct `series` value set, whereas a
  JS-side pivot is simple, testable in isolation, and matches precedent.

## §4. Reusing `buildPanelQuery()` — confirmed, not assumed

**Decision**: `RechartsPanelConfig` extends `DataBoundPanelConfigBase` +
`ComparisonCapablePanelConfig` (the same mixin `plotly`/`table`/
`observable-plot` already use). `panels/panelQuery.ts`'s
`buildPanelQuery(config: DataBoundPanelConfigBase, filters)` is called
completely unmodified — confirmed by direct read that its own signature
already accepts any `DataBoundPanelConfigBase`-extending config, with no
per-panel-type branching this new type would need to hook into for the
basic query path. `comparison: diff` support (if a dashboard author
configures it) reuses `buildComparisonDiffQuery()` the same way
`zonemap`/`plotly`/`table`/`observable-plot` already do — no new
comparison-query logic.

**Rationale**: directly confirms the spec's own FR-002 and Assumptions —
zero changes to shared query-building code, the lowest-risk way to add a
tenth data-bound panel type.

## §5. Adding `components/ui/chart.tsx` via the shadcn CLI — a deliberate departure from prior hand-authoring

**Decision**: run the real shadcn CLI (`npx shadcn@latest add chart`) to
add `components/ui/chart.tsx`, rather than hand-transcribing the fetched
source the way `button.tsx`/`card.tsx`/`dialog.tsx`/`tabs.tsx`/
`tooltip.tsx`/`dropdown-menu.tsx` were each added.

**Rationale**: every prior shadcn-pattern component in this repo was
hand-authored specifically because, per `dialog.tsx`'s own comment, "this
repo has no CLI-generation step" — but `components.json` (confirmed
present at the repo root, correctly configured: `tailwind.css` points at
the real `src/styles/tokens.css`, `ui` alias points at the real
`@/components/ui`) was never actually exercised to confirm that claim
either way. `chart.tsx` is real, substantially larger (10,544 bytes) and
more actively evolving (shadcn's own docs reference a "Recharts v3
migration" already) than any prior hand-authored component — running the
real CLI against this repo's own already-correct `components.json`
produces an exact, unmodified copy of the real upstream source with zero
transcription risk, and confirms `components.json` genuinely works for
this repo for the first time. The file's own generated content still gets
reviewed and, where its example `ChartConfig` colors reference
`var(--chart-1)` etc., those resolve automatically once §1's tokens exist
— no manual color-reference editing needed inside the generated file
itself.

**Alternatives considered**:
- Hand-transcribing the fetched source (matching every prior component)
  — rejected for this one file specifically: real, higher transcription
  risk given the file's size, with a working CLI path available that
  removes that risk entirely at no cost.

## §6. `vite.config.ts` — a new `recharts` chunk

**Decision**: add a `manualChunks` branch splitting `recharts` and its
own real dependency additions into its own chunk, matching the existing
`plotly`/`maps`/`graphic-walker` chunk precedent exactly.

**Correction, found during implementation, not assumed**: this section
originally planned around Recharts npm's own "latest" tag (`3.10.1`) and
its real, heavy dependency chain (`@reduxjs/toolkit`, `react-redux`,
`immer`). Running the real shadcn CLI (§5) installed a **different,
older, deliberately-pinned version — `recharts@^2.15.4`** — shadcn's own
registry entry for `chart.tsx` pins the version it's actually tested
against, which is not automatically npm's newest release. Confirmed via
`git diff package-lock.json` exactly what this install actually added:
`lodash`, `react-smooth`, `recharts-scale`, and `victory-vendor@^36.6.8`
— genuinely lighter than the `3.10.1`-based chain originally researched,
and with **no** `@reduxjs/toolkit`/`react-redux`/`immer`/`reselect`
addition at all (those packages are already present in `node_modules`
from an unrelated, pre-existing transitive dependency elsewhere in this
project — confirmed via the same lockfile diff showing zero new lines
for any of them). The `manualChunks` decision itself is unchanged — a
dashboard that never renders a `recharts` panel still shouldn't pay any
load cost for it — only the specific package list to split changed:
`recharts`, `lodash`, `react-smooth`, `recharts-scale`, `victory-vendor`.

**Rationale**: every prior large, previously-absent library this project
has added (Plotly, the maplibre/deck.gl family, `@kanaries/graphic-
walker`) got its own chunk for exactly this reason — the same reasoning
applies here, with the real, confirmed (not researched-in-advance) package
list above.

## Real dependency/version compatibility check

**Corrected during implementation**: the version actually installed by
the real shadcn CLI is `recharts@^2.15.4`, not npm's "latest" tag
(`3.10.1`) originally researched before implementation began. Re-verified
directly against the real, installed `node_modules/recharts/package.json`
(not assumed to carry over from the different version originally
checked): its own `peerDependencies` list `react`/`react-dom` as
`"^16.0.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"` — still genuinely compatible
with this app's pinned `react`/`react-dom` `^18.3.1`. Unlike
`014-graphic-walker-panel`'s own real, confirmed React-19-only peer-
dependency conflict (which required an exact version pin to avoid), no
such conflict exists here either way — the caret range `^2.15.4` that
the CLI itself wrote into `package.json` is safe to keep as-is, no exact
pin needed. `chart.tsx`'s own real, installed source (confirmed by direct
read) generates plain `--color-{key}: {color}` CSS custom properties with
no `hsl()` wrapping — already the exact plain-hex-value convention this
app's own `tokens.css`/`tailwind-config-contract.md` already established
project-wide, needing zero adjustment for the color values §1 already
designed.

## §7. Fidelity pass against shadcn's own real, current registry examples

**Follow-up feature (post-implementation)**: RechartsPanel.tsx's initial
implementation approximated a reasonable-looking chart from general
chart-library convention rather than shadcn's own actual, current
reference examples. Fetched and read directly (the same registry the
CLI's own `chart.tsx` was pulled from in §5) — not assumed —
`chart-bar-multiple.json`, `chart-bar-stacked.json`,
`chart-line-linear.json`, `chart-area-linear.json`.

**Confirmed, real, consistent choices across all four:**
- No `<YAxis>` at all, in any example — `ChartTooltip` is the sole source
  of exact values. Already true of this app's own implementation before
  this pass (nothing to remove); confirmed rather than assumed.
- `accessibilityLayer` on every chart root.
- `<CartesianGrid vertical={false} />` — no `strokeDasharray`, no other
  prop, in any example.
- `<XAxis dataKey=... tickLine={false} axisLine={false} tickMargin={8 or
  10} />`. Their own `tickFormatter={(value) => value.slice(0, 3)}` is
  specific to their own month-name fixture data — NOT adopted here, since
  this grammar's `x` field is a generic, author-named column of unknown
  domain (a deliberate, judged exception, not an oversight).
- `<Bar radius={4} />` in every non-stacked example;
  `chart-bar-stacked.json` instead rounds only the stack's own outer
  corners (`[0,0,4,4]` bottom series, `[4,4,0,0]` top series, unrounded
  in between) — the same directional rule this grammar's own
  `stacked: true` now applies.
- `<Line type="linear" strokeWidth={2} dot={false} />`, no `fill`.
- `<Area type="linear" fillOpacity={0.4} />`, no `strokeWidth` override.
- `<ChartTooltip cursor={false} .../>` in 3 of the 4 examples (the
  exception, `chart-bar-stacked.json`, left Recharts' own default) —
  adopted universally. A real, secondary, confirmed benefit: with
  `cursor={false}`, Recharts never renders its own shared-cursor
  highlight rect (`.recharts-tooltip-cursor`) at all — the exact element
  that made `rechartsPanel.spec.ts`'s own sequential-bar-hover
  interaction fragile during the original implementation (tasks.md T021's
  own note). `indicator`/`hideLabel` are synthesized from the two closest
  real analogs rather than one blindly copied: `chart-bar-multiple.json`
  (multi-series, grouped — the closest real analog to this grammar's own
  `series:`-configured case) uses `indicator="dashed"` with the shared
  label shown; `chart-line-linear.json`/`chart-area-linear.json`
  (single-series) use the default dot indicator with `hideLabel` (the
  one series' own name already says everything the label would).
- `<ChartLegend content={<ChartLegendContent />} />` appears only in the
  stacked/legend-bearing examples, never the single-series ones —
  already matched by this grammar's own existing `seriesKeys.length > 1`
  gate, confirmed rather than changed.

**Not adopted, with reasons**: their own `margin={{ left: 12, right: 12
}}` (line/area examples only, not the bar ones) — applied here
conditionally by `chart_type` to match that same asymmetry exactly, not
uniformly. Their own `Card`/`CardHeader`/`CardFooter`/trend-arrow chrome
is this app's own `PanelCard`/`panelCard.tsx`, already provided one level
up — not duplicated inside this panel.

Verified via real screenshots, both themes, before/after: rounded bar
corners, thicker line strokes, translucent area fill, and — most
visibly — no gray cursor-highlight box behind a hovered bar/point,
confirmed via a real hover screenshot in dark mode. `tests/integration/
rechartsPanel.spec.ts`'s existing 8 tests (including the T021 tooltip-
content test) re-confirmed stable across 3 consecutive re-runs with no
code changes needed to any test.

**A real, confirmed layout bug, caught only from a user-reported
screenshot, not this pass's own initial visual check** (the initial
verification zoomed on colors/shapes and missed the actual card
boundaries): every recharts panel's chart content — bars, axis labels,
legend — was rendering far WIDER than its own `PanelCard`, visibly
bleeding across into neighboring panels' own columns. Root-caused via a
direct, live `getBoundingClientRect()`/`getComputedStyle()` measurement
of the real DOM chain (not guessed): `ChartContainer`'s own default
className (`components/ui/chart.tsx`) includes `aspect-video`
(`aspect-ratio: 16/9`); with `RechartsPanel.tsx`'s own explicit
`style={{ height: config.height ?? 350 }}` but no explicit `width`, the
browser computed width FROM that ratio (`height * 16/9`) instead of from
the panel's real, much narrower grid column — confirmed exactly:
`350 * 16/9 = 622.22px`, matching the measured overflow width to the
pixel. Fixed with `className="aspect-auto w-full"` on `ChartContainer`
(`cn()`'s own `tailwind-merge`, already used by `chart.tsx`, correctly
resolves both conflicts against the default classes). A second, related,
real fixture issue surfaced by the SAME investigation: all six
`row_recharts` panels shared one CSS Grid row (`dashboardRenderer.tsx`'s
`fr`-unit column sizing), diluting the primary bar/line/area trio to a
much narrower column share than the fixture's own authored `width`
values implied — once the layout bug above was fixed and charts actually
respected their real (narrow) column width, the multi-series legend
wrapped onto extra lines, which made `rechartsPanel.spec.ts`'s own
legend-click test intermittently land outside the default Playwright
test viewport. Fixed by splitting the fixture into two rows
(`row_recharts` for the bar/line/area trio, `row_recharts_edge_cases` for
the invalid/empty/broken trio), matching this fixture file's own
established per-concern row-grouping convention (`row_table`/
`row_markdown`/`row_observable_plot` are each already their own row) —
not just a test workaround, a genuinely better fixture layout. Re-verified:
`npx tsc --noEmit` clean, `npm run test:unit` 308/308, all 8
`rechartsPanel.spec.ts` tests passing across 3 consecutive re-runs, and
real before/after screenshots in both themes confirming every chart now
stays fully inside its own card.

## §8. Polish pass — real shadcn palette + real legend-overflow fix

**Follow-up feature, second round**: the §7 fidelity pass (structural
JSX props) and the layout-bug fix above got the chart's shape/sizing
right, but real, direct user feedback on a screenshot was that the
result still looked "unpolished" next to shadcn's own reference —
correctly identifying that the WFRC-brand-muted palette from the
original implementation (navy/amber/teal-slate/gray/purple) reads as
duller than shadcn's own vivid, categorical defaults, and that the
legend still visibly overflowed its own card at a real (narrower than
this pass's own 1400px screenshot) viewport width — a genuine, confirmed
remaining bug, not merely a perception issue.

**Real palette source, fetched and read directly, not approximated**:
`ui.shadcn.com/docs/theming`'s own documented default `--chart-1`..
`--chart-5`, both themes:

| Token | Light (oklch) | Dark (oklch) |
|---|---|---|
| chart-1 | `oklch(0.646 0.222 41.116)` | `oklch(0.488 0.243 264.376)` |
| chart-2 | `oklch(0.6 0.118 184.704)` | `oklch(0.696 0.17 162.48)` |
| chart-3 | `oklch(0.398 0.07 227.392)` | `oklch(0.769 0.188 70.08)` |
| chart-4 | `oklch(0.828 0.189 84.429)` | `oklch(0.627 0.265 303.9)` |
| chart-5 | `oklch(0.769 0.188 70.08)` | `oklch(0.645 0.246 16.439)` |

Converted to hex via a real Chromium canvas render (`ctx.fillStyle =
oklch(...)`, then `getImageData()` — `getComputedStyle().color` was
tried first and confirmed NOT to work: modern Chromium's CSS Color 4
serialization returns the oklch() string verbatim rather than resolving
to rgb(), only a canvas 2D context forces sRGB 8-bit conversion).
Three of the ten real values failed THIS project's own non-negotiable
3:1 non-text minimum when checked directly against `--background`
(`#ffb900` light chart-4: 1.72:1; `#fe9a00` light chart-5: 2.13:1;
`#1447e6` dark chart-1: 2.57:1) — shadcn's own reference is not itself
contrast-audited against an arbitrary embedding app's background, a real
gap this project's own established discipline caught. Fixed by adjusting
OKLCH LIGHTNESS ONLY (same hue, same chroma) to the minimum shift
clearing 3:1 with real margin, re-verified via the same canvas technique:

| Token | Final light hex | Contrast | Final dark hex | Contrast |
|---|---|---|---|---|
| chart-1 | `#f54a00` (unchanged) | 3.58 | `#407fff` (L 0.488→0.65) | 4.77 |
| chart-2 | `#009689` (unchanged) | 3.67 | `#00bc7d` (unchanged) | 7.10 |
| chart-3 | `#104e64` (unchanged) | 9.15 | `#fe9a00` (unchanged) | 8.23 |
| chart-4 | `#c48100` (L 0.828→0.65) | 3.24 | `#ad46ff` (unchanged) | 4.26 |
| chart-5 | `#c46400` (L 0.769→0.6) | 4.06 | `#ff2056` (unchanged) | 4.68 |

All ten re-confirmed pairwise-distinct within each theme. This is a
deliberate, one-time, user-directed exception to `wftdm-design-system`'s
own Brand Identity "never dilute WFRC blue toward generic SaaS color"
rule — scoped specifically to these 5 categorical data-series tokens,
which need to be visually generic/distinct-hued by design; `--primary`/
`--accent`/every other brand token are untouched.

**Real gallery research before committing to this palette** — browsed
`ui.shadcn.com/charts` (bar chart gallery, screenshotted directly): their
OWN real 2-series examples ("Bar Chart - Stacked + Legend") use only 2
legend entries, always fitting on one line; their real MANY-category
examples ("Bar Chart - Mixed"/"-Active"/"-Negative", 5 categories:
Chrome/Safari/Firefox/Edge/Other) deliberately do NOT use a legend at
all — they use a single-hue lightness gradient plus direct axis-label
categories instead, sidestepping the crowded-legend problem entirely.
This grammar's own `series:` field has no such ceiling and this
fixture's own bar panel already has 4 real series with a long label
("Non-Motorized") — the legend-overflow bug below is a real, confirmed
consequence of a case shadcn's own examples never actually attempt, not
a bug in their own reference component itself.

**Real legend-overflow bug, confirmed via direct source read of
shadcn's own CURRENT (v3) `chart.tsx`** — fetched fresh from
`ui.shadcn.com/r/styles/new-york-v4/chart.json` (the CURRENT registry
path; this feature's original `/r/styles/new-york/...` fetches earlier
were the legacy, pre-v3 registry — confirmed still functionally
equivalent for every structural prop already adopted in §7, but the
`ChartContainer`/`ChartTooltipContent`/`ChartLegendContent` source
itself is reproduced here for the definitive, current record).
`ChartLegendContent`'s own className
(`"flex items-center justify-center gap-4"`, `pb-3`/`pt-3` — confirmed
UNCHANGED from the version this app's own installed chart.tsx already
has) sets **no `flex-wrap`** — combined with Recharts' own
`position: absolute` legend-wrapper positioning and this app's
`ChartContainer` div having `overflow: visible` (confirmed via the same
live DOM measurement §7's own bug used), a legend needing more
horizontal room than its narrow column has genuinely overflows past the
card rather than wrapping — real, reproducible, not a false impression.
Fixed by passing `className="flex-wrap gap-x-4 gap-y-1"` to
`<ChartLegendContent>` from `RechartsPanel.tsx` — `chart.tsx`'s own
`cn()` merges this additively against the base classes (no conflict:
`flex-wrap` isn't in the base string at all, `gap-x-4 gap-y-1` correctly
supersedes the base `gap-4` via tailwind-merge's category resolution) —
the SAME real extension mechanism shadcn's own components are built to
support, not a bespoke workaround.

Re-verified: `npx tsc --noEmit` clean, `npm run test:unit` 308/308 (the
two updated `tokenContrast.test.ts` expected-ratio rows for the new
palette pass), all 8 `rechartsPanel.spec.ts` tests passing (the existing
color-matching assertions read live token values via
`getComputedStyle()`, so needed zero test-code changes for the new
palette to be covered correctly), and real screenshots at both a
1280px and 1400px viewport, both themes, confirming the legend now
wraps cleanly inside its own card at every width and the new palette
renders visibly brighter/more categorical.

## §9. Round 3 — dimmed gridlines, tooltip border, real v3-source diff

**Follow-up feature, third round**: user asked to be inspired further by
"shadcn's upgrade over recharts v3 defaults" specifically —
"dimmed horizontal reference lines. tooltip, legend, fit, etc." — and
confirmed chart-series colors are explicitly EXEMPT from WFRC brand
matching (only the surrounding dashboard chrome — card/border/text —
needs to stay on-theme, already true and unchanged).

**A second real, confirmed, silently-broken theme-integration bug**,
found via the exact same live-DOM-measurement technique §7's aspect-
ratio bug used: `chart.tsx`'s own default className relies on Tailwind's
slash-opacity-modifier syntax against this app's custom color tokens in
TWO places — `stroke-border/50` (CartesianGrid lines) and
`border-border/50` (the tooltip surface's own border). Confirmed live,
directly: a real gridline's computed `stroke` was `rgb(204, 204, 204)`
(Recharts' own hardcoded `#ccc` default, entirely unoverridden) and the
tooltip's own computed `border-color` was `rgb(229, 231, 235)`
(Tailwind's generic `gray-200` fallback) — NEITHER ever resolved to this
app's real `--border` token in either theme. This is the exact same
class of silent-no-CSS-generated limitation this project has hit
before against its own plain-hex `tokens.css` (`mapControls.css`'s own
`bg-muted/40`/`bg-background/80` history, `CLAUDE.md`'s own recorded
finding) — confirmed to still apply here, in a file this feature had
not touched until now. Fixed with a new `src/panels/rechartsPanel.css`
(imported directly by `RechartsPanel.tsx`, following the exact
`mapControls.css`/`graphicWalkerPanel.css` panel-specific-override
convention already established), using real `color-mix()` rules — the
SAME technique `tableLogic.ts`'s cell-shading and `zonemapColor.ts`'s
choropleth fill already establish as this project's own working
alternative to Tailwind's broken opacity-modifier path. `chart.tsx`
itself is untouched for this fix — verified live after the fix: the
gridline's computed stroke resolved to
`color(srgb 0.847059 0.835294 0.823529 / 0.5)`, i.e. `#d8d5d2` (this
app's real light-mode `--border`) at exactly 50% — confirmed by
converting each channel back (0.847×255≈216=0xd8, etc.) — and the
tooltip border resolved identically.

**Real, current (v3) `chart.tsx` diffed line-by-line against this
project's own installed (v2-era) version**, fetched fresh from
`ui.shadcn.com/r/styles/new-york-v4/chart.json` (§8 already used this
exact fetch for the legend fix; this round reads the REST of the file
for the first time). Real, meaningful differences found, beyond
Tailwind-v4-only syntax this project can't use (`outline-hidden`,
`border-(--color-border)` — this project stays on Tailwind v3, so these
are not adopted) and a cosmetic `data-slot="chart"` attribute (skipped —
this codebase has no existing `data-slot` convention to join):

1. `item.value != null` (v3) vs `item.value &&` (this project's
   installed version) guarding the tooltip's own value display — the old
   check hides a legitimate `0` value's row entirely, the exact "never
   coerce a real 0 into a hidden/wrong display" class of bug this app's
   own `formatValue.ts`/`zonemapColor.ts` already guard against
   elsewhere. Backported directly into `chart.tsx` (one of only two
   deliberate, documented exceptions to this file's own "keep pristine"
   convention — the other being the `item.payload?.fill` optional
   chaining immediately below it, same defensive reasoning).
2. `initialDimension` — a new `ChartContainer` prop (default `{width:
   320, height: 200}`) forwarded to `ResponsiveContainer`, avoiding a
   0×0-flash on first paint before `ResizeObserver` reports the real
   size. Confirmed the underlying capability already exists in this
   project's own installed `recharts@2.15.4` (`ResponsiveContainer`'s own
   real `.d.ts`/compiled source already accepts `initialDimension` —
   this is not a v3-only Recharts feature, only a v3 chart.tsx
   convenience). NOT backported: this app's own panel lifecycle already
   renders a same-sized `animate-pulse` loading skeleton BEFORE
   `RechartsPanel.tsx` ever mounts the real `<ChartContainer>`, so by the
   time `ResponsiveContainer` performs its first real measurement, its
   parent column already has its final, correct width from layout — the
   0×0-flash `initialDimension` exists to prevent doesn't occur in this
   app's own real usage pattern, confirmed by the absence of any visible
   flash in every screenshot taken across all three rounds of this
   feature. Recorded here as a considered-and-declined adoption, not an
   oversight.

Re-verified: `npx tsc --noEmit` clean, `npm run test:unit` 308/308, all 8
`rechartsPanel.spec.ts` tests passing, and real hover screenshots in
both themes (both the gridlines and the tooltip's own border now
visibly softer/dimmer, correctly theme-reactive in dark mode too, never
the same flat gray in both themes as before).

## §10. Round 4 — natural curves + real gradient area fills

**Follow-up feature, fourth round**: "try harder and more" — dug further
into shadcn's real registry beyond the 4 basic `-linear`-suffixed
examples every prior round had read (bar-multiple/bar-stacked/
line-linear/area-linear are literally their most basic, unstyled
variants — the "-linear" in each name refers to the CURVE TYPE, not
"the standard one"). Fetched `chart-area-gradient.json` (their real,
current gradient-fill area example) and `chart-bar-active.json` (a
static, non-hover "highlight one specific bar" example) directly.

**Real, confirmed, adopted finding**: `chart-area-gradient.json` uses
`type="natural"` on `<Area>` — a smooth cubic-spline curve through the
data points, not `"linear"`'s straight angular segments between them.
Confirmed deliberate (not incidental): every "beautiful chart" reference
example on their own site uses a curved type for area/line marks, never
`"linear"`, which is reserved for their own most basic/unstyled tutorial
examples specifically. Adopted `type="natural"` for BOTH `<Area>` and
`<Line>` (the same visual reasoning applies to a line mark identically).

**Real, confirmed, adopted finding**: `chart-area-gradient.json`'s own
area fill is a real SVG gradient, not a flat color —
`<defs><linearGradient x1="0" y1="0" x2="0" y2="1">` (vertical, top to
bottom) with two `<stop>`s (5% offset at 0.8 opacity, 95% offset at 0.1
opacity — fading toward the baseline), referenced via `fill="url(#...)"`,
with `fillOpacity={0.4}` STILL applied on top of the gradient's own
internal opacity stops (confirmed from their real source — not
simplified away as redundant). Adopted directly in `RechartsPanel.tsx`,
with one real, necessary addition their own example never needed: a
`gradientId(prefix, seriesKey)` helper namespacing each gradient's `id`
by a real per-PANEL-INSTANCE `useId()` prefix. Their own real example
renders exactly one chart per page, so a bare literal id like
`"fillDesktop"` never collides — this app's own fixture tab renders 3
real recharts panels on one page at once, and `id` values are DOM-global
(an SVG `url(#id)` reference resolves against the whole document, not
scoped to the nearest ancestor), so an unnamespaced id would have let
one panel's gradient silently resolve to a DIFFERENT panel's own
gradient definition. `seriesKey` itself is also sanitized (`replace(/[^a-
zA-Z0-9_-]/g, '_')`) before use in an id, since a `series:` column's real
values are author/data-controlled strings with no guarantee of already
being a valid bare id/url() token.

**Considered, NOT adopted**: `chart-bar-active.json`'s per-bar active-
state treatment (`shape={({index, ...props}) => index === ACTIVE_INDEX
? <Rectangle {...props} fillOpacity={0.8} stroke={...}
strokeDasharray={4} .../> : <Rectangle {...props} />}`). This is a
STATIC "permanently highlight bar #2" narrative device (a hardcoded
`ACTIVE_INDEX` constant, not a hover-driven interaction — no
`onMouseEnter`/`activeIndex` state anywhere in their own real source) —
not a general "highlight the hovered bar" mechanism transferable to this
grammar as-is. Building a genuine hover-driven equivalent would require
new per-panel state (tracking which bar/index is currently hovered) and
a custom `shape` render function — a real, nontrivial addition with its
own new risk surface, for a benefit already substantially covered by
`cursor={false}`'s own already-shipped fix (no more ugly shared gray
highlight rect). Recorded here as a considered-and-declined addition,
not an oversight, matching `initialDimension`'s own §9 precedent.
`chart-bar-active.json`'s own `radius={8}` (vs. this app's `radius={4}`,
matching `chart-bar-multiple.json`/`chart-bar-stacked.json`) is a real,
confirmed INCONSISTENCY across shadcn's own examples, not a stronger
signal — `radius={4}` (2 real examples) is kept over `radius={8}` (this
1 example) as the more broadly-supported convention.

A real, expected test update this round required (not a regression):
`rechartsPanel.spec.ts`'s own area-chart color assertion previously
checked `fill` directly against a flat token color — now that `fill` is
a real `url(#...)` gradient reference, the test instead resolves the
referenced `<linearGradient>`'s own two `<stop>` elements and asserts
their `stop-color` against the same token-color list, preserving the
original intent (the area's real rendered color still traces to a real
`--chart-N` token) without asserting a since-intentionally-changed
implementation detail.

Re-verified: `npx tsc --noEmit` clean, `npm run test:unit` 308/308, all 8
`rechartsPanel.spec.ts` tests passing (1 updated assertion, described
above), and real screenshots in both themes showing the area's own
gradient fade and the line/area's smoother natural curve.

## §11. Round 5 — a real tooltip-indicator bug, a per-mark curve-type
## correction, and switching the palette source to Observable Plot

**Follow-up feature, fifth round**: real, direct user feedback —
"the tooltip legend is three dots instead of proper color block" — plus
an explicit instruction to slow down and actually study shadcn's real
rendered output (code AND screenshots), not just pattern-match from
source in isolation, and a separate, explicit request to source the
5 chart colors from Observable Plot's own gallery/scheme instead of
shadcn's.

**A real, confirmed bug in this feature's own §7 choice, found from
live user feedback, not caught by this project's own prior visual
checks**: `ChartTooltipContent`'s `indicator="dashed"` (adopted in §7
from `chart-bar-multiple.json`'s own real source, but never actually
LOOKED at rendered, only read from code) produces `chart.tsx`'s own real
classes `w-0 border-[1.5px] border-dashed bg-transparent` — a
ZERO-WIDTH box with only a dashed OUTLINE, no fill at all. At this
component's small size that reads as a few disconnected dashes/dots, not
a color swatch — exactly the real defect reported. `indicator="dot"`
(`h-2.5 w-2.5 bg-[--color-bg]`, chart.tsx's own real classes) is a
genuine SOLID filled square — the actual color-block look wanted, and
also `ChartTooltipContent`'s own real, unconditional default when the
prop is omitted entirely. Fixed by removing the `indicator={isMultiSeries
? 'dashed' : 'dot'}` branch entirely — every series count now uses the
component's own real default. Live-render attempts against
`ui.shadcn.com` itself were inconsistent this round (charts intermittently
failed to hydrate under repeated automated navigation — confirmed via a
direct HTTP 200 status check with zero rendered `<svg>` elements, ruling
out a hard block) — resolved by testing directly against this app's own
ALREADY-INSTALLED, byte-identical `ChartTooltipContent` rendering logic
instead of depending on their live site at all, a more reliable
verification path than relying on an external site's own client-side
hydration.

**A real, confirmed over-generalization in this feature's own §10
choice**: `type="natural"` had been applied to BOTH `<Area>` and
`<Line>`, extrapolated from `chart-area-gradient.json` alone without
separately confirming a real LINE example's own actual curve type.
Fetched `chart-line-multiple.json` (their own real, current multi-series
line example) directly — it uses `type="monotone"`, a genuinely
different curve algorithm (monotone cubic interpolation, which never
overshoots past a local min/max — appropriate for a line meant to be
read precisely; natural cubic splines can overshoot slightly past data
points). Fixed: `<Line>` now uses `"monotone"`, `<Area>` keeps
`"natural"` — a real, confirmed PER-MARK-TYPE distinction in shadcn's own
examples, not one curve type applied uniformly everywhere.

**Palette source switched to Observable Plot's own real default
categorical scheme, on the user's own explicit, direct request** — NOT
approximated or guessed: `schemeObservable10` was read directly from
this project's own ALREADY-INSTALLED `d3-scale-chromatic` npm package
source (`node_modules/d3-scale-chromatic/src/categorical/
observable10.js` — the exact same real dependency `SankeyPanel.tsx`
already uses for its own Tableau10 option, so no new dependency was
needed), decoding its packed-hex-string format directly:

```
#4269d0 #efb118 #ff725c #6cc5b0 #3ca951
#ff8ab7 #a463f2 #97bbf5 #9c6b4e #9498a0
```

Five of these ten (blue/gold/coral/green/purple) were chosen —
skipping teal/pink/light-blue/brown/gray as each too visually close to
an already-chosen neighbor for a 5-color categorical set. Verified
directly (not assumed): 6 of the real 10 values fail this project's own
3:1 non-text minimum against a pure-white light-mode `--background` (as
low as 1.91:1) — Observable Plot's own real scheme is tuned for its
notebook's own off-white/gray canvas, not an arbitrary embedding app's
literal white, the exact same class of gap §8 already found in shadcn's
own scheme. Adjusted via CSS relative color syntax
(`oklch(from <hex> calc(l * factor) c h)`, hue and chroma held exactly
fixed, verified via a real browser canvas render — the same rigor as
every prior palette revision):

| Token | Light hex | Contrast | Dark hex | Contrast |
|---|---|---|---|---|
| chart-1 (blue) | `#3358be` (factor 0.9) | 6.40 | `#517ae3` (factor 1.1) | 4.39 |
| chart-2 (gold) | `#ba7f00` (factor 0.8) | 3.43 | `#efb118` (unchanged) | 9.18 |
| chart-3 (coral) | `#cc4330` (factor 0.8) | 4.76 | `#ff725c` (unchanged) | 6.54 |
| chart-4 (green) | `#008029` (factor 0.8) | 5.10 | `#3ca951` (unchanged) | 5.85 |
| chart-5 (purple) | `#914edc` (factor 0.9) | 4.85 | `#a463f2` (unchanged) | 4.72 |

4 of the 5 dark-mode values are the REAL, unmodified Observable10 hex —
Observable's own scheme already reads well against a dark background at
its native lightness; only chart-1 needed adjustment. All ten
re-confirmed pairwise-distinct within each theme. This supersedes §8's
shadcn-derived palette entirely — the same deliberate, one-time,
user-directed exception to `wftdm-design-system`'s own Brand Identity
rule, now sourced from Observable Plot instead of shadcn, scoped to
these 5 data-series tokens only.

Re-verified: `npx tsc --noEmit` clean, `npm run test:unit` 308/308 (2
updated `tokenContrast.test.ts` expected-ratio rows), all 8
`rechartsPanel.spec.ts` tests passing (confirmed both in isolation and
together — one already-documented intermittent environmental flake on
the legend-click test recurred, matching §"round 3"'s own established
pattern exactly, not a new regression), and real hover screenshots in
both themes showing solid color-block tooltip indicators and the full
Observable Plot-derived categorical palette.

## §12. Round 6 — the tooltip felt "laggy" vs shadcn's own live site

**Follow-up feature, sixth round**: direct user question — "the tooltip
feels much more snappy in ui.shadcn.com/charts/tooltip than in our dev
server, why is that?" A real, root-caused answer, not a guess: traced
directly to a specific line in this project's own INSTALLED Recharts
source (`node_modules/recharts/lib/component/TooltipBoundingBox.js`):

```js
transition: isAnimationActive && active
  ? "transform ${animationDuration}ms ${animationEasing}"
  : undefined
```

Recharts' own `Tooltip` component defaults `isAnimationActive: true`,
`animationDuration: 400`, `animationEasing: 'ease'` (confirmed directly
in `node_modules/recharts/lib/component/Tooltip.js`'s own
`defaultProps`) — meaning the tooltip wrapper's own CSS `transform`
(its position) GLIDES to each new bar/point over 400ms by default,
instead of snapping there instantly. That 400ms-per-move glide is what
reads as "laggy" specifically when moving the cursor across several
bars/points in quick succession — each move re-triggers a fresh 400ms
transition before the tooltip catches up to the real cursor position.

Fixed with `isAnimationActive={false}` on `<ChartTooltip>`. Verified
directly, live: the tooltip wrapper's own real computed
`transitionDuration` was `0.4s` before this change, `0s` after.
Confirmed this affects ONLY the position-tracking transition and
nothing else — `TooltipBoundingBox.js`'s own visibility toggle
(`visibility: 'visible' | 'hidden'`) is a plain, instant switch either
way, not animated, so the tooltip's own appear/disappear timing is
unaffected by this change.

Not confirmed either way (and not chased further, given the fix already
directly answers the user's own question with a real, reproducible
mechanism): whether Recharts v3 (which shadcn's own live site now uses,
per the "Updating to Recharts v3" note already found in round 3) changed
this particular default — this project stays deliberately pinned to
Recharts v2 regardless, so the fix here is scoped to what this app's own
installed version actually does, not to matching v3's internals
speculatively.

Re-verified: `npx tsc --noEmit` clean, `npm run test:unit` 308/308, all 8
`rechartsPanel.spec.ts` tests passing (confirmed both in isolation and
together — the same already-documented intermittent legend-click flake
recurred once more, still not a new regression).
