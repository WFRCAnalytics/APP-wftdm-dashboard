# Contract: Redesigned ValueBoxPanel + Optional Trend Indicators

## Grammar (additive — every existing field's meaning is unchanged)

```yaml
- type:      valuebox
  title:     Auto Mode Share
  metric:    summary_kpis
  column:    auto_share
  format:    "{:.1%}"
  unit:      ""
  icon:      car
  scenario:  activitysim-baseline   # required if baseline_trend is set (see below)

  # NEW, optional, independent of each other:
  sparkline:
    metric:      trip_mode_share    # a DIFFERENT, already-grouped metric
    x:           major_trip_mode
    y:           trips
    chart_type:  bar                # default; 'line' also supported

  baseline_trend:
    expr:    "(a.auto_share - b.auto_share) / NULLIF(b.auto_share, 0)"
    format:  "{:+.1%}"              # optional; defaults to the panel's own `format`
```

## Given / When / Then

**Given** a value-box panel with neither `sparkline` nor `baseline_trend` configured,
**When** it renders,
**Then** it shows exactly the same value/icon/unit as before this feature, in the redesigned visual layout (FR-014, FR-020, FR-022).

**Given** a value-box panel with `sparkline` configured, and its query returns real grouped rows,
**When** it renders,
**Then** a small chart appears summarizing that breakdown, and the primary value is unaffected (FR-012, FR-013).

**Given** a value-box panel with `sparkline` configured, and its query returns zero rows or fails,
**When** it renders,
**Then** the primary value still renders normally; the sparkline's own slot shows its own empty/error treatment, never blocking the rest of the card (FR-013).

**Given** a value-box panel with `baseline_trend` configured, `config.scenario` set, and a baseline scenario currently resolved,
**When** it renders,
**Then** it shows a directional badge (up/down/no-change) with the formatted `diff_value`, computed via `buildValueBoxBaselineTrendQuery()` (data-model.md §5) (FR-016).

**Given** the same panel, but no scenario currently resolves as baseline,
**When** it renders,
**Then** it shows the same "no baseline resolved" treatment this app's other comparison-capable panels already use (FR-017) — not an error, not a silent blank.

**Given** the same panel, but `config.scenario` is unset,
**When** it renders,
**Then** it shows a configuration-error state (`baseline_trend` has no unambiguous "current" side without a pinned scenario — research.md §3).

**Given** a value-box panel with `baseline_trend` configured, where the resolved baseline scenario IS `config.scenario` itself,
**When** it renders,
**Then** the badge shows a distinct "no change" state (a `Minus` icon, zero-valued magnitude) — not a misleading up/down arrow, and not a division error (spec.md Edge Cases).

**Given** a value-box panel with BOTH `sparkline` and `baseline_trend` configured,
**When** it renders,
**Then** both appear together, each independently reflecting its own fetch state, with no visual crowding of the primary value (spec.md Edge Cases, FR-021).

## Non-goals

- No change to `buildComparisonDiffQuery()`, `compare_on`, or the `ComparisonDiff`/`ComparisonCapablePanelConfig` types (`panelQuery.ts`/`layout/types.ts`) — `ValueBoxPanelConfig` does not mix in `ComparisonCapablePanelConfig`; `baseline_trend` is its own, separate, smaller shape (research.md §3).
- No multi-scenario "one column per scenario" rendering (`docs/GRAMMAR.md`'s stale, unimplemented note) — out of scope, unrelated pre-existing gap (research.md §5).
- No new global filter/input binding for either trend mode beyond what the panel's own existing `filter`/`scenario`/`scenarios` fields already provide.
