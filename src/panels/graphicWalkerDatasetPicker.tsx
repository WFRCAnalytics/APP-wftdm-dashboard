import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Database, Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// 028-graphic-walker-dataset-picker, restyled for the 063 redesign: a pill
// trigger (muted "Table" label + current value, matching PillSelect) that
// opens a searchable combobox. The list is long (every table queryable
// across the active scenarios), so a type-to-filter box leads the popover;
// arrow keys move the highlight, Enter picks, Esc closes (Radix Popover).
// A hand-rolled listbox rather than cmdk: it is one small component and
// adds no dependency.
export function DatasetPicker({
  current,
  options,
  onSelect,
}: {
  current: string
  options: string[]
  onSelect: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const openRef = useRef(false)
  // Characters typed on the trigger before the popover has mounted and
  // focused its search box; becomes the initial query when it opens.
  const seedRef = useRef('')
  openRef.current = open

  // Substring match with underscores/spaces treated alike, so "trip mode"
  // finds trip_mode_share.
  const filtered = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, ' ')
    const q = norm(query.trim())
    return q ? options.filter((name) => norm(name).includes(q)) : options
  }, [options, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    // Open on the current selection so the viewer sees where they are —
    // unless they started typing, in which case show the matches.
    const seed = seedRef.current
    seedRef.current = ''
    setQuery(seed)
    setActive(seed ? 0 : Math.max(0, options.indexOf(current)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open, filtered])

  function choose(name: string) {
    if (name !== current) onSelect(name)
    setOpen(false)
  }

  // Typing on the focused trigger opens the search (and keeps accepting
  // characters until the search box takes focus), so a quick click-then-
  // type never drops its first keystrokes.
  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key.length === 1 && e.key !== ' ') {
      e.preventDefault()
      if (openRef.current) setQuery((q) => q + e.key)
      else {
        seedRef.current = e.key
        setOpen(true)
      }
    } else if (e.key === 'Enter' && openRef.current) {
      e.preventDefault()
      const pick = filtered[active]
      if (pick) choose(pick)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(Math.max(filtered.length - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filtered[active]
      if (pick) choose(pick)
    }
  }

  if (options.length === 0) {
    // No functioning control when there's nothing to pick from (spec.md
    // Edge Cases — e.g. a picker-enabled panel pinned to a scenario that
    // was never registered) — a plain, non-interactive pill, never an
    // empty/broken popover.
    return (
      <div className="mb-3">
        <div className="inline-flex h-[38px] items-center gap-2 rounded-full border border-dashed border-[var(--glass-line)] px-[14px] font-body text-sm text-[var(--mute)]">
          <Database className="h-4 w-4" />
          No dataset available to explore
        </div>
      </div>
    )
  }

  const listId = 'gw-dataset-list'
  return (
    <div className="mb-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            onKeyDown={onTriggerKeyDown}
            aria-label="Choose dataset to explore"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="inline-flex h-[38px] max-w-full items-center gap-2 rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] pl-[14px] pr-3 font-body shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-[var(--mute)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
          >
            <Database className="h-4 w-4 shrink-0 text-[var(--mute)]" />
            <span className="text-xs text-[var(--mute)]">Table</span>
            <span className="truncate text-sm font-medium text-[var(--ink)]">{current}</span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-[var(--mute)] transition-transform', open && 'rotate-180')} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(22rem,var(--radix-popover-content-available-width))] p-0"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
          // Radix returns focus to the trigger when the popover finishes
          // closing. If the viewer has already re-opened it (a quick second
          // pick), that late return would steal focus from the search box,
          // so only restore focus while the popover is still closed.
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            if (!openRef.current) triggerRef.current?.focus()
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              aria-label="Search tables"
              placeholder={`Search ${options.length} tables…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className="h-10 w-full bg-transparent font-body text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Tables"
            className="scrollbar-thin max-h-72 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center font-body text-sm text-muted-foreground">
                No tables match “{query}”
              </li>
            ) : (
              filtered.map((name, i) => {
                const selected = name === current
                return (
                  <li
                    key={name}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={selected}
                    data-active={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(name)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 font-body text-sm text-foreground',
                      i === active && 'bg-accent text-accent-foreground',
                    )}
                  >
                    <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{name}</span>
                  </li>
                )
              })
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}
