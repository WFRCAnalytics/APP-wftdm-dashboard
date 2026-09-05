"""Tests for wftdm_dashboard.postprocessor.expand (T009, plus US4 additions)."""

from __future__ import annotations

import pytest

from wftdm_dashboard.postprocessor.config import (
    EqualIntervalsBin,
    ManualBreaksBin,
    Mapping,
    QuantilesBin,
    SpacedIntervalsBin,
    SqlFragment,
    parse_summarize_dict,
)
from wftdm_dashboard.postprocessor.errors import UnknownBinTypeError, UnresolvedPlaceholderError
from wftdm_dashboard.postprocessor.expand import (
    expand,
    expand_bins,
    expand_mappings,
    expand_sql_fragment,
)


# ---------------------------------------------------------------------------
# $mappings.x
# ---------------------------------------------------------------------------


def test_expand_mappings_produces_when_lines_only_no_else():
    mapping = Mapping(
        name="major_trip_mode",
        entries={"DRIVEALONEFREE": "SOV", "WALK": "Non-Motorized"},
    )

    result = expand_mappings(mapping)

    assert "WHEN 'DRIVEALONEFREE' THEN 'SOV'" in result
    assert "WHEN 'WALK' THEN 'Non-Motorized'" in result
    assert "ELSE" not in result


# ---------------------------------------------------------------------------
# $bins.x — one test per documented type
# ---------------------------------------------------------------------------


def test_expand_bins_manual_breaks():
    bin_ = ManualBreaksBin(
        type="manual_breaks",
        column="income",
        breaks=[0, 25000, 50000],
        labels=["Low", "Medium", "High"],
    )

    result = expand_bins(bin_)

    assert result.startswith("CASE")
    assert result.endswith("END")
    assert "WHEN \"income\" < 25000 THEN 'Low'" in result
    assert "WHEN \"income\" < 50000 THEN 'Medium'" in result
    assert "ELSE 'High'" in result


def test_expand_bins_quantiles_uses_ntile_over_order_by():
    bin_ = QuantilesBin(type="quantiles", column="income", bins=5)

    result = expand_bins(bin_)

    assert result == 'NTILE(5) OVER (ORDER BY "income")'


def test_expand_bins_quantiles_defaults_to_4():
    bin_ = QuantilesBin(type="quantiles", column="income")

    result = expand_bins(bin_)

    assert result == 'NTILE(4) OVER (ORDER BY "income")'


def test_expand_bins_spaced_intervals():
    bin_ = SpacedIntervalsBin(type="spaced_intervals", column="distance", interval=0.5, lower=0)

    result = expand_bins(bin_)

    assert result == '(FLOOR(("distance" - 0) / 0.5) * 0.5 + 0)'


def test_expand_bins_equal_intervals_without_labels_returns_bare_bucket_expr():
    bin_ = EqualIntervalsBin(type="equal_intervals", column="distance", n=4, labels=None)

    result = expand_bins(bin_)

    assert result.startswith("LEAST(4 - 1, FLOOR(")
    assert "CASE" not in result


def test_expand_bins_equal_intervals_with_labels_wraps_in_case():
    bin_ = EqualIntervalsBin(
        type="equal_intervals",
        column="distance",
        n=4,
        labels=["Shortest", "Short", "Long", "Longest"],
    )

    result = expand_bins(bin_)

    assert result.startswith("CASE LEAST(4 - 1, FLOOR(")
    assert "WHEN 0 THEN 'Shortest'" in result
    assert "WHEN 3 THEN 'Longest'" in result
    assert result.endswith("END")


# ---------------------------------------------------------------------------
# $sql.x
# ---------------------------------------------------------------------------


def test_expand_sql_fragment_returns_literal_text_unchanged():
    fragment = SqlFragment(name="trips_only", text="trips t\nJOIN persons p ON t.x = p.x")

    result = expand_sql_fragment(fragment)

    assert result == "trips t\nJOIN persons p ON t.x = p.x"


# ---------------------------------------------------------------------------
# expand() — the combining function, resolving all placeholder kinds at once
# ---------------------------------------------------------------------------


def _config_with(mappings=None, bins=None, sql_fragments=None, metric_sql="SELECT 1"):
    raw = {
        "version": 2,
        "sources": {"trips": "trips.csv"},
        "mappings": mappings or {},
        "bins": bins or {},
        "sql_fragments": sql_fragments or {},
        "metrics": [{"name": "m", "sql": metric_sql}],
    }
    return parse_summarize_dict(raw)


def test_expand_resolves_all_three_placeholder_kinds_together():
    config = _config_with(
        mappings={"mode_map": {"WALK": "Non-Motorized"}},
        bins={
            "income_category": {
                "column": "income",
                "type": "manual_breaks",
                "breaks": [0, 50000],
                "labels": ["Low", "High"],
            }
        },
        sql_fragments={"trips_only": "trips t"},
    )
    sql = (
        "SELECT CASE t.mode $mappings.mode_map END AS mode, "
        "$bins.income_category AS income_category "
        "FROM $sql.trips_only"
    )

    result = expand(sql, config, metric_name="m")

    assert "WHEN 'WALK' THEN 'Non-Motorized'" in result
    assert 'WHEN "income" < 50000' in result
    assert "FROM trips t" in result


def test_expand_leaves_non_placeholder_text_untouched():
    config = _config_with()

    result = expand("SELECT * FROM trips WHERE x = 1", config, metric_name="m")

    assert result == "SELECT * FROM trips WHERE x = 1"


# ---------------------------------------------------------------------------
# US4 — attributed errors for unresolved references / bad bin types (T022)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kind,ref", [("mappings", "foo"), ("bins", "foo"), ("sql", "foo")])
def test_undefined_reference_raises_unresolved_placeholder_error_naming_metric_and_reference(
    kind, ref
):
    config = _config_with()

    with pytest.raises(UnresolvedPlaceholderError) as exc_info:
        expand(f"SELECT ${kind}.{ref}", config, metric_name="my_metric")

    assert exc_info.value.metric_name == "my_metric"
    assert exc_info.value.kind == kind
    assert exc_info.value.reference_name == ref


def test_unrecognized_bin_type_raises_unknown_bin_type_error_naming_bin_and_type():
    config = _config_with(bins={"bad": {"type": "not_a_real_type", "column": "x"}})

    with pytest.raises(UnknownBinTypeError) as exc_info:
        expand("SELECT $bins.bad", config, metric_name="my_metric")

    assert exc_info.value.bin_name == "bad"
    assert exc_info.value.bad_type == "not_a_real_type"
