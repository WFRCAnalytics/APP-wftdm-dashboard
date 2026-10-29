"""The server on a real socket (072-python-local-server): port search, a ranged request, a clean stop."""

from __future__ import annotations

import socket
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from wftdm_dashboard.server import PORT_SEARCH_SPAN, PortInUseError, bind_server, create_app


DATA = bytes(range(256)) * 16


@pytest.fixture
def site(tmp_path: Path) -> Path:
    root = tmp_path / "site"
    (root / "scenarios" / "r1" / "summary").mkdir(parents=True)
    (root / "scenarios" / "r1" / "summary" / "a.parquet").write_bytes(DATA)
    (tmp_path / "bundle").mkdir()
    (tmp_path / "bundle" / "index.html").write_bytes(b"<html>app</html>")
    return root


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def _run(server) -> threading.Thread:
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return thread


def test_serves_a_file_and_a_range_over_a_real_socket(site: Path, tmp_path: Path) -> None:
    port = _free_port()
    server = bind_server(create_app(site, bundle=tmp_path / "bundle"), "127.0.0.1", port, exact_port=True)
    thread = _run(server)
    try:
        base = f"http://127.0.0.1:{port}"
        assert urllib.request.urlopen(f"{base}/").read() == b"<html>app</html>"
        request = urllib.request.Request(f"{base}/scenarios/r1/summary/a.parquet", headers={"Range": "bytes=5-14"})
        with urllib.request.urlopen(request) as response:
            assert response.status == 206
            assert response.read() == DATA[5:15]
        with pytest.raises(urllib.error.HTTPError) as info:
            urllib.request.urlopen(f"{base}/scenarios/..%2f..%2fsecret.txt")
        assert info.value.code == 404
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_a_taken_exact_port_is_an_error(site: Path, tmp_path: Path) -> None:
    app = create_app(site, bundle=tmp_path / "bundle")
    held = bind_server(app, "127.0.0.1", _free_port(), exact_port=True)
    try:
        port = held.server_port
        with pytest.raises(PortInUseError) as info:
            bind_server(app, "127.0.0.1", port, exact_port=True)
        assert f"Port {port} is already in use." in str(info.value)
    finally:
        held.server_close()


def test_without_an_exact_port_the_next_free_one_is_used(site: Path, tmp_path: Path) -> None:
    app = create_app(site, bundle=tmp_path / "bundle")
    first = bind_server(app, "127.0.0.1", _free_port(), exact_port=False)
    try:
        second = bind_server(app, "127.0.0.1", first.server_port, exact_port=False)
        try:
            assert second.server_port > first.server_port
            assert second.server_port <= first.server_port + PORT_SEARCH_SPAN
        finally:
            second.server_close()
    finally:
        first.server_close()


def _hold(app, port: int):
    """Holds `port` (exact), or None when something else already has it."""
    try:
        return bind_server(app, "127.0.0.1", port, exact_port=True)
    except PortInUseError:
        return None


def test_the_search_gives_up_after_its_span(site: Path, tmp_path: Path) -> None:
    app = create_app(site, bundle=tmp_path / "bundle")
    base = _free_port()
    held = [_hold(app, base + offset) for offset in range(PORT_SEARCH_SPAN + 1)]
    try:
        if any(server is None for server in held):
            pytest.skip("a port in the test range is already used by something else")
        with pytest.raises(PortInUseError):
            bind_server(app, "127.0.0.1", base, exact_port=False)
    finally:
        for server in held:
            if server is not None:
                server.server_close()
