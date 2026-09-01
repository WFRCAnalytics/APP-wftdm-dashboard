# Implementation Plan: MarkdownPanel

**Branch**: `006-markdown-panel` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-markdown-panel/spec.md`

## Summary

Add the fourth panel type — `markdown` — to the registry, following
`ValueBoxPanel`/`PlotlyPanel`/`TablePanel`'s established shape (a function
component receiving a single `config` prop, registered in
`panels/registry.tsx`) but *not* the query-chain part of that pattern:
`docs/GRAMMAR.md`'s real `type: markdown` grammar (`content:` — a literal
inline markdown string, `title`, `width`) confirms this panel type has no
`metric`/`$scenario`/`$filters` data binding at all, so `MarkdownPanel.tsx`
has no `useFilterState`, no `services/duckdb.ts` import, and no
loading/fetch effect — content is already present, synchronously, in the
already-parsed `dashboard-*.yaml` object graph at mount time (research.md
§4). The two substantive open questions research.md resolves before
design (not improvised during coding, per explicit instruction): whether
`layout/types.ts`'s `PanelConfigBase` should split into a common layer
plus a separate data-bound layer now that a genuinely query-less panel
type exists (§1 — yes, split), and whether marked.js/DOMPurify's actual
defaults (not assumed "CommonMark is enough" or "sanitizing needs custom
config") cover GFM tables and script/handler stripping out of the box
(§2/§3 — yes to both, verified against each library's real source/docs
this session).

## Technical Context

**Language/Version**: TypeScript (ES2022 target), same as `001`-`005`

**Primary Dependencies**: Two new runtime dependencies — `marked` (GFM
markdown → HTML, `docs/SPEC.md`'s own pinned choice for this panel type)
and `dompurify` (HTML sanitization; marked.js's own docs are explicit it
does not sanitize output, and DOMPurify is the standard pairing — research
confirmed, not assumed, §2/§3). Both ship their own TypeScript types
(`dompurify`'s `package.json` `types`/`exports` fields point at its own
`.d.ts`; `marked` has shipped its own types since v5) — no
`@types/marked`/`@types/dompurify` needed. Existing: `react`/`react-dom`,
the existing `Card` shadcn component (via `panelCard.tsx`, unmodified),
`004`'s expand-to-dialog mechanism (consumed automatically, zero
markdown-specific wiring, per FR-008/SC-005).

**Component source**: New `src/panels/MarkdownPanel.tsx` (the React/DOM
layer — thinner than every prior panel type: no `useState`/`useEffect`
fetch chain, just a `useMemo`-computed sanitized-HTML string rendered via
`dangerouslySetInnerHTML`, the one place in this codebase that's the
correct, contained use of it — research.md §3/§4). Modified:
`src/layout/types.ts` (split `PanelConfigBase` into a common layer +
`DataBoundPanelConfigBase`, research.md §1; add `MarkdownPanelConfig`;
`ValueBoxPanelConfig`/`PlotlyPanelConfig`/`TablePanelConfig` re-parented
onto `DataBoundPanelConfigBase` with no field changes of their own),
`src/panels/registry.tsx` (new `markdown` entry), `package.json`
(`marked`, `dompurify` added).

**Storage**: N/A — no query, no persistence. `config.content` comes from
the already-fetched-and-parsed `dashboard-*.yaml` object graph
(`yamlLoader.ts`, unmodified) — nothing new to fetch.

**Testing**: Vitest for nothing new at the "pure logic" tier — there is no
separate pure module to extract here (unlike `tableLogic.ts`/
`plotlyTraces.ts`): sanitize-and-render is exactly two library calls, not
project-specific algorithmic logic worth isolating from the component.
Playwright: `tests/integration/markdownPanel.spec.ts`, matching
`tablePanel.spec.ts`'s real-browser/real-fixture-data pattern — rendering
each CommonMark/GFM element family (headings, emphasis, lists, links,
tables, code), the XSS-neutralization scenarios from spec.md's User
Story 2 (script tag, inline event-handler attribute, mixed
safe+unsafe content), the empty-state case (missing/whitespace-only
`content:`), the external-link `target`/`rel` check (research.md §6), and
`004`'s expand-dialog inheritance check (same rendered HTML, dialog vs.
inline).

**Target Platform**: Browser — same as `001`-`005`

**Project Type**: Single-project web frontend, additive to `001`-`005`

**Performance Goals**: N/A explicit numeric target — parsing/sanitizing a
panel-sized markdown string is not a workload this project needs to
budget against (no query latency involved at all, unlike every other
panel type).

**Constraints**: Rendered output MUST be sanitized before reaching the DOM
regardless of source — raw HTML embedded in `content:` and HTML produced
by marked.js's own conversion both go through the same DOMPurify pass, no
"trusted because it came from the markdown renderer, not the raw config"
exception (FR-003). No query MUST be issued for this panel type (FR-007)
— enforced by construction: `MarkdownPanel.tsx` has no `services/duckdb.ts`
import at all, not merely an unused one.

**Scale/Scope**: 1 new panel component (`MarkdownPanel.tsx`), 1 new type
in `layout/types.ts` plus the `PanelConfigBase` split (research.md §1,
touches all three existing data-bound config interfaces as a re-parent,
no field changes), 1 new registry entry, 2 new runtime dependencies, 1 new
Playwright spec. No new panel type beyond `markdown` itself
(`observable-plot`/`flowmap`/`zonemap`/`sankey` remain deferred, per
spec.md's own stated boundary).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed | New/modified files are `.tsx`/`.ts`; React already adopted — fourth, ordinary consumer of the established panel pattern (component-shape part), deliberately not the query-chain part, per docs/GRAMMAR.md's real grammar | PASS |
| II. DuckDB-WASM off the main thread, one shared instance | Not touched — `MarkdownPanel.tsx` has no `services/duckdb.ts` import at all (FR-007), the only panel type of which that's true | PASS |
| III. No `eval()` | `MarkdownPanel.tsx` builds no SQL and calls no dynamic code execution — `marked.parse()`/`DOMPurify.sanitize()` are library calls over a config string, not `eval()` or an equivalent | PASS |
| IV. YAML parsed at runtime | `content:` is parsed from `dashboard-*.yaml` at runtime via the existing `layout/types.ts` seam (extended, not replaced) — no build-time baking | PASS |
| V. Parquet-only browser I/O | N/A — no new data I/O path; this panel type has no data I/O of any kind | PASS (N/A) |
| VI. Fixed Technology Choices | `marked`/`dompurify` are new dependencies, but both are `docs/SPEC.md`'s own pinned choice (`markdown \| marked.js`) plus the documented standard pairing for sanitizing marked.js output — not a deviation requiring a constitution amendment, since Principle VI's fixed-choices list doesn't enumerate panel-rendering libraries (Plotly.js/Observable Plot/Graphic Walker aren't listed there either) | PASS |
| VII. Minimal, Fixed Config File Set | No new config file type; `content:` is a new *key* within the existing `dashboard-*.yaml` type's already-documented `type: markdown` grammar, not a new file | PASS |
| VIII. Reuse Proven Reference Implementations | N/A — none of the four named reference repos cover markdown rendering; this principle's named scope doesn't reach this feature | PASS (N/A) |
| IX. Fixed Python/JS Source Split | No Python package code touched; all new files under `src/` | PASS |

No unjustified violations. Complexity Tracking table is not needed (left
empty below).

**Post-Phase 1 re-check**: research.md's decisions (`PanelConfigBase`
split; marked.js `gfm: true` default; DOMPurify default allow-list;
no loading-state machine for this panel type) and data-model.md/
contracts's resulting shapes introduce nothing that revisits the table
above — no principle is touched differently than assessed pre-research.
Still PASS across all nine.

## Project Structure

### Documentation (this feature)

```text
specs/006-markdown-panel/
├── plan.md                    # This file
├── research.md                # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/                  # Phase 1 output
│   └── markdown-panel.md
├── checklists/
│   └── requirements.md
└── tasks.md                    # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

