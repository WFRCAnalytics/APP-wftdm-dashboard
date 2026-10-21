"""Tests for `wftdm-dashboard validate-observed` (project-docs/redesign/06-data-and-config.md section 6.5)."""

from __future__ import annotations

import json

import duckdb
import yaml
from click.testing import CliRunner

from wftdm_dashboard.cli import main
from wftdm_dashboard.observed import validate_observed


def _parquet(path, select_sql):
    con = duckdb.connect()
    con.execute(f"COPY ({select_sql}) TO '{path.as_posix()}' (FORMAT PARQUET)")
    con.close()


def _source(folder, source_id="hts-2023", extra=None):
    sdir = folder / source_id
    sdir.mkdir(parents=True)
    meta = {
        "id": source_id,
        "label": "2023 household travel survey",
        "vintage": 2023,
        "sample": {"households": 14820},
        "suppression": {"min_cell_n": 30},
    }
    meta.update(extra or {})
    (sdir / "source.yaml").write_text(yaml.safe_dump(meta), encoding="utf-8")
    return sdir


def _index(folder, metrics=None, sources=("hts-2023",)):
    index = {
        "sources": [{"id": s, "label": s} for s in sources],
        "metrics": metrics if metrics is not None else {"trip_mode_share": "hts-2023"},
    }
    (folder / "index.json").write_text(json.dumps(index), encoding="utf-8")


GOOD = "SELECT 'Transit' AS major_trip_mode, 0.03 AS share, 0.005 AS moe, 120 AS n"


def test_valid_folder_passes(tmp_path):
    sdir = _source(tmp_path)
    _parquet(sdir / "trip_mode_share.parquet", GOOD)
    _index(tmp_path)
    report = validate_observed(tmp_path)
    assert report.ok, report.errors
    assert report.checked_files == 1


def test_small_cells_fail_with_the_offending_rows(tmp_path):
    sdir = _source(tmp_path)
    _parquet(sdir / "trip_mode_share.parquet", "SELECT 'Bike' AS major_trip_mode, 0.01 AS share, 7 AS n")
    _index(tmp_path)
    report = validate_observed(tmp_path)
    assert not report.ok
    assert any("suppression threshold" in e and "Bike" in e for e in report.errors)


def test_missing_provenance_key_fails(tmp_path):
    sdir = tmp_path / "hts-2023"
    sdir.mkdir()
    (sdir / "source.yaml").write_text(yaml.safe_dump({"id": "hts-2023", "label": "x", "vintage": 2023}), encoding="utf-8")
    _index(tmp_path, metrics={})
    report = validate_observed(tmp_path)
    assert any("missing required key 'sample'" in e for e in report.errors)


def test_wrong_columns_and_unknown_metric_fail(tmp_path):
    sdir = _source(tmp_path)
    _parquet(sdir / "trip_mode_share.parquet", "SELECT 'Walk' AS major_trip_mode, 0.1 AS pct, 100 AS n")
    _parquet(sdir / "mystery.parquet", "SELECT 1 AS a")
    _index(tmp_path, metrics={})
    errors = validate_observed(tmp_path).errors
    assert any("missing columns" in e and "share" in e for e in errors)
    assert any("'mystery' is not a known metric" in e for e in errors)


def test_registry_must_point_at_real_sources_and_files(tmp_path):
    _source(tmp_path)
    _index(tmp_path, metrics={"transit_boardings": "obs-2023", "trip_mode_share": "hts-2023"})
    errors = validate_observed(tmp_path).errors
    assert any("unknown source 'obs-2023'" in e for e in errors)
    assert any("trip_mode_share.parquet, which does not exist" in e for e in errors)


def test_missing_index_fails(tmp_path):
    assert any("missing registry index.json" in e for e in validate_observed(tmp_path).errors)


def test_cli_exit_codes(tmp_path):
    sdir = _source(tmp_path)
    _parquet(sdir / "trip_mode_share.parquet", GOOD)
    _index(tmp_path)
    runner = CliRunner()
    ok = runner.invoke(main, ["validate-observed", str(tmp_path)])
    assert ok.exit_code == 0
    assert "observed data OK" in ok.output
    _parquet(sdir / "trip_mode_share.parquet", "SELECT 'Bike' AS major_trip_mode, 0.01 AS share, 7 AS n")
    bad = runner.invoke(main, ["validate-observed", str(tmp_path)])
    assert bad.exit_code == 1
