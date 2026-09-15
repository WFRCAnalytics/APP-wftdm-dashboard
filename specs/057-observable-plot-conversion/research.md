# Phase 0 Research: Observable Plot Chart Consolidation

All items below were resolved directly against this project's own real
demo content and the installed `@observablehq/plot` package (v0.6.17) and
its own real, current documentation — none are assumed. This mirrors
spec.md's own "Pre-Spec Research Findings" section; this file adds the
implementation-level detail spec.md deliberately left out.

## 1. Sankey support in Observable Plot — CONFIRMED: none

- Direct inspection of the installed `@observablehq/plot` package's full
  source tree (`node_modules/@observablehq/plot/src/marks/`,
  `src/transforms/`) found no `sankey` mark, transform, or helper anywhere.
- Fetched Observable Plot's own official `link` mark documentation
  (`github.com/observablehq/plot/blob/main/docs/marks/link.md`) directly —
  it makes no mention of Sankey diagrams or a d3-sankey composition
  pattern.
- A public feature request for Sankey support (`observablehq/plot#698`,
  opened Jan 2022) remains open and unresolved.
- **Decision**: the Sankey panel (`Trip Purpose to Mode Flow`,
  `dashboard-4-mode-choice.yaml`) stays on its current, working D3
  (`d3-sankey`) implementation. Zero change to `panels/SankeyPanel.tsx`,
  `panels/sankeyGraph.ts`, or `panels/sankeyColor.ts`.

## 2. Hierarchical/exotic chart types — CONFIRMED: none exist in real content

- A direct read of every `dashboard-*.yaml` file in
  `public/demo-dashboard-config/` found no treemap, sunburst, or other
  hierarchical panel anywhere in real content. The only exotic
  `chart_type` value anywhere is `chart_type: pie` in
  `dashboard-8-test.yaml`'s `row_bad_chart_type` — a single, deliberately
  invalid panel whose entire purpose is proving the app rejects an
  unsupported `chart_type` value at runtime. Not a real chart; not
  converted (see §5, test-tab exclusion).
- For completeness: `@observablehq/plot`'s own `tree`/`cluster` marks
  (`src/marks/tree.js`) are node-link hierarchy layouts (Reingold–Tilford
  "tidy" tree / `d3.cluster`), not treemap (`d3.treemap`, rectangles) or
  sunburst (`d3.partition`, arcs). Irrelevant here — no real panel of any
  hierarchical shape exists to convert.
- **Decision**: no action needed for this category.

## 3. Value-box sparkline feasibility — CONFIRMED: feasible

- The current `panels/valueBoxSparkline.tsx` renders bare Recharts
  primitives (`BarChart`/`LineChart`) inside a fixed `h-10` (40px),
  `aria-hidden`, chrome-less container — no axes, no legend, no tooltip.
- `@observablehq/plot`'s scale options (`src/scales.d.ts`) confirm
  `axis?: ... | boolean | null` — `axis: null` suppresses an axis
  entirely — and `Plot.plot()` accepts explicit `width`/`height` at any
  size. Both are standard, documented mechanisms, not a workaround.
- **Decision**: re-implement `ValueBoxSparkline` using `Plot.plot()`
  directly (mirroring `ObservablePlotPanel.tsx`'s own mount-effect
  pattern, not reusing that component wholesale — see §6/contracts/
  valuebox-sparkline-plot.md for why).

## 4. Data-shape compatibility — CONFIRMED: no reshaping needed anywhere