Single-project web frontend, additive to `001`-`005`. Only the paths this
feature creates/touches are listed.

```text
src/
├── layout/
│   └── types.ts                 # modified — PanelConfigBase split into
│                                 # a common base + DataBoundPanelConfigBase
│                                 # (research.md §1); + MarkdownPanelConfig;
│                                 # ValueBoxPanelConfig/PlotlyPanelConfig/
│                                 # TablePanelConfig re-parented, no field
│                                 # changes of their own
└── panels/
    ├── registry.tsx              # modified — + 'markdown': MarkdownPanel
    └── MarkdownPanel.tsx          # new — the React/DOM layer (see
                                    # contracts/markdown-panel.md); no
                                    # separate pure-logic module (research.md
                                    # §5 — sanitize-and-render isn't
                                    # project-specific algorithmic logic
                                    # worth isolating the way tableLogic.ts/
                                    # plotlyTraces.ts were)

tests/
└── integration/
    └── markdownPanel.spec.ts    # new — Playwright: renders each
                                  # CommonMark/GFM element family, XSS
                                  # neutralization (script tag, inline
                                  # event handler, mixed safe+unsafe),
                                  # empty state, 004 expand-dialog
                                  # inheritance
```

**Structure Decision**: Single-project layout, additive to `001`-`005`.
No new top-level directory — this feature is scoped to `panels/` (one new
component, no new pure module — research.md §5) and one modification to
`layout/types.ts`'s already-established typed-config seam (a
restructuring of the existing base, not a bolt-on field).

## Complexity Tracking

*No entries — Constitution Check reported no unjustified violations.*
