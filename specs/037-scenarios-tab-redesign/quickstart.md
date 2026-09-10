# Quickstart: Scenarios Tab Redesign

Validation guide for `037-scenarios-tab-redesign`. Full behavior in
[spec.md](./spec.md); element/interaction detail in
[contracts/scenarios-tab-row.md](./contracts/scenarios-tab-row.md).

## Prerequisites

```bash
npm run dev:fixtures      # populate public/{scenarios,observed,dashboard-config} from tests/fixtures
npm run dev               # vite dev server; open the Settings modal → Scenarios tab
```

New dependencies (install once):

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
# optional, recommended:
npm install @dnd-kit/modifiers
```

## Automated checks

```bash
npm run typecheck
npm run test:unit                                  # appState.reorderScenario + moveScenario regressions
npx playwright test tests/integration/settingsModal.spec.ts        # full file, incl. new "User Story (037)" block
npx playwright test tests/integration/scenarioColorOverride.spec.ts # confirms 035/036 paths unaffected
```

Run the FULL `tests/integration/` suite as one single invocation only (never
two concurrent `playwright test` processes — this session has repeatedly hit
shared-fixture `global-setup` corruption from concurrency).

## Manual / scripted validation scenarios

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | **Part A — Switch is correct** | Boot `/` (no `?s=`), open Scenarios tab | `observed`'s Switch is ON (checked, filled); `good_scenario`/`broken_scenario` are OFF — matching their real `active` values. No inversion. |
| 2 | **Pointer drag reorder** | Drag the 3rd row's handle above the 1st row | Rows re-render in the new order immediately; `appState.listByDisplayOrder()` names match; no reload. |
| 3 | **Keyboard drag reorder** | Tab to a row's drag handle → `Space` → `ArrowDown` → `Space` | Same reorder as a drag; a screen reader announces lift / move / drop with position-based text. |
| 4 | **Arrow fallback still works** | Click a row's leading-edge move-up button | One-step move, identical outcome to a drag; disabled at the top/bottom boundary. |
| 5 | **Drop outside** | Start a drag, release the pointer outside the list | List returns to its original order; no partial state. |
| 6 | **Reorder ≠ baseline change** | Note the resolved baseline, reorder several rows | `appState.getBaseline()` is unchanged. |
| 7 | **Baseline chip — baseline row** | Look at the current baseline's row | One filled chip reading exactly `Baseline`, beside the name, not clickable, no tooltip. |
| 8 | **Baseline chip — other rows** | Look at a non-baseline row; click its chip | Outline chip reading `Set as baseline`, clickable; after click, the filled `Baseline` chip + state move to that row; the old baseline row's chip reverts to outline `Set as baseline`. |
| 9 | **No leftover Star / Badge** | Inspect every row | No `Star` icon, no separate `Badge`, anywhere — the chip is the only baseline control. |
| 10 | **Switch tooltip** | Hover a row's active/inactive Switch | Tooltip appears explaining it controls inclusion in comparisons/queries. The baseline chip shows no tooltip. |
| 11 | **Pixel alignment (both themes)** | Measure `getBoundingClientRect().x` for status dot / identity block / Switch / color swatch / baseline chip across all rows, light and dark | Each control's `x` is identical across every row (sub-pixel tolerance). |
| 12 | **Both themes, everything** | Repeat 2–10 with `document.documentElement.classList.toggle('dark')` | All behavior and legibility hold in dark mode. |

## Definition of done

- All automated checks green (full Playwright suite triaged: only the
  already-documented pre-existing flakes / external-network failures remain).
- Manual scenarios 1–12 pass.
- `CLAUDE.md` gains a `037-scenarios-tab-redesign` implementation-order entry
  recording the Part A finding (no bug), the `@dnd-kit` adoption + Principle VI
  analysis, and any real bugs found during implementation.
