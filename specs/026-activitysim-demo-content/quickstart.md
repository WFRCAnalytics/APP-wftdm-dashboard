# Quickstart: validating the real ActivitySim demo content

## Prerequisites

- The three real raw ActivitySim output directories from this session's
  earlier work (`wftdm-scenario-outputs/{baseline,density-variant,
  transit-variant}/output/`, or wherever they've been relocated) — each
  containing `final_households.csv`, `final_persons.csv`, `final_tours.csv`,
  `final_trips.csv`, `final_land_use.csv`.
- `wftdm-dashboard` installed and runnable (`uv run wftdm-dashboard --version`
  from `python/`, per 025-python-postprocessor).
- This feature's `summarize.yaml` authored at the repo root (see
  `contracts/summarize-config.md`).

## 1. Generate the three scenario folders

Run the three invocations in `contracts/discovery.md`'s "CLI invocations"
section, substituting each real raw directory path. Confirm each exits `0`:

```sh
echo $?   # expect 0, three times
```

If any exits `1`, the printed message names the specific offending source/
metric (per `contracts/cli.md`) — fix `summarize.yaml`, not the raw data.

## 2. Verify the generated content directly

```sh
ls public/demo-scenarios/activitysim-baseline/summary/
# expect: summary_kpis.parquet trips_by_destination_zone.parquet
#         mode_share_by_period.parquet trip_mode_share.parquet
#         trip_purpose_share.parquet
```

Spot-check the two headline metrics with DuckDB directly (no browser needed):

```sh
duckdb -c "
  SELECT destination_zone_id, primary_purpose, trips
  FROM 'public/demo-scenarios/activitysim-baseline/summary/trips_by_destination_zone.parquet'
  WHERE destination_zone_id = 1
  UNION ALL
  SELECT destination_zone_id, primary_purpose, trips
  FROM 'public/demo-scenarios/activitysim-density-variant/summary/trips_by_destination_zone.parquet'
  WHERE destination_zone_id = 1
"
```

Expected: the density-variant rows sum to roughly +37% over baseline's,
matching spec.md SC-003 (already-measured real range).

```sh
duckdb -c "
  SELECT time_of_day_period, trip_mode, share
  FROM 'public/demo-scenarios/activitysim-baseline/summary/mode_share_by_period.parquet'
  WHERE trip_mode = 'WALK_LOC' AND time_of_day_period IN ('AM','PM','MD')
  UNION ALL
  SELECT time_of_day_period, trip_mode, share
  FROM 'public/demo-scenarios/activitysim-transit-variant/summary/mode_share_by_period.parquet'
  WHERE trip_mode = 'WALK_LOC' AND time_of_day_period IN ('AM','PM','MD')
"
```

Expected: AM/PM shares rise by roughly +1 percentage point in the transit
variant; MD stays close to flat — matching spec.md SC-004.

## 3. Verify discovery + rendering in the browser

```sh
npm run dev
```

Open the dev server URL. Confirm:

- The Overview tab (new `dashboard-1-overview.yaml`) renders real, non-zero
  KPI value boxes for whichever demo scenario(s) are active.
- The existing fixture-driven tabs (from `public/dashboard-config/`, if
  `npm run dev:fixtures` was also run) are unaffected — both tab sets appear,
  proving the two discovery paths coexist without interference (SC-006).
- The Destination Choice tab shows TAZ 1's bar/row visibly higher for
  `activitysim-density-variant` than `activitysim-baseline` (User Story 1).
- The Destination Choice tab's `$baseline` diff table shows a real, non-zero,
  positive `diff_value` for TAZ 1 with no manual scenario-list setup —
  `activitysim-baseline` is already the resolved default baseline (User
  Story 3, SC-005).
- The Transit Service tab shows `WALK_LOC`'s AM/PM bars visibly higher for
  `activitysim-transit-variant` than baseline, with MD/EV close to unchanged
  (User Story 2).

## 4. Confirm isolation from the existing fixture/test workflow (FR-009, SC-006)

```sh
npm run test:unit          # unaffected — no fixture/test file touched
npm run test:integration   # unaffected — global-setup/teardown's own
                            # fixture copy/cleanup never reference public/demo-*/
```

Both MUST pass exactly as they did before this feature existed.
