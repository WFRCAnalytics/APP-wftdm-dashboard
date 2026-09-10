# Research: ObservablePlotPanel

Phase 0 output for `specs/007-observable-plot-panel/plan.md`. Every decision
below is grounded in either the real, installed grammar/code in this repo or a
direct fetch against `@observablehq/plot`'s real published package/source —
not assumed, per this project's established discipline (005-table-panel,
006-markdown-panel).

## §1. `filter:` is a common-key union type, not a single string — a real grammar finding, not an implementation choice

**Decision**: Widen `DataBoundPanelConfigBase.filter` from `string | undefined`
to `string | Record<string, string> | undefined`, and rewrite
`panelQuery.ts`'s `buildPanelQuery` to accept either shape. This is not new
grammar invented for this feature — `project-docs/GRAMMAR.md`'s own common-keys table
(the block every panel type shares) already documents `filter: <inline |
$ref>`, i.e. two forms were always allowed; `valuebox`/`plotly`/`table` simply
never happened to exercise the `inline` (map) form in any example so far.
`type: observable-plot`'s own worked examples are the first to use it:

```yaml
filter:
  purpose: $filters.purpose        # $ref form, keyed to an explicit column
  income_category: $inputs.income_filter   # same, for a panel-local input
```

versus every existing panel's `filter: $filters.purpose` (the bare `$ref`
form, column name implied to equal the filter id).

**Reasoning**: `buildPanelQuery`'s current implementation
(`config.filter?.match(/^\$filters\.([A-Za-z0-9_]+)$/)`) both extracts the
placeholder's id *and* assumes the WHERE clause's bound column has that exact
same name — true for every existing single-string example, but structurally
false for the map form, where the map's own key is the bound column and the
value is an independent placeholder string (`income_category:
$inputs.income_filter` — column `income_category`, placeholder id
`income_filter`, deliberately different strings). A version of this feature
that left `buildPanelQuery` untouched and had `ObservablePlotPanel.tsx` do its
own separate SQL-templating for the map form would fork `WHERE`-clause
construction into two divergent code paths for what is, per `project-docs/GRAMMAR.md`,
one documented key with two literal forms — worse for review, and a second
place Principle III's "string replacement only, never eval()" discipline would
need auditing instead of one.

**Design**: `buildPanelQuery` normalizes `config.filter` to a list of
`[column, placeholderString]` pairs before building the template:
- `undefined` → `[]` (unchanged behavior — no `WHERE`)
- a string matching `^\$filters\.([A-Za-z0-9_]+)$` → `[[id, filter]]` (exactly
  today's behavior, column assumed equal to id — existing valuebox/plotly/
  table fixtures and `tests/unit/panelQuery.test.ts` are unaffected byte for
  byte)
- a string that does *not* match that pattern (a literal, non-placeholder
  value) → `[]`, same as today (`tests/unit/panelQuery.test.ts`'s "does not
  include a WHERE clause when config.filter is not a $filters.x reference"
  case)
- a `Record<string, string>` → `Object.entries(config.filter)` verbatim, each
  entry becoming one `AND "<column>" = '<placeholder>'` line

`buildPanelQuery` itself never needs to know or care whether a given entry's
placeholder string is `$filters.x` or `$inputs.x` — it passes the literal
string through into the template unchanged; `sqlExpander.expand()` (§2 below)
is the one place that dispatches on placeholder *kind*. This keeps the two
concerns (which columns get bound at all vs. how a given placeholder kind
resolves to a literal value) cleanly separated, matching how `$scenario`/
`$filters` are already split between `panelQuery.ts` and `sqlExpander.ts`.

**Alternatives considered**: A separate `filters: Record<string,string>` field
distinct from the inherited `filter: string`, so `ObservablePlotPanelConfig`
never needs `buildPanelQuery` to change — rejected because the actual YAML key
authors write is `filter:` (singular) in every documented example, including
`type: observable-plot`'s own; inventing a differently-named TypeScript field
would silently diverge the parsed shape from the real key, exactly the kind of
mismatch `layout/types.ts`'s existing doc comments warn against introducing.

