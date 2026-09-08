# Quickstart: Expand Real ActivitySim Demo Content to All Ten Panel Types

See `contracts/new-metrics.md` and `contracts/geometry-pipeline.md` for
the full behavioral contract each scenario checks against; not
duplicated here.

## Prerequisites

```powershell
uv run python scripts/build-demo-zone-geometry.py   # one-time; writes
                                                      # public/demo-geometry/
                                                      # taz25.geoparquet and
                                                      # prints the real
                                                      # centroid VALUES block
# paste the printed block into summarize.yaml's sql_fragments.zone_centroids

uv run wftdm-dashboard summarize --input <raw-baseline-dir> --config summarize.yaml --output public/demo-scenarios/activitysim-baseline --scenario-name activitysim-baseline --display-name "Baseline"
uv run wftdm-dashboard summarize --input <raw-density-variant-dir> --config summarize.yaml --output public/demo-scenarios/activitysim-density-variant --scenario-name activitysim-density-variant --display-name "Density Variant"
uv run wftdm-dashboard summarize --input <raw-transit-variant-dir> --config summarize.yaml --output public/demo-scenarios/activitysim-transit-variant --scenario-name activitysim-transit-variant --display-name "Transit Variant"
# (the same three real invocations 026-activitysim-demo-content already
# established — unchanged, just re-run against the updated summarize.yaml)

npm run dev
```

## Scenario 1 — Geometry script produces real, verifiable output (FR-010)

```powershell
uv run python scripts/build-demo-zone-geometry.py
```

**Done when**: `public/demo-geometry/taz25.geoparquet` exists, and the
printed centroid values for TAZ 1/6/16/25 match this feature's own
already-recorded ground truth (contracts/geometry-pipeline.md's
verification requirement) — not just "the script exited 0."

## Scenario 2 — `purpose_mode_flow`/`od_flows` satisfy their real-data invariants (US2/US3, contracts/new-metrics.md)

```python
# python/tests/test_pipeline.py — new cases
def test_purpose_mode_flow_sums_to_total_trips(tmp_scenario):
    ...
    assert sum(row["trips"] for row in output_rows) == real_total_trip_count

def test_od_flows_coordinates_match_centroid_table(tmp_scenario):
    ...
    for row in output_rows:
        assert (row["orig_lat"], row["orig_lon"]) == centroid_lookup[row["orig_taz"]]
```

**Done when**: both invariants hold against a real (small, fixture-shaped)
run — not merely "the Parquet file has the expected columns."

## Scenario 3 — Every newly-covered panel type renders real data (US1-US4)

```ts
// tests/integration — one assertion per newly-covered panel type
for (const [tab, title] of [
  ['Overview', 'Recharts Mode Share'],
  ['Overview', 'Observable Plot Mode Share'],
  ['Network Flows', 'Purpose → Mode Flow'],
  ['Network Flows', 'Trip Distribution Desire Lines'],
  ['Network Flows', 'Trips by Destination Zone'],
  ['Explore', 'Free-form Visual Analytics'],
  ['Explore', 'About This Demo'],
]) {
  await page.getByRole('link', { name: tab }).click() // or tab click, per 030's own nav — this feature doesn't depend on which
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  // + a panel-type-specific non-empty-real-data assertion (row count > 0,
  //   a specific known-real value visible, etc.)
}
```

**Done when**: all seven newly-covered panel types (plus the three
already-working ones, unaffected) render real, non-empty content across
the three real scenarios — SC-001.

## Scenario 4 — FlowMap/ZoneMap render real, geographically plausible shapes (US3/US4, SC-003)

```ts
await page.getByRole('link', { name: 'Network Flows' }).click()
// FlowMap: at least one real flow line rendered (canvas pixel-readback,
// matching this project's own existing canvasHasDrawnPixels() helper)
// ZoneMap: real, non-rectangular zone polygon shapes rendered (not the
// synthetic axis-aligned rectangles tests/fixtures/geometry/taz.geoparquet
// uses for OTHER tests) — spot-check via a real screenshot, matching this
// project's own established dual-theme visual-verification discipline
```

## Scenario 5 — `zoneGeometry.ts`'s fallback doesn't affect existing behavior (contracts/geometry-pipeline.md)

```ts
// Existing zonemap fixture panel (boundaries: taz.geoparquet, already
// under public/geometry/) still resolves on the FIRST attempt — assert
// no request to demo-geometry/ occurs for it (a network-request-count or
// request-log assertion, matching this project's own established
// technique from 021-basemap-catalog-redesign's own "no new request on
// an unrelated change" tests).
```

## Full-suite regression (SC-004)

```powershell
uv run pytest python/tests/
npm run typecheck
npm run test:unit
npm run test:integration
```

**Done when**: the full suite (JS + Python) passes at its pre-feature
rate, and a real, live re-run of the actual `wftdm-dashboard summarize`
CLI against the three real raw scenario directories succeeds end-to-end
with the two new metrics included in its output.
