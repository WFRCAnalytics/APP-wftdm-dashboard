---

description: "Task list for MarkdownPanel"
---

# Tasks: MarkdownPanel

**Input**: Design documents from `/specs/006-markdown-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/,
quickstart.md — all present

**Tests**: Included. `research.md`/`quickstart.md`/`contracts/` name specific
required Playwright scenarios (not optional coverage), matching `003`-`005`'s
established practice. No Vitest suite this feature (research.md §5 — no
pure-logic module exists to extract; sanitize-and-render is two library
calls, not project-specific algorithmic logic).

**Organization**: Tasks are grouped by user story (spec.md's US1-US3), after
a Foundational phase that builds the shared infrastructure every story
needs (the `PanelConfigBase` split, `MarkdownPanelConfig`, and fixture data
rich enough to exercise all three stories' Playwright coverage — not just
US1's).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files/scopes, no dependency on an
  incomplete task)
- **[Story]**: US1-US3 (spec.md's priorities)
- Most test tasks target `tests/integration/markdownPanel.spec.ts` — marked
  `[P]` where the *scenarios themselves* are independent (no shared mutable
  state), even though several land in the same file; write each as its own
  `test()`/`describe()` block.

## Path Conventions

Single-project web frontend (`src/`, `tests/` at repo root), per plan.md's
Project Structure — additive to `001`-`005`.

---

## Phase 1: Setup

**Purpose**: This feature's only new dependencies — unlike `005` (which
added none), `markdown`'s grammar (`project-docs/SPEC.md`'s own pinned choice) needs
two new runtime libraries before anything else can be built.

- [x] T001 Add `marked` (^18.0.11) and `dompurify` (^3.4.14) to
      `package.json` `dependencies` and run `npm install`. Both ship their
      own TypeScript types (plan.md's Technical Context) — no
      `@types/marked`/`@types/dompurify` to add alongside them. Confirm
      `npm run typecheck` still passes with no new type errors after
      install (nothing imports either package yet at this point, so this
      is just confirming the install itself didn't break anything)

**Checkpoint**: Dependencies installed, nothing yet imports them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure every user story's tasks depend on — the
restructured config-type hierarchy and fixture data covering all three
stories' Playwright coverage.

**🚨 CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Split `PanelConfigBase` in `src/layout/types.ts` per
      `data-model.md`/research.md §1: `PanelConfigBase` keeps only
      `title`/`width`/`height`; add a new `DataBoundPanelConfigBase extends
      PanelConfigBase` carrying `metric`/`filter`/`scenario`/`scenarios`.
      Re-parent `ValueBoxPanelConfig`, `PlotlyPanelConfig`, and
      `TablePanelConfig` onto `DataBoundPanelConfigBase` (`extends`-only
      change — no field additions/removals on any of the three).
      `UnknownPanelConfig` continues extending the plain `PanelConfigBase`
      (already true today, now correctly reflecting "not assumed
      data-bound" rather than being loosened from a `metric`-requiring
      base). Depends on T001 only in the sense of sequencing (no actual
      code dependency)
- [x] T003 **Typecheck checkpoint**: run `npm run typecheck` and confirm it
      passes with zero errors — proves `ValueBoxPanel.tsx`/`PlotlyPanel.tsx`/
      `TablePanel.tsx`, `panelQuery.ts`, and every other existing consumer
      of `PanelConfigBase`'s fields still compile correctly against the
      split from T002, *before* `MarkdownPanelConfig` (which depends on the
      split existing) is added. Do not proceed to T004 until this is clean.
      Depends on T002
- [x] T004 [P] Add `MarkdownPanelConfig` (`type: 'markdown'`, extends
      `PanelConfigBase` directly, `content?: string`) to
      `src/layout/types.ts` per `data-model.md`; add it to the `PanelConfig`
      union. Depends on T003 (the checkpoint must be clean first)
- [x] T005 [P] Add fixture data to
      `tests/fixtures/dashboard-config/dashboard-1-summary.yaml` (a new
      `row_markdown` layout row, alongside the existing `row_kpis`/
      `row_chart`/`row_table` rows — so US3's "mixed panel types on one
      tab" coverage is exercised for free, matching `005`'s own fixture
      precedent): (a) a `type: markdown` panel whose `content:` covers a
      heading, bold/italic text, an ordered and unordered list, a link, a
      GFM pipe-table, and a code span — for US1's formatting/typography
      coverage; (b) a `type: markdown` panel whose `content:` embeds a
      literal `<script>alert(1)</script>` tag, an element with an
      `onerror`/`onclick` attribute, and legitimate markdown text mixed in
      alongside both — for US2's XSS-neutralization coverage; (c) a
      `type: markdown` panel with no `content:` key at all, and a fourth
      with `content: "   "` (whitespace-only) — for US3's/FR-006's empty-
      state coverage. Needed by every Playwright task below, not only
      US1's

**Checkpoint**: Shared infrastructure exists and is verified — existing
panel types unaffected (T003), config types and fixture data ready. Nothing
markdown-specific renders yet (no component, no registry entry).

---

## Phase 3: User Story 1 - Author renders formatted prose in a dashboard tab (Priority: P1) 🎯 MVP

**Goal**: A `type: markdown` panel's `content:` renders as real, correctly-
styled HTML — headings, emphasis, lists, links (with safe `target`/`rel`),
and GFM tables — matching the dashboard's own typography, and inherits
`004`'s expand-to-dialog mechanism with zero markdown-specific wiring.

**Independent Test**: Configure a `markdown` panel with a `content:` block
covering headings/emphasis/lists/links/a table, load the dashboard tab,
confirm the panel card renders formatted HTML matching standard markdown
semantics, styled with the dashboard's own typeface classes.

### Tests for User Story 1

> Write these first; they should fail until T011-T013 land.

- [x] T006 [P] [US1] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      a markdown panel's `content:` (headings, emphasis, ordered/unordered
      lists, a link) renders as real HTML elements (`<h2>`, `<strong>`/
      `<em>`, `<ul>`/`<ol>`/`<li>`, `<a href>`) — not literal markdown
      syntax as visible text
- [x] T007 [P] [US1] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      a GFM pipe-table in `content:` renders as a real `<table>`/`<thead>`/
      `<tbody>`/`<tr>`/`<th>`/`<td>` structure — the direct proof marked's
      `gfm: true` default and DOMPurify's table-tag allow-list both hold in
      the real rendered DOM (research.md §2/§3), not just in isolated
      library-source review
- [x] T008 [P] [US1] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      rendered headings carry the `font-heading` class/computed font-family
      and body text/lists carry `font-body`, matching a `valuebox`/`table`
      panel's own title/header typography on the same tab — not marked.js's
      unstyled default output
- [x] T009 [P] [US1] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      a plain markdown link (`[text](url)`, no author-written `target`/
      `rel`) renders as an `<a>` element whose DOM attributes include
      `target="_blank"` and `rel="noopener noreferrer"` — proves the
      `afterSanitizeAttributes` hook applies to the common case (research.md
      §6)
- [x] T010 [P] [US1] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      a markdown panel gets `004`'s expand trigger with no panel-specific
      setup, and the same rendered HTML appears in both the inline card and
      the expanded dialog

### Implementation for User Story 1

- [x] T011 [US1] Implement `MarkdownPanel.tsx`'s core shape per
      `contracts/markdown-panel.md`: `useMemo` keyed on `config.content`
      that trims, returns `null` for empty/whitespace-only input (renders
      `PanelEmptyState`), otherwise returns
      `DOMPurify.sanitize(marked.parse(trimmed, { async: false }))`;
      renders the sanitized string via `dangerouslySetInnerHTML` inside a
      `font-body` container with heading-selector overrides to
      `font-heading` (research.md §4). No `useFilterState`, no
      `services/duckdb.ts` import, no loading/error state — this panel type
      has no query (FR-001/FR-007). Depends on T004
- [x] T012 [US1] Implement the DOMPurify `afterSanitizeAttributes` hook in
      `MarkdownPanel.tsx` per research.md §6: registered exactly once, at
      module load (not inside the component — a hook added on every render
      would stack duplicates), setting `target="_blank"` and
      `rel="noopener noreferrer"` on every `<a>` element DOMPurify produces,
      unconditionally. Kept as its own explicit implementation step, not
      assumed to "just happen" as part of T011's generic sanitize call —
      confirmed via T009 that it actually fires for the common
      plain-markdown-link case, not just a hand-authored raw `<a target>`.
      Include a one-line comment at the registration site noting that
      `DOMPurify.addHook()` registers globally on the DOMPurify module, not
      scoped to this file's own `sanitize()` calls — any future, unrelated
      `DOMPurify.sanitize()` call elsewhere in the app would also get its
      `<a>` tags rewritten by this same hook (harmless today,
      `MarkdownPanel.tsx` is this app's only DOMPurify consumer, but worth
      a future consumer knowing up front rather than discovering it by
      surprise — research.md §6's scope caveat). No design change from
      this, just making the scope explicit in the code. Depends on T011
      (same file, same `useMemo` pipeline)
- [x] T013 [US1] Register `markdown: MarkdownPanel` in
      `src/panels/registry.tsx`. Depends on T012

**Checkpoint**: User Story 1 is fully functional and independently
testable — a markdown panel renders correctly-formatted, correctly-styled,
correctly-linked HTML, and inherits `004`'s expand mechanism.

---

## Phase 4: User Story 2 - Dashboard stays safe when markdown content is untrusted (Priority: P1)

**Goal**: Script tags and inline event-handler attributes embedded in
`content:` never execute or fire, regardless of whether they appear alone
or mixed with legitimate markdown.

**Independent Test**: Configure a markdown panel whose `content:` includes
a `<script>` tag and an `onerror`-bearing element, load the dashboard,
confirm neither executes/fires while any legitimate markdown elsewhere in
the same block still renders.

**Note**: `DOMPurify.sanitize()` is already unconditionally part of T011's
implementation (research.md §3 — the sanitize pass is not a separately
addable step; there is no code path that produces HTML without it). This
story's tasks are test-only, verifying that already-built behavior — the
same relationship `005`'s error-state coverage had to its own
already-built query-rejection branch.

### Tests for User Story 2

- [x] T014 [P] [US2] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      a markdown panel whose `content:` contains a literal `<script>` tag
      renders with no `<script>` element in the DOM and no script execution
      (assert via a page-level flag the payload would have set, not visual
      inspection alone — spec.md's SC-002)
- [x] T015 [P] [US2] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      a markdown panel whose `content:` contains an element with an
      `onerror`/`onclick` attribute renders that element with the attribute
      absent, and the handler never fires
- [x] T016 [P] [US2] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      a markdown panel whose `content:` mixes a legitimate heading/list with
      an unsafe fragment (script tag or handler attribute) renders the
      legitimate markdown correctly while only the unsafe fragment is
      neutralized — proves sanitization doesn't over-strip alongside the
      unsafe content

### Implementation for User Story 2

*No new implementation tasks* — covered by T011/T012 above (see Note).

**Checkpoint**: User Stories 1 and 2 both hold, independently and together
— formatted rendering and sanitization are proven as two distinct,
separately-tested properties of the same implementation.

---

## Phase 5: User Story 3 - Panel behaves consistently with the rest of the registry (Priority: P2)

**Goal**: The markdown panel type integrates into the existing registry/
layout grid/panel-card chrome with no special-casing, and a missing/empty
`content:` fails predictably (an empty state) rather than crashing.

**Independent Test**: Register the `markdown` type, load a tab mixing it
with valuebox/plotly/table panels, confirm standard panel-card chrome and
grid placement; confirm a panel with missing/empty `content:` shows a
defined empty state.

**Note**: Like US2, this story is test-only — T011's empty-state branch and
T013's registry entry already implement everything this story needs; no
markdown-specific panel-card/registry code exists to write beyond what US1
already built.

### Tests for User Story 3

- [x] T017 [P] [US3] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      a tab mixing a markdown panel with valuebox/plotly/table panels (the
      fixture's `row_markdown` alongside `row_kpis`/`row_chart`/`row_table`)
      renders all panel types without error, and the markdown panel's card
      has the same title bar and expand trigger every other panel type has
- [x] T018 [US3] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      a markdown panel with no `content:` key renders `PanelEmptyState` —
      not a blank card, not a thrown error
- [x] T019 [P] [US3] Playwright test in `tests/integration/markdownPanel.spec.ts`:
      a markdown panel with `content: "   "` (whitespace-only) renders the
      identical empty state as T018's missing-`content:` case — confirms
      the `.trim()` check in T011, not merely a falsy/empty-string check

### Implementation for User Story 3

*No new implementation tasks* — covered by T011/T013 above (see Note).

**Checkpoint**: All three user stories are independently functional and
verified together — the full `project-docs/GRAMMAR.md` `type: markdown` grammar
this feature scoped itself to is implemented end to end, safely, and
consistently with every other panel type.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T020 [P] Run `quickstart.md`'s full validation pass end to end — the
      automated `npm run test:integration -- markdownPanel` run, plus every
      manual verification step (including the devtools XSS check and the
      link-opens-in-new-tab check)
- [x] T021 [P] Run the full Playwright suite (`npx playwright test
      --workers=1 --reporter=list`, this project's established serial-
      worker convention) and confirm zero regressions in `boot.spec.ts`/
      `dashboardShell.spec.ts`/`panelExpand.spec.ts`/`tablePanel.spec.ts` —
      the fixture change in T005 (a new `row_markdown` layout row on
      `dashboard-1-summary.yaml`, a file those existing suites already
      exercise) is the one change in this feature with real cross-feature
      blast-radius potential
- [x] T022 [P] Re-confirm plan.md's Constitution Check against what was
      actually built — expected to still read PASS across all nine
      principles with no new Complexity Tracking entries; update the note
      only if implementation revealed an actual deviation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001). T002 → T003
  (checkpoint) → T004 is strictly sequential (each depends on the previous
  being correct, not just present); T005 is independent of that chain —
  **BLOCKS all user stories**.
- **User Stories (Phase 3-5)**: All depend on Foundational completing.
  US1's implementation tasks (T011-T013) are the only tasks in this feature
  that write new component code — US2 and US3 are test-only phases that
  verify properties T011/T012/T013 already provide, so US2/US3 depend on
  US1's implementation tasks being complete, not just Foundational (unlike
  `005`, where each story added genuinely new wiring on top of the last).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests written first (US1); expected to fail until T011-T013 land.
- US2/US3 tests are written against T011-T013's already-complete
  implementation — no "write first, watch it fail" cadence applies to
  them the way it does to US1, since there is no separate implementation
  step for those stories to wait on.

### Parallel Opportunities

- T005 (Foundational) can run in parallel with T002-T004's sequential
  chain — different file.
- Within US1, all test tasks (T006-T010) marked `[P]` can be authored in
  parallel (independent `test()`/`describe()` blocks) once fixture data
  (T005) exists.
- T014-T016 (US2) and T017-T019 (US3) can all be authored in parallel with
  each other once T011-T013 land — different scenarios, same file, no
  shared mutable state.
- T020/T021/T022 (Polish) can run in parallel with each other.

---

## Parallel Example: User Story 1

```bash
# Once Phase 2 (T001-T005) is complete, author all US1 test scenarios together:
Task: "Playwright: headings/emphasis/lists/links render as real HTML in tests/integration/markdownPanel.spec.ts"
Task: "Playwright: GFM table renders as real <table> in tests/integration/markdownPanel.spec.ts"
Task: "Playwright: headings/body use font-heading/font-body in tests/integration/markdownPanel.spec.ts"
Task: "Playwright: plain link gets target=_blank + rel=noopener noreferrer in tests/integration/markdownPanel.spec.ts"
Task: "Playwright: 004 expand-dialog inheritance in tests/integration/markdownPanel.spec.ts"