## §2. `$inputs.<id>` extends `sqlExpander.ts`, mirroring `$filters.<id>`'s existing treatment

**Decision**: Add `inputs` as a fifth recognized placeholder kind in
`sqlExpander.ts`'s `PLACEHOLDER_RE` and dispatch `switch`, and add an optional
fifth parameter to `expand()`: `inputState?: FilterStateLike`. The existing
'all'-value line-drop pass (currently `$filters.`-only) is extended to also
recognize `$inputs.` lines, for consistency with its structurally closest
sibling in `project-docs/GRAMMAR.md`'s own SQL placeholder reference table — even
though no worked `inputs:` example currently declares an `all_option`, nothing
in the grammar forbids one, and the cost of covering it is one regex
alternation, not a parallel code path.

**Reasoning**: `project-docs/GRAMMAR.md`'s SQL placeholder reference table lists
`$inputs.x` in exactly the same table, at exactly the same level, as
`$filters.x`/`$scenario.x`/`$metric.col` — it is not a special or lesser case
of an existing kind, it is a sibling placeholder kind this project's one
constitution-governed placeholder-expansion module (Principle III: "SQL
fragments... via string replacement only") should resolve, the same way it
already resolves the other four. Building a second, `ObservablePlotPanel.tsx`
-local substitution routine for just this one placeholder kind would fork the
"string-replacement, never eval()" discipline this module exists to make
reviewable in one place.

**Design**: `expand()`'s new `inputState` parameter reuses the *same*
duck-typed `FilterStateLike` interface (`{ get(id: string): unknown }`)
`filterState` already satisfies — no new interface. `ObservablePlotPanel.tsx`
constructs a small object literal wrapping its own component-local input
values (§4) and passes it as `inputState`; it never imports or touches `state/
filterState.ts` for this purpose. Existing callers
(`ValueBoxPanel`/`PlotlyPanel`/`TablePanel`) never emit `$inputs.` placeholders
and never pass this new argument — `inputState` defaults to `undefined`, and
`expandInputs` throws the same descriptive "unresolved placeholder" error
`missing()` already produces for any other unresolved reference if a template
somehow contains `$inputs.` with no `inputState` supplied (defensive, not
expected to be reachable through this feature's own code paths).

**Alternatives considered**: Merging panel-local input values into the same
`filterState`-shaped object passed for `$filters.` resolution (one combined
lookup) — rejected: it would let an `$inputs.x` reference silently resolve
against the *global* filter store if an id happened to collide, defeating
FR-005's isolation requirement by construction rather than guaranteeing it.

**Correction, found post-implementation**: `expandFilter`/`expandInputs`'s
literal-substitution step did not escape embedded single quotes before
placing a value inside a `'...'` SQL string literal — a real, if latent, gap
that pre-dates this feature (`expandFilter`'s scalar case had the identical
issue; `$filters.`-bound values are author-controlled dashboard config
today, not end-user free text, which is likely why it went unnoticed) but is
fixed here alongside `expandInputs`, since this feature's own multiselect
array-value path is what made the gap concrete and easy to exercise, and is
the natural moment to close both rather than leave one fixed and one not.
Fixed with a shared `escapeSqlString()` helper (SQL's standard doubling
escape, `'` → `''`), applied to `expandFilter`'s scalar return and to
`expandInputs`'s scalar and each-array-element returns — still plain string
manipulation, not SQL parsing, so Principle III holds unchanged.

## §3. Panel-local input state lives in component-local React state, never `state/filterState.ts`

**Decision**: Each declared `inputs:` entry's current value is tracked via
`useState` inside `ObservablePlotPanel.tsx` (one state slice, keyed by input
`id`, scoped to that one component instance) — not written to the shared
`state/filterState.ts` pub/sub store under any naming convention.

**Reasoning**: spec.md's FR-005 requires that changing one panel's input
value "MUST NOT write to the global filter store... and MUST NOT affect any
other panel," including two `observable-plot` panels that happen to declare
an input with the same `id` (an explicitly named edge case). Storing input
values in `state/filterState.ts` — even under a synthetically panel-scoped key
like `${panelInstanceId}:${inputId}` — would require inventing and maintaining
a collision-proof panel-instance-id scheme for a store designed around
globally-unique filter ids; component-local `useState` is isolated *by
construction* (React guarantees each component instance's own state is
independent) and requires no naming scheme at all. It also composes for free
with `panelExpandHost.tsx`'s persistent-portal-host design (research already
completed in `004-panel-expand-dialog`): because the expand/collapse
transition never remounts the panel component (the same `ObservablePlotPanel`
instance is portaled between the inline and dialog anchors — see
`layout/panelExpandHost.tsx`'s own extensive comment on this), a plain
`useState` value already persists across that transition automatically,
resolving spec.md's Edge Case/FR-006 requirement with zero extra code, not a
new mechanism.

**Alternatives considered**: A new, separate panel-scoped store module
(`state/panelInputState.ts`) — rejected as unnecessary machinery: nothing
outside the owning panel instance ever needs to read a panel-local input's
current value (unlike `state/filterState.ts`, whose entire reason for
existing is that *many* panels read the same global filter value), so there is
no cross-component read requirement `useState` fails to satisfy.

## §4. Chart encodings (`x`/`y`/`fill`/`stroke`/`facet_x`/`facet_y`) are literal column names — confirmed, not assumed

**Decision**: `ObservablePlotPanel`'s encoding-resolution logic treats `x`,
`y`, `fill`, `stroke`, `facet_x`, `facet_y` as literal column names to read
directly off each queried row — no `$metric.<column>` placeholder
substitution is applied to these fields, unlike `PlotlyPanel`'s trace axes.

**Reasoning**: Directly verified against `project-docs/GRAMMAR.md`'s two full
`type: observable-plot` examples — `x: distance_bin`, `y: trips`, `stroke:
purpose`, and separately `x: income_category`, `y: share`, `fill: mode` — none
prefixed with `$metric.`, in explicit contrast to the immediately preceding
`type: plotly` example's `x: $metric.observed`, `y: $metric.modeled` in the
same document. `plotlyTraces.ts`'s `resolveColumnName`/`resolveField`
placeholder-parsing logic therefore does not transfer to this panel type —
reusing it here would silently break on any `observable-plot` config, since
`resolveColumnName('purpose')` (no `$metric.` prefix) returns `undefined` by
design, meant to signal "this is a literal value," which is exactly backwards
for what an unprefixed `x:`/`y:` value means in `observable-plot`'s own
grammar.

**Design**: A new, project-specific pure module,
`panels/observablePlotEncoding.ts` (mirroring `plotlyTraces.ts`'s reason for
being split out of its component — see §6), resolves an
`ObservablePlotPanelConfig` + queried rows into a plain `{markName: string,
data: Record<string, unknown>[], options: Record<string, unknown>}` object —
`x`/`y`/`fill`/`stroke`/`facet_x`→`fx`/`facet_y`→`fy`/`tip`/`grid` copied
through as Plot channel/option keys (renamed only where Plot's own option name
differs from `project-docs/GRAMMAR.md`'s config key, e.g. `facet_x` → `fx`). It never
constructs marks or calls `Plot.plot()` itself — see §6 for why.

**Alternatives considered**: none seriously — this is a direct reading of
documented grammar, not a design tradeoff.

**Correction, found post-implementation (a real hover bug, manual visual
check)**: `tip`/`grid` are copied through as stated above, but `tip`
specifically needed one more step than "copy the value through unchanged."
Confirmed against `@observablehq/plot`'s real source (`src/mark.js`'s
`maybeTip`) that the documented `tip: true` boolean always resolves to
Plot's `"xy"` (2D) pointer mode, for every mark type — it carries no
mark-shape awareness of its own. Plot's own docs warn 2D pointing creates
"dead spots" on bar/rect marks (the pointer must land within ~40px of a
bar's centroid, not anywhere on its visible area) and recommend
one-dimensional `"x"`/`"y"` pointing for those shapes instead. Left as a
direct passthrough, `tip: true` on a `barY` panel would have been
technically configured but practically unusable — hovering most of a
visible bar would show nothing, the same user-visible symptom as "tooltips
don't work" at all. `observablePlotEncoding.ts`'s `resolveTipMode()`
resolves this internally: `barY` → `"x"`, every other mark (today: `lineY`,
whose own `project-docs/GRAMMAR.md` example already uses plain `tip: true`
successfully) → the `"xy"` default — a mark-aware runtime decision, not a
new author-facing grammar key (`project-docs/GRAMMAR.md`'s `tip:` stays a plain
boolean). The *separate*, more basic cause of the bug — this feature's own
fixture never set `tip: true` anywhere at all, despite the "Trip Length
Frequency Distribution" panel being authored as reusing `project-docs/GRAMMAR.md`'s
worked example "almost verbatim" — was a fixture-authoring omission, not a
design gap; confirmed via a byte-identical container `innerHTML` before/
after hover on the un-fixed fixture (no tip DOM node was ever created,
ruling out a CSS-clipping explanation before concluding "never rendered").

**Second correction, same investigation category, found via a separate
manual visual check**: fill/stroke-encoded charts never showed a color
legend either. `project-docs/GRAMMAR.md` documents no `legend:` key at all for this
panel type — confirmed by grepping the whole file, not just the
observable-plot section, and re-reading both worked examples key-by-key
(a genuine completeness pass, not a spot check: nothing else documented for
this panel type — axis labels, in particular — turned out to be missing;
axis labels were verified empirically to already auto-derive from field
names with zero config, correcting an initially-wrong summarized-doc claim
that they required explicit configuration). Confirmed against Plot's real
docs that `color: {legend: true}` is a top-level `Plot.plot()` option,
confirmed not automatic. Since no author-facing key exists to opt in with,
`observablePlotEncoding.ts` defaults to showing a legend whenever `fill` or
`stroke` is set — matching this app's own `PlotlyPanel`, which already
auto-shows a legend whenever a categorical color split exists, for
consistency across the app's two charting panel types. Fixing this
surfaced a real regression in this feature's *own* prior test coverage:
Plot's legend swatches are themselves small `<svg><rect>` elements
rendered *before* the actual chart SVG in DOM order, so every existing
`svg`/`svg rect`/`svg path` locator written before any legend existed
became ambiguous or silently wrong (`.first()` started picking a legend
swatch icon instead of a real mark) — caught by the full suite failing 4 of
this feature's own already-passing tests, not by manual review. Fixed by
scoping every chart-SVG locator in the spec file to `svg[viewBox]` (only
the real chart SVG has one).

## §5. `@observablehq/plot`: version, dependencies, resize behavior — verified against the real package

**Decision**: Pin `@observablehq/plot` at `^0.6.17` (latest on npm at research
time). No separate `d3` dependency is added to this project's own
`package.json` — `d3` (`^7.9.0`) is `@observablehq/plot`'s own regular
(non-peer) dependency, installed transitively; `@observablehq/plot` has no
listed peer dependencies at all (confirmed via the package's real
`registry.npmjs.org` metadata), unlike the deck.gl/flowmap.gl/maplibre-gl
trio's pinned-peer-version requirement (constitution's Technology Stack
Reference). `@observablehq/plot` ships its own TypeScript types
(`"types": "src/index.d.ts"` in its real `package.json`) — no `@types/*`
package needed, matching `marked`/`dompurify`'s precedent from
006-markdown-panel.

**Resize behavior — the risk spec.md's FR-007 flagged as unverified,
confirmed rather than assumed**: `Plot.plot()` returns, per Observable Plot's
own documentation (fetched directly, not summarized from memory), "a detached
DOM element — either an SVG or HTML figure element" — a brand-new element on
every call, with no in-place update method analogous to `Plotly.react()`.
Observable Plot's own documented React usage pattern (fetched directly from
its getting-started guide) is:

```jsx
useEffect(() => {
  const plot = Plot.plot({ /* marks, options including explicit width/height */ })
  containerRef.current.append(plot)
  return () => plot.remove()
}, [data])
```

There is no built-in container-resize awareness — `Plot.plot({width,
height})` takes explicit numeric dimensions read once at call time; unlike
Plotly's `responsive: true` + `Plotly.Plots.resize()`, nothing inside
`@observablehq/plot` itself observes the container's size. (Observable
*Framework*'s notebook-specific `resize()` reactive helper, surfaced in
search results, is a Framework-only primitive tied to its own reactive
runtime — not part of the plain `@observablehq/plot` npm package this project
depends on, and not usable outside Observable Framework's own build.)

**Design — confirms the risk named in spec.md's FR-007 is real and requires a
materially different implementation from `PlotlyPanel`'s, not the same
ResizeObserver fix reused verbatim**: `ObservablePlotPanel.tsx` needs a
ResizeObserver on its container (same trigger mechanism as `PlotlyPanel.tsx`),
but the *action* taken on each observed resize is different in kind, not just
in the API called: `PlotlyPanel.tsx` calls `Plotly.Plots.resize(container)` —
a cheap in-place layout recalculation against the *same* persistent DOM tree
`Plotly.react()` already built. `ObservablePlotPanel.tsx` instead must, on
each resize *and* on each data/config change, call `Plot.plot({...options,
width: measuredWidth, height: measuredHeight})` again, and swap the container's
child (remove the previous returned element, append the new one) — matching
Observable Plot's own documented `append()`/`remove()` React pattern, driven
by a ref holding the currently-mounted plot element, extended so a
ResizeObserver callback triggers the same rebuild-and-swap the data-fetch
effect already performs, rather than a separate cheap resize-only call. This
is the concrete reason `panels/PlotlyPanel.tsx`'s two-effect split (fetch
effect + resize-only effect calling a different, cheap API) is not reused
unchanged — the render-and-swap step itself has to be shared between both
triggers here, not split into a "full render" path and a "cheap resize" path
the way Plotly's own API allows.

