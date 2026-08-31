# Research: TablePanel

**Feature**: `005-table-panel` | **Date**: 2026-08-31

---

## 1. No new table library — "plain DOM" is the deciding signal

**Decision**: Hand-roll the table (`<table>` markup, plain React state for
sort/search/pagination) — no `@tanstack/react-table` or similar added.

**Rationale**: `docs/SPEC.md`'s own Panel types table already answers
this: `table | plain DOM | Sortable, paginated`. Every other row in that
same table names the actual rendering library used (`plotly` → Plotly.js,
`flowmap` → flowmap.gl + MapLibre, `graphic-walker` → Graphic Walker) —
`table`'s own row says "plain DOM," not a library name, which is either a
deliberate statement that no library is intended, or at minimum the
existing documented expectation to check against before adding one. There
is also nothing in the result set this panel type needs to handle that a
plain array actually struggles with: sort is `Array.prototype.toSorted`
with a small comparator; search is `Array.prototype.filter`; pagination is
`Array.prototype.slice`. All three operate on an already-fetched,
already-in-memory result set (FR-012) — exactly the case a table library
earns its keep for is large, server-paginated, virtualized datasets, which
this explicitly isn't (FR-012 rules out a second query per page/sort/
search by design).

**Alternatives considered**:
- *`@tanstack/react-table`* (headless, most commonly reached for in this
  ecosystem) — rejected: would be the first new UI-behavior dependency
  since `@radix-ui/react-dialog` (`004`), for functionality (client-side
  sort/filter/paginate over an in-memory array) directly expressible in a
  few small, independently-testable functions. Matches `003`'s/`004`'s own
  precedent of declining a dependency when the platform/existing tools
  already cover the need (`@testing-library/react`, `react-reverse-portal`).
- *A CSS/component library table component* (e.g. shadcn's own `Table`
  primitives, if generated) — not needed either: shadcn's `Table` is a
  thin styled-`<table>` wrapper with no sort/filter/paginate logic of its
  own; hand-authoring the same styled markup directly (matching how
  `dialog.tsx`/`tabs.tsx`/`tooltip.tsx` were all hand-authored rather than
  CLI-generated, per `002`'s and `004`'s own established note) keeps this
  consistent with how every other primitive in this repo arrived.

---

## 2. `formatValue` — extracted, not duplicated

**Decision**: Move `ValueBoxPanel.tsx`'s existing local `formatValue()`
(a small Python-style format-string parser: `{:,.0f}` / `{:.1f}` /
`{:.1%}`) into a new shared module, `panels/formatValue.ts`, exported and
imported by both `ValueBoxPanel.tsx` and the new `TablePanel.tsx` (via
`tableLogic.ts`).

