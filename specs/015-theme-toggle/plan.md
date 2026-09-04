# Implementation Plan: Light/Dark Theme Toggle

**Branch**: `015-theme-toggle` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-theme-toggle/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add the missing write side of this project's already-complete light/dark
system: a visible System/Light/Dark control, mounted in `shell.tsx`'s header
next to the existing `ScenarioLoader`, that toggles `document.documentElement`'s
`dark` class — the same class `useColorScheme()` (`011-basemap-style-system`)
already observes read-only. No token, hook, or panel-type change is needed;
`GraphicWalkerPanel.tsx` and any future `useColorScheme()` consumer pick this
up automatically (research.md §1).

Two real, confirmed findings from reading this project's own current source
shape the design, not assumption:

1. **Tailwind's `darkMode: ['class']` gives the app zero automatic
   OS-preference behavior today** — confirmed by reading `tokens.css` end to
   end (no `@media (prefers-color-scheme)` block anywhere in it) and
   `tailwind.config.js`. "Default to system preference" therefore requires
   real `window.matchMedia('(prefers-color-scheme: dark)')` wiring in
   application code — there is no free Tailwind-level fallback to lean on
   (research.md §2).
2. **A real pre-mount flash risk exists and needs a fix outside React.**
   `main.tsx`'s boot sequence (`await initDuckDB()` → `discoverScenarios()`
   → `loadDashboards()`) runs entirely before `ReactDOM.createRoot(...).render()`
   is ever called; `index.html` sets no background of its own. A
   dark-preferring viewer would see the browser's plain white default for
   the whole boot duration before any React effect could apply the `dark`
   class — a `useLayoutEffect` inside the toggle component cannot fix this,
   since the gap is dominated by async work that happens before React mounts
   at all, not by React's own commit timing (research.md §3). Fixed with one
   synchronous line at the top of `main.tsx`, before the first `await`.

The Theme Mode itself (System/Light/Dark) is ordinary local component state
in a new `layout/themeToggle.tsx` — not a new global store in `state/` — since
no other component ever needs to read the *mode*, only the already-existing
`useColorScheme()`-reported *effective* theme (research.md §4). The
`matchMedia` `'change'` listener's lifecycle is scoped to Theme Mode via a
single effect's dependency array and cleanup function — attached only while
Mode is `'system'`, torn down on every transition away from it — per the
Decision already committed in `spec.md`'s Assumptions and restated formally
in research.md §5.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React (function
components) — same as every UI feature since `002-design-tokens`.

**Primary Dependencies**: `lucide-react` (already a dependency,
constitution-mandated) for `Monitor`/`Sun`/`Moon` icons — confirmed
present, no change. **Revised post-shipping** (research.md §6, a real
control-shape change driven by user feedback, not a defect): the control
was first built reusing `components/ui/tabs.tsx` (shadcn `Tabs`) with no
new dependency at all; after shipping, it was rebuilt as a compact icon-
only `DropdownMenu` trigger instead, adding `@radix-ui/react-dropdown-menu`
(`^2.1.2`) as one new, explicit `package.json` dependency — still within
Principle VI's fixed shadcn/Radix stack (not a new component-library
family), confirmed already present transitively and React-18-compatible
before adding it directly.

**Storage**: N/A — no persistence at all, by design (constitution Principle
VI, spec.md Assumptions). Theme Mode is in-memory `useState` inside
`themeToggle.tsx`, scoped to that one mounted instance's lifetime (i.e., the
current page session/tab).

