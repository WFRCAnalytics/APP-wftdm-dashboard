"""The starter files written by ``init`` (072-python-local-server)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from wftdm_dashboard.scaffold import (
    PAGE_FILE,
    SCHEMA_URL,
    SITE_FILE,
    load_schema,
    starter_page_yaml,
    starter_site_yaml,
    write_missing,
)


SMALL_SCHEMA: dict[str, Any] = {
    "properties": {
        "version": {"type": "integer", "description": "File version."},
        "pages": {"type": "array", "items": {"type": "string"}, "description": "Page files."},
        "title": {"type": "string", "description": "Dashboard title."},
        "layout": {
            "type": "object",
            "properties": {"mode": {"enum": ["scroll", "tabs"], "description": "How pages are shown."}},
        },
        "colors": {
            "type": "object",
            "properties": {"primary": {"type": "string", "description": "Primary colour."}, "brand": {"type": "string"}},
        },
        "years": {"type": "object", "properties": {"base": {"type": "integer"}}},
        "compare": {"type": "object", "properties": {"enabled": {"type": "boolean", "description": "Compare on."}}},
        "units": {"type": "object", "description": "A free map."},
    }
}


def leaf_paths(properties: dict[str, Any], prefix: str = "") -> set[str]:
    """Every setting of a schema as a dotted path (a node with `properties` is a group, anything else a leaf)."""
    paths: set[str] = set()
    for key, node in properties.items():
        inner = node.get("properties")
        path = f"{prefix}{key}"
        paths |= leaf_paths(inner, f"{path}.") if isinstance(inner, dict) and inner else {path}
    return paths


def yaml_paths(tree: Any, prefix: str = "") -> set[str]:
    paths: set[str] = set()
    for key, value in (tree or {}).items():
        path = f"{prefix}{key}"
        paths |= yaml_paths(value, f"{path}.") if isinstance(value, dict) and value else {path}
    return paths


def uncomment(text: str) -> str:
    """The settings part of the file made live: description lines (`## `) dropped, one `# ` removed from each remaining line."""
    settings = text.split("# ---- available settings ----", 1)[1]
    kept = [line[2:] for line in settings.splitlines() if line.startswith("# ")]
    return chr(10).join(kept)


# ---------------------------------------------------------------- the site file


def test_the_site_file_starts_with_the_schema_line_and_the_live_keys() -> None:
    text = starter_site_yaml(SMALL_SCHEMA)
    assert text.splitlines()[0] == f"# yaml-language-server: $schema={SCHEMA_URL}"
    assert yaml.safe_load(text) == {"version": 1, "pages": [PAGE_FILE]}  # comments only after that: valid and neutral as written


def test_every_setting_is_listed_once_as_a_comment() -> None:
    text = starter_site_yaml(SMALL_SCHEMA)
    for key in ("title", "mode", "primary", "brand", "base", "enabled", "units"):
        assert sum(1 for line in text.splitlines() if line.startswith("#") and f"{key}:" in line and not line.startswith("##")) == 1, key


def test_descriptions_are_comments_above_their_setting_with_allowed_values() -> None:
    text = starter_site_yaml(SMALL_SCHEMA)
    assert "## Dashboard title." in text
    assert "##   How pages are shown. One of: scroll, tabs." in text  # indented like the setting it describes
    assert text.index("## Dashboard title.") < text.index("# title:")


def test_uncommenting_gives_valid_yaml_of_the_whole_tree() -> None:
    tree = yaml.safe_load(uncomment(starter_site_yaml(SMALL_SCHEMA)))
    assert tree["layout"] == {"mode": "scroll"}
    assert tree["colors"] == {"primary": "", "brand": ""}
    assert tree["compare"] == {"enabled": True}
    assert tree["years"] == {"base": 0}
    assert yaml_paths(tree) == leaf_paths(SMALL_SCHEMA["properties"]) - {"version", "pages"}


def test_long_descriptions_wrap() -> None:
    schema = {"properties": {"title": {"type": "string", "description": "word " * 80}}}
    lines = [line for line in starter_site_yaml(schema).splitlines() if line.startswith("## ")]
    assert len(lines) > 1
    assert all(len(line) <= 100 for line in lines)


def test_the_real_schema_is_listed_in_full() -> None:
    schema = load_schema()
    expected = leaf_paths(schema["properties"]) - {"version", "pages"}  # those two are written live, not as comments
    tree = yaml.safe_load(uncomment(starter_site_yaml(schema)))
    assert yaml_paths(tree) == expected  # 100% of the settings of this version, none twice, none missing
    assert len(expected) > 60
    for known in ("title", "colors.primary", "assistant.providers", "explore.limits.chart_rows", "network.basemaps.allow", "network.fonts"):
        assert known in expected


def test_the_real_starter_is_valid_and_neutral_as_written() -> None:
    parsed = yaml.safe_load(starter_site_yaml(load_schema()))
    assert parsed == {"version": 1, "pages": [PAGE_FILE]}
    text = chr(10).join(starter_site_yaml(load_schema()).splitlines()[1:])  # all but the schema line (it names the repository)
    for name in ("WFRC", "Wasatch", "Utah"):
        assert name not in text


def test_text_is_identical_on_every_platform_run() -> None:
    assert starter_site_yaml(load_schema()) == starter_site_yaml(load_schema())
    assert "\r" not in starter_site_yaml(load_schema())


# ---------------------------------------------------------------- the page


def test_the_starter_page_is_a_page_with_one_markdown_panel() -> None:
    page = yaml.safe_load(starter_page_yaml())
    assert page["header"] == {"tab": "Overview", "title": "Overview"}
    panels = [panel for row in page["layout"].values() for panel in row]
    assert [p["type"] for p in panels] == ["markdown"]
    assert "wftdm-dashboard init" in panels[0]["content"]


# ---------------------------------------------------------------- writing


def test_write_missing_writes_both_files_into_an_empty_folder(tmp_path: Path) -> None:
    results = write_missing(tmp_path / "new" / "site", SMALL_SCHEMA)
    assert results == [(SITE_FILE, True), (PAGE_FILE, True)]
    assert (tmp_path / "new" / "site" / SITE_FILE).is_file()
    assert (tmp_path / "new" / "site" / PAGE_FILE).is_file()


def test_a_second_run_changes_nothing(tmp_path: Path) -> None:
    write_missing(tmp_path, SMALL_SCHEMA)
    before = {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    assert write_missing(tmp_path, SMALL_SCHEMA) == [(SITE_FILE, False), (PAGE_FILE, False)]
    assert {p.name: p.read_bytes() for p in tmp_path.iterdir()} == before


def test_an_existing_file_is_never_overwritten(tmp_path: Path) -> None:
    (tmp_path / SITE_FILE).write_bytes(b"title: Mine\n")
    results = write_missing(tmp_path, SMALL_SCHEMA)
    assert results == [(SITE_FILE, False), (PAGE_FILE, True)]
    assert (tmp_path / SITE_FILE).read_bytes() == b"title: Mine\n"


def test_a_partial_folder_gets_only_what_is_missing(tmp_path: Path) -> None:
    (tmp_path / PAGE_FILE).write_bytes(b"header: {tab: X, title: X}\n")
    assert write_missing(tmp_path, SMALL_SCHEMA) == [(SITE_FILE, True), (PAGE_FILE, False)]
    assert (tmp_path / PAGE_FILE).read_bytes() == b"header: {tab: X, title: X}\n"


def test_a_folder_with_spaces_and_non_ascii_letters_works(tmp_path: Path) -> None:
    folder = tmp_path / "mi carpeta é"
    assert write_missing(folder, SMALL_SCHEMA) == [(SITE_FILE, True), (PAGE_FILE, True)]
    assert (folder / SITE_FILE).read_bytes().decode("utf-8").startswith("# yaml-language-server")


def test_files_are_written_with_lf_line_ends(tmp_path: Path) -> None:
    write_missing(tmp_path, SMALL_SCHEMA)
    assert b"\r" not in (tmp_path / SITE_FILE).read_bytes()
    assert b"\r" not in (tmp_path / PAGE_FILE).read_bytes()


def test_write_missing_loads_the_packaged_schema_by_default(tmp_path: Path) -> None:
    write_missing(tmp_path)
    assert "network" in (tmp_path / SITE_FILE).read_text(encoding="utf-8")
