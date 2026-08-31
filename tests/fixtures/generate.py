"""Generate tiny synthetic Parquet fixtures for the integration test suite.

Scope is strictly literal (research.md §2): hard-codes a handful of rows
matching real metric column shapes and writes them straight to Parquet via
DuckDB. Zero aggregation, join, or transform logic — this is a fixture
generator, not a scaled-down post-processor, and must never import or
duplicate anything from the eventual `summarize.py`.

Run: uv run python tests/fixtures/generate.py
(also runs automatically before `npm run test:integration`, via the
`pretest:integration` npm script — fixture Parquet is never committed,
per .gitignore's blanket `*.parquet` rule; see tasks.md T004/T006.)
"""

import json
import shutil
from pathlib import Path

import duckdb

FIXTURES_DIR = Path(__file__).parent

# Column shape borrowed from docs/CALIBRATION-SUMMARIES.md's summary_kpis.parquet
# and trip_mode_share.parquet entries — values are made up, not modeled output.
SUMMARY_KPIS_ROWS = [
    (1500, 3800, 9200, 24, 6.4),
    (1500, 3800, 9200, 25, 6.1),
]
SUMMARY_KPIS_COLUMNS = [
    "total_households",
    "total_persons",
    "total_trips",
    "purpose_count",
    "avg_trip_distance",
]

TRIP_MODE_SHARE_ROWS = [
    ("HBW", "SOV", 0.62),
    ("HBW", "HOV", 0.18),
    ("HBW", "Transit", 0.09),
    ("HBW", "Non-Motorized", 0.11),
]
TRIP_MODE_SHARE_COLUMNS = ["purpose", "mode", "share"]

# 005-table-panel: docs/GRAMMAR.md's own `type: table` example is a
# screenline validation table (link_id/facility_type/observed/modeled/
# pct_error) — reused here rather than inventing a different shape.
# 30 rows: enough to exceed the default page size (20) so pagination and
# cross-page search are meaningfully exercised, not just plausible in
# theory. Row 25 (facility_type "Ramp") is the *only* row with that
# facility_type — deliberately placed on page 2 (index 24, 0-based) so a
# search for "Ramp" only succeeds if search genuinely evaluates the full
# fetched result set, not just whatever page happens to be showing
# (spec.md User Story 4's central claim).
def _screenline_rows():
    rows = []
    for i in range(1, 31):
        link_id = f"L{i:03d}"
        facility_type = "Ramp" if i == 25 else ["Freeway", "Arterial", "Collector"][i % 3]
        observed = 500 + i * 37
        # pct_error spans both signs, including values near a [-0.5, 0.5]
        # domain's extremes, without needing every row hand-tuned.
        pct_error = round(((i * 7) % 13 - 6) / 12, 3)
        modeled = round(observed * (1 + pct_error))
        rows.append((link_id, facility_type, observed, modeled, pct_error))
    return rows


SCREENLINES_ROWS = _screenline_rows()
SCREENLINES_COLUMNS = ["link_id", "facility_type", "observed", "modeled", "pct_error"]


def write_parquet(con, dest: Path, columns: list[str], rows: list[tuple]) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    col_list = ", ".join(columns)
    values = ", ".join(
        "(" + ", ".join(_sql_literal(v) for v in row) + ")" for row in rows
    )
    con.execute(f"""
        COPY (SELECT * FROM (VALUES {values}) AS t({col_list}))
        TO '{dest.as_posix()}' (FORMAT PARQUET)
    """)


def _sql_literal(v):
    if isinstance(v, str):
        return "'" + v.replace("'", "''") + "'"
    if isinstance(v, float):
        # Explicit DOUBLE cast — a bare literal like 0.62 infers as
        # DuckDB's DECIMAL(3,2) by default, which apache-arrow's JS
        # decimal-to-number conversion doesn't scale correctly (reads
        # back as 62, not 0.62) when duckdb.ts's query() calls
        # row.toJSON(). A real post-processor's floating-point aggregate
        # output would never hit this — it's purely an artifact of this
        # generator's literal-value SQL construction. See
        # 003-dashboard-shell-navigation's implementation notes.
        return f"CAST({v} AS DOUBLE)"
    return str(v)


def write_manifest(dest: Path, **fields) -> None:
    # Hand-formatted YAML (no PyYAML dependency needed for this small,
    # flat, scalar-only shape) — values are plain strings/bools/etc.
    dest.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for key, value in fields.items():
        if isinstance(value, bool):
            rendered = "true" if value else "false"
        elif isinstance(value, str):
            rendered = value
        else:
            rendered = str(value)
        lines.append(f"{key}: {rendered}")
    dest.write_text("\n".join(lines) + "\n")


def write_summary_index(summary_dir: Path, filenames: list[str]) -> None:
    (summary_dir / "index.json").write_text(json.dumps(filenames))


def main():
    con = duckdb.connect()

    # Wipe and regenerate — fixtures are fully reproducible from this script.
    for stale in ("observed", "scenarios"):
        shutil.rmtree(FIXTURES_DIR / stale, ignore_errors=True)

    # ── observed/ — always-available, pinned dataset ──────────────────────
    observed_summary = FIXTURES_DIR / "observed" / "summary"
    write_parquet(
        con,
        observed_summary / "summary_kpis.parquet",
        SUMMARY_KPIS_COLUMNS,
        SUMMARY_KPIS_ROWS,
    )
    write_summary_index(observed_summary, ["summary_kpis.parquet"])
    write_manifest(
        FIXTURES_DIR / "observed" / "manifest.yaml",
        scenario_name="observed",
        display_name="Observed Data",
        color="#666666",
        notes="Fixture stand-in for observed validation data",
        pinned=True,
    )

    # ── scenarios/ — one working, one deliberately broken ─────────────────
    scenarios_dir = FIXTURES_DIR / "scenarios"
    scenarios_dir.mkdir(parents=True, exist_ok=True)
    (scenarios_dir / "index.json").write_text(
        json.dumps(["good_scenario", "broken_scenario"])
    )

    good_summary = scenarios_dir / "good_scenario" / "summary"
    write_parquet(
        con,
        good_summary / "summary_kpis.parquet",
        SUMMARY_KPIS_COLUMNS,
        SUMMARY_KPIS_ROWS,
    )
    write_parquet(
        con,
        good_summary / "trip_mode_share.parquet",
        TRIP_MODE_SHARE_COLUMNS,
        TRIP_MODE_SHARE_ROWS,
    )
    write_parquet(
        con,
        good_summary / "screenlines.parquet",
        SCREENLINES_COLUMNS,
        SCREENLINES_ROWS,
    )
    write_summary_index(
        good_summary,
        ["summary_kpis.parquet", "trip_mode_share.parquet", "screenlines.parquet"],
    )
    write_manifest(
        scenarios_dir / "good_scenario" / "manifest.yaml",
        scenario_name="good_scenario",
        display_name="Good Fixture Scenario",
        color="#4e79a7",
        notes="Fixture scenario with valid, complete data",
    )

    # broken_scenario: listed in scenarios/index.json but has no
    # summary/index.json at all (folder doesn't even exist) — exercises the
    # fail-soft path in FR-012 / scenario-discovery.md's edge case.
    write_manifest(
        scenarios_dir / "broken_scenario" / "manifest.yaml",
        scenario_name="broken_scenario",
        display_name="Broken Fixture Scenario",
        color="#e15759",
        notes="Fixture scenario with missing summary/index.json, on purpose",
    )

    con.close()
    print(f"Generated fixtures under {FIXTURES_DIR}")


if __name__ == "__main__":
    main()
