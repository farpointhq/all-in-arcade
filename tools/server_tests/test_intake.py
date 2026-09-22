#!/usr/bin/env python3
"""Issue #17 — kiosk intake hardening suite (sandboxed; never touches real submissions/).

Boots the repo's serve.py from a tmp SANDBOX copy (serve.py + static files copied
into a fresh tmp root) with --submissions-dir pointed at a tmp dir. The real
repo's submissions/ directory is never read or written by this suite.

Covers the four hardening areas from the plan:
  1. POST /api/submit guard chain   — 411 chunked, 413 oversize (+ no socket desync),
                                      400 malformed, 422 missing fields
  2. static path containment        — encoded/raw traversal, control chars,
                                      symlink escape; legit files still 200
  3. field caps + rotation          --rotate-mb / --keep-rotated
  4. client offline-queue re-flush  — Playwright E2E (skipped if Playwright absent)

Run:  python3 tools/server_tests/test_intake.py -v
"""
import glob
import http.client
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request

try:
    from playwright.sync_api import sync_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOST = "127.0.0.1"
VALID = {
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "username": "@ada",
    "genre": "platformer",
    "prompt": "A moon made of pianos",
}


def free_port():
    s = socket.socket()
    s.bind((HOST, 0))
    port = s.getsockname()[1]
    s.close()
    return port


def wait_for(fn, timeout=15.0, interval=0.1):
    """Poll fn() until truthy; raise AssertionError with the last value otherwise."""
    end = time.time() + timeout
    last = None
    while time.time() < end:
        try:
            last = fn()
            if last:
                return last
        except Exception as e:  # transient (conn refused, file mid-write, ...)
            last = e
        time.sleep(interval)
    raise AssertionError("condition not met within %.1fs (last: %r)" % (timeout, last))


class Sandbox:
    """tmp copy of the repo (serve.py + optional real static tree) + tmp submissions dir."""

    def __init__(self, full_static=False):
        self.root = tempfile.mkdtemp(prefix="allin-intake-")
        self.submissions = os.path.join(self.root, "submissions-tmp")
        os.makedirs(self.submissions)
        shutil.copy2(os.path.join(REPO_ROOT, "serve.py"), os.path.join(self.root, "serve.py"))
        if full_static:
            # real client (index.html + src/ + assets/) so Playwright can boot the game
            shutil.copy2(os.path.join(REPO_ROOT, "index.html"), os.path.join(self.root, "index.html"))
            shutil.copytree(os.path.join(REPO_ROOT, "src"), os.path.join(self.root, "src"))
            assets = os.path.join(REPO_ROOT, "assets")
            if os.path.isdir(assets):
                shutil.copytree(assets, os.path.join(self.root, "assets"))
            lv = os.path.join(self.root, "levels")
            os.makedirs(lv)
            with open(os.path.join(lv, "manifest.json"), "w", encoding="utf-8") as f:
                json.dump({"schema": 1, "levels": []}, f)
        else:
            with open(os.path.join(self.root, "index.html"), "w", encoding="utf-8") as f:
                f.write("<!doctype html><title>intake sandbox</title>")
            os.makedirs(os.path.join(self.root, "src"))
            with open(os.path.join(self.root, "src", "app.js"), "w", encoding="utf-8") as f:
                f.write("// sandbox static\n")
        self.proc = None
        self.port = None
        self.log = None

    def start(self, extra_args=()):
        self.port = free_port()
        self.log = open(os.path.join(self.root, "server.log"), "w")
        cmd = [sys.executable, "serve.py", "--port", str(self.port),
               "--submissions-dir", self.submissions] + list(extra_args)
        self.proc = subprocess.Popen(cmd, cwd=self.root, stdout=self.log,
                                     stderr=subprocess.STDOUT)
        base = "http://%s:%d" % (HOST, self.port)
        try:
            wait_for(lambda: urllib.request.urlopen(base + "/api/health", timeout=1).status == 200,
                     timeout=10)
        except Exception:
            self.stop()
            with open(os.path.join(self.root, "server.log"), "r", encoding="utf-8") as f:
                raise AssertionError("sandbox server failed to start:\n%s" % f.read())
        return base

    def stop(self):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except Exception:
                self.proc.kill()
            self.proc = None
        if self.log:
            self.log.close()
            self.log = None

    def cleanup(self):
        self.stop()
        shutil.rmtree(self.root, ignore_errors=True)

    @property
    def pending(self):
        return os.path.join(self.submissions, "pending.jsonl")

    def pending_lines(self):
        if not os.path.isfile(self.pending):
            return []
        with open(self.pending, "r", encoding="utf-8") as f:
            return [json.loads(l) for l in f.read().splitlines() if l.strip()]

    def rotated(self):
        return sorted(glob.glob(os.path.join(self.submissions, "pending-*.jsonl")))


