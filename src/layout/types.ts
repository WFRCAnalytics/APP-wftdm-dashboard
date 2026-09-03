// Typed dashboard-*.yaml parsing — services/yamlLoader.ts's DashboardConfig
// keeps `raw: unknown` (a deliberate 001 decision; that service never
// needed to know dashboard-content shape). This feature is the first
// consumer that does, so the typed seam lives here, at the point of use,
// not in yamlLoader.ts itself. See contracts/dashboard-config-types.md.
import { isBasemapComposition, type BasemapSelection } from '@/panels/basemap/types'

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
 * The sixth and final originally-listed panel type — extends
 * DataBoundPanelConfigBase (like ObservablePlotPanelConfig): docs/GRAMMAR.md's
 * type: sankey grammar always queries a metric (008-sankey-panel,
 * data-model.md). source/target/value are author-configurable field-mapping
 * keys naming literal columns in the queried result set — NOT
 * $metric.<column>-prefixed (Grammar findings #2, research.md's
 * confirmation) — the same author-names-the-field approach
 * TableColumnConfig.field already uses, applied here to source/target/value
 * instead of x/y/columns. color_scheme is a distinct concept from
 * TableColumnConfig's color_scale/domain (a continuous sequential/diverging
 * ramp) — a named categorical scheme for discrete node/link coloring
 * (Grammar findings #3).
 */
export interface SankeyPanelConfig extends DataBoundPanelConfigBase {
  type: 'sankey'
  source: string
  target: string
  value: string
  color_scheme?: string
}

/**
 * The seventh panel type, and the first to render a real map —
 * 010-flowmap-panel. Extends DataBoundPanelConfigBase like every other
 * data-bound panel type; docs/GRAMMAR.md's type: flowmap grammar always
 * queries a metric. origin/origin_lat/origin_lon/destination/dest_lat/
 * dest_lon/value are author-configurable field-mapping keys naming
 * literal columns already present in the queried result set — the same
 * author-names-the-field approach SankeyPanelConfig's source/target/value
 * already uses. This grammar was corrected during this feature's own
 * spec/plan phase: an earlier boundaries/boundaries_id key pair implying
 * a live GeoParquet/DuckDB-spatial zone join in the browser was removed
 * after neither real WFRC reference app (APP-Commute-Explorer,
 * APP-WFRC-Commute-Patterns) turned out to do that — both simply carry
 * resolved lat/lon on the flow data itself (spec.md's own Grammar
 * findings #2).
 */
export interface FlowMapPanelConfig extends DataBoundPanelConfigBase {
  type: 'flowmap'
  origin: string
  origin_lat: string
  origin_lon: string
  destination: string
  dest_lat: string
  dest_lon: string
  value: string
  clustering?: boolean
  clustering_auto?: boolean
  animation?: boolean
  max_flows?: number
  center?: [number, number]
  zoom?: number
  /** 011-basemap-style-system, FR-004: optional panel-level basemap
   * override — a built-in preset name or a custom composition. */
  basemap?: BasemapSelection
  /** Set only by dashboardRenderer.tsx as it constructs each row — never
   * authored in YAML directly (no such key exists in docs/GRAMMAR.md's
   * panel-level grammar and none is being added there). Carries the
   * tab's default_basemap down to the one place resolveEffectiveBasemap
   * is actually called (FlowMapPanel itself), without adding a second
   * prop to the panel-pattern's "single config prop" contract. */
  _tabDefaultBasemap?: BasemapSelection
}

/**
 * The eighth and final originally-listed panel type — 013-zonemap-panel.
 * Extends DataBoundPanelConfigBase (docs/GRAMMAR.md's type: zonemap
 * grammar always queries a metric) AND MapRenderingPanelConfig below
 * (that interface's own doc comment already anticipated this exact type
 * unchanged). boundaries_id/metric_id/column are author-configurable
 * field-mapping keys naming literal columns in the geometry/queried
 * result — not $metric.<column>-prefixed (spec.md Grammar findings #3),
 * the same convention SankeyPanelConfig/FlowMapPanelConfig already use.
 * comparison defaults to 'side_by_side' when omitted — the panel renders
 * its single selected/active scenario's values normally, the existing
 * side-by-side-panels convention every other panel type's own scenario:
 * key already provides (spec.md Grammar findings #8).
 */
export interface ComparisonDiff {
  type: 'diff'
  a: string
  b: string
  expr: string
}

export interface ZoneMapPanelConfig extends DataBoundPanelConfigBase, MapRenderingPanelConfig {
  type: 'zonemap'
  boundaries: string
  boundaries_id: string
  metric_id: string
  column: string
  label?: string
  color_scale?: 'sequential' | 'diverging'
  color_ramp?: string
  steps?: number
  domain?: [number, number]
  comparison?: 'side_by_side' | ComparisonDiff
  center?: [number, number]
  zoom?: number
}

/** Any panel type that participates in basemap resolution — FlowMapPanelConfig
 * and ZoneMapPanelConfig today. dashboardRenderer.tsx uses this as a type
 * guard so tab-level default_basemap injection stays generic across
 * current and future map-rendering panel types. */
export interface MapRenderingPanelConfig {
  basemap?: BasemapSelection
  _tabDefaultBasemap?: BasemapSelection
}

export function isMapRenderingPanel(config: PanelConfig): config is PanelConfig & MapRenderingPanelConfig {
  return config.type === 'flowmap' || config.type === 'zonemap'
}

/**
 * Any other panel type (graphic-walker — still out of scope, still
 * deferred; flowmap and zonemap are no longer among these as of
 * 010-flowmap-panel/013-zonemap-panel) still parses as this base shape
 * rather than being dropped or erroring at parse time — the registry
 * lookup (panels/registry.tsx), not the parser, is what surfaces an
 * unrecognized-type error, keeping "parse" and "renderable-by-this-app" as
 * separate concerns. Extends the plain PanelConfigBase, not
 * DataBoundPanelConfigBase — an unrecognized future type shouldn't be
 * assumed data-bound by the parser (006-markdown-panel, research.md §1);
 * markdown itself is proof a panel type can genuinely have no metric at
 * all.
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
  | SankeyPanelConfig
  | FlowMapPanelConfig
  | ZoneMapPanelConfig
  | UnknownPanelConfig

export interface DashboardTabConfig {
  header: { tab: string; title: string; description?: string }
  filters: FilterDefinition[]
  /** 011-basemap-style-system, FR-005: optional tab-level basemap
   * default, scoped exactly like header:/filters: — a built-in preset
   * name or a custom composition, applied to every map-rendering panel
   * on this tab that doesn't set its own `basemap:`. */
  default_basemap?: BasemapSelection
  layout: Record<string, PanelConfig[]>
}

/** A bare string or a { layers: string[] } object — the only two shapes
 * BasemapSelection accepts (data-model.md). Anything else in the raw
 * YAML is treated as absent, matching every other optional field's
 * fail-soft parsing convention in this function. */
function parseBasemapSelection(v: unknown): BasemapSelection | undefined {
  if (typeof v === 'string') return v.trim().length > 0 ? v : undefined
  if (v && typeof v === 'object' && Array.isArray((v as { layers?: unknown }).layers)) {
    const candidate = v as BasemapSelection
    return isBasemapComposition(candidate) ? candidate : undefined
  }
  return undefined
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
    default_basemap: parseBasemapSelection(obj.default_basemap),
    layout:
      obj.layout && typeof obj.layout === 'object'
        ? (obj.layout as Record<string, PanelConfig[]>)
        : {},
  }
}
