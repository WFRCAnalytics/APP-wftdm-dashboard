// Global compare/view state (project-docs/redesign/03-state-and-compare.md §1). Plain in-memory module state with a
// pub/sub, like every other store here: nothing is persisted. The compare SET itself stays in appState (each run's
// `active` flag); this store holds the rest. Tiles never read it directly, they read the ViewContext that
// services/viewContext.ts resolves from it.
import { toast } from 'sonner'

import * as appState from './appState.ts'

import { DEFAULT_MAX_ACTIVE, DEFAULT_WARN_AT, resolveLimits, type ScenarioLimits } from '../config/scenarioLimits.ts'

let limits: ScenarioLimits = { warnAt: DEFAULT_WARN_AT, maxActive: DEFAULT_MAX_ACTIVE }
/** Set once at boot from dashboard-config.yaml (`scenarios.warn_at`, `scenarios.max_active`). */
export function setScenarioLimits(warnAt: number | undefined, maxActive: number | undefined): void {
  limits = resolveLimits(warnAt, maxActive)
}
export function getScenarioLimits(): ScenarioLimits {
  return limits
}

/** Observed data and hidden runs are not compared scenarios, so they do not count toward the limits. */
const counts = (s: appState.Scenario): boolean => {
  const kind = s.kind ?? (s.pinned ? 'observed' : 'scenario')
  return kind !== 'observed' && kind !== 'hidden'
}

export type DisplayMode = 'val' | 'abs' | 'pct'
export type ReferenceSpec =
  | { kind: 'observed' }
  | { kind: 'scenario'; name: string }
  | { kind: 'self-base-year' }

export interface CompareState {
  compare: boolean
  /** Focus scenario group id. */
  focus: string
  reference: ReferenceSpec
  display: DisplayMode
  /** Model year; 0 when the deployment has no years. */
  year: number
}

/** The deployment's year setup (dashboard-config.yaml, or derived from the manifests). */
export interface Deployment {
  years: { year: number; label?: string }[]
  baseYear: number
  defaultYear: number
}

const NO_DEPLOYMENT: Deployment = { years: [], baseYear: 0, defaultYear: 0 }

let state: CompareState = {
  compare: true,
  focus: '',
  reference: { kind: 'observed' },
  display: 'val',
  year: 0,
}
let deployment: Deployment = NO_DEPLOYMENT

const subscribers = new Set<() => void>()
function notify(): void {
  for (const fn of subscribers) fn()
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function getState(): CompareState {
  return state
}

export function getDeployment(): Deployment {
  return deployment
}

function patch(next: Partial<CompareState>): void {
  state = { ...state, ...next }
  notify()
}

export function setCompare(compare: boolean): void {
  patch({ compare })
}
export function setFocus(focus: string): void {
  patch({ focus })
}
export function setReference(reference: ReferenceSpec): void {
  patch({ reference })
}
export function setDisplay(display: DisplayMode): void {
  patch({ display })
}
export function setYear(year: number): void {
  if (deployment.years.length > 0 && !deployment.years.some((y) => y.year === year)) return
  patch({ year })
}

/** Called once at boot, after scenario discovery (file 03 §1.1 defaults). */
export function initCompareState(
  config: { deployment: Deployment; focus: string; compare: boolean; baseline: string },
): void {
  deployment = config.deployment
  state = {
    compare: config.compare,
    focus: config.focus,
    reference: config.compare ? { kind: 'scenario', name: config.baseline } : { kind: 'observed' },
    display: 'val',
    year: config.deployment.defaultYear,
  }
  notify()
}

/** Click on a scenario in a round or year chart: make it the focus. */
export function focusScenarioGroup(scenarioGroup: string): void {
  setFocus(scenarioGroup)
}

/** Adds or removes a scenario group from the compare set. Every run of it (all model years) follows, so the choice
 * survives a year change. */
export function setScenarioGroupActive(scenarioGroup: string, active: boolean): void {
  if (active) {
    const groups = new Set<string>()
    let already = false
    for (const run of appState.list()) {
      const g = run.scenarioGroup ?? run.name
      if (run.active && counts(run)) groups.add(g)
      if (g === scenarioGroup && run.active) already = true
    }
    if (!already && groups.size >= limits.maxActive) {
      toast.error(`Up to ${limits.maxActive} scenarios can be on at once`, { id: 'scenario-hard-cap', description: 'Turn one off to add another. A scenario you just loaded stays loaded, but off.' })
      return
    }
    if (!already && groups.size + 1 > limits.warnAt) {
      toast.warning(`${groups.size + 1} scenarios are on`, { id: 'scenario-soft-cap', description: `Above ${limits.warnAt}, charts get crowded and maps may slow down.` })
    }
  }
  for (const run of appState.list()) {
    if ((run.scenarioGroup ?? run.name) === scenarioGroup) appState.setActive(run.name, active)
  }
}

/** Shift-click: add the scenario group to the compare set, or remove it. */
export function toggleCompareMember(scenarioGroup: string): void {
  const on = appState.list().some((s) => (s.scenarioGroup ?? s.name) === scenarioGroup && s.active)
  setScenarioGroupActive(scenarioGroup, !on)
}

/**
 * Startup cap: when more scenario groups are on than the maximum allows, keeps the ones in `priority` order (focus and reference
 * first) and turns the rest off. Returns how many were turned off.
 */
export function enforceActiveCap(priority: readonly string[]): number {
  const on = new Set<string>()
  for (const run of appState.list()) if (run.active && counts(run)) on.add(run.scenarioGroup ?? run.name)
  if (on.size <= limits.maxActive) return 0
  const keep = new Set<string>()
  for (const g of [...priority, ...on]) if (on.has(g) && keep.size < limits.maxActive) keep.add(g)
  let off = 0
  for (const g of on) {
    if (keep.has(g)) continue
    for (const run of appState.list()) if ((run.scenarioGroup ?? run.name) === g) appState.setActive(run.name, false)
    off++
  }
  toast.info(`${off} scenario${off === 1 ? '' : 's'} started off`, { id: 'scenario-startup-cap', description: `This dashboard allows ${limits.maxActive} on at once. Turn others on in the scenario picker.` })
  return off
}
