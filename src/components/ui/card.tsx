import * as React from 'react'

import { cn } from '@/lib/utils'

// Demonstrates: card/card-foreground, border, radius, --shadow-md (resting
// elevation) — data-model.md's Component table. CardTitle uses font-heading;
// CardDescription/CardContent inherit the global font-body default
// (research.md §8).
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-md',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    // wftdm-design-system's Panel Title role (16px/600/tracking-tight) —
    // fixed during Phase 2 (shell/nav), not deferred to Phase 3 as
    // originally planned: this shadcn default (text-2xl/24px, sized for a
    // single standalone hero card, never tuned for this app's dense
    // multi-panel grid) was left in place through Phase 1's own research,
    // but Phase 2's own new page-title heading (dashboardRenderer.tsx)
    // made the resulting hierarchy inversion directly visible in a real
    // screenshot — every panel's own CardTitle rendered LARGER than the
    // page title sitting above it. card.tsx is shared shell-adjacent
    // chrome (like Button/Dialog/Tabs), not an individual panel's own
    // internals, so fixing it here doesn't cross into Phase 3's own
    // per-panel-type scope (which still owns each panel's internal
    // content/data/icon treatment, untouched by this change).
    <h3
      ref={ref}
      className={cn('font-heading text-base font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  ),
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
