# Implementation Plan: Design Token and Component Foundation

**Branch**: `002-design-tokens` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-design-tokens/spec.md`

## Summary

Establish the visual foundation before any real dashboard panel/layout work:
reconcile WFRC's canonical brand values (fetched from `wfrc-brand`) against
`APP-Project-Scoresheet`'s already-WCAG-adjusted tokens, derive a complete
shadcn-convention semantic token set (`background`/`foreground`/`card`/
`primary`/`secondary`/`muted`/`accent`/`destructive`/`border`/`ring`/
`radius`, light + dark), verify every pairing independently against WCAG 2.1
AA (not inherited blindly — one real deviation found and fixed, `research.md`
§4), wire Tailwind CSS to those CSS custom properties, and generate 3–4
shadcn-CLI-sourced components rendered on a standalone demo page proving the
pipeline end to end. No dashboard scenario data, panel registry, or layout
code — that's the next feature. Technical approach: two-tier CSS custom
property structure (raw brand tokens → shadcn semantic roles), Tailwind v3
`tailwind.config.js` referencing those properties directly (hex, not the
usual HSL-triple shadcn boilerplate — `research.md` §6 and
`contracts/tailwind-config-contract.md`), React adopted starting with this
feature (shadcn/ui has no non-React form — `research.md` §7; this surfaced a
constitution wording gap, since fixed in 2.1.1, not a policy change).

## Technical Context

**Language/Version**: TypeScript (ES2022 target), same as `001-data-state-layer`

**Primary Dependencies**: `tailwindcss` (v3), `react`, `react-dom`,
`class-variance-authority`, `clsx`, `tailwind-merge` (shadcn's own utility
deps), `@radix-ui/react-tabs`, `@radix-ui/react-tooltip` (per chosen
component — see `data-model.md`'s Component table), `lucide-react` — all
fixed by constitution Principle VI, amended 2.1.0

**Component source**: shadcn CLI-generated `.tsx` under `src/components/ui/`
— copied, editable source in this repo, not an installed black-box package
(spec's own framing, `contracts/component-contract.md`)

**Fonts**: loaded from the Google Fonts CDN at runtime (no `@fontsource/*`
or self-hosted font-file dependency needed — brand.yml declares
`source: google`, confirmed in `research.md` §8) via a ported, not
re-derived, injector function

**Storage**: N/A — this feature never touches `services/`/`state/`; no data
layer involvement at all

**Testing**: Vitest — a pure-function contrast-ratio unit test
(`tests/unit/tokenContrast.test.ts`) reading `src/styles/tokens.css`'s actual
values and asserting every semantic pairing clears WCAG 2.1 AA in both modes.
No Playwright integration test this feature — there's no boot sequence or
scenario data to exercise; visual verification of the demo page is a manual
quickstart step (`quickstart.md`), not automated, since there's no meaningful
assertion beyond "does it look right," which the contrast test already
covers quantitatively.

**Target Platform**: Browser — same as `001-data-state-layer`; demo page
only, no scenario/observed data path touched

**Project Type**: Single-project web frontend, additive to
`001-data-state-layer`'s scaffold (same `package.json`/`vite.config.ts`/
`tsconfig.json`, extended, not replaced)

**Performance Goals**: N/A — no runtime data volume; a handful of static
components on one page

**Constraints**: Every semantic color pairing MUST meet WCAG 2.1 AA contrast
in both light and dark mode (FR-005, constitution-adjacent per the spec's own
accessibility framing); component styling MUST resolve through semantic
tokens only, never literal hex values (FR-004, FR-008); this feature MUST NOT
include panel registry wiring, scenario-data-driven UI, or dashboard layout
(FR-009)

**Scale/Scope**: 7 raw brand tokens, 17 shadcn semantic role tokens × 2 modes
(light/dark), 3 typography tokens (theme-independent), 4 elevation tokens ×
2 modes, 3–4 components, 1 demo page, 6 logo assets copied

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed (amended 2.1.1) | All new code is TypeScript (`.tsx`/`.ts`); React is adopted by this feature, permitted per Principle I's own text ("MAY be introduced when a UI feature genuinely needs it"). The wording finding raised in `research.md` §7 (the rationale sentence named "the layout/panel layer" specifically, which this feature's own existence disproved) has since been corrected in constitution 2.1.1 — no longer names a specific feature | PASS |
| II. DuckDB-WASM query execution off the main thread, one shared instance | Not applicable — this feature never touches `services/duckdb.ts` or any query path | PASS (N/A) |
| III. No `eval()` | No dynamic SQL or dynamic code execution anywhere in this feature — pure CSS tokens, Tailwind config, and static component source | PASS |
| IV. YAML parsed at runtime | Not applicable — no YAML involved in this feature | PASS (N/A) |
| V. Parquet-only browser I/O | Not applicable — no data I/O of any kind in this feature | PASS (N/A) |
| VI. Fixed Technology Choices (amended 2.1.0) | This feature *is* the implementation of the UI-layer choices Principle VI now fixes — Tailwind CSS, shadcn/ui, Radix primitives, `lucide-react`; MapLibre/Vite/no-Web-Storage constraints unaffected and unviolated | PASS |
| VII. Minimal, Fixed Config File Set | No new config file type introduced — `tailwind.config.js` is build tooling, not one of the three modeler-facing config types (`summarize.yaml`/`dashboard-*.yaml`/`manifest.yaml`) | PASS |
| VIII. Reuse Proven Reference Implementations | `APP-Project-Scoresheet`'s `tokens.css` and its research.md §10 are the explicitly reused reference (fetched, cross-checked, not re-derived from scratch) — same spirit as the DuckDB-WASM/Vite patterns this principle already names for other domains | PASS |
| IX. Fixed Python/JS Source Split | This feature adds files only under `src/` (styles, components) — no Python package code | PASS |

No unjustified violations. Complexity Tracking table is not needed (left
empty below). The wording recommendation from Phase 0 (`research.md` §7) was
adopted as constitution 2.1.1 (PATCH) before this Constitution Check was
finalized — flagged to the user rather than amended unilaterally, per this
session's standing practice for constitution-adjacent findings.

## Project Structure

### Documentation (this feature)

```text
specs/002-design-tokens/
├── plan.md               # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/              # Phase 1 output
│   ├── token-contract.md
│   ├── tailwind-config-contract.md
│   └── component-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md                # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

Single-project web frontend, additive to `001-data-state-layer`'s existing
scaffold. Only the paths this feature creates/touches are listed;
`layout/`, `panels/`, `scenario/`, and the Python package remain untouched
and out of scope, per the spec's explicit exclusions (FR-009).

```text
package.json                      # + tailwindcss, react, react-dom, shadcn deps
tailwind.config.js                 # new — see contracts/tailwind-config-contract.md
tsconfig.json                      # + "jsx": "react-jsx" (React arrives this feature)
index.html                         # unchanged (main.ts boot sequence still first)

src/
├── main.ts                        # unchanged — 001's boot sequence
├── styles/
│   └── tokens.css                 # new — see contracts/token-contract.md
│                                   # (4 tiers: brand, shadcn roles, typography, elevation)
├── assets/
│   └── logo/                      # new — 6 PNGs copied from wfrc-brand (research.md §1)
│       ├── horizontal/
│       ├── stacked/
│       └── abbreviated/
├── components/
│   └── ui/                        # new — shadcn CLI output
│       ├── button.tsx
│       ├── card.tsx
│       ├── tabs.tsx
│       └── tooltip.tsx
├── lib/
│   ├── utils.ts                   # new — shadcn's own cn() helper (clsx + tailwind-merge)
│   └── loadBrandFonts.ts          # new — ported from Scoresheet's theme/fonts.ts
│                                   # (research.md §8), Google Fonts CDN injector
└── demo/
    └── DesignTokenDemo.tsx         # new — the throwaway demo page (component-contract.md)

demo.html                          # new — separate Vite entry point, NOT index.html
                                    # (keeps the demo route out of the production
                                    # dashboard entry per FR-009/SC-005)

tests/
└── unit/
    └── tokenContrast.test.ts       # new — reads src/styles/tokens.css, asserts
                                     # every pairing in data-model.md's table
```

**Structure Decision**: Single-project layout, additive to `001-data-state-
layer`. The demo page is served from its own Vite entry (`demo.html`), not
wired into `index.html`/`main.ts`'s boot sequence — this keeps FR-009's
"no dashboard UI consumption yet" boundary structural (a separate entry
point), not just a convention someone could accidentally violate by adding a
route.

## Complexity Tracking

*No entries — Constitution Check reported no unjustified violations.*
