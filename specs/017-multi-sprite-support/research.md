# Phase 0 Research: Multi-sprite support in composeStyles()

## §1. The open question — resolved, exhaustively, against every real composed service

The feature description carried forward one explicit open question:
does any real, currently-composed layer's `icon-image` value use a
style *expression* rather than a literal string? A literal string can
be fixed with a straightforward prefix rewrite; an expression cannot
be string-prefixed the same way.

Every real service this app currently composes (`tests/fixtures/
dashboard-config/dashboard-3-basemaps.yaml`'s three real compositions)
was fetched directly and every `symbol`-type layer with an
`icon-image` layout property was inspected for its value's JS `typeof`:

| Service | Composition(s) it's used in | Symbol layers w/ `icon-image` | Non-literal (`typeof !== 'string'`) |
|---|---|---|---|
| `LiteBase` | Flowmap UGRC Composition | 10 | **0** |
| `LiteLabels` | Flowmap UGRC Composition | 7 | **0** |
| `OutdoorsBase` | Flowmap UGRC Outdoors Composition | 9 | **0** |
| `Outdoors_Labels` | Flowmap UGRC Outdoors Composition | 3 | **0** |
| `Vector_Overlay` | Flowmap UGRC Vector Hybrid | 10 | **0** |

**39 symbol layers with `icon-image` across all 5 real services — zero
use anything but a literal string.** (`Esri.WorldImagery`, the sixth
real layer used in the Vector Hybrid composition, is a raster
provider — it declares no `sprite`/symbol layers of its own at all,
consistent with every raster-provider branch already in
`composeStyles()`.)

**Decision (FR-005)**: implement the rewrite for the literal-string
case only — the only case that exists today, confirmed exhaustively,
not assumed. For the hypothetical case of a *future* composed layer
whose `icon-image` is an expression: rewrite it defensively but
visibly — `console.warn` naming the specific layer id and composition
url, and leave that one layer's `icon-image` value untouched (not
attempt a partial/best-effort rewrite into the expression tree). This
matches two things already established in this codebase: (1) the
project's own general convention of a scoped `console.warn` for a
narrow, non-fatal exclusion rather than silently doing nothing (e.g.
`FlowMapPanel.tsx`'s "excluded N row(s)" warning); (2) FR-005's own
explicit requirement to never silently skip. It is NOT a silent
no-op — a real signal reaches the console — and it does not abort the
whole composition (an unrewritten icon reference behaves exactly as
today's pre-fix code already does for every icon: MapLibre's own
`styleimagemissing` handling, unaffected either way). No unit test can
exercise this branch against real data (none exists), so its own test
uses a synthetic fixture — see `data-model.md`.

## §2. Design decision — always the array form, always prefixed, no `"default"` id

Confirmed directly against MapLibre's own real, installed behavior
(`@maplibre/maplibre-gl-style-spec`'s type `SpriteSpecification =
string | {id: string; url: string}[]`, and the runtime bundle's own
icon lookup: `` "default"===e?a:`${e}:${a}` ``): the colon-prefix
lookup mechanism applies **only** when `sprite` is in its array form —
a plain string `sprite` has no `id` concept at all, so a colon-prefixed
`icon-image` value would not resolve against it (it would be looked up
as a literal, wrong name).

This settles a real design fork explicitly raised in the spec's own
Assumptions/FR-004: whether to use the array form only when more than
one sprite exists (branching), or always. **Always** is the only
choice that satisfies FR-004's own explicit requirement — "no
special-cased skip... one or several" — since using a plain string for
the single-sprite case would force skipping the prefix rewrite too (a
plain string sprite has no id to prefix against), recreating exactly
the two-divergent-code-paths risk FR-004 rules out by name. Confirmed
concretely: `merged.sprite` becomes `[{id, url}, ...]` whenever at
least one composed layer declares a sprite — including the count-1
case — and stays `undefined` when zero do (unchanged from today,
correctly out of scope — nothing to collect, nothing to rewrite,
identical behavior).

The **sprite `id` string** reuses this function's own existing
per-layer `i` (its loop index — the same value the source/layer prefix
`` `layer${i}__` `` already comes from) but as `` `layer${i}` `` (no
trailing `__`) — a distinct namespace serving a distinct purpose
(MapLibre's own sprite-id separator is `:`, not `__`), while staying
recognizably paired with the existing source/layer numbering rather
than inventing an unrelated third convention.

**No `"default"` id is ever assigned.** Per the spec's own Assumptions
section: uniform prefixing on every layer avoids designating any one
composed layer's sprite as special, which would reintroduce exactly
the "is this the first/special one" asymmetry this whole feature
exists to remove. Confirmed harmless: MapLibre's `"default"` handling
is purely a *convenience* (omit the prefix for one designated sprite)
— not using it costs nothing but a few characters per icon-image
string; every icon still resolves correctly with an explicit prefix.

## §3. Confirmed: Playwright/SwiftShader reproduces this fix, no real hardware needed

Unlike `016-fix-ugrc-dark-mode`'s own GPU-color-management-dependent
defect, sprite/icon resolution is a **data-lookup process**, not a
rendering/color one: MapLibre fetches each declared sprite's own
`.json` index (a real HTTP request, works identically headless or not)
and a symbol layer's `icon-image` name is matched against that index's
own keys — the outcome ("found" vs. `styleimagemissing`) is determined
entirely by string matching against already-fetched JSON, with no GPU
rendering step involved in the determination itself. This is why
`016`'s defect never reproduced under SwiftShader (a genuine GPU
color-management interaction) while this one is expected to reproduce
identically.

Confirmed further: MapLibre's own public API includes `hasImage(id:
string): boolean` and `listImages(): Array<string>` (confirmed present
in the installed `maplibre-gl` package's real `.d.ts`, not assumed) —
a precise, data-level, fully automatable assertion (`map.hasImage(
'layer1:Labels/Roads - Interstates and Ramps - white version/
Interstates')` → `true`) that needs no screenshot or pixel inspection.
This is the mechanism `quickstart.md`/`tasks.md`'s own test tasks use
to satisfy FR-007/SC-004 without a human real-hardware verification
step.

## §4. Where exactly this fix lives in the existing function

Read directly (not assumed) — `composeStyles()`'s existing per-layer
loop already computes everything the fix needs, at exactly the right
point:

- The existing `prefix` variable (`` `layer${i}__` ``) is computed once
  per loop iteration, before both the existing source/layer rewriting
  and the existing (to-be-replaced) sprite/glyphs block. The new sprite
  `id` (`` `layer${i}` ``) is one character-substring away from this
  same value — no new loop-index bookkeeping needed.
- The existing `rewrittenLayers` `.map()` (which already rewrites each
  layer's own `id`/`source`) is the natural, single place to also
  rewrite `layout['icon-image']` when present — one pass, not two.
- The existing `if (!merged.sprite && typeof raw.sprite === 'string')`
  block is replaced with unconditional collection into a new
  `spriteEntries: {id: string; url: string}[]` array (declared once,
  outside the loop, alongside `merged`), assigned to `merged.sprite`
  after the loop completes (mirroring how `merged.sources`/
  `merged.layers` are already built incrementally and used as-is,
  not reassigned to a different shape at the end).