## §6. `observablePlotEncoding.ts` stays a pure, DOM-free module — Vitest-testable, same reasoning as `plotlyTraces.ts`

**Decision**: `panels/observablePlotEncoding.ts` never imports
`@observablehq/plot` at runtime (only its types, erased at compile time, if
needed at all) and never calls `document.createElementNS` or any DOM API — it
returns a plain data object; only `ObservablePlotPanel.tsx` itself calls
`Plot[markName](data, options)`.

**Reasoning**: Confirmed by direct inspection of `@observablehq/plot`'s real
source (`src/plot.js`) that, unlike `plotly.js-dist-min` (which references
`self` at module load and is the reason `plotlyTraces.ts` was split out in
003-dashboard-shell-navigation), `@observablehq/plot` has no top-level
browser-global reference — it would not throw merely on import inside
Vitest's `environment: 'node'` config (`vitest.config.js`). That does not,
however, make calling `Plot.plot()` itself Vitest-safe: `Plot.plot()`
constructs real SVG/HTML DOM nodes via `document.createElementNS`, which does
not exist in a plain Node environment (this project's `vitest.config.js` is
deliberately `environment: 'node'`, not `jsdom` — no per-project precedent for
jsdom exists to lean on, and introducing one is out of scope for a single
panel type). Keeping `observablePlotEncoding.ts`'s output a plain object
(never a real Plot mark or plotted element) means its tests need no DOM at
all, mirroring `plotlyTraces.ts`'s and `tableLogic.ts`'s established pattern
of pure, project-specific logic extracted from the DOM-touching component file
— actual rendering (`Plot[markName](...)`, appending/removing DOM nodes,
ResizeObserver wiring) is exercised only by real-browser Playwright tests,
same split `PlotlyPanel.tsx`/`plotlyTraces.ts` already established.

