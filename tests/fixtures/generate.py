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

# 007-observable-plot-panel: mirrors docs/GRAMMAR.md's own Trip Length
# Frequency Distribution worked example (distance_bin/trips/purpose/mode) —
# reused directly rather than inventing a different shape, same convention
# as SCREENLINES_ROWS above. distance_bin is a small integer bin index
# (1-5), not miles directly — plain enough for both a lineY x-axis and a
# range-type panel-local input's min/max bounds.
def _trip_destination_dist_rows():
    rows = []
    for purpose in ("HBW", "NHB"):
        for mode in ("SOV", "Transit"):
            for distance_bin in range(1, 6):
                # Trip counts decay with distance, offset per purpose/mode
                # so no two series are identical — enough to distinguish
                # lines/facets visually and in assertions, not modeled output.
                base = 200 if purpose == "HBW" else 120
                mode_factor = 1.0 if mode == "SOV" else 0.4
                trips = round(base * mode_factor / distance_bin)
                rows.append((distance_bin, trips, purpose, mode))
    return rows


TRIP_DESTINATION_DIST_ROWS = _trip_destination_dist_rows()
TRIP_DESTINATION_DIST_COLUMNS = ["distance_bin", "trips", "purpose", "mode"]

# 008-sankey-panel: mirrors docs/GRAMMAR.md's own sankey worked example
# (tour_mode/trip_mode/trips, metric name tour_mode_to_trip_mode matching
# its sql_fragments example) — reused directly, same convention as
# SCREENLINES_ROWS/TRIP_DESTINATION_DIST_ROWS above. Deliberately covers,
# in one small hard-coded table (research.md §4/§5, tasks.md T003):
#   - several tour_mode == trip_mode rows ("no mode shift" — the corrected
#     self-loop case; SOV->SOV is the single largest row, so the
#     namespacing correction's real-world stakes are visible in the
#     rendered diagram, not just a unit test)
#   - "Drive to Transit" (a raw mode value containing a space) on both the
#     tour_mode and trip_mode sides across different rows — real-fixture
#     regression coverage for the link-key aggregation bug found and fixed
#     in contracts/sankey-panel.md
#   - one non-positive trips row (Non-Motorized -> SOV, HBW) — the
#     excludedCount/console.warn fixture vehicle
#   - a purpose column (HBW/NHB) varied enough that switching the global
#     Trip Purpose filter visibly changes which rows are included
#   - 5 distinct raw values on each of the tour_mode/trip_mode sides
TOUR_MODE_TO_TRIP_MODE_ROWS = [
    # purpose: HBW
    ("SOV", "SOV", 500, "HBW"),  # largest row — majority "no shift" case
    ("SOV", "HOV", 40, "HBW"),
    ("SOV", "Transit", 15, "HBW"),
    ("HOV", "HOV", 200, "HBW"),
    ("HOV", "SOV", 25, "HBW"),
    ("Transit", "Transit", 150, "HBW"),
    ("Transit", "Drive to Transit", 30, "HBW"),
    ("Drive to Transit", "Drive to Transit", 60, "HBW"),
    ("Non-Motorized", "Non-Motorized", 90, "HBW"),
    ("Non-Motorized", "SOV", -5, "HBW"),  # data-quality anomaly — excluded
    # purpose: NHB
    ("SOV", "SOV", 80, "NHB"),
    ("HOV", "Transit", 10, "NHB"),
    ("Transit", "Transit", 45, "NHB"),
]
TOUR_MODE_TO_TRIP_MODE_COLUMNS = ["tour_mode", "trip_mode", "trips", "purpose"]

