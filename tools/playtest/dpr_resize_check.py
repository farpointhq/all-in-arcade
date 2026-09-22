#!/usr/bin/env python3
"""dpr_resize_check — issue #13 acceptance rig (Playwright headless Chromium).

The engine in src/core.js createEngine() must re-scale the canvas backing
store whenever devicePixelRatio changes — not only when the CSS size changes.
A monitor handoff / zoom step at constant window size used to leave the
backing store at the old DPR scale, so the compositor stretched it (blurry).

Gates (exit 0 only when ALL pass):
  boot        backing store == round(clientWidth × min(2, dpr)) at dpr 1
  dprOnly     stub dpr 1→2 with NO window resize → backing store follows
              (THE bug — fails on unpatched main)
  capSym      dpr 3 → capped at 2× ; dpr 1.5 → round(cw×1.5) ; dpr 1 → back
              down (not a one-way latch)
  paused      Escape → #screen-pause active → stub dpr 1→2 still re-scales
              (the rAF loop runs regardless of eng.paused)
  cdpReal     REAL dpr switch via CDP Emulation.setDeviceMetricsOverride at
              constant CSS size — the actual monitor-handoff mechanism, not
              the stub
  regression  real viewport resize still re-scales; letterbox scale
              s = min(canvas.width/W, canvas.height/H) stays finite/positive
  hygiene     zero filtered console errors / pageerror / ≥400 responses

The stub uses Object.defineProperty on window (shadows the own accessor
reliably in Chromium — the original descriptor is saved and restored, since
`delete` would destroy the property for the life of the page); gate cdpReal
proves the real mechanism too. Verdict JSON lands in
docs/playtest/evidence/dpr-resize-verdict.json.

Usage: python3 tools/playtest/dpr_resize_check.py [--port 8613]
                                                 [--level ian-spence-rewind-loop]
                                                 [--out PATH]
"""
import argparse
import json
import math
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")
DEFAULT_OUT = os.path.join(ROOT, "docs", "playtest", "evidence", "dpr-resize-verdict.json")


def log(*a):
    print("[dpr-check]", *a, flush=True)


def js_round(x):
    """JS Math.round for positive values (Python round() is banker's)."""
    return math.floor(x + 0.5)


def eff_dpr(d):
    """Mirror the engine: Math.min(2, window.devicePixelRatio || 1)."""
    return min(2.0, d) if isinstance(d, (int, float)) and d > 0 else 1.0


def expected(css, d):
    return max(1, js_round(css * eff_dpr(d)))


def filtered(msgs):
    return [m for m in msgs if not any(t in m for t in BOOTH_FILTER)]


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
    raise SystemExit("[dpr-check] server failed to start on %s" % base)


# devicePixelRatio is an OWN property of window in Chromium (not on
# Window.prototype), so `delete` would destroy it for the life of the page.
# Save the original descriptor once and restore it to un-stub.
STUB_DPR = """
(d) => {
  if (!window.__origDprDesc)
    window.__origDprDesc = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio') || null;
  Object.defineProperty(window, 'devicePixelRatio', { value: d, configurable: true });
  return window.devicePixelRatio;
}
"""
UNSTUB_DPR = """
() => {
  if (window.__origDprDesc)
    Object.defineProperty(window, 'devicePixelRatio', window.__origDprDesc);
  else
    delete window.devicePixelRatio;
  return window.devicePixelRatio;
}
"""
PROBE = """
() => {
  const cv = document.getElementById('stage');
  return {
    cw: cv.clientWidth, ch: cv.clientHeight,
    bw: cv.width, bh: cv.height,
    dpr: window.devicePixelRatio,
    paused: !!document.querySelector('#screen-pause.active'),
  };
}
"""
LETTERBOX = """
async () => {
  const { W, H } = await import('/src/core.js');
  const cv = document.getElementById('stage');
  const s = Math.min(cv.width / W, cv.height / H);
  return { s, W, H, bw: cv.width, bh: cv.height };
}
"""


