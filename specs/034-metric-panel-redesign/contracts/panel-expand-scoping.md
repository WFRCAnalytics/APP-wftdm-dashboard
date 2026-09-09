# Contract: Scoped Panel Expand-Ability

## Given / When / Then — default behavior (no `expandable` override configured)

**Given** a dashboard tab containing at least one panel of every registered type, none of them setting `expandable` in their own config,
**When** the tab renders,
**Then**:

| Panel type | Expand control present? |
|---|---|
| `valuebox` | No |
| `graphic-walker` (ordinary card, not `full_page`) | No |
| `table` | Yes, unchanged |
| `markdown` | Yes, unchanged |
| `plotly` | Yes, unchanged |
| `observable-plot` | Yes, unchanged |
| `sankey` | Yes, unchanged |
| `recharts` | Yes, unchanged |
| `flowmap` | Yes, unchanged |
| `zonemap` | Yes, unchanged |
| `graphic-walker` (`header.full_page: true`) | N/A — no `PanelCard`/registry lookup involved at all (`FullPagePanel`, unchanged by this feature) |

**Given** a panel whose `config.type` resolves to no entry in `registry` (an unknown type),
**When** the tab renders,
**Then** no expand control appears (unchanged from today — `PanelComponent && isExpandable && trigger` short-circuits on the missing component before `isExpandable` is even relevant).

## Given / When / Then — explicit per-panel override (FR-023–FR-025)

**Given** a `valuebox` panel with `expandable: true` in its own config,
**When** the tab renders,
**Then** its card shows a working expand control, exactly like any normally-expandable panel type's — the type-level default (no control) is overridden for this one panel only; every other `valuebox` panel on the same tab with no override still shows none.

**Given** a `table` panel (or any of the other seven normally-expandable types) with `expandable: false` in its own config,
**When** the tab renders,
**Then** its card shows NO expand control — the type-level default (control present) is overridden for this one panel only; every other `table` panel on the same tab with no override still shows one.

**Given** a graphic-walker panel rendered via the chromeless full-page Explore mode (`header.full_page: true`), with `expandable: true` configured on it,
**When** the tab renders,
**Then** nothing changes — that render path never reaches `PanelCard`/the registry lookup at all, so there is no expand-control mechanism for the override to affect (FR-004).

**Given** a panel with no `expandable` key at all in its own config (every `dashboard-*.yaml` file that existed before this addendum),
**When** the tab renders,
**Then** it resolves through the exact same type-level default table this contract's first section already specifies — zero behavior change from Part A's original, override-less design (FR-025).

## Non-goals

- `EXPANDABLE_PANEL_TYPES` remains a compile-time constant — it is the DEFAULT table an author's own `expandable` override can supersede per panel, not something an author edits directly or extends with new type names.
- No change to `usePanelExpandHost()`'s own exported signature, internal state, or DOM-portal mechanism — every existing call site outside `panelCard.tsx` (there are none today) would be unaffected regardless.
- No change to which panels render inside a Dialog once expanded — only whether the *trigger* to open one exists at all.
- No per-panel override of anything else about the expand mechanism (dialog size, close behavior, etc.) — `expandable` controls only whether the trigger/dialog exist for this panel, nothing about their own behavior once present.
