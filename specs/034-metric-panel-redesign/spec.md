# Feature Specification: Redesigned Metric Panels, Scoped Expandability, and Trend Indicators

**Feature Branch**: `034-metric-panel-redesign`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Redesigned metric panels (shadcn-inspired), scoped expand-ability, and two new optional trend indicators — see full request below."

## Research performed before writing this spec

Three things this request explicitly asked to confirm rather than assume, verified directly against this app's real, current code before any requirement below was written:

1. **How expand-to-dialog capability is decided today**: `layout/panelCard.tsx` calls `usePanelExpandHost()` unconditionally for every resolved panel type (`registry[config.type]`), with no per-type flag anywhere — the expand trigger and dialog are a blanket default applied identically to all nine registered panel types today, not something already scoped by type. Scoping it is a real behavior change, not turning on an existing dial.
2. **Value-box panels have no comparison grammar today**: `ValueBoxPanelConfig` (`layout/types.ts`) does not mix in `ComparisonCapablePanelConfig` — unlike `PlotlyPanelConfig`/`TablePanelConfig`/`ObservablePlotPanelConfig`/`ZoneMapPanelConfig`, which already do. The shared comparison-diff query builder (`buildComparisonDiffQuery()`, `panels/panelQuery.ts`) joins two scenario views on one or more named `compare_on` columns — every existing caller passes at least one such column, because every existing comparable dataset has multiple rows per scenario (a table, a chart series, one row per zone). A value box's underlying metric is typically a single-row-per-scenario scalar table (e.g. `summary_kpis`) with no such row-identity column to join on at all. Extending the comparison grammar to a scalar value therefore needs to account for this — a real, non-trivial design question for planning, not a drop-in reuse.
3. **Shadcn's own real, current metric-card pattern**: fetched directly from the same registry `033-shadcn-default-theme` already used (`apps/v4/app/(app)/examples/dashboard/components/section-cards.tsx`). Its real structure: a small label line above the value, the value itself large and prominent, a trend indicator rendered as a compact badge (a directional icon plus a percentage, e.g. "▲ +12.5%") sitting beside the value, and a two-line footer below (a short bold context line with its own small icon, then a muted one-line description). Notably, shadcn's own reference pattern shows the trend as a badge, not an embedded chart — this app's own sparkline mode (below) is a genuine addition beyond what shadcn's reference itself does, not something being copied from it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Expand-to-dialog only appears where it makes sense (Priority: P1)

An analyst reviewing a dashboard tab today sees an expand-to-full-size control on every single panel, including small value-box cards and read-only Explore panels, where enlarging the panel adds no value (a value box has nothing more to show at a larger size; the Explore panel already has its own dedicated full-page mode elsewhere). The control should only appear where it's actually useful — for panels with real content that benefits from more screen space (tables, charts, maps, markdown).

This is a per-panel-**type** default, not an unconditional rule: a deployer or dashboard author who has a genuine reason to deviate for one specific panel — an unusually large or detailed value box worth enlarging, or a table that's already small enough that expanding it adds nothing — can override the default directly in that one panel's own configuration, with no app code change.

**Why this priority**: A quick, low-risk correctness fix that immediately reduces visual clutter and false affordances across every dashboard tab in the app, with no dependency on anything else in this feature.

**Independent Test**: Load a dashboard tab containing at least one of every panel type, with no overrides configured; confirm the expand control is present only on the panel types that should keep it by default. Separately, configure one panel with an explicit override in each direction and confirm it takes precedence over its type's own default.

**Acceptance Scenarios**:

1. **Given** a dashboard tab with a value-box panel and no explicit override configured, **When** the analyst views its card, **Then** no expand-to-dialog control appears anywhere on that card.
2. **Given** a dashboard tab with a graphic-walker panel rendered as an ordinary (non-full-page) panel and no explicit override configured, **When** the analyst views its card, **Then** no expand-to-dialog control appears on that card either.
3. **Given** a dashboard tab with a table, markdown, plotly, observable-plot, sankey, recharts, flowmap, or zonemap panel and no explicit override configured, **When** the analyst views its card, **Then** the expand-to-dialog control still appears and still works exactly as it does today.
4. **Given** a tab whose graphic-walker panel is configured as a chromeless full-page Explore tab, **When** the analyst views it, **Then** nothing changes — that mode already has no card/expand chrome at all, and an override configured on it has no effect (there is no card to add the control to).
5. **Given** a value-box panel explicitly configured to opt back into the expand control, **When** the analyst views its card, **Then** the control appears and works exactly like any other expandable panel's. **Given** a table (or any normally-expandable type) explicitly configured to opt out, **When** the analyst views its card, **Then** no expand control appears on it, even though every other table panel on the same tab still has one.

