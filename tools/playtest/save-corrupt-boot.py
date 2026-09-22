#!/usr/bin/env python3
"""save-corrupt-boot — issue #9 browser boot check (Playwright headless Chromium).

Seeds each corrupt save payload into localStorage BEFORE the page loads
(page.add_init_script), boots the booth app against a private serve.py, and
asserts the real-browser contract the unit matrix cannot see:

  1. zero pageerror events            (the v1 shim must never throw at boot)
  2. #fatal stays hidden              (no fatal overlay on a corrupt save)
  3. #screen-title reaches .active    (boot completes to the title screen)
  4. case e: a VALID save still enables Continue (progress preserved)

A final "fatal-surface probe" (clean storage) throws a synthetic error and then
a synthetic unhandled rejection and asserts #fatal becomes visible with the
message — this is the acceptance proof that the fatal handler is registered
BEFORE the risky boot calls (the ordering fix of issue #9). It runs LAST so it
cannot pollute the payload cases.

Mirrors tools/playtest/playtest.py conventions on purpose (serve via serve.py,
--port flag, headless 1000×640) but is explicitly NOT wired into --smoke-manifest.

Usage: python3 tools/playtest/save-corrupt-boot.py [--port 8609]
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
KEY = "allin-arcade-save-v1"

# (label, raw value to seed, expect_continue_enabled)
# JS string literals — values are seeded verbatim via localStorage.setItem.
CASES = [
    ("a: invalid JSON", '"{oops"', False),
    ("b: THE REPRO settings:'x'", '{"version":1,"settings":"x"}', False),
    ("c: completed:'yes' lives:'many'", '{"version":1,"completed":"yes","lives":"many"}', False),
    ("d: version 2 -> fresh", '{"version":2,"completed":{"L01":1}}', False),
    ("e: VALID save -> progress kept", '{"version":1,"completed":{"L01":123},"lives":5,"settings":{"volume":0.4}}', True),
]


def log(*a):
    print("[save-corrupt-boot]", *a, flush=True)


def js_str(value):
    """Embed a Python str as a JS string literal (payloads are short ASCII)."""
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'"


def start_server(port):
    proc = subprocess.Popen([sys.executable, "serve.py", "--port", str(port)],
                            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    base = "http://127.0.0.1:%d" % port
    for _ in range(60):
        try:
            urllib.request.urlopen(base, timeout=0.6)
            return proc
        except Exception:
            time.sleep(0.25)
    proc.kill()
    raise SystemExit("[save-corrupt-boot] server failed to start on %s" % base)


def new_case_page(pw_browser, payload_js):
    """Fresh context per case: init scripts persist per context, so isolation
    comes from a new context rather than script juggling."""
    ctx = pw_browser.new_context(viewport={"width": 1000, "height": 640})
    page = ctx.new_page()
    perr = []
    page.on("pageerror", lambda e: perr.append(str(e)))
    if payload_js is not None:
        page.add_init_script(
            "try { localStorage.setItem('%s', %s); } catch (e) {}" % (KEY, payload_js)
        )
    return ctx, page, perr


def boot_case(pw_browser, base, label, payload_js, expect_continue):
    r = {"case": label, "ok": False, "perr": [], "titleActive": False,
         "fatalHidden": None, "continueEnabled": None, "error": None}
    ctx, page, perr = new_case_page(pw_browser, payload_js)
    try:
        page.goto(base + "/", timeout=15000)
        page.wait_for_selector("#screen-title.active", timeout=10000)
        r["titleActive"] = True
        r["fatalHidden"] = page.evaluate(
            "getComputedStyle(document.querySelector('#fatal')).display") == "none"
        if expect_continue:
            r["continueEnabled"] = page.evaluate(
                "!document.querySelector('#btnContinue').disabled")
        time.sleep(0.3)  # let late async errors (rejections) surface
        r["perr"] = list(perr)
        r["ok"] = (not perr) and r["titleActive"] and r["fatalHidden"] \
            and (r["continueEnabled"] in (None, True))
    except Exception as e:
        r["perr"] = list(perr)
        r["error"] = str(e)
    finally:
        shots = os.path.join(tempfile.gettempdir(), "issue-9-shots")
        os.makedirs(shots, exist_ok=True)
        page.screenshot(path=os.path.join(shots,
                                          "save-corrupt-%s.png" % label.split(":")[0].strip()))
        ctx.close()
    return r


def fatal_surface_probe(pw_browser, base):
    """Layer-2 proof: a crash AFTER boot must paint #fatal (issue #9's ordering
    fix). Probes both surfaces: window 'error' and 'unhandledrejection' (a sync
    throw inside the async boot() rejects boot()'s promise — only the rejection
    listener sees those; see src/app.js)."""
    r = {"case": "fatal-surface probe", "ok": False, "error": None}
    ctx, page, perr = new_case_page(pw_browser, None)
    try:
        page.goto(base + "/", timeout=15000)
        page.wait_for_selector("#screen-title.active", timeout=10000)

        def visible_with(frag):
            disp = page.evaluate("getComputedStyle(document.querySelector('#fatal')).display")
            body = page.evaluate("document.querySelector('#fatal').innerText")
            return disp != "none" and frag in body

        page.evaluate("setTimeout(() => { throw new Error('fatal-probe-sync'); }, 0)")
        page.wait_for_timeout(400)
        if not visible_with("fatal-probe-sync"):
            r["error"] = "window.error probe: #fatal did not show the message"
            return r
        page.reload()
        page.wait_for_selector("#screen-title.active", timeout=10000)
        page.evaluate("setTimeout(() => { Promise.reject(new Error('fatal-probe-rej')); }, 0)")
        page.wait_for_timeout(400)
        if not visible_with("fatal-probe-rej"):
            r["error"] = "unhandledrejection probe: #fatal did not show the message"
            return r
        r["ok"] = True
    except Exception as e:
        r["error"] = str(e)
    finally:
        ctx.close()
    return r


def main():
    ap = argparse.ArgumentParser(description="Issue #9 corrupt-save boot check")
    ap.add_argument("--port", type=int, default=8609,
                    help="private serve.py port (fleet scheme 8600 + issue %% 200)")
    args = ap.parse_args()

    server = start_server(args.port)
    base = "http://127.0.0.1:%d" % args.port
    results = {"port": args.port, "base": base, "cases": [], "probe": None}
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                npass = 0
                for label, payload, expect_continue in CASES:
                    # payload is the raw storage VALUE; js_str embeds it as a JS
                    # string literal (bare JSON in arg position would be a SyntaxError
                    # silently swallowed by the init script's try/catch)
                    r = boot_case(browser, base, label, js_str(payload), expect_continue)
                    results["cases"].append(r)
                    npass += 1 if r["ok"] else 0
                    log("%s %s — title=%s fatalHidden=%s perr=%d continue=%s" % (
                        "PASS" if r["ok"] else "FAIL", label, r["titleActive"],
                        r["fatalHidden"], len(r["perr"]), r["continueEnabled"]))
                    if not r["ok"]:
                        if r["perr"]:
                            log("      perr=" + "; ".join(r["perr"][:2]))
                        if r["error"]:
                            log("      error=%s" % (r["error"],))
                probe = fatal_surface_probe(browser, base)
                results["probe"] = probe
                npass += 1 if probe["ok"] else 0
                log("%s %s%s" % ("PASS" if probe["ok"] else "FAIL", probe["case"],
                                 ("" if probe["ok"] else " — " + str(probe["error"]))))
                total = len(CASES) + 1
                log("=== save-corrupt-boot: %d/%d passed (port %d) ===" % (npass, total, args.port))
                results["passed"] = npass
                results["total"] = total
                print(json.dumps(results, indent=2))
                sys.exit(0 if npass == total else 1)
            finally:
                browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except Exception:
            server.kill()


if __name__ == "__main__":
    main()