## §5b. `ResizeObserver.observe()` fires its callback once, guaranteed, immediately — confirmed against the spec, not assumed; the render-and-swap effect must not also call `render()` explicitly without a guard

**Finding**: Calling `observer.observe(el)` does not merely start watching for *future* size changes — the ResizeObserver spec's own algorithm guarantees the callback fires once, asynchronously, right after `observe()` is called, even if the element's size never subsequently changes. Verified directly against the W3C Resize Observer spec (`drafts.csswg.org/resize-observer`), not assumed either way (per the explicit instruction to check rather than guess): its own prose section, "Some interesting facts about these observations," states plainly "Observation will fire when observation starts," and the formal algorithm backs this: each newly observed target's `ResizeObservation` is constructed with `lastReportedSizes` initialized to the sentinel `[(-1,-1)]`, so `isActive()` — the check that decides whether a target's callback fires on the next observation pass — unconditionally returns `true` the first time it runs for that target (any real measured size differs from `(-1,-1)`), *regardless of whether the size actually changed since some prior render*.

**Consequence for this feature's own design**: research.md §5's original render-and-swap effect sketch called `render()` synchronously, then `observer.observe(el)` — this fires `render()` **twice** for the exact same data/config/size on every effect run: once synchronously, once again asynchronously moments later from the guaranteed initial `ResizeObserver` callback. Each call rebuilds a whole new `Plot.plot()` element and swaps it into the DOM — a real, avoidable duplicate rebuild-and-swap on every fetch, not a cosmetic issue.

