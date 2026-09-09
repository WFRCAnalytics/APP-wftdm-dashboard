import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Demonstrates: primary/secondary/destructive semantic roles, ring (focus)
// — data-model.md's Component table. Label text inherits font-heading via
// the base class list (research.md §8's per-component typography table).
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-heading text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // 033-shadcn-default-theme: a REAL regression found during T019's
        // re-verification, not merely anticipated — the real, current
        // shadcn button.tsx source (fetched directly,
        // apps/v4/registry/new-york-v4/ui/button.tsx) uses literal
        // `text-white` for this variant, NOT `text-destructive-foreground`.
        // Confirmed why this matters, not just cosmetic: shadcn's own real
        // dark-mode `--destructive-foreground` (oklch(0.58 0.22 27), a
        // DARKER red) resolves to only a 1.66:1 contrast ratio against
        // dark-mode `--destructive` (oklch(0.704 0.191 22.216), a LIGHTER
        // red) — nowhere near WCAG AA's 4.5:1 text minimum
        // (tokenContrast.test.ts would have caught this had the old
        // pairing been kept). Matching the real source's `text-white` (nearly
        // white-on-red) plus its `dark:bg-destructive/60` dimming fixes both
        // the visual-parity gap AND the contrast regression at once —
        // `--destructive-foreground` itself is not used by this button at
        // all in shadcn's own real component (component-parity.md).
        destructive: 'bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/60',
        outline: 'border border-input bg-background hover:bg-muted hover:text-muted-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        // Added for 004-panel-expand-dialog's icon-only expand trigger —
        // no existing size variant fit a square, label-less control.
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
