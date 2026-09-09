# Research: Scenario Label Propagation & Color Override

Technical Context carried no `NEEDS CLARIFICATION` markers — every real
unknown was resolved by direct code audit, either in spec.md's own
"Research performed before writing this spec" section (the WHAT/WHERE) or
here (the HOW). This document covers implementation-shape decisions only.

## §1. Where to detect "this column/field is the scenario dimension"

**Decision**: Detect by the RESOLVED column/field name being exactly the
literal string `'scenario'`, uniformly across all three chart panel types.

**Rationale**: `services/sqlExpander.ts`'s `$scenario.<metric>` union
(the only mechanism that ever populates this column) always names it
literally `scenario` (`'${name}' AS scenario`, confirmed in spec.md's
research). For `plotly`, `trace.color`/`trace.name` go through
`resolveColumnName()` first — `resolveColumnName('$scenario')` already
returns `'scenario'` today, so checking `splitColumn === 'scenario'` in
`resolveTraces()` needs no new resolution step. For `recharts`/
`observable-plot`, `series`/`fill`/`stroke` are literal column names
already (not `$`-prefixed placeholders — confirmed directly against a real
published config, `public/demo-dashboard-config/dashboard-1-summary.yaml`'s
`series: scenario`), so the check is a direct string comparison,
`config.series === 'scenario'` / `config.fill === 'scenario'` / etc.

