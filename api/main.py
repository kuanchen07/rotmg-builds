"""
Vercel Python entrypoint (must be main.py / index.py / app.py per Vercel).

Endpoint: GET /api/main?username=NAME

Environment:
  CORS_ORIGIN — CORS policy (default *). Use * for any caller. For GitHub project pages, browsers send
  Origin: https://<user>.github.io only (no /repo path); set that exact origin, or a comma-separated list
  (e.g. https://you.github.io,https://your-app.vercel.app,http://127.0.0.1:5500). Entries may include a path;
  they are normalized to scheme://host[:port]. If * appears in the list, all origins are allowed.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from realmeye_player_scrape import scrape_player_json


def _normalize_cors_origin_token(token: str) -> str:
    t = token.strip()
    if not t or t == "*":
        return t
    if "://" not in t:
        return t
    u = urlparse(t)
    if u.scheme and u.netloc:
        return f"{u.scheme}://{u.netloc}"
    return t


def _cors_allowed_list() -> list[str]:
    raw = (os.environ.get("CORS_ORIGIN") or "").strip()
    if not raw:
        return ["*"]
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        return ["*"]
    out: list[str] = []
    for p in parts:
        if p == "*":
            out.append("*")
        else:
            out.append(_normalize_cors_origin_token(p))
    return out


def _access_control_allow_origin(handler: BaseHTTPRequestHandler) -> str | None:
    """
    Echo the request Origin when it is allowed; use * when configured as wildcard.
    Return None when the request Origin is not allowed (cross-origin browsers will not read the body).
    """
    allowed = _cors_allowed_list()
    if "*" in allowed:
        return "*"
    req = (handler.headers.get("Origin") or "").strip()
    allowed_set = set(allowed)
    if req and req in allowed_set:
        return req
    if not req and len(allowed) == 1:
        return allowed[0]
    return None


def _query_string(handler: BaseHTTPRequestHandler) -> str:
    """
    Vercel's Python bridge may put query params only in QUERY_STRING, not in self.path.
    Also try the raw request line as a fallback.
    """
    path = handler.path or ""
    q = urlparse(path).query
    if q:
        return q
    env_q = (os.environ.get("QUERY_STRING") or "").strip()
    if env_q:
        return env_q
    rl = getattr(handler, "requestline", None) or ""
    if rl and "?" in rl:
        try:
            request_target = rl.split(None, 2)[1]
            if "?" in request_target:
                return request_target.split("?", 1)[1]
        except (IndexError, ValueError):
            pass
    return ""


def _read_username(handler: BaseHTTPRequestHandler) -> str | None:
    q = parse_qs(_query_string(handler), keep_blank_values=False)
    for key in ("username", "user", "player"):
        vals = q.get(key)
        if vals and vals[0]:
            return vals[0].strip()
    return None


class handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def _send_cors_headers(self) -> None:
        acao = _access_control_allow_origin(self)
        if acao is not None:
            self.send_header("Access-Control-Allow-Origin", acao)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        username = _read_username(self)
        if not username:
            self._send_json(
                400,
                {
                    "error": "missing_username",
                    "detail": "Add ?username=yourname (or ?player=). Example: /api/main?username=evolz",
                },
            )
            return

        try:
            data = scrape_player_json(username)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                self._send_json(404, {"error": "not_found", "detail": "RealmEye returned 404 for this player."})
            else:
                self._send_json(
                    502,
                    {"error": "upstream_http", "detail": f"RealmEye HTTP {e.code}", "url": getattr(e, "url", None)},
                )
            return
        except urllib.error.URLError as e:
            reason = getattr(e, "reason", e)
            self._send_json(502, {"error": "upstream_error", "detail": str(reason)})
            return
        except TimeoutError:
            self._send_json(504, {"error": "timeout", "detail": "RealmEye request timed out."})
            return

        self._send_json(200, data)
