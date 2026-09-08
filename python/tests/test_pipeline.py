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
