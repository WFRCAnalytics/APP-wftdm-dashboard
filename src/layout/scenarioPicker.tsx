import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, X } from 'lucide-react'

import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { useScenarioList } from '@/hooks/useScenarioList'
import { useResolvedView } from '@/hooks/useViewContext'
import { resolveScenarioColor, resolveScenarioLabel } from '@/panels/scenarioDisplay'
import { alternativeOf, runKindOf } from '@/services/runResolution'
import { getState, setAlternativeActive, setFocus, setReference } from '@/state/compareState'
import { openSettings } from '@/state/settingsState'
import { cn } from '@/lib/utils'

// The scenario picker (project-docs/redesign/02-layout-and-components.md section 1.3, without the calibration-round strip,
// which arrives with P9): choose which independent scenarios are compared, the focus and the reference. A fixed glass
// panel under the control bar, like the prototype; Esc, the close button or a click outside closes it.

function MiniPill({ pressed, label, onClick, children }: { pressed: boolean; label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'h-7 rounded-full border px-[11px] font-body text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
        pressed ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]' : 'border-[var(--glass-line)] text-[var(--mute)] hover:text-[var(--ink)]',
      )}
    >
      {children}
    </button>
  )
}

export function ScenarioPicker() {
  const view = useResolvedView()
  const runs = useScenarioList()
  const display = useScenarioDisplay()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

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
        active: forYear.active,
      })
    }
    return out
  }, [runs, display, view.year])

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const visible = rows.filter((r) => r.label.toLowerCase().includes(search.trim().toLowerCase()))
  const selected = rows.filter((r) => r.active)
  const dots = selected.slice(0, 6)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Choose scenarios to compare"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="scenario-picker-button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-[38px] items-center gap-2 rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] pl-[14px] pr-[6px] font-body text-sm text-[var(--ink)] shadow-[inset_0_1px_0_var(--hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
      >
        <span className="inline-flex" aria-hidden="true">
          {dots.map((d, i) => (
            <i
              key={d.alt}
              className="inline-block rounded-full border-2 border-[var(--tile-hi)]"
              style={{ background: d.color ?? 'var(--mute)', marginLeft: i === 0 ? 0 : -4, width: 14, height: 14, boxSizing: 'content-box' }}
            />
          ))}
        </span>
        <span>
          <b className="font-semibold">{selected.length}</b> <small className="text-xs text-[var(--mute)]">selected</small>
        </span>
        <span className="grid size-7 place-items-center text-[var(--mute)]" aria-hidden="true">
          <ChevronUp className={cn('size-[14px] transition-transform', !open && 'rotate-180')} />
        </span>
      </button>

      {open &&
        // portalled out of the control bar: its backdrop-filter would otherwise become the containing block of this fixed panel
        createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Scenarios to compare"
          data-testid="scenario-picker"
          className="glass fixed right-7 top-[84px] z-[45] flex max-h-[min(560px,72vh)] w-[min(580px,calc(100%-24px))] flex-col overflow-hidden rounded-[22px]"
        >
          <div className="flex flex-wrap items-center gap-[10px] px-4 pb-[10px] pt-[14px]">
            <input
              ref={searchRef}
              type="search"
              aria-label="Search scenarios"
              placeholder={`Search ${rows.length} scenarios`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 min-w-[140px] flex-1 rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] px-[14px] font-body text-sm text-[var(--ink)] outline-offset-2 placeholder:text-[var(--mute)] focus-visible:outline-2 focus-visible:outline-[var(--brand-text)]"
            />
            <div className="flex gap-[6px]">
              {(['All', 'Clear'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    const focus = getState().focus
                    rows.forEach((r) => setAlternativeActive(r.alt, l === 'All' ? true : r.alt === focus))
                  }}
                  className="h-8 rounded-full border border-[var(--glass-line)] px-3 font-body text-sm text-[var(--mute)] hover:text-[var(--ink)]"
                >
                  {l}
                </button>
              ))}
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
                className="grid h-8 w-8 place-items-center rounded-full border border-[var(--glass-line)] text-[var(--mute)] hover:text-[var(--ink)]"
              >
                <X className="size-[14px]" />
              </button>
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-auto px-2 pb-2" aria-label="Scenarios">
            {visible.map((r) => {
              const isFocus = view.focus === r.alt
              const isReference = view.referenceKind === 'scenario' && view.reference === r.alt
              return (
                <li
                  key={r.alt}
                  data-testid={`picker-row-${r.alt}`}
                  className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 rounded-xl px-[10px] py-[7px] hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={r.active}
                    aria-label={`Compare ${r.label}`}
                    onClick={() => setAlternativeActive(r.alt, !r.active)}
                    className="grid size-5 place-items-center rounded-[6px] border-[1.5px] p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
                    style={r.active ? { background: r.color, borderColor: r.color } : { borderColor: 'var(--mute)' }}
                  >
                    {r.active && (
                      <span className="mb-[2px] block h-[5px] w-[9px] -rotate-45 border-b-2 border-l-2 border-[#04161A]" aria-hidden="true" />
                    )}
                  </button>
                  <span aria-hidden="true" className="size-3 rounded-full" style={{ background: r.color ?? 'var(--mute)' }} />
                  <span className="min-w-0 truncate font-body text-sm font-medium text-[var(--ink)]">{r.label}</span>
                  <MiniPill
                    pressed={isFocus}
                    label={`Focus ${r.label}`}
                    onClick={() => {
                      setFocus(r.alt)
                      setAlternativeActive(r.alt, true)
                    }}
                  >
                    Focus
                  </MiniPill>
                  <MiniPill pressed={isReference} label={`Reference ${r.label}`} onClick={() => setReference({ kind: 'scenario', name: r.alt })}>
                    Reference
                  </MiniPill>
                </li>
              )
            })}
            {visible.length === 0 && <li className="px-2 py-4 text-center font-body text-sm text-[var(--mute)]">No scenarios match.</li>}
          </ul>

          <div className="flex items-center justify-between gap-[10px] border-t border-[var(--line)] px-4 py-[10px] font-body text-[12.5px] text-[var(--mute)]">
            <span>
              {selected.length} of {rows.length} compared
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                openSettings('scenarios')
              }}
              className="text-[var(--brand-text)] hover:underline"
            >
              Edit colours, names and order
            </button>
          </div>
        </div>,
          document.body,
        )}
    </>
  )
}
