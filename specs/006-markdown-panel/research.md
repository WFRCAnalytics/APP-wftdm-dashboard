# Research: MarkdownPanel

**Feature**: `006-markdown-panel` | **Date**: 2026-08-31

---

## 1. `PanelConfigBase` — split into a common layer + a data-bound layer

**Decision**: Split the existing `src/layout/types.ts` `PanelConfigBase`
into two layers:

```ts
// Fields every panel type needs, regardless of whether it queries anything.
export interface PanelConfigBase {
  title: string
  width?: number
  height?: number
}

// Fields only a *querying* panel type needs. Everything that reads
// `services/duckdb.ts` extends this, not PanelConfigBase directly.
export interface DataBoundPanelConfigBase extends PanelConfigBase {
  metric: string
  filter?: string
  scenario?: string
  scenarios?: string[]
}
```

`ValueBoxPanelConfig`, `PlotlyPanelConfig`, and `TablePanelConfig` all
re-parent onto `DataBoundPanelConfigBase` (no field changes of their own —
they already declared/used every field that layer now carries).
`MarkdownPanelConfig` (§below) extends `PanelConfigBase` directly and adds
only `content?: string`. `UnknownPanelConfig` also extends `PanelConfigBase`
directly — loosened slightly from today (it currently extends the
`metric`-requiring base), which is correct: an unrecognized future type
shouldn't be assumed data-bound by the parser, since the parser's whole
job is staying agnostic about types it doesn't know (`layout/types.ts`'s
own existing comment on `UnknownPanelConfig`).

**Rationale — checked against reality, not decided from vibes**: The
question was whether markdown is plausibly the *only* ever query-less
panel type (in which case an optional `metric?: string` bolted onto the
existing base might be an acceptable shortcut) or whether more are
plausible (in which case a clean split earns its cost regardless of exact
headcount). Checked both documented sources for the full panel-type
roster before deciding:

