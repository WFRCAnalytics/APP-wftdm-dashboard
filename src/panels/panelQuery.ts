// Turns a panel config into a bare SQL template — $scenario.<metric> and
// $filters.<id> placeholders only, per docs/GRAMMAR.md's SQL placeholder
// reference table (panel queries never use $mappings/$bins/$sql — those
// are summarize.yaml-only, already baked into the Parquet by the offline
// post-processor). Does NOT expand placeholders itself — hand the result
// to services/sqlExpander.ts's expand(). See contracts/panel-query.md.
import type { DashboardConfig } from '@/services/yamlLoader'
import type { FilterId, FilterValue } from '@/state/filterState'
import type { DataBoundPanelConfigBase } from '@/layout/types'

/**
 * Builds a bare SQL template for a panel.
 *
 * config.filter is expected in the form "$filters.<name>" (per
 * docs/GRAMMAR.md's own dashboard-*.yaml example, e.g.
 * `filter: $filters.purpose`). The grammar doesn't separately name which
 * column that binds against — this implementation takes the same
 * <name> as both the filter id and the column name, matching the SQL
 * placeholder reference table's own literal example
 * (`AND purpose = '$filters.purpose'`). A future feature that needs a
 * filter id distinct from its bound column can extend this without
 * changing this function's signature.
 *
 * config is typed as DataBoundPanelConfigBase, not the full PanelConfig
 * union — this function reads config.metric/scenario/scenarios/filter
 * unconditionally, which only a *data-bound* panel type has
 * (006-markdown-panel, research.md §1). MarkdownPanel.tsx never calls
 * this at all (FR-001/FR-007); the compiler now catches, rather than
 * runtime-`undefined`s, a hypothetical future misuse routing a
 * non-data-bound config through here.
 */
export function buildPanelQuery(
  config: DataBoundPanelConfigBase,
  _filters: Record<FilterId, FilterValue>,
): string {
  const source = config.scenario
    ? `"${config.scenario}__${config.metric}"`
    : `($scenario.${config.metric})`

  // 'column' in config (not config.type === 'valuebox') narrows correctly
  // against the union — a plain-object 'in' check still works against
  // DataBoundPanelConfigBase the same way it did against PanelConfig.
  const selectClause = 'column' in config ? `SELECT "${config.column}"` : 'SELECT *'

  const filterMatch = config.filter?.match(/^\$filters\.([A-Za-z0-9_]+)$/)
  if (!filterMatch) {
    return `${selectClause} FROM ${source}`
  }

  const name = filterMatch[1]
  // $filters.x must sit alone on its own line (docs/GRAMMAR.md) for
  // sqlExpander.ts's `all`-sentinel line-omission to work correctly.
  return [
    `${selectClause} FROM ${source} t`,
    'WHERE 1=1',
    `  AND "${name}" = '$filters.${name}'`,
  ].join('\n')
}

/**
 * Resolves which scenario names a panel's $scenario.<metric> placeholder
 * should union over. config.scenarios (an explicit override list) wins if
 * set; otherwise globallyActive passes through unchanged. If
 * config.scenario (singular) is also set, buildPanelQuery already
 * bypasses the $scenario.x placeholder entirely for that panel — this
 * function's output is simply never consulted in that case.
 */
export function resolveActiveScenarios(
  config: DataBoundPanelConfigBase,
  globallyActive: string[],
): string[] {
  return config.scenarios ?? globallyActive
}

/**
 * Intentionally empty, not a stub — sqlExpander.ts's expand() requires a
 * DashboardConfig argument for its $mappings/$bins/$sql cases, but a
 * panel-built template never contains those placeholder kinds (this
 * module never emits them). Exported from here — the one place that
 * constructs panel SQL templates — so ValueBoxPanel.tsx/PlotlyPanel.tsx
 * import it rather than each defining their own equivalent empty object.
 */
export const EMPTY_SUMMARIZE_CONFIG: DashboardConfig = { raw: {}, sourcePath: '' }
