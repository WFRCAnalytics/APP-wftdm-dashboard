import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '@/lib/utils'

// 033-shadcn-default-theme (T028): adapted from shadcn's real, current
// new-york-v4 registry source (apps/v4/registry/new-york-v4/ui/label.tsx,
// fetched directly) — converted to this project's own established
// Radix-wrapping pattern (React.forwardRef + React.ElementRef/
// ComponentPropsWithoutRef, `@radix-ui/react-label` namespace import,
// `@/lib/utils` cn, single quotes, no "use client" — matching dialog.tsx/
// tabs.tsx/tooltip.tsx exactly, not the real source's own React.ComponentProps-
// without-forwardRef shape, which this project's other primitives don't
// use either). `data-slot` IS kept — real source fidelity, and no existing
// project convention says otherwise (contracts/component-parity.md).
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    data-slot="label"
    className={cn(
      'flex items-center gap-2 font-body text-sm font-medium leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
