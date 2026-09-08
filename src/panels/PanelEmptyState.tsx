import type { LucideIcon } from 'lucide-react'

// Ported from APP-Project-Scoresheet's src/components/EmptyState.tsx
// (research.md §8) — same prop shape (icon + message + optional hint),
// re-expressed against this project's own tokens (text-muted-foreground
// in place of Scoresheet's single gray text token).
export interface PanelEmptyStateProps {
  icon: LucideIcon
  message: string
  hint?: string
}

export function PanelEmptyState({ icon: Icon, message, hint }: PanelEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
      <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
      <p className="font-body text-sm">{message}</p>
      {/* wftdm-design-system skill: text-muted-foreground/80 was the same
          "Tailwind slash-opacity modifier generates NO CSS against this
          app's plain-hex custom color tokens" bug already found and fixed
          multiple times this session (rechartsPanel.css's gridline/tooltip-
          border fix, mapControls.css's history) — --muted-foreground is a
          plain hex value (tokens.css), not an hsl-channel triplet, so the
          modifier silently produced full-opacity text instead of 80%.
          Fixed the same proven way: a real color-mix() value, inline (the
          same pattern tableLogic.ts's/zonemapColor.ts's own color-mix()
          return values already use for a single, narrow usage — no new
          CSS file needed for one line). */}
      {hint && (
        <p
          className="font-body text-xs"
          style={{ color: 'color-mix(in srgb, var(--muted-foreground) 80%, transparent)' }}
        >
          {hint}
        </p>
      )}
    </div>
  )
}