# 010-flowmap-panel: mirrors docs/GRAMMAR.md's own corrected flowmap
# worked example (orig_taz/orig_lat/orig_lon/dest_taz/dest_lat/dest_lon/
# trips — the boundaries/boundaries_id keys this grammar originally had
# were removed this session; see that file's own inline correction note)
# — same fixture-design discipline as TOUR_MODE_TO_TRIP_MODE_ROWS above
# (research.md §4/§5, tasks.md T003). Six distinct TAZ locations spread
# around a rough Wasatch Front layout (matches the grammar's own
# [-111.89, 40.76] center example), deliberately covering:
#   - a duplicate (orig_taz, dest_taz) pair — (100, 300) appears twice
#     (120 + 80 trips) — the flowmapData.ts summing-coverage vehicle
#   - one non-positive trips row (400 -> 100, HBW) — the
#     excludedCount/console.warn fixture vehicle, same role as
#     TOUR_MODE_TO_TRIP_MODE_ROWS's own Non-Motorized -> SOV row
#   - one row with a missing origin coordinate (orig_lat: None,
#     TAZ 600 -> 100) — excluded for a different reason than the
#     non-positive row, exercising flowmapData.ts's coordinate-validity
#     check specifically, not just the value<=0 check
#   - a purpose column (HBW/NHB) varied enough that switching the global
#     Trip Purpose filter visibly changes which rows are included —
#     purpose is NOT part of buildFlowmapData's own flow-aggregation key,
#     so an 'all'-purpose query legitimately merges an HBW and an NHB row
#     sharing the same (origin, destination) pair; only the upstream SQL
#     filter narrows this, mirroring 008-sankey-panel's own precedent
OD_FLOWS_ROWS = [
    # purpose: HBW
    (100, 40.76, -111.89, 200, 40.70, -111.85, 500, "HBW"),  # largest flow
    (100, 40.76, -111.89, 300, 40.85, -111.90, 120, "HBW"),  # duplicate pair (1/2)
    (100, 40.76, -111.89, 300, 40.85, -111.90, 80, "HBW"),  # duplicate pair (2/2) -> sums to 200
    (200, 40.70, -111.85, 400, 40.60, -111.75, 60, "HBW"),
    (300, 40.85, -111.90, 500, 40.75, -112.00, 40, "HBW"),
    (400, 40.60, -111.75, 100, 40.76, -111.89, -10, "HBW"),  # non-positive -> excluded
    (500, 40.75, -112.00, 200, 40.70, -111.85, 30, "HBW"),
    (600, None, -111.80, 100, 40.76, -111.89, 25, "HBW"),  # missing orig_lat -> excluded
    # purpose: NHB
    (100, 40.76, -111.89, 200, 40.70, -111.85, 90, "NHB"),
    (300, 40.85, -111.90, 400, 40.60, -111.75, 50, "NHB"),
]
OD_FLOWS_COLUMNS = [
    "orig_taz",
    "orig_lat",
    "orig_lon",
    "dest_taz",
    "dest_lat",
    "dest_lon",
    "trips",
    "purpose",
]


# 013-zonemap-panel: this project's first geometry fixture (research.md
# §5's own explicit decision: synthetic and hand-authored, NOT the real
# WFRC/UGRC TAZ dataset — every fixture in this generator has always been
# tiny and synthetic, and pulling in a real external dataset would be the
# one thing this generator has never had, an external data dependency).
# 8 simple adjacent 0.05-degree-square zones in a 4x2 grid near the
# Wasatch Front (matches every other fixture's own [-111.89, 40.76]-area
# convention, e.g. OD_FLOWS_ROWS above).
def _zone_boundary_rows():
    base_lon, base_lat, cell = -111.95, 40.68, 0.05
    rows = []
    taz_id = 100
    for row in range(2):
        for col in range(4):
            lon0 = base_lon + col * cell
            lon1 = lon0 + cell
            lat0 = base_lat + row * cell
            lat1 = lat0 + cell
            wkt = (
                f"POLYGON(({lon0} {lat0}, {lon1} {lat0}, "
                f"{lon1} {lat1}, {lon0} {lat1}, {lon0} {lat0}))"
            )
            rows.append((taz_id, wkt))
            taz_id += 100
    return rows


