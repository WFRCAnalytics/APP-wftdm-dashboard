import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// 034-metric-panel-redesign (T022, data-model.md §3): adapted from
// shadcn's real, current new-york-v4 registry source (apps/v4/registry/
// new-york-v4/ui/badge.tsx, fetched directly) — this app's first real
// Badge consumer (its own baseline-trend indicator, ValueBoxPanel.tsx).
// Converted to this project's own established Radix/plain-element
// adaptation pattern (confirmed by reading button.tsx first, this
// project's own closest precedent — a plain forwardRef `<span>`, no
// Radix Slot/`asChild` polymorphism, matching button.tsx's own choice
// not to support it either): `React.forwardRef`, `@/lib/utils` cn,
// single quotes, no `"use client"`. `default`/`secondary`/`destructive`/
// `outline` variants only — `ghost`/`link` omitted, no real consumer
// needs them yet (matching dropdown-menu.tsx's own "only what's needed"
// convention).
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 font-body text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive text-white',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
))
Badge.displayName = 'Badge'

export { Badge, badgeVariants }
