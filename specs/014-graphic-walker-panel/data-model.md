# Data Model: Graphic Walker Exploration Panel

Phase 1 output for `014-graphic-walker-panel`.

## `GraphicWalkerPanelConfig` (`src/layout/types.ts`)

```ts
/**
 * The ninth panel type, and the last originally-listed one —
 * 014-graphic-walker-panel. Extends PanelConfigBase directly, NOT
 * DataBoundPanelConfigBase — project-docs/GRAMMAR.md's type: graphic-walker
 * grammar has no `metric:` key at all (its dataset-binding key is named
 * `dataset`, a different name with the same role), the same structural
 * reason MarkdownPanelConfig also extends PanelConfigBase directly
 * (research.md §1). scenario/fields are this feature's own additions,
 * beyond project-docs/GRAMMAR.md's documented example, both optional and both
 * reusing this project's existing config vocabulary rather than
 * inventing new syntax (spec.md FR-004/FR-007).
 */
export interface GraphicWalkerFieldOverride {
  fid: string
  name?: string
  semanticType: 'quantitative' | 'nominal' | 'ordinal' | 'temporal'
  analyticType: 'dimension' | 'measure'
}

export interface GraphicWalkerPanelConfig extends PanelConfigBase {
  type: 'graphic-walker'
  dataset: string
  limit?: number // default 100000, per project-docs/GRAMMAR.md's own example
  scenario?: string // optional — pins to one scenario's view; omit for
  // the existing multi-scenario $scenario. union (research.md §6)
  fields?: GraphicWalkerFieldOverride[] // optional — overrides specific
  // inferred fields by `fid` (research.md §5)
}
```

`type PanelConfig` (the existing discriminated union) gains
`| GraphicWalkerPanelConfig`. This type does **not** implement
`MapRenderingPanelConfig` — no basemap concept applies to a non-map
panel type; `isMapRenderingPanel()`'s existing `flowmap`/`zonemap` check
is unaffected.

## `IMutField` (library type, not authored here)

The `@kanaries/graphic-walker` package's own required `fields` input
shape (research.md §5) — referenced, not redefined, by this feature's
own code:

```ts
interface IMutField {
  fid: string
  name: string
  semanticType: 'quantitative' | 'nominal' | 'ordinal' | 'temporal'
  analyticType: 'dimension' | 'measure'
}
```

## Field inference (`panels/graphicWalkerFields.ts`, new, pure)

```ts
/** Derives one IMutField per Arrow schema field, using apache-arrow's own
 * DataType predicates (research.md §5's mapping table), then applies any
 * config.fields override (matched by fid) wholesale — no partial merge,
 * same convention TableColumnConfig's own override list already uses. */
export function inferFields(
  schemaFields: ArrowField[], // apache-arrow's own Field[] (Table.schema.fields)
  overrides?: GraphicWalkerFieldOverride[],
): IMutField[]
```

Pure, DOM-free, no I/O — same split-out-for-testability reason
`plotlyTraces.ts`/`sankeyGraph.ts`/`zonemapColor.ts` all already exist
for their own panel types.

## Query construction (`panels/panelQuery.ts`, extended)

```ts
/** Builds the bare SQL template for a graphic-walker panel's one-time
 * snapshot query — a $scenario.<dataset> placeholder (or a literal
 * "<scenario>__<dataset>" view when config.scenario pins one), handed to
 * the existing, unmodified sqlExpander.expand() (research.md §6). No
 * $filters./$inputs. placeholder is ever emitted — this panel type does
 * not participate in global filter reactivity (spec.md FR-005). */
export function buildGraphicWalkerQuery(config: GraphicWalkerPanelConfig): string
```

## Component state (`panels/GraphicWalkerPanel.tsx`, new)

Mirrors every other data-bound panel type's own `status` state machine
(`TablePanel.tsx`'s `'loading' | 'ready' | 'empty' | 'error'`), but the
query effect runs **once per `(dataset, scenario, limit)` triple** —
never on filter change (there is no `useFilterState` call in this
component at all, FR-005) and never on `useActiveScenarios()` change
*unless* `config.scenario` is unset (only the multi-scenario union case
is scenario-set-reactive; a pinned `scenario:` is a fixed, one-time
target regardless of what else loads afterward — consistent with the
"snapshot, not live" framing, and avoiding a surprise re-query/reset of a
viewer's in-progress chart the moment they load a second scenario
elsewhere in the app).

```ts
type Status = 'loading' | 'ready' | 'empty' | 'error'

interface GraphicWalkerPanelState {
  status: Status
  rows: Record<string, unknown>[]
  fields: IMutField[] // computed once, alongside rows, from the same
  // queryArrow() call's schema (research.md §5) — never recomputed on
  // any later re-render
}
```

No chart/encoding state is held by this component or persisted anywhere
— that state lives entirely inside the mounted `<GraphicWalker>`
instance's own internal (library-owned, MobX-backed) state, matching
spec.md's Key Entity "Viewer-Built Chart" (ephemeral, in-browser-only,
never written back). Rendered as ordinary JSX inside this component's
own tree (research.md §3, post-completion correction) — not via
`embedGraphicWalker`'s imperative DOM-mount API, which was found to
create an undisposable, independent React root.

## Key Entities (from spec.md, made concrete)

- **Explore Dataset Binding** → `GraphicWalkerPanelConfig`'s own
  `dataset`/`scenario`/`limit` fields, resolved once by
  `buildGraphicWalkerQuery()` into a single SQL string.
- **Inferred Field Schema** → `inferFields()`'s return value
  (`IMutField[]`), computed once from the same `queryArrow()` call's
  Arrow schema that produces `rows`, with `config.fields` overrides
  applied.
- **Viewer-Built Chart** → not a data model this app defines at all —
  lives entirely inside the mounted third-party library instance, never
  read back into this app's own state.
