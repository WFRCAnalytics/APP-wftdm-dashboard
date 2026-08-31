# Contract: `panels/tableLogic.ts` and `panels/formatValue.ts`

Satisfies: FR-003 through FR-012. The pure-logic layer this feature's
Vitest coverage targets directly — see research.md §2/§3/§4 for the full
reasoning behind each decision reflected here.

## `panels/formatValue.ts`

```ts
/** Extracted verbatim from ValueBoxPanel.tsx's existing local function —
 * same Python-style format-string support: {:,.0f} / {:.1f} / {:.1%}.
 * Non-numeric values are stringified as-is, ignoring the format string. */
export function formatValue(value: unknown, format: string): string
```

## `panels/tableLogic.ts`

```ts
export interface ResolvedColumn {
  field: string
  label: string
  format?: string
  colorScale?: 'sequential' | 'diverging'
  domain?: [number, number]
}

/** columns: config present -> map 1:1 (label defaults to field).
 *  columns: config absent  -> derive one column per key of rows[0],
 *  in Object.keys() order, no label/format/color-scale. */
export function resolveColumns(
  config: TablePanelConfig,
  rows: Record<string, unknown>[],
): ResolvedColumn[]

/** Case-insensitive substring match against each row's *rendered* value
 * per column (running format through formatValue first) — evaluated
 * against every row passed in, not a pre-paginated subset. */
export function filterRows<T extends Record<string, unknown>>(
  rows: T[],
  columns: ResolvedColumn[],
  searchTerm: string,
): T[]

/** Numeric comparison when both values are `typeof 'number'`, else
 * locale-aware string comparison. Never mutates `rows`. */
export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  column: string,
  direction: 'asc' | 'desc',
): T[]

/** Returns a CSS color string (a color-mix() expression against the
 * existing brand tokens — research.md §4) for a cell's background, or
 * undefined when colorScale/domain aren't both present. Diverging scales
 * anchor their midpoint at literal 0, not the domain's geometric center.
 * Values outside domain clamp to the nearest extreme's color. */
export function cellColor(
  value: unknown,
  colorScale: 'sequential' | 'diverging' | undefined,
  domain: [number, number] | undefined,
): string | undefined
```

## Given/When/Then

- **Given** a `TablePanelConfig` with a `columns:` list, **when**
  `resolveColumns` runs, **then** the returned array has exactly one
  entry per configured column, in that order, each `label` defaulted to
  `field` when the config omitted it (FR-003).
- **Given** a `TablePanelConfig` with no `columns:` list, **when**
  `resolveColumns` runs against a non-empty `rows` array, **then** the
  returned columns match `rows[0]`'s own keys, in their natural order,
  each with no `format`/`colorScale`/`domain` (FR-004).
- **Given** a numeric column (e.g. `pct_error: -0.12`), **when**
  `sortRows` sorts by it, **then** rows order numerically (`-5` before
  `-0.12` before `0.3`), never lexicographically (`-5` after `-0.12` as
  strings would).
- **Given** a search term and a column with a configured `format`,
  **when** `filterRows` runs, **then** the match is evaluated against the
  *formatted* value (e.g. searching `"12%"` matches a cell whose raw value
  is `0.12` formatted as `"12.0%"`), not the raw underlying number.
- **Given** a diverging `color_scale` with an asymmetric `domain` (e.g.
  `[-0.1, 0.9]`), **when** `cellColor` evaluates a value of exactly `0`,
  **then** it returns the fixed neutral midpoint color — not whatever
  color would sit at that domain's geometric center (`0.4`) — confirming
  research.md §4's decision is actually implemented, not merely written
  down.
- **Given** a value outside a configured `domain`, **when** `cellColor`
  evaluates it, **then** it returns the color at the nearest domain
  extreme, not an extrapolated or unstyled result.

## Non-goals for this feature

- No `color_ramp` selection (`type: table`'s own documented grammar
  doesn't include one, unlike `zonemap`'s — research.md §4).
- No "inline column expressions" support — no defined syntax exists
  anywhere in the docs to implement against (spec.md's Assumptions).
