"""wftdm-dashboard CLI entry point.

`pyproject.toml`'s `[project.scripts] wftdm-dashboard = "wftdm_dashboard.cli:main"`
points here. `serve`/`here`/`init` (CLAUDE.md's other two documented
subcommands) are NOT built by this feature — `summarize` is the first real
subcommand this CLI gets (025-python-postprocessor). `here` is built by 072-python-local-server (`serve` and
`init` follow in the same feature).
"""

from __future__ import annotations

import sys
from pathlib import Path

import click

from wftdm_dashboard.observed import validate_observed
from wftdm_dashboard.postprocessor.config import parse_summarize_yaml
from wftdm_dashboard.postprocessor.errors import PostprocessorError
from wftdm_dashboard.postprocessor.manifest import generate_manifest, write_manifest
from wftdm_dashboard.postprocessor.pipeline import run_pipeline
from wftdm_dashboard.server import (
    DEFAULT_PORT,
    BundleMissingError,
    PortInUseError,
    bind_server,
    create_app,
    find_site_file,
    is_loopback,
    serve_until_stopped,
)


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


@main.command("validate-observed")
@click.argument("folder", type=click.Path(exists=True, file_okay=False, path_type=Path))
def validate_observed_command(folder: Path) -> None:
    """Check a published observed-data folder (public/observed layout) before it is published.

    Fails (exit 1) listing every problem: a missing source.yaml key, a table whose columns do not match its metric,
    a row backed by fewer observations than the source's suppression.min_cell_n, or a registry entry that points at
    a source or file that does not exist.
    """
    report = validate_observed(folder)
    if report.ok:
        click.echo(f"observed data OK ({report.checked_files} tables checked)")
        return
    for error in report.errors:
        click.echo(error, err=True)
    click.echo(f"{len(report.errors)} problem(s); nothing may be published from this folder.", err=True)
    sys.exit(1)


if __name__ == "__main__":
    main()


@main.command()
@click.argument("folder", default=".", type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option("--port", type=int, default=None, help=f"Port to use (exact). Default: {DEFAULT_PORT}, or the next free one.")
@click.option("--host", default="127.0.0.1", show_default=True, help="Address to listen on (loopback keeps it on this machine).")
@click.option("--no-browser", is_flag=True, default=False, help="Do not open the browser.")
def here(folder: Path, port: int | None, host: str, no_browser: bool) -> None:
    """Serve the dashboard app and FOLDER (a site file, its pages and runs) on localhost."""
    try:
        app = create_app(folder, allow_any_host=not is_loopback(host))
        server = bind_server(app, host, port or DEFAULT_PORT, exact_port=port is not None)
    except BundleMissingError as err:
        raise click.ClickException(str(err)) from err
    except PortInUseError as err:
        raise click.ClickException(str(err)) from err

    shown_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host  # only compared here, never bound
    url = f"http://{shown_host}:{server.server_port}/"
    if find_site_file(folder) is None:
        click.echo(
            f"No dashboard-config.yaml found in {folder}. Create one with: wftdm-dashboard init {folder}",
            err=True,
        )
    if not is_loopback(host):
        click.echo(f"Warning: listening on {host}: the folder is visible to the network.", err=True)
    serve_until_stopped(
        server,
        message=f"Serving {folder} at {url} (Ctrl+C to stop)",
        url=url,
        open_browser=not no_browser,
    )