class ServerCase(unittest.TestCase):
    """Base: one sandboxed serve.py per test class."""

    full_static = False
    extra_args = ()

    @classmethod
    def setUpClass(cls):
        cls.sb = Sandbox(full_static=cls.full_static)
        cls.base = cls.sb.start(extra_args=cls.extra_args)

    @classmethod
    def tearDownClass(cls):
        cls.sb.cleanup()

    def setUp(self):
        # fresh queue state per test — the class's sandbox server stays up, so
        # tests must not see each other's appended records
        for p in [self.sb.pending] + self.sb.rotated():
            try:
                os.remove(p)
            except OSError:
                pass

    def post(self, body, headers=None, path="/api/submit"):
        conn = http.client.HTTPConnection(HOST, self.sb.port, timeout=10)
        try:
            conn.request("POST", path, body=body,
                         headers=headers or {"Content-Type": "application/json"})
            r = conn.getresponse()
            return r.status, r.read()
        finally:
            conn.close()

    def get(self, path):
        conn = http.client.HTTPConnection(HOST, self.sb.port, timeout=10)
        try:
            conn.request("GET", path)
            r = conn.getresponse()
            return r.status, r.read()
        finally:
            conn.close()


class HealthTests(ServerCase):
    def test_health_ok(self):
        with urllib.request.urlopen(self.base + "/api/health", timeout=5) as r:
            self.assertEqual(r.status, 200)
            self.assertTrue(json.loads(r.read())["ok"])


class SubmitGuardTests(ServerCase):
    # ---- happy path ----------------------------------------------------------
    def test_happy_path_appends_record(self):
        status, body = self.post(json.dumps(VALID).encode("utf-8"))
        self.assertEqual(status, 200, body[:200])
        self.assertTrue(json.loads(body)["ok"])
        recs = self.sb.pending_lines()
        self.assertEqual(len(recs), 1)
        rec = recs[0]
        for k in ("ts", "name", "email", "username", "genre", "prompt"):
            self.assertIn(k, rec)
        self.assertEqual(rec["name"], "Ada Lovelace")
        self.assertEqual(rec["username"], "ada")  # leading @ stripped
        self.assertEqual(rec["genre"], "platformer")

    def test_malformed_json_is_400(self):
        status, _ = self.post(b"{not json")
        self.assertEqual(status, 400)
        self.assertEqual(self.sb.pending_lines(), [])

    def test_missing_fields_are_422(self):
        for missing in ("name", "email", "prompt"):
            rec = {k: v for k, v in VALID.items() if k != missing}
            status, _ = self.post(json.dumps(rec).encode("utf-8"))
            self.assertEqual(status, 422, "missing %s must be 422" % missing)
        self.assertEqual(self.sb.pending_lines(), [])

    # ---- 413 oversize --------------------------------------------------------
    def test_oversize_is_413_and_socket_stays_usable(self):
        conn = http.client.HTTPConnection(HOST, self.sb.port, timeout=15)
        try:
            big = b'{"prompt":"' + b"p" * 70000 + b'"}'
            conn.request("POST", "/api/submit", body=big,
                         headers={"Content-Type": "application/json"})
            r = conn.getresponse()
            self.assertEqual(
                r.status, 413,
                "oversize must be a real 413 (was silently truncated to 400 'bad json')")
            r.read()
            self.assertEqual(self.sb.pending_lines(), [], "oversize must not be appended")
            # follow-up on the SAME connection object must succeed — no socket desync
            conn.request("POST", "/api/submit", body=json.dumps(VALID).encode("utf-8"),
                         headers={"Content-Type": "application/json"})
            r2 = conn.getresponse()
            self.assertEqual(r2.status, 200, "follow-up request must not desync")
            self.assertEqual(len(self.sb.pending_lines()), 1)
        finally:
            conn.close()

    # ---- 411 chunked ---------------------------------------------------------
    def test_chunked_transfer_encoding_is_411(self):
        conn = http.client.HTTPConnection(HOST, self.sb.port, timeout=10)
        try:
            conn.putrequest("POST", "/api/submit")
            conn.putheader("Transfer-Encoding", "chunked")
            conn.putheader("Content-Type", "application/json")
            conn.endheaders()
            conn.send(b"5\r\nhello\r\n0\r\n\r\n")
            r = conn.getresponse()
            self.assertEqual(r.status, 411, "chunked bodies must be rejected with 411")
        finally:
            conn.close()

    # ---- replay metadata -----------------------------------------------------
    def test_replayed_backlog_keeps_original_ts_and_replay_marker(self):
        rec = dict(VALID, ts="2026-01-01T00:00:00.000Z", id="seed-1", replay=True)
        status, _ = self.post(json.dumps(rec).encode("utf-8"))
        self.assertEqual(status, 200)
        line = self.sb.pending_lines()[0]
        self.assertEqual(line["ts"], "2026-01-01T00:00:00.000Z")
        self.assertEqual(line["replay"], True)
        self.assertEqual(line["id"], "seed-1")

    def test_direct_submit_gets_server_ts_and_no_replay_marker(self):
        status, _ = self.post(json.dumps(VALID).encode("utf-8"))
        self.assertEqual(status, 200)
        line = self.sb.pending_lines()[0]
        self.assertNotIn("replay", line)
        self.assertNotIn("id", line)
        self.assertTrue(line["ts"].startswith(time.strftime("%Y-%m-%dT")))

    # ---- field caps ----------------------------------------------------------
    def test_field_caps_truncate(self):
        long_rec = dict(VALID,
                        name="N" * 120,                    # cap 80
                        email="e@" + "E" * 119,            # 121 chars, cap 120, keeps '@'
                        username="U" * 100,                # cap 40
                        genre="G" * 100,                   # cap 40
                        prompt="P" * 3000)                 # cap 2000
        status, body = self.post(json.dumps(long_rec).encode("utf-8"))
        self.assertEqual(status, 200, body[:200])
        recs = self.sb.pending_lines()
        self.assertEqual(len(recs), 1)
        rec = recs[0]
        self.assertEqual(len(rec["name"]), 80)
        self.assertEqual(len(rec["email"]), 120)
        self.assertEqual(len(rec["username"]), 40)
        self.assertEqual(len(rec["genre"]), 40)
        self.assertEqual(len(rec["prompt"]), 2000)


