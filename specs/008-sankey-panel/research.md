# Research: SankeyPanel

**Feature**: `008-sankey-panel` | **Date**: 2026-09-01

All findings below were verified against real sources (npm registry, the
`d3-sankey` GitHub repository's actual source, and this repo's own installed
`node_modules`/`package-lock.json`) — none are assumed or carried over
unchanged from 007's Observable Plot findings, per the feature description's
explicit instruction.

---

## 1. `d3-sankey` version and dependency situation

**Decision**: Add `d3-sankey` (`^0.12.3`) and `d3-scale-chromatic`
(`^3.1.0`) as explicit direct dependencies in `package.json`. Do not rely on
either being reachable only transitively. **Also add `@types/d3-sankey`
(`^0.12.5`) and `@types/d3-scale-chromatic` (`^3.1.0`) as devDependencies**
— unlike `@observablehq/plot` (007's finding: ships its own types, no
`@types/*` package needed), neither library ships a `types`/`typings`
field in its own `package.json` (confirmed directly against both real
package manifests) — this app's TypeScript build would have no type
information for either import without the DefinitelyTyped packages. Both
`@types/*` packages are confirmed to exist and be current on npm.

**Rationale**:
- `d3-sankey`'s latest published version is **0.12.3**, published
  **2019-09-02** (npm registry, `dist-tags.latest` + `time`) — confirmed via
  the full version list (43 versions, 0.1.0 → 0.12.3, nothing newer). This
  is the only real `d3-sankey` package on npm and is what `docs/SPEC.md`
  pins ("sankey | d3-sankey"); there is no newer/actively-maintained
  alternative to prefer instead.
- `d3-sankey@0.12.3`'s own declared dependencies are **`d3-array: "1 - 2"`**
  and **`d3-shape: "^1.2.0"`** (its `package.json`, fetched directly) — both
  older major versions than what this repo already has installed
  transitively via `@observablehq/plot`'s `d3@7.9.0` dependency
  (`d3-array@3.2.4`, `d3-shape@3.2.0`, confirmed in this repo's own
  `package-lock.json`/`node_modules`). Since `3.2.4` does not satisfy a
  `"1 - 2"` range, npm installs `d3-sankey` a **separate nested copy** of
  `d3-array`/`d3-shape` at the versions it actually declared — this is not
  a version conflict or an install failure, just real, small (tens of KB)
  duplicate-code bundling. Worth noting in `data-model.md`'s bundle-impact
  framing, not a blocker: `d3-sankey`'s public API surface used here
  (`sankey()`, `.nodeId()`, `.nodeWidth()`, `.nodePadding()`, `.extent()`,
  `sankeyLinkHorizontal()`) has been stable across this dependency-version
  gap for years — the library has had no breaking release since 2019.
- `d3-sankey` declares **no `peerDependencies`** — it bundles/resolves its
  own `d3-array`/`d3-shape` copies rather than expecting the consumer to
  supply compatible ones, so there is no peer-dependency conflict to
  resolve, only the bundling note above.
