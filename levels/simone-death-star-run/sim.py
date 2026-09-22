#!/usr/bin/env python3
"""sim — Death Star Run climb-mapping verification rig (Playwright headless Chromium).

Booth protocol: rAF throttling kills the shared Fabric tab, so the live verdict runs on
headless Chromium (compositor alive) against a PRIVATE serve.py port (8600 + 12 % 200).

Issue #12: star-racer's playerY is an ALTITUDE (+1 = ceiling, -1 = floor), so ArrowUp
must climb. This rig boots ?level=<LID>&debug=1&fast=4, holds REAL keys via Playwright,
and asserts crossing-based movement of window.__SR.read().playerY:

  up     hold ArrowUp  -> playerY rises, crossing +0.5   (was: sinks to the floor — the bug)
  down   hold ArrowDown-> playerY falls, crossing -0.5
  KeyW   hold KeyW     -> playerY rises, crossing +0.5   (W parity via core.js up())
  KeyS   hold KeyS     -> playerY falls, crossing -0.5   (S parity via core.js downKey())
  neutral hold ArrowUp+ArrowDown together -> climb sums to 0, playerY must not drift

Boot smoke: network gate is URL-based via a response listener (a resource 404's console
text does NOT carry its URL, so BOOTH_FILTER can't match it there — same gate as
 tools/playtest/playtest.py); console gate drops resource-load lines; zero pageerrors.
Status stays "playing" in every sample, and the result overlay never appears during the
assertion window (the run is far from any death). Captures shot-live-up.png /
shot-live-down.png at the crossing moment as visual evidence (ship visibly high / low).
Writes sim-results.json in THIS folder. Exit 0 only on pass.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LID = "simone-death-star-run"
ROOT = os.path.dirname(os.path.dirname(HERE))
PORT = 8612  # unique per chat/issue: 8600 + (12 % 200)
BASE = "http://127.0.0.1:%d" % PORT

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")

POLL_S = 0.2          # poll cadence (~0.2 altitude per poll at fast=4 — cannot skip the band)
PHASE_CAP_S = 3.0     # generous per-phase hold cap (crossing lands in ~0.3 s at fast=4)
NEUTRAL_HOLD_S = 1.2  # both-keys-held observation window
NEUTRAL_DRIFT = 0.05  # max allowed playerY drift when climb sums to 0
BAND = 0.5            # crossing threshold: |playerY| must actually reach it

STATE = "() => (window.__SR ? window.__SR.read() : null)"
RESULT_UP = "() => !!document.querySelector('#screen-result.active')"


def start_server():
    proc = subprocess.Popen([sys.executable, "serve.py", "--port", str(PORT)],
                            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE, timeout=0.6)
            return proc
        except Exception:
            time.sleep(0.25)
    proc.kill()
    raise SystemExit("[sim] server failed to start on %s" % BASE)


def filtered(msgs):
    return [m for m in msgs if not any(t in m for t in BOOTH_FILTER)]


def wait_countdown(page):
    """The 2.2 s in-game countdown eats input — wait until runT starts accumulating."""
    t0 = time.time()
    while time.time() - t0 < 8.0:
        s = page.evaluate(STATE)
        if s and s.get("runT", 0) > 0:
            return s
        time.sleep(0.1)
    raise SystemExit("[sim] countdown never ended (no __SR.read().runT progress)")


def hold_and_track(page, keys, cap_s, direction):
    """Hold keys, sample playerY/status every POLL_S until cap_s.

    Crossing-based: releases early once the band is reached (the climb crosses in
    ~0.3 s at fast=4, so the cap is only the failure bound) — this keeps game-time
    exposure tiny so unrelated turret hits can't flake later phases.
    direction: +1 rising band, -1 falling band, 0 no-drift watch (always full hold).
    Returns (samples, hit).
    """
    for k in keys:
        page.keyboard.down(k)
    samples, hit = [], False
    t0 = time.time()
    while time.time() - t0 < cap_s:
        s = page.evaluate(STATE)
        if s:
            y = s.get("playerY")
            samples.append({"t": round(time.time() - t0, 2), "playerY": y,
                            "status": s.get("status")})
            if direction > 0 and y is not None and y >= BAND:
                hit = True
            elif direction < 0 and y is not None and y <= -BAND:
                hit = True
            if hit:
                break
        time.sleep(POLL_S)
    for k in keys:
        page.keyboard.up(k)
    return samples, hit


def run():
    results = {"lid": LID, "mode": "live", "port": PORT, "phases": {}}
    ok = True
    notes = []
    badnet = []  # "<status> <url>" for any >=400 response (URL-based gate)

    server = start_server()
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            # booth rule: the game never makes sound (matches tools/playtest/playtest.py:255)
            browser = pw.chromium.launch(headless=True, args=["--mute-audio"])
            page = browser.new_page(viewport={"width": 1000, "height": 640})
            console, perr = [], []
            page.on("console", lambda m: console.append("%s:%s" % (m.type, m.text)) if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: perr.append(str(e)))
            page.on("response", lambda r: badnet.append("%s %s" % (r.status, r.url))
                    if r.status >= 400 else None)

            page.goto(BASE + "/?level=" + LID + "&debug=1&fast=4")
            try:
                page.wait_for_selector("canvas", timeout=8000)
            except Exception:
                pass
            wait_countdown(page)

            def phase(name, keys, direction):
                """direction: +1 = must cross +BAND, -1 = must cross -BAND, 0 = must not drift."""
                nonlocal ok
                nonlocal notes
                samples, hit = hold_and_track(
                    page, keys, NEUTRAL_HOLD_S if direction == 0 else PHASE_CAP_S, direction)
                ys = [s["playerY"] for s in samples if s["playerY"] is not None]
                statuses = {s["status"] for s in samples}
                shot = None
                # capture unconditionally on every passing phase: a exists-guard made the
                # first-ever shot sticky, so stale captures from an older dev run shipped
                # alongside fresh sim-results.json and contradicted it (E2E finding F4)
                if direction > 0 and hit:
                    page.screenshot(path=shots["up"])  # ship visibly high — visual evidence
                    shot = "up"
                if direction < 0 and hit:
                    page.screenshot(path=shots["down"])  # ship visibly low — visual evidence
                    shot = "down"
                # the crossing must happen DURING this hold: net movement in the
                # intended direction is required, so a starting position already past
                # the band (e.g. inherited from the previous phase) can't pass alone
                if direction > 0 and ys:
                    hit = max(ys) >= BAND and ys[-1] > ys[0]
                elif direction < 0 and ys:
                    hit = min(ys) <= -BAND and ys[-1] < ys[0]
                elif direction == 0 and ys:
                    hit = (max(ys) - min(ys)) <= NEUTRAL_DRIFT
                passed = hit and statuses == {"playing"}
                if not passed:
                    ok = False
                    if statuses != {"playing"}:
                        notes.append("%s: status left 'playing' (%s)" % (name, sorted(statuses)))
                    if not hit:
                        notes.append("%s: no %s (ys %.2f..%.2f)" % (
                            name,
                            "crossing %+0.1f" % (BAND * direction) if direction else "drift <= %.2f" % NEUTRAL_DRIFT,
                            min(ys) if ys else float("nan"), max(ys) if ys else float("nan")))
                results["phases"][name] = {"ok": passed, "ys": ys, "shot": shot}
                print("[%s]" % name, "PASS" if passed else "FAIL",
                      "ys %.2f..%.2f" % (min(ys), max(ys)) if ys else "no samples")

            shots = {"up": os.path.join(HERE, "shot-live-up.png"),
                     "down": os.path.join(HERE, "shot-live-down.png")}

            phase("up-ArrowUp", ["ArrowUp"], +1)      # THE fix pin: was floor-hug before #12
            phase("down-ArrowDown", ["ArrowDown"], -1)
            phase("up-KeyW", ["KeyW"], +1)            # W parity (core.js: KeyW -> up())
            phase("down-KeyS", ["KeyS"], -1)          # S parity (core.js: KeyS -> downKey())
            phase("neutral-both", ["ArrowUp", "ArrowDown"], 0)  # climb sums to 0

            result_visible = page.evaluate(RESULT_UP)
            if result_visible:
                ok = False
                notes.append("result overlay appeared during the assertion window")

            # same gate as tools/playtest/playtest.py: resource 404s carry no URL in
            # console text, so network problems are judged by response URL, and the
            # console gate drops resource-load lines
            console_clean = not [c for c in filtered(console)
                                 if c.startswith("error:")
                                 and not c.startswith("error:Failed to load resource")]
            net_clean = not filtered(badnet)
            perr_clean = not filtered(perr)
            boot_ok = console_clean and net_clean and perr_clean
            if not boot_ok:
                ok = False
                notes.append("boot gate: console_clean=%s net_clean=%s perr_clean=%s badnet=%s"
                             % (console_clean, net_clean, perr_clean, filtered(badnet)[:3]))
            results["boot"] = {"ok": boot_ok, "console": filtered(console)[-10:], "perr": filtered(perr),
                               "badnet": filtered(badnet)[-10:], "resultVisible": result_visible}
            print("[boot]", "PASS" if boot_ok else "FAIL")

            page.screenshot(path=os.path.join(HERE, "shot-live-end.png"))
            browser.close()
    finally:
        server.kill()

    results["ok"] = ok
    results["notes"] = notes
    path = os.path.join(HERE, "sim-results.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("OVERALL", "PASS" if ok else "FAIL", notes, "->", os.path.relpath(path, ROOT))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    run()
