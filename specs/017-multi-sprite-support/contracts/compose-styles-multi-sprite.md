# Contract: `composeStyles()` multi-sprite output

`composeStyles()`'s existing signature and general contract (per
`011-basemap-style-system`'s own `contracts/load-basemap-style.md`)
are unchanged — same inputs (`layerUrls: string[]`, optional
`AbortSignal`), same `Promise<StyleSpecification>` return shape, same
fetch-per-layer/namespace-per-layer/fail-the-whole-composition-on-any-
layer-failure behavior. This contract covers only the two fields this
feature changes: `sprite` and every symbol layer's `layout['icon-image']`.

## `sprite`

| Composed layers declaring a sprite | Before this feature | After this feature |
|---|---|---|
| 0 | `undefined` | `undefined` — unchanged |
| 1 | `"<resolved absolute url>"` (plain string) | `[{ id: "layer<i>", url: "<resolved absolute url>" }]` — **shape changes even in this case** (research.md §2 — no single-sprite fast path) |
| 2+ | first layer's own `"<resolved absolute url>"`; every other composed layer's own sprite silently discarded | `[{ id: "layer0", url: "..." }, { id: "layer1", url: "..." }, ...]` — one entry per composed layer that declares a sprite, in composition order |

`id` is always `` `layer${i}` `` where `i` is that layer's own index in
the `layerUrls` array passed to `composeStyles()` — the same index the
function's existing `` `layer${i}__` `` source/layer prefix already
uses (a related, not identical, namespace — see research.md §2/§4).
No sprite is ever assigned MapLibre's special `"default"` id.

## `layout['icon-image']` (every symbol layer)

| Original value | Rewritten value |
|---|---|
| Literal string, e.g. `"Interstates"`, from the layer at index `i` | `` `layer${i}:Interstates` `` — always prefixed, even when that layer is the ONLY sprite-declaring layer in the composition (FR-004 — no exemption) |
| A style *expression* (not a literal string) | Left untouched; a `console.warn` naming the layer id and source composition URL is emitted. Confirmed to not occur in any real, currently-composed layer (research.md §1) — this row exists for a hypothetical future case, not a known one. |
| No `icon-image` key present, or no `layout` at all | Untouched — most layers (`fill`, `line`, non-icon `symbol`) |

## Guarantees this contract must uphold (from spec.md)

- **FR-001/FR-002**: every composed layer's own declared sprite is
  preserved and its own icons are resolvable — not just the first.
- **FR-003**: a composition with 0 or 1 sprite-declaring layers renders
  its icons identically to before this feature — the *rendered* icon,
  not the *reference string* (which is explicitly allowed, and
  expected, to change per FR-004 even in the 1-sprite case).
- **FR-004**: the rewrite mechanism is the SAME code path regardless of
  sprite count — no `if (spriteEntries.length > 1)` branch gating
  whether the rewrite happens at all.
- **FR-005**: a non-literal `icon-image` is never silently left
  unresolved without at least a console signal naming it.
- **FR-006**: nothing in this mechanism references a panel title, a
  specific UGRC service name, or any other fact specific to the two
  currently-broken panels — it operates purely on the generic shape of
  whatever `layerUrls` composeStyles() is given.