- Every panel type in this app (Plotly, Recharts, Observable Plot alike)
  is fed the identical flat, tidy row array (`Record<string, unknown>[]`)
  from the same shared `buildPanelQuery()` → `query()`/`queryArrow()`
  pipeline (`panels/panelQuery.ts`, unmodified by every prior panel-type
  feature per `CLAUDE.md`'s own build history). The five panels already
  on Observable Plot already consume this exact shape today.
- **Decision**: `panels/panelQuery.ts` and `services/sqlExpander.ts`
  need zero changes for this feature (FR-005/FR-011). Every conversion is
  a YAML re-authoring (`type:`/mark-specific fields) plus, for the
  sparkline, a component swap — never a query change.

## 5. Real conversion inventory — grammar mapping confirmed against `layout/types.ts`

`ObservablePlotPanelConfig` (already fully built, `007-observable-plot-panel`
onward) supports everything every panel below needs, with **zero**
`layout/types.ts` changes required:

| Panel (tab) | Old grammar | New `observable-plot` grammar |
|---|---|---|
| Total Trips by Mode (Summary) | `recharts`, `chart_type: bar`, `x/y/series` | `mark: barY`, `x/y/fill: scenario` |
| Average Trip Distance by Purpose (Summary) | `plotly`, `traces: [{x:$metric.x,y:$metric.y,name:$scenario}]` | `mark: barY`, `x/y`, `fill: scenario` |
| Non-Mandatory Tour Frequency by Purpose (Tour) | `plotly`, grouped bar, `name:$scenario` | `mark: barY`, `x/y`, `fill: scenario` |
| At-Work Subtour Mode Share by Purpose (Mode Choice) | `recharts`, `chart_type: bar`, `series: tour_mode` | `mark: barY`, `x/y`, `fill: tour_mode` |
| Trip Mode Share by Time-of-Day Period (Mode Choice) | `plotly`, `name:$scenario` | `mark: barY`, `x/y`, `fill: scenario` |
| Trip Departure Hour, Work Trips (Trip) | `plotly`, grouped bar, `name:$scenario` | `mark: barY`, `x/y`, `fill: scenario` |

All six resolve cleanly to Observable Plot's `barY` mark with a `fill`
color channel — the exact idiom the five already-existing Observable Plot
panels already use for their own categorical breakdown (confirmed by
direct read, §7 below). No panel needs faceting to preserve its existing
analytical content (a scenario or category split via one color channel is
enough, matching what Plotly's `name:`/Recharts' `series:` already
provided) — faceting is a genuine *available* improvement, not a
requirement, consistent with spec.md's own "free re-authoring allowed, no
over-investment" framing.

`dashboard-8-test.yaml` is confirmed **excluded**: its `plotly`/
`recharts`/`sankey` entries all deliberately reference
`__nonexistent_metric__` (proving each panel type's own error-state
rendering) or an intentionally-invalid `chart_type: pie`. Converting
their `type:` would not change their error behavior (a missing metric
produces the same Catalog Error regardless of rendering engine) and would
require updating `specs/040-test-suite-migration/contracts/
dashboard-8-test.md`'s own 1:1 panel-inventory contract and several
Playwright assertions for zero behavioral benefit — spec.md's FR-010
already settled this as out of scope.

## 6. Sparkline component design — direct reuse rejected, lightweight reimplementation chosen

`ObservablePlotPanel.tsx` (the full panel component) is not a good direct
dependency for the sparkline: it owns a `ResizeObserver`, panel-expand
(004) dialog-awareness, legend-height compensation math, and loading/
empty/error state branches — none of which apply to a fixed-size,
chrome-less, always-ready (it only renders once its parent value-box has
already resolved real rows) mini chart. The existing `recharts`-based
`ValueBoxSparkline` already deliberately avoids the equivalent
full-chrome Recharts component (`RechartsPanel.tsx`) for the identical
reason (see that file's own header comment). Re-implementing directly
against `Plot.plot()` (mirroring `ObservablePlotPanel.tsx`'s own
mount-effect *pattern*, not its component) keeps the same "reuse the
library, not a new rendering engine, but not the full chrome either"
shape this app already established for the sparkline once. No `fill`/
`color` legend is configured (the sparkline shows one series, matching
today's behavior) — so the `--plot-background`/legend-DOM findings in
§8/§9 below only matter for the theming fix, not a legend concern.

## 7. Already-Observable-Plot panel audit — CONFIRMED idiomatic, no defect found

Direct read of `panels/observablePlotEncoding.ts` (the shared, pure
encoding-resolution module every Observable Plot panel goes through)
against the five real panels' own YAML (School Location Distance
Distribution, Workplace Location Distance Distribution, Joint Tour
Destination Distance, Non-Mandatory Tour Destination Distance, Trip
Destination Distance Distribution — all `mark: barY` distance histograms
with a categorical `fill` breakdown) found:

- Correct null-value filtering (a null `y` is dropped, not rendered as a
  misleading zero-height bar — `019-baseline-diff-consumption`'s own
  documented fix).
- Correct, mark-shape-aware tooltip precision (`barY` gets 1D `"x"`
  pointing, not Plot's imprecise default 2D `"xy"` pointing — a real,
  previously-fixed UX bug this module already guards against).
- Correct, already-built scenario label/color propagation
  (`035-scenario-label-color`) for the `fill: scenario` case, with a
  deliberate, correct all-or-nothing fallback to Plot's own default
  categorical cycling when not every scenario resolves a color.
- Correct legend handling (`color: {legend: true}` whenever a `fill`/
  `stroke` channel exists — matching Plotly's own automatic-legend
  behavior for visual consistency across panel types).

No leftover workaround or confirmed defect found. **No code change to any
of the five existing panels or to `observablePlotEncoding.ts` is expected
from this feature** — satisfying spec.md FR-008/FR-009's own "fix
confirmed issues only, no speculative change" instruction. (Four of the
five panels stay pinned to a single baseline scenario because their
`fill` channel already encodes a category breakdown and adding a
scenario comparison too would need faceting — a real, *available*
improvement each panel's own YAML comment already documents as
intentionally deferred; spec.md's Assumptions section records this as
out of this feature's own first-pass scope, not a defect.)

## 8. Dark-mode/theming risk — CONFIRMED already solved, no new risk

`@observablehq/plot`'s own generated SVG unconditionally sets
`--plot-background: white` via an inline `<style>` rule
(`node_modules/@observablehq/plot/src/plot.js`, confirmed directly) — the
exact same class of "opaque light background ignores the app's dark
theme" bug this project already found and fixed once for Plotly
(`015-theme-toggle`). **This was already found and fixed for Observable
Plot too** — `ObservablePlotPanel.tsx`'s own header comments document the
finding and its fix (`svgEl.style.setProperty('--plot-background', card)`,
resolving the app's real `--card` token). Every converted panel and the
new sparkline reuse this exact, already-proven mechanism — no new
theming risk, no new fix needed.

## 9. Legend DOM structure — CONFIRMED: swatches render as a sibling of `<svg>`, not nested inside it

`ObservablePlotPanel.tsx`'s own comments (confirmed by direct read, not
re-derived) document that `Plot.plot()` renders a `<figure>` wrapping the
legend swatches element and the chart `<svg>` as **siblings**
(`figure.append(...legends, svg)`, `plot.js`) — the legend swatches
appear BEFORE the chart svg in document order, and are **not** children
of the `<svg>` element. This directly resolves an open question this
feature's own test-migration audit (§10) needed: any Playwright
assertion that searches for scenario/category legend text specifically
*inside* an `<svg>` locator will not find it after conversion — it must
target `.observable-plot-chart [class*="-swatches"]` instead, matching
the convention `tests/integration/observablePlotPanel.spec.ts` already
established for the five existing panels.

## 10. Test-migration audit — every affected spec file, confirmed by direct read

| Spec file | What it currently asserts (confirmed by reading the file) | Required change |
|---|---|---|
| `dashboardShell.spec.ts` | `.js-plotly-plot` visibility; reads `gd.data.length` (Plotly's internal trace array) to assert 3 traces; a dark-mode test reads `.js-plotly-plot .bg` computed style | Swap to `.observable-plot-chart svg[viewBox]`; replace trace-count check with a legend-swatch or distinct-`fill`-color count; dark-mode assertion targets the already-proven `--plot-background`/`--card` mechanism (§8) instead of Plotly's `.bg` element |
| `demoMultiScenario.spec.ts` | Comments/locators reference "recharts"/"plotly" by name for these two panels | Update comments; confirm `panelCard()` helper itself is engine-agnostic (title-based) — likely no locator change beyond any internal engine-specific assertion |
| `lazyTabLoading.spec.ts` | `chart.locator('svg').getByText(scenarioName)` — searches for legend text *inside* the svg | Rewrite per §9: target the swatches element, not `svg` |
| `markdownPanel.spec.ts` | Title-only visibility checks (`// recharts`/`// plotly` are comments only) | Comment update only, no locator change |
| `metricStrip.spec.ts` | Title-only visibility check | No change |
| `panelExpand.spec.ts` | `CHART_TITLE = 'Average Trip Distance by Purpose'`; ~10 assertions on `.js-plotly-plot` across inline/expanded-dialog states | Full selector rewrite to `.observable-plot-chart svg[viewBox]`, preserving the same inline-vs-dialog DOM-identity assertions this file's own header comment already documents testing for |
| `scenarioColorOverride.spec.ts` | Explicit `.js-plotly-plot`/`.recharts-wrapper` visibility checks; legend/color-swatch assertions tied to Plotly trace color and Recharts series color | Rewrite to Observable Plot's own swatches element per §9; the underlying label/color propagation logic itself is already implemented and correct (§7) — this is a test-locator rewrite, not a new capability to build |
| `scenarioLabelDisplay.spec.ts` | Same shape as above, for label text instead of color | Same rewrite approach |
| `switchControlsUnpinnedPanels.spec.ts` | `panelCard()` lookups by title for both converted panels, feeding into engine-agnostic assertions | Likely no change beyond confirming no embedded engine-specific selector — verify during implementation |

**Decision**: every one of these files is real, existing test surface that
must be updated as part of this feature (not a "nice to have") — SC-006
("zero broken chart panel... that was working before") is not met if
these are left failing. This is captured as its own contract
(`contracts/test-migration.md`) and will translate directly into
`/speckit-tasks` work items.

## 10a. Correction (found during `/speckit-tasks`, not `/speckit-plan`): two more affected files

§10's sweep searched by the six real panels' own *titles*, which missed
two real, confirmed-affected files that reference the same underlying
mechanisms without naming those titles — found only once task
breakdown required grepping by engine-specific CSS class instead of by
panel title. Recorded here transparently rather than silently patched
into §10, matching this project's own established "confirm before
concluding" discipline:

- **`tests/integration/valueBoxPanel.spec.ts`** — a *fixture*-based
  (`tests/fixtures/dashboard-config/`) suite that tests the shared
  value-box sparkline *mechanism* itself (034-metric-panel-redesign's own
  coverage), independent of which real demo panel a viewer sees. Three
  assertions use Recharts-specific selectors that directly test
  `panels/valueBoxSparkline.tsx` — the exact component FR-003/§6 convert:
  `.recharts-bar-rectangle, .recharts-bar rect` (a real chart rendered),
  `.recharts-wrapper` (×2 — a "no sparkline configured" negative check,
  and a "sparkline present alongside baseline_trend" positive check). All
  three must be rewritten to Observable Plot's own rendered-output
  equivalent as part of the sparkline conversion (contracts/
  valuebox-sparkline-plot.md) — this is the *primary* regression
  coverage for that component, more directly tied to it than any of the
  six real-panel conversions.
- **`tests/integration/demoContentAllPanels.spec.ts`** — `032-six-tab-
  demo-content`'s own "every one of the ten registered panel types
  renders at least once, real and non-empty" test (User Story 3)
  explicitly asserts `.js-plotly-plot` and `svg path.recharts-rectangle`
  are visible on the **Summary tab** — the exact two panels this
  feature's US1/US2 convert. This is a genuine, confirmed conflict
  between that prior feature's own success criterion (all ten types show
  real content) and this feature's own explicit FR-001/FR-002 (convert
  *every* real Plotly/Recharts panel, no exception carved out to
  preserve type-coverage). Per this feature's own spec — a deliberate,
  explicit instruction, not an oversight — the conversion wins: after
  this feature ships, real, non-empty content covers **eight** of the
  ten registered types on the six primary tabs; `plotly`/`recharts`
  remain fully supported, registered panel types, exercised for real by
  `dashboard-8-test.yaml`'s own per-type error-state coverage instead of
  by real data. This test's assertion (and, ideally, its own name/intent
  comment) needs a deliberate rewrite reflecting the new, correct
  invariant — not a quiet deletion of the now-failing lines, and not a
  workaround that keeps one panel on the old engine just to keep an old
  assertion green (`CLAUDE.md`'s own history records this exact class of
  "a later feature deliberately supersedes an earlier one's own success
  criterion, and the test is rewritten to match" pattern repeatedly,
  e.g. `026`→`032`'s three-tab-to-six-tab demo content replacement).

`tests/integration/rechartsPanel.spec.ts` and
`tests/integration/sankeyPanel.spec.ts` were also checked (both matched
the same broad `js-plotly-plot`/`recharts-wrapper`/`observable-plot-chart`
grep) and confirmed **unaffected** — both reference *fixture*-only panels
(`tests/fixtures/dashboard-config/`, e.g. "Mode Share by Purpose",
"Recharts Invalid Chart Type (intentional)", "Observable Plot Mode Share
(Bar)") that are structurally separate from `public/demo-dashboard-
config/` and exist specifically to prove one panel type's own addition
doesn't regress a sibling type — none of their own panels are among this
feature's six conversion targets.

## 10b. Correction (found during implementation, /speckit-implement): `tests/integration/valueBoxPanel.spec.ts` is pre-existing broken, unrelated to this feature

While validating T023's rewritten sparkline assertions, all 14 tests in
this file failed with "element(s) not found" for `panelCard()` lookups —
including tests for "Total Households," a panel with no sparkline
configuration at all, completely unrelated to this feature's own changes.
Confirmed via a real `git stash` A/B comparison (per this project's own
established methodology): the identical 14 failures reproduce
byte-for-byte on a fully clean, unmodified tree with none of this
feature's changes applied. Root cause, confirmed by reading the actual
rendered page in the failure's own error-context snapshot: this file's
`boot()` does a plain `page.goto('/')` with no fixture injection,
expecting `tests/fixtures/dashboard-config/dashboard-1-summary.yaml`
content (named directly in its own header comment: "Total Households,"
"ValueBox Mode Share Sparkline," etc.) to have been copied on-disk into
`public/dashboard-config/` — but `tests/global-setup.js`'s own header
comment confirms `040-test-suite-migration` already retired that entire
copy-in mechanism ("The synthetic-fixture copy-in dance is gone... tests
against the real, git-tracked `public/demo-dashboard-config/`... directly").
This file was evidently never migrated when that happened — the same
class of pre-existing migration gap `CLAUDE.md`'s own Implementation
order already records for `flowmapPanel.spec.ts`/`zonemapPanel.spec.ts`
(item 26) and the original `graphicWalkerPanel.spec.ts` (item 27).

**Not fixed here** — fully migrating this file off the retired fixture
mechanism onto real demo content is a genuinely separate, pre-existing
gap, out of this feature's own scope (spec.md's FR-005/FR-011: this
feature changes rendering engines, not test-infrastructure migrations
unrelated to it). The three sparkline-selector rewrites T023 calls for
were still made (`.recharts-*` → `.observable-plot-chart svg[viewBox]`)
since they are the logically correct fix for `panels/valueBoxSparkline.tsx`'s
own real behavior, confirmed correct by construction (the same selector
convention already proven working in every other rewritten file this
feature touched) — they simply cannot be exercised end-to-end until a
future, separate migration fixes this file's own `boot()`. The sparkline
mechanism's real, working, real-content-based coverage — `tests/
integration/brokenPanelStates.spec.ts`'s "a valuebox with a broken
sparkline / baseline_trend still shows its scalar value" test (real
`dashboard-8-test.yaml` content, `row_valuebox_edge`) — passes cleanly
(9/9 in that file) with this feature's new Observable-Plot-based
component, providing genuine, real regression coverage for the
conversion despite the separate file's own pre-existing gap.

## 10c. Correction (found during implementation, /speckit-implement): `tests/integration/observablePlotPanel.spec.ts` is ALSO pre-existing broken, unrelated to this feature

The same investigation as §10b, applied to T031 (the task meant to
directly confirm the five existing Observable Plot panels and the shared
`observablePlotEncoding.ts`/`ObservablePlotPanel.tsx` are unaffected):
all 24 tests in this file fail, and a `git stash` A/B against a fully
clean tree reproduces the identical 24 failures byte-for-byte — this
file's own header comment confirms it too depends on
`tests/fixtures/dashboard-config/dashboard-1-summary.yaml` content
(`row_observable_plot`'s six fixture panels) via the same retired
copy-in mechanism §10b describes. This is now the **fifth** confirmed
instance of the exact same `040-test-suite-migration` gap this codebase's
own history already tracks (`flowmapPanel.spec.ts`, `zonemapPanel.spec.ts`,
the original `graphicWalkerPanel.spec.ts` fixed by `056`, `valueBoxPanel.spec.ts`
found in §10b, and now this one) — not fixed here, for the same
out-of-scope reasoning as §10b.

**What this means for T031's real intent** (confirming the five existing
panels and their shared component are unaffected): `git diff --stat --
src/panels/observablePlotEncoding.ts src/panels/ObservablePlotPanel.tsx`
is confirmed empty — zero lines changed by this feature in either file.
Beyond that direct-diff guarantee, real, LIVE, passing confirmation that
these two shared files still work correctly comes from every other
Playwright file this feature's own US1/US2 work already exercised
end-to-end and confirmed passing (`dashboardShell.spec.ts`,
`panelExpand.spec.ts`, `scenarioColorOverride.spec.ts`,
`scenarioLabelDisplay.spec.ts`, `switchControlsUnpinnedPanels.spec.ts`,
`demoMultiScenario.spec.ts`, `lazyTabLoading.spec.ts`) — every one of
those now renders at least one panel through this exact same shared
component (the six newly-converted panels all go through it), and all
passed cleanly. This is real, working, end-to-end coverage of the shared
rendering path, just not sourced from the one file whose own name
suggests it should be the authoritative source — that file cannot serve
that role right now regardless of this feature's own changes.

## 10d. Full-suite regression confirmation (T034): a large, pre-existing, systemic gap — not this feature's

The full `tests/integration/` suite (375 tests) was run twice against this
feature's finished changes, both times to completion (not truncated):
**240 passed, 135 failed**, reproduced identically both times (byte-for-
byte identical failure list, ~34.6 minutes each run). Every one of the
135 failures was individually attributed to one of 9 files:

| File | Failing | Confirmed pre-existing via `git stash` A/B? |
|---|---|---|
| `settingsModal.spec.ts` | 32 | ✅ yes — 32/32 identical on clean tree |
| `observablePlotPanel.spec.ts` | 24 | ✅ yes — 24/24 identical (§10c) |
| `tablePanel.spec.ts` | 23 | ✅ yes — 23/23 identical on clean tree |
| `scenarioManager.spec.ts` | 16 | ✅ yes — 16/16 identical on clean tree |
| `valueBoxPanel.spec.ts` | 14 | ✅ yes — 14/14 identical (§10b) |
| `sankeyPanel.spec.ts` | 11 | ✅ yes — 11/11 identical on clean tree |
| `rechartsPanel.spec.ts` | 8 | ✅ yes — 8/8 identical on clean tree |
| `scenarioAutoActivation.spec.ts` | 6 | ✅ yes — 6/6 identical on clean tree |
| `flowmapPanel.spec.ts` | 1 | ✅ yes — 1/1 identical on clean tree |
| **Total** | **135** | **135/135 (100%) confirmed pre-existing** |

**Zero real regressions.** Every one of the 6 files not already
individually investigated in §10b/§10c (`settingsModal`, `tablePanel`,
`scenarioManager`, `sankeyPanel`, `rechartsPanel`, `scenarioAutoActivation`)
was re-run against a fully clean tree (`git stash` with none of this
feature's changes applied) and reproduced its exact failure count,
confirming none of them are caused by this feature either — this feature
touches none of their own subject matter (basemap/scenario-management/
table-sort/sankey/recharts-panel-type/scenario-activation mechanics).

`flowmapPanel.spec.ts`'s single failure is the same class of already-
documented, real-hardware/timing-sensitive flake this project's own
CLAUDE.md history records repeatedly (`033`/`034`/`035`/`036`/`037`'s own
entries). The other 8 files' mass failures share the same root cause
identified in §10b/§10c: they depend on the `tests/fixtures/dashboard-
config/` on-disk fixture-copy mechanism that `040-test-suite-migration`
already retired (confirmed directly from `tests/global-setup.js`'s own
header comment: "The synthetic-fixture copy-in dance is gone"), and were
apparently never migrated — a **ninth** confirmed file in this same
already-tracked class of gap (`flowmapPanel.spec.ts`'s OWN historical
entry, `zonemapPanel.spec.ts`, the original `graphicWalkerPanel.spec.ts`
fixed by `056`, plus the 5 more found by this feature: `valueBoxPanel`,
`observablePlotPanel`, `settingsModal`, `tablePanel`, `scenarioManager`,
`sankeyPanel`, `rechartsPanel`, `scenarioAutoActivation` — a much larger
share of the suite than previously documented anywhere). **Not fixed
here** — this is a large, genuinely separate test-infrastructure
migration project of its own, well outside this feature's scope
(rendering-engine conversion), flagged here in full for its own future
follow-up rather than silently worked around or left undocumented.

## 11. Constitution alignment

Confirmed (plan.md's own Constitution Check) that no numbered Core
Principle (I–IX) addresses "default chart engine" — only the non-binding-
by-principle **Technology Stack Reference** table names Plotly.js as
"Charts — default," and that cell was already stale before this feature
(per `CLAUDE.md`'s own `029-shadcn-chart-panel` entry naming Recharts as
"this app's new default/primary engine," with no corresponding amendment
on record). This feature does not require a constitution amendment to
proceed; a future documentation-only PATCH updating that table cell is
recommended but explicitly out of this feature's own scope.
