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
      <TriangleAlert size={18} aria-hidden="true" />
      <span className="font-body">{message}</span>
    </div>
  )
}
