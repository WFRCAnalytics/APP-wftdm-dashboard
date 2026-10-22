import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'

import { cn } from '@/lib/utils'

// Sticky page header (project-docs/redesign/02-layout-and-components.md §1.2): title and subtitle on the left, the
// control bar slot on the right. After 70px of scroll it turns compact: tighter padding, a blurred backdrop, a hairline
// underneath, a smaller title and no subtitle.
export interface PageHeaderProps {
  title: string
  subtitle?: string
  /** The control bar; rendered at the right (wrapping internally when wide), under the title below 900px. */
  children?: ReactNode
  /** Present only below 760px, where the nav is a sheet opened from here. */
  onMenu?: () => void
  /** Tabbed pages do not scroll, so the header stays in its compact form. */
  forceCompact?: boolean
}

const COMPACT_ENTER = 80
const COMPACT_EXIT = 24

export function PageHeader({ title, subtitle, children, onMenu, forceCompact }: PageHeaderProps) {
  const [scrolledCompact, setCompact] = useState(false)
  const compact = scrolledCompact || Boolean(forceCompact)
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
  // at one scroll point). So the page keeps the expanded header's footprint: while compact, a negative bottom margin
  // gives back exactly the height it lost, and nothing below it moves.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => {
      if (!compact) expandedHeight.current = el.offsetHeight
      setShrink(compact ? Math.max(0, expandedHeight.current - el.offsetHeight) : 0)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compact])

  return (
    <header
      ref={headerRef}
      style={{ marginBottom: compact ? -shrink : 0 }}
      data-compact={compact ? 'true' : 'false'}
      className={cn(
        'group/header sticky top-0 z-30 flex items-center justify-between max-[899px]:flex-wrap gap-x-5 gap-y-[14px] pl-[14px] pr-7 transition-[padding,background-color] duration-200',
        compact
          ? 'bg-[color-mix(in_srgb,var(--bg)_84%,transparent)] py-[10px] shadow-[0_1px_0_var(--glass-line)] backdrop-blur-[14px]'
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
          <h1 style={{ lineHeight: 1.08 }} className={cn('line-clamp-2 font-heading font-bold tracking-[-0.025em] text-[var(--ink)]', compact ? 'text-[21px]' : 'text-[clamp(28px,3.2vw,40px)]')}>{title}</h1>
          {subtitle && !compact && <p className="mt-[6px] font-body text-[15px] text-[var(--mute)]">{subtitle}</p>}
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
