// Typed dashboard-*.yaml parsing — services/yamlLoader.ts's DashboardConfig
// keeps `raw: unknown` (a deliberate 001 decision; that service never
// needed to know dashboard-content shape). This feature is the first
// consumer that does, so the typed seam lives here, at the point of use,
// not in yamlLoader.ts itself. See contracts/dashboard-config-types.md.

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
  // scenario (singular): restrict to exactly one named scenario view,
  // bypassing the $scenario.x union entirely. scenarios (plural):
  // override which subset of the globally-active scenarios this panel
  // unions over (still uses $scenario.x). Both real, distinct, documented
  // grammar (docs/GRAMMAR.md) — resolution behavior for each lives in
  // panels/panelQuery.ts, not here (this file is parsing only).
  scenario?: string
  scenarios?: string[]
}

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

/** One entry in a `table` panel's `columns:` list (docs/GRAMMAR.md).
 * 005-table-panel, data-model.md's TableColumnConfig. */
export interface TableColumnConfig {
  field: string
  label?: string
  format?: string
  color_scale?: 'sequential' | 'diverging'
  domain?: [number, number]
}

export interface TablePanelConfig extends PanelConfigBase {
  type: 'table'
  columns?: TableColumnConfig[]
  sort?: { column: string; order: 'asc' | 'desc' }
  pagination?: number
  searchable?: boolean
}

/**
 * Any other panel type (flowmap, zonemap, sankey, graphic-walker,
 * markdown — all out of scope for this feature, still deferred per
 * 005-table-panel's own stated boundary) still parses as this base shape
 * rather than being dropped or erroring at parse time — the registry
 * lookup (panels/registry.tsx), not the parser, is what surfaces an
 * unrecognized-type error, keeping "parse" and "renderable-by-this-app"
 * as separate concerns.
 */
export interface UnknownPanelConfig extends PanelConfigBase {
  type: string
}

export type PanelConfig =
  | ValueBoxPanelConfig
  | PlotlyPanelConfig
  | TablePanelConfig
  | UnknownPanelConfig

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
export function parseDashboardConfig(raw: unknown, sourcePath = '(unknown source)'): DashboardTabConfig {
  const obj = (raw ?? {}) as Record<string, unknown>
  const header = (obj.header ?? {}) as Record<string, unknown>

  if (typeof header.tab !== 'string' || header.tab.length === 0) {
    throw new Error(`parseDashboardConfig: "${sourcePath}" is missing required header.tab`)
  }
  if (typeof header.title !== 'string' || header.title.length === 0) {
    throw new Error(`parseDashboardConfig: "${sourcePath}" is missing required header.title`)
  }

  return {
    header: {
      tab: header.tab,
      title: header.title,
      description: typeof header.description === 'string' ? header.description : undefined,
    },
    filters: Array.isArray(obj.filters) ? (obj.filters as FilterDefinition[]) : [],
    layout:
      obj.layout && typeof obj.layout === 'object'
        ? (obj.layout as Record<string, PanelConfig[]>)
        : {},
  }
}
