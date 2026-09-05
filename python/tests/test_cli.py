"""Tests for the `wftdm-dashboard summarize` CLI (T015, plus US3/US4
additions) — per contracts/cli.md.
"""

from __future__ import annotations

import yaml
from click.testing import CliRunner

from wftdm_dashboard.cli import main


def _invoke_summarize(raw_dir, config_path, output_dir, extra_args=()):
    runner = CliRunner()
    return runner.invoke(
        main,
        [
            "summarize",
            "--input",
            str(raw_dir),
            "--config",
            str(config_path),
            "--output",
            str(output_dir),
            "--scenario-name",
            "test_scenario",
            *extra_args,
        ],
    )


def _write_config(tmp_path, config_dict):
    config_path = tmp_path / "summarize.yaml"
    config_path.write_text(yaml.safe_dump(config_dict), encoding="utf-8")
    return config_path


# ---------------------------------------------------------------------------
# US2 — metrics conversion
# ---------------------------------------------------------------------------


def test_successful_run_writes_expected_parquet_files_and_exits_zero(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    config_path = _write_config(tmp_path, minimal_summarize_config_dict)
    output_dir = tmp_path / "out"

    result = _invoke_summarize(raw_activitysim_dir, config_path, output_dir)

    assert result.exit_code == 0, result.output
    assert (output_dir / "summary" / "trip_mode_share.parquet").exists()
    assert (output_dir / "summary" / "summary_kpis.parquet").exists()


def test_successful_run_prints_a_line_per_written_metric(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    config_path = _write_config(tmp_path, minimal_summarize_config_dict)
    output_dir = tmp_path / "out"

    result = _invoke_summarize(raw_activitysim_dir, config_path, output_dir)

    assert "trip_mode_share.parquet" in result.output
    assert "summary_kpis.parquet" in result.output


def test_help_prints_usage_and_exits_zero():
    runner = CliRunner()

    result = runner.invoke(main, ["summarize", "--help"])

    assert result.exit_code == 0
    assert "Usage:" in result.output


def test_no_arguments_prints_usage_and_exits_nonzero_without_writing_anything(tmp_path):
    runner = CliRunner()

    result = runner.invoke(main, ["summarize"])

    assert result.exit_code != 0
    assert "Usage:" in result.output
    assert list(tmp_path.iterdir()) == []


# ---------------------------------------------------------------------------
# US3 — manifest generation
# ---------------------------------------------------------------------------


def test_manifest_written_with_supplied_scenario_name_and_run_date(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    config_path = _write_config(tmp_path, minimal_summarize_config_dict)
    output_dir = tmp_path / "out"

    result = _invoke_summarize(
        raw_activitysim_dir, config_path, output_dir, extra_args=["--run-date", "2026-09-05"]
    )

    assert result.exit_code == 0, result.output
    manifest = yaml.safe_load((output_dir / "manifest.yaml").read_text(encoding="utf-8"))
    assert manifest["scenario_name"] == "test_scenario"
    assert manifest["run_date"] == "2026-09-05"
    assert manifest["engine"] == "activitysim"


def test_pinned_flag_sets_pinned_true(raw_activitysim_dir, minimal_summarize_config_dict, tmp_path):
    config_path = _write_config(tmp_path, minimal_summarize_config_dict)
    output_dir = tmp_path / "out"

    result = _invoke_summarize(
        raw_activitysim_dir, config_path, output_dir, extra_args=["--pinned"]
    )

    assert result.exit_code == 0, result.output
    manifest = yaml.safe_load((output_dir / "manifest.yaml").read_text(encoding="utf-8"))
    assert manifest["pinned"] is True


def test_omitted_color_auto_assigns_a_valid_hex_color(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    config_path = _write_config(tmp_path, minimal_summarize_config_dict)
    output_dir = tmp_path / "out"

    result = _invoke_summarize(raw_activitysim_dir, config_path, output_dir)

    assert result.exit_code == 0, result.output
    manifest = yaml.safe_load((output_dir / "manifest.yaml").read_text(encoding="utf-8"))
    assert manifest["color"].startswith("#")


# ---------------------------------------------------------------------------
# US4 — actionable errors
# ---------------------------------------------------------------------------


def test_missing_source_file_exits_one_with_a_specific_message(
    raw_activitysim_dir, minimal_summarize_config_dict, tmp_path
):
    (raw_activitysim_dir / "trips.csv").unlink()
    config_path = _write_config(tmp_path, minimal_summarize_config_dict)
    output_dir = tmp_path / "out"

    result = _invoke_summarize(raw_activitysim_dir, config_path, output_dir)

    assert result.exit_code == 1
    assert "trips" in result.output
