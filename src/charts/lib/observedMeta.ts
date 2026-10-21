// "Observed: <source>, <sample>" footers for tooltips. The observed run's manifest.yaml carries
// `observed.metrics.<table>.{source, sample}` (and a whole-run `observed.{source, sample}`); the app's manifest reader
// does not expose it, so this reads and caches the file itself. Tooltips read the cache at hover time.
import { load } from 'js-yaml'

import { get as getScenario } from '@/state/appState'

export interface ObservedMeta {
  source?: string
  sample?: string
}

const cache = new Map<string, ObservedMeta | null>()
const pending = new Set<string>()

export function parseObservedMeta(manifest: unknown, table: string): ObservedMeta | null {
  const obs = (manifest as { observed?: ObservedMeta & { metrics?: Record<string, ObservedMeta> } } | null)?.observed
  if (!obs) return null
  const m = obs.metrics?.[table] ?? obs
  return m.source || m.sample ? { source: m.source, sample: m.sample } : null
}

export function formatObservedFooter(meta: ObservedMeta | null | undefined): string {
  if (!meta || (!meta.source && !meta.sample)) return ''
  return `Observed: ${[meta.source, meta.sample].filter(Boolean).join(', ')}`
}

/** Starts reading the observed run's manifest once; safe to call on every draw. */
export function prefetchObservedMeta(run: string | undefined, table: string): void {
  if (!run) return
  const key = `${run}|${table}`
  if (cache.has(key) || pending.has(key)) return
  const path = getScenario(run)?.path
  if (!path) return
  pending.add(key)
  fetch(`${path.replace(/\/summary\/?$/, '')}/manifest.yaml`)
    .then((r) => (r.ok ? r.text() : ''))
    .then((text) => cache.set(key, text ? parseObservedMeta(load(text), table) : null))
    .catch(() => cache.set(key, null))
    .finally(() => pending.delete(key))
}

/** The footer text: '' until the manifest has been read, or when it has no observed block. */
export function observedFooter(run: string | undefined, table: string, override?: ObservedMeta): string {
  if (override?.source || override?.sample) return formatObservedFooter(override)
  return run ? formatObservedFooter(cache.get(`${run}|${table}`)) : ''
}
