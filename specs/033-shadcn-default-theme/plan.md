# Implementation Plan: Full shadcn/ui Default-Theme Adoption

**Branch**: `033-shadcn-default-theme` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/033-shadcn-default-theme/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Replace this app's WFRC-blue-anchored color/typography identity with
shadcn/ui's own real, current default theme — confirmed via direct source
retrieval to be the **Nova** preset (`neutral` base color, Geist/Geist
Mono fonts, Lucide icons — this project already has the icon part),
served through `components.json`'s `"new-york-v4"` style track. A real,
hands-on trial (not a migration-guide reading) proved the highest-risk-
looking part of getting there — the Tailwind v3→v4 gap this project's own
`029`/`030` features already hit twice — is lower-risk than assumed:
Tailwind v4's official `@config` backward-compatibility bridge lets this
project's existing `tailwind.config.js` work completely unmodified, so
the confirmed decision (brought to the user directly per FR-010, not
picked silently) is to perform the underlying Tailwind v4 migration now
rather than hand-port a dozen-plus components individually. Alongside the
retheme, this feature adds the seven standard form-input primitives this
app doesn't have yet (Input/Select/Checkbox/Switch/RadioGroup/Textarea/
Label), updates every real, direct WFRC-brand-token reference outside the
semantic token system (Sankey's `FALLBACK_TOKEN_VARS`, `tableLogic.ts`/
`zonemapColor.ts`'s `--brand-wfrc-blue` anchor — explicitly NOT the
already-non-brand `--chart-1..5` Recharts palette), individually
re-verifies all six of this project's own previously-proven dark-mode
fixes against the new tokens, and updates the `wftdm-design-system` skill
to state its brand-consistency rule is deliberately suspended, not
forgotten.

## Technical Context

**Language/Version**: TypeScript (ES2022, unchanged) — this feature is CSS/config/component-styling only, no new language.

**Primary Dependencies**: `tailwindcss@^4`, `@tailwindcss/vite@^4` (new — replaces `tailwindcss@^3.4.15` + `postcss` + `autoprefixer`), `@fontsource-variable/geist` + `@fontsource-variable/geist-mono` (new, self-hosted fonts — replaces the Google-Fonts-CDN `loadBrandFonts.ts` mechanism), `@radix-ui/react-label`/`-checkbox`/`-switch`/`-radio-group`/`-select` (new, for the seven form-input primitives — exact package shape, individual vs. unified `radix-ui`, confirmed during implementation per `contracts/component-parity.md`).

**Storage**: N/A — no data-layer change (FR-012).

