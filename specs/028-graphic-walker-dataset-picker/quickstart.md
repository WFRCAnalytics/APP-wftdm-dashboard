# Quickstart: Validating the Graphic Walker Dataset Picker

## Prerequisites

- `npm install` already run.
- Fixture content available: `npm run dev:fixtures` (copies
  `tests/fixtures/{scenarios,dashboard-config,observed}` into the
  gitignored `public/` targets these tests/dev server read from).

## 1. Author a picker-enabled panel

Add (or edit) a `graphic-walker` panel in a fixture `dashboard-*.yaml`:

```yaml
- type: graphic-walker
  dataset: trip_mode_share
  dataset_picker: true
  limit: 100000
```

No `scenario:` set — the picker should list every metric name common to
**all currently active** scenarios (`tests/fixtures/scenarios/good_scenario/`
plus `observed`, per this repo's existing fixture set).

## 2. Run the dev server against fixtures

```bash
npm run dev
```

Open the Explore tab (or wherever the panel above was added). Confirm:

- The panel renders its configured default (`trip_mode_share`) exactly as
  it did before this feature (014's original behavior).
- A picker control is visible, listing dataset names — confirm every name
  shown is a plain metric name (e.g. `trip_mode_share`, `vmt_by_home_taz`),
  never an internal `{scenario}__{metric}` or `zonemap-geom__*` identifier
  (spec.md User Story 2).

## 3. Switch datasets

Pick a different entry from the picker. Confirm:

- Graphic Walker re-renders against the new dataset's real rows/fields
  (open the field list — it should match the new dataset's own columns,
  not the previous one's).
- Any chart the viewer had built against the old dataset is gone — a
  fresh, unconfigured chart state, not a stale binding to now-meaningless
  fields (spec.md FR-008/SC-005).

## 4. Confirm the picker only offers guaranteed-working choices

With a `zonemap` panel also present elsewhere on the dashboard (registers
a `zonemap-geom__*` view), reopen the picker and confirm that view never
appears as an option (spec.md User Story 2, Acceptance Scenario 1).

With two active scenarios whose metric sets only partially overlap (e.g.
activate a second fixture/demo scenario missing one of `good_scenario`'s
metrics), reopen the picker and confirm the non-overlapping metric is
**not** offered (Acceptance Scenario 2) — every remaining option should
load successfully when picked (Acceptance Scenario 3).

## 5. Confirm backward compatibility

Add a second `graphic-walker` panel with no `dataset_picker` key at all
(or `dataset_picker: false`). Confirm it shows no picker control and
behaves exactly as any pre-existing Graphic Walker panel does (spec.md
User Story 3).

## 6. Confirm no new filter reactivity

With a picker-enabled panel showing data, change a global sidebar filter
elsewhere on the dashboard. Confirm the panel's content does not change —
this panel type's existing filter non-reactivity (014's FR-005) must be
unaffected by this feature.

## Automated coverage (for `/speckit-tasks`)

- `tests/unit/graphicWalkerDatasets.test.ts` — pure-module tests for
  `listSelectableDatasets()`: empty inputs, full intersection, partial
  overlap exclusion, non-scenario-prefixed view exclusion
  (`zonemap-geom__*`), alphabetical/deterministic ordering.
- `tests/integration/graphicWalkerPanel.spec.ts` — extended with: picker
  renders only when enabled; switching datasets re-renders with new
  fields; a `zonemap-geom__*` view never appears as an option; disabled
  panels are pixel-for-pixel unaffected; no re-query on an unrelated
  global filter change.
