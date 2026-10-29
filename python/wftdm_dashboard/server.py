"""The local file server behind ``wftdm-dashboard here`` and ``serve`` (072-python-local-server).

It serves bytes and lists folders; it holds no dashboard logic (constitution Principle X): the app does the
reading, checking and drawing. Read-only: no route writes. Contract: specs/072-python-local-server/contracts/.

URL map (data-model.md): the embedded app at ``/`` (``here`` only); ``/dashboard-config/*`` from the folder (or
from its ``dashboard-config/`` subfolder when that exists, the app's own ``public/`` layout); ``/scenarios/*``,
``/observed/*`` and ``/geometry/*`` from the same-named subfolders. The two lists a static host cannot produce
(``scenarios/index.json`` and a run's ``summary/index.json``) are generated when the folder has no such file.
"""

from __future__ import annotations

import json
import mimetypes
import os
import socket
import webbrowser
from importlib import resources
from pathlib import Path
from typing import Literal

from flask import Flask, Response, abort, request, send_file
from werkzeug.serving import ThreadedWSGIServer


BUNDLE_MESSAGE = (
    "The dashboard app has not been built into this package. "
    "In the repository run: make build (or npm run build:package)."
)

DEFAULT_PORT = 8050
PORT_SEARCH_SPAN = 20
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "[::1]", "::1"})
FOLDER_ROUTES = ("scenarios", "observed", "geometry")

# Explicit types: on Windows `mimetypes` reads the registry, which is unreliable for exactly these (a `.js` served
# as text/plain stops module loading; `.wasm` needs its type to compile as a stream). Text types get ``charset=utf-8``
# from the framework, so none is written here.
CONTENT_TYPES = {
    ".wasm": "application/wasm",
    ".parquet": "application/octet-stream",
    ".geoparquet": "application/octet-stream",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".json": "application/json",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".txt": "text/plain",
    ".md": "text/markdown",
}


class BundleMissingError(RuntimeError):
    """The embedded app has not been built into the package."""


class PortInUseError(RuntimeError):
    """The requested port is taken."""


# ---------------------------------------------------------------- the app bundle


def static_dir(package_root: Path | None = None) -> Path:
    """The folder holding the embedded app (``static/``), or `BundleMissingError` saying how to build it."""
    root = package_root if package_root is not None else Path(str(resources.files("wftdm_dashboard")))
    path = root / "static"
    if not (path / "index.html").is_file():
        raise BundleMissingError(BUNDLE_MESSAGE)
    return path


# ---------------------------------------------------------------- paths


def _segments_ok(rel: str) -> bool:
    """No empty request, NUL, absolute path, `..`, hidden segment, or (on Windows) drive letter, stream or backslash."""
    if not rel or "\x00" in rel or rel.startswith("/") or Path(rel).is_absolute():
        return False
    if os.name == "nt" and (":" in rel or "\\" in rel):
        return False
    return all(seg == "" or not seg.startswith(".") for seg in rel.split("/"))


def resolve_inside(root: Path, rel: str, kind: Literal["file", "dir"] = "file") -> Path | None:
    """`root/rel` when it is a regular file (or folder) inside `root`, else None.

    The target is resolved first (so a link out of the folder is followed to where it really goes) and must still be
    inside the resolved root; a hidden segment (a `.git` folder, say) is never served.
    """
    if not _segments_ok(rel):
        return None
    try:
        base = root.resolve()
        target = (root / rel).resolve()
    except (OSError, ValueError):
        return None
    if not target.is_relative_to(base):
        return None
    ok = target.is_file() if kind == "file" else target.is_dir()
    return target if ok else None


def safe_path(root: Path, rel: str) -> Path | None:
    """The file `rel` inside `root`, or None (the path rule of the whole server)."""
    return resolve_inside(root, rel, "file")


# ---------------------------------------------------------------- responses