**Testing**: Existing Vitest (`tests/unit/tokenContrast.test.ts`, extended) + Playwright (`tests/integration/graphicWalkerPanel.spec.ts`'s theme-test pattern, extended to the other five dark-mode-fix cases per `data-model.md` §6) — no new test framework.

**Target Platform**: Same static web app (unchanged) — this feature does not touch deployment.

**Project Type**: Single project, UI/styling layer only — no backend, no new panel type, no new data flow.

**Performance Goals**: Tailwind v4's own engine is a real, independently-documented build-speed improvement over v3 (not a requirement this feature imposes, but an expected, unclaimed side benefit of the confirmed migration) — no specific target set.

**Constraints**: Zero change to panel data-fetching/query-building/chart-data-encoding (FR-012); zero change to the `028-dashboard-branding` logo/title mechanism (FR-011); `tailwind.config.js` kept as an unmodified JS file via the `@config` bridge (confirmed decision, `research.md` §4).

**Scale/Scope**: 9 existing UI primitives re-themed, 7 new form-input primitives built, 3 files with direct WFRC-brand-token references updated (`SankeyPanel.tsx`, `tableLogic.ts`, `zonemapColor.ts`), 10 panel types' own chrome re-verified, 6 named dark-mode fixes individually re-verified, 1 design-system skill file updated.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed | No new language, no new framework | ✅ Pass |
| II. DuckDB-WASM off main thread | Unaffected — no query-path change | ✅ Pass |
| III. No `eval()` | Unaffected | ✅ Pass |
| IV. YAML parsed at runtime | Unaffected | ✅ Pass |
| V. Parquet-only browser I/O | Unaffected | ✅ Pass |
| VI. Fixed Technology Choices | Constitution names "Tailwind CSS" generically, no version pinned (confirmed by direct read) — a v3→v4 upgrade is still "Tailwind CSS," not a forbidden-framework swap. `lucide-react` for icons is unaffected (Nova's own icon choice already matches). | ✅ Pass, no amendment needed |
| VII. Minimal, Fixed Config File Set | `components.json`/`tailwind.config.js`/`vite.config.ts` are build tooling, not one of the three named dashboard-content config types — unaffected | ✅ Pass |
| VIII. Reuse Proven Reference Implementations | N/A — no DuckDB-WASM/MapLibre/Vite-wiring work in this feature | ✅ Pass |
| IX. Fixed Python/JS Source Split | No Python change at all | ✅ Pass |

**Gate result**: PASS. No amendment needed, no complexity to justify.

## Project Structure

### Documentation (this feature)

```text
specs/033-shadcn-default-theme/
├── plan.md              # This file
├── research.md          # Phase 0 — Nova preset identity, real fetched theme
│                         # values, the empirical Tailwind v3/v4 trial +
│                         # confirmed decision, font research, chart-palette
│                         # disambiguation, dark-mode-fix inventory, phased
│                         # task structure
├── data-model.md        # Phase 1 — token value migration table, brand-
│                         # reference fix list, component/primitive lists,
│                         # dark-mode re-verification entities
├── quickstart.md        # Phase 1 — 7 runnable validation scenarios
├── contracts/
│   ├── tailwind-v4-migration.md   # exact config/build/dependency changes
│   └── component-parity.md        # what "matches shadcn's styling" means + verification
├── checklists/
│   └── requirements.md  # spec quality checklist (all pass)
└── tasks.md              # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
tailwind.config.js                    # UNCHANGED structurally (referenced via @config)
vite.config.ts                        # + @tailwindcss/vite plugin
postcss.config.js                     # removed (pending confirmation no other consumer)
components.json                       # style: "default" -> "new-york-v4"
package.json                          # tailwindcss v3->v4, +@tailwindcss/vite,
                                       # +@fontsource-variable/geist(-mono),
                                       # -autoprefixer/-postcss (pending confirmation),
                                       # + new Radix packages for form-input primitives

src/styles/tokens.css                 # @tailwind x3 -> @import+@config; all
                                       # semantic token VALUES replaced (data-model.md §1);
                                       # +--popover*, +--sidebar-* tokens;
                                       # --font-body/-heading/-mono values replaced (§2);
                                       # Tier-1 --brand-wfrc-*/--brand-white/-black/
                                       # -background-dark tokens DELETED
src/lib/loadBrandFonts.ts             # DELETED — replaced by direct
                                       # @fontsource-variable/geist(-mono) imports
src/main.tsx (or equivalent entry)    # + font package imports, loadBrandFonts() call removed

src/components/ui/
├── button.tsx, card.tsx, chart.tsx, dialog.tsx,      # re-themed, structurally
│   dropdown-menu.tsx, separator.tsx, sidebar.tsx,     # unchanged (data-model.md §4)
│   tabs.tsx, tooltip.tsx
├── input.tsx, select.tsx, checkbox.tsx, switch.tsx,   # NEW (data-model.md §5)
│   radio-group.tsx, textarea.tsx, label.tsx

src/panels/
├── SankeyPanel.tsx                   # FALLBACK_TOKEN_VARS updated (data-model.md §3)
├── tableLogic.ts                     # cellColor() --brand-wfrc-blue -> --primary
├── zonemapColor.ts                   # choropleth fill anchor, same fix
└── (every panel type re-verified visually against new tokens, no other file changes expected)

tests/unit/tokenContrast.test.ts      # re-verified against new token values
tests/integration/                    # + assertions for the 6 dark-mode-fix cases
                                       # (data-model.md §6), reusing graphicWalkerPanel.spec.ts's
                                       # own real computed-style pattern

.claude/skills/wftdm-design-system/SKILL.md  # Brand Identity section: suspension notice added (FR-009)
```

No file under `python/` changes at all — confirmed by Constitution Check
(Principle IX; this feature has no Python-side surface whatsoever).

**Structure Decision**: Single-project structure (unchanged) — a pure
styling/config/component-library feature layered on top of this app's
existing UI foundation (`002-design-tokens`'s original token/primitive
work, every subsequent panel-type feature). No new source directory; the
existing `components/ui/` gains seven new files and the existing
`panels/` directory gets three targeted edits, nothing structural.

## Complexity Tracking

*No entries — the Constitution Check above found zero violations to
justify.*
