import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

// 033-shadcn-default-theme (T032): adapted from shadcn's real, current
// new-york-v4 registry source (apps/v4/registry/new-york-v4/ui/switch.tsx,
// fetched directly) — same forwardRef/cn/import-path conventions as
// label.tsx/checkbox.tsx above. The real source's own `size` prop
// (`"sm" | "default"`, driving `data-size`) is kept verbatim — a real,
// current shadcn API surface, not this project's own invention.
export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  size?: 'sm' | 'default' | 'lg'
}

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  ({ className, size = 'default', ...props }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[size=lg]:h-6 data-[size=lg]:w-[42px] data-[size=lg]:border-0 data-[size=lg]:shadow-none data-[size=lg]:px-[3px] motion-reduce:transition-none data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80 data-[size=lg]:data-[state=unchecked]:bg-[color-mix(in_srgb,var(--ink)_20%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=lg]/switch:size-[18px] motion-reduce:transition-none data-[state=checked]:translate-x-[calc(100%-2px)] group-data-[size=lg]/switch:data-[state=checked]:translate-x-[18px] group-data-[size=lg]/switch:data-[state=checked]:bg-primary-foreground group-data-[size=lg]/switch:data-[state=unchecked]:bg-[var(--ink)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
      />
    </SwitchPrimitive.Root>
  ),
)
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