**Decision**: Keep the synchronous `render()` call before `observe()` — not drop it in favor of relying solely on the guaranteed async callback — because `PlotlyPanel.tsx`'s established pattern renders synchronously the moment data arrives (`Plotly.react()` inside the fetch-effect's `.then()`), and relying solely on `ResizeObserver`'s async callback would introduce a visible one-frame gap (empty container, then chart) on every panel mount/data change that `PlotlyPanel` never has — a real, avoidable UX regression, not a neutral simplification. Instead, guard `render()` itself against rebuilding for a size it already rendered at: track the last-rendered `{width, height}` in a plain (non-state) variable closed over by the effect, and skip the rebuild when the newly measured size matches. This makes the guaranteed-duplicate initial `ResizeObserver` callback a cheap no-op (the common case — nothing sized between the synchronous call and the async one), while still correctly rebuilding on every *genuine* subsequent resize (including the `004` expand/collapse transition, which does change the container's measured size). It also happens to filter out spurious sub-pixel `ResizeObserver` firings later, a secondary, welcome benefit of the same guard, not the reason for it.

**Alternatives considered**: Dropping the explicit `render()` call and relying solely on the guaranteed initial async callback — technically correct and simpler code, but rejected for the visible-empty-frame regression above. Debouncing/throttling the `ResizeObserver` callback — unnecessary complexity for a problem the size-comparison guard already solves exactly, with no risk of coalescing a real resize into a dropped frame.