**Testing**: Vitest is not applicable here in the usual "pure module" sense
this project reserves for `.ts`-only logic (`plotlyTraces.ts`,
`graphicWalkerFields.ts`, etc.) — this feature has no non-trivial DOM-free
logic to isolate; the resolve-and-apply logic is a handful of lines directly
inside the effect, exercised end-to-end instead. Playwright
(`tests/integration/themeToggle.spec.ts`) covers: boot matches emulated
`prefers-color-scheme` (both directions), live OS-preference change while in
System mode, a manual override holding priority over a subsequent OS
change, reload resetting to System, the visible active-mode indicator, and
no state loss in an already-open panel (reusing `graphicWalkerPanel.spec.ts`'s
existing rbd-keyboard-drag helper to put a field on a shelf, toggle theme,
confirm it's still there) across a theme switch.

**Target Platform**: Browser (Vite-built static app) — same as every other
feature.

**Project Type**: Single-project web app (existing `src/`/`tests/`
structure) — no new top-level directory.

**Performance Goals**: No new numeric goal. SC-002's "no perceptible flash"
is the only timing-sensitive success criterion, addressed structurally
(research.md §3), not via a measured budget.

**Constraints**: No `localStorage`/`sessionStorage` (constitution Principle
VI, absolute) — this feature's entire reason for the three-state design
(spec.md Assumptions) flows directly from this constraint, not worked
around by it. No `eval()` — not at risk; this feature introduces no SQL or
expression-evaluation surface at all. `useColorScheme()`
(`src/hooks/useColorScheme.ts`) MUST NOT be modified — confirmed
unnecessary by reading its implementation (research.md §1); any change to
it here would be an unrequested, unjustified expansion of this feature's
own scope.

**Scale/Scope**: One new component (`layout/themeToggle.tsx`), a one-line
addition to `main.tsx` (pre-mount flash fix), a small `shell.tsx` header
change (wrap `ScenarioLoader` + the new control in one right-hand group).
No new panel type, no new config grammar, no new dependency, no new
top-level directory.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v2.4.1:

- **I. TypeScript Throughout, React Permitted When Needed** — PASS.
  `themeToggle.tsx` is a React function component (`.tsx`); no plain `.js`
  introduced anywhere.
- **II. DuckDB-WASM Query Execution Off the Main Thread, One Shared
  Instance** — N/A, genuinely. This feature issues no DuckDB query at all —
  it is pure DOM/CSS-class state, no data layer involvement whatsoever.
- **III. No eval()** — PASS (trivially). No SQL, no YAML-driven expression
  surface; this feature never touches `services/sqlExpander.ts`.
- **IV. YAML Parsed at Runtime** — N/A. No `dashboard-*.yaml`/
  `summarize.yaml`/`manifest.yaml` involvement; Theme Mode is not a
  dashboard-config concept.
- **V. Parquet-Only Browser Data I/O** — N/A. No file I/O of any kind.
- **VI. Fixed Technology Choices** — PASS, and this feature is largely
  *about* satisfying this principle correctly: it uses only the already-
  fixed stack (Tailwind `class`-strategy dark mode, shadcn `Tabs`,
  `lucide-react` icons) and, centrally, respects the "MUST NOT use
  `localStorage` or `sessionStorage`" clause as an absolute constraint that
  directly shapes the three-state design (spec.md Assumptions) rather than
  something to route around via a per-tab `sessionStorage` shortcut or a
  URL query parameter (both explicitly considered and rejected in spec.md).
- **VII. Minimal, Fixed Config File Set** — N/A. No config file of any kind
  is added, read, or changed.
- **VIII. Reuse Proven Reference Implementations** — N/A, genuinely: the
  principle's MUST-copy list covers DuckDB-WASM/Arrow wiring, MapLibre/
  deck.gl overlays, and spatial-SQL/GeoParquet handling — this feature
  touches none of those.
- **IX. Fixed Python/JS Source Split** — PASS. No Python package changes;
  everything lands under `src/`.

No violations. Complexity Tracking table below is empty.

**Post-Phase-1 re-check**: re-verified against the actual `data-model.md`/
`contracts/theme-toggle.md`/`quickstart.md` produced below. No new
principle-relevant design decision emerged beyond what Technical Context
already anticipated — still PASS, no Complexity Tracking entries.

**Post-shipping re-check**: after the feature was implemented and verified
once already, real user feedback (header crowding next to
`ScenarioLoader`'s own variable width, plus a request to consider a
dropdown or switch shape) drove a genuine control-shape revision —
`Tabs` → icon-only `DropdownMenu` (research.md §6). Re-verified against
Principle VI specifically, since this revision adds `@radix-ui/
react-dropdown-menu` as a new, explicit dependency where the original plan
had none: still PASS — `DropdownMenu` is a Radix UI primitive, the same
family Principle VI already names via "shadcn/ui (built on Radix UI
primitives)," not a new, different component-library choice. No other
principle is affected by this revision.

## Project Structure

### Documentation (this feature)

```text
specs/015-theme-toggle/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── theme-toggle.md  # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── main.tsx                  # MODIFIED: + one synchronous line, before the
│                              #   first `await`, applying the resolved
│                              #   System-preference `dark` class pre-mount
│                              #   (research.md §3 — the real flash fix;
│                              #   this line does NOT establish live
│                              #   tracking, only the one-shot initial
│                              #   application before React exists at all)
├── layout/
│   ├── shell.tsx              # MODIFIED: header's right-hand group now
│   │                          #   wraps ScenarioLoader + the new
│   │                          #   ThemeToggle together (top-right,
│   │                          #   spec.md FR-001)
│   └── themeToggle.tsx         # NEW — the three-state System/Light/Dark
│                               #   control (contracts/theme-toggle.md).
│                               #   Owns Theme Mode as local useState (no
│                               #   new global store — research.md §4);
│                               #   one effect resolves + applies the
│                               #   effective theme and manages the
│                               #   matchMedia listener's lifecycle,
│                               #   scoped to Mode (research.md §5).
│                               #   Icon-only DropdownMenu trigger —
│                               #   revised post-shipping from an
│                               #   originally-shipped three-button Tabs
│                               #   shape, real user feedback re: header
│                               #   crowding next to variable-width
│                               #   ScenarioLoader (research.md §6)
├── components/ui/
│   └── dropdown-menu.tsx       # NEW (research.md §6) — hand-authored
│                               #   Radix DropdownMenu wrapper, same
│                               #   pattern as dialog.tsx/tabs.tsx/
│                               #   tooltip.tsx; only Root/Trigger/
│                               #   Content/RadioGroup/RadioItem exported
└── hooks/
    └── useColorScheme.ts       # UNCHANGED — confirmed unnecessary to
                                 #   modify (research.md §1); this feature
                                 #   is purely useColorScheme()'s
                                 #   already-anticipated write-side
                                 #   counterpart

tests/
└── integration/
    └── themeToggle.spec.ts     # NEW — boot-matches-OS-preference (both
                                 #   directions), live OS-change tracking
                                 #   while in System mode, manual override
                                 #   priority over a later OS change,
                                 #   reload-resets-to-System, active-mode
                                 #   indicator, no panel state loss across
                                 #   a switch (reuses graphicWalkerPanel
                                 #   .spec.ts's existing rbd-keyboard-drag
                                 #   helper)
```

**Structure Decision**: Single-project web app, unchanged from every prior
feature — no new top-level directory, no new dependency. New code lands in
the existing `src/layout/` (the new control, alongside `scenarioLoader.tsx`
and `navBar.tsx`, its two nearest siblings in kind) plus a one-line,
narrowly-scoped `main.tsx` addition and a small `shell.tsx` layout change.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally empty.
