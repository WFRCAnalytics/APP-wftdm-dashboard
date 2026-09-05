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
