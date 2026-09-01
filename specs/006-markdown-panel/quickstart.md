# Quickstart: Validating MarkdownPanel

**Feature**: `006-markdown-panel`

## Prerequisites

- `001`-`005` already in place — this feature adds a fourth panel type on
  top of `003`'s existing registry/`panelCard.tsx` and inherits `004`'s
  expand mechanism automatically.
- New dependencies: `marked` and `dompurify` (both new runtime deps —
  `npm install` needed; neither is installed yet as of `005`). Both ship
  their own TypeScript types (research.md's Technical Context) — no
  `@types/*` package to add alongside them.
- Fixture data needs at least one `markdown`-typed panel exercising: a
  `content:` block covering headings/emphasis/lists/links/a GFM table, a
  separate panel (or the same one, a second block) with an embedded
  `<script>` tag and an `onerror`-bearing element for the XSS scenarios,
  and a panel with missing/empty `content:` for the empty-state case —
  check whether `tests/fixtures/dashboard-config/`'s existing fixture
  files need a new panel entry or a new fixture file added as part of
  implementation (tasks.md's concern, not decided here).

## Run the integration test

```bash
npm run test:integration -- markdownPanel
```

Boots the app for real (Playwright, real fixture data — no DuckDB-WASM
query involved for this panel type at all) and asserts:

1. A `markdown` panel's `content:` renders as real HTML elements
   (`<h2>`, `<strong>`/`<em>`, `<ul>`/`<ol>`, `<a href>`), not literal
   markdown syntax as visible text.
2. A GFM table in `content:` renders as a real `<table>` structure —
   proves marked's `gfm: true` default and DOMPurify's default
   table-tag allow-list both hold in the real rendered DOM (research.md
   §2/§3), not just in isolated library-source review.
3. A `<script>` tag in `content:` does not execute and does not appear
   as a `<script>` element in the rendered DOM.
4. An element with an `onerror`/`onclick` attribute in `content:` has
   that attribute stripped and never fires.
5. Legitimate markdown elsewhere in the same `content:` block still
   renders correctly alongside a neutralized unsafe fragment.
6. A panel with missing/empty/whitespace-only `content:` renders
   `PanelEmptyState`, not a blank card or a thrown error.
7. The panel gets `004`'s expand trigger with no panel-specific setup,
   and the same rendered HTML appears in both the inline card and the
   expanded dialog.
8. A tab mixing a markdown panel with valuebox/plotly/table panels
   renders all of them without error.
9. A plain markdown link in `content:` (no author-written `target`/`rel`)
   renders as an `<a>` element whose DOM attributes include
   `target="_blank"` and `rel="noopener noreferrer"` — asserted directly
   against the element's attributes, not inferred from click behavior
   alone (research.md §6).

## Manually verify

```bash
npm run dev:fixtures && npm run dev
```

1. **Formatted output, not raw markdown** — confirm a markdown panel
   shows real headings/bold/lists/links, not literal `##`/`**`/`-`/`[]()`
   characters as text.
2. **Typography matches the dashboard** — confirm rendered headings use
   the same heading typeface as valuebox titles/table headers elsewhere
   on the tab, and body text/lists use the same body typeface — not
   marked.js's unstyled browser-default look (serif headings, default
   link blue, etc.).
3. **XSS payload does nothing** — open browser devtools console while
   loading a fixture panel with an embedded script/`onerror` payload;
   confirm no script executes, no console error from a fired handler,
   and no alert/network call the payload would have triggered.
4. **GFM table renders** — confirm a `content:` block with pipe-table
   syntax shows as an actual bordered table, not raw `|`-delimited text.
5. **Empty state shows, not a blank card** — configure a panel with no
   `content:` key; confirm it shows the same empty-state visual language
   (icon + message) other panel types use for "no data," not an
   unstyled blank `<Card>`.
6. **Expand inherits automatically** — confirm the markdown panel's card
   shows the same expand icon every other panel type has, and the
   dialog view shows identical rendered content to the inline card.
7. **Visual consistency (SC-003)** — confirm the markdown panel's card
   uses the same border/shadow/spacing tokens as every other panel card
   on the same tab.
8. **Links open in a new tab, safely** — click a plain markdown link in
   a rendered panel; confirm it opens in a *new* browser tab, not the
   current one (the dashboard's loaded scenario/filter selections in the
   original tab are unaffected). In devtools, inspect the rendered `<a>`
   element and confirm it carries `target="_blank"` and
   `rel="noopener noreferrer"` even though the source `content:` markdown
   never wrote either attribute (research.md §6).

## Expected outcome

All of spec.md's SC-001 through SC-005 hold: markdown/GFM elements
render correctly (SC-001); embedded script/handler payloads never
execute, verified by an automated assertion, not visual inspection alone
(SC-002); rendered typography matches the rest of the dashboard (SC-003);
a mixed-panel-type tab loads with zero markdown-attributable errors
(SC-004); and the panel gains 004's expand-to-dialog behavior with zero
markdown-specific code in `panelExpandHost.tsx`/`panelCard.tsx` (SC-005).
The `PanelConfigBase` shape, the marked.js/DOMPurify default-config
verification, and spec.md's Assumption that external links open safely in
a new tab are all resolved in research.md (§1-§3, §6) and directly
exercised by the tests above, not left for this feature's own code to
improvise.
