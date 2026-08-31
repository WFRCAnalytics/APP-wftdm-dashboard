import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

// The generic expand-to-dialog mechanism (004-panel-expand-dialog),
// implemented once here so no panel component (current or future) needs
// any awareness it exists. See specs/004-panel-expand-dialog/contracts/
// panel-expand-host.md and research.md §1.
//
// A HOOK, not a wrapping component (a correction found necessary during
// implementation — contracts/panel-expand-host.md originally sketched
// this as <PanelExpandHost>{children}</PanelExpandHost>): the expand
// trigger button belongs in panelCard.tsx's CardHeader, but the panel's
// actual content must visually render in CardContent — a single
// component invocation can only place its whole output as siblings at
// one point in the JSX tree, but a hook can hand back multiple pieces of
// UI (`trigger`, `body`) from one persistent set of state/refs, letting
// the caller place each piece wherever it visually belongs while the
// underlying mechanism (the state, the portal, the Dialog) still exists
// exactly once.
//
// NOT "swap createPortal's target directly" — a second, more fundamental
// correction found necessary during implementation, this one empirically
// (a real, measured Playwright regression: a debug query-count log showed
// the panel's data-fetch effect genuinely re-running on both expand AND
// collapse, and a chart's container attribute marker was genuinely lost
// across expand — both proof of a real remount, not merely a redraw).
// The original design (research.md §1's Candidate C, as first written)
// assumed `createPortal(children, targetNode)` at the same JSX position
// preserves `children`'s mounted state when only `targetNode` changes
// between renders. Empirically, it does not: React's reconciliation of a
// portal keys on its container argument, and a changed container is
// treated as a genuinely different portal, unmounting the old one's
// subtree and mounting a new one — not a lightweight reparent the way a
// host element's changed prop would be.
//
// The corrected, proven technique (the same one libraries like
// react-reverse-portal use for exactly this "move live DOM without
// remounting" problem, e.g. keeping a <video> playing across a
// fullscreen transition): portal `children` into ONE persistent DOM node
// (`portalHostRef.current`, a bare `document.createElement('div')`
// created lazily once and never replaced) — `createPortal`'s container
// argument therefore never changes across renders, so React's portal
// reconciliation only ever sees a children update, never a container
// change. That persistent node is then imperatively moved — a plain
// `appendChild`, entirely outside React's own reconciliation — between
// two ordinary, React-rendered "anchor" elements (`inlineAnchor` inside
// the card, `dialogAnchor` inside the Dialog) whenever `expanded`
// changes, inside a `useLayoutEffect` so the move happens synchronously
// before paint (no visible flash) and — critically — before any
// passive-effect child (e.g. PlotlyPanel's own data-fetch/`Plotly.react()`
// effect) runs; React flushes every layout effect in a commit before any
// regular effect, so by the time a portaled panel's own `useEffect` reads
// its container's real layout dimensions, this hook's DOM move has
// already attached it to a visible anchor.
export function usePanelExpandHost(
  title: string,
  children: ReactNode,
  options?: { height?: number },
): { trigger: ReactNode; body: ReactNode } {
  const [expanded, setExpanded] = useState(false)
  const [inlineAnchor, setInlineAnchor] = useState<HTMLDivElement | null>(null)
  const [dialogAnchor, setDialogAnchor] = useState<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Lazy-created once, on first render, and never replaced — see the
  // comment above for why this specific node must never change identity.
  const portalHostRef = useRef<HTMLDivElement | null>(null)
  if (!portalHostRef.current) {
    portalHostRef.current = document.createElement('div')
    portalHostRef.current.style.height = '100%'
    portalHostRef.current.style.width = '100%'
  }

  useLayoutEffect(() => {
    const host = portalHostRef.current
    const target = expanded && dialogAnchor ? dialogAnchor : inlineAnchor
    if (host && target && host.parentElement !== target) {
      target.appendChild(host)
    }
  }, [expanded, inlineAnchor, dialogAnchor])

  const trigger = (
    <Button
      ref={triggerRef}
      variant="ghost"
      size="icon"
      aria-label={`Expand ${title}`}
      onClick={() => setExpanded(true)}
    >
      <Maximize2 className="h-4 w-4" />
    </Button>
  )

  const body = (
    <>
      {/* The inline anchor — where the panel's normal card-sized content
          actually renders. Hidden (not removed) while expanded, so it
          stays available the instant the dialog closes. Given an
          explicit height only when the panel config specifies one
          (options.height, e.g. a plotly panel's `height:` key, a common
          field across panel types per data-model.md) — left `auto`
          otherwise, so a panel with no height opinion (e.g. a value box)
          renders exactly as it did before this feature existed. */}
      <div
        ref={setInlineAnchor}
        style={{ height: options?.height, display: expanded ? 'none' : undefined }}
      />

      <Dialog open={expanded} onOpenChange={setExpanded}>
        {/* onCloseAutoFocus explicitly refocuses our own trigger button —
            found necessary during implementation: Radix's own default
            focus-return (FR-006) refocuses whatever registered itself via
            <DialogTrigger>'s ref, but `trigger` and `body` here are
            deliberately two separate pieces of UI returned from this hook
            (placed by the caller in CardHeader/CardContent respectively),
            not nested under one <Dialog> in the rendered tree the way
            <DialogTrigger> requires — so Radix's own triggerRef is never
            populated and its internal fallback silently no-ops. Managing
            it explicitly here achieves the same user-visible guarantee
            without needing <DialogTrigger>. */}
        <DialogContent
          className="flex h-[90vh] w-[95vw] max-w-[1600px] flex-col"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus()
          }}
        >
          <DialogTitle>{title}</DialogTitle>
          <div ref={setDialogAnchor} className="min-h-0 flex-1" />
        </DialogContent>
      </Dialog>

      {createPortal(children, portalHostRef.current)}
    </>
  )

  return { trigger, body }
}
