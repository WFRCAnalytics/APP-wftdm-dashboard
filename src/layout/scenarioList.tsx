import { useMemo, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'

import { CompareToggle } from '@/layout/controlBar'
import { ScenarioPicker } from '@/layout/scenarioPicker'
import { useCompareInputs } from '@/hooks/useCompareInputs'
import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { useScenarioList } from '@/hooks/useScenarioList'
import { useResolvedView } from '@/hooks/useViewContext'
import { resolveScenarioColor, resolveScenarioLabel } from '@/panels/scenarioDisplay'
import { independentScenarioGroups } from '@/services/viewContext'
import { runKindOf, scenarioGroupOf, viewManifest } from '@/services/runResolution'
import { getState, setCompare, setFocus, setScenarioGroupActive, subscribe } from '@/state/compareState'
import { setHoveredRun } from '@/state/scenarioHover'
import { prettyOperators } from '@/services/typography'
import { cn } from '@/lib/utils'

// The page's list of compared scenarios (scenarios.placement): in the open left rail (vertical) or under the page title
// (horizontal). It is every chart's scenario key, so tiles leave scenario names out of their own keys while it is on screen
// (legend.scenarios). A click focuses a scenario, the cross takes it out of the comparison, hovering highlights it in every
// chart; "Add or remove" opens the full Scenarios picker.

interface Entry {
  alt: string
  run: string
  label: string
  color?: string
  focus: boolean
  reference: boolean
}

function useEntries(): { entries: Entry[]; extraReference: string | null } {
  const view = useResolvedView()
  const runs = useScenarioList()
  const display = useScenarioDisplay()
  const { referenceLabel } = useCompareInputs()
  return useMemo(() => {
    const seen = new Set<string>()
    const entries: Entry[] = []
    for (const s of runs) {
      const alt = scenarioGroupOf(s)
      if (seen.has(alt) || runKindOf(s) === 'observed') continue
      seen.add(alt)
      const forYear = runs.find((r) => scenarioGroupOf(r) === alt && (r.year === view.year || r.year === undefined)) ?? s
      const focus = view.focus === alt
      // Compare on: the compared set; off: the focus alone
      if (view.compare ? !forYear.active : !focus) continue
      entries.push({
        alt,
        run: forYear.name,
        label: prettyOperators(resolveScenarioLabel(forYear.name, display)),
        color: resolveScenarioColor(forYear.name, display),
        focus,
        reference: view.compare && view.referenceKind === 'scenario' && view.reference === alt,
      })
    }
    // the reference first, then the focus, then the rest in list order
    entries.sort((a, b) => Number(b.reference) - Number(a.reference) || Number(b.focus) - Number(a.focus))
    // a reference that is not a listed scenario (Observed, the same scenario in the base year) gets its own line
    const extraReference = view.compare && view.referenceKind !== 'scenario' && referenceLabel ? referenceLabel : null
    return { entries, extraReference }
  }, [runs, display, view.year, view.focus, view.compare, view.referenceKind, view.reference, referenceLabel])
}

function Tag({ kind }: { kind: 'focus' | 'reference' }) {
  return kind === 'focus' ? (
    <span className="pill-on shrink-0 rounded-full px-[7px] py-[2px] font-body text-[11px] font-semibold">Focus</span>
  ) : (
    <span className="shrink-0 rounded-full border border-dashed border-[var(--mute)] px-[7px] py-[1px] font-body text-[11px] text-[var(--mute)]">Reference</span>
  )
}

/** The most scenarios the header row shows as chips; the rest are counted on its picker button (the rail list scrolls instead). */
const HEADER_MAX = 8

export function ScenarioList({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  const view = useResolvedView()
  const compare = useSyncExternalStore(subscribe, getState).compare
  const { entries, extraReference } = useEntries()
  const manifest = useMemo(() => viewManifest(), [view.year]) // eslint-disable-line react-hooks/exhaustive-deps
  const showCompare = independentScenarioGroups(manifest.runs).length >= 2
  const vertical = orientation === 'vertical'

  const item = (e: Entry) => (
    <li
      key={e.alt}
      data-testid={`scenario-list-${e.alt}`}
      onMouseEnter={() => setHoveredRun(e.run)}
      onMouseLeave={() => setHoveredRun(null)}
      className={cn(
        'group/sc relative flex min-w-0 items-center gap-1 pr-1',
        vertical
          ? cn('rounded-[12px] hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]', e.focus && 'bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]')
          : cn('shrink-0 rounded-full border bg-[var(--tile)]', e.reference ? 'border-dashed border-[var(--mute)]' : 'border-[var(--glass-line)]'),
      )}
    >
      <button
        type="button"
        aria-pressed={e.focus}
        aria-label={`${e.label}${e.focus ? ', focus' : '. Make it the focus'}${e.reference ? ', reference' : ''}`}
        onClick={() => {
          setFocus(e.alt)
          setScenarioGroupActive(e.alt, true)
        }}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-[12px] text-left font-body text-[13.5px] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
          // vertical: the rail's columns (icon column 14px in, 20px wide; text 12px after it), like the page items above
        vertical ? 'gap-3 py-[7px] pl-[14px]' : 'h-8 whitespace-nowrap rounded-full pl-3',
          e.focus ? 'font-semibold' : 'font-medium',
        )}
      >
        {vertical ? (
          // a 20px slot, as tall as the first line, so the dot is centred on the icon column and on the name's first line
          <span aria-hidden="true" className="flex h-[19px] w-5 shrink-0 items-center justify-center self-start">
            <i className="inline-block size-[10px] rounded-full" style={{ background: e.color ?? 'var(--mute)' }} />
          </span>
        ) : (
          <i aria-hidden="true" className="inline-block size-[10px] shrink-0 rounded-full" style={{ background: e.color ?? 'var(--mute)' }} />
        )}
        {vertical ? (
          // the rail is narrow: the name takes the whole text column (wrapping between words) and the tags go on a line under it
          <span className="flex min-w-0 flex-col items-start gap-1">
            <span className="min-w-0 break-words">{e.label}</span>
            {(e.focus || e.reference) && (
              <span className="flex flex-wrap gap-1">
                {e.focus && <Tag kind="focus" />}
                {e.reference && <Tag kind="reference" />}
              </span>
            )}
          </span>
        ) : (
          <span className="min-w-0 break-words">{e.label}</span>
        )}
      </button>
      {!vertical && e.focus && <Tag kind="focus" />}
      {!vertical && e.reference && <Tag kind="reference" />}
      {compare && !e.focus && !e.reference && (
        <button
          type="button"
          aria-label={`Remove ${e.label} from the comparison`}
          onClick={() => setScenarioGroupActive(e.alt, false)}
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full text-[var(--mute)] opacity-0 hover:text-[var(--ink)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--brand-text)] group-hover/sc:opacity-100',
            // in the rail it floats over the end of the row on hover, so it takes no width from the name
            vertical && 'absolute right-1 top-1/2 -translate-y-1/2 bg-[var(--glass)] shadow-[var(--sh1)]',
          )}
        >
          <X className="size-[13px]" aria-hidden="true" />
        </button>
      )}
    </li>
  )

  const reference = extraReference && (
    <li
      key="__reference"
      className={cn(
        'flex items-center gap-2 font-body text-[13px] text-[var(--ink)]',
        vertical ? 'gap-3 py-[6px] pl-[14px] pr-1' : 'h-8 shrink-0 rounded-full border border-dashed border-[var(--mute)] pl-3 pr-1',
      )}
    >
      <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center', vertical && 'w-5')}>
        <i className="inline-block h-0 w-[12px] border-t-2 border-dashed border-[var(--ink)]" />
      </span>
      <span className="min-w-0 truncate">{prettyOperators(extraReference)}</span>
      <Tag kind="reference" />
    </li>
  )

  if (vertical) {
    return (
      <section aria-label="Scenarios" data-testid="scenario-list" data-orientation="vertical" className="flex min-h-0 flex-col gap-1">
        {/* the heading starts on the icon column; the Compare switch ends where the page items do */}
        <div className="flex items-center justify-between gap-2 pb-1 pl-[14px]">
          <span className="font-body text-[12.5px] font-semibold text-[var(--mute)]">Scenarios</span>
          {showCompare && <CompareToggle compact on={compare} onChange={setCompare} />}
        </div>
        <ul className="scrollbar-thin flex min-h-0 flex-col gap-[2px] overflow-y-auto">
          {entries.map(item)}
          {reference}
        </ul>
        <div className="pt-1">
          <ScenarioPicker variant="add" addRow />
        </div>
      </section>
    )
  }
  // entries come reference first, then focus, so both stay among the chips shown
  const shown = entries.slice(0, HEADER_MAX)
  const hidden = entries.length - shown.length
  return (
    <section aria-label="Scenarios" data-testid="scenario-list" data-orientation="horizontal" className="glass flex min-w-0 flex-wrap items-center gap-2 rounded-[22px] py-[7px] pl-4 pr-2">
      <span className="mr-1 font-body text-[13px] font-semibold text-[var(--mute)]">Scenarios</span>
      <ul className="contents">
        {shown.map(item)}
        {reference}
      </ul>
      <ScenarioPicker variant="add" addLabel={hidden > 0 ? `+${hidden} more` : undefined} />
      {showCompare && (
        <span className="ml-auto">
          <CompareToggle compact on={compare} onChange={setCompare} />
        </span>
      )}
    </section>
  )
}
