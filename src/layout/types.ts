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

// Fields every panel type needs, regardless of whether it queries
// anything. 006-markdown-panel, research.md §1: split out of what used to
// be a single PanelConfigBase requiring `metric` on every panel type —
// markdown is the first panel type with no query at all, and forcing a
// required-in-spirit `metric` field on a type that structurally can't use
// it was judged a modeling smell independent of how many query-less types
// exist (data-model.md).
export interface PanelConfigBase {
  title: string
  height?: number
  width?: number
}

// Fields only a *querying* panel type needs. Everything that reads
// services/duckdb.ts extends this, not PanelConfigBase directly
// (006-markdown-panel, research.md §1).
export interface DataBoundPanelConfigBase extends PanelConfigBase {
  metric: string
  // Two documented forms (docs/GRAMMAR.md's common-keys table: "filter:
  // <inline | $ref>"), not a bolt-on for this feature — valuebox/plotly/
  // table only ever exercised the bare $ref string form until
  // 007-observable-plot-panel, whose own filter: examples are the first to
  // use the inline map form (a column name -> $filters.<id>/$inputs.<id>
  // placeholder string, letting one panel bind more than one column, and
  // letting a column's bound placeholder differ from its own name).
  // buildPanelQuery (panelQuery.ts) normalizes both shapes; it never
  // inspects which placeholder kind a given value is — sqlExpander.ts does
  // that (007-observable-plot-panel, research.md §1).
  filter?: string | Record<string, string>
  // scenario (singular): restrict to exactly one named scenario view,
  // bypassing the $scenario.x union entirely. scenarios (plural):
  // override which subset of the globally-active scenarios this panel
  // unions over (still uses $scenario.x). Both real, distinct, documented
  // grammar (docs/GRAMMAR.md) — resolution behavior for each lives in
  // panels/panelQuery.ts, not here (this file is parsing only).
  scenario?: string
  scenarios?: string[]
}

export interface ValueBoxPanelConfig extends DataBoundPanelConfigBase {
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

export interface PlotlyPanelConfig extends DataBoundPanelConfigBase {
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

export interface TablePanelConfig extends DataBoundPanelConfigBase {
  type: 'table'
  columns?: TableColumnConfig[]
  sort?: { column: string; order: 'asc' | 'desc' }
  pagination?: number
  searchable?: boolean
}

/**
 * The fourth panel type — no metric/filter/scenario/scenarios at all
 * (docs/GRAMMAR.md's type: markdown grammar has no data binding;
 * 006-markdown-panel, data-model.md). `content` is optional at the type
 * level because a missing/empty/whitespace-only value is a defined,
 * non-crashing empty state (FR-006), not a parse error.
 */
export interface MarkdownPanelConfig extends PanelConfigBase {
  type: 'markdown'
  content?: string
}

/**
 * One entry in an `observable-plot` panel's `inputs:` list — a panel-local
 * reactive input widget (007-observable-plot-panel, data-model.md).
 * Referenced via `$inputs.<id>` in that same panel's own `filter:` map,
 * never any other panel's. Same three-value `type` vocabulary
 * `FilterDefinition` already uses for global filters — no `all_option`
 * field, unlike `FilterDefinition`: no documented `inputs:` example
 * declares one (research.md §2/§9).
 */
export interface ObservablePlotInputConfig {
  id: string
  label: string
  type: 'select' | 'multiselect' | 'range'
  column: string
  default: string
}

/**
 * The fifth panel type — extends DataBoundPanelConfigBase (unlike
 * MarkdownPanelConfig): docs/GRAMMAR.md's type: observable-plot grammar
 * always queries a metric (007-observable-plot-panel, research.md §7).
 * x/y/fill/stroke/facet_x/facet_y are literal column names from the
 * queried result set — NOT $metric.<column>-prefixed like
 * PlotlyTraceConfig's own fields (research.md §4, a confirmed grammar
 * difference from type: plotly).
 */
export interface ObservablePlotPanelConfig extends DataBoundPanelConfigBase {
  type: 'observable-plot'
  /** Names an @observablehq/plot mark-constructor export (e.g. 'barY',
   * 'lineY') — looked up dynamically, not an exhaustive hardcoded enum,
   * matching how PlotlyTraceConfig.type is a plain string. */
  mark: string
  x?: string
  y?: string
  fill?: string
  stroke?: string
  facet_x?: string
  facet_y?: string
  tip?: boolean
  grid?: boolean
  inputs?: ObservablePlotInputConfig[]
}

/**
 * Any other panel type (flowmap, zonemap, sankey, graphic-walker — all
 * out of scope for this feature, still deferred) still parses as this
 * base shape rather than being dropped or erroring at parse time — the
 * registry lookup (panels/registry.tsx), not the parser, is what
 * surfaces an unrecognized-type error, keeping "parse" and
 * "renderable-by-this-app" as separate concerns. Extends the plain
 * PanelConfigBase, not DataBoundPanelConfigBase — an unrecognized future
 * type shouldn't be assumed data-bound by the parser (006-markdown-panel,
 * research.md §1); markdown itself is proof a panel type can genuinely
 * have no metric at all.
 */
export interface UnknownPanelConfig extends PanelConfigBase {
  type: string
}

export type PanelConfig =
  | ValueBoxPanelConfig
  | PlotlyPanelConfig
  | TablePanelConfig
  | MarkdownPanelConfig
  | ObservablePlotPanelConfig
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