---

### User Story 2 - Value-box panels adopt a cleaner, more polished metric-card look (Priority: P1)

A stakeholder scanning a dashboard's KPI row today sees plain, minimally-styled value boxes. They should instead read like a polished, professional metric card — consistent with the rest of this app's already-redesigned visual language — with a clear small label, a prominent value, and (where an icon is configured) a well-placed icon, all legible and correctly styled in both light and dark themes.

**Why this priority**: The most visible, highest-impact change in this feature — every dashboard's landing tab leads with a row of these cards — and independent of every other part of this feature.

**Independent Test**: Load any dashboard tab with a row of value-box panels and visually confirm the redesigned layout in both themes; confirm every existing value-box configuration option (icon, unit, format) still renders correctly with no data or behavior change.

**Acceptance Scenarios**:

1. **Given** an existing value-box panel configuration with no new fields added, **When** the dashboard renders it, **Then** it shows the exact same underlying value, icon, and unit as before, in the new visual layout.
2. **Given** a value-box panel in dark mode, **When** the analyst views it, **Then** every element (label, value, icon, unit) remains fully legible, matching this app's existing dual-theme standard.
3. **Given** a value-box panel with no icon configured, **When** it renders, **Then** the layout adapts cleanly with no empty gap or placeholder left where the icon would have been.

---

### User Story 3 - A value box shows how its metric varies across its own categories (Priority: P2)

An analyst looking at a single aggregate KPI (e.g. total mode share) often wants an immediate sense of the underlying breakdown without opening a separate chart panel. A value box configured for it should show a small, embedded distribution visualization — for example, a mini bar shape showing the same metric split across its real categories — right inside the card.

**Why this priority**: A genuinely new, additive capability that increases the information density of a KPI row, but entirely optional per panel and not required for the redesign itself to ship.

**Independent Test**: Configure one value-box panel with sparkline mode enabled and confirm it renders a real, data-driven mini-chart from a real grouped query, while a value-box panel that does not enable it renders unaffected.

**Acceptance Scenarios**:

1. **Given** a value-box panel configured with sparkline mode, **When** its data loads successfully, **Then** a small chart appears in the card summarizing the configured grouped breakdown, alongside the panel's existing primary value.
2. **Given** a value-box panel with sparkline mode enabled but its underlying grouped query returns no rows or fails, **When** the panel renders, **Then** the primary scalar value still displays normally — the sparkline's own failure never blocks or breaks the rest of the card.
3. **Given** a value-box panel with no sparkline configuration at all, **When** it renders, **Then** it looks and behaves exactly as before this capability existed.

---

### User Story 4 - A value box shows whether it's trending up or down against baseline (Priority: P2)

An analyst comparing a calibration run against the designated baseline scenario wants to see, at a glance, whether each headline KPI moved up or down relative to that baseline — without switching to a dedicated diff table. A value box configured for it should show a small directional trend indicator reflecting that comparison.

**Why this priority**: Reuses an already-proven capability (this app's existing baseline/comparison-diff mechanism, already relied on by other panel types) in a new, lightweight presentation — valuable, optional, and independent of the sparkline addition.

**Independent Test**: Configure one value-box panel with baseline-diff mode enabled, with a real baseline scenario resolved, and confirm it shows a correct directional indicator matching the same diff this app's existing comparison mechanism already computes for other panel types; confirm the indicator disappears/shows the established no-baseline state when no baseline currently resolves.

**Acceptance Scenarios**:

1. **Given** a value-box panel configured with baseline-diff mode, and a baseline scenario currently resolved, **When** the panel renders, **Then** it shows a directional indicator (increase or decrease) and a magnitude, computed from the current scenario's value against the baseline scenario's own value for the same metric.
2. **Given** a value-box panel configured with baseline-diff mode, and no scenario currently resolves as baseline, **When** the panel renders, **Then** it shows the same established "no baseline resolved" state this app's other comparison-capable panel types already show, not a crash or a silently blank indicator.
3. **Given** a value-box panel configured with baseline-diff mode, **When** the resolved baseline scenario changes elsewhere in the app, **Then** the indicator recomputes and updates automatically, matching how other comparison-capable panels already react to a baseline change.
4. **Given** a value-box panel with no baseline-diff configuration at all, **When** it renders, **Then** it looks and behaves exactly as before this capability existed.

---

### Edge Cases

- A value-box panel enables BOTH sparkline and baseline-diff mode at once — both must render together without visually crowding out the primary value or each other.
- A value-box panel's sparkline grouping query returns a single category (no real distribution to show) — the sparkline should still render something reasonable (e.g. a single bar/point), not an empty or broken chart.
- Baseline-diff mode is enabled on a value box whose own resolved scenario IS the baseline scenario itself (comparing baseline against itself) — the indicator should show a clear "no change" state, not a division error or misleading arrow.
- An author enables sparkline or baseline-diff mode but supplies a configuration that doesn't resolve to real data (a typo'd metric/column name) — this should fail the same way this app's other panels already fail on a bad config (a clear error state), never a silent blank or a crash that takes down the rest of the panel.
- A dashboard tab has a full row of value-box panels with mixed configurations (some plain, some sparkline-only, some baseline-diff-only, some both) — every card's height/alignment within that row should remain visually consistent.

