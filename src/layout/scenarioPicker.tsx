import { useEffect, useMemo, useRef, useState } from 'react'

import { loadRows } from '@/charts/dataCache'
import { loadFamilyRollup, meanErrorByRound, roundStatus, worstErrorByRound, type RollupRow } from '@/services/familyRollup'
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

const ROUND_TAG = 'Calibration round'

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
    const out: { alt: string; run: string; label: string; color?: string; active: boolean; tag?: string }[] = []
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
        tag: forYear.tag ?? s.tag,
      })
    }
    return out
  }, [runs, display, view.year])

  // Calibration rounds (base year only): one tick each, coloured by the round's worst submodel error.
  const rounds = useMemo(
    () =>
      view.isBaseYear
        ? runs
            .filter((s) => runKindOf(s) === 'round')
            .sort((a, b) => (a.familyIndex ?? 0) - (b.familyIndex ?? 0))
            .map((s) => ({ alt: alternativeOf(s), n: s.familyIndex ?? 0, active: s.active }))
        : [],
    [runs, view.isBaseYear],
  )
  const [rollup, setRollup] = useState<RollupRow[]>([])
  useEffect(() => {
    if (!open || rounds.length === 0) return
    let cancelled = false
    loadFamilyRollup('calibration').then((r) => !cancelled && setRollup(r))
    return () => {
      cancelled = true
    }
  }, [open, rounds.length])
  const worst = useMemo(() => worstErrorByRound(rollup), [rollup])
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  // The sub-line of each row: tag, transit share and VMT of the run for the current year.
  const [kpis, setKpis] = useState<Record<string, { transit?: number; vmt?: number }>>({})
  useEffect(() => {
    if (!open) return
    let cancelled = false
    for (const r of rows) {
      loadRows(r.run, 'summary_kpis').then((k) => {
        const row = k[0]
        if (cancelled || !row) return
        setKpis((prev) => ({ ...prev, [r.run]: { transit: Number(row.transit_share), vmt: Number(row.total_vmt) } }))
      })
    }
    return () => {
      cancelled = true
    }
  }, [open, rows])

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

  const tags = [...new Set(rows.map((r) => r.tag).filter((t): t is string => Boolean(t)))]
  const visible = rows
    .filter((r) => r.label.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((r) => !tagFilter || r.tag === tagFilter)
  const showRounds = rounds.length > 0 && (!tagFilter || tagFilter === ROUND_TAG)
  const selectedRounds = rounds.filter((r) => r.active)
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
          <b className="font-semibold">{selected.length + selectedRounds.length}</b> <small className="text-xs text-[var(--mute)]">selected</small>
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
              placeholder={`Search ${rows.length} scenarios${rounds.length ? ` and ${rounds.length} rounds` : ''}`}
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

          {(tags.length > 0 || rounds.length > 0) && (
            <div className="flex flex-wrap gap-[6px] px-4 pb-2" role="group" aria-label="Filter by tag">
              {[...tags, ...(rounds.length > 0 ? [ROUND_TAG] : [])].map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tagFilter === t}
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  className={cn(
                    'h-7 rounded-full border px-[11px] font-body text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
                    tagFilter === t ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]' : 'border-[var(--glass-line)] text-[var(--mute)] hover:text-[var(--ink)]',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

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
                  <span className="min-w-0">
                    <span className="block truncate font-body text-sm font-medium text-[var(--ink)]">{r.label}</span>
                    <span className="block truncate font-body text-xs text-[var(--mute)]">
                      {[
                        r.tag,
                        kpis[r.run]?.transit !== undefined ? `${(kpis[r.run].transit! * 100).toFixed(1)}% transit` : null,
                        kpis[r.run]?.vmt !== undefined ? `${(kpis[r.run].vmt! / 1e6).toFixed(1)}M VMT` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
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

          {showRounds && (
            <div className="border-t border-[var(--line)] px-4 pb-3 pt-[10px]" data-testid="round-strip-block">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <b className="font-body text-sm font-semibold text-[var(--ink)]">Calibration rounds</b>
                  <small className="ml-2 font-body text-xs text-[var(--mute)]">
                    {rounds.length} rounds · {selectedRounds.length} selected
                  </small>
                </div>
                <div className="flex gap-[6px]">
                  {(
                    [
                      ['Last', () => [rounds[rounds.length - 1]?.n]],
                      ['Best', () => [[...meanErrorByRound(rollup)].sort((a, b) => a[1] - b[1])[0]?.[0]]],
                      ['Every 10th', () => [1, 10, 20, 30, 40, 50]],
                      ['Clear', () => []],
                    ] as const
                  ).map(([label, pick]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        const chosen = new Set(pick().filter((n): n is number => typeof n === 'number'))
                        for (const r of rounds) setAlternativeActive(r.alt, chosen.has(r.n))
                      }}
                      className="h-7 rounded-full border border-[var(--glass-line)] px-[11px] font-body text-[12.5px] text-[var(--mute)] hover:text-[var(--ink)]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex gap-[2px]" role="group" aria-label="Calibration rounds">
                {rounds.map((r) => {
                  const w = worst.get(r.n)
                  const st = w === undefined ? undefined : roundStatus(w)
                  return (
                    <button
                      key={r.alt}
                      type="button"
                      aria-pressed={r.active}
                      aria-label={`Round ${r.n}`}
                      title={w === undefined ? `Round ${r.n}` : `Round ${r.n}: worst error ${w.toFixed(1)}%`}
                      onClick={() => setAlternativeActive(r.alt, !r.active)}
                      className={cn(
                        'h-[30px] min-w-0 flex-1 rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
                        r.active ? 'opacity-100 outline outline-2 outline-[var(--ink)]' : 'opacity-40',
                      )}
                      style={{ background: st === 'ok' ? 'var(--ok)' : st === 'warn' ? 'var(--warn)' : st === 'fail' ? 'var(--fail)' : 'var(--mute)' }}
                    />
                  )
                })}
              </div>
              <small className="mt-1 block font-body text-xs text-[var(--mute)]">
                Each tick is a round, coloured by its worst submodel error. Click to add or remove it from the comparison.
              </small>
            </div>
          )}

          <div className="flex items-center justify-between gap-[10px] border-t border-[var(--line)] px-4 py-[10px] font-body text-[12.5px] text-[var(--mute)]">
            <span>
              {selected.length + selectedRounds.length} of {rows.length + rounds.length} compared
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
