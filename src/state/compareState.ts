// Global compare/view state (project-docs/redesign/03-state-and-compare.md §1). Plain in-memory module state with a
// pub/sub, like every other store here: nothing is persisted. The compare SET itself stays in appState (each run's
// `active` flag); this store holds the rest. Tiles never read it directly, they read the ViewContext that
// services/viewContext.ts resolves from it.
import * as appState from './appState.ts'

export type DisplayMode = 'val' | 'abs' | 'pct'
export type ReferenceSpec =
  | { kind: 'observed' }
  | { kind: 'scenario'; name: string }
  | { kind: 'self-base-year' }

export interface CompareState {
  compare: boolean
  /** Focus alternative id. */
  focus: string
  reference: ReferenceSpec
  display: DisplayMode
  /** Model year; 0 when the deployment has no years. */
  year: number
}

/** The deployment's year setup (dashboard-config/index.json, or derived from the manifests). */
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
export function focusAlternative(alternative: string): void {
  setFocus(alternative)
}

/** Adds or removes an alternative from the compare set. Every run of it (all model years) follows, so the choice
 * survives a year change. */
export function setAlternativeActive(alternative: string, active: boolean): void {
  for (const run of appState.list()) {
    if ((run.alternative ?? run.name) === alternative) appState.setActive(run.name, active)
  }
}

/** Shift-click: add the alternative to the compare set, or remove it. */
export function toggleCompareMember(alternative: string): void {
  const on = appState.list().some((s) => (s.alternative ?? s.name) === alternative && s.active)
  setAlternativeActive(alternative, !on)
}
