import { isValidElement, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { HeaderNeedContext } from '@/components/ui/headerNeedContext'
import { headerFit } from '@/lib/headerFit'
import { cn } from '@/lib/utils'

// A tile's title row and the row below it, laid out by measuring, so no tile needs placing by hand. The row is: title, the
// controls in priority order, the view switch (right-aligned, filling what is left), the tools. Every control sits on the title
// row while it fits; when it does not, the last ones go to the row below (with the badges) before the view switch gives up its
// labels (lib/headerFit.ts). Used by the card (tile.tsx) and the expanded dialog (panelExpandHost.tsx).
//
// Both rows are one wrapping flex container and a control changes row by its CSS order only (after a full-width break), never
// by moving in the DOM: a moved control would remount, and a select's first frame (before its label is filled in) is narrower,
// which would bounce it back up.

const GAP = 8 // gap-2 between the title row's items

export interface TileHeaderProps {
  /** The title (and its info button): children of the row itself, not wrapped (specs find a tile two levels up from its title). */
  lead: ReactNode
  /** Controls in priority order; each needs a `key`. */
  items: ReactNode[]
  /** The view switch: right-aligned, takes the room left over. */
  view?: ReactNode
  /** Layout, Export, Expand. */
  tools?: ReactNode
  /** Shown on the title row when it holds no control, otherwise first on the row below. */
  badges?: ReactNode
  className?: string
}

const keyOf = (item: ReactNode, i: number): string => (isValidElement(item) && item.key != null ? String(item.key) : `item-${i}`)

// the row below: after the break, 10px under the line above it (and between its own lines when it wraps)
const BELOW = 'order-3 mt-[10px]'

export function TileHeader({ lead, items, view, tools, badges, className }: TileHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const [need, setNeed] = useState(0)
  const [fit, setFit] = useState(items.length)
  const [, setTick] = useState(0)
  const keys = items.map(keyOf)
  const keyList = keys.join('|')

  const reportNeed = useCallback((w: number) => setNeed((n) => (n === w ? n : w)), [])

  // measure after every render (a control's label may have changed) and whenever anything resizes (the tile, a font loading)
  useLayoutEffect(() => {
    const header = headerRef.current
    // not laid out yet (a hidden tab): keep what we have
    if (!header || header.clientWidth === 0) return
    const widths = new Map<string, number>()
    header.querySelectorAll<HTMLElement>(':scope > [data-fit-key]').forEach((item) => widths.set(item.dataset.fitKey ?? '', item.offsetWidth))
    const style = getComputedStyle(header)
    const width = header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const lead = [...header.children].filter((c) => !c.hasAttribute('data-fit-part')) as HTMLElement[]
    const leadWidth = lead.reduce((sum, c) => sum + c.offsetWidth + GAP, 0)
    const room = width - leadWidth - (toolsRef.current?.offsetWidth ?? 0) - GAP
    const n = headerFit(room, keys.map((k) => widths.get(k) ?? 0), view ? need : 0, GAP)
    setFit((f) => (f === n ? f : n))
  })
  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(header)
    for (const c of header.children) if (!c.hasAttribute('data-fit-part') || c.hasAttribute('data-fit-key') || c === toolsRef.current) ro.observe(c)
    return () => ro.disconnect()
  }, [keyList])

  const badgesInRow = !view && items.length === 0
  const badgesBelow = !badgesInRow && Boolean(badges)
  const anyBelow = badgesBelow || fit < items.length
  return (
    <div ref={headerRef} className={cn('flex flex-row items-center gap-x-2', anyBelow && 'flex-wrap', className)}>
      {lead}
      {badgesInRow && badges}
      {badgesBelow && <div data-fit-part="" className={cn(BELOW, 'flex flex-wrap items-center gap-2')}>{badges}</div>}
      {items.map((item, i) => (
        <div key={keys[i]} data-fit-key={keys[i]} data-fit-part="" data-export-skip="" className={cn('flex shrink-0 items-center', i >= fit && BELOW)}>
          {item}
        </div>
      ))}
      {view ? (
        <div data-fit-part="" data-export-skip="" className="order-1 flex min-w-0 flex-1 items-center justify-end">
          <HeaderNeedContext.Provider value={reportNeed}>{view}</HeaderNeedContext.Provider>
        </div>
      ) : (
        <span data-fit-part="" className="order-1 flex-1" />
      )}
      <div ref={toolsRef} data-fit-part="" className="order-1 flex shrink-0 items-center gap-2">{tools}</div>
      {anyBelow && <div data-fit-part="" aria-hidden="true" className="order-2 h-0 basis-full" />}
    </div>
  )
}
