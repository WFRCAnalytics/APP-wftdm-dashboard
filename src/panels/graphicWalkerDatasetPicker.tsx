import { ChevronDown, Database } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// 028-graphic-walker-dataset-picker — research.md §7: built on the
// already-installed components/ui/dropdown-menu.tsx primitive (the same
// one ThemeToggle's original icon trigger and 020-settings-modal's
// original Basemap tab both already used for an equivalent single-select
// list) rather than adding a new @radix-ui/react-select dependency. This
// is the first real consumer of that primitive since both of those were
// superseded — CLAUDE.md's own file-tree comment on dropdown-menu.tsx
// noting it as a "zero-consumer file... deliberately left in place" no
// longer applies.
export function DatasetPicker({
  current,
  options,
  onSelect,
}: {
  current: string
  options: string[]
  onSelect: (name: string) => void
}) {
  if (options.length === 0) {
    // No functioning dropdown when there's nothing to pick from (spec.md
    // Edge Cases — e.g. a picker-enabled panel pinned to a scenario that
    // was never registered) — a plain, non-interactive label, never an
    // empty/broken menu.
    return (
      <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-1.5 font-body text-sm text-muted-foreground">
        <Database className="h-4 w-4" />
        No dataset available to explore
      </div>
    )
  }

  return (
    <div className="mb-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label="Choose dataset to explore"
            className="gap-2 font-body font-normal"
          >
            <Database className="h-4 w-4" />
            {current}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={current} onValueChange={onSelect}>
            {options.map((name) => (
              <DropdownMenuRadioItem key={name} value={name}>
                {name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