## Requirements *(mandatory)*

### Functional Requirements

**Part A — Scoped expand-to-dialog capability**

- **FR-001**: The system MUST NOT show an expand-to-dialog control on a value-box panel, by default (no explicit override configured on that panel).
- **FR-002**: The system MUST NOT show an expand-to-dialog control on a graphic-walker panel rendered as an ordinary (card) panel, by default.
- **FR-003**: The system MUST continue to show a working expand-to-dialog control, unchanged, on every table, markdown, plotly, observable-plot, sankey, recharts, flowmap, and zonemap panel, by default.
- **FR-004**: The system MUST leave the chromeless full-page Explore rendering mode for graphic-walker panels completely unaffected — it already has no expand mechanism to remove, and an override configured on a full-page panel has no effect.

**Part A addendum — per-panel expand-ability override** (added during planning, before implementation of Part A completed; every requirement above still describes the correct DEFAULT behavior, now explicitly overridable per this addendum)

- **FR-023**: The system MUST let an author explicitly configure any single panel's own expand-ability, independent of its type's own default from FR-001–FR-003 — including opting a value-box or ordinary graphic-walker panel INTO the expand control, or opting any normally-expandable type OUT of it.
- **FR-024**: An explicit per-panel override MUST take precedence over its type's own default in both directions — turning the control on where the type default is off, or off where the type default is on.
- **FR-025**: A panel with no explicit override configured MUST behave exactly as specified by FR-001–FR-003 — every dashboard-*.yaml file that existed before this addendum, with no new field added, MUST continue to render identically to what Part A's original (default-only) design already specified.

**Part B — Value-box visual redesign**

- **FR-005**: The system MUST render a value-box panel's title as a smaller, secondary label positioned above its primary value, consistent with this app's established design system.
- **FR-006**: The system MUST keep the primary value as the visually dominant element of the card.
- **FR-007**: The system MUST continue to support every existing value-box configuration option (`icon`, `unit`, `format`) with no change to what data or formatting they produce — this is a presentation-only redesign for a panel with no new configuration.
- **FR-008**: The system MUST render the redesigned value-box correctly and legibly in both light and dark themes.
- **FR-009**: The system MUST preserve the value-box's existing loading, empty, and error states, restyled to match the new layout but otherwise behaviorally unchanged.

**Part C1 — Optional sparkline (distribution) trend indicator**

- **FR-010**: The system MUST allow an author to optionally configure a value-box panel with a sparkline mode, distinct from and in addition to its existing scalar value configuration.
- **FR-011**: Sparkline mode's underlying data MUST come from its own grouped query, configured by the author (metric and grouping/value columns) — the panel's existing single-value query is not reused for this, since a sparkline needs a real breakdown across categories rather than one number.
- **FR-012**: When sparkline mode is enabled and its data loads successfully, the system MUST render a small chart inside the value-box card summarizing that grouped breakdown.
- **FR-013**: A sparkline data-fetch failure or empty result MUST NOT prevent the panel's existing primary scalar value from rendering normally.
- **FR-014**: A value-box panel that does not configure sparkline mode MUST render exactly as it would without this capability existing at all.

**Part C2 — Optional baseline-diff trend indicator**