ZONE_BOUNDARY_ROWS = _zone_boundary_rows()
ZONE_BOUNDARY_ID_COLUMN = "TAZ_ID"

# vmt_by_home_taz-shaped metric table (matches summarize.yaml's own real
# vmt_by_home_taz metric — docs/GRAMMAR.md's type: zonemap worked
# example) — with one deliberate departure from that real metric's own
# minimal SQL: a synthetic `purpose` column, added ONLY so this fixture
# can exercise filter reactivity (spec.md User Story 2, Acceptance
# Scenario 1) the same way every other panel type's own fixture already
# does — "made up, not modeled output" (SUMMARY_KPIS_ROWS' own precedent
# comment), not a claim this matches the real metric's real SQL. The two
# purpose groups are DISJOINT zone sets (HBW: 100-400, NHB: 500-700+900),
# never two rows for the same taz_id — required so the "one metric row
# per zone" join (FR-003/FR-009) never has to arbitrate between two
# candidate rows for one zone, with or without a purpose filter applied.
#
# taz_id 800 (present in ZONE_BOUNDARY_ROWS above) never appears under
# EITHER purpose — the permanent "zone with no matching metric row"
# no-data case (FR-012). taz_id 900 (present here, absent from
# ZONE_BOUNDARY_ROWS) is the mirror case — a metric row with no matching
# geometry, excluded before rendering (FR-012). Values deliberately span
# zero (made up, matching SCREENLINES_ROWS' own sign-spanning precedent)
# so a diverging color_scale is meaningfully testable: with domain
# [-10, 30], taz 300's value (0.0) is the TRUE diverging midpoint; taz
# 500's value (10.0) sits at the domain's non-zero geometric center — the
# zero-anchored-midpoint regression case (013-zonemap-panel spec.md User
# Story 3, Acceptance Scenario 2).
VMT_BY_HOME_TAZ_ROWS = [
    (100, "HBW", -8.0),
    (200, "HBW", -4.0),
    (300, "HBW", 0.0),
    (400, "HBW", 5.0),
    (500, "NHB", 10.0),
    (600, "NHB", 18.0),
    (700, "NHB", 25.0),
    (900, "NHB", 12.0),  # no matching geometry -> excluded before rendering
]
VMT_BY_HOME_TAZ_COLUMNS = ["taz_id", "purpose", "vmt_per_capita"]

# A second, differently-valued copy of the same metric published under
# `observed` — a flat 5.0 baseline for every zone `good_scenario` also has
# real (non-orphan) data for — the two-scenario `comparison: diff`
# fixture (research.md §7): diff = good_scenario.value - observed.value
# gives a clean, hand-verifiable result per zone (e.g. taz 100:
# -8.0 - 5.0 = -13.0; taz 700: 25.0 - 5.0 = 20.0).
VMT_BY_HOME_TAZ_OBSERVED_ROWS = [(taz_id, 5.0) for taz_id in (100, 200, 300, 400, 500, 600, 700)]
VMT_BY_HOME_TAZ_OBSERVED_COLUMNS = ["taz_id", "vmt_per_capita"]


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


