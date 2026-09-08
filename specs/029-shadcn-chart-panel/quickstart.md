# Quickstart: Validating the shadcn/Recharts Chart Panel Type

## Prerequisites

- `npm install` run after `recharts` and `components/ui/chart.tsx` are
  added (see tasks.md for the exact CLI command — research.md §5).
- Fixture content available: `npm run dev:fixtures`.

## 1. Author a `recharts` panel

Add to a fixture `dashboard-*.yaml`:

```yaml
- type:       recharts
  title:      Mode Share by Purpose (Recharts)
  metric:     trip_mode_share
  chart_type: bar
  x:          purpose
  y:          share
  series:     mode
  scenario:   good_scenario
```

`trip_mode_share`'s real columns (`tests/fixtures/generate.py`) are
`purpose`/`mode`/`share` — no new fixture data needed.

## 2. Run the dev server against fixtures

```bash
npm run dev
```

Confirm:

- A real bar chart renders, grouped by `purpose` on the x-axis, one
  colored bar per distinct `mode` value.
- Bar colors come from the new `--chart-1`..`--chart-5` tokens — open dev
  tools and confirm a `<Bar>` element's real computed `fill` resolves to
  one of the five new hex values (not a browser default, not one of the
  existing `--primary`/`--accent` tokens reused verbatim for a role they
  weren't intended for here).
- Hovering a bar shows a tooltip with the real `mode`/`share` value for
  that segment.
- A legend appears (more than one `mode` value present) — confirm
  clicking a legend entry does **nothing** (no show/hide) — this is
  correct, expected behavior (FR-007), not a bug to fix.

## 3. Confirm dual-theme correctness (FR-012 — non-negotiable)

Toggle dark mode (Settings → Appearance, or
`document.documentElement.classList.add('dark')` in the console).
Confirm, via real inspection (not a glance):

- Every bar's fill color changes to that token's own dark-mode value.
- Axis text, gridlines, tooltip surface, and legend text all remain
  legible against the dark background.

## 4. Confirm existing panel types are unaffected

Load a dashboard tab with existing `plotly`/`observable-plot`/`sankey`
panels alongside the new `recharts` one. Confirm all render correctly, and
that Plotly's own legend click-to-toggle still works exactly as before.

## 5. Confirm the unsupported-chart-type edge case

Author a second `recharts` panel with an invalid `chart_type` (e.g.
`chart_type: pie`). Confirm this fails clearly and visibly (a config
error), never a silent blank panel or an unintended fallback chart type.

## Automated coverage (for `/speckit-tasks`)

- `tests/unit/rechartsEncoding.test.ts` — pure-module tests for
  `encodeRechartsData()`: single-series (no `series` configured),
  multi-series pivot, missing combinations left `undefined` not `0`,
  color-cycling past the fifth distinct series value, deterministic
  first-seen ordering.
- `tests/unit/tokenContrast.test.ts` — extended with the five new
  `--chart-N` non-text-contrast checks (≥3:1) in both `:root` and `.dark`.
- `tests/integration/rechartsPanel.spec.ts` — real-browser tests
  covering: bar/line/area rendering against real fixture data; tooltip
  content; legend display-only behavior (no click-to-toggle); the
  dual-theme `getComputedStyle()` checks FR-012 requires (real computed
  `fill`/`stroke` values in both themes, not a screenshot diff); the
  invalid-`chart_type` edge case; a regression sweep confirming
  `plotly`/`observable-plot`/`sankey` panels on the same tab are
  byte-for-byte unaffected.
