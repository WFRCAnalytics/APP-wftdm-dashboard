"""One-time, offline geometry-sourcing script — 031-all-panel-demo-content.

Fetches real TAZ 1-25 polygon geometry directly from MTC's own public,
official open-data FeatureServer (confirmed reachable and correspondence-
verified against real land_use.csv SD/SUPERD values and real-world
geography during this feature's own planning research — see
specs/031-all-panel-demo-content/research.md §1). Produces two real,
derived artifacts from that ONE real geometry pull:

  1. public/demo-geometry/taz25.geoparquet — real TAZ boundary polygons,
     WKB-encoded (matching src/panels/zoneGeometry.ts's existing
     ST_GeomFromWKB() read contract exactly — tests/fixtures/generate.py's
     own write_geoparquet() established this same WKB convention).
  2. A printed, ready-to-paste `sql_fragments.zone_centroids` YAML block
     for summarize.yaml — each zone's centroid, computed via ST_Centroid()
     from the SAME real polygon (never independently sourced or
     approximated — data-model.md §1).

Run once, manually, by a developer:

    uv run python scripts/build-demo-zone-geometry.py

Deliberately NOT part of the wftdm-dashboard CLI or the postprocessor
package (research.md §2) — this step is scenario-independent and needs
to run at most once for this fixed 25-zone system, not per scenario run.

Deliberately prints the centroid block rather than writing it into
summarize.yaml directly — that file stays fully human-authored/reviewed,
matching every other real metric already in it (research.md §2).

Fails loudly (non-zero exit) on any fetch failure or a feature count
other than 25 — never falls back to partial or placeholder geometry
(this feature's own non-negotiable FR-001, applied to this specific tool).
"""

from __future__ import annotations

import json
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb

# The real, official MTC open-data FeatureServer — confirmed directly this
# session (specs/031-all-panel-demo-content/research.md §1): public access,
# no redistribution restriction stated (a liability/accuracy disclaimer
# only), and the same source ActivitySim's own BSD-3-Clause example
# package already redistributes attribute data derived from.
FEATURE_SERVER_URL = (
    "https://services3.arcgis.com/i2dkYWmb4wHvYPda/arcgis/rest/services/"
    "Travel_Analysis_Zones/FeatureServer/0/query"
)
ZONE_IDS = list(range(1, 26))  # prototype_mtc's real, unmodified TAZ 1-25
EXPECTED_FEATURE_COUNT = 25

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_GEOPARQUET = REPO_ROOT / "public" / "demo-geometry" / "taz25.geoparquet"

# Ground truth this session already directly confirmed via the live
# FeatureServer (spec.md's own Research Findings) — a cheap regression
# check against already-established real values, not a guess.
KNOWN_CENTROIDS = {
    1: (37.792, -122.398),
    6: (37.788, -122.412),
    16: (37.789, -122.390),
    25: (37.796, -122.407),
}
KNOWN_CENTROID_TOLERANCE_DEGREES = 0.01  # ~1km — generous enough to absorb
# ST_Centroid()'s own polygon-centroid vs. this session's earlier rough
# ad hoc coordinate-averaging estimate, while still catching any real
# gross mismatch (wrong zone, wrong projection, corrupted fetch).


def fetch_real_geojson() -> dict:
    """Fetches real TAZ 1-25 geometry from MTC's live FeatureServer.

    Raises on any network/HTTP failure — no fallback, per this script's
    own module docstring.
    """
    where_clause = f"TAZ1454 IN ({','.join(str(z) for z in ZONE_IDS)})"
    query = urllib.parse.urlencode(
        {
            "where": where_clause,
            "outFields": "TAZ1454,SUPERD",
            "outSR": "4326",
            "f": "geojson",
        }
    )
    url = f"{FEATURE_SERVER_URL}?{query}"
    print(f"Fetching real geometry from MTC's FeatureServer:\n  {url}\n")
    try:
        with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310
            payload = json.loads(response.read())
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"FATAL: could not reach MTC's real FeatureServer ({exc}). "
            "Not falling back to placeholder geometry — re-run once reachable."
        ) from exc

    features = payload.get("features", [])
    if len(features) != EXPECTED_FEATURE_COUNT:
        raise SystemExit(
            f"FATAL: expected exactly {EXPECTED_FEATURE_COUNT} real features "
            f"(TAZ 1-25), got {len(features)}. Not proceeding with a "
            "partial/unexpected result — inspect the query/response directly."
        )
    return payload


