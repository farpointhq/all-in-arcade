#!/usr/bin/env python3
"""probe39 — issue #39 star-racer energy-pickup paint/collection agreement (Playwright headless).

Booth protocol (same as probe38): verdicts run on headless Chromium (compositor alive) against a
PRIVATE serve.py port (8639 = 8600 + 39 % 200), muted at launch (--mute-audio).

What it proves, per the issue's wording — the pickup the player SEES is the pickup the game GRANTS.
Energy cells are painted ground-anchored (draw(): floor glow + light pillar + charged cell on the
trench floor plane, p1.y). The cell floats 0.26*p1.w above that floor plane; the painted wall face is
wallH = p1.w*0.62 tall and spans the full altitude range (playerY -0.95 floor .. +0.95 ceiling), so
the painted extent of a cell is altitude -0.95 (floor ellipse) .. PAINT_ALT = -0.95 + 1.9*0.26/0.62
= -0.153 (cell centre). grab3D grants a pickup only inside |item.y - playerY| < 0.5.

  static  every item's collection altitude must put its whole PAINTED extent (floor plane .. cell)
          inside its own grab window: |y - -0.95| < 0.5 AND |y - PAINT_ALT| < 0.5.
          before: 8/12 items fail (y=0.45 and y=0.00 cells are painted on the floor but granted only
          from the ceiling/mid band). after: 12/12 pass (single floor band, y=-0.55).
  P1  floor-pinned ship at item 1 (x=-0.2)         -> collected     (before: NOT collected)
  P2  ceiling-pinned ship at item 1 (x=-0.2)       -> NOT collected (before: collected — the defect:
                                                     a floor-painted cell granted from the ceiling)
  P3  floor-pinned ship at item 0 (x=+0.2)         -> collected     (positive control, both trees:
                                                     y=-0.55 items were already floor-band)
  P4  ceiling-pinned ship at item 0 (x=+0.2)       -> NOT collected (control: altitude gating intact)
  P5  ship pinned at PAINT_ALT (the altitude the cell is painted at) at item 1 -> collected
      (before: NOT collected — the painted pickup was not granted where it is painted)

Writes results-<expect>.json + shot-<expect>-<phase>.png next to this file. Exit 0 only on pass.

Usage:  python3 docs/playtest/evidence/issue-39/probe.py --expect before|after [--port 8639]
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))  # .../evidence/issue-39 -> repo root
LID = "simone-death-star-run"
SEG_LEN = 6  # world units per segment (src/genres/star-racer.js)

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")  # same gate as tools/playtest/playtest.py
STATE = "() => (window.__SR ? window.__SR.read() : null)"

# ---- paint geometry mirrored from src/genres/star-racer.js draw() ----
FLOOR_ALT = -0.95        # playerY convention: the trench floor plane the cells are anchored to
CEIL_ALT = 0.95
WALL_FRAC = 0.62         # wallH = p1.w * 0.62  spans FLOOR_ALT..CEIL_ALT
CELL_LIFT = 0.26         # blit(..., iy = p1.y - p1.w * 0.26) — the cell floats above the floor plane
PAINT_ALT = FLOOR_ALT + (CEIL_ALT - FLOOR_ALT) * CELL_LIFT / WALL_FRAC  # ≈ -0.153
GRAB = 0.5               # grab3D altitude window: |o.y - playerY| < 0.5

# level.json item order -> index i in items[] (altitude literal used to cycle [-0.55, 0.45, 0][i%3])
ITEM_ALT_BEFORE = [-0.55, 0.45, 0.0]
FLOOR_BAND = -0.55

# phase -> subject item index, pinned altitude, expected subject collection per tree
PHASES = [
    {"name": "P1-floor-pin-grabs-floor-painted-cell", "item": 1, "pin_y": -0.95,
     "expect": {"before": False, "after": True}},
    {"name": "P2-ceiling-pin-misses-floor-painted-cell", "item": 1, "pin_y": 0.95,
     "expect": {"before": True, "after": False}},
    {"name": "P3-floor-pin-grabs-floor-band-cell", "item": 0, "pin_y": -0.95,
     "expect": {"before": True, "after": True}},
    {"name": "P4-ceiling-pin-misses-floor-band-cell", "item": 0, "pin_y": 0.95,
     "expect": {"before": False, "after": False}},
    {"name": "P5-painted-altitude-pin-grabs", "item": 1, "pin_y": round(PAINT_ALT, 3),
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
    raise SystemExit("[probe39] server failed to start on %s" % base)


def wait_run(page):
    """The 2.2s in-game countdown eats input — wait until runT starts accumulating."""
    t0 = time.time()
    while time.time() - t0 < 10.0:
        s = page.evaluate(STATE)
        if s and s.get("runT", 0) > 0:
            return s
        time.sleep(0.05)
    raise SystemExit("[probe39] countdown never ended (no __SR.read().runT progress)")


def release_all(page):
    for k in ("ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyX"):
        page.keyboard.up(k)


def hold_toward(page, key_inc, key_dec, cur, target, deadband, held):
    """Hold the key that moves `cur` toward `target`; release inside the deadband."""
    want = None
    if target is not None and abs(cur - target) > deadband:
        want = key_inc if cur < target else key_dec
    for k in (key_inc, key_dec):
        should = k == want
        if held.get(k) != should:
            (page.keyboard.down if should else page.keyboard.up)(k)
            held[k] = should


def cyan_paint(png_path, h):
    """Evidence only (not asserted): where the lane's cyan cell paint sits vertically.

    The painted lane band is the only place a cell/glow can appear in the centre columns; recorded
    so the before/after PNGs can be compared for paint regression (this fix must not move the paint).
    """
    try:
        from PIL import Image
    except Exception:
        return None
    try:
        im = Image.open(png_path).convert("RGB")
    except Exception:
        return None
    w = im.width
    px = im.load()
    ys = []
    for y in range(0, h):
        for x in range(w // 2 - 60, w // 2 + 60):
            r, g, b = px[x, y]
            if r > 200 and g > 240 and b > 240:  # cell core #eaffff / #cfffff / bolt #ffffff
                ys.append(y)
    if not ys:
        return {"count": 0, "top": None, "bottom": None, "centroid": None}
    return {"count": len(ys), "top": min(ys), "bottom": max(ys),
            "centroid": round(sum(ys) / len(ys), 1)}


def run_phase(page, shot_path, ph, expect_got, results, view_h):
    """Fly one phase pinned to the subject item's lane and altitude, then read items[item].got.

    Lane: the item's own x (cells are lane-gated too). Altitude: pin_y (closed loop). Collection
    window: |it.z - position| spans -SEG_LEN*1.2 .. +SEG_LEN*3.2, so the fly-to target is item z + 8.
    """
    st = wait_run(page)
    idx = ph["item"]
    it = st["items"][idx]
    z_it, x_it = it["z"], it["x"]
    held, trace = {}, []
    shot_taken = False
    t0 = time.time()

    while True:
        st = page.evaluate(STATE)
        if st is None:
            raise SystemExit("[probe39] debug hook vanished mid-phase")
        hold_toward(page, "ArrowUp", "ArrowDown", st["playerY"], ph["pin_y"], 0.03, held)
        hold_toward(page, "ArrowRight", "ArrowLeft", st["playerX"], x_it, 0.05, held)
        pos = st["position"]
        if not shot_taken and pos > z_it - 45:
            page.screenshot(path=shot_path)  # item paint + ship altitude in frame
            shot_taken = True
        if not trace or pos - trace[-1]["position"] > 24:
            trace.append({"t": round(time.time() - t0, 2), "position": round(pos, 1),
                          "playerX": round(st["playerX"], 3), "playerY": round(st["playerY"], 3),
                          "subject_got": st["items"][idx]["got"], "hearts": st["hearts"],
                          "status": st["status"]})
        if pos >= z_it + 8 or st["status"] != "playing":
            break
    release_all(page)
    st = page.evaluate(STATE)
    release_all(page)

    subject_got = bool(st["items"][idx]["got"])
    # NB: only the subject item's grant is asserted — the neighbouring early cell sits 0.4 lanes
    # away against a 0.38 lane window, so it is deliberately NOT a hard control (the closed-loop
    # steer deadband can dip the ship into it). The lane gate itself is not what #39 is about.
    checks = {"subject_got": subject_got == expect_got,
              "status_playing": st["status"] == "playing"}
    ok = all(checks.values())
    out = {"phase": ph["name"], "item": idx, "item_z": round(z_it, 1), "item_x": x_it,
           "pin_y": ph["pin_y"], "item_y_end": st["items"][idx]["y"], "got": subject_got,
           "expected_got": expect_got, "checks": checks, "ok": ok,
           "hearts": st["hearts"], "status": st["status"], "trace": trace,
           "paint_pixels": cyan_paint(shot_path, view_h) if shot_taken else None}
    results["phases"][ph["name"]] = out
    print("[%s] %s got=%s expected=%s playerY_end=%s checks=%s"
          % (ph["name"], "PASS" if ok else "FAIL", subject_got, expect_got,
             round(st["playerY"], 3), checks))
    return ok, st["status"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--expect", choices=["before", "after"], required=True)
    ap.add_argument("--port", type=int, default=8639)
    args = ap.parse_args()
    before = args.expect == "before"
    view_w, view_h = 1000, 640

    results = {"probe": "issue-39 item paint/collection agreement", "expect": args.expect,
               "port": args.port, "tree": ROOT, "phases": {}, "notes": [],
               "paint_geometry": {"floor_alt": FLOOR_ALT, "wall_frac": WALL_FRAC,
                                  "cell_lift": CELL_LIFT, "painted_cell_alt": round(PAINT_ALT, 3),
                                  "grab_window": GRAB}}
    ok = True

    server, base = start_server(args.port)
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=["--mute-audio"])
            page = browser.new_page(viewport={"width": view_w, "height": view_h})
            console, perr, badnet = [], [], []
            page.on("console", lambda m: console.append("%s:%s" % (m.type, m.text)) if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: perr.append(str(e)))
            page.on("response", lambda r: badnet.append("%s %s" % (r.status, r.url)) if r.status >= 400 else None)

            # impostor gate (project_browser-memory-collision.md): content-assert the served build
            # INSIDE the page — a sibling rig squatting the port must fail loudly.
            marker = 'y: [-0.55, 0.45, 0][i % 3]' if before else 'x: it.x, y: -0.55, got: false'
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
                # static: is the PAINTED extent of every cell inside its own grab window?
                static = []
                for i, it in enumerate(st["items"]):
                    y = it["y"]
                    floor_ok = abs(y - FLOOR_ALT) < GRAB   # floor ellipse the player sees
                    cell_ok = abs(y - PAINT_ALT) < GRAB    # cell the player sees
                    static.append({"i": i, "z": round(it["z"], 1), "x": it["x"], "y": y,
                                   "floor_plane_in_window": floor_ok, "cell_in_window": cell_ok,
                                   "ok": floor_ok and cell_ok})
                results["static_item_altitudes"] = static
                results["static_expected_y"] = FLOOR_BAND if not before else ITEM_ALT_BEFORE
                n_bad = [s["i"] for s in static if not s["ok"]]
                # the invariant must hold on the FIXED tree and must be violated on the buggy tree
                invariant_ok = (not n_bad) if not before else bool(n_bad)
                band_ok = all(abs(s["y"] - FLOOR_BAND) < 1e-9 for s in static) if not before else \
                    [s["y"] for s in static] == [ITEM_ALT_BEFORE[i % 3] for i in range(len(static))]
                results["static_checks"] = {"paint_inside_grab_window": invariant_ok,
                                            "altitude_band_as_expected": band_ok,
                                            "items_out_of_window_before_fix": n_bad}
                ok = ok and invariant_ok and band_ok
                print("[static-item-alt]",
                      "PASS" if invariant_ok and band_ok else "FAIL",
                      "out-of-window items=%s ys=%s" % (n_bad, [s["y"] for s in static]))

                for ph in PHASES:
                    shot_path = os.path.join(HERE, "shot-%s-%s.png" % (args.expect, ph["name"]))
                    phase_ok, status = run_phase(page, shot_path, ph, ph["expect"][args.expect],
                                                 results, view_h)
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
