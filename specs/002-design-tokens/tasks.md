---

description: "Task list for Design Token and Component Foundation (002-design-tokens)"
---

# Tasks: Design Token and Component Foundation

**Input**: Design documents from `/specs/002-design-tokens/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included for User Story 2 (the contrast unit test *is* that story's
entire deliverable — there's no separate "should we test this" question).
Visual verification for the other stories is manual (`quickstart.md`) — there's
no Playwright suite in this feature (`plan.md`'s Technical Context: no boot
sequence or scenario data to exercise; the demo page's correctness is either
arithmetic, already covered by the US2 test, or genuinely visual).

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1/US2 = P1, US3 = P2, US4 = P3).

## Path Conventions

Single-project web frontend, additive to `001-data-state-layer`'s existing
scaffold (`package.json`, `vite.config.ts`, `tsconfig.json` already exist —
this feature extends them, not replaces them).

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Add `tailwindcss` (v3), `react`, `react-dom`,
  `class-variance-authority`, `clsx`, `tailwind-merge`,
  `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `lucide-react` to
  `package.json` (dependencies/devDependencies split matching
  `001-data-state-layer`'s existing convention); run `npm install`
- [X] T002 [P] Update `tsconfig.json`: add `"jsx": "react-jsx"` to
  `compilerOptions` — React is adopted starting this feature
  (`research.md` §7)
- [X] T003 [P] Create `demo.html` at repo root as a separate Vite entry point
  (NOT `index.html`) — empty shell with a root `<div>` and
  `<script type="module" src="/src/demo/main.tsx">`, per `plan.md`'s
  Structure Decision (keeps the demo route structurally out of the
  production dashboard entry, per FR-009/SC-005)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The token pipeline every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete —
all four stories read from `src/styles/tokens.css` in some form (US1/US3
via rendering, US2 via direct parsing, US4 via its documentation).

- [X] T004 Write `src/styles/tokens.css` per `contracts/token-contract.md` —
  all four tiers: Tier 1 raw brand tokens, Tier 2 shadcn semantic roles
  (`:root` light values + `.dark` overrides), Tier 3 typography (not
  theme-dependent), Tier 4 elevation (`:root` + `.dark`, different
  mechanism per mode); include the `body { font-family: var(--font-body) }`
  base rule
- [X] T005 [P] Write `tailwind.config.js` per
  `contracts/tailwind-config-contract.md` — `colors`/`borderRadius`/
  `fontFamily`/`boxShadow` all referencing CSS custom properties directly
  (`var(--role)`, not `hsl(var(--role))` — this feature's tokens are plain
  hex, per `research.md` §6's documented deviation from typical shadcn
  boilerplate); zero literal hex/rgb/hsl values anywhere in this file
  (depends on T004's token names being finalized — they are, per
  `data-model.md`)
- [X] T006 Create `components.json` (shadcn's own config file) — hand-authored
  to match `tailwind.config.js`'s actual paths/aliases rather than running
  shadcn's interactive `init` and risking it overwrite T005's exact config
  (`cssVariables: true`, `tailwind.config: "tailwind.config.js"`,
  `tailwind.css: "src/styles/tokens.css"`, aliases pointing at
  `src/components`/`src/lib`) — depends on T005
- [X] T007 [P] Write `src/lib/utils.ts` — shadcn's own `cn()` helper
  (`clsx` + `tailwind-merge`)
- [X] T008 [P] Write `src/lib/loadBrandFonts.ts` — ported from
  `APP-Project-Scoresheet`'s `src/theme/fonts.ts` (`research.md` §8): same
  Google Fonts CDN URL and weight/style ranges (Poppins & Inter 300–700
  normal+italic, Fira Code 400/500/700), same idempotent inject-once
  function, same `preconnect` hints for `fonts.googleapis.com` /
  `fonts.gstatic.com`
- [X] T009 [P] Copy the six logo PNGs from `wfrc-brand`'s
  `_extensions/wfrc-brand/assets/logo/` into `src/assets/logo/` (mirroring
  the `horizontal/`/`stacked/`/`abbreviated/` subfolder structure) per
  `data-model.md`'s Logo Asset table — satisfies FR-001's logo-assets
  clause; not consumed by any component in this feature (`research.md` §1)

**Checkpoint**: Token pipeline (colors, typography, elevation), build config,
font loading, and logo assets all exist. User story implementation can begin.

---

## Phase 3: User Story 1 - A developer building the next dashboard feature inherits a working, WFRC-branded component foundation (Priority: P1) 🎯 MVP

**Goal**: Four working shadcn components, styled entirely through the token
pipeline, rendered on a demo page.

**Independent Test**: Load the demo page with no scenario data, panel
registry, or dashboard layout present; visually confirm the components
render in WFRC's brand colors and typography, not framework defaults.

### Implementation for User Story 1

- [X] T010 [US1] Generate/write `src/components/ui/button.tsx` — CVA variants
  for `primary`/`secondary`/`destructive` (`bg-primary`/`bg-secondary`/
  `bg-destructive` + matching `-foreground` text + `ring` on focus); label
  text uses `font-heading` per `data-model.md`'s Component table
- [X] T011 [US1] Generate/write `src/components/ui/card.tsx` — `Card`/
  `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`, using
  `bg-card`/`text-card-foreground`/`border`/`rounded-lg`/`shadow-md`
  (resting elevation, `research.md` §9); `CardTitle` uses `font-heading`,
  `CardDescription`/body content uses the inherited `font-body` default
- [X] T012 [US1] Generate/write `src/components/ui/tabs.tsx`
  (`@radix-ui/react-tabs`) — `TabsList`/`TabsTrigger`/`TabsContent` using
  `bg-muted`/`text-muted-foreground` (inactive) and `bg-accent` (active
  indicator); `TabsTrigger` uses `font-heading` (navigation), panel content
  uses `font-body`
- [X] T013 [US1] Generate/write `src/components/ui/tooltip.tsx`
  (`@radix-ui/react-tooltip`) — `TooltipContent` using the `card`-derived
  surface + `border` + `shadow-lg`; label text uses `font-body`
  (`research.md` §8's flagged ambiguous call)
- [X] T014 [US1] Write `src/demo/DesignTokenDemo.tsx` — renders all four
  components in enough variant states to visually cover every semantic
  role in `data-model.md`'s table at least once (`contracts/
  component-contract.md`'s Demo page rules); includes a light/dark toggle
  (toggles the `.dark` class on `<html>`); calls `loadBrandFonts()` once on
  mount (depends on T007–T013)
- [X] T015 [US1] Write `src/demo/main.tsx` — mounts `<DesignTokenDemo />`
  into `demo.html`'s root element, imports `src/styles/tokens.css` (depends
  on T003, T014)
- [X] T016 [US1] Manually verify `quickstart.md` steps 1–2: `npm run dev`,
  open the demo route, confirm all four components render in brand colors;
  check computed styles to confirm headings/labels resolve to Inter and
  body content resolves to Poppins, not a fallback font (depends on T015)

**Checkpoint**: User Story 1 is independently testable — the demo page
renders a real, working, branded component set end to end.

---

## Phase 4: User Story 2 - Accessibility is verified before any dashboard content is built on top of the tokens (Priority: P1) 🎯 MVP

**Goal**: Every semantic color pairing provably meets WCAG 2.1 AA in both
modes — provably meaning a test asserts it, not meaning it was eyeballed
once during planning.

**Independent Test**: For every semantic token pairing, in both light and
dark mode, compute the contrast ratio and confirm it meets the WCAG 2.1 AA
threshold. Runs against `src/styles/tokens.css` alone — no dependency on
US1's components existing.

### Implementation for User Story 2

- [X] T017 [US2] Write `tests/unit/tokenContrast.test.ts` — parses
  `src/styles/tokens.css`'s actual `:root`/`.dark` custom-property blocks
  (reads the real file, not a hardcoded copy of the values — per
  `token-contract.md`'s Given/When/Then, so the test fails if the file
  drifts without the test being updated), computes the WCAG
  relative-luminance contrast ratio for every `-foreground`/base pairing
  listed in `data-model.md`'s Design Token table, and asserts ≥4.5:1 in
  both modes (depends on T004)
- [X] T018 [US2] Run `npm run test:unit -- tokenContrast` and confirm 100%
  of pairings pass in both modes (SC-001) (depends on T017)

**Checkpoint**: User Stories 1 AND 2 both independently functional — a real,
branded, accessibility-verified foundation.

---

## Phase 5: User Story 3 - Restyling for a different brand or agency touches only token values, never component code (Priority: P2)

**Goal**: Confirm the customization boundary is real, not just claimed.

**Independent Test**: Change root-level token values to arbitrary substitute
values and confirm the demo page's components reflect the change with zero
component-file edits.

### Implementation for User Story 3

- [X] T019 [US3] Manually verify `quickstart.md` step 5: temporarily change
  `--primary` (and optionally `--accent`) in `src/styles/tokens.css` to an
  arbitrary substitute hex, reload the demo page, confirm every consuming
  component reflects the change, then revert (SC-004) (depends on T016)
- [X] T020 [US3] Inspect all four files under `src/components/ui/` and
  confirm zero literal hex values or arbitrary (non-token) Tailwind color
  utilities appear anywhere — only semantic token classes (FR-004, SC-003)
  (depends on T010–T013)

**Checkpoint**: User Stories 1–3 all independently functional — the
restyling boundary is verified, not assumed.

---

## Phase 6: User Story 4 - Brand-value provenance is documented, not just implied by code (Priority: P3)

**Goal**: Confirm a reviewer can trace every token's provenance from
documentation alone.

**Independent Test**: A reviewer with no prior context reads
`research.md`/`data-model.md` and correctly states, for any given token,
whether its value came from the canonical WFRC brand source as-is or was
adjusted, and why.

### Implementation for User Story 4

- [X] T021 [US4] Review `research.md` §1–9 and `data-model.md`'s Design
  Token table against SC-002 — for a sample of tokens across all four
  tiers, confirm the documented derivation actually answers "brand-literal,
  or adjusted, and why" without needing to read component code. This
  feature's planning artifacts already satisfy this (written during
  `/speckit-plan`); this task is a verification/sign-off pass — file any
  gap found as a documentation fix, not a new artifact

**Checkpoint**: All four user stories independently functional and verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T022 [P] Confirm `demo.html`/`src/demo/*` are excluded from
  `vite.config.ts`'s production build (no `rollupOptions.input` entry
  referencing `demo.html`) — or, if included, document explicitly why the
  throwaway demo is meant to ship, since the spec's default assumption is
  that it isn't (FR-009/SC-005, spec Assumptions)
- [X] T023 Run the full `quickstart.md` validation end to end (all 7 steps)
  and confirm SC-001 through SC-005 all pass (depends on T016, T018, T019,
  T020)
- [X] T024 [P] Verify `src/assets/logo/` contains exactly the six expected
  files with the exact filenames in `data-model.md`'s Logo Asset table
  (FR-001 file-presence check) (depends on T009)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends only on Foundational.
- **User Story 2 (Phase 4)**: Depends only on Foundational (T004) — does
  **not** depend on US1's components existing; can run in parallel with
  Phase 3 once Phase 2 completes.
- **User Story 3 (Phase 5)**: Depends on US1's demo page (T016) and
  component files (T010–T013) — verifies behavior that only exists once
  US1 is built.
- **User Story 4 (Phase 6)**: Depends only on Foundational/planning
  artifacts already existing — a documentation review, not new code.
- **Polish (Phase 7)**: Depends on all desired user stories being complete.

### Parallel Opportunities

- Setup: T002, T003 (after/alongside T001)
- Foundational: T005, T007, T008, T009 (T006 depends on T005)
- **US1 and US2 can be built in parallel** once Foundational completes —
  genuinely independent, unlike `001-data-state-layer`'s stories which
  shared a boot-sequence file
- Polish: T022, T024

---

## Parallel Example: Foundational Phase

```bash
Task: "Write tailwind.config.js per contracts/tailwind-config-contract.md"
Task: "Write src/lib/utils.ts (shadcn's cn() helper)"
Task: "Write src/lib/loadBrandFonts.ts, ported from Scoresheet's theme/fonts.ts"
Task: "Copy the six logo PNGs into src/assets/logo/"
```

## Parallel Example: User Story 1 + User Story 2

```bash
# Once Foundational (Phase 2) is done, these can run at the same time:
Task: "Build the four shadcn components + demo page (Phase 3, US1)"
Task: "Write and run the token contrast unit test (Phase 4, US2)"
```

---

## Implementation Strategy

### MVP Scope: User Story 1 + User Story 2

Both are P1 in `spec.md` — together they're the real minimum viable
foundation: US1 alone proves the pipeline renders something branded; US2 is
what makes it safe to build on (accessibility verified, not assumed).
Genuinely parallelizable once Foundational is done, unlike `001`'s P1 pair.

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) — blocking.
2. Complete Phase 3 (US1) and Phase 4 (US2), in parallel or either order →
   **validate both independently**.
3. **MVP checkpoint.**
4. Add Phase 5 (US3) → validate → Phase 6 (US4) → validate, in priority
   order.
5. Phase 7 (Polish) once all four stories are in.

### Incremental Delivery

Each phase's checkpoint is independently verifiable per `spec.md`'s own
Independent Test for that story. US3 and US4 build on US1's artifacts but
have their own distinct pass/fail criteria.

---

## Notes

- `[P]` tasks touch different files with no dependency on incomplete work.
- `[US#]` maps every user-story-phase task to its story for traceability.
- This feature is additive to `001-data-state-layer` — nothing here modifies
  `src/main.ts`, `src/services/`, or `src/state/`.
- Per FR-009, nothing in this task list creates a panel registry entry,
  scenario-data dependency, or dashboard layout/navigation wiring.
- Commit after each task or logical group; stop at any checkpoint to
  validate a story independently before moving on.
