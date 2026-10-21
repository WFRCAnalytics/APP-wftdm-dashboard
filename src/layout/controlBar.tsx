import { useMemo, useSyncExternalStore } from 'react'

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
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
        'inline-flex h-[38px] items-center gap-2 rounded-full border bg-[var(--tile-hi)] pl-[14px] pr-3 font-body text-[13px] font-medium text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
        on ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_14%,var(--tile-hi))]' : 'border-[var(--glass-line)]',
      )}
    >
      Compare
      <span aria-hidden="true" className={cn('relative h-5 w-[34px] rounded-full', on ? 'bg-[var(--brand)]' : 'bg-[color-mix(in_srgb,var(--ink)_22%,transparent)]')}>
        <span className={cn('absolute left-[3px] top-[3px] size-[14px] rounded-full transition-transform', on ? 'translate-x-[14px] bg-[#04161A]' : 'bg-white')} />
      </span>
    </button>
  )
}

function ControlSelect({
  label,
  value,
  onChange,
  testId,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  testId: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-body text-xs font-medium text-[var(--mute)]" aria-hidden="true">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          size="sm"
          aria-label={label}
          data-testid={testId}
          className="rounded-full border-[var(--glass-line)] bg-[var(--tile-hi)] font-semibold text-[var(--ink)]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
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

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="control-bar">
      {showYear && (
        <ControlSelect label="Year" value={String(view.year)} onChange={(v) => setYear(Number(v))} testId="control-year">
          {deployment.years.map((y) => (
            <SelectItem key={y.year} value={String(y.year)}>
              {y.label ? `${y.year} · ${y.label}` : String(y.year)}
            </SelectItem>
          ))}
        </ControlSelect>
      )}
      {showFocus && (
        <ControlSelect label="Focus" value={view.focus} onChange={setFocus} testId="control-focus">
          {scenarios.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
          {rounds.length > 0 && (
            <SelectGroup>
              <SelectLabel>Calibration rounds</SelectLabel>
              {rounds.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </ControlSelect>
      )}
      {showCompare && (
        <>
          <span aria-hidden="true" className="h-6 w-px bg-[var(--line)]" />
          <CompareToggle on={compareState.compare} onChange={setCompare} />
          {compareState.compare && (
            <>
              <ScenarioPicker />
              <PillSelect
                label="Reference"
                value={refValue}
                options={refOptions}
                onChange={(v) => setReference(decodeReference(v))}
                data-testid="control-reference"
              />
              <Segmented
                label="Show"
                value={compareState.display}
                options={[
                  { id: 'val', label: 'Values' },
                  { id: 'abs', label: 'Change' },
                  { id: 'pct', label: '% change' },
                ]}
                onChange={(v) => setDisplay(v as DisplayMode)}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
