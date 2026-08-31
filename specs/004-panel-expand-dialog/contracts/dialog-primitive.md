# Contract: `components/ui/dialog.tsx`

Satisfies: FR-004, FR-005, FR-006, FR-012. New shadcn-pattern primitive,
hand-authored the same way `tabs.tsx`/`tooltip.tsx` were (research.md §3) —
not shadcn CLI output, since this repo has no CLI-generation step.

**Correction found during implementation**: an earlier draft of this
primitive added `forceMount` pass-through plus a `data-[state=closed]:
hidden` CSS class, so `panelExpandHost.tsx` could keep `DialogContent`
permanently mounted. That turned out to be unsafe for the MODAL `Content`
variant this component uses by default — `@radix-ui/react-dialog`'s
`DialogContentModal` calls the `aria-hidden` package's `hideOthers()` in a
mount-only effect, not gated on `open` at all (verified by reading
`node_modules/@radix-ui/react-dialog/dist/index.mjs`) — force-mounting
caused every panel's `Content` to hide the rest of the page from
assistive tech the moment it mounted, confirmed via a real Playwright
regression (every `getByRole` query for anything outside the dialog
stopped resolving). Full story in research.md §1a.
`panelExpandHost.tsx` no longer force-mounts, so this primitive is
simpler than originally drafted: `Content` just mounts/unmounts normally
via Radix's own Presence, which already handles "hidden while closed"
correctly with no CSS needed.

## Shape

```tsx
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

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
    hideClose?: boolean // panelExpandHost.tsx still renders its own explicit
                         // close control per FR-004; default false
  }
>(({ className, children, hideClose = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/* No explicit aria-describedby handling — verified against
        @radix-ui/react-dialog's actual source: DialogContentImpl already
        computes `context.descriptionPresent ? context.descriptionId :
        undefined` internally. An earlier draft re-set
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
        'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg',
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
  Dialog, DialogTrigger, DialogPortal, DialogOverlay,
  DialogContent, DialogClose, DialogTitle, DialogDescription,
}
```

## Given/When/Then

- **Given** `DialogContent` renders with no `DialogDescription` child and no
  explicit `aria-describedby` prop, **when** it mounts, **then** it does not
  produce Radix's dangling-`aria-describedby` console warning — Radix's own
  internal default (`context.descriptionPresent ? context.descriptionId :
  undefined`) already handles this; this wrapper does not re-implement it
  (research.md §3).
- **Given** `Dialog`'s `open` is `false`, **when** the page is used
  normally elsewhere, **then** there is nothing to interfere with it —
  `DialogContent` isn't mounted at all (no `forceMount`), so there is no
  permanently-present-but-hidden box, no stray focus trap, no Escape
  hijack, by construction rather than by a CSS rule needing to hide
  something (research.md §1a).
- **Given** the dialog is open, **when** the user presses Tab repeatedly,
  **then** focus cycles only through elements inside `DialogContent` (its
  own close button, and whatever `panelExpandHost.tsx`'s portaled content
  renders) — never escaping to the page behind the overlay (FR-005).
- **Given** the dialog closes by any of its three closing mechanisms,
  **when** it finishes closing, **then** focus returns to the trigger
  button — via `panelExpandHost.tsx`'s explicit `onCloseAutoFocus`
  handler, since this primitive's `Content` has no built-in
  `<DialogTrigger>` registered to fall back on (FR-006; see
  `contracts/panel-expand-host.md`).

## Non-goals for this feature

- No animated open/close transition — `002-design-tokens`' existing
  primitives (`tabs.tsx`/`tooltip.tsx`) don't use one either; consistent
  with not introducing a new visual pattern for this feature.
- No nested dialogs / dialog-within-dialog support.
