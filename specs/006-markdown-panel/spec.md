# Feature Specification: MarkdownPanel

**Feature Branch**: `006-markdown-panel`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "Add a fourth panel type — markdown — to the registry, following the same pattern as ValueBoxPanel/PlotlyPanel/TablePanel and inheriting 004's expand-to-dialog mechanism automatically (no per-type wiring). Renders static/authored prose content via marked.js, per docs/SPEC.md's Panel types table. Grammar resolved from docs/GRAMMAR.md's `type: markdown` example: a literal `content:` block of raw markdown text, no `metric:`/`$scenario`/`$filters` placeholder substitution — pure static text, no data binding. Rendered markdown must be sanitized against XSS (marked.js + DOMPurify). Uses 002-design-tokens' typography (font-heading for headings, font-body for prose)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author renders formatted prose in a dashboard tab (Priority: P1)

A dashboard author (a TDM analyst preparing a calibration report, working in
a `dashboard-*.yaml` file) writes a block of methodology notes, a section
header, or a caveat about data limitations, and places it inline in a tab's
layout the same way they'd place a chart or a table. When a dashboard user
opens that tab, the text renders as formatted prose — headings, bold text,
lists, links — instead of raw markdown syntax, styled to match the rest of
the dashboard rather than looking like an unstyled text dump.

**Why this priority**: This is the entire feature. Every other property
(sanitization, dialog inheritance, styling) only matters once authored
markdown renders as formatted output in a panel card. Without this, there
is no MarkdownPanel.

**Independent Test**: Add a `type: markdown` panel with a `content:` block
containing a heading, bold text, a list, and a link to a fixture
`dashboard-*.yaml`. Load the dashboard and confirm the panel card renders
formatted HTML (a real `<h2>`, `<strong>`, `<ul>`, `<a>`) — not the literal
markdown characters — styled with the dashboard's existing typography.

**Acceptance Scenarios**:

1. **Given** a tab's layout includes a `type: markdown` panel with a
   `content:` block of markdown text, **When** the dashboard loads,
   **Then** the panel card renders the content as formatted HTML matching
   standard markdown semantics (headings, emphasis, lists, links,
   paragraphs).
2. **Given** a rendered markdown panel, **When** compared visually against
   a plotly or table panel on the same tab, **Then** headings use the same
   heading typeface/weight and body text uses the same body typeface as
   the rest of the dashboard's design system — not marked.js's unstyled
   default output.
3. **Given** a markdown panel rendered inside a panel card, **When** the
   user activates the card's expand trigger, **Then** the same formatted
   content renders in the expanded dialog view, inherited automatically
   with no markdown-specific code added to the expand mechanism.

---

### User Story 2 - Dashboard stays safe when markdown content is untrusted (Priority: P1)

