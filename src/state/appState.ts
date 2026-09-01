// Scenario metadata/selection registry — distinct from services/duckdb.ts's
// view registration. duckdb.ts tracks *queryable Parquet views*; this module
// tracks *scenario metadata and selection state* (the Scenario entity in
// data-model.md). No persistence — in-memory only for the page's lifetime
// (constitution Principle VI: no Web Storage).
// See specs/001-data-state-layer/contracts/app-state.md.
//
// Pub/sub added by 009-scenario-manager (see subscribe() below): this
// module was originally pull-based only ("no FR requires it" — accurate
// when 001-data-state-layer wrote it). FR-008 of 009-scenario-manager is
// the first FR that does — a locally loaded scenario activating must
// refresh already-rendered panels' data without discarding any panel's own
// local UI state, which rules out a remount-based fix (research.md §1 of
// that feature). See hooks/useActiveScenarios.ts for the consumer side.

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

export type ScenarioSubscriber = () => void
export type Unsubscribe = () => void

const subscribers = new Set<ScenarioSubscriber>()

function notify(): void {
  for (const fn of subscribers) fn()
}

/**
 * Registers `fn` to be called (with no arguments — callers re-read via
 * getActive()/list() themselves) after any register()/setStatus()/
 * setActive()/unregister() call. No per-scenario-id targeting (unlike
 * filterState.ts's subscribe) — every existing consumer of getActive()
 * reads the whole active list as one unit, so a single wildcard subscriber
 * set is the right granularity here, not a gap relative to filterState.ts's
 * richer per-id shape (009-scenario-manager research.md §1).
 */
export function subscribe(fn: ScenarioSubscriber): Unsubscribe {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

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
  notify()
}

export function setStatus(name: string, status: 'ready' | 'failed'): void {
  const entry = scenarios.get(name)
  if (!entry) {
    throw new Error(`appState.setStatus: "${name}" was never registered`)
  }
  entry.status = status
  notify()
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
  notify()
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
  notify()
}