**Rationale**: `docs/GRAMMAR.md`'s `columns[].format` field uses the exact
same format-string convention `ValueBoxPanelConfig.format` already uses
(`",.0f"`, `"+.1%"` — the same shapes `ValueBoxPanel.tsx`'s existing
regex already handles). Defining a second, separate copy of the same
parser inside `TablePanel.tsx`/`tableLogic.ts` would duplicate logic this
project has consistently centralized elsewhere (`panelQuery.ts` for SQL
template construction, `plotlyTraces.ts` for trace resolution) rather than
letting two panel types silently drift out of sync with each other over
time. Extracting is also a small, low-risk win in its own right: the
function was already pure and untested in isolation (only exercised
indirectly through `ValueBoxPanel.tsx`'s own rendering); moving it to its
own module makes it directly Vitest-testable, closing a small pre-existing
gap while touching it anyway.

**Alternatives considered**:
- *Leave `ValueBoxPanel.tsx`'s copy alone, write a second one for tables*
  — rejected: exactly the duplication this project avoids elsewhere; two
  copies of the same regex are two places for the same future bug fix or
  format-string extension to be applied inconsistently.

---

## 3. Column resolution, sort, search, pagination — one pure module

**Decision**: A new `panels/tableLogic.ts`, mirroring `003`'s
`plotlyTraces.ts` split (pure logic extracted from the React/DOM
component specifically so it's independently Vitest-testable, without
needing a DOM). Exports:

- `resolveColumns(config, rows): ResolvedColumn[]` — if
  `config.columns` is present, maps it 1:1 to `ResolvedColumn` (field,
  label defaulted to the raw field name when omitted, format/color_scale/
  domain passed through); if absent, derives one `ResolvedColumn` per key
  of `rows[0]`, in the order `Object.keys()` returns them (JS's own
  documented insertion-order guarantee for string keys — matches "in the
  order returned," FR-004), with no label/format/color-scale.
- `sortRows(rows, column, direction): T[]` — a comparator that compares
  numerically when both values are `typeof 'number'`, and via
  `String(...).localeCompare(...)` otherwise (spec.md's Edge Case: numeric
  columns must not sort lexicographically). Never mutates the input array
  (`.toSorted()`/a manual copy) — the caller always holds the original
  fetched order too, since search/sort/pagination all derive from the one
  `rows` state, never from each other's output destructively.
- `filterRows(rows, columns, searchTerm): T[]` — case-insensitive
  substring match against each row's *rendered* cell values (running each
  configured column's `format` through `formatValue` first, per spec.md's
  Assumption — "search what you can see"), evaluated against every row
  passed in, not a pre-paginated subset (FR-011).
- `cellColor(value, colorScale, domain): string | undefined` — the
  color-scale mapping, §4 below.

`TablePanel.tsx` itself only holds React state (`sortState`,
`searchTerm`, `currentPage`) and calls these in sequence each render:
`filterRows` → `sortRows` → `.slice()` for the current page — matching
spec.md's own stated order of operations (filter the full set, sort the
filtered subset, then paginate what's left).

**Rationale**: Same reasoning as `003`'s `plotlyTraces.ts` split
(`plotly.js-dist-min` references `self` at module load, breaking Vitest —
not applicable here, but the *shape* of the win is identical): this
feature's actual algorithmic risk — sorting numbers correctly, filtering
against rendered rather than raw values, resolving columns correctly with
and without config — is exactly the kind of logic that benefits from
direct unit tests, not indirect coverage through a rendered component.
Keeping `TablePanel.tsx` itself thin (state + wiring only) mirrors
`PlotlyPanel.tsx`'s own shape after its own extraction.

**Alternatives considered**:
- *Inline all of this directly in `TablePanel.tsx`* — rejected: would
  require Playwright (real browser) coverage for logic that has nothing
  to do with the DOM, the exact gap `003`'s `plotlyTraces.ts` precedent
  already exists to avoid repeating.

---

## 4. `color_scale`/`domain` — what they actually render as (flagged by spec.md, resolved here)

This is the one substantive open question spec.md carried into planning
rather than leaving for implementation to improvise. Checked directly
(not assumed) before deciding, per spec.md's own "Flagged for
`/speckit-plan`" note: neither `docs/CALIBRATION-SUMMARIES.md` nor
`002-design-tokens`'s actual shipped token set (`src/styles/tokens.css`)
establishes any existing sequential/diverging convention.
`docs/GRAMMAR.md`'s own `zonemap` example is the only other place
`color_scale` appears, and it names generic ColorBrewer ramps
(`YlOrRd`/`RdBu`) via a separate `color_ramp` field — a field `type:
table`'s own documented example does **not** include, meaning table's
grammar wants a single fixed ramp per scale type, not a caller-chosen
ramp name.

**Decision — reuse existing brand tokens, introduce zero new colors**:

- **Sequential** (single-hue, low→high magnitude — e.g. a raw volume or
  count column with no "direction"): a single-hue ramp from `--muted`
  (the existing light-neutral surface token) to `--brand-wfrc-blue`
  (`#023c5b`, the same blue already used for `--primary` everywhere else
  in the app). Low values read as barely tinted; high values read as a
  strong wash of the app's own primary brand color — visually
  unambiguous as "more of the thing this app already colors blue."
- **Diverging** (two-directional deviation from a meaningful center —
  e.g. `pct_error`, calibration validation's actual use case):
  `--brand-wfrc-blue` at the domain's negative extreme, `--muted` (the
  same neutral used for sequential's low end) at the midpoint, and
  `--destructive` (`#c23c33`, the app's one existing semantically-negative
  color) at the positive extreme. Zero new tokens either direction — both
  endpoints are colors the app already uses for something, and pairing
  them (existing primary blue vs. existing destructive red) reads
  correctly as "two different directions of deviation," not as two
  arbitrary new hues invented for this one feature.
- **Accepted tradeoff, noted explicitly, not an unnoticed overlap**:
  `--brand-wfrc-blue` means two different things depending on which
  column you're looking at — "high magnitude" in a sequential column,
  "below-zero deviation" in a diverging column. This is fine *within* one
  column (a reader only ever interprets one column's cells against that
  column's own `color_scale`, never comparing raw hues across two
  differently-scaled columns side by side), but is a real, deliberate
  choice, not a coincidence to leave silent: color meaning in this
  feature is always column-scoped. Reusing existing tokens (rather than
  inventing a distinct hue per scale type × direction, which would avoid
  this overlap entirely) was chosen anyway, because the alternative was
  judged worse — see "Alternatives considered" below.
- **Midpoint placement — fixed at `0`, not the domain's geometric
  center.** For a calibration/validation dashboard specifically, `0`
  (zero error, zero deviation) is the value that's actually meaningful as
  "good" — not whatever number happens to sit in the middle of a given
  `domain`. Every diverging `domain` example in `docs/GRAMMAR.md` today
  (`[-0.1, 0.1]`, `[-0.5, 0.5]`, `[-5, 5]`) happens to be symmetric around
  zero, so this choice changes nothing for any of them — but a future,
  deliberately asymmetric domain (spec.md's own edge case, e.g. `[-0.1,
  0.9]`, chosen because negative error rarely exceeds 10% while positive
  error can run much higher) should still treat `0` as "no error," not
  the geometric center of that domain (which would sit far from where
  the author actually meant "neutral" to be). This also matches how
  every real diverging-scale implementation this project would plausibly
  cross paths with actually works (e.g. d3's `scaleDiverging` takes an
  explicit midpoint parameter for exactly this reason, defaulting to the
  domain's center only when the caller supplies none) — `0` is this
  feature's explicit choice, not d3's fallback default.
- **Values outside `domain` clamp to the nearest extreme's color** —
  standard, unsurprising behavior; not extrapolated further, not left
  unstyled.
- **Interpolation is capped so text stays legible at every point on the
  scale** — implemented as a `color-mix()` blend toward the surface/
  background token at a bounded maximum strength (e.g. blending toward
  the anchor color at up to ~35–40% rather than 100%), the same CSS
  technique `tokens.css` already uses for its own dark-mode shadow tinting
  (`color-mix(in srgb, var(--foreground) 12%, transparent)`) — consistent
  with how this codebase already expresses "blend toward a token, not a
  literal hardcoded color," not a new pattern invented for this feature.
  Exact percentage is an implementation-time tuning detail (verified
  visually against real fixture data during implementation, per this
  project's established screenshot-comparison practice — `004`'s own
  merge-prep review), not a number pinned here as if it were load-bearing.

**Alternatives considered**:
- *Domain-center midpoint* (the more "mathematically obvious" choice) —
  rejected per the reasoning above: correct only by coincidence for
  every domain shown in the docs today (all symmetric), and wrong the
  moment a real dashboard author configures an asymmetric one for a
  calibration dashboard, where `0` is the actual semantic anchor.
- *Two brand-new hues, uncoupled from any existing token* — would have
  avoided the same-token-different-meaning overlap noted above entirely
  (a dedicated "high magnitude" hue distinct from a dedicated "negative
  deviation" hue). Rejected anyway: the more "designed from scratch"
  option, but exactly what the user asked to avoid ("cheap to get right
  now... easy to accidentally clash with 002's established brand palette
  if improvised later") — reusing `--brand-wfrc-blue`/`--destructive`
  costs nothing in new design surface and guarantees consistency with
  every other blue/red already on screen elsewhere in the app. The
  overlap this trades in return is judged acceptable because it's never
  actually ambiguous in use — color is always read within one column's
  own scale, never compared raw across two columns of different scale
  types.
- *A configurable `color_ramp` for table, matching zonemap's* — rejected
  as out of scope: `type: table`'s own documented grammar doesn't include
  a `color_ramp` field (unlike `zonemap`'s), so adding one would be
  inventing grammar, the same category of overreach spec.md already
  explicitly declined for "inline column expressions."

---

## 5. Testing strategy

**Decision**: Vitest for `tableLogic.ts` and `formatValue.ts` (pure
functions, no DOM) — `tests/unit/tableLogic.test.ts` covers column
resolution (with/without `columns:` config), numeric-vs-string sort
correctness, search-against-rendered-values, and the color-scale mapping
(including the fixed-`0`-midpoint decision, tested with an asymmetric
domain specifically, not only the symmetric ones `docs/GRAMMAR.md`
happens to show). Playwright for everything that renders —
`tests/integration/tablePanel.spec.ts`, extending
`dashboardShell.spec.ts`/`panelExpand.spec.ts`'s existing real-browser/
real-fixture-data pattern, including the `004` expand-dialog inheritance
check and state persistence across that round trip.

**Rationale**: Same split `003`/`004` already established and re-affirmed
each time rather than re-litigated — pure logic gets fast, direct Vitest
coverage; anything requiring a real render (including the specific claim
that this panel type inherits `004`'s mechanism for free) gets Playwright
against real fixture data, not a second, parallel component-testing
library.

---

## Summary

| # | Decision |
|---|---|
| 1 | No new table library — `docs/SPEC.md`'s "plain DOM" is taken as the deciding signal; sort/search/pagination are plain array operations over an already-fetched result set |
| 2 | `formatValue` extracted from `ValueBoxPanel.tsx` into a new shared `panels/formatValue.ts`, imported by both panel types — no duplicated format-string parser |
| 3 | New pure module `panels/tableLogic.ts` (column resolution, sort, search-filter, color mapping) — mirrors `003`'s `plotlyTraces.ts` split, keeps `TablePanel.tsx` itself thin and the algorithmic logic independently Vitest-tested |
| 4 | `color_scale` reuses existing brand tokens only (`--brand-wfrc-blue` for sequential-high and diverging-negative, `--destructive` for diverging-positive, `--muted` for both scales' neutral/low end) — zero new colors; diverging midpoint is fixed at `0`, not the domain's geometric center; cell backgrounds use a capped `color-mix()` blend so text stays legible at every point on the scale |
| 5 | Vitest for `tableLogic.ts`/`formatValue.ts`; Playwright for `tablePanel.spec.ts` (including `004` expand-inheritance + state-persistence checks) — no new testing library |
