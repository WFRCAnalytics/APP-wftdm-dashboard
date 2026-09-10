# Contract: Typed dashboard-config parsing (`src/layout/types.ts`)

Satisfies: FR-001. Depends on `services/yamlLoader.ts`'s existing
`DashboardConfig` (`{ raw: unknown; sourcePath: string }`) — unchanged by
this feature.

## Signature

```ts
export interface FilterDefinition {
  id: string
  label: string
  type: 'select' | 'multiselect' | 'range'
  source: string
  column: string
  default: string
  all_option?: boolean
}

export interface PanelConfigBase {
  title: string
  metric: string
  filter?: string
  height?: number
  width?: number
  scenario?: string
  scenarios?: string[]
}
// scenario (singular): restrict to exactly one named scenario view,
// bypassing the $scenario.x union entirely. scenarios (plural): override
// which subset of the globally-active scenarios this panel unions over
// (still uses $scenario.x). Both real, distinct, documented grammar
// (project-docs/GRAMMAR.md) — resolution behavior for each lives in
// contracts/panel-query.md, not here (this file is parsing only).

export interface ValueBoxPanelConfig extends PanelConfigBase {
  type: 'valuebox'
  column: string
  format: string
  unit?: string
  icon?: string
  observed?: number
  threshold_warn?: number
  threshold_fail?: number
}

export interface PlotlyTraceConfig {
  type: string
  x?: string
  y?: string
  color?: string
  mode?: string
  name?: string
  text?: string
  barmode?: string
}

export interface PlotlyPanelConfig extends PanelConfigBase {
  type: 'plotly'
  traces: PlotlyTraceConfig[]
  layout?: Record<string, unknown>
  observed?: { source: string; style?: string } & Record<string, unknown>
  reference_lines?: unknown[]
}

export type PanelConfig = ValueBoxPanelConfig | PlotlyPanelConfig

export interface DashboardTabConfig {
  header: { tab: string; title: string; description?: string }
  filters: FilterDefinition[]
  layout: Record<string, PanelConfig[]>
}

/**
 * Parses one dashboard-*.yaml's raw content into a typed
 * DashboardTabConfig. Throws a descriptive Error (never returns a
 * partially-typed value) if header.tab or header.title is missing —
 * every other field defaults safely.
 */
export function parseDashboardConfig(raw: unknown): DashboardTabConfig
```

## Given/When/Then

- **Given** a well-formed `dashboard-*.yaml`'s parsed `raw` value, **when**
  `parseDashboardConfig` runs, **then** it returns a `DashboardTabConfig`
  with `header`/`filters`/`layout` populated per `project-docs/GRAMMAR.md`'s
  documented shape.
- **Given** a `raw` value missing `header.tab` or `header.title`, **when**
  `parseDashboardConfig` runs, **then** it throws an `Error` naming which
  field is missing and from which file (caller supplies `sourcePath` for
  the message) — never silently defaults a tab's own identity.
- **Given** a `raw` value with no `filters` key, **when** parsed, **then**
  `filters` is `[]`, not `undefined` — every consumer can iterate it
  unconditionally.
- **Given** a panel entry whose `type` is not `'valuebox'` or `'plotly'`,
  **when** parsed, **then** it still parses as a `PanelConfigBase`-shaped
  object with an unrecognized `type` string (not dropped, not an error at
  parse time) — the *registry* lookup, not the parser, is what surfaces an
  unrecognized-type error (contracts/panel-registry.md), keeping the two
  concerns (parsing vs. rendering-availability) separate.

## Non-goals for this feature

- No runtime schema validation library (zod, ajv, etc.) — research.md §4.
- No typed parsing of the other seven panel types' fields (`table`,
  `flowmap`, etc.) — only enough of `PanelConfigBase` for those configs to
  parse as *something*, per the Given/When/Then above; their full typed
  shape is a future feature's concern when that panel type is built.
- No UI for editing/authoring `filters` — `FilterDefinition` is parsed and
  usable via `$filters.x`, but no filter-control component is part of this
  feature's scope (spec.md's stories don't require one).