def poll_backing(page, want_w, want_h, timeout=2.0, step=0.012):
    """Poll PROBE until the backing store matches (want_w, want_h).

    The engine checks once per rAF frame, so a few frames suffice (~50 ms at
    60 fps); the poll budget is generous but the applied latency is recorded.
    Returns elapsed ms, or None on timeout."""
    t0 = time.time()
    end = t0 + timeout
    while True:
        p = page.evaluate(PROBE)
        if p["bw"] == want_w and p["bh"] == want_h:
            return int((time.time() - t0) * 1000)
        if time.time() > end:
            return None
        time.sleep(step)


def wait_paused(page, want=True, timeout=3.0, step=0.05):
    end = time.time() + timeout
    while time.time() < end:
        if bool(page.evaluate(PROBE)["paused"]) is want:
            return True
        time.sleep(step)
    return False


def _gates(page, ctx, g):
    """Gates 2–6. Gate 1 (boot) is checked by the caller as the precondition."""

    # ---- Gate 2: DPR-only change, NO resize (the bug) ----------------------
    page.evaluate(STUB_DPR, 2)
    p_before = page.evaluate(PROBE)
    ms = poll_backing(page, expected(p_before["cw"], 2), expected(p_before["ch"], 2))
    p_after = page.evaluate(PROBE)
    g["dprOnly"] = {
        "ok": ms is not None and p_after["cw"] == p_before["cw"] and p_after["ch"] == p_before["ch"],
        "cssUnchanged": [p_after["cw"], p_after["ch"]] == [p_before["cw"], p_before["ch"]],
        "backing": [p_after["bw"], p_after["bh"]],
        "expected": [expected(p_before["cw"], 2), expected(p_before["ch"], 2)],
        "appliedMs": ms,
    }
    log("gate dprOnly:", "PASS" if g["dprOnly"]["ok"] else "FAIL", g["dprOnly"])

    # ---- Gate 3: cap at 2, fractional 1.5, symmetric return to 1 -----------
    page.evaluate(STUB_DPR, 3)   # above the Math.min(2, …) cap
    p = page.evaluate(PROBE)
    cap_ok = poll_backing(page, expected(p["cw"], 3), expected(p["ch"], 3)) is not None
    cap_state = [page.evaluate(PROBE)["bw"], page.evaluate(PROBE)["bh"]]
    page.evaluate(STUB_DPR, 1.5)
    p = page.evaluate(PROBE)
    frac_ok = poll_backing(page, expected(p["cw"], 1.5), expected(p["ch"], 1.5)) is not None
    page.evaluate(STUB_DPR, 1)
    p = page.evaluate(PROBE)
    sym_ok = poll_backing(page, expected(p["cw"], 1), expected(p["ch"], 1)) is not None
    g["capSym"] = {"ok": cap_ok and frac_ok and sym_ok,
                   "cap2x": cap_ok, "capBacking": cap_state,
                   "capExpected": expected(p["cw"], 3),
                   "fractional1_5": frac_ok, "symmetricReturn": sym_ok}
    log("gate capSym:", "PASS" if g["capSym"]["ok"] else "FAIL", g["capSym"])

    # ---- Gate 4: resize still applies while the level is paused ------------
    page.keyboard.press("Escape")
    paused = wait_paused(page, True)
    p_before = page.evaluate(PROBE)
    page.evaluate(STUB_DPR, 2)
    ms = poll_backing(page, expected(p_before["cw"], 2), expected(p_before["ch"], 2)) if paused else None
    g["paused"] = {"ok": bool(paused and ms is not None), "pauseScreen": paused, "appliedMs": ms}
    page.keyboard.press("Escape")   # resume for the remaining gates
    wait_paused(page, False)
    page.evaluate(UNSTUB_DPR)       # restore the native accessor (dpr 1 context)
    log("gate paused:", "PASS" if g["paused"]["ok"] else "FAIL", g["paused"])

    # ---- Gate 5: REAL dpr switch via CDP at constant CSS size --------------
    cdp = ctx.new_cdp_session(page)
    cdp.send("Emulation.setDeviceMetricsOverride",
             {"width": 1000, "height": 640, "deviceScaleFactor": 2, "mobile": False})
    p_before = page.evaluate(PROBE)
    ms = poll_backing(page, expected(p_before["cw"], 2), expected(p_before["ch"], 2))
    p_after = page.evaluate(PROBE)
    g["cdpReal"] = {
        "ok": ms is not None and p_after["cw"] == p_before["cw"],
        "realDpr": p_after["dpr"], "cssUnchanged": p_after["cw"] == p_before["cw"],
        "backing": [p_after["bw"], p_after["bh"]], "appliedMs": ms,
    }
    cdp.send("Emulation.clearDeviceMetricsOverride")
    poll_backing(page, expected(p_after["cw"], 1), expected(p_after["ch"], 1))
    log("gate cdpReal:", "PASS" if g["cdpReal"]["ok"] else "FAIL", g["cdpReal"])

    # ---- Gate 6: regression guard (CSS resize path + letterbox) ------------
    page.set_viewport_size({"width": 1180, "height": 720})
    p = page.evaluate(PROBE)
    resized = poll_backing(page, expected(p["cw"], p["dpr"]), expected(p["ch"], p["dpr"]))
    lb = page.evaluate(LETTERBOX)
    g["regression"] = {
        "ok": bool(resized is not None and math.isfinite(lb["s"]) and lb["s"] > 0),
        "viewportResizeAppliedMs": resized,
        "letterboxS": round(lb["s"], 4),
        "letterboxFinitePositive": math.isfinite(lb["s"]) and lb["s"] > 0,
    }
    log("gate regression:", "PASS" if g["regression"]["ok"] else "FAIL", g["regression"])


