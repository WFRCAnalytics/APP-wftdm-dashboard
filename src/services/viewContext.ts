// Pure resolution of "what does every tile show right now" from the global compare state and the run catalog
// (project-docs/redesign/03-state-and-compare.md §2, 06 §4). No React, no stores: callers pass plain data in. A tile
// may read only the fields of the resulting ViewContext, never the stores behind it.
import type { ScenarioKind } from '../state/appState.ts'
import type { CompareState, DisplayMode, ReferenceSpec } from '../state/compareState.ts'

/** One loaded run. `alternative` is the UI identity (defaults to the run's own name); `year` is absent for a
 * single-year run, which counts for every year. */
export interface RunInfo {
  name: string
  alternative: string
  year?: number
  kind: ScenarioKind
  ready: boolean
}

export interface ViewManifest {
  runs: RunInfo[]
  /** Model years in display order; empty for a single-year deployment. */
  years: number[]
  /** 0 when the deployment has no years. */
  baseYear: number
  /** Alternative id of the baseline scenario, if one is designated or can be inferred. */
  baseline?: string
}

export interface ViewInput extends CompareState {
  /** The compare set as alternative ids, in display order. */
  compareSet: string[]
}

export const OBSERVED_LABEL = 'Observed'

/** The data half of the ViewContext; the hook adds `pickScenario` and `setYear`. */
export interface ResolvedView {
  compare: boolean
  /** Focus alternative id. */
  focus: string
  /** The focus's run for the current year (undefined when it has none, see `missing`). */
  focusRun?: string
  /** Run names to show, in order, for the current year. */
  active: string[]
  /** Alternative ids with no ready run in the current year (a tile says "No data for {Scenario} in {year}."). */
  missing: string[]
  /** Alternative id of the reference, or 'Observed'. */
  reference: string
  referenceKind: ReferenceSpec['kind']
  referenceRun?: string
  display: DisplayMode
  year: number
  baseYear: number
  isBaseYear: boolean
}

/** Observed exists only for the base year, and only when the deployment has an observed run. */
function observedRun(manifest: ViewManifest): RunInfo | undefined {
  return manifest.runs.find((r) => r.kind === 'observed' && r.ready)
}

/** The run of `alternative` for `year`: an exact year match wins, a year-less run counts for every year. */
export function resolveRun(runs: readonly RunInfo[], alternative: string, year: number): RunInfo | undefined {
  const ofAlt = runs.filter((r) => r.alternative === alternative && r.ready)
  return ofAlt.find((r) => r.year === year) ?? ofAlt.find((r) => r.year === undefined)
}

/** Alternative ids in first-appearance order. */
export function alternativesOf(runs: readonly RunInfo[]): string[] {
  const seen = new Set<string>()
  for (const r of runs) seen.add(r.alternative)
  return [...seen]
}

/** Alternatives that count as independent scenarios (not calibration rounds, not Observed). */
export function independentAlternatives(runs: readonly RunInfo[]): string[] {
  return alternativesOf(runs).filter((alt) => runs.find((r) => r.alternative === alt)?.kind === 'scenario')
}

function kindOfAlternative(runs: readonly RunInfo[], alt: string): ScenarioKind | undefined {
  return runs.find((r) => r.alternative === alt)?.kind
}

/**
 * The seven resolution rules of file 03 §2, in order. Always returns a usable view: unknown focus/reference/compare
 * members fall back to the baseline, and the compare set can never be empty.
 */
export function resolveViewContext(input: ViewInput, manifest: ViewManifest): ResolvedView {
  const { runs } = manifest
  const alts = alternativesOf(runs)
  const year = input.year
  const baseYear = manifest.baseYear
  const isBaseYear = year === baseYear
  const independents = independentAlternatives(runs)
  const baseline = manifest.baseline && alts.includes(manifest.baseline) ? manifest.baseline : (independents[0] ?? alts[0] ?? '')
  const seriesOnlyInBaseYear = (alt: string) => {
    const kind = kindOfAlternative(runs, alt)
    return kind === 'round' || kind === 'observed'
  }

  // Rule 4: rounds exist only in the base year; a round focus resets to the baseline outside it.
  let focus = alts.includes(input.focus) ? input.focus : baseline
  if (!isBaseYear && kindOfAlternative(runs, focus) === 'round') focus = baseline

  const hasObserved = Boolean(observedRun(manifest))
  const compareSet = input.compareSet.filter((alt) => alts.includes(alt) && (isBaseYear || !seriesOnlyInBaseYear(alt)))

  // Rules 1 and 2: Compare off shows the focus alone; on shows the compare set. Rule 6: never empty.
  const shown = input.compare ? (compareSet.length > 0 ? compareSet : [focus]) : [focus]
  const active: string[] = []
  const missing: string[] = []
  for (const alt of shown) {
    const run = resolveRun(runs, alt, year)
    if (run) active.push(run.name)
    else missing.push(alt)
  }

  // Rules 1, 3 and 5: the reference.
  let reference: string
  let referenceKind: ReferenceSpec['kind']
  const stored = input.reference
  const asBaseline = () => {
    reference = baseline
    referenceKind = 'scenario'
  }
  reference = baseline
  referenceKind = 'scenario'
  if (!input.compare) {
    if (isBaseYear && hasObserved) {
      reference = OBSERVED_LABEL
      referenceKind = 'observed'
    }
  } else if (stored.kind === 'observed') {
    if (isBaseYear && hasObserved) {
      reference = OBSERVED_LABEL
      referenceKind = 'observed'
    } else asBaseline()
  } else if (stored.kind === 'self-base-year') {
    if (isBaseYear) asBaseline()
    else {
      reference = 'self-base-year'
      referenceKind = 'self-base-year'
    }
  } else if (alts.includes(stored.name) && (isBaseYear || kindOfAlternative(runs, stored.name) !== 'round')) {
    reference = stored.name
  } else asBaseline()

  const referenceRun =
    referenceKind === 'observed'
      ? observedRun(manifest)?.name
      : referenceKind === 'scenario'
        ? resolveRun(runs, reference, year)?.name
        : undefined

  return {
    compare: input.compare,
    focus,
    focusRun: resolveRun(runs, focus, year)?.name,
    active,
    missing,
    reference,
    referenceKind,
    referenceRun,
    display: input.compare ? input.display : 'val',
    year,
    baseYear,
    isBaseYear,
  }
}
