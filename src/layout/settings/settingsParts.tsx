import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Small layout pieces shared by the four Settings tabs (project-docs/redesign/prototype `.mbody h3/.lead/h4`, `.row`, `.btn`).

/** The tab title and its lead paragraph. */
export function TabHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <>
      <h3 className="mb-1 font-heading text-[18px] font-semibold tracking-[-0.01em]">{title}</h3>
      {children && <p className="mb-5 max-w-[70ch] text-[var(--mute)]">{children}</p>}
    </>
  )
}

/** A small muted group heading (the prototype's `h4`). */
export function GroupHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <h4 className={cn('mb-2 mt-[22px] text-[12.5px] font-medium tracking-[0.02em] text-[var(--mute)]', className)}>{children}</h4>
}

/** Label and helper text on the left, a control on the right, a hairline between rows. */
export function SettingsRow({
  title,
  help,
  children,
  align = 'center',
}: {
  title: ReactNode
  help?: ReactNode
  children: ReactNode
  align?: 'center' | 'start'
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-4 border-b border-[var(--line)] py-3 last:border-b-0',
        align === 'center' ? 'items-center' : 'items-start',
      )}
    >
      <div className="min-w-0">
        <span className="block font-medium">{title}</span>
        {help && <small className="text-[var(--mute)]">{help}</small>}
      </div>
      {children}
    </div>
  )
}

/** The 38px pill button of the settings bodies; `primary` fills with the brand colour. */
export function PillButton({
  primary,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type={type}
      className={cn(
        'h-[38px] rounded-full border px-[18px] font-body font-medium transition-colors motion-reduce:transition-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] disabled:cursor-default disabled:opacity-45',
        primary
          ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
          : 'border-[var(--line)] bg-transparent text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]',
        className,
      )}
      {...props}
    />
  )
}