def build_geoparquet(geojson: dict, conn: duckdb.DuckDBPyConnection) -> None:
    """Writes the real boundary polygons to OUTPUT_GEOPARQUET as WKB.

    Reads via DuckDB spatial's ST_Read() against a real temp file — native
    DuckDB (not WASM), so duckdb-wasm#1791's registerFileBuffer()-specific
    bug (which is why the BROWSER-side loader avoids ST_Read()) doesn't
    apply here; this is the natural, direct way to read a real GeoJSON
    document offline.
    """
    OUTPUT_GEOPARQUET.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".geojson", delete=False, encoding="utf-8"
    ) as tmp:
        json.dump(geojson, tmp)
        tmp_path = tmp.name

    try:
        conn.execute(
            f"""
            COPY (
                SELECT
                    TAZ1454,
                    ST_AsWKB(geom) AS geometry
                FROM ST_Read('{tmp_path}')
                ORDER BY TAZ1454
            ) TO '{OUTPUT_GEOPARQUET.as_posix()}' (FORMAT PARQUET)
            """
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    print(f"Wrote real boundary geometry: {OUTPUT_GEOPARQUET}")


def compute_and_print_centroids(conn: duckdb.DuckDBPyConnection) -> dict[int, tuple[float, float]]:
    """Derives each zone's centroid from the SAME real polygon just written
    (never independently sourced — data-model.md §1) and prints the
    ready-to-paste summarize.yaml sql_fragments.zone_centroids block.
    """
    rows = conn.execute(
        f"""
        SELECT
            TAZ1454 AS zone_id,
            ST_Y(ST_Centroid(ST_GeomFromWKB(geometry))) AS lat,
            ST_X(ST_Centroid(ST_GeomFromWKB(geometry))) AS lon
        FROM read_parquet('{OUTPUT_GEOPARQUET.as_posix()}')
        ORDER BY zone_id
        """
    ).fetchall()

    centroids = {int(zone_id): (float(lat), float(lon)) for zone_id, lat, lon in rows}

    print("\n" + "=" * 78)
    print("Paste the block below into summarize.yaml's sql_fragments.zone_centroids")
    print("=" * 78 + "\n")
    print("  zone_centroids: |")
    print("    # Real TAZ 1-25 centroids, derived (ST_Centroid) from real MTC")
    print("    # TAZ1454 boundary geometry — see scripts/build-demo-zone-geometry.py")
    print("    # and specs/031-all-panel-demo-content/research.md §1 for the exact")
    print("    # source query and provenance.")
    print("    (VALUES")
    lines = [f"      ({zid}, {lat:.6f}, {lon:.6f})" for zid, (lat, lon) in sorted(centroids.items())]
    print(",\n".join(lines))
    print("    ) AS zc(zone_id, lat, lon)")
    print()

    return centroids


def verify_against_known_ground_truth(centroids: dict[int, tuple[float, float]]) -> None:
    """Cheap regression check against this session's own already-recorded,
    manually-verified centroid values (contracts/geometry-pipeline.md's
    verification requirement) — run before trusting the rest of the output.
    """
    print("Verifying against already-recorded ground truth (TAZ 1/6/16/25)...")
    mismatches = []
    for zone_id, (known_lat, known_lon) in KNOWN_CENTROIDS.items():
        actual_lat, actual_lon = centroids[zone_id]
        lat_delta = abs(actual_lat - known_lat)
        lon_delta = abs(actual_lon - known_lon)
        if lat_delta > KNOWN_CENTROID_TOLERANCE_DEGREES or lon_delta > KNOWN_CENTROID_TOLERANCE_DEGREES:
            mismatches.append(
                f"  TAZ {zone_id}: expected ~({known_lat}, {known_lon}), "
                f"got ({actual_lat:.4f}, {actual_lon:.4f})"
            )
    if mismatches:
        print("\n".join(mismatches), file=sys.stderr)
        raise SystemExit(
            "FATAL: one or more centroids don't match already-recorded ground "
            "truth — STOP, do not trust this output. Investigate before "
            "pasting anything into summarize.yaml."
        )
    print("OK — all four sampled zones match already-recorded ground truth.\n")


def main() -> None:
    geojson = fetch_real_geojson()

    conn = duckdb.connect()
    conn.execute("INSTALL spatial")
    conn.execute("LOAD spatial")

    build_geoparquet(geojson, conn)
    centroids = compute_and_print_centroids(conn)
    verify_against_known_ground_truth(centroids)

    conn.close()
    print("Done. Review the printed block above, then paste it into summarize.yaml.")


if __name__ == "__main__":
    main()
