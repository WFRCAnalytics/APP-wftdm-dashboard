import { useCallback, useMemo } from 'react'

import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { useResolvedView } from '@/hooks/useViewContext'
import { runNameFor } from '@/services/runResolution'
import { resolveScenarioLabel } from '@/panels/scenarioDisplay'
import type { CompareInputs } from '@/panels/compareStrategy'
import { OBSERVED_LABEL } from '@/services/viewContext'

/** What the compare strategies need from the resolved view, plus label helpers. Stable until the view changes. */
export function useCompareInputs(): { inputs: CompareInputs; referenceLabel: string } {
  const view = useResolvedView()
  const display = useScenarioDisplay()
  const label = useCallback((run: string) => resolveScenarioLabel(run, display), [display])

  return useMemo(() => {
    const selfBaseRun = view.isBaseYear ? undefined : runNameFor(view.focus, view.baseYear)
    const inputs: CompareInputs = {
      compare: view.compare,
      display: view.display,
      focusRun: view.focusRun,
      referenceKind: view.referenceKind,
      referenceRun: view.referenceRun,
      selfBaseRun,
      active: view.active,
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
    return { inputs, referenceLabel }
  }, [view, label])
}
