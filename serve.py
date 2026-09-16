#!/usr/bin/env python3
"""ALL IN ARCADE booth server: static hosting + attendee-submission intake.

Endpoints:
  GET  /               → index.html (static hosting for everything else)
  GET  /api/health     → {"ok": true}
  GET  /api/levels     → merged manifest + per-level JSON (drives UI + credits)
  POST /api/submit     → appends attendee submission to submissions/pending.jsonl

Usage: python3 serve.py [--port 8181]
"""
import argparse
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
SUBMISSIONS_DIR = os.path.join(ROOT, "submissions")
SUBMISSIONS_FILE = os.path.join(SUBMISSIONS_DIR, "pending.jsonl")
LOCK = __import__("threading").Lock()

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
    def _send(self, code, body, ctype="application/json; charset=utf-8", no_store=True):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, must-revalidate" if no_store else "public, max-age=60")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            self.wfile.write(body if isinstance(body, bytes) else body.encode("utf-8"))
        except BrokenPipeError:
            pass

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj), "application/json; charset=utf-8")

    # ---- GET -----------------------------------------------------------------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self._json({"ok": True, "time": time.time()})
        if path == "/api/levels":
            return self._json(self._level_list())
        return self._serve_file(path)

    def _serve_file(self, path):
        if path in ("/", "/index.html"):
            rel = "index.html"
        else:
            rel = path.lstrip("/")
        fs = os.path.normpath(os.path.join(ROOT, rel))
        if not fs.startswith(os.path.normpath(ROOT + os.sep)) and fs != os.path.normpath(ROOT):
            return self._send(403, b"forbidden", "text/plain")
        if not os.path.isfile(fs):
            if path == "/favicon.ico":
                return self._send(204, b"")
            return self._send(404, "not found: %s" % path, "text/plain")
        ext = os.path.splitext(fs)[1].lower()
        with open(fs, "rb") as f:
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
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 64_000)
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as e:
            return self._json({"ok": False, "error": "bad json: %s" % e}, 400)
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
        os.makedirs(SUBMISSIONS_DIR, exist_ok=True)
        line = json.dumps(record, ensure_ascii=False).replace("\n", " ")
        with LOCK:
            with open(SUBMISSIONS_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        print("[submit] ✓ %s: %s" % (record["name"], record["prompt"][:60]))
        return self._json({"ok": True, "queued": True})


def load_manifest():
    p = os.path.join(ROOT, "levels", "manifest.json")
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8181)
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print("ALL IN ARCADE booth server → http://localhost:%d  (Ctrl+C to stop)" % args.port)
    print("Submissions land in: %s" % os.path.relpath(SUBMISSIONS_FILE, ROOT))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye — thanks for playing!")


if __name__ == "__main__":
    main()
