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

// 018-baseline-scenario-designation: the explicit half of the baseline
// designation. A single nullable pointer, not a per-scenario boolean flag
// — mutual exclusivity (spec FR-001) falls out of the data shape itself,
// no invariant-maintenance code needed to un-mark a previous holder.
// Never read directly outside this module — always through getBaseline(),
// which is what actually resolves "which scenario is baseline right now"
// (data-model.md's Resolution rule). Cleared, never left dangling, by
// unregister() below when the scenario it names is removed.
let explicitBaseline: string | null = null

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
  // 018-baseline-scenario-designation (FR-005): clear the explicit
  // designation before deleting the entry it points at, rather than
  // leaving it dangling for getBaseline()'s own existence check to catch
  // on next read. Both would be correct (research.md §3) — clearing here
  // too documents the intent directly at the mutation site.
  if (explicitBaseline === name) {
    explicitBaseline = null
  }
  scenarios.delete(name)
  notify()
}

/**
 * Marks `name` as the explicit baseline scenario (018-baseline-scenario-
 * designation, spec FR-001/FR-002). Throws on an unregistered name,
 * matching setActive()/setStatus()'s existing convention. Marking the
 * scenario that already holds the designation is a harmless no-op write
 * (FR-001 Acceptance Scenario 3) — still calls notify(), same as every
 * other mutator here regardless of whether the value actually changed.
 */
export function setBaseline(name: string): void {
  const entry = scenarios.get(name)
  if (!entry) {
    throw new Error(`appState.setBaseline: "${name}" was never registered`)
  }
  explicitBaseline = name
  notify()
}

/**
 * Resolves "which scenario is baseline right now" (018-baseline-scenario-
 * designation, data-model.md's Resolution rule). Always computed fresh —
 * never a second stored/cached resolved value that could go stale:
 *   1. The explicit choice (setBaseline()'s target), if it still exists.
 *   2. Else the earliest-registered (Map insertion order) scenario with
 *      pinned === false AND status === 'ready' — excluding pinned entries
 *      is deliberate, not incidental: `observed` is always registered
 *      first in every real deployment (scenarioDiscovery.ts's
 *      registerObserved() runs, and calls appState.register(), before
 *      any published scenario), so a literal "first Map entry" reading
 *      would make survey/count reference data the default baseline 100%
 *      of the time — the opposite of this feature's purpose (research.md
 *      §1). status === 'ready' is required too: a still-registering or
 *      failed scenario has no queryable views yet for the SQL placeholder
 *      (services/sqlExpander.ts's $baseline.<metric>) to resolve against
 *      (research.md §2).
 *   3. Else undefined — no scenario is baseline (e.g. nothing loaded yet).
 */
export function getBaseline(): string | undefined {
  if (explicitBaseline !== null && scenarios.has(explicitBaseline)) {
    return explicitBaseline
  }
  for (const entry of scenarios.values()) {
    if (!entry.pinned && entry.status === 'ready') {
      return entry.name
    }
  }
  return undefined
}
