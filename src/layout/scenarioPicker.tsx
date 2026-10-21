import { useMemo, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

import { MiniButton } from '@/components/ui/mini-button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { useScenarioList } from '@/hooks/useScenarioList'
import { useResolvedView } from '@/hooks/useViewContext'
import { resolveScenarioColor, resolveScenarioLabel } from '@/panels/scenarioDisplay'
import { alternativeOf, runKindOf } from '@/services/runResolution'
import { getState, setAlternativeActive, setFocus, setReference } from '@/state/compareState'
import { cn } from '@/lib/utils'

// The scenario picker (project-docs/redesign/02-layout-and-components.md section 1.3, without the calibration-round
// strip, which arrives with P9): choose which independent scenarios are compared, the focus and the reference.

export function ScenarioPicker() {
  const view = useResolvedView()
  const runs = useScenarioList()
  const display = useScenarioDisplay()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // One row per independent scenario, showing its run for the current year.
  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: { alt: string; run: string; label: string; color?: string; active: boolean }[] = []
    for (const s of runs) {
      const alt = alternativeOf(s)
      if (seen.has(alt) || runKindOf(s) !== 'scenario') continue
      seen.add(alt)
      const forYear = runs.find((r) => alternativeOf(r) === alt && (r.year === view.year || r.year === undefined)) ?? s
      out.push({
        alt,
        run: forYear.name,
        label: resolveScenarioLabel(forYear.name, display),
        color: resolveScenarioColor(forYear.name, display),
        active: runs.filter((r) => alternativeOf(r) === alt).some((r) => r.name === forYear.name && r.active),
      })
    }
    return out
  }, [runs, display, view.year])

  const visible = rows.filter((r) => r.label.toLowerCase().includes(search.trim().toLowerCase()))
  const selected = rows.filter((r) => r.active)
  const dots = selected.slice(0, 6)

  function toggle(alt: string, on: boolean) {
    setAlternativeActive(alt, on)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose scenarios to compare"
          data-testid="scenario-picker-button"
          className="inline-flex h-[38px] items-center gap-2 rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] pl-[14px] pr-[10px] font-body text-[13px] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
        >
          <span className="flex items-center" aria-hidden="true">
            {dots.map((d, i) => (
              <span
                key={d.alt}
                className="inline-block size-[14px] rounded-full ring-2 ring-[var(--tile-hi)]"
                style={{ background: d.color ?? 'var(--mute)', marginLeft: i === 0 ? 0 : -4 }}
              />
            ))}
          </span>
          <span>
            <b className="font-semibold">{selected.length}</b> selected
          </span>
          <ChevronDown className="size-4 text-[var(--mute)]" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        role="dialog"
        aria-label="Scenarios to compare"
        className="w-[min(580px,calc(100vw-24px))] rounded-[22px] border-[var(--glass-line)] bg-[var(--surface)] p-3"
      >
        <div className="flex items-center gap-2">
          <input
            type="search"
            aria-label="Search scenarios"
            placeholder={`Search ${rows.length} scenarios`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] px-4 font-body text-[13px] text-[var(--ink)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--brand-text)]"
          />
          <MiniButton onClick={() => rows.forEach((r) => toggle(r.alt, true))}>All</MiniButton>
          <MiniButton
            onClick={() => {
              const focus = getState().focus
              rows.forEach((r) => toggle(r.alt, r.alt === focus))
            }}
          >
            Clear
          </MiniButton>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="rounded-full p-1.5 text-[var(--mute)] hover:text-[var(--ink)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <ul className="mt-3 flex max-h-[min(380px,52vh)] flex-col gap-1 overflow-y-auto" aria-label="Scenarios">
          {visible.map((r) => {
            const isFocus = view.focus === r.alt
            const isReference = view.referenceKind === 'scenario' && view.reference === r.alt
            return (
              <li
                key={r.alt}
                data-testid={`picker-row-${r.alt}`}
                className="grid grid-cols-[20px_14px_1fr_auto_auto] items-center gap-3 rounded-[14px] px-2 py-1.5 hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
              >
                <input
                  type="checkbox"
                  aria-label={`Compare ${r.label}`}
                  checked={r.active}
                  onChange={(e) => toggle(r.alt, e.target.checked)}
                  className="size-5 cursor-pointer rounded-[6px]"
                  style={{ accentColor: r.color }}
                />
                <span aria-hidden="true" className="size-[14px] rounded-full" style={{ background: r.color ?? 'var(--mute)' }} />
                <span className="truncate font-body text-[13px] text-[var(--ink)]">{r.label}</span>
                <MiniButton
                  pressed={isFocus}
                  aria-label={`Focus ${r.label}`}
                  onClick={() => {
                    setFocus(r.alt)
                    toggle(r.alt, true)
                  }}
                >
                  Focus
                </MiniButton>
                <MiniButton
                  pressed={isReference}
                  aria-label={`Reference ${r.label}`}
                  onClick={() => setReference({ kind: 'scenario', name: r.alt })}
                >
                  Reference
                </MiniButton>
              </li>
            )
          })}
          {visible.length === 0 && <li className={cn('px-2 py-4 text-center font-body text-[13px] text-[var(--mute)]')}>No scenarios match.</li>}
        </ul>

        <p className="mt-3 border-t border-[var(--line)] pt-2 font-body text-[12.5px] text-[var(--mute)]">
          {selected.length} of {rows.length} compared
        </p>
      </PopoverContent>
    </Popover>
  )
}