- `project-docs/SPEC.md`'s Panel types table — the authoritative, exhaustive list:
  `plotly`, `observable-plot`, `table`, `valuebox`, `flowmap`, `zonemap`,
  `sankey`, `graphic-walker`, `markdown`. Of these nine, `markdown` is the
  only one with zero query. `graphic-walker` looks close (its own
  `project-docs/GRAMMAR.md` example is a "snapshot" that doesn't respond to
  filters after load) but it still issues one real DuckDB query at mount
  (`SELECT * FROM ${scenario}__${dataset} LIMIT ...`, per
  `CLAUDE.md`'s own Graphic Walker panel snippet) — it's filter-inert, not
  query-less. `flowmap`/`zonemap`/`sankey` all query GeoParquet/DuckDB
  data by their own one-line descriptions in the same table.
- `CLAUDE.md`'s full file tree (the `panels/` directory listing) — no
  image, divider, spacer, or other decorative/static panel type is named
  anywhere as "not built yet," the way `flowmap`/`zonemap`/`sankey`/
  `graphic-walker`/`table` all were before their own features shipped. If
  a second query-less type were already anticipated, this is where it
  would show up as a stub comment; it doesn't.

So, by the actual documented roster, `markdown` genuinely is — today — the
only query-less panel type. **The split is still the right call anyway,
independent of that headcount**, for reasons that don't depend on how many
future types share the property:

1. **Forcing a required-in-spirit field on a type that structurally can't
   use it is a modeling smell regardless of cardinality.** Whether one
   type or five types need to omit `metric`, the honest fix is the same:
   don't put `metric` on the interface those types extend. An `metric?:
   string` optional bolt-on would make every *other* consumer of
   `PanelConfig` (`panelQuery.ts`, `sqlExpander.ts` call sites, any future
   code that assumes "every panel has a metric") re-litigate "wait, can
   this be undefined here?" on every read, for a property that's actually
   *never* undefined on four of the five current panel types and *always*
   undefined on the fifth. A split makes that distinction visible at the
   type level instead of pushed into runtime undefined-checks.
2. **TypeScript's discriminated unions make the split cheap regardless of
   headcount** — this isn't a decision that trades off worse against a
   larger split later. Re-parenting `ValueBoxPanelConfig`/
   `PlotlyPanelConfig`/`TablePanelConfig` onto `DataBoundPanelConfigBase`
   is a one-line `extends` change per interface, no runtime code changes
   (parsing logic in `parseDashboardConfig` doesn't reference
   `PanelConfigBase` by name, only the union `PanelConfig`). If a sixth
   panel type ships tomorrow and turns out to be data-bound, it extends
   the existing `DataBoundPanelConfigBase` for free; if it's query-less
   like `markdown`, it extends the plain `PanelConfigBase` for free. There
   is no future refactor this split defers or makes harder — it's strictly
   available capacity, not speculative generality paid for now against an
   uncertain future.
3. **`sqlExpander.ts`/`panelQuery.ts` already implicitly assume "every
   panel has a `metric`"** — `buildPanelQuery(config, filters)` reads
   `config.metric` unconditionally today. A `metric?: string` bolt-on
   would let that code keep compiling against a config that might not
   have one, silently — exactly the class of bug a discriminated union is
   supposed to catch. `MarkdownPanel.tsx` never calls `buildPanelQuery`
   at all (§4), so this only matters if some future refactor tried to
   route a markdown panel through the shared query path by mistake — the
   type split makes that a compile error, not a runtime `undefined` in a
   SQL template.

**Alternatives considered**:
- *`metric?: string` bolted onto the existing `PanelConfigBase`* — the
  minimal-diff option, rejected per point 1 above: pushes an
  always-vs-never-undefined distinction into every call site instead of
  the type system, for a fix that costs no more effort to do properly
  (point 2) given the union is discriminated by `type` already.
- *A `MarkdownPanelConfig` union member with all of `DataBoundPanelConfigBase`'s
  fields present-but-unused* — rejected: would mean `metric: string`
  remains formally required on a type that has no metric, either forcing
  every `dashboard-*.yaml` author to write a meaningless `metric:` key on
  every markdown panel or forcing `parseDashboardConfig` to silently
  fabricate one — worse than either of the two options actually chosen.

---

## 2. marked.js — GFM (including tables) is on by default, not opt-in

**Decision**: Call `marked.parse(content)` with marked's own defaults — no
explicit `{ gfm: true }` override needed.

**Rationale — verified against marked's actual current source, not
assumed**: The feature request specifically flagged that "CommonMark"
and "GFM" are different specs and tables are a GFM extension, not part of
bare CommonMark — so this was checked directly rather than assumed
covered. Fetched marked's own `defaults` module
(`src/defaults.ts`, `_getDefaults()`) directly: the full default options
object is

```ts
{
  async: false,
  breaks: false,
  extensions: null,
  gfm: true,
  hooks: null,
  pedantic: false,
  renderer: null,
  silent: false,
  tokenizer: null,
  walkTokens: null,
}
```

`gfm: true` is the default — has been marked's default behavior for a
long time (predates this feature), not a new setting this feature is
introducing. GitHub Flavored Markdown (tables, strikethrough, autolinks,
task-list items) is enabled the moment `marked.parse()` is called with no
options object at all. A markdown panel whose `content:` includes a GFM
table (`| col | col |` / `|---|---|` syntax) renders as an actual
`<table>` with no extra configuration.

**Alternatives considered**:
- *Explicitly pass `{ gfm: true }` anyway, for self-documentation* — not
  rejected outright as harmful, but not required either; noting the
  default here in research.md (and a one-line code comment at the call
  site pointing back to this section) accomplishes the same
  self-documentation goal without a config object that could drift from
  marked's actual default if a future marked major version changes it —
  a comment stays accurate by construction; a hardcoded `{ gfm: true }`
  would silently stop being "just confirming the default" the moment
  marked ever changed that default, without anyone noticing.

---

## 3. DOMPurify — default allow-list covers GFM's table tags and strips script/handler vectors, no custom config needed

**Decision**: Call `DOMPurify.sanitize(marked.parse(content))` with
DOMPurify's own defaults — no custom `ALLOWED_TAGS`/`FORBID_ATTR`
configuration.

**Rationale — verified against DOMPurify's actual current source, not
assumed**: Two separate claims needed checking, since the feature request
called out that sanitization correctness has to be verified "not just
under raw marked.js output" — i.e. the sanitizer's defaults have to
actually admit what marked.js's GFM output produces, not just block what's
unsafe.

- **Tables survive sanitization.** Fetched DOMPurify's own tag
  allow-list (`src/tags.ts`, the `html` export used by the default
  `ALLOWED_TAGS` config) directly: it includes `table`, `thead`, `tbody`,
  `tr`, `th`, `td`, `caption`, `colgroup`, and `col` — the complete GFM
  table tag set — among roughly 170 other permitted standard HTML
  elements. A GFM table produced by `marked.parse()` (§2) is not stripped
  by `DOMPurify.sanitize()`'s default allow-list; no custom
  `ALLOWED_TAGS` addition is needed to let tables through.
- **Script/handler vectors are stripped by default, not opt-in.**
  DOMPurify's documented, long-standing default behavior (the entire
  reason it's the standard pairing for untrusted-HTML sanitization) is
  that calling `sanitize(dirty)` with no config already excludes `script`
  tags from its tag allow-list and excludes every `on*` inline
  event-handler attribute (`onerror`, `onclick`, `onload`, etc.) from its
  attribute allow-list, and neutralizes `javascript:`-scheme URLs in
  `href`/`src` attributes. This is not something FR-003 requires a custom
  `FORBID_ATTR`/`FORBID_TAGS` list to achieve — the plain default call is
  the correct, complete implementation of "sanitize before it reaches the
  DOM" for this feature's threat model (an authored `content:` string
  from a `dashboard-*.yaml` file, not a runtime-user-submitted form
  input requiring a stricter, feature-specific allow-list).

Both checks matter together: a sanitizer configured too strictly would
silently drop legitimate GFM tables (breaking User Story 1's own
acceptance scenario); a sanitizer configured too loosely, or skipped,
would fail User Story 2 outright. DOMPurify's actual defaults land
exactly on the needed point for both, verified rather than assumed for
either direction.

**Alternatives considered**:
- *Custom `ALLOWED_TAGS` allow-list, hand-enumerated* — rejected: would
  require maintaining a duplicate of DOMPurify's own already-correct
  default list, with a real risk of a maintainer's manually-typed list
  missing a legitimate GFM/CommonMark tag (e.g. forgetting `colgroup`)
  and silently breaking a table an author expected to render.
- *`marked`'s built-in (non-default, opt-in) sanitize option* — marked
  itself deprecated and removed its own `sanitize` option years ago
  specifically because it could not do this safely/correctly — this is
  precisely why marked's own documentation directs users to a dedicated
  sanitizer library (DOMPurify) instead. Not a real alternative to
  reconsider.

---

## 4. No loading-state machine — content is synchronously available at mount

**Decision**: `MarkdownPanel.tsx` has no `useState('loading' | 'ready' |
'empty' | 'error')` state machine, no `useEffect` fetch, and renders
synchronously from `config.content` on every render (memoized with
`useMemo`, keyed on `config.content`, to avoid re-running
`marked.parse`/`DOMPurify.sanitize` on unrelated parent re-renders):

```tsx
export function MarkdownPanel({ config }: { config: MarkdownPanelConfig }) {
  const html = useMemo(() => {
    const trimmed = config.content?.trim()
    return trimmed ? DOMPurify.sanitize(marked.parse(trimmed, { async: false })) : null
  }, [config.content])

  if (!html) {
    return <PanelEmptyState icon={FileText} message="No content configured" />
  }

  return (
    <div
      className="prose-panel font-body text-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

Only two presentations exist: the shared `PanelEmptyState` (missing or
whitespace-only `content:` — spec.md FR-006, Edge Cases' "whitespace-only
treated as missing") and the rendered content. No `PanelErrorState` case
is added *in this component* — see below.

**Rationale**: `services/yamlLoader.ts` fetches and parses every
`dashboard-*.yaml` file exactly once at boot, returning the full parsed
object graph before any panel ever mounts (`CLAUDE.md`'s own note on
`yamlLoader.ts`, already relied on for why `config.filter_ids`/etc. need
no defensive `useMemo` elsewhere in the panel pattern). By the time
`MarkdownPanel` mounts, `config.content` is not a promise, a pending
fetch, or a value that could still change out from under the component —
it is a plain string already sitting on the parsed config object, for the
entire component's lifetime (a markdown panel's `content:` cannot be
edited live in this app — spec.md's own stated non-goal, no in-app
authoring UI). There is nothing to "wait for" the way every other panel
type waits for `query()` to resolve. Introducing a `loading` state anyway,
purely for shape-parity with `ValueBoxPanel.tsx`/`PlotlyPanel.tsx`/
`TablePanel.tsx`, would be modeling a state transition that structurally
cannot happen — the same category of overreach as `PanelConfigBase`
forcing a `metric` field on a type with no metric (§1) — and would cost a
render frame of an `animate-pulse` skeleton flashing for content that was
already fully available.

**Render-time throws still get caught — by the existing mechanism, not a
new one.** `marked.parse()`/`DOMPurify.sanitize()` are effectively total
functions over a string input (marked is tolerant of malformed markdown by
design — it degrades to treating unparseable spans as literal text rather
than throwing), so a synchronous throw from this component is not an
expected case this feature needs to design a state for. If one somehow
occurred, `panelCard.tsx`'s existing `PanelErrorBoundary` (a class
component, already wrapping every registry-resolved panel including this
one, with zero markdown-specific changes needed) already catches any
synchronous render-time throw and shows `PanelErrorState` — reusing that
existing, generic mechanism is correct here rather than adding a
component-local `try`/`catch` + `error` state that would just duplicate
what the boundary already provides for every other panel type's
render-time failures too.

**`dangerouslySetInnerHTML` is the correct tool here, not a lint
exception to route around.** This is the one place in the codebase where
rendering a raw HTML string is the actual intended behavior (an authored
markdown panel's entire purpose is displaying rendered HTML), and it is
used only after the DOMPurify pass (§3) — never on unsanitized input.

**Alternatives considered**:
- *Keep the `'loading' | 'ready' | 'empty' | 'error'` state machine for
  pattern consistency with every other panel type* — rejected per the
  Rationale above: consistency with a pattern built for async data
  fetching isn't a virtue when applied to a component that structurally
  never fetches anything; it would introduce a state transition (loading
  → ready) that can never actually observably happen, and a flash of
  loading UI for already-available content.
- *Parse/sanitize eagerly outside the component (e.g. once in
  `yamlLoader.ts` at boot)* — rejected: would move DOMPurify's DOM
  dependency into a service module that currently has none, and would
  process every markdown panel's content at boot regardless of whether
  its tab is ever visited, instead of only when the panel actually
  mounts. `useMemo` inside the component already avoids redundant
  reprocessing across re-renders without paying that cost.

---

## 5. Testing strategy — Playwright only, no new pure-logic module

**Decision**: No `tests/unit/*.test.ts` addition for this feature. All
coverage lives in `tests/integration/markdownPanel.spec.ts` (Playwright).

**Rationale**: `003`/`005`'s pure-logic-module-plus-Vitest split
(`plotlyTraces.ts`, `tableLogic.ts`) exists because those modules contain
real project-specific algorithmic decisions worth testing in isolation
from a DOM (numeric-vs-string sort comparators, color-scale midpoint
math, column-resolution fallback order). `MarkdownPanel.tsx` has no
equivalent: "call `marked.parse()`, call `DOMPurify.sanitize()`, render
the result or an empty state" is two library calls and a conditional, not
project logic worth extracting into its own testable module — the actual
thing worth verifying is that the *rendered DOM* is correct and safe,
which is exactly what a real-browser Playwright test proves and a Vitest
unit test (no DOM, per this project's Vitest config) could not directly
observe anyway (confirming a script didn't execute requires a real page).
Playwright: `tests/integration/markdownPanel.spec.ts`, extending
`tablePanel.spec.ts`'s/`panelExpand.spec.ts`'s existing real-browser/
real-fixture-data pattern — CommonMark/GFM element coverage (headings,
emphasis, lists, links, a GFM table, code spans/blocks), the three XSS
scenarios from spec.md's User Story 2, the empty-state case, and `004`'s
expand-dialog inheritance check.

**Alternatives considered**:
- *A thin `markdownLogic.ts` wrapping the two library calls, purely for
  shape-parity with `tableLogic.ts`/`plotlyTraces.ts`* — rejected: an
  extraction with no independent logic to test is a wrapper, not a
  module earning its own file; `003`'s/`005`'s actual reason for
  splitting (Vitest-testable algorithmic risk with no DOM dependency)
  doesn't apply here — there's no DOM-avoidance need in the first place
  once there's no algorithmic content to test.

---

## 6. External links open in a new tab, with a safe `rel` — verified default, plus a post-sanitization hook

**Decision**: After `DOMPurify.sanitize()` runs, force every `<a>`
element in the sanitized output to carry `target="_blank"` and
`rel="noopener noreferrer"`, via DOMPurify's `afterSanitizeAttributes`
hook — not via `ADD_ATTR`/`ALLOWED_ATTR` config, and not by relying on
authors to type these attributes into `content:` themselves.

**Rationale — verified against DOMPurify's actual default attribute
allow-list, same rigor as the GFM-table tag check (§3), not assumed**:
Fetched DOMPurify's own default attribute list (`src/attrs.ts`'s `html`
export) directly. Two different findings, for the two attributes:

- **`rel` is in the default allow-list** — an author who already writes
  `rel="noopener"` by hand in a raw `<a>` inside `content:` would have
  had it survive sanitization unmodified even before this decision. Not
  the gap.
- **`target` is *not* in the default allow-list** — a raw `target="_blank"`
  typed into `content:` would be stripped by `DOMPurify.sanitize()`
  itself, silently, before this feature's own code ever sees the
  sanitized string. This is the actual reason a plain default
  `DOMPurify.sanitize()` call cannot satisfy spec.md's Assumption on its
  own, confirming the gap the user flagged was real, not hypothetical.

Given that, two structurally different ways to close the gap were
available, and the hook-based one was chosen:

- **Passing `{ ADD_ATTR: ['target'] }` as sanitize config** — would stop
  `DOMPurify.sanitize()` from stripping a `target` attribute if one is
  already present in the source HTML, but does nothing for the (expected,
  common) case where an author's markdown link has no `target`/`rel` at
  all — GFM/CommonMark link syntax (`[text](url)`) never produces either
  attribute; marked.js's own renderer doesn't add them. `ADD_ATTR` alone
  would leave most real links exactly as risky as before (opening in the
  same tab, `rel`-less) — it only stops a value from being *removed*, it
  never *adds* one.
- **`afterSanitizeAttributes` hook (chosen)** — a real, documented
  DOMPurify hook (verified present in DOMPurify's own README hook list
  alongside `beforeSanitizeElements`/`uponSanitizeAttribute`/etc.), run
  once per element after DOMPurify's own attribute sanitization pass
  completes for that element. Registered once, module-level (not inside
  the component, so it isn't re-registered on every render):

  ```ts
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  ```

  This unconditionally sets both attributes on *every* `<a>` DOMPurify
  produces, regardless of what the author did or didn't write in
  `content:` — closing the actual common case (plain markdown links,
  which is what `project-docs/GRAMMAR.md`'s own examples show), not just the edge
  case of a hand-authored raw `<a target>`. Because the hook runs after
  DOMPurify's own sanitization of that element, setting `target`/`rel`
  here is not re-exposed to the allow-list check that stripped `target`
  in the first place — the hook operates on the already-sanitized live
  DOM node directly, not on a string DOMPurify would re-scan.

**Scope caveat, noted explicitly, not silently discovered later**:
`DOMPurify.addHook()` registers on the DOMPurify module globally — there
is no per-call or per-instance hook scoping in DOMPurify's API. Once
registered, this hook applies to *every* `DOMPurify.sanitize()` call
anywhere in the app's JS runtime, not only the ones `MarkdownPanel.tsx`
itself makes. Harmless today (`MarkdownPanel.tsx` is this app's only
DOMPurify consumer, per plan.md's Primary Dependencies), but if a future
feature adds its own unrelated `DOMPurify.sanitize()` call, that call's
`<a>` tags would also get rewritten by this same hook — a real, global
side effect, not a bug, but one a future DOMPurify consumer should be able
to discover from a code comment at the registration site rather than by
being surprised in review or in production. No design change follows from
this — the hook is still the correct fix (§ above) — just an explicit
comment requirement, carried into `contracts/markdown-panel.md`'s
illustrative code and into `tasks.md`'s T012.

**Why `rel="noopener noreferrer"` specifically, and why unconditional**:
`target="_blank"` alone lets the newly-opened page's JavaScript access
`window.opener` and repoint the *original* tab (a well-known reverse-
tabnabbing risk) — `rel="noopener"` prevents that; `noreferrer` is
included alongside it (the standard pairing) to also withhold the
`Referer` header, matching this feature's own threat model of
`content:` potentially being authored by someone other than the
dashboard's deployer (spec.md's own framing for the sanitization
requirement, US2). Applying this to *every* link rather than making it
configurable per-link keeps this a planning-phase implementation default
with no new grammar, per spec.md's own Assumption — an author cannot
opt a specific link out of it, deliberately, since the point is a
dashboard viewer never loses the loaded scenario/filter state by
clicking a citation, not a per-link authoring choice.

**Alternatives considered**:
- *`ADD_ATTR: ['target']` plus authors manually writing
  `target="_blank" rel="noopener noreferrer"` into every link* —
  rejected: pushes a security-relevant default onto every dashboard
  author to remember correctly, every time, for every link, instead of
  the app guaranteeing it once. Exactly the class of "don't make safety
  opt-in" reasoning already applied to sanitization itself in §3.
- *Intercepting link clicks in React (an `onClick` handler on the
  container calling `window.open()` manually)* — rejected: works only
  for real user clicks, not "open in a new tab" as a link's actual
  static `target` attribute (browser features like middle-click-to-
  open-in-new-tab, or a screen reader's "open link" action, would still
  navigate the current tab); the DOMPurify hook approach is correct for
  every way a user might interact with the link, not just a synthetic
  click handler's own code path.

---

## Summary

| # | Decision |
|---|---|
| 1 | `PanelConfigBase` split into a common `{title, width, height}` layer and a new `DataBoundPanelConfigBase` (`metric`/`filter`/`scenario`/`scenarios`) that `ValueBoxPanelConfig`/`PlotlyPanelConfig`/`TablePanelConfig` re-parent onto; `MarkdownPanelConfig` extends the plain common base. Justified independent of how many query-less types exist today (only `markdown`, confirmed against `project-docs/SPEC.md`'s full 9-type roster and `CLAUDE.md`'s file tree) — a required-in-spirit field on a type that structurally can't use it is a modeling smell regardless of cardinality, and the split costs one `extends` clause per existing type |
| 2 | marked.js's own `_getDefaults()` sets `gfm: true` by default — GFM (including table syntax) renders with no explicit `{ gfm: true }` config |
| 3 | DOMPurify's default `ALLOWED_TAGS` (`src/tags.ts`'s `html` export) includes the full GFM table tag set (`table`/`thead`/`tbody`/`tr`/`th`/`td`/`caption`/`colgroup`/`col`); its default attribute allow-list excludes all `on*` handlers and neutralizes `javascript:` URLs — no custom DOMPurify config needed for either "tables survive" or "scripts/handlers don't" |
| 4 | No loading/ready/error state machine — `config.content` is synchronously available at mount (already-parsed `dashboard-*.yaml` object graph); only two presentations exist (empty state, rendered content); render-time throws are caught by `panelCard.tsx`'s existing generic `PanelErrorBoundary`, not a new component-local mechanism |
| 5 | No new pure-logic module or Vitest suite — sanitize-and-render is two library calls, not project-specific algorithmic logic; all coverage is Playwright (`markdownPanel.spec.ts`) against real rendered/sanitized DOM output |
| 6 | DOMPurify's default attribute allow-list includes `rel` but excludes `target` (verified against `src/attrs.ts`) — a plain `sanitize()` call would silently strip any hand-authored `target="_blank"` and never adds one to a plain markdown link either way. Closed via a module-level `afterSanitizeAttributes` hook that unconditionally sets `target="_blank"` + `rel="noopener noreferrer"` on every `<a>` DOMPurify produces, not an `ADD_ATTR` config (which only stops removal, never adds the attribute to the common case of a plain markdown link) |
