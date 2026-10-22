import { useMemo, useSyncExternalStore } from 'react'

import { useResolvedView } from '@/hooks/useViewContext'
import { useScenarioList } from '@/hooks/useScenarioList'
import { PillSelect } from '@/components/ui/pill-select'
import { Segmented } from '@/components/ui/segmented'
import { ScenarioPicker } from '@/layout/scenarioPicker'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { alternativeOf, runKindOf, viewManifest } from '@/services/runResolution'
import { independentAlternatives } from '@/services/viewContext'
import {
  getDeployment,
  getState,
  setCompare,
  setDisplay,
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

  const compareState = useSyncExternalStore(subscribe, getState)
  const manifest = useMemo(() => viewManifest(), [runs, view.year])
  const independent = independentAlternatives(manifest.runs)
  const showYear = deployment.years.length > 1
  const showFocus = scenarios.length + rounds.length > 1
  const showCompare = independent.length >= 2
  if (!showYear && !showFocus && !showCompare) return null

  const yearOptions = deployment.years.map((y) => ({ value: String(y.year), label: y.label ? `${y.year} · ${y.label}` : String(y.year) }))
  const compareOn = showCompare && compareState.compare

  // One row in every state (project-docs/redesign/10-toolbar-layout-export-proposal.md section A): Year, the Scenarios
  // chip (focus, compared, reference), Show (greyed out while Compare is off) and the Compare toggle, right-most. Nothing wraps; the chip is the flexible item.
  const showShort = useMediaQuery('(max-width: 1399px)')
  return (
    <div
      className="glass flex min-w-0 max-w-full origin-top-right flex-nowrap items-center gap-2 rounded-full px-2 py-[7px] [animation:control-bar-expand_260ms_cubic-bezier(0.2,0.8,0.2,1)]"
      data-testid="control-bar"
    >
      {showYear && (
        <PillSelect label="Year" value={String(view.year)} options={yearOptions} onChange={(v) => setYear(Number(v))} data-testid="control-year" wide />
      )}
      {showFocus && <ScenarioPicker />}
      {showCompare && (
        <Segmented
          size="lg"
          className={cn('h-[38px]', !compareOn && 'pointer-events-none opacity-45')}
          label="Show"
          value={compareState.display}
          options={[
            { id: 'val', label: 'Values', disabled: !compareOn },
            { id: 'abs', label: showShort ? 'Δ' : 'Change', disabled: !compareOn },
            { id: 'pct', label: showShort ? '%' : '% change', disabled: !compareOn },
          ]}
          onChange={(v) => setDisplay(v as DisplayMode)}
        />
      )}
      {/* Right-most and always rendered, so the toggle never moves when Compare is switched. */}
      {showCompare && <CompareToggle on={compareState.compare} onChange={setCompare} />}
    </div>
  )
}
