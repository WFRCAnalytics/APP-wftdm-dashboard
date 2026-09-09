# Quickstart: Redesigned Metric Panels, Scoped Expandability, and Trend Indicators

See `contracts/panel-expand-scoping.md` and `contracts/valuebox-panel-v2.md` for the full behavioral contracts each scenario below checks against; not duplicated here.

## Scenario 1 — Expand control only where it should be (FR-001–FR-004, SC-001)

```powershell
npm run dev
```

Load a dashboard tab containing every panel type (this app's real six-tab demo content, `public/demo-dashboard-config/`, already has this spread across its tabs).

**Done when**: a `valuebox` panel and an ordinary (non-`full_page`) `graphic-walker` panel show no expand control anywhere on their card; every other panel type's expand control still opens its dialog exactly as before.

## Scenario 2 — Value-box visual redesign (FR-005–FR-009, SC-002)

Load the Summary tab (a real, existing row of `valuebox` panels).

**Done when**: each card shows a small label above a large, tabular-aligned value; an icon (where configured) sits cleanly; loading/empty/error states are restyled but behaviorally identical; both light and dark themes are fully legible.

## Scenario 3 — Sparkline mode (FR-010–FR-014, SC-003)

Configure one demo `valuebox` panel with:

```yaml
sparkline:
  metric: trip_mode_share
  x: major_trip_mode
  y: trips
```

**Done when**: the card shows a small real bar chart of `trips` by `major_trip_mode`, alongside its existing scalar value, sourced from a real, independent query (confirm via `window.__wftdm.__debugQueryLog()` that a second query referencing `trip_mode_share` fired). Removing `sparkline:` from the config returns the panel to its exact pre-feature rendering.

## Scenario 4 — Baseline-diff mode, baseline resolved (FR-015, FR-016, FR-018, FR-019, SC-004)

Configure one demo `valuebox` panel (with `scenario:` already pinned) with:

```yaml
baseline_trend:
  expr: "(a.<column> - b.<column>) / NULLIF(b.<column>, 0)"
```

Ensure a baseline scenario is currently resolved (this app's existing automatic-default-baseline rule, or an explicit designation).

**Done when**: the card shows a directional badge with a percentage matching, to the same precision, what a `table`/`recharts` panel's own existing `comparison: diff` against the same two scenarios/metric/column computes.

## Scenario 5 — Baseline-diff mode, no baseline resolved (FR-017)

Temporarily remove every scenario's baseline eligibility (or load a fresh session with none pinned/ready).

**Done when**: the same panel shows the established "no baseline resolved" treatment — not a crash, not a blank card.

## Scenario 6 — Baseline-diff mode, baseline equals current scenario (Edge Case)

Configure `scenario:` and the resolved baseline to be the same scenario name.

**Done when**: the badge shows a distinct "no change" state, not a misleading arrow or a division artifact.

## Scenario 7 — Both trend modes together (Edge Case, FR-021, FR-022)

Configure both `sparkline` and `baseline_trend` on the same panel.

**Done when**: both render together without visually crowding the primary value; the primary value/data is identical to Scenario 2's baseline case.
