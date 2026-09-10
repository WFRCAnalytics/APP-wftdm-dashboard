"""Generates manifest.yaml — the per-scenario metadata project-docs/GRAMMAR.md
already documents (constitution Principle VII: an existing config file
type, not a new one this feature introduces).
"""

from __future__ import annotations

import datetime as _datetime
import hashlib
from dataclasses import dataclass
from pathlib import Path

import yaml


# The standard "Tableau 10" categorical palette — confirmed against
# project-docs/GRAMMAR.md's own worked manifest.yaml example, whose `color:
# "#4e79a7"` is exactly this palette's first entry (research.md §5).
TABLEAU10 = (
    "#4E79A7",
    "#F28E2B",
    "#E15759",
    "#76B7B2",
    "#59A14F",
    "#EDC948",
    "#B07AA1",
    "#FF9DA7",
    "#9C755F",
    "#BAB0AC",
)


def _auto_color(scenario_name: str) -> str:
    """Deterministic per scenario_name — the same name always gets the same
    color, and no cross-scenario coordination is needed (research.md §5).

    Uses `hashlib.sha256`, not Python's builtin `hash()` — a real bug caught
    before shipping: `hash()` on a `str` is randomized per-process
    (`PYTHONHASHSEED`, on by default since Python 3.3) specifically so it is
    *not* stable across runs, which would silently break the "same scenario
    re-run twice gets the same color" guarantee this function exists to
    provide. `sha256` is stable across processes, interpreters, and
    machines.
    """
    digest = hashlib.sha256(scenario_name.encode("utf-8")).hexdigest()
    return TABLEAU10[int(digest, 16) % len(TABLEAU10)]


@dataclass(frozen=True)
class Manifest:
    scenario_name: str
    display_name: str
    engine: str
    run_date: str
    color: str
    pinned: bool
    model_version: str | None = None
    notes: str | None = None


def generate_manifest(
    scenario_name: str,
    display_name: str | None = None,
    run_date: str | None = None,
    model_version: str | None = None,
    color: str | None = None,
    notes: str | None = None,
    pinned: bool = False,
) -> Manifest:
    """Builds a Manifest, applying every documented default (data-model.md)."""
    return Manifest(
        scenario_name=scenario_name,
        display_name=display_name or scenario_name,
        engine="activitysim",
        run_date=run_date or _datetime.date.today().isoformat(),
        color=color or _auto_color(scenario_name),
        pinned=pinned,
        model_version=model_version,
        notes=notes,
    )


def write_manifest(manifest: Manifest, output_dir: Path) -> Path:
    """Writes `manifest.yaml` to `{output_dir}/manifest.yaml`.

    `model_version`/`notes` are omitted from the written YAML entirely when
    `None` — data-model.md's own documented default ("omitted... if not
    supplied"), not written as a literal `null`.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    data: dict[str, object] = {
        "scenario_name": manifest.scenario_name,
        "display_name": manifest.display_name,
        "engine": manifest.engine,
        "run_date": manifest.run_date,
        "color": manifest.color,
        "pinned": manifest.pinned,
    }
    if manifest.model_version is not None:
        data["model_version"] = manifest.model_version
    if manifest.notes is not None:
        data["notes"] = manifest.notes

    manifest_path = output_dir / "manifest.yaml"
    manifest_path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    return manifest_path
