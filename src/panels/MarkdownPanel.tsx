import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { FileText } from 'lucide-react'

import { PanelEmptyState } from '@/panels/PanelEmptyState'
import type { MarkdownPanelConfig } from '@/layout/types'

// Registered once at module load, not inside the component — a hook
// added on every render would stack duplicate hooks. DOMPurify's default
// ALLOWED_ATTR includes `rel` but not `target` (research.md §6, verified
// against DOMPurify's own src/attrs.ts) — a plain sanitize() call would
// strip a hand-authored target="_blank" and never adds one to an ordinary
// markdown link either way. This hook runs after DOMPurify's own
// attribute sanitization for each element, so setting target/rel here
// isn't re-exposed to the allow-list check that stripped target in the
// first place.
//
// Scope note: DOMPurify.addHook() registers globally on the DOMPurify
// module, not scoped to this file's own sanitize() calls — there is no
// per-call hook scoping in DOMPurify's API. Any future code elsewhere in
// this app that calls DOMPurify.sanitize() for an unrelated purpose would
// also have its <a> tags rewritten by this same hook. Harmless today
// (MarkdownPanel.tsx is this app's only DOMPurify consumer), but a real
// constraint a future DOMPurify consumer should know about before being
// surprised by it — not something to silently discover.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

// Descendant-selector styling for marked's raw HTML output — Tailwind's
// preflight (via tokens.css's `@tailwind base`) strips default browser
// margins/list-markers/table-borders from every element, so headings,
// lists, links, and tables need explicit re-styling here rather than
// relying on unstyled browser defaults (spec.md FR-004: rendered content
// must match the dashboard's own design-token typography, not marked.js's
// unstyled default output).
const MARKDOWN_CONTENT_CLASSNAME = [
  'font-body text-sm leading-relaxed',
  '[&_h1]:font-heading [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:mt-4',
  '[&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4',
  '[&_h3]:font-heading [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3',
  '[&_p]:mb-3 [&_p:last-child]:mb-0',
  '[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:mb-1',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80',
  '[&_table]:mb-3 [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-heading',
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  '[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3',
].join(' ')

// The fourth panel type — see contracts/markdown-panel.md and
// specs/006-markdown-panel/research.md. Deliberately has no
// useFilterState, no services/duckdb.ts import, and no loading/error
// state: docs/GRAMMAR.md's type: markdown grammar has no metric/
// $scenario/$filters data binding (FR-001), and config.content is
// already present on the parsed config object at mount time — nothing
// to fetch or wait for (research.md §4).
export function MarkdownPanel({ config }: { config: MarkdownPanelConfig }) {
  const html = useMemo(() => {
    const trimmed = config.content?.trim()
    if (!trimmed) return null
    // marked's own defaults already set gfm: true — GFM tables render
    // with no explicit option (research.md §2). DOMPurify.sanitize()
    // runs on marked's *output*, not config.content directly — covers
    // both a raw <script> authored in content: and anything marked's
    // own conversion might produce (research.md §3). The module-level
    // afterSanitizeAttributes hook above forces target="_blank" +
    // rel="noopener noreferrer" onto every <a> this produces
    // (research.md §6).
    return DOMPurify.sanitize(marked.parse(trimmed, { async: false }))
  }, [config.content])

  if (!html) {
    return <PanelEmptyState icon={FileText} message="No content configured" />
  }

  // The one place in this codebase dangerouslySetInnerHTML is correct:
  // `html` has already passed through DOMPurify.sanitize() above, never
  // raw config.content or unsanitized marked() output.
  return <div className={MARKDOWN_CONTENT_CLASSNAME} dangerouslySetInnerHTML={{ __html: html }} />
}
