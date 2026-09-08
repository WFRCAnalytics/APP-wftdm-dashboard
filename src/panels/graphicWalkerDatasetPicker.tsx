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
          {/* wftdm-design-system skill audit (Phase 3 Batch 3): two real
              deviations found, both fixed.
              (1) `font-body font-normal` overrode Button's own base
              classes (font-heading text-sm font-medium — components/ui/
              button.tsx) with no stated reason — every OTHER button in
              this app (Settings trigger, basemapTab.tsx's own tiles, etc.)
              uses that default unmodified, arbitrary content included;
              this was the one unexplained outlier. Removed, letting it
              inherit the same established control convention.
              (2) `ChevronDown h-3.5 w-3.5` didn't match any Iconography
              tier (12/16/20/28px) and had no sibling precedent elsewhere
              in this codebase to justify it — moved to the Default tier
              (h-4 w-4), matching the `Database` icon right next to it in
              the same control. `opacity-60` kept — a de-emphasized
              trailing caret next to a leading content icon is a real,
              common, legitimate distinction (secondary vs. primary icon),
              not itself a scale violation. */}
          <Button variant="outline" size="sm" aria-label="Choose dataset to explore" className="gap-2">
            <Database className="h-4 w-4" />
            {current}
            <ChevronDown className="h-4 w-4 opacity-60" />
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
