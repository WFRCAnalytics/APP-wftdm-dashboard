import { useCallback, useMemo } from 'react'

import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { useResolvedView } from '@/hooks/useViewContext'
import { runKindOf, runNameFor } from '@/services/runResolution'
import { get as getScenario } from '@/state/appState'
import { resolveScenarioColor, resolveScenarioLabel } from '@/panels/scenarioDisplay'
import type { CompareInputs } from '@/panels/compareStrategy'
import { OBSERVED_LABEL } from '@/services/viewContext'
import { prettyOperators } from '@/services/typography'

/** What the compare strategies need from the resolved view, plus label helpers. Stable until the view changes. */
export function useCompareInputs(): { inputs: CompareInputs; referenceLabel: string; referenceColor: string | undefined } {
  const view = useResolvedView()
  const display = useScenarioDisplay()
  const label = useCallback((run: string) => prettyOperators(resolveScenarioLabel(run, display)), [display])

  return useMemo(() => {
    const selfBaseRun = view.isBaseYear ? undefined : runNameFor(view.focus, view.baseYear)
    const inputs: CompareInputs = {
      compare: view.compare,
      display: view.display,
      focusRun: view.focusRun,
      referenceKind: view.referenceKind,
      referenceRun: view.referenceRun,
      selfBaseRun,
      // Observed is a reference, never a compared scenario
      active: view.active.filter((run) => {
        const s = getScenario(run)
        return !s || runKindOf(s) !== 'observed'
      }),
      label,
    }
    const referenceLabel =
      view.referenceKind === 'observed'
        ? OBSERVED_LABEL
        : view.referenceKind === 'self-base-year'
          ? `the ${view.baseYear} run`
          : view.referenceRun
            ? label(view.referenceRun)
            : view.reference
    // the reference run's colour from Settings (undefined for observed data, which has no scenario colour)
    const referenceRun = view.referenceKind === 'self-base-year' ? selfBaseRun : view.referenceKind === 'observed' ? undefined : view.referenceRun
    const referenceColor = referenceRun ? resolveScenarioColor(referenceRun, display) : undefined
    return { inputs, referenceLabel, referenceColor }
  }, [view, label, display])
}