- `d3-scale-chromatic` (needed for `color_scheme`, §3 below) **is already
  installed transitively** (`d3-scale-chromatic@3.1.0`, pulled in by
  `@observablehq/plot`'s `d3` dependency — confirmed by directly requiring
  it from this repo's `node_modules` and inspecting its exports). Relying
  on that transitive/phantom availability without declaring it directly
  would be fragile — nothing here pins `@observablehq/plot` to keep pulling
  in `d3-scale-chromatic` specifically, so a future `@observablehq/plot`
  version bump could silently break this panel type's color resolution.
  Declaring it explicitly costs nothing (it is already present) and removes
  that hidden coupling — the same reasoning 007 applied to
  `@observablehq/plot` itself rather than assuming a transitive copy was
  good enough.

**Alternatives considered**:
- Rely on the transitive `d3-scale-chromatic` copy without declaring it —
  rejected for the phantom-dependency fragility above.
- Depend on the full `d3` umbrella package instead of the narrower
  `d3-scale-chromatic` — rejected; this feature only needs categorical
  color schemes, not the rest of `d3`'s surface, and `@observablehq/plot`
  already brings the umbrella package in for anything shared.

---

## 2. Rendering model: `d3-sankey` is layout-only, not a chart library

**Decision**: `SankeyPanel.tsx` builds and owns its own `<svg>` markup
directly (via `d3-selection`, already transitively available the same way
`d3-scale-chromatic` is — see §1 — but declared explicitly here too for the
same reason); there is no `Plotly.react()`-equivalent update call to reuse
from `PlotlyPanel`, and no `Plot.plot()`-equivalent single-call renderer to
reuse from `ObservablePlotPanel` either.

**Rationale**: Verified directly against `d3-sankey`'s real source
(`src/sankey.js`, GitHub): the `sankey()` generator is a **pure layout
computation** — given a `{nodes, links}` graph, it returns node/link objects
annotated with numeric coordinates (`x0, x1, y0, y1`, link `width`) and
**produces no DOM/SVG itself**. Actually drawing the diagram is entirely the
caller's responsibility: bind the computed `graph.nodes`/`graph.links` to
`<rect>`/`<path>` selections and set their geometry attributes explicitly
(`d3-sankey`'s own documented usage pattern, and `sankeyLinkHorizontal()` is
just a path-string generator for the link shape, analogous to `d3-shape`'s
`line()`/`area()` generators — not a rendering call). This makes
`SankeyPanel.tsx`'s own render responsibility closer to what
`ObservablePlotPanel.tsx` already does (compute a data structure, then
imperatively build/replace real DOM under a ref) than to `PlotlyPanel.tsx`
(hand a config object to a charting library that owns its own DOM).

**Alternatives considered**: none — there is no maintained higher-level
"d3-sankey but it draws itself" wrapper library worth adding as a second new
dependency for one panel type; the raw-SVG-construction pattern is
`d3-sankey`'s own documented, standard usage.

---

## 3. Resize-on-container-change: full relayout required, not a cheap resize call

**Decision**: Reuse `ObservablePlotPanel`'s ResizeObserver-triggered
full-rebuild-and-swap pattern (including its last-rendered-size guard from
007's confirmed ResizeObserver double-fire fix), **not**
`PlotlyPanel`'s cheap `Plotly.Plots.resize()` call.

**Rationale**: `d3-sankey`'s `sankey.extent([[x0,y0],[x1,y1]])` sets the
**pixel bounds the entire layout is computed for** (default
`[[0,0],[1,1]]`, confirmed in its docs/source) — every node's `x0/x1/y0/y1`
and every link's `width`/path are absolute pixel coordinates solved for that
specific extent, not relative/percentage units an SVG `viewBox` could just
rescale for free. A container resize (via the 004 dialog transition or a
plain window resize) therefore requires **recomputing the full layout**
with the new extent and rebuilding the SVG, not an in-place geometry patch
— structurally the same "no cheap incremental update, must rebuild" shape
007 found for `Plot.plot()`, and a genuinely different situation from
Plotly's own internal diffing/resize support. Confirmed by directly
inspecting `d3-sankey`'s real API rather than assuming either prior fix
transfers, per the feature description's explicit instruction.

**Alternatives considered**: CSS-only scaling (`transform: scale()` on a
fixed-size SVG) — rejected; would distort stroke widths/text/node padding
non-uniformly and doesn't address the dialog's actual larger available
space, the same distortion concern FR-007 already rules out.

---

## 4. Node identity: namespaced by source/target column — corrects the spec's original self-loop premise

**Decision**: A node's graph identity is `` `${side}:${rawValue}` `` (or
equivalent — exact key shape is `data-model.md`'s concern), where `side` is
literally `"source"` or `"target"`, **not** the raw mapped value alone. A
`tour_mode: "SOV"` row and a `trip_mode: "SOV"` row therefore always produce
two distinct nodes, never one self-referencing node.

**Rationale — this is a correction, not just an implementation detail**:
`spec.md`'s original Edge Cases/FR-009 treated `source value == target
value` as a "self-loop" to exclude before layout, per the pre-planning
request to decide (and give real reasoning for) whether that exclusion
should stay silent. Working through the actual reasoning surfaced that the
premise itself was wrong, not just under-specified:

- This panel type's two documented use cases (`docs/SPEC.md`: "Mode shift /
  tour-to-trip consistency") are both structurally **the same category
  compared across two columns** (tour mode vs. trip mode; mode before vs.
  after a shift). The "no change" row — `source == target` — is not an edge
  case for that comparison, it is plausibly its single largest category in
  real calibration output. Excluding it would silently misrepresent the
  data far worse than a mere visibility gap: the diagram would appear
  complete while actually omitting what could be the majority of trips.
- Without namespacing, this design would also break on **any** meaningful
  two-way mode shift, not just the same-value case: a row `(tour=SOV,
  trip=Transit)` and a row `(tour=Transit, trip=SOV)` — both entirely
  plausible in real data — would produce links `SOV→Transit` and
  `Transit→SOV` on a single shared `SOV` node and a single shared `Transit`
  node, a genuine 2-cycle. Confirmed directly against `d3-sankey`'s real
  source (`computeNodeDepths` in `src/sankey.js`): it detects this via an
  iteration cap (`if (++x > n) throw new Error("circular link")`) and
  throws — so the non-namespaced design would be crash-prone on realistic
  data generally, not only in the same-value case.
- Namespacing by side resolves both at once: every link flows from a
  source-side node to a target-side node by construction, which is
  structurally a bipartite DAG for this panel type's documented (two-column,
  single-hop) grammar — `docs/GRAMMAR.md` shows no chained/multi-hop sankey
  example, so there is no author-facing way to configure something deeper
  than one hop. A cyclic graph becomes unreachable through valid
  configuration, not merely unlikely.
- `d3-sankey`'s own library-level cycle detection (above) is still wired
  into the panel's error handling as a defensive backstop (FR-006), not
  relied upon as the primary correctness mechanism — belt-and-suspenders,
  consistent with how other panel types catch an unresolvable-config
  exception into the shared error state rather than assuming their own
  input validation is exhaustive.

`spec.md` (Edge Cases, FR-003, FR-009, Key Entities, Assumptions) has been
corrected to reflect this — see that file's current text, not its
pre-planning draft.

**Alternatives considered**:
- Exclude same-value rows (the spec's original premise) — rejected per the
  reasoning above: actively wrong for this panel type's stated purpose, not
  merely a style choice.
- Let same-value rows collapse into one shared node — rejected: this is the
  design that produces spurious cycles on realistic two-way-shift data,
  confirmed against `d3-sankey`'s real throw behavior above.

---

## 5. Non-positive `value` exclusion: visibility decision, with real reasoning

**Decision**: Excluded non-positive-`value` rows are surfaced via a
`console.warn` (row count + the panel's title/metric for context) — not a
silent drop, and not new on-panel UI.

**Rationale**: Unlike the same-value case (§4 — not actually excludable
data at all), a genuinely non-positive flow count is real data-quality
signal: a calibration post-processor emitting a zero or negative trip count
for a `(source, target)` pair indicates something worth an analyst's
attention (a SQL aggregation bug, an unexpected sign convention, etc.), not
an expected, large, routine category the way "no mode shift" is. Two
considered options and why each was rejected in favor of `console.warn`:
- **Fully silent** — rejected: this is exactly the "why is my diagram
  missing data" risk the pre-planning discussion flagged, and unlike §4
  there's no structural reason the data loss is actually correct/expected
  here — silence would hide a genuine anomaly.
- **New on-panel visible UI** (an "N rows excluded" note) — rejected as
  disproportionate for what should be a rare occurrence in practice (valid
  calibration output shouldn't routinely produce negative counts); adding
  permanent panel chrome for a rare anomaly-detection signal doesn't match
  this codebase's existing convention, where debugging-level signals
  (`services/duckdb.ts`'s `__debugQueryLog()`) go to the console, and
  user-facing panel chrome is reserved for states every viewer routinely
  hits (loading/empty/error).
- **`console.warn`** — chosen: matches the existing debugging-signal
  precedent, costs nothing in panel UI complexity, and is discoverable by
  whoever is actually positioned to fix the underlying data (someone with
  dev tools open debugging the post-processor output), which is the
  actual audience for "this specific query produced an invalid row," not
  the dashboard's general viewer.

**Alternatives considered**: documented above inline (silent; on-panel UI).

---

## 6. Color: `color_scheme` maps to `d3-scale-chromatic`'s named scheme exports; a genuinely new (not precedented) design-token fallback when omitted

**Decision**: A small internal name→array lookup (e.g. `{ Tableau10:
schemeTableau10, ... }`, importing directly from `d3-scale-chromatic` per
§1) resolves `color_scheme`'s string value to a concrete color array,
applied via an ordinal scale over node/link category identity. When
`color_scheme` is omitted, node/link color falls back to a small ordered
categorical palette built from 002-design-tokens' existing brand hue
tokens: `--primary` (WFRC blue), `--brand-wfrc-secondary-blue`,
`--brand-wfrc-yellow` (accent), `--brand-wfrc-gray`, in that order.

**Rationale — the feature description's stated precedent doesn't actually
exist yet; correcting that claim rather than repeating it uncritically**:
the feature description asked for this "matching how every other chart
panel type already respects the app's brand palette rather than a
library's own default colors." Checked directly against both existing
chart panels' real code before accepting that as precedent, and it's
**not accurate**: `plotlyTraces.ts` explicitly sets no `marker.color` on
split/categorical traces, with its own doc comment stating this lets
"Plotly's own default palette assign each trace a distinct color";
`observablePlotEncoding.ts` likewise sets no explicit color array for
`fill`/`stroke` — only `{legend: true}` — leaving Observable Plot's own
default categorical scheme (`d3.schemeObservable10`) in effect. The one
existing design-token-driven color logic in this codebase
(`tableLogic.ts`'s `color-mix(in srgb, var(--brand-wfrc-blue) ...)`) is a
**sequential single-hue intensity ramp** for a numeric magnitude column —
a different concept from discrete multi-category coloring, not evidence of
an established categorical-palette convention either.

So there is no existing categorical-brand-palette pattern to "match" — this
feature would be the first to actually build one. Two ways to resolve that
gap, and why the token-derived palette was chosen over just mirroring the
two existing panels' behavior:
- **Mirror existing precedent exactly** (no explicit palette; let
  `d3-scale-chromatic`'s own default categorical scheme apply when
  `color_scheme` is omitted, matching Observable Plot's actual behavior) —
  rejected: this doesn't deliver what the feature description explicitly,
  repeatedly asked for (brand-token coloring), and "no prior panel actually
  did this yet" is a gap to close, not a reason to also skip it here — the
  design-token foundation (002-design-tokens) exists specifically so chart
  panels can draw from it instead of a library default; this panel type is
  simply the first to use it for categorical color rather than the
  intensity-ramp use case `tableLogic.ts` already covers.
- **Build the small token-derived categorical palette** (chosen): `tokens.
  css` already has four visually distinct brand hues declared as CSS custom
  properties (confirmed by reading the file directly) — enough for a modest
  categorical set without inventing new colors outside the approved
  palette. This is genuinely new territory for this codebase, not a
  well-trodden pattern being copied, so it is called out here explicitly
  rather than presented as "matching existing practice."

This finding — that the "every other chart panel type" precedent claimed in
the feature description doesn't hold — is reported to the user alongside
this plan, not just noted here.

**Alternatives considered**:
- Only supporting the literal string `"Tableau10"` and erroring on anything
  else — rejected as needlessly brittle for zero documented benefit; an
  unrecognized `color_scheme` value falls through to the same token-derived
  default used when the key is omitted, rather than a hard error —
  consistent with this panel type's error-state reservation for
  structural/query problems (FR-006), not cosmetic misconfiguration.
- Mirror existing precedent exactly — rejected above.

---

## 7. Pure, DOM-free transform module boundary

**Decision**: `panels/sankeyGraph.ts` (mirroring `plotlyTraces.ts`/
`tableLogic.ts`/`observablePlotEncoding.ts`) owns the rows→graph transform
(§4's namespacing, value aggregation, non-positive-value exclusion) and the
`d3-sankey` layout call itself (`sankey()` needs no DOM — confirmed §2) —
both fully Vitest-testable without a real DOM. `SankeyPanel.tsx` owns only
the SVG construction/update from the module's output, the ResizeObserver
wiring (§3), and the loading/empty/error state wrapper — the same
component/pure-module split boundary every prior panel type already uses,
for the same reason (plotly.js-dist-min's module-load `self` reference was
the original forcing reason for `plotlyTraces.ts`; this module has no such
forcing constraint itself, but keeping the transform logic Vitest-testable
without a DOM is independently valuable per the feature description's own
instruction).

**Rationale**: Consistent with `data-model.md`'s design and this project's
established pattern; no alternative seriously considered — every prior
panel type with non-trivial logic beyond plain query+draw has used this
split.
