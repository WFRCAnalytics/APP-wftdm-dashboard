#!/usr/bin/env python3
"""041-protomaps-pmtiles-basemap (T003): generates
tests/fixtures/protomaps/tiny-test-area.pmtiles — a small, REAL, valid
PMTiles v3 archive, for this feature's own Vitest/Playwright coverage.

NOT a hotlinked Protomaps-hosted URL (research.md R-7 / contracts/
deployer-config.md forbid that as a shipped default; a self-generated,
git-tracked, test-only fixture sidesteps it entirely — it is never wired
into any production/demo dashboard-config).

Deliberately contains exactly ONE tile (z0/x0/y0), and that tile is a
valid-but-EMPTY Mapbox Vector Tile (zero layers -- an empty protobuf
message is itself a valid, if degenerate, vector_tile.Tile). This is
enough for this feature's real test needs:
  - `new PMTiles(url).getHeader()` succeeds against a genuinely valid
    archive -> proves the validation path (data-model.md E-2) accepts a
    real PMTiles file.
  - MapLibre can register the pmtiles:// source and apply a generated
    Protomaps flavor style against it -> the flavor's own `background`
    layer (LIGHT/DARK/WHITE/GRAYSCALE/BLACK each define a different
    `background` color, confirmed via @protomaps/basemaps' real Flavor
    type) paints regardless of whether any tile data exists for the
    current viewport -- background layers are not source-data-driven.
    This is what tests/integration/protomapsBasemap.spec.ts samples to
    prove each flavor renders VISUALLY DISTINCTLY (real canvas pixel
    color per flavor), without needing to hand-author a full, real
    OSM-schema vector tile (roads/water/landuse/etc.) that
    @protomaps/basemaps' generated layers() reference by source-layer
    name -- a genuinely large undertaking out of proportion to what this
    fixture needs to prove.

Uses the real, official Python `pmtiles` package (pypi.org/project/pmtiles)
-- not hand-rolled binary encoding -- so the output is guaranteed to be a
byte-correct PMTiles v3 archive, the same guarantee a real deployer's own
`pmtiles convert`/`pmtiles extract` output carries.

Regenerate with:
    uv run --with pmtiles python scripts/build-protomaps-test-fixture.py
"""
from __future__ import annotations

import gzip
import pathlib

from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import write

OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "protomaps" / "tiny-test-area.pmtiles"

# A small, arbitrary real-world extent (a few blocks of downtown Salt Lake
# City) -- not load-bearing for any test assertion; just a plausible,
# real-looking bounds/center rather than 0,0,0,0.
MIN_LON, MIN_LAT, MAX_LON, MAX_LAT = -111.8933, 40.7561, -111.8833, 40.7661


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with write(str(OUTPUT)) as writer:
        # One real z0/x0/y0 tile, an empty (zero-layer) gzip-compressed
        # MVT -- pmtiles.writer.Writer.finalize() requires at least one
        # tile entry to derive min/max zoom from. See module docstring for
        # why an empty tile is sufficient for this fixture's scoped test
        # purpose (no real feature data needed to prove a flavor's own
        # background layer paints, or that getHeader() succeeds).
        writer.write_tile(zxy_to_tileid(0, 0, 0), gzip.compress(b""))
        header = {
            "tile_type": TileType.MVT,
            "tile_compression": Compression.GZIP,
            "min_zoom": 0,
            "max_zoom": 14,
            "min_lon_e7": int(MIN_LON * 1e7),
            "min_lat_e7": int(MIN_LAT * 1e7),
            "max_lon_e7": int(MAX_LON * 1e7),
            "max_lat_e7": int(MAX_LAT * 1e7),
            "center_zoom": 12,
            "center_lon_e7": int((MIN_LON + MAX_LON) / 2 * 1e7),
            "center_lat_e7": int((MIN_LAT + MAX_LAT) / 2 * 1e7),
        }
        metadata = {
            "name": "041-protomaps-pmtiles-basemap test fixture",
            "description": "PMTiles v3 archive with one empty tile, generated for this feature's own test suite only. Never a production default.",
            "attribution": "N/A -- synthetic test fixture, no real basemap content",
        }
        writer.finalize(header, metadata)
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
