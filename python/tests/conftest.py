"""Shared pytest fixtures for the postprocessor test suite (T008).

Fixture column names are real ActivitySim column names (confirmed directly
against ActivitySim's own current documentation/example config this
feature's own research.md §7 records) — realistic enough to exercise the
pipeline against something resembling a real run, while the pipeline's own
code stays fully generic (FR-007): nothing in wftdm_dashboard.postprocessor
references any of these specific names.
"""

from __future__ import annotations

import duckdb
import pytest


HOUSEHOLDS_CSV = (
    "household_id,home_zone_id,auto_ownership,income,hhsize\n"
    "1,10,1,45000,2\n"
    "2,20,2,90000,4\n"
    "3,10,0,15000,1\n"
)

PERSONS_CSV = (
    "person_id,household_id,is_worker,work_from_home\n1,1,1,0\n2,1,0,0\n3,2,1,1\n4,3,0,0\n"
)

TRIPS_CSV = (
    "trip_id,person_id,household_id,primary_purpose,trip_mode,tour_mode,origin,destination,depart,arrive\n"
    "1,1,1,work,DRIVEALONEFREE,DRIVEALONEFREE,10,20,7,8\n"
    "2,1,1,work,DRIVEALONEFREE,DRIVEALONEFREE,20,10,17,18\n"
    "3,2,1,shopping,WALK,WALK,10,10,12,13\n"
    "4,3,2,work,SHARED2FREE,SHARED2FREE,20,20,8,9\n"
)


@pytest.fixture
def raw_activitysim_dir(tmp_path):
    """Writes a tiny, realistically-shaped raw ActivitySim output directory.

    Returns the directory Path. `zones.parquet` is written as *already*
    Parquet, matching docs/GRAMMAR.md's own documented `sources:` shape
    (some sources arrive pre-converted, not every source is CSV).
    """
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()

    (raw_dir / "households.csv").write_text(HOUSEHOLDS_CSV, encoding="utf-8")
    (raw_dir / "persons.csv").write_text(PERSONS_CSV, encoding="utf-8")
    (raw_dir / "trips.csv").write_text(TRIPS_CSV, encoding="utf-8")

    conn = duckdb.connect()
    try:
        conn.sql(
            "SELECT * FROM (VALUES (10, 'A'), (20, 'B')) AS t(taz_id, super_district)"
        ).write_parquet(str(raw_dir / "zones.parquet"))
    finally:
        conn.close()

    return raw_dir


@pytest.fixture
def minimal_summarize_config_dict():
    """A summarize.yaml-shaped dict exercising all three placeholder kinds
    ($mappings/$bins/$sql) together, over `raw_activitysim_dir`'s schema.
    """
    return {
        "version": 2,
        "sources": {
            "trips": "trips.csv",
            "persons": "persons.csv",
            "households": "households.csv",
            "zones": "zones.parquet",
        },
        "mappings": {
            "major_trip_mode": {
                "DRIVEALONEFREE": "SOV",
                "SHARED2FREE": "HOV",
                "WALK": "Non-Motorized",
            },
        },
        "bins": {
            "income_category": {
                "column": "income",
                "type": "manual_breaks",
                "breaks": [0, 25000, 50000],
                "labels": ["Low", "Medium", "High"],
            },
        },
        "sql_fragments": {
            "trips_merged": (
                "trips t\n"
                "JOIN persons p ON t.person_id = p.person_id\n"
                "JOIN households h ON p.household_id = h.household_id\n"
                "JOIN zones z ON h.home_zone_id = z.taz_id"
            ),
        },
        "metrics": [
            {
                "name": "trip_mode_share",
                "description": "Trip mode share by purpose",
                "sql": (
                    "SELECT\n"
                    "  t.primary_purpose AS purpose,\n"
                    "  CASE t.trip_mode $mappings.major_trip_mode END AS mode,\n"
                    "  $bins.income_category AS income_category,\n"
                    "  COUNT(*) AS trips\n"
                    "FROM $sql.trips_merged\n"
                    "GROUP BY purpose, mode, income_category"
                ),
            },
            {
                "name": "summary_kpis",
                "description": "Scalar KPIs",
                "sql": "SELECT COUNT(DISTINCT household_id) AS total_households FROM households",
            },
        ],
    }