def content_type(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def _send(path: Path) -> Response:
    """A file as a streamed, range-capable response that the browser revalidates on every load."""
    response = send_file(path, mimetype=content_type(path), conditional=True, etag=True, max_age=0)
    response.headers["Cache-Control"] = "no-cache"
    return response


def _json_list(names: list[str]) -> Response:
    response = Response(json.dumps(names), mimetype="application/json")
    response.headers["Cache-Control"] = "no-cache"
    return response


def _visible(p: Path) -> bool:
    return not p.name.startswith(".")


def run_names(folder: Path) -> list[str]:
    """The runs the app may list: subfolders of `scenarios/` that have `summary/` or `manifest.yaml`, sorted."""
    scenarios = folder / "scenarios"
    if not scenarios.is_dir():
        return []
    return sorted(
        p.name
        for p in scenarios.iterdir()
        if p.is_dir() and _visible(p) and ((p / "summary").is_dir() or (p / "manifest.yaml").is_file())
    )


def parquet_names(directory: Path) -> list[str]:
    """The `*.parquet` file names of a `summary/` folder, sorted."""
    if not directory.is_dir():
        return []
    return sorted(p.name for p in directory.iterdir() if p.is_file() and _visible(p) and p.suffix == ".parquet")


def _generated_list(folder: Path, name: str, rel: str) -> list[str] | None:
    """The generated content for `scenarios/index.json`, `scenarios/<run>/summary/index.json` or `observed/summary/index.json`."""
    parts = rel.split("/")
    if name == "scenarios" and rel == "index.json":
        return run_names(folder)
    if name == "scenarios" and len(parts) == 3 and parts[1:] == ["summary", "index.json"]:
        run = resolve_inside(folder / "scenarios", parts[0], "dir")
        return parquet_names(run / "summary") if run is not None else None
    if name == "observed" and rel == "summary/index.json":
        return parquet_names(folder / "observed" / "summary")
    return None


# ---------------------------------------------------------------- the app


def _host_name(host_header: str) -> str:
    """The host part of a `Host` header, without a port."""
    host = host_header.strip().lower()
    if host.startswith("["):
        return host.split("]")[0] + "]"
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def _add_cors(response: Response) -> None:
    """Cross-origin access for a hosted copy of the app (`serve`): read-only, with the range headers exposed."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Range, If-None-Match, If-Modified-Since"
    response.headers["Access-Control-Expose-Headers"] = "Content-Range, Accept-Ranges, Content-Length, ETag"
    if request.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"


def _add_app_routes(app: Flask, app_dir: Path) -> None:
    """The embedded app at `/` and by path (`here` only). More specific routes (the folder routes) win over the catch-all."""

    @app.route("/")
    def _app_root() -> Response:
        return _send(app_dir / "index.html")

    @app.route("/<path:rel>")
    def _app(rel: str) -> Response:
        path = safe_path(app_dir, rel)
        return _send(path) if path is not None else abort(404)


def create_app(
    folder: Path,
    *,
    serve_app: bool = True,
    cors: bool = False,
    allow_any_host: bool = False,
    bundle: Path | None = None,
) -> Flask:
    """The read-only Flask app for `folder`. `bundle` is the embedded app (looked up when not given and `serve_app`)."""
    folder = Path(folder)
    app_dir = (bundle if bundle is not None else static_dir()) if serve_app else None
    app = Flask(__name__, static_folder=None)

    config_root = folder / "dashboard-config" if (folder / "dashboard-config").is_dir() else folder

    @app.before_request
    def _host_guard() -> None:
        # a loopback server must not answer a page that reached it through another name (DNS rebinding)
        if not allow_any_host and _host_name(request.host) not in LOCAL_HOSTS:
            abort(400)

    @app.after_request
    def _headers(response: Response) -> Response:
        response.headers.setdefault("Cache-Control", "no-cache")
        if cors:
            _add_cors(response)
        return response

    @app.route("/dashboard-config/<path:rel>")
    def _config(rel: str) -> Response:
        path = safe_path(config_root, rel)
        return _send(path) if path is not None else abort(404)

    def _folder_route(name: str):
        def view(rel: str) -> Response:
            root = folder / name
            path = safe_path(root, rel)
            if path is not None:
                return _send(path)
            names = _generated_list(folder, name, rel)
            return _json_list(names) if names is not None else abort(404)

        view.__name__ = f"_{name}"
        app.add_url_rule(f"/{name}/<path:rel>", view_func=view)

    for name in FOLDER_ROUTES:
        _folder_route(name)

    if app_dir is not None:
        _add_app_routes(app, app_dir)

    return app


# ---------------------------------------------------------------- running it


class _Server(ThreadedWSGIServer):
    # SO_REUSEADDR on Windows lets a second server take a port that is already in use: leave it off there
    allow_reuse_address = os.name != "nt"


def _port_free(host: str, port: int) -> bool:
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    probe = socket.socket(family, socket.SOCK_STREAM)
    try:
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        probe.bind((host, port))
    except OSError:
        return False
    finally:
        probe.close()
    return True


def bind_server(app: Flask, host: str, port: int, *, exact_port: bool) -> _Server:
    """Bind to `port`, or (unless `exact_port`) to the next free one within `PORT_SEARCH_SPAN`."""
    candidates = [port] if exact_port else list(range(port, port + PORT_SEARCH_SPAN + 1))
    for candidate in candidates:
        if not _port_free(host, candidate):
            continue
        try:
            return _Server(host, candidate, app)
        except OSError:
            continue
    raise PortInUseError(f"Port {port} is already in use.")


def serve_until_stopped(server: _Server, *, message: str, url: str, open_browser: bool) -> None:
    """Run the bound server until Ctrl+C. The message is always printed first; a browser that will not open is ignored."""
    print(message, flush=True)
    if open_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass  # a headless machine: the address is already on screen
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def find_site_file(folder: Path) -> Path | None:
    """The site file of a folder: `dashboard-config.yaml` at its root, or in its `dashboard-config/` subfolder."""
    for candidate in (folder / "dashboard-config.yaml", folder / "dashboard-config" / "dashboard-config.yaml"):
        if candidate.is_file():
            return candidate
    return None


def is_loopback(host: str) -> bool:
    return host in {"127.0.0.1", "localhost", "::1", "[::1]"}
