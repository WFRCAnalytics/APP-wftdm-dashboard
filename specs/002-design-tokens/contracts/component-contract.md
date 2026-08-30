# Contract: shadcn components (`src/components/ui/*.tsx`) + demo page

Satisfies: FR-004, FR-006, FR-007, FR-008, FR-009.

## Component source rules

- Generated via the shadcn CLI (`npx shadcn@latest add <component>`) into
  `src/components/ui/` — **editable source in this repo**, not an installed
  black-box dependency (spec's own framing). `@radix-ui/react-*` packages
  *are* real installed dependencies (shadcn's components are thin styled
  wrappers around them) — only the styling/composition layer is
  repo-owned source.
- Every color/spacing/radius class a component uses MUST resolve to a
  semantic token (e.g. `bg-primary`, `text-muted-foreground`,
  `rounded-[--radius]`) via `tailwind.config.js`'s mapping
  (`contracts/tailwind-config-contract.md`) — never a literal hex value or an
  arbitrary Tailwind color (e.g. `bg-blue-600`) written directly in a
  component file.
- First four candidates (`data-model.md`'s Component table): Button, Card,
  Tabs, Tooltip — exact count within the spec's stated 3–4 range decided at
  implementation time; each must individually demonstrate at least one
  semantic role not already covered by an earlier component in the set (no
  two components chosen only to duplicate the same token coverage).
- Typography classes (`font-heading`/`font-body`, defaulted via the global
  `body` rule so most components need no explicit class) MUST match
  `data-model.md`'s per-component/per-element table exactly — headings and
  navigation-like labels (`CardTitle`, `TabsTrigger`, Button's label) use
  `font-heading`; prose content uses the inherited `font-body` default
  (`research.md` §8).
- `Card` MUST apply `shadow-md` (resolving to `--shadow-md`) in its resting
  state and `Tooltip` MUST apply `shadow-lg`, alongside `border` — giving
  both real visual separation from the page background, not border alone
  (`research.md` §9's gap, closed).

## Demo page rules

- One route/page, explicitly out-of-band from any future dashboard
  navigation (FR-009) — no panel registry entry, no scenario-data dependency,
  no `services/`/`state/` import.
- Renders every chosen component in enough variant states to visually cover
  every semantic role in `data-model.md`'s table at least once (e.g. Button
  in `primary`/`secondary`/`destructive` variants; Card showing `card`/
  `card-foreground`/`border`; Tabs showing `muted`/`accent`; Tooltip showing
  the `card`-derived popover surface + `border`).
- Includes a working light/dark toggle (per `research.md`'s Assumptions — any
  reasonable mechanism, e.g. toggling the `.dark` class on `<html>`) so both
  token sets are visually verifiable from the same page, not just the
  default mode.
- Calls `loadBrandFonts()` (`src/lib/loadBrandFonts.ts`, `research.md` §8)
  once on mount, so the demo page is where the font pipeline is actually
  exercised end to end — not `main.ts` (out of this feature's scope,
  `001-data-state-layer`'s boot sequence is untouched).

## Given/When/Then

- **Given** the demo page is loaded with no scenario data, panel registry, or
  layout code present, **when** it renders, **then** every sampled component
  displays using the reconciled WFRC brand tokens (SC-003, SC-005).
- **Given** a component file is inspected, **when** its class list is
  checked, **then** zero literal hex values or arbitrary (non-token)
  Tailwind color utilities appear (FR-004, SC-003).
- **Given** the dark-mode toggle is used, **when** the page re-renders,
  **then** every component reflects the `.dark` token overrides with no
  separate dark-specific component code (FR-008).
- **Given** the demo page has mounted, **when** `document.fonts` is
  inspected (or the components are visually compared against a fallback
  system font), **then** Poppins/Inter/Fira Code are actually loaded and
  applied, not just named in CSS that resolves to nothing (Story 1
  Acceptance Scenario #1).

## Non-goals for this feature

- No panel registry integration, no `PanelConfig` types, no scenario-aware
  rendering — explicitly deferred (FR-009, spec Assumptions).
- No comprehensive shadcn component library (only the 3–4 chosen) — proving
  the pipeline, not building out every eventual dashboard component.
- No logo/header component — the six logo assets (`data-model.md`'s Logo
  Asset entity) are copied and provisioned by this feature but not rendered
  by the demo page or any of the four chosen components (`token-contract.md`
  Non-goals).
