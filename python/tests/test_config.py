"""Tests for wftdm_dashboard.postprocessor.config (T006)."""

from __future__ import annotations

import pytest

from wftdm_dashboard.postprocessor.config import (
    EqualIntervalsBin,
    ManualBreaksBin,
    QuantilesBin,
    SpacedIntervalsBin,
    UnknownBin,
    parse_summarize_dict,
    parse_summarize_yaml,
)
from wftdm_dashboard.postprocessor.errors import DuplicateMetricError, InvalidConfigError


MINIMAL_VALID_CONFIG = {
    "version": 2,
    "sources": {"trips": "trips.csv"},
    "mappings": {
        "major_trip_mode": {"DRIVEALONEFREE": "SOV", "WALK": "Non-Motorized"},
    },
    "bins": {
        "income_category": {
            "column": "income",
            "type": "manual_breaks",
            "breaks": [0, 25000, 50000],
            "labels": ["Low", "Medium", "High"],
        },
    },
    "sql_fragments": {"trips_only": "trips t"},
    "metrics": [
        {"name": "trip_purpose", "description": "Trips by purpose", "sql": "SELECT * FROM trips"},
    ],
}


def test_parses_a_valid_minimal_config():
    config = parse_summarize_dict(MINIMAL_VALID_CONFIG)

    assert config.version == 2
    assert config.sources["trips"].path == "trips.csv"
    assert config.mappings["major_trip_mode"].entries["WALK"] == "Non-Motorized"
    assert config.sql_fragments["trips_only"].text == "trips t"
    assert len(config.metrics) == 1
    assert config.metrics[0].name == "trip_purpose"
    assert config.metrics[0].sql == "SELECT * FROM trips"


def test_missing_sources_key_raises_invalid_config_error():
    raw = {k: v for k, v in MINIMAL_VALID_CONFIG.items() if k != "sources"}

    with pytest.raises(InvalidConfigError):
        parse_summarize_dict(raw)


def test_empty_sources_raises_invalid_config_error():
    raw = {**MINIMAL_VALID_CONFIG, "sources": {}}

    with pytest.raises(InvalidConfigError):
        parse_summarize_dict(raw)


def test_missing_metrics_key_raises_invalid_config_error():
    raw = {k: v for k, v in MINIMAL_VALID_CONFIG.items() if k != "metrics"}

    with pytest.raises(InvalidConfigError):
        parse_summarize_dict(raw)


def test_duplicate_metric_name_raises_duplicate_metric_error():
    raw = {
        **MINIMAL_VALID_CONFIG,
        "metrics": [
            {"name": "dup", "sql": "SELECT 1"},
            {"name": "dup", "sql": "SELECT 2"},
        ],
    }

    with pytest.raises(DuplicateMetricError) as exc_info:
        parse_summarize_dict(raw)
    assert "dup" in str(exc_info.value)


@pytest.mark.parametrize(
    ("bin_raw", "expected_type"),
    [
        (
            {"type": "manual_breaks", "column": "income", "breaks": [0, 1], "labels": ["a", "b"]},
            ManualBreaksBin,
        ),
        ({"type": "quantiles", "column": "income", "bins": 5}, QuantilesBin),
        (
            {"type": "spaced_intervals", "column": "distance", "interval": 0.5, "lower": 0},
            SpacedIntervalsBin,
        ),
        ({"type": "equal_intervals", "column": "distance", "n": 4}, EqualIntervalsBin),
    ],
)
def test_each_recognized_bin_type_parses_to_its_own_dataclass(bin_raw, expected_type):
    raw = {**MINIMAL_VALID_CONFIG, "bins": {"b": bin_raw}}

    config = parse_summarize_dict(raw)

    assert isinstance(config.bins["b"], expected_type)


def test_unrecognized_bin_type_parses_without_error_deferred_to_expand_time():
    raw = {**MINIMAL_VALID_CONFIG, "bins": {"b": {"type": "not_a_real_type", "column": "x"}}}

    config = parse_summarize_dict(raw)

    assert isinstance(config.bins["b"], UnknownBin)
    assert config.bins["b"].type == "not_a_real_type"


def test_parse_summarize_yaml_reads_a_real_file(tmp_path):
    import yaml

    config_path = tmp_path / "summarize.yaml"
    config_path.write_text(yaml.safe_dump(MINIMAL_VALID_CONFIG), encoding="utf-8")

    config = parse_summarize_yaml(config_path)

    assert config.sources["trips"].path == "trips.csv"


def test_malformed_yaml_raises_invalid_config_error(tmp_path):
    config_path = tmp_path / "summarize.yaml"
    config_path.write_text("sources: [this is: not valid: yaml", encoding="utf-8")

    with pytest.raises(InvalidConfigError):
        parse_summarize_yaml(config_path)