def run(args):
    results = {"issue": 13, "port": args.port, "url": None, "gates": {}}
    console, perr, badnet = [], [], []

    def finish():
        """Fold hygiene gates in, write the verdict JSON, return the exit code."""
        results["console"] = filtered(console)[-30:]
        results["perr"] = filtered(perr)[-20:]
        results["badnet"] = filtered(badnet)[-20:]
        app_console = [c for c in results["console"]
                       if not c.startswith("error:Failed to load resource")]
        results["gates"]["hygiene"] = {
            "ok": not [c for c in app_console if c.startswith("error:")]
                  and not results["perr"] and not results["badnet"],
            "consoleClean": not [c for c in app_console if c.startswith("error:")],
            "noPageerror": not results["perr"],
            "netClean": not results["badnet"],
        }
        ok = bool(results["gates"]) and all(v.get("ok") for v in results["gates"].values())
        results["pass"] = ok
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
            f.write("\n")
        log("ISSUE #13 DPR RESIZE:", "PASS" if ok else "FAIL", "→", args.out)
        return 0 if ok else 1

    server = start_server(args.port)
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(
                viewport={"width": 1000, "height": 640},
                device_scale_factor=1,
            )
            page = ctx.new_page()
            page.on("console", lambda m: console.append("%s:%s" % (m.type, m.text))
                    if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: perr.append(str(e)))
            page.on("response", lambda r: badnet.append("%s %s" % (r.status, r.url))
                    if r.status >= 400 else None)

            url = "/?level=%s&debug=1" % args.level
            results["url"] = url
            page.goto("http://127.0.0.1:%d%s" % (args.port, url), timeout=15000)
            page.wait_for_selector("canvas", timeout=10000)
            time.sleep(1.0)   # settle: let boot frames apply the initial scale
            g = results["gates"]

            # ---- Gate 1: boot invariant at dpr 1 -----------------------------------
            p = page.evaluate(PROBE)
            w1, h1 = expected(p["cw"], 1), expected(p["ch"], 1)
            g["boot"] = {"ok": p["bw"] == w1 and p["bh"] == h1,
                         "backing": [p["bw"], p["bh"]], "expected": [w1, h1],
                         "css": [p["cw"], p["ch"]], "dpr": p["dpr"]}
            log("gate boot:", "PASS" if g["boot"]["ok"] else "FAIL", g["boot"])
            if not g["boot"]["ok"]:
                log("boot invariant broken — aborting remaining gates")
                return finish()

            try:
                _gates(page, ctx, g)
            except Exception as e:
                log("RIG ERROR:", repr(e))
                g.setdefault("rigError", {"ok": False, "error": repr(e)})

            ctx.close()
            browser.close()
    finally:
        server.kill()

    return finish()


def main():
    ap = argparse.ArgumentParser(description="Issue #13 DPR/resize backing-store acceptance rig")
    ap.add_argument("--port", type=int, default=8613)
    ap.add_argument("--level", default="ian-spence-rewind-loop")
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()
    sys.exit(run(args))


if __name__ == "__main__":
    main()
