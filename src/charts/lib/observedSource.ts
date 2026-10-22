// "Observed: <source>, <sample>" footers (project-docs/redesign/04-chart-catalogue.md sections 1, 2, 18). The Observed run's
// manifest.yaml carries `observed.source`/`observed.sample` and, per metric table, `observed.metrics.<table>.{source,sample}`.
// A kind cannot read stores or fetch, so this helper (the one place that does) reads the manifest once, caches it, and
// asks the panel to redraw when it arrives.
import { parseYAMLText } from '@/services/yamlLoader'
import { get as getScenario } from '@/state/appState'
import type { ChartEnv } from '@/charts/types'

export interface Provenance {
  source: string
  sample?: string
}

/** Pure: the provenance a manifest declares for `table`, falling back to the manifest-wide `observed.source`. */
export function provenanceFrom(manifest: unknown, table: string): Provenance | null {
  const obs = (manifest as { observed?: Record<string, unknown> } | null | undefined)?.observed
  if (!obs || typeof obs !== 'object') return null
  const metrics = obs.metrics as Record<string, { source?: unknown; sample?: unknown }> | undefined
  const pick = (o: { source?: unknown; sample?: unknown } | undefined): Provenance | null =>
    o && typeof o.source === 'string' && o.source ? { source: o.source, sample: typeof o.sample === 'string' && o.sample ? o.sample : undefined } : null
  return pick(metrics?.[table]) ?? pick(obs as { source?: unknown; sample?: unknown })
}

/** Pure: `Observed: source, sample` ('' when there is no provenance). */
export function provenanceFooter(p: Provenance | null): string {
  if (!p) return ''
  return `Observed: ${p.source}${p.sample ? `, ${p.sample}` : ''}`
}

const cache = new Map<string, unknown>()
const pending = new Set<string>()

/** manifest.yaml sits at the run root, one level above its `summary` folder. */
function manifestUrl(folderUrl: string): string {
  return `${folderUrl.replace(/\/summary\/?$/, '').replace(/\/$/, '')}/manifest.yaml`
}

/**
 * The footer for the Observed run's `table`. Empty on the first call (a fetch starts and `env.redraw()` runs when it
 * lands), then cached. Never throws; a missing or unreadable manifest just means no footer.
 */
export function observedFooter(env: Pick<ChartEnv, 'observedRun' | 'redraw'>, table: string): string {
  const run = env.observedRun
  if (!run) return ''
  if (cache.has(run)) return provenanceFooter(provenanceFrom(cache.get(run), table))
  if (!pending.has(run)) {
    const folder = getScenario(run)?.path
    if (!folder) return ''
    pending.add(run)
    fetch(manifestUrl(folder))
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => cache.set(run, text ? parseYAMLText(text, `${run}/manifest.yaml`) : null))
      .catch(() => cache.set(run, null))
      .finally(() => {
        pending.delete(run)
        env.redraw()
      })
  }
  return ''
}

/** Test hook. */
export function resetObservedCache(): void {
  cache.clear()
  pending.clear()
}
