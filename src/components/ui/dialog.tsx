import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

// Hand-authored to match tabs.tsx/tooltip.tsx's existing pattern (002-
// design-tokens) — not shadcn CLI output, since this repo has no CLI-
// generation step. See specs/004-panel-expand-dialog/contracts/
// dialog-primitive.md.
//
// Deliberately plain — no forceMount-specific handling. An earlier draft
// added forceMount pass-through plus a data-[state=closed]:hidden class
// so panelExpandHost.tsx could keep DialogContent permanently mounted.
// That turned out to be unsafe for the MODAL Content variant this
// component uses by default: @radix-ui/react-dialog's
// DialogContentModal calls the `aria-hidden` package's hideOthers() in a
// mount-only effect, not gated on `open` — force-mounting caused every
// panel's Content to hide the rest of the page from assistive tech the
// moment it mounted, confirmed via a real Playwright regression (every
// getByRole query for anything outside the dialog stopped resolving).
// panelExpandHost.tsx no longer force-mounts (layout/panelExpandHost.tsx
// has the full explanation); Content here just mounts/unmounts normally
// via Radix's own Presence, which already handles "hidden while closed"
// correctly with no CSS needed.
const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-background/80 backdrop-blur-sm', className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    // panelExpandHost.tsx still renders its own explicit close control
    // per FR-004; default false.
    hideClose?: boolean
  }
>(({ className, children, hideClose = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/* No explicit aria-describedby handling here — verified directly
        against @radix-ui/react-dialog's source: DialogContentImpl already
        computes `context.descriptionPresent ? context.descriptionId :
        undefined` internally. An earlier draft of this wrapper re-set
        aria-describedby={undefined} unconditionally to suppress Radix's
        dangling-reference warning when no DialogDescription is rendered —
        which, read against the actual source, would have *broken* the
        correct case too: object-spreading an explicit `undefined` key
        after Radix's own computed value overrides it even when a real
        DialogDescription *is* present. Letting `{...props}` forward
        aria-describedby only when a caller explicitly passes one (rare)
        is both simpler and correct — Radix's own default already does
        exactly what the suppression was trying to achieve by hand. */}
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // text-card-foreground — a real bug found live in dark mode: this
        // element sets bg-card but, unlike Card (components/ui/card.tsx),
        // never paired it with a text color of its own. In light mode
        // that's invisible (its own inherited default color happens to
        // already read dark-on-light), but DialogPortal renders into
        // document.body — OUTSIDE shell.tsx's own text-foreground-setting
        // wrapper div — so nothing here actually inherits this app's
        // token-driven text color at all; it was falling back to the
        // plain browser default (black) regardless of theme. Confirmed
        // via getComputedStyle(): DialogTitle read a hardcoded black in
        // dark mode before this fix. Also fixes every currentColor-based
        // child (e.g. Observable Plot's own axis/tick text, which uses
        // currentColor by design) that only ever appeared correctly
        // colored inline (inside Card's own text-card-foreground) and
        // went black the moment 004's expand mechanism relocated it here.
        //
        // p-6 — 004-panel-expand-dialog's own original padding, restored
        // here: the text-card-foreground fix above rewrote this whole
        // string and silently dropped p-6 in the process (no comment ever
        // addressed padding — a genuine accidental loss, not a deliberate
        // spacing change). Confirmed via `git diff` against the pre-015
        // commit that this was the ONLY class removed. Every expanded
        // panel's content was rendering flush against the dialog's own
        // border with zero breathing room as a result — usePanelExpandHost
        // (layout/panelExpandHost.tsx) and PanelCard (layout/panelCard.tsx)
        // were both confirmed unchanged since 004, so this was the sole
        // cause.
        'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg',
        className,
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-heading text-lg font-semibold', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('font-body text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
}
