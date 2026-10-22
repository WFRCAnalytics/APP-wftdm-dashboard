import { useId } from 'react'

import { cn } from '@/lib/utils'
import { useInRail } from '@/components/ui/railContext'

// project-docs/redesign/02-layout-and-components.md section 5: a native <select> inside a pill with a muted label.
// A native select keeps keyboard, screen-reader and mobile behaviour for free.
export interface PillSelectOption {
  value: string
  label: string
  /** Options sharing a `group` render inside an <optgroup> with that label. */
  group?: string
}

export interface PillSelectProps {
  label: string
  value: string
  options: PillSelectOption[]
  onChange: (value: string) => void
  /** 32px instead of 38px, for tile control rows. */
  compact?: boolean
  /** Lift the 160px cap on the select (the Year select shows a long label). */
  wide?: boolean
  className?: string
  'data-testid'?: string
}

export function PillSelect({ label, value, options, onChange, compact, wide, className, 'data-testid': testId }: PillSelectProps) {
  const id = useId()
  const rail = useInRail()
  const groups = [...new Set(options.map((o) => o.group).filter((g): g is string => Boolean(g)))]
  const ungrouped = options.filter((o) => !o.group)
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] pl-[14px] pr-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        compact ? 'h-8' : 'h-[38px]',
        rail && 'flex w-full justify-between',
        className,
      )}
    >
      <span className="font-body text-xs text-[var(--mute)]">{label}</span>
      <select
        id={id}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('cursor-pointer rounded-full bg-transparent py-1 pl-1 pr-2 font-body text-sm font-medium text-[var(--ink)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]', wide ? '' : rail ? 'min-w-0 flex-1 truncate' : 'max-w-[160px]')}
      >
        {ungrouped.map((o) => (
          <option key={o.value} value={o.value} className="bg-[var(--surface)] text-[var(--ink)]">
            {o.label}
          </option>
        ))}
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {options
              .filter((o) => o.group === g)
              .map((o) => (
                <option key={o.value} value={o.value} className="bg-[var(--surface)] text-[var(--ink)]">
                  {o.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
