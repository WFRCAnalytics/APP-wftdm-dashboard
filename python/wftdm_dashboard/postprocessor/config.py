"""Parses summarize.yaml into typed structures.

Grammar matches project-docs/GRAMMAR.md's already-documented `summarize.yaml`
section exactly (sources/mappings/bins/sql_fragments/metrics) — this module
introduces no new YAML key or file type (constitution Principle VII).

Validation performed here is purely structural (sources/metrics present and
non-empty, metric names unique) — cross-referential validation (does every
$mappings.x/$bins.x/$sql.x reference in a metric's SQL actually resolve to
something declared here?) is deliberately deferred to expand.py, which only
resolves a placeholder when a metric's SQL actually contains it — mirroring
services/sqlExpander.ts's own lazy-resolution convention on the TypeScript
side (data-model.md's Bin validation rule).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from wftdm_dashboard.postprocessor.errors import DuplicateMetricError, InvalidConfigError


@dataclass(frozen=True)
class Source:
    """One `sources:` entry — a name -> relative file path pair."""

    name: str
    path: str


@dataclass(frozen=True)
class Mapping:
    """One `mappings:` entry — a named raw-value -> display-value table."""

    name: str
    entries: dict[str, str]


@dataclass(frozen=True)
class ManualBreaksBin:
    type: str
    column: str
    breaks: list[float]
    labels: list[str]


@dataclass(frozen=True)
class QuantilesBin:
    type: str
    column: str
    bins: int = 4


@dataclass(frozen=True)
class SpacedIntervalsBin:
    type: str
    column: str
    interval: float
    lower: float = 0


@dataclass(frozen=True)
class EqualIntervalsBin:
    type: str
    column: str
    n: int = 4
    labels: list[str] | None = None


@dataclass(frozen=True)
class UnknownBin:
    """A `bins:` entry whose `type:` isn't one of the four recognized values.

    Parsing never fails on this by itself (data-model.md's deferred-
    validation rule) — errors.UnknownBinTypeError is only raised later, in
    expand.py, if some metric's SQL actually references this bin via
    `$bins.<name>`. A bin nobody references is never an error at all.
    """

    type: str
    raw: dict[str, Any]


Bin = ManualBreaksBin | QuantilesBin | SpacedIntervalsBin | EqualIntervalsBin | UnknownBin


@dataclass(frozen=True)
class SqlFragment:
    """One `sql_fragments:` entry — a named, reusable SQL text snippet."""

    name: str
    text: str


@dataclass(frozen=True)
class Metric:
    """One `metrics:` entry — becomes exactly one output Parquet file."""

    name: str
    description: str | None
    sql: str


@dataclass(frozen=True)
class SummarizeConfig:
    """The parsed, in-memory form of one summarize.yaml file."""

    version: int
    sources: dict[str, Source]
    mappings: dict[str, Mapping]
    bins: dict[str, Bin]
    sql_fragments: dict[str, SqlFragment]
    metrics: list[Metric]


def _parse_bin(name: str, raw: dict[str, Any]) -> Bin:
    bin_type = raw.get("type")
    if bin_type == "manual_breaks":
        return ManualBreaksBin(
            type=bin_type,
            column=raw["column"],
            breaks=list(raw["breaks"]),
            labels=list(raw["labels"]),
        )
    if bin_type == "quantiles":
        return QuantilesBin(type=bin_type, column=raw["column"], bins=raw.get("bins", 4))
    if bin_type == "spaced_intervals":
        return SpacedIntervalsBin(
            type=bin_type,
            column=raw["column"],
            interval=raw["interval"],
            lower=raw.get("lower", 0),
        )
    if bin_type == "equal_intervals":
        return EqualIntervalsBin(
            type=bin_type,
            column=raw["column"],
            n=raw.get("n", 4),
            labels=list(raw["labels"]) if raw.get("labels") is not None else None,
        )
    # Deliberately not an error here — see UnknownBin's own docstring.
    return UnknownBin(type=str(bin_type), raw=raw)


def parse_summarize_dict(raw: dict[str, Any]) -> SummarizeConfig:
    """Builds a SummarizeConfig from an already-loaded YAML dict.

    Split out from parse_summarize_yaml() so tests can build a config from
    an in-memory dict without needing a real file on disk.
    """
    if not isinstance(raw, dict):
        raise InvalidConfigError("top-level document must be a mapping")

    sources_raw = raw.get("sources")
    if not sources_raw:
        raise InvalidConfigError("missing or empty required top-level key 'sources'")

    metrics_raw = raw.get("metrics")
    if not metrics_raw:
        raise InvalidConfigError("missing or empty required top-level key 'metrics'")

    sources = {name: Source(name=name, path=path) for name, path in sources_raw.items()}

    mappings = {
        name: Mapping(name=name, entries=dict(entries))
        for name, entries in (raw.get("mappings") or {}).items()
    }

    bins = {name: _parse_bin(name, bin_raw) for name, bin_raw in (raw.get("bins") or {}).items()}

    sql_fragments = {
        name: SqlFragment(name=name, text=text)
        for name, text in (raw.get("sql_fragments") or {}).items()
    }

    seen_names: set[str] = set()
    metrics: list[Metric] = []
    for entry in metrics_raw:
        name = entry["name"]
        if name in seen_names:
            raise DuplicateMetricError(name)
        seen_names.add(name)
        metrics.append(Metric(name=name, description=entry.get("description"), sql=entry["sql"]))

    return SummarizeConfig(
        version=raw.get("version", 1),
        sources=sources,
        mappings=mappings,
        bins=bins,
        sql_fragments=sql_fragments,
        metrics=metrics,
    )


def parse_summarize_yaml(path: Path) -> SummarizeConfig:
    """Reads and parses a summarize.yaml file from disk."""
    try:
        raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise InvalidConfigError(f"failed to parse YAML: {exc}") from exc
    return parse_summarize_dict(raw)
