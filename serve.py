#!/usr/bin/env python3
"""ALL IN ARCADE booth server: static hosting + attendee-submission intake.

Endpoints:
  GET  /               → index.html (static hosting for everything else)
  GET  /api/health     → {"ok": true}
  GET  /api/levels     → merged manifest + per-level JSON (drives UI + credits)
  POST /api/submit     → appends attendee submission to submissions/pending.jsonl

Usage: python3 serve.py [--port 8181] [--submissions-dir DIR]
                        [--rotate-mb MB] [--keep-rotated N]

Defaults are unchanged — booth-server.sh keeps calling plain `python3 serve.py`.
"""
import argparse
import glob
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
SUBMISSIONS_DIR = os.path.join(ROOT, "submissions")
SUBMISSIONS_FILE = os.path.join(SUBMISSIONS_DIR, "pending.jsonl")
LOCK = __import__("threading").Lock()

# ---- intake hardening constants (issue #17) ---------------------------------
MAX_BODY_BYTES = 64_000   # POST /api/submit transport cap → real 413 above this
DRAIN_LIMIT = 1_000_000   # max unread body bytes discarded on a 413 (socket hygiene)
FIELD_CAPS = {"name": 80, "email": 120, "username": 40, "genre": 40, "prompt": 2000}
ROTATE_MB = 5.0           # overridden by --rotate-mb in main()
KEEP_ROTATED = 10         # overridden by --keep-rotated in main()

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "AllInArcade/1.0"

    def log_message(self, fmt, *args):  # quieter default logging
        if "/api/submit" in (args[0] if args else ""):
            print("[submit] %s" % (args[1] if len(args) > 1 else ""))
        else:
            print("[%s] %s" % (time.strftime("%H:%M:%S"), fmt % args))

    # ---- helpers -------------------------------------------------------------
    def _send(self, code, body, ctype="application/json; charset=utf-8", no_store=True,
              extra_headers=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, must-revalidate" if no_store else "public, max-age=60")
        self.send_header("Access-Control-Allow-Origin", "*")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(body if isinstance(body, bytes) else body.encode("utf-8"))
        except BrokenPipeError:
            pass

    def _json(self, obj, code=200, extra_headers=None):
        self._send(code, json.dumps(obj), "application/json; charset=utf-8",
                   extra_headers=extra_headers)

    # ---- GET -----------------------------------------------------------------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self._json({"ok": True, "time": time.time()})
        if path == "/api/levels":
            return self._json(self._level_list())
        return self._serve_file(path)

    def _serve_file(self, path):
        # containment chain (issue #17): decode FIRST, then judge.
        try:
            decoded = unquote(path)
        except Exception:
            return self._send(403, b"forbidden", "text/plain")
        if any(ord(c) < 32 or ord(c) == 127 for c in decoded):
            # null/control chars used to make open() raise an unhandled ValueError
            return self._send(403, b"forbidden", "text/plain")
        if path in ("/", "/index.html"):
            rel = "index.html"
        else:
            rel = decoded.lstrip("/")
        if any(seg == ".." for seg in rel.replace("\\", "/").split("/")):
            return self._send(403, b"forbidden", "text/plain")
        # realpath + commonpath containment against the module ROOT — closes the
        # symlink escape (a link inside the root pointing outside is now 403)
        root_real = os.path.realpath(ROOT)
        real = os.path.realpath(os.path.join(ROOT, rel))
        try:
            contained = os.path.commonpath([real, root_real]) == root_real
        except ValueError:
            contained = False
        if not contained:
            return self._send(403, b"forbidden", "text/plain")
        if not os.path.isfile(real):
            if path == "/favicon.ico":
                return self._send(204, b"")
            return self._send(404, "not found: %s" % path, "text/plain")
        ext = os.path.splitext(real)[1].lower()
        with open(real, "rb") as f:
            data = f.read()
        no_store = ext in (".html", ".json", ".js")
        self._send(200, data, MIME.get(ext, "application/octet-stream"), no_store=no_store)

    def _level_list(self):
        manifest = load_manifest()
        out = []
        for entry in manifest.get("levels", []):
            lid = entry.get("id")
            if not entry.get("enabled", True):
                continue
            lj = os.path.join(ROOT, "levels", lid, "level.json")
            if not os.path.isfile(lj):
                out.append({"id": lid, "missing": True})
                continue
            with open(lj, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError as e:
                    out.append({"id": lid, "broken": True, "error": str(e)})
                    continue
            for k in ("title", "genre", "authors", "brief", "objective", "version", "demo", "remixOf", "sample", "status", "order"):
                if k in data:
                    entry[k] = data[k]
            if "title" not in entry:
                entry["title"] = entry["id"]
            out.append(entry)
        return {"schema": manifest.get("schema", 1), "levels": out}

    # ---- POST ----------------------------------------------------------------
    def do_POST(self):
        if urlparse(self.path).path != "/api/submit":
            return self._json({"ok": False, "error": "unknown endpoint"}, 404)
        # guard chain (issue #17): 411 chunked → 413 oversize → 400 bad json → 422 missing
        if (self.headers.get("Transfer-Encoding") or "").strip().lower() == "chunked":
            return self._json({"ok": False, "error": "length required: send Content-Length"},
                              411, extra_headers={"Connection": "close"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except (TypeError, ValueError):
            length = 0
        if length > MAX_BODY_BYTES:
            # size decided from Content-Length alone — never read-then-truncate
            # (truncation produced a misleading 400 'bad json' and a poison pill
            # in the kiosk's offline queue). Drain what we can so the follow-up
            # request on this socket can't desync, then answer 413 + close.
            self._drain(length)
            return self._json({"ok": False, "error": "payload too large", "limit": MAX_BODY_BYTES},
                              413, extra_headers={"Connection": "close"})
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as e:
            return self._json({"ok": False, "error": "bad json: %s" % e}, 400)
        if not isinstance(payload, dict):
            return self._json({"ok": False, "error": "bad json: expected an object"}, 400)
        record = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "name": str(payload.get("name", "")).strip(),
            "email": str(payload.get("email", "")).strip(),
            "username": str(payload.get("username", "")).strip().lstrip("@"),
            "genre": str(payload.get("genre", "")).strip() or "auto",
            "prompt": str(payload.get("prompt", "")).strip(),
        }
        if not record["name"] or not record["prompt"] or "@" not in record["email"]:
            return self._json({"ok": False, "error": "name, email and prompt are required"}, 422)
        # replayed backlog records keep their ORIGINAL ts + replay marker + id
        # (issue #17): the agent reading pending.jsonl dedupes on these
        if payload.get("replay") is True:
            record["replay"] = True
            if isinstance(payload.get("id"), str) and payload["id"].strip():
                record["id"] = payload["id"].strip()[:64]
            if isinstance(payload.get("ts"), str) and payload["ts"].strip():
                record["ts"] = payload["ts"].strip()[:40]
        for k, cap in FIELD_CAPS.items():  # kiosk-friendly truncate, after validation
            record[k] = record[k][:cap]
        os.makedirs(SUBMISSIONS_DIR, exist_ok=True)
        line = json.dumps(record, ensure_ascii=False).replace("\n", " ")
        with LOCK:
            with open(SUBMISSIONS_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
            maybe_rotate()
        print("[submit] ✓ %s: %s" % (record["name"], record["prompt"][:60]))
        return self._json({"ok": True, "queued": True})

    def _drain(self, n):
        """Discard an unread request body (bounded) to keep the socket usable."""
        left = min(n, DRAIN_LIMIT)
        while left > 0:
            chunk = self.rfile.read(min(left, 65536))
            if not chunk:
                break
            left -= len(chunk)


def maybe_rotate():
    """Rename pending.jsonl once it exceeds ROTATE_MB; prune rotated files (issue #17).

    Called with LOCK held right after a successful append. Multiple rotations in
    the same second get a -N suffix; pruning keeps the newest KEEP_ROTATED files.
    """
    try:
        if not os.path.isfile(SUBMISSIONS_FILE):
            return
        if os.path.getsize(SUBMISSIONS_FILE) <= ROTATE_MB * 1024 * 1024:
            return
        stamp = time.strftime("%Y%m%d-%H%M%S")
        target = os.path.join(SUBMISSIONS_DIR, "pending-%s.jsonl" % stamp)
        n = 0
        while os.path.exists(target):
            n += 1
            target = os.path.join(SUBMISSIONS_DIR, "pending-%s-%d.jsonl" % (stamp, n))
        os.rename(SUBMISSIONS_FILE, target)
        rotated = sorted(glob.glob(os.path.join(SUBMISSIONS_DIR, "pending-*.jsonl")),
                         key=lambda p: (os.path.getmtime(p), p))
        stale = rotated if KEEP_ROTATED <= 0 else rotated[:-KEEP_ROTATED]
        for old in stale:
            try:
                os.remove(old)
            except OSError:
                pass
        print("[rotate] pending.jsonl → %s" % os.path.basename(target))
    except OSError as e:
        print("[rotate] failed: %s" % e)


def load_manifest():
    p = os.path.join(ROOT, "levels", "manifest.json")
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    global SUBMISSIONS_DIR, SUBMISSIONS_FILE, ROTATE_MB, KEEP_ROTATED
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8181)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--submissions-dir", default=SUBMISSIONS_DIR,
                    help="where pending.jsonl lands (default: <repo>/submissions)")
    ap.add_argument("--rotate-mb", type=float, default=5.0,
                    help="rotate pending.jsonl once it exceeds this many MB (default 5)")
    ap.add_argument("--keep-rotated", type=int, default=10,
                    help="how many rotated pending-*.jsonl files to keep (default 10)")
    args = ap.parse_args()
    SUBMISSIONS_DIR = args.submissions_dir
    SUBMISSIONS_FILE = os.path.join(SUBMISSIONS_DIR, "pending.jsonl")
    ROTATE_MB = args.rotate_mb
    KEEP_ROTATED = args.keep_rotated
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print("ALL IN ARCADE booth server → http://localhost:%d  (Ctrl+C to stop)" % args.port)
    print("Submissions land in: %s" % os.path.relpath(SUBMISSIONS_FILE, ROOT))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye — thanks for playing!")


if __name__ == "__main__":
    main()
