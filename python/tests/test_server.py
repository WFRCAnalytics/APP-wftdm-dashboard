"""The local file server (072-python-local-server): path safety, routes, ranges, content types, lists, Host guard, CORS."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from wftdm_dashboard import server
from wftdm_dashboard.server import (
    BundleMissingError,
    create_app,
    resolve_inside,
    safe_path,
    static_dir,
)


PARQUET_BYTES = bytes(range(256)) * 8  # 2048 bytes, every byte value, so a wrong range is visible


def _write(path: Path, content: str | bytes = "x") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    # bytes in both cases: write_text on Windows would turn a newline into CR LF and change what the tests compare
    path.write_bytes(content if isinstance(content, bytes) else content.encode("utf-8"))
    return path


@pytest.fixture
def bundle(tmp_path: Path) -> Path:
    root = tmp_path / "bundle"
    _write(root / "index.html", "<html>app</html>")
    _write(root / "assets" / "app.js", "console.log(1)")
    _write(root / "assets" / "engine.wasm", b"\x00asm")
    _write(root / "assets" / "app.css", "body{}")
    _write(root / "basemap" / "leaflet-providers.json", "{}")
    return root


@pytest.fixture
def flat(tmp_path: Path) -> Path:
    """A flat site folder: site file and pages at the root, runs under scenarios/."""
    root = tmp_path / "site"
    _write(root / "dashboard-config.yaml", "version: 1\npages: [dashboard-1.yaml]\n")
    _write(root / "dashboard-1.yaml", "header:\n  tab: A\n  title: A\n")
    _write(root / "scenarios" / "baseline" / "manifest.yaml", "scenario_name: baseline\n")
    _write(root / "scenarios" / "baseline" / "summary" / "kpis.parquet", PARQUET_BYTES)
    _write(root / "scenarios" / "baseline" / "summary" / "modes.parquet", PARQUET_BYTES)
    _write(root / "scenarios" / "alt" / "summary" / "kpis.parquet", PARQUET_BYTES)
    _write(root / "geometry" / "zones.geoparquet", PARQUET_BYTES)
    _write(root / "secret.txt", "private")
    return root


@pytest.fixture
def client(flat: Path, bundle: Path):
    return create_app(flat, bundle=bundle).test_client()


# ---------------------------------------------------------------- T004: the bundle


def test_static_dir_finds_the_built_bundle(tmp_path: Path) -> None:
    _write(tmp_path / "static" / "index.html", "<html></html>")
    assert static_dir(tmp_path) == tmp_path / "static"


def test_static_dir_says_how_to_build_when_missing(tmp_path: Path) -> None:
    with pytest.raises(BundleMissingError) as info:
        static_dir(tmp_path)
    assert "make build" in str(info.value)
    assert "npm run build:package" in str(info.value)


def test_a_folder_without_index_html_is_not_a_bundle(tmp_path: Path) -> None:
    (tmp_path / "static").mkdir()
    with pytest.raises(BundleMissingError):
        static_dir(tmp_path)


# ---------------------------------------------------------------- T005: the path rule


def test_safe_path_serves_a_file_and_a_nested_file(tmp_path: Path) -> None:
    _write(tmp_path / "a.txt")
    _write(tmp_path / "d" / "e" / "b.txt")
    assert safe_path(tmp_path, "a.txt") == (tmp_path / "a.txt").resolve()
    assert safe_path(tmp_path, "d/e/b.txt") == (tmp_path / "d" / "e" / "b.txt").resolve()


@pytest.mark.parametrize(
    "rel",
    [
        "",
        "../outside.txt",
        "d/../../outside.txt",
        "..",
        "d/..",
        "/etc/passwd",
        "//server/share/x",
        ".hidden/c.txt",
        "d/.git/config",
        ".env",
        "d",  # a directory
        "missing.txt",
        "a\x00.txt",
    ],
)
def test_safe_path_refuses(tmp_path: Path, rel: str) -> None:
    _write(tmp_path.parent / "outside.txt", "no")
    _write(tmp_path / "d" / "e" / "b.txt")
    _write(tmp_path / ".hidden" / "c.txt")
    _write(tmp_path / "d" / ".git" / "config")
    _write(tmp_path / ".env")
    assert safe_path(tmp_path, rel) is None


def test_an_encoded_dot_dot_is_just_a_file_name(tmp_path: Path, bundle: Path) -> None:
    """Flask decodes the URL once: '%2e%2e' arrives as '..', and a double-encoded one stays a literal name."""
    _write(tmp_path / "site" / "scenarios" / "x" / "ok.txt", "ok")
    client = create_app(tmp_path / "site", bundle=bundle).test_client()
    assert client.get("/scenarios/%2e%2e/%2e%2e/secret.txt").status_code == 404
    assert client.get("/scenarios/%252e%252e/x").status_code == 404


@pytest.mark.skipif(os.name != "nt", reason="drive letters and alternate streams are Windows rules")
@pytest.mark.parametrize("rel", ["C:/Windows/win.ini", "C:\\Windows\\win.ini", "a.txt:stream", "d\\a.txt"])
def test_safe_path_refuses_windows_forms(tmp_path: Path, rel: str) -> None:
    _write(tmp_path / "a.txt")
    _write(tmp_path / "d" / "a.txt")
    assert safe_path(tmp_path, rel) is None


def test_safe_path_refuses_a_link_out_of_the_folder(tmp_path: Path) -> None:
    root = tmp_path / "site"
    root.mkdir()
    _write(tmp_path / "outside" / "secret.txt", "secret")
    try:
        (root / "link").symlink_to(tmp_path / "outside", target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("this platform cannot create a symbolic link here")
    assert safe_path(root, "link/secret.txt") is None


def test_safe_path_allows_a_link_that_stays_inside(tmp_path: Path) -> None:
    root = tmp_path / "site"
    _write(root / "real" / "f.txt", "in")
    try:
        (root / "alias").symlink_to(root / "real", target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("this platform cannot create a symbolic link here")
    assert safe_path(root, "alias/f.txt") is not None


def test_resolve_inside_can_ask_for_a_folder(tmp_path: Path) -> None:
    (tmp_path / "d").mkdir()
    assert resolve_inside(tmp_path, "d", "dir") == (tmp_path / "d").resolve()
    assert resolve_inside(tmp_path, "d", "file") is None
    assert resolve_inside(tmp_path, "../d", "dir") is None


def test_names_with_spaces_and_non_ascii_are_served(tmp_path: Path, bundle: Path) -> None:
    site = tmp_path / "my site é"
    _write(site / "scenarios" / "ré 1" / "summary" / "a b.parquet", PARQUET_BYTES)
    client = create_app(site, bundle=bundle).test_client()
    response = client.get("/scenarios/r%C3%A9%201/summary/a%20b.parquet")
    assert response.status_code == 200
    assert response.data == PARQUET_BYTES


# ---------------------------------------------------------------- T006: routes, types, ranges


def test_the_app_is_served_at_the_root_and_by_path(client) -> None:
    assert client.get("/").data == b"<html>app</html>"
    assert client.get("/index.html").status_code == 200
    assert client.get("/assets/app.js").data == b"console.log(1)"
    assert client.get("/basemap/leaflet-providers.json").status_code == 200


def test_the_flat_layout_maps_the_folder_to_dashboard_config(client) -> None:
    assert b"pages:" in client.get("/dashboard-config/dashboard-config.yaml").data
    assert client.get("/dashboard-config/dashboard-1.yaml").status_code == 200
    assert client.get("/dashboard-config/nope.yaml").status_code == 404


def test_the_public_layout_uses_the_dashboard_config_subfolder(tmp_path: Path, bundle: Path) -> None:
    root = tmp_path / "public"
    _write(root / "dashboard-config" / "dashboard-config.yaml", "title: T\n")
    _write(root / "dashboard-config" / "page.yaml", "x: 1\n")
    _write(root / "dashboard-config.yaml", "title: NOT THIS ONE\n")  # a stray file at the root is not the site file here
    client = create_app(root, bundle=bundle).test_client()
    assert client.get("/dashboard-config/dashboard-config.yaml").data == b"title: T\n"
    assert client.get("/dashboard-config/page.yaml").status_code == 200


def test_runs_observed_and_geometry_are_served_from_their_folders(flat: Path, bundle: Path) -> None:
    _write(flat / "observed" / "manifest.yaml", "scenario_name: observed\n")
    client = create_app(flat, bundle=bundle).test_client()
    assert client.get("/scenarios/baseline/manifest.yaml").status_code == 200
    assert client.get("/scenarios/baseline/summary/kpis.parquet").data == PARQUET_BYTES
    assert client.get("/observed/manifest.yaml").status_code == 200
    assert client.get("/geometry/zones.geoparquet").status_code == 200


def test_only_the_mapped_folders_are_reachable(client) -> None:
    assert client.get("/secret.txt").status_code == 404
    assert client.get("/dashboard-config/../secret.txt").status_code == 404
    assert client.get("/scenarios/../secret.txt").status_code == 404
    assert client.get("/unknown/thing").status_code == 404


@pytest.mark.parametrize(
    ("url", "kind"),
    [
        ("/assets/engine.wasm", "application/wasm"),
        ("/scenarios/baseline/summary/kpis.parquet", "application/octet-stream"),
        ("/geometry/zones.geoparquet", "application/octet-stream"),
        ("/dashboard-config/dashboard-1.yaml", "text/yaml"),
        ("/assets/app.js", "text/javascript"),
        ("/assets/app.css", "text/css"),
        ("/basemap/leaflet-providers.json", "application/json"),
        ("/", "text/html"),
    ],
)
def test_content_types(client, url: str, kind: str) -> None:
    assert client.get(url).headers["Content-Type"].startswith(kind)


def test_text_types_carry_utf8_once(client) -> None:
    assert client.get("/dashboard-config/dashboard-1.yaml").headers["Content-Type"] == "text/yaml; charset=utf-8"


def test_every_file_response_revalidates_and_accepts_ranges(client) -> None:
    for url in ["/", "/assets/app.js", "/scenarios/baseline/summary/kpis.parquet", "/dashboard-config/dashboard-1.yaml"]:
        response = client.get(url)
        assert response.headers["Cache-Control"] == "no-cache", url
        assert response.headers["Accept-Ranges"] == "bytes", url
        assert response.headers["ETag"], url


def test_a_repeat_request_with_the_etag_is_not_modified(client) -> None:
    first = client.get("/dashboard-config/dashboard-1.yaml")
    second = client.get("/dashboard-config/dashboard-1.yaml", headers={"If-None-Match": first.headers["ETag"]})
    assert second.status_code == 304


def test_an_edit_shows_on_the_next_request(client, flat: Path) -> None:
    first = client.get("/dashboard-config/dashboard-1.yaml")
    (flat / "dashboard-1.yaml").write_text("header:\n  tab: B\n  title: B\n", encoding="utf-8")
    second = client.get("/dashboard-config/dashboard-1.yaml", headers={"If-None-Match": first.headers["ETag"]})
    assert second.status_code == 200
    assert b"tab: B" in second.data


def test_a_range_request_gets_partial_content(client) -> None:
    response = client.get("/scenarios/baseline/summary/kpis.parquet", headers={"Range": "bytes=10-19"})
    assert response.status_code == 206
    assert response.data == PARQUET_BYTES[10:20]
    assert response.headers["Content-Range"] == f"bytes 10-19/{len(PARQUET_BYTES)}"


def test_open_ended_and_suffix_ranges(client) -> None:
    open_ended = client.get("/scenarios/baseline/summary/kpis.parquet", headers={"Range": f"bytes={len(PARQUET_BYTES) - 5}-"})
    assert open_ended.status_code == 206
    assert open_ended.data == PARQUET_BYTES[-5:]
    suffix = client.get("/scenarios/baseline/summary/kpis.parquet", headers={"Range": "bytes=-8"})
    assert suffix.status_code == 206
    assert suffix.data == PARQUET_BYTES[-8:]


def test_an_unsatisfiable_range_is_416(client) -> None:
    response = client.get("/scenarios/baseline/summary/kpis.parquet", headers={"Range": "bytes=99999-100000"})
    assert response.status_code == 416


def test_head_answers_without_a_body(client) -> None:
    response = client.head("/scenarios/baseline/summary/kpis.parquet")
    assert response.status_code == 200
    assert response.data == b""
    assert int(response.headers["Content-Length"]) == len(PARQUET_BYTES)


@pytest.mark.parametrize("method", ["post", "put", "delete", "patch"])
def test_no_route_accepts_a_write(client, method: str) -> None:
    for url in ["/", "/dashboard-config/dashboard-1.yaml", "/scenarios/baseline/summary/kpis.parquet", "/scenarios/index.json"]:
        assert getattr(client, method)(url, data=b"x").status_code in (404, 405), (method, url)


def test_nothing_is_written_to_the_folder(flat: Path, bundle: Path) -> None:
    before = sorted(str(p.relative_to(flat)) for p in flat.rglob("*"))
    client = create_app(flat, bundle=bundle).test_client()
    for url in ["/scenarios/index.json", "/scenarios/baseline/summary/index.json", "/dashboard-config/dashboard-config.yaml", "/observed/summary/index.json"]:
        client.get(url)
    assert sorted(str(p.relative_to(flat)) for p in flat.rglob("*")) == before


# ---------------------------------------------------------------- T007: generated lists


def test_the_run_list_is_generated_and_sorted(client) -> None:
    response = client.get("/scenarios/index.json")
    assert response.status_code == 200
    assert response.headers["Content-Type"].startswith("application/json")
    assert response.headers["Cache-Control"] == "no-cache"
    assert json.loads(response.data) == ["alt", "baseline"]


def test_the_summary_list_is_the_parquet_files(client) -> None:
    assert json.loads(client.get("/scenarios/baseline/summary/index.json").data) == ["kpis.parquet", "modes.parquet"]
    assert json.loads(client.get("/scenarios/alt/summary/index.json").data) == ["kpis.parquet"]


def test_a_file_on_disk_wins_over_the_generated_list(flat: Path, bundle: Path) -> None:
    _write(flat / "scenarios" / "index.json", json.dumps(["baseline"]))
    _write(flat / "scenarios" / "baseline" / "summary" / "index.json", json.dumps(["kpis.parquet"]))
    client = create_app(flat, bundle=bundle).test_client()
    assert json.loads(client.get("/scenarios/index.json").data) == ["baseline"]
    assert json.loads(client.get("/scenarios/baseline/summary/index.json").data) == ["kpis.parquet"]


def test_folders_that_are_not_runs_are_left_out(flat: Path, bundle: Path) -> None:
    (flat / "scenarios" / "notes").mkdir()
    _write(flat / "scenarios" / "notes" / "readme.txt")
    _write(flat / "scenarios" / ".hidden" / "summary" / "a.parquet")
    _write(flat / "scenarios" / "only-manifest" / "manifest.yaml", "scenario_name: m\n")
    client = create_app(flat, bundle=bundle).test_client()
    assert json.loads(client.get("/scenarios/index.json").data) == ["alt", "baseline", "only-manifest"]


def test_no_scenarios_folder_gives_an_empty_list(tmp_path: Path, bundle: Path) -> None:
    (tmp_path / "site").mkdir()
    client = create_app(tmp_path / "site", bundle=bundle).test_client()
    assert json.loads(client.get("/scenarios/index.json").data) == []


def test_a_run_added_later_appears_on_the_next_request(client, flat: Path) -> None:
    assert json.loads(client.get("/scenarios/index.json").data) == ["alt", "baseline"]
    _write(flat / "scenarios" / "later" / "summary" / "a.parquet", PARQUET_BYTES)
    assert json.loads(client.get("/scenarios/index.json").data) == ["alt", "baseline", "later"]


def test_the_summary_list_of_an_unknown_or_unsafe_run_is_404(client) -> None:
    assert client.get("/scenarios/nope/summary/index.json").status_code == 404
    assert client.get("/scenarios/../summary/index.json").status_code == 404
    assert client.get("/scenarios/.hidden/summary/index.json").status_code == 404


def test_the_observed_list_is_generated_when_the_folder_exists(flat: Path, bundle: Path) -> None:
    _write(flat / "observed" / "summary" / "counts.parquet", PARQUET_BYTES)
    client = create_app(flat, bundle=bundle).test_client()
    assert json.loads(client.get("/observed/summary/index.json").data) == ["counts.parquet"]


# ---------------------------------------------------------------- T008: the Host guard


@pytest.mark.parametrize("host", ["localhost", "localhost:8050", "127.0.0.1", "127.0.0.1:9999", "[::1]", "[::1]:8050", "LOCALHOST:1"])
def test_local_host_names_are_answered(client, host: str) -> None:
    assert client.get("/", headers={"Host": host}).status_code == 200


@pytest.mark.parametrize("host", ["evil.example", "evil.example:8050", "127.0.0.1.evil.example", "192.168.1.20:8050", "example.com"])
def test_other_host_names_are_refused(client, host: str) -> None:
    assert client.get("/", headers={"Host": host}).status_code == 400
    assert client.get("/scenarios/index.json", headers={"Host": host}).status_code == 400


def test_the_guard_can_be_switched_off_for_a_network_bind(flat: Path, bundle: Path) -> None:
    client = create_app(flat, bundle=bundle, allow_any_host=True).test_client()
    assert client.get("/", headers={"Host": "192.168.1.20:8050"}).status_code == 200


# ---------------------------------------------------------------- the rules of each command


def test_here_has_no_cross_origin_header(client) -> None:
    assert "Access-Control-Allow-Origin" not in client.get("/").headers


def test_the_bundle_is_looked_up_when_not_given(flat: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    def missing(package_root: Path | None = None) -> Path:
        raise BundleMissingError(server.BUNDLE_MESSAGE)

    monkeypatch.setattr(server, "static_dir", missing)
    with pytest.raises(BundleMissingError):
        create_app(flat)
    # `serve` has no app, so it never needs the bundle
    assert create_app(flat, serve_app=False).test_client().get("/dashboard-config/dashboard-config.yaml").status_code == 200


# ---------------------------------------------------------------- serve: cross-origin access, no app


@pytest.fixture
def served(flat: Path):
    """The `serve` app: only the folder, with cross-origin access (no bundle needed)."""
    return create_app(flat, serve_app=False, cors=True).test_client()


def test_serve_does_not_serve_the_app(served) -> None:
    assert served.get("/").status_code == 404
    assert served.get("/index.html").status_code == 404
    assert served.get("/assets/app.js").status_code == 404


def test_serve_serves_the_folder_like_here(served) -> None:
    assert served.get("/dashboard-config/dashboard-config.yaml").status_code == 200
    assert served.get("/scenarios/baseline/summary/kpis.parquet").data == PARQUET_BYTES
    assert json.loads(served.get("/scenarios/index.json").data) == ["alt", "baseline"]
    assert served.get("/scenarios/baseline/summary/kpis.parquet", headers={"Range": "bytes=0-9"}).status_code == 206


def test_serve_allows_any_origin_to_read(served) -> None:
    response = served.get("/dashboard-config/dashboard-config.yaml", headers={"Origin": "https://hosted.example.org"})
    assert response.headers["Access-Control-Allow-Origin"] == "*"
    assert "Content-Range" in response.headers["Access-Control-Expose-Headers"]
    assert "Accept-Ranges" in response.headers["Access-Control-Expose-Headers"]
    assert "ETag" in response.headers["Access-Control-Expose-Headers"]


def test_serve_cross_origin_headers_are_on_a_refusal_too(served) -> None:
    response = served.get("/scenarios/../secret.txt", headers={"Origin": "https://hosted.example.org"})
    assert response.status_code == 404
    assert response.headers["Access-Control-Allow-Origin"] == "*"


def test_serve_answers_a_preflight(served) -> None:
    response = served.options(
        "/scenarios/baseline/summary/kpis.parquet",
        headers={"Origin": "https://hosted.example.org", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "range"},
    )
    assert response.status_code in (200, 204)
    assert response.headers["Access-Control-Allow-Origin"] == "*"
    assert "Range" in response.headers["Access-Control-Allow-Headers"]
    assert "GET" in response.headers["Access-Control-Allow-Methods"]


def test_serve_allows_a_private_network_preflight_when_asked(served) -> None:
    asked = served.options("/scenarios/index.json", headers={"Origin": "https://h.example", "Access-Control-Request-Private-Network": "true"})
    assert asked.headers["Access-Control-Allow-Private-Network"] == "true"
    plain = served.options("/scenarios/index.json", headers={"Origin": "https://h.example"})
    assert "Access-Control-Allow-Private-Network" not in plain.headers


def test_serve_keeps_the_folder_rules(served, flat: Path) -> None:
    for url in ["/scenarios/%2e%2e/secret.txt", "/dashboard-config/../secret.txt", "/geometry/.hidden"]:
        assert served.get(url).status_code == 404, url
    assert served.get("/scenarios/index.json", headers={"Host": "evil.example"}).status_code == 400
    assert served.post("/scenarios/index.json", data=b"x").status_code == 405
    assert (flat / "secret.txt").read_text(encoding="utf-8") == "private"  # nothing written


def test_serve_does_not_need_a_bundle(flat: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def missing(package_root: Path | None = None) -> Path:
        raise BundleMissingError(server.BUNDLE_MESSAGE)

    monkeypatch.setattr(server, "static_dir", missing)
    assert create_app(flat, serve_app=False, cors=True).test_client().get("/scenarios/index.json").status_code == 200
