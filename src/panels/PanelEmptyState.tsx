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
      {hint && <p className="font-body text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  )
}
