// 064-ai-chat-assistant: what the assistant may know about the data, without loading any of it. Built from the scenario
// registry (appState) — scenario names and each scenario's metric names — plus duckdb.ts's registered-view check.
// Column names come later, on demand, through describe_tables (assistant-tools.md).
import * as appState from '@/state/appState'
import { hasView, listViews } from '@/services/duckdb'
import type { MetricPair } from '@/services/tabDataLoader'

export interface CatalogMetric {
  metric: string
  /** `{scenario}__{metric}`, the DuckDB view the dashboard registers for this pair. */
  view: string
  loaded: boolean
}

export interface CatalogScenario {
  name: string
  label: string
  kind: string
  year?: number
  active: boolean
  baseline: boolean
  metrics: CatalogMetric[]
}

type ScenarioLike = Pick<appState.Scenario, 'name' | 'status' | 'active' | 'availableMetrics' | 'label' | 'displayName' | 'kind' | 'year'>

export function viewNameOf(scenario: string, metric: string): string {
  return `${scenario}__${metric}`
}

/** Pure core: ready, non-hidden scenarios with their metrics. Inactive scenarios are listed but marked. */
export function buildCatalogFrom(
  scenarios: readonly ScenarioLike[],
  baseline: string | undefined,
  isLoaded: (view: string) => boolean,
): CatalogScenario[] {
  return scenarios
    .filter((s) => s.status === 'ready' && s.kind !== 'hidden')
    .map((s) => ({
      name: s.name,
      label: s.label ?? s.displayName ?? s.name,
      kind: s.kind ?? 'scenario',
      year: s.year,
      active: s.active,
      baseline: s.name === baseline,
      metrics: (s.availableMetrics ?? []).map((metric) => {
        const view = viewNameOf(s.name, metric)
        return { metric, view, loaded: isLoaded(view) }
      }),
    }))
}

export function buildCatalog(): CatalogScenario[] {
  return buildCatalogFrom(appState.listByDisplayOrder(), appState.getBaseline(), hasView)
}

/** The catalogue as prompt text: compact, one scenario per block. */
export function catalogText(catalog: readonly CatalogScenario[]): string {
  if (catalog.length === 0) return '(no scenarios are loaded)'
  return catalog
    .map((s) => {
      const tags = [s.kind, s.year ? String(s.year) : '', s.active ? 'active' : 'not active', s.baseline ? 'baseline' : '']
        .filter(Boolean)
        .join(', ')
      const metrics = s.metrics.length ? s.metrics.map((m) => m.metric).join(', ') : '(metrics not listed)'
      return `- scenario "${s.name}" (label: ${s.label}; ${tags})\n  views are named "${s.name}__<metric>"; metrics: ${metrics}`
    })
    .join('\n')
}

/** Maps view names the model asked about onto {scenario, metric} pairs; unknown names come back in `notFound`. */
export function resolveViews(
  names: readonly string[],
  catalog: readonly CatalogScenario[],
): { pairs: (MetricPair & { view: string })[]; notFound: string[] } {
  const byView = new Map<string, MetricPair & { view: string }>()
  for (const s of catalog) {
    for (const m of s.metrics) byView.set(m.view.toLowerCase(), { scenario: s.name, metric: m.metric, view: m.view })
  }
  const pairs: (MetricPair & { view: string })[] = []
  const notFound: string[] = []
  for (const raw of names) {
    const hit = byView.get(raw.trim().replace(/^"|"$/g, '').toLowerCase())
    if (hit) pairs.push(hit)
    else notFound.push(raw)
  }
  return { pairs, notFound }
}

/** Catalogue views a SQL text mentions, so a query that skips describe_tables still gets its files registered. */
export function viewsReferencedBy(sql: string, catalog: readonly CatalogScenario[]): (MetricPair & { view: string })[] {
  const lower = sql.toLowerCase()
  const out: (MetricPair & { view: string })[] = []
  for (const s of catalog) {
    for (const m of s.metrics) {
      if (lower.includes(m.view.toLowerCase())) out.push({ scenario: s.name, metric: m.metric, view: m.view })
    }
  }
  return out
}

/**
 * Every view name the dashboard has registered or may register: all scenarios x all their metrics (active or not,
 * hidden included) plus whatever is registered right now. The statement guard refuses to change any of them.
 */
export function protectedNames(): Set<string> {
  const names = new Set<string>(listViews())
  for (const s of appState.list()) {
    for (const metric of s.availableMetrics ?? []) names.add(viewNameOf(s.name, metric))
  }
  return names
}
