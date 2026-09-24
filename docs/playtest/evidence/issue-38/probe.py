#!/usr/bin/env python3
"""probe38 — issue #38 star-racer turret altitude-band verification rig (Playwright headless).

Booth protocol: rAF throttling kills the shared Fabric tab, so every verdict runs on
headless Chromium (compositor alive) against a PRIVATE serve.py port (8638 = 8600 + 38 % 200).
Browser sessions are muted at launch (--mute-audio): the game is never run with sound.

What it proves, per the issue's wording — floor-mounted turrets are only damageable when the
ship is in the floor band, ceiling-mounted only when in the ceiling band:

  static  every mount's logical y follows the playerY ALTITUDE convention (+ = ceiling, the
          line-326 pin): floor kinds at the floor band, ceiling kinds at the ceiling band.
  P1  ceiling-pinned ship X-spams past floor turret 0    -> NOT killed  (bug: killed)
  P2  floor-pinned ship X-spams past floor turret 0      -> killed      (bug: NOT killed — the
      swapped literal put floor mounts at ceiling altitude, so their own band could not hit them)
  P3  mid-altitude ship X-spams (the issue's X-spam scenario): floor turret 0 NOT killed
      (bug: killed) while wall turret 1 (y=0.1) IS killed at that same altitude -> the gate
      follows the mount's band, not merely "you held X"  (positive control, both trees)
  P4  floor-pinned ship X-spams past ceiling turret 2    -> NOT killed  (bug: killed)
  P5  ceiling-pinned ship X-spams past ceiling turret 2  -> killed      (bug: NOT killed)

Writes results-<expect>.json + shot-<expect>-<phase>.png next to this file. Exit 0 only on pass.

Usage:  python3 docs/playtest/evidence/issue-38/probe.py --expect before|after [--port 8638]
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))  # .../evidence/issue-38 -> repo root
LID = "simone-death-star-run"
SEG_LEN = 6  # world units per segment (src/genres/star-racer.js)

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")  # same gate as tools/playtest/playtest.py
STATE = "() => (window.__SR ? window.__SR.read() : null)"
POLL = 0.02  # controller cadence (s)

# fixture mirrored from src/genres/star-racer.js TURRET_SPOTS / TURRET_SIDES
TURRET_SPOTS = [0.14, 0.27, 0.36, 0.48, 0.6, 0.72, 0.86]
TURRET_SIDES = ["floor", "left", "ceiling", "right", "floor", "left", "ceiling"]
# mount -> the altitude band the ship must fly in for a blaster hit (playerY: + = ceiling)
EXPECTED_AFTER = {"floor": -0.82, "ceiling": 0.78, "left": 0.1, "right": 0.1}
EXPECTED_BEFORE = {"floor": 0.82, "ceiling": -0.78, "left": 0.1, "right": 0.1}  # the bug: swapped

# phase -> {subject turret index, altitude pinned, dead expectation per tree}
# P3's positive control: wall turret 1 (kind left, x=-0.82, y=0.1) must die from mid altitude
# in BOTH trees once the ship steers into its lane — same altitude, same X-hold, only the
# mount's band differs.
PHASES = [
    {"name": "P1-ceiling-vs-floor-turret", "subject": 0, "pin_y": 0.95,
     "expect": {"before": True, "after": False}},
    {"name": "P2-floor-vs-floor-turret", "subject": 0, "pin_y": -0.95,
     "expect": {"before": False, "after": True}},
    {"name": "P3-mid-xspam-vs-floor-turret", "subject": 0, "pin_y": 0.0,
     "expect": {"before": True, "after": False},
     "extra": {"turret": 1, "x": -0.5, "expect": {"before": True, "after": True}}},
    {"name": "P4-floor-vs-ceiling-turret", "subject": 2, "pin_y": -0.95,
     "expect": {"before": True, "after": False}},
    {"name": "P5-ceiling-vs-ceiling-turret", "subject": 2, "pin_y": 0.95,
     "expect": {"before": False, "after": True}},
]


def start_server(port):
    proc = subprocess.Popen([sys.executable, "serve.py", "--port", str(port)],
                            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    base = "http://127.0.0.1:%d" % port
    for _ in range(60):
        try:
            urllib.request.urlopen(base, timeout=0.6)
            return proc, base
        except Exception:
            time.sleep(0.25)
    proc.kill()
    raise SystemExit("[probe38] server failed to start on %s" % base)


def wait_run(page):
    """The 2.2s in-game countdown eats input — wait until runT starts accumulating."""
    t0 = time.time()
    while time.time() - t0 < 10.0:
        s = page.evaluate(STATE)
        if s and s.get("runT", 0) > 0:
            return s
        time.sleep(0.05)
    raise SystemExit("[probe38] countdown never ended (no __SR.read().runT progress)")


def release_all(page):
    for k in ("ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyX"):
        page.keyboard.up(k)


def hold_toward(page, key_inc, key_dec, cur, target, deadband, held):
    """Hold the key that moves `cur` toward `target`; release inside the deadband.
    `held` caches key state so Playwright only sees real transitions."""
    want = None
    if target is not None and abs(cur - target) > deadband:
        want = key_inc if cur < target else key_dec
    for k in (key_inc, key_dec):
        should = k == want
        if held.get(k) != should:
            (page.keyboard.down if should else page.keyboard.up)(k)
            held[k] = should


def run_phase(page, shot_path, name, subject, pin_y, expect_dead, extra, results):
    """Fly one phase, then assert the subject turret's dead state.

    Plan: pin altitude to pin_y (closed loop), hold X the whole way (the issue's X-spam
    scenario; tracer reach is SEG_LEN*30 = 180 world units), read the mount after passing.
    P3's `extra` steers to x=-0.5 in time for wall turret 1 as the positive control.
    """
    st = wait_run(page)
    z_sub = st["turrets"][subject]["z"]
    z_extra = st["turrets"][extra["turret"]]["z"] if extra else None
    held, trace = {}, []
    shot_taken = False
    t0 = time.time()

    if extra:
        legs = [(z_sub - 170, None, pin_y, True),          # approach + X-spam through the subject
                (900, 0.0, pin_y, True),                   # stay off the z=0.215 debris lane
                (z_extra + 90, extra["x"], pin_y, True),   # into the wall turret's lane
                (z_extra + 220, 0.0, pin_y, True)]         # back off the z=0.335 debris lane
    else:
        legs = [(z_sub - 170, None, pin_y, True),
                (z_sub + 70, None, pin_y, True)]

    for z_until, x_t, y_t, fire in legs:
        while True:
            st = page.evaluate(STATE)
            if st is None:
                raise SystemExit("[probe38] debug hook vanished mid-phase")
            hold_toward(page, "ArrowUp", "ArrowDown", st["playerY"], y_t, 0.03, held)
            hold_toward(page, "ArrowRight", "ArrowLeft", st["playerX"], x_t, 0.05, held)
            should_fire = fire and st["status"] == "playing"
            if held.get("KeyX") != should_fire:
                (page.keyboard.down if should_fire else page.keyboard.up)("KeyX")
                held["KeyX"] = should_fire
            pos = st["position"]
            if not shot_taken and pos > z_sub - 40:
                page.screenshot(path=shot_path)  # subject turret + ship altitude in frame
                shot_taken = True
            if not trace or pos - trace[-1]["position"] > 24:
                trace.append({"t": round(time.time() - t0, 2), "position": round(pos, 1),
                              "playerX": round(st["playerX"], 3), "playerY": round(st["playerY"], 3),
                              "hearts": st["hearts"], "status": st["status"],
                              "subject_hp": st["turrets"][subject]["hp"],
                              "subject_dead": st["turrets"][subject]["dead"]})
            if pos >= z_until or st["status"] != "playing":
                break
        release_all(page)
        held = {}
    st = page.evaluate(STATE)
    release_all(page)

    tu_final = st["turrets"][subject]
    dead = bool(tu_final["dead"])
    checks = {"subject": dead == expect_dead,
              "status_playing": st["status"] == "playing"}
    if extra:
        checks["positive_control_t%d" % extra["turret"]] = \
            bool(st["turrets"][extra["turret"]]["dead"]) == extra["expect"]
    ok = all(checks.values())
    out = {"phase": name, "subject": subject, "pin_y": pin_y, "dead": dead,
           "expected_dead": expect_dead, "hp": tu_final["hp"], "checks": checks, "ok": ok,
           "hearts": st["hearts"], "status": st["status"],
           "turrets_end": [{k: t[k] for k in ("z", "x", "y", "hp", "dead")} for t in st["turrets"]],
           "trace": trace}
    results["phases"][name] = out
    print("[%s] %s dead=%s expected=%s hearts=%s checks=%s"
          % (name, "PASS" if ok else "FAIL", dead, expect_dead, st["hearts"], checks))
    return ok, st["status"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--expect", choices=["before", "after"], required=True)
    ap.add_argument("--port", type=int, default=8638)
    args = ap.parse_args()
    before = args.expect == "before"

    results = {"probe": "issue-38 turret altitude band", "expect": args.expect, "port": args.port,
               "tree": ROOT, "phases": {}, "notes": []}
    ok = True

    server, base = start_server(args.port)
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=["--mute-audio"])
            page = browser.new_page(viewport={"width": 1000, "height": 640})
            console, perr, badnet = [], [], []
            page.on("console", lambda m: console.append("%s:%s" % (m.type, m.text)) if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: perr.append(str(e)))
            page.on("response", lambda r: badnet.append("%s %s" % (r.status, r.url)) if r.status >= 400 else None)

            # impostor gate (project_browser-memory-collision.md): content-assert the served
            # build INSIDE the page — a sibling rig squatting the port must fail loudly.
            marker = 'y: TURRET_SIDES[i] === "floor" ? 0.82' if before \
                else 'y: TURRET_SIDES[i] === "floor" ? -0.82'
            page.goto(base + "/?level=" + LID + "&debug=1")
            try:
                page.wait_for_selector("canvas", timeout=8000)
            except Exception:
                pass
            has_marker = page.evaluate(
                "m => fetch('/src/genres/star-racer.js').then(r => r.text()).then(t => t.includes(m))",
                marker)
            results["build_marker"] = marker
            results["build_marker_ok"] = bool(has_marker)
            print("[build]", "PASS" if has_marker else "FAIL (IMPOSTOR?)", "marker=%s" % marker)
            if not has_marker:
                results["notes"].append("served star-racer.js lacks the expected build marker")
                ok = False

            if has_marker:
                st = wait_run(page)
                exp = EXPECTED_BEFORE if before else EXPECTED_AFTER
                static = []
                for i, side in enumerate(TURRET_SIDES):
                    got_y = st["turrets"][i]["y"]
                    static.append({"i": i, "kind": side, "y": got_y, "expected": exp[side],
                                   "ok": abs(got_y - exp[side]) < 1e-9})
                results["static_mount_y"] = static
                static_ok = all(s["ok"] for s in static)
                ok = ok and static_ok
                print("[static-mount-y]", "PASS" if static_ok else "FAIL",
                      [(s["kind"], s["y"]) for s in static])

                for ph in PHASES:
                    extra = ph.get("extra")
                    if extra:
                        extra = dict(extra, expect=extra["expect"][args.expect])
                    shot_path = os.path.join(HERE, "shot-%s-%s.png" % (args.expect, ph["name"]))
                    phase_ok, status = run_phase(page, shot_path, ph["name"], ph["subject"],
                                                 ph["pin_y"], ph["expect"][args.expect],
                                                 extra, results)
                    ok = ok and phase_ok
                    if status != "playing":
                        results["notes"].append("%s: run ended early (%s) — later phases skipped"
                                                % (ph["name"], status))
                        break
                    page.goto(base + "/?level=" + LID + "&debug=1")  # fresh load per phase
                    try:
                        page.wait_for_selector("canvas", timeout=8000)
                    except Exception:
                        pass

            console_clean = not [c for c in console if not any(t in c for t in BOOTH_FILTER)
                                 and c.startswith("error:")
                                 and not c.startswith("error:Failed to load resource")]
            net_clean = not [b for b in badnet if not any(t in b for t in BOOTH_FILTER)]
            boot = {"ok": console_clean and net_clean and not perr,
                    "console": [c for c in console if not any(t in c for t in BOOTH_FILTER)][-10:],
                    "perr": perr, "badnet": [b for b in badnet if not any(t in b for t in BOOTH_FILTER)][-10:]}
            results["boot"] = boot
            ok = ok and boot["ok"]
            print("[boot]", "PASS" if boot["ok"] else "FAIL")

            browser.close()
    finally:
        server.kill()

    results["ok"] = ok
    out_path = os.path.join(HERE, "results-%s.json" % args.expect)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("OVERALL", "PASS" if ok else "FAIL", "->", os.path.relpath(out_path, ROOT))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
