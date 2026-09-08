import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'

import { cn } from '@/lib/utils'

// Hand-authored to match tabs.tsx/dialog.tsx's existing pattern (002-
// design-tokens) — not shadcn CLI output, since this repo has no CLI-
// generation step. This feature's one genuinely new Radix primitive
// (030-sidebar-navigation, research.md §2) — a small, generic wrapper,
// used inside components/ui/sidebar.tsx to divide the header/content/
// footer regions.
const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
))
Separator.displayName = SeparatorPrimitive.Root.displayName

export { Separator }
