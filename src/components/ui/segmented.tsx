import { cn } from '@/lib/utils'
import { useInRail } from '@/components/ui/railContext'

// project-docs/redesign/02-layout-and-components.md section 5: a pill group of toggle buttons. Every Segmented looks the
// same (track from --pill-track, selected pill from .pill-on in tokens.css); there are no per-control variants.
export interface SegmentedOption {
  id: string
  label: string
  /** A count shown after the label in a smaller, muted figure, so it reads as a number of items, not part of the name. */
  count?: number
  disabled?: boolean
}

export interface SegmentedProps {
  label: string
  options: SegmentedOption[]
  value: string
  onChange: (id: string) => void
  /** `lg` is the control bar's Show control (7px 13px, 14px text); `md` is the tile control. */
  size?: 'md' | 'lg'
  className?: string
}

export function Segmented({ label, options, value, onChange, size = 'md', className }: SegmentedProps) {
  // In a tile's control rail the options stack, each full width, under a small label.
  const rail = useInRail()
  // A rail is 232px (about 196px of pill): short options fit as one row, each sized to its text; anything wider stacks, one per line.
  const stacked = rail && options.reduce((n, o) => n + o.label.length * 7 + 18, 6) > 190
  return (
    <div className={rail ? 'flex flex-col gap-1' : 'contents'}>
      {rail && <span className="font-body text-xs text-[var(--mute)]">{label}</span>}
    <div
      role="group"
      aria-label={label}
      className={cn('pill-track inline-flex items-stretch rounded-full', size === 'lg' ? 'p-1' : 'p-[3px]', rail && (stacked ? 'flex w-full flex-col items-stretch rounded-[18px]' : 'flex w-full'), className)}
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
              rail && (stacked ? 'w-full text-left' : 'flex-auto px-2 text-center'),
              size === 'lg' ? 'px-[13px] py-[5px] text-sm' : 'px-[11px] py-1 text-[12.5px]',
              'whitespace-nowrap rounded-full font-body leading-[1.45] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] disabled:opacity-40',
              pressed
                ? 'pill-on'
                : 'pill-off',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="ml-1.5 font-mono text-[11px] tabular-nums opacity-60">{o.count}</span>}
          </button>
        )
      })}
    </div>
    </div>
  )
}
