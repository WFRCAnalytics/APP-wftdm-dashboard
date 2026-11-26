import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'

import { cn } from '@/lib/utils'

// One 48px item of the floating navigation (project-docs/redesign/02-layout-and-components.md §1.1): a 20px icon plus a
// label that fades in while the nav is expanded. The label stays in the DOM so the button keeps its accessible name
// when the nav is collapsed.
export interface NavButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  selected?: boolean
}

/** The look of one nav item, shared by the buttons and the documentation link so they cannot drift apart. 48px tall with
 * 14px side padding: the 20px icon has 14px of air on every side, so the collapsed rail's selected pill is a 48 x 48 square
 * and the icon sits at the same place collapsed and expanded. */
export const NAV_ITEM_CLASS = cn(
  'flex h-12 w-full items-center gap-3 overflow-hidden rounded-[15px] px-[14px] text-left font-body text-[14px] font-medium text-[var(--mute)] transition-colors',
  'hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-[var(--ink)]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
)
// TRIAL: the selected tab drawn as a selected pill part (.pill-on), like the theme control. The previous tint was:
// 'bg-[color-mix(in_srgb,var(--brand)_26%,var(--tile))] text-[var(--ink)] [&_svg]:text-[var(--brand-text)]'
const NAV_SELECTED_CLASS = 'pill-on hover:text-[var(--pill-on-fg)]'
const NAV_LABEL_CLASS = 'truncate opacity-0 transition-opacity duration-150 group-data-[state=expanded]/nav:opacity-100'

/**
 * A nav item that opens an address in a new tab (the model documentation link): an anchor, never a script address. A small,
 * muted arrow after the label says it leaves the app; it lives in the label, so like the label it shows only when expanded.
 */
export function NavLink({ href, icon, children }: { href: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={NAV_ITEM_CLASS}>
      {icon && <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>}
      <span className={cn(NAV_LABEL_CLASS, 'flex min-w-0 items-center gap-1')}>
        <span className="truncate">{children}</span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
      </span>
    </a>
  )
}

export const NavButton = forwardRef<HTMLButtonElement, NavButtonProps>(function NavButton(
  { icon, selected, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(NAV_ITEM_CLASS, selected && NAV_SELECTED_CLASS, className)}
      {...props}
    >
      {icon && <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>}
      <span className={NAV_LABEL_CLASS}>{children}</span>
    </button>
  )
})
