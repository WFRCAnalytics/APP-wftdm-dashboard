// Turns the resolved view plus a chart panel's config into a ChartPlan: which runs are drawn, against which reference.
// Pure (the caller passes lookups in), so the rules are unit-tested without stores.
import type { ChartPanelConfig } from '@/layout/types'
import type { ChartPlan, ChartReference, ChartScenario } from '@/charts/types'
import type { ResolvedView } from '@/services/viewContext'

export interface PlanInput {
  config: ChartPanelConfig
  view: ResolvedView
  /** Compare-set run names for the current year, in order. */
  active: string[]
  referenceLabel: string
  years: { year: number; label?: string }[]
  label(run: string): string
  color(run: string): string
  alternativeOf(run: string): string
  /** `alternative`'s run in `year`. */
  runFor(alternative: string, year: number): string | undefined
  observedRun?: string
  /** The kind's default group when the config sets none. */
  defaultGroup?: string
}

export function buildChartPlan(i: PlanInput): ChartPlan {
  const { config, view } = i
  const pinnedRun = typeof config.scenario === 'string' && config.scenario ? config.scenario : undefined
  const pinned = pinnedRun !== undefined

  const runs = pinnedRun ? [pinnedRun] : view.compare ? i.active : view.focusRun ? [view.focusRun] : []
  const focusRun = pinnedRun ?? view.focusRun
  const scenarios: ChartScenario[] = runs.map((run) => ({
    run,
    alternative: i.alternativeOf(run),
    label: i.label(run),
    color: i.color(run),
    isFocus: run === focusRun,
  }))
  const focus = scenarios.find((s) => s.isFocus)

  const reference: ChartReference = {
    kind: view.referenceKind,
    run: view.referenceKind === 'self-base-year' ? undefined : view.referenceRun,
    label: i.referenceLabel,
    isObserved: view.referenceKind === 'observed',
  }
  const refRunFor = (run: string): string | undefined =>
    view.referenceKind === 'self-base-year' ? i.runFor(i.alternativeOf(run), view.baseYear) : view.referenceRun

  return {
    config,
    scenarios,
    focus,
    reference,
    refRunFor,
    // a cell of a side-by-side grid shows values; the grid itself provides the comparison
    display: pinned ? 'val' : view.display,
    year: view.year,
    baseYear: view.baseYear,
    isBaseYear: view.isBaseYear,
    years: i.years.map((y) => ({ year: y.year, label: y.label ?? String(y.year) })),
    compare: view.compare,
    group: config.group ?? i.defaultGroup ?? 'scn',
    pinned,
    runFor: i.runFor,
    observedRun: i.observedRun,
  }
}

/** Every run a chart must load: compared runs, their references, the focus and the kind's extras; each once. */
export function runsToLoad(plan: ChartPlan, extra: string[] = []): string[] {
  const out = new Set<string>()
  for (const s of plan.scenarios) {
    out.add(s.run)
    const ref = plan.refRunFor(s.run)
    if (ref) out.add(ref)
  }
  if (plan.reference.run) out.add(plan.reference.run)
  for (const r of extra) out.add(r)
  return [...out]
}
