# Contract: Six-Tab Dashboard Structure

Applies to `public/demo-dashboard-config/index.json` and the six
`dashboard-*.yaml` files it lists (`data-model.md` §4 for the file list
and per-tab section/panel-type assignment).

## `index.json`

```json
{
  "dashboards": [
    "dashboard-1-summary.yaml",
    "dashboard-2-person-household.yaml",
    "dashboard-3-tour-models.yaml",
    "dashboard-4-mode-choice.yaml",
    "dashboard-5-trip-models.yaml",
    "dashboard-6-network.yaml",
    "dashboard-5-explore.yaml"
  ],
  "title": "WFRC TDM Calibration Dashboard",
  "logoUrl": "...",
  "logoUrlDark": "..."
}
```

`title`/`logoUrl`/`logoUrlDark` are unchanged from the current real file —
not part of this feature. `dashboard-5-explore.yaml` keeps its existing
filename (`research.md` §6) despite being listed last — array position,
not filename, controls display order (`CLAUDE.md`'s Navigation model
section).

## Per-tab grammar (all six use only already-existing `dashboard-*.yaml`
grammar — no new panel-config field, no new tab-level field beyond what
`030-sidebar-navigation` already shipped)

```yaml
header:
  tab: "Person/Household Models"    # sidebar label
  title: "Person / Household Models"
  description: "..."
  icon: users                        # lucide-react icon name, matching 030's grammar
sections:                            # 030-sidebar-navigation's real, existing grammar
  - id: auto-ownership
    label: "Auto Ownership"
    rows: [row_auto_ownership]
  - id: work-from-home
    label: "Work from Home"
    rows: [row_work_from_home_gap]
  # ... one section per CALIBRATION-SUMMARIES.md submodel heading this
  # tab covers, in the SAME order that document lists them
layout:
  - id: row_auto_ownership
    panels:
      - type: table
        title: "Auto Ownership by Household Segment"
        dataset: auto_ownership_summary
        scenario: activitysim-baseline    # or omitted for $scenario union, per existing grammar
  - id: row_work_from_home_gap
    panels:
      - type: markdown
        title: "Work from Home — not available in this demo"
        content: |
          ActivitySim's `work_from_home` component is not enabled in this
          project's real `prototype_mtc` configuration, so no real data
          exists for this submodel. See `docs/CALIBRATION-SUMMARIES.md`.
```

## Section-to-submodel mapping rule

Every `sections:` entry's `label` MUST be the exact submodel heading text
`docs/CALIBRATION-SUMMARIES.md` uses for that tab (e.g. "Auto Ownership",
not "Auto Ownership Model" or "Vehicle Availability") — `spec.md` FR-003's
own literal requirement, verifiable by a direct text diff between the two
documents' heading lists.

A submodel marked ❌ in `data-model.md` §1 still gets its own section and
row — containing exactly one `markdown` panel stating the real reason,
per the "gap note" convention (`data-model.md` §4's closing note) — it is
never simply omitted from the sidebar's sub-navigation, so a viewer
browsing sections sees the full real submodel list for that tab, with
gaps stated rather than silently absent from the list itself. (FR-009
itself only requires the *data panel* be absent, not the section/heading
that explains why.)

## Panel-to-metric binding

Every panel's `dataset:` (or `metric:`/`x`/`y`/`value` fields, per each
panel type's own existing grammar in `docs/GRAMMAR.md`) MUST reference
one of: an existing, already-real metric name, or one of the new metric
names in `data-model.md` §3 — never a literal inline value. This is the
mechanical, checkable form of FR-008's "no fabricated/placeholder value"
requirement, applied at the config level.

## What does NOT change

- `030-sidebar-navigation`'s own `sections:`/`sidebar`/accordion mechanism
  code (`layout/sidebarNav.tsx`, `layout/dashboardLayout.ts`) — this
  feature is content-only, consuming that mechanism exactly as it already
  works.
- `dashboard-5-explore.yaml`'s content, byte-for-byte.
- Any panel type's own component code (`panels/*.tsx`) — every one of the
  ten types is used exactly as its existing, already-shipped grammar
  already supports.
