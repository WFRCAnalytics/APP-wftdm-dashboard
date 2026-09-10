"""Expands $mappings.x / $bins.x / $sql.x placeholders into literal SQL text.

Python-side counterpart to services/sqlExpander.ts's own expandMappings()/
expandBins()/expandSqlFragment() (research.md §4) — an independent
implementation targeting the same SQL shapes, not shared code (a different
language, a different DuckDB binding). Plain string templating only, no
eval()/exec() of any kind (constitution Principle III).
"""

from __future__ import annotations

import re

from wftdm_dashboard.postprocessor.config import (
    Bin,
    EqualIntervalsBin,
    ManualBreaksBin,
    Mapping,
    QuantilesBin,
    SpacedIntervalsBin,
    SqlFragment,
    SummarizeConfig,
)
from wftdm_dashboard.postprocessor.errors import UnknownBinTypeError, UnresolvedPlaceholderError


PLACEHOLDER_RE = re.compile(r"\$(mappings|bins|sql)\.([A-Za-z0-9_]+)")


def expand_mappings(mapping: Mapping) -> str:
    """`$mappings.<name>` -> `WHEN 'raw' THEN 'target'` lines only.

    Deliberately no trailing `ELSE` — confirmed directly against
    services/sqlExpander.ts's real expandMappings() body, which emits none
    either (research.md §4). An author's own surrounding `CASE ... END`
    block supplies its own `ELSE` if it wants one.
    """
    return "\n    ".join(f"WHEN '{raw}' THEN '{target}'" for raw, target in mapping.entries.items())


def _expand_manual_breaks(bin_: ManualBreaksBin) -> str:
    clauses = [
        f"WHEN \"{bin_.column}\" < {bin_.breaks[i + 1]} THEN '{bin_.labels[i]}'"
        for i in range(len(bin_.labels) - 1)
    ]
    last_label = bin_.labels[-1]
    return "CASE\n    " + "\n    ".join(clauses) + f"\n    ELSE '{last_label}'\n  END"


def _expand_quantiles(bin_: QuantilesBin) -> str:
    return f'NTILE({bin_.bins}) OVER (ORDER BY "{bin_.column}")'


def _expand_spaced_intervals(bin_: SpacedIntervalsBin) -> str:
    return (
        f'(FLOOR(("{bin_.column}" - {bin_.lower}) / {bin_.interval}) '
        f"* {bin_.interval} + {bin_.lower})"
    )


def _expand_equal_intervals(bin_: EqualIntervalsBin) -> str:
    min_expr = f'MIN("{bin_.column}") OVER ()'
    max_expr = f'MAX("{bin_.column}") OVER ()'
    bucket_expr = (
        f'LEAST({bin_.n} - 1, FLOOR((("{bin_.column}" - {min_expr}) / '
        f"NULLIF({max_expr} - {min_expr}, 0)) * {bin_.n}))"
    )
    if not bin_.labels:
        return bucket_expr
    clauses = "\n    ".join(f"WHEN {i} THEN '{label}'" for i, label in enumerate(bin_.labels))
    return f"CASE {bucket_expr}\n    {clauses}\n  END"


def expand_bins(bin_: Bin) -> str:
    """`$bins.<name>` -> a CASE/NTILE/FLOOR expression per its `type`.

    Matches the four shapes documented in project-docs/GRAMMAR.md and confirmed
    directly against services/sqlExpander.ts's real expandBins() (research.md
    §4). An `UnknownBin` (a `type:` outside the four recognized values)
    raises a plain ValueError here — User Story 4 (errors.py's
    UnknownBinTypeError) upgrades this to a specific, attributed error;
    this function's own contract is just "expand a *valid* bin correctly."
    """
    if isinstance(bin_, ManualBreaksBin):
        return _expand_manual_breaks(bin_)
    if isinstance(bin_, QuantilesBin):
        return _expand_quantiles(bin_)
    if isinstance(bin_, SpacedIntervalsBin):
        return _expand_spaced_intervals(bin_)
    if isinstance(bin_, EqualIntervalsBin):
        return _expand_equal_intervals(bin_)
    raise ValueError(f"unknown bin type: {bin_.type}")


def expand_sql_fragment(fragment: SqlFragment) -> str:
    """`$sql.<name>` -> the fragment's literal text, substituted verbatim."""
    return fragment.text


def expand(sql: str, config: SummarizeConfig, metric_name: str) -> str:
    """Resolves every `$mappings.x`/`$bins.x`/`$sql.x` placeholder in `sql`.

    `metric_name` attributes an error to the right metric (FR-010, User
    Story 4): an undefined `$mappings`/`$bins`/`$sql` reference raises
    `UnresolvedPlaceholderError` naming this metric and the specific
    reference, instead of a bare `KeyError`; a `$bins.<name>` reference to a
    bin whose own `type:` isn't recognized raises `UnknownBinTypeError`
    naming that bin and its bad type, instead of `expand_bins()`'s own
    generic `ValueError`.
    """

    def _replace(match: re.Match[str]) -> str:
        kind, name = match.group(1), match.group(2)
        if kind == "mappings":
            mapping = config.mappings.get(name)
            if mapping is None:
                raise UnresolvedPlaceholderError(metric_name, kind, name)
            return expand_mappings(mapping)
        if kind == "bins":
            bin_ = config.bins.get(name)
            if bin_ is None:
                raise UnresolvedPlaceholderError(metric_name, kind, name)
            try:
                return expand_bins(bin_)
            except ValueError:
                raise UnknownBinTypeError(name, bin_.type) from None
        if kind == "sql":
            fragment = config.sql_fragments.get(name)
            if fragment is None:
                raise UnresolvedPlaceholderError(metric_name, kind, name)
            return expand_sql_fragment(fragment)
        return match.group(0)  # pragma: no cover - regex only matches known kinds

    return PLACEHOLDER_RE.sub(_replace, sql)
