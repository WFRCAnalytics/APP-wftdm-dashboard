import * as React from 'react'

import { cn } from '@/lib/utils'

// project-docs/redesign/02-layout-and-components.md section 5: a 28px pill button; pressed = inverted.
export interface MiniButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean
}

export const MiniButton = React.forwardRef<HTMLButtonElement, MiniButtonProps>(
  ({ className, pressed, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-7 items-center rounded-full border border-[var(--glass-line)] px-3 font-body text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] disabled:opacity-40',
        pressed ? 'bg-[var(--ink)] text-[var(--bg)]' : 'text-[var(--mute)] hover:text-[var(--ink)]',
        className,
      )}
      {...props}
    />
  ),
)
MiniButton.displayName = 'MiniButton'
