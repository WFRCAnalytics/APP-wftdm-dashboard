> **SUPERSEDED — kept for historical record, not implemented.** Branch A
> (`color-scheme`) was implemented per this contract, then confirmed
> RULED OUT across three separate real-hardware tests — it applied
> correctly (`getComputedStyle`) and did not fix either panel. The
> actual root cause and shipped fix (a missing `background` layer in
> `composeStyles()`'s own output) is unrelated to this contract's own
> mechanism entirely. See `research.md` §7 (the withdrawal) and §8 (the
> real fix), and `diagnostic-results.md` for the full evidence trail.
> This file is preserved, not deleted, per this project's own
> established convention for a superseded artifact (matching the
> constitution's own superseded-amendment history) — it has real future
> value if a `color-scheme`-shaped hypothesis is ever worth
> re-examining, even though it wasn't this bug's cause.

# Contract: Map canvas `color-scheme` scope (Branch A — only if research.md §5 step 1 confirms)

Applies only if the Diagnostic Protocol (`diagnostic-protocol.md`)
resolves to `branch-a-scoped-css`. Not implemented speculatively —
`tasks.md` gates this behind that outcome. This is now the expected
leading branch (research.md §3a/§5) — the extension explanation is
already ruled out this session, and the two remaining external-
mechanism candidates each carry a known explanatory gap, so this is the
first hypothesis actually tested in an environment capable of showing
the defect at all (research.md §2).

## Interface

A CSS rule added to `src/panels/mapControls.css` (already imported,
unconditionally, by both `FlowMapPanel.tsx` and `ZoneMapPanel.tsx` — no
new import needed):

```css
/* 016-fix-ugrc-dark-mode: scoped color-scheme override for MapLibre's
   own canvas — see specs/016-fix-ugrc-dark-mode/research.md §6/§7 for
   the confirmed causation test this depends on. Deliberately scoped to
   MapLibre's own canvas class, not global — tokens.css's `:root`/`.dark`
   color-scheme declarations (015-theme-toggle) MUST remain untouched
   everywhere else, since native <select>/form-control dark styling
   still depends on them (FR-005). */
.maplibregl-canvas {
  color-scheme: light;
}
```

- **Selector**: `.maplibregl-canvas` — MapLibre's own, library-applied
  class on the `<canvas>` element it creates internally (confirmed via
  `FlowMapPanel.tsx`'s own comment referencing `maplibregl-map`/
  `maplibregl-canvas` as library-owned classes, same convention every
  other `mapControls.css` rule already targets). This is deliberately
  **general** across every map panel (FR-010) — not scoped by panel
  title or basemap composition identity, so any future composition with
  the same sensitivity is covered automatically, with zero new
  configuration.
- **Value**: `light` — chosen over removing the property entirely
  (`normal`/unset), since research.md §5 step 1's own sub-step 1 already
  confirms `color-scheme` absent produces correct rendering, and `light` is the
  more explicit, intentional statement of "this element's own rendering
  should not follow dark-mode-driven color adjustment" — matching how
  `tokens.css`'s own `:root` declares `color-scheme: light;` explicitly
  rather than leaving it unset.
- **Cascade**: `.maplibregl-canvas` (a class selector, specificity 0,1,0)
  needs no `!important` — it is not competing with `:root`/`.dark`
  (both target the `<html>` element, specificity 0,1,0 there too, but
  `color-scheme` does not cascade by "closest ancestor wins" the way
  most properties do inside a single specificity tier the normal way;
  it's an ordinary inherited property, so the canvas's own explicit
  declaration simply wins by proximity in the ordinary way any
  directly-targeted element overrides an inherited value). If real-
  hardware testing (`quickstart.md` Scenario 2) shows this doesn't take
  effect, `!important` is the established fallback pattern this file
  already uses elsewhere (the 3D-toggle/NavigationControl rules) for a
  genuine specificity conflict with MapLibre's own default stylesheet —
  add it only if actually needed, confirmed on real hardware, not
  preemptively.

## Guarantees this contract must uphold (from spec.md)

- **FR-005**: `tokens.css`'s `:root`/`.dark` `color-scheme` declarations
  are NOT modified or removed by this branch — only a new, additional,
  narrowly-scoped rule is added elsewhere.
- **FR-006**: no change to panel card/heading/NavigationControl styling —
  this rule touches only the canvas element's own `color-scheme`, no
  other property, no other selector.
- **FR-010**: general across every current and future map panel via a
  library-owned class selector, not a per-panel-title exception.
- **SC-004 / User Story 2**: verified by re-running the existing
  NavigationControl/3D-toggle dark-mode regression assertions in
  `flowmapPanel.spec.ts`/`zonemapPanel.spec.ts` unchanged — those assert
  computed styles on elements this rule does not target, so they should
  need no edits, only confirmation they still pass.
