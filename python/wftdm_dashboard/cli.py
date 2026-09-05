"""wftdm-dashboard CLI entry point.

`pyproject.toml`'s `[project.scripts] wftdm-dashboard = "wftdm_dashboard.cli:main"`
points here. `serve`/`here`/`init` (CLAUDE.md's other two documented
subcommands) are NOT built by this feature — `summarize` is the first real
subcommand this CLI gets (025-python-postprocessor).
"""

from __future__ import annotations

import sys
from pathlib import Path

import click

from wftdm_dashboard.postprocessor.config import parse_summarize_yaml
from wftdm_dashboard.postprocessor.errors import PostprocessorError
from wftdm_dashboard.postprocessor.manifest import generate_manifest, write_manifest
from wftdm_dashboard.postprocessor.pipeline import run_pipeline


@click.group()
def main() -> None:
    """WFRC TDM Calibration Dashboard — file server and post-processor CLI."""


@main.command()
@click.option(
    "--input",
    "input_dir",
    required=True,
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    help="Raw ActivitySim output directory (contains the files summarize.yaml's sources: block names).",
)
@click.option(
    "--config",
    "config_path",
    required=True,
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    help="Path to the summarize.yaml to run.",
)
@click.option(
    "--output",
    "output_dir",
    required=True,
    type=click.Path(file_okay=False, path_type=Path),
    help="Destination scenario directory; created if it doesn't exist.",
)
@click.option("--scenario-name", required=True, help="Becomes manifest.yaml's scenario_name.")
@click.option("--display-name", default=None, help="Defaults to --scenario-name.")
@click.option("--run-date", default=None, help="ISO date (YYYY-MM-DD); defaults to today.")
@click.option("--model-version", default=None, help="Omitted from manifest.yaml if not given.")
@click.option("--color", default=None, help="Hex color; auto-assigned from Tableau10 if omitted.")
@click.option("--notes", default=None, help="Omitted from manifest.yaml if not given.")
@click.option("--pinned", is_flag=True, default=False, help="Sets manifest.yaml's pinned: true.")
def summarize(
    input_dir: Path,
    config_path: Path,
    output_dir: Path,
    scenario_name: str,
    display_name: str | None,
    run_date: str | None,
    model_version: str | None,
    color: str | None,
    notes: str | None,
    pinned: bool,
) -> None:
    """Convert raw ActivitySim output into the dashboard's Parquet + manifest.yaml scenario shape."""
    try:
        config = parse_summarize_yaml(config_path)
        written = run_pipeline(config, input_dir, output_dir)
        for path in written:
            click.echo(f"wrote {path}")

        manifest = generate_manifest(
            scenario_name=scenario_name,
            display_name=display_name,
            run_date=run_date,
            model_version=model_version,
            color=color,
            notes=notes,
            pinned=pinned,
        )
        write_manifest(manifest, output_dir)
        click.echo(f"wrote {output_dir / 'manifest.yaml'}")
    except PostprocessorError as exc:
        click.echo(str(exc), err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