## §7. Loading/empty/error states reuse the existing shared components and per-panel skeleton convention

**Decision**: `ObservablePlotPanel.tsx` follows `PlotlyPanel.tsx`'s exact
state-machine shape — `'loading' | 'ready' | 'empty' | 'error'` local state,
an inline `animate-pulse` skeleton while loading (not a new shared loading
component, per this project's established choice — `CLAUDE.md`'s
implementation-order item 13), and the existing `PanelEmptyState`/
`PanelErrorState` shared components for the other two terminal states.

**Reasoning**: Unlike `MarkdownPanel` (research.md §4 of 006-markdown-panel —
genuinely query-less, so a state machine didn't apply), `observable-plot`
panels always query `services/duckdb.ts` (FR-011) — the same async-fetch
shape `PlotlyPanel`/`TablePanel` already have, so there is no reason to
diverge from their proven state-machine shape or introduce a distinct pattern
for this fifth panel type.

## §8. Panel-local input controls: new UI, not an adaptation of an existing filter-bar component

**Decision**: `select`/`multiselect`/`range` input controls are built fresh
for this feature, as small presentational pieces rendered inside
`ObservablePlotPanel.tsx`'s own card content (not a new shared
`components/ui/` primitive on their own, unless a later feature needs the
identical control elsewhere — no such second consumer exists yet).

