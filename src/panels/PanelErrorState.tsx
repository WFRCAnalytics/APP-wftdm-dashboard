import { TriangleAlert } from 'lucide-react'

// Structure ported from APP-Project-Scoresheet's .banner-error pattern
// (research.md §8): icon + message + role="alert". Styled with this
// project's border-destructive/text-destructive tokens on the flat card
// surface, not Scoresheet's dedicated tinted-background token — no
// WCAG-verified equivalent exists yet in 002-design-tokens' token set,
// and adding one speculatively would copy a value without copying the
// verification behind it (research.md §8's explicit reasoning).
export interface PanelErrorStateProps {
  message: string
}

export function PanelErrorState({ message }: PanelErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md border border-destructive p-3 text-sm text-destructive"
    >
      {/* wftdm-design-system skill's Iconography table — Illustrative
          tier (size={28} strokeWidth={1.5}), matching PanelEmptyState.tsx's
          sibling treatment. Was size={18} at the default stroke-width, a
          one-off sitting between the Default (16px) and Illustrative
          (28px) tiers with neither tier's own treatment. shrink-0 added
          alongside the size bump — this icon sits in a horizontal flex
          row with wrapping message text, and a 28px icon needs the same
          protection against flex-shrink distortion PanelEmptyState.tsx's
          own vertical layout never had to worry about. */}
      <TriangleAlert size={28} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
      <span className="font-body">{message}</span>
    </div>
  )
}