# Then, once tests exist and fail as expected:
Task: "Implement MarkdownPanel.tsx core render + sanitize pipeline"
Task: "Implement the afterSanitizeAttributes target/rel hook"
Task: "Register markdown: MarkdownPanel in src/panels/registry.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 — both P1)

1. Complete Phase 1 (Setup — dependencies) and Phase 2 (Foundational —
   type split, `MarkdownPanelConfig`, fixture data).
2. Complete Phase 3 (US1): rendering, typography, link safety, `004`
   inheritance.
3. Complete Phase 4 (US2): confirm the sanitization T011 already
   implements actually holds under real XSS payloads.
4. **STOP and VALIDATE**: run T006-T016 and confirm they pass.
5. This alone is a demoable, mergeable increment — spec.md itself frames
   US1 and US2 as shipping together, not sequentially, since correct
   rendering without safety (or safety without correct rendering) is not
   an acceptable intermediate state for a panel type whose `content:` may
   come from an untrusted author.

### Incremental Delivery

1. Setup + Foundational → shared infrastructure ready.
2. Add US1 → test independently → formatted, styled, link-safe rendering
   exists.
3. Add US2 → test independently (no new code) → confirmed safe against
   untrusted `content:`. Together, US1+US2 are the MVP.
4. Add US3 → test independently (no new code) → confirmed consistent with
   the rest of the panel registry, including the empty-state edge case.
