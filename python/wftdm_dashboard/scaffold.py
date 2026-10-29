"""Starter files for ``wftdm-dashboard init`` (072-python-local-server).

The site file is generated from the JSON Schema the app's own settings table renders (``npm run docs:config`` writes a
copy into ``templates/``), so the starter lists every setting of the version that wrote it and never goes stale. No
dashboard logic lives here (constitution Principle X): this only writes text, and never over an existing file.

Format of the generated site file. After the live ``version`` and ``pages`` lines, every other setting appears as a
commented key. A description line starts with ``## `` and a key line with ``# ``, so removing the ``## `` lines and one
``# `` from each remaining line gives valid YAML of the whole tree (the tests do exactly that).
"""

from __future__ import annotations

import json
import textwrap
from importlib import resources
from pathlib import Path
from typing import Any


SCHEMA_URL = (
    "https://raw.githubusercontent.com/WFRCAnalytics/APP-wftdm-dashboard/main/project-docs/dashboard-config.schema.json"
)
SITE_FILE = "dashboard-config.yaml"
PAGE_FILE = "dashboard-1-overview.yaml"
LIVE_KEYS = ("version", "pages")  # written as real settings, not as comments
WRAP = 96

PAGE_TEXT = """\
# The starter page. Add panels under `layout:`; each row is a list of panels. See the configuration reference.
header:
  tab: Overview
  title: Overview

layout:
  row_welcome:
    - type: markdown
      title: Welcome
      content: |
        ## Your dashboard is running

        This page was written by `wftdm-dashboard init`. Edit this file (it is in the same folder as
        `dashboard-config.yaml`) and reload the page to see the change.

        - Put each scenario run in a `scenarios/<run>/` folder (a `summary/` folder of Parquet files and a `manifest.yaml`).
        - List more pages under `pages:` in `dashboard-config.yaml`.
        - Every setting you can add to `dashboard-config.yaml` is listed, commented out, in that file.
"""


def load_schema() -> dict[str, Any]:
    """The packaged JSON Schema of the site file."""
    text = resources.files("wftdm_dashboard").joinpath("templates", "dashboard-config.schema.json").read_text(encoding="utf-8")
    return json.loads(text)


def _example(node: dict[str, Any]) -> str:
    """A value that suggests the shape of a setting, so the commented line is valid YAML once uncommented."""
    if "enum" in node:
        return str(node["enum"][0])
    kind = node.get("type")
    if not isinstance(kind, str):  # a setting that takes more than one type: no suggested value
        return ""
    return {"string": '""', "integer": "0", "number": "0", "boolean": "true", "array": "[]", "object": "{}"}.get(kind, "")


def _describe(node: dict[str, Any]) -> str:
    text = str(node.get("description", "")).strip()
    if "enum" in node:
        text = f"{text} One of: {', '.join(str(v) for v in node['enum'])}.".strip()
    return text


def _comment_lines(properties: dict[str, Any], indent: int, skip: tuple[str, ...] = ()) -> list[str]:
    lines: list[str] = []
    pad = "  " * indent
    for key, node in properties.items():
        if key in skip:
            continue
        inner = node.get("properties")
        description = _describe(node)
        if description:
            lines.extend(f"## {pad}{part}" for part in textwrap.wrap(description, WRAP - len(pad)))
        if isinstance(inner, dict) and inner:
            lines.append(f"# {pad}{key}:")
            lines.extend(_comment_lines(inner, indent + 1))
        else:
            value = _example(node)
            lines.append(f"# {pad}{key}: {value}".rstrip())
    return lines


def starter_site_yaml(schema: dict[str, Any]) -> str:
    """The starter ``dashboard-config.yaml``: the schema line, ``version`` and ``pages``, then every other setting as comments."""
    header = [
        f"# yaml-language-server: $schema={SCHEMA_URL}",
        "# Site settings for this dashboard (written by `wftdm-dashboard init`). Every setting is optional: what is not set",
        "# here has a neutral default. Below, every available setting is listed, commented out, with what it does.",
        "# To use one, remove the leading '# ' of its line (and of its parent keys), then set its value.",
        "",
        "version: 1",
        "",
        "# The page files, in order; the first is the landing page.",
        "pages:",
        f"  - {PAGE_FILE}",
        "",
        "# ---- available settings ----",
        "",
    ]
    body = _comment_lines(schema.get("properties", {}), 0, skip=LIVE_KEYS)
    return "\n".join([*header, *body, ""])


def starter_page_yaml() -> str:
    return PAGE_TEXT


def write_missing(folder: Path, schema: dict[str, Any] | None = None) -> list[tuple[str, bool]]:
    """Writes each starter file that is not there yet; returns ``(name, written)`` for each. Never overwrites."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    files = {
        SITE_FILE: lambda: starter_site_yaml(schema if schema is not None else load_schema()),
        PAGE_FILE: starter_page_yaml,
    }
    results: list[tuple[str, bool]] = []
    for name, make in files.items():
        target = folder / name
        if target.exists():
            results.append((name, False))
            continue
        target.write_bytes(make().encode("utf-8"))  # bytes: the same text on every platform
        results.append((name, True))
    return results
