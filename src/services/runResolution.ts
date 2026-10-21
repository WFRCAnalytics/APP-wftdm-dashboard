// The bridge between the stores (appState's run catalog, state/compareState.ts) and the pure resolver
// (services/viewContext.ts). Everything that needs "which runs are showing, in which year" reads it from here.
import * as appState from '../state/appState.ts'
import * as compareState from '../state/compareState.ts'
import type { Deployment } from '../state/compareState.ts'
import {
  alternativesOf,
  independentAlternatives,
  resolveRun,
  resolveViewContext,
  type ResolvedView,
  type RunInfo,
  type ViewInput,
  type ViewManifest,
} from './viewContext.ts'

/** A run's UI identity: the manifest `alternative`, else its own name. */
export function alternativeOf(s: appState.Scenario): string {
  return s.alternative ?? s.name
}

/** Legacy pinned entries (the `observed` folder) are Observed even without `kind`. */
export function runKindOf(s: appState.Scenario): appState.ScenarioKind {
  return s.kind ?? (s.pinned ? 'observed' : 'scenario')
}

export function runInfoOf(s: appState.Scenario): RunInfo {
  return { name: s.name, alternative: alternativeOf(s), year: s.year, kind: runKindOf(s), ready: s.status === 'ready' }
}

function baselineAlternative(): string | undefined {
  const run = appState.getBaseline()
  const scenario = run ? appState.get(run) : undefined
  return scenario ? alternativeOf(scenario) : undefined
}

/** Whether a run belongs in a year's lists: Observed and calibration rounds exist only in the base year; a year-less
 * run belongs to every year. */
export function isRunInYear(s: appState.Scenario, year: number, baseYear: number): boolean {
  const kind = runKindOf(s)
  if (year !== baseYear && (kind === 'observed' || kind === 'round')) return false
  return s.year === undefined || s.year === year
}

export function viewManifest(): ViewManifest {
  const deployment = compareState.getDeployment()
  return {
    runs: appState.listByDisplayOrder().map(runInfoOf),
    years: deployment.years.map((y) => y.year),
    baseYear: deployment.baseYear,
    baseline: baselineAlternative(),
  }
}

export function viewInput(): ViewInput {
  const scenarios = appState.listByDisplayOrder()
  const compareSet = alternativesOf(scenarios.filter((s) => s.active).map(runInfoOf))
  return { ...compareState.getState(), compareSet }
}

export function currentView(): ResolvedView {
  return resolveViewContext(viewInput(), viewManifest())
}

/** The baseline scenario's run for the current year (`$baseline` and baseline-pinned panels read this). */
export function getBaselineForYear(): string | undefined {
  const manifest = viewManifest()
  if (!manifest.baseline) return undefined
  const year = compareState.getState().year
  return resolveRun(manifest.runs, manifest.baseline, year)?.name ?? appState.getBaseline()
}

/** Years come from dashboard-config/index.json when configured, else from the distinct manifest years. */
export function deriveDeployment(
  runs: readonly RunInfo[],
  config: { years?: { year: number; label?: string }[]; baseYear?: number; defaultYear?: number },
): Deployment {
  const distinct = [...new Set(runs.map((r) => r.year).filter((y): y is number => y !== undefined))].sort((a, b) => a - b)
  const years = config.years ?? distinct.map((year) => ({ year }))
  const baseYear = config.baseYear ?? years[0]?.year ?? 0
  const defaultYear =
    config.defaultYear !== undefined && years.some((y) => y.year === config.defaultYear) ? config.defaultYear : baseYear
  return { years, baseYear, defaultYear }
}

/** Boot step, after scenario discovery: file 03 §1.1 defaults. */
export function bootCompareState(config: {
  years?: { year: number; label?: string }[]
  baseYear?: number
  defaultYear?: number
  compareDefault?: 'auto' | 'on' | 'off'
}): void {
  const runs = appState.listByDisplayOrder().map(runInfoOf)
  const deployment = deriveDeployment(runs, config)
  const independents = independentAlternatives(runs)
  const baseline = baselineAlternative() ?? independents[0] ?? alternativesOf(runs)[0] ?? ''
  // A single-year deployment keeps the pre-redesign behavior (every loaded scenario shows, including one a viewer loads
  // later from a local folder), so Compare starts on; with several years, Compare needs two independent scenarios.
  const auto = deployment.years.length < 2 || independents.length >= 2
  const compare = config.compareDefault === 'on' ? true : config.compareDefault === 'off' ? false : auto
  compareState.initCompareState({ deployment, focus: baseline, compare, baseline })
}
