# Contract: Component Parity & Verification

Applies to every component in `data-model.md` §4 (existing, re-themed)
and §5 (new, form-input primitives).

## What "matches shadcn's exact current styling" means, concretely

For each component, the real, current `new-york-v4` registry source
(fetched directly per `research.md`'s own method — `gh api`/`curl` against
`raw.githubusercontent.com/shadcn-ui/ui`, not assumed from memory or an
older cached version) is the literal reference. A component satisfies this
contract when:

1. Its Tailwind utility classes are the same as the real reference
   source's, adapted only for: this project's plain-hex token convention
   (no `hsl(var(--x))` wrapping), the `cn()` import path (`@/lib/utils`,
   not the bare `cn` package new-york-v4 uses — a real, confirmed,
   deliberately NOT adopted difference, since this project already has an
   equivalent `cn()` and introducing a second one is unnecessary), and any
   Radix import shape difference (individual `@radix-ui/react-*` packages
   vs. the unified `radix-ui` package — a real per-component choice, not
   a blanket policy, decided by whichever this project's own dependency
   tree already leans toward once Phase 1 confirms).
2. It renders correctly in both light and dark mode against the new
   token values (`data-model.md` §1) — verified via real computed-style
   assertions, not a visual-only check, for anything this project has an
   existing test convention for (matches `research.md` §9's own
   verification-method decision, extended to new components too).
3. It is functionally unchanged from before this feature for every
   existing consumer (FR-005/FR-012) — no panel or layout file's own
   props/usage of an existing primitive needs to change.

## New form-input primitives — functional contract

Each of the seven primitives in `data-model.md` §5 MUST:

- Be keyboard-accessible and screen-reader-labeled correctly (inherited
  free from the real Radix primitive underneath each one — confirmed by
  using Radix, not reimplementing interaction behavior by hand).
- Accept a `className` override and forward `ref`, matching every
  existing `components/ui/` primitive's own established convention.
- Render correctly in both themes.

No new primitive is required to be wired into any existing dashboard
panel or Settings-modal tab (spec.md's own Assumptions) — a standalone
rendering check (e.g. a temporary demo page, matching `002-design-
tokens`'s own original `demo.html` precedent) satisfies verification.

## Dark-mode regression contract (FR-007)

See `data-model.md` §6 for the exact six cases and their assertion
method. A case is NOT considered re-verified until its specific real
assertion (not a substitute screenshot) passes against the new token
values — `research.md` §9's own reasoning for why a screenshot cannot
stand in for a computed-style check that was originally the actual proof.
