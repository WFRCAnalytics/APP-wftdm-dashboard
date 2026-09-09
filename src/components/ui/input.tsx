import * as React from 'react'

import { cn } from '@/lib/utils'

// 033-shadcn-default-theme (T029): adapted from shadcn's real, current
// new-york-v4 registry source (apps/v4/registry/new-york-v4/ui/input.tsx,
// fetched directly) — a plain <input>, no Radix primitive involved, so
// only this project's own forwardRef/cn/quote conventions apply (no
// namespace-import adaptation needed). `font-body` added explicitly
// (this project's own established convention — see ValueBoxPanel.tsx's
// comment on why explicit font-role classes are required, not redundant)
// in place of the real source's own bare `text-base`/`md:text-sm`, which
// relies on an inherited body font-family this project doesn't assume.
const Input = React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 font-body text-base shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export { Input }
