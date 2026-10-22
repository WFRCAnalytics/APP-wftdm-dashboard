import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'

import { cn } from '@/lib/utils'

// Sticky page header (project-docs/redesign/02-layout-and-components.md §1.2): title and subtitle on the left, the
// control bar slot on the right. As soon as the page starts to scroll it eases into its compact form: tighter padding, a
// blurred backdrop, a smaller title and the subtitle folding away. It is sticky from the first pixel of scroll, so it must
// not stay large for long, or the content would slide up underneath a still-visible subtitle. There is deliberately no
// line under it, compact or not.
export interface PageHeaderProps {
  title: string
  subtitle?: string
  /** The control bar; rendered at the right (wrapping internally when wide), under the title below 900px. */
  children?: ReactNode
  /** Present only below 760px, where the nav is a sheet opened from here. */
  onMenu?: () => void
}

const COMPACT_ENTER = 8
const COMPACT_EXIT = 2

export function PageHeader({ title, subtitle, children, onMenu }: PageHeaderProps) {
  const [scrolledCompact, setCompact] = useState(false)
  const compact = scrolledCompact
  const headerRef = useRef<HTMLElement>(null)
  const expandedHeight = useRef(0)
  const [shrink, setShrink] = useState(0)

  // Hysteresis: it turns compact past COMPACT_ENTER and only expands again below COMPACT_EXIT, so a scroll position near
  // one threshold cannot flip it back and forth.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setCompact((c) => (c ? y > COMPACT_EXIT : y > COMPACT_ENTER))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Scroll anchoring would otherwise nudge scrollY when the header changes height, which can cross a threshold and flip the
  // state again; the header already keeps the page height steady, so nothing needs anchoring here.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.overflowAnchor
    root.style.overflowAnchor = 'none'
    return () => {
      root.style.overflowAnchor = previous
    }
  }, [])

  // The compact header is shorter, which would shrink the page and move scrollY, which could expand it again (the flicker
  // at one scroll point). So the page keeps the expanded header's footprint: a negative bottom margin gives back exactly
  // the height the header has lost so far, and nothing below it moves. The height now animates, so this follows it
  // frame by frame (the ResizeObserver fires as the box changes) instead of snapping when the state flips.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => {
      if (!compact) expandedHeight.current = el.offsetHeight
      setShrink(Math.max(0, expandedHeight.current - el.offsetHeight))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compact])

  return (
    <header
      ref={headerRef}
      style={{ marginBottom: -shrink }}
      data-compact={compact ? 'true' : 'false'}
      className={cn(
        'group/header sticky top-0 z-30 flex items-center justify-between max-[899px]:flex-wrap gap-x-5 gap-y-[14px] pl-[14px] pr-7 transition-[padding,background-color,backdrop-filter] duration-[260ms] ease-out',
        compact
          ? 'bg-[color-mix(in_srgb,var(--bg)_84%,transparent)] py-[10px] backdrop-blur-[14px]'
          : 'pb-3 pt-[26px]',
      )}
    >
      <div className="flex min-w-0 items-center gap-3 min-[900px]:flex-1">
        {onMenu && (
          <button
            type="button"
            aria-label="Open navigation"
            onClick={onMenu}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <div className="min-w-0">
          <h1 style={{ lineHeight: 1.08 }} className={cn('line-clamp-2 font-heading font-bold tracking-[-0.025em] text-[var(--ink)] transition-[font-size] duration-[260ms] ease-out', compact ? 'text-[21px]' : 'text-[clamp(28px,3.2vw,40px)]')}>{title}</h1>
          {subtitle && (
            // The subtitle folds away (row height 1fr to 0fr, fading) instead of vanishing, and its top gap lives inside the
            // folding row so the gap closes with it. visibility flips at the end of the fade, so it is also out of the
            // accessibility tree and the tab order once gone.
            <div
              aria-hidden={compact}
              className={cn(
                'grid transition-[grid-template-rows,opacity,visibility] duration-[260ms] ease-out',
                compact ? 'invisible grid-rows-[0fr] opacity-0' : 'visible grid-rows-[1fr] opacity-100',
              )}
            >
              <div className="overflow-hidden">
                <p className="pt-[6px] font-body text-[15px] text-[var(--mute)]">{subtitle}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Stays at the right at desktop widths in every state: a wide bar (Compare on) wraps inside this area instead of
          dropping under the title. Below 900px there is no room beside the title, so it takes its own row. */}
      {children && (
        <div className="flex min-w-0 flex-none justify-end max-[899px]:basis-full max-[899px]:justify-start min-[900px]:max-w-[78%]">{children}</div>
      )}
    </header>
  )
}