`dashboard-*.yaml` files are authored alongside model scripts in a separate
repository (per CLAUDE.md's config-authoring convention) and may be
authored by someone other than the person deploying the dashboard. A
markdown panel's `content:` could contain raw HTML or a script-bearing
payload — deliberately or by accident (e.g. a pasted snippet with an
embedded `<img onerror=...>`). The dashboard must never execute that
payload in the viewer's browser.

**Why this priority**: This is a security property, not a nice-to-have —
it's called out explicitly in the feature request because marked.js does
not sanitize by default, and this is the first panel type in the app that
renders authored content as HTML rather than as data-driven chart/table
output. Ships alongside User Story 1, not after it.

**Independent Test**: Add a `type: markdown` panel whose `content:`
includes a raw `<script>` tag and an `<img>` tag with an `onerror`
handler. Load the dashboard and confirm neither executes — the script
does not run, and no error handler fires — while any legitimate markdown
elsewhere in the same `content:` block still renders normally.

**Acceptance Scenarios**:

1. **Given** a markdown panel's `content:` contains a `<script>` tag,
   **When** the panel renders, **Then** the script does not execute and
   no script element is present in the rendered output.
2. **Given** a markdown panel's `content:` contains an HTML element with
   an inline event-handler attribute (e.g. `onerror`, `onclick`),
   **When** the panel renders, **Then** the handler attribute is stripped
   and does not fire.
3. **Given** a markdown panel's `content:` mixes legitimate markdown
   (a heading, a list) with an unsafe HTML fragment, **When** the panel
   renders, **Then** the legitimate markdown still renders correctly and
   only the unsafe fragment is neutralized.

---

### User Story 3 - Panel behaves consistently with the rest of the registry (Priority: P2)

A developer adding this panel type expects it to slot into the existing
registry, layout grid, and panel-card chrome (title, expand trigger, error
boundary) the same way every other panel type does, with no special-casing
elsewhere in the app. An unrecognized or missing `content:` value should
fail predictably rather than crash the tab.

**Why this priority**: Lower than Stories 1-2 because it's about
integration consistency and a defined failure mode, not the panel's core
rendering behavior — but still needed before this panel type is genuinely
"done" per the project's own panel pattern.

**Independent Test**: Register the `markdown` type in the panel registry
and load a tab that mixes a markdown panel alongside valuebox/plotly/table
panels. Confirm the markdown panel appears in its assigned grid position
with standard panel-card chrome (title, expand icon), and that a markdown
panel with a missing/empty `content:` value renders a defined empty state
rather than throwing.

**Acceptance Scenarios**:

1. **Given** a tab layout with a `type: markdown` panel alongside other
   panel types, **When** the tab renders, **Then** the markdown panel
   appears in its configured row/width position with the same card title
   bar and expand trigger every other panel type has.
2. **Given** a `type: markdown` panel with no `content:` key or an empty
   `content:` value, **When** the panel renders, **Then** it shows a
   defined empty state instead of a blank card or a thrown error.

---

### Edge Cases

- A `content:` block containing only whitespace is treated the same as a
  missing `content:` — the empty state, not an empty-but-technically-
  "ready" panel.
- Markdown tables, code fences, and nested lists — anything in the
  CommonMark surface marked.js supports — render correctly, since
  `content:` is arbitrary author-supplied markdown, not a constrained
  subset.
- A markdown panel is never in a loading or error state from a data
  fetch — it has no query — so those states either don't apply to this
  panel type or are trivially always "ready" once content is present
  (resolved during planning, not assumed here).
- Links in rendered content should be safe to click without navigating
  the dashboard itself away in a way that loses application state
  (e.g. external links open in a new tab) — resolved during planning as
  an implementation default, not a new user-facing configuration knob.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support a `type: markdown` panel in
  `dashboard-*.yaml` layouts, following the documented grammar
  (`type`, `title`, `content`, `width`) — no `metric`, `scenario`,
  `filter`, `$metric.`/`$scenario`/`$filters` placeholder substitution,
  or DuckDB query of any kind.
- **FR-002**: The system MUST render the `content:` value as formatted
  HTML following standard markdown semantics: headings, emphasis (bold/
  italic), ordered and unordered lists, links, paragraphs, and code
  spans/blocks at minimum.
- **FR-003**: The system MUST sanitize all rendered markdown output
  before it reaches the DOM, removing script execution vectors (script
  tags, inline event-handler attributes, `javascript:` URLs) regardless
  of whether the unsafe content was written as raw HTML inside the
  `content:` block or produced by the markdown renderer itself.
- **FR-004**: The system MUST style rendered markdown output using the
  dashboard's existing design-token typography — headings in the
  heading typeface, body text/lists/paragraphs in the body typeface —
  rather than the markdown renderer's unstyled default output.
- **FR-005**: The markdown panel type MUST be registered in the panel
  registry and render through the same panel-card chrome (title bar,
  error boundary, expand-to-dialog trigger) as every other panel type,
  with no markdown-specific changes to the panel card or expand
  mechanism itself.
- **FR-006**: The system MUST render a defined empty state when a
  markdown panel's `content:` is missing, empty, or whitespace-only,
  rather than an unstyled blank card or a thrown error.
- **FR-007**: The system MUST NOT show a loading state or issue a data
  query for a markdown panel — content available at render time (parsed
  once from the already-loaded `dashboard-*.yaml`) is all this panel
  type ever needs.
- **FR-008**: Expanding a markdown panel to the dialog view MUST render
  the same formatted content as the inline card, with no
  markdown-specific wiring added to make that happen (inherited from the
  existing generic expand mechanism, per constitution v2.2.0 / 004's
  design).

### Key Entities

- **Markdown panel config**: One panel entry in a tab's layout with
  `type: markdown`, an author-supplied `content` string (raw markdown
  text, may itself contain literal HTML), a `title`, and a layout
  `width` — no data-source fields (`metric`, `scenario`, `filter`) since
  this panel type has no query.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A markdown panel with a `content:` block covering headings,
  emphasis, lists, and links renders 100% of those elements as their
  correct HTML equivalents, matching standard markdown semantics.
- **SC-002**: A markdown panel containing a script tag or an inline
  event-handler attribute never executes that payload in the browser —
  verified by an automated test asserting no script runs and no handler
  fires, not by visual inspection alone.
- **SC-003**: Rendered markdown headings and body text are visually
  indistinguishable in typeface from headings/body text in the rest of
  the same dashboard tab (valuebox titles, table headers, panel-card
  chrome) — same font family per element role.
- **SC-004**: A dashboard tab mixing a markdown panel with valuebox,
  plotly, and table panels loads and renders all panel types with zero
  additional errors attributable to the markdown panel.
- **SC-005**: Expanding a markdown panel to its dialog view and
  collapsing it back requires zero markdown-specific code — proven by
  the panel needing no changes to `panelExpandHost.tsx` or
  `panelCard.tsx` beyond what 004 already built for the existing panel
  types.

## Assumptions

- `content:` is always a literal inline markdown string in the
  `dashboard-*.yaml` file (docs/GRAMMAR.md's documented example) — not a
  reference/path to an external file. No external-file-reference grammar
  exists today for this or any other panel type.
- This panel type has no data binding — no `$metric.`/`$scenario`/
  `$filters` placeholder substitution applies to `content:`. Authors
  wanting to reference a specific number should use a `valuebox` panel
  instead; `sqlExpander.ts` is not invoked for markdown panels.
  `PanelConfigBase`'s `metric` field, required for every other panel
  type today, does not apply to markdown panels — resolved as a typing
  concern during planning, not a spec-level requirement.
- No loading/error state applies in the data-fetch sense (no query to
  fail or wait on); an empty/missing `content:` state is the one
  non-"ready" state this panel type has (FR-006).
- marked.js + DOMPurify is the sanitization pairing per current
  documented best practice for marked.js (marked.js's own docs state it
  does not sanitize output); implementation specifics (library versions,
  DOMPurify configuration) are a planning-phase decision, not specified
  here.
- External links in rendered content open in a new browser tab/window
  (`target="_blank"` with the standard `rel="noopener noreferrer"`
  safeguard) so a viewer clicking a methodology citation doesn't lose
  the dashboard's loaded scenario/filter state — a planning-phase
  implementation default, not a new configuration knob for authors.
- Out of scope: any other undelivered panel type (`observable-plot`,
  `sankey`, `zonemap`, `flowmap`, `graphic-walker` remain separately
  deferred per the existing Implementation order in CLAUDE.md); any
  in-app WYSIWYG markdown authoring/editing UI — this feature renders
  config-authored markdown text, it does not add a way to write it
  inside the app.