5. Polish → full quickstart pass, full-suite regression check, Constitution
   re-confirmation.

---

## Notes

- Unlike `005-table-panel`, US2 and US3 here add **zero** new
  implementation tasks — both verify properties of the single
  `MarkdownPanel.tsx` implementation US1 builds (T011/T012/T013). This is
  a direct consequence of research.md §4/§5's own findings: there's one
  render pipeline (trim → parse → sanitize → hook → render-or-empty-state),
  not per-story wiring layered incrementally the way `TablePanel.tsx`'s
  sort/paginate/search wiring was.
- T009 (link `target`/`rel`) is deliberately its own task, not folded into
  T006's general link-rendering check — this is the property the user
  explicitly flagged as missing from the original research pass and
  resolved via research.md §6; it deserves an independently-visible
  assertion, the same reasoning `005`'s T010 (asymmetric diverging
  midpoint) was kept standalone for.
- T021 (full-suite regression run) is included even though this feature's
  own code changes are additive and narrowly scoped, because T005's
  fixture change lands in a file (`dashboard-1-summary.yaml`) three other
  features' Playwright suites already read from — the one real
  cross-feature blast-radius vector in this feature, worth confirming
  directly rather than assumed harmless.
- Commit after each task or logical group; verify each story's tests fail
  before implementing (US1 only — see Notes above for why US2/US3 don't
  follow that cadence), pass after.

