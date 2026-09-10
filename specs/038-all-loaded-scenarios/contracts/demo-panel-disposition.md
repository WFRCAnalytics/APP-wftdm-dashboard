# Contract: Demo-panel disposition (authoritative edit list)

**Surface**: the eight `public/demo-dashboard-config/dashboard-*.yaml` files listed
in `public/demo-dashboard-config/index.json`. YAML parsed at runtime (Principle
IV) — every entry here is a content edit, never a build-time transform.

This is the binding per-panel edit list for FR-007..FR-011. Panel numbers,
titles, and current keys are from a direct parse on 2026-09-10 (see
`research.md` §2 for the full table with rationale). **41 panels** (37 pinned
singular + 4 with a redundant list); the 5 markdown notes are untouched.

## Actions

| Action | Edit | Count |
|---|---|--:|
| **UNPIN** | delete the `scenario:` / `scenarios:` line. **For a `table` with an explicit `columns:` list** (all 18 unpinned demo tables), also prepend `- { field: scenario, label: "Scenario" }` — an explicit `columns:` list renders ONLY the listed fields (`tableLogic.ts`), so without this the `$scenario` discriminator column is invisible and the union reads as unlabeled duplicated rows. | 20 |
| **UNPIN+CH** | delete `scenario:`; add `name: $scenario` (plotly) **or** `fill: scenario` (observable-plot) | 3 |
| **UNLIST** | delete the `scenarios: [...]` line; keep the existing per-scenario channel (`series: scenario` #6 / `name: $scenario` in traces #7, #34) or none (#33 sankey — combined flow) | 4 |
| **KEEP+NOTE** | keep `scenario: activitysim-baseline` (rewrite a list to this singular form); add/extend `description:` with a baseline-scope note | 14 |

**Correction to the earlier §2 estimate**: panels **#7** (`Average Trip Distance by Purpose`) and **#34** (`Trip Mode Share by Time-of-Day Period`) already carry `name: $scenario` inside their `traces:` block — the first `js-yaml` parse only inspected top-level `p.name`, missing the trace-level channel. They are **UNLIST** (drop the redundant list, keep the channel), not UNPIN+CH. The genuine "add a free channel" set is **{#11 `fill: scenario`, #24 `name: $scenario`, #37 `name: $scenario`}**. Totals are unchanged: 27 unpinned (20 UNPIN + 3 UNPIN+CH + 4 UNLIST), 14 KEEP+NOTE.

## Per-panel list

### `dashboard-1-summary.yaml`
| # | Title | Action | Detail |
|--:|---|---|---|
| 1 | Households | KEEP+NOTE | KPI valuebox; `description`: baseline-scope note (research.md §5) |
| 2 | Persons | KEEP+NOTE | KPI valuebox |
| 3 | Tours | KEEP+NOTE | KPI valuebox |
| 4 | Trips | KEEP+NOTE | KPI valuebox |
| 5 | Total VMT | KEEP+NOTE | KPI valuebox |
| 6 | Total Trips by Mode | UNLIST | recharts; `series: scenario` already present — keep it |
| 7 | Average Trip Distance by Purpose | UNPIN+CH | plotly; add `name: $scenario` |

### `dashboard-2-person-household.yaml`
| # | Title | Action | Detail |
|--:|---|---|---|
| 8 | Auto Ownership by Household Segment | UNPIN | table |
| 10 | School Location Distance Distribution | KEEP+NOTE | obs-plot; `fill: school_segment` already committed (research.md §4) |
| 11 | Workplace Location Distance Distribution | UNPIN+CH | obs-plot; add `fill: scenario` |
| 12 | Home-Workplace District Flows | UNPIN | table |
| 16 | CDAP Activity Pattern by Segment | UNPIN | table |
| 17 | Explore: Person/Household Profile | UNPIN | graphic-walker |

### `dashboard-3-tour-models.yaml`
| # | Title | Action | Detail |
|--:|---|---|---|
| 18 | Mandatory Tour Frequency by Person Type | UNPIN | table |
| 19 | Mandatory Tour Start/End/Duration (Work Tours) | UNPIN | table |
| 20 | Joint Tour Frequency and Composition | UNPIN | table |
| 21 | Joint Tour Participation | UNPIN | table |
| 22 | Joint Tour Destination Distance | KEEP+NOTE | obs-plot; `fill: primary_purpose` committed |
| 23 | Joint Tour Scheduling | UNPIN | table |
| 24 | Non-Mandatory Tour Frequency by Purpose | UNPIN+CH | plotly; add `name: $scenario` |
| 25 | Non-Mandatory Tour Destination Distance | KEEP+NOTE | obs-plot; `fill: primary_purpose` committed |
| 26 | Non-Mandatory Tour Scheduling | UNPIN | table |
| 27 | At-Work Subtour Frequency | UNPIN | table |
| 28 | At-Work Subtour Destination Distance | UNPIN | table |
| 29 | At-Work Subtour Scheduling | UNPIN | table |
| 30 | Stop Frequency by Tour Purpose | UNPIN | table |

### `dashboard-4-mode-choice.yaml`
| # | Title | Action | Detail |
|--:|---|---|---|
| 31 | Tour Mode Share by Segment | UNPIN | table |
| 32 | At-Work Subtour Mode Share by Purpose | KEEP+NOTE | recharts; `series: tour_mode` committed, no faceting (research.md §4) |
| 33 | Trip Purpose to Mode Flow | UNLIST | sankey; union sums flows across active scenarios — combined flow, not a comparison; responds to the Switch; accepted per spec item-2 |
| 34 | Trip Mode Share by Time-of-Day Period (WALK_LOC) | UNPIN+CH | plotly; add `name: $scenario` |

### `dashboard-5-trip-models.yaml`
| # | Title | Action | Detail |
|--:|---|---|---|
| 35 | Trip Purpose Breakdown | UNPIN | table |
| 36 | Trip Destination Distance Distribution | KEEP+NOTE | obs-plot; `fill: primary_purpose` committed |
| 37 | Trip Departure Hour (Work Trips) | UNPIN+CH | plotly; add `name: $scenario` |
| 38 | SOV Trip Attractions by Zone | KEEP+NOTE | zonemap; one draw per dataset (FR-010) |

### `dashboard-6-network.yaml`
| # | Title | Action | Detail |
|--:|---|---|---|
| 40 | Total VMT (straight-line proxy) | KEEP+NOTE | KPI valuebox |
| 41 | VMT by Home Zone (straight-line proxy) | KEEP+NOTE | zonemap; one draw per dataset (FR-010) |
| 42 | Trip Distribution Desire Lines | KEEP+NOTE | flowmap; one O-D set per dataset (FR-010) |
| 43 | Home-Workplace District Flows | UNPIN | table |
| 44 | Land Use / Socioeconomics by Zone | UNPIN | table |
| 45 | Accessibility by Zone | UNPIN | table |

### `dashboard-5-explore.yaml`
| # | Title | Action | Detail |
|--:|---|---|---|
| 46 | Free-form Visual Analytics — Trip Mode Share | UNPIN | graphic-walker |

## Refinement discovered during implementation (T020)

A `table` panel with an explicit `columns:` list renders **only** the listed
fields. All 18 unpinned demo tables have such a list, none of which named
`scenario` — so unpinning alone produced a 3-scenario union with no visible
discriminator. Fix applied to every one: `- { field: scenario, label:
"Scenario" }` prepended to the `columns:` list. `Scenario Split (Table)` in the
fixture works without this only because it has no `columns:` override (auto-derives
every column, `scenario` included).

## Post-edit invariants (verification targets → SC-002, SC-003)

- **`grep -c "scenario: activitysim-baseline"` across the eight files == 14** (the
  KEEP+NOTE set; 5 of these were `scenario:` already, 6 valueboxes, 3
  zonemap/flowmap — plus panels 32/33's forms: 32 keeps its `scenario:`, 33 had a
  list and is UNLISTed so it does **not** add one → recount: singular
  `scenario: activitysim-baseline` appears on panels 1,2,3,4,5,10,22,25,32,36,38,40,41,42 = **14**).
- **No `scenarios: [` list remains** on any demo panel (panels 6, 7, 33, 34 all
  lose theirs).
- **27 panels** carry neither `scenario:` nor `scenarios:` (the UNPIN + UNPIN+CH
  + UNLIST sets: 20 + 5 + 2).
- Every UNPIN+CH panel (7, 11, 24, 34, 37) has exactly one added channel line
  (`name: $scenario` ×4, `fill: scenario` ×1).
- Every KEEP+NOTE panel has a non-empty `description`.
- Boot the demo with three `ready` `activitysim-*` scenarios, no `?s=`: each
  UNPIN table shows a `scenario` column with 3 distinct values; each UNPIN+CH /
  UNLIST chart shows 3 series; toggling one scenario's Switch drops it from all
  27 within one render, on every tab (SC-002); the 14 KEEP+NOTE panels do not
  change (Acceptance Scenario US1.4).
