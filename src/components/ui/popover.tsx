import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'

import { cn } from '@/lib/utils'

// 036-scenario-color-picker: adapted from shadcn's real, current
// new-york-v4 registry source (apps/v4/registry/new-york-v4/ui/
// popover.tsx, fetched directly) — same forwardRef/@radix-ui/react-x-
// namespaced-import/cn/single-quote conventions as this project's other
// primitives (select.tsx, dialog.tsx). `data-slot` attributes kept
// (real-source fidelity, no existing project convention against them).
const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

export interface PopoverContentProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {}

const PopoverContent = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, PopoverContentProps>(
  ({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-md border border-border bg-popover p-4 font-body text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  ),
)
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent }
