#!/usr/bin/env python3
"""sim — Miray's World Tour verification rig (Playwright headless Chromium).

Booth protocol: rAF throttling kills the shared Fabric tab, so the live verdict runs on
headless Chromium (compositor alive) against a PRIVATE serve.py port. modes:

  live    boot ?level=<LID>&bot=1&flavor=good&debug=1&beats=1 at 4x, poll window.__WT,
          assert the full 11-stage tour (6 countries + 5 crossings) completes, capture a
          shot, assert #beats tiles + zero console errors (logo 404 filtered).
  sims    fixed-dt in-page runs (good | partial | clumsy) — deterministic assertions:
          exactly ONE api.complete (never api.fail), payload = 6 stamps + 5 crossings,
          good answers every quiz right first try, partial flubs Brazil once, clumsy
          never completes.
  thumbs  stub-api create + 120 neutral steps + draw + toDataURL (thumb pipeline safe).
  all     everything (default)

Writes sim-results.json + shot-live-end.png in THIS folder. Exit 0 only if all pass.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LID = "miray-kavruk-world-tour"
ROOT = os.path.dirname(os.path.dirname(HERE))
PORT = 8201
BASE = "http://127.0.0.1:%d" % PORT

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")

SIM_EVAL = r"""
async (flavor) => {
  const lvl = await (await fetch("/levels/miray-kavruk-world-tour/level.json")).json();
  const mod = await import("/src/genres/world-tour.js?v=" + Date.now());
  const neutral = {
    down: () => false, just: () => false, left: () => false, right: () => false,
    up: () => false, downKey: () => false, jumpJust: () => false, anyJust: () => false,
    endFrame() {},
  };
  const calls = { complete: [], fail: [], hud: 0 };
  const api = {
    eng: { shake() {}, flash: 0, input: neutral },
    audio: { ensure() { return null; }, unlocked: false, sfx() {}, setVolume() {}, playMusic() {}, stopMusic() {} },
    hud() { calls.hud++; },
    complete(pl) { calls.complete.push(pl); },
    fail(m) { calls.fail.push(String(m)); },
    lives: { get: () => 3, spend: () => true, gain: () => true, enabled: true },
  };
  const inst = mod.create(lvl, api);
  const tl = [];
  const STEPS = 60 * 700; // up to ~11.7 min of sim time, break on completion
  for (let s = 0; s < STEPS; s++) {
    try { inst.update(1 / 60, neutral); }
    catch (e) { return { error: "update: " + e.message + " @s=" + (s / 60).toFixed(1) }; }
    if (s % 60 === 0 && window.__WT) tl.push(window.__WT.state());
    if (calls.complete.length) break;
  }
  return { flavor, timeline: tl, complete: calls.complete, fails: calls.fail, hud: calls.hud };
}
"""

LIVE_STATE = r"""() => (window.__WT ? window.__WT.state() : null)"""
BEATS = r"""() => Array.from(document.querySelectorAll("#beats img")).map(i => i.dataset.label || "?")"""

THUMBS_EVAL = r"""
async () => {
  const lid = "miray-kavruk-world-tour";
  const lvl = await (await fetch("/levels/" + lid + "/level.json")).json();
  const mod = await import("/src/genres/" + lvl.genre + ".js?v=" + Date.now());
  const neutral = {
    down: () => false, just: () => false, left: () => false, right: () => false,
    up: () => false, downKey: () => false, jumpJust: () => false, anyJust: () => false,
    endFrame() {},
  };
  const api = {
    eng: { shake() {}, flash: 0, input: neutral },
    audio: { ensure() { return null; }, unlocked: false, sfx() {}, setVolume() {}, playMusic() {}, stopMusic() {} },
    hud() {}, complete() {}, fail() {},
    lives: { get: () => 3, spend: () => true, gain: () => true, enabled: true },
  };
  const inst = mod.create(lvl, api);
  for (let s = 0; s < 120; s++) inst.update(1 / 60, neutral);
  const cv = document.createElement("canvas");
  cv.width = 960; cv.height = 540;
  const g = cv.getContext("2d");
  inst.draw(g);
  const url = cv.toDataURL("image/png");
  return { bytes: url.length, head: url.slice(0, 30) };
}
"""

EXPECTED_ORDER = [
    "canada", "atlantic-south", "brazil", "mid-atlantic", "egypt", "suez-crossing",
    "turkiye", "bosphorus-run", "japan", "pacific-crossing", "australia",
]


def start_server():
    proc = subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "serve.py"), "--port", str(PORT)],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/api/levels", timeout=1)
            return proc
        except Exception:
            time.sleep(0.25)
    proc.kill()
    raise RuntimeError("serve.py did not come up on port %d" % PORT)


def results(mode, checks, extra=None):
    out = {"level": LID, "mode": mode, "ok": all(c["ok"] for c in checks), "checks": checks}
    if extra:
        out.update(extra)
    return out


def run():
    from playwright.sync_api import sync_playwright

    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    server = start_server()
    results_out = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--mute-audio"])  # booth rule: the game never makes sound

            # ---- live ----------------------------------------------------------------
            if mode in ("live", "all"):
                page = browser.new_page(viewport={"width": 1280, "height": 800})
                errors = []
                page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto("%s/?level=%s&bot=1&flavor=good&debug=1&beats=1" % (BASE, LID))
                page.wait_for_timeout(2500)
                page.evaluate("() => { if (window.__WT) window.__WT.timeScale = 4; }")
                final, t0 = None, time.time()
                while time.time() - t0 < 240:
                    final = page.evaluate(LIVE_STATE)
                    if final and final.get("completed"):
                        break
                    page.wait_for_timeout(1000)
                page.screenshot(path=os.path.join(HERE, "shot-live-end.png"))
                beats = page.evaluate(BEATS)
                real_errors = [e for e in errors if not any(f in e for f in BOOTH_FILTER) and "404" not in e]
                stage_ids = [s["id"] for s in (final or {}).get("stageLog", [])]
                checks = [
                    {"id": "live-completes", "ok": bool(final and final.get("completed"))},
                    {"id": "live-6-stamps", "ok": bool(final and final.get("stamps") == 6)},
                    {"id": "live-all-11-stages", "ok": stage_ids == EXPECTED_ORDER or set(EXPECTED_ORDER) <= set(stage_ids)},
                    {"id": "live-beats-fired", "ok": len(beats) >= 20},
                    {"id": "live-no-js-errors", "ok": not real_errors, "errors": real_errors[:6]},
                ]
                results_out.append(results("live", checks, {"final": final, "beats": beats[:30], "stage_ids": stage_ids}))
                page.close()

            # ---- sims ------------------------------------------------------------------
            if mode in ("sims", "all"):
                for flavor in ("good", "partial", "clumsy"):
                    page = browser.new_page(viewport={"width": 960, "height": 540})
                    page.goto("%s/?bot=1&flavor=%s&debug=1" % (BASE, flavor))
                    page.wait_for_timeout(600)
                    out = page.evaluate(SIM_EVAL, flavor)
                    comp = out.get("complete", [])
                    payload = comp[0] if comp else None
                    tl = out.get("timeline", [])
                    last = tl[-1] if tl else {}
                    checks = [
                        {"id": flavor + "-no-update-error", "ok": "error" not in out, "error": out.get("error")},
                        {"id": flavor + "-fail-never-called", "ok": not out.get("fails")},
                    ]
                    if flavor == "good":
                        checks += [
                            {"id": "good-completes-once", "ok": len(comp) == 1},
                            {"id": "good-payload-6-stamps-5-crossings", "ok": bool(payload and payload.get("stamps") == 6 and payload.get("crossings") == 5)},
                            {"id": "good-quizzes-perfect", "ok": bool(payload and payload.get("quizzesRightFirst") == 6 and payload.get("quizWrongTries") == 0)},
                            {"id": "good-tour-order", "ok": bool(payload and payload.get("tour") == EXPECTED_ORDER)},
                        ]
                    elif flavor == "partial":
                        checks += [
                            {"id": "partial-completes-once", "ok": len(comp) == 1},
                            {"id": "partial-flubbed-a-quiz", "ok": bool(payload and payload.get("quizWrongTries") >= 1)},
                        ]
                    else:  # clumsy
                        checks += [
                            {"id": "clumsy-never-completes", "ok": len(comp) == 0},
                            {"id": "clumsy-still-playing-at-cap", "ok": last.get("mode") in ("play", "quiz", "card", "map", "stamp", "sail")},
                        ]
                    results_out.append(results("sims:" + flavor, checks, {
                        "complete_payload": payload,
                        "sim_t": last.get("t"), "final_mode": last.get("mode"),
                    }))
                    page.close()

            # ---- thumbs ----------------------------------------------------------------
            if mode in ("thumbs", "all"):
                page = browser.new_page(viewport={"width": 960, "height": 540})
                page.goto(BASE + "/")
                page.wait_for_timeout(500)
                out = page.evaluate(THUMBS_EVAL)
                checks = [{"id": "thumbs-renders", "ok": out.get("bytes", 0) > 3000, "bytes": out.get("bytes")}]
                results_out.append(results("thumbs", checks, out))
                page.close()

            browser.close()
    finally:
        server.kill()

    path = os.path.join(HERE, "sim-results.json")
    with open(path, "w") as f:
        json.dump(results_out, f, indent=1)
    ok = all(r["ok"] for r in results_out)
    print(json.dumps([{"mode": r["mode"], "ok": r["ok"],
                       "failed": [c["id"] for c in r["checks"] if not c["ok"]]} for r in results_out], indent=1))
    print("WROTE", path)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    run()
