"""Loads one `sources:` entry into DuckDB as a queryable view.

Mirrors services/duckdb.ts's own createViewOverParquet() pattern (research.md
§3) — wrap a raw file in `CREATE OR REPLACE VIEW` so it's queryable by name.
Unlike the browser side, this pipeline processes exactly one scenario's raw
data per run in its own fresh connection, so a source is registered
*unprefixed* — a source named `trips` becomes a view literally named
`trips`, matching every real metric SQL in project-docs/GRAMMAR.md, which already
references sources this way (`FROM trips t`).
"""

from __future__ import annotations

from pathlib import Path

import duckdb

from wftdm_dashboard.postprocessor.config import Source
from wftdm_dashboard.postprocessor.errors import SourceNotFoundError


_PARQUET_EXTENSIONS = {".parquet", ".geoparquet"}


def ensure_source_exists(source: Source, input_dir: Path) -> Path:
    """Raises SourceNotFoundError if `source`'s file doesn't exist.

    Returns the resolved path on success. Called by pipeline.py for every
    declared source, as a batch, before any source is loaded or any metric
    SQL runs (FR-010, User Story 4) — not inside load_source() itself, so a
    caller that only wants "load this one source" (e.g. a future
    interactive tool) isn't forced through the same all-or-nothing
    pre-flight ordering `run_pipeline()` needs.
    """
    resolved_path = Path(input_dir) / source.path
    if not resolved_path.is_file():
        raise SourceNotFoundError(source.name, str(resolved_path))
    return resolved_path


def load_source(conn: duckdb.DuckDBPyConnection, source: Source, input_dir: Path) -> Path:
    """Registers `source` as a view named `source.name`, chosen by extension.

    Returns the resolved absolute path that was loaded. Does not itself
    check that the file exists — callers that need that guarantee call
    ensure_source_exists() first (as run_pipeline() does).
    """
    resolved_path = Path(input_dir) / source.path
    extension = resolved_path.suffix.lower()

    if extension in _PARQUET_EXTENSIONS:
        read_expr = f"read_parquet('{resolved_path.as_posix()}')"
    else:
        # Every other extension (.csv being the common case) goes through
        # DuckDB's own auto-detecting CSV reader — generic by design
        # (FR-002): this module never special-cases a real source name.
        read_expr = f"read_csv_auto('{resolved_path.as_posix()}')"

    conn.execute(f'CREATE OR REPLACE VIEW "{source.name}" AS SELECT * FROM {read_expr}')
    return resolved_path