**Alternatives considered**: Checking the raw placeholder token
(`trace.color === '$scenario'`) before resolution, to avoid a
theoretical false-positive if some metric's own SQL happened to produce a
real data column literally named `scenario`. Rejected: `plotlyTraces.ts`
already has this exact same structural ambiguity today (it groups by
whatever column `splitColumn` resolves to, with no way to distinguish "the
sentinel-produced column" from "a coincidentally-named real column") —
adding new precision only for the label/color substitution while the
underlying grouping logic still has the same ambiguity would be
inconsistent, not safer. Treated as an accepted, pre-existing, unchanged
edge case (documented in spec.md's Edge Cases).

## §2. Where the label/color lookup itself lives

**Decision**: One new pure module, `panels/scenarioDisplay.ts`
(`resolveScenarioLabel(name, map)`, `resolveScenarioColor(name, map)`,
plus the `ScenarioDisplayMap` type), and one new hook,
`hooks/useScenarioDisplay.ts`, that builds the map from `state/
appState.ts` and hands it to whichever panel component needs it.

**Rationale**: Matches this codebase's own established split exactly —
every other panel type already separates DOM-free pure logic
(`plotlyTraces.ts`, `sankeyGraph.ts`, `flowmapData.ts`,
`observablePlotEncoding.ts`, `rechartsEncoding.ts`,
`expandablePanelTypes.ts`) from the React component that calls it, both
for independent Vitest coverage and because some of those modules
(`plotlyTraces.ts`) cannot safely import anything with a browser-global
side effect at module load. `034-metric-panel-redesign` hit exactly this
constraint building `panels/expandablePanelTypes.ts` — the same reasoning
applies here: `panels/scenarioDisplay.ts` must stay import-safe from a
plain-Node Vitest test, so it must not import React or any panel
component.

**Alternatives considered**: (a) Resolving label/color inline inside each
of the four pure encoding modules by calling `appState.get()` directly.
Rejected — those modules are deliberately React- and store-free today (a
`rows`-in, `traces`/`data`-out pure function); reaching into a global
mutable store from inside them breaks that contract and makes them
untestable without first registering scenarios in `appState.ts` for every
test. (b) A single combined `useScenarioLabel()`/`useScenarioColor()` pair
of hooks, one value at a time. Rejected — every consumer needs to resolve
MANY distinct scenario values found in one query result (one per
trace/series/row), not one value for one known scenario name (unlike
`useBaseline()`, which really is a single global value) — a `Map` handed
down once per render is the natural fit, mirroring how
`useActiveScenarios()` already hands down an array consumed inside a loop.

## §3. `ScenarioDisplayMap` color precedence, computed once

**Decision**: `useScenarioDisplay()` itself resolves `colorOverride ??
color ?? undefined` (viewer override, else manifest color, else no color)
into the map's `color` field — callers never re-derive FR-007/FR-008/
FR-011's precedence themselves.

**Rationale**: Keeping the override-over-manifest-over-nothing precedence
in exactly one place (the hook) means every one of the three chart panel
types' own integration is a single flat lookup, with zero risk of one
panel type implementing the precedence slightly differently from another.

## §4. Observable Plot's color scale is all-or-nothing — the one genuine per-panel-type divergence

**Decision**: For `observable-plot`, only set an explicit
`plotOptions.color = { legend: true, domain, range }` when EVERY distinct
scenario value present in that panel's own query result resolves to a
real color (override or manifest). If even one distinct scenario in that
result has neither, `range` is left unset entirely, and every scenario in
that panel falls back to Observable Plot's own built-in default
categorical cycling — matching today's behavior exactly, for that whole
panel, not per-category.

**Rationale**: Confirmed directly against `@observablehq/plot`'s own
color-scale API (already relied on elsewhere in this codebase, per
`observablePlotEncoding.ts`'s own existing `plotOptions.color = {legend:
true}` for the "show a legend" case): an explicit `range` array is
matched positionally against `domain` and replaces Plot's own internal
default cycling for the WHOLE scale — there is no way to say "use my
color for category A, but fall back to your own default cycle color for
category B" within one scale. `plotly`/`recharts` don't have this
constraint (`plotlyTraces.ts` sets `marker.color` per-trace independently;
`rechartsEncoding.ts` sets `chartConfig[key].color` per-series
independently), so only `observable-plot` needs this all-or-nothing rule.

**Alternatives considered**: Filling any un-resolved scenario's `range`
slot with a value from `d3-scale-chromatic`'s `schemeObservable10` (Plot's
own real default categorical scheme — already a real, installed
dependency in this codebase, imported by `SankeyPanel.tsx` for Tableau10
and `RechartsPanel.tsx`'s own `--chart-1..5` tokens per `033`/
`rechartsPanel.css`'s history) to mimic Plot's default cycling exactly,
category by category. Rejected as unnecessary complexity for this
feature's actual scope: it would require reproducing Plot's own internal
first-seen assignment order exactly (a real risk of a subtle, hard-to-spot
mismatch against Plot's actual internal behavior) for a benefit — partial,
per-category color resolution within one Observable Plot panel — no
acceptance scenario in spec.md actually requires. The simpler,
all-or-nothing rule satisfies FR-008 exactly as written ("falls back to
that panel type's own existing default palette-cycling behavior,
unchanged") by literally invoking that same unchanged path, whole.

## §5. Observable Plot needs a row-data copy, not a name/label indirection layer

**Decision**: When `fill`/`stroke` resolves to `'scenario'`,
`resolveObservablePlotEncoding()` builds its returned `data` from a
shallow row copy with that one field's value replaced by
`resolveScenarioLabel(rawValue, map)` — never mutating the rows passed in.

**Rationale**: Per spec.md's own research, Observable Plot reads legend/
axis/facet text directly from each row's own cell value (no separate
"trace name" or "chart config label" indirection the way `plotly`/
`recharts` have) — this is the one point in this whole feature where
label substitution genuinely happens to the DATA the chart renders from,
not to a separate display-string field. This is still safe under FR-002/
FR-003: by the time `resolveObservablePlotEncoding()` runs, the SQL query
has already completed and DuckDB is no longer involved — nothing
downstream of this function re-joins or re-filters by the real name (the
existing FR-014 null-filtering already operates on the SAME kind of
already-fetched, already-detached row array). A fresh copy (never the
original array) also protects `activeScenarioNames`/comparison-diff logic
elsewhere in `ObservablePlotPanel.tsx`, which reads `config`/props, never
this function's own returned `data`.

## §6. The color swatch control's exact shape

**Decision**: A bare native `<input type="color">`, sized `h-6 w-6
rounded border border-input` (matching the row's existing `h-6 w-6`
icon-`Button` actions, not `components/ui/input.tsx`'s full text-input
chrome), placed in `scenariosTab.tsx`'s existing trailing actions cluster,
immediately before the baseline star. A conditional `X`-icon `Button
variant="ghost" size="icon"` (reusing the exact pattern the row's existing
remove control already establishes) appears only when
`s.colorOverride` is set, calling `appState.clearColorOverride(s.name)`.

**Rationale**: `components/ui/input.tsx` (confirmed by direct read) is
built and styled for full-width text entry (`h-9 w-full`, padding,
placeholder text) — wrong shape entirely for a small swatch sitting
alongside `h-6 w-6` icon buttons in a dense action cluster. A bare native
`<input type="color">` needs no new dependency, is a real, standard HTML
form control (matching this project's own preference for native controls
demonstrated by the star/checkbox-shaped baseline toggle), and its native
OS/browser color-picker popover needs no `components/ui/dialog.tsx`
wiring of its own.

**Alternatives considered**: A `Popover`-based custom swatch grid (the
kind `021-basemap-catalog-redesign` explicitly rejected for its own
raster/vector basemap picker, and this codebase has no
`components/ui/popover.tsx` primitive at all — confirmed via `ls src/
components/ui/`). Rejected for the same reason 021 rejected it there: no
real need justifies the added complexity when a native control already
does the job.

## §8. A real, pre-existing gap found during implementation: `Scenario.color` was never actually populated for any normally-discovered scenario

**Finding** (not a Phase 0 research item — discovered live, during US2 implementation, and recorded here for the same reason `034-metric-panel-redesign`'s own research.md records its own mid-implementation findings): `services/scenarioDiscovery.ts` — the module responsible for registering `public/observed/`, `public/scenarios/*`, and `public/demo-scenarios/*`, i.e. every scenario NOT loaded via the local-folder picker — never fetched `manifest.yaml` at all, for any of its three registration paths. Only `scenario/scenarioManager.ts`'s separate local-folder-loading path ever read `manifest?.color` into `appState.register()`. This means `Scenario.color` has been `undefined` for every real, normally-discovered scenario since the field was introduced (`025-python-postprocessor`) — invisible until now because, per §1's own research finding, nothing ever consumed the field closely enough to notice it was silently never set.

**Fix**: `services/yamlLoader.ts`'s `loadManifest()` already existed (a fetch-based manifest.yaml reader, zero callers before this feature). A new `manifestFromObject()` was extracted from `scenario/manifestReader.ts`'s own existing object-to-`ParsedManifest` mapping (previously inlined in its handle-based `readManifest()`), so both the handle-based (local folder) and new URL-fetch-based (discovery) paths share one extraction implementation rather than two independently-maintained copies. `scenarioDiscovery.ts` gained a small `fetchScenarioManifest()` helper, called before each of its three `appState.register()` sites, fail-soft (matching every other step in that file — a missing/malformed manifest.yaml never blocks registration, `color`/`runDate`/`notes` simply stay `undefined`).

**A second, downstream bug this surfaced**: once manifest fetching was wired up, `good_scenario`'s color still resolved to `undefined` in a live browser test. Traced to `tests/fixtures/generate.py`'s own hand-rolled `write_manifest()` — it wrote every string field completely unquoted, so `color: #4e79a7` parsed as YAML `null` (an unquoted `#` preceded by whitespace starts a YAML comment, not literal text). Confirmed via a live `python -c "import yaml; yaml.dump({'color': '#4e79a7'})"` call that the REAL, production manifest writer (`python/wftdm_dashboard/postprocessor/manifest.py`, genuine PyYAML) already quotes this correctly and was never affected — this bug was confined to the test-fixture generator's own non-PyYAML shortcut. Fixed by double-quoting every string value there; fixtures regenerated via `uv run python tests/fixtures/generate.py`.

**A third, related reactivity bug found while building the Scenarios-tab swatch (US2)**: `hooks/useScenarioList.ts`'s own change-detection comparison (the memoized snapshot `ScenariosTab` re-renders from) checked `label`/`order`/`status`/`path`/`pinned`/`active`/`source` but not the new `colorOverride` field — so `appState.setColorOverride()` correctly updated the store and called `notify()`, but this hook's snapshot saw no relevant field change and returned the stale cached scenario, meaning the swatch's own displayed value never reflected the color it had just been set to. Fixed by adding `colorOverride` to that comparison — the same class of bug that file's own header comment already documents finding and fixing for `label`/`order` during `020-settings-modal`.

## §7. `state/appState.ts` field shape

**Decision**: `colorOverride?: string` (a CSS color string — the exact
value a native `<input type="color">`'s `onChange` hands back, e.g.
`"#4e79a7"`), alongside the existing `label?: string`, with
`setColorOverride(name, color)`/`clearColorOverride(name)` mirroring
`setLabel()`/`clearLabel()`'s existing look-up/throw/mutate/`notify()`
shape exactly.

**Rationale**: Direct precedent match — `label` already proves this exact
shape (an optional per-scenario override field, cleared by `unregister()`
for free since it lives directly on the `Scenario` object, no
`explicitBaseline`-style special-cased cleanup needed) works correctly in
this store. No new state module, per spec.md's own corrected-precedent
Assumption (`state/navBarVisibilityState.ts` no longer exists;
`state/appState.ts` itself is the applicable precedent here, not
`state/themeState.ts`).
