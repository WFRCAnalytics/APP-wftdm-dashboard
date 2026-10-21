import { useMemo, useSyncExternalStore } from 'react'

import { useResolvedView } from '@/hooks/useViewContext'
import { useScenarioList } from '@/hooks/useScenarioList'
import { PillSelect } from '@/components/ui/pill-select'
import { Segmented } from '@/components/ui/segmented'
import { ScenarioPicker } from '@/layout/scenarioPicker'
import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { resolveScenarioLabel } from '@/panels/scenarioDisplay'
import { alternativeOf, runKindOf, viewManifest } from '@/services/runResolution'
import { decodeReference, referenceOptions } from '@/services/compareOptions'
import { independentAlternatives } from '@/services/viewContext'
import {
  getDeployment,
  getState,
  setCompare,
  setDisplay,
  setFocus,
  setReference,
  setYear,
  subscribe,
  type DisplayMode,
} from '@/state/compareState'
import { cn } from '@/lib/utils'

// The pinned control bar (project-docs/redesign/02-layout-and-components.md §1.2): Year, Focus, the Compare toggle, the
// scenario picker, Reference and Show. Each hides itself when it does not apply (one year, one scenario, Compare off).

function CompareToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Compare"
      data-testid="control-compare"
      onClick={() => onChange(!on)}
      className={cn(
        'inline-flex h-[38px] items-center gap-[10px] rounded-full border pl-2 pr-[14px] font-body text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
        on
          ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-[var(--ink)]'
          : 'border-[var(--glass-line)] bg-transparent text-[var(--mute)] hover:text-[var(--ink)]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative h-5 w-[34px] shrink-0 rounded-full transition-colors',
          on ? 'bg-[var(--brand)]' : 'bg-[color-mix(in_srgb,var(--ink)_18%,transparent)]',
        )}
      >
        <span
          className={cn(
            'absolute left-[3px] top-[3px] size-[14px] rounded-full transition-transform',
            on ? 'translate-x-[14px] bg-[var(--primary-foreground)]' : 'bg-[var(--ink)]',
          )}
        />
      </span>
      Compare
    </button>
  )
}

export function ControlBar() {
  const view = useResolvedView()
  const runs = useScenarioList()
  const deployment = useSyncExternalStore(subscribe, getDeployment)

  // One entry per alternative; its label is the current year's run label (or the alternative's id).
  const { scenarios, rounds } = useMemo(() => {
    const seen = new Set<string>()
    const scenarios: { id: string; label: string }[] = []
    const rounds: { id: string; label: string }[] = []
    for (const run of runs) {
      const id = alternativeOf(run)
      if (seen.has(id)) continue
      const kind = runKindOf(run)
      if (kind === 'observed') continue
      seen.add(id)
      const forYear = runs.find((r) => alternativeOf(r) === id && r.year === view.year) ?? run
      const entry = { id, label: forYear.label ?? id }
      if (kind === 'round') {
        if (view.isBaseYear) rounds.push(entry)
      } else scenarios.push(entry)
    }
    return { scenarios, rounds }
  }, [runs, view.year, view.isBaseYear])

  const display = useScenarioDisplay()
  const compareState = useSyncExternalStore(subscribe, getState)
  const manifest = useMemo(() => viewManifest(), [runs, view.year])
  const independent = independentAlternatives(manifest.runs)
  const showYear = deployment.years.length > 1
  const showFocus = scenarios.length + rounds.length > 1
  const showCompare = independent.length >= 2
  const labelOf = (alt: string) => {
    const run = manifest.runs.find((r) => r.alternative === alt && (r.year === view.year || r.year === undefined)) ?? manifest.runs.find((r) => r.alternative === alt)
    return run ? resolveScenarioLabel(run.name, display) : alt
  }
  const refOptions = referenceOptions({ runs: manifest.runs, isBaseYear: view.isBaseYear, baseline: manifest.baseline, label: labelOf })
  const refValue = view.referenceKind === 'observed' ? 'observed' : view.referenceKind === 'self-base-year' ? 'self-base-year' : `scenario:${view.reference}`
  if (!showYear && !showFocus && !showCompare) return null

  const yearOptions = deployment.years.map((y) => ({ value: String(y.year), label: y.label ? `${y.year} · ${y.label}` : String(y.year) }))
  const focusOptions = [
    ...scenarios.map((s) => ({ value: s.id, label: labelOf(s.id) })),
    ...rounds.map((s) => ({ value: s.id, label: labelOf(s.id), group: 'Calibration rounds' })),
  ]

  const compareOn = showCompare && compareState.compare

  // Two fixed rows so the bar never wraps arbitrarily: what scopes the page (Year, Focus, Compare), then, with Compare on,
  // what is being compared (scenarios, Reference, Show). Each row only wraps internally on a narrow screen.
  return (
    <div
      className="glass flex max-w-full origin-top-right flex-col [animation:control-bar-expand_260ms_cubic-bezier(0.2,0.8,0.2,1)] group-data-[compact=true]/header:[animation:control-bar-collapse_260ms_cubic-bezier(0.2,0.8,0.2,1)] gap-[7px] rounded-[26px] px-2 py-[7px] group-data-[compact=true]/header:flex-row group-data-[compact=true]/header:flex-wrap group-data-[compact=true]/header:items-center group-data-[compact=true]/header:gap-2"
      data-testid="control-bar"
    >
      <div className="flex flex-wrap items-center gap-2 group-data-[compact=true]/header:contents">
        {showYear && (
          <PillSelect label="Year" value={String(view.year)} options={yearOptions} onChange={(v) => setYear(Number(v))} data-testid="control-year" wide />
        )}
        {showFocus && <PillSelect label="Focus" value={view.focus} options={focusOptions} onChange={setFocus} data-testid="control-focus" />}
        {showCompare && (
          <>
            {(showYear || showFocus) && <span aria-hidden="true" className="h-[26px] w-px flex-none bg-[var(--glass-line)]" />}
            <CompareToggle on={compareState.compare} onChange={setCompare} />
          </>
        )}
      </div>
      {compareOn && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--glass-line)] pt-[7px] group-data-[compact=true]/header:contents">
          <span aria-hidden="true" className="hidden h-[26px] w-px flex-none bg-[var(--glass-line)] group-data-[compact=true]/header:block" />
          <ScenarioPicker />
          <PillSelect
            label="Reference"
            value={refValue}
            options={refOptions}
            onChange={(v) => setReference(decodeReference(v))}
            data-testid="control-reference"
          />
          <Segmented
            size="lg"
            label="Show"
            value={compareState.display}
            options={[
              { id: 'val', label: 'Values' },
              { id: 'abs', label: 'Change' },
              { id: 'pct', label: '% change' },
            ]}
            onChange={(v) => setDisplay(v as DisplayMode)}
          />
        </div>
      )}
    </div>
  )
}
