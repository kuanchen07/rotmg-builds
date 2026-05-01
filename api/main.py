"""
Vercel Python entrypoint (must be main.py / index.py / app.py per Vercel).

Endpoint: GET /api/main?username=NAME

Environment:
  CORS_ORIGIN — Access-Control-Allow-Origin (default *).
  ALLOWED_PLAYERS — optional comma-separated lowercase names; if set, others get 403.
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


def _cors_origin() -> str:
    return (os.environ.get("CORS_ORIGIN") or "*").strip() or "*"


def _allowed_players() -> set[str] | None:
    raw = (os.environ.get("ALLOWED_PLAYERS") or "").strip()
    if not raw:
        return None
    return {x.strip().lower() for x in raw.split(",") if x.strip()}


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

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", _cors_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", _cors_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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

        allowed = _allowed_players()
        if allowed is not None and username.lower() not in allowed:
            self._send_json(
                403,
                {"error": "forbidden", "detail": "Player not in ALLOWED_PLAYERS on this deployment."},
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
