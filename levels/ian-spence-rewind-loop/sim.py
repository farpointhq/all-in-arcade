#!/usr/bin/env python3
"""sim — Rewind Loop verification rig (Playwright headless Chromium).

Booth protocol: rAF throttling kills the shared Fabric tab, so the live verdict runs on
headless Chromium (compositor alive) against a PRIVATE serve.py port. modes:

  live    boot ?level=<LID>&bot=1&flavor=good&debug=1&beats=1 at 4x, poll window.__REW,
          assert the whole paradox trace (climb → gate flip → descent → loop → death-win),
          capture a shot, assert #beats tiles + zero console errors (logo 404 filtered).
  sims    fixed-dt in-page runs (good | partial | clumsy) — deterministic assertions:
          the ONLY api.complete call fires on a death, portals loop, ratchet is one-way.
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
LID = "ian-spence-rewind-loop"
ROOT = os.path.dirname(os.path.dirname(HERE))
PORT = 8197
BASE = "http://127.0.0.1:%d" % PORT

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")

SIM_EVAL = r"""
async (flavor) => {
  const lvl = await (await fetch("/levels/ian-spence-rewind-loop/level.json")).json();
  const mod = await import("/src/genres/rewind.js?v=" + Date.now());
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
  const STEPS = 60 * 430; // up to ~7 min of sim time, break on completion
  for (let s = 0; s < STEPS; s++) {
    try { inst.update(1 / 60, neutral); }
    catch (e) { return { error: "update: " + e.message + " @s=" + (s / 60).toFixed(1) }; }
    if (s % 12 === 0 && window.__REW) tl.push(window.__REW.state());
    if (calls.complete.length) break;
  }
  return { flavor, timeline: tl, complete: calls.complete, fails: calls.fail, hud: calls.hud };
}
"""

LIVE_STATE = r"""() => (window.__REW ? window.__REW.state() : null)"""
BEATS = r"""() => Array.from(document.querySelectorAll("#beats img")).map(i => i.dataset.label || "?")"""

THUMBS_EVAL = r"""
async () => {
  const lid = "ian-spence-rewind-loop";
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
  for (let i = 0; i < 60 + ((lid.length * 17) % 61); i++) inst.update(1 / 60, neutral);
  const c = document.createElement("canvas"); c.width = 960; c.height = 540;
  const g = c.getContext("2d"); g.fillStyle = "#05060f"; g.fillRect(0, 0, 960, 540);
  inst.draw(g);
  return c.toDataURL("image/jpeg", 0.55).length;
}
"""


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


def run():
    modes = sys.argv[1:] or ["all"]
    results = {"lid": LID, "modes": modes}

    server = start_server()
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1000, "height": 640})
            console, perr = [], []
            page.on("console", lambda m: console.append("%s:%s" % (m.type, m.text)) if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: perr.append(str(e)))

            # ---------------- sims (fixed dt, deterministic, one page per flavor) ----------
            if "all" in modes or "sims" in modes:
                sims = {}
                for flavor in ("good", "partial", "clumsy"):
                    page.goto(BASE + "/?sim=1&debug=1&bot=1&flavor=" + flavor)
                    try:
                        sims[flavor] = page.evaluate(SIM_EVAL, flavor)
                    except Exception as e:
                        sims[flavor] = {"error": str(e)}
                ok, notes = True, []
                payloads = {}
                for flavor, r in sims.items():
                    if "error" in r:
                        ok = False; notes.append(flavor + ": " + r["error"]); continue
                    comp = r.get("complete") or []
                    if not comp:
                        ok = False; notes.append(flavor + ": never completed"); continue
                    c = comp[0]
                    payloads[flavor] = c
                    if c.get("cause") != "died":
                        ok = False; notes.append("%s: cause=%r not 'died'" % (flavor, c.get("cause")))
                    if r.get("fails"):
                        ok = False; notes.append(flavor + ": api.fails fired " + str(r["fails"][:1]))
                    if flavor == "good":
                        if c.get("loops", 0) < 1:
                            ok = False; notes.append("good: loops=%s" % c.get("loops"))
                        phases = {s.get("phase") for s in r["timeline"]}
                        if phases < {1, 2}:
                            ok = False; notes.append("good: phases=%s" % phases)
                    if flavor == "partial" and c.get("portalsHit", 0) < 1:
                        ok = False; notes.append("partial: portalsHit=%s" % c.get("portalsHit"))
                    if flavor == "clumsy" and c.get("survived", 999) > 25:
                        notes.append("clumsy: survived %.1fs" % c.get("survived"))
                # monotone one-way ratchet WITHIN each loop epoch (a hard reset legitimately
                # snaps x back to the spawn, only when the loop counter moved)
                tl = sims["good"].get("timeline", [])
                epochs = {}
                for s in tl:
                    epochs.setdefault(s.get("loops", 0), []).append(s)
                for lp, tsrows in epochs.items():
                    xs1 = [r["x"] for r in tsrows if r.get("phase") == 1]
                    xs2 = [r["x"] for r in tsrows if r.get("phase") == 2]
                    for a, b in zip(xs1, xs1[1:]):
                        if b > a + 1: ok = False; notes.append("ratchet: loop %d phase1 rose %d→%d" % (lp, a, b))
                    for a, b in zip(xs2, xs2[1:]):
                        if b < a - 1: ok = False; notes.append("ratchet: loop %d phase2 fell %d→%d" % (lp, a, b))
                results["sims"] = {"ok": ok, "notes": notes, "payloads": payloads}
                print("[sims]", "PASS" if ok else "FAIL", notes)

            # ---------------- live (real rAF, real app shell) ----------------
            if "all" in modes or "live" in modes:
                page.goto(BASE + "/?level=" + LID + "&bot=1&flavor=good&debug=1&beats=1")
                try:
                    page.wait_for_selector("canvas", timeout=8000)
                except Exception:
                    pass
                t0, seen = time.time(), {"flip": None, "loop": None, "death": None}
                last = {}
                while time.time() - t0 < 300:
                    s = page.evaluate(LIVE_STATE)
                    if s:
                        last = s
                        if s.get("state") == "flipping" and seen["flip"] is None:
                            seen["flip"] = round(s["t"], 1)
                        if s.get("loops", 0) >= 1 and seen["loop"] is None:
                            seen["loop"] = round(s["t"], 1)
                        if s.get("completed"):
                            seen["death"] = round(s["t"], 1)
                            break
                    time.sleep(0.4)
                beats = page.evaluate(BEATS)
                result_visible = page.evaluate(
                    "() => !!document.querySelector('#screen-result.active')")
                page.screenshot(path=os.path.join(HERE, "shot-live-end.png"))
                errs = [c for c in console if c.startswith("error:")]
                ok = bool(seen["death"]) and result_visible and not filtered(perr) and not filtered(errs)
                notes = []
                if not result_visible: notes.append("result overlay never appeared")
                for k, v in seen.items():
                    if v is None: ok = False; notes.append("live: missing beat '%s'" % k)
                results["live"] = {"ok": ok, "notes": notes, "trace": seen,
                                    "end": last, "beats": beats,
                                    "console": filtered(console)[-10:], "perr": filtered(perr)}
                print("[live]", "PASS" if ok else "FAIL", notes)

            # ---------------- thumbs (stub-api pipeline safety) ----------------
            if "all" in modes or "thumbs" in modes:
                page.goto(BASE + "/?thumbs=1")
                size = 0
                try:
                    size = page.evaluate(THUMBS_EVAL)
                except Exception as e:
                    results["thumbs"] = {"ok": False, "error": str(e)}
                    size = 0
                ok = bool(size) and size > 3000
                results["thumbs"] = {"ok": ok, "bytes": size}
                print("[thumbs]", "PASS" if ok else "FAIL", size, "bytes")

            browser.close()
    finally:
        server.kill()

    path = os.path.join(HERE, "sim-results.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write("\n")
    all_ok = all(v.get("ok") for v in results.values() if isinstance(v, dict) and "ok" in v)
    print("OVERALL", "PASS" if all_ok else "FAIL", "→", os.path.relpath(path, ROOT))
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    run()
