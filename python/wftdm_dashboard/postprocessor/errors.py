"""Exception hierarchy for the summarize pipeline (FR-010).

Each subclass names the specific offending element (a source key, a metric
name, a placeholder reference, a bad bin type) directly in its message —
mirroring services/sqlExpander.ts's own `missing()` helper convention on the
TypeScript side (a small, named error raised with the specific unresolved
reference in its message), adapted to Python's exception model.

`cli.py` catches `PostprocessorError` at the top level and prints a clean,
single-line message instead of a raw traceback; a genuinely unexpected
exception (a real bug, not a config problem) is left to propagate normally.
"""

from __future__ import annotations


class PostprocessorError(Exception):
    """Base class for every expected, attributable pipeline failure."""


class InvalidConfigError(PostprocessorError):
    """summarize.yaml fails to parse, or is missing a required top-level key."""

    def __init__(self, message: str) -> None:
        super().__init__(f"invalid summarize.yaml: {message}")


class SourceNotFoundError(PostprocessorError):
    """A `sources:` entry names a file that doesn't exist on disk."""

    def __init__(self, source_name: str, path: str) -> None:
        self.source_name = source_name
        self.path = path
        super().__init__(f'source "{source_name}": file not found at "{path}"')


class UnresolvedPlaceholderError(PostprocessorError):
    """A metric's SQL references a $mappings/$bins/$sql name that doesn't exist."""

    def __init__(self, metric_name: str, kind: str, reference_name: str) -> None:
        self.metric_name = metric_name
        self.kind = kind
        self.reference_name = reference_name
        super().__init__(
            f'metric "{metric_name}": unresolved ${kind}.{reference_name} '
            f'(no {kind} named "{reference_name}" is defined)'
        )


class UnknownBinTypeError(PostprocessorError):
    """A `bins:` entry's `type:` is outside the four recognized values."""

    def __init__(self, bin_name: str, bad_type: str) -> None:
        self.bin_name = bin_name
        self.bad_type = bad_type
        super().__init__(
            f'bin "{bin_name}": unrecognized type "{bad_type}" '
            "(expected one of: manual_breaks, quantiles, spaced_intervals, "
            "equal_intervals)"
        )


class DuplicateMetricError(PostprocessorError):
    """Two `metrics:` entries share the same `name` (same output filename)."""

    def __init__(self, metric_name: str) -> None:
        self.metric_name = metric_name
        super().__init__(
            f'duplicate metric name "{metric_name}" — each metrics[].name '
            "must be unique (it becomes summary/{name}.parquet)"
        )


class MetricExecutionError(PostprocessorError):
    """A metric's expanded SQL failed to execute against DuckDB."""

    def __init__(self, metric_name: str, cause: Exception) -> None:
        self.metric_name = metric_name
        self.__cause__ = cause
        super().__init__(f'metric "{metric_name}" failed to run: {cause}')
