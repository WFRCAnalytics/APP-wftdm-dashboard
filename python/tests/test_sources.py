"""Tests for wftdm_dashboard.postprocessor.sources (T010, plus US4 additions)."""

from __future__ import annotations

import duckdb
import pytest

from wftdm_dashboard.postprocessor.config import Source
from wftdm_dashboard.postprocessor.errors import SourceNotFoundError
from wftdm_dashboard.postprocessor.sources import ensure_source_exists, load_source


@pytest.fixture
def conn():
    connection = duckdb.connect()
    yield connection
    connection.close()


def test_csv_source_becomes_a_queryable_view_via_read_csv_auto(conn, tmp_path):
    (tmp_path / "trips.csv").write_text("trip_id,mode\n1,WALK\n2,DRIVE\n", encoding="utf-8")
    source = Source(name="trips", path="trips.csv")

    load_source(conn, source, tmp_path)

    rows = conn.sql('SELECT * FROM "trips" ORDER BY trip_id').fetchall()
    assert rows == [(1, "WALK"), (2, "DRIVE")]


def test_parquet_source_becomes_a_queryable_view_via_read_parquet(conn, tmp_path):
    setup_conn = duckdb.connect()
    setup_conn.sql(
        "SELECT * FROM (VALUES (10, 'A'), (20, 'B')) AS t(taz_id, district)"
    ).write_parquet(str(tmp_path / "zones.parquet"))
    setup_conn.close()
    source = Source(name="zones", path="zones.parquet")

    load_source(conn, source, tmp_path)

    rows = conn.sql('SELECT * FROM "zones" ORDER BY taz_id').fetchall()
    assert rows == [(10, "A"), (20, "B")]


def test_geoparquet_extension_also_routed_through_read_parquet(conn, tmp_path):
    setup_conn = duckdb.connect()
    setup_conn.sql("SELECT * FROM (VALUES (1,)) AS t(x)").write_parquet(
        str(tmp_path / "boundaries.geoparquet")
    )
    setup_conn.close()
    source = Source(name="boundaries", path="boundaries.geoparquet")

    load_source(conn, source, tmp_path)

    assert conn.sql('SELECT * FROM "boundaries"').fetchall() == [(1,)]


def test_view_is_named_exactly_the_source_key_unprefixed(conn, tmp_path):
    (tmp_path / "households.csv").write_text("household_id\n1\n", encoding="utf-8")
    source = Source(name="households", path="households.csv")

    load_source(conn, source, tmp_path)

    view_names = {row[0] for row in conn.sql("SHOW TABLES").fetchall()}
    assert "households" in view_names


# ---------------------------------------------------------------------------
# US4 — pre-flight existence validation (T021)
# ---------------------------------------------------------------------------


def test_ensure_source_exists_raises_source_not_found_naming_source_and_path(tmp_path):
    source = Source(name="trips", path="trips.csv")

    with pytest.raises(SourceNotFoundError) as exc_info:
        ensure_source_exists(source, tmp_path)

    assert exc_info.value.source_name == "trips"
    assert "trips.csv" in exc_info.value.path


def test_ensure_source_exists_is_a_no_op_when_the_file_is_present(tmp_path):
    (tmp_path / "trips.csv").write_text("trip_id\n1\n", encoding="utf-8")
    source = Source(name="trips", path="trips.csv")

    ensure_source_exists(source, tmp_path)  # must not raise