**Reasoning**: Confirmed by inspection (`src/state/filterState.ts`,
`src/layout/dashboardRenderer.tsx`, and a repo-wide search for any rendered
`<select>`/multiselect/range control) that no global sidebar filter-bar UI —
the natural place such a control would already exist — has been built by any
prior feature. `FilterDefinition`'s `select | multiselect | range` type
vocabulary (`layout/types.ts`) is fully typed and stored but never rendered
anywhere in `src/`. Panel-local `inputs:` reuses that same three-value
vocabulary, but there is nothing to copy the actual control markup/behavior
from — this is why spec.md scoped this feature as materially bigger than
005/006 rather than "swap Plotly for Observable Plot": it is also, concretely,
this application's first interactive filter-value-setting UI of any kind.

## §9. Panel-local input option lists — sourcing, and the mismatched-default edge case (spec.md's Edge Cases)

**Decision**: Each declared input's selectable options are fetched via
`services/duckdb.ts`'s existing `distinctValues(view, column)` function — a
real, exported function with **zero prior callers anywhere in this codebase**
(the same "receiving API, no caller yet" situation `CLAUDE.md` item 7 already
documents for `registerScenario`) — for `select`/`multiselect` inputs, and via
a small dedicated `SELECT MIN(...), MAX(...) FROM ...` query (no existing
helper covers this; still plain string templating, no `eval()`) for
`range` inputs. The query targets the **same view the owning panel's own
metric resolves to** — `config.scenario` (singular) if set, otherwise the
first entry of `resolveActiveScenarios(config, activeScenarios)` — reusing
`panelQuery.ts`'s existing scenario-resolution logic rather than inventing a
second one, since `project-docs/GRAMMAR.md`'s `inputs:` shape has no separate
`source:` field (unlike `FilterDefinition`, which does) — there is exactly
one metric per panel to draw options from.

**Reasoning — why this query is deliberately UNfiltered by any of the
panel's own `filter:` bindings, including the input's own**: if an input's
option-list query applied that same input's own `$inputs.<id>` binding (the
naive "just reuse the panel's main query" approach), the fetched row set
would already be narrowed to rows matching whatever is *currently* selected —
collapsing the option list to (at most) the one currently-selected value on
every subsequent render, since nothing else would ever appear as selectable.
This is a real correctness bug the naive approach would introduce, not a
style choice — a picklist populated only with its own current selection is
not a usable picklist. The fix is not to special-case "skip this one
binding" (fragile, and multiselect's "any of" semantics make the general
case harder still); it is to never apply *any* `filter:` binding to the
options query at all — the full, unfiltered distinct-value/min-max set for
that column, computed once per input on mount (and re-computed only if
`config`/the active-scenario resolution changes, not on every keystroke or
sibling-input change). This is a deliberate simplification versus a
richer, filter-consistent-with-current-selections option list (e.g.
narrowing `income_filter`'s choices to only those that would produce
non-empty results given the current `purpose` filter) — nothing in
`project-docs/GRAMMAR.md`'s documented grammar or spec.md's requirements calls for
that richer behavior, and it would reintroduce exactly the same
self-referential-narrowing risk for *other* filters/inputs that this
decision avoids for the input's own binding.

**Resolves spec.md's Edge Case — "what happens when a panel-local input's
`default` value does not match any value actually present in its bound
column?"**: No special-case handling is added, deliberately. The
currently-selected value (starting from `default`) feeds the panel's main
query exactly as any other `$inputs.<id>`/`$filters.<id>` value already
does — if it matches no row, the query legitimately returns zero rows,
which is precisely `PanelEmptyState`'s existing, already-tested condition
(research.md §7). This is the same behavior global `$filters.<id>` values
already have today — `FilterDefinition`'s own `default` is never validated
against `source` either — so a mismatched input default introduces no new
failure mode this application doesn't already accept elsewhere; inventing
one just for this panel type's inputs would be inconsistent, not more
correct. The two control types this affects differently, worth naming
rather than treating as identical:
- **`select`/`multiselect`**: a mismatched value simply matches zero
  fetched options — `PanelLocalInput`'s own rendering still injects an
  `<option>` for the current value even when absent from the fetched list
  (see contracts/observable-plot-panel.md), so the control visibly shows
  what is actually selected rather than silently falling back to
  whichever `<option>` happens to be first — but the underlying query
  still legitimately empties out, same as above.
