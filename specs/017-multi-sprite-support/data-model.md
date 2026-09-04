# Phase 1 Data Model: Multi-sprite support in composeStyles()

No new persisted data entities, Parquet columns, or YAML grammar
fields — this is an in-memory transform inside `composeStyles()`'s
existing return value (a `StyleSpecification`), not a new data shape
the rest of the app needs to know about. `FlowMapPanel.tsx`/
`ZoneMapPanel.tsx` hand the result straight to `map.setStyle()`/the
`Map` constructor unchanged — MapLibre itself is the only consumer of
the shape change described below.

## Entities (from spec.md, reconciled to concrete TypeScript shapes)

### Composed sprite

Spec's own description: "One composed layer's own sprite sheet ...
now preserved and individually addressable within a composed style,
keyed by that layer's own identity."

Concrete shape — a new, function-local array, never exposed outside
`composeStyles()`:

```ts
type SpriteEntry = { id: string; url: string }
```

- `id`: `` `layer${i}` `` — `i` is the same per-layer loop index this
  function already uses for its existing `` `layer${i}__` `` source/
  layer prefix (research.md §2/§4) — a distinct namespace (MapLibre's
  own `:` separator, not `__`), not a new numbering scheme.
- `url`: the layer's own `sprite` field, resolved to an absolute URL
  exactly the way `sprite`/`glyphs` are already resolved today
  (`resolveUrlPreservingTemplateTokens(raw.sprite, layerUrl)`) — no
  change to that resolution step, only to what happens with the
  result afterward (collected into an array entry instead of a
  conditionally-assigned single string).

Collected into `merged.sprite: SpriteEntry[]` — MapLibre's own real,
installed `SpriteSpecification` array form — whenever at least one
composed layer declares a `sprite`, including the single-layer case
(research.md §2). `merged.sprite` stays `undefined` when zero composed
layers declare one, identical to today.

### Icon reference

Spec's own description: "A symbol layer's own `icon-image` value, now
resolved against its specific originating composed layer's sprite."

Concrete transform, applied inside the existing `rewrittenLayers`
`.map()`:

```ts
// Before (as fetched, real example — LiteLabels layer "Labels/Roads -
// Interstates and Ramps - white version/label/Interstates"):
layout: { 'icon-image': 'Labels/Roads - Interstates and Ramps - white version/Interstates' }

// After (this layer's own spriteId is "layer1" — it's the second
// composed layer, i === 1):
layout: { 'icon-image': 'layer1:Labels/Roads - Interstates and Ramps - white version/Interstates' }
```

- Only rewritten when `layout['icon-image']` is present AND
  `typeof layout['icon-image'] === 'string'` (confirmed the only real
  case, research.md §1).
- Every other `layout` field is passed through unchanged — this is a
  single-key rewrite, not a general layout transform.
- A layer with no `layout`, or a `layout` with no `icon-image` key, is
  untouched — most real layers (`fill`, `line`, non-icon `symbol`
  layers) fall here, same as today.
- The non-literal (expression) case — confirmed to not exist in any
  real composed layer today — is handled per research.md §1's decision:
  `console.warn`, leave that one layer's `icon-image` untouched. Exercised
  only by a synthetic unit-test fixture (no real data has this shape).

## Key entities *(feature spec's own section, reconciled)*

The feature spec's Key Entities section names "Composed sprite" and
"Icon reference" — both map directly to the two shapes above; no
entity beyond what's already described is required to satisfy any
functional requirement in `spec.md`.