- **FR-015**: The system MUST allow an author to optionally configure a value-box panel with a baseline-diff mode, using this app's existing baseline/comparison configuration vocabulary rather than a new one.
- **FR-016**: When baseline-diff mode is enabled and a baseline scenario currently resolves, the system MUST show a directional indicator and magnitude comparing the panel's current value against the baseline scenario's own value for the same metric.
- **FR-017**: When baseline-diff mode is enabled and no scenario currently resolves as baseline, the system MUST show the same established "no baseline resolved" treatment this app's other comparison-capable panel types already use, not a crash or an unexplained blank state.
- **FR-018**: The baseline-diff computation itself MUST reuse this app's existing, already-tested comparison-diff mechanism — this feature does not introduce a new or parallel way of computing a diff between two scenarios' values.
- **FR-019**: The baseline-diff indicator MUST update automatically whenever the resolved baseline scenario changes, consistent with how this app's other comparison-capable panels already react to that change.
- **FR-020**: A value-box panel that does not configure baseline-diff mode MUST render exactly as it would without this capability existing at all.

**Cross-cutting**

- **FR-021**: A value-box panel MAY enable sparkline mode, baseline-diff mode, both, or neither, independently of one another.
- **FR-022**: Enabling either trend-indicator mode MUST NOT change the panel's existing primary scalar value, its source data, or its existing configuration fields in any way.

### Key Entities

- **Value-box panel configuration**: the authored definition of one metric card — its title, data source, display formatting, and (new, both optional) a sparkline configuration and a baseline-diff configuration.
- **Sparkline configuration**: the grouped data source (metric and the columns that define its categories/values) a value-box panel's embedded distribution chart is built from — separate from the panel's own primary-value data source.
- **Baseline-diff configuration**: which comparable column(s) identify the same row across the current and baseline scenario for this panel's metric, reusing this app's existing baseline/comparison vocabulary.
- **Panel type expand-ability**: a per-panel-type DEFAULT designation of whether that panel offers the expand-to-full-size control at all — overridable per individual panel (see Panel expand-ability override below).
- **Panel expand-ability override**: an optional, explicit true/false setting on any single panel's own configuration that takes precedence over its type's own default.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On any dashboard tab containing every panel type with no overrides configured, only the intended panel types (table, markdown, plotly, observable-plot, sankey, recharts, flowmap, zonemap) show a working expand control; value-box and ordinary graphic-walker panels show none.
- **SC-001a**: A panel with an explicit expand-ability override renders according to that override, not its type's own default, in both override directions — with zero change to any other panel of the same type on the same tab that has no override of its own.
- **SC-002**: Every existing value-box panel in this app's real demo content renders with the redesigned layout, showing identical underlying values to before, in both light and dark themes, with zero visual regressions in legibility or alignment.
- **SC-003**: A value-box panel configured with sparkline mode shows a real, correctly-computed distribution chart sourced from real underlying data, with no effect on any panel that doesn't opt in.
- **SC-004**: A value-box panel configured with baseline-diff mode shows a directional indicator whose value matches, to the same precision, what this app's existing comparison-diff mechanism computes for the same two scenarios elsewhere in the app.
- **SC-005**: A stakeholder can distinguish a value box's primary value from its label and its trend indicator(s) at a glance, without needing to read the whole card carefully.

## Assumptions

- **Sparkline chart shape**: a bar-shaped mini-chart is the reasonable default for showing a categorical breakdown (this app's own established Recharts bar rendering, already used elsewhere) unless overridden by future configuration; the request's own wording ("a mini bar/line shape") treats this as illustrative, not prescriptive.
- **Baseline-diff presentation**: shown as a directional icon plus a percentage or absolute magnitude (mirroring the badge-style trend indicator confirmed in shadcn's own real reference metric card, described under Research above), not a full breakdown table — that remains the job of this app's existing dedicated comparison-diff panels.
- **Baseline-diff query mechanism for a scalar value**: value-box metrics are typically single-row-per-scenario scalars with no natural per-row identity column, unlike every existing comparison-capable panel type's own comparable data. Reusing the existing comparison-diff computation (FR-018) for this scalar case is a real design detail for planning to resolve — accounted for here as a known constraint, not assumed away.
- **`observed`/`threshold_warn`/`threshold_fail`**: `docs/GRAMMAR.md` documents these existing value-box fields, but the current `ValueBoxPanel.tsx` component does not actually read or render them — a pre-existing gap unrelated to this feature. This feature does not fix that gap; it is called out only so baseline-diff mode (a new, different comparison concept) is not confused with it.
- **Panel row layout**: the existing "a row of all value-box panels auto-fills as an even grid" behavior (`docs/GRAMMAR.md`'s Metric Strip layout) continues to apply unchanged; this feature only changes what's inside each card, not how a row of them is arranged.