def write_geoparquet(con, dest: Path, id_column: str, rows: list[tuple]) -> None:
    """Writes a tiny synthetic GeoParquet fixture. `rows` is a list of
    (zone_id, wkt_polygon) tuples. Geometry is stored as a WKB BLOB column
    named `geometry`, matching ar-puuk/parquet-viewer's own confirmed
    GeoParquet convention (013-zonemap-panel research.md §3) — read back
    via read_parquet() + ST_GeomFromWKB(), never ST_Read()/
    registerFileBuffer() (research.md §3's own confirmed duckdb-wasm#1791
    finding). Requires the DuckDB spatial extension — INSTALL fetches it
    once from the local cache after the first real run (same one-time
    network dependency this feature's own docs/ARCHITECTURE.md caveat
    documents for the browser side, here on the Python/offline side of
    the post-processor pipeline instead, per docs/SPEC.md's own
    "Convert geometry via DuckDB spatial... or GeoPandas -> GeoParquet"
    step).
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    con.execute("INSTALL spatial; LOAD spatial;")
    values = ", ".join(
        f"({_sql_literal(zone_id)}, ST_AsWKB(ST_GeomFromText({_sql_literal(wkt)})))"
        for zone_id, wkt in rows
    )
    con.execute(f"""
        COPY (SELECT * FROM (VALUES {values}) AS t({id_column}, geometry))
        TO '{dest.as_posix()}' (FORMAT PARQUET)
    """)


def _sql_literal(v):
    # 010-flowmap-panel: OD_FLOWS_ROWS' missing-coordinate row (TAZ 600's
    # orig_lat) is the first fixture row in this generator to need a real
    # NULL literal — every prior fixture table's rows were fully populated.
    # Without this, str(None) renders the Python literal text "None" into
    # the SQL VALUES clause, which is not valid SQL.
    if v is None:
        return "NULL"
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
    for stale in ("observed", "scenarios", "geometry"):
        shutil.rmtree(FIXTURES_DIR / stale, ignore_errors=True)

    # ── geometry/ — 013-zonemap-panel's zone-boundary GeoParquet, shared
    # across scenarios (zone geometry is scenario-independent — the same
    # TAZ boundaries apply regardless of which model run is loaded, spec.md
    # Grammar findings #6/research.md §3) ──────────────────────────────────
    write_geoparquet(
        con,
        FIXTURES_DIR / "geometry" / "taz.geoparquet",
        ZONE_BOUNDARY_ID_COLUMN,
        ZONE_BOUNDARY_ROWS,
    )

    # ── observed/ — always-available, pinned dataset ──────────────────────
    observed_summary = FIXTURES_DIR / "observed" / "summary"
    write_parquet(
        con,
        observed_summary / "summary_kpis.parquet",
        SUMMARY_KPIS_COLUMNS,
        SUMMARY_KPIS_ROWS,
    )
    # 013-zonemap-panel: the `comparison: diff` baseline half (research.md
    # §7) — flat 5.0 per zone, joined against good_scenario's own
    # differently-valued VMT_BY_HOME_TAZ_ROWS below.
    write_parquet(
        con,
        observed_summary / "vmt_by_home_taz.parquet",
        VMT_BY_HOME_TAZ_OBSERVED_COLUMNS,
        VMT_BY_HOME_TAZ_OBSERVED_ROWS,
    )
    write_summary_index(
        observed_summary, ["summary_kpis.parquet", "vmt_by_home_taz.parquet"]
    )
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
    write_parquet(
        con,
        good_summary / "trip_destination_dist.parquet",
        TRIP_DESTINATION_DIST_COLUMNS,
        TRIP_DESTINATION_DIST_ROWS,
    )
    write_parquet(
        con,
        good_summary / "tour_mode_to_trip_mode.parquet",
        TOUR_MODE_TO_TRIP_MODE_COLUMNS,
        TOUR_MODE_TO_TRIP_MODE_ROWS,
    )
    write_parquet(
        con,
        good_summary / "od_flows.parquet",
        OD_FLOWS_COLUMNS,
        OD_FLOWS_ROWS,
    )
    # 013-zonemap-panel: side_by_side path (US1) and the `comparison: diff`
    # non-baseline half (US3, research.md §7).
    write_parquet(
        con,
        good_summary / "vmt_by_home_taz.parquet",
        VMT_BY_HOME_TAZ_COLUMNS,
        VMT_BY_HOME_TAZ_ROWS,
    )
    write_summary_index(
        good_summary,
        [
            "summary_kpis.parquet",
            "trip_mode_share.parquet",
            "screenlines.parquet",
            "trip_destination_dist.parquet",
            "tour_mode_to_trip_mode.parquet",
            "od_flows.parquet",
            "vmt_by_home_taz.parquet",
        ],
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
