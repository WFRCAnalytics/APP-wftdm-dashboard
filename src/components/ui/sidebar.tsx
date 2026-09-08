import * as React from 'react'
import { PanelLeft } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

// Hand-authored against shadcn's real Sidebar STRUCTURE/API surface —
// SidebarProvider/Sidebar/SidebarHeader/SidebarContent/SidebarFooter/
// SidebarMenu/SidebarMenuItem/SidebarMenuButton/SidebarTrigger/useSidebar,
// collapsible="icon" mode only — NOT a verbatim port of shadcn's
// `new-york-v4` registry source (research.md §1: that source imports from
// the unified `radix-ui` meta-package and likely Tailwind v4-only syntax,
// neither of which this repo's legacy-registry/Tailwind-v3 stack supports —
// the same dual-registry-track mismatch `chart.tsx`'s own research already
// found and avoided for 029-shadcn-chart-panel).
//
// Deliberately narrower than shadcn's own generic implementation
// (research.md §2, checked package-by-package against what THIS app's own
// architecture actually needs, not assumed):
// - No `SidebarMenuButton` `asChild`/`Slot` polymorphism — this app has no
//   client-side router (confirmed via direct read of the former
//   navBar.tsx's own Tabs.onValueChange wiring); every menu button is a
//   plain <button onClick={...}>, never an <a href> standing in for real
//   navigation. This is also why SidebarMenuButton renders role
//   (implicitly "button", not "link") — a real accessibility choice, not
//   an oversight: no URI navigation happens on click.
// - No `SidebarGroup`/Radix Collapsible for the accordion sub-nav — a
//   single source of truth (which tab is active) already exists;
//   sidebarNav.tsx applies plain conditional rendering with manual
//   aria-expanded/role="group" instead (research.md §2).
// - No `Sheet` mobile off-canvas overlay — below the narrow-viewport
//   breakpoint, the SAME icon-collapsed state the manual toggle produces
//   applies automatically (research.md §4), not a second interaction mode.
// - No `Skeleton`/`Input` sub-components — neither has a real need in this
//   app (research.md §2).
// - `open`/`setOpen` is plain in-memory React state, reset to the default
//   on every load — no `document.cookie` write (shadcn's own real default,
//   confirmed via source read: `SIDEBAR_COOKIE_NAME = "sidebar_state"`),
//   no `localStorage`/`sessionStorage` (research.md §3 — a stricter
//   posture than shadcn's own default, matching this app's own established
//   "viewer UI preferences don't persist across reloads" convention,
//   state/basemapState.ts's own precedent).

const SIDEBAR_WIDTH_EXPANDED = 'w-64' // 16rem/256px
const SIDEBAR_WIDTH_COLLAPSED = 'w-16' // 4rem/64px
const MOBILE_BREAKPOINT_PX = 768 // Tailwind's own `md` breakpoint

type SidebarState = 'expanded' | 'collapsed'

interface SidebarContextValue {
  state: SidebarState
  open: boolean
  setOpen: (open: boolean) => void
  toggleSidebar: () => void
  isMobile: boolean
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

export function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

export function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpenState] = React.useState(defaultOpen)
  const [isMobile, setIsMobile] = React.useState(false)
  // Distinguishes an AUTOMATIC narrow-viewport collapse (research.md §4)
  // from a real manual click — once the viewer manually toggles, viewport
  // changes stop overriding their own choice; only the FIRST narrow-
  // viewport detection (mount, or a later resize past the breakpoint that
  // hasn't yet been manually overridden) auto-collapses.
  const userToggledRef = React.useRef(false)

  const setOpen = React.useCallback((next: boolean) => {
    userToggledRef.current = true
    setOpenState(next)
  }, [])

  const toggleSidebar = React.useCallback(() => {
    setOpen(!open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`)
    const apply = () => {
      setIsMobile(mq.matches)
      if (mq.matches && !userToggledRef.current) {
        setOpenState(false)
      }
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const state: SidebarState = open ? 'expanded' : 'collapsed'

  const value = React.useMemo<SidebarContextValue>(
    () => ({ state, open, setOpen, toggleSidebar, isMobile }),
    [state, open, setOpen, toggleSidebar, isMobile],
  )

  return (
    <SidebarContext.Provider value={value}>
      <div className="flex min-h-screen w-full bg-background text-foreground">{children}</div>
    </SidebarContext.Provider>
  )
}

export function Sidebar({ children, className }: { children: React.ReactNode; className?: string }) {
  const { state } = useSidebar()
  return (
    <aside
      data-sidebar="sidebar"
      data-state={state}
      className={cn(
        // wftdm-design-system's own Elevation section: shadow-md is this
        // app's established default resting elevation for persistent UI
        // chrome (cards, dropdown menus, the OLD position: fixed header
        // this sidebar replaces) — a sticky, always-visible nav surface
        // sitting beside scrolling content is the same category of thing,
        // not a deviation requiring a new one-off value.
        'sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-card shadow-md transition-[width] duration-200 ease-linear',
        state === 'expanded' ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED,
        className,
      )}
    >
      {children}
    </aside>
  )
}

export function SidebarHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-2 p-4">{children}</div>
      <Separator />
    </div>
  )
}

export function SidebarContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden py-2', className)}>
      {children}
    </div>
  )
}

export function SidebarFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col', className)}>
      <Separator />
      <div className="p-4">{children}</div>
    </div>
  )
}

// Spreads arbitrary props (role/aria-label/etc.) — the primitive itself
// stays role-agnostic; a specific consumer (sidebarNav.tsx) decides
// whether its own menu is semantically a tablist.
export const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ children, className, ...props }, ref) => (
  <ul ref={ref} className={cn('flex flex-col gap-1 px-2', className)} {...props}>
    {children}
  </ul>
))
SidebarMenu.displayName = 'SidebarMenu'

export function SidebarMenuItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <li className={cn('list-none', className)}>{children}</li>
}

export interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean
}

// A plain <button>, never an <a>/asChild-polymorphic element — see this
// file's own header comment for why (no client-side router exists). No
// default aria-current/aria-selected here — the primitive stays
// role-agnostic; the caller (sidebarNav.tsx) passes whichever ARIA
// attribute actually matches its own semantics (role="tab" +
// aria-selected for the primary mutually-exclusive-view switcher).
export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, isActive = false, children, ...props }, ref) => {
    const { state } = useSidebar()
    return (
      <button
        ref={ref}
        type="button"
        data-sidebar="menu-button"
        data-active={isActive || undefined}
        className={cn(
          'flex w-full items-center gap-3 overflow-hidden rounded-md px-2.5 py-2 text-left font-heading text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive && 'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground',
          state === 'collapsed' && 'justify-center px-0',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  },
)
SidebarMenuButton.displayName = 'SidebarMenuButton'

export function SidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar, state } = useSidebar()
  return (
    <button
      type="button"
      aria-label="Toggle sidebar"
      onClick={toggleSidebar}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">{state === 'expanded' ? 'Collapse sidebar' : 'Expand sidebar'}</span>
    </button>
  )
}

// The main content area — a plain flex sibling of <Sidebar>, not
// position:fixed/absolute (research.md §5: this is what structurally
// removes the whole ResizeObserver/headerHeight measurement machinery the
// previous position:fixed <header> required — nothing here overlaps page
// content, so nothing needs pixel-measured compensation).
export function SidebarInset({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cn('flex min-h-screen min-w-0 flex-1 flex-col', className)}>{children}</main>
}
