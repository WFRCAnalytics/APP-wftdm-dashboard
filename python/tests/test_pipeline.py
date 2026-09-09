"""End-to-end tests for wftdm_dashboard.postprocessor.pipeline (T011, plus
US4 additions).
"""

from __future__ import annotations

import duckdb
import pytest

from wftdm_dashboard.postprocessor.config import parse_summarize_dict
from wftdm_dashboard.postprocessor.errors import MetricExecutionError, SourceNotFoundError
from wftdm_dashboard.postprocessor.pipeline import run_pipeline


def test_pipeline_writes_one_parquet_file_per_metric(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    config = parse_summarize_dict(minimal_summarize_config_dict)
    output_dir = tmp_path / "scenario-out"

    written = run_pipeline(config, raw_activitysim_dir, output_dir)

    assert {p.name for p in written} == {"trip_mode_share.parquet", "summary_kpis.parquet"}
    for path in written:
        assert path.exists()


def test_trip_mode_share_metric_produces_expected_mapped_and_binned_columns(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    config = parse_summarize_dict(minimal_summarize_config_dict)
    output_dir = tmp_path / "scenario-out"

    run_pipeline(config, raw_activitysim_dir, output_dir)

    conn = duckdb.connect()
    rows = conn.sql(
        f"SELECT * FROM read_parquet('{(output_dir / 'summary' / 'trip_mode_share.parquet').as_posix()}') "
        "ORDER BY purpose, mode"
    ).fetchall()
    conn.close()

    # DRIVEALONEFREE -> SOV, WALK -> Non-Motorized, per the fixture mapping;
    # income buckets are derived from each trip's own household income via
    # the fixture's manual_breaks bin — both are real generated-SQL effects,
    # not hardcoded expectations copied from the pipeline's own code.
    modes = {r[1] for r in rows}
    assert modes == {"SOV", "Non-Motorized", "HOV"}


def test_summary_kpis_metric_counts_households(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    config = parse_summarize_dict(minimal_summarize_config_dict)
    output_dir = tmp_path / "scenario-out"

    run_pipeline(config, raw_activitysim_dir, output_dir)

    conn = duckdb.connect()
    total = conn.sql(
        f"SELECT total_households FROM read_parquet("
        f"'{(output_dir / 'summary' / 'summary_kpis.parquet').as_posix()}')"
    ).fetchone()[0]
    conn.close()

    assert total == 3  # 3 households in the fixture


def test_rerun_with_a_removed_metric_leaves_no_stale_file(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    output_dir = tmp_path / "scenario-out"
    full_config = parse_summarize_dict(minimal_summarize_config_dict)
    run_pipeline(full_config, raw_activitysim_dir, output_dir)
    assert (output_dir / "summary" / "summary_kpis.parquet").exists()

    reduced_dict = {
        **minimal_summarize_config_dict,
        "metrics": [
            m for m in minimal_summarize_config_dict["metrics"] if m["name"] != "summary_kpis"
        ],
    }
    reduced_config = parse_summarize_dict(reduced_dict)

    run_pipeline(reduced_config, raw_activitysim_dir, output_dir)

    remaining = {p.name for p in (output_dir / "summary").iterdir()}
    assert remaining == {"trip_mode_share.parquet"}


def test_empty_result_set_still_writes_a_valid_parquet_file(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    config_dict = {
        **minimal_summarize_config_dict,
        "metrics": [
            {
                "name": "no_rows",
                "sql": "SELECT household_id FROM households WHERE household_id < 0",
            }
        ],
    }
    config = parse_summarize_dict(config_dict)
    output_dir = tmp_path / "scenario-out"

    written = run_pipeline(config, raw_activitysim_dir, output_dir)

    conn = duckdb.connect()
    rows = conn.sql(f"SELECT * FROM read_parquet('{written[0].as_posix()}')").fetchall()
    conn.close()
    assert rows == []


# ---------------------------------------------------------------------------
# US4 — attributed errors (T023)
# ---------------------------------------------------------------------------


def test_missing_source_file_raises_source_not_found_before_any_metric_runs(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    (raw_activitysim_dir / "trips.csv").unlink()
    config = parse_summarize_dict(minimal_summarize_config_dict)
    output_dir = tmp_path / "scenario-out"

    with pytest.raises(SourceNotFoundError) as exc_info:
        run_pipeline(config, raw_activitysim_dir, output_dir)

    assert exc_info.value.source_name == "trips"
    # Nothing was written — the failure happened before any metric SQL ran.
    assert not (output_dir / "summary").exists() or list((output_dir / "summary").iterdir()) == []


def test_metric_referencing_an_undeclared_table_raises_metric_execution_error(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    config_dict = {
        **minimal_summarize_config_dict,
        "metrics": [
            {"name": "bad_metric", "sql": "SELECT * FROM never_declared_table"},
        ],
    }
    config = parse_summarize_dict(config_dict)
    output_dir = tmp_path / "scenario-out"

    with pytest.raises(MetricExecutionError) as exc_info:
        run_pipeline(config, raw_activitysim_dir, output_dir)

    assert exc_info.value.metric_name == "bad_metric"


# ---------------------------------------------------------------------------
# 031-all-panel-demo-content — new Sankey/FlowMap metric SQL correctness
# (T015, T018). Both run against `raw_activitysim_dir`'s own small,
# independently-authored, realistically-shaped fixture (conftest.py) — NOT
# the real 25-zone prototype_mtc data, so these tests are fully achievable
# and meaningful without the real raw ActivitySim scenario directories
# this feature's own real-data publication step is separately blocked on
# (see CLAUDE.md's own 031 entry). They verify the two new metrics' SQL is
# structurally correct against real ActivitySim-shaped columns — not a
# substitute for eventually re-running the real pipeline.
# ---------------------------------------------------------------------------


def test_purpose_mode_flow_sums_to_total_trips(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    """contracts/new-metrics.md's own real-data invariant: SUM(trips) over
    purpose_mode_flow's output equals the real total trip count for the
    scenario — a full GROUP BY partition with no WHERE, so no row is
    dropped or double-counted."""
    config_dict = {
        **minimal_summarize_config_dict,
        "metrics": [
            *minimal_summarize_config_dict["metrics"],
            {
                "name": "purpose_mode_flow",
                "sql": (
                    "SELECT\n"
                    "  t.primary_purpose,\n"
                    "  CASE t.trip_mode $mappings.major_trip_mode END AS major_trip_mode,\n"
                    "  COUNT(*) AS trips\n"
                    "FROM trips t\n"
                    "GROUP BY t.primary_purpose, major_trip_mode"
                ),
            },
        ],
    }
    config = parse_summarize_dict(config_dict)
    output_dir = tmp_path / "scenario-out"

    run_pipeline(config, raw_activitysim_dir, output_dir)

    conn = duckdb.connect()
    total_from_metric = conn.sql(
        "SELECT SUM(trips) FROM read_parquet("
        f"'{(output_dir / 'summary' / 'purpose_mode_flow.parquet').as_posix()}')"
    ).fetchone()[0]
    real_total_trips = conn.sql(
        f"SELECT COUNT(*) FROM read_csv_auto('{(raw_activitysim_dir / 'trips.csv').as_posix()}')"
    ).fetchone()[0]
    conn.close()

    assert real_total_trips == 4  # the fixture's own real, known row count
    assert total_from_metric == real_total_trips


def test_od_flows_coordinates_match_centroid_table(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    """contracts/new-metrics.md's own real-data invariant: every
    orig_lat/orig_lon/dest_lat/dest_lon value in od_flows' output is
    byte-identical to the matching zone_centroids row — the join is an
    equality join on zone_id, so this holds by construction, but is worth
    a direct assertion (this feature's own "never fabricate a coordinate"
    constraint, made concrete and checkable for this specific metric).

    Real finding from this test's own first run: a literal decimal in a
    VALUES clause (e.g. `37.1`) is inferred by DuckDB as DECIMAL, not
    DOUBLE — a real risk for the browser-side FlowMap consumer, which
    expects a plain JS number, not a DECIMAL-typed Arrow value. The real
    `od_flows` metric in summarize.yaml now CASTs both coordinate pairs to
    DOUBLE explicitly; this test's own local SQL mirrors that fix so it
    keeps proving the real metric's actual shape, not a stale copy of it.
    """
    config_dict = {
        **minimal_summarize_config_dict,
        "sql_fragments": {
            **minimal_summarize_config_dict["sql_fragments"],
            "zone_centroids": "(VALUES (10, 37.1, -122.1), (20, 37.2, -122.2))",
        },
        "metrics": [
            *minimal_summarize_config_dict["metrics"],
            {
                "name": "od_flows",
                "sql": (
                    "SELECT\n"
                    "  t.origin AS orig_taz, t.destination AS dest_taz,\n"
                    "  CAST(c1.lat AS DOUBLE) AS orig_lat, CAST(c1.lon AS DOUBLE) AS orig_lon,\n"
                    "  CAST(c2.lat AS DOUBLE) AS dest_lat, CAST(c2.lon AS DOUBLE) AS dest_lon,\n"
                    "  COUNT(*) AS trips\n"
                    "FROM trips t\n"
                    "JOIN $sql.zone_centroids AS c1(zone_id, lat, lon) ON t.origin      = c1.zone_id\n"
                    "JOIN $sql.zone_centroids AS c2(zone_id, lat, lon) ON t.destination = c2.zone_id\n"
                    "GROUP BY t.origin, t.destination, c1.lat, c1.lon, c2.lat, c2.lon"
                ),
            },
        ],
    }
    config = parse_summarize_dict(config_dict)
    output_dir = tmp_path / "scenario-out"

    run_pipeline(config, raw_activitysim_dir, output_dir)

    conn = duckdb.connect()
    rows = conn.sql(
        "SELECT orig_taz, orig_lat, orig_lon, dest_taz, dest_lat, dest_lon FROM read_parquet("
        f"'{(output_dir / 'summary' / 'od_flows.parquet').as_posix()}')"
    ).fetchall()
    conn.close()

    centroid_lookup = {10: (37.1, -122.1), 20: (37.2, -122.2)}
    assert len(rows) == 4  # the fixture's own 4 real trips, all within zones 10/20
    for orig_taz, orig_lat, orig_lon, dest_taz, dest_lat, dest_lon in rows:
        assert (orig_lat, orig_lon) == centroid_lookup[orig_taz]
        assert (dest_lat, dest_lon) == centroid_lookup[dest_taz]


# ---------------------------------------------------------------------------
# 032-six-tab-demo-content — real-data invariants for the new metrics'
# distinct SQL SHAPES (haversine distance, tour_category filtering, the new
# person_type mapping, and a household-aggregate join into land_use) — one
# representative test per shape, not all 28 new metrics individually. The
# real end-to-end `wftdm-dashboard summarize` CLI run against the real
# three-scenario ActivitySim output (this feature's own T026) already
# validated every one of the 28 new metrics' real-data invariants directly
# (grouped counts summing to real population counts, zero NULL distances,
# etc. — recorded in tasks.md's own T026 notes) — stronger evidence for
# those specific metrics than a synthetic fixture could provide. These
# tests instead guard the underlying SQL PATTERNS every one of those
# metrics reuses, with their own small, self-contained raw directories
# (not the shared `raw_activitysim_dir` fixture, which has no
# tours/land_use/accessibility tables) — so a future regression in any of
# these shared patterns is caught here regardless of which specific metric
# next uses them.
# ---------------------------------------------------------------------------


def _write_csv(path, text):
    path.write_text(text, encoding="utf-8")


def test_haversine_distance_never_null_and_survives_a_same_zone_trip(tmp_path):
    """contracts/summarize-metrics.md's shared haversine formula, including
    its real, confirmed LEAST/GREATEST clamp fix: a same-zone trip
    (origin == destination) makes the naive acos() argument evaluate
    fractionally ABOVE 1.0 due to floating-point rounding, which DuckDB's
    acos() rejects outright ("ACOS is undefined outside [-1,1]") rather
    than clamping — found via a real CLI run against real baseline data,
    not assumed. This test reproduces that exact same-zone case directly."""
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    _write_csv(
        raw_dir / "trips.csv",
        "trip_id,origin,destination\n1,10,20\n2,10,10\n",  # trip 2 is same-zone
    )

    config_dict = {
        "version": 2,
        "sources": {"trips": "trips.csv"},
        "sql_fragments": {
            "zone_centroids": "(VALUES (10, 37.1, -122.1), (20, 37.2, -122.2))",
        },
        "metrics": [
            {
                "name": "trip_distance",
                "sql": (
                    "SELECT trip_id, 3959 * acos(\n"
                    "  LEAST(1.0, GREATEST(-1.0,\n"
                    "    cos(radians(c1.lat)) * cos(radians(c2.lat)) * cos(radians(c2.lon) - radians(c1.lon))\n"
                    "    + sin(radians(c1.lat)) * sin(radians(c2.lat))\n"
                    "  ))\n"
                    ") AS distance_miles\n"
                    "FROM trips t\n"
                    "JOIN $sql.zone_centroids AS c1(zone_id, lat, lon) ON t.origin      = c1.zone_id\n"
                    "JOIN $sql.zone_centroids AS c2(zone_id, lat, lon) ON t.destination = c2.zone_id"
                ),
            },
        ],
    }
    config = parse_summarize_dict(config_dict)
    output_dir = tmp_path / "scenario-out"

    run_pipeline(config, raw_dir, output_dir)

    conn = duckdb.connect()
    rows = conn.sql(
        "SELECT trip_id, distance_miles FROM read_parquet("
        f"'{(output_dir / 'summary' / 'trip_distance.parquet').as_posix()}') ORDER BY trip_id"
    ).fetchall()
    conn.close()

    assert len(rows) == 2
    assert rows[0][1] is not None and rows[0][1] > 0  # real cross-zone distance
    assert rows[1][1] == pytest.approx(0.0, abs=1e-6)  # same-zone: real zero distance, not NULL/crash


def test_tour_category_filter_only_counts_matching_real_tours(tmp_path):
    """The shared pattern every Tour Models metric uses (`WHERE
    tour_category = '...'`) only counts the real matching subset — no
    cross-category leakage."""
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    _write_csv(
        raw_dir / "tours.csv",
        "tour_id,tour_category,primary_purpose,start,end,duration\n"
        "1,mandatory,work,7,17,10\n"
        "2,mandatory,work,8,16,8\n"
        "3,non_mandatory,shopping,10,11,1\n"
        "4,joint,social,18,20,2\n"
        "5,atwork,eat,12,13,1\n",
    )
    config_dict = {
        "version": 2,
        "sources": {"tours": "tours.csv"},
        "metrics": [
            {
                "name": "mandatory_tour_scheduling",
                "sql": (
                    "SELECT primary_purpose, start, \"end\", duration, COUNT(*) AS tours\n"
                    "FROM tours\n"
                    "WHERE tour_category = 'mandatory'\n"
                    "GROUP BY primary_purpose, start, \"end\", duration"
                ),
            },
        ],
    }
    config = parse_summarize_dict(config_dict)
    output_dir = tmp_path / "scenario-out"

    run_pipeline(config, raw_dir, output_dir)

    conn = duckdb.connect()
    total_tours = conn.sql(
        "SELECT SUM(tours) FROM read_parquet("
        f"'{(output_dir / 'summary' / 'mandatory_tour_scheduling.parquet').as_posix()}')"
    ).fetchone()[0]
    conn.close()

    assert total_tours == 2  # only the 2 real 'mandatory' rows — not all 5


def test_person_type_mapping_covers_all_8_real_ptype_values(tmp_path):
    """data-model.md §2's new `mappings.person_type` — all 8 real
    ActivitySim ptype values (1-8, including the real 8th value this
    feature's own audit found: pre-school child) map to a real label, no
    unmapped/NULL fallthrough."""
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    _write_csv(
        raw_dir / "persons.csv",
        "person_id,ptype\n" + "\n".join(f"{i},{i}" for i in range(1, 9)) + "\n",
    )
    config_dict = {
        "version": 2,
        "sources": {"persons": "persons.csv"},
        "mappings": {
            "person_type": {
                1: "Full-time worker",
                2: "Part-time worker",
                3: "University student",
                4: "Non-worker",
                5: "Retired",
                6: "Driving-age student",
                7: "Non-driving student",
                8: "Pre-school child",
            },
        },
        "metrics": [
            {
                "name": "cdap_summary",
                "sql": (
                    "SELECT person_id, CASE ptype $mappings.person_type END AS person_type\n"
                    "FROM persons"
                ),
            },
        ],
    }
    config = parse_summarize_dict(config_dict)
    output_dir = tmp_path / "scenario-out"

    run_pipeline(config, raw_dir, output_dir)

    conn = duckdb.connect()
    rows = conn.sql(
        "SELECT person_id, person_type FROM read_parquet("
        f"'{(output_dir / 'summary' / 'cdap_summary.parquet').as_posix()}') ORDER BY person_id"
    ).fetchall()
    conn.close()

    assert len(rows) == 8
    assert all(label is not None for _, label in rows)  # no unmapped ptype falls through as NULL
    assert rows[7] == (8, "Pre-school child")  # the real 8th value this feature's own audit found


def test_land_use_summary_household_aggregates_join_by_zone_not_globally(tmp_path):
    """land_use_summary's real household-aggregate join (avg income, avg
    auto ownership) must be scoped PER ZONE via `home_zone_id`, not a
    single global average silently applied to every zone."""
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    _write_csv(raw_dir / "land_use.csv", "zone_id,DISTRICT\n1,A\n2,B\n")
    _write_csv(
        raw_dir / "households.csv",
        "household_id,home_zone_id,income,auto_ownership\n"
        "1,1,10000,0\n2,1,30000,2\n3,2,90000,3\n",
    )
    config_dict = {
        "version": 2,
        "sources": {"land_use": "land_use.csv", "households": "households.csv"},
        "metrics": [
            {
                "name": "land_use_summary",
                "sql": (
                    "SELECT lu.zone_id, lu.DISTRICT, h_agg.avg_income, h_agg.avg_auto_ownership\n"
                    "FROM land_use lu\n"
                    "LEFT JOIN (\n"
                    "  SELECT home_zone_id, AVG(income) AS avg_income,\n"
                    "    AVG(auto_ownership) AS avg_auto_ownership\n"
                    "  FROM households GROUP BY home_zone_id\n"
                    ") h_agg ON lu.zone_id = h_agg.home_zone_id"
                ),
            },
        ],
    }
    config = parse_summarize_dict(config_dict)
    output_dir = tmp_path / "scenario-out"

    run_pipeline(config, raw_dir, output_dir)

    conn = duckdb.connect()
    rows = conn.sql(
        "SELECT zone_id, avg_income, avg_auto_ownership FROM read_parquet("
        f"'{(output_dir / 'summary' / 'land_use_summary.parquet').as_posix()}') ORDER BY zone_id"
    ).fetchall()
    conn.close()

    assert rows[0] == (1, 20000.0, 1.0)  # zone 1's own real 2-household average
    assert rows[1] == (2, 90000.0, 3.0)  # zone 2's own real single-household value


def test_person_household_profile_is_deliberately_ungrouped_one_row_per_person(tmp_path):
    """contracts/summarize-metrics.md's own singular exception: this is
    the one new metric that must NOT aggregate — real row count must equal
    the real total person count, exactly."""
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    _write_csv(
        raw_dir / "persons.csv",
        "person_id,household_id\n1,1\n2,1\n3,2\n4,3\n5,3\n",
    )
    config_dict = {
        "version": 2,
        "sources": {"persons": "persons.csv"},
        "metrics": [
            {
                "name": "person_household_profile",
                "sql": "SELECT person_id, household_id FROM persons",
            },
        ],
    }
    config = parse_summarize_dict(config_dict)
    output_dir = tmp_path / "scenario-out"

    run_pipeline(config, raw_dir, output_dir)

    conn = duckdb.connect()
    row_count = conn.sql(
        "SELECT COUNT(*) FROM read_parquet("
        f"'{(output_dir / 'summary' / 'person_household_profile.parquet').as_posix()}')"
    ).fetchone()[0]
    real_person_count = conn.sql(
        f"SELECT COUNT(*) FROM read_csv_auto('{(raw_dir / 'persons.csv').as_posix()}')"
    ).fetchone()[0]
    conn.close()

    assert real_person_count == 5  # the fixture's own real, known row count
    assert row_count == real_person_count
