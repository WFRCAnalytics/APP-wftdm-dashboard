import { useEffect, useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'

import { cn } from '@/lib/utils'

// Sticky page header (project-docs/redesign/02-layout-and-components.md §1.2): title and subtitle on the left, the
// control bar slot on the right. After 70px of scroll it turns compact: tighter padding, a blurred backdrop, a hairline
// underneath, a smaller title and no subtitle.
export interface PageHeaderProps {
  title: string
  subtitle?: string
  /** The control bar; rendered at the right, wrapping under the title on narrow screens. */
  children?: ReactNode
  /** Present only below 760px, where the nav is a sheet opened from here. */
  onMenu?: () => void
}

export function PageHeader({ title, subtitle, children, onMenu }: PageHeaderProps) {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 70)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      data-compact={compact ? 'true' : 'false'}
      className={cn(
        'sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-7 transition-[padding,background-color] duration-200',
        compact
          ? 'bg-[color-mix(in_srgb,var(--bg)_84%,transparent)] py-[10px] shadow-[0_1px_0_var(--glass-line)] backdrop-blur-[14px]'
          : 'py-6',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
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
          <h1 className={cn('font-heading font-semibold tracking-tight text-[var(--ink)]', compact ? 'text-[21px]' : 'text-[28px]')}>{title}</h1>
          {subtitle && !compact && <p className="mt-1 font-body text-sm text-[var(--mute)]">{subtitle}</p>}
        </div>
      </div>
      {children}
    </header>
  )
}