class PathContainmentTests(ServerCase):
    def test_traversal_blocked_403(self):
        for p in ("/../../etc/passwd",
                  "/%2e%2e/%2e%2e/etc/passwd",
                  "/src/../../../etc/passwd",
                  "/..%2f..%2fetc%2fpasswd"):
            status, _ = self.get(p)
            self.assertEqual(status, 403, "path %r must be 403" % p)

    def test_control_chars_rejected_403_not_500(self):
        for p in ("/%00evil", "/foo%0abar", "/evil%1f.js"):
            status, _ = self.get(p)
            self.assertEqual(status, 403,
                             "path %r must be a clean 403 (was an unhandled ValueError)" % p)

    def test_symlink_escape_blocked_403(self):
        outside = tempfile.mkdtemp(prefix="allin-outside-")
        try:
            with open(os.path.join(outside, "secret.txt"), "w", encoding="utf-8") as f:
                f.write("top secret")
            os.symlink(outside, os.path.join(self.sb.root, "sneaky"))
            status, _ = self.get("/sneaky/secret.txt")
            self.assertEqual(status, 403, "symlink escaping the root must be 403")
        finally:
            shutil.rmtree(outside, ignore_errors=True)

    def test_legitimate_files_still_served(self):
        status, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertTrue(body, "index must be served")
        status, body = self.get("/src/app.js")
        self.assertEqual(status, 200)
        self.assertTrue(body)
        status, _ = self.get("/favicon.ico")
        self.assertEqual(status, 204)


class RotationTests(ServerCase):
    extra_args = ("--rotate-mb", "0.001", "--keep-rotated", "2")

    def test_rotation_creates_rotated_files_and_prunes(self):
        rec = json.dumps(dict(VALID, prompt="R" * 1500)).encode("utf-8")  # ~1.6KB > 0.001MB
        for _ in range(6):
            status, _ = self.post(rec)
            self.assertEqual(status, 200)
        rotated = self.sb.rotated()
        self.assertGreaterEqual(len(rotated), 1, "at least one rotation must have happened")
        self.assertLessEqual(len(rotated), 2, "--keep-rotated must prune the oldest")
        for path in rotated:
            with open(path, "r", encoding="utf-8") as f:
                lines = [l for l in f.read().splitlines() if l.strip()]
            self.assertGreater(len(lines), 0, "rotated file %s must not be empty" % path)
            for l in lines:
                json.loads(l)  # every line is valid JSON
        self.assertEqual(self.sb.pending_lines(), [],
                         "fresh pending.jsonl after rotation must be empty")


