import { cn } from '@/lib/utils'

// project-docs/redesign/02-layout-and-components.md section 5: a pill group of toggle buttons. `view` is the neutral
// chart-type variant; `compare` tints the pressed button with the brand colour.
export interface SegmentedOption {
  id: string
  label: string
  disabled?: boolean
}

export interface SegmentedProps {
  label: string
  options: SegmentedOption[]
  value: string
  onChange: (id: string) => void
  variant?: 'view' | 'compare'
  /** `lg` is the control bar's Show control (7px 13px, 14px text); `md` is the tile control. */
  size?: 'md' | 'lg'
  className?: string
}

export function Segmented({ label, options, value, onChange, variant = 'view', size = 'md', className }: SegmentedProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] p-[3px]', className)}
    >
      {options.map((o) => {
        const pressed = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={pressed}
            disabled={o.disabled}
            onClick={() => onChange(o.id)}
            className={cn(
              size === 'lg' ? 'px-[13px] py-[5px] text-sm' : 'px-[11px] py-1 text-[12.5px]',
              'rounded-full font-body leading-[1.45] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] disabled:opacity-40',
              pressed
                ? cn(
                    'text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.18)]',
                    variant === 'compare'
                      ? 'bg-[color-mix(in_srgb,var(--brand)_22%,var(--tile-hi))]'
                      : 'bg-[var(--tile-hi)]',
                  )
                : 'text-[var(--mute)] hover:text-[var(--ink)]',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
