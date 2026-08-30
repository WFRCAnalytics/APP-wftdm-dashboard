// Scenario metadata/selection registry — distinct from services/duckdb.ts's
// view registration. duckdb.ts tracks *queryable Parquet views*; this module
// tracks *scenario metadata and selection state* (the Scenario entity in
// data-model.md). No pub/sub here (unlike filterState.ts) — no FR requires
// it; reads are pull-based only. No persistence — in-memory only for the
// page's lifetime (constitution Principle VI: no Web Storage).
// See specs/001-data-state-layer/contracts/app-state.md.

export type ScenarioSource = 'url' | 'handle'
export type ScenarioStatus = 'registering' | 'ready' | 'failed'

export interface Scenario {
  name: string
  runDate?: string
  color?: string
  notes?: string
  source: ScenarioSource
  pinned: boolean
  active: boolean
  status: ScenarioStatus
}

export interface ScenarioMetadata {
  runDate?: string
  color?: string
  notes?: string
  source: ScenarioSource
  pinned?: boolean
}

const scenarios = new Map<string, Scenario>()

/**
 * Adds a new Scenario entry with status: 'registering' and active: false —
 * always, regardless of metadata.pinned. `pinned` never auto-activates;
 * only an explicit setActive() call ever changes `active`. Registering an
 * already-registered name replaces the prior entry cleanly (no merge).
 */
export function register(name: string, metadata: ScenarioMetadata): void {
  scenarios.set(name, {
    name,
    runDate: metadata.runDate,
    color: metadata.color,
    notes: metadata.notes,
    source: metadata.source,
    pinned: Boolean(metadata.pinned),
    active: false,
    status: 'registering',
  })
}

export function setStatus(name: string, status: 'ready' | 'failed'): void {
  const entry = scenarios.get(name)
  if (!entry) {
    throw new Error(`appState.setStatus: "${name}" was never registered`)
  }
  entry.status = status
}

/**
 * The only function that changes `active`. Callers are always responsible
 * for calling this explicitly — there is no implicit pinned-aware branching
 * here (see contracts/app-state.md).
 */
export function setActive(name: string, active: boolean): void {
  const entry = scenarios.get(name)
  if (!entry) {
    throw new Error(`appState.setActive: "${name}" was never registered`)
  }
  entry.active = active
}

export function get(name: string): Scenario | undefined {
  return scenarios.get(name)
}

export function list(): Scenario[] {
  return Array.from(scenarios.values())
}

export function getActive(): Scenario[] {
  return list().filter((s) => s.active)
}

export function unregister(name: string): void {
  scenarios.delete(name)
}
