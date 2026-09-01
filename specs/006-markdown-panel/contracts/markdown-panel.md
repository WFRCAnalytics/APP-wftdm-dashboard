# Contract: `MarkdownPanel` (`src/panels/MarkdownPanel.tsx`)

Satisfies: FR-001 through FR-008. The fourth panel type — proves
config → sanitized-render, deliberately *not* following the config →
query → render shape `contracts/valuebox-panel.md`/`contracts/plotly-
panel.md`/`contracts/table-panel.md` all established, because this panel
type has no query at all (research.md §4).

## Shape

```tsx
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { FileText } from 'lucide-react'

import { PanelEmptyState } from '@/panels/PanelEmptyState'
import type { MarkdownPanelConfig } from '@/layout/types'

// Registered once at module load, not inside the component — a hook
// added on every render would stack duplicate hooks. DOMPurify's default
// ALLOWED_ATTR includes `rel` but not `target` (research.md §6, verified
// against src/attrs.ts) — a plain sanitize() call would strip a
// hand-authored target="_blank" and never adds one to an ordinary
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
  return (
    <div
      className="prose-panel font-body text-sm [&_h1]:font-heading [&_h2]:font-heading [&_h3]:font-heading"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

(Illustrative — the load-bearing contract is: no data-fetch effect exists
at all; `useMemo` recomputes only when `config.content` itself changes;
`DOMPurify.sanitize()` always runs on marked's HTML output before it
reaches `dangerouslySetInnerHTML`, with no code path that skips it; the
`afterSanitizeAttributes` hook is registered exactly once, at module
load, and applies to every `<a>` regardless of what the author wrote
(research.md §6) — not conditionally invoked per render or per panel
instance; the empty-state check happens after `.trim()`, so
whitespace-only content is treated identically to missing content.)

`config.title`/`config.width`/`config.height` flow through
`panelCard.tsx` exactly like every other panel type — nothing
markdown-specific there. `004`'s `usePanelExpandHost` wraps this
component exactly like it wraps `ValueBoxPanel`/`PlotlyPanel`/
`TablePanel` — same mounted instance, inline vs. dialog is a visual
relocation only (FR-008, SC-005).

## Given/When/Then

- **Given** a `MarkdownPanelConfig` with `content:` covering headings,
  emphasis, lists, and links, **when** the panel mounts, **then** the
  rendered DOM contains the correct HTML equivalents for each (a real
  `<h2>`, `<strong>`/`<em>`, `<ul>`/`<ol>`/`<li>`, `<a href="...">`) — not
  literal markdown syntax as text (FR-002, US1).
- **Given** the same panel, **when** its rendered heading/body text is
  inspected, **then** it uses the app's `font-heading`/`font-body`
  typography classes, matching every other panel type's chrome, not
  marked.js's unstyled default output (FR-004, US1).
- **Given** `content:` includes GFM table syntax, **when** the panel
  renders, **then** a real `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/
  `<td>` structure appears — proving marked's `gfm: true` default and
  DOMPurify's default table-tag allow-list both hold in the actual
  rendered browser DOM, not just in isolated library-source review
  (research.md §2/§3).
- **Given** `content:` contains a literal `<script>` tag, **when** the
  panel renders, **then** no `<script>` element exists in the DOM and no
  script executes (FR-003, US2).
- **Given** `content:` contains an HTML element with an `onerror`/
  `onclick` attribute, **when** the panel renders, **then** that
  attribute is absent from the rendered element and never fires (FR-003,
  US2).
- **Given** `content:` mixes a legitimate heading/list with an unsafe
  fragment, **when** the panel renders, **then** the legitimate markdown
  still renders correctly and only the unsafe fragment is neutralized
  (FR-003, US2).
- **Given** `content:` is missing, empty, or whitespace-only, **when**
  the panel renders, **then** `PanelEmptyState` appears — not a blank
  card, not a thrown error (FR-006, US3).
- **Given** any markdown panel, **when** it's expanded via `004`'s
  mechanism, **then** it gets the same trigger/dialog behavior as any
  other registered panel type, with zero code in this file aware that
  mechanism exists (FR-008, SC-005) — the exact same sanitized HTML
  string renders in both the inline card and the dialog, since it's the
  same mounted component instance either way.
- **Given** a markdown panel alongside valuebox/plotly/table panels on
  the same tab, **when** the tab renders, **then** all panel types render
  without error, and the markdown panel's lack of a query causes no
  visible difference in card chrome (title bar, expand trigger) from any
  other panel type (FR-005, US3).
- **Given** `content:` contains a plain markdown link (`[text](url)`,
  no `target`/`rel` written by the author), **when** the panel renders,
  **then** the rendered `<a>` element carries `target="_blank"` and
  `rel="noopener noreferrer"` in the DOM — proving the
  `afterSanitizeAttributes` hook actually applies to the common case, not
  just a raw hand-authored `<a target>` (research.md §6, spec.md's
  Assumptions). **When** that link is activated, **then** it opens in a
  new browser tab, leaving the dashboard's currently-loaded
  scenario/filter state untouched in the original tab.

## Non-goals for this feature

- No in-app markdown authoring/editing UI — `content:` is authored in
  `dashboard-*.yaml`, outside this app (spec.md's own stated scope
  boundary).
- No `$metric.`/`$scenario`/`$filters` placeholder substitution inside
  `content:` — this panel type has no data binding at all (FR-001). An
  author wanting to surface a live number should use a `valuebox` panel
  instead.
- No custom DOMPurify/marked configuration beyond each library's own
  defaults — research.md §2/§3 confirm the defaults already cover this
  feature's actual requirements (GFM tables render, script/handler
  vectors don't survive).