- **`range`**: HTML's own `<input type="range">` element clamps an
  out-of-bounds `value` to the nearest `min`/`max` bound **visually** —
  but discovered during implementation (not anticipated here originally):
  that clamping is display-only and fires no `change`/`input` event, so a
  React-controlled `value` prop left at the raw out-of-range default would
  silently diverge from what the slider visibly shows, and the query
  driving the panel would keep using the stale, never-corrected value —
  not what the user sees selected. The actual fix needed one small piece
  of application code after all: once the column's real `[min, max]`
  bounds are known (`PanelLocalInput`'s own bounds-fetch effect resolves),
  a second effect computes the same clamped value in JS and calls
  `onChange` if it differs from the current value — syncing state to match
  the display exactly once, converging with no further calls (the
  contract and `ObservablePlotPanel.tsx` reflect this; this section is
  corrected from its original "no application code needed" claim, not
  quietly rewritten). A mismatched `range` default still fails more
  gracefully than a mismatched `select`/`multiselect` default in the way
  that matters to the user — it never shows a stuck-empty chart, syncing
  straight to a valid, visibly-selected value instead of surfacing
  `PanelEmptyState` — the difference is real, just resolved with a little
  code rather than for free.

**Alternatives considered**: Validating `default` against the fetched
option list at mount and substituting the first real option if it doesn't
match — rejected as unrequested, silent behavior-altering "correction" of
an author's config that the global-filter precedent doesn't apply either;
if a dashboard author's `default` is wrong, the empty-state result *is*
the signal something is misconfigured, the same way it already is for a
bad `$filters.<id>` default.

## Summary

| # | Question | Resolution |
|---|---|---|
| 1 | `filter:` shape for observable-plot | Common-key union type (`string \| Record<string,string>`), confirmed via `project-docs/GRAMMAR.md`'s own common-keys table; `buildPanelQuery` normalizes both forms |
| 2 | `$inputs.<id>` resolution | Extends `sqlExpander.ts`'s existing placeholder dispatch, mirroring `$filters.<id>`, via a new optional `inputState` param |
| 3 | Panel-local input state storage | Component-local `useState`, not `state/filterState.ts` — isolated by construction, persists across 004's expand transition for free |
| 4 | Chart encoding placeholder convention | Bare column names, confirmed NOT `$metric.`-prefixed — `plotlyTraces.ts` logic does not transfer |
| 5 | `@observablehq/plot` version/deps/resize behavior | `^0.6.17`, `d3` transitive (no peer deps), own TS types; resize requires full replot-and-swap, not a cheap in-place `Plotly.Plots.resize()`-equivalent |
| 5b | `ResizeObserver.observe()`'s guaranteed initial callback | Confirmed via the real W3C spec (`lastReportedSizes` sentinel `[(-1,-1)]`) — fires once, always, right after `observe()`. Render-and-swap effect keeps its synchronous initial `render()` call (matches `PlotlyPanel`'s no-flash behavior) and guards against the resulting duplicate via a last-rendered-size comparison, not by dropping the synchronous call |
| 6 | Pure-module DOM safety | `observablePlotEncoding.ts` never imports Plot at runtime or touches the DOM — Vitest-safe by construction, same reasoning as `plotlyTraces.ts` |
| 7 | Loading/empty/error state modeling | Reuses `PlotlyPanel`'s exact state-machine shape and the shared empty/error components — this panel type always queries, unlike `markdown` |
| 8 | Panel-local input control UI | Net-new — no existing filter-bar UI anywhere in this codebase to adapt |
| 9 | Input option-list sourcing + mismatched-default edge case | `distinctValues()`/a `MIN`/`MAX` query against the panel's own resolved view, deliberately unfiltered by any `filter:` binding (avoids self-referential option-list collapse); a mismatched default is never special-cased — it flows into the same zero-row `PanelEmptyState` path any other unmatched filter value already does, with `range` additionally protected for free by the browser's own clamping behavior |
