import { useId } from 'react'

import { cn } from '@/lib/utils'
import { useInRail } from '@/components/ui/railContext'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'

// project-docs/redesign/02-layout-and-components.md section 5: a pill with a muted label and a themed dropdown (Radix Select,
// so keyboard, typeahead and screen-reader behaviour come with it; the list is the app's glass surface, not the browser's).
export interface PillSelectOption {
  value: string
  label: string
  /** Options sharing a `group` render under a heading with that label. */
  group?: string
}

export interface PillSelectProps {
  label: string
  value: string
  options: PillSelectOption[]
  onChange: (value: string) => void
  /** 32px instead of 38px, for tile control rows. */
  compact?: boolean
  /** Lift the 160px cap on the trigger (the Year select shows a long label). */
  wide?: boolean
  className?: string
  'data-testid'?: string
}

// Radix Select rejects an empty-string item value, and "None" options use one.
const EMPTY = '__empty__'
const encode = (v: string) => (v === '' ? EMPTY : v)
const decode = (v: string) => (v === EMPTY ? '' : v)

export function PillSelect({ label, value, options, onChange, compact, wide, className, 'data-testid': testId }: PillSelectProps) {
  const labelId = useId()
  const rail = useInRail()
  const groups = [...new Set(options.map((o) => o.group).filter((g): g is string => Boolean(g)))]
  const ungrouped = options.filter((o) => !o.group)
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] pl-[14px] pr-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        compact ? 'h-8' : 'h-[38px]',
        rail && 'flex w-full justify-between',
        className,
      )}
    >
      <span id={labelId} className="font-body text-xs text-[var(--mute)]">
        {label}
      </span>
      <Select value={encode(value)} onValueChange={(v) => onChange(decode(v))}>
        <SelectTrigger
          aria-labelledby={labelId}
          data-testid={testId}
          className={cn(
            'h-auto w-auto gap-1 rounded-full border-0 !bg-transparent py-1 pl-1 pr-2 font-body text-sm font-medium text-[var(--ink)] shadow-none hover:!bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] [&_svg]:text-[var(--mute)]',
            wide ? '' : rail ? 'min-w-0 flex-1 justify-between' : 'max-w-[190px]',
          )}
        >
          <span className="min-w-0 truncate">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent position="popper" align="start" sideOffset={8}>
          {ungrouped.map((o) => (
            <SelectItem key={o.value} value={encode(o.value)}>
              {o.label}
            </SelectItem>
          ))}
          {groups.map((g) => (
            <SelectGroup key={g}>
              <SelectLabel>{g}</SelectLabel>
              {options
                .filter((o) => o.group === g)
                .map((o) => (
                  <SelectItem key={o.value} value={encode(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
