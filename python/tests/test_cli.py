"""Tests for the `wftdm-dashboard summarize` CLI (T015, plus US3/US4
additions) — per contracts/cli.md.
"""

from __future__ import annotations

import pytest
import yaml
from click.testing import CliRunner

import wftdm_dashboard.cli as cli_module
from wftdm_dashboard.cli import main
from wftdm_dashboard.server import BundleMissingError, PortInUseError


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


# ---------------------------------------------------------------- here (072-python-local-server)


class _FakeServer:
    server_port = 8123


@pytest.fixture
def run_here(monkeypatch, tmp_path):
    """Runs `here` with the server start patched out: returns (result, calls)."""
    calls: dict = {}

    def fake_create_app(folder, **kwargs):
        calls["app"] = (folder, kwargs)
        return object()

    def fake_bind(app, host, port, *, exact_port):
        calls["bind"] = (host, port, exact_port)
        return _FakeServer()

    def fake_serve(server, *, message, url, open_browser):
        calls["serve"] = (message, url, open_browser)

    monkeypatch.setattr(cli_module, "create_app", fake_create_app)
    monkeypatch.setattr(cli_module, "bind_server", fake_bind)
    monkeypatch.setattr(cli_module, "serve_until_stopped", fake_serve)

    def run(*args):
        return CliRunner().invoke(main, ["here", *args]), calls

    return run


def test_here_help_lists_its_options():
    result = CliRunner().invoke(main, ["here", "--help"])
    assert result.exit_code == 0
    for text in ("--port", "--host", "--no-browser", "FOLDER"):
        assert text in result.output


def test_here_serves_the_folder_and_prints_the_address(run_here, tmp_path):
    (tmp_path / "dashboard-config.yaml").write_text("version: 1\n", encoding="utf-8")
    result, calls = run_here(str(tmp_path))
    assert result.exit_code == 0
    message, url, open_browser = calls["serve"]
    assert url == "http://127.0.0.1:8123/"
    assert f"Serving {tmp_path} at http://127.0.0.1:8123/" in message
    assert open_browser is True
    assert calls["bind"] == ("127.0.0.1", 8050, False)  # the default port, not an exact one
    assert calls["app"][1] == {"allow_any_host": False}


def test_here_forwards_an_asked_for_port_as_exact(run_here, tmp_path):
    _, calls = run_here(str(tmp_path), "--port", "9001")
    assert calls["bind"] == ("127.0.0.1", 9001, True)


def test_here_no_browser(run_here, tmp_path):
    _, calls = run_here(str(tmp_path), "--no-browser")
    assert calls["serve"][2] is False


def test_here_hints_at_init_when_there_is_no_site_file(run_here, tmp_path):
    result, calls = run_here(str(tmp_path))
    assert result.exit_code == 0
    assert "No dashboard-config.yaml found" in result.output
    assert f"wftdm-dashboard init {tmp_path}" in result.output
    assert "serve" in calls  # the server still starts


def test_here_is_quiet_about_init_when_the_site_file_is_there(run_here, tmp_path):
    (tmp_path / "dashboard-config.yaml").write_text("version: 1\n", encoding="utf-8")
    result, _ = run_here(str(tmp_path))
    assert "No dashboard-config.yaml found" not in result.output


def test_here_finds_the_site_file_in_the_public_layout(run_here, tmp_path):
    (tmp_path / "dashboard-config").mkdir()
    (tmp_path / "dashboard-config" / "dashboard-config.yaml").write_text("version: 1\n", encoding="utf-8")
    result, _ = run_here(str(tmp_path))
    assert "No dashboard-config.yaml found" not in result.output


def test_here_warns_when_it_listens_beyond_this_machine(run_here, tmp_path):
    result, calls = run_here(str(tmp_path), "--host", "0.0.0.0")
    assert "visible to the network" in result.output
    assert calls["app"][1] == {"allow_any_host": True}
    assert calls["serve"][1].startswith("http://127.0.0.1:")  # a wildcard address is not one a browser can open


def test_here_does_not_warn_on_loopback(run_here, tmp_path):
    result, _ = run_here(str(tmp_path), "--host", "localhost")
    assert "visible to the network" not in result.output


def test_here_says_how_to_build_when_the_bundle_is_missing(monkeypatch, tmp_path):
    def missing(folder, **kwargs):
        raise BundleMissingError("The dashboard app has not been built into this package. In the repository run: make build")

    monkeypatch.setattr(cli_module, "create_app", missing)
    result = CliRunner().invoke(main, ["here", str(tmp_path)])
    assert result.exit_code == 1
    assert "make build" in result.output
    assert "Traceback" not in result.output


def test_here_reports_a_taken_port(monkeypatch, tmp_path):
    monkeypatch.setattr(cli_module, "create_app", lambda folder, **kwargs: object())

    def taken(app, host, port, *, exact_port):
        raise PortInUseError(f"Port {port} is already in use.")

    monkeypatch.setattr(cli_module, "bind_server", taken)
    result = CliRunner().invoke(main, ["here", str(tmp_path), "--port", "8050"])
    assert result.exit_code == 1
    assert "Port 8050 is already in use." in result.output


def test_here_needs_an_existing_folder(tmp_path):
    result = CliRunner().invoke(main, ["here", str(tmp_path / "missing")])
    assert result.exit_code == 2
