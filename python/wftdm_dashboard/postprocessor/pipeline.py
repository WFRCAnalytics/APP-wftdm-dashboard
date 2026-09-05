"""Orchestrates one summarize.yaml run: load sources, run metrics, write Parquet.

The single stateless pass this whole feature exists to perform — see
data-model.md's "Relationships" diagram for the full data flow from
`SummarizeConfig` + raw files to a `ScenarioOutput`.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import duckdb

from wftdm_dashboard.postprocessor.config import SummarizeConfig
from wftdm_dashboard.postprocessor.errors import MetricExecutionError
from wftdm_dashboard.postprocessor.expand import expand
from wftdm_dashboard.postprocessor.sources import ensure_source_exists, load_source


def run_pipeline(config: SummarizeConfig, input_dir: Path, output_dir: Path) -> list[Path]:
    """Runs every metric in `config` and writes one Parquet file each.

    `{output_dir}/summary/` is deleted and recreated before anything is
    written (research.md §8) — re-running this function against the same
    `output_dir` always leaves `summary/` containing exactly the current
    config's metrics, never a file left over from a metric since renamed or
    removed (FR-011).

    Returns the list of written Parquet file paths, in `config.metrics`'s
    own declared order.
    """
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    summary_dir = output_dir / "summary"

    # Every declared source is validated as a batch, up front, before any
    # source is loaded or any metric SQL runs (FR-010, User Story 4) — not
    # discovered lazily one metric at a time, and before summary/ is even
    # touched, so a config error never leaves a half-replaced output
    # directory behind.
    for source in config.sources.values():
        ensure_source_exists(source, input_dir)

    if summary_dir.exists():
        shutil.rmtree(summary_dir)
    summary_dir.mkdir(parents=True)

    conn = duckdb.connect()
    try:
        for source in config.sources.values():
            load_source(conn, source, input_dir)

        written: list[Path] = []
        for metric in config.metrics:
            expanded_sql = expand(metric.sql, config, metric_name=metric.name)
            output_path = summary_dir / f"{metric.name}.parquet"
            try:
                conn.execute(
                    f"COPY ({expanded_sql}) TO '{output_path.as_posix()}' (FORMAT PARQUET)"
                )
            except duckdb.Error as exc:
                raise MetricExecutionError(metric.name, exc) from exc
            written.append(output_path)

        return written
    finally:
        conn.close()
