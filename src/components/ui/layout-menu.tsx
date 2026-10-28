import { Grid2x2, LayoutTemplate, PanelsLeftRight, type LucideIcon } from 'lucide-react'

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// The layout of a tile's side-by-side cells: one round icon button in the tile header (beside Download, same look) showing the
// current layout, and a menu of the three. Auto is the usual answer, so the button stays quiet then and is tinted when Row or
// Grid was forced.
export type TileLayout = 'auto' | 'row' | 'grid'

const OPTIONS: { id: TileLayout; label: string; Icon: LucideIcon }[] = [
  { id: 'auto', label: 'Auto', Icon: LayoutTemplate },
  { id: 'row', label: 'Row', Icon: PanelsLeftRight },
  { id: 'grid', label: 'Grid', Icon: Grid2x2 },
]

export function LayoutMenu({ value, onChange }: { value: TileLayout; onChange: (layout: TileLayout) => void }) {
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0]
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TileLayout)}>
      <SelectTrigger
        hideChevron
        data-export-skip=""
        aria-label={`Layout: ${current.label}`}
        title={`Layout: ${current.label}`}
        className={cn(
          'size-[30px] justify-center rounded-full border-0 !bg-transparent p-0 text-[var(--mute)] shadow-none hover:!bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] hover:text-[var(--ink)] focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] [&_svg]:text-current',
          value !== 'auto' && '!bg-[color-mix(in_srgb,var(--brand-text)_14%,transparent)] text-[var(--brand-text)]',
        )}
      >
        <current.Icon className="size-4" aria-hidden="true" />
      </SelectTrigger>
      <SelectContent position="popper" align="end" sideOffset={8} className="min-w-[8.5rem]">
        {OPTIONS.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span className="flex items-center gap-2">
              <o.Icon className="size-4" aria-hidden="true" />
              {o.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