## Completion

All 22 tasks done. Full suite green: 76 unit tests (9 files, unchanged from
`005` — no new Vitest suite this feature, research.md §5) + 57 integration
tests (`boot.spec.ts` + `dashboardShell.spec.ts` + `panelExpand.spec.ts` +
`tablePanel.spec.ts` + this feature's 11 new `markdownPanel.spec.ts` tests),
run serially — no regressions in any prior feature's coverage. `npm run
typecheck` clean throughout, including the deliberate T003 checkpoint
between the `PanelConfigBase` split and adding `MarkdownPanelConfig`.

**One real bug T003 caught, exactly as research.md §1 point 3 predicted**:
splitting `PanelConfigBase` broke `panels/panelQuery.ts`'s `buildPanelQuery`/
`resolveActiveScenarios`, which read `config.metric`/`config.scenario`/
`config.filter`/`config.scenarios` unconditionally against the full
`PanelConfig` union (including `UnknownPanelConfig`, which no longer has
those fields once the split landed). Fixed by re-typing both functions'
`config` parameter as `DataBoundPanelConfigBase` instead of `PanelConfig` —
the compiler catching this, rather than a future runtime `undefined` in a
SQL template, is the exact benefit research.md §1 argued the split would
provide over a `metric?: string` bolt-on. `panels/panelQuery.ts`'s existing
`'column' in config` narrowing (used to distinguish a `valuebox`'s
`SELECT "col"` from every other type's `SELECT *`) continued to typecheck
unchanged against the narrower parameter type — TypeScript's `in`-narrowing
intersection behavior on a non-union interface handled it with no code
change needed there.

No other implementation surprises — `MarkdownPanel.tsx`'s core render
path, the `afterSanitizeAttributes` hook, and all three fixture panel
families (formatting, XSS, empty-state) passed their Playwright coverage
on the first run.
