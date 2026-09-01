# Data Model: MarkdownPanel

**Feature**: `006-markdown-panel` | **Date**: 2026-08-31

No new persisted data, no new config file, no new config file type
(constitution Principle VII unaffected). This feature's shapes are: the
typed parsing of `type: markdown`'s already-documented `dashboard-*.yaml`
grammar (`layout/types.ts`), and the restructuring of the shared
`PanelConfigBase` that grammar's own shape requires (research.md §1).

---

## `PanelConfigBase` (restructured — common layer only)

| Field | Type | Notes |
|---|---|---|
| `title` | `string` | Panel-card title — every panel type has one |
| `width` | `number?` | Layout-grid width fraction — every panel type has one |
| `height` | `number?` | Optional fixed height — every panel type may have one |

`metric`/`filter`/`scenario`/`scenarios` are **no longer** on this
interface — moved to the new `DataBoundPanelConfigBase` below
(research.md §1). Anything that extends `PanelConfigBase` directly (this
feature's `MarkdownPanelConfig`, and the existing `UnknownPanelConfig`)
has no data-binding fields at all unless it declares its own.

---

## `DataBoundPanelConfigBase` (new — extends `PanelConfigBase`)

| Field | Type | Notes |
|---|---|---|
| `metric` | `string` | Which `scenario__*`/`observed__*` view this panel queries — required, unchanged from today's `PanelConfigBase.metric` |
| `filter` | `string?` | `$filters.<id>` reference — unchanged from today |
| `scenario` | `string?` | Restrict to one named scenario view — unchanged from today |
| `scenarios` | `string[]?` | Override which active scenarios this panel unions over — unchanged from today |

`ValueBoxPanelConfig`, `PlotlyPanelConfig`, and `TablePanelConfig` all
re-parent from `PanelConfigBase` onto `DataBoundPanelConfigBase` — a pure
`extends` change, no field additions/removals on any of the three (they
already declared/used every field this layer now carries).

---

## `MarkdownPanelConfig` (`type: 'markdown'`, extends `PanelConfigBase` — new)

| Field | Type | Notes |
|---|---|---|
| `content` | `string?` | Literal inline markdown text (`docs/GRAMMAR.md`'s documented grammar — a YAML block scalar, not a file reference). Optional at the type level because a missing/empty/whitespace-only value is a defined, non-crashing state (FR-006), not a parse error |

No `metric`/`filter`/`scenario`/`scenarios` — this panel type has no
query (FR-001/FR-007). `PanelConfigBase`'s common fields (`title`,
`width`, `height`) apply unchanged.

**Union update**: `layout/types.ts`'s `PanelConfig` becomes
`ValueBoxPanelConfig | PlotlyPanelConfig | TablePanelConfig |
MarkdownPanelConfig | UnknownPanelConfig` — a `type: markdown` entry now
parses to a real, narrowed type instead of falling through to
`UnknownPanelConfig`'s wide shape.

---

## Sanitized HTML (internal — `MarkdownPanel.tsx`, not part of the YAML grammar)

Not a named type — a `useMemo`-derived `string | null` local to the
component (research.md §4):

| Value | Meaning |
|---|---|
| `null` | `config.content` is missing, empty, or whitespace-only after `.trim()` — renders `PanelEmptyState` |
| `string` | `DOMPurify.sanitize(marked.parse(trimmed))` — sanitized HTML, every `<a>` additionally carrying `target="_blank"`/`rel="noopener noreferrer"` (research.md §6, applied via a module-level `afterSanitizeAttributes` hook, not part of `sanitize()`'s own config), safe to pass to `dangerouslySetInnerHTML` |

No `loading`/`ready`/`error` status field exists for this panel type
(research.md §4) — unlike `ValueBoxPanelConfig`/`PlotlyPanelConfig`/
`TablePanelConfig`'s rendering components, which all hold a four-state
`status`/`state` value driven by an async fetch.

---

## Relationships

```
dashboard-*.yaml's type: markdown entry
        |
        v  layout/types.ts's parseDashboardConfig()
  MarkdownPanelConfig { content?, ...common (title/width/height) }
        |
        v  panels/registry.tsx lookup by .type === 'markdown'
  MarkdownPanel.tsx
        |
        +-- NO useFilterState, NO services/duckdb.ts import, NO
        |   panelQuery.ts/sqlExpander.ts involvement — the one panel
        |   type with zero data-binding surface (FR-001/FR-007)
        |
        v  useMemo, keyed on config.content
  marked.parse(trimmed)        -> raw HTML string (GFM on by default,
  |                                research.md §2)
  DOMPurify.sanitize(...)      -> sanitized HTML string (research.md §3)
        |
        v  MarkdownPanel.tsx's own render
  PanelEmptyState (content missing/blank)
    -- or --
  <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} /> — the one
  place in this codebase where dangerouslySetInnerHTML is correct,
  because the value passing through it has already gone through
  DOMPurify.sanitize(), never raw config.content or raw marked() output
```

`004`'s expand-to-dialog mechanism (`usePanelExpandHost`) has no
relationship to any of the shapes above — `MarkdownPanel` is just another
`PanelComponent` the mechanism portals, identical in that respect to
`ValueBoxPanel`/`PlotlyPanel`/`TablePanel` (FR-008/SC-005). Because there
is no fetch effect to interrupt or duplicate, the unmount-race concern
`003`'s FR-011 and `004`'s own design rigor were written to address
doesn't apply to this panel type at all — there is nothing in flight to
race.
