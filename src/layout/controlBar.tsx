import { useMemo, useSyncExternalStore } from 'react'

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useResolvedView } from '@/hooks/useViewContext'
import { useScenarioList } from '@/hooks/useScenarioList'
import { alternativeOf, runKindOf } from '@/services/runResolution'
import { getDeployment, setFocus, setYear, subscribe } from '@/state/compareState'

// The pinned control bar (project-docs/redesign/02-layout-and-components.md §1.2). P3 builds the Year and Focus selects;
// the Compare toggle, scenario picker, Reference and Show arrive with CompareHost (P5).

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

  const showYear = deployment.years.length > 1
  const showFocus = scenarios.length + rounds.length > 1
  if (!showYear && !showFocus) return null

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
    </div>
  )
}
