"""Validation of published observed-data folders (project-docs/redesign/06-data-and-config.md section 6.5).

Observed tables are aggregates published next to the dashboard (``public/observed``). This module checks the folder
before anything is published: every source has its provenance, every table has the columns of the model metric it is
compared with, no row is backed by fewer observations than the source's suppression threshold, and the registry
(``index.json``) only names sources and files that exist. It never modifies the folder.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import duckdb
import yaml

# Columns each known observed metric must have (the model metric's own columns), and the optional extras.
KNOWN_METRICS: dict[str, set[str]] = {
    "summary_kpis": set(),  # any subset of the model's KPI columns; checked for non-emptiness only
    "trip_mode_share": {"major_trip_mode", "share"},
    "trip_mode_share_by_purpose": {"primary_purpose", "major_trip_mode", "share"},
    "trip_mode_share_by_income": {"income_group", "major_trip_mode", "share"},
    "transit_boardings": {"line", "boardings"},
    "population_age_sex": {"age_band", "sex", "persons"},
    "trip_length_frequency": {"primary_purpose", "distance_bin_miles", "trips"},
    "auto_ownership_summary": {"auto_ownership", "income_group", "households"},
    "speed_by_facility_hour": {"facility_type", "hour", "avg_speed_mph"},
    "vmt_county_facility": {"county", "facility_type", "vmt"},
}
UNCERTAINTY_COLUMNS = {"moe", "lo", "hi", "n"}
REQUIRED_SOURCE_KEYS = ("id", "label", "vintage", "sample")


@dataclass
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    checked_files: int = 0

    @property
    def ok(self) -> bool:
        return not self.errors


def _load_yaml(path: Path, report: ValidationReport) -> dict[str, Any] | None:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        report.errors.append(f"{path}: cannot read ({exc})")
        return None
    if not isinstance(data, dict):
        report.errors.append(f"{path}: expected a mapping at the top level")
        return None
    return data


def _min_cell_n(source: dict[str, Any]) -> int | None:
    suppression = source.get("suppression")
    if isinstance(suppression, dict) and isinstance(suppression.get("min_cell_n"), int):
        return suppression["min_cell_n"]
    return None


def _check_table(path: Path, source: dict[str, Any], report: ValidationReport) -> None:
    metric = path.stem
    report.checked_files += 1
    if metric not in KNOWN_METRICS:
        report.errors.append(f"{path}: '{metric}' is not a known metric (known: {', '.join(sorted(KNOWN_METRICS))})")
        return
    con = duckdb.connect()
    try:
        cols_rel = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [str(path)]).fetchall()
        columns = {row[0] for row in cols_rel}
        required = KNOWN_METRICS[metric]
        missing = required - columns
        if missing:
            report.errors.append(f"{path}: missing columns {sorted(missing)} for metric '{metric}'")
        extra = columns - required - UNCERTAINTY_COLUMNS
        if required and extra:
            report.errors.append(f"{path}: unexpected columns {sorted(extra)} (allowed extras: moe, lo, hi, n)")
        threshold = _min_cell_n(source)
        if "n" in columns and threshold is not None:
            bad = con.execute(
                "SELECT * FROM read_parquet(?) WHERE n < ? LIMIT 10", [str(path), threshold]
            ).fetchall()
            if bad:
                names = [c[0] for c in cols_rel]
                shown = "; ".join(str(dict(zip(names, row, strict=True))) for row in bad)
                report.errors.append(
                    f"{path}: rows below the suppression threshold n >= {threshold} (first {len(bad)}): {shown}"
                )
        elif threshold is not None and "n" not in columns and required:
            report.errors.append(f"{path}: source declares min_cell_n={threshold} but the table has no 'n' column")
    except duckdb.Error as exc:
        report.errors.append(f"{path}: cannot read Parquet ({exc})")
    finally:
        con.close()


def validate_observed(folder: Path) -> ValidationReport:
    """Validates ``folder`` (the ``public/observed`` layout). Returns every problem found, never raises for data errors."""
    report = ValidationReport()
    index_path = folder / "index.json"
    if not index_path.is_file():
        report.errors.append(f"{index_path}: missing registry index.json")
        return report
    try:
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        report.errors.append(f"{index_path}: invalid JSON ({exc})")
        return report

    declared = {s.get("id"): s for s in index.get("sources", []) if isinstance(s, dict)}
    for source_id in declared:
        if not isinstance(source_id, str) or not (folder / source_id).is_dir():
            report.errors.append(f"{index_path}: source '{source_id}' has no folder")

    sources: dict[str, dict[str, Any]] = {}
    for source_id in declared:
        sdir = folder / str(source_id)
        if not sdir.is_dir():
            continue
        ypath = sdir / "source.yaml"
        if not ypath.is_file():
            report.errors.append(f"{ypath}: missing source.yaml")
            continue
        meta = _load_yaml(ypath, report)
        if meta is None:
            continue
        for key in REQUIRED_SOURCE_KEYS:
            if key not in meta or meta[key] in (None, ""):
                report.errors.append(f"{ypath}: missing required key '{key}'")
        if meta.get("id") != source_id:
            report.errors.append(f"{ypath}: id '{meta.get('id')}' does not match its folder '{source_id}'")
        sources[str(source_id)] = meta
        for table in sorted(sdir.glob("*.parquet")):
            _check_table(table, meta, report)

    for metric, source_id in (index.get("metrics") or {}).items():
        table_name = str(metric).split(".")[0]
        if source_id not in sources:
            report.errors.append(f"{index_path}: metric '{metric}' names unknown source '{source_id}'")
        elif not (folder / str(source_id) / f"{table_name}.parquet").is_file():
            report.errors.append(f"{index_path}: metric '{metric}' names {source_id}/{table_name}.parquet, which does not exist")
    return report