@unittest.skipUnless(HAS_PLAYWRIGHT, "playwright not installed")
class ClientFlushE2E(ServerCase):
    """Real client (index.html + src/) against the sandbox server."""
    full_static = True

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._pw = sync_playwright().start()
        cls.browser = cls._pw.chromium.launch(headless=True)
        cls.ctx = cls.browser.new_context(viewport={"width": 1100, "height": 700})

    @classmethod
    def tearDownClass(cls):
        cls.ctx.close()
        cls.browser.close()
        cls._pw.stop()
        super().tearDownClass()

    def test_form_maxlength_attrs(self):
        page = self.ctx.new_page()
        page.goto(self.base)
        expected = {"#kFirst": "40", "#kLast": "40", "#kEmail": "120",
                    "#kHandle": "40", "#kPrompt": "2000"}
        for sel, ml in expected.items():
            self.assertEqual(page.get_attribute(sel, "maxlength"), ml,
                             "%s must carry maxlength=%s" % (sel, ml))
        page.close()

    def test_seeded_backlog_flushes_on_boot_in_order(self):
        page = self.ctx.new_page()
        page.add_init_script(
            "localStorage.setItem('allin-pending', JSON.stringify(["
            "{ts:'2026-01-01T00:00:00.000Z',id:'seed-1',replay:true,name:'Seed One',"
            "email:'s1@x.io',username:'s1',genre:'surprise',prompt:'seed one'},"
            "{ts:'2026-01-01T00:00:01.000Z',id:'seed-2',replay:true,name:'Seed Two',"
            "email:'s2@x.io',username:'s2',genre:'surprise',prompt:'seed two'}"
            "]));")
        page.goto(self.base)
        wait_for(lambda: len(self.sb.pending_lines()) == 2, timeout=15)
        recs = self.sb.pending_lines()
        self.assertEqual([r["id"] for r in recs], ["seed-1", "seed-2"],
                         "backlog must be delivered in order")
        left = page.evaluate("localStorage.getItem('allin-pending')")
        self.assertEqual(json.loads(left or "[]"), [], "queue must be emptied after flush")
        toast = page.text_content("#toast") or ""
        self.assertIn("Delivered 2 saved ideas", toast, "delivery toast must confirm the flush")
        page.close()

    def test_failed_submit_queues_offline_and_server_sees_nothing(self):
        ctx = self.browser.new_context()
        ctx.route("**/api/submit", lambda route: route.abort())
        page = ctx.new_page()
        page.goto(self.base)
        page.click('button[data-act="kiosk"]')
        page.fill("#kFirst", "Grace")
        page.fill("#kLast", "Hopper")
        page.fill("#kEmail", "grace@example.com")
        page.fill("#kPrompt", "A compiler dungeon")
        page.click('#kioskForm button[type="submit"]')
        wait_for(lambda: page.evaluate(
            "JSON.parse(localStorage.getItem('allin-pending')||'[]').length") == 1)
        self.assertEqual(self.sb.pending_lines(), [],
                         "nothing may reach the server while it is unreachable")
        status = page.text_content("#kioskStatus") or ""
        self.assertIn("saved on this machine", status)
        ctx.close()

    def test_413_direct_submit_shows_trim_message_and_is_not_queued(self):
        ctx = self.browser.new_context()
        ctx.route("**/api/submit", lambda route: route.fulfill(
            status=413, content_type="application/json",
            body=json.dumps({"ok": False, "error": "payload too large"})))
        page = ctx.new_page()
        page.goto(self.base)
        page.click('button[data-act="kiosk"]')
        page.fill("#kFirst", "Edsger")
        page.fill("#kLast", "Dijkstra")
        page.fill("#kEmail", "edsger@example.com")
        page.fill("#kPrompt", "A labyrinth of semicolons")
        page.click('#kioskForm button[type="submit"]')
        wait_for(lambda: "too long" in (page.text_content("#kioskStatus") or ""))
        queued = page.evaluate("JSON.parse(localStorage.getItem('allin-pending')||'[]').length")
        self.assertEqual(queued, 0, "a 413 must never be queued (poison pill)")
        ctx.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
